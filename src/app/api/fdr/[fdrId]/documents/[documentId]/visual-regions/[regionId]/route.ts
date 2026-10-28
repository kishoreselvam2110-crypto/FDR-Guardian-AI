import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { updateVisualRegionReview } from "@/lib/fdr/sealAndSignatureDetector";
import { findInMemoryDocument } from "@/lib/storage/documentRegistry";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";

/**
 * PATCH /api/fdr/[fdrId]/documents/[documentId]/visual-regions/[regionId]
 * Allows scrutiny officers to record manual review decisions on candidate seal/signature regions
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ fdrId: string; documentId: string; regionId: string }> }
) {
  const { fdrId, documentId, regionId } = await context.params;

  // 1. Authenticate user
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication is required to review visual regions." },
      { status: 401 }
    );
  }

  // 2. Query document to verify authorization
  let fdrInstitutionId: string | null = null;
  try {
    const dbDoc = await prisma.fdrDocument.findUnique({
      where: { id: documentId },
      include: { fdr: true },
    });
    if (dbDoc) {
      fdrInstitutionId = dbDoc.fdr.institutionId;
    }
  } catch {
    // Database offline
  }

  if (!fdrInstitutionId) {
    const inMemDoc = findInMemoryDocument(documentId);
    if (inMemDoc) {
      const synthFdr = getSyntheticFdrInstruments().find((f) => f.id === inMemDoc.fdrId);
      fdrInstitutionId = synthFdr?.institutionId || "inst-synth-001";
    }
  }

  if (!fdrInstitutionId) {
    return NextResponse.json(
      { error: "Not Found", message: `Document '${documentId}' does not exist.` },
      { status: 404 }
    );
  }

  const authCheck = verifyFdrAccess(auth, fdrInstitutionId);
  if (!authCheck.allowed) {
    return NextResponse.json(
      { error: "Forbidden", message: authCheck.reason },
      { status: 403 }
    );
  }

  // 3. Parse reviewer payload
  let body: { isVerified?: boolean; remarks?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  if (typeof body.isVerified !== "boolean") {
    return NextResponse.json(
      { error: "Bad Request", message: "Field 'isVerified' (boolean) is required." },
      { status: 400 }
    );
  }

  const updated = await updateVisualRegionReview(documentId, regionId, {
    isVerified: body.isVerified,
    remarks: body.remarks || "Verified during regulatory scrutiny.",
    reviewerUserId: auth.userId,
  });

  if (!updated) {
    return NextResponse.json(
      { error: "Not Found", message: `Visual region '${regionId}' not found.` },
      { status: 404 }
    );
  }

  // Record in audit trail
  try {
    await prisma.fdrAuditLog.create({
      data: {
        fdrId,
        institutionId: fdrInstitutionId,
        actorId: auth.userId,
        actorName: auth.userName,
        actorRole: auth.userRole,
        action: "VISUAL_REGION_VERIFIED",
        entityType: "DOCUMENT_VISUAL_REGION",
        entityId: regionId,
        detailsJson: JSON.stringify({
          candidateClass: updated.candidateClass,
          detectionStatus: updated.detectionStatus,
          isVerified: body.isVerified,
          remarks: body.remarks,
        }),
      },
    });
  } catch {
    // Audit log DB fallback
  }

  return NextResponse.json({
    success: true,
    message: "Visual region review updated successfully.",
    data: updated,
  });
}
