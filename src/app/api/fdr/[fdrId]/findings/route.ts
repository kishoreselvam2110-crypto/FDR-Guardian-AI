import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { calculateCompositeFdrRisk } from "@/lib/fdr/riskEngine";
import { getSyntheticFdrInstruments, getSyntheticRiskFindings } from "@/lib/fdr/seedData";
import type { RiskFindingDto, RiskFindingCategory, RiskFindingSourceAnalysis, RiskFindingResolutionState } from "@/lib/fdr/types";

/**
 * GET /api/fdr/[fdrId]/findings
 * Returns explainable forensic findings and deterministic composite risk score for an FDR instrument.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ fdrId: string }> }
) {
  const { fdrId } = await context.params;

  // 1. Authenticate user
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required to view FDR risk findings." },
      { status: 401 }
    );
  }

  // 2. Query FDR for institution boundary check
  let fdrInstitutionId: string | null = null;
  let fdrInstrument: { id: string; fdrNumber: string; amount: number; bankName: string } | null = null;

  try {
    const fdrDb = await prisma.fdrInstrument.findUnique({
      where: { id: fdrId },
      include: { institution: true },
    });
    if (fdrDb) {
      fdrInstitutionId = fdrDb.institutionId;
      fdrInstrument = {
        id: fdrDb.id,
        fdrNumber: fdrDb.fdrNumber,
        amount: Number(fdrDb.amount),
        bankName: fdrDb.bankName,
      };
    }
  } catch {
    // Database offline
  }

  if (!fdrInstitutionId) {
    const synthFdr = getSyntheticFdrInstruments().find((f) => f.id === fdrId);
    if (synthFdr) {
      fdrInstitutionId = synthFdr.institutionId;
      fdrInstrument = {
        id: synthFdr.id,
        fdrNumber: synthFdr.fdrNumber,
        amount: synthFdr.amount,
        bankName: synthFdr.bankName,
      };
    }
  }

  if (!fdrInstitutionId) {
    return NextResponse.json(
      { error: "Not Found", message: `FDR instrument '${fdrId}' does not exist.` },
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

  // 3. Query query parameters for filtering
  const url = new URL(req.url);
  const categoryFilter = url.searchParams.get("category");
  const resolutionFilter = url.searchParams.get("resolutionState");

  try {
    const dbFindings = await prisma.fdrRiskFinding.findMany({
      where: {
        fdrId,
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(resolutionFilter ? { resolutionState: resolutionFilter } : {}),
      },
      include: { fdr: { include: { institution: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (dbFindings && dbFindings.length > 0) {
      const findings: RiskFindingDto[] = dbFindings.map((rf) => ({
        id: rf.id,
        fdrId: rf.fdrId,
        fdrNumber: rf.fdr.fdrNumber,
        institutionName: rf.fdr.institution.name,
        documentId: rf.documentId,
        riskCode: rf.riskCode,
        category: rf.category as RiskFindingCategory,
        sourceAnalysis: rf.sourceAnalysis as RiskFindingSourceAnalysis,
        evidenceJson: rf.evidenceJson,
        evidence: rf.evidenceJson ? JSON.parse(rf.evidenceJson) : null,
        ruleKey: rf.ruleKey || undefined,
        ruleVersion: rf.ruleVersion,
        severity: rf.severity,
        description: rf.description,
        recommendedAction: rf.recommendedAction,
        resolutionState: rf.resolutionState as RiskFindingResolutionState,
        isResolved: rf.isResolved,
        reviewerDecision: rf.reviewerDecision,
        reviewerJustification: rf.reviewerJustification,
        resolvedByUserId: rf.resolvedByUserId,
        resolvedAt: rf.resolvedAt?.toISOString() || null,
        createdAt: rf.createdAt.toISOString(),
        updatedAt: rf.updatedAt.toISOString(),
      }));

      const compositeRisk = calculateCompositeFdrRisk(fdrId, findings);

      return NextResponse.json({
        success: true,
        source: "database",
        fdr: fdrInstrument,
        compositeRisk,
        findings,
      });
    }
  } catch {
    // Fall through to synthetic demo findings
  }

  // Synthetic fallback dataset
  const synthFindings = getSyntheticRiskFindings()
    .filter((rf) => rf.fdrId === fdrId || (rf.fdrNumber ? rf.fdrNumber.includes(fdrId) : false))
    .map((rf) => ({
      ...rf,
      category: "GENERAL_DISCREPANCY" as RiskFindingCategory,
      sourceAnalysis: "SYSTEM" as RiskFindingSourceAnalysis,
      resolutionState: (rf.isResolved ? "RESOLVED" : "OPEN") as RiskFindingResolutionState,
    }));

  const compositeRisk = calculateCompositeFdrRisk(fdrId, synthFindings);

  return NextResponse.json({
    success: true,
    source: "synthetic_seed",
    fdr: fdrInstrument,
    compositeRisk,
    findings: synthFindings,
  });
}
