import { NextResponse } from "next/server";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import {
  evaluateReleaseReadiness,
  inMemoryReleaseRequestsVault,
} from "@/lib/fdr/lifecycleService";
import {
  getSyntheticFdrInstruments,
  getSyntheticRiskFindings,
} from "@/lib/fdr/seedData";
import prisma from "@/lib/db";
import type { ReleaseRequestDto, ReleaseReadinessEvaluationDto } from "@/lib/fdr/types";

export async function GET(req: Request) {
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const institutionId = searchParams.get("institutionId");

  try {
    let requests: ReleaseRequestDto[] = [];

    try {
      const dbRequests = await prisma.fdrReleaseRequest.findMany({
        where: !auth.isRegulatoryOfficer
          ? { institutionId: auth.institutionId }
          : institutionId
          ? { institutionId }
          : undefined,
        include: { fdr: true, institution: true },
        orderBy: { submissionDate: "desc" },
      });

      if (dbRequests && dbRequests.length > 0) {
        requests = dbRequests.map((r) => ({
          id: r.id,
          fdrId: r.fdrId,
          fdrNumber: r.fdr.fdrNumber,
          institutionId: r.institutionId,
          institutionName: r.institution.name,
          requestedAmount: Number(r.requestedAmount),
          statutoryTenureCompleted: r.statutoryTenureCompleted,
          nocIssued: r.nocIssued,
          status: r.status,
          submissionDate: r.submissionDate.toISOString(),
          committeeDecisionDate: r.committeeDecisionDate?.toISOString() || null,
          committeeRemarks: r.committeeRemarks,
        }));
      }
    } catch {
      // In-memory fallback
    }

    if (requests.length === 0) {
      requests = Array.from(inMemoryReleaseRequestsVault.values()).filter((r) => {
        if (!auth.isRegulatoryOfficer && auth.institutionId) {
          return r.institutionId === auth.institutionId;
        }
        if (institutionId) {
          return r.institutionId === institutionId;
        }
        return true;
      });
    }

    const allInstruments = getSyntheticFdrInstruments();
    const allFindings = getSyntheticRiskFindings();

    const evaluations: ReleaseReadinessEvaluationDto[] = requests.map((req) => {
      const inst = allInstruments.find((i) => i.id === req.fdrId) || allInstruments[0];
      const findings = allFindings.filter((rf) => rf.fdrId === req.fdrId);
      return evaluateReleaseReadiness(req, inst, findings);
    });

    return NextResponse.json({
      success: true,
      data: evaluations,
      count: evaluations.length,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}
