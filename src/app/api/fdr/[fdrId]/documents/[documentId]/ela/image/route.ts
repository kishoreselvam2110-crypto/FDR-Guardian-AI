import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { retrieveDocument } from "@/lib/storage/fdrStorage";
import { getInMemoryElaResult } from "@/lib/fdr/elaAndLayoutAnalyzer";
import { findInMemoryDocument } from "@/lib/storage/documentRegistry";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";

/**
 * GET /api/fdr/[fdrId]/documents/[documentId]/ela/image
 * Streams the generated ELA diagnostic heatmap image directly from private vault storage.
 * Enforces identical institutional boundary authorization checks as original FDR documents.
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
      { error: "Unauthorized", message: "Valid authentication is required to access diagnostic images." },
      { status: 401 }
    );
  }

  // 2. Query document and diagnostic storage key
  let docRecord: {
    id: string;
    fdrId: string;
    diagnosticStorageKey: string | null;
    fdr?: { institutionId: string; fdrNumber: string };
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
        diagnosticStorageKey: dbDoc.elaResult?.diagnosticStorageKey || null,
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
      const inMemEla = getInMemoryElaResult(documentId);
      docRecord = {
        id: inMemDoc.id,
        fdrId: inMemDoc.fdrId,
        diagnosticStorageKey: inMemEla?.diagnosticStorageKey || null,
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

  // 3. Enforce institutional authorization boundary
  const institutionId = docRecord.fdr?.institutionId || "inst-default";
  const authCheck = verifyFdrAccess(auth, institutionId);
  if (!authCheck.allowed) {
    return NextResponse.json(
      { error: "Forbidden", message: authCheck.reason },
      { status: 403 }
    );
  }

  if (!docRecord.diagnosticStorageKey) {
    return NextResponse.json(
      {
        error: "Not Found",
        message: "Diagnostic ELA image has not been generated or is not available for this document.",
      },
      { status: 404 }
    );
  }

  // 4. Retrieve diagnostic image buffer from private storage
  const stored = await retrieveDocument(docRecord.diagnosticStorageKey);
  if (!stored) {
    return NextResponse.json(
      { error: "Not Found", message: "Diagnostic image file not found in vault storage." },
      { status: 404 }
    );
  }

  // 5. Stream image buffer with secure headers
  const headers = new Headers();
  headers.set("Content-Type", "image/png");
  headers.set("Content-Length", stored.size.toString());
  headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(new Uint8Array(stored.buffer), {
    status: 200,
    headers,
  });
}
