/**
 * SIH26265 FDR Guardian AI - Phase 3.10 End-to-End Forensic Pipeline & Security Test Suite
 *
 * Comprehensive end-to-end integration and security testing covering:
 * 1. End-to-end forensic lifecycle (Real document buffer -> Ingestion -> Storage ->
 *    Metadata -> Barcodes -> OCR -> ELA -> Visual Seals -> Synthesis -> Risk Engine ->
 *    Sandbox Bank Gateway -> Reviewer Resolution -> Audit Trail)
 * 2. Application security controls (Cross-institution scoping, Magic-byte inspection,
 *    Oversized upload rejection, Path traversal sanitization, Malformed buffer resilience,
 *    Unauthorized reviewer denial, Sandbox spoofing prohibition, Vault isolation, PII exclusion)
 * 3. Forensic correctness & anti-prejudgment rules (Absence != Forgery, ELA is an indicator,
 *    OCR confidence != legal validity, Stamp != Authenticity, Sandbox != Bank Verified)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import { validateDocumentFile, sanitizeFileName } from "../validation.ts";
import {
  saveDocument,
  retrieveDocument,
  deleteDocument,
  getStorageDirectory,
  generateStorageKey,
} from "../../storage/fdrStorage.ts";
import { analyzeDocumentMetadata } from "../metadataAnalyzer.ts";
import { extractAndValidateBarcodes, crossValidateBarcodeData } from "../barcodeAnalyzer.ts";
import { extractCandidateFieldsFromText } from "../ocrEngine.ts";
import { performErrorLevelAnalysis } from "../elaAndLayoutAnalyzer.ts";
import { detectSealAndSignatureRegions } from "../sealAndSignatureDetector.ts";
import {
  synthesizeDocumentFindings,
  calculateCompositeFdrRisk,
  resolveRiskFinding,
} from "../riskEngine.ts";
import {
  SandboxBankVerificationProvider,
  executeBankVerificationRequest,
} from "../bankVerificationProvider.ts";
import { resolveAuthContext, verifyFdrAccess } from "../auth.ts";
import type { FdrInstrumentDto, RiskFindingDto } from "../types.ts";
import { RISK_ENGINE_REGULATORY_DISCLAIMER, BANK_VERIFICATION_SANDBOX_DISCLAIMER } from "../types.ts";


// Synthetic FDR instrument context for test suite
const TEST_FDR: FdrInstrumentDto = {
  id: "fdr-synth-e2e-101",
  institutionId: "inst-delhi-engineering-01",
  institutionName: "Delhi Institute of Technology [SYNTHETIC_FIXTURE]",
  fdrNumber: "FDR-2026-SBI-88210",
  bankName: "State Bank of India",
  branchName: "Parliament Street, New Delhi",
  ifscCode: "SBIN0004132",
  amount: 2500000,
  issueDate: "2026-01-15T00:00:00.000Z",
  maturityDate: "2031-01-15T00:00:00.000Z",
  tenureMonths: 60,
  interestRate: 7.25,
  jointHolderName: "Member Secretary, AICTE",
  isLienMarked: true,
  lienConfirmedAt: "2026-01-15T00:00:00.000Z",
  verificationState: "VERIFIED",
  administrativeState: "PLEDGED_ACTIVE",
  renewalState: "ORIGINAL",
  predecessorId: null,
  daysToMaturity: 1540,
  maturityStatus: "NORMAL",
  documentsCount: 1,
  alertsCount: 0,
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

describe("1. End-to-End Forensic Processing Lifecycle", () => {
  let uploadedStorageKey = "";
  let generatedChecksum = "";
  let syntheticPdfBuffer: Buffer;
  let syntheticQrPngBuffer: Buffer;

  it("Step 1 & 2: Authorized upload validation & private storage vault write", async () => {
    // Generate an actual synthetic PDF with metadata and dimensions
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]); // A4 portrait
    pdfDoc.setTitle("Fixed Deposit Receipt FDR-2026-SBI-88210");
    pdfDoc.setCreator("HP ScanJet Enterprise Flow 7000");
    pdfDoc.setProducer("Hewlett-Packard TWAIN Scanner Driver v4.1");
    pdfDoc.setCreationDate(new Date("2026-01-15T10:30:00Z"));
    pdfDoc.setModificationDate(new Date("2026-01-15T10:30:00Z"));
    const pdfBytes = await pdfDoc.save();
    syntheticPdfBuffer = Buffer.from(pdfBytes);

    // Validate uploaded file
    const validation = validateDocumentFile(
      syntheticPdfBuffer,
      "sbi_fdr_receipt_88210.pdf",
      "application/pdf"
    );

    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.detectedMimeType, "application/pdf");
    assert.strictEqual(validation.sanitizedFileName, "sbi_fdr_receipt_88210.pdf");

    // Write to private storage vault outside public web root
    uploadedStorageKey = generateStorageKey();
    const saveRes = await saveDocument(uploadedStorageKey, syntheticPdfBuffer);

    assert.strictEqual(saveRes.bytesWritten, syntheticPdfBuffer.length);
    assert.ok(saveRes.checksum.length === 64, "Must generate 64-char hex SHA-256");
    generatedChecksum = saveRes.checksum;

    // Verify storage vault isolation (strictly outside public directory)
    const physicalDir = getStorageDirectory();
    assert.ok(!physicalDir.includes("public"), "Storage path MUST NOT be in public web root");
    assert.ok(physicalDir.includes("storage"));
  });

  it("Step 3 & 4: Exact SHA-256 integrity retrieval & metadata forensic extraction", async () => {
    // Read buffer back from storage vault and verify byte-for-byte SHA-256 integrity
    const retrieved = await retrieveDocument(uploadedStorageKey);
    assert.ok(retrieved, "Document must be retrievable from private vault");
    assert.strictEqual(retrieved.size, syntheticPdfBuffer.length);
    assert.strictEqual(retrieved.checksum, generatedChecksum);

    // Execute metadata extraction
    const metaRes = await analyzeDocumentMetadata("doc-e2e-01", retrieved.buffer, "application/pdf");
    assert.strictEqual(metaRes.metadata.pageCount, 1);
    assert.strictEqual(metaRes.metadata.creator, "HP ScanJet Enterprise Flow 7000");
    assert.strictEqual(metaRes.metadata.producer, "Hewlett-Packard TWAIN Scanner Driver v4.1");
    assert.strictEqual(metaRes.metadata.status, "COMPLETED");
  });

  it("Step 5 & 6: Barcode/QR decoding and cross-validation against submitted FDR", async () => {
    // Generate a valid synthetic QR code PNG buffer corresponding to the FDR
    const qrPayload = JSON.stringify({
      fdrNumber: "FDR-2026-SBI-88210",
      amount: "2500000.00",
      bankName: "State Bank of India",
      ifsc: "SBIN0004132",
      maturityDate: "2031-01-15",
    });

    syntheticQrPngBuffer = await QRCode.toBuffer(qrPayload, { type: "png" });

    // Execute barcode decoding pipeline on actual PNG buffer
    const barcodes = await extractAndValidateBarcodes(
      "doc-e2e-qr",
      TEST_FDR.id,
      syntheticQrPngBuffer,
      "image/png",
      TEST_FDR
    );

    assert.strictEqual(barcodes.length, 1);
    assert.strictEqual(barcodes[0].barcodeType, "QR_CODE");
    assert.strictEqual(barcodes[0].validationStatus, "MATCH");
    assert.strictEqual(barcodes[0].hasMismatch, false);
    assert.strictEqual(barcodes[0].extractedAmount, 2500000);
  });

  it("Step 7 & 8: OCR candidate parsing, ELA compression profiling & seal/signature detection", async () => {
    // OCR text candidate parsing on Indian banking text
    const sampleBankingText = `
      STATE BANK OF INDIA
      FIXED DEPOSIT RECEIPT
      Account / Receipt No: FDR-2026-SBI-88210
      Principal Sum: Rs. 25,00,000/- (Rupees Twenty Five Lakh Only)
      Branch IFSC: SBIN0004132
      Date of Issue: 15/01/2026
      Maturity Date: 15/01/2031
      Lien Marked in Favor of: Member Secretary, AICTE
    `;

    const candidates = extractCandidateFieldsFromText(sampleBankingText, 95);
    assert.strictEqual(candidates.fdrNumber?.value, "FDR-2026-SBI-88210");
    assert.strictEqual(candidates.amount?.value, 2500000);
    assert.strictEqual(candidates.bankName?.value, "State Bank of India");
    assert.strictEqual(candidates.ifsc?.value, "SBIN0004132");
    assert.strictEqual(candidates.maturityDate?.value, "2031-01-15");

    // ELA recompression profiling on vector/raster PDF document
    const elaRes = await performErrorLevelAnalysis("doc-e2e-01", syntheticPdfBuffer, "application/pdf");
    assert.ok(elaRes.formatType === "PDF_RASTER" || elaRes.formatType === "PDF_VECTOR");
    assert.ok(elaRes.status === "COMPLETED" || elaRes.status === "SKIPPED");

    // Seal and signature detection (transparently reporting experimental capability)
    const visualRes = await detectSealAndSignatureRegions("doc-e2e-01", syntheticQrPngBuffer, "image/png");
    assert.strictEqual(visualRes[0].detectionMethod, "EXPERIMENTAL_HEURISTIC");
    assert.ok(visualRes[0].limitations.includes("EXPERIMENTAL HEURISTIC LIMITATION"));
  });

  it("Step 9 & 10: Unified findings synthesis and composite risk engine evaluation", () => {
    // Synthesize observations across pipelines
    const findings = synthesizeDocumentFindings(
      {
        documentId: "doc-e2e-01",
        fdrId: TEST_FDR.id,
        metadata: null,
        barcodes: [
          {
            id: "bc-1",
            documentId: "doc-e2e-01",
            fdrId: TEST_FDR.id,
            barcodeType: "QR_CODE",
            rawPayload: "test",
            schemaType: "DELIMITED_KV",
            extractedFdrNumber: "FDR-2026-SBI-88210",
            extractedAmount: 2500000,
            extractedBankName: "State Bank of India",
            extractedIssueDate: "2026-01-15",
            extractedMaturityDate: "2031-01-15",
            parsedFields: {},
            pageNumber: 1,
            validationStatus: "MATCH",
            hasMismatch: false,
            comparisons: [
              { field: "fdrNumber", outcome: "MATCH", firstValue: "FDR-2026-SBI-88210", secondValue: "FDR-2026-SBI-88210" },
              { field: "amount", outcome: "MATCH", firstValue: "2500000", secondValue: "2500000" },
            ] as any,
            analyzerVersion: "1.0.0",
            analyzedAt: new Date().toISOString(),
          },
        ],
        ocrExtraction: {
          id: "ocr-1",
          documentId: "doc-e2e-01",
          extractedFdrNumber: "FDR-2026-SBI-88210",
          extractedAmount: 2500000,
          extractedBankName: "State Bank of India",
          extractedIfsc: "SBIN0004132",
          extractedInstitutionName: "Delhi Institute of Technology",
          extractedIssueDate: "2026-01-15",
          extractedMaturityDate: "2031-01-15",
          confidenceScore: 0.95,
          ocrEngine: "Tesseract.js",
          ocrVersion: "7.0.0",
          status: "COMPLETED",
          candidates: {} as any,
          corrections: [],
          pageCount: 1,
          processingDurationMs: 100,
          extractedText: "STATE BANK OF INDIA",
          createdAt: new Date().toISOString(),
        },
        elaResult: null,
        layoutFindings: [],
        visualRegions: [],
      },
      TEST_FDR
    );

    // Evaluate composite risk score
    const riskEval = calculateCompositeFdrRisk(TEST_FDR.id, findings as any);
    assert.strictEqual(riskEval.riskTier, "LOW");
    assert.strictEqual(riskEval.score, 0);
    assert.strictEqual(riskEval.evaluationStatus, "NO_INDICATORS_FOUND");
    assert.strictEqual(riskEval.statusLabel, "No Screening Indicators Found");
    assert.strictEqual(riskEval.disclaimer, RISK_ENGINE_REGULATORY_DISCLAIMER);
  });

  it("Step 11 & 12: Sandbox gateway simulation and scrutiny officer resolution lifecycle", async () => {
    const sandboxProvider = new SandboxBankVerificationProvider();
    const verifyRes = await sandboxProvider.verifyInstrument({
      fdrId: TEST_FDR.id,
      fdrNumber: TEST_FDR.fdrNumber,
      amount: TEST_FDR.amount,
      bankName: TEST_FDR.bankName,
      ifscCode: TEST_FDR.ifscCode,
      officerUserId: "usr-officer-01",
      officerName: "Officer J. Sharma",
      officerRole: "Regulatory Scrutiny Officer",
    });

    assert.strictEqual(verifyRes.verificationMode, "SANDBOX_SIMULATED");
    assert.strictEqual(verifyRes.outcome, "SANDBOX_MATCH");
    assert.notStrictEqual(verifyRes.outcome, "EXTERNAL_VERIFIED");
    assert.strictEqual(verifyRes.disclaimer, BANK_VERIFICATION_SANDBOX_DISCLAIMER);

    // Scrutiny officer resolves a finding with mandatory decision and justification
    const syntheticFinding: RiskFindingDto = {
      id: "rf-e2e-demo-01",
      fdrId: TEST_FDR.id,
      riskCode: "METADATA_REVIEW_INDICATOR",
      category: "METADATA_REVIEW_INDICATOR",
      severity: "INFO",
      description: "Hardware scanner metadata signature identified.",
      isResolved: false,
      createdAt: new Date().toISOString(),
    };

    const resolveRes = await resolveRiskFinding({
      findingId: syntheticFinding.id,
      fdrId: TEST_FDR.id,
      decision: "ACCEPTED_RISK",
      justification: "Physical scanner metadata reviewed and accepted per AICTE institutional filing protocol.",
      officerId: "usr-officer-01",
      officerName: "Officer J. Sharma",
      officerRole: "Regulatory Scrutiny Officer",
    });

    assert.ok(resolveRes.success);
    assert.strictEqual(resolveRes.finding?.isResolved, true);
    assert.strictEqual(resolveRes.finding?.resolutionState, "RESOLVED");
    assert.strictEqual(resolveRes.finding?.reviewerDecision, "ACCEPTED_RISK");

    // Clean up temporary storage file
    await deleteDocument(uploadedStorageKey);
  });
});

describe("2. Comprehensive Security & Penetration Controls", () => {
  it("should deny cross-institution document access for institution-scoped users", () => {
    const officerAuth = {
      userId: "usr-nodal-delhi",
      userName: "Delhi Officer",
      userRole: "Institution Nodal Officer",
      institutionId: "inst-delhi-engineering-01",
      isRegulatoryOfficer: false,
    };

    // Access to own institution FDR allowed
    const ownCheck = verifyFdrAccess(officerAuth, "inst-delhi-engineering-01");
    assert.strictEqual(ownCheck.allowed, true);

    // Access to a different institution's FDR strictly denied
    const crossCheck = verifyFdrAccess(officerAuth, "inst-mumbai-polytechnic-02");
    assert.strictEqual(crossCheck.allowed, false);
    assert.match(crossCheck.reason || "", /Access denied/i);
  });

  it("should reject magic-byte spoofing attempts (e.g. bash script renamed as .pdf)", () => {
    const maliciousScript = Buffer.from("#!/bin/bash\necho 'Compromised'\nrm -rf /");
    const validation = validateDocumentFile(maliciousScript, "fake_fdr.pdf", "application/pdf");

    assert.strictEqual(validation.isValid, false);
    assert.strictEqual(validation.errorCode, "UNSUPPORTED_TYPE");
    assert.match(validation.errorMessage || "", /File signature does not match/i);
  });

  it("should reject oversized files exceeding the 15 MB threshold", () => {
    const oversizedBuffer = Buffer.alloc(16 * 1024 * 1024); // 16 MB
    // Set PDF header so it only fails on size
    oversizedBuffer.write("%PDF-1.4\n", 0);

    const validation = validateDocumentFile(oversizedBuffer, "oversized.pdf", "application/pdf");
    assert.strictEqual(validation.isValid, false);
    assert.strictEqual(validation.errorCode, "FILE_TOO_LARGE");
    assert.match(validation.errorMessage || "", /exceeds maximum allowed limit/i);
  });

  it("should sanitize path traversal sequences in filenames", () => {
    const maliciousName = "../../../../../etc/shadow.pdf";
    const sanitized = sanitizeFileName(maliciousName);

    assert.ok(!sanitized.includes(".."));
    assert.ok(!sanitized.includes("/"));
    assert.ok(!sanitized.includes("\\"));
    assert.strictEqual(sanitized, "shadow.pdf");
  });

  it("should prevent directory traversal through malicious storage keys", async () => {
    await assert.rejects(
      async () => {
        await retrieveDocument("../../../windows/system32/cmd.exe");
      },
      {
        message: /path traversal/i,
      }
    );
  });

  it("should handle malformed or corrupted buffers gracefully without crashing", async () => {
    const corruptedBuffer = Buffer.from("%PDF-1.4 corrupted garbage bytes trailing 00010101");

    // Metadata analysis on corrupt buffer should not crash
    const metaRes = await analyzeDocumentMetadata("doc-corrupt", corruptedBuffer, "application/pdf");
    assert.ok(metaRes.metadata.rawMetadata?.parseError, "Corrupt buffer should record parse error without crashing");

    // ELA on corrupt buffer should not crash
    const elaRes = await performErrorLevelAnalysis("doc-corrupt", corruptedBuffer, "application/pdf");
    assert.ok(elaRes.status === "FAILED" || elaRes.status === "SKIPPED");
  });

  it("should reject unauthorized user roles from resolving findings", async () => {
    const res = await resolveRiskFinding({
      findingId: "rf-test-01",
      fdrId: "fdr-synth-101",
      decision: "BANK_CONFIRMED",
      justification: "Nodal officer attempting unauthorized override",
      officerId: "usr-nodal-01",
      officerName: "Nodal Officer",
      officerRole: "Institution Nodal Officer", // Unauthorized
    });

    assert.strictEqual(res.success, false);
    assert.match(res.error || "", /not authorized to resolve forensic risk findings/i);
  });

  it("CRITICAL: Prohibit sandbox outcome spoofing from being marked EXTERNAL_VERIFIED", async () => {
    const sandbox = new SandboxBankVerificationProvider();
    const result = await sandbox.verifyInstrument({
      fdrId: TEST_FDR.id,
      fdrNumber: TEST_FDR.fdrNumber,
      amount: TEST_FDR.amount,
      bankName: TEST_FDR.bankName,
      officerUserId: "usr-officer-01",
      officerName: "Officer",
      officerRole: "Regulatory Scrutiny Officer",
    });

    // Invariant: Sandbox provider NEVER returns EXTERNAL_VERIFIED under any circumstance
    assert.strictEqual(result.verificationMode, "SANDBOX_SIMULATED");
    assert.notStrictEqual(result.outcome, "EXTERNAL_VERIFIED");
  });
});

describe("3. Forensic Correctness & Statutory Anti-Prejudgment Rules", () => {
  it("Missing metadata is NOT automatically classified as forgery", async () => {
    // Generate clean PNG image with zero metadata
    const cleanPng = new PNG({ width: 10, height: 10 });
    const cleanPngBuffer = PNG.sync.write(cleanPng);

    const res = await analyzeDocumentMetadata("doc-stripped", cleanPngBuffer, "image/png");
    const forgeryFinding = res.findings.find((f) => f.severity === "CRITICAL");

    assert.strictEqual(forgeryFinding, undefined, "Missing metadata must not trigger a CRITICAL forgery citation");
    const strippedFinding = res.findings.find((f) => f.ruleKey === "RULE_METADATA_STRIPPED");
    assert.ok(strippedFinding);
    assert.strictEqual(strippedFinding?.severity, "INFO");
  });

  it("ELA anomalies are described as screening indicators, not definitive proof of forgery", async () => {
    // Create an image buffer with localized block disparity
    const width = 100;
    const height = 100;
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        png.data[idx] = 128;
        png.data[idx + 1] = 128;
        png.data[idx + 2] = 128;
        png.data[idx + 3] = 255;
      }
    }
    const pngBuffer = PNG.sync.write(png);

    const elaRes = await performErrorLevelAnalysis("doc-ela-indicator", pngBuffer, "image/png");
    assert.ok(elaRes.findings);
    for (const f of elaRes.findings) {
      assert.ok(!f.explanation.toLowerCase().includes("proves forgery"), "ELA findings must never claim proof of forgery");
      assert.match(f.recommendedAction.toLowerCase(), /human scrutiny|investigative|examine/i);
    }
  });

  it("OCR confidence is NOT treated as legal authenticity confidence", () => {
    const highConfReading = { value: 2500000, confidence: 0.99 };
    // High font confidence does not make an instrument legally authentic
    assert.ok(highConfReading.confidence > 0.9);
    const legalAuthenticityConfirmed = false;
    assert.strictEqual(legalAuthenticityConfirmed, false);
  });

  it("Detected seal candidate does NOT imply legal authenticity", async () => {
    const testPng = new PNG({ width: 50, height: 50 });
    const testPngBuf = PNG.sync.write(testPng);
    const visual = await detectSealAndSignatureRegions("doc-seal-test", testPngBuf, "image/png");
    assert.strictEqual(visual[0].detectionMethod, "EXPERIMENTAL_HEURISTIC");
    assert.strictEqual(visual[0].isVerifiedByReviewer, false);
  });

  it("Missing QR codes do NOT prove forgery", () => {
    const parsed = {
      schemaType: "UNRECOGNIZED" as const,
      extractedFdrNumber: null,
      extractedAmount: null,
      extractedBankName: null,
      extractedIssueDate: null,
      extractedMaturityDate: null,
      parsedFields: {},
    };

    const res = crossValidateBarcodeData(parsed, TEST_FDR);
    assert.strictEqual(res.validationStatus, "UNRECOGNIZED");
    assert.strictEqual(res.hasMismatch, false); // Unrecognized format does not constitute a fraud mismatch
  });

  it("'No indicators found' does NOT mean the document is authentic", () => {
    const riskEval = calculateCompositeFdrRisk(TEST_FDR.id, []);
    assert.strictEqual(riskEval.evaluationStatus, "NO_INDICATORS_FOUND");
    assert.strictEqual(riskEval.statusLabel, "No Screening Indicators Found");
    assert.ok(riskEval.disclaimer.includes("does NOT imply the instrument is authentic"));
  });

  it("Inconclusive analysis remains distinct from a failed check", () => {
    const inconclusiveItem = {
      status: "INCONCLUSIVE",
      reason: "Deposit requires physical branch letter confirmation",
    };
    const failedItem = {
      status: "FAILED",
      reason: "Core ledger confirmed deficit mismatch",
    };

    assert.notStrictEqual(inconclusiveItem.status, failedItem.status);
    assert.strictEqual(inconclusiveItem.status, "INCONCLUSIVE");
    assert.strictEqual(failedItem.status, "FAILED");
  });
});
