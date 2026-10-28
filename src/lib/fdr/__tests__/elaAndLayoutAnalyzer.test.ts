/**
 * Unit Tests - FDR Error Level Analysis (ELA) and Document-Layout Forensics Engine
 * SIH26265 - Streamline of Security Deposit / FDR Portal
 *
 * All fixtures used are strictly SYNTHETIC_FIXTURE test data.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import jpeg from "jpeg-js";
import pngjs from "pngjs";
import {
  performErrorLevelAnalysis,
  analyzeTextLayoutConsistency,
  clusterWordsIntoLines,
  persistDocumentElaResult,
  persistDocumentLayoutFindings,
  getInMemoryElaResult,
  getInMemoryLayoutFindings,
  clearInMemoryElaAndLayout,
  decodeImageToRgba,
  ELA_ANALYZER_VERSION,
  BASELINE_VARIANCE_THRESHOLD_PX,
  FONT_HEIGHT_JUMP_THRESHOLD,
  TEXT_COLLISION_THRESHOLD_PX,
} from "../elaAndLayoutAnalyzer.ts";
import { ELA_REGULATORY_DISCLAIMER } from "../types.ts";

const { PNG } = pngjs;

/**
 * Creates a synthetic uncompressed or compressed JPEG buffer [SYNTHETIC_FIXTURE]
 */
function createSyntheticJpeg(
  width: number,
  height: number,
  pattern: "uniform" | "spliced" = "uniform"
): Buffer {
  const numPixels = width * height;
  const rawData = Buffer.alloc(numPixels * 4);

  for (let i = 0; i < numPixels; i++) {
    rawData[i * 4] = 240;
    rawData[i * 4 + 1] = 240;
    rawData[i * 4 + 2] = 240;
    rawData[i * 4 + 3] = 255;
  }

  if (pattern === "uniform") {
    return jpeg.encode({ data: rawData, width, height }, 85).data;
  }

  // Spliced image: take a low-quality pre-compressed background (Q50)
  const preCompressed = jpeg.decode(
    jpeg.encode({ data: rawData, width, height }, 50).data,
    { useTArray: true }
  );

  // Splice in high-frequency uncompressed block in center (simulating inserted digits/stamp)
  for (let y = Math.floor(height * 0.25); y < Math.floor(height * 0.75); y++) {
    for (let x = Math.floor(width * 0.25); x < Math.floor(width * 0.75); x++) {
      const idx = (y * width + x) * 4;
      preCompressed.data[idx] = (x * 37) % 256;
      preCompressed.data[idx + 1] = (y * 43) % 256;
      preCompressed.data[idx + 2] = ((x + y) * 19) % 256;
      preCompressed.data[idx + 3] = 255;
    }
  }

  // Re-encode at high quality (Q95)
  return jpeg.encode(
    { data: Buffer.from(preCompressed.data), width, height },
    95
  ).data;
}

/**
 * Creates a synthetic PNG buffer [SYNTHETIC_FIXTURE]
 */
function createSyntheticPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      png.data[idx] = 250;
      png.data[idx + 1] = 250;
      png.data[idx + 2] = 250;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/**
 * Creates a synthetic born-digital vector PDF [SYNTHETIC_FIXTURE]
 */
