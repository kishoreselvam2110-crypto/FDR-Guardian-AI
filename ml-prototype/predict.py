"""
FDR Guardian AI - Inference and Prioritization Predictor
SIH26265 - Streamline of Security Deposit / FDR Portal

Objective:
Loads the saved Random Forest model artifact and evaluates an FDR feature vector
to provide an experimental manual-review triage prioritization signal.
"""

import os
import sys
import json
import joblib
import pandas as pd
import numpy as np

def load_predictor(model_path: str = None):
    if model_path is None:
        model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fdr_review_prioritizer.joblib")
    
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found at {model_path}. Run train.py first.")
    
    bundle = joblib.load(model_path)
    return bundle["model"], bundle["feature_columns"], bundle["model_version"]

def predict_single(record: dict, model=None, feature_cols=None) -> dict:
    if model is None or feature_cols is None:
        model, feature_cols, _ = load_predictor()
    
    # Ensure all expected features are present
    row = {col: record.get(col, 0.0) for col in feature_cols}
    df_row = pd.DataFrame([row])
    
    pred_class = int(model.predict(df_row)[0])
    probabilities = model.predict_proba(df_row)[0]
    elevated_prob = float(probabilities[1]) if len(probabilities) > 1 else float(pred_class)
    
    # Class mapping
    priority_level = "ELEVATED_PRIORITY" if pred_class == 1 else "STANDARD_REVIEW"
    recommended_queue = (
        "Senior Scrutiny Officer (Expedited Forensics Queue)"
        if pred_class == 1
        else "Routine Institutional Compliance Queue"
    )
    
    # Identify top alert triggers present in this record
    triggers = []
    if record.get("amount_mismatch", 0) == 1:
        triggers.append("Claimed Amount differs from OCR/Verified Amount")
    if record.get("qr_mismatch", 0) == 1:
        triggers.append("QR Payload Reference does not match printed instrument number")
    if record.get("metadata_suspicious_editor", 0) == 1:
        triggers.append("Image editing software footprint detected (e.g. Photoshop/Canva)")
    if record.get("ela_anomaly_score", 0.0) > 0.35:
        triggers.append(f"Elevated ELA discrepancy score ({record.get('ela_anomaly_score'):.2f})")
    if record.get("ocr_confidence", 1.0) < 0.65:
        triggers.append(f"Low OCR scan confidence ({record.get('ocr_confidence'):.2f})")
    if record.get("missing_mandatory_fields", 0) >= 2:
        triggers.append(f"Multiple mandatory fields missing ({record.get('missing_mandatory_fields')})")
    
    return {
        "priority_level": priority_level,
        "elevated_review_probability": round(elevated_prob, 4),
        "recommended_queue": recommended_queue,
        "flagged_indicators": triggers if triggers else ["Clean scan; no major forensic anomalies"],
        "disclaimer": "EXPERIMENTAL AI TRIAGE: This signal prioritizes manual officer workload. It does NOT approve or reject instruments, nor does it establish legal fraud."
    }

def run_sample_demonstrations():
    print("=" * 70)
    print("FDR GUARDIAN AI — REVIEW PRIORITIZATION INFERENCE DEMO")
    print("=" * 70)
    
    model, feature_cols, version = load_predictor()
    print(f"Loaded Model Version: {version}")
    print(f"Features: {feature_cols}\n")
    
    samples = [
        {
            "name": "Case A: Clean Institutional Deposit (ICICI Bank)",
            "data": {
                "ocr_confidence": 0.94,
                "qr_mismatch": 0,
                "amount_mismatch": 0,
                "metadata_suspicious_editor": 0,
                "metadata_date_inconsistency": 0,
                "ela_anomaly_score": 0.08,
                "layout_anomaly_count": 0,
                "missing_mandatory_fields": 0,
                "seal_signature_count": 2,
            }
        },
        {
            "name": "Case B: High Discrepancy Deposit (Vidya Jyothi / ELA + QR Flag)",
            "data": {
                "ocr_confidence": 0.72,
                "qr_mismatch": 1,
                "amount_mismatch": 0,
                "metadata_suspicious_editor": 1,
                "metadata_date_inconsistency": 0,
                "ela_anomaly_score": 0.68,
                "layout_anomaly_count": 2,
                "missing_mandatory_fields": 1,
                "seal_signature_count": 1,
            }
        },
        {
            "name": "Case C: Direct Amount Mismatch (Delhi Technical Campus)",
            "data": {
                "ocr_confidence": 0.88,
                "qr_mismatch": 0,
                "amount_mismatch": 1,
                "metadata_suspicious_editor": 0,
                "metadata_date_inconsistency": 1,
                "ela_anomaly_score": 0.15,
                "layout_anomaly_count": 1,
                "missing_mandatory_fields": 0,
                "seal_signature_count": 2,
            }
        }
    ]
    
    for sample in samples:
        print(f"--- Evaluating: {sample['name']} ---")
        result = predict_single(sample["data"], model, feature_cols)
        print(f"  Decision Signal:       {result['priority_level']}")
        print(f"  Elevated Priority Prob: {result['elevated_review_probability'] * 100:.1f}%")
        print(f"  Triage Queue:          {result['recommended_queue']}")
        print(f"  Flagged Indicators:    {', '.join(result['flagged_indicators'])}")
        print()
    
    print("=" * 70)
    print("All demo inferences completed successfully.\n")

if __name__ == "__main__":
    run_sample_demonstrations()
