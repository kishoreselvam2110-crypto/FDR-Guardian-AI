/**
 * Unit Tests - FDR Barcode & QR Code Forensic Extraction & Cross-Validation Engine
 * SIH26265 - Streamline of Security Deposit / FDR Portal
 *
 * All fixtures used are strictly SYNTHETIC_FIXTURE test data.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";
import jpeg from "jpeg-js";
import pngjs from "pngjs";
import {
  extractAndValidateBarcodes,
  parseBarcodePayload,
  crossValidateBarcodeData,
  sanitizeUntrustedPayload,
  parseNumericAmount,
  normalizeDateString,
  normalizeReference,
  canonicalizeBank,
  persistDocumentBarcodes,
  getInMemoryBarcodes,
  clearInMemoryBarcodes,
  REGULATORY_AUTHENTICITY_DISCLAIMER,
} from "../barcodeAnalyzer.ts";
import type { FdrInstrumentDto } from "../types.ts";

const { PNG } = pngjs;

// Synthetic baseline FDR record
const SYNTHETIC_BASELINE_FDR: FdrInstrumentDto = {
  id: "fdr-synth-test-01",
  institutionId: "inst-synth-01",
  institutionName: "National Engineering Institute [SYNTHETIC_FIXTURE]",
  fdrNumber: "FDR-2026-SBI-88210",
  bankName: "State Bank of India",
  branchName: "Industrial Finance Branch, New Delhi",
  ifscCode: "SBIN0004132",
  amount: 2500000,
  issueDate: "2026-01-15T00:00:00.000Z",
  maturityDate: "2031-01-15T00:00:00.000Z",
  tenureMonths: 60,
  interestRate: 7.25,
  jointHolderName: "Regional Officer (AICTE / State Board)",
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

describe("FDR Barcode & QR Code Engine - Schema Parsing & Sanitization", () => {
  it("should parse modern banking JSON payload correctly [SYNTHETIC_FIXTURE]", () => {
    const syntheticPayload = JSON.stringify({
      fdrNumber: "FDR-2026-SBI-88210",
      amount: "2500000.00",
      bankName: "State Bank of India",
      issueDate: "2026-01-15",
      maturityDate: "2031-01-15",
      schema: "SYNTHETIC_BANK_SCHEMA_V1",
    });

    const parsed = parseBarcodePayload(syntheticPayload);

    assert.strictEqual(parsed.schemaType, "JSON");
    assert.strictEqual(parsed.extractedFdrNumber, "FDR-2026-SBI-88210");
    assert.strictEqual(parsed.extractedAmount, 2500000);
    assert.strictEqual(parsed.extractedBankName, "State Bank of India");
    assert.strictEqual(parsed.extractedIssueDate, "2026-01-15");
    assert.strictEqual(parsed.extractedMaturityDate, "2031-01-15");
  });

  it("should parse bank verification URL query parameters offline without fetching (anti-SSRF) [SYNTHETIC_FIXTURE]", () => {
    const syntheticUrl =
      "https://corp.onlinesbi.sbi/verify/fdr?ref=FDR-2026-SBI-88210&amt=2500000&bank=SBI&mat_date=2031-01-15";

    const parsed = parseBarcodePayload(syntheticUrl);

    assert.strictEqual(parsed.schemaType, "URL_QUERY_PARAMS");
    assert.strictEqual(parsed.extractedFdrNumber, "FDR-2026-SBI-88210");
    assert.strictEqual(parsed.extractedAmount, 2500000);
    assert.strictEqual(parsed.extractedMaturityDate, "2031-01-15");
    assert.strictEqual(parsed.extractedBankName, "SBI");
  });

  it("should parse delimited key-value strings (pipe / semicolon) [SYNTHETIC_FIXTURE]", () => {
    const syntheticKv =
      "FDR_NO:FDR-2026-SBI-88210|AMOUNT:2500000|BANK:State Bank of India|MAT_DATE:2031-01-15";

    const parsed = parseBarcodePayload(syntheticKv);

    assert.strictEqual(parsed.schemaType, "DELIMITED_KV");
    assert.strictEqual(parsed.extractedFdrNumber, "FDR-2026-SBI-88210");
    assert.strictEqual(parsed.extractedAmount, 2500000);
    assert.strictEqual(parsed.extractedBankName, "State Bank of India");
    assert.strictEqual(parsed.extractedMaturityDate, "2031-01-15");
  });

  it("should handle unrecognized or arbitrary payload without throwing [SYNTHETIC_FIXTURE]", () => {
    const garbagePayload = "COMPLETELY_UNSTRUCTURED_PLAIN_TEXT_PAYLOAD_XYZ_99";
    const parsed = parseBarcodePayload(garbagePayload);

    assert.ok(parsed.schemaType === "RAW_STRING" || parsed.schemaType === "UNRECOGNIZED");
  });

  it("should sanitize untrusted payloads and strip control characters [SYNTHETIC_FIXTURE]", () => {
    const dirtyPayload = "FDR-88210\x00\x07\x1B\x08-TEST";
    const clean = sanitizeUntrustedPayload(dirtyPayload);
    assert.strictEqual(clean, "FDR-88210-TEST");
  });
});

describe("FDR Barcode Engine - Field Normalization & Cross-Validation", () => {
  it("should accurately normalize and compare exact monetary amounts [SYNTHETIC_FIXTURE]", () => {
    assert.strictEqual(parseNumericAmount("₹ 25,00,000.00"), 2500000);
    assert.strictEqual(parseNumericAmount("INR 2500000/-"), 2500000);
    assert.strictEqual(parseNumericAmount(2500000), 2500000);
    assert.strictEqual(parseNumericAmount("Invalid"), null);
  });

  it("should normalize dates across DD/MM/YYYY and ISO formats [SYNTHETIC_FIXTURE]", () => {
    assert.strictEqual(normalizeDateString("15/01/2026"), "2026-01-15");
    assert.strictEqual(normalizeDateString("15-01-2026"), "2026-01-15");
    assert.strictEqual(normalizeDateString("2026-01-15T00:00:00.000Z"), "2026-01-15");
  });

  it("should canonicalize major Indian bank entities and acronyms [SYNTHETIC_FIXTURE]", () => {
    assert.strictEqual(canonicalizeBank("State Bank of India"), "STATE_BANK_OF_INDIA");
    assert.strictEqual(canonicalizeBank("SBI"), "STATE_BANK_OF_INDIA");
    assert.strictEqual(canonicalizeBank("HDFC Bank Ltd"), "HDFC_BANK");
    assert.strictEqual(canonicalizeBank("ICICI Bank"), "ICICI_BANK");
    assert.strictEqual(canonicalizeBank("Canara Bank"), "CANARA_BANK");
  });

  it("should produce MATCH when all QR fields correspond to submitted FDR [SYNTHETIC_FIXTURE]", () => {
    const parsed = {
      schemaType: "JSON" as const,
      extractedFdrNumber: "FDR/2026/SBI/88210",
      extractedAmount: 2500000,
      extractedBankName: "SBI",
      extractedIssueDate: "2026-01-15",
      extractedMaturityDate: "2031-01-15",
      parsedFields: {},
    };

    const result = crossValidateBarcodeData(parsed, SYNTHETIC_BASELINE_FDR);

    assert.strictEqual(result.validationStatus, "MATCH");
    assert.strictEqual(result.hasMismatch, false);

    const fdrMatch = result.comparisons.find((c) => c.field === "fdrNumber");
    const amountMatch = result.comparisons.find((c) => c.field === "amount");
    const matMatch = result.comparisons.find((c) => c.field === "maturityDate");
    const bankMatch = result.comparisons.find((c) => c.field === "issuingBank");

    assert.strictEqual(fdrMatch?.outcome, "MATCH");
    assert.strictEqual(amountMatch?.outcome, "MATCH");
    assert.strictEqual(matMatch?.outcome, "MATCH");
    assert.strictEqual(bankMatch?.outcome, "MATCH");
  });

  it("should flag MISMATCH when deposit amounts conflict (e.g. ₹25,000 vs ₹25,00,000) [SYNTHETIC_FIXTURE]", () => {
    const parsed = {
      schemaType: "JSON" as const,
      extractedFdrNumber: "FDR-2026-SBI-88210",
      extractedAmount: 25000, // Deficient amount in QR payload
      extractedBankName: "State Bank of India",
      extractedMaturityDate: "2031-01-15",
      parsedFields: {},
    };

    const result = crossValidateBarcodeData(parsed, SYNTHETIC_BASELINE_FDR);

    assert.strictEqual(result.validationStatus, "MISMATCH");
    assert.strictEqual(result.hasMismatch, true);

    const amountComp = result.comparisons.find((c) => c.field === "amount");
    assert.strictEqual(amountComp?.outcome, "MISMATCH");
    assert.match(amountComp?.explanation || "", /CRITICAL DISCREPANCY/i);
  });

  it("should flag MISMATCH when instrument references conflict [SYNTHETIC_FIXTURE]", () => {
    const parsed = {
      schemaType: "JSON" as const,
      extractedFdrNumber: "FDR-CONFLICTING-REF-000",
      extractedAmount: 2500000,
      parsedFields: {},
    };

    const result = crossValidateBarcodeData(parsed, SYNTHETIC_BASELINE_FDR);

    assert.strictEqual(result.validationStatus, "MISMATCH");
    assert.strictEqual(result.hasMismatch, true);

    const refComp = result.comparisons.find((c) => c.field === "fdrNumber");
    assert.strictEqual(refComp?.outcome, "MISMATCH");
  });
});

describe("FDR Barcode Engine - Image & PDF Decoding Pipeline", () => {
  it("should decode a synthetic QR code from an actual PNG buffer [SYNTHETIC_FIXTURE]", async () => {
    const payload = JSON.stringify({
      fdrNumber: "FDR-2026-SBI-88210",
      amount: "2500000.00",
      bankName: "State Bank of India",
      maturityDate: "2031-01-15",
    });

    const qrPngBuffer = await QRCode.toBuffer(payload, { type: "png" });

    const results = await extractAndValidateBarcodes(
      "doc-test-png-qr",
      SYNTHETIC_BASELINE_FDR.id,
      qrPngBuffer,
      "image/png",
      SYNTHETIC_BASELINE_FDR
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].barcodeType, "QR_CODE");
    assert.strictEqual(results[0].validationStatus, "MATCH");
    assert.strictEqual(results[0].hasMismatch, false);
    assert.strictEqual(results[0].extractedAmount, 2500000);
  });

  it("should decode a synthetic QR code from an actual JPEG buffer [SYNTHETIC_FIXTURE]", async () => {
    const payload = "https://bank.example/verify?fdr=FDR-2026-SBI-88210&amt=2500000";

    const qrPngBuffer = await QRCode.toBuffer(payload, { type: "png" });
    const png = PNG.sync.read(qrPngBuffer);
    const jpegBuffer = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 90).data;

    const results = await extractAndValidateBarcodes(
      "doc-test-jpg-qr",
      SYNTHETIC_BASELINE_FDR.id,
      jpegBuffer,
      "image/jpeg",
      SYNTHETIC_BASELINE_FDR
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].barcodeType, "QR_CODE");
    assert.strictEqual(results[0].schemaType, "URL_QUERY_PARAMS");
    assert.strictEqual(results[0].extractedFdrNumber, "FDR-2026-SBI-88210");
  });

  it("should safely extract and decode embedded images inside a PDF [SYNTHETIC_FIXTURE]", async () => {
    // Generate QR code and embed in PDF
    const payload = JSON.stringify({
      fdrNumber: "FDR-2026-SBI-88210",
      amount: "2500000",
      bank: "SBI",
    });

    const qrPngBuffer = await QRCode.toBuffer(payload, { type: "png" });
    const png = PNG.sync.read(qrPngBuffer);
    const jpegBuffer = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 90).data;

    const pdfDoc = await PDFDocument.create();
    const jpgImg = await pdfDoc.embedJpg(jpegBuffer);
    const page = pdfDoc.addPage([600, 400]);
    page.drawImage(jpgImg, { x: 50, y: 50, width: 200, height: 200 });
    const pdfBytes = await pdfDoc.save();

    const results = await extractAndValidateBarcodes(
      "doc-test-pdf-qr",
      SYNTHETIC_BASELINE_FDR.id,
      Buffer.from(pdfBytes),
      "application/pdf",
      SYNTHETIC_BASELINE_FDR
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].barcodeType, "QR_CODE");
    assert.strictEqual(results[0].validationStatus, "MATCH");
  });

  it("should return NO_CODES gracefully when document contains zero barcodes [SYNTHETIC_FIXTURE]", async () => {
    // 1x1 base64 transparent PNG without QR
    const emptyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const results = await extractAndValidateBarcodes(
      "doc-test-empty",
      SYNTHETIC_BASELINE_FDR.id,
      emptyPng,
      "image/png",
      SYNTHETIC_BASELINE_FDR
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].barcodeType, "NONE");
    assert.strictEqual(results[0].validationStatus, "NO_CODES");
  });

  it("should maintain idempotency and prevent duplicate entries on repeat persistence [SYNTHETIC_FIXTURE]", async () => {
    clearInMemoryBarcodes();

    const mockBarcodes = [
      {
        id: "bc_doc_repeat_1",
        documentId: "doc-repeat",
        fdrId: SYNTHETIC_BASELINE_FDR.id,
        barcodeType: "QR_CODE",
        rawPayload: "FDR-2026-SBI-88210",
        pageNumber: 1,
        schemaType: "RAW_STRING",
        extractedFdrNumber: "FDR-2026-SBI-88210",
        extractedAmount: null,
        extractedBankName: null,
        extractedIssueDate: null,
        extractedMaturityDate: null,
        parsedFields: {},
        comparisons: [],
        validationStatus: "MATCH" as const,
        hasMismatch: false,
        analyzerVersion: "1.0.0",
        analyzedAt: new Date().toISOString(),
      },
    ];

    await persistDocumentBarcodes("doc-repeat", SYNTHETIC_BASELINE_FDR.id, mockBarcodes);
    await persistDocumentBarcodes("doc-repeat", SYNTHETIC_BASELINE_FDR.id, mockBarcodes);

    const memoryVault = getInMemoryBarcodes("doc-repeat");
    assert.strictEqual(memoryVault.length, 1);
  });
});
