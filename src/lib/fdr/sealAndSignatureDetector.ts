/**
 * FDR Guardian AI - Bank Seal and Signature-Region Analysis Engine
 * SIH26265 - Streamline of Security Deposit / FDR Portal
 *
 * HONEST ARCHITECTURAL AUDIT & DISCLOSURE:
 * - No trained neural network weights (e.g. YOLOv8, Faster R-CNN, ONNX) exist in this repository.
 * - This engine implements an honest, transparent, and reproducible EXPERIMENTAL_HEURISTIC detector.
 * - All candidates are strictly labeled with detectionMethod: "EXPERIMENTAL_HEURISTIC".
 * - Never claims trained-model verification.
 *
 * DETECTION METHODOLOGY:
 * 1. OCR Text Anchor Proximity:
 *    Identifies standard regulatory and banking signature/seal anchor labels:
 *    • Branch Manager / Senior Manager / Authorized Signatory
 *    • Bank Official Seal / Branch Stamp / Lien Endorsement Stamp
 *    • Joint Holder / Depositor Signature
 * 2. Visual Ink Chromaticity & Stroke Density Segmentation:
 *    • Violet/Blue/Red stamp ink chromaticity clustering (differentiating physical ink pads from greyscale print)
 *    • Dark ink stroke density analysis in the bounding box directly above signature baseline anchors
 * 3. Reviewer Verification Contract:
 *    • Reviewers can inspect bounding box coordinates, source page, anchor text, and ink characteristics.
 *    • Reviewers can record manual scrutiny decisions, justifications, and verification markers.
 * 4. Non-Accusatory Antiforgery Posture:
 *    • Presence of a seal or signature candidate does NOT establish authenticity (stamps can be copied/pasted).
 *    • Absence of a candidate does NOT prove an instrument was unexecuted.
 *    • Visual detections NEVER constitute standalone proof of fraud or genuineness.
 */

import { PDFParse } from "pdf-parse";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import prisma, { isDatabaseExpectedOnline, markDatabaseUnreachable } from "../db.ts";
import { decodeImageToRgba, type DecodedImage } from "./elaAndLayoutAnalyzer.ts";
import type {
  DocumentVisualRegionDto,
  VisualRegionCandidateClass,
  VisualRegionDetectionMethod,
  VisualRegionDetectionStatus,
} from "./types.ts";
import { SEAL_SIGNATURE_REGULATORY_DISCLAIMER } from "./types.ts";

export const VISUAL_ANALYSIS_VERSION = "1.0.0";
export const VISUAL_DETECTION_METHOD: VisualRegionDetectionMethod = "EXPERIMENTAL_HEURISTIC";

export const HEURISTIC_LIMITATIONS_NOTE =
  "EXPERIMENTAL HEURISTIC LIMITATION: Candidate region identified via OCR text anchor proximity and ink color segmentation. This method DOES NOT use trained neural network weights (e.g. YOLOv8) and CANNOT authenticate whether the signature or seal belongs to an authorized bank representative. Visual presence does not establish validity; absence does not establish non-execution. Direct bank verification is mandatory.";

// In-memory cache for offline/test environments
const inMemoryVisualRegionsVault = new Map<string, DocumentVisualRegionDto[]>();

export function getInMemoryVisualRegions(documentId: string): DocumentVisualRegionDto[] | undefined {
  return inMemoryVisualRegionsVault.get(documentId);
}

export function clearInMemoryVisualRegions(): void {
  inMemoryVisualRegionsVault.clear();
}

export interface WordAnchor {
  text: string;
  confidence: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  page?: number;
}

interface AnchorRule {
  candidateClass: VisualRegionCandidateClass;
  regex: RegExp;
  verticalOffsetAbovePx: number;
  boxHeightPx: number;
  boxWidthPx: number;
  expectedInkType: "STAMP_PAD" | "SIGNATURE_INK";
}

