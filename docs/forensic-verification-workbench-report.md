# PHASE 3.9 TECHNICAL ARCHITECTURE REPORT
## FDR Forensic Verification Workbench & Live Control Room Integration

**Project:** FDR Guardian AI  
**Problem Statement:** SIH26265 — Streamline of Security Deposit / FDR Portal  
**Document Revision:** 1.0 (Live Operations Console & Evidence Matrix)  
**Date:** October 2026  
**Status:** Implemented & Formally Verified (121/121 Unit Tests Passing)

---

### 1. Executive Summary & Objective

In high-stakes regulatory environments such as AICTE institutional security deposit administration, compliance scrutiny officers must reconcile multiple disparate data channels:
1. Institution self-declarations from registration petitions.
2. Machine-extracted text and bounding-box geometry from Tesseract OCR.
3. Payload schemas decoded from embedded 2D QR codes and barcodes.
4. Digital document forensic markers (EXIF metadata, software editors, camera fingerprints).
5. Error Level Analysis (ELA) recompression variance heatmaps.
6. Computer vision bank seal and signature candidate regions.
7. Independent core banking ledger confirmations via the Bank Verification Provider.

Phase 3.9 implements the **FDR Forensic Verification Workbench** (`/fdr?tab=workbench`), extending the existing `/fdr` Control Room in place without disrupting established workflows or replacing dashboard layouts.

---

### 2. Core Functional Modules

#### 2.1. Authorized Document Workspace
- **Vault Asset Inspection**: Lists all authenticated files (`FDR_RECEIPT`, `BANK_CONFIRMATION_LETTER`, `TRIPARTITE_AGREEMENT`) associated with the selected FDR.
- **Audit Lineage**: Displays sanitized file name, MIME type, file size in KB, upload timestamp, and SHA-256 binary checksum.
- **Authorized Download/Preview Endpoint**: Enforces access permissions via `/api/fdr/[fdrId]/documents/[documentId]/download`.
- **6-Analyzer State Telemetry**:
  - **OCR Engine**: `COMPLETED` with engine and confidence percentage (e.g. `Tesseract.js v7: 94%`) or `NOT RUN`.
  - **Metadata Forensics**: `COMPLETED` with detected tool/software or `NOT ANALYZED`.
  - **QR / Barcode**: `MATCH`, `MISMATCH`, `NO CODES`, or `NOT RUN`.
  - **ELA Recompression**: `COMPLETED (Q90)` with error metrics, `VECTOR SKIPPED` for born-digital PDFs, or `NOT PROFILED`.
  - **Visual Seals/Signs**: Candidate counts with explicit `HEURISTIC-ONLY` label (no fabricated trained weights) or `NOT DETECTED`.
  - **Bank Gateway**: `SANDBOX_SIMULATED`, `NOT_CONFIGURED`, or `PENDING INQUIRY`.
- **Invariant**: *Never displays a completed check when the analyzer has not run.* Unprocessed modules are explicitly designated `NOT_RUN` or `PENDING`.

#### 2.2. Multi-Source Evidence Cross-Validation Panel
Provides a columnar reconciliation matrix comparing six canonical financial fields:
1. `FDR Reference Number`
2. `Principal Deposit Amount`
3. `Issuing Bank Name`
4. `Branch IFSC Code`
5. `Statutory Maturity Date`
6. `Lien / Joint Holder Name`

Across five independent evidence channels:
- **Institution Submission**: Declared values from the master register.
- **OCR Extracted**: Values extracted from document imagery with confidence scoring.
- **QR Decoded Payload**: Values parsed from 2D barcode schemas.
- **Metadata Observations**: Document properties and creation metadata.
- **Independent Bank Value**: Values retrieved from core banking records (with `[SIMULATED]` marker).

**Status Indicators**:
- `✔ MATCH` (Emerald badge): All available sources align.
- `⚠ MISMATCH` (Rose badge): Discrepancy detected (e.g. OCR ₹35,000 vs Submitted ₹35,00,000).
- `⚪ PENDING` (Slate badge): Analysis pending or field absent in source.

