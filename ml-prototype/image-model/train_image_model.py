import os
import json
import argparse
from pathlib import Path
from tqdm import tqdm
import pandas as pd
import numpy as np
from PIL import Image
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, precision_recall_fscore_support
import torch
import torch.nn as nn
import torch.optim as optim
import torchvision.transforms as transforms
import torchvision.models as models
from joblib import dump, load

def load_annotations(annotations_dir):
    records = []
    for anno_file in Path(annotations_dir).glob('*.json'):
        with open(anno_file, 'r') as f:
            data = json.load(f)
        # Expected keys: "doc_id", "variant" (C0/C2/C4), "label" (0/1 for manipulated)
        records.append({
            "doc_id": data.get('doc_id'),
            "variant": data.get('variant'),
            "label": int(data.get('label', 0)),
            "annotation_path": str(anno_file)
        })
    return pd.DataFrame(records)

def map_image_path(row, images_dir):
    # Assuming image file naming convention: {doc_id}_{variant}.png
    filename = f"{row['doc_id']}_{row['variant']}.png"
    return os.path.join(images_dir, filename)

def prepare_dataset(df, images_dir):
    df['image_path'] = df.apply(lambda r: map_image_path(r, images_dir), axis=1)
    # Filter out missing images
    df = df[df['image_path'].apply(os.path.exists)]
    return df

def split_document_level(df, train_ratio=0.7, val_ratio=0.15, test_ratio=0.15, seed=42):
    # Group by doc_id (all variants of same document stay together)
    doc_ids = df['doc_id'].unique()
    train_ids, temp_ids = train_test_split(doc_ids, test_size=1-train_ratio, random_state=seed)
    val_size = val_ratio / (val_ratio + test_ratio)
    val_ids, test_ids = train_test_split(temp_ids, test_size=1-val_size, random_state=seed)
    train_df = df[df['doc_id'].isin(train_ids)]
    val_df = df[df['doc_id'].isin(val_ids)]
    test_df = df[df['doc_id'].isin(test_ids)]
    return train_df, val_df, test_df

class ImageDataset(torch.utils.data.Dataset):
    def __init__(self, df, transform=None):
        self.df = df.reset_index(drop=True)
        self.transform = transform
    def __len__(self):
        return len(self.df)
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img = Image.open(row['image_path']).convert('RGB')
        if self.transform:
            img = self.transform(img)
        label = torch.tensor(row['label'], dtype=torch.long)
        return img, label

def get_dataloaders(train_df, val_df, test_df, batch_size=32):
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    train_set = ImageDataset(train_df, transform)
    val_set = ImageDataset(val_df, transform)
    test_set = ImageDataset(test_df, transform)
    return (
        torch.utils.data.DataLoader(train_set, batch_size=batch_size, shuffle=True, num_workers=2),
        torch.utils.data.DataLoader(val_set, batch_size=batch_size, shuffle=False, num_workers=2),
        torch.utils.data.DataLoader(test_set, batch_size=batch_size, shuffle=False, num_workers=2)
    )

def train_model(model, criterion, optimizer, dataloaders, device, epochs=10):
    train_loader, val_loader, _ = dataloaders
    best_val_auc = 0.0
    best_state = None
    for epoch in range(epochs):
        model.train()
        running_loss = 0.0
        for inputs, labels in tqdm(train_loader, desc=f"Epoch {epoch+1}/{epochs} [train]"):
            inputs, labels = inputs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * inputs.size(0)
        epoch_loss = running_loss / len(train_loader.dataset)
        # Validation
        model.eval()
        all_labels = []
        all_probs = []
        with torch.no_grad():
            for inputs, labels in tqdm(val_loader, desc=f"Epoch {epoch+1}/{epochs} [val]"):
                inputs = inputs.to(device)
                outputs = model(inputs)
                probs = torch.softmax(outputs, dim=1)[:,1].cpu().numpy()
                all_probs.extend(probs)
                all_labels.extend(labels.numpy())
        val_auc = roc_auc_score(all_labels, all_probs)
        print(f"Epoch {epoch+1}: Train loss {epoch_loss:.4f}, Val AUC {val_auc:.4f}")
        if val_auc > best_val_auc:
            best_val_auc = val_auc
            best_state = model.state_dict()
    # Load best
    if best_state:
        model.load_state_dict(best_state)
    return model, best_val_auc

def evaluate(model, dataloader, device):
    model.eval()
    all_labels = []
    all_preds = []
    all_probs = []
    with torch.no_grad():
        for inputs, labels in tqdm(dataloader, desc="Evaluating"):
            inputs = inputs.to(device)
            outputs = model(inputs)
            probs = torch.softmax(outputs, dim=1)[:,1].cpu().numpy()
            preds = torch.argmax(outputs, dim=1).cpu().numpy()
            all_labels.extend(labels.numpy())
            all_preds.extend(preds)
            all_probs.extend(probs)
    report = classification_report(all_labels, all_preds, output_dict=True)
    cm = confusion_matrix(all_labels, all_preds).tolist()
    auc = roc_auc_score(all_labels, all_probs)
    return {"classification_report": report, "confusion_matrix": cm, "roc_auc": auc}

def main(args):
    annotations_dir = os.path.join(args.dataset_root, 'annotations')
    images_dir = os.path.join(args.dataset_root, 'images')
    df = load_annotations(annotations_dir)
    df = prepare_dataset(df, images_dir)
    train_df, val_df, test_df = split_document_level(df)
    dataloaders = get_dataloaders(train_df, val_df, test_df, batch_size=args.batch_size)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    # Use pretrained ResNet18 as backbone
    backbone = models.resnet18(pretrained=True)
    num_ftrs = backbone.fc.in_features
    backbone.fc = nn.Linear(num_ftrs, 2)  # binary classification
    backbone = backbone.to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(backbone.parameters(), lr=args.lr)
    model, best_val_auc = train_model(backbone, criterion, optimizer, dataloaders, device, epochs=args.epochs)
    # Save model
    os.makedirs(args.output_dir, exist_ok=True)
    model_path = os.path.join(args.output_dir, 'model.pt')
    torch.save(model.state_dict(), model_path)
    # Evaluate on test set
    test_loader = dataloaders[2]
    eval_results = evaluate(model, test_loader, device)
    with open(os.path.join(args.output_dir, 'evaluation.json'), 'w') as f:
        json.dump(eval_results, f, indent=2)
    # Save manifest
    manifest = {
        "train_size": len(train_df),
        "val_size": len(val_df),
        "test_size": len(test_df),
        "dataset_root": args.dataset_root,
        "class_distribution": df['label'].value_counts().to_dict()
    }
    with open(os.path.join(args.output_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print('Training complete. Model saved to', model_path)
    print('Evaluation results written to', os.path.join(args.output_dir, 'evaluation.json'))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train image manipulation screening model')
    parser.add_argument('--dataset-root', type=str, required=True, help='Root directory containing images/ and annotations/')
    parser.add_argument('--output-dir', type=str, default='ml-prototype/image-model/output')
    parser.add_argument('--epochs', type=int, default=10)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--lr', type=float, default=1e-4)
    args = parser.parse_args()
    main(args)
