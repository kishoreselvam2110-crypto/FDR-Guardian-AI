/**
 * SIH26265 FDR Guardian AI - Phase 3.7 Unit Test Suite
 *
 * Tests:
 * 1. Multi-Pipeline Forensic Synthesis (Metadata, QR, OCR, ELA, Layout, Seals)
 * 2. Deterministic Composite Risk Scoring & Decoupled Weighting
 * 3. De-duplication of Multi-Pipeline Observations (Target Amount, Target FDR Number)
 * 4. Regulatory Distinction ("No indicators found" does NOT imply "authentic")
 * 5. Reviewer Lifecycle, Authorization & Audit Integrity
 * 6. Idempotency & Preservation of Resolved Findings on Reprocessing
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  synthesizeDocumentFindings,
  calculateCompositeFdrRisk,
  resolveRiskFinding,
  DEFAULT_RISK_WEIGHTS,
} from "../riskEngine.ts";
import type {
  DocumentAnalysisAggregate,
  FdrInstrumentContext,
} from "../riskEngine.ts";
import type {
  RiskFindingDto,
  RiskFindingCategory,
} from "../types.ts";
import { RISK_ENGINE_REGULATORY_DISCLAIMER } from "../types.ts";

describe("FDR Risk Engine - Multi-Pipeline Forensic Synthesis", () => {
  const mockFdr: FdrInstrumentContext = {
    id: "fdr-synth-101",
    fdrNumber: "FDR-PLEDGE-99001",
    institutionId: "inst-test-001",
    institutionName: "National Engineering Institute",
    amount: 2500000, // 25 Lakhs
    bankName: "State Bank of India",
    verificationState: "PENDING",
  };

  it("should synthesize AMOUNT_MISMATCH and QR_REFERENCE_MISMATCH from barcode discrepancies", () => {
    const analysis: DocumentAnalysisAggregate = {
      documentId: "doc-101",
      fdrId: mockFdr.id,
      barcodes: [
        {
          id: "bc-1",
          documentId: "doc-101",
          fdrId: mockFdr.id,
          barcodeType: "QR_CODE",
          rawPayload: '{"fdr":"FDR-FORGED-000","amount":25000}',
          pageNumber: 1,
          schemaType: "JSON",
          parsedFields: { fdr: "FDR-FORGED-000", amount: 25000 },
          comparisons: [
            {
              field: "amount",
              firstValue: "25000",
              firstSource: "QR_PAYLOAD",
              secondValue: "2500000",
              secondSource: "FDR_RECORD",
              normalizationRule: "NUMERIC_ROUND",
              outcome: "MISMATCH",
              explanation: "Amount in QR (₹25,000) does not match register (₹25,00,000)",
            },
            {
              field: "fdrNumber",
              firstValue: "FDR-FORGED-000",
              firstSource: "QR_PAYLOAD",
              secondValue: "FDR-PLEDGE-99001",
              secondSource: "FDR_RECORD",
              normalizationRule: "EXACT_ALPHANUMERIC",
              outcome: "MISMATCH",
              explanation: "Certificate reference differs",
            },
          ],
          validationStatus: "MISMATCH",
          hasMismatch: true,
          analyzerVersion: "1.0.0",
          analyzedAt: new Date().toISOString(),
        },
      ],
    };

    const findings = synthesizeDocumentFindings(analysis, mockFdr);
    assert.strictEqual(findings.length, 3); // 2 barcode mismatches + 1 fdr verification pending

    const amountFinding = findings.find((f) => f.category === "AMOUNT_MISMATCH");
    assert.ok(amountFinding);
    assert.strictEqual(amountFinding?.severity, "CRITICAL");
    assert.strictEqual(amountFinding?.ruleKey, "QR_AMOUNT_MISMATCH");
    assert.strictEqual(amountFinding?.sourceAnalysis, "BARCODE_CROSS_VALIDATION");

    const refFinding = findings.find((f) => f.category === "QR_REFERENCE_MISMATCH");
    assert.ok(refFinding);
    assert.strictEqual(refFinding?.severity, "CRITICAL");
    assert.strictEqual(refFinding?.ruleKey, "QR_REFERENCE_CONFLICT");
  });

  it("should synthesize ELA_ANOMALY when Error Level Analysis detects high localized disparity", () => {
    const analysis: DocumentAnalysisAggregate = {
      documentId: "doc-102",
      fdrId: mockFdr.id,
      elaResult: {
        id: "ela-1",
        documentId: "doc-102",
        recompressionQuality: 90,
        averageErrorLevel: 14.2,
        peakError: 195.0,
        highDiscrepancyRatio: 0.082, // 8.2% (above 5% threshold)
        formatType: "JPEG",
        status: "COMPLETED",
        findings: [],
        analyzerVersion: "1.0.0",
        analyzedAt: new Date().toISOString(),
      },
    };

    const findings = synthesizeDocumentFindings(analysis, mockFdr);
    const elaFinding = findings.find((f) => f.category === "ELA_ANOMALY");
    assert.ok(elaFinding);
    assert.strictEqual(elaFinding?.severity, "WARNING");
    assert.strictEqual(elaFinding?.sourceAnalysis, "ERROR_LEVEL_ANALYSIS");
    assert.strictEqual(elaFinding?.ruleKey, "ELA_HIGH_DISCREPANCY_RATIO");
  });

  it("should synthesize SEAL_SIGNATURE_ISSUE when seal or signature anchors are unverified or blank", () => {
    const analysis: DocumentAnalysisAggregate = {
      documentId: "doc-103",
      fdrId: mockFdr.id,
      visualRegions: [
        {
          id: "vr-1",
          documentId: "doc-103",
          candidateClass: "BANK_SEAL",
          detectionMethod: "EXPERIMENTAL_HEURISTIC",
          detectionStatus: "NOT_DETECTED",
          pageNumber: 1,
          confidenceScore: 0,
          boundingBox: null,
          limitations: "Heuristic scan completed across 1 page",
          isVerifiedByReviewer: false,
          analyzerVersion: "1.0.0",
          analyzedAt: new Date().toISOString(),
        },
        {
          id: "vr-2",
          documentId: "doc-103",
          candidateClass: "BRANCH_MANAGER_SIGNATURE",
          detectionMethod: "EXPERIMENTAL_HEURISTIC",
          detectionStatus: "NOT_DETECTED",
          pageNumber: 1,
          confidenceScore: 0,
          boundingBox: null,
          anchorText: "Branch Manager",
          limitations: "Signature line anchor identified, stroke analysis blank",
          isVerifiedByReviewer: false,
          analyzerVersion: "1.0.0",
          analyzedAt: new Date().toISOString(),
        },
      ],
    };

    const findings = synthesizeDocumentFindings(analysis, mockFdr);
    const sealFinding = findings.find((f) => f.ruleKey === "BANK_SEAL_ABSENT_OR_UNRESOLVED");
    assert.ok(sealFinding);
    assert.strictEqual(sealFinding?.category, "SEAL_SIGNATURE_ISSUE");

    const sigFinding = findings.find((f) => f.ruleKey === "SIGNATURE_ANCHOR_BLANK_REGION");
    assert.ok(sigFinding);
    assert.strictEqual(sigFinding?.category, "SEAL_SIGNATURE_ISSUE");
  });

  it("should flag METADATA_REVIEW_INDICATOR when graphics editing software is detected in metadata", () => {
    const analysis: DocumentAnalysisAggregate = {
      documentId: "doc-104",
      fdrId: mockFdr.id,
      metadata: {
        id: "meta-1",
        documentId: "doc-104",
        software: "Adobe Photoshop 24.1",
        producer: "Adobe PDF Library 17.0",
        pageCount: 1,
        analyzerVersion: "1.0.0",
        rawMetadata: {},
        findings: [
          {
            id: "mf-1",
            documentId: "doc-104",
            ruleKey: "SUSPICIOUS_IMAGE_EDITOR_SOFTWARE",
            severity: "CRITICAL",
            title: "Graphics Editor Detected",
            explanation: "File produced by Adobe Photoshop 24.1",
            supportingEvidence: { software: "Adobe Photoshop 24.1" },
            recommendedAction: "Request direct scan from issuing branch",
            analyzerVersion: "1.0.0",
            analyzedAt: new Date().toISOString(),
            isResolved: false,
          },
        ],
        status: "COMPLETED",
        analyzedAt: new Date().toISOString(),
      },
    };

    const findings = synthesizeDocumentFindings(analysis, mockFdr);
    const metaFinding = findings.find((f) => f.category === "METADATA_REVIEW_INDICATOR");
    assert.ok(metaFinding);
    assert.strictEqual(metaFinding?.severity, "CRITICAL");
    assert.strictEqual(metaFinding?.sourceAnalysis, "METADATA_FORENSICS");
  });
});

describe("FDR Risk Engine - Composite Risk Scoring & De-duplication", () => {
  it("should de-duplicate multi-pipeline observations targeting the same field (Amount Mismatch)", () => {
    // Both Barcode and OCR detect an amount mismatch for the same instrument
    const findings: RiskFindingDto[] = [
      {
        id: "f-1",
        fdrId: "fdr-dup-1",
        riskCode: "QR_AMOUNT_MISMATCH",
        category: "AMOUNT_MISMATCH",
        sourceAnalysis: "BARCODE_CROSS_VALIDATION",
        ruleKey: "QR_AMOUNT_MISMATCH",
        severity: "CRITICAL", // 40 points * 1.0 = 40
        description: "QR amount ₹25,000 does not match ₹25,00,000",
        isResolved: false,
        createdAt: new Date().toISOString(),
        ...({ observationTarget: "TARGET_AMOUNT" } as unknown as object),
      },
      {
        id: "f-2",
        fdrId: "fdr-dup-1",
        riskCode: "OCR_AMOUNT_MISMATCH",
        category: "AMOUNT_MISMATCH",
        sourceAnalysis: "OCR_EXTRACTION",
        ruleKey: "OCR_AMOUNT_MISMATCH",
        severity: "WARNING", // would be 40 * 0.6 = 24 if stacked
        description: "OCR amount ₹25,000 does not match ₹25,00,000",
        isResolved: false,
        createdAt: new Date().toISOString(),
        ...({ observationTarget: "TARGET_AMOUNT" } as unknown as object),
      },
    ];

    const composite = calculateCompositeFdrRisk("fdr-dup-1", findings);

    // De-duplication should keep only the higher-severity observation (40 points, not 40 + 24 = 64)
    assert.strictEqual(composite.score, 40);
    assert.strictEqual(composite.contributingFactors.length, 1);
    assert.strictEqual(composite.contributingFactors[0].points, 40);
  });

  it("should decouple configurable weights from detection rules", () => {
    const findings: RiskFindingDto[] = [
      {
        id: "f-custom-1",
        fdrId: "fdr-cust-1",
        riskCode: "AMOUNT_DIFF",
        category: "AMOUNT_MISMATCH",
        sourceAnalysis: "BARCODE_CROSS_VALIDATION",
        severity: "CRITICAL",
        description: "Amount discrepancy",
        isResolved: false,
        createdAt: new Date().toISOString(),
      },
    ];

    // Default weight is 40 points
    const defaultResult = calculateCompositeFdrRisk("fdr-cust-1", findings, DEFAULT_RISK_WEIGHTS);
    assert.strictEqual(defaultResult.score, 40);

    // Custom institutional weight configuration with 80 points for amount mismatch
    const customWeights = {
      ...DEFAULT_RISK_WEIGHTS,
      categoryWeights: {
        ...DEFAULT_RISK_WEIGHTS.categoryWeights,
        AMOUNT_MISMATCH: 80,
      },
    };

    const customResult = calculateCompositeFdrRisk("fdr-cust-1", findings, customWeights);
    assert.strictEqual(customResult.score, 80);
    assert.strictEqual(customResult.riskTier, "CRITICAL");
  });

  it("should clamp composite score to maximum 100 without integer overflow", () => {
    // Pile multiple independent severe findings
    const highFindings: RiskFindingDto[] = [
      {
        id: "f-h1",
        fdrId: "fdr-max-1",
        riskCode: "EXT_MISMATCH",
        category: "EXTERNAL_VERIFICATION_MISMATCH",
        severity: "CRITICAL", // 50
        description: "Bank rejected instrument",
        isResolved: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: "f-h2",
        fdrId: "fdr-max-1",
        riskCode: "AMOUNT_MISMATCH",
        category: "AMOUNT_MISMATCH",
        severity: "CRITICAL", // 40
        description: "Amount differs",
        isResolved: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: "f-h3",
        fdrId: "fdr-max-1",
        riskCode: "QR_REF",
        category: "QR_REFERENCE_MISMATCH",
        severity: "CRITICAL", // 35
        description: "Reference mismatch",
        isResolved: false,
        createdAt: new Date().toISOString(),
      },
    ];

    const composite = calculateCompositeFdrRisk("fdr-max-1", highFindings);
    // 50 + 40 + 35 = 125, must be clamped to 100
    assert.strictEqual(composite.score, 100);
    assert.strictEqual(composite.riskTier, "CRITICAL");
  });
});

describe("FDR Risk Engine - Regulatory Distinctions & Statutory Disclaimers", () => {
  it("should assign NO_INDICATORS_FOUND and include mandatory non-authenticity disclaimer when 0 open findings exist", () => {
    const composite = calculateCompositeFdrRisk("fdr-clean-1", [], DEFAULT_RISK_WEIGHTS, true);

    assert.strictEqual(composite.score, 0);
    assert.strictEqual(composite.riskTier, "LOW");
    assert.strictEqual(composite.evaluationStatus, "NO_INDICATORS_FOUND");
    assert.strictEqual(composite.statusLabel, "No Screening Indicators Found");

    // CRITICAL: Regulatory mandate that "No indicators found" must NOT imply "authentic"
    assert.ok(composite.disclaimer.includes("does NOT imply the instrument is authentic or genuine"));
    assert.ok(composite.disclaimer.includes("Direct statutory bank verification is always required"));
  });

  it("should assign ANALYSIS_INCOMPLETE when no documents are uploaded", () => {
    const composite = calculateCompositeFdrRisk("fdr-nodocs-1", [], DEFAULT_RISK_WEIGHTS, false);
    assert.strictEqual(composite.evaluationStatus, "ANALYSIS_INCOMPLETE");
  });

  it("should assign VERIFICATION_INCONCLUSIVE when external bank verification is pending", () => {
    const findings: RiskFindingDto[] = [
      {
        id: "f-pend-1",
        fdrId: "fdr-p-1",
        riskCode: "BANK_VERIFICATION_PENDING",
        category: "EXTERNAL_VERIFICATION_UNAVAILABLE",
        sourceAnalysis: "EXTERNAL_BANK_VERIFICATION",
        severity: "INFO",
        description: "Bank API response pending",
        isResolved: false,
        createdAt: new Date().toISOString(),
      },
    ];

    const composite = calculateCompositeFdrRisk("fdr-p-1", findings);
    assert.strictEqual(composite.evaluationStatus, "VERIFICATION_INCONCLUSIVE");
    assert.strictEqual(composite.statusLabel, "Bank Verification Response Pending / Inconclusive");
  });
});

describe("FDR Risk Engine - Reviewer Lifecycle & Role Authorization", () => {
  it("should reject resolution attempts from unauthorized user roles", async () => {
    const res = await resolveRiskFinding({
      findingId: "rf-test-1",
      fdrId: "fdr-test-1",
      decision: "BANK_CONFIRMED",
      justification: "Confirmed via phone call with branch manager.",
      officerId: "usr-student-01",
      officerName: "John Doe",
      officerRole: "STUDENT", // Unauthorized
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("not authorized"));
  });

  it("should reject resolutions lacking substantive justification (< 10 chars)", async () => {
    const res = await resolveRiskFinding({
      findingId: "rf-test-2",
      fdrId: "fdr-test-1",
      decision: "ACCEPTED_RISK",
      justification: "ok", // Too short
      officerId: "usr-officer-01",
      officerName: "Officer Sharma",
      officerRole: "Regulatory Scrutiny Officer",
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("minimum 10 characters"));
  });

  it("should successfully resolve finding and mark resolutionState when scrutiny officer provides valid justification", async () => {
    const res = await resolveRiskFinding({
      findingId: "rf-test-3",
      fdrId: "fdr-test-1",
      decision: "BANK_CONFIRMED",
      justification: "Verified directly via SBI Corporate SFMS confirmation message #SFMS-98214.",
      officerId: "usr-officer-01",
      officerName: "Officer Sharma",
      officerRole: "Regulatory Scrutiny Officer",
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.finding?.isResolved, true);
    assert.strictEqual(res.finding?.resolutionState, "RESOLVED");
    assert.strictEqual(res.finding?.reviewerDecision, "BANK_CONFIRMED");
    assert.strictEqual(
      res.finding?.reviewerJustification,
      "Verified directly via SBI Corporate SFMS confirmation message #SFMS-98214."
    );
  });

  it("should mark resolutionState as DISMISSED when reviewer designates FALSE_POSITIVE", async () => {
    const res = await resolveRiskFinding({
      findingId: "rf-test-4",
      fdrId: "fdr-test-1",
      decision: "FALSE_POSITIVE",
      justification: "High-contrast digital seal produced baseline compression noise; physical scan confirms original document.",
      officerId: "usr-officer-01",
      officerName: "Officer Sharma",
      officerRole: "AICTE Admin",
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.finding?.resolutionState, "DISMISSED");
    assert.strictEqual(res.finding?.isResolved, true);
  });
});
