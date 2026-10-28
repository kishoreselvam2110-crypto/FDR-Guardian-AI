import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import {
  analyzeTextLayoutConsistency,
  persistDocumentLayoutFindings,
  getInMemoryLayoutFindings,
  ELA_ANALYZER_VERSION,
} from "@/lib/fdr/elaAndLayoutAnalyzer";
import { getInMemoryExtraction } from "@/lib/fdr/ocrEngine";
import { findInMemoryDocument } from "@/lib/storage/documentRegistry";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";
import { ELA_REGULATORY_DISCLAIMER } from "@/lib/fdr/types";
import type { LayoutAnomalyFindingDto } from "@/lib/fdr/types";

/**
 * GET /api/fdr/[fdrId]/documents/[documentId]/layout
 * Returns text-layout consistency findings (baseline variance, font height jumps, text collisions)
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
      { error: "Unauthorized", message: "Valid authentication is required to view layout findings." },
      { status: 401 }
    );
  }

  // 2. Query document and layout findings
  let docRecord: {
    id: string;
    fdrId: string;
    fileName: string;
    mimeType: string;
    storageKey: string | null;
    fdr?: { institutionId: string; fdrNumber: string };
    layoutFindings?: LayoutAnomalyFindingDto[] | null;
  } | null = null;

  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: { fdr: true, layoutFindings: true },
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
        layoutFindings:
          dbDoc.layoutFindings && dbDoc.layoutFindings.length > 0
            ? dbDoc.layoutFindings.map((lf) => ({
                id: lf.id,
                documentId: lf.documentId,
                anomalyType: lf.anomalyType as LayoutAnomalyFindingDto["anomalyType"],
                pageNumber: lf.pageNumber,
                severity: lf.severity as LayoutAnomalyFindingDto["severity"],
                fieldName: lf.fieldName,
                observedValue: lf.observedValue,
                thresholdApplied: lf.thresholdApplied,
                boundingBox: lf.boundingBoxJson ? JSON.parse(lf.boundingBoxJson) : null,
                explanation: lf.explanation,
                recommendedAction: lf.recommendedAction,
                analyzerVersion: lf.analyzerVersion,
                analyzedAt: lf.analyzedAt.toISOString(),
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
      const inMemFindings = getInMemoryLayoutFindings(documentId);
      docRecord = {
        id: inMemDoc.id,
        fdrId: inMemDoc.fdrId,
        fileName: inMemDoc.fileName,
        mimeType: inMemDoc.mimeType,
        storageKey: inMemDoc.storageKey,
        fdr: syntheticFdr
          ? { institutionId: syntheticFdr.institutionId, fdrNumber: syntheticFdr.fdrNumber }
          : { institutionId: "inst-synth-001", fdrNumber: inMemDoc.fdrId },
        layoutFindings: inMemFindings || null,
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

  // 4. Return cached findings if present
  if (docRecord.layoutFindings && docRecord.layoutFindings.length > 0) {
    return NextResponse.json({
      success: true,
      source: "cache",
      disclaimer: ELA_REGULATORY_DISCLAIMER,
      totalFindings: docRecord.layoutFindings.length,
      warningCount: docRecord.layoutFindings.filter((f) => f.severity === "WARNING").length,
      data: docRecord.layoutFindings,
    });
  }

  // 5. On-demand analysis from OCR provenance/extractions
  let words: Array<{ text: string; confidence: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }> = [];

  const inMemExtraction = getInMemoryExtraction(documentId);
  if (inMemExtraction && inMemExtraction.candidates) {
    // Extract available bounding boxes from candidates
    for (const candidate of Object.values(inMemExtraction.candidates)) {
      if (candidate.boundingBox && candidate.rawValue) {
        words.push({
          text: candidate.rawValue,
          confidence: candidate.confidence,
          bbox: candidate.boundingBox,
        });
      }
    }
  }

  const findings = await analyzeTextLayoutConsistency(
    documentId,
    words,
    docRecord.mimeType
  );

  await persistDocumentLayoutFindings(documentId, fdrId, findings);

  return NextResponse.json({
    success: true,
    source: "analysis",
    disclaimer: ELA_REGULATORY_DISCLAIMER,
    totalFindings: findings.length,
    warningCount: findings.filter((f) => f.severity === "WARNING").length,
    data: findings,
  });
}