const ANCHOR_RULES: AnchorRule[] = [
  {
    candidateClass: "BRANCH_MANAGER_SIGNATURE",
    regex: /(branch\s*manager|chief\s*manager|senior\s*manager|manager\s*sign)/i,
    verticalOffsetAbovePx: 65,
    boxHeightPx: 55,
    boxWidthPx: 160,
    expectedInkType: "SIGNATURE_INK",
  },
  {
    candidateClass: "AUTHORIZED_SIGNATORY",
    regex: /(authori[sz]ed\s*signator|specimen\s*sign|signatory|officer\s*sign|for\s*and\s*on\s*behalf)/i,
    verticalOffsetAbovePx: 65,
    boxHeightPx: 55,
    boxWidthPx: 160,
    expectedInkType: "SIGNATURE_INK",
  },
  {
    candidateClass: "JOINT_HOLDER_SIGNATURE",
    regex: /(joint\s*holder|depositor\s*sign|applicant\s*sign|regional\s*officer\s*sign)/i,
    verticalOffsetAbovePx: 65,
    boxHeightPx: 55,
    boxWidthPx: 160,
    expectedInkType: "SIGNATURE_INK",
  },
  {
    candidateClass: "BANK_SEAL",
    regex: /(bank\s*seal|official\s*seal|branch\s*stamp|round\s*stamp|seal\s*of\s*the\s*bank|affix\s*stamp|lien\s*stamp)/i,
    verticalOffsetAbovePx: 50,
    boxHeightPx: 80,
    boxWidthPx: 100,
    expectedInkType: "STAMP_PAD",
  },
];

/**
 * Analyzes pixel colors in a rectangular sub-region of an RGBA image buffer
 */
function analyzeSubregionPixels(
  image: DecodedImage,
  box: { x0: number; y0: number; x1: number; y1: number }
): {
  totalPixels: number;
  darkStrokeCount: number;
  chromaticStampCount: number;
  inkTypeDetected: "VIOLET_BLUE_STAMP_INK" | "RED_STAMP_INK" | "DARK_STROKE_SIGNATURE" | "BLANK_REGION" | "AMBIGUOUS";
  strokeDensity: number;
} {
  const clampX0 = Math.max(0, Math.min(image.width - 1, Math.round(box.x0)));
  const clampX1 = Math.max(0, Math.min(image.width - 1, Math.round(box.x1)));
  const clampY0 = Math.max(0, Math.min(image.height - 1, Math.round(box.y0)));
  const clampY1 = Math.max(0, Math.min(image.height - 1, Math.round(box.y1)));

  if (clampX1 <= clampX0 || clampY1 <= clampY0) {
    return {
      totalPixels: 0,
      darkStrokeCount: 0,
      chromaticStampCount: 0,
      inkTypeDetected: "BLANK_REGION",
      strokeDensity: 0,
    };
  }

  const totalPixels = (clampX1 - clampX0) * (clampY1 - clampY0);
  let darkStrokeCount = 0;
  let blueVioletCount = 0;
  let redCount = 0;

  for (let y = clampY0; y < clampY1; y++) {
    for (let x = clampX0; x < clampX1; x++) {
      const idx = (y * image.width + x) * 4;
      const r = image.data[idx];
      const g = image.data[idx + 1];
      const b = image.data[idx + 2];
      const brightness = (r + g + b) / 3.0;

      // Detect dark ink stroke (contrasting against white/cream paper >= 215)
      if (brightness < 185) {
        darkStrokeCount++;
      }

      // Detect violet/blue stamp pad ink (dominant blue channel over red and green)
      if (b > r + 18 && b > g + 15 && brightness < 225) {
        blueVioletCount++;
      }

      // Detect red stamp pad ink
      if (r > g + 30 && r > b + 30 && brightness < 225) {
        redCount++;
      }
    }
  }

  const strokeDensity = totalPixels > 0 ? darkStrokeCount / totalPixels : 0;
  let inkTypeDetected: "VIOLET_BLUE_STAMP_INK" | "RED_STAMP_INK" | "DARK_STROKE_SIGNATURE" | "BLANK_REGION" | "AMBIGUOUS" = "BLANK_REGION";

  if (blueVioletCount > 25) {
    inkTypeDetected = "VIOLET_BLUE_STAMP_INK";
  } else if (redCount > 25) {
    inkTypeDetected = "RED_STAMP_INK";
  } else if (strokeDensity >= 0.008 && strokeDensity <= 0.55 && darkStrokeCount > 20) {
    inkTypeDetected = "DARK_STROKE_SIGNATURE";
  } else if (strokeDensity < 0.004 && darkStrokeCount < 10) {
    inkTypeDetected = "BLANK_REGION";
  } else {
    inkTypeDetected = "AMBIGUOUS";
  }

  return {
    totalPixels,
    darkStrokeCount,
    chromaticStampCount: blueVioletCount + redCount,
    inkTypeDetected,
    strokeDensity,
  };
}

/**
 * Searches an image for unanchored chromatic stamp clusters (e.g. round blue/violet bank stamp)
 */
