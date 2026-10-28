/**
 * SIH26265 FDR Guardian AI - Bank Verification Provider & Sandbox Gateway
 *
 * Implements a provider-based external bank verification integration layer.
 *
 * REGULATORY MANDATE:
 * - Deterministic Sandbox Gateway using clearly synthetic fixtures.
 * - This phase does NOT establish a live bank connection.
 * - Every sandbox response includes explicit marker: `verificationMode: "SANDBOX_SIMULATED"`.
 * - Sandbox outcomes must NEVER be represented as live bank confirmations or set `EXTERNAL_VERIFIED`.
 * - Production provider adapter boundary explicitly returns `NOT_CONFIGURED` without valid credentials.
 * - AI-generated or simulated responses must NEVER authorize a financial release.
 */

import prisma from "../db.ts";
import type {
  BankVerificationMode,
  BankVerificationOutcome,
  BankVerificationComparisonItem,
  BankVerificationRequestParams,
  BankVerificationResponseDto,
  BankVerificationProviderStatusDto,
  BankVerificationProvider,
} from "./types.ts";
import { BANK_VERIFICATION_SANDBOX_DISCLAIMER } from "./types.ts";

/**
 * Synthetic demonstration fixture dataset for the Sandbox Gateway.
 * These are completely simulated fixtures; no connection to any actual financial institution.
 */
interface SyntheticBankFixture {
  fdrNumber: string;
  expectedBankName: string;
  coreLedgerAmount: number;
  accountStatus: "ACTIVE_PLEDGED" | "CLOSED" | "NOT_FOUND" | "FROZEN";
  isLienMarked: boolean;
  lienConfirmedAt: string;
  tenureMonths: number;
  nature: "MATCH" | "AMOUNT_MISMATCH" | "NOT_FOUND" | "INCONCLUSIVE";
}

const SYNTHETIC_BANK_FIXTURES: Record<string, SyntheticBankFixture> = {
  // Instrument 1: Standard Verified Deposit
  "FDR-2021-SBI-88210": {
    fdrNumber: "FDR-2021-SBI-88210",
    expectedBankName: "State Bank of India",
    coreLedgerAmount: 3500000,
    accountStatus: "ACTIVE_PLEDGED",
    isLienMarked: true,
    lienConfirmedAt: "2021-08-15T10:00:00Z",
    tenureMonths: 60,
    nature: "MATCH",
  },
  // Instrument 2: Healthy deposit
  "FDR-2022-PNB-44102": {
    fdrNumber: "FDR-2022-PNB-44102",
    expectedBankName: "Punjab National Bank",
    coreLedgerAmount: 2500000,
    accountStatus: "ACTIVE_PLEDGED",
    isLienMarked: true,
    lienConfirmedAt: "2022-11-20T11:30:00Z",
    tenureMonths: 36,
    nature: "MATCH",
  },
  // Instrument 3: Amount Mismatch (Ledger has ₹1,50,000 vs submitted ₹15,00,000)
  "FDR-2023-CAN-11923": {
    fdrNumber: "FDR-2023-CAN-11923",
    expectedBankName: "Canara Bank",
    coreLedgerAmount: 150000, // Deficit!
    accountStatus: "ACTIVE_PLEDGED",
    isLienMarked: false,
    lienConfirmedAt: "",
    tenureMonths: 60,
    nature: "AMOUNT_MISMATCH",
  },
  // Instrument 4: Closed / Non-existent instrument
  "FDR-2024-HDF-90114": {
    fdrNumber: "FDR-2024-HDF-90114",
    expectedBankName: "HDFC Bank",
    coreLedgerAmount: 0,
    accountStatus: "NOT_FOUND",
    isLienMarked: false,
    lienConfirmedAt: "",
    tenureMonths: 0,
    nature: "NOT_FOUND",
  },
};

/**
 * Deterministic Sandbox Bank Verification Provider
 * Simulates external banking provider responses using synthetic fixtures without contacting any external network.
 */
export class SandboxBankVerificationProvider implements BankVerificationProvider {
  readonly providerKey = "SANDBOX_GATEWAY";
  readonly providerName = "FDR Guardian AI Deterministic Sandbox Gateway [SIMULATION]";
  readonly mode: BankVerificationMode = "SANDBOX_SIMULATED";

  async getStatus(): Promise<BankVerificationProviderStatusDto> {
    return {
      providerKey: this.providerKey,
      providerName: this.providerName,
      mode: this.mode,
      isConfigured: true,
      status: "ONLINE",
      supportedFeatures: {
        referenceValidation: true,
        amountComparison: true,
        issuingBankComparison: true,
        lienConfirmation: true,
      },
      disclaimer: BANK_VERIFICATION_SANDBOX_DISCLAIMER,
    };
  }

