import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { retrieveDocument } from "@/lib/storage/fdrStorage";
import {
  processDocumentOcr,
  persistDocumentExtraction,
  getInMemoryExtraction,
  REGULATORY_OCR_DISCLAIMER,
  OCR_ENGINE_NAME,
  OCR_ENGINE_VERSION,
} from "@/lib/fdr/ocrEngine";
import { findInMemoryDocument } from "@/lib/storage/documentRegistry";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";
import type { DocumentOcrExtractionResultDto } from "@/lib/fdr/types";

/**
 * GET /api/fdr/[fdrId]/documents/[documentId]/ocr
 * Retrieves true engine-extracted text, candidate FDR fields, and provenance.
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
      { error: "Unauthorized", message: "Valid authentication is required to inspect OCR extractions." },
      { status: 401 }
    );
  }

  // 2. Query document and extraction
  let institutionId: string | null = null;
  let storageKey: string | null = null;
  let mimeType: string = "application/pdf";

  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: {
        fdr: true,
        extractions: {
          include: { corrections: true },
        },
      },
    });

    if (dbDoc) {
      institutionId = dbDoc.fdr.institutionId;
      storageKey = dbDoc.storageKey;
      mimeType = dbDoc.mimeType;

      const authCheck = verifyFdrAccess(auth, institutionId);
      if (!authCheck.allowed) {
        return NextResponse.json(
          { error: "Forbidden", message: authCheck.reason },
          { status: 403 }
        );
      }

      if (dbDoc.extractions && dbDoc.extractions.length > 0) {
        const ext = dbDoc.extractions[0];
        const candidates = ext.provenanceJson ? JSON.parse(ext.provenanceJson) : {};
        const corrections = ext.corrections.map((c) => ({
          id: c.id,
          extractionId: c.extractionId,
          fieldName: c.fieldName,
          originalValue: c.originalValue,
          correctedValue: c.correctedValue,
          correctedByUserId: c.correctedByUserId,
          correctedByUserName: c.correctedByUserName,
          correctedByUserRole: c.correctedByUserRole,
          justification: c.justification,
          createdAt: c.createdAt.toISOString(),
        }));

        const resultDto: DocumentOcrExtractionResultDto = {
          id: ext.id,
          documentId: ext.documentId,
          extractedFdrNumber: ext.extractedFdrNumber,
          extractedAmount: ext.extractedAmount ? Number(ext.extractedAmount) : null,
          extractedBankName: ext.extractedBankName,
          extractedIfsc: ext.extractedIfsc,
          extractedIssueDate: ext.extractedIssueDate?.toISOString() || null,
          extractedMaturityDate: ext.extractedMaturityDate?.toISOString() || null,
          extractedInstitutionName: ext.extractedInstitutionName,
          confidenceScore: ext.confidenceScore,
          ocrEngine: ext.ocrEngine || OCR_ENGINE_NAME,
          ocrVersion: ext.ocrVersion || OCR_ENGINE_VERSION,
          processingDurationMs: ext.processingDurationMs || 0,
          extractedText: ext.rawExtractionJson ? (JSON.parse(ext.rawExtractionJson).text || "") : "",
          pageCount: 1,
          status: ext.status as "COMPLETED" | "PARTIAL" | "FAILED",
          candidates,
          corrections,
          createdAt: ext.createdAt.toISOString(),
        };

        return NextResponse.json({
          success: true,
          source: "database",
          documentId,
          fdrId,
          data: resultDto,
          regulatoryNotice: REGULATORY_OCR_DISCLAIMER,
        });
      }
    }
  } catch {
    // Database offline
  }

  // In-memory fallback
  const inMemDoc = findInMemoryDocument(documentId);
  if (inMemDoc) {
    storageKey = inMemDoc.storageKey;
    mimeType = inMemDoc.mimeType;
  }

  const syntheticFdr = getSyntheticFdrInstruments().find((i) => i.id === fdrId || i.fdrNumber === fdrId);
  if (syntheticFdr) {
    institutionId = syntheticFdr.institutionId;
  }

  if (institutionId) {
    const authCheck = verifyFdrAccess(auth, institutionId);
    if (!authCheck.allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: authCheck.reason },
        { status: 403 }
      );
    }
  }

  const cached = getInMemoryExtraction(documentId);
  if (cached) {
    return NextResponse.json({
      success: true,
      source: "memory_cache",
      documentId,
      fdrId,
      data: cached,
      regulatoryNotice: REGULATORY_OCR_DISCLAIMER,
    });
  }

  // On-the-fly execution if file in vault
  if (storageKey) {
    try {
      const fileData = await retrieveDocument(storageKey);
      if (fileData) {
        const ocrResult = await processDocumentOcr(documentId, fileData.buffer, mimeType);
        await persistDocumentExtraction(documentId, ocrResult);

        return NextResponse.json({
          success: true,
          source: "on_the_fly_vault_ocr",
          documentId,
          fdrId,
          data: ocrResult,
          regulatoryNotice: REGULATORY_OCR_DISCLAIMER,
        });
      }
    } catch {
      // Storage error
    }
  }

  return NextResponse.json(
    { error: "Not Found", message: `No OCR extractions found for document '${documentId}'.` },
    { status: 404 }
  );
}

/**
 * POST /api/fdr/[fdrId]/documents/[documentId]/ocr
 * Triggers on-demand re-OCR from stored vault file with audit logging.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ fdrId: string; documentId: string }> }
) {
  const { fdrId, documentId } = await context.params;

  // 1. Authenticate user
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid authentication is required to trigger OCR reprocessing." },
      { status: 401 }
    );
  }

  let institutionId: string | null = null;
  let storageKey: string | null = null;
  let mimeType: string = "application/pdf";
  let fdrNumber = fdrId;

  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: { fdr: true },
    });

    if (dbDoc) {
      institutionId = dbDoc.fdr.institutionId;
      storageKey = dbDoc.storageKey;
      mimeType = dbDoc.mimeType;
      fdrNumber = dbDoc.fdr.fdrNumber;
    }
  } catch {
    // Database offline
  }

  if (!institutionId) {
    const inMemDoc = findInMemoryDocument(documentId);
    if (inMemDoc) {
      storageKey = inMemDoc.storageKey;
      mimeType = inMemDoc.mimeType;
    }
    const syntheticFdr = getSyntheticFdrInstruments().find((i) => i.id === fdrId || i.fdrNumber === fdrId);
    if (syntheticFdr) {
      institutionId = syntheticFdr.institutionId;
      fdrNumber = syntheticFdr.fdrNumber;
    }
  }

  if (!institutionId) {
    return NextResponse.json(
      { error: "Not Found", message: `Document '${documentId}' or associated FDR was not found.` },
      { status: 404 }
    );
  }

  const authCheck = verifyFdrAccess(auth, institutionId);
  if (!authCheck.allowed) {
    return NextResponse.json(
      { error: "Forbidden", message: authCheck.reason },
      { status: 403 }
    );
  }

  if (!storageKey) {
    return NextResponse.json(
      { error: "Precondition Failed", message: "Physical file is not stored in vault storage." },
      { status: 412 }
    );
  }

  const fileData = await retrieveDocument(storageKey);
  if (!fileData) {
    return NextResponse.json(
      { error: "File Missing", message: "Document could not be retrieved from private vault." },
      { status: 404 }
    );
  }

  const ocrResult = await processDocumentOcr(documentId, fileData.buffer, mimeType);
  await persistDocumentExtraction(documentId, ocrResult);

  try {
    await prisma.fdrAuditLog.create({
      data: {
        fdrId,
        institutionId,
        actorId: auth.userId,
        actorName: auth.userName,
        actorRole: auth.userRole,
        action: "DOCUMENT_OCR_REPROCESSED",
        entityType: "FDR_DOCUMENT",
        entityId: documentId,
        detailsJson: JSON.stringify({
          fdrNumber,
          ocrEngine: ocrResult.ocrEngine,
          confidenceScore: ocrResult.confidenceScore,
          durationMs: ocrResult.processingDurationMs,
        }),
      },
    });
  } catch {
    // Fail log gracefully
  }

  return NextResponse.json({
    success: true,
    reprocessed: true,
    documentId,
    fdrId,
    data: ocrResult,
    regulatoryNotice: REGULATORY_OCR_DISCLAIMER,
  });
}
