import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { retrieveDocument, computeSha256 } from "@/lib/storage/fdrStorage";
import { findInMemoryDocument } from "@/lib/storage/documentRegistry";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";

/**
 * GET /api/fdr/[fdrId]/documents/[documentId]/download
 * Streams an authorized document directly from the private storage vault
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
      { error: "Unauthorized", message: "Valid authentication is required to download documents." },
      { status: 401 }
    );
  }

  // 2. Query document record
  let docRecord: {
    id: string;
    fdrId: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    storageKey: string | null;
    sha256Checksum: string | null;
    fdr?: { institutionId: string; fdrNumber: string };
  } | null = null;

  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: { fdr: true },
    });

    if (dbDoc) {
      docRecord = {
        id: dbDoc.id,
        fdrId: dbDoc.fdrId,
        fileName: dbDoc.fileName,
        mimeType: dbDoc.mimeType,
        fileSizeBytes: dbDoc.fileSizeBytes,
        storageKey: dbDoc.storageKey,
        sha256Checksum: dbDoc.sha256Checksum,
        fdr: {
          institutionId: dbDoc.fdr.institutionId,
          fdrNumber: dbDoc.fdr.fdrNumber,
        },
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
      docRecord = {
        id: inMemDoc.id,
        fdrId: inMemDoc.fdrId,
        fileName: inMemDoc.fileName,
        mimeType: inMemDoc.mimeType,
        fileSizeBytes: inMemDoc.fileSizeBytes,
        storageKey: inMemDoc.storageKey,
        sha256Checksum: inMemDoc.sha256Checksum,
        fdr: syntheticFdr
          ? { institutionId: syntheticFdr.institutionId, fdrNumber: syntheticFdr.fdrNumber }
          : { institutionId: "inst-synth-001", fdrNumber: inMemDoc.fdrId },
      };
    }
  }

  if (!docRecord) {
    return NextResponse.json(
      { error: "Not Found", message: `Document '${documentId}' does not exist.` },
      { status: 404 }
    );
  }

  // Verify that document belongs to requested FDR instrument
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

  // 4. Retrieve file from private storage
  if (!docRecord.storageKey) {
    return NextResponse.json(
      { error: "Storage Unlinked", message: "This document record does not have an attached physical vault file." },
      { status: 404 }
    );
  }

  const storageFile = await retrieveDocument(docRecord.storageKey);
  if (!storageFile) {
    return NextResponse.json(
      { error: "File Missing", message: "Physical document is missing from the secure vault." },
      { status: 404 }
    );
  }

  // 5. Cryptographic checksum integrity verification
  if (docRecord.sha256Checksum && storageFile.checksum !== docRecord.sha256Checksum) {
    return NextResponse.json(
      {
        error: "Integrity Violation",
        message: "Security Alert: Stored file checksum does not match registered cryptographic signature.",
      },
      { status: 500 }
    );
  }

  // 6. Stream file with strict security headers
  const sanitizedDispositionName = docRecord.fileName.replace(/["\r\n]/g, "");

  const headers = new Headers();
  headers.set("Content-Type", docRecord.mimeType);
  headers.set("Content-Length", storageFile.size.toString());
  headers.set("Content-Disposition", `inline; filename="${sanitizedDispositionName}"`);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return new NextResponse(new Uint8Array(storageFile.buffer), {
    status: 200,
    headers,
  });
}
