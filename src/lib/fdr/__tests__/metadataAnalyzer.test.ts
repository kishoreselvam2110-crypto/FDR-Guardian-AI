import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

import {
  analyzeDocumentMetadata,
  evaluateForensicRules,
  ANALYZER_VERSION,
} from "../metadataAnalyzer.ts";

describe("FDR Document Metadata Forensics - PDF Extraction & Analysis", () => {
  it("should extract PDF document creator, producer, page count, and creation dates", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595, 842]); // A4 page
    pdfDoc.setTitle("FDR Security Deposit SBI-88210");
    pdfDoc.setAuthor("State Bank of India Industrial Branch");
    pdfDoc.setCreator("HP Digital Capture Engine");
    pdfDoc.setProducer("Hewlett-Packard Scanner Service v4.2");
    pdfDoc.setCreationDate(new Date("2026-02-15T09:30:00Z"));
    pdfDoc.setModificationDate(new Date("2026-02-15T09:35:00Z"));
    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    const result = await analyzeDocumentMetadata("doc-test-pdf-01", buffer, "application/pdf");

    assert.strictEqual(result.metadata.analyzerVersion, ANALYZER_VERSION);
    assert.strictEqual(result.metadata.pageCount, 1);
    assert.strictEqual(result.metadata.creator, "HP Digital Capture Engine");
    assert.strictEqual(result.metadata.producer, "Hewlett-Packard Scanner Service v4.2");
    assert.notStrictEqual(result.metadata.creationDate, null);
    assert.notStrictEqual(result.metadata.modificationDate, null);
    assert.strictEqual(result.metadata.status, "COMPLETED");
  });

  it("should identify editing software (Canva/Photoshop) as an explainable warning finding", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 400]);
    pdfDoc.setCreator("Canva PDF Renderer");
    pdfDoc.setProducer("Canva Desktop v2.4");
    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    const result = await analyzeDocumentMetadata("doc-test-canva", buffer, "application/pdf");

    const editorFinding = result.findings.find((f) => f.ruleKey === "RULE_EDITOR_DETECTED");
    assert.notStrictEqual(editorFinding, undefined);
    assert.strictEqual(editorFinding?.severity, "WARNING");
    assert.match(editorFinding?.explanation || "", /Canva/i);
    assert.match(editorFinding?.recommendedAction || "", /bank confirmation letter/i);
  });

  it("should flag temporal inversion when modification date precedes creation date", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 400]);
    // Set creation to June 15, and modification to June 10 (earlier)
    pdfDoc.setCreationDate(new Date("2026-06-15T12:00:00Z"));
    pdfDoc.setModificationDate(new Date("2026-06-10T12:00:00Z"));
    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    const result = await analyzeDocumentMetadata("doc-test-inversion", buffer, "application/pdf");

    const timelineFinding = result.findings.find(
      (f) => f.ruleKey === "RULE_TIMELINE_INCONSISTENCY"
    );
    assert.notStrictEqual(timelineFinding, undefined);
    assert.strictEqual(timelineFinding?.severity, "WARNING");
    assert.match(timelineFinding?.explanation || "", /Temporal inversion detected/i);
  });

  it("should flag future-dated metadata timestamps relative to verification time", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    const futureDate = new Date("2027-01-01T00:00:00Z").toISOString();

    const mockMeta = {
      software: "Acrobat",
      producer: "Adobe",
      creator: null,
      cameraMake: null,
      cameraModel: null,
      creationDate: futureDate,
      modificationDate: futureDate,
      pageCount: 1,
    };

    const findings = evaluateForensicRules("doc-future", mockMeta, now);
    const futureFinding = findings.find((f) => f.ruleKey === "RULE_FUTURE_DATED_METADATA");
    assert.notStrictEqual(futureFinding, undefined);
    assert.strictEqual(futureFinding?.severity, "WARNING");
  });

  it("should handle stripped metadata files gracefully with informational finding", async () => {
    // 1x1 base64 transparent PNG without EXIF/XMP metadata
    const minimalPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const result = await analyzeDocumentMetadata("doc-test-stripped", minimalPng, "image/png");

    assert.strictEqual(result.metadata.status, "COMPLETED");
    const strippedFinding = result.findings.find((f) => f.ruleKey === "RULE_METADATA_STRIPPED");
    assert.notStrictEqual(strippedFinding, undefined);
    assert.strictEqual(strippedFinding?.severity, "INFO");
    assert.match(strippedFinding?.explanation || "", /No scanner model/i);

    // Also verify pure empty metadata evaluation
    const emptyMeta = {
      software: null,
      producer: null,
      creator: null,
      cameraMake: null,
      cameraModel: null,
      creationDate: null,
      modificationDate: null,
      pageCount: 1,
    };
    const emptyFindings = evaluateForensicRules("doc-empty-meta", emptyMeta);
    const emptyStripped = emptyFindings.find((f) => f.ruleKey === "RULE_METADATA_STRIPPED");
    assert.notStrictEqual(emptyStripped, undefined);
    assert.strictEqual(emptyStripped?.severity, "INFO");
  });

  it("should identify physical hardware scanner fingerprints (Canon/Fujitsu/HP)", () => {
    const mockScannerMeta = {
      software: null,
      producer: null,
      creator: null,
      cameraMake: "Canon Inc.",
      cameraModel: "DR-C225 Document Scanner",
      creationDate: "2026-01-10T10:00:00Z",
      modificationDate: "2026-01-10T10:00:00Z",
      pageCount: 1,
    };

    const findings = evaluateForensicRules("doc-scanner", mockScannerMeta);
    const scannerFinding = findings.find((f) => f.ruleKey === "RULE_SCANNER_AUTHENTICATED");
    assert.notStrictEqual(scannerFinding, undefined);
    assert.strictEqual(scannerFinding?.severity, "INFO");
    assert.match(scannerFinding?.explanation || "", /Canon Inc/);
  });

  it("should handle malformed buffers without crashing", async () => {
    const corruptedBuffer = Buffer.from("NOT_A_REAL_PDF_CORRUPTED_STREAM");
    const result = await analyzeDocumentMetadata("doc-malformed", corruptedBuffer, "application/pdf");

    assert.strictEqual(result.metadata.pageCount, null);
    assert.notStrictEqual(result.metadata.rawMetadata, null);
    assert.strictEqual(result.metadata.status, "COMPLETED");
  });

  it("should produce deterministic findings and prevent duplicate findings on repeat runs", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 400]);
    pdfDoc.setProducer("GIMP 2.10.34");
    const buffer = Buffer.from(await pdfDoc.save());

    const run1 = await analyzeDocumentMetadata("doc-deterministic", buffer, "application/pdf");
    const run2 = await analyzeDocumentMetadata("doc-deterministic", buffer, "application/pdf");

    assert.strictEqual(run1.findings.length, run2.findings.length);
    assert.strictEqual(run1.findings[0]?.ruleKey, run2.findings[0]?.ruleKey);
    assert.strictEqual(run1.findings[0]?.id, run2.findings[0]?.id);
  });
});