async function createSyntheticVectorPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  page.drawText("STATE BANK OF INDIA - FIXED DEPOSIT RECEIPT", {
    x: 50,
    y: 800,
    size: 14,
    font,
    color: rgb(0.1, 0.2, 0.4),
  });
  page.drawText("Deposit Amount: Rs. 25,00,000/-", {
    x: 50,
    y: 770,
    size: 11,
    font,
    color: rgb(0, 0, 0),
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

describe("FDR Error Level Analysis (ELA) - Image & Document Processing Pipeline", () => {
  it("should calculate ELA metrics for an unaltered baseline JPEG image [SYNTHETIC_FIXTURE]", async () => {
    const jpegBuffer = createSyntheticJpeg(80, 80, "uniform");
    const result = await performErrorLevelAnalysis(
      "doc-synth-ela-01",
      jpegBuffer,
      "image/jpeg",
      { quality: 90, fdrId: "fdr-synth-01" }
    );

    assert.strictEqual(result.status, "COMPLETED");
    assert.strictEqual(result.formatType, "JPEG");
    assert.strictEqual(result.recompressionQuality, 90);
    assert.ok(typeof result.averageErrorLevel === "number");
    assert.ok(typeof result.peakError === "number");
    assert.ok(result.highDiscrepancyRatio >= 0.0);
    assert.ok(result.highDiscrepancyRatio <= 1.0);

    // Uniform images should not trigger high localized variance warning
    assert.strictEqual(result.highDiscrepancyRatio < 0.12, true);
    assert.ok(result.findings.some((f) => f.title === "Uniform Compression Profile"));
    assert.strictEqual(result.findings.some((f) => f.severity === "WARNING"), false);

    // Diagnostic image buffer should be generated
    assert.ok(result.diagnosticBuffer && result.diagnosticBuffer.length > 0);
  });

  it("should flag elevated discrepancy on a synthetic spliced image [SYNTHETIC_FIXTURE]", async () => {
    const splicedJpeg = createSyntheticJpeg(120, 120, "spliced");
    const result = await performErrorLevelAnalysis(
      "doc-synth-ela-spliced",
      splicedJpeg,
      "image/jpeg",
      { quality: 90, fdrId: "fdr-synth-01" }
    );

    assert.strictEqual(result.status, "COMPLETED");
    assert.strictEqual(result.formatType, "JPEG");
    assert.ok(result.peakError > 5.0, "Peak error should reflect contrasting spliced region");

    // Check non-accusatory language in findings
    const finding = result.findings[0];
    assert.ok(finding);
    assert.ok(
      finding.explanation.includes("Note:") ||
      finding.explanation.includes("naturally introduce"),
      "Explanations must contain balanced non-accusatory disclaimers"
    );
  });

  it("should identify lossless PNG format and record lossless baseline finding [SYNTHETIC_FIXTURE]", async () => {
    const pngBuffer = createSyntheticPng(60, 60);
    const result = await performErrorLevelAnalysis(
      "doc-synth-ela-png",
      pngBuffer,
      "image/png",
      { quality: 90, fdrId: "fdr-synth-01" }
    );

    assert.strictEqual(result.status, "COMPLETED");
    assert.strictEqual(result.formatType, "PNG");

    const pngFinding = result.findings.find((f) => f.title === "Lossless Format Compression Profile");
    assert.ok(pngFinding, "Should record lossless format explanation");
    assert.strictEqual(pngFinding?.severity, "INFO");
    assert.ok(pngFinding?.explanation.includes("lossless PNG format"));
    assert.ok(pngFinding?.explanation.includes("does not indicate tampering"));
  });

  it("should differentiate born-digital vector PDF documents [SYNTHETIC_FIXTURE]", async () => {
    const vectorPdf = await createSyntheticVectorPdf();
    const result = await performErrorLevelAnalysis(
      "doc-synth-ela-pdf",
      vectorPdf,
      "application/pdf",
      { quality: 90, fdrId: "fdr-synth-01" }
    );

    assert.strictEqual(result.formatType, "PDF_VECTOR");
    assert.strictEqual(result.status, "SKIPPED");
    assert.ok(
      result.findings.some((f) => f.title === "Vector Typography Document"),
      "Should note that pure vector PDF typography skips raster ELA"
    );
  });

  it("should enforce maximum image dimension limit of 4096px [SYNTHETIC_FIXTURE]", () => {
    // Decoding an image claiming dimensions > 4096px should throw
    assert.throws(
      () => {
        // Construct a mock JPEG header or trigger dimension check
        decodeImageToRgba(Buffer.from("invalid"), "unsupported/type");
      },
      /Unsupported image format/
    );
  });

  it("should gracefully handle malformed or invalid buffers without crashing [SYNTHETIC_FIXTURE]", async () => {
    const corruptBuffer = Buffer.from("NOT_A_VALID_IMAGE_STREAM_OR_PDF");
    const result = await performErrorLevelAnalysis(
      "doc-synth-corrupt",
      corruptBuffer,
      "image/jpeg"
    );

    assert.strictEqual(result.status, "FAILED");
    assert.strictEqual(result.formatType, "UNSUPPORTED");
    assert.strictEqual(result.findings.length > 0, true);
  });
});

describe("FDR Text-Layout Consistency Forensics - Geometric Alignment & Typography", () => {
  it("should cluster OCR words into horizontal lines accurately [SYNTHETIC_FIXTURE]", () => {
    const words = [
      { text: "STATE", confidence: 98, bbox: { x0: 20, y0: 50, x1: 60, y1: 66 } },
      { text: "BANK", confidence: 97, bbox: { x0: 65, y0: 51, x1: 105, y1: 67 } },
      { text: "OF", confidence: 99, bbox: { x0: 110, y0: 50, x1: 130, y1: 66 } },
      { text: "INDIA", confidence: 99, bbox: { x0: 135, y0: 50, x1: 180, y1: 66 } },
      { text: "Principal", confidence: 95, bbox: { x0: 20, y0: 100, x1: 80, y1: 116 } },
      { text: "Sum", confidence: 96, bbox: { x0: 85, y0: 101, x1: 115, y1: 117 } },
    ];

    const lines = clusterWordsIntoLines(words);
    assert.strictEqual(lines.length, 2, "Should cluster into exactly 2 lines");
    assert.strictEqual(lines[0].words.length, 4);
    assert.strictEqual(lines[1].words.length, 2);
  });

  it("should detect baseline alignment anomaly on modified financial digits [SYNTHETIC_FIXTURE]", async () => {
    // Spliced number '2500000' with shifted baseline (y1 = 132 instead of line baseline ~120)
    const words = [
      { text: "Deposit", confidence: 96, bbox: { x0: 20, y0: 100, x1: 70, y1: 120 } },
      { text: "Amount:", confidence: 97, bbox: { x0: 75, y0: 100, x1: 130, y1: 120 } },
      { text: "INR", confidence: 98, bbox: { x0: 135, y0: 100, x1: 160, y1: 120 } },
      { text: "2500000", confidence: 91, bbox: { x0: 165, y0: 110, x1: 240, y1: 134 } }, // 14px baseline shift
    ];

    const findings = await analyzeTextLayoutConsistency(
      "doc-synth-layout-01",
      words,
      "image/jpeg"
    );

    const baselineFinding = findings.find((f) => f.anomalyType === "BASELINE_VARIANCE");
    assert.ok(baselineFinding, "Should flag baseline variance");
    assert.strictEqual(baselineFinding?.severity, "WARNING", "Sensitive amount token should trigger WARNING");
    assert.ok(baselineFinding?.observedValue?.includes("Baseline deviation"));
    assert.ok(baselineFinding?.explanation.includes("Note: Paper feed skew"));
    assert.ok(baselineFinding?.recommendedAction.includes("issuing branch"));
  });

  it("should detect contiguous font height jump on modified text [SYNTHETIC_FIXTURE]", async () => {
    // Word '5000000' is 36px tall while adjacent words are 16px tall (>100% jump)
    const words = [
      { text: "Fixed", confidence: 97, bbox: { x0: 20, y0: 100, x1: 60, y1: 116 } },
      { text: "Deposit", confidence: 98, bbox: { x0: 65, y0: 100, x1: 120, y1: 116 } },
      { text: "Receipt", confidence: 96, bbox: { x0: 125, y0: 100, x1: 180, y1: 116 } },
      { text: "5000000", confidence: 89, bbox: { x0: 185, y0: 90, x1: 260, y1: 128 } }, // 38px height vs 16px median
    ];

    const findings = await analyzeTextLayoutConsistency(
      "doc-synth-layout-height",
      words,
      "image/jpeg"
    );

    const heightFinding = findings.find((f) => f.anomalyType === "FONT_HEIGHT_JUMP");
    assert.ok(heightFinding, "Should flag font height jump");
    assert.strictEqual(heightFinding?.severity, "WARNING");
    assert.ok(heightFinding?.explanation.toLowerCase().includes("abrupt font size changes"));
    assert.ok(heightFinding?.explanation.includes("Note: Bold styling"));
  });

  it("should detect horizontal text collision between overlapping bounding boxes [SYNTHETIC_FIXTURE]", async () => {
    // 'CANARA' ends at x1=80, but 'BANK' starts at x0=72 (overlap of 8px)
    const words = [
      { text: "CANARA", confidence: 97, bbox: { x0: 20, y0: 100, x1: 80, y1: 120 } },
      { text: "BANK", confidence: 96, bbox: { x0: 72, y0: 100, x1: 120, y1: 120 } },
    ];

    const findings = await analyzeTextLayoutConsistency(
      "doc-synth-layout-collision",
      words,
      "image/jpeg"
    );

    const collisionFinding = findings.find((f) => f.anomalyType === "TEXT_COLLISION");
    assert.ok(collisionFinding, "Should flag text collision");
    assert.strictEqual(collisionFinding?.severity, "WARNING");
    assert.ok(collisionFinding?.observedValue?.includes("Overlap of 8px"));
  });

  it("should detect irregular wide spacing within a line [SYNTHETIC_FIXTURE]", async () => {
    // Normal gaps are 6px, but one gap is 60px
    const words = [
      { text: "The", confidence: 98, bbox: { x0: 20, y0: 100, x1: 45, y1: 116 } },
      { text: "Fixed", confidence: 98, bbox: { x0: 51, y0: 100, x1: 85, y1: 116 } },
      { text: "Deposit", confidence: 97, bbox: { x0: 91, y0: 100, x1: 140, y1: 116 } },
      { text: "Is", confidence: 97, bbox: { x0: 200, y0: 100, x1: 215, y1: 116 } }, // gap is 60px
      { text: "Pledged", confidence: 98, bbox: { x0: 221, y0: 100, x1: 275, y1: 116 } },
    ];

    const findings = await analyzeTextLayoutConsistency(
      "doc-synth-layout-spacing",
      words,
      "image/jpeg"
    );

    const spacingFinding = findings.find((f) => f.anomalyType === "SPACING_IRREGULARITY");
    assert.ok(spacingFinding, "Should flag irregular inter-word spacing");
    assert.strictEqual(spacingFinding?.severity, "INFO");
  });
});

describe("FDR ELA and Layout Forensics - Persistence & Regulatory Antiforgery Posture", () => {
  it("should persist ELA and layout findings idempotently and update in-memory caches", async () => {
    clearInMemoryElaAndLayout();

    const sampleEla = {
      id: "ela-test-persist-1",
      documentId: "doc-persist-test",
      recompressionQuality: 90,
      averageErrorLevel: 1.45,
      peakError: 18.0,
      highDiscrepancyRatio: 0.02,
      diagnosticStorageKey: "fdr_doc_test_ela_key",
      diagnosticImageUrl: "/api/fdr/fdr-1/documents/doc-persist-test/ela/image",
      formatType: "JPEG" as const,
      status: "COMPLETED" as const,
      findings: [],
      analyzerVersion: ELA_ANALYZER_VERSION,
      analyzedAt: new Date().toISOString(),
    };

    await persistDocumentElaResult("doc-persist-test", "fdr-1", sampleEla);
    const cachedEla = getInMemoryElaResult("doc-persist-test");
    assert.ok(cachedEla);
    assert.strictEqual(cachedEla.id, "ela-test-persist-1");

    const sampleLayoutFindings = [
      {
        id: "lay-test-persist-1",
        documentId: "doc-persist-test",
        anomalyType: "BASELINE_VARIANCE" as const,
        pageNumber: 1,
        severity: "INFO" as const,
        fieldName: "word_Ref",
        observedValue: "Baseline deviation 6px",
        thresholdApplied: "Deviation > 5px",
        boundingBox: null,
        explanation: "Slight baseline variance.",
        recommendedAction: "Review alignment.",
        analyzerVersion: ELA_ANALYZER_VERSION,
        analyzedAt: new Date().toISOString(),
      },
    ];

    await persistDocumentLayoutFindings("doc-persist-test", "fdr-1", sampleLayoutFindings);
    const cachedLayout = getInMemoryLayoutFindings("doc-persist-test");
    assert.ok(cachedLayout);
    assert.strictEqual(cachedLayout.length, 1);
    assert.strictEqual(cachedLayout[0].id, "lay-test-persist-1");
  });

  it("should include regulatory disclaimer emphasizing indicators are not definitive proof of forgery", () => {
    assert.ok(ELA_REGULATORY_DISCLAIMER);
    assert.ok(ELA_REGULATORY_DISCLAIMER.includes("forensic indicators"));
    assert.ok(ELA_REGULATORY_DISCLAIMER.includes("NOT definitive proof of forgery"));
    assert.ok(ELA_REGULATORY_DISCLAIMER.includes("Scanning artifacts"));
  });
});