  async verifyInstrument(
    params: BankVerificationRequestParams
  ): Promise<BankVerificationResponseDto> {
    const startTime = Date.now();
    const correlationId = `req_corr_sbx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const { fdrNumber, amount, bankName, ifscCode, simulationScenario } = params;

    // Handle explicit simulation scenarios
    const scenario = simulationScenario || this.resolveScenarioFromReference(fdrNumber);

    // Simulated Timeout Handling
    if (scenario === "TIMEOUT") {
      const durationMs = Date.now() - startTime + 50;
      return {
        id: `bvr_${Date.now()}`,
        correlationId,
        fdrId: params.fdrId,
        providerKey: this.providerKey,
        providerName: this.providerName,
        verificationMode: "SANDBOX_SIMULATED",
        outcome: "UNAVAILABLE",
        status: "TIMEOUT",
        requestedFields: { fdrNumber, amount, bankName, ifscCode },
        verifiedFields: null,
        comparisons: [],
        disclaimer: BANK_VERIFICATION_SANDBOX_DISCLAIMER,
        inconclusiveReason: "Simulated core banking gateway did not respond within 3000ms SLA window.",
        error: {
          code: "PROVIDER_TIMEOUT",
          message: "Simulated sandbox provider connection timed out. No response received from bank endpoint.",
        },
        durationMs,
        timestamp: new Date().toISOString(),
        requestedBy: {
          userId: params.officerUserId,
          name: params.officerName,
          role: params.officerRole,
        },
      };
    }

    // Simulated Provider Unavailable Handling
    if (scenario === "UNAVAILABLE") {
      const durationMs = Date.now() - startTime + 10;
      return {
        id: `bvr_${Date.now()}`,
        correlationId,
        fdrId: params.fdrId,
        providerKey: this.providerKey,
        providerName: this.providerName,
        verificationMode: "SANDBOX_SIMULATED",
        outcome: "UNAVAILABLE",
        status: "UNAVAILABLE",
        requestedFields: { fdrNumber, amount, bankName, ifscCode },
        verifiedFields: null,
        comparisons: [],
        disclaimer: BANK_VERIFICATION_SANDBOX_DISCLAIMER,
        inconclusiveReason: "Simulated core banking provider is undergoing scheduled maintenance.",
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Simulated banking provider gateway is offline for inter-bank batch reconciliation.",
        },
        durationMs,
        timestamp: new Date().toISOString(),
        requestedBy: {
          userId: params.officerUserId,
          name: params.officerName,
          role: params.officerRole,
        },
      };
    }

    // Simulated Inconclusive Handling
    if (scenario === "INCONCLUSIVE") {
      const durationMs = Date.now() - startTime + 15;
      return {
        id: `bvr_${Date.now()}`,
        correlationId,
        fdrId: params.fdrId,
        providerKey: this.providerKey,
        providerName: this.providerName,
        verificationMode: "SANDBOX_SIMULATED",
        outcome: "INCONCLUSIVE",
        status: "COMPLETED",
        requestedFields: { fdrNumber, amount, bankName, ifscCode },
        verifiedFields: {
          fdrNumber,
          amount: null,
          bankName: null,
          accountStatus: null,
          isLienMarked: false,
          lienConfirmedAt: null,
        },
        comparisons: [
          {
            field: "fdrNumber",
            submittedValue: fdrNumber,
            providerValue: fdrNumber,
            isMatch: true,
            notes: "Certificate reference indexed in legacy ledger; digital balance inquiry unavailable.",
          },
        ],
        disclaimer: BANK_VERIFICATION_SANDBOX_DISCLAIMER,
        inconclusiveReason: "Branch record requires manual physical officer confirmation; core ledger query returned partial record.",
        durationMs,
        timestamp: new Date().toISOString(),
        requestedBy: {
          userId: params.officerUserId,
          name: params.officerName,
          role: params.officerRole,
        },
      };
    }

    // Lookup fixture or compute synthetic outcome
    const fixture = SYNTHETIC_BANK_FIXTURES[fdrNumber];

    let outcome: BankVerificationOutcome;
    let verifiedAmount: number | null;
    let verifiedBank: string | null;
    let verifiedAccountStatus: "ACTIVE_PLEDGED" | "CLOSED" | "NOT_FOUND" | "FROZEN" | null;
    let isLienMarked: boolean;

    if (scenario === "NOT_FOUND" || (fixture && fixture.nature === "NOT_FOUND")) {
      outcome = "SANDBOX_NOT_FOUND";
      verifiedAmount = null;
      verifiedBank = null;
      verifiedAccountStatus = "NOT_FOUND";
      isLienMarked = false;
    } else if (scenario === "AMOUNT_MISMATCH" || (fixture && fixture.nature === "AMOUNT_MISMATCH")) {
      outcome = "SANDBOX_MISMATCH";
      verifiedAmount = (fixture && fixture.nature === "AMOUNT_MISMATCH") ? fixture.coreLedgerAmount : Math.round(amount * 0.1);
      verifiedBank = fixture ? fixture.expectedBankName : bankName;
      verifiedAccountStatus = "ACTIVE_PLEDGED";
      isLienMarked = false;
    } else {
      // Default: Match scenario
      outcome = "SANDBOX_MATCH";
      verifiedAmount = fixture ? fixture.coreLedgerAmount : amount;
      verifiedBank = fixture ? fixture.expectedBankName : bankName;
      verifiedAccountStatus = "ACTIVE_PLEDGED";
      isLienMarked = true;
    }

    // Build structured comparison records
    const comparisons: BankVerificationComparisonItem[] = [
      {
        field: "fdrNumber",
        submittedValue: fdrNumber,
        providerValue: outcome === "SANDBOX_NOT_FOUND" ? null : fdrNumber,
        isMatch: outcome !== "SANDBOX_NOT_FOUND",
        notes: outcome === "SANDBOX_NOT_FOUND" ? "Certificate not located on simulated bank register" : "Exact match on certificate reference",
      },
      {
        field: "amount",
        submittedValue: `₹${amount.toLocaleString("en-IN")}`,
        providerValue: verifiedAmount !== null ? `₹${verifiedAmount.toLocaleString("en-IN")}` : null,
        isMatch: verifiedAmount !== null && Math.abs(verifiedAmount - amount) < 1,
        notes:
          verifiedAmount !== null && Math.abs(verifiedAmount - amount) < 1
            ? "Pledged deposit amount confirmed on core balance ledger"
            : `Discrepancy detected: Requested ₹${amount.toLocaleString("en-IN")} vs Verified ${verifiedAmount ? `₹${verifiedAmount.toLocaleString("en-IN")}` : "NULL"}`,
      },
      {
        field: "issuingBank",
        submittedValue: bankName,
        providerValue: verifiedBank,
        isMatch: verifiedBank !== null && (verifiedBank.toLowerCase().includes(bankName.toLowerCase()) || bankName.toLowerCase().includes(verifiedBank.toLowerCase())),
        notes: "Issuing bank corporate entity validated",
      },
    ];

    if (ifscCode) {
      comparisons.push({
        field: "ifscCode",
        submittedValue: ifscCode,
        providerValue: ifscCode,
        isMatch: true,
        notes: "RBI core routing settlement IFSC verified",
      });
    }

    const durationMs = Date.now() - startTime + 8;

    return {
      id: `bvr_${Date.now()}`,
      correlationId,
      fdrId: params.fdrId,
      providerKey: this.providerKey,
      providerName: this.providerName,
      verificationMode: "SANDBOX_SIMULATED",
      outcome,
      status: "COMPLETED",
      requestedFields: { fdrNumber, amount, bankName, ifscCode },
      verifiedFields: {
        fdrNumber: outcome === "SANDBOX_NOT_FOUND" ? null : fdrNumber,
        amount: verifiedAmount,
        bankName: verifiedBank,
        accountStatus: verifiedAccountStatus,
        isLienMarked,
        lienConfirmedAt: isLienMarked ? new Date().toISOString() : null,
      },
      comparisons,
      disclaimer: BANK_VERIFICATION_SANDBOX_DISCLAIMER,
      inconclusiveReason: null,
      error: null,
      durationMs,
      timestamp: new Date().toISOString(),
      requestedBy: {
        userId: params.officerUserId,
        name: params.officerName,
        role: params.officerRole,
      },
    };
  }

  private resolveScenarioFromReference(ref: string): "MATCH" | "AMOUNT_MISMATCH" | "NOT_FOUND" | "INCONCLUSIVE" | "UNAVAILABLE" | "TIMEOUT" {
    const upper = ref.toUpperCase();
    if (upper.includes("TIMEOUT")) return "TIMEOUT";
    if (upper.includes("UNAVAILABLE") || upper.includes("DOWN")) return "UNAVAILABLE";
    if (upper.includes("INCONCLUSIVE") || upper.includes("PARTIAL")) return "INCONCLUSIVE";
    if (upper.includes("NOTFOUND") || upper.includes("UNKNOWN")) return "NOT_FOUND";
    if (upper.includes("MISMATCH") || upper.includes("DEFICIT")) return "AMOUNT_MISMATCH";
    return "MATCH";
  }
}

/**
 * Production Adapter Boundary (Unconfigured Placeholder)
 * Demonstrates how a real authorized provider (e.g. SFMS Gateway or RBI Open Banking)
 * would connect in the future, while strictly returning NOT_CONFIGURED today.
 */
export class UnconfiguredProductionBankProvider implements BankVerificationProvider {
  readonly providerKey = "PRODUCTION_SFMS_GATEWAY";
  readonly providerName = "RBI / SFMS Structured Financial Messaging System [LIVE - UNCONFIGURED]";
  readonly mode: BankVerificationMode = "PRODUCTION_LIVE";

  async getStatus(): Promise<BankVerificationProviderStatusDto> {
    return {
      providerKey: this.providerKey,
      providerName: this.providerName,
      mode: this.mode,
      isConfigured: false,
      status: "NOT_CONFIGURED",
      supportedFeatures: {
        referenceValidation: false,
        amountComparison: false,
        issuingBankComparison: false,
        lienConfirmation: false,
      },
      disclaimer: "No official production SFMS or Open Banking API credentials configured. Platform operates exclusively under Sandbox simulation mode.",
    };
  }

  async verifyInstrument(
    params: BankVerificationRequestParams
  ): Promise<BankVerificationResponseDto> {
    const correlationId = `req_corr_prod_${Date.now()}`;
    return {
      id: `bvr_unconfigured_${Date.now()}`,
      correlationId,
      fdrId: params.fdrId,
      providerKey: this.providerKey,
      providerName: this.providerName,
      verificationMode: "PRODUCTION_LIVE",
      outcome: "NOT_CONFIGURED",
      status: "FAILED",
      requestedFields: {
        fdrNumber: params.fdrNumber,
        amount: params.amount,
        bankName: params.bankName,
        ifscCode: params.ifscCode,
      },
      verifiedFields: null,
      comparisons: [],
      disclaimer: "PRODUCTION GATEWAY UNCONFIGURED: Live bank connections require official SFMS network authorization, ISO 20022 message credentials, and regulatory PKI certificates. No simulated credentials or fake endpoints are used.",
      inconclusiveReason: "Production provider credentials are not configured in this environment.",
      error: {
        code: "PROVIDER_NOT_CONFIGURED",
        message: "Production banking provider credentials not configured. AI or simulated responses cannot authorize live statutory release.",
      },
      durationMs: 0,
      timestamp: new Date().toISOString(),
      requestedBy: {
        userId: params.officerUserId,
        name: params.officerName,
        role: params.officerRole,
      },
    };
  }
}

/**
 * Factory / Registry to obtain the active Bank Verification Provider
 */
export function getBankVerificationProvider(
  preferMode: BankVerificationMode = "SANDBOX_SIMULATED"
): BankVerificationProvider {
  if (preferMode === "PRODUCTION_LIVE") {
    return new UnconfiguredProductionBankProvider();
  }
  return new SandboxBankVerificationProvider();
}

/**
 * In-memory fallback registry for verification records when database is offline
 */
const inMemoryVerificationRegistry = new Map<string, BankVerificationResponseDto>();

/**
 * Core Request Processor:
 * Validates inputs, authenticates officer role, invokes provider, persists request, and writes audit trail.
 */
export async function executeBankVerificationRequest(
  params: BankVerificationRequestParams,
  providerOverride?: BankVerificationProvider
): Promise<BankVerificationResponseDto> {
  // 1. Role Authorization Check
  const authorizedRoles = [
    "Regulatory Scrutiny Officer",
    "AICTE Admin",
    "Institutional Admin",
    "Senior Bank Reviewer",
    "SCRUTINY_OFFICER",
    "ADMIN",
  ];

  if (!authorizedRoles.includes(params.officerRole)) {
    throw new Error(
      `User role "${params.officerRole}" is not authorized to initiate external bank verification requests. Scrutiny Officer credentials required.`
    );
  }

  // 2. Validate input fields on the server
  if (!params.fdrNumber || params.fdrNumber.trim().length < 3) {
    throw new Error("Invalid FDR instrument number. A valid reference string is required.");
  }
  if (!params.amount || params.amount <= 0) {
    throw new Error("Invalid deposit amount. Deposit amount must be a positive number.");
  }
  if (!params.bankName || params.bankName.trim().length < 2) {
    throw new Error("Invalid bank name. Issuing bank name is required.");
  }

  // 3. Obtain provider and execute verification
  const provider = providerOverride || getBankVerificationProvider("SANDBOX_SIMULATED");
  const response = await provider.verifyInstrument(params);

  // 4. Persist to PostgreSQL (or in-memory registry fallback)
  try {
    await prisma.fdrBankVerificationRequest.create({
      data: {
        fdrId: params.fdrId,
        correlationId: response.correlationId,
        providerKey: response.providerKey,
        providerMode: response.verificationMode,
        requestedFdrNumber: response.requestedFields.fdrNumber,
        requestedAmount: response.requestedFields.amount,
        requestedBankName: response.requestedFields.bankName,
        requestedIfsc: response.requestedFields.ifscCode || null,
        status: response.status,
        responseOutcome: response.outcome,
        comparedFieldsJson: JSON.stringify(response.comparisons),
        verifiedAmount: response.verifiedFields?.amount ? response.verifiedFields.amount : null,
        verifiedBankName: response.verifiedFields?.bankName || null,
        verifiedAccountStatus: response.verifiedFields?.accountStatus || null,
        isLienConfirmed: response.verifiedFields?.isLienMarked || false,
        disclaimer: response.disclaimer,
        inconclusiveReason: response.inconclusiveReason || null,
        errorCode: response.error?.code || null,
        errorMessage: response.error?.message || null,
        requestedByUserId: params.officerUserId,
        requestedByUserName: params.officerName,
        requestedByUserRole: params.officerRole,
        durationMs: response.durationMs,
      },
    });

    // Write audit log
    await prisma.fdrAuditLog.create({
      data: {
        fdrId: params.fdrId,
        actorId: params.officerUserId,
        actorName: params.officerName,
        actorRole: params.officerRole,
        action: "BANK_VERIFICATION_REQUESTED",
        entityType: "FDR_BANK_VERIFICATION",
        entityId: response.correlationId,
        detailsJson: JSON.stringify({
          providerKey: response.providerKey,
          providerMode: response.verificationMode,
          responseOutcome: response.outcome,
          fdrNumber: params.fdrNumber,
          amount: params.amount,
          durationMs: response.durationMs,
        }),
      },
    });
  } catch {
    // Database offline fallback: register in in-memory map
    inMemoryVerificationRegistry.set(response.correlationId, response);
  }

  return response;
}

/**
 * Retrieve bank verification records for an FDR instrument
 */
export async function getBankVerificationsForFdr(
  fdrId: string
): Promise<BankVerificationResponseDto[]> {
  try {
    const records = await prisma.fdrBankVerificationRequest.findMany({
      where: { fdrId },
      orderBy: { createdAt: "desc" },
    });

    if (records && records.length > 0) {
      return records.map((r) => ({
        id: r.id,
        correlationId: r.correlationId,
        fdrId: r.fdrId,
        providerKey: r.providerKey,
        providerName:
          r.providerKey === "SANDBOX_GATEWAY"
            ? "FDR Guardian AI Deterministic Sandbox Gateway [SIMULATION]"
            : "External Bank Verification Provider",
        verificationMode: r.providerMode as BankVerificationMode,
        outcome: r.responseOutcome as BankVerificationOutcome,
        status: r.status as "COMPLETED" | "FAILED" | "TIMEOUT" | "UNAVAILABLE",
        requestedFields: {
          fdrNumber: r.requestedFdrNumber,
          amount: Number(r.requestedAmount),
          bankName: r.requestedBankName,
          ifscCode: r.requestedIfsc || undefined,
        },
        verifiedFields: r.verifiedAmount
          ? {
              fdrNumber: r.requestedFdrNumber,
              amount: Number(r.verifiedAmount),
              bankName: r.verifiedBankName,
              accountStatus: (r.verifiedAccountStatus as any) || null,
              isLienMarked: r.isLienConfirmed,
              lienConfirmedAt: r.createdAt.toISOString(),
            }
          : null,
        comparisons: r.comparedFieldsJson ? JSON.parse(r.comparedFieldsJson) : [],
        disclaimer: r.disclaimer,
        inconclusiveReason: r.inconclusiveReason,
        error: r.errorCode ? { code: r.errorCode, message: r.errorMessage || "" } : null,
        durationMs: r.durationMs,
        timestamp: r.createdAt.toISOString(),
        requestedBy: {
          userId: r.requestedByUserId,
          name: r.requestedByUserName,
          role: r.requestedByUserRole,
        },
      }));
    }
  } catch {
    // Database offline
  }

  // Fallback to in-memory records matching fdrId
  return Array.from(inMemoryVerificationRegistry.values())
    .filter((r) => r.fdrId === fdrId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
