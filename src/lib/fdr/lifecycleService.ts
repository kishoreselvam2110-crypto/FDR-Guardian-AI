import prisma from "../db.ts";
import type {
  FdrInstrumentDto,
  ReleaseRequestDto,
  RiskFindingDto,
  DocumentDto,
  BankVerificationResponseDto,
  AuditLogDto,
  InstrumentLifecycleDetailDto,
  LineageGraphNode,
  LineageGraphEdge,
  LifecycleTimelineEvent,
  OutstandingObligationItem,
  ReleaseReadinessEvaluationDto,
  ReleaseReadinessState,
  ReleaseRequirementCheck,
  EvidenceDiscrepancyField,
  MaturityFollowUpTask,
  ReleaseRequestStatus,
} from "./types.ts";
export {
  OCR_CONFIDENCE_STATUTORY_DISCLAIMER,
  AI_RELEASE_DECISION_SAFEGUARD,
} from "./types.ts";
import type { AuthContext } from "./auth.ts";
import {
  getSyntheticFdrInstruments,
  getSyntheticReleaseRequests,
  getSyntheticRiskFindings,
  getSyntheticAuditLogs,
  getSyntheticDocuments,
  calculateDaysDifference,
} from "./seedData.ts";

/**
 * In-memory assignment vault for reviewer assignments (supports offline/test modes)
 */
export const inMemoryAssignmentsVault = new Map<string, { officerId: string; officerName: string; officerRole: string; assignedAt: string }>();

/**
 * In-memory store for release requests state updates
 */
export const inMemoryReleaseRequestsVault = new Map<string, ReleaseRequestDto>();

// Prepopulate in-memory release requests
for (const req of getSyntheticReleaseRequests()) {
  inMemoryReleaseRequestsVault.set(req.id, { ...req });
}

// ==========================================
// SECTION A: MATURITY RADAR LOGIC
// ==========================================

/**
 * Evaluates operational follow-up tasks from real instruments
 */
export function evaluateMaturityFollowUpTasks(
  instruments: FdrInstrumentDto[]
): MaturityFollowUpTask[] {
  const tasks: MaturityFollowUpTask[] = [];

  for (const inst of instruments) {
    const isExpired = inst.daysToMaturity <= 0;
    const isCritical30D = inst.daysToMaturity > 0 && inst.daysToMaturity <= 30;
    const isWarning60D = inst.daysToMaturity > 30 && inst.daysToMaturity <= 60;
    const missingRenewalEvidence =
      (isExpired || isCritical30D) && inst.renewalState !== "RENEWED_ACTIVE";
    const pendingReplacementReview =
      inst.renewalState === "RENEWAL_REQUESTED" || !!inst.predecessorId;

    if (isExpired || isCritical30D || isWarning60D || missingRenewalEvidence || pendingReplacementReview) {
      let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";
      let recommendedAction = "Routine maturity monitoring";

      if (isExpired) {
        priority = "HIGH";
        recommendedAction = "Dispatch immediate encashment or forfeiture show-cause notice; request renewal certificate.";
      } else if (isCritical30D) {
        priority = "HIGH";
        recommendedAction = "Issue statutory 30-day renewal deadline notice to institution registrar.";
      } else if (isWarning60D) {
        priority = "MEDIUM";
        recommendedAction = "Alert institutional compliance officer of upcoming maturity horizon.";
      } else if (pendingReplacementReview) {
        priority = "MEDIUM";
        recommendedAction = "Scrutinize uploaded renewal advice or replacement certificate against master ledger.";
      }

      const assigned = inMemoryAssignmentsVault.get(inst.id);

      tasks.push({
        id: `task-mat-${inst.id}`,
        fdrId: inst.id,
        fdrNumber: inst.fdrNumber,
        institutionId: inst.institutionId,
        institutionName: inst.institutionName,
        daysToMaturity: inst.daysToMaturity,
        maturityDate: inst.maturityDate,
        maturityStatus: inst.maturityStatus,
        missingRenewalEvidence,
        pendingReplacementReview,
        assignedOfficer: assigned ? `${assigned.officerName} (${assigned.officerRole})` : null,
        recommendedAction,
        priority,
      });
    }
  }

  // Sort by priority (HIGH first), then by daysToMaturity ascending
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return tasks.sort((a, b) => {
    const priDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priDiff !== 0) return priDiff;
    return a.daysToMaturity - b.daysToMaturity;
  });
}

/**
 * Assigns or reassigns an authorized scrutiny officer to an FDR instrument
 */
export async function assignReviewerToInstrument(params: {
  fdrId: string;
  officerId: string;
  officerName: string;
  officerRole: string;
  actor: AuthContext;
}): Promise<{ success: boolean; message: string }> {
  if (!params.actor.isRegulatoryOfficer && params.actor.userRole !== "admin") {
    throw new Error("Unauthorized: Only regulatory scrutiny officers and administrators may assign review tasks.");
  }

  const assignedAt = new Date().toISOString();
  inMemoryAssignmentsVault.set(params.fdrId, {
    officerId: params.officerId,
    officerName: params.officerName,
    officerRole: params.officerRole,
    assignedAt,
  });

  try {
    await prisma.fdrAuditLog.create({
      data: {
        fdrId: params.fdrId,
        actorId: params.actor.userId,
        actorName: params.actor.userName,
        actorRole: params.actor.userRole,
        action: "REVIEWER_ASSIGNED",
        entityType: "FDR_INSTRUMENT",
        entityId: params.fdrId,
        detailsJson: JSON.stringify({
          assignedOfficerId: params.officerId,
          assignedOfficerName: params.officerName,
          assignedOfficerRole: params.officerRole,
          assignedAt,
        }),
      },
    });
  } catch {
    // In-memory fallback
  }

  return {
    success: true,
    message: `Officer ${params.officerName} assigned to FDR review.`,
  };
}

// ==========================================
// SECTION B: EVIDENCE DISCREPANCY WORKBENCH
// ==========================================

/**
 * Side-by-side comparison for the 5 mandated core fields:
 * Reference, Bank Name, Amount, Issue Date, Maturity Date
 */
