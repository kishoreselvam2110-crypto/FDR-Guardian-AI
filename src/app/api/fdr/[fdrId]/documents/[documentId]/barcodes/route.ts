import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { retrieveDocument } from "@/lib/storage/fdrStorage";
import {
  extractAndValidateBarcodes,
  persistDocumentBarcodes,
  getInMemoryBarcodes,
  REGULATORY_AUTHENTICITY_DISCLAIMER,
  ANALYZER_VERSION,
} from "@/lib/fdr/barcodeAnalyzer";
import { findInMemoryDocument } from "@/lib/storage/documentRegistry";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";
import type { DocumentBarcodeDto, FdrInstrumentDto } from "@/lib/fdr/types";

/**
 * GET /api/fdr/[fdrId]/documents/[documentId]/barcodes
 * Retrieves decoded 2D QR codes and 1D barcodes with deterministic cross-validation records.
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
      { error: "Unauthorized", message: "Valid authentication is required to inspect barcode cross-validation data." },
      { status: 401 }
    );
  }

  // 2. Query document and FDR context
  let institutionId: string | null = null;
  let fdrContext: Partial<FdrInstrumentDto> | null = null;
  let storageKey: string | null = null;
  let mimeType: string = "application/pdf";

  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: { fdr: true, barcodes: true },
    });

    if (dbDoc) {
      institutionId = dbDoc.fdr.institutionId;
      storageKey = dbDoc.storageKey;
      mimeType = dbDoc.mimeType;
      fdrContext = {
        id: dbDoc.fdr.id,
        fdrNumber: dbDoc.fdr.fdrNumber,
        bankName: dbDoc.fdr.bankName,
        amount: Number(dbDoc.fdr.amount),
        issueDate: dbDoc.fdr.issueDate.toISOString(),
        maturityDate: dbDoc.fdr.maturityDate.toISOString(),
      };

      // Institutional boundary check
      const authCheck = verifyFdrAccess(auth, institutionId);
      if (!authCheck.allowed) {
        return NextResponse.json(
          { error: "Forbidden", message: authCheck.reason },
          { status: 403 }
        );
      }

      if (dbDoc.barcodes && dbDoc.barcodes.length > 0) {
        const barcodesDto: DocumentBarcodeDto[] = dbDoc.barcodes.map((b) => ({
          id: b.id,
          documentId: b.documentId,
          fdrId: b.fdrId,
          barcodeType: b.barcodeType,
          rawPayload: b.rawPayload,
          pageNumber: b.pageNumber,
          schemaType: b.schemaType,
          extractedFdrNumber: b.extractedFdrNumber,
          extractedAmount: b.extractedAmount ? Number(b.extractedAmount) : null,
          extractedBankName: b.extractedBankName,
          extractedIssueDate: b.extractedIssueDate?.toISOString() || null,
          extractedMaturityDate: b.extractedMaturityDate?.toISOString() || null,
          parsedFields: b.parsedFieldsJson ? JSON.parse(b.parsedFieldsJson) : {},
          comparisons: b.comparisonsJson ? JSON.parse(b.comparisonsJson) : [],
          validationStatus: b.validationStatus as DocumentBarcodeDto["validationStatus"],
          hasMismatch: b.hasMismatch,
          analyzerVersion: b.analyzerVersion,
          analyzedAt: b.analyzedAt.toISOString(),
        }));

        return NextResponse.json({
          success: true,
          source: "database",
          documentId,
          fdrId,
          count: barcodesDto.length,
          data: barcodesDto,
          authenticityNotice: REGULATORY_AUTHENTICITY_DISCLAIMER,
        });
      }
    }
  } catch {
    // Database offline fallback
  }

  // Check in-memory fallback
  const inMemDoc = findInMemoryDocument(documentId);
  if (inMemDoc) {
    storageKey = inMemDoc.storageKey;
    mimeType = inMemDoc.mimeType;
  }

  const syntheticFdr = getSyntheticFdrInstruments().find((i) => i.id === fdrId || i.fdrNumber === fdrId);
  if (syntheticFdr) {
    institutionId = syntheticFdr.institutionId;
    fdrContext = syntheticFdr;
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

  const cachedBarcodes = getInMemoryBarcodes(documentId);
  if (cachedBarcodes.length > 0) {
    return NextResponse.json({
      success: true,
      source: "memory_cache",
      documentId,
      fdrId,
      count: cachedBarcodes.length,
      data: cachedBarcodes,
      authenticityNotice: REGULATORY_AUTHENTICITY_DISCLAIMER,
    });
  }

  // On-the-fly extraction if vault storage file exists
  if (storageKey) {
    try {
      const fileData = await retrieveDocument(storageKey);
      if (fileData) {
        const barcodes = await extractAndValidateBarcodes(
          documentId,
          fdrId,
          fileData.buffer,
          mimeType,
          fdrContext
        );
        await persistDocumentBarcodes(documentId, fdrId, barcodes);

        return NextResponse.json({
          success: true,
          source: "on_the_fly_vault_analysis",
          documentId,
          fdrId,
          count: barcodes.length,
          data: barcodes,
          authenticityNotice: REGULATORY_AUTHENTICITY_DISCLAIMER,
        });
      }
    } catch {
      // Storage retrieval error
    }
  }

  return NextResponse.json(
    {
      error: "Not Found",
      message: `No barcode cross-validation data found for document '${documentId}'.`,
    },
    { status: 404 }
  );
}

/**
 * POST /api/fdr/[fdrId]/documents/[documentId]/barcodes
 * Triggers on-demand re-extraction and cross-validation for an authorized document.
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
      { error: "Unauthorized", message: "Valid authentication is required to trigger barcode re-analysis." },
      { status: 401 }
    );
  }

  let institutionId: string | null = null;
  let storageKey: string | null = null;
  let mimeType: string = "application/pdf";
  let fdrNumber = fdrId;
  let fdrContext: Partial<FdrInstrumentDto> | null = null;

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
      fdrContext = {
        id: dbDoc.fdr.id,
        fdrNumber: dbDoc.fdr.fdrNumber,
        bankName: dbDoc.fdr.bankName,
        amount: Number(dbDoc.fdr.amount),
        issueDate: dbDoc.fdr.issueDate.toISOString(),
        maturityDate: dbDoc.fdr.maturityDate.toISOString(),
      };
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
      fdrContext = syntheticFdr;
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

  const barcodes = await extractAndValidateBarcodes(
    documentId,
    fdrId,
    fileData.buffer,
    mimeType,
    fdrContext
  );

  await persistDocumentBarcodes(documentId, fdrId, barcodes);

  try {
    await prisma.fdrAuditLog.create({
      data: {
        fdrId,
        institutionId,
        actorId: auth.userId,
        actorName: auth.userName,
        actorRole: auth.userRole,
        action: "DOCUMENT_BARCODE_REANALYZED",
        entityType: "FDR_DOCUMENT",
        entityId: documentId,
        detailsJson: JSON.stringify({
          fdrNumber,
          analyzerVersion: ANALYZER_VERSION,
          barcodesDetectedCount: barcodes.filter((b) => b.barcodeType !== "NONE").length,
          validationStatus: barcodes[0]?.validationStatus || "NO_CODES",
          hasMismatch: barcodes.some((b) => b.hasMismatch),
        }),
      },
    });
  } catch {
    // Fail log gracefully
  }

  return NextResponse.json({
    success: true,
    reanalyzed: true,
    documentId,
    fdrId,
    count: barcodes.length,
    data: barcodes,
    authenticityNotice: REGULATORY_AUTHENTICITY_DISCLAIMER,
  });
}
