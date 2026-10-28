import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { resolveRiskFinding, calculateCompositeFdrRisk } from "@/lib/fdr/riskEngine";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";
import type { RiskFindingDto, RiskFindingCategory, RiskFindingSourceAnalysis, RiskFindingResolutionState } from "@/lib/fdr/types";

/**
 * PATCH /api/fdr/[fdrId]/findings/[findingId]
 * Allows authorized scrutiny officers to resolve or dismiss a risk finding with mandatory justification.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ fdrId: string; findingId: string }> }
) {
  const { fdrId, findingId } = await context.params;

  // 1. Authenticate user
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required to resolve risk findings." },
      { status: 401 }
    );
  }

  // 2. Query finding and FDR for institutional boundary check
  let fdrInstitutionId: string | null = null;
  try {
    const finding = await prisma.fdrRiskFinding.findUnique({
      where: { id: findingId },
      include: { fdr: true },
    });
    if (finding) {
      fdrInstitutionId = finding.fdr.institutionId;
    }
  } catch {
    // Database offline
  }

  if (!fdrInstitutionId) {
    const synthFdr = getSyntheticFdrInstruments().find((f) => f.id === fdrId);
    fdrInstitutionId = synthFdr?.institutionId || "inst-synth-001";
  }

  const authCheck = verifyFdrAccess(auth, fdrInstitutionId);
  if (!authCheck.allowed) {
    return NextResponse.json(
      { error: "Forbidden", message: authCheck.reason },
      { status: 403 }
    );
  }

  // 3. Parse and validate resolution body
  let body: {
    decision?: "ACCEPTED_RISK" | "FALSE_POSITIVE" | "BANK_CONFIRMED" | "REJECTED_INSTRUMENT";
    justification?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const validDecisions = ["ACCEPTED_RISK", "FALSE_POSITIVE", "BANK_CONFIRMED", "REJECTED_INSTRUMENT"];
  if (!body.decision || !validDecisions.includes(body.decision)) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: `Field 'decision' must be one of: ${validDecisions.join(", ")}`,
      },
      { status: 400 }
    );
  }

  if (!body.justification || body.justification.trim().length < 10) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "Mandatory justification must be at least 10 characters explaining regulatory basis for resolution.",
      },
      { status: 400 }
    );
  }

  // 4. Execute resolution through risk engine
  const result = await resolveRiskFinding({
    findingId,
    fdrId,
    decision: body.decision,
    justification: body.justification.trim(),
    officerId: auth.userId,
    officerName: auth.userName,
    officerRole: auth.userRole,
  });

  if (!result.success) {
    const status = result.error?.includes("authorized") ? 403 : 400;
    return NextResponse.json(
      { error: "Resolution Failed", message: result.error },
      { status }
    );
  }

  // 5. Query updated findings list to compute updated composite risk score
  let updatedScore;
  try {
    const allDbFindings = await prisma.fdrRiskFinding.findMany({
      where: { fdrId },
      include: { fdr: { include: { institution: true } } },
    });

    const mappedFindings: RiskFindingDto[] = allDbFindings.map((rf) => ({
      id: rf.id,
      fdrId: rf.fdrId,
      fdrNumber: rf.fdr.fdrNumber,
      institutionName: rf.fdr.institution.name,
      documentId: rf.documentId,
      riskCode: rf.riskCode,
      category: rf.category as RiskFindingCategory,
      sourceAnalysis: rf.sourceAnalysis as RiskFindingSourceAnalysis,
      severity: rf.severity,
      description: rf.description,
      resolutionState: rf.resolutionState as RiskFindingResolutionState,
      isResolved: rf.isResolved,
      createdAt: rf.createdAt.toISOString(),
    }));

    updatedScore = calculateCompositeFdrRisk(fdrId, mappedFindings);
  } catch {
    updatedScore = calculateCompositeFdrRisk(fdrId, result.finding ? [result.finding] : []);
  }

  return NextResponse.json({
    success: true,
    message: `Risk finding successfully marked as ${result.finding?.resolutionState}. Reviewer decision and audit event recorded.`,
    data: {
      finding: result.finding,
      updatedCompositeRisk: updatedScore,
    },
  });
}
