/**
 * Unit Tests - FDR Bank Seal and Signature-Region Analysis Engine
 * SIH26265 - Streamline of Security Deposit / FDR Portal
 *
 * All fixtures used are strictly SYNTHETIC_FIXTURE test data.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import jpeg from "jpeg-js";
import pngjs from "pngjs";
import {
  detectSealAndSignatureRegions,
  persistDocumentVisualRegions,
  updateVisualRegionReview,
  getInMemoryVisualRegions,
  clearInMemoryVisualRegions,
  VISUAL_ANALYSIS_VERSION,
  VISUAL_DETECTION_METHOD,
  HEURISTIC_LIMITATIONS_NOTE,
} from "../sealAndSignatureDetector.ts";
import { SEAL_SIGNATURE_REGULATORY_DISCLAIMER } from "../types.ts";

const { PNG } = pngjs;

/**
 * Creates a synthetic image containing specified visual elements [SYNTHETIC_FIXTURE]
 */
function createSyntheticDocumentImage(options: {
  includeSignatureStrokes?: boolean;
  includeVioletStamp?: boolean;
  includeBlankSignatureArea?: boolean;
}): Buffer {
  const width = 300;
  const height = 200;
  const rawData = Buffer.alloc(width * height * 4);

  // Default white/light paper background (R:245, G:245, B:245)
  for (let i = 0; i < width * height; i++) {
    rawData[i * 4] = 245;
    rawData[i * 4 + 1] = 245;
    rawData[i * 4 + 2] = 245;
    rawData[i * 4 + 3] = 255;
  }

  // 1. Draw signature ink strokes in candidate signature zone (x: 40-140, y: 50-95)
  if (options.includeSignatureStrokes) {
    for (let x = 40; x < 140; x += 3) {
      const y = Math.floor(70 + 15 * Math.sin(x / 8));
      if (y >= 50 && y < 95) {
        for (let dy = -1; dy <= 1; dy++) {
          const idx = ((y + dy) * width + x) * 4;
          rawData[idx] = 20; // Dark ink
          rawData[idx + 1] = 20;
          rawData[idx + 2] = 40;
        }
      }
    }
  }

  // 2. Draw violet/blue circular bank seal stamp (x: 180-260, y: 40-120)
  if (options.includeVioletStamp) {
    const centerX = 220;
    const centerY = 80;
    const radius = 35;

    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        // Draw round ring and internal seal text simulation
        if (Math.abs(dist - radius) < 3 || dist < 12 || (dist > 18 && dist < 22)) {
          const idx = (y * width + x) * 4;
          // Violet/blue stamp pad ink: high blue, moderate red, low green
          rawData[idx] = 90; // Red
          rawData[idx + 1] = 40; // Green
          rawData[idx + 2] = 195; // Blue
        }
      }
    }
  }

  const encoded = jpeg.encode({ data: rawData, width, height }, 90);
  return encoded.data;
}

describe("FDR Bank Seal & Signature Detector - Honest Architecture & Inspection", () => {
  it("should honestly identify detection method as EXPERIMENTAL_HEURISTIC without fabricating trained model weights", () => {
    assert.strictEqual(VISUAL_DETECTION_METHOD, "EXPERIMENTAL_HEURISTIC");
    assert.ok(HEURISTIC_LIMITATIONS_NOTE.includes("DOES NOT use trained neural network weights"));
    assert.ok(HEURISTIC_LIMITATIONS_NOTE.includes("YOLOv8"));
    assert.ok(HEURISTIC_LIMITATIONS_NOTE.includes("CANNOT authenticate"));
  });

  it("should handle empty or unsupported document buffers gracefully with NOT_CONFIGURED status [SYNTHETIC_FIXTURE]", async () => {
    const emptyBuffer = Buffer.alloc(0);
    const results = await detectSealAndSignatureRegions("doc-err", emptyBuffer, "application/pdf");

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].detectionMethod, "NOT_CONFIGURED");
    assert.strictEqual(results[0].detectionStatus, "NOT_CONFIGURED");
  });
});

