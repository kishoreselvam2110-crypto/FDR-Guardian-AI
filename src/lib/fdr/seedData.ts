import type {
  FdrInstrumentDto,
  ReleaseRequestDto,
  AlertDto,
  AuditLogDto,
  RiskFindingDto,
  DocumentDto,
} from "./types.ts";

/**
 * Utility to create dates relative to the actual current date
 */
export function addDays(days: number, fromDate: Date = new Date()): Date {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  return d;
}

export function subDays(days: number, fromDate: Date = new Date()): Date {
  const d = new Date(fromDate);
  d.setDate(d.getDate() - days);
  return d;
}

export function calculateDaysDifference(targetDate: Date, baseDate: Date = new Date()): number {
  const diffTime = targetDate.getTime() - baseDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Repeatable synthetic demo institutions
 */
export const SYNTHETIC_INSTITUTIONS = [
  {
    id: "inst-synth-001",
    name: "Apex Institute of Technology [Synthetic]",
    trustName: "Vidya Educational Trust [Synthetic]",
    landAreaAcres: 12.5,
    category: "Engineering & Technology",
    statutoryRequirementINR: 3500000,
  },
  {
    id: "inst-synth-002",
    name: "Bharat College of Research [Synthetic]",
    trustName: "Bharat Rural Education Society [Synthetic]",
    landAreaAcres: 6.8,
    category: "Engineering & Technology",
    statutoryRequirementINR: 3500000,
  },
  {
    id: "inst-synth-003",
    name: "National Institute of Management [Synthetic]",
    trustName: "National Foundation for Higher Studies [Synthetic]",
    landAreaAcres: 8.0,
    category: "Management Studies",
    statutoryRequirementINR: 1500000,
  },
  {
    id: "inst-synth-004",
    name: "Kaveri Academy of Pharmaceutical Sciences [Synthetic]",
    trustName: "Kaveri Health Foundation [Synthetic]",
    landAreaAcres: 5.5,
    category: "Pharmacy",
    statutoryRequirementINR: 2500000,
  },
];

/**
 * Generates dynamically anchored synthetic FDR instruments relative to the actual system date.
 */
export function getSyntheticFdrInstruments(currentDate: Date = new Date()): FdrInstrumentDto[] {
  // Instrument 1: Apex Institute - Maturing in 14 days (Critical 30D Window)
  const matDate1 = addDays(14, currentDate);
  const issueDate1 = subDays(365 * 5 - 14, currentDate); // 5-year tenure
  const daysToMat1 = calculateDaysDifference(matDate1, currentDate);

  // Instrument 2: Bharat College - Maturing in 45 days (Warning 60D Window)
  const matDate2 = addDays(45, currentDate);
  const issueDate2 = subDays(365 * 3 - 45, currentDate);
  const daysToMat2 = calculateDaysDifference(matDate2, currentDate);

  // Instrument 3: National Management - Matured 8 days ago (Matured Pending Action / Missing Renewal)
  const matDate3 = subDays(8, currentDate);
  const issueDate3 = subDays(365 * 5 + 8, currentDate);
  const daysToMat3 = calculateDaysDifference(matDate3, currentDate);

  // Instrument 4: Kaveri Pharmacy - Active & Verified (Healthy, 320 days to maturity)
  const matDate4 = addDays(320, currentDate);
  const issueDate4 = subDays(180, currentDate);
  const daysToMat4 = calculateDaysDifference(matDate4, currentDate);

  // Instrument 5: Apex Institute Program 2 - Release Requested (Completed 8-year lock-in)
  const matDate5 = subDays(30, currentDate);
  const issueDate5 = subDays(365 * 8 + 30, currentDate);
  const daysToMat5 = calculateDaysDifference(matDate5, currentDate);

  // Instrument 6: Historical Replaced Predecessor of Bharat College (Archived lineage)
  const matDatePredecessor = subDays(730, currentDate);
  const issueDatePredecessor = subDays(730 + 365 * 3, currentDate);

  return [
    {
      id: "fdr-synth-101",
      institutionId: "inst-synth-001",
      institutionName: "Apex Institute of Technology [Synthetic]",
      fdrNumber: "FDR-2021-SBI-88210",
      bankName: "State Bank of India",
      branchName: "Industrial Finance Branch, Bengaluru",
      ifscCode: "SBIN0004132",
      amount: 3500000,
      issueDate: issueDate1.toISOString(),
      maturityDate: matDate1.toISOString(),
      tenureMonths: 60,
      interestRate: 7.1,
      jointHolderName: "Regional Officer (AICTE / State Board)",
      isLienMarked: true,
      lienConfirmedAt: issueDate1.toISOString(),
      verificationState: "VERIFIED",
      administrativeState: "PLEDGED_ACTIVE",
      renewalState: "RENEWAL_REQUESTED",
      predecessorId: null,
      daysToMaturity: daysToMat1,
      maturityStatus: "CRITICAL_30D",
      documentsCount: 3,
      alertsCount: 1,
      createdAt: issueDate1.toISOString(),
      updatedAt: currentDate.toISOString(),
    },
    {
      id: "fdr-synth-102",
      institutionId: "inst-synth-002",
      institutionName: "Bharat College of Research [Synthetic]",
      fdrNumber: "FDR-2023-HDFC-99321",
      bankName: "HDFC Bank Ltd",
      branchName: "Nariman Point Branch, Mumbai",
      ifscCode: "HDFC0000104",
      amount: 2500000,
      issueDate: issueDate2.toISOString(),
      maturityDate: matDate2.toISOString(),
      tenureMonths: 36,
      interestRate: 6.85,
      jointHolderName: "Regional Officer (AICTE / State Board)",
      isLienMarked: false,
      lienConfirmedAt: null,
      verificationState: "PENDING",
      administrativeState: "PLEDGED_ACTIVE",
      renewalState: "ORIGINAL",
      predecessorId: "fdr-synth-106-hist",
      daysToMaturity: daysToMat2,
      maturityStatus: "WARNING_60D",
      documentsCount: 2,
      alertsCount: 2,
      createdAt: issueDate2.toISOString(),
      updatedAt: currentDate.toISOString(),
    },
    {
      id: "fdr-synth-103",
      institutionId: "inst-synth-003",
      institutionName: "National Institute of Management [Synthetic]",
      fdrNumber: "FDR-2021-PNB-44120",
      bankName: "Punjab National Bank",
      branchName: "Connaught Place, New Delhi",
      ifscCode: "PUNB0012900",
      amount: 1500000,
      issueDate: issueDate3.toISOString(),
      maturityDate: matDate3.toISOString(),
      tenureMonths: 60,
      interestRate: 7.0,
      jointHolderName: "Regional Officer (AICTE / State Board)",
      isLienMarked: true,
      lienConfirmedAt: issueDate3.toISOString(),
      verificationState: "DEFICIENT",
      administrativeState: "MATURED_PENDING_ACTION",
      renewalState: "ORIGINAL",
      predecessorId: null,
      daysToMaturity: daysToMat3,
      maturityStatus: "EXPIRED",
      documentsCount: 1,
      alertsCount: 2,
      createdAt: issueDate3.toISOString(),
      updatedAt: currentDate.toISOString(),
    },
    {
      id: "fdr-synth-104",
      institutionId: "inst-synth-004",
      institutionName: "Kaveri Academy of Pharmaceutical Sciences [Synthetic]",
      fdrNumber: "FDR-2026-CANARA-77211",
      bankName: "Canara Bank",
      branchName: "Anna Salai Branch, Chennai",
      ifscCode: "CNRB0001002",
      amount: 2500000,
      issueDate: issueDate4.toISOString(),
      maturityDate: matDate4.toISOString(),
      tenureMonths: 60,
      interestRate: 7.25,
      jointHolderName: "Regional Officer (AICTE / State Board)",
      isLienMarked: true,
      lienConfirmedAt: issueDate4.toISOString(),
      verificationState: "VERIFIED",
      administrativeState: "PLEDGED_ACTIVE",
      renewalState: "ORIGINAL",
      predecessorId: null,
      daysToMaturity: daysToMat4,
      maturityStatus: "NORMAL",
      documentsCount: 3,
      alertsCount: 0,
      createdAt: issueDate4.toISOString(),
      updatedAt: currentDate.toISOString(),
    },
    {
      id: "fdr-synth-105",
      institutionId: "inst-synth-001",
      institutionName: "Apex Institute of Technology [Synthetic]",
      fdrNumber: "FDR-2018-ICICI-11002",
      bankName: "ICICI Bank Ltd",
      branchName: "MG Road Branch, Bengaluru",
      ifscCode: "ICIC0000002",
      amount: 1000000,
      issueDate: issueDate5.toISOString(),
      maturityDate: matDate5.toISOString(),
      tenureMonths: 96,
      interestRate: 7.5,
      jointHolderName: "Regional Officer (AICTE / State Board)",
      isLienMarked: true,
      lienConfirmedAt: issueDate5.toISOString(),
      verificationState: "VERIFIED",
      administrativeState: "RELEASE_PENDING",
      renewalState: "ORIGINAL",
      predecessorId: null,
      daysToMaturity: daysToMat5,
      maturityStatus: "EXPIRED",
      documentsCount: 4,
      alertsCount: 1,
      createdAt: issueDate5.toISOString(),
      updatedAt: currentDate.toISOString(),
    },
    {
      id: "fdr-synth-106-hist",
      institutionId: "inst-synth-002",
      institutionName: "Bharat College of Research [Synthetic]",
      fdrNumber: "FDR-2020-HDFC-00119-HIST",
      bankName: "HDFC Bank Ltd",
      branchName: "Nariman Point Branch, Mumbai",
      ifscCode: "HDFC0000104",
      amount: 2000000,
      issueDate: issueDatePredecessor.toISOString(),
      maturityDate: matDatePredecessor.toISOString(),
      tenureMonths: 36,
      interestRate: 6.5,
      jointHolderName: "Regional Officer (AICTE / State Board)",
      isLienMarked: true,
      lienConfirmedAt: issueDatePredecessor.toISOString(),
      verificationState: "VERIFIED",
      administrativeState: "RENEWED",
      renewalState: "REPLACED_SUPERSEDED",
      predecessorId: null,
      daysToMaturity: -730,
      maturityStatus: "EXPIRED",
      documentsCount: 2,
      alertsCount: 0,
      createdAt: issueDatePredecessor.toISOString(),
      updatedAt: issueDate2.toISOString(),
    },
  ];
}

export function getSyntheticReleaseRequests(): ReleaseRequestDto[] {
  return [
    {
      id: "rel-synth-001",
      fdrId: "fdr-synth-105",
      fdrNumber: "FDR-2018-ICICI-11002",
      institutionId: "inst-synth-001",
      institutionName: "Apex Institute of Technology [Synthetic]",
      requestedAmount: 1000000,
      statutoryTenureCompleted: true,
      nocIssued: true,
      status: "COMMITTEE_REVIEW",
      submissionDate: subDays(15).toISOString(),
      committeeDecisionDate: null,
      committeeRemarks: "Audited: 8-year statutory lock-in completed without outstanding student grievances.",
    },
  ];
}

export function getSyntheticAlerts(): AlertDto[] {
  return [
    {
      id: "alt-synth-001",
      fdrId: "fdr-synth-101",
      fdrNumber: "FDR-2021-SBI-88210",
      institutionId: "inst-synth-001",
      institutionName: "Apex Institute of Technology [Synthetic]",
      alertType: "MATURITY_CRITICAL_30D",
      severity: "CRITICAL",
      title: "Maturity Breach In 14 Days",
      description: "Fixed Deposit Receipt enters critical 14-day expiry horizon. Renewal or replacement certificate required immediately.",
      isResolved: false,
      createdAt: subDays(2).toISOString(),
    },
    {
      id: "alt-synth-002",
      fdrId: "fdr-synth-103",
      fdrNumber: "FDR-2021-PNB-44120",
      institutionId: "inst-synth-003",
      institutionName: "National Institute of Management [Synthetic]",
      alertType: "EXPIRED_NO_RENEWAL",
      severity: "CRITICAL",
      title: "Deposit Matured Without Renewal Advice",
      description: "FDR matured 8 days ago. Bank lien is unrenewed, exposing regulatory guarantee.",
      isResolved: false,
      createdAt: subDays(7).toISOString(),
    },
    {
      id: "alt-synth-003",
      fdrId: "fdr-synth-102",
      fdrNumber: "FDR-2023-HDFC-99321",
      institutionId: "inst-synth-002",
      institutionName: "Bharat College of Research [Synthetic]",
      alertType: "LIEN_MISSING",
      severity: "WARNING",
      title: "Bank Lien Letter Missing",
      description: "Lien endorsement letter from HDFC Bank Branch Manager is pending verification.",
      isResolved: false,
      createdAt: subDays(12).toISOString(),
    },
  ];
}

export function getSyntheticRiskFindings(): RiskFindingDto[] {
  return [
    {
      id: "risk-synth-001",
      fdrId: "fdr-synth-102",
      fdrNumber: "FDR-2023-HDFC-99321",
      institutionName: "Bharat College of Research [Synthetic]",
      riskCode: "STATUTORY_AMOUNT_DEFICIT",
      severity: "WARNING",
      description: "Pledged deposit is ₹25,00,000 vs required Engineering threshold of ₹35,00,000 (Deficit: ₹10,00,000).",
      isResolved: false,
      createdAt: subDays(14).toISOString(),
    },
    {
      id: "risk-synth-002",
      fdrId: "fdr-synth-103",
      fdrNumber: "FDR-2021-PNB-44120",
      institutionName: "National Institute of Management [Synthetic]",
      riskCode: "UNRESOLVED_EXPIRED_STATUS",
      severity: "CRITICAL",
      description: "Certificate matured on past date without re-investment advice on file.",
      isResolved: false,
      createdAt: subDays(8).toISOString(),
    },
  ];
}

export function getSyntheticAuditLogs(): AuditLogDto[] {
  return [
    {
      id: "aud-synth-001",
      fdrId: "fdr-synth-101",
      fdrNumber: "FDR-2021-SBI-88210",
      institutionId: "inst-synth-001",
      institutionName: "Apex Institute of Technology [Synthetic]",
      actorId: "usr-officer-01",
      actorName: "Dr. R. Ramanathan",
      actorRole: "Regulatory Scrutiny Officer",
      action: "RENEWAL_NOTICE_ISSUED",
      entityType: "FDR_INSTRUMENT",
      entityId: "fdr-synth-101",
      details: { statutoryDaysNotice: 14, notificationChannel: "REGISTERED_EMAIL_AND_PORTAL" },
      createdAt: subDays(1).toISOString(),
    },
    {
      id: "aud-synth-002",
      fdrId: "fdr-synth-105",
      fdrNumber: "FDR-2018-ICICI-11002",
      institutionId: "inst-synth-001",
      institutionName: "Apex Institute of Technology [Synthetic]",
      actorId: "usr-officer-02",
      actorName: "S. Kulkarni",
      actorRole: "Finance Committee Member",
      action: "RELEASE_DOSSIER_FORWARDED",
      entityType: "RELEASE_REQUEST",
      entityId: "rel-synth-001",
      details: { verifiedYearsPledged: 8, auditClearance: "CLEARED" },
      createdAt: subDays(3).toISOString(),
    },
    {
      id: "aud-synth-003",
      fdrId: "fdr-synth-104",
      fdrNumber: "FDR-2026-CANARA-77211",
      institutionId: "inst-synth-004",
      institutionName: "Kaveri Academy of Pharmaceutical Sciences [Synthetic]",
      actorId: "usr-officer-01",
      actorName: "Dr. R. Ramanathan",
      actorRole: "Regulatory Scrutiny Officer",
      action: "BANK_LIEN_CONFIRMED",
      entityType: "FDR_INSTRUMENT",
      entityId: "fdr-synth-104",
      details: { ifscVerified: "CNRB0001002", branchManagerConfirmation: "VERIFIED" },
      createdAt: subDays(10).toISOString(),
    },
  ];
}

export function getSyntheticDocuments(fdrId?: string): DocumentDto[] {
  const allDocs: DocumentDto[] = [
    {
      id: "doc-synth-01",
      fdrId: "fdr-synth-101",
      documentType: "FDR_CERTIFICATE_SCAN",
      fileName: "SBI_FDR_88210_Original_Scan.pdf",
      fileUrl: "/documents/fdr-88210.pdf",
      fileSizeBytes: 1420500,
      mimeType: "application/pdf",
      isVerified: true,
      verifiedAt: subDays(180).toISOString(),
      extractedData: {
        extractedFdrNumber: "FDR-2021-SBI-88210",
        extractedAmount: 3500000,
        extractedBankName: "State Bank of India",
        extractedIfsc: "SBIN0004132",
        extractedMaturityDate: addDays(14).toISOString(),
        confidenceScore: 0.98,
      },
      aiEfficiency: {
        pipelineDurationMs: 420,
        ocrDurationMs: 310,
        elaDurationMs: 65,
        barcodeDurationMs: 25,
        metadataDurationMs: 12,
        parallelSpeedupFactor: 2.3,
        fieldExtractionYield: "6/6 Structured Fields (100%)",
        mlReviewPriority: "STANDARD_REVIEW",
        mlElevatedProbability: 0.174,
        mlTriageQueue: "Routine Institutional Compliance Queue",
      },
      createdAt: subDays(365).toISOString(),
    },
    {
      id: "doc-synth-02",
      fdrId: "fdr-synth-101",
      documentType: "BANK_CONFIRMATION_LETTER",
      fileName: "SBI_Lien_Confirmation_Letter.pdf",
      fileUrl: "/documents/sbi-lien-letter.pdf",
      fileSizeBytes: 890200,
      mimeType: "application/pdf",
      isVerified: true,
      verifiedAt: subDays(180).toISOString(),
      extractedData: {
        extractedFdrNumber: "FDR-2021-SBI-88210",
        extractedBankName: "State Bank of India",
        confidenceScore: 0.95,
      },
      createdAt: subDays(360).toISOString(),
    },
    {
      id: "doc-synth-03",
      fdrId: "fdr-synth-102",
      documentType: "FDR_CERTIFICATE_SCAN",
      fileName: "HDFC_Deposit_Receipt_99321.pdf",
      fileUrl: "/documents/hdfc-99321.pdf",
      fileSizeBytes: 2100400,
      mimeType: "application/pdf",
      isVerified: false,
      verifiedAt: null,
      extractedData: {
        extractedFdrNumber: "FDR-2023-HDFC-99321",
        extractedAmount: 2500000,
        extractedBankName: "HDFC Bank Ltd",
        extractedIfsc: "HDFC0000104",
        extractedMaturityDate: addDays(45).toISOString(),
        confidenceScore: 0.91,
      },
      aiEfficiency: {
        pipelineDurationMs: 465,
        ocrDurationMs: 345,
        elaDurationMs: 78,
        barcodeDurationMs: 32,
        metadataDurationMs: 14,
        parallelSpeedupFactor: 2.1,
        fieldExtractionYield: "6/6 Structured Fields (100%)",
        mlReviewPriority: "ELEVATED_PRIORITY",
        mlElevatedProbability: 0.786,
        mlTriageQueue: "Senior Scrutiny Officer (Expedited Forensics Queue)",
      },
      createdAt: subDays(15).toISOString(),
    },
  ];

  if (fdrId) {
    return allDocs.filter((d) => d.fdrId === fdrId);
  }
  return allDocs;
}
