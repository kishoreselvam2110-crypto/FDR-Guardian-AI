/**
 * SIH26265 FDR Guardian AI - Core Domain Types and API Contracts
 */

export type FdrVerificationState = "PENDING" | "VERIFIED" | "DEFICIENT" | "REJECTED";

export type FdrAdministrativeState =
  | "PLEDGED_ACTIVE"
  | "MATURED_PENDING_ACTION"
  | "RENEWED"
  | "RELEASE_PENDING"
  | "RELEASED"
  | "FORFEITED_ENCASHED";

export type FdrRenewalState =
  | "ORIGINAL"
  | "RENEWAL_REQUESTED"
  | "RENEWAL_IN_PROGRESS"
  | "RENEWED_ACTIVE"
  | "REPLACED_SUPERSEDED";

export type FdrDocumentType =
  | "FDR_CERTIFICATE_SCAN"
  | "BANK_CONFIRMATION_LETTER"
  | "LIEN_ENDORSEMENT"
  | "TRIPARTITE_AGREEMENT"
  | "RENEWAL_ADVICE"
  | "NOC_RELEASE_ORDER";

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

export type AlertType =
  | "MATURITY_CRITICAL_30D"
  | "MATURITY_WARNING_60D"
  | "EXPIRED_NO_RENEWAL"
  | "LIEN_MISSING"
  | "STATUTORY_DEFICIT"
  | "UNRESOLVED_DISCREPANCY"
  | "RENEWAL_EVIDENCE_MISSING";

export type ReleaseRequestStatus =
  | "SUBMITTED"
  | "UNDER_SCRUTINY"
  | "COMMITTEE_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "DISBURSED";

