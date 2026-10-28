import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { recordFieldCorrection } from "@/lib/fdr/ocrEngine";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";

/**
 * POST /api/fdr/[fdrId]/documents/[documentId]/corrections
 * Allows authorized reviewers to submit manual corrections to OCR candidate fields
 * with a mandatory justification, preserving original values and creating an audit record.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ fdrId: string; documentId: string }> }
) {
  const { fdrId, documentId } = await context.params;

  // 1. Authenticate reviewer
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid authentication is required to submit field corrections." },
      { status: 401 }
    );
  }

  // 2. Parse request body
  let body: {
    fieldName?: string;
    correctedValue?: string;
    justification?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "Invalid JSON body in request." },
      { status: 400 }
    );
  }

  const { fieldName, correctedValue, justification } = body;

  const validFields = ["fdrNumber", "amount", "bankName", "issueDate", "maturityDate", "ifsc"];
  if (!fieldName || !validFields.includes(fieldName)) {
    return NextResponse.json(
      { error: "Bad Request", message: `Invalid fieldName. Supported: ${validFields.join(", ")}` },
      { status: 400 }
    );
  }

  if (correctedValue === undefined || correctedValue === null || String(correctedValue).trim() === "") {
    return NextResponse.json(
      { error: "Bad Request", message: "Missing required 'correctedValue'." },
      { status: 400 }
    );
  }

  if (!justification || justification.trim().length < 5) {
    return NextResponse.json(
      { error: "Bad Request", message: "A substantive 'justification' (minimum 5 characters) is required for audit compliance." },
      { status: 400 }
    );
  }

  // 3. Resolve institution & extraction ID
  let institutionId: string | null = null;
  let extractionId = `ocr_${documentId}`;

  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: {
        fdr: true,
        extractions: true,
      },
    });

    if (dbDoc) {
      institutionId = dbDoc.fdr.institutionId;
      if (dbDoc.extractions && dbDoc.extractions.length > 0) {
        extractionId = dbDoc.extractions[0].id;
      }
    }
  } catch {
    // Database offline
  }

  if (!institutionId) {
    const syntheticFdr = getSyntheticFdrInstruments().find((i) => i.id === fdrId || i.fdrNumber === fdrId);
    if (syntheticFdr) {
      institutionId = syntheticFdr.institutionId;
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

  // 4. Record correction
  const correction = await recordFieldCorrection(
    extractionId,
    fdrId,
    institutionId,
    fieldName,
    String(correctedValue).trim(),
    {
      userId: auth.userId,
      userName: auth.userName,
      userRole: auth.userRole,
    },
    justification.trim()
  );

  return NextResponse.json({
    success: true,
    message: `Field '${fieldName}' corrected successfully with justification recorded.`,
    data: correction,
  });
}