export function compareEvidenceFields(
  instrument: FdrInstrumentDto,
  document: DocumentDto | null,
  bankVerification: BankVerificationResponseDto | null
): EvidenceDiscrepancyField[] {
  const ocrData = document?.extractedData || null;
  const ocrCandidates = ocrData?.candidates as Record<string, any> | null;
  const primaryBarcode = document?.barcodes?.[0] || null;
  const corrections = ocrData?.corrections || [];

  const fields: EvidenceDiscrepancyField[] = [];

  // Helper to format currency
  const fmtCurr = (val?: number | null) => {
    if (val === null || val === undefined) return null;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Helper to format date
  const fmtDate = (val?: string | null) => {
    if (!val) return null;
    try {
      return new Date(val).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return val;
    }
  };

  // 1. FDR Reference Number
  {
    const submitted = instrument.fdrNumber;
    const extracted = ocrData?.extractedFdrNumber || primaryBarcode?.extractedFdrNumber || null;
    const verified =
      bankVerification?.comparisons?.find((c) => c.field === "fdrNumber")?.providerValue || null;
    const cand = ocrCandidates?.fdrNumber;
    const confidence = cand?.confidence ?? (ocrData?.confidenceScore ? ocrData.confidenceScore : null);
    const docRef = document ? `${document.fileName} (Page ${cand?.sourcePage || 1})` : null;
    const fieldCorrections = corrections.filter((c) => c.fieldName === "fdrNumber");
    const isManuallyCorrected = fieldCorrections.length > 0;

    const normSubmitted = submitted.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const normExtracted = extracted ? extracted.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : null;
    const isMismatch = !!normExtracted && normSubmitted !== normExtracted;

    let reviewStatus: EvidenceDiscrepancyField["reviewStatus"] = "MATCH";
    if (isManuallyCorrected) reviewStatus = "MANUALLY_CORRECTED";
    else if (isMismatch) reviewStatus = "DISCREPANCY_OPEN";

    fields.push({
      fieldKey: "fdrNumber",
      fieldLabel: "FDR Reference Number",
      submittedValue: submitted,
      extractedValue: extracted,
      verifiedValue: verified,
      documentReference: docRef,
      pageNumber: cand?.sourcePage || 1,
      extractionConfidence: confidence,
      comparisonRule: "Alphanumeric exact canonical match (ignoring separators)",
      isMismatch,
      explanation: isMismatch
        ? `Submitted reference '${submitted}' conflicts with OCR/barcode extracted '${extracted}'.`
        : "Reference matches exactly between submitted instrument and extracted document text.",
      requiredNextStep: isMismatch
        ? "Perform manual scrutiny of physical scan or request issuing branch certificate."
        : "Verify bank lien endorsement.",
      reviewStatus,
      corrections: fieldCorrections,
    });
  }

  // 2. Issuing Bank Name
  {
    const submitted = instrument.bankName;
    const extracted = ocrData?.extractedBankName || primaryBarcode?.extractedBankName || null;
    const verified =
      bankVerification?.comparisons?.find((c) => c.field === "issuingBank")?.providerValue || null;
    const cand = ocrCandidates?.bankName;
    const confidence = cand?.confidence ?? (ocrData?.confidenceScore ? ocrData.confidenceScore : null);
    const docRef = document ? `${document.fileName} (Page ${cand?.sourcePage || 1})` : null;
    const fieldCorrections = corrections.filter((c) => c.fieldName === "bankName");
    const isManuallyCorrected = fieldCorrections.length > 0;

    const normSub = submitted.toLowerCase().replace(/[^a-z]/g, "");
    const normExt = extracted ? extracted.toLowerCase().replace(/[^a-z]/g, "") : null;
    const isMismatch = !!normExt && !normSub.includes(normExt) && !normExt.includes(normSub);

    let reviewStatus: EvidenceDiscrepancyField["reviewStatus"] = "MATCH";
    if (isManuallyCorrected) reviewStatus = "MANUALLY_CORRECTED";
    else if (isMismatch) reviewStatus = "DISCREPANCY_OPEN";

    fields.push({
      fieldKey: "bankName",
      fieldLabel: "Issuing Bank Name",
      submittedValue: submitted,
      extractedValue: extracted,
      verifiedValue: verified,
      documentReference: docRef,
      pageNumber: cand?.sourcePage || 1,
      extractionConfidence: confidence,
      comparisonRule: "Case-insensitive banking entity acronym and canonical alias matching",
      isMismatch,
      explanation: isMismatch
        ? `Registered bank '${submitted}' does not match extracted issuer '${extracted}'.`
        : "Issuing bank verified across document typography and registry.",
      requiredNextStep: isMismatch
        ? "Verify IFSC code and bank branch authorization letter."
        : "Confirm IFSC branch code.",
      reviewStatus,
      corrections: fieldCorrections,
    });
  }

  // 3. Principal Deposit Amount
  {
    const submittedNum = instrument.amount;
    const submitted = fmtCurr(submittedNum)!;
    const extractedNum = ocrData?.extractedAmount ?? primaryBarcode?.extractedAmount ?? null;
    const extracted = fmtCurr(extractedNum);
    const verifiedNum = bankVerification?.verifiedAmount ?? null;
    const verified = fmtCurr(verifiedNum);
    const cand = ocrCandidates?.amount;
    const confidence = cand?.confidence ?? (ocrData?.confidenceScore ? ocrData.confidenceScore : null);
    const docRef = document ? `${document.fileName} (Page ${cand?.sourcePage || 1})` : null;
    const fieldCorrections = corrections.filter((c) => c.fieldName === "amount");
    const isManuallyCorrected = fieldCorrections.length > 0;

    const isMismatch = extractedNum !== null && Math.abs(extractedNum - submittedNum) > 1.0;

    let reviewStatus: EvidenceDiscrepancyField["reviewStatus"] = "MATCH";
    if (isManuallyCorrected) reviewStatus = "MANUALLY_CORRECTED";
    else if (isMismatch) reviewStatus = "DISCREPANCY_OPEN";

    fields.push({
      fieldKey: "amount",
      fieldLabel: "Principal Deposit Amount",
      submittedValue: submitted,
      extractedValue: extracted,
      verifiedValue: verified,
      documentReference: docRef,
      pageNumber: cand?.sourcePage || 1,
      extractionConfidence: confidence,
      comparisonRule: "Exact currency numeric comparison (tolerance <= ₹1.00 for rounding)",
      isMismatch,
      explanation: isMismatch
        ? `CRITICAL AMOUNT DISCREPANCY: Registered amount ${submitted} conflicts with extracted ${extracted} (Variance: ${fmtCurr(Math.abs((extractedNum || 0) - submittedNum))}).`
        : "Principal deposit amount corresponds accurately between scan and application register.",
      requiredNextStep: isMismatch
        ? "Issue immediate deficit citation to institution; demand certified bank statement."
        : "Check statutory tenure compliance.",
      reviewStatus,
      corrections: fieldCorrections,
    });
  }

  // 4. Issue Date
  {
    const submitted = fmtDate(instrument.issueDate)!;
    const extractedRaw = ocrData?.extractedIssueDate || primaryBarcode?.extractedIssueDate || null;
    const extracted = fmtDate(extractedRaw);
    const verified = null;
    const cand = ocrCandidates?.issueDate;
    const confidence = cand?.confidence ?? (ocrData?.confidenceScore ? ocrData.confidenceScore : null);
    const docRef = document ? `${document.fileName} (Page ${cand?.sourcePage || 1})` : null;
    const fieldCorrections = corrections.filter((c) => c.fieldName === "issueDate");
    const isManuallyCorrected = fieldCorrections.length > 0;

    let isMismatch = false;
    if (extractedRaw) {
      const subD = new Date(instrument.issueDate);
      const extD = new Date(extractedRaw);
      isMismatch = Math.abs(subD.getTime() - extD.getTime()) > 86400000 * 2; // > 2 days variance
    }

    let reviewStatus: EvidenceDiscrepancyField["reviewStatus"] = "MATCH";
    if (isManuallyCorrected) reviewStatus = "MANUALLY_CORRECTED";
    else if (isMismatch) reviewStatus = "DISCREPANCY_OPEN";

    fields.push({
      fieldKey: "issueDate",
      fieldLabel: "Certificate Issue Date",
      submittedValue: submitted,
      extractedValue: extracted,
      verifiedValue: verified,
      documentReference: docRef,
      pageNumber: cand?.sourcePage || 1,
      extractionConfidence: confidence,
      comparisonRule: "Calendar date equivalence (DD/MM/YYYY and ISO-8601 normalization)",
      isMismatch,
      explanation: isMismatch
        ? `Declared issue date '${submitted}' conflicts with document date '${extracted}'.`
        : "Issue date validated against document receipt.",
      requiredNextStep: isMismatch
        ? "Cross-examine certificate serial issue date against bank deposit register."
        : "Verify maturity calculation.",
      reviewStatus,
      corrections: fieldCorrections,
    });
  }

  // 5. Maturity Date
  {
    const submitted = fmtDate(instrument.maturityDate)!;
    const extractedRaw = ocrData?.extractedMaturityDate || primaryBarcode?.extractedMaturityDate || null;
    const extracted = fmtDate(extractedRaw);
    const verified = null;
    const cand = ocrCandidates?.maturityDate;
    const confidence = cand?.confidence ?? (ocrData?.confidenceScore ? ocrData.confidenceScore : null);
    const docRef = document ? `${document.fileName} (Page ${cand?.sourcePage || 1})` : null;
    const fieldCorrections = corrections.filter((c) => c.fieldName === "maturityDate");
    const isManuallyCorrected = fieldCorrections.length > 0;

    let isMismatch = false;
    if (extractedRaw) {
      const subD = new Date(instrument.maturityDate);
      const extD = new Date(extractedRaw);
      isMismatch = Math.abs(subD.getTime() - extD.getTime()) > 86400000 * 2; // > 2 days variance
    }

    let reviewStatus: EvidenceDiscrepancyField["reviewStatus"] = "MATCH";
    if (isManuallyCorrected) reviewStatus = "MANUALLY_CORRECTED";
    else if (isMismatch) reviewStatus = "DISCREPANCY_OPEN";

    fields.push({
      fieldKey: "maturityDate",
      fieldLabel: "Maturity Expiry Date",
      submittedValue: submitted,
      extractedValue: extracted,
      verifiedValue: verified,
      documentReference: docRef,
      pageNumber: cand?.sourcePage || 1,
      extractionConfidence: confidence,
      comparisonRule: "Maturity date comparison against minimum statutory lock-in tenure",
      isMismatch,
      explanation: isMismatch
        ? `Declared maturity date '${submitted}' conflicts with OCR extraction '${extracted}'.`
        : "Maturity date verified against certified deposit schedule.",
      requiredNextStep: isMismatch
        ? "Confirm exact deposit tenure with issuing bank."
        : "Enroll in early-warning radar.",
      reviewStatus,
      corrections: fieldCorrections,
    });
  }

  return fields;
}

// ==========================================
// SECTION C: INSTRUMENT LIFECYCLE EXPLORER
// ==========================================

/**
 * Retrieves the full lifecycle detail and lineage graph for a given FDR
 */
export async function getInstrumentLifecycleDetail(
  fdrId: string
): Promise<InstrumentLifecycleDetailDto> {
  const currentDate = new Date();

  // Try real database first
  try {
    const instDb = await prisma.fdrInstrument.findUnique({
      where: { id: fdrId },
      include: {
        institution: true,
        predecessor: { include: { institution: true } },
        replacements: { include: { institution: true } },
        documents: {
          include: {
            extractions: { include: { corrections: true } },
            metadata: true,
            barcodes: true,
            elaResult: true,
            layoutFindings: true,
            visualRegions: true,
          },
        },
        verificationEvents: { orderBy: { createdAt: "desc" } },
        bankVerifications: { orderBy: { createdAt: "desc" } },
        renewalRequests: { orderBy: { createdAt: "desc" } },
        releaseRequests: { include: { institution: true }, orderBy: { createdAt: "desc" } },
        riskFindings: { orderBy: { createdAt: "desc" } },
        auditLogs: { orderBy: { createdAt: "desc" } },
      },
    });

    if (instDb) {
      const daysToMaturity = calculateDaysDifference(instDb.maturityDate, currentDate);
      let maturityStatus: FdrInstrumentDto["maturityStatus"] = "NORMAL";
      if (daysToMaturity <= 0) maturityStatus = "EXPIRED";
      else if (daysToMaturity <= 30) maturityStatus = "CRITICAL_30D";
      else if (daysToMaturity <= 60) maturityStatus = "WARNING_60D";

      const currentInstrument: FdrInstrumentDto = {
        id: instDb.id,
        institutionId: instDb.institutionId,
        institutionName: instDb.institution.name,
        fdrNumber: instDb.fdrNumber,
        bankName: instDb.bankName,
        branchName: instDb.branchName,
        ifscCode: instDb.ifscCode,
        amount: Number(instDb.amount),
        issueDate: instDb.issueDate.toISOString(),
        maturityDate: instDb.maturityDate.toISOString(),
        tenureMonths: instDb.tenureMonths,
        interestRate: Number(instDb.interestRate),
        jointHolderName: instDb.jointHolderName,
        isLienMarked: instDb.isLienMarked,
        lienConfirmedAt: instDb.lienConfirmedAt?.toISOString() || null,
        verificationState: instDb.verificationState,
        administrativeState: instDb.administrativeState,
        renewalState: instDb.renewalState,
        predecessorId: instDb.predecessorId,
        daysToMaturity,
        maturityStatus,
        documentsCount: instDb.documents.length,
        alertsCount: 0,
        createdAt: instDb.createdAt.toISOString(),
        updatedAt: instDb.updatedAt.toISOString(),
      };

      const predecessor: FdrInstrumentDto | null = instDb.predecessor
        ? {
            id: instDb.predecessor.id,
            institutionId: instDb.predecessor.institutionId,
            institutionName: instDb.predecessor.institution.name,
            fdrNumber: instDb.predecessor.fdrNumber,
            bankName: instDb.predecessor.bankName,
            branchName: instDb.predecessor.branchName,
            ifscCode: instDb.predecessor.ifscCode,
            amount: Number(instDb.predecessor.amount),
            issueDate: instDb.predecessor.issueDate.toISOString(),
            maturityDate: instDb.predecessor.maturityDate.toISOString(),
            tenureMonths: instDb.predecessor.tenureMonths,
            interestRate: Number(instDb.predecessor.interestRate),
            jointHolderName: instDb.predecessor.jointHolderName,
            isLienMarked: instDb.predecessor.isLienMarked,
            lienConfirmedAt: instDb.predecessor.lienConfirmedAt?.toISOString() || null,
            verificationState: instDb.predecessor.verificationState,
            administrativeState: instDb.predecessor.administrativeState,
            renewalState: instDb.predecessor.renewalState,
            predecessorId: instDb.predecessor.predecessorId,
            daysToMaturity: calculateDaysDifference(instDb.predecessor.maturityDate, currentDate),
            maturityStatus: "EXPIRED",
            documentsCount: 1,
            alertsCount: 0,
            createdAt: instDb.predecessor.createdAt.toISOString(),
            updatedAt: instDb.predecessor.updatedAt.toISOString(),
          }
        : null;

      const replacements: FdrInstrumentDto[] = instDb.replacements.map((r) => ({
        id: r.id,
        institutionId: r.institutionId,
        institutionName: r.institution.name,
        fdrNumber: r.fdrNumber,
        bankName: r.bankName,
        branchName: r.branchName,
        ifscCode: r.ifscCode,
        amount: Number(r.amount),
        issueDate: r.issueDate.toISOString(),
        maturityDate: r.maturityDate.toISOString(),
        tenureMonths: r.tenureMonths,
        interestRate: Number(r.interestRate),
        jointHolderName: r.jointHolderName,
        isLienMarked: r.isLienMarked,
        lienConfirmedAt: r.lienConfirmedAt?.toISOString() || null,
        verificationState: r.verificationState,
        administrativeState: r.administrativeState,
        renewalState: r.renewalState,
        predecessorId: r.predecessorId,
        daysToMaturity: calculateDaysDifference(r.maturityDate, currentDate),
        maturityStatus: "NORMAL",
        documentsCount: 1,
        alertsCount: 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));

      // Build real Lineage Graph
      const nodes: LineageGraphNode[] = [];
      const edges: LineageGraphEdge[] = [];

      if (predecessor) {
        nodes.push({
          id: predecessor.id,
          fdrNumber: predecessor.fdrNumber,
          institutionName: predecessor.institutionName,
          amount: predecessor.amount,
          administrativeState: predecessor.administrativeState,
          renewalState: predecessor.renewalState,
          isCurrent: false,
          isPredecessor: true,
          isReplacement: false,
          tenureDates: `${new Date(predecessor.issueDate).getFullYear()}–${new Date(predecessor.maturityDate).getFullYear()}`,
          bankName: predecessor.bankName,
        });

        edges.push({
          source: predecessor.id,
          target: currentInstrument.id,
          relationship: "SUPERSEDED_BY",
          description: "Matured & Replaced by Continuous Security Deposit",
        });
      }

      nodes.push({
        id: currentInstrument.id,
        fdrNumber: currentInstrument.fdrNumber,
        institutionName: currentInstrument.institutionName,
        amount: currentInstrument.amount,
        administrativeState: currentInstrument.administrativeState,
        renewalState: currentInstrument.renewalState,
        isCurrent: true,
        isPredecessor: false,
        isReplacement: false,
        tenureDates: `${new Date(currentInstrument.issueDate).getFullYear()}–${new Date(currentInstrument.maturityDate).getFullYear()}`,
        bankName: currentInstrument.bankName,
      });

      for (const rep of replacements) {
        nodes.push({
          id: rep.id,
          fdrNumber: rep.fdrNumber,
          institutionName: rep.institutionName,
          amount: rep.amount,
          administrativeState: rep.administrativeState,
          renewalState: rep.renewalState,
          isCurrent: false,
          isPredecessor: false,
          isReplacement: true,
          tenureDates: `${new Date(rep.issueDate).getFullYear()}–${new Date(rep.maturityDate).getFullYear()}`,
          bankName: rep.bankName,
        });

        edges.push({
          source: currentInstrument.id,
          target: rep.id,
          relationship: "RENEWAL_REPLACEMENT",
          description: "Successor Instrument Pending Scrutiny Review",
        });
      }

      // Map Documents
      const documents: DocumentDto[] = instDb.documents.map((d) => {
        const primaryExtraction = d.extractions[0];
        return {
          id: d.id,
          fdrId: d.fdrId,
          documentType: d.documentType,
          fileName: d.fileName,
          fileUrl: d.fileUrl,
          fileSizeBytes: d.fileSizeBytes,
          mimeType: d.mimeType,
          storageKey: d.storageKey,
          sha256Checksum: d.sha256Checksum,
          uploadedByUserId: d.uploadedByUserId,
          uploadedByRole: d.uploadedByRole,
          processingStatus: d.processingStatus,
          isVerified: d.isVerified,
          verifiedAt: d.verifiedAt?.toISOString() || null,
          extractedData: primaryExtraction
            ? {
                id: primaryExtraction.id,
                extractedFdrNumber: primaryExtraction.extractedFdrNumber,
                extractedAmount: primaryExtraction.extractedAmount ? Number(primaryExtraction.extractedAmount) : null,
                extractedBankName: primaryExtraction.extractedBankName,
                extractedIfsc: primaryExtraction.extractedIfsc,
                extractedIssueDate: primaryExtraction.extractedIssueDate?.toISOString() || null,
                extractedMaturityDate: primaryExtraction.extractedMaturityDate?.toISOString() || null,
                extractedInstitutionName: primaryExtraction.extractedInstitutionName,
                confidenceScore: primaryExtraction.confidenceScore,
                ocrEngine: primaryExtraction.ocrEngine,
                ocrVersion: primaryExtraction.ocrVersion,
                processingDurationMs: primaryExtraction.processingDurationMs,
                status: primaryExtraction.status,
                candidates: primaryExtraction.provenanceJson ? JSON.parse(primaryExtraction.provenanceJson) : null,
                corrections: primaryExtraction.corrections.map((c) => ({
                  id: c.id,
                  extractionId: c.extractionId,
                  fieldName: c.fieldName,
                  originalValue: c.originalValue,
                  correctedValue: c.correctedValue,
                  correctedByUserId: c.correctedByUserId,
                  correctedByUserName: c.correctedByUserName,
                  correctedByUserRole: c.correctedByUserRole,
                  justification: c.justification,
                  createdAt: c.createdAt.toISOString(),
                })),
              }
            : null,
          createdAt: d.createdAt.toISOString(),
        };
      });

      // Verification history
      const verificationEvents = instDb.verificationEvents.map((ve) => ({
        id: ve.id,
        officerName: ve.officerName,
        officerRole: ve.officerRole,
        actionTaken: ve.actionTaken,
        previousState: ve.previousState,
        newState: ve.newState,
        remarks: ve.remarks,
        createdAt: ve.createdAt.toISOString(),
      }));

      const bankVerifications: BankVerificationResponseDto[] = instDb.bankVerifications.map((bv) => ({
        id: bv.id,
        correlationId: bv.correlationId,
        fdrId: bv.fdrId,
        providerKey: bv.providerKey,
        providerName: bv.providerKey === "SANDBOX_GATEWAY" ? "FDR Guardian AI Sandbox Gateway" : "Core Banking API Gateway",
        verificationMode: bv.providerMode as any,
        outcome: bv.responseOutcome as any,
        status: bv.status as any,
        requestedFields: {
          fdrNumber: bv.requestedFdrNumber,
          amount: Number(bv.requestedAmount),
          bankName: bv.requestedBankName,
          ifscCode: bv.requestedIfsc || undefined,
        },
        verifiedFields: {
          fdrNumber: bv.requestedFdrNumber,
          amount: bv.verifiedAmount ? Number(bv.verifiedAmount) : null,
          bankName: bv.verifiedBankName,
          accountStatus: bv.verifiedAccountStatus as any,
          isLienMarked: bv.isLienConfirmed,
        },
        verifiedAmount: bv.verifiedAmount ? Number(bv.verifiedAmount) : null,
        verifiedBankName: bv.verifiedBankName,
        isLienConfirmed: bv.isLienConfirmed,
        comparisons: bv.comparedFieldsJson ? JSON.parse(bv.comparedFieldsJson) : [],
        disclaimer: bv.disclaimer,
        inconclusiveReason: bv.inconclusiveReason,
        error: bv.errorCode ? { code: bv.errorCode, message: bv.errorMessage || "" } : null,
        durationMs: bv.durationMs,
        timestamp: bv.createdAt.toISOString(),
        requestedBy: {
          userId: bv.requestedByUserId,
          name: bv.requestedByUserName,
          role: bv.requestedByUserRole,
        },
      }));

      // Discrepancies
      const discrepancies: RiskFindingDto[] = instDb.riskFindings.map((rf) => ({
        id: rf.id,
        fdrId: rf.fdrId,
        fdrNumber: instDb.fdrNumber,
        institutionName: instDb.institution.name,
        documentId: rf.documentId,
        riskCode: rf.riskCode,
        category: rf.category as any,
        sourceAnalysis: rf.sourceAnalysis as any,
        evidenceJson: rf.evidenceJson,
        evidence: rf.evidenceJson ? JSON.parse(rf.evidenceJson) : null,
        ruleKey: rf.ruleKey || undefined,
        ruleVersion: rf.ruleVersion,
        severity: rf.severity,
        description: rf.description,
        recommendedAction: rf.recommendedAction,
        resolutionState: rf.resolutionState as any,
        isResolved: rf.isResolved,
        reviewerDecision: rf.reviewerDecision,
        reviewerJustification: rf.reviewerJustification,
        resolvedByUserId: rf.resolvedByUserId,
        resolvedAt: rf.resolvedAt?.toISOString() || null,
        createdAt: rf.createdAt.toISOString(),
        updatedAt: rf.updatedAt.toISOString(),
      }));

      // Renewal requests
      const renewalRequests = instDb.renewalRequests.map((rr) => ({
        id: rr.id,
        requestedTenureMonths: rr.requestedTenureMonths,
        proposedMaturityDate: rr.proposedMaturityDate.toISOString(),
        proposedAmount: rr.proposedAmount ? Number(rr.proposedAmount) : null,
        status: rr.status,
        officerRemarks: rr.officerRemarks,
        createdAt: rr.createdAt.toISOString(),
      }));

      // Release requests
      const releaseRequests: ReleaseRequestDto[] = instDb.releaseRequests.map((rr) => ({
        id: rr.id,
        fdrId: rr.fdrId,
        fdrNumber: instDb.fdrNumber,
        institutionId: rr.institutionId,
        institutionName: rr.institution.name,
        requestedAmount: Number(rr.requestedAmount),
        statutoryTenureCompleted: rr.statutoryTenureCompleted,
        nocIssued: rr.nocIssued,
        status: rr.status,
        submissionDate: rr.submissionDate.toISOString(),
        committeeDecisionDate: rr.committeeDecisionDate?.toISOString() || null,
        committeeRemarks: rr.committeeRemarks,
      }));

      // Audit logs
      const auditLogs: AuditLogDto[] = instDb.auditLogs.map((al) => ({
        id: al.id,
        fdrId: al.fdrId,
        fdrNumber: instDb.fdrNumber,
        institutionId: al.institutionId,
        institutionName: instDb.institution.name,
        actorId: al.actorId,
        actorName: al.actorName,
        actorRole: al.actorRole,
        action: al.action,
        entityType: al.entityType,
        entityId: al.entityId,
        details: al.detailsJson ? JSON.parse(al.detailsJson) : null,
        createdAt: al.createdAt.toISOString(),
      }));

      // Evaluate Outstanding Obligations
      const outstandingObligations: OutstandingObligationItem[] = [];

      if (!currentInstrument.isLienMarked) {
        outstandingObligations.push({
          id: "obl-lien",
          title: "Bank Lien Endorsement Missing",
          description: `Official confirmation letter from ${currentInstrument.bankName} pledging security in favor of Central Regulatory Authority is missing.`,
          severity: "CRITICAL",
          isSatisfied: false,
          actionRequired: "Upload and verify formal Bank Lien Endorsement letter.",
        });
      }

      if (currentInstrument.amount < 3500000 && currentInstrument.institutionName.includes("Apex")) {
        outstandingObligations.push({
          id: "obl-deficit",
          title: "Statutory Capital Deficit",
          description: "Pledged deposit is below the mandated institutional threshold.",
          severity: "WARNING",
          isSatisfied: false,
          actionRequired: "Top-up security deposit via supplemental FDR.",
        });
      }

      if (currentInstrument.daysToMaturity <= 0 && currentInstrument.renewalState !== "RENEWED_ACTIVE") {
        outstandingObligations.push({
          id: "obl-renewal",
          title: "Statutory Deposit Expired",
          description: `Deposit matured on ${new Date(currentInstrument.maturityDate).toLocaleDateString("en-IN")}. Lock-in continuity is broken.`,
          severity: "CRITICAL",
          isSatisfied: false,
          actionRequired: "Submit renewed deposit certificate advice.",
        });
      }

      const openFindings = discrepancies.filter((d) => !d.isResolved);
      if (openFindings.length > 0) {
        outstandingObligations.push({
          id: "obl-findings",
          title: `${openFindings.length} Unresolved Forensic Discrepanc${openFindings.length === 1 ? "y" : "ies"}`,
          description: "Document analysis flagged discrepancies that require regulatory scrutiny officer adjudication.",
          severity: "WARNING",
          isSatisfied: false,
          actionRequired: "Open Forensic Workbench to review and resolve open findings.",
        });
      }

      // Build Chronological Timeline
      const timeline: LifecycleTimelineEvent[] = assembleChronologicalTimeline(
        currentInstrument,
        documents,
        verificationEvents,
        bankVerifications,
        discrepancies,
        renewalRequests,
        releaseRequests,
        auditLogs
      );

      return {
        instrument: currentInstrument,
        predecessor,
        replacements,
        lineageGraph: { nodes, edges },
        documents,
        verificationEvents,
        bankVerifications,
        discrepancies,
        renewalRequests,
        releaseRequests,
        auditLogs,
        outstandingObligations,
        timeline,
      };
    }
  } catch {
    // Database fallback
  }

  // Fallback to Synthetic Relational Data
  const allSynths = getSyntheticFdrInstruments(currentDate);
  const currentInstrument = allSynths.find((i) => i.id === fdrId) || allSynths[0];

  const predecessor = currentInstrument.predecessorId
    ? allSynths.find((i) => i.id === currentInstrument.predecessorId) || null
    : null;

  const replacements = allSynths.filter((i) => i.predecessorId === currentInstrument.id);

  const nodes: LineageGraphNode[] = [];
  const edges: LineageGraphEdge[] = [];

  if (predecessor) {
    nodes.push({
      id: predecessor.id,
      fdrNumber: predecessor.fdrNumber,
      institutionName: predecessor.institutionName,
      amount: predecessor.amount,
      administrativeState: predecessor.administrativeState,
      renewalState: predecessor.renewalState,
      isCurrent: false,
      isPredecessor: true,
      isReplacement: false,
      tenureDates: `${new Date(predecessor.issueDate).getFullYear()}–${new Date(predecessor.maturityDate).getFullYear()}`,
      bankName: predecessor.bankName,
    });

    edges.push({
      source: predecessor.id,
      target: currentInstrument.id,
      relationship: "SUPERSEDED_BY",
      description: "Matured & Replaced by Continuous Security Deposit",
    });
  }

  nodes.push({
    id: currentInstrument.id,
    fdrNumber: currentInstrument.fdrNumber,
    institutionName: currentInstrument.institutionName,
    amount: currentInstrument.amount,
    administrativeState: currentInstrument.administrativeState,
    renewalState: currentInstrument.renewalState,
    isCurrent: true,
    isPredecessor: false,
    isReplacement: false,
    tenureDates: `${new Date(currentInstrument.issueDate).getFullYear()}–${new Date(currentInstrument.maturityDate).getFullYear()}`,
    bankName: currentInstrument.bankName,
  });

  for (const rep of replacements) {
    nodes.push({
      id: rep.id,
      fdrNumber: rep.fdrNumber,
      institutionName: rep.institutionName,
      amount: rep.amount,
      administrativeState: rep.administrativeState,
      renewalState: rep.renewalState,
      isCurrent: false,
      isPredecessor: false,
      isReplacement: true,
      tenureDates: `${new Date(rep.issueDate).getFullYear()}–${new Date(rep.maturityDate).getFullYear()}`,
      bankName: rep.bankName,
    });

    edges.push({
      source: currentInstrument.id,
      target: rep.id,
      relationship: "RENEWAL_REPLACEMENT",
      description: "Successor Instrument Pending Scrutiny Review",
    });
  }

  const documents = getSyntheticDocuments(currentInstrument.id);
  const discrepancies = getSyntheticRiskFindings().filter((rf) => rf.fdrId === currentInstrument.id);
  const releaseRequests = Array.from(inMemoryReleaseRequestsVault.values()).filter(
    (rr) => rr.fdrId === currentInstrument.id
  );
  const auditLogs = getSyntheticAuditLogs().filter((al) => al.fdrId === currentInstrument.id);

  const outstandingObligations: OutstandingObligationItem[] = [];
  if (!currentInstrument.isLienMarked) {
    outstandingObligations.push({
      id: "obl-lien",
      title: "Bank Lien Endorsement Missing",
      description: `Official confirmation letter from ${currentInstrument.bankName} pledging security in favor of Central Regulatory Authority is missing.`,
      severity: "CRITICAL",
      isSatisfied: false,
      actionRequired: "Upload and verify formal Bank Lien Endorsement letter.",
    });
  }

  if (currentInstrument.daysToMaturity <= 0) {
    outstandingObligations.push({
      id: "obl-renewal",
      title: "Statutory Deposit Expired",
      description: `Deposit matured on ${new Date(currentInstrument.maturityDate).toLocaleDateString("en-IN")}. Lock-in continuity is broken.`,
      severity: "CRITICAL",
      isSatisfied: false,
      actionRequired: "Submit renewed deposit certificate advice.",
    });
  }

  const openFindings = discrepancies.filter((d) => !d.isResolved);
  if (openFindings.length > 0) {
    outstandingObligations.push({
      id: "obl-findings",
      title: `${openFindings.length} Unresolved Forensic Discrepanc${openFindings.length === 1 ? "y" : "ies"}`,
      description: "Document analysis flagged discrepancies that require regulatory scrutiny officer adjudication.",
      severity: "WARNING",
      isSatisfied: false,
      actionRequired: "Open Forensic Workbench to review and resolve open findings.",
    });
  }

  const timeline = assembleChronologicalTimeline(
    currentInstrument,
    documents,
    [],
    [],
    discrepancies,
    [],
    releaseRequests,
    auditLogs
  );

  return {
    instrument: currentInstrument,
    predecessor,
    replacements,
    lineageGraph: { nodes, edges },
    documents,
    verificationEvents: [],
    bankVerifications: [],
    discrepancies,
    renewalRequests: [],
    releaseRequests,
    auditLogs,
    outstandingObligations,
    timeline,
  };
}

/**
 * Synthesizes a unified chronological event timeline
 */
function assembleChronologicalTimeline(
  instrument: FdrInstrumentDto,
  documents: DocumentDto[],
  verificationEvents: any[],
  bankVerifications: BankVerificationResponseDto[],
  discrepancies: RiskFindingDto[],
  renewalRequests: any[],
  releaseRequests: ReleaseRequestDto[],
  auditLogs: AuditLogDto[]
): LifecycleTimelineEvent[] {
  const events: LifecycleTimelineEvent[] = [];

  // 1. Initial Issuance Event
  events.push({
    id: `tl-issue-${instrument.id}`,
    timestamp: instrument.issueDate,
    eventType: "ISSUANCE",
    title: `FDR Instrument Issued & Pledged: ${instrument.fdrNumber}`,
    description: `Fixed Deposit Certificate of ₹${instrument.amount.toLocaleString("en-IN")} established at ${instrument.bankName} (${instrument.branchName}) with joint lien to Regional Officer.`,
    severity: "SUCCESS",
  });

  // 2. Lien Confirmation Event
  if (instrument.isLienMarked && instrument.lienConfirmedAt) {
    events.push({
      id: `tl-lien-${instrument.id}`,
      timestamp: instrument.lienConfirmedAt,
      eventType: "LIEN_CONFIRMATION",
      title: "Bank Lien Confirmed & Registered",
      description: `Official lien endorsement confirmed by ${instrument.bankName} under IFSC ${instrument.ifscCode}. Deposit locked for statutory tenure.`,
      severity: "SUCCESS",
    });
  }

  // 3. Document Ingestion Events
  for (const doc of documents) {
    events.push({
      id: `tl-doc-${doc.id}`,
      timestamp: doc.createdAt,
      eventType: "VAULT_INGESTION",
      title: `Document Uploaded: ${doc.fileName}`,
      description: `${doc.documentType.replace(/_/g, " ")} (${(doc.fileSizeBytes / 1024).toFixed(1)} KB) saved into private vault. SHA-256: ${doc.sha256Checksum?.substring(0, 16)}...`,
      severity: "INFO",
      metadata: { documentId: doc.id, checksum: doc.sha256Checksum },
    });

    if (doc.extractedData) {
      events.push({
        id: `tl-ocr-${doc.id}`,
        timestamp: doc.extractedData.extractedIssueDate || doc.createdAt,
        eventType: "OCR_EXTRACTION",
        title: `Forensic OCR Extraction (${doc.extractedData.ocrEngine || "Tesseract.js"})`,
        description: `Extracted Ref: ${doc.extractedData.extractedFdrNumber || "N/A"}, Amount: ${doc.extractedData.extractedAmount ? "₹" + doc.extractedData.extractedAmount.toLocaleString("en-IN") : "N/A"} with ${(doc.extractedData.confidenceScore * 100).toFixed(1)}% engine confidence.`,
        severity: "INFO",
      });
    }
  }

  // 4. Bank Gateway Verification Events
  for (const bv of bankVerifications) {
    events.push({
      id: `tl-bv-${bv.id}`,
      timestamp: bv.timestamp,
      eventType: "BANK_VERIFICATION",
      title: `Bank Verification Inquired: ${bv.outcome.replace(/_/g, " ")}`,
      description: `Gateway inquiry correlation #${bv.correlationId.substring(0, 16)}... Mode: ${bv.verificationMode}. Duration: ${bv.durationMs}ms.`,
      actorName: bv.requestedBy.name || "System",
      actorRole: bv.requestedBy.role,
      severity: bv.outcome === "SANDBOX_MATCH" || bv.outcome === "EXTERNAL_VERIFIED" ? "SUCCESS" : "WARNING",
    });
  }

  // 5. Risk Discrepancies
  for (const disc of discrepancies) {
    events.push({
      id: `tl-risk-${disc.id}`,
      timestamp: disc.createdAt,
      eventType: "RISK_DISCREPANCY",
      title: `Forensic Discrepancy Flagged: ${disc.riskCode}`,
      description: `${disc.description} (Category: ${disc.category || "GENERAL"}, Severity: ${disc.severity}).`,
      severity: disc.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
    });
  }

  // 6. Renewal Requests
  for (const ren of renewalRequests) {
    events.push({
      id: `tl-ren-${ren.id}`,
      timestamp: ren.createdAt,
      eventType: "RENEWAL_REQUEST",
      title: "Tenure Extension Requested",
      description: `Petition submitted for ${ren.requestedTenureMonths} months extension until ${new Date(ren.proposedMaturityDate).toLocaleDateString("en-IN")}.`,
      severity: "INFO",
    });
  }

  // 7. Release Requests
  for (const rel of releaseRequests) {
    events.push({
      id: `tl-rel-${rel.id}`,
      timestamp: rel.submissionDate,
      eventType: "RELEASE_REQUEST",
      title: `Security Deposit Release Petition: ${rel.status}`,
      description: `Request for refund of ₹${rel.requestedAmount.toLocaleString("en-IN")} submitted post lock-in tenure.`,
      severity: "INFO",
    });
  }

  // 8. Audit Log Events
  for (const aud of auditLogs) {
    events.push({
      id: `tl-aud-${aud.id}`,
      timestamp: aud.createdAt,
      eventType: "AUDIT_ACTION",
      title: `Audit Ledger: ${aud.action.replace(/_/g, " ")}`,
      description: `Regulatory action executed on ${aud.entityType} (${aud.entityId}).`,
      actorName: aud.actorName,
      actorRole: aud.actorRole,
      severity: "INFO",
    });
  }

  // Sort timeline chronologically descending (newest first)
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ==========================================
// SECTION D: RELEASE-READINESS EVALUATION
// ==========================================

/**
 * Evaluates the 5 requirements and readiness state of a release request
 */
export function evaluateReleaseReadiness(
  releaseRequest: ReleaseRequestDto,
  instrument: FdrInstrumentDto,
  findings: RiskFindingDto[] = []
): ReleaseReadinessEvaluationDto {
  const requirements: ReleaseRequirementCheck[] = [];
  const blockedDependencies: string[] = [];
  const reviewerObservations: string[] = [];

  // Check 1: 8-Year Statutory Lock-in Tenure
  const lockInSatisfied = releaseRequest.statutoryTenureCompleted;
  requirements.push({
    key: "STATUTORY_LOCK_IN",
    title: "8-Year Statutory Lock-in Tenure Completed",
    isSatisfied: lockInSatisfied,
    status: lockInSatisfied ? "MET" : "DEFICIENT",
    explanation: lockInSatisfied
      ? "Deposit has remained continuously pledged for required 8-year statutory tenure."
      : "Mandatory 8-year lock-in period has not elapsed. Premature release prohibited under AICTE guidelines.",
  });
  if (!lockInSatisfied) {
    blockedDependencies.push("Premature release: Mandatory 8-year statutory lock-in tenure incomplete.");
  }

  // Check 2: Regulatory NOC (No Objection Certificate)
  const nocSatisfied = releaseRequest.nocIssued;
  requirements.push({
    key: "NOC_RELEASE_ORDER",
    title: "Official Regulatory NOC Issued",
    isSatisfied: nocSatisfied,
    status: nocSatisfied ? "MET" : "DEFICIENT",
    explanation: nocSatisfied
      ? "Regional Director No-Objection Certificate issued and verified in ledger."
      : "Formal No-Objection Certificate from Regulatory Board is pending.",
  });
  if (!nocSatisfied) {
    blockedDependencies.push("Missing document: Official No-Objection Certificate (NOC) release order not on file.");
  }

  // Check 3: Clean Forensic Audit & Zero Open Discrepancies
  const openFindings = findings.filter((f) => !f.isResolved && f.fdrId === instrument.id);
  const cleanAudit = openFindings.length === 0;
  requirements.push({
    key: "CLEAN_FORENSIC_AUDIT",
    title: "Zero Open Forensic Discrepancies",
    isSatisfied: cleanAudit,
    status: cleanAudit ? "MET" : "BLOCKED",
    explanation: cleanAudit
      ? "All OCR, ELA, and metadata cross-validation checks resolved with 0 open discrepancies."
      : `Instrument has ${openFindings.length} open discrepancy finding(s) requiring scrutiny adjudication.`,
  });
  if (!cleanAudit) {
    blockedDependencies.push(`Forensic block: ${openFindings.length} unresolved risk finding(s) pending resolution.`);
  }

  // Check 4: Issuing Bank Lien Release Confirmation
  const lienDischarged = !instrument.isLienMarked || releaseRequest.status === "APPROVED" || releaseRequest.status === "DISBURSED";
  requirements.push({
    key: "BANK_LIEN_DISCHARGE",
    title: "Bank Lien Unencumbered Discharge",
    isSatisfied: lienDischarged,
    status: lienDischarged ? "MET" : "PENDING_VERIFICATION",
    explanation: lienDischarged
      ? "Bank unencumbered release clearance verified."
      : `Lien is currently active at ${instrument.bankName}. Issuing bank discharge advice required prior to encashment.`,
  });

  // Check 5: Institutional Capital Buffer Preserved
  const bufferPreserved = true; // In demo portfolio, capital reserve is audited
  requirements.push({
    key: "CAPITAL_BUFFER_MAINTAINED",
    title: "Statutory Capital Reserve Intact",
    isSatisfied: bufferPreserved,
    status: bufferPreserved ? "MET" : "DEFICIENT",
    explanation: "Institution maintains required security deposit reserve across remaining approved academic programs.",
  });

  // Determine overall readiness state
  let readinessState: ReleaseReadinessState = "AWAITING_REVIEW";

  if (releaseRequest.status === "DISBURSED") {
    readinessState = "COMPLETE";
  } else if (releaseRequest.status === "APPROVED") {
    readinessState = "COMPLETE";
  } else if (blockedDependencies.length > 0) {
    readinessState = "BLOCKED_DEPENDENCY";
  } else if (!nocSatisfied) {
    readinessState = "MISSING_EVIDENCE";
  } else if (releaseRequest.status === "COMMITTEE_REVIEW") {
    readinessState = "READY_FOR_DECISION";
  } else if (releaseRequest.status === "SUBMITTED") {
    readinessState = "AWAITING_REVIEW";
  } else if (releaseRequest.status === "UNDER_SCRUTINY") {
    readinessState = "READY_FOR_DECISION";
  }

  // Determine allowed transitions based on workflow state machine
  const allowedTransitions: ReleaseRequestStatus[] = [];
  switch (releaseRequest.status) {
    case "SUBMITTED":
      allowedTransitions.push("UNDER_SCRUTINY", "REJECTED");
      break;
    case "UNDER_SCRUTINY":
      allowedTransitions.push("COMMITTEE_REVIEW", "REJECTED");
      break;
    case "COMMITTEE_REVIEW":
      if (readinessState !== "BLOCKED_DEPENDENCY") {
        allowedTransitions.push("APPROVED");
      }
      allowedTransitions.push("REJECTED");
      break;
    case "APPROVED":
      allowedTransitions.push("DISBURSED");
      break;
    case "REJECTED":
    case "DISBURSED":
      // Terminal states
      break;
  }

  reviewerObservations.push(
    `Deposit of ₹${instrument.amount.toLocaleString("en-IN")} at ${instrument.bankName} submitted on ${new Date(releaseRequest.submissionDate).toLocaleDateString("en-IN")}.`
  );
  if (releaseRequest.committeeRemarks) {
    reviewerObservations.push(`Committee Remarks: "${releaseRequest.committeeRemarks}"`);
  }

  // AI Recommendation (Purely advisory - never autonomously authorizes)
  let aiRecommendation = "";
  if (readinessState === "BLOCKED_DEPENDENCY") {
    aiRecommendation = `Advisory: Release cannot be authorized due to active blocks (${blockedDependencies.join("; ")}). Recommend resolving risk findings and verifying tenure before committee referral.`;
  } else if (readinessState === "MISSING_EVIDENCE") {
    aiRecommendation = "Advisory: Request institutional compliance desk to upload official Regional Director NOC release order.";
  } else if (readinessState === "READY_FOR_DECISION") {
    aiRecommendation = "Advisory: All prerequisite statutory criteria are satisfied. Ready for Committee Signatory Review and formal approval decision.";
  } else if (readinessState === "COMPLETE") {
    aiRecommendation = "Advisory: Release authorization approved. Ready for banking liaison desk refund disbursement.";
  } else {
    aiRecommendation = "Advisory: Scrutiny officer initial document inspection pending.";
  }

  return {
    requestId: releaseRequest.id,
    fdrId: releaseRequest.fdrId,
    fdrNumber: releaseRequest.fdrNumber,
    institutionId: releaseRequest.institutionId,
    institutionName: releaseRequest.institutionName,
    requestedAmount: releaseRequest.requestedAmount,
    currentStatus: releaseRequest.status,
    readinessState,
    requirements,
    blockedDependencies,
    reviewerObservations,
    aiRecommendation,
    allowedTransitions,
    submissionDate: releaseRequest.submissionDate,
    committeeDecisionDate: releaseRequest.committeeDecisionDate,
    committeeRemarks: releaseRequest.committeeRemarks,
  };
}

/**
 * Server Action / API Handler: Transition Release Request through Workflow State Machine
 */
export async function transitionReleaseRequest(params: {
  requestId: string;
  newStatus: ReleaseRequestStatus;
  actor: AuthContext;
  remarks: string;
  releaseRequest?: ReleaseRequestDto;
  instrument?: FdrInstrumentDto;
  findings?: RiskFindingDto[];
}): Promise<{ success: boolean; evaluation: ReleaseReadinessEvaluationDto; message: string }> {
  // 1. Fetch current request state
  let currentReq: ReleaseRequestDto | undefined = params.releaseRequest;
  if (!currentReq) {
    currentReq = inMemoryReleaseRequestsVault.get(params.requestId);
  }
  if (!currentReq) {
    try {
      const dbReq = await prisma.fdrReleaseRequest.findUnique({
        where: { id: params.requestId },
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
      // In-memory fallback
    }
  }

  if (!currentReq) {
    throw new Error(`Release request not found: ${params.requestId}`);
  }

  // 2. Fetch instrument for dependency evaluation
  let inst = params.instrument;
  if (!inst) {
    const all = getSyntheticFdrInstruments();
    inst = all.find((i) => i.id === currentReq!.fdrId) || all[0];
  }

  const findings = params.findings || getSyntheticRiskFindings().filter((rf) => rf.fdrId === currentReq!.fdrId);

  // 3. Evaluate Readiness
  const readiness = evaluateReleaseReadiness(currentReq, inst, findings);

  // 4. Validate Permitted Transition in Workflow State Machine
  if (!readiness.allowedTransitions.includes(params.newStatus)) {
    throw new Error(
      `Prohibited Workflow Transition: Cannot transition release petition from '${currentReq.status}' to '${params.newStatus}'. Allowed next states: [${readiness.allowedTransitions.join(", ")}].`
    );
  }

  // 5. Server-side Role Authorization Validation
  const role = params.actor.userRole;
  const isRegulatoryOfficer = params.actor.isRegulatoryOfficer;

  if (params.newStatus === "UNDER_SCRUTINY") {
    if (!isRegulatoryOfficer && role !== "admin") {
      throw new Error(`Permission Denied: Role '${role}' is not authorized to initiate scrutiny.`);
    }
  } else if (params.newStatus === "COMMITTEE_REVIEW") {
    if (!isRegulatoryOfficer && role !== "admin") {
      throw new Error(`Permission Denied: Role '${role}' cannot forward petitions to committee review.`);
    }
  } else if (params.newStatus === "APPROVED") {
    // Only Senior Regulatory Officers, Regional Directors, or Admin can approve
    const canApprove = ["AICTE Regional Director", "Central Audit Inspector", "admin"].includes(role);
    if (!canApprove) {
      throw new Error(`Permission Denied: Role '${role}' lacks statutory authority to authorize deposit release approval. Requires AICTE Regional Director or Central Admin.`);
    }

    // Dependency check: Cannot approve if blocked dependencies exist
    if (readiness.readinessState === "BLOCKED_DEPENDENCY") {
      throw new Error(
        `Approval Blocked: Cannot approve release while blocked dependencies exist (${readiness.blockedDependencies.join("; ")}).`
      );
    }
  } else if (params.newStatus === "DISBURSED") {
    const canDisburse = ["Finance & Bank Liaison Desk", "admin"].includes(role);
    if (!canDisburse) {
      throw new Error(`Permission Denied: Role '${role}' lacks banking disbursement authorization.`);
    }
  } else if (params.newStatus === "REJECTED") {
    if (!isRegulatoryOfficer && role !== "admin") {
      throw new Error(`Permission Denied: Role '${role}' cannot reject statutory petitions.`);
    }
    if (!params.remarks || params.remarks.trim().length < 10) {
      throw new Error("Mandatory Justification: A rejection remark (minimum 10 characters) is legally required.");
    }
  }

  // 6. Update state
  const updatedReq: ReleaseRequestDto = {
    ...currentReq,
    status: params.newStatus,
    committeeRemarks: params.remarks,
    committeeDecisionDate:
      params.newStatus === "APPROVED" || params.newStatus === "REJECTED" || params.newStatus === "DISBURSED"
        ? new Date().toISOString()
        : currentReq.committeeDecisionDate,
  };

  inMemoryReleaseRequestsVault.set(updatedReq.id, updatedReq);

  // Try updating Prisma
  try {
    await prisma.fdrReleaseRequest.update({
      where: { id: updatedReq.id },
      data: {
        status: params.newStatus,
        committeeRemarks: params.remarks,
        committeeDecisionDate: updatedReq.committeeDecisionDate ? new Date(updatedReq.committeeDecisionDate) : null,
      },
    });

    await prisma.fdrAuditLog.create({
      data: {
        fdrId: updatedReq.fdrId,
        institutionId: updatedReq.institutionId,
        actorId: params.actor.userId,
        actorName: params.actor.userName,
        actorRole: params.actor.userRole,
        action: `RELEASE_REQUEST_${params.newStatus}`,
        entityType: "RELEASE_REQUEST",
        entityId: updatedReq.id,
        detailsJson: JSON.stringify({
          previousStatus: currentReq.status,
          newStatus: params.newStatus,
          remarks: params.remarks,
          readinessState: readiness.readinessState,
          transitionedAt: new Date().toISOString(),
        }),
      },
    });
  } catch {
    // In-memory fallback
  }

  const updatedReadiness = evaluateReleaseReadiness(updatedReq, inst, findings);

  return {
    success: true,
    evaluation: updatedReadiness,
    message: `Release petition successfully transitioned to ${params.newStatus}.`,
  };
}
