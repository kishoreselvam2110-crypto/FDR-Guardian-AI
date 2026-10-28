# ML Environment Audit – FDR Guardian (SIH 26265)

## 1️⃣ Verified Project Root
- **Root directory:** `C:\Users\Kishore\OneDrive\Desktop\SIH 2026`
  (confirmed with `pwd`).

## 2️⃣ Exact Paths of Existing Models & Datasets
| Item | Path (relative to root) | Remarks |
|------|------------------------|---------|
| Kriyam TamperFlow **annotations** | `ml‑prototype/data/kriyam‑tamperflow/annotations/` – JSON files `kriyam_0001.json … kriyam_0101.json` (101 files) | Only annotation JSONs are present; raw image folders (`Au`, `Tp`, `Gt`) are **not** present. |
| Kriyam cache (HuggingFace) | `ml‑prototype/data/kriyam‑tamperflow/.cache/huggingface/trees/…` | Binary cache created by prior download – readable but not inspected further. |
| Model / joblib files | *None* – no `.joblib`, `.pkl`, `.pt` etc. in the repository. |
| CSV / additional data files | *None* – the only data files are the annotation JSONs above. |
| `ml‑prototype/` folder | Exists but is empty (no scripts, notebooks, or model artifacts). |

## 3️⃣ Available Python & ML Dependencies
| Dependency | Detected Version | Present? |
|------------|------------------|----------|
| Python interpreter | 3.12 (system‑wide) | ✅ |
| `scikit‑learn` | – | ❌ |
| `pandas` | – | ❌ |
| `joblib` | – | ❌ |
| `numpy` | – | ❌ |
| Other ML libs (torch, tensorflow, huggingface, etc.) | – | ❌ |
> No `requirements.txt` / `environment.yml` exists, and the repo contains no Python import statements for these libraries, confirming they are not installed.

## 4️⃣ Existing Working Forensic Capabilities (TypeScript side)
- **Metadata extraction** – `src/lib/fdr/metadataAnalyzer.ts`
- **Barcode / QR analysis** – `src/lib/fdr/barcodeAnalyzer.ts`
- **OCR extraction** – `src/lib/fdr/ocrEngine.ts` (uses `tesseract.js`)
- **ELA & layout anomaly detection** – `src/lib/fdr/elaAndLayoutAnalyzer.ts`
- **Seal & signature detection** – `src/lib/fdr/sealAndSignatureDetector.ts`
- **Bank verification provider** – stub in `src/lib/fdr/bankVerificationProvider.ts` (placeholder logic, no real API).
- **Rule‑based risk engine** – `src/lib/fdr/riskEngine.ts` (deterministic scoring, de‑duplication, regulatory disclaimer handling).
- **API routes** for the full document pipeline under `src/app/api/fdr/...`.
- **Unit / integration tests** – 202 tests across 55 suites all **PASS** (see test log).
- **Next.js production build** – `npm run build` succeeds, `.next/` folder generated.

## 5️⃣ Missing Functionality
| Area | Gap |
|------|-----|
| **Real AI/ML model** | No trained model files; risk engine is purely rule‑based. |
| **Python ML prototype** | `ml‑prototype/` is empty – no training script, no `requirements.txt`, no README. |
| **Kriyam raw images** | Only annotation JSONs are present; image data (`Au`, `Tp`, `Gt`) required for image‑based training is absent. |
| **Python dependencies** | Required ML packages (`scikit‑learn`, `pandas`, `numpy`, `joblib`) are not installed. |
| **Bank verification integration** | Provider stub without real banking API credentials. |
| **Documentation** | No `docs/ml‑environment‑audit.md` (being added now) and no higher‑level architecture doc for the ML side. |
| **Python test suite** | No tests for any Python code. |
| **Model‑performance metrics** | Not applicable – no model has been trained. |

## 6️⃣ Current Tests & Actual Results
- **TypeScript test suite** (`npm test`): 202 tests passed, 0 failures. Full output available in the system logs.
- **Build** (`npm run build`): succeeded, production assets under `.next/`.
- **Python side**: No tests exist; no Python code was executed.

## 7️⃣ Recommended Next Step
Create a **minimal reproducible Python prototype** inside `ml‑prototype/`:
1. Add a `requirements.txt` with at least:
   ```text
   scikit-learn
   pandas
   numpy
   joblib
   ```
2. Write a short `train.py` (or `train_random_forest.py`) that:
   - Loads the Kriyam annotation JSONs (verify each file is valid JSON).
   - Constructs a synthetic feature matrix using the forensic TS outputs (e.g., OCR confidence, barcode mismatch flags) **or** generates dummy numeric features.
   - Performs a train/test split, trains a `RandomForestClassifier`, evaluates accuracy/precision/recall/F1, and saves the model as `model.joblib`.
3. Add a `README.md` with clear installation (`python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt`) and execution commands (`python train.py`).
4. (Optional) Add a tiny unit test file (`test_train.py`) that checks the script runs without error.

Once this scaffold is in place, later phases can focus on **real model training**, **evaluation**, and **integration** of the prediction API back into the Next.js backend.

---
*Document created as part of Phase 0 audit.*