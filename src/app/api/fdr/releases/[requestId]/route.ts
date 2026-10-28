import { NextResponse } from "next/server";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import {
  transitionReleaseRequest,
  evaluateReleaseReadiness,
  inMemoryReleaseRequestsVault,
} from "@/lib/fdr/lifecycleService";
import {
  getSyntheticFdrInstruments,
  getSyntheticRiskFindings,
} from "@/lib/fdr/seedData";
import prisma from "@/lib/db";
import type { ReleaseRequestStatus, ReleaseRequestDto } from "@/lib/fdr/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required." },
      { status: 401 }
    );
  }

  const { requestId } = await params;

  let currentReq: ReleaseRequestDto | undefined = inMemoryReleaseRequestsVault.get(requestId);
  try {
    const dbReq = await prisma.fdrReleaseRequest.findUnique({
      where: { id: requestId },
      include: { fdr: true, institution: true },
    });
    if (dbReq) {
      currentReq = {
        id: dbReq.id,
        fdrId: dbReq.fdrId,
        fdrNumber: dbReq.fdr.fdrNumber,
        institutionId: dbReq.institutionId,
        institutionName: dbReq.institution.name,
        requestedAmount: Number(dbReq.requestedAmount),
        statutoryTenureCompleted: dbReq.statutoryTenureCompleted,
        nocIssued: dbReq.nocIssued,
        status: dbReq.status,
        submissionDate: dbReq.submissionDate.toISOString(),
        committeeDecisionDate: dbReq.committeeDecisionDate?.toISOString() || null,
        committeeRemarks: dbReq.committeeRemarks,
      };
    }
  } catch {
    // In-memory
  }

  if (!currentReq) {
    return NextResponse.json(
      { error: "Not Found", message: `Release request #${requestId} not found.` },
      { status: 404 }
    );
  }

  const access = verifyFdrAccess(auth, currentReq.institutionId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Forbidden", message: access.reason || "Access denied." },
      { status: 403 }
    );
  }

  const allInstruments = getSyntheticFdrInstruments();
  const inst = allInstruments.find((i) => i.id === currentReq!.fdrId) || allInstruments[0];
  const findings = getSyntheticRiskFindings().filter((rf) => rf.fdrId === currentReq!.fdrId);

  const evaluation = evaluateReleaseReadiness(currentReq, inst, findings);

  return NextResponse.json({
    success: true,
    data: evaluation,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required." },
      { status: 401 }
    );
  }

  const { requestId } = await params;

  try {
    const body = await req.json();
    const { newStatus, remarks } = body;

    if (!newStatus) {
      return NextResponse.json(
        { error: "Bad Request", message: "Missing required field: newStatus" },
        { status: 400 }
      );
    }

    const result = await transitionReleaseRequest({
      requestId,
      newStatus: newStatus as ReleaseRequestStatus,
      actor: auth,
      remarks: remarks || "",
    });

    return NextResponse.json({
      success: true,
      data: result.evaluation,
      message: result.message,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const isProhibited =
      error.message.includes("Prohibited Workflow Transition") ||
      error.message.includes("Permission Denied") ||
      error.message.includes("Approval Blocked") ||
      error.message.includes("Mandatory Justification");

    return NextResponse.json(
      {
        error: isProhibited ? "Prohibited Action" : "Internal Server Error",
        message: error.message,
      },
      { status: isProhibited ? 422 : 500 }
    );
  }
}
