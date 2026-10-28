# FDR Guardian AI — Machine Learning Review Prioritization Prototype
**SIH 2026 Problem Statement**: SIH26265 — Streamline of Security Deposit / FDR Portal  
**Module Type**: Experimental Decision Support & Review Prioritization Model

---

## 📌 Executive Summary

This isolated prototype implements a genuine **Random Forest classifier** trained on synthetic document-forensic feature vectors. Its purpose is **triage prioritization** — scoring incoming Fixed Deposit Receipts (FDRs) to route them into either:
1. `STANDARD_REVIEW`: Routine institutional compliance queue.
2. `ELEVATED_PRIORITY`: Expedited forensic queue for senior scrutiny officers.

> **⚠️ Critical Regulatory Disclaimer**:  
> This model operates strictly as an advisory triage signal to assist regulatory human officers in workload routing. In accordance with statutory norms, **the model does NOT automatically approve or reject FDRs, nor does it establish legal or criminal forgery.**

---

## 🛠️ Feature Matrix

The model ingests 9 document-forensic and optical signals produced by the FDR Guardian pipeline:

| Feature Name | Type | Range / Unit | Forensic Significance |
| :--- | :--- | :--- | :--- |
| `ocr_confidence` | Float | $0.00 - 1.00$ | Optical scan legibility and font certainty from Tesseract.js |
| `qr_mismatch` | Binary | $\{0, 1\}$ | Flagged if decoded QR payload differs from printed instrument reference |
| `amount_mismatch` | Binary | $\{0, 1\}$ | Discrepancy between institutional claim and OCR/Bank amount |
| `metadata_suspicious_editor` | Binary | $\{0, 1\}$ | Detected software footprints from Photoshop, Canva, GIMP, etc. |
| `metadata_date_inconsistency`| Binary | $\{0, 1\}$ | Mismatch between creation timestamp, modification date, or future dates |
| `ela_anomaly_score` | Float | $0.00 - 1.00$ | High-contrast pixel discrepancy ratio from Error Level Analysis |
| `layout_anomaly_count` | Integer | $0 - 5$ | Count of font height jumps, baseline tilts, or character collisions |
| `missing_mandatory_fields` | Integer | $0 - 4$ | Count of unextracted critical fields (IFSC, branch, amount, date) |
| `seal_signature_count` | Integer | $0 - 3$ | Candidate visual seal/signature regions detected via anchor proximity |

---

## 📦 Prerequisites & Environment Setup

Python 3.10+ with `scikit-learn`, `pandas`, `numpy`, and `joblib`.

```bash
# Verify Python version
python --version

# Optional: Install required dependencies
pip install scikit-learn pandas numpy joblib
```

---

## 🚀 Execution Commands

All scripts run from the `ml-prototype/` directory:

### 1. Generate Synthetic Training Dataset
Generates 1,200 reproducible synthetic feature samples with realistic distributions and label noise:
```bash
python ml-prototype/generate_dataset.py
```
*Output*: `ml-prototype/synthetic_fdr_features.csv`

### 2. Train the Random Forest Classifier
Trains an 80/20 stratified Random Forest classifier, evaluates metrics, and exports artifacts:
```bash
python ml-prototype/train.py
```
*Outputs*:
- Model Artifact: `ml-prototype/fdr_review_prioritizer.joblib`
- Metrics Summary: `ml-prototype/evaluation_metrics.json`

### 3. Run Inference on Test Records
Loads the saved model artifact and predicts manual-review priority for sample test cases:
```bash
python ml-prototype/predict.py
```

---

## 📂 File Structure

```
ml-prototype/
├── generate_dataset.py           # Reproducible synthetic dataset generator
├── train.py                      # Scikit-learn Random Forest training pipeline
├── predict.py                    # Inference script & sample case evaluator
├── synthetic_fdr_features.csv    # Generated synthetic dataset (1,200 records)
├── fdr_review_prioritizer.joblib # Serialized model bundle & feature metadata
├── evaluation_metrics.json       # Exported test split metrics & confusion matrix
├── REPORT.md                     # Comprehensive technical & ethical ML report
└── README.md                     # Setup, usage guide, and feature documentation
```

---

## ⚖️ Ethical & Operational Safeguards

1. **Non-Prejudgment Policy**: High ELA or low OCR confidence flags an instrument for **senior officer review**, never an automated penalty.
2. **Zero Ingestion of Real PII**: The model is trained exclusively on synthetic numerical and binary feature representations; no actual student, trust, or bank personal data is processed or stored.
3. **Deterministic Isolation**: Kept completely decoupled from the production Next.js application, database schema, and committee sign-off workflows.
