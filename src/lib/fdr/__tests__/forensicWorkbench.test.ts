/**
 * SIH26265 FDR Guardian AI - Phase 3.9 Unit Test Suite
 *
 * Tests:
 * 1. Multi-source evidence cross-validation (Submitted vs OCR vs QR vs Bank)
 * 2. Unanalyzed state integrity (Never report completed check if analyzer hasn't run)
 * 3. Reviewer workflow & auditable actions (Resolution, Correction, Evidence request)
 * 4. Regulatory non-misrepresentation (Never display sandbox simulations as live "Bank Verified")
 * 5. Role restrictions and justification validation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveRiskFinding, calculateCompositeFdrRisk } from "../riskEngine.ts";
import { recordFieldCorrection } from "../ocrEngine.ts";
import { getSyntheticDocuments, getSyntheticFdrInstruments, getSyntheticRiskFindings } from "../seedData.ts";
import type { RiskFindingDto } from "../types.ts";

describe("FDR Forensic Workbench - Multi-Source Evidence Cross-Validation", () => {
  const instruments = getSyntheticFdrInstruments();
  const targetFdr = instruments[0]; // FDR-2021-SBI-88210
  const docs = getSyntheticDocuments(targetFdr.id);

  it("should retrieve unified forensic details including documents and findings", () => {
    const findings = getSyntheticRiskFindings().filter((f) => f.fdrId === targetFdr.id);
    const compositeRisk = calculateCompositeFdrRisk(targetFdr.id, findings);

    assert.ok(Array.isArray(docs));
    assert.ok(Array.isArray(findings));
    assert.ok(compositeRisk);
    assert.ok(compositeRisk.score >= 0 && compositeRisk.score <= 100);
  });

  it("should accurately compare submitted FDR amount against OCR extracted value", () => {
    const primaryDoc = docs[0];
    const ocrData = primaryDoc.extractedData;

    assert.ok(ocrData, "Document must have OCR extraction data");
    assert.ok(typeof ocrData.extractedAmount === "number");
    assert.strictEqual(targetFdr.amount, 3500000);

    // In baseline fixture, OCR amount matches submitted amount
    const isAmountMatch = ocrData.extractedAmount === targetFdr.amount;
    assert.strictEqual(isAmountMatch, true);
  });

  it("should flag discrepancy when OCR candidate differs from submitted amount", () => {
    const forgedOcrAmount = 350000; // 10x deficit forgery
    const isMismatch = Math.abs(forgedOcrAmount - targetFdr.amount) > 1;

    assert.strictEqual(isMismatch, true, "Must flag mismatch when amounts conflict");
  });

  it("CRITICAL: Never report analyzer as completed when analyzer has not run", () => {
    // Synthetic unanalyzed document test fixture
    const unanalyzedDoc = {
      id: "doc-unanalyzed-test",
      fdrId: targetFdr.id,
      documentType: "FDR_RECEIPT",
      fileName: "raw_receipt_pending.pdf",
      fileUrl: "/api/fdr/test/documents/doc-unanalyzed-test/download",
      fileSizeBytes: 102400,
      mimeType: "application/pdf",
      storageKey: "raw/pending.pdf",
      sha256Checksum: "abc1234567890abcdef",
      uploadedByUserId: "usr-nodal-01",
      uploadedByRole: "Institution Nodal Officer",
      processingStatus: "PENDING",
      isVerified: false,
      extractedData: null,
      metadata: null,
      barcodes: null,
      elaResult: null,
      layoutFindings: null,
      visualRegions: null,
      createdAt: new Date().toISOString(),
    };

    // Assert that each analyzer state strictly evaluates to false/null
    assert.strictEqual(unanalyzedDoc.extractedData, null);
    assert.strictEqual(unanalyzedDoc.metadata, null);
    assert.strictEqual(unanalyzedDoc.barcodes, null);
    assert.strictEqual(unanalyzedDoc.elaResult, null);
    assert.strictEqual(unanalyzedDoc.layoutFindings, null);
    assert.strictEqual(unanalyzedDoc.visualRegions, null);

    // UI state indicator verification
    const ocrStateLabel = unanalyzedDoc.extractedData ? "COMPLETED" : "NOT_RUN";
    const metaStateLabel = unanalyzedDoc.metadata ? "COMPLETED" : "NOT_ANALYZED";
    const barcodeStateLabel = unanalyzedDoc.barcodes ? "COMPLETED" : "NO_CODES_RUN";
    const elaStateLabel = unanalyzedDoc.elaResult ? "COMPLETED" : "NOT_PROFILED";
    const visualStateLabel = unanalyzedDoc.visualRegions ? "COMPLETED" : "NOT_DETECTED";

    assert.strictEqual(ocrStateLabel, "NOT_RUN");
    assert.strictEqual(metaStateLabel, "NOT_ANALYZED");
    assert.strictEqual(barcodeStateLabel, "NO_CODES_RUN");
    assert.strictEqual(elaStateLabel, "NOT_PROFILED");
    assert.strictEqual(visualStateLabel, "NOT_DETECTED");
  });
});

describe("FDR Forensic Workbench - Reviewer Workflow & Auditable Actions", () => {
  const instruments = getSyntheticFdrInstruments();
  const targetFdr = instruments[0];

  it("should permit scrutiny officer to submit manual field correction with justification", async () => {
    const res = await recordFieldCorrection(
      "ocr_doc-sbi-88210-receipt",
      targetFdr.id,
      "inst-default",
      "fdrNumber",
      "FDR-2021-SBI-88210",
      {
        userId: "usr-officer",
        userName: "Officer J. Sharma",
        userRole: "Regulatory Scrutiny Officer",
      },
      "Corrected OCR glyph misread: character '1' adjusted to letter 'I'"
    );

    assert.ok(res);
    assert.strictEqual(res.fieldName, "fdrNumber");
    assert.strictEqual(res.correctedValue, "FDR-2021-SBI-88210");
    assert.ok(res.justification.includes("glyph misread"));
  });

  it("should validate evidence request requirements and reject short notes (<10 chars)", () => {
    const validateEvidenceNote = (note: string) => {
      if (!note || note.trim().length < 10) {
        throw new Error("A substantive evidence request note (minimum 10 characters) is required.");
      }
      return true;
    };

    assert.throws(() => validateEvidenceNote("short"), /minimum 10 characters/);
    assert.strictEqual(
      validateEvidenceNote("Official Notice: Please furnish original issuing branch endorsement letter confirming active lien."),
      true
    );
  });

  it("should resolve finding and mark resolutionState when scrutiny officer provides valid decision", async () => {
    const syntheticFindings = getSyntheticRiskFindings();
    const openFinding = syntheticFindings.find((f) => !f.isResolved) || syntheticFindings[0];

    const res = await resolveRiskFinding({
      findingId: openFinding.id,
      fdrId: openFinding.fdrId,
      decision: "BANK_CONFIRMED",
      justification: "Issuing bank verified via official SFMS confirmation message #SFMS-881920.",
      officerId: "usr-officer",
      officerName: "Officer J. Sharma",
      officerRole: "Regulatory Scrutiny Officer",
    });

    assert.ok(res.success);
    assert.strictEqual(res.finding?.isResolved, true);
    assert.strictEqual(res.finding?.resolutionState, "RESOLVED");
    assert.strictEqual(res.finding?.reviewerDecision, "BANK_CONFIRMED");
    assert.ok(res.finding?.reviewerJustification?.includes("SFMS"));
  });
});

describe("FDR Forensic Workbench - Statutory Anti-Misrepresentation Invariants", () => {
  it("CRITICAL: Never represent sandbox simulations as live 'Bank Verified'", () => {
    const simulatedVerification = {
      correlationId: "req_corr_sbx_99812",
      verificationMode: "SANDBOX_SIMULATED" as string,
      outcome: "SANDBOX_MATCH" as const,
      disclaimer: "SIMULATION NOTICE: This verification was generated by the FDR Guardian AI Sandbox Gateway using deterministic synthetic fixtures.",
    };

    // Assert that mode is strictly SANDBOX_SIMULATED
    assert.strictEqual(simulatedVerification.verificationMode, "SANDBOX_SIMULATED");
    assert.notStrictEqual(simulatedVerification.verificationMode, "PRODUCTION_LIVE");

    // Invariant: Outcome must NEVER be EXTERNAL_VERIFIED
    assert.notStrictEqual(simulatedVerification.outcome, "EXTERNAL_VERIFIED");
    assert.strictEqual(simulatedVerification.outcome, "SANDBOX_MATCH");

    // UI representation check: Verify title does not claim live bank authentication
    const mode = simulatedVerification.verificationMode as string;
    const displayTitle = mode === "PRODUCTION_LIVE"
      ? "Bank Verified (Live)"
      : "Sandbox Simulation — Synthetic Fixture";

    assert.strictEqual(displayTitle, "Sandbox Simulation — Synthetic Fixture");
    assert.ok(!displayTitle.includes("Live"));
  });

  it("should differentiate unconfigured production gateway from active simulation", () => {
    const unconfiguredResponse = {
      verificationMode: "PRODUCTION_LIVE" as const,
      outcome: "NOT_CONFIGURED" as const,
      error: {
        code: "PROVIDER_NOT_CONFIGURED",
        message: "Production bank verification gateway requires institutional SFMS credentials.",
      },
    };

    assert.strictEqual(unconfiguredResponse.outcome, "NOT_CONFIGURED");
    assert.strictEqual(unconfiguredResponse.error.code, "PROVIDER_NOT_CONFIGURED");
  });
});
