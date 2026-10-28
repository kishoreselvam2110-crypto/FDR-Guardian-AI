---
license: cc-by-nc-4.0
task_categories:
  - image-classification
  - image-segmentation
  - object-detection
pretty_name: Kriyam TamperFlow
size_categories:
  - 1K<n<10K
version: 1.0.0
tags:
  - document-forensics
  - tampering-detection
  - benchmark
  - indic-documents
---

# Kriyam TamperFlow

**The first document tampering detection benchmark built specifically for Indian documents**, with a built-in compression stress-test that exposes how quickly forensic models degrade on real-world scanned material.

---

## Dataset Summary

State-of-the-art document forgery detectors — CAT-Net, DTD, MVSS-Net, CAFTB, and others — rely on **JPEG compression artifacts** as their primary forensic signal: inconsistencies in DCT coefficients, block boundaries, and noise patterns left behind when an image is edited and re-saved. This works well on pristine photographic images.

Indian documents, invoices, medical records, and financial forms are routinely scanned, photocopied, emailed, and re-saved. Each JPEG pass **erases the very signal these models depend on**. A model achieving 90%+ AUC on CASIA2 or Columbia can collapse to near-random performance on a scanned Indian document.

**Kriyam TamperFlow v1.0** makes this failure mode measurable:

- **1,050 documents** (700 tampered, 350 authentic) drawn from Indian document types: ID cards, invoices, medical records, and financial forms
- **Pixel-aligned bounding-box annotations** covering five tampering techniques
- **Three compression tiers** (C0 pristine → C2 double-pass → C4 photocopy simulation) to quantify how model performance degrades as forensic signals are erased
- **3,150 image files** total — one triplet per source document

The benchmark evaluates models on two tasks: binary document classification (authentic vs. tampered) and tampered region localisation. Results are reported per compression tier, per tamper type, and with bootstrap confidence intervals so model comparisons are statistically grounded.

---

## Supported Tasks

### Task 1 — Document Tamper Classification

**Goal:** Given a document image, classify it as authentic or tampered.

| Label | Field in annotation | Description |
|-------|---------------------|-------------|
| `authentic` | `"is_authentic": true` | Unmodified source document |
| `tampered` | `"is_authentic": false` | One or more regions have been altered |

