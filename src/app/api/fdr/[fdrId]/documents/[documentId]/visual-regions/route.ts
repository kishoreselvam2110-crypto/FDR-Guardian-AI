import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { retrieveDocument } from "@/lib/storage/fdrStorage";
import {
  detectSealAndSignatureRegions,
  persistDocumentVisualRegions,
  getInMemoryVisualRegions,
  VISUAL_ANALYSIS_VERSION,
} from "@/lib/fdr/sealAndSignatureDetector";
import { getInMemoryExtraction } from "@/lib/fdr/ocrEngine";
import { findInMemoryDocument } from "@/lib/storage/documentRegistry";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";
import { SEAL_SIGNATURE_REGULATORY_DISCLAIMER } from "@/lib/fdr/types";
import type { DocumentVisualRegionDto } from "@/lib/fdr/types";

/**
 * GET /api/fdr/[fdrId]/documents/[documentId]/visual-regions
 * Returns candidate bank seal and signature regions detected via experimental layout/ink heuristics
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ fdrId: string; documentId: string }> }
) {
  const { fdrId, documentId } = await context.params;

  // 1. Authenticate user
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid authentication is required to view visual regions." },
      { status: 401 }
    );
  }

  // 2. Query document and visual regions
  let docRecord: {
    id: string;
    fdrId: string;
    fileName: string;
    mimeType: string;
    storageKey: string | null;
    fdr?: { institutionId: string; fdrNumber: string };
    visualRegions?: DocumentVisualRegionDto[] | null;
  } | null = null;

  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: { fdr: true, visualRegions: true },
    });

    if (dbDoc) {
      docRecord = {
        id: dbDoc.id,
        fdrId: dbDoc.fdrId,
        fileName: dbDoc.fileName,
        mimeType: dbDoc.mimeType,
        storageKey: dbDoc.storageKey,
        fdr: {
          institutionId: dbDoc.fdr.institutionId,
          fdrNumber: dbDoc.fdr.fdrNumber,
        },
        visualRegions:
          dbDoc.visualRegions && dbDoc.visualRegions.length > 0
            ? dbDoc.visualRegions.map((vr) => ({
                id: vr.id,
                documentId: vr.documentId,
                candidateClass: vr.candidateClass as DocumentVisualRegionDto["candidateClass"],
                detectionMethod: vr.detectionMethod as DocumentVisualRegionDto["detectionMethod"],
                detectionStatus: vr.detectionStatus as DocumentVisualRegionDto["detectionStatus"],
                pageNumber: vr.pageNumber,
                confidenceScore: vr.confidenceScore,
                boundingBox: vr.boundingBoxJson ? JSON.parse(vr.boundingBoxJson) : null,
                anchorText: vr.anchorText,
                inkCharacteristics: vr.inkCharacteristics,
                limitations: vr.limitations || "",
                isVerifiedByReviewer: vr.isVerifiedByReviewer,
                reviewerRemarks: vr.reviewerRemarks,
                reviewedByUserId: vr.reviewedByUserId,
                reviewedAt: vr.reviewedAt?.toISOString() || null,
                analyzerVersion: vr.analyzerVersion,
                analyzedAt: vr.analyzedAt.toISOString(),
              }))
            : null,
      };
    }
  } catch {
    // Database offline
  }

  // Fallback: check in-memory uploaded documents
  if (!docRecord) {
    const inMemDoc = findInMemoryDocument(documentId);
    if (inMemDoc) {
      const syntheticFdr = getSyntheticFdrInstruments().find((f) => f.id === inMemDoc.fdrId);
      const inMemRegions = getInMemoryVisualRegions(documentId);
      docRecord = {
        id: inMemDoc.id,
        fdrId: inMemDoc.fdrId,
        fileName: inMemDoc.fileName,
        mimeType: inMemDoc.mimeType,
        storageKey: inMemDoc.storageKey,
        fdr: syntheticFdr
          ? { institutionId: syntheticFdr.institutionId, fdrNumber: syntheticFdr.fdrNumber }
          : { institutionId: "inst-synth-001", fdrNumber: inMemDoc.fdrId },
        visualRegions: inMemRegions || null,
      };
    }
  }

  if (!docRecord) {
    return NextResponse.json(
      { error: "Not Found", message: `Document '${documentId}' does not exist.` },
      { status: 404 }
    );
  }

  // 3. Enforce institutional authorization boundary
  const institutionId = docRecord.fdr?.institutionId || "inst-default";
  const authCheck = verifyFdrAccess(auth, institutionId);
  if (!authCheck.allowed) {
    return NextResponse.json(
      { error: "Forbidden", message: authCheck.reason },
      { status: 403 }
    );
  }

  // 4. Return cached regions if already present
  if (docRecord.visualRegions && docRecord.visualRegions.length > 0) {
    return NextResponse.json({
      success: true,
      source: "cache",
      disclaimer: SEAL_SIGNATURE_REGULATORY_DISCLAIMER,
      totalRegions: docRecord.visualRegions.length,
      detectedCount: docRecord.visualRegions.filter((r) => r.detectionStatus === "CANDIDATE_DETECTED").length,
      data: docRecord.visualRegions,
    });
  }

  // 5. On-demand detection from stored file and OCR words
  if (!docRecord.storageKey) {
    return NextResponse.json(
      { error: "Bad Request", message: "Document lacks storage key to read original document." },
      { status: 400 }
    );
  }

  const stored = await retrieveDocument(docRecord.storageKey);
  if (!stored) {
    return NextResponse.json(
      { error: "Not Found", message: "Document file not found in storage vault." },
      { status: 404 }
    );
  }

  // Retrieve OCR candidate words if available
  const ocrWords: Array<{ text: string; confidence: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }> = [];
  const inMemExtraction = getInMemoryExtraction(documentId);
  if (inMemExtraction && inMemExtraction.candidates) {
    for (const c of Object.values(inMemExtraction.candidates)) {
      if (c.rawValue && c.boundingBox) {
        ocrWords.push({
          text: c.rawValue,
          confidence: c.confidence,
          bbox: c.boundingBox,
        });
      }
    }
  }

  const detected = await detectSealAndSignatureRegions(
    documentId,
    stored.buffer,
    docRecord.mimeType,
    ocrWords
  );

  await persistDocumentVisualRegions(documentId, fdrId, detected);

  return NextResponse.json({
    success: true,
    source: "analysis",
    disclaimer: SEAL_SIGNATURE_REGULATORY_DISCLAIMER,
    totalRegions: detected.length,
    detectedCount: detected.filter((r) => r.detectionStatus === "CANDIDATE_DETECTED").length,
    data: detected,
  });
}