export interface FdrInstrumentDto {
  id: string;
  institutionId: string;
  institutionName: string;
  fdrNumber: string;
  bankName: string;
  branchName: string;
  ifscCode: string;
  amount: number; // in INR
  issueDate: string; // ISO string
  maturityDate: string; // ISO string
  tenureMonths: number;
  interestRate: number; // Percentage
  jointHolderName: string;
  isLienMarked: boolean;
  lienConfirmedAt?: string | null;
  verificationState: FdrVerificationState;
  administrativeState: FdrAdministrativeState;
  renewalState: FdrRenewalState;
  predecessorId?: string | null;
  daysToMaturity: number;
  maturityStatus: "EXPIRED" | "CRITICAL_30D" | "WARNING_60D" | "NORMAL";
  documentsCount: number;
  alertsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedFieldCandidate<T = string | number | null> {
  field: string;
  value: T;
  rawValue: string | null;
  confidence: number; // 0.0 to 1.0 (actual OCR engine confidence)
  sourcePage: number;
  supportingTextSnippet: string | null;
  boundingBox?: { x0: number; y0: number; x1: number; y1: number } | null;
  validationStatus: "CANDIDATE" | "AMBIGUOUS" | "NOT_FOUND";
}

export interface DocumentFieldCorrectionDto {
  id: string;
  extractionId: string;
  fieldName: string;
  originalValue: string | null;
  correctedValue: string;
  correctedByUserId: string;
  correctedByUserName: string;
  correctedByUserRole: string;
  justification: string;
  createdAt: string;
}

export interface DocumentOcrExtractionResultDto {
  id: string;
  documentId: string;
  extractedFdrNumber: string | null;
  extractedAmount: number | null;
  extractedBankName: string | null;
  extractedIfsc: string | null;
  extractedIssueDate: string | null;
  extractedMaturityDate: string | null;
  extractedInstitutionName: string | null;
  confidenceScore: number;
  ocrEngine: string;
  ocrVersion: string;
  processingDurationMs: number;
  extractedText: string;
  pageCount: number;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  candidates: {
    fdrNumber: ExtractedFieldCandidate<string | null>;
    bankName: ExtractedFieldCandidate<string | null>;
    institutionName: ExtractedFieldCandidate<string | null>;
    amount: ExtractedFieldCandidate<number | null>;
    issueDate: ExtractedFieldCandidate<string | null>;
    maturityDate: ExtractedFieldCandidate<string | null>;
    ifsc: ExtractedFieldCandidate<string | null>;
  };
  corrections: DocumentFieldCorrectionDto[];
  createdAt: string;
}

export type CrossValidationOutcome = "MATCH" | "MISMATCH" | "INCONCLUSIVE";

export interface BarcodeCrossValidationRecord {
  field: "fdrNumber" | "amount" | "issueDate" | "maturityDate" | "issuingBank";
  firstValue: string;
  firstSource: string;
  secondValue: string;
  secondSource: string;
  normalizationRule: string;
  outcome: CrossValidationOutcome;
  explanation: string;
}

export interface DocumentBarcodeDto {
  id: string;
  documentId: string;
  fdrId: string;
  barcodeType: string;
  rawPayload: string;
  pageNumber: number;
  schemaType: string;
  extractedFdrNumber?: string | null;
  extractedAmount?: number | null;
  extractedBankName?: string | null;
  extractedIssueDate?: string | null;
  extractedMaturityDate?: string | null;
  parsedFields: Record<string, unknown>;
  comparisons: BarcodeCrossValidationRecord[];
  validationStatus: "MATCH" | "MISMATCH" | "INCONCLUSIVE" | "UNRECOGNIZED" | "NO_CODES";
  hasMismatch: boolean;
  analyzerVersion: string;
  analyzedAt: string;
}

export interface MetadataForensicFinding {
  id: string;
  documentId: string;
  ruleKey: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  explanation: string;
  supportingEvidence: Record<string, unknown>;
  recommendedAction: string;
  analyzerVersion: string;
  analyzedAt: string;
  isResolved: boolean;
}

export interface DocumentMetadataDto {
  id: string;
  documentId: string;
  software?: string | null;
  producer?: string | null;
  creator?: string | null;
  cameraMake?: string | null;
  cameraModel?: string | null;
  creationDate?: string | null;
  modificationDate?: string | null;
  pageCount?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  analyzerVersion: string;
  rawMetadata?: Record<string, unknown> | null;
  findings: MetadataForensicFinding[];
  status: "PENDING" | "COMPLETED" | "FAILED";
  analyzedAt: string;
}

export interface DocumentAiEfficiencyDto {
  pipelineDurationMs: number;
  ocrDurationMs: number;
  elaDurationMs: number;
  barcodeDurationMs: number;
  metadataDurationMs: number;
  parallelSpeedupFactor: number;
  fieldExtractionYield: string;
  mlReviewPriority: "STANDARD_REVIEW" | "ELEVATED_PRIORITY";
  mlElevatedProbability: number;
  mlTriageQueue: string;
}

export interface DocumentDto {
  id: string;
  fdrId: string;
  documentType: FdrDocumentType;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  storageKey?: string | null;
  sha256Checksum?: string | null;
  uploadedByUserId?: string | null;
  uploadedByRole?: string | null;
  processingStatus?: string;
  isVerified: boolean;
  verifiedAt?: string | null;
  extractedData?: {
    id?: string;
    extractedFdrNumber?: string | null;
    extractedAmount?: number | null;
    extractedBankName?: string | null;
    extractedIfsc?: string | null;
    extractedIssueDate?: string | null;
    extractedMaturityDate?: string | null;
    extractedInstitutionName?: string | null;
    confidenceScore: number;
    ocrEngine?: string | null;
    ocrVersion?: string | null;
    processingDurationMs?: number | null;
    status?: string;
    candidates?: Record<string, ExtractedFieldCandidate<unknown>> | null;
    corrections?: DocumentFieldCorrectionDto[];
  } | null;
  metadata?: DocumentMetadataDto | null;
  barcodes?: DocumentBarcodeDto[] | null;
  elaResult?: DocumentElaResultDto | null;
  layoutFindings?: LayoutAnomalyFindingDto[] | null;
  visualRegions?: DocumentVisualRegionDto[] | null;
  findings?: RiskFindingDto[] | null;
  aiEfficiency?: DocumentAiEfficiencyDto | null;
  createdAt: string;
}

export interface ReleaseRequestDto {
  id: string;
  fdrId: string;
  fdrNumber: string;
  institutionId: string;
  institutionName: string;
  requestedAmount: number;
  statutoryTenureCompleted: boolean;
  nocIssued: boolean;
  status: ReleaseRequestStatus;
  submissionDate: string;
  committeeDecisionDate?: string | null;
  committeeRemarks?: string | null;
}

export interface AlertDto {
  id: string;
  fdrId?: string | null;
  fdrNumber?: string;
  institutionId: string;
  institutionName?: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  isResolved: boolean;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  fdrId?: string | null;
  fdrNumber?: string;
  institutionId?: string | null;
  institutionName?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

export type RiskFindingCategory =
  | "METADATA_REVIEW_INDICATOR"
  | "QR_REFERENCE_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "DATE_INCONSISTENCY"
  | "OCR_UNCERTAINTY"
  | "ELA_ANOMALY"
  | "LAYOUT_INCONSISTENCY"
  | "SEAL_SIGNATURE_ISSUE"
  | "EXTERNAL_VERIFICATION_MISMATCH"
  | "EXTERNAL_VERIFICATION_UNAVAILABLE"
  | "GENERAL_DISCREPANCY";

export type RiskFindingSourceAnalysis =
  | "METADATA_FORENSICS"
  | "BARCODE_CROSS_VALIDATION"
  | "OCR_EXTRACTION"
  | "ERROR_LEVEL_ANALYSIS"
  | "LAYOUT_CONSISTENCY"
  | "SEAL_SIGNATURE_DETECTOR"
  | "EXTERNAL_BANK_VERIFICATION"
  | "ADMINISTRATIVE_RULE"
  | "SYSTEM";

export type RiskFindingResolutionState = "OPEN" | "RESOLVED" | "DISMISSED";
export type RiskFindingSeverity = AlertSeverity;

export type RiskEvaluationStatus =
  | "SCREENING_INDICATOR"
  | "FIELD_MISMATCH"
  | "VERIFICATION_FAILED"
  | "VERIFICATION_INCONCLUSIVE"
  | "NO_INDICATORS_FOUND"
  | "ANALYSIS_INCOMPLETE";

export type RiskTier = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const RISK_ENGINE_REGULATORY_DISCLAIMER =
  'Administrative risk scores and forensic screening indicators are decision-support metrics designed to guide regulatory scrutiny and direct bank verification. A high risk score does not prove criminal forgery; conversely, "No indicators found" does NOT imply the instrument is authentic or genuine. Direct statutory bank verification is always required.';

export interface RiskFindingDto {
  id: string;
  fdrId: string;
  fdrNumber?: string;
  institutionName?: string;
  documentId?: string | null;
  riskCode: string;
  category?: RiskFindingCategory;
  sourceAnalysis?: RiskFindingSourceAnalysis;
  evidenceJson?: string | null;
  evidence?: Record<string, unknown> | null;
  ruleKey?: string;
  ruleVersion?: string;
  severity: AlertSeverity;
  description: string;
  recommendedAction?: string | null;
  resolutionState?: RiskFindingResolutionState;
  isResolved: boolean;
  reviewerDecision?: string | null;
  reviewerJustification?: string | null;
  resolvedByUserId?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ContributingRiskFactor {
  category: RiskFindingCategory;
  ruleKey: string;
  points: number;
  description: string;
  severity: AlertSeverity;
}

export interface CompositeRiskScoreDto {
  fdrId: string;
  score: number; // 0 to 100
  riskTier: RiskTier;
  evaluationStatus: RiskEvaluationStatus;
  statusLabel: string;
  contributingFactors: ContributingRiskFactor[];
  openFindingsCount: number;
  totalFindingsCount: number;
  disclaimer: string;
  calculatedAt: string;
}

export interface RiskFindingResolutionRequestDto {
  findingId: string;
  fdrId: string;
  decision: "ACCEPTED_RISK" | "FALSE_POSITIVE" | "BANK_CONFIRMED" | "REJECTED_INSTRUMENT";
  justification: string;
  officerId: string;
  officerName: string;
  officerRole: string;
}

/**
 * Command Center aggregated summary contract
 */
export interface CommandCenterMetricsDto {
  source: "database" | "synthetic_seed";
  timestamp: string;
  scope: {
    institutionId?: string;
    institutionName?: string;
    role: string;
  };
  overview: {
    totalPledgedCapital: number;
    activeInstrumentCount: number;
    pendingVerificationCount: number;
    maturedPendingFollowupCount: number;
    upcomingMaturitiesCount30D: number;
    upcomingMaturitiesCount60D: number;
    upcomingMaturitiesCount90D: number;
    missingRenewalEvidenceCount: number;
    openReleaseRequestsCount: number;
    unresolvedDiscrepanciesCount: number;
    lienConfirmationRate: number; // 0 to 100 percentage
  };
  instruments: FdrInstrumentDto[];
  upcomingMaturities: FdrInstrumentDto[];
  pendingVerifications: FdrInstrumentDto[];
  maturedPendingFollowup: FdrInstrumentDto[];
  missingRenewalEvidence: FdrInstrumentDto[];
  openReleaseRequests: ReleaseRequestDto[];
  unresolvedDiscrepancies: RiskFindingDto[];
  recentAuditEvents: AuditLogDto[];
  criticalAlerts: AlertDto[];
}

export const ELA_REGULATORY_DISCLAIMER =
  "Error Level Analysis (ELA) and layout consistency indicators identify digital resaving patterns, compression disparities, and geometric misalignments. They are forensic indicators to guide human regulatory scrutiny and direct bank verification, NOT definitive proof of forgery. Scanning artifacts, re-compression, physical stamps, and legitimate cropping naturally introduce variations.";

export interface ElaFinding {
  id: string;
  severity: "INFO" | "WARNING";
  title: string;
  explanation: string;
  measuredValue?: number | string;
  threshold?: number | string;
  recommendedAction: string;
}

export interface DocumentElaResultDto {
  id: string;
  documentId: string;
  recompressionQuality: number;
  averageErrorLevel: number;
  peakError: number;
  highDiscrepancyRatio: number;
  diagnosticStorageKey?: string | null;
  diagnosticImageUrl?: string | null;
  formatType: "JPEG" | "PNG" | "PDF_RASTER" | "PDF_VECTOR" | "UNSUPPORTED";
  status: "COMPLETED" | "SKIPPED" | "FAILED";
  findings: ElaFinding[];
  analyzerVersion: string;
  analyzedAt: string;
}

export interface LayoutAnomalyFindingDto {
  id: string;
  documentId: string;
  anomalyType:
    | "BASELINE_VARIANCE"
    | "FONT_HEIGHT_JUMP"
    | "SPACING_IRREGULARITY"
    | "TEXT_COLLISION"
    | "DIGITAL_RASTER_INCONSISTENCY";
  pageNumber: number;
  severity: "INFO" | "WARNING" | "CRITICAL";
  fieldName?: string | null;
  observedValue?: string | null;
  thresholdApplied: string;
  boundingBox?: { x0: number; y0: number; x1: number; y1: number } | null;
  explanation: string;
  recommendedAction: string;
  analyzerVersion: string;
  analyzedAt: string;
}

export const SEAL_SIGNATURE_REGULATORY_DISCLAIMER =
  "Visual seal and signature detection uses experimental layout heuristics and chromatic ink analysis. Absence of a detected region does not prove that a stamp or signature is missing; presence of a stamp or signature does not establish that it is genuine or authorized. Visual detections must NEVER be used as sole proof of authenticity or forgery.";

export type VisualRegionCandidateClass =
  | "BANK_SEAL"
  | "BRANCH_MANAGER_SIGNATURE"
  | "AUTHORIZED_SIGNATORY"
  | "JOINT_HOLDER_SIGNATURE"
  | "UNKNOWN_STAMP_SIGNATURE";

export type VisualRegionDetectionMethod =
  | "EXPERIMENTAL_HEURISTIC"
  | "TRAINED_MODEL"
  | "NOT_CONFIGURED";

export type VisualRegionDetectionStatus =
  | "CANDIDATE_DETECTED"
  | "NOT_DETECTED"
  | "INCONCLUSIVE"
  | "NOT_CONFIGURED";

export interface DocumentVisualRegionDto {
  id: string;
  documentId: string;
  candidateClass: VisualRegionCandidateClass;
  detectionMethod: VisualRegionDetectionMethod;
  detectionStatus: VisualRegionDetectionStatus;
  pageNumber: number;
  confidenceScore: number | null;
  boundingBox: { x0: number; y0: number; x1: number; y1: number } | null;
  anchorText?: string | null;
  inkCharacteristics?: string | null;
  limitations: string;
  isVerifiedByReviewer: boolean;
  reviewerRemarks?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  analyzerVersion: string;
  analyzedAt: string;
}

// ==========================================
// PHASE 3.8 — BANK VERIFICATION PROVIDER & SANDBOX
// ==========================================

export type BankVerificationMode = "SANDBOX_SIMULATED" | "PRODUCTION_LIVE";

export type BankVerificationOutcome =
  | "SANDBOX_MATCH"
  | "SANDBOX_MISMATCH"
  | "SANDBOX_NOT_FOUND"
  | "INCONCLUSIVE"
  | "UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "EXTERNAL_VERIFIED";

export const BANK_VERIFICATION_SANDBOX_DISCLAIMER =
  "SANDBOX SIMULATION ONLY: This verification was generated by the deterministic FDR Guardian AI Sandbox Gateway using synthetic test fixtures. No real bank system, API, or SFMS gateway was contacted. Under statutory regulations, sandbox outcomes must NEVER be represented as live bank confirmations or authorize financial release.";

export interface BankVerificationComparisonItem {
  field: "fdrNumber" | "amount" | "issuingBank" | "ifscCode";
  submittedValue: string;
  providerValue: string | null;
  isMatch: boolean;
  notes?: string;
}

export interface BankVerificationRequestParams {
  fdrId: string;
  fdrNumber: string;
  amount: number;
  bankName: string;
  ifscCode?: string;
  issueDate?: string;
  maturityDate?: string;
  officerUserId: string;
  officerName: string;
  officerRole: string;
  simulationScenario?:
    | "MATCH"
    | "AMOUNT_MISMATCH"
    | "NOT_FOUND"
    | "INCONCLUSIVE"
    | "UNAVAILABLE"
    | "TIMEOUT";
}

export interface BankVerificationResponseDto {
  id: string;
  correlationId: string;
  fdrId: string;
  providerKey: string;
  providerName: string;
  verificationMode: BankVerificationMode;
  outcome: BankVerificationOutcome;
  status: "COMPLETED" | "FAILED" | "TIMEOUT" | "UNAVAILABLE";
  requestedFields: {
    fdrNumber: string;
    amount: number;
    bankName: string;
    ifscCode?: string;
  };
  verifiedFields?: {
    fdrNumber?: string | null;
    amount?: number | null;
    bankName?: string | null;
    accountStatus?: "ACTIVE_PLEDGED" | "CLOSED" | "NOT_FOUND" | "FROZEN" | null;
    isLienMarked?: boolean;
    lienConfirmedAt?: string | null;
  } | null;
  verifiedAmount?: number | null;
  verifiedBankName?: string | null;
  isLienConfirmed?: boolean | null;
  comparisons: BankVerificationComparisonItem[];
  disclaimer: string;
  inconclusiveReason?: string | null;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null;
  durationMs: number;
  timestamp: string;
  requestedBy: {
    userId: string;
    name?: string | null;
    role: string;
  };
}

export interface BankVerificationProviderStatusDto {
  providerKey: string;
  providerName: string;
  mode: BankVerificationMode;
  isConfigured: boolean;
  status: "ONLINE" | "DEGRADED" | "OFFLINE" | "NOT_CONFIGURED";
  supportedFeatures: {
    referenceValidation: boolean;
    amountComparison: boolean;
    issuingBankComparison: boolean;
    lienConfirmation: boolean;
  };
  disclaimer: string;
}

/**
 * Server-side Provider Boundary Interface
 */
export interface BankVerificationProvider {
  readonly providerKey: string;
  readonly providerName: string;
  readonly mode: BankVerificationMode;
  getStatus(): Promise<BankVerificationProviderStatusDto>;
  verifyInstrument(
    params: BankVerificationRequestParams
  ): Promise<BankVerificationResponseDto>;
}

// ==========================================
// PHASE 4 — REACTIVE DASHBOARD & LIVE OPERATIONS
// ==========================================

export type FdrSyncState = "LIVE" | "SYNCING" | "UPDATED" | "STALE" | "OFFLINE";

export interface FdrSyncMetricsChanges {
  totalPledgedCapitalChanged: boolean;
  activeInstrumentCountChanged: boolean;
  upcomingMaturitiesCount30DChanged: boolean;
  lienConfirmationRateChanged: boolean;
  openReleaseRequestsCountChanged: boolean;
  unresolvedDiscrepanciesCountChanged: boolean;
  hasNewInstruments: boolean;
  hasNewFindings: boolean;
}

export interface FdrSyncResponseDto {
  success: boolean;
  serverTimestamp: string;
  intervalSeconds: number;
  syncMode: "CONTROLLED_POLLING";
  metrics: CommandCenterMetricsDto;
  alerts: AlertDto[];
  activeAlertsCount: number;
  criticalAlertsCount: number;
  recentAuditEvents: AuditLogDto[];
  changes?: FdrSyncMetricsChanges;
}

export const CONTROLLED_POLLING_DISCLOSURE =
  "Controlled polling active: Queries protected Next.js Route Handler every 30 seconds. Paused automatically when tab is hidden. Does not use high-overhead WebSockets or claim sub-second updates.";

// ==========================================
// PHASE 5 — FDR MATURITY RADAR, EVIDENCE INTELLIGENCE & LIFECYCLE EXPLORER
// ==========================================

export type MaturityHorizonFilter =
  | "ALL"
  | "EXPIRED"
  | "CRITICAL_30D"
  | "WARNING_60D"
  | "HORIZON_90D"
  | "HEALTHY_ABOVE_90D";

export interface MaturityFollowUpTask {
  id: string;
  fdrId: string;
  fdrNumber: string;
  institutionId: string;
  institutionName: string;
  daysToMaturity: number;
  maturityDate: string;
  maturityStatus: "EXPIRED" | "CRITICAL_30D" | "WARNING_60D" | "NORMAL";
  missingRenewalEvidence: boolean;
  pendingReplacementReview: boolean;
  assignedOfficer: string | null;
  recommendedAction: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export const OCR_CONFIDENCE_STATUTORY_DISCLAIMER =
  "OCR confidence reflects optical character clarity and glyph probability. It is strictly NOT document-authenticity confidence, legal validity, or proof of genuineness. Absence of detected OCR discrepancies does NOT prove an instrument is genuine without independent bank confirmation.";

export const AI_RELEASE_DECISION_SAFEGUARD =
  "AI Evidence Intelligence provides analytical observations, discrepancy detection, and regulatory checklist readiness. Under statutory regulations, AI output NEVER autonomously authorizes a financial release, security refund, or legal decision. Human statutory officer authorization is mandatory.";

export interface EvidenceDiscrepancyField {
  fieldKey: "fdrNumber" | "bankName" | "amount" | "issueDate" | "maturityDate";
  fieldLabel: string;
  submittedValue: string;
  extractedValue: string | null;
  verifiedValue: string | null;
  documentReference: string | null;
  pageNumber: number | null;
  extractionConfidence: number | null; // 0.0 to 1.0
  comparisonRule: string;
  isMismatch: boolean;
  explanation: string;
  requiredNextStep: string;
  reviewStatus: "MATCH" | "DISCREPANCY_OPEN" | "DISCREPANCY_RESOLVED" | "MANUALLY_CORRECTED";
  corrections: DocumentFieldCorrectionDto[];
}

export interface LineageGraphNode {
  id: string;
  fdrNumber: string;
  institutionName: string;
  amount: number;
  administrativeState: FdrAdministrativeState;
  renewalState: FdrRenewalState;
  isCurrent: boolean;
  isPredecessor: boolean;
  isReplacement: boolean;
  tenureDates: string;
  bankName: string;
}

export interface LineageGraphEdge {
  source: string;
  target: string;
  relationship: "SUPERSEDED_BY" | "RENEWAL_REPLACEMENT";
  description: string;
}

export interface LifecycleTimelineEvent {
  id: string;
  timestamp: string;
  eventType:
    | "ISSUANCE"
    | "VAULT_INGESTION"
    | "OCR_EXTRACTION"
    | "LIEN_CONFIRMATION"
    | "BANK_VERIFICATION"
    | "RISK_DISCREPANCY"
    | "RENEWAL_REQUEST"
    | "RELEASE_REQUEST"
    | "AUDIT_ACTION";
  title: string;
  description: string;
  actorName?: string;
  actorRole?: string;
  severity?: "INFO" | "WARNING" | "CRITICAL" | "SUCCESS";
  metadata?: Record<string, unknown>;
}

export interface OutstandingObligationItem {
  id: string;
  title: string;
  description: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  isSatisfied: boolean;
  actionRequired: string;
}

export interface InstrumentLifecycleDetailDto {
  instrument: FdrInstrumentDto;
  predecessor: FdrInstrumentDto | null;
  replacements: FdrInstrumentDto[];
  lineageGraph: {
    nodes: LineageGraphNode[];
    edges: LineageGraphEdge[];
  };
  documents: DocumentDto[];
  verificationEvents: {
    id: string;
    officerName: string;
    officerRole: string;
    actionTaken: string;
    previousState: string;
    newState: string;
    remarks: string;
    createdAt: string;
  }[];
  bankVerifications: BankVerificationResponseDto[];
  discrepancies: RiskFindingDto[];
  renewalRequests: {
    id: string;
    requestedTenureMonths: number;
    proposedMaturityDate: string;
    proposedAmount: number | null;
    status: string;
    officerRemarks: string | null;
    createdAt: string;
  }[];
  releaseRequests: ReleaseRequestDto[];
  auditLogs: AuditLogDto[];
  outstandingObligations: OutstandingObligationItem[];
  timeline: LifecycleTimelineEvent[];
}

export type ReleaseReadinessState =
  | "COMPLETE"
  | "MISSING_EVIDENCE"
  | "AWAITING_REVIEW"
  | "BLOCKED_DEPENDENCY"
  | "READY_FOR_DECISION";

export interface ReleaseRequirementCheck {
  key: string;
  title: string;
  isSatisfied: boolean;
  status: "MET" | "DEFICIENT" | "PENDING_VERIFICATION" | "BLOCKED";
  explanation: string;
  evidenceReference?: string | null;
}

export interface ReleaseReadinessEvaluationDto {
  requestId: string;
  fdrId: string;
  fdrNumber: string;
  institutionId: string;
  institutionName: string;
  requestedAmount: number;
  currentStatus: ReleaseRequestStatus;
  readinessState: ReleaseReadinessState;
  requirements: ReleaseRequirementCheck[];
  blockedDependencies: string[];
  reviewerObservations: string[];
  aiRecommendation: string;
  allowedTransitions: ReleaseRequestStatus[];
  submissionDate: string;
  committeeDecisionDate?: string | null;
  committeeRemarks?: string | null;
}


