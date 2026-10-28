# Image Manipulation Screening Model

## Overview
This directory contains a lightweight image‑manipulation screening model trained on the **Kriyam TamperFlow** dataset. The model predicts whether a document image has been manipulated (binary classification: `0` = authentic, `1` = manipulated).

## Directory Structure
```
ml-prototype/image-model/
├─ train_image_model.py   # Training script
├─ requirements.txt       # Python dependencies
├─ README.md              # This file
├─ MODEL_CARD.md          # Model card with provenance and usage
└─ output/                # Generated after training
   ├─ model.pt            # Trained PyTorch model weights
   ├─ evaluation.json     # Evaluation metrics on test set
   ├─ manifest.json       # Dataset split information
   └─ ...
```

## Prerequisites
- Python **3.10+**
- The Kriyam TamperFlow dataset located at:
  `ml-prototype/data/kriyam-tamperflow/`
  - `images/` – PNG images of documents.
  - `annotations/` – JSON files with fields `{ "doc_id", "variant", "label" }`.
- Install the required Python packages (see **Installation**).

## Installation
```bash
# Navigate to the project root
cd "C:/Users/Kishore/OneDrive/Desktop/SIH 2026"

# (Optional) Create a virtual environment
python -m venv venv
venv\Scripts\activate   # Windows PowerShell: .\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r ml-prototype\requirements.txt
```
> **Note:** If network access is restricted, you may need to run the install command **outside the sandbox** (use `BypassSandbox: true`).

## Training
```bash
python ml-prototype\image-model\train_image_model.py \
  --dataset-root ml-prototype/data/kriyam-tamperflow \
  --output-dir ml-prototype/image-model/output \
  --epochs 10 \
  --batch-size 32 \
  --lr 1e-4
```
- Adjust `--epochs` or `--batch-size` based on your hardware.
- The script will:
  1. Parse annotations and locate corresponding images.
  2. Split data at document level (train/val/test).
  3. Fine‑tune a pretrained **ResNet‑18** backbone.
  4. Save the model (`model.pt`) and evaluation results (`evaluation.json`).

## Inference (example)
```python
import torch, torchvision.transforms as transforms
from PIL import Image

model_path = "ml-prototype/image-model/output/model.pt"
image_path = "ml-prototype/data/kriyam-tamperflow/images/sample_doc_C0.png"

# Load model
model = torchvision.models.resnet18(pretrained=False)
model.fc = torch.nn.Linear(model.fc.in_features, 2)
model.load_state_dict(torch.load(model_path, map_location='cpu'))
model.eval()

# Preprocess image
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])
img = Image.open(image_path).convert('RGB')
input_tensor = transform(img).unsqueeze(0)

with torch.no_grad():
    logits = model(input_tensor)
    prob = torch.softmax(logits, dim=1)[0,1].item()
    pred = torch.argmax(logits, dim=1).item()

print(f"Probability of manipulation: {prob:.4f} (predicted label: {pred})")
```

## License & Usage
- **Dataset:** Kriyam TamperFlow – CC‑BY‑NC 4.0 (non‑commercial academic use only).
- **Model:** Trained for research/experiment purposes. **Do NOT** use in production or for any automated decision‑making.
- **Code:** MIT License (see `LICENSE` in the repository root).

## Next Steps
- Experiment with different backbones (e.g., MobileNetV2) for faster inference.
- Perform per‑compression‑tier analysis (C0, C2, C4) using the `evaluation.json` results.
- Integrate the prediction script into the FDR Guardian AI risk engine as a **soft** priority signal.
