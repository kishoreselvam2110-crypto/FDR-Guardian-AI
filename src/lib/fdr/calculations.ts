import type {
  CommandCenterMetricsDto,
  FdrInstrumentDto,
  ReleaseRequestDto,
  AlertDto,
  RiskFindingDto,
  AuditLogDto,
} from "./types.ts";

/**
 * Pure calculation helper to compile metric summaries from raw lists.
 * Excludes superseded historical instruments to prevent double-counting capital,
 * while maintaining complete regulatory audit trail lineage.
 */
export function compileMetricsPayload(
  instruments: FdrInstrumentDto[],
  releaseRequests: ReleaseRequestDto[],
  alerts: AlertDto[],
  riskFindings: RiskFindingDto[],
  auditLogs: AuditLogDto[],
  source: "database" | "synthetic_seed",
  institutionId?: string
): CommandCenterMetricsDto {
  // Exclude superseded/archived historical instruments from active counts
  const activeInstruments = instruments.filter(
    (i) => i.renewalState !== "REPLACED_SUPERSEDED" && i.administrativeState !== "RELEASED"
  );

  const totalPledgedCapital = activeInstruments.reduce((acc, curr) => acc + curr.amount, 0);

  const upcomingMaturities30D = activeInstruments.filter(
    (i) => i.daysToMaturity > 0 && i.daysToMaturity <= 30
  );
  const upcomingMaturities60D = activeInstruments.filter(
    (i) => i.daysToMaturity > 30 && i.daysToMaturity <= 60
  );
  const upcomingMaturities90D = activeInstruments.filter(
    (i) => i.daysToMaturity > 60 && i.daysToMaturity <= 90
  );

  const maturedPendingFollowup = activeInstruments.filter((i) => i.daysToMaturity <= 0);

  const pendingVerification = activeInstruments.filter((i) => i.verificationState === "PENDING");

  const missingRenewalEvidence = activeInstruments.filter(
    (i) => (i.daysToMaturity <= 30 || i.daysToMaturity <= 0) && i.renewalState === "ORIGINAL"
  );

  const openReleaseRequests = releaseRequests.filter(
    (r) => r.status === "SUBMITTED" || r.status === "UNDER_SCRUTINY" || r.status === "COMMITTEE_REVIEW"
  );

  const unresolvedDiscrepancies = riskFindings.filter((rf) => !rf.isResolved);

  const lienMarkedCount = activeInstruments.filter((i) => i.isLienMarked).length;
  const lienConfirmationRate =
    activeInstruments.length > 0
      ? Math.round((lienMarkedCount / activeInstruments.length) * 100)
      : 0;

  return {
    source,
    timestamp: new Date().toISOString(),
    scope: {
      institutionId,
      institutionName: institutionId
        ? instruments[0]?.institutionName || "Selected Institution"
        : "All Institutions (Central Authority Scope)",
      role: "Regulatory Scrutiny Officer",
    },
    overview: {
      totalPledgedCapital,
      activeInstrumentCount: activeInstruments.length,
      pendingVerificationCount: pendingVerification.length,
      maturedPendingFollowupCount: maturedPendingFollowup.length,
      upcomingMaturitiesCount30D: upcomingMaturities30D.length,
      upcomingMaturitiesCount60D: upcomingMaturities60D.length,
      upcomingMaturitiesCount90D: upcomingMaturities90D.length,
      missingRenewalEvidenceCount: missingRenewalEvidence.length,
      openReleaseRequestsCount: openReleaseRequests.length,
      unresolvedDiscrepanciesCount: unresolvedDiscrepancies.length,
      lienConfirmationRate,
    },
    instruments: activeInstruments,
    upcomingMaturities: [...upcomingMaturities30D, ...upcomingMaturities60D],
    pendingVerifications: pendingVerification,
    maturedPendingFollowup,
    missingRenewalEvidence,
    openReleaseRequests,
    unresolvedDiscrepancies,
    recentAuditEvents: auditLogs,
    criticalAlerts: alerts.filter((a) => a.severity === "CRITICAL"),
  };
}
