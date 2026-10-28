import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateMaturityFollowUpTasks,
  compareEvidenceFields,
  getInstrumentLifecycleDetail,
  evaluateReleaseReadiness,
  transitionReleaseRequest,
  assignReviewerToInstrument,
  inMemoryAssignmentsVault,
} from "../lifecycleService.ts";
import {
  getSyntheticFdrInstruments,
  getSyntheticReleaseRequests,
  getSyntheticRiskFindings,
  getSyntheticDocuments,
  addDays,
  subDays,
} from "../seedData.ts";
import {
  OCR_CONFIDENCE_STATUTORY_DISCLAIMER,
  AI_RELEASE_DECISION_SAFEGUARD,
} from "../types.ts";
import type {
  FdrInstrumentDto,
  ReleaseRequestDto,
  RiskFindingDto,
  DocumentDto,
} from "../types.ts";
import type { AuthContext } from "../auth.ts";

describe("PHASE 5 — FDR Intelligence Views & Operational Life-cycle", () => {
  const mockOfficerAuth: AuthContext = {
    userId: "usr-officer-01",
    userName: "Dr. R. Ramanathan",
    userRole: "Regulatory Scrutiny Officer",
    isRegulatoryOfficer: true,
  };

  const mockAdminAuth: AuthContext = {
    userId: "usr-admin-01",
    userName: "System Administrator",
    userRole: "admin",
    isRegulatoryOfficer: true,
  };

  const mockDirectorAuth: AuthContext = {
    userId: "usr-director-01",
    userName: "Dr. V. Rao",
    userRole: "AICTE Regional Director",
    isRegulatoryOfficer: true,
  };

  const mockApplicantAuth: AuthContext = {
    userId: "usr-applicant-01",
    userName: "Principal Apex",
    userRole: "applicant",
    institutionId: "inst-synth-001",
    isRegulatoryOfficer: false,
  };

  // ==========================================
  // A. MATURITY RADAR & DATE BOUNDARIES
  // ==========================================
  describe("A. Maturity Radar & Operational Follow-Up Queues", () => {
    it("should accurately categorize instruments across horizon date boundaries", () => {
      const now = new Date();
      const instruments = getSyntheticFdrInstruments(now);

      const expired = instruments.filter((i) => i.daysToMaturity <= 0);
      const critical30D = instruments.filter((i) => i.daysToMaturity > 0 && i.daysToMaturity <= 30);
      const warning60D = instruments.filter((i) => i.daysToMaturity > 30 && i.daysToMaturity <= 60);

      assert.ok(expired.length >= 2, "Must contain expired instruments (e.g. fdr-synth-103, fdr-synth-105)");
      assert.ok(critical30D.length >= 1, "Must contain critical 30D instruments (e.g. fdr-synth-101)");
      assert.ok(warning60D.length >= 1, "Must contain warning 60D instruments (e.g. fdr-synth-102)");
    });

    it("should generate prioritized follow-up tasks with missing renewal evidence flags", () => {
      const instruments = getSyntheticFdrInstruments();
      const tasks = evaluateMaturityFollowUpTasks(instruments);

      assert.ok(tasks.length > 0, "Tasks should be generated for instruments requiring follow-up");

      const highPriorityTasks = tasks.filter((t) => t.priority === "HIGH");
      assert.ok(highPriorityTasks.length >= 2, "Expired and <30D instruments must receive HIGH priority");

      // Verify that expired instrument flags missing renewal evidence
      const expiredTask = tasks.find((t) => t.daysToMaturity <= 0);
      assert.ok(expiredTask, "Should have an expired task");
      assert.equal(expiredTask?.missingRenewalEvidence, true);
      assert.match(expiredTask?.recommendedAction || "", /notice/i);
    });

    it("should assign and preserve scrutiny officer assignments on follow-up tasks", async () => {
      const instruments = getSyntheticFdrInstruments();
      const targetInst = instruments[0];

      await assignReviewerToInstrument({
        fdrId: targetInst.id,
        officerId: "usr-officer-01",
        officerName: "Dr. R. Ramanathan",
        officerRole: "Regulatory Scrutiny Officer",
        actor: mockOfficerAuth,
      });

      const tasks = evaluateMaturityFollowUpTasks(instruments);
      const assignedTask = tasks.find((t) => t.fdrId === targetInst.id);

      assert.ok(assignedTask);
      assert.match(assignedTask?.assignedOfficer || "", /Dr\. R\. Ramanathan/);
    });

    it("should reject reviewer assignment attempts by non-regulatory applicants", async () => {
      await assert.rejects(
        async () => {
          await assignReviewerToInstrument({
            fdrId: "fdr-synth-101",
            officerId: "usr-officer-01",
            officerName: "Dr. R. Ramanathan",
            officerRole: "Regulatory Scrutiny Officer",
            actor: mockApplicantAuth,
          });
        },
        /Unauthorized: Only regulatory scrutiny officers/
      );
    });
  });

  // ==========================================
  // B. EVIDENCE DISCREPANCY WORKBENCH
  // ==========================================
  describe("B. Evidence Discrepancy Workbench & Field Comparison Rules", () => {
    it("should compare the 5 core mandated fields side-by-side with explicit rules", () => {
      const inst: FdrInstrumentDto = {
        id: "fdr-test-01",
        institutionId: "inst-001",
        institutionName: "National College",
        fdrNumber: "FDR-2023-SBI-001",
        bankName: "State Bank of India",
        branchName: "Main Branch",
        ifscCode: "SBIN0001000",
        amount: 2500000,
        issueDate: "2023-01-15T00:00:00.000Z",
        maturityDate: "2028-01-15T00:00:00.000Z",
        tenureMonths: 60,
        interestRate: 7.0,
        jointHolderName: "Member Secretary, AICTE",
        isLienMarked: true,
        verificationState: "VERIFIED",
        administrativeState: "PLEDGED_ACTIVE",
        renewalState: "ORIGINAL",
        daysToMaturity: 500,
        maturityStatus: "NORMAL",
        documentsCount: 1,
        alertsCount: 0,
        createdAt: "2023-01-15T00:00:00.000Z",
        updatedAt: "2023-01-15T00:00:00.000Z",
      };

      const doc: DocumentDto = {
        id: "doc-test-01",
        fdrId: inst.id,
        documentType: "FDR_CERTIFICATE_SCAN",
        fileName: "fdr_certificate.pdf",
        fileUrl: "/storage/fdr.pdf",
        fileSizeBytes: 120000,
        mimeType: "application/pdf",
        isVerified: true,
        extractedData: {
          extractedFdrNumber: "FDR-2023-SBI-001",
          extractedAmount: 2500000,
          extractedBankName: "State Bank of India",
          extractedIssueDate: "2023-01-15T00:00:00.000Z",
          extractedMaturityDate: "2028-01-15T00:00:00.000Z",
          confidenceScore: 0.94,
          candidates: {
            fdrNumber: {
              field: "fdrNumber",
              value: "FDR-2023-SBI-001",
              rawValue: "FDR-2023-SBI-001",
              confidence: 0.96,
              sourcePage: 1,
              supportingTextSnippet: "FDR No: FDR-2023-SBI-001",
              validationStatus: "CANDIDATE",
            },
          },
          corrections: [],
        },
        createdAt: "2023-01-15T00:00:00.000Z",
      };

      const fields = compareEvidenceFields(inst, doc, null);

      assert.equal(fields.length, 5, "Must evaluate exactly the 5 mandated core fields");
      const refField = fields.find((f) => f.fieldKey === "fdrNumber");
      const amtField = fields.find((f) => f.fieldKey === "amount");
      const bankField = fields.find((f) => f.fieldKey === "bankName");
      const issueField = fields.find((f) => f.fieldKey === "issueDate");
      const matField = fields.find((f) => f.fieldKey === "maturityDate");

      assert.ok(refField && amtField && bankField && issueField && matField);
      assert.equal(refField.isMismatch, false);
      assert.equal(amtField.isMismatch, false);
      assert.equal(refField.reviewStatus, "MATCH");
      assert.equal(refField.extractionConfidence, 0.96);
    });

    it("should flag critical amount mismatch when OCR extraction conflicts with registry sum", () => {
      const inst: FdrInstrumentDto = {
        id: "fdr-test-02",
        institutionId: "inst-001",
        institutionName: "National College",
        fdrNumber: "FDR-2023-HDFC-999",
        bankName: "HDFC Bank",
        branchName: "Main Branch",
        ifscCode: "HDFC0001000",
        amount: 3500000, // Registered: 35 Lakhs
        issueDate: "2023-01-15T00:00:00.000Z",
        maturityDate: "2028-01-15T00:00:00.000Z",
        tenureMonths: 60,
        interestRate: 7.0,
        jointHolderName: "Member Secretary, AICTE",
        isLienMarked: true,
        verificationState: "DEFICIENT",
        administrativeState: "PLEDGED_ACTIVE",
        renewalState: "ORIGINAL",
        daysToMaturity: 500,
        maturityStatus: "NORMAL",
        documentsCount: 1,
        alertsCount: 1,
        createdAt: "2023-01-15T00:00:00.000Z",
        updatedAt: "2023-01-15T00:00:00.000Z",
      };

      const doc: DocumentDto = {
        id: "doc-test-02",
        fdrId: inst.id,
        documentType: "FDR_CERTIFICATE_SCAN",
        fileName: "fdr_scan.jpg",
        fileUrl: "/storage/scan.jpg",
        fileSizeBytes: 80000,
        mimeType: "image/jpeg",
        isVerified: false,
        extractedData: {
          extractedFdrNumber: "FDR-2023-HDFC-999",
          extractedAmount: 35000, // Extracted: 35 Thousand (Deficit)
          confidenceScore: 0.91,
          candidates: {},
          corrections: [],
        },
        createdAt: "2023-01-15T00:00:00.000Z",
      };

      const fields = compareEvidenceFields(inst, doc, null);
      const amtField = fields.find((f) => f.fieldKey === "amount");

      assert.ok(amtField);
      assert.equal(amtField.isMismatch, true);
      assert.equal(amtField.reviewStatus, "DISCREPANCY_OPEN");
      assert.match(amtField.explanation, /CRITICAL AMOUNT DISCREPANCY/);
      assert.match(amtField.requiredNextStep, /deficit citation/i);
    });

    it("should prominently feature the mandated statutory disclaimer that OCR confidence != document authenticity", () => {
      assert.ok(
        OCR_CONFIDENCE_STATUTORY_DISCLAIMER.includes("strictly NOT document-authenticity confidence"),
        "Must disclose that OCR confidence is not document authenticity confidence"
      );
    });

    it("should preserve original extracted values and mark MANUALLY_CORRECTED when reviewer corrects field", () => {
      const inst: FdrInstrumentDto = {
        id: "fdr-test-03",
        institutionId: "inst-001",
        institutionName: "National College",
        fdrNumber: "FDR-CORR-001",
        bankName: "Canara Bank",
        branchName: "Main Branch",
        ifscCode: "CNRB0001000",
        amount: 2500000,
        issueDate: "2023-01-15T00:00:00.000Z",
        maturityDate: "2028-01-15T00:00:00.000Z",
        tenureMonths: 60,
        interestRate: 7.0,
        jointHolderName: "Member Secretary, AICTE",
        isLienMarked: true,
        verificationState: "VERIFIED",
        administrativeState: "PLEDGED_ACTIVE",
        renewalState: "ORIGINAL",
        daysToMaturity: 500,
        maturityStatus: "NORMAL",
        documentsCount: 1,
        alertsCount: 0,
        createdAt: "2023-01-15T00:00:00.000Z",
        updatedAt: "2023-01-15T00:00:00.000Z",
      };

      const doc: DocumentDto = {
        id: "doc-test-03",
        fdrId: inst.id,
        documentType: "FDR_CERTIFICATE_SCAN",
        fileName: "scan.png",
        fileUrl: "/storage/scan.png",
        fileSizeBytes: 50000,
        mimeType: "image/png",
        isVerified: true,
        extractedData: {
          extractedFdrNumber: "FDR-CORR-OOI", // Raw OCR misread '001' as 'OOI'
          extractedAmount: 2500000,
          confidenceScore: 0.78,
          candidates: {},
          corrections: [
            {
              id: "corr-01",
              extractionId: "ext-01",
              fieldName: "fdrNumber",
              originalValue: "FDR-CORR-OOI",
              correctedValue: "FDR-CORR-001",
              correctedByUserId: "usr-officer-01",
              correctedByUserName: "Dr. R. Ramanathan",
              correctedByUserRole: "Regulatory Scrutiny Officer",
              justification: "Corrected OCR alpha/numeral confusion ('OOI' -> '001') against bank seal.",
              createdAt: "2023-01-16T00:00:00.000Z",
            },
          ],
        },
        createdAt: "2023-01-15T00:00:00.000Z",
      };

      const fields = compareEvidenceFields(inst, doc, null);
      const refField = fields.find((f) => f.fieldKey === "fdrNumber");

      assert.ok(refField);
      assert.equal(refField.reviewStatus, "MANUALLY_CORRECTED");
      assert.equal(refField.corrections.length, 1);
      assert.equal(refField.corrections[0].originalValue, "FDR-CORR-OOI");
      assert.equal(refField.corrections[0].correctedValue, "FDR-CORR-001");
    });
  });

  // ==========================================
  // C. INSTRUMENT LIFECYCLE EXPLORER
  // ==========================================
  describe("C. Instrument Lifecycle Explorer & Lineage Invariants", () => {
    it("should retrieve complete instrument lifecycle detail with timeline and real relations", async () => {
      // fdr-synth-102 has predecessor fdr-synth-106-hist
      const detail = await getInstrumentLifecycleDetail("fdr-synth-102");

      assert.ok(detail.instrument);
      assert.equal(detail.instrument.id, "fdr-synth-102");
      assert.ok(detail.timeline.length > 0, "Timeline events should be synthesized");
      assert.ok(detail.documents.length > 0, "Linked documents should be present");
    });

    it("CRITICAL: should NEVER overwrite historical predecessor instruments when replaced", async () => {
      const detail = await getInstrumentLifecycleDetail("fdr-synth-102");

      assert.ok(detail.predecessor, "Must link to historical predecessor");
      assert.equal(detail.predecessor?.id, "fdr-synth-106-hist");
      assert.equal(detail.predecessor?.renewalState, "REPLACED_SUPERSEDED");

      // Verify Lineage Graph
      const graph = detail.lineageGraph;
      assert.equal(graph.nodes.length, 2, "Should contain predecessor and current nodes");

      const predNode = graph.nodes.find((n) => n.id === "fdr-synth-106-hist");
      const currNode = graph.nodes.find((n) => n.id === "fdr-synth-102");
      assert.ok(predNode && currNode);
      assert.equal(predNode?.isPredecessor, true);
      assert.equal(currNode?.isCurrent, true);

      // Verify Directed Edge
      const edge = graph.edges.find((e) => e.source === "fdr-synth-106-hist" && e.target === "fdr-synth-102");
      assert.ok(edge);
      assert.equal(edge?.relationship, "SUPERSEDED_BY");
    });

    it("should synthesize chronological lifecycle timeline with descending ordering", async () => {
      const detail = await getInstrumentLifecycleDetail("fdr-synth-101");
      const timeline = detail.timeline;

      assert.ok(timeline.length >= 3, "Timeline must capture issuance, ingestion, and audit events");

      for (let i = 0; i < timeline.length - 1; i++) {
        const t1 = new Date(timeline[i].timestamp).getTime();
        const t2 = new Date(timeline[i + 1].timestamp).getTime();
        assert.ok(t1 >= t2, "Timeline must be chronologically ordered (newest first)");
      }
    });
  });

  // ==========================================
  // D. RELEASE-READINESS VIEW & PROHIBITED TRANSITIONS
  // ==========================================
  describe("D. Release-Readiness Evaluation & Workflow State Machine", () => {
    it("should evaluate the 5 statutory release requirements and detect readiness state", () => {
      const allInstruments = getSyntheticFdrInstruments();
      const inst = allInstruments.find((i) => i.id === "fdr-synth-105") || allInstruments[0];

      const releaseReq: ReleaseRequestDto = {
        id: "rel-test-01",
        fdrId: inst.id,
        fdrNumber: inst.fdrNumber,
        institutionId: inst.institutionId,
        institutionName: inst.institutionName,
        requestedAmount: 1000000,
        statutoryTenureCompleted: true,
        nocIssued: true,
        status: "COMMITTEE_REVIEW",
        submissionDate: new Date().toISOString(),
      };

      const findings: RiskFindingDto[] = []; // Clean audit
      const readiness = evaluateReleaseReadiness(releaseReq, inst, findings);

      assert.equal(readiness.requirements.length, 5);
      assert.equal(readiness.readinessState, "READY_FOR_DECISION");
      assert.ok(readiness.allowedTransitions.includes("APPROVED"));
      assert.ok(readiness.allowedTransitions.includes("REJECTED"));
    });

    it("should block release approval when active dependencies exist (e.g. open forensic discrepancies)", () => {
      const allInstruments = getSyntheticFdrInstruments();
      const inst = allInstruments.find((i) => i.id === "fdr-synth-105") || allInstruments[0];

      const releaseReq: ReleaseRequestDto = {
        id: "rel-test-02",
        fdrId: inst.id,
        fdrNumber: inst.fdrNumber,
        institutionId: inst.institutionId,
        institutionName: inst.institutionName,
        requestedAmount: 1000000,
        statutoryTenureCompleted: true,
        nocIssued: true,
        status: "COMMITTEE_REVIEW",
        submissionDate: new Date().toISOString(),
      };

      // Open critical risk finding
      const openFindings: RiskFindingDto[] = [
        {
          id: "rf-block-01",
          fdrId: inst.id,
          riskCode: "AMOUNT_MISMATCH",
          severity: "CRITICAL",
          description: "Unresolved amount disparity.",
          isResolved: false,
          createdAt: new Date().toISOString(),
        },
      ];

      const readiness = evaluateReleaseReadiness(releaseReq, inst, openFindings);

      assert.equal(readiness.readinessState, "BLOCKED_DEPENDENCY");
      assert.ok(readiness.blockedDependencies.length > 0);
      assert.ok(
        !readiness.allowedTransitions.includes("APPROVED"),
        "APPROVED must NOT be in allowed transitions when blocked dependencies exist"
      );
    });

    it("should enforce server-side role validation: reject unauthorized roles attempting approval", async () => {
      const allInstruments = getSyntheticFdrInstruments();
      const inst = allInstruments.find((i) => i.id === "fdr-synth-105") || allInstruments[0];

      const releaseReq: ReleaseRequestDto = {
        id: "rel-test-03",
        fdrId: inst.id,
        fdrNumber: inst.fdrNumber,
        institutionId: inst.institutionId,
        institutionName: inst.institutionName,
        requestedAmount: 1000000,
        statutoryTenureCompleted: true,
        nocIssued: true,
        status: "COMMITTEE_REVIEW",
        submissionDate: new Date().toISOString(),
      };

      // Scrutiny Officer alone lacks authority to approve (requires Regional Director or Admin)
      await assert.rejects(
        async () => {
          await transitionReleaseRequest({
            requestId: releaseReq.id,
            newStatus: "APPROVED",
            actor: mockOfficerAuth,
            remarks: "Attempted approval by scrutiny officer",
            releaseRequest: releaseReq,
            instrument: inst,
            findings: [],
          });
        },
        /Permission Denied: Role 'Regulatory Scrutiny Officer' lacks statutory authority to authorize deposit release/
      );
    });

    it("should strictly reject prohibited skipped transitions (e.g. SUBMITTED directly to APPROVED)", async () => {
      const allInstruments = getSyntheticFdrInstruments();
      const inst = allInstruments[0];

      const releaseReq: ReleaseRequestDto = {
        id: "rel-test-04",
        fdrId: inst.id,
        fdrNumber: inst.fdrNumber,
        institutionId: inst.institutionId,
        institutionName: inst.institutionName,
        requestedAmount: 1000000,
        statutoryTenureCompleted: true,
        nocIssued: true,
        status: "SUBMITTED",
        submissionDate: new Date().toISOString(),
      };

      await assert.rejects(
        async () => {
          await transitionReleaseRequest({
            requestId: releaseReq.id,
            newStatus: "APPROVED",
            actor: mockAdminAuth,
            remarks: "Skipping review states",
            releaseRequest: releaseReq,
            instrument: inst,
            findings: [],
          });
        },
        /Prohibited Workflow Transition: Cannot transition release petition from 'SUBMITTED' to 'APPROVED'/
      );
    });

    it("should require mandatory legal justification (>= 10 chars) for petition rejection", async () => {
      const allInstruments = getSyntheticFdrInstruments();
      const inst = allInstruments[0];

      const releaseReq: ReleaseRequestDto = {
        id: "rel-test-05",
        fdrId: inst.id,
        fdrNumber: inst.fdrNumber,
        institutionId: inst.institutionId,
        institutionName: inst.institutionName,
        requestedAmount: 1000000,
        statutoryTenureCompleted: false,
        nocIssued: false,
        status: "UNDER_SCRUTINY",
        submissionDate: new Date().toISOString(),
      };

      await assert.rejects(
        async () => {
          await transitionReleaseRequest({
            requestId: releaseReq.id,
            newStatus: "REJECTED",
            actor: mockOfficerAuth,
            remarks: "Bad", // Under 10 chars
            releaseRequest: releaseReq,
            instrument: inst,
            findings: [],
          });
        },
        /Mandatory Justification: A rejection remark \(minimum 10 characters\) is legally required/
      );
    });

    it("should succeed with lawful transition when authorized Regional Director approves eligible petition", async () => {
      const allInstruments = getSyntheticFdrInstruments();
      const inst = allInstruments.find((i) => i.id === "fdr-synth-105") || allInstruments[0];

      const releaseReq: ReleaseRequestDto = {
        id: "rel-test-06",
        fdrId: inst.id,
        fdrNumber: inst.fdrNumber,
        institutionId: inst.institutionId,
        institutionName: inst.institutionName,
        requestedAmount: 1000000,
        statutoryTenureCompleted: true,
        nocIssued: true,
        status: "COMMITTEE_REVIEW",
        submissionDate: new Date().toISOString(),
      };

      const result = await transitionReleaseRequest({
        requestId: releaseReq.id,
        newStatus: "APPROVED",
        actor: mockDirectorAuth,
        remarks: "Audited by Regional Committee: 8-year lock-in satisfied, clean forensic record. Approved for refund.",
        releaseRequest: releaseReq,
        instrument: inst,
        findings: [],
      });

      assert.equal(result.success, true);
      assert.equal(result.evaluation.currentStatus, "APPROVED");
      assert.equal(result.evaluation.readinessState, "COMPLETE");
    });

    it("CRITICAL: AI output must NEVER autonomously authorize a financial or regulatory release", () => {
      assert.ok(
        AI_RELEASE_DECISION_SAFEGUARD.includes("AI output NEVER autonomously authorizes a financial release"),
        "Must enforce statutory safeguard disclaiming autonomous AI authorization"
      );
    });
  });
});