describe("FDR Candidate Region Detection - Synthetic Fixtures & Heuristics", () => {
  it("should detect candidate signature region when ink strokes appear above an anchor text [SYNTHETIC_FIXTURE]", async () => {
    const imageBuffer = createSyntheticDocumentImage({ includeSignatureStrokes: true });
    const ocrWords = [
      { text: "Branch", confidence: 98, bbox: { x0: 50, y0: 120, x1: 95, y1: 135 }, page: 1 },
      { text: "Manager", confidence: 97, bbox: { x0: 100, y0: 120, x1: 150, y1: 135 }, page: 1 },
    ];

    const regions = await detectSealAndSignatureRegions(
      "doc-synth-sign-01",
      imageBuffer,
      "image/jpeg",
      ocrWords
    );

    const signCandidate = regions.find((r) => r.candidateClass === "BRANCH_MANAGER_SIGNATURE");
    assert.ok(signCandidate, "Should identify candidate signature region above Branch Manager anchor");
    assert.strictEqual(signCandidate?.detectionStatus, "CANDIDATE_DETECTED");
    assert.strictEqual(signCandidate?.detectionMethod, "EXPERIMENTAL_HEURISTIC");
    assert.strictEqual(signCandidate?.inkCharacteristics, "DARK_STROKE_SIGNATURE");
    assert.ok(signCandidate?.confidenceScore && signCandidate.confidenceScore >= 0.7);
    assert.ok(signCandidate?.boundingBox);
    assert.ok(signCandidate?.boundingBox.y0 < 120, "Signature box should sit above the anchor line");
  });

  it("should flag NOT_DETECTED when signature line anchor is present but the area above is blank [SYNTHETIC_FIXTURE]", async () => {
    // Blank document with no ink strokes
    const imageBuffer = createSyntheticDocumentImage({ includeSignatureStrokes: false });
    const ocrWords = [
      { text: "Authorized", confidence: 97, bbox: { x0: 50, y0: 120, x1: 110, y1: 135 }, page: 1 },
      { text: "Signatory", confidence: 98, bbox: { x0: 115, y0: 120, x1: 170, y1: 135 }, page: 1 },
    ];

    const regions = await detectSealAndSignatureRegions(
      "doc-synth-blank-sign",
      imageBuffer,
      "image/jpeg",
      ocrWords
    );

    const signCandidate = regions.find((r) => r.candidateClass === "AUTHORIZED_SIGNATORY");
    assert.ok(signCandidate, "Should identify anchor line");
    assert.strictEqual(signCandidate?.detectionStatus, "NOT_DETECTED", "Blank area should yield NOT_DETECTED");
    assert.strictEqual(signCandidate?.inkCharacteristics, "BLANK_REGION");
  });

  it("should detect candidate bank seal from violet/blue chromatic stamp ink clustering [SYNTHETIC_FIXTURE]", async () => {
    const imageBuffer = createSyntheticDocumentImage({ includeVioletStamp: true });
    const ocrWords = [
      { text: "Bank", confidence: 99, bbox: { x0: 180, y0: 140, x1: 215, y1: 155 }, page: 1 },
      { text: "Seal", confidence: 99, bbox: { x0: 220, y0: 140, x1: 250, y1: 155 }, page: 1 },
    ];

    const regions = await detectSealAndSignatureRegions(
      "doc-synth-stamp-01",
      imageBuffer,
      "image/jpeg",
      ocrWords
    );

    const sealCandidate = regions.find((r) => r.candidateClass === "BANK_SEAL");
    assert.ok(sealCandidate, "Should detect candidate bank seal");
    assert.strictEqual(sealCandidate?.detectionStatus, "CANDIDATE_DETECTED");
    assert.strictEqual(sealCandidate?.inkCharacteristics, "VIOLET_BLUE_STAMP_INK");
    assert.ok(sealCandidate?.confidenceScore && sealCandidate.confidenceScore >= 0.8);
  });

  it("should detect unanchored physical stamp ink clusters across the document [SYNTHETIC_FIXTURE]", async () => {
    // Has a physical stamp but zero anchor words
    const imageBuffer = createSyntheticDocumentImage({ includeVioletStamp: true });

    const regions = await detectSealAndSignatureRegions(
      "doc-synth-unanchored",
      imageBuffer,
      "image/jpeg",
      [] // No anchor words provided
    );

    const sealCandidate = regions.find((r) => r.candidateClass === "BANK_SEAL");
    assert.ok(sealCandidate, "Should locate unanchored stamp cluster via chromatic grid scan");
    assert.strictEqual(sealCandidate?.detectionStatus, "CANDIDATE_DETECTED");
    assert.ok(sealCandidate?.anchorText?.includes("Unanchored"));
  });
});

describe("FDR Visual Regions - Reviewer Verification & Regulatory Antiforgery Posture", () => {
  it("should allow scrutiny officers to manually verify and annotate candidate regions", async () => {
    clearInMemoryVisualRegions();

    const sampleRegion = {
      id: "vis-test-review-01",
      documentId: "doc-review-test",
      candidateClass: "BANK_SEAL" as const,
      detectionMethod: "EXPERIMENTAL_HEURISTIC" as const,
      detectionStatus: "CANDIDATE_DETECTED" as const,
      pageNumber: 1,
      confidenceScore: 0.85,
      boundingBox: { x0: 100, y0: 100, x1: 180, y1: 180 },
      anchorText: "Official Seal",
      inkCharacteristics: "VIOLET_BLUE_STAMP_INK",
      limitations: HEURISTIC_LIMITATIONS_NOTE,
      isVerifiedByReviewer: false,
      analyzerVersion: VISUAL_ANALYSIS_VERSION,
      analyzedAt: new Date().toISOString(),
    };

    await persistDocumentVisualRegions("doc-review-test", "fdr-1", [sampleRegion]);

    const updated = await updateVisualRegionReview("doc-review-test", "vis-test-review-01", {
      isVerified: true,
      remarks: "Official SBI branch round stamp verified by scrutiny committee.",
      reviewerUserId: "officer-sharma-01",
    });

    assert.ok(updated);
    assert.strictEqual(updated?.isVerifiedByReviewer, true);
    assert.strictEqual(updated?.reviewedByUserId, "officer-sharma-01");
    assert.ok(updated?.reviewerRemarks?.includes("verified by scrutiny committee"));
  });

  it("should emphasize in regulatory disclaimer that visual detections are not standalone proof of authenticity", () => {
    assert.ok(SEAL_SIGNATURE_REGULATORY_DISCLAIMER);
    assert.ok(SEAL_SIGNATURE_REGULATORY_DISCLAIMER.includes("Absence of a detected region does not prove"));
    assert.ok(SEAL_SIGNATURE_REGULATORY_DISCLAIMER.includes("presence of a stamp or signature does not establish that it is genuine"));
    assert.ok(SEAL_SIGNATURE_REGULATORY_DISCLAIMER.includes("NEVER be used as sole proof"));
  });
});
