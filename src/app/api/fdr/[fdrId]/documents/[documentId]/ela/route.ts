import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { retrieveDocument } from "@/lib/storage/fdrStorage";
import {
  performErrorLevelAnalysis,
  persistDocumentElaResult,
  getInMemoryElaResult,
  ELA_ANALYZER_VERSION,
} from "@/lib/fdr/elaAndLayoutAnalyzer";
import { findInMemoryDocument } from "@/lib/storage/documentRegistry";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";
import { ELA_REGULATORY_DISCLAIMER } from "@/lib/fdr/types";
import type { DocumentElaResultDto } from "@/lib/fdr/types";

/**
 * GET /api/fdr/[fdrId]/documents/[documentId]/ela
 * Returns Error Level Analysis (ELA) metrics, recompression settings, and explainable findings
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
      { error: "Unauthorized", message: "Valid authentication is required to view ELA diagnostics." },
      { status: 401 }
    );
  }

  // 2. Query document and ELA result
  let docRecord: {
    id: string;
    fdrId: string;
    fileName: string;
    mimeType: string;
    storageKey: string | null;
    fdr?: { institutionId: string; fdrNumber: string };
    elaResult?: DocumentElaResultDto | null;
  } | null = null;

  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: { fdr: true, elaResult: true },
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
        elaResult: dbDoc.elaResult
          ? {
              id: dbDoc.elaResult.id,
              documentId: dbDoc.elaResult.documentId,
              recompressionQuality: dbDoc.elaResult.recompressionQuality,
              averageErrorLevel: dbDoc.elaResult.averageErrorLevel,
              peakError: dbDoc.elaResult.peakError,
              highDiscrepancyRatio: dbDoc.elaResult.highDiscrepancyRatio,
              diagnosticStorageKey: dbDoc.elaResult.diagnosticStorageKey,
              diagnosticImageUrl: dbDoc.elaResult.diagnosticStorageKey
                ? `/api/fdr/${fdrId}/documents/${documentId}/ela/image`
                : null,
              formatType: dbDoc.elaResult.formatType as DocumentElaResultDto["formatType"],
              status: dbDoc.elaResult.status as DocumentElaResultDto["status"],
              findings: dbDoc.elaResult.findingsJson
                ? JSON.parse(dbDoc.elaResult.findingsJson)
                : [],
              analyzerVersion: dbDoc.elaResult.analyzerVersion,
              analyzedAt: dbDoc.elaResult.analyzedAt.toISOString(),
            }
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
      const inMemEla = getInMemoryElaResult(documentId);
      docRecord = {
        id: inMemDoc.id,
        fdrId: inMemDoc.fdrId,
        fileName: inMemDoc.fileName,
        mimeType: inMemDoc.mimeType,
        storageKey: inMemDoc.storageKey,
        fdr: syntheticFdr
          ? { institutionId: syntheticFdr.institutionId, fdrNumber: syntheticFdr.fdrNumber }
          : { institutionId: "inst-synth-001", fdrNumber: inMemDoc.fdrId },
        elaResult: inMemEla || null,
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

  // 4. Return cached ELA result if already analyzed
  if (docRecord.elaResult) {
    return NextResponse.json({
      success: true,
      source: "cache",
      disclaimer: ELA_REGULATORY_DISCLAIMER,
      data: docRecord.elaResult,
    });
  }

  // 5. On-demand ELA analysis if not yet performed
  if (!docRecord.storageKey) {
    return NextResponse.json(
      { error: "Bad Request", message: "Document lacks private storage key to read original image." },
      { status: 400 }
    );
  }

  const stored = await retrieveDocument(docRecord.storageKey);
  if (!stored) {
    return NextResponse.json(
      { error: "Not Found", message: "Document file not found in private storage vault." },
      { status: 404 }
    );
  }

  const result = await performErrorLevelAnalysis(
    documentId,
    stored.buffer,
    docRecord.mimeType,
    { fdrId }
  );

  await persistDocumentElaResult(documentId, fdrId, result);

  return NextResponse.json({
    success: true,
    source: "analysis",
    disclaimer: ELA_REGULATORY_DISCLAIMER,
    data: result,
  });
}
