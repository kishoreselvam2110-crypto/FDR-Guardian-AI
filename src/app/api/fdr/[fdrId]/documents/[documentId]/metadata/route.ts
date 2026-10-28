import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { retrieveDocument } from "@/lib/storage/fdrStorage";
import {
  analyzeDocumentMetadata,
  persistDocumentMetadata,
  getInMemoryMetadata,
  ANALYZER_VERSION,
} from "@/lib/fdr/metadataAnalyzer";
import { findInMemoryDocument } from "@/lib/storage/documentRegistry";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";
import type { DocumentMetadataDto } from "@/lib/fdr/types";

/**
 * GET /api/fdr/[fdrId]/documents/[documentId]/metadata
 * Returns forensic metadata and explainable indicator findings for an authorized document
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
      { error: "Unauthorized", message: "Valid authentication is required to view document metadata." },
      { status: 401 }
    );
  }

  // 2. Query document and metadata
  let docRecord: {
    id: string;
    fdrId: string;
    fileName: string;
    mimeType: string;
    storageKey: string | null;
    fdr?: { institutionId: string; fdrNumber: string };
    metadata?: DocumentMetadataDto | null;
  } | null = null;

  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: { fdr: true, metadata: true },
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
        metadata: dbDoc.metadata
          ? {
              id: dbDoc.metadata.id,
              documentId: dbDoc.metadata.documentId,
              software: dbDoc.metadata.software,
              producer: dbDoc.metadata.producer,
              creator: dbDoc.metadata.creator,
              cameraMake: dbDoc.metadata.cameraMake,
              cameraModel: dbDoc.metadata.cameraModel,
              creationDate: dbDoc.metadata.creationDate?.toISOString() || null,
              modificationDate: dbDoc.metadata.modificationDate?.toISOString() || null,
              pageCount: dbDoc.metadata.pageCount,
              imageWidth: dbDoc.metadata.imageWidth,
              imageHeight: dbDoc.metadata.imageHeight,
              analyzerVersion: dbDoc.metadata.analyzerVersion,
              rawMetadata: dbDoc.metadata.rawMetadataJson
                ? JSON.parse(dbDoc.metadata.rawMetadataJson)
                : null,
              findings: dbDoc.metadata.findingsJson
                ? JSON.parse(dbDoc.metadata.findingsJson)
                : [],
              status: dbDoc.metadata.status as "PENDING" | "COMPLETED" | "FAILED",
              analyzedAt: dbDoc.metadata.analyzedAt.toISOString(),
            }
          : null,
      };
    }
  } catch {
    // Database offline
  }

  // Fallback: check in-memory store
  if (!docRecord) {
    const inMemDoc = findInMemoryDocument(documentId);
    if (inMemDoc) {
      const syntheticFdr = getSyntheticFdrInstruments().find((f) => f.id === inMemDoc.fdrId);
      const inMemMeta = getInMemoryMetadata(documentId);

      docRecord = {
        id: inMemDoc.id,
        fdrId: inMemDoc.fdrId,
        fileName: inMemDoc.fileName,
        mimeType: inMemDoc.mimeType,
        storageKey: inMemDoc.storageKey,
        fdr: syntheticFdr
          ? { institutionId: syntheticFdr.institutionId, fdrNumber: syntheticFdr.fdrNumber }
          : { institutionId: "inst-synth-001", fdrNumber: inMemDoc.fdrId },
        metadata: inMemMeta || null,
      };
    }
  }

  if (!docRecord) {
    return NextResponse.json(
      { error: "Not Found", message: `Document '${documentId}' does not exist.` },
      { status: 404 }
    );
  }

  if (docRecord.fdrId !== fdrId) {
    return NextResponse.json(
      { error: "Bad Request", message: `Document '${documentId}' does not belong to FDR '${fdrId}'.` },
      { status: 400 }
    );
  }

  // 3. Enforce institutional access control
  const fdrInstitutionId = docRecord.fdr?.institutionId || "UNKNOWN";
  const authCheck = verifyFdrAccess(auth, fdrInstitutionId);
  if (!authCheck.allowed) {
    return NextResponse.json(
      { error: "Forbidden", message: authCheck.reason },
      { status: 403 }
    );
  }

  // 4. If metadata already exists and matches current version, return it
  if (docRecord.metadata && docRecord.metadata.analyzerVersion === ANALYZER_VERSION) {
    return NextResponse.json({
      success: true,
      documentId,
      fdrId,
      metadata: docRecord.metadata,
    });
  }

  // 5. On-the-fly analysis if metadata missing but file exists in storage vault
  if (!docRecord.storageKey) {
    return NextResponse.json(
      {
        error: "Storage Unlinked",
        message: "No physical vault file attached to this document record.",
      },
      { status: 404 }
    );
  }

  const storageFile = await retrieveDocument(docRecord.storageKey);
  if (!storageFile) {
    return NextResponse.json(
      { error: "File Missing", message: "Physical document is missing from vault storage." },
      { status: 404 }
    );
  }

  const analysis = await analyzeDocumentMetadata(documentId, storageFile.buffer, docRecord.mimeType);
  await persistDocumentMetadata(documentId, fdrId, analysis);

  return NextResponse.json({
    success: true,
    documentId,
    fdrId,
    metadata: analysis.metadata,
  });
}

/**
 * POST /api/fdr/[fdrId]/documents/[documentId]/metadata
 * Forces an on-demand re-analysis of document metadata and updates findings
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ fdrId: string; documentId: string }> }
) {
  const { fdrId, documentId } = await context.params;

  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid authentication is required." },
      { status: 401 }
    );
  }

  // Locate document storage key
  let storageKey: string | null = null;
  let mimeType: string = "application/pdf";
  let fdrInstitutionId: string = "UNKNOWN";

  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: { fdr: true },
    });
    if (dbDoc) {
      storageKey = dbDoc.storageKey;
      mimeType = dbDoc.mimeType;
      fdrInstitutionId = dbDoc.fdr.institutionId;
    }
  } catch {
    // DB offline
  }

  if (!storageKey) {
    const inMemDoc = findInMemoryDocument(documentId);
    if (inMemDoc) {
      storageKey = inMemDoc.storageKey;
      mimeType = inMemDoc.mimeType;
      const syntheticFdr = getSyntheticFdrInstruments().find((f) => f.id === inMemDoc.fdrId);
      fdrInstitutionId = syntheticFdr?.institutionId || "inst-synth-001";
    }
  }

  if (!storageKey) {
    return NextResponse.json(
      { error: "Not Found", message: `Document '${documentId}' or physical vault file not found.` },
      { status: 404 }
    );
  }

  const authCheck = verifyFdrAccess(auth, fdrInstitutionId);
  if (!authCheck.allowed) {
    return NextResponse.json({ error: "Forbidden", message: authCheck.reason }, { status: 403 });
  }

  const storageFile = await retrieveDocument(storageKey);
  if (!storageFile) {
    return NextResponse.json(
      { error: "File Missing", message: "Physical document is missing from vault storage." },
      { status: 404 }
    );
  }

  const analysis = await analyzeDocumentMetadata(documentId, storageFile.buffer, mimeType);
  await persistDocumentMetadata(documentId, fdrId, analysis);

  // Record audit log for re-analysis
  try {
    await prisma.fdrAuditLog.create({
      data: {
        fdrId,
        institutionId: fdrInstitutionId,
        actorId: auth.userId,
        actorName: auth.userName,
        actorRole: auth.userRole,
        action: "DOCUMENT_METADATA_REANALYZED",
        entityType: "FDR_DOCUMENT",
        entityId: documentId,
        detailsJson: JSON.stringify({
          analyzerVersion: ANALYZER_VERSION,
          findingsCount: analysis.findings.length,
          reanalyzedAt: new Date().toISOString(),
        }),
      },
    });
  } catch {
    // DB offline fallback
  }

  return NextResponse.json({
    success: true,
    message: "Document metadata re-analyzed successfully.",
    metadata: analysis.metadata,
  });
}
