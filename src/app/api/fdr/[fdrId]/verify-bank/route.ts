import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import {
  executeBankVerificationRequest,
  getBankVerificationsForFdr,
  getBankVerificationProvider,
} from "@/lib/fdr/bankVerificationProvider";
import { getSyntheticFdrInstruments } from "@/lib/fdr/seedData";
import type { BankVerificationMode } from "@/lib/fdr/types";

/**
 * POST /api/fdr/[fdrId]/verify-bank
 * Initiates an independent bank verification inquiry through the Bank Verification Provider.
 * Enforces role authorization and records an immutable audit trail.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ fdrId: string }> }
) {
  const { fdrId } = await context.params;

  // 1. Authenticate user
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required to initiate bank verification." },
      { status: 401 }
    );
  }

  // 2. Query FDR instrument to verify institutional boundary
  let fdrInstitutionId: string | null = null;
  let fdrInstrument: {
    id: string;
    fdrNumber: string;
    amount: number;
    bankName: string;
    ifscCode: string;
  } | null = null;

  try {
    const dbFdr = await prisma.fdrInstrument.findUnique({
      where: { id: fdrId },
      include: { institution: true },
    });
    if (dbFdr) {
      fdrInstitutionId = dbFdr.institutionId;
      fdrInstrument = {
        id: dbFdr.id,
        fdrNumber: dbFdr.fdrNumber,
        amount: Number(dbFdr.amount),
        bankName: dbFdr.bankName,
        ifscCode: dbFdr.ifscCode,
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
        ifscCode: synthFdr.ifscCode,
      };
    }
  }

  if (!fdrInstitutionId || !fdrInstrument) {
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

  // 3. Parse optional simulation scenario or provider mode
  let body: {
    simulationScenario?: "MATCH" | "AMOUNT_MISMATCH" | "NOT_FOUND" | "INCONCLUSIVE" | "UNAVAILABLE" | "TIMEOUT";
    preferMode?: BankVerificationMode;
  } = {};

  try {
    const text = await req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  // 4. Execute verification through provider gateway
  try {
    const provider = getBankVerificationProvider(body.preferMode || "SANDBOX_SIMULATED");
    const result = await executeBankVerificationRequest(
      {
        fdrId: fdrInstrument.id,
        fdrNumber: fdrInstrument.fdrNumber,
        amount: fdrInstrument.amount,
        bankName: fdrInstrument.bankName,
        ifscCode: fdrInstrument.ifscCode,
        officerUserId: auth.userId,
        officerName: auth.userName,
        officerRole: auth.userRole,
        simulationScenario: body.simulationScenario,
      },
      provider
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const isAuthError = error.message.includes("authorized");
    return NextResponse.json(
      {
        error: isAuthError ? "Forbidden" : "Verification Request Failed",
        message: error.message,
      },
      { status: isAuthError ? 403 : 400 }
    );
  }
}

/**
 * GET /api/fdr/[fdrId]/verify-bank
 * Returns provider gateway status and historical verification requests for an FDR instrument.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ fdrId: string }> }
) {
  const { fdrId } = await context.params;

  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required." },
      { status: 401 }
    );
  }

  const provider = getBankVerificationProvider("SANDBOX_SIMULATED");
  const providerStatus = await provider.getStatus();
  const history = await getBankVerificationsForFdr(fdrId);

  return NextResponse.json({
    success: true,
    provider: providerStatus,
    history,
  });
}
