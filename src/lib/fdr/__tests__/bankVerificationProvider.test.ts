/**
 * SIH26265 FDR Guardian AI - Phase 3.8 Unit Test Suite
 *
 * Tests:
 * 1. Deterministic Sandbox Gateway Scenarios (Match, Mismatch, Not Found, Inconclusive, Timeout, Unavailable)
 * 2. Mandatory Sandbox Markers & Anti-Authentication Disclaimers
 * 3. Crucial Invariant: Sandbox outcomes NEVER become EXTERNAL_VERIFIED
 * 4. Production Adapter Boundary & NOT_CONFIGURED Status Handling
 * 5. Role Authorization & Server-side Validation
 * 6. Audit Trail & Correlation ID Generation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SandboxBankVerificationProvider,
  UnconfiguredProductionBankProvider,
  getBankVerificationProvider,
  executeBankVerificationRequest,
} from "../bankVerificationProvider.ts";
import type { BankVerificationRequestParams } from "../types.ts";
import { BANK_VERIFICATION_SANDBOX_DISCLAIMER } from "../types.ts";

describe("FDR Bank Verification Provider - Sandbox Gateway Scenarios", () => {
  const provider = new SandboxBankVerificationProvider();

  const baseParams: BankVerificationRequestParams = {
    fdrId: "fdr-synth-101",
    fdrNumber: "FDR-2021-SBI-88210",
    amount: 3500000,
    bankName: "State Bank of India",
    ifscCode: "SBIN0004132",
    officerUserId: "usr-officer-01",
    officerName: "Officer Sharma",
    officerRole: "Regulatory Scrutiny Officer",
  };

  it("should verify instrument and return SANDBOX_MATCH for valid synthetic reference and amount", async () => {
    const res = await provider.verifyInstrument(baseParams);

    assert.strictEqual(res.verificationMode, "SANDBOX_SIMULATED");
    assert.strictEqual(res.outcome, "SANDBOX_MATCH");
    assert.strictEqual(res.status, "COMPLETED");
    assert.ok(res.correlationId.startsWith("req_corr_sbx_"));
    assert.strictEqual(res.disclaimer, BANK_VERIFICATION_SANDBOX_DISCLAIMER);

    // Verify comparison records
    const amountComp = res.comparisons.find((c) => c.field === "amount");
    assert.ok(amountComp);
    assert.strictEqual(amountComp?.isMatch, true);

    const refComp = res.comparisons.find((c) => c.field === "fdrNumber");
    assert.ok(refComp);
    assert.strictEqual(refComp?.isMatch, true);
  });

  it("should return SANDBOX_MISMATCH when core ledger amount conflicts with submitted FDR", async () => {
    const res = await provider.verifyInstrument({
      ...baseParams,
      simulationScenario: "AMOUNT_MISMATCH",
    });

    assert.strictEqual(res.verificationMode, "SANDBOX_SIMULATED");
    assert.strictEqual(res.outcome, "SANDBOX_MISMATCH");
    assert.strictEqual(res.status, "COMPLETED");

    const amountComp = res.comparisons.find((c) => c.field === "amount");
    assert.ok(amountComp);
    assert.strictEqual(amountComp?.isMatch, false);
    assert.ok(amountComp?.notes?.includes("Discrepancy detected"));
  });

  it("should return SANDBOX_NOT_FOUND when instrument reference does not exist on bank register", async () => {
    const res = await provider.verifyInstrument({
      ...baseParams,
      fdrNumber: "FDR-UNKNOWN-999",
      simulationScenario: "NOT_FOUND",
    });

    assert.strictEqual(res.verificationMode, "SANDBOX_SIMULATED");
    assert.strictEqual(res.outcome, "SANDBOX_NOT_FOUND");
    assert.strictEqual(res.status, "COMPLETED");
    assert.strictEqual(res.verifiedFields?.fdrNumber, null);

    const refComp = res.comparisons.find((c) => c.field === "fdrNumber");
    assert.ok(refComp);
    assert.strictEqual(refComp?.isMatch, false);
  });

  it("should return INCONCLUSIVE when record requires manual branch confirmation", async () => {
    const res = await provider.verifyInstrument({
      ...baseParams,
      simulationScenario: "INCONCLUSIVE",
    });

    assert.strictEqual(res.verificationMode, "SANDBOX_SIMULATED");
    assert.strictEqual(res.outcome, "INCONCLUSIVE");
    assert.ok(res.inconclusiveReason?.includes("manual physical officer confirmation"));
  });

  it("should handle simulated provider timeout with structured timeout error", async () => {
    const res = await provider.verifyInstrument({
      ...baseParams,
      simulationScenario: "TIMEOUT",
    });

    assert.strictEqual(res.verificationMode, "SANDBOX_SIMULATED");
    assert.strictEqual(res.outcome, "UNAVAILABLE");
    assert.strictEqual(res.status, "TIMEOUT");
    assert.strictEqual(res.error?.code, "PROVIDER_TIMEOUT");
    assert.ok(res.error?.message?.includes("timed out"));
  });

  it("should handle simulated provider unavailable with structured error code", async () => {
    const res = await provider.verifyInstrument({
      ...baseParams,
      simulationScenario: "UNAVAILABLE",
    });

    assert.strictEqual(res.verificationMode, "SANDBOX_SIMULATED");
    assert.strictEqual(res.outcome, "UNAVAILABLE");
    assert.strictEqual(res.status, "UNAVAILABLE");
    assert.strictEqual(res.error?.code, "SERVICE_UNAVAILABLE");
  });
});

describe("FDR Bank Verification - Crucial Invariants & Status Semantics", () => {
  it("CRITICAL: Sandbox outcomes must NEVER be represented as EXTERNAL_VERIFIED", async () => {
    const provider = new SandboxBankVerificationProvider();
    const scenarios = ["MATCH", "AMOUNT_MISMATCH", "NOT_FOUND", "INCONCLUSIVE", "UNAVAILABLE", "TIMEOUT"] as const;

    for (const sc of scenarios) {
      const res = await provider.verifyInstrument({
        fdrId: "fdr-1",
        fdrNumber: `FDR-TEST-${sc}`,
        amount: 1000000,
        bankName: "State Bank of India",
        officerUserId: "usr-1",
        officerName: "Officer",
        officerRole: "Regulatory Scrutiny Officer",
        simulationScenario: sc,
      });

      // Sandbox outcomes must NEVER equal "EXTERNAL_VERIFIED"
      assert.notStrictEqual(res.outcome, "EXTERNAL_VERIFIED");
      assert.strictEqual(res.verificationMode, "SANDBOX_SIMULATED");
      assert.ok(res.disclaimer.includes("SANDBOX SIMULATION ONLY"));
      assert.ok(res.disclaimer.includes("NEVER be represented as live bank confirmations"));
    }
  });

  it("Production adapter boundary strictly returns NOT_CONFIGURED when no live credentials exist", async () => {
    const prodProvider = new UnconfiguredProductionBankProvider();
    const status = await prodProvider.getStatus();

    assert.strictEqual(status.status, "NOT_CONFIGURED");
    assert.strictEqual(status.isConfigured, false);
    assert.strictEqual(status.mode, "PRODUCTION_LIVE");

    const res = await prodProvider.verifyInstrument({
      fdrId: "fdr-1",
      fdrNumber: "FDR-LIVE-001",
      amount: 1000000,
      bankName: "State Bank of India",
      officerUserId: "usr-1",
      officerName: "Officer",
      officerRole: "Regulatory Scrutiny Officer",
    });

    assert.strictEqual(res.outcome, "NOT_CONFIGURED");
    assert.strictEqual(res.status, "FAILED");
    assert.strictEqual(res.verificationMode, "PRODUCTION_LIVE");
    assert.strictEqual(res.error?.code, "PROVIDER_NOT_CONFIGURED");
    assert.ok(res.error?.message?.includes("cannot authorize live statutory release"));
  });

  it("Factory correctly returns Sandbox provider or unconfigured production provider", () => {
    const sbx = getBankVerificationProvider("SANDBOX_SIMULATED");
    assert.strictEqual(sbx.mode, "SANDBOX_SIMULATED");
    assert.strictEqual(sbx.providerKey, "SANDBOX_GATEWAY");

    const prod = getBankVerificationProvider("PRODUCTION_LIVE");
    assert.strictEqual(prod.mode, "PRODUCTION_LIVE");
    assert.strictEqual(prod.providerKey, "PRODUCTION_SFMS_GATEWAY");
  });
});

describe("FDR Bank Verification - Role Authorization & Server Validation", () => {
  it("should reject verification inquiries initiated by unauthorized user roles", async () => {
    await assert.rejects(
      async () => {
        await executeBankVerificationRequest({
          fdrId: "fdr-1",
          fdrNumber: "FDR-TEST",
          amount: 500000,
          bankName: "SBI",
          officerUserId: "usr-student",
          officerName: "Student User",
          officerRole: "STUDENT", // Unauthorized
        });
      },
      /is not authorized to initiate external bank verification requests/
    );
  });

  it("should reject inquiries with invalid or empty reference strings", async () => {
    await assert.rejects(
      async () => {
        await executeBankVerificationRequest({
          fdrId: "fdr-1",
          fdrNumber: "  ", // Invalid
          amount: 500000,
          bankName: "SBI",
          officerUserId: "usr-officer",
          officerName: "Officer",
          officerRole: "Regulatory Scrutiny Officer",
        });
      },
      /Invalid FDR instrument number/
    );
  });

  it("should reject inquiries with non-positive amounts", async () => {
    await assert.rejects(
      async () => {
        await executeBankVerificationRequest({
          fdrId: "fdr-1",
          fdrNumber: "FDR-VALID-01",
          amount: -5000, // Invalid
          bankName: "SBI",
          officerUserId: "usr-officer",
          officerName: "Officer",
          officerRole: "Regulatory Scrutiny Officer",
        });
      },
      /Deposit amount must be a positive number/
    );
  });

  it("should generate distinct correlation IDs and maintain lineage on repeat requests", async () => {
    const res1 = await executeBankVerificationRequest({
      fdrId: "fdr-repeat-1",
      fdrNumber: "FDR-REPEAT-001",
      amount: 1000000,
      bankName: "State Bank of India",
      officerUserId: "usr-officer",
      officerName: "Officer",
      officerRole: "Regulatory Scrutiny Officer",
    });

    const res2 = await executeBankVerificationRequest({
      fdrId: "fdr-repeat-1",
      fdrNumber: "FDR-REPEAT-001",
      amount: 1000000,
      bankName: "State Bank of India",
      officerUserId: "usr-officer",
      officerName: "Officer",
      officerRole: "Regulatory Scrutiny Officer",
    });

    assert.notStrictEqual(res1.correlationId, res2.correlationId);
    assert.strictEqual(res1.fdrId, res2.fdrId);
    assert.strictEqual(res1.outcome, "SANDBOX_MATCH");
    assert.strictEqual(res2.outcome, "SANDBOX_MATCH");
  });
});
