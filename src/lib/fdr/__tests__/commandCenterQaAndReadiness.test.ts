import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { compileMetricsPayload } from "../calculations.ts";
import {
  evaluateAlertCandidates,
  constructAlertDeduplicationKey,
  clearInMemoryAlerts,
} from "../alertEngine.ts";
import {
  evaluateMaturityFollowUpTasks,
  compareEvidenceFields,
  getInstrumentLifecycleDetail,
  evaluateReleaseReadiness,
  transitionReleaseRequest,
} from "../lifecycleService.ts";
import {
  getSyntheticFdrInstruments,
  getSyntheticReleaseRequests,
  getSyntheticRiskFindings,
  getSyntheticAuditLogs,
  addDays,
  subDays,
} from "../seedData.ts";
import { calculateCompositeFdrRisk, resolveRiskFinding } from "../riskEngine.ts";
import { verifyFdrAccess } from "../auth.ts";
import type {
  FdrInstrumentDto,
  ReleaseRequestDto,
  RiskFindingDto,
  AuditLogDto,
  AlertDto,
} from "../types.ts";
import type { AuthContext } from "../auth.ts";

describe("PHASE 7 — Command Center QA & SIH Demonstration Readiness", () => {
  const instruments = getSyntheticFdrInstruments();
  const releaseRequests = getSyntheticReleaseRequests();
  const riskFindings = getSyntheticRiskFindings();
  const auditLogs = getSyntheticAuditLogs();

  describe("1. KPI Calculations & Non-Overwriting Capital Preservation", () => {
    it("should compute active pledged capital strictly excluding superseded/released instruments", () => {
      const metrics = compileMetricsPayload(
        instruments,
        releaseRequests,
        [],
        riskFindings,
        auditLogs,
        "synthetic_seed"
      );

      // Total instruments in seed includes 1 historical superseded predecessor
      assert.equal(instruments.length, 6, "Seed should have 6 total instruments including history");
      assert.equal(metrics.overview.activeInstrumentCount, 5, "Active count must exclude superseded predecessor");

      // Verify historical predecessor is not in active capital sum
      const historical = instruments.find((i) => i.renewalState === "REPLACED_SUPERSEDED");
      assert.ok(historical, "Historical predecessor must exist");
      assert.equal(historical.amount, 2000000);

      const activeInstruments = instruments.filter(
        (i) => i.renewalState !== "REPLACED_SUPERSEDED" && i.administrativeState !== "RELEASED"
      );
      const expectedSum = activeInstruments.reduce((acc, i) => acc + i.amount, 0);
      assert.equal(metrics.overview.totalPledgedCapital, expectedSum);
      assert.equal(metrics.overview.totalPledgedCapital, 11000000); // 35L + 25L + 15L + 25L + 10L = 110L
    });

    it("should compute lien confirmation rate correctly and handle 0 instruments without NaN", () => {
      const emptyMetrics = compileMetricsPayload([], [], [], [], [], "synthetic_seed");
      assert.equal(emptyMetrics.overview.lienConfirmationRate, 0, "Empty instruments must yield 0% not NaN");
      assert.equal(emptyMetrics.overview.totalPledgedCapital, 0);
      assert.equal(emptyMetrics.overview.activeInstrumentCount, 0);

      const normalMetrics = compileMetricsPayload(
        instruments,
        releaseRequests,
        [],
        riskFindings,
        auditLogs,
        "synthetic_seed"
      );
      const active = instruments.filter(
        (i) => i.renewalState !== "REPLACED_SUPERSEDED" && i.administrativeState !== "RELEASED"
      );
      const lienCount = active.filter((i) => i.isLienMarked).length;
      const expectedRate = Math.round((lienCount / active.length) * 100);
      assert.equal(normalMetrics.overview.lienConfirmationRate, expectedRate);
    });
  });

  describe("2. Date Boundary Calculations for Maturity Horizons", () => {
    const baseInst: FdrInstrumentDto = {
      id: "fdr-test-boundary",
      institutionId: "inst-test",
      institutionName: "Test Institute",
      fdrNumber: "FDR-TEST-001",
      bankName: "State Bank of India",
      branchName: "Main Branch",
      ifscCode: "SBIN0001234",
      amount: 1000000,
      issueDate: new Date().toISOString(),
      maturityDate: new Date().toISOString(),
      tenureMonths: 12,
      interestRate: 7.0,
      jointHolderName: "Regional Officer",
      isLienMarked: true,
      lienConfirmedAt: new Date().toISOString(),
      verificationState: "VERIFIED",
      administrativeState: "PLEDGED_ACTIVE",
      renewalState: "ORIGINAL",
      predecessorId: null,
      daysToMaturity: 0,
      maturityStatus: "NORMAL",
      documentsCount: 1,
      alertsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it("should classify daysToMaturity = 0 as Matured / Expired with high priority action", () => {
      const inst = { ...baseInst, daysToMaturity: 0 };
      const tasks = evaluateMaturityFollowUpTasks([inst]);
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].priority, "HIGH");
      assert.ok(tasks[0].recommendedAction.toLowerCase().includes("encashment") || tasks[0].recommendedAction.toLowerCase().includes("renewal"));
    });

    it("should classify negative daysToMaturity as Overdue with high priority show-cause notice", () => {
      const inst = { ...baseInst, daysToMaturity: -15 };
      const tasks = evaluateMaturityFollowUpTasks([inst]);
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].priority, "HIGH");
      assert.ok(tasks[0].recommendedAction.toLowerCase().includes("notice") || tasks[0].recommendedAction.toLowerCase().includes("encashment"));
    });

    it("should classify daysToMaturity = 30 within the critical 30-day window", () => {
      const inst = { ...baseInst, daysToMaturity: 30 };
      const metrics = compileMetricsPayload([inst], [], [], [], [], "synthetic_seed");
      assert.equal(metrics.overview.upcomingMaturitiesCount30D, 1);
    });

    it("should classify daysToMaturity = 31 outside 30D and inside 60D window", () => {
      const inst = { ...baseInst, daysToMaturity: 31 };
      const metrics = compileMetricsPayload([inst], [], [], [], [], "synthetic_seed");
      assert.equal(metrics.overview.upcomingMaturitiesCount30D, 0);
      assert.equal(metrics.overview.upcomingMaturitiesCount60D, 1);
    });

    it("should classify daysToMaturity = 60 inside 60D window", () => {
      const inst = { ...baseInst, daysToMaturity: 60 };
      const metrics = compileMetricsPayload([inst], [], [], [], [], "synthetic_seed");
      assert.equal(metrics.overview.upcomingMaturitiesCount60D, 1);
      assert.equal(metrics.overview.upcomingMaturitiesCount90D, 0);
    });

    it("should classify daysToMaturity = 91 as Healthy outside all warning windows", () => {
      const inst = { ...baseInst, daysToMaturity: 91 };
      const metrics = compileMetricsPayload([inst], [], [], [], [], "synthetic_seed");
      assert.equal(metrics.overview.upcomingMaturitiesCount30D, 0);
      assert.equal(metrics.overview.upcomingMaturitiesCount60D, 0);
      assert.equal(metrics.overview.upcomingMaturitiesCount90D, 0);
    });
  });

  describe("3. Duplicate Alert Prevention & Idempotency", () => {
    it("should generate deterministic deduplication keys matching ${fdrId}__${alertType}", () => {
      const key1 = constructAlertDeduplicationKey("fdr-101", "MATURITY_CRITICAL_30D");
      const key2 = constructAlertDeduplicationKey("fdr-101", "MATURITY_CRITICAL_30D");
      assert.equal(key1, "fdr-101__MATURITY_CRITICAL_30D");
      assert.equal(key1, key2, "Repeated calls must produce identical keys");
    });

    it("should never duplicate alert candidates across consecutive refresh cycles", () => {
      clearInMemoryAlerts();
      const candidates1 = evaluateAlertCandidates(instruments, riskFindings);
      const candidates2 = evaluateAlertCandidates(instruments, riskFindings);

      assert.equal(candidates1.length, candidates2.length);

      const keys1 = candidates1.map((c) => constructAlertDeduplicationKey(c.fdrId, c.alertType));
      const keys2 = candidates2.map((c) => constructAlertDeduplicationKey(c.fdrId, c.alertType));

      assert.deepEqual(keys1, keys2, "Alert candidates across refresh cycles must be strictly identical");

      // Verify no duplicate keys within a single candidate set
      const uniqueKeys = new Set(keys1);
      assert.equal(keys1.length, uniqueKeys.size, "Candidates within a single evaluation must have zero duplicate keys");
    });
  });

  describe("4. Security Boundaries, Role Scoping & Access Control", () => {
    const institutionUserAuth: AuthContext = {
      userId: "usr-inst-01",
      userName: "Registrar Apex",
      userRole: "institution_admin",
      institutionId: "inst-synth-001",
      isRegulatoryOfficer: false,
    };

    const scrutinyOfficerAuth: AuthContext = {
      userId: "usr-officer-01",
      userName: "Dr. R. Ramanathan",
      userRole: "Regulatory Scrutiny Officer",
      isRegulatoryOfficer: true,
    };

    it("should allow institution users to view their own FDRs but block other institutions", () => {
      const ownAccess = verifyFdrAccess(institutionUserAuth, "inst-synth-001");
      assert.equal(ownAccess.allowed, true);

      const crossAccess = verifyFdrAccess(institutionUserAuth, "inst-synth-002");
      assert.equal(crossAccess.allowed, false);
      assert.ok(crossAccess.reason?.includes("not authorized"));
    });

    it("should allow regulatory scrutiny officers broad oversight across all institutions", () => {
      const access1 = verifyFdrAccess(scrutinyOfficerAuth, "inst-synth-001");
      const access2 = verifyFdrAccess(scrutinyOfficerAuth, "inst-synth-002");
      assert.equal(access1.allowed, true);
      assert.equal(access2.allowed, true);
    });

    it("should strictly reject discrepancy resolution attempts from non-officers", async () => {
      const result = await resolveRiskFinding({
        findingId: "risk-synth-001",
        fdrId: "fdr-synth-102",
        decision: "BANK_CONFIRMED",
        justification: "Valid substantive justification for resolving finding",
        officerId: "usr-inst-01",
        officerName: "Registrar Apex",
        officerRole: "student_applicant",
      });

      assert.equal(result.success, false);
      assert.ok(result.error?.includes("not authorized to resolve"));
    });
  });

  describe("5. Workflow State Machine & AI Decision Safeguard", () => {
    it("should reject skipping intermediate workflow states (e.g. SUBMITTED directly to APPROVED)", async () => {
      const officerAuth: AuthContext = {
        userId: "usr-officer",
        userName: "Dr. Officer",
        userRole: "Regulatory Scrutiny Officer",
        isRegulatoryOfficer: true,
      };

      const rel = releaseRequests[0];
      const targetFdr = instruments.find((i) => i.id === rel.fdrId)!;

      // When attempting invalid direct transition
      await assert.rejects(
        async () => {
          await transitionReleaseRequest({
            requestId: rel.id,
            newStatus: "DISBURSED",
            actor: officerAuth,
            remarks: "Attempting invalid direct disbursement",
            releaseRequest: rel,
            instrument: targetFdr,
            findings: [],
          });
        },
        (err: Error) => {
          return err.message.includes("Prohibited Workflow Transition");
        }
      );
    });

    it("should block approval of release petitions when blocked dependencies exist", async () => {
      const rel = releaseRequests[0];
      const targetFdr = instruments.find((i) => i.id === rel.fdrId)!;

      // Create a critical finding blocking the release
      const criticalFinding: RiskFindingDto = {
        id: "risk-critical-test",
        fdrId: targetFdr.id,
        fdrNumber: targetFdr.fdrNumber,
        institutionName: targetFdr.institutionName,
        riskCode: "CRITICAL_AMOUNT_MISMATCH",
        severity: "CRITICAL",
        description: "Severe amount discrepancy",
        isResolved: false,
        createdAt: new Date().toISOString(),
      };

      const evaluation = evaluateReleaseReadiness(rel, targetFdr, [criticalFinding]);
      assert.equal(evaluation.readinessState, "BLOCKED_DEPENDENCY");
      assert.ok(evaluation.blockedDependencies.length > 0);
      assert.equal(evaluation.allowedTransitions.includes("APPROVED"), false, "Approval must be blocked");
    });
  });

  describe("6. Evidence Discrepancy & Lineage Integrity", () => {
    it("should cross-compare 5 core fields and identify discrepancies accurately", () => {
      const targetInst = instruments.find((i) => i.id === "fdr-synth-102")!;
      const doc = {
        id: "doc-synth-03",
        fdrId: targetInst.id,
        documentType: "FDR_CERTIFICATE_SCAN" as const,
        fileName: "scan.pdf",
        fileUrl: "/docs/scan.pdf",
        fileSizeBytes: 2000000,
        mimeType: "application/pdf",
        isVerified: false,
        verifiedAt: null,
        extractedData: {
          extractedFdrNumber: targetInst.fdrNumber,
          extractedAmount: targetInst.amount,
          extractedBankName: targetInst.bankName,
          extractedIfsc: targetInst.ifscCode,
          extractedMaturityDate: targetInst.maturityDate,
          confidenceScore: 0.92,
        },
        createdAt: new Date().toISOString(),
      };

      const comparison = compareEvidenceFields(targetInst, doc, null);
      assert.equal(comparison.length, 5, "Must evaluate exactly 5 core fields");

      for (const field of comparison) {
        assert.ok(["fdrNumber", "bankName", "amount", "issueDate", "maturityDate"].includes(field.fieldKey));
      }
    });

    it("should construct lineage graph preserving historical predecessor without record overwriting", async () => {
      const detail = await getInstrumentLifecycleDetail("fdr-synth-102");
      assert.ok(detail, "Detail must be returned");
      assert.ok(detail.predecessor, "Predecessor must be linked");
      assert.equal(detail.predecessor.id, "fdr-synth-106-hist");
      assert.equal(detail.predecessor.renewalState, "REPLACED_SUPERSEDED");

      // Verify node graph structure
      const nodes = detail.lineageGraph.nodes;
      assert.equal(nodes.length, 2);
      const histNode = nodes.find((n) => n.id === "fdr-synth-106-hist")!;
      const currNode = nodes.find((n) => n.id === "fdr-synth-102")!;
      assert.equal(histNode.isPredecessor, true);
      assert.equal(currNode.isCurrent, true);

      const edge = detail.lineageGraph.edges[0];
      assert.equal(edge.source, "fdr-synth-106-hist");
      assert.equal(edge.target, "fdr-synth-102");
      assert.equal(edge.relationship, "SUPERSEDED_BY");
    });
  });

  describe("7. Empty and Error State Robustness", () => {
    it("should compute composite risk as NO_INDICATORS_FOUND (0) when 0 open findings exist", () => {
      const composite = calculateCompositeFdrRisk("fdr-clean", []);
      assert.equal(composite.score, 0);
      assert.equal(composite.evaluationStatus, "NO_INDICATORS_FOUND");
      assert.ok(composite.disclaimer.length > 0);
    });

    it("should produce valid empty follow-up queues when all instruments are healthy", () => {
      const healthyInst: FdrInstrumentDto = {
        ...instruments[0],
        daysToMaturity: 365,
        isLienMarked: true,
        renewalState: "ORIGINAL",
        predecessorId: null,
      };
      const tasks = evaluateMaturityFollowUpTasks([healthyInst]);
      assert.equal(tasks.length, 0, "No follow-up tasks required for healthy deposit");
    });
  });
});
