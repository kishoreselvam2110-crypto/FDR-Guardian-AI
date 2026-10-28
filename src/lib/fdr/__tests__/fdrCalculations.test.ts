import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateDaysDifference,
  addDays,
  subDays,
  getSyntheticFdrInstruments,
  getSyntheticReleaseRequests,
  getSyntheticAlerts,
  getSyntheticRiskFindings,
  getSyntheticAuditLogs,
} from "../seedData.ts";
import { compileMetricsPayload } from "../calculations.ts";
import type { FdrInstrumentDto } from "../types.ts";

describe("FDR Guardian - Date Boundaries and Countdown Logic", () => {
  it("should calculate exact days difference correctly", () => {
    const base = new Date("2026-10-27T00:00:00Z");
    const future = new Date("2026-11-26T00:00:00Z"); // 30 days ahead
    assert.strictEqual(calculateDaysDifference(future, base), 30);

    const past = new Date("2026-10-17T00:00:00Z"); // 10 days ago
    assert.strictEqual(calculateDaysDifference(past, base), -10);

    const same = new Date("2026-10-27T00:00:00Z");
    assert.strictEqual(calculateDaysDifference(same, base), 0);
  });

  it("should add and subtract days reliably across month boundaries", () => {
    const base = new Date("2026-10-27T00:00:00Z");
    const added = addDays(10, base);
    assert.strictEqual(added.toISOString().split("T")[0], "2026-11-06");

    const subbed = subDays(30, base);
    assert.strictEqual(subbed.toISOString().split("T")[0], "2026-09-27");
  });
});

describe("FDR Guardian - Metrics and Aggregation Engine", () => {
  it("should compile metrics from synthetic seed dataset dynamically", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    const instruments = getSyntheticFdrInstruments(now);
    const releases = getSyntheticReleaseRequests();
    const alerts = getSyntheticAlerts();
    const risks = getSyntheticRiskFindings();
    const audits = getSyntheticAuditLogs();

    const metrics = compileMetricsPayload(
      instruments,
      releases,
      alerts,
      risks,
      audits,
      "synthetic_seed"
    );

    assert.strictEqual(metrics.source, "synthetic_seed");
    // Verify replaced predecessor is excluded from active count (6 total - 1 predecessor = 5)
    assert.strictEqual(metrics.overview.activeInstrumentCount, 5);

    // Capital sum of the 5 active instruments (35L + 25L + 15L + 25L + 10L = 1,10,00,000)
    assert.strictEqual(metrics.overview.totalPledgedCapital, 11000000);

    // Critical 30D window (Instrument 1 maturing in 14 days)
    assert.strictEqual(metrics.overview.upcomingMaturitiesCount30D, 1);

    // Warning 60D window (Instrument 2 maturing in 45 days)
    assert.strictEqual(metrics.overview.upcomingMaturitiesCount60D, 1);

    // Matured pending action (Instrument 3 matured 8 days ago + Instrument 5 matured 30 days ago)
    assert.strictEqual(metrics.overview.maturedPendingFollowupCount, 2);

    // Lien confirmation rate
    assert.strictEqual(typeof metrics.overview.lienConfirmationRate, "number");
    assert.strictEqual(metrics.overview.lienConfirmationRate > 0, true);
  });

  it("should handle empty datasets without division-by-zero or crashes", () => {
    const metrics = compileMetricsPayload([], [], [], [], [], "database");

    assert.strictEqual(metrics.source, "database");
    assert.strictEqual(metrics.overview.activeInstrumentCount, 0);
    assert.strictEqual(metrics.overview.totalPledgedCapital, 0);
    assert.strictEqual(metrics.overview.lienConfirmationRate, 0);
    assert.strictEqual(metrics.overview.upcomingMaturitiesCount30D, 0);
    assert.strictEqual(metrics.instruments.length, 0);
  });

  it("should enforce institution-level scope filtering", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    const allInstruments = getSyntheticFdrInstruments(now);

    // Filter to only inst-synth-001 (Apex Institute)
    const apexInstruments = allInstruments.filter(
      (i) => i.institutionId === "inst-synth-001"
    );

    const metrics = compileMetricsPayload(
      apexInstruments,
      [],
      [],
      [],
      [],
      "synthetic_seed",
      "inst-synth-001"
    );

    assert.strictEqual(metrics.scope.institutionId, "inst-synth-001");
    assert.strictEqual(metrics.instruments.every((i) => i.institutionId === "inst-synth-001"), true);
  });

  it("should never overwrite or double-count a superseded replacement instrument", () => {
    const historicalPredecessor: FdrInstrumentDto = {
      id: "fdr-hist-01",
      institutionId: "inst-01",
      institutionName: "Inst A",
      fdrNumber: "FDR-HIST-001",
      bankName: "SBI",
      branchName: "Main",
      ifscCode: "SBIN0001",
      amount: 1000000,
      issueDate: "2020-01-01T00:00:00Z",
      maturityDate: "2023-01-01T00:00:00Z",
      tenureMonths: 36,
      interestRate: 6.5,
      jointHolderName: "Officer",
      isLienMarked: true,
      verificationState: "VERIFIED",
      administrativeState: "RENEWED",
      renewalState: "REPLACED_SUPERSEDED",
      predecessorId: null,
      daysToMaturity: -1000,
      maturityStatus: "EXPIRED",
      documentsCount: 1,
      alertsCount: 0,
      createdAt: "2020-01-01T00:00:00Z",
      updatedAt: "2023-01-01T00:00:00Z",
    };

    const activeReplacement: FdrInstrumentDto = {
      id: "fdr-active-02",
      institutionId: "inst-01",
      institutionName: "Inst A",
      fdrNumber: "FDR-REPL-002",
      bankName: "SBI",
      branchName: "Main",
      ifscCode: "SBIN0001",
      amount: 1200000,
      issueDate: "2023-01-01T00:00:00Z",
      maturityDate: "2028-01-01T00:00:00Z",
      tenureMonths: 60,
      interestRate: 7.0,
      jointHolderName: "Officer",
      isLienMarked: true,
      verificationState: "VERIFIED",
      administrativeState: "PLEDGED_ACTIVE",
      renewalState: "RENEWED_ACTIVE",
      predecessorId: "fdr-hist-01", // Link to historical predecessor
      daysToMaturity: 400,
      maturityStatus: "NORMAL",
      documentsCount: 2,
      alertsCount: 0,
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-01T00:00:00Z",
    };

    const metrics = compileMetricsPayload(
      [historicalPredecessor, activeReplacement],
      [],
      [],
      [],
      [],
      "database"
    );

    // Only the active replacement is counted in total active capital
    assert.strictEqual(metrics.overview.activeInstrumentCount, 1);
    assert.strictEqual(metrics.overview.totalPledgedCapital, 1200000);
    assert.strictEqual(metrics.instruments.length, 1);
    assert.strictEqual(metrics.instruments[0].id, "fdr-active-02");
    assert.strictEqual(metrics.instruments[0].predecessorId, "fdr-hist-01");
  });
});