Evaluated with document-level **AUC-ROC** (using the model's continuous confidence score) and **F1** at the optimal decision threshold.

### Task 2 — Tampered Region Localisation

**Goal:** Given an image predicted as tampered, predict the bounding boxes of all altered regions.

Scoring:
1. Build an IoU matrix between ground-truth and predicted bounding boxes
2. Run Hungarian optimal assignment
3. Pairs with IoU ≥ 0.1 → True Positive; unmatched ground-truth boxes → False Negative; unmatched predictions → False Positive
4. Report **Region Precision**, **Region Recall**, and **Region F1**

Models that output heatmaps should convert to bounding boxes via connected-component labelling at a chosen threshold (record the threshold in your model card).

---

## Dataset Structure

### File naming

```
images/kriyam_{index:04d}_{tier}.png      # image files
annotations/kriyam_{index:04d}.json       # one annotation per source document
```

- `index`: zero-padded 4-digit integer (0001 – 1050)
- `tier`: `C0`, `C2`, or `C4`
- Authentic and tampered images are **mixed in the same folder**. The filename reveals nothing about authenticity — that information lives exclusively in the annotation.

### Compression tiers

| Tier | Code | Processing |
|------|------|------------|
| Pristine | `C0` | Lossless PNG. No re-compression. Full forensic signal intact. |
| Double-pass | `C2` | Two JPEG saves: Q=85 then Q=80. Simulates a typical scan-share-rescan cycle. |
| Photocopy-sim | `C4` | C2 → BMP round-trip → Gaussian blur (σ=0.5) → additive noise → JPEG Q=70. Nearly erases DCT-based forensic signals. |

### Folder layout

```
indic-docforgebench-dataset/
├── README.md
├── LICENSE
├── metadata.jsonl
├── images/              ← 3,150 PNG files  (1,050 × 3 tiers)
│   ├── kriyam_0001_C0.png
│   ├── kriyam_0001_C2.png
│   ├── kriyam_0001_C4.png
│   └── …
└── annotations/         ← 1,050 JSON files  (one per source document)
    ├── kriyam_0001.json
    └── …
```

---

## Annotation Format

One JSON file per source document, shared across all three compression tiers. Bounding boxes were annotated using **[LabelMe](https://github.com/labelmeai/labelme)** and are defined in the **C0 (pristine) coordinate space**, remaining valid for C2 and C4 images which have identical dimensions.

```json
{
  "id": "kriyam_0001",
  "image_w": 2066,
  "image_h": 2921,
  "is_authentic": false,
  "regions": [
    {
      "region_id": 1,
      "x": 80,
      "y": 862,
      "w": 1751,
      "h": 765,
      "tamper_types": ["splice"]
    }
  ]
}
```

### Field reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique document identifier, matches the filename stem |
| `image_w`, `image_h` | int | Image dimensions in pixels |
| `is_authentic` | bool | `true` → unmodified document; `regions` will be `[]` |
| `regions` | array | Tampered regions (empty for authentic documents) |
| `region_id` | int | 1-indexed identifier within this document |
| `x`, `y` | int | Top-left corner of bounding box (pixels) |
| `w`, `h` | int | Width and height of bounding box (pixels) |
| `tamper_types` | string[] | One or more of: `copy_move`, `splice`, `text_replace`, `inpaint` |

A single region can carry **multiple tamper types** simultaneously (e.g. a region that was copy-moved and then inpainted to conceal the boundary).

---

## Statistics

### Document split

| Category | Count |
|----------|-------|
| Tampered | 700 |
| Authentic | 350 |
| **Total** | **1,050** |

### Tamper type distribution

Counts are per document (a document with regions of different types is counted once per type).

| Tamper type | Documents |
|-------------|-----------|
| `inpaint` | 525 |
| `splice` | 204 |
| `text_replace` | 89 |
| `copy_move` | 65 |

> Note: totals exceed 700 because a single document can have multiple tamper types.

---

## Intended Uses

- **Benchmark evaluation**: Measure how document forgery detectors perform on Indian documents, across compression conditions. The companion evaluation script produces Region-F1, Doc-AUC, FPR, and the **Compression Robustness (CR) score** — `1 − (AUC_C0 − AUC_C4) / AUC_C0` — for each model.
- **Compression robustness research**: Study how JPEG re-compression degrades forensic signals, and develop detectors that are robust to it.
- **Indic document understanding**: The documents span multiple Indian document types and scripts, providing a realistic test bed for models aiming at real-world deployment in India.

**Not intended for**: Training production fraud-detection systems, any commercial use, or tasks involving real PII.

---

## Ethical Considerations

- **Modified documents**: The dataset contains manipulated images of Indian origin documents. These are provided strictly for **academic research into forgery detection** and must not be used to create, distribute, or study methods for committing document fraud.
- **No real PII**: All personally identifiable information visible in source documents has been removed or synthetically replaced. No real names, ID numbers, or biometric data are present.
- **CC BY-NC 4.0**: The NonCommercial restriction is intentional. Using this dataset to train or improve commercial fraud-detection products requires a separate agreement with the authors.
- **Responsible disclosure**: If you discover that a real identity document was inadvertently included, please contact the authors immediately.

---

## Licensing

| Component | License |
|-----------|---------|
| Dataset (images + annotations) | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) |
| Benchmark evaluation code | [Apache 2.0](https://github.com/avishekjana/Kriyam-TamperFlow/blob/main/LICENSE) |

The **CC BY-NC 4.0** license permits sharing and adaptation for non-commercial purposes with attribution. Academic research (including at corporate research labs where results are published) is considered non-commercial.

---

## Citation

If you use Kriyam TamperFlow in your research, please cite:

```bibtex
@misc{kriyamTamperFlow2026,
  title   = {Kriyam TamperFlow: A Document Tampering Detection
             Benchmark for Indic Documents},
  author  = {Jana, Avishek and others},
  year    = {2026},
  url     = {https://huggingface.co/datasets/kriyam-ai/kriyam-tamperflow}
}
```

**Paper:** [https://zenodo.org/records/21972485](https://zenodo.org/records/21972485)

**Repository DOI:** [https://doi.org/10.5281/zenodo.21469087](https://doi.org/10.5281/zenodo.21469087)
