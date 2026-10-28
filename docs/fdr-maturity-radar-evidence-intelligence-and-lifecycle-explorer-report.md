# FDR Guardian AI — Phase 5: FDR Maturity Radar, Evidence Intelligence and Lifecycle Explorer

## Executive Summary

Phase 5 extends the FDR Guardian AI platform with four integrated operational views and foundational lifecycle services designed to address the statutory compliance requirements of **SIH26265 ("Streamline of Security Deposit / FDR Portal")**:

1. **Maturity Radar**: Proactive operational intelligence for upcoming maturities, already-matured instruments, missing renewal evidence, and reviewer follow-up queues.
2. **Evidence Discrepancy Workbench**: Side-by-side comparative analysis across five core fields (`fdrNumber`, `bankName`, `amount`, `issueDate`, `maturityDate`) with explicit provenance tracking, confidence metrics, and auditor justification records.
3. **Instrument Lifecycle Explorer**: Relational lineage graph preserving historical instruments (`predecessorId` -> current -> `replacements`), unified chronological timeline, linked forensic documents, and outstanding statutory obligations.
4. **Release-Readiness Evaluation & Workflow**: Comprehensive 5-criteria statutory checklist, strict state machine transitions (`SUBMITTED` -> `UNDER_SCRUTINY` -> `COMMITTEE_REVIEW` -> `APPROVED`/`REJECTED` -> `DISBURSED`), and role-enforced AI decision safeguards.

---

## 1. Statutory Invariants & Safeguards

### Invariant 1: Historical Non-Overwriting Policy
When an instrument is replaced or renewed, the predecessor record is **never overwritten or mutated**. Instead:
- The historical record transitions to `REPLACED_SUPERSEDED`.
- The new replacement record references the old instrument via `predecessorId`.
- Both records remain queryable with full immutable audit logs and historical lineage representation.

### Invariant 2: OCR Confidence vs Document Authenticity Disclaimer
Optical Character Recognition (OCR) confidence reflects only pattern-recognition clarity of extracted text glyphs. It **does not represent document authenticity, bank validity, or lack of fraudulent manipulation**.
This statutory disclaimer is visibly rendered across all evidence comparison panels and reports:
> *"STATUTORY NOTICE: High OCR extraction confidence indicates character recognition clarity only. It does NOT attest to instrument authenticity, document genuine status, or bank validity."*

### Invariant 3: AI Release Decision Safeguard
Artificial Intelligence outputs may explain evidence, compute risk scores, or recommend procedural next steps, but **must never autonomously authorize a financial release or regulatory disbursement**.
> *"REGULATORY SAFEGUARD: AI outputs provide assistive evidence synthesis and risk scoring only. Under statutory compliance mandates, AI may never autonomously approve, reject, or disburse security deposits. Final determination requires two-person administrative authorization."*

---

## 2. Architecture & Modules

### A. Core Lifecycle Service (`src/lib/fdr/lifecycleService.ts`)
- **`evaluateMaturityFollowUpTasks(instruments, existingFindings)`**:
  - Categorizes instruments into maturity horizons: `expired`, `<30d`, `30-60d`, `60-90d`, `>90d`.
  - Flags missing renewal evidence when an instrument is expired or `<30d` without renewal slips.
  - Generates prioritized follow-up tasks (`HIGH`, `MEDIUM`, `LOW`) with assigned scrutiny officers.
- **`compareEvidenceFields(submitted, ocr, bankVerified, corrections)`**:
  - Normalizes and compares 5 core fields: `fdrNumber`, `bankName`, `amount`, `issueDate`, `maturityDate`.
  - Computes status: `MATCH`, `MISMATCH`, `OCR_UNCERTAIN`, `MISSING_EVIDENCE`, `EXTERNAL_UNAVAILABLE`.
  - Supports auditable field corrections (`DocumentFieldCorrection`) with officer justification.
- **`getInstrumentLifecycleDetail(fdrId)`**:
  - Constructs relational lineage graph nodes and edges (`PREDECESSOR`, `REPLACEMENT`).
  - Synthesizes chronological timeline of submissions, verifications, risk findings, and renewal milestones.
  - Evaluates outstanding statutory obligations (e.g., pending renewal evidence, lien verification).
- **`evaluateReleaseReadiness(releaseRequest, fdr, findings)`**:
  - Evaluates 5 statutory conditions: 8-year statutory tenure, No Objection Certificate (NOC), 0 critical/high risk findings, capital buffer adequacy, and bank lien discharge.
  - Determines 5 distinct states: `COMPLETE`, `MISSING_EVIDENCE`, `AWAITING_REVIEW`, `BLOCKED_DEPENDENCY`, `READY_FOR_DECISION`.
- **`transitionReleaseRequest(requestId, targetState, user, reason)`**:
  - Validates role permissions (`SCRUTINY_OFFICER`, `COMMITTEE_MEMBER`, `SYSTEM_ADMIN`).
  - Prohibits skipped transitions and blocks approvals if `readinessState === 'BLOCKED_DEPENDENCY'`.

### B. Secure API Endpoints
- `GET /api/fdr/[fdrId]/lifecycle`: Returns relational lineage graph, unified timeline, linked documents, and outstanding obligations.
- `POST /api/fdr/[fdrId]/assignments`: Assigns or reassigns scrutiny officers to instruments with immutable audit logging.
- `GET /api/fdr/releases`: Retrieves release petitions with real-time 5-criteria readiness evaluations.
- `GET /api/fdr/releases/[requestId]`: Returns detailed petition status, checklist, and audit history.
- `POST /api/fdr/releases/[requestId]`: Enforces state machine transitions with reason tracking and security role checks.

### C. Control Room UI Views
- **`MaturityRadarView.tsx`**: Horizon filter buttons, 6 operational KPI summary tiles, urgency badges, follow-up task drawer, and direct links to FDR detail/workbench.
- **`EvidenceDiscrepancyWorkbench.tsx`**: Side-by-side 3-source evidence comparison (Submitted vs OCR vs Bank Verified), extraction confidence bars, correction modal with mandatory justification, and statutory disclaimer.
- **`InstrumentLifecycleExplorer.tsx`**: Interactive predecessor/replacement node graph, terms & obligation cards, and vertical unified timeline.
- **`ReleaseReadinessView.tsx`**: 5-state release cards, 5-criteria statutory checklist with status badges, AI decision safeguard banner, and workflow transition modal.

---

## 3. Verification & Test Suite

The test suite (`src/lib/fdr/__tests__/fdrIntelligenceViews.test.ts`) contains 18 comprehensive unit and integration tests covering:
1. Maturity radar horizon calculations (`<30d`, `expired`, etc.).
2. Follow-up task prioritization and missing renewal evidence detection.
3. Reviewer assignment role validation and audit trail persistence.
4. 5-field evidence comparison with discrepancy detection and normalization.
5. Reviewer field correction handling and justification preservation.
6. Statutory OCR confidence disclaimer presence and content.
7. Relational lineage graph construction without mutating predecessor records.
8. 5-criteria release readiness evaluation across all 5 operational states.
9. Prohibited workflow state transitions and role-based authorization blocks.
10. AI release decision safeguard enforcement.

**Total Test Results**: 173 passing tests across 42 suites (`npm test`).
**TypeScript Verification**: Clean compilation (`npx tsc --noEmit` exited with code 0).