#### 2.3. Forensic Findings & Reviewer Lifecycle Ledger
- **Filterable Workspace**: Filter findings by status (`ALL`, `OPEN`, `RESOLVED`) and severity (`CRITICAL`, `WARNING`, `INFORMATIONAL`).
- **Comprehensive Attribution**: Every finding presents rule key, source analysis pipeline, human-readable explanation, supporting evidence key-value pairs, document page, and recommended regulatory action.
- **Scrutiny Officer Resolution**:
  - Scrutiny officers can resolve or dismiss findings via `resolveRiskFindingServerAction`.
  - Permitted decisions: `BANK_CONFIRMED`, `ACCEPTED_RISK`, `FALSE_POSITIVE`, `REJECTED_INSTRUMENT`.
  - Mandatory justification (minimum 10 characters) immutably recorded in the regulatory audit ledger.

#### 2.4. Scrutiny Officer Interventions & Corrections
- **Candidate OCR Field Correction Modal**: Authorized reviewers can adjust OCR readings (e.g., misread font glyphs or numerals) with required audit justification (>5 characters) via `submitFieldCorrectionAction` and `/api/fdr/[fdrId]/documents/[documentId]/corrections`.
- **Request Additional Evidence Modal**: Scrutiny officers can dispatch formal deficiency notices to institution nodal desks (minimum 10 characters) via `requestAdditionalEvidenceAction`.
- **ELA Diagnostic Heatmap Modal**: Renders authorized JPEG recompression error heatmaps via `/api/fdr/[fdrId]/documents/[documentId]/ela/image` with anti-prejudgment disclaimers.

#### 2.5. Bank Verification Gateway Panel
- Clear status card displaying:
  - Mode: `SANDBOX_SIMULATED` (with explicit label *"Sandbox Simulation — Synthetic Fixture"*).
  - Outcome: `SANDBOX_MATCH`, `SANDBOX_MISMATCH`, `SANDBOX_NOT_FOUND`, `INCONCLUSIVE`, `UNAVAILABLE`, `NOT_CONFIGURED`.
  - Correlation ID tracking.
  - Statutory Non-Authentication Notice: Blue banner stating results are simulated demonstration fixtures and cannot authorize financial release.
  - **Invariant**: *Never displays a sandbox result using wording such as "Bank Verified."*

---

### 3. Navigation & Dashboard Integration

The Forensic Workbench is deeply integrated into the Control Room:
- **Sidebar & Top Navigation**: Accessible at `/fdr?tab=workbench` via `FDR_NAVIGATION_ITEMS` in `src/lib/navigation.ts`.
- **Deep Links from Existing Tabs**:
  - **FDR Master Register (`tab=register`)**: Each row includes a `Workbench 🔬` action button navigating directly to `/fdr?tab=workbench&fdrId=[id]`.
  - **Document Intelligence (`tab=documents`)**: Header includes `Launch Forensic Workbench 🔬`.
  - **Trust Guard (`tab=trust-guard`)**: Header includes `Forensic Workbench (Phase 3.9) 🔬`.
- **Instrument Switching**: Selecting an instrument updates the evidence matrix, vault document list, and findings ledger reactively.

---

### 4. Automated Testing & Verification Baseline

The test suite in `src/lib/fdr/__tests__/forensicWorkbench.test.ts` adds 9 dedicated test assertions across 3 suites, bringing the project total to **121 tests across 30 suites** (100% pass rate):

```
▶ FDR Forensic Workbench - Multi-Source Evidence Cross-Validation (4/4 passed)
▶ FDR Forensic Workbench - Reviewer Workflow & Auditable Actions (3/3 passed)
▶ FDR Forensic Workbench - Statutory Anti-Misrepresentation Invariants (2/2 passed)

ℹ tests 121
ℹ suites 30
ℹ pass 121
ℹ fail 0
```

#### Invariants Verified by Tests:
1. Unified forensic details (documents, findings, risk score, bank verifications) load correctly.
2. Amount comparison detects discrepancies between OCR and submitted values.
3. Unanalyzed documents evaluate all analyzer flags to false/null (`NOT_RUN`, `NOT_ANALYZED`, `NO_CODES_RUN`).
4. Field corrections persist candidate adjustments with reviewer audit credentials.
5. Evidence requests require minimum 10 characters and log to the audit trail.
6. Finding resolutions update `resolutionState` to `RESOLVED` with reviewer decision.
7. Sandbox results strictly display `SANDBOX_SIMULATED` and never become `EXTERNAL_VERIFIED` or claim live authentication.

---

### 5. Production Build & Type Checking Verification

- **TypeScript Type Check**: `npx tsc --noEmit` passed with 0 errors.
- **Production Build**: `next build` compiled all routes successfully (`✓ Generating static pages (7/7)`), with `/fdr` bundling cleanly at 52.6 kB (First Load JS: 159 kB).
