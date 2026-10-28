# FDR Guardian AI — Machine Learning Model Training & Evaluation Report
**SIH 2026 Problem Statement**: SIH26265 — Streamline of Security Deposit / FDR Portal  
**Prototype**: Experimental Review Prioritization Model (`RandomForestClassifier`)  
**Date**: October 2026  

---

## 1. Executive Summary

This report documents the design, synthetic dataset generation, training procedure, evaluation metrics, and regulatory boundaries for an experimental machine-learning model developed for **FDR Guardian AI**.

The model is a **Random Forest Classifier** designed solely to provide an **advisory review-prioritization signal** for human regulatory officers. It aggregates optical, cryptographic, and forensic document signals into a probabilistic triage score to rank deposit cases by inspection urgency.

> **Honest Operational Disclosure**:
> - The model was trained and evaluated strictly on synthetic feature records.
> - The model does **NOT** adjudicate regulatory compliance, approve/reject fixed deposits, or claim legal proof of forgery.
> - Final deposit decisions remain governed by statutory human-in-the-loop committee procedures.

---

## 2. Feature Architecture

The model ingests 9 dimensional forensic features produced upstream by the FDR Guardian document pipeline:

| Feature Name | Dtype | Range | Source Pipeline | Forensic Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `ocr_confidence` | float | $[0.0, 1.0]$ | Tesseract.js (WASM) | Character recognition confidence; low values signal scan degradation or irregular fonts. |
| `qr_mismatch` | int | $\{0, 1\}$ | ZXing / jsQR | Cross-check between embedded QR payload and printed certificate text. |
| `amount_mismatch` | int | $\{0, 1\}$ | Triangulation Engine | Discrepancy between institutional claimed amount and OCR / bank-verified amount. |
| `metadata_suspicious_editor` | int | $\{0, 1\}$ | EXIFR | Flagged if software tags indicate Photoshop, Canva, GIMP, or online PDF editors. |
| `metadata_date_inconsistency` | int | $\{0, 1\}$ | EXIFR / PDF Header | Flagged if file modification precedes creation date or indicates future dates. |
| `ela_anomaly_score` | float | $[0.0, 1.0]$ | JPEG-JS / PNGJS | Error Level Analysis high-contrast pixel discrepancy ratio (compression anomalies). |
| `layout_anomaly_count` | int | $[0, 5]$ | Canvas Typography | Count of font size jumps, negative character collisions, or baseline shifts. |
| `missing_mandatory_fields` | int | $[0, 4]$ | Heuristic Parser | Count of missing required fields (e.g. IFSC, branch, deposit tenure, maturity date). |
| `seal_signature_count` | int | $[0, 3]$ | Visual Region Detector | Count of candidate seal and signature regions identified via anchor proximity. |

---

## 3. Synthetic Dataset Generation & Labeling Logic

### 3.1 Motivation
In compliance with regulatory standards and financial privacy (banking secrecy), zero real-world FDR instruments or institutional PII were ingested. A statistically controlled, reproducible synthetic dataset of **1,200 records** was generated using `numpy` and `pandas` (`random_state=42`).

### 3.2 Label Formulation
The ground truth target variable `manual_review_priority` ($\{0, 1\}$) represents whether an instrument requires expedited senior scrutiny:
- `0 = STANDARD_REVIEW`: Routine compliance workflow.
- `1 = ELEVATED_PRIORITY`: Expedited forensic review queue.

Ground truth labels were synthesized via a cumulative forensic risk function:
$$\text{Risk}_{\text{raw}} = 35(\text{amount\_mismatch}) + 30(\text{qr\_mismatch}) + 25(\text{suspicious\_editor}) + 20(\text{ela} > 0.35) + 15(\text{date\_inconsistency}) + 20(\text{low\_ocr} \land \text{missing} \ge 2) + 15(\text{layout} \ge 3) + 10(\text{seals} = 0)$$

A sigmoid mapping transforms $\text{Risk}_{\text{raw}}$ into a baseline probability $P(\text{elevated})$, followed by Bernoulli sampling with a **3% stochastic noise factor** to prevent trivial overfitting and simulate human reviewer ambiguity.

---

## 4. Model Training Procedure

- **Algorithm**: `RandomForestClassifier` (Scikit-Learn v1.5+)
- **Hyperparameters**:
  - `n_estimators`: 100
  - `max_depth`: 6 (constrained to prevent memorization)
  - `min_samples_split`: 5
  - `min_samples_leaf`: 2
  - `class_weight`: `"balanced"`
  - `random_state`: 42
- **Data Splitting**: Stratified 80/20 train/test split:
  - **Training Set**: 960 samples
  - **Testing Split**: 240 samples (strictly held out during fitting)

---

## 5. Evaluation Results

The model was evaluated against the unseen 240-sample test set:

| Evaluation Metric | Measured Score | Evaluation Notes |
| :--- | :--- | :--- |
| **Accuracy** | **81.25%** | Correct classification rate across standard and elevated cases |
| **Precision** | **73.86%** | Proportion of flagged elevated cases that genuinely required priority review |
| **Recall (Sensitivity)** | **74.71%** | Proportion of true elevated cases successfully intercepted by the model |
| **F1-Score** | **74.29%** | Harmonic mean of precision and recall |
| **ROC-AUC** | **0.8845** | Strong separability across varying decision thresholds |

### 5.1 Confusion Matrix (240 Test Samples)

| | Predicted Standard (0) | Predicted Elevated (1) |
| :--- | :---: | :---: |
| **Actual Standard (0)** | **130** (True Negative) | **23** (False Positive) |
| **Actual Elevated (1)** | **22** (False Negative) | **65** (True Positive) |

### 5.2 Top Feature Importances (Gini Impurity)

1. `qr_mismatch`: **0.2606** (Highest predictive power for document discrepancy)
2. `amount_mismatch`: **0.2516** (Critical financial variance indicator)
3. `ela_anomaly_score`: **0.2085** (Compression level tampering indicator)
4. `metadata_suspicious_editor`: **0.0858** (Presence of photo manipulation software)
5. `ocr_confidence`: **0.0791** (Scan legibility and optical uncertainty)

---

## 6. System Boundaries & Limitations

1. **Synthetic Feature Boundary**: All performance metrics reflect behavior on synthetic mathematical distributions. Performance on live banking scans will vary based on document degradation, paper folds, and stamp bleed-through.
2. **Advisory Triage Only**: The model is strictly prohibited from executing automated approvals, disbursements, or cancellations.
3. **Decoupled Architecture**: The model artifact (`fdr_review_prioritizer.joblib`) lives in an isolated `ml-prototype/` module, ensuring that the production Next.js 15 application and its deterministic risk engine remain uncompromised.
