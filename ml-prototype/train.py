"""
FDR Guardian AI - Random Forest Review Prioritization Model Trainer
SIH26265 - Streamline of Security Deposit / FDR Portal

Objective:
Trains a genuine Random Forest classifier to prioritize FDR documents for manual officer scrutiny.
Explicit Disclosure:
This model is trained on synthetic feature data and provides a prioritization triage ranking.
It does NOT approve/reject instruments or prove criminal document forgery.
"""

import os
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report,
)
from generate_dataset import generate_synthetic_dataset

def train_model():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(current_dir, "synthetic_fdr_features.csv")
    
    if not os.path.exists(csv_path):
        print("Dataset not found. Generating synthetic dataset...")
        df = generate_synthetic_dataset(n_samples=1200, random_state=42)
        df.to_csv(csv_path, index=False)
    else:
        df = pd.read_csv(csv_path)
    
    feature_columns = [
        "ocr_confidence",
        "qr_mismatch",
        "amount_mismatch",
        "metadata_suspicious_editor",
        "metadata_date_inconsistency",
        "ela_anomaly_score",
        "layout_anomaly_count",
        "missing_mandatory_fields",
        "seal_signature_count",
    ]
    
    target_column = "manual_review_priority"
    
    X = df[feature_columns]
    y = df[target_column]
    
    # 80/20 train/test split with stratification and fixed random state
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    
    print(f"Training set size: {len(X_train)} samples")
    print(f"Testing set size:  {len(X_test)} samples")
    
    # Random Forest Classifier
    rf = RandomForestClassifier(
        n_estimators=100,
        max_depth=6,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        class_weight="balanced"
    )
    
    rf.fit(X_train, y_train)
    
    # Predictions and Probabilities
    y_pred = rf.predict(X_test)
    y_prob = rf.predict_proba(X_test)[:, 1]
    
    # Metrics
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    auc = roc_auc_score(y_test, y_prob)
    cm = confusion_matrix(y_test, y_pred).tolist()
    
    feature_importances = dict(
        zip(feature_columns, [round(float(v), 4) for v in rf.feature_importances_])
    )
    # Sort feature importances descending
    sorted_importances = dict(
        sorted(feature_importances.items(), key=lambda item: item[1], reverse=True)
    )
    
    metrics = {
        "dataset_type": "SYNTHETIC_DATASET_ONLY",
        "total_samples": len(df),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "accuracy": round(float(acc), 4),
        "precision": round(float(prec), 4),
        "recall": round(float(rec), 4),
        "f1_score": round(float(f1), 4),
        "roc_auc": round(float(auc), 4),
        "confusion_matrix": {
            "true_negative": cm[0][0],
            "false_positive": cm[0][1],
            "false_negative": cm[1][0],
            "true_positive": cm[1][1],
        },
        "feature_importances": sorted_importances,
        "disclaimer": "These metrics apply strictly to the synthetic evaluation split and reflect triage classification, not automated regulatory adjudication."
    }
    
    # Save model artifact and metadata bundle
    model_bundle = {
        "model": rf,
        "feature_columns": feature_columns,
        "model_version": "1.0.0-experimental",
        "algorithm": "RandomForestClassifier(n_estimators=100, max_depth=6)",
    }
    
    model_path = os.path.join(current_dir, "fdr_review_prioritizer.joblib")
    joblib.dump(model_bundle, model_path)
    print(f"\n[SUCCESS] Model artifact saved to: {model_path}")
    
    # Save evaluation metrics json
    metrics_path = os.path.join(current_dir, "evaluation_metrics.json")
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"[SUCCESS] Metrics saved to: {metrics_path}")
    
    # Print formatted output
    print("\n" + "=" * 60)
    print("FDR REVIEW PRIORITIZATION — EVALUATION RESULTS (SYNTHETIC)")
    print("=" * 60)
    print(f"Accuracy:  {acc * 100:.2f}%")
    print(f"Precision: {prec * 100:.2f}%")
    print(f"Recall:    {rec * 100:.2f}%")
    print(f"F1-Score:  {f1 * 100:.2f}%")
    print(f"ROC-AUC:   {auc:.4f}")
    print("\nConfusion Matrix:")
    print(f"  TN: {cm[0][0]:<4} | FP: {cm[0][1]:<4}")
    print(f"  FN: {cm[1][0]:<4} | TP: {cm[1][1]:<4}")
    print("\nTop Feature Importances:")
    for feat, imp in list(sorted_importances.items())[:5]:
        print(f"  • {feat:<30}: {imp:.4f}")
    print("=" * 60)
    print("DISCLAIMER: Measurements apply strictly to synthetic benchmark data.\n")

if __name__ == "__main__":
    train_model()