function detectUnanchoredStampClusters(
  image: DecodedImage,
  pageNumber: number,
  existingBoxes: Array<{ x0: number; y0: number; x1: number; y1: number }>
): DocumentVisualRegionDto[] {
  const regions: DocumentVisualRegionDto[] = [];
  const BLOCK_SIZE = 40;
  const analyzedAt = new Date().toISOString();

  // Downsampled grid scan
  for (let y = 0; y < image.height - BLOCK_SIZE; y += BLOCK_SIZE) {
    for (let x = 0; x < image.width - BLOCK_SIZE; x += BLOCK_SIZE) {
      let chromaticPixels = 0;

      for (let by = y; by < y + BLOCK_SIZE; by += 2) {
        for (let bx = x; bx < x + BLOCK_SIZE; bx += 2) {
          const idx = (by * image.width + bx) * 4;
          const r = image.data[idx];
          const g = image.data[idx + 1];
          const b = image.data[idx + 2];
          const brightness = (r + g + b) / 3.0;

          if (brightness < 225 && ((b > r + 20 && b > g + 16) || (r > g + 32 && r > b + 32))) {
            chromaticPixels++;
          }
        }
      }

      // If dense cluster of chromatic pixels found in this 40x40 block
      if (chromaticPixels > 50) {
        // Expand bounding box to standard seal dimensions (~80x80)
        const box = {
          x0: Math.max(0, x - 20),
          y0: Math.max(0, y - 20),
          x1: Math.min(image.width, x + BLOCK_SIZE + 20),
          y1: Math.min(image.height, y + BLOCK_SIZE + 20),
        };

        // Ensure does not heavily overlap an existing anchor detection
        const overlaps = existingBoxes.some(
          (eb) =>
            Math.abs((eb.x0 + eb.x1) / 2 - (box.x0 + box.x1) / 2) < 50 &&
            Math.abs((eb.y0 + eb.y1) / 2 - (box.y0 + box.y1) / 2) < 50
        );

        if (!overlaps) {
          existingBoxes.push(box);
          regions.push({
            id: `vis_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            documentId: "",
            candidateClass: "BANK_SEAL",
            detectionMethod: "EXPERIMENTAL_HEURISTIC",
            detectionStatus: "CANDIDATE_DETECTED",
            pageNumber,
            confidenceScore: 0.82,
            boundingBox: box,
            anchorText: "Chromatic Ink Cluster (Unanchored Physical Stamp)",
            inkCharacteristics: "VIOLET_BLUE_STAMP_INK",
            limitations: HEURISTIC_LIMITATIONS_NOTE,
            isVerifiedByReviewer: false,
            analyzerVersion: VISUAL_ANALYSIS_VERSION,
            analyzedAt,
          });
        }
      }
    }
  }

  return regions;
}

/**
 * Main detection pipeline for Bank Seals and Signature Regions.
 * Runs text-anchor layout heuristics coupled with pixel chromaticity/stroke density verification.
 */
export async function detectSealAndSignatureRegions(
  documentId: string,
  buffer: Buffer,
  mimeType: string,
  ocrWords?: WordAnchor[]
): Promise<DocumentVisualRegionDto[]> {
  const analyzedAt = new Date().toISOString();
  const regions: DocumentVisualRegionDto[] = [];
  const words = ocrWords || [];

  // Check if buffer is an unsupported or empty file
  if (!buffer || buffer.length === 0) {
    return [
      {
        id: `vis_${Date.now()}_err`,
        documentId,
        candidateClass: "UNKNOWN_STAMP_SIGNATURE",
        detectionMethod: "NOT_CONFIGURED",
        detectionStatus: "NOT_CONFIGURED",
        pageNumber: 1,
        confidenceScore: null,
        boundingBox: null,
        anchorText: null,
        inkCharacteristics: null,
        limitations: "Buffer is empty or unsupported; visual region analysis disabled.",
        isVerifiedByReviewer: false,
        analyzerVersion: VISUAL_ANALYSIS_VERSION,
        analyzedAt,
      },
    ];
  }

  // Attempt to decode image if input is JPEG or PNG
  let decodedImage: DecodedImage | null = null;
  const isImage =
    mimeType.includes("jpeg") ||
    mimeType.includes("jpg") ||
    mimeType.includes("png") ||
    (buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8) ||
    (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50);

  if (isImage) {
    try {
      decodedImage = decodeImageToRgba(buffer, mimeType);
    } catch {
      // Decode failed, will rely strictly on OCR layout
    }
  } else if (mimeType.includes("pdf")) {
    try {
      const parser = new PDFParse({ data: buffer });
      const screenshot = await parser.getScreenshot({ partial: [1] });
      if (screenshot && screenshot.pages && screenshot.pages.length > 0) {
        const firstPage = screenshot.pages[0];
        if (firstPage.dataUrl && firstPage.dataUrl.includes(",")) {
          const pngBase64 = firstPage.dataUrl.split(",")[1];
          const pngBuf = Buffer.from(pngBase64, "base64");
          decodedImage = decodeImageToRgba(pngBuf, "image/png");
        }
      }
    } catch {
      // PDF screenshot render fallback
    }
  }

  const existingBoxes: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];

  // 1. Text-Anchor Heuristic Search
  // Combine contiguous words to evaluate anchor phrases
  const wordTexts = words.map((w) => w.text);
  const fullText = wordTexts.join(" ");

  for (const rule of ANCHOR_RULES) {
    const match = rule.regex.exec(fullText);
    if (!match) continue;

    // Find the word token corresponding to this match
    const matchedSubstring = match[0].toLowerCase();
    const anchorWord = words.find((w) =>
      w.text.toLowerCase().includes(matchedSubstring.split(/\s+/)[0])
    );

    if (anchorWord && anchorWord.bbox) {
      const page = anchorWord.page || 1;
      const anchorCenter = (anchorWord.bbox.x0 + anchorWord.bbox.x1) / 2;

      // Candidate signature or seal zone sits above the anchor text
      const box = {
        x0: Math.max(0, anchorCenter - rule.boxWidthPx / 2),
        y0: Math.max(0, anchorWord.bbox.y0 - rule.verticalOffsetAbovePx),
        x1: anchorCenter + rule.boxWidthPx / 2,
        y1: Math.max(0, anchorWord.bbox.y0 - 5),
      };

      existingBoxes.push(box);

      let detectionStatus: VisualRegionDetectionStatus = "CANDIDATE_DETECTED";
      let inkCharacteristics = "LAYOUT_PROXIMITY_HEURISTIC";
      let confidence = 0.70;

      // If raster image is available, perform pixel verification
      if (decodedImage) {
        const pixelAnalysis = analyzeSubregionPixels(decodedImage, box);
        inkCharacteristics = pixelAnalysis.inkTypeDetected;

        if (pixelAnalysis.inkTypeDetected === "BLANK_REGION") {
          detectionStatus = "NOT_DETECTED";
          confidence = 0.20;
        } else if (
          pixelAnalysis.inkTypeDetected === "VIOLET_BLUE_STAMP_INK" ||
          pixelAnalysis.inkTypeDetected === "RED_STAMP_INK"
        ) {
          detectionStatus = "CANDIDATE_DETECTED";
          confidence = 0.88;
        } else if (pixelAnalysis.inkTypeDetected === "DARK_STROKE_SIGNATURE") {
          detectionStatus = "CANDIDATE_DETECTED";
          confidence = 0.82;
        } else {
          detectionStatus = "INCONCLUSIVE";
          confidence = 0.45;
        }
      }

      regions.push({
        id: `vis_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        documentId,
        candidateClass: rule.candidateClass,
        detectionMethod: "EXPERIMENTAL_HEURISTIC",
        detectionStatus,
        pageNumber: page,
        confidenceScore: confidence,
        boundingBox: box,
        anchorText: match[0],
        inkCharacteristics,
        limitations: HEURISTIC_LIMITATIONS_NOTE,
        isVerifiedByReviewer: false,
        analyzerVersion: VISUAL_ANALYSIS_VERSION,
        analyzedAt,
      });
    }
  }

  // 2. Chromatic cluster scan for unanchored physical bank stamps (if raster image exists)
  if (decodedImage) {
    const unanchoredStamps = detectUnanchoredStampClusters(decodedImage, 1, existingBoxes);
    for (const u of unanchoredStamps) {
      u.documentId = documentId;
      regions.push(u);
    }
  }

  // If no candidates were detected at all, record a transparent NOT_DETECTED summary record
  if (regions.length === 0) {
    regions.push({
      id: `vis_${Date.now()}_none`,
      documentId,
      candidateClass: "UNKNOWN_STAMP_SIGNATURE",
      detectionMethod: "EXPERIMENTAL_HEURISTIC",
      detectionStatus: "NOT_DETECTED",
      pageNumber: 1,
      confidenceScore: null,
      boundingBox: null,
      anchorText: null,
      inkCharacteristics: "NO_ANCHORS_OR_CHROMATIC_CLUSTERS",
      limitations: HEURISTIC_LIMITATIONS_NOTE,
      isVerifiedByReviewer: false,
      analyzerVersion: VISUAL_ANALYSIS_VERSION,
      analyzedAt,
    });
  }

  return regions;
}

/**
 * Persists visual regions to PostgreSQL database or in-memory fallback
 */
export async function persistDocumentVisualRegions(
  documentId: string,
  fdrId: string,
  regions: DocumentVisualRegionDto[]
): Promise<void> {
  // Always update in-memory cache
  inMemoryVisualRegionsVault.set(documentId, regions);

  if (!isDatabaseExpectedOnline()) {
    return;
  }

  try {
    // Delete existing records for document to guarantee idempotency
    await prisma.documentVisualRegion.deleteMany({
      where: { documentId },
    });

    for (const r of regions) {
      await prisma.documentVisualRegion.create({
        data: {
          id: r.id,
          documentId,
          candidateClass: r.candidateClass,
          detectionMethod: r.detectionMethod,
          detectionStatus: r.detectionStatus,
          pageNumber: r.pageNumber,
          confidenceScore: r.confidenceScore,
          boundingBoxJson: r.boundingBox ? JSON.stringify(r.boundingBox) : null,
          anchorText: r.anchorText,
          inkCharacteristics: r.inkCharacteristics,
          limitations: r.limitations,
          isVerifiedByReviewer: r.isVerifiedByReviewer,
          reviewerRemarks: r.reviewerRemarks,
          reviewedByUserId: r.reviewedByUserId,
          reviewedAt: r.reviewedAt ? new Date(r.reviewedAt) : null,
          analyzerVersion: r.analyzerVersion,
          analyzedAt: new Date(r.analyzedAt),
        },
      });
    }
  } catch {
    // Database offline fallback
    markDatabaseUnreachable();
  }
}

/**
 * Records reviewer manual verification/annotation on a visual region
 */
export async function updateVisualRegionReview(
  documentId: string,
  regionId: string,
  review: {
    isVerified: boolean;
    remarks: string;
    reviewerUserId: string;
  }
): Promise<DocumentVisualRegionDto | null> {
  const reviewedAt = new Date().toISOString();

  // Update in-memory cache
  const cachedList = inMemoryVisualRegionsVault.get(documentId);
  let updatedRegion: DocumentVisualRegionDto | null = null;

  if (cachedList) {
    const item = cachedList.find((r) => r.id === regionId);
    if (item) {
      item.isVerifiedByReviewer = review.isVerified;
      item.reviewerRemarks = review.remarks;
      item.reviewedByUserId = review.reviewerUserId;
      item.reviewedAt = reviewedAt;
      updatedRegion = item;
    }
  }

  try {
    const dbRecord = await prisma.documentVisualRegion.update({
      where: { id: regionId },
      data: {
        isVerifiedByReviewer: review.isVerified,
        reviewerRemarks: review.remarks,
        reviewedByUserId: review.reviewerUserId,
        reviewedAt: new Date(reviewedAt),
      },
    });

    return {
      id: dbRecord.id,
      documentId: dbRecord.documentId,
      candidateClass: dbRecord.candidateClass as VisualRegionCandidateClass,
      detectionMethod: dbRecord.detectionMethod as VisualRegionDetectionMethod,
      detectionStatus: dbRecord.detectionStatus as VisualRegionDetectionStatus,
      pageNumber: dbRecord.pageNumber,
      confidenceScore: dbRecord.confidenceScore,
      boundingBox: dbRecord.boundingBoxJson ? JSON.parse(dbRecord.boundingBoxJson) : null,
      anchorText: dbRecord.anchorText,
      inkCharacteristics: dbRecord.inkCharacteristics,
      limitations: dbRecord.limitations || HEURISTIC_LIMITATIONS_NOTE,
      isVerifiedByReviewer: dbRecord.isVerifiedByReviewer,
      reviewerRemarks: dbRecord.reviewerRemarks,
      reviewedByUserId: dbRecord.reviewedByUserId,
      reviewedAt: dbRecord.reviewedAt?.toISOString() || null,
      analyzerVersion: dbRecord.analyzerVersion,
      analyzedAt: dbRecord.analyzedAt.toISOString(),
    };
  } catch {
    return updatedRegion;
  }
}
