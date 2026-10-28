"""
FDR Guardian AI - Synthetic Dataset Generator for Review Prioritization
SIH26265 - Streamline of Security Deposit / FDR Portal

Objective:
Generates a reproducible, clearly labelled synthetic dataset of FDR document forensic features.
This dataset is explicitly labelled as SYNTHETIC for demonstration and experimental prioritization only.
"""

import numpy as np
import pandas as pd
import os

SEED = 42
NUM_SAMPLES = 1200

def generate_synthetic_dataset(n_samples: int = NUM_SAMPLES, random_state: int = SEED) -> pd.DataFrame:
    rng = np.random.RandomState(random_state)
    
    # 1. Forensic Feature Distributions
    # OCR Mean Confidence: typically 0.50 to 0.98, skewed towards high for clean scans
    ocr_confidence = np.clip(rng.beta(a=7, b=2, size=n_samples), 0.30, 0.99)
    
    # QR Mismatch: 0 = valid match, 1 = payload mismatch (approx 15% prevalence)
    qr_mismatch = rng.choice([0, 1], size=n_samples, p=[0.85, 0.15])
    
    # Amount Mismatch: 0 = matches claim, 1 = mismatch (approx 12% prevalence)
    amount_mismatch = rng.choice([0, 1], size=n_samples, p=[0.88, 0.12])
    
    # Metadata Indicators:
    # Suspicious editing software (Photoshop, Canva, etc.): approx 10% prevalence
    metadata_suspicious_editor = rng.choice([0, 1], size=n_samples, p=[0.90, 0.10])
    
    # Metadata Date Inconsistency (e.g. modified date earlier than created): approx 8% prevalence
    metadata_date_inconsistency = rng.choice([0, 1], size=n_samples, p=[0.92, 0.08])
    
    # ELA (Error Level Analysis) Anomaly Score: 0.0 to 1.0 (mean ~0.15, tail up to 0.85)
    # Tampered documents typically show ELA anomaly score > 0.35
    base_ela = rng.exponential(scale=0.12, size=n_samples)
    # Elevate ELA if suspicious editor detected
    ela_anomaly_score = np.clip(base_ela + metadata_suspicious_editor * rng.uniform(0.20, 0.45, size=n_samples), 0.0, 0.95)
    
    # Layout Anomalies (font jumps, negative spacing, baseline variance): count 0 to 5
    layout_anomaly_count = rng.poisson(lam=0.8, size=n_samples)
    layout_anomaly_count = np.clip(layout_anomaly_count, 0, 5)
    
    # Missing Mandatory Fields (e.g. missing IFSC, branch, dates): count 0 to 4
    # Correlated inversely with OCR confidence
    missing_prob = np.clip(1.0 - ocr_confidence, 0.05, 0.8)
    missing_fields = np.array([rng.binomial(n=4, p=p) for p in missing_prob])
    
    # Seal/Signature Candidates Detected: count 0 to 3
    seal_signature_count = rng.choice([0, 1, 2, 3], size=n_samples, p=[0.10, 0.25, 0.55, 0.10])
    
    # 2. Ground Truth Label Generation (Transparent Formulation)
    # A document requires elevated manual review (priority = 1) if:
    # - Direct financial mismatch (amount mismatch == 1)
    # - Cryptographic / barcode mismatch (qr_mismatch == 1)
    # - High forensic tampering score (ela_anomaly_score >= 0.38)
    # - Manipulative editing signature present (metadata_suspicious_editor == 1)
    # - Low legibility combined with missing data (ocr_confidence < 0.65 and missing_fields >= 2)
    # - Multiple layout irregularities (layout_anomaly_count >= 3 and seal_signature_count == 0)
    
    risk_score_raw = (
        amount_mismatch * 35 +
        qr_mismatch * 30 +
        metadata_suspicious_editor * 25 +
        (ela_anomaly_score > 0.35).astype(int) * 20 +
        metadata_date_inconsistency * 15 +
        (ocr_confidence < 0.65).astype(int) * (missing_fields >= 2).astype(int) * 20 +
        (layout_anomaly_count >= 3).astype(int) * 15 +
        (seal_signature_count == 0).astype(int) * 10
    )
    
    # Base probability of elevated review via sigmoid transform
    prob_elevated = 1.0 / (1.0 + np.exp(-(risk_score_raw - 25.0) / 8.0))
    
    # Sample binary priority with controlled stochastic variation (noise)
    elevated_priority = (rng.uniform(0, 1, size=n_samples) < prob_elevated).astype(int)
    
    # Add small 3% random label noise to simulate human review disagreement / edge cases
    noise_mask = rng.uniform(0, 1, size=n_samples) < 0.03
    elevated_priority[noise_mask] = 1 - elevated_priority[noise_mask]
    
    df = pd.DataFrame({
        "ocr_confidence": np.round(ocr_confidence, 4),
        "qr_mismatch": qr_mismatch,
        "amount_mismatch": amount_mismatch,
        "metadata_suspicious_editor": metadata_suspicious_editor,
        "metadata_date_inconsistency": metadata_date_inconsistency,
        "ela_anomaly_score": np.round(ela_anomaly_score, 4),
        "layout_anomaly_count": layout_anomaly_count,
        "missing_mandatory_fields": missing_fields,
        "seal_signature_count": seal_signature_count,
        "manual_review_priority": elevated_priority  # Target: 0 = Standard Review, 1 = Elevated Priority
    })
    
    return df

if __name__ == "__main__":
    output_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(output_dir, "synthetic_fdr_features.csv")
    
    df = generate_synthetic_dataset(NUM_SAMPLES, SEED)
    df.to_csv(output_path, index=False)
    
    print(f"Generated synthetic dataset with {len(df)} records at: {output_path}")
    print(f"Class distribution:\n{df['manual_review_priority'].value_counts(normalize=True)}")
