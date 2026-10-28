# FDR GUARDIAN AI — PHASE 3.7 TECHNICAL REPORT
## Unified Document Findings and Explainable Risk Engine
**SIH 2026 — Problem Statement SIH26265: Streamline of Security Deposit / FDR Portal**
*System Implementation & Verification Report*

---

### Executive Summary

Phase 3.7 connects all completed document forensic analysis modules (Phases 3.1–3.6: Private Vault Ingestion, Document Metadata Forensics, Barcode/QR Cross-Validation, Offline Tesseract.js OCR Engine, Error Level Analysis (ELA), Text-Layout Consistency Forensics, and Bank Seal/Signature Region Detection) with an explainable, deterministic FDR Risk Engine.

Previously, risk discrepancies existed primarily as seeded database rows without end-to-end integration with uploaded document files. Phase 3.7 delivers:
1. **Unified Finding Contract**: A typed forensic finding model supporting 10 standard regulatory categories with stable IDs, source analyzer provenance, rule keys/versions, severity levels, human-readable explanations, recommended actions, and resolution states.
2. **Deterministic Risk Scoring**: Decoupled, configurable weight parameters mapping multi-pipeline observations to an explainable Composite Risk Index (0–100) and risk tier (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
3. **Observation De-Duplication**: Explicit cross-pipeline deduplication preventing double-penalizing the same underlying observation (e.g. amount mismatches observed simultaneously in Barcode QR and OCR text).
4. **Statutory Non-Prejudgment Protocol**: Rigorous adherence to regulatory compliance where administrative risk scores do NOT equate to criminal forgery convictions, and **"No indicators found" explicitly does NOT imply "authentic"** (mandating direct bank verification via SFMS or branch confirmation).
5. **Reviewer Resolution Lifecycle & Audit Ledger**: Granular authorization enabling Scrutiny Officers to review, accept risk, mark bank-confirmed, or dismiss false positives with mandatory justification immutably recorded in `FdrAuditLog`.
6. **Idempotent Ingestion**: Reprocessing an existing document updates open automated findings while strictly preserving previously resolved human decisions.

---

### 1. Unified Forensic Finding Contract

The database schema (`prisma/schema.prisma` and migration `20261027200000_unified_risk_findings`) and TypeScript domain contract (`src/lib/fdr/types.ts`) define the finding structure:

```typescript
export interface RiskFindingDto {
  id: string;
  fdrId: string;
  fdrNumber?: string;
  institutionName?: string;
  documentId?: string | null;
  riskCode: string;
  category?: RiskFindingCategory;
  sourceAnalysis?: RiskFindingSourceAnalysis;
  evidenceJson?: string | null;
  evidence?: Record<string, unknown> | null;
  ruleKey?: string;
  ruleVersion?: string;
  severity: AlertSeverity; // "CRITICAL" | "WARNING" | "INFO"
  description: string;
  recommendedAction?: string | null;
  resolutionState?: RiskFindingResolutionState; // "OPEN" | "RESOLVED" | "DISMISSED"
  isResolved: boolean;
  reviewerDecision?: string | null;
  reviewerJustification?: string | null;
  resolvedByUserId?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}
```

#### Supported Finding Categories

| Category | Source Analysis Pipeline | Default Severity | Description / Trigger Condition |
| :--- | :--- | :--- | :--- |
| `AMOUNT_MISMATCH` | `BARCODE_CROSS_VALIDATION` / `OCR_EXTRACTION` | `CRITICAL` / `WARNING` | Documented deposit amount in QR code or OCR text conflicts with FDR registry value. |
| `QR_REFERENCE_MISMATCH` | `BARCODE_CROSS_VALIDATION` / `OCR_EXTRACTION` | `CRITICAL` / `WARNING` | Certificate reference or serial number in QR/OCR does not match registered instrument. |
| `EXTERNAL_VERIFICATION_MISMATCH` | `EXTERNAL_BANK_VERIFICATION` | `CRITICAL` | Issuing bank reported instrument as invalid, deficient, or non-existent during direct confirmation. |
| `EXTERNAL_VERIFICATION_UNAVAILABLE`| `EXTERNAL_BANK_VERIFICATION` / `BARCODE` | `INFO` | Direct bank API / SFMS response pending, or QR code utilizes unrecognized bank schema. |
| `SEAL_SIGNATURE_ISSUE` | `SEAL_SIGNATURE_DETECTOR` | `WARNING` / `INFO` | Official bank seal not detected, or signatory title anchor identified with blank ink region. |
| `ELA_ANOMALY` | `ERROR_LEVEL_ANALYSIS` | `WARNING` / `INFO` | Localized compression disparity (>5% anomalous pixels) or elevated peak error in visual regions. |
| `LAYOUT_INCONSISTENCY` | `LAYOUT_CONSISTENCY` | `WARNING` | Baseline height jumps, spacing irregularities, or font collision anomalies detected. |
| `DATE_INCONSISTENCY` | `BARCODE_CROSS_VALIDATION` / `OCR_EXTRACTION` | `WARNING` | Issue date or maturity date in document scan differs from registered tenure. |
| `METADATA_REVIEW_INDICATOR` | `METADATA_FORENSICS` | `CRITICAL` / `WARNING` | Document created or edited using graphics software (Photoshop, GIMP) or timeline inversion. |
| `OCR_UNCERTAINTY` | `OCR_EXTRACTION` | `INFO` | OCR engine extraction confidence below scrutiny threshold (<65%) due to scan resolution. |
| `GENERAL_DISCREPANCY` | `SYSTEM` | `INFO` | Fallback category for legacy or synthetic demonstration entries. |

---

### 2. Explainable Composite Risk Scoring Architecture

#### Decoupled Configurable Weights
In `src/lib/fdr/riskEngine.ts`, weights are decoupled from detection rules:

```typescript
export interface RiskWeightConfig {
  categoryWeights: Record<RiskFindingCategory, number>;
  severityMultipliers: Record<AlertSeverity, number>;
  maxScore: number;
}

export const DEFAULT_RISK_WEIGHTS: RiskWeightConfig = {
  categoryWeights: {
    AMOUNT_MISMATCH: 40,
    QR_REFERENCE_MISMATCH: 35,
    EXTERNAL_VERIFICATION_MISMATCH: 50,
    EXTERNAL_VERIFICATION_UNAVAILABLE: 15,
    SEAL_SIGNATURE_ISSUE: 20,
    ELA_ANOMALY: 15,
    LAYOUT_INCONSISTENCY: 12,
    DATE_INCONSISTENCY: 15,
    METADATA_REVIEW_INDICATOR: 12,
    OCR_UNCERTAINTY: 8,
    GENERAL_DISCREPANCY: 15,
  },
  severityMultipliers: {
    CRITICAL: 1.0,
    WARNING: 0.6,
    INFO: 0.25,
  },
  maxScore: 100,
};
```

#### Observation De-Duplication Protocol
When both QR code cross-validation and OCR text extraction flag the same underlying physical discrepancy (e.g. deposit amount ₹25,000 vs registered ₹25,00,000):
- Observations are mapped to common target identifiers (`TARGET_AMOUNT`, `TARGET_FDR_NUMBER`, `TARGET_BANK_NAME`, `TARGET_IMAGE_COMPRESSION`).
- The risk engine selects the finding with the highest severity rank (`CRITICAL` > `WARNING` > `INFO`).
- This prevents artificial score inflation while preserving both forensic evidence trails.

#### Risk Tier & Evaluation Status Classification
- **Risk Tiers**:
  - `0 – 19`: **LOW**
  - `20 – 49`: **MEDIUM**
  - `50 – 69`: **HIGH**
  - `70 – 100`: **CRITICAL**
- **Evaluation Statuses**:
  - `VERIFICATION_FAILED`: Any open statutory bank verification mismatch exists.
  - `FIELD_MISMATCH`: Any open amount or instrument reference mismatch exists.
  - `SCREENING_INDICATOR`: Forensic screening anomalies (ELA, layout, seal/signature, metadata) detected.
  - `VERIFICATION_INCONCLUSIVE`: Bank verification response pending or QR schema unrecognized.
  - `NO_INDICATORS_FOUND`: Automated analyzers completed with 0 open findings.
  - `ANALYSIS_INCOMPLETE`: Instrument has no uploaded documentation or unfinished analysis.

#### Regulatory Anti-Forgery Posture
A strict regulatory disclaimer is embedded into every score computation and rendered prominently in the Control Room:
> *"Administrative risk scores and forensic screening indicators are decision-support metrics designed to guide regulatory scrutiny and direct bank verification. A high risk score does not prove criminal forgery; conversely, 'No indicators found' does NOT imply the instrument is authentic or genuine. Direct statutory bank verification is always required."*

---

### 3. Reviewer Resolution Lifecycle & Audit Trail

```
[ Automated Document Upload & Analysis ]
                   │
                   ▼
       [ Synthesize Findings ]
                   │
                   ▼
     [ Persist Findings (Idempotent) ] ◄── (Preserves Previously Resolved Human Decisions)
                   │
                   ▼
     [ Scrutiny Officer Scrutiny ]
                   │
    ┌──────────────┴──────────────┐
    ▼                             ▼
[ False Positive / Noise ]    [ Bank Confirmation / Accepted Risk ]
  • Decision: FALSE_POSITIVE    • Decision: BANK_CONFIRMED / ACCEPTED_RISK
  • State: DISMISSED            • State: RESOLVED
  • Mandatory Justification     • Mandatory Justification
    (≥ 10 chars)                  (≥ 10 chars)
    │                             │
    └──────────────┬──────────────┘
                   │
                   ▼
     [ Record in FdrAuditLog ]
     • Actor: Officer ID & Role
     • Action: RISK_FINDING_RESOLVED
     • Entity: FDR_RISK_FINDING
     • Details: Decision, Justification, Timestamp
```

---

### 4. API Endpoints

1. `GET /api/fdr/[fdrId]/findings`
   - Returns list of explainable forensic findings and composite risk evaluation for an FDR instrument.
   - Query filters: `?category=AMOUNT_MISMATCH&resolutionState=OPEN`.
   - Accessible by authenticated institutional officers and regulatory scrutiny officers.
2. `PATCH /api/fdr/[fdrId]/findings/[findingId]`
   - Resolves or dismisses a finding.
   - Enforces authorization: only `Regulatory Scrutiny Officer`, `AICTE Admin`, `Senior Bank Reviewer` roles allowed.
   - Requires substantive `justification` string (min 10 characters).
   - Generates immutable entry in `FdrAuditLog`.

---

### 5. Verification & Test Suite Summary

- **Total Unit Tests**: 99 tests across 24 suites.
- **Pass Rate**: 100% (99 Passed, 0 Failed, 0 Skipped).
- **TypeScript Check**: `npx tsc --noEmit` passed with 0 errors.
- **Production Build**: `npm run build` compiled successfully in 11.5s with all dynamic API routes verified.
- **Server Health**: Live HTTP 200 confirmed on `http://localhost:3000/fdr?tab=trust-guard` and `http://localhost:3000/api/fdr/fdr-synth-101/findings`.
