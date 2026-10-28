/**
 * Unit Tests - FDR Real OCR Pipeline & Candidate Field Extraction Engine
 * SIH26265 - Streamline of Security Deposit / FDR Portal
 *
 * All fixtures used are strictly SYNTHETIC_FIXTURE test data.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { PDFDocument } from "pdf-lib";
import {
  processDocumentOcr,
  persistDocumentExtraction,
  recordFieldCorrection,
  extractCandidateFieldsFromText,
  getInMemoryExtraction,
  clearInMemoryExtractions,
  REGULATORY_OCR_DISCLAIMER,
  OCR_ENGINE_NAME,
} from "../ocrEngine.ts";

describe("FDR OCR Engine - Candidate Field Regex & Heuristic Parsing", () => {
  it("should parse standard Indian banking fields from synthetic text [SYNTHETIC_FIXTURE]", () => {
    const syntheticText = `
      STATE BANK OF INDIA
      COMMERCIAL BRANCH, NEW DELHI
      FIXED DEPOSIT RECEIPT
      FDR No: FDR-2026-SBI-88210
      Name of Institution: Apex Institute of Technology
      Deposit Amount: Rs. 25,00,000.00
      Date of Issue: 15/01/2026
      Maturity Date: 15/01/2031
      IFSC Code: SBIN0004132
      Tenure: 60 Months
    `;

    const candidates = extractCandidateFieldsFromText(syntheticText, 95, 1);

    assert.strictEqual(candidates.fdrNumber.value, "FDR-2026-SBI-88210");
    assert.strictEqual(candidates.fdrNumber.validationStatus, "CANDIDATE");
    assert.match(candidates.fdrNumber.supportingTextSnippet || "", /FDR No:/i);

    assert.strictEqual(candidates.bankName.value, "State Bank of India");
    assert.strictEqual(candidates.amount.value, 2500000);
    assert.strictEqual(candidates.issueDate.value, "2026-01-15");
    assert.strictEqual(candidates.maturityDate.value, "2031-01-15");
    assert.strictEqual(candidates.ifsc.value, "SBIN0004132");
    assert.match(candidates.institutionName.value || "", /Apex Institute of Technology/i);
  });

  it("should safely handle documents with missing or omitted fields without inventing values [SYNTHETIC_FIXTURE]", () => {
    const sparseText = `
      HDFC BANK LTD
      ACKNOWLEDGED RECEIPT OF PLEDGE
      This is to certify receipt of documents from the institute.
    `;

    const candidates = extractCandidateFieldsFromText(sparseText, 90, 1);

    assert.strictEqual(candidates.bankName.value, "HDFC Bank Ltd");
    assert.strictEqual(candidates.fdrNumber.value, null);
    assert.strictEqual(candidates.fdrNumber.validationStatus, "NOT_FOUND");
    assert.strictEqual(candidates.amount.value, null);
    assert.strictEqual(candidates.amount.validationStatus, "NOT_FOUND");
    assert.strictEqual(candidates.maturityDate.value, null);
    assert.strictEqual(candidates.maturityDate.validationStatus, "NOT_FOUND");
  });

  it("should normalize dates across diverse Indian bank formats [SYNTHETIC_FIXTURE]", () => {
    const textDmy = "Deposit Date: 31/03/2026\nMaturity Date: 31/03/2031";
    const candidates = extractCandidateFieldsFromText(textDmy, 90, 1);

    assert.strictEqual(candidates.issueDate.value, "2026-03-31");
    assert.strictEqual(candidates.maturityDate.value, "2031-03-31");
  });
});

describe("FDR OCR Pipeline - End-to-End Extraction on Synthetic PDF", () => {
  it("should extract text and candidates from an actual generated PDF document [SYNTHETIC_FIXTURE]", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText(
      "PUNJAB NATIONAL BANK\nFIXED DEPOSIT RECEIPT\nFDR No: PNB-2026-FD-99410\nDeposit Amount: Rs. 15,00,000.00\nIssue Date: 10/02/2026\nMaturity Date: 10/02/2031\nIFSC: PUNB0014200",
      { x: 50, y: 320, size: 14 }
    );
    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    const result = await processDocumentOcr("doc-test-ocr-pdf", buffer, "application/pdf");

    assert.strictEqual(result.status, "COMPLETED");
    assert.strictEqual(result.ocrEngine, OCR_ENGINE_NAME);
    assert.ok(result.confidenceScore >= 0.7, `Expected confidence >= 0.7, got ${result.confidenceScore}`);
    assert.strictEqual(result.extractedFdrNumber, "PNB-2026-FD-99410");
    assert.strictEqual(result.extractedAmount, 1500000);
    assert.strictEqual(result.extractedBankName, "Punjab National Bank");
    assert.strictEqual(result.extractedIfsc, "PUNB0014200");
    assert.strictEqual(result.extractedIssueDate, "2026-02-10");
    assert.strictEqual(result.extractedMaturityDate, "2031-02-10");
  });

  it("should handle corrupt or invalid file buffers gracefully with useful error status [SYNTHETIC_FIXTURE]", async () => {
    const corruptBuffer = Buffer.from("THIS_IS_NOT_A_VALID_PDF_OR_IMAGE_BUFFER");

    const result = await processDocumentOcr("doc-test-corrupt", corruptBuffer, "application/pdf");

    // Recovers safely without crashing
    assert.ok(result.status === "COMPLETED" || result.status === "FAILED");
    assert.strictEqual(result.extractedFdrNumber, null);
    assert.strictEqual(result.extractedAmount, null);
  });
});

describe("FDR OCR Reviewer Corrections & Audit Trail", () => {
  it("should record reviewer correction, preserve original value, and log justification [SYNTHETIC_FIXTURE]", async () => {
    clearInMemoryExtractions();

    const mockExtraction = {
      id: "ocr_doc_corr_test",
      documentId: "doc_corr_test",
      extractedFdrNumber: "FDR-2026-SBI-88210-TYPO",
      extractedAmount: 2500000,
      extractedBankName: "State Bank of India",
      extractedIfsc: "SBIN0004132",
      extractedIssueDate: "2026-01-15",
      extractedMaturityDate: "2031-01-15",
      extractedInstitutionName: null,
      confidenceScore: 0.94,
      ocrEngine: OCR_ENGINE_NAME,
      ocrVersion: "7.0.0",
      processingDurationMs: 450,
      extractedText: "Sample extracted text",
      pageCount: 1,
      status: "COMPLETED" as const,
      candidates: {
        fdrNumber: {
          field: "fdrNumber",
          value: "FDR-2026-SBI-88210-TYPO",
          rawValue: "FDR-2026-SBI-88210-TYPO",
          confidence: 0.94,
          sourcePage: 1,
          supportingTextSnippet: "FDR No: FDR-2026-SBI-88210-TYPO",
          validationStatus: "CANDIDATE" as const,
        },
        bankName: {
          field: "bankName",
          value: "State Bank of India",
          rawValue: "State Bank of India",
          confidence: 0.95,
          sourcePage: 1,
          supportingTextSnippet: "State Bank of India",
          validationStatus: "CANDIDATE" as const,
        },
        institutionName: { field: "institutionName", value: null, rawValue: null, confidence: 0, sourcePage: 1, supportingTextSnippet: null, validationStatus: "NOT_FOUND" as const },
        amount: { field: "amount", value: 2500000, rawValue: "2500000", confidence: 0.94, sourcePage: 1, supportingTextSnippet: "2500000", validationStatus: "CANDIDATE" as const },
        issueDate: { field: "issueDate", value: "2026-01-15", rawValue: "2026-01-15", confidence: 0.94, sourcePage: 1, supportingTextSnippet: "2026-01-15", validationStatus: "CANDIDATE" as const },
        maturityDate: { field: "maturityDate", value: "2031-01-15", rawValue: "2031-01-15", confidence: 0.94, sourcePage: 1, supportingTextSnippet: "2031-01-15", validationStatus: "CANDIDATE" as const },
        ifsc: { field: "ifsc", value: "SBIN0004132", rawValue: "SBIN0004132", confidence: 0.94, sourcePage: 1, supportingTextSnippet: "SBIN0004132", validationStatus: "CANDIDATE" as const },
      },
      corrections: [],
      createdAt: new Date().toISOString(),
    };

    await persistDocumentExtraction("doc_corr_test", mockExtraction);

    const correction = await recordFieldCorrection(
      "ocr_doc_corr_test",
      "fdr-synth-101",
      "inst-synth-001",
      "fdrNumber",
      "FDR-2026-SBI-88210",
      {
        userId: "usr-officer-44",
        userName: "Rajesh Kumar (Scrutiny Officer)",
        userRole: "Regulatory Scrutiny Officer",
      },
      "Corrected OCR suffix artifact '-TYPO' after inspecting high-resolution bank seal."
    );

    assert.strictEqual(correction.originalValue, "FDR-2026-SBI-88210-TYPO");
    assert.strictEqual(correction.correctedValue, "FDR-2026-SBI-88210");
    assert.strictEqual(correction.correctedByUserId, "usr-officer-44");
    assert.match(correction.justification, /after inspecting high-resolution bank seal/i);

    // Verify in-memory updated value reflects correction while preserving original in correction record
    const updated = getInMemoryExtraction("doc_corr_test");
    assert.strictEqual(updated?.extractedFdrNumber, "FDR-2026-SBI-88210");
  });

  it("should include regulatory disclaimer that OCR confidence is not proof of bank authenticity", () => {
    assert.match(REGULATORY_OCR_DISCLAIMER, /must NEVER be interpreted as evidence of document authenticity/i);
  });
});
