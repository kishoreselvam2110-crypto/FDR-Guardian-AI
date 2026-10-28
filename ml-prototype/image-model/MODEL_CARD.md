# Model Card: Kriyam TamperFlow Image Manipulation Screening Model

**Model Name**: `kriyam_resnet18_image_screening`

**Version**: 1.0.0 (trained on 2026-10-28)

**Model Type**: Supervised binary classifier (authentic vs manipulated) built on a fine‑tuned **ResNet‑18** backbone (PyTorch).

---

## Intended Use
- **Primary purpose**: Provide an experimental signal for manual review prioritisation of FDR document images within the FDR Guardian AI prototype.
- **Scope**: Academic / research evaluation only. **Not** for production deployment, automated decision‑making, or any commercial use.
- **Users**: Researchers and developers exploring document forgery detection.

---

## Dataset
- **Source**: Kriyam TamperFlow dataset (downloaded as part of the project repository).
- **License**: CC‑BY‑NC 4.0 – non‑commercial academic use only.
- **Contents**:
  - `images/` – PNG images of document variants (C0, C2, C4).
  - `annotations/` – JSON files with fields `doc_id`, `variant`, `label` (0 = authentic, 1 = manipulated).
- **Splits** (document‑level, reproducible with random seed 42):
  - Train: ~70 % of unique documents
  - Validation: ~15 % of unique documents
  - Test: ~15 % of unique documents
- **Stats** (example, actual numbers will be written to `manifest.json` after training):
  - Total images: *N*
  - Class distribution: *balanced/imbalanced* (see `manifest.json`).

---

## Training Procedure
- **Framework**: PyTorch 2.2.0 with `torchvision` 0.17.0.
- **Architecture**: Pre‑trained ResNet‑18 (ImageNet weights) with final fully‑connected layer replaced by a 2‑unit linear layer.
- **Loss**: Cross‑entropy.
- **Optimizer**: Adam (learning rate `1e-4`).
- **Epochs**: 10 (configurable via `--epochs`).
- **Batch size**: 32 (configurable via `--batch-size`).
- **Data Augmentation**: None beyond resizing to 224×224 and normalization.
- **Hardware**: CPU or GPU if available.

---

## Evaluation
Metrics are computed on the held‑out test split and saved to `evaluation.json`.
- **ROC‑AUC**: *value*
- **Accuracy**: *value*
- **Precision / Recall / F1‑score** per class.
- **Confusion matrix** (2×2).
- Per‑compression‑tier analysis (C0, C2, C4) can be derived from the test set annotations.

---

## Limitations
- Trained on a synthetic/academic dataset; performance on real‑world documents is unknown.
- No data augmentation or class‑imbalance handling; metrics may be optimistic if classes are imbalanced.
- Model size (~44 MB) may be large for edge deployment; consider lighter backbones for production.
- Only binary classification; does not provide localisation of manipulated regions.

---

## Ethical Considerations
- The model is intended solely as a **research aid**. It must not be used to make legal or financial decisions.
- Dataset license restricts commercial use; ensure compliance before any external distribution.
- Users should be aware of false positives/negatives and verify manually.

---

## Reproducibility
- Random seed fixed at `42` for splits and PyTorch deterministic behavior (where possible).
- All hyper‑parameters are exposed via command‑line arguments.
- Full training logs are printed to stdout and can be redirected to a file.

---

## Citation
If you use this model or the accompanying code in your research, please cite the original Kriyam TamperFlow dataset and this repository.
