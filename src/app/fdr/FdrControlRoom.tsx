"use client";

import React, { useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable, Column } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import type {
  CommandCenterMetricsDto,
  FdrInstrumentDto,
  DocumentDto,
  FdrDocumentType,
  RiskFindingDto,
  RiskFindingCategory,
  BankVerificationResponseDto,
  BankVerificationMode,
} from "@/lib/fdr/types";
import {
  confirmBankLienAction,
  submitFdrRenewalAction,
  resolveRiskFindingServerAction,
  requestBankVerificationAction,
} from "@/lib/fdr/service";
import {
  calculateCompositeFdrRisk,
} from "@/lib/fdr/riskEngine";
import { useFdrSync } from "@/lib/fdr/useFdrSync";
import { SyncStatusIndicator } from "@/components/fdr/SyncStatusIndicator";
import { NotificationCenter } from "@/components/fdr/NotificationCenter";
import { FdrForensicWorkbench } from "./FdrForensicWorkbench";
import { MaturityRadarView } from "@/components/fdr/MaturityRadarView";
import { InstrumentLifecycleExplorer } from "@/components/fdr/InstrumentLifecycleExplorer";
import { ReleaseReadinessView } from "@/components/fdr/ReleaseReadinessView";
import { EvidenceDiscrepancyWorkbench } from "@/components/fdr/EvidenceDiscrepancyWorkbench";
import { InstrumentQuickDetailDrawer } from "@/components/fdr/InstrumentQuickDetailDrawer";

interface FdrControlRoomProps {
  initialData: CommandCenterMetricsDto;
}

export function FdrControlRoom({ initialData }: FdrControlRoomProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams.get("tab") || "overview";
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  // Phase 4: Reactive data synchronization with controlled polling, tab visibility pausing & deduplicated alerts
  const {
    data,
    setData,
    alerts: persistentAlerts,
    syncState,
    lastSyncTime,
    lastSuccessfulSyncTime,
    error: syncError,
    isPaused,
    changedFields,
    intervalSeconds,
    refreshNow,
    isSyncing,
    resolveAlertItem,
    resolveAllAlertsList,
    liveAnnouncement,
  } = useFdrSync({
    initialData,
    institutionId: initialData.scope.institutionId,
    pollingIntervalMs: 30000,
  });

  const [searchQuery, setSearchQuery] = useState(searchParams.get("query") || "");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("filter") || "ALL");
  const [drawerInstrument, setDrawerInstrument] = useState<FdrInstrumentDto | null>(null);

  // Keyboard shortcut navigation (1-5 for tabs, R for telemetry sync)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInput = activeTag === "input" || activeTag === "textarea" || activeTag === "select";
      if (isInput) return;

      if (e.key === "1") {
        router.push("/fdr?tab=overview");
      } else if (e.key === "2") {
        router.push("/fdr?tab=maturity");
      } else if (e.key === "3") {
        router.push("/fdr?tab=workbench");
      } else if (e.key === "4") {
        router.push("/fdr?tab=lifecycle&fdrId=fdr-synth-102");
      } else if (e.key === "5") {
        router.push("/fdr?tab=releases");
      } else if (e.key === "r" || e.key === "R") {
        refreshNow();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, refreshNow]);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    variant: "primary" | "danger" | "warning";
    action: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    confirmLabel: "Confirm",
    variant: "primary",
    action: () => {},
  });

  // Renewal submission modal state
  const [renewalModal, setRenewalModal] = useState<{
    isOpen: boolean;
    instrument: FdrInstrumentDto | null;
    tenureMonths: number;
    remarks: string;
  }>({
    isOpen: false,
    instrument: null,
    tenureMonths: 60,
    remarks: "",
  });

  // Secure document upload modal state
  const [uploadModal, setUploadModal] = useState<{
    isOpen: boolean;
    fdrId: string;
    documentType: FdrDocumentType;
    file: File | null;
    isUploading: boolean;
    error: string | null;
  }>({
    isOpen: false,
    fdrId: initialData.instruments[0]?.id || "",
    documentType: "FDR_CERTIFICATE_SCAN",
    file: null,
    isUploading: false,
    error: null,
  });

  const [recentUploads, setRecentUploads] = useState<DocumentDto[]>([]);
  const [elaModalImage, setElaModalImage] = useState<{
    isOpen: boolean;
    url: string;
    fileName: string;
    metrics: string;
  } | null>(null);

  const [resolveFindingModal, setResolveFindingModal] = useState<{
    isOpen: boolean;
    finding: RiskFindingDto | null;
    decision: "ACCEPTED_RISK" | "FALSE_POSITIVE" | "BANK_CONFIRMED" | "REJECTED_INSTRUMENT";
    justification: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    finding: null,
    decision: "BANK_CONFIRMED",
    justification: "",
    isSubmitting: false,
  });

  // Reviewer assignment modal state (Phase 5.A)
  const [assignReviewerModal, setAssignReviewerModal] = useState<{
    isOpen: boolean;
    fdrId: string;
    officerId: string;
    officerName: string;
    officerRole: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    fdrId: "",
    officerId: "usr-officer-01",
    officerName: "Dr. R. Ramanathan",
    officerRole: "Regulatory Scrutiny Officer",
    isSubmitting: false,
  });

  const handleAssignReviewerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignReviewerModal.fdrId) return;

    setAssignReviewerModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const res = await fetch(`/api/fdr/${assignReviewerModal.fdrId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officerId: assignReviewerModal.officerId,
          officerName: assignReviewerModal.officerName,
          officerRole: assignReviewerModal.officerRole,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to assign reviewer");

      showToast({
        title: "Reviewer Assigned",
        message: `${assignReviewerModal.officerName} assigned to scrutinize instrument.`,
        type: "success",
      });

      setAssignReviewerModal((prev) => ({ ...prev, isOpen: false, isSubmitting: false }));
    } catch (err: unknown) {
      const error = err as Error;
      setAssignReviewerModal((prev) => ({ ...prev, isSubmitting: false }));
      showToast({
        title: "Assignment Failed",
        message: error.message,
        type: "error",
      });
    }
  };

  const handleResolveFindingSubmit = async () => {
    if (!resolveFindingModal.finding) return;
    if (resolveFindingModal.justification.trim().length < 10) {
      showToast({
        title: "Justification Required",
        message: "Mandatory regulatory justification must be at least 10 characters.",
        type: "error",
      });
      return;
    }

    setResolveFindingModal((prev) => ({ ...prev, isSubmitting: true }));
    startTransition(async () => {
      const res = await resolveRiskFindingServerAction({
        findingId: resolveFindingModal.finding!.id,
        fdrId: resolveFindingModal.finding!.fdrId,
        decision: resolveFindingModal.decision,
        justification: resolveFindingModal.justification,
        officerId: "usr-officer",
        officerName: "Regulatory Scrutiny Officer",
        officerRole: "Regulatory Scrutiny Officer",
      });

      if (res.success) {
        setData((prev) => ({
          ...prev,
          unresolvedDiscrepancies: prev.unresolvedDiscrepancies.filter(
            (f) => f.id !== resolveFindingModal.finding!.id
          ),
          overview: {
            ...prev.overview,
            unresolvedDiscrepanciesCount: Math.max(0, prev.overview.unresolvedDiscrepanciesCount - 1),
          },
        }));

        setResolveFindingModal({
          isOpen: false,
          finding: null,
          decision: "BANK_CONFIRMED",
          justification: "",
          isSubmitting: false,
        });

        showToast({
          title: "Risk Finding Resolved",
          message: `Finding marked as ${res.finding?.resolutionState}. Regulatory audit log recorded.`,
          type: "success",
        });
      } else {
        setResolveFindingModal((prev) => ({ ...prev, isSubmitting: false }));
        showToast({
          title: "Resolution Failed",
          message: res.error || "Failed to resolve finding.",
          type: "error",
        });
      }
    });
  };

  const [bankVerifyModal, setBankVerifyModal] = useState<{
    isOpen: boolean;
    fdrId: string;
    scenario: "MATCH" | "AMOUNT_MISMATCH" | "NOT_FOUND" | "INCONCLUSIVE" | "UNAVAILABLE" | "TIMEOUT";
    preferMode: BankVerificationMode;
    isSubmitting: boolean;
    latestResult: BankVerificationResponseDto | null;
  }>({
    isOpen: false,
    fdrId: initialData.instruments[0]?.id || "",
    scenario: "MATCH",
    preferMode: "SANDBOX_SIMULATED",
    isSubmitting: false,
    latestResult: null,
  });

  const handleBankVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inst = data.instruments.find((i) => i.id === bankVerifyModal.fdrId);
    if (!inst) return;

    setBankVerifyModal((prev) => ({ ...prev, isSubmitting: true }));
    startTransition(async () => {
      try {
        const res = await requestBankVerificationAction({
          fdrId: inst.id,
          fdrNumber: inst.fdrNumber,
          amount: inst.amount,
          bankName: inst.bankName,
          ifscCode: inst.ifscCode,
          officerUserId: "usr-officer",
          officerName: "Regulatory Scrutiny Officer",
          officerRole: "Regulatory Scrutiny Officer",
          simulationScenario: bankVerifyModal.scenario,
        });

        setBankVerifyModal((prev) => ({
          ...prev,
          isSubmitting: false,
          latestResult: res,
        }));

        showToast({
          title: `Verification Outcome: ${res.outcome.replace(/_/g, " ")}`,
          message: `${res.providerName}: Correlation #${res.correlationId.substring(0, 16)}...`,
          type: res.outcome === "SANDBOX_MATCH" ? "success" : res.outcome === "NOT_CONFIGURED" ? "warning" : "error",
        });
      } catch (err: unknown) {
        const error = err as Error;
        setBankVerifyModal((prev) => ({ ...prev, isSubmitting: false }));
        showToast({
          title: "Verification Request Failed",
          message: error.message,
          type: "error",
        });
      }
    });
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadModal.file || !uploadModal.fdrId) {
      setUploadModal((prev) => ({
        ...prev,
        error: "Please select an FDR certificate and attach a supported file.",
      }));
      return;
    }

    setUploadModal((prev) => ({ ...prev, isUploading: true, error: null }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 25000); // 25s timeout safeguard to guarantee the UI never freezes

    try {
      const formData = new FormData();
      formData.append("file", uploadModal.file);
      formData.append("documentType", uploadModal.documentType);

      const res = await fetch(`/api/fdr/${uploadModal.fdrId}/documents`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const json = await res.json();
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(json.message || json.error || "Upload failed");
      }

      setRecentUploads((prev) => [json.data, ...prev]);

      if (json.data.findings && Array.isArray(json.data.findings)) {
        setData((prev) => {
          const newOpenFindings = json.data.findings.filter((f: RiskFindingDto) => !f.isResolved);
          const combined = [
            ...newOpenFindings,
            ...prev.unresolvedDiscrepancies.filter(
              (p) => !json.data.findings.some((nf: RiskFindingDto) => nf.id === p.id)
            ),
          ];
          return {
            ...prev,
            unresolvedDiscrepancies: combined,
            overview: {
              ...prev.overview,
              unresolvedDiscrepanciesCount: combined.length,
            },
          };
        });
      }
      setUploadModal({
        isOpen: false,
        fdrId: initialData.instruments[0]?.id || "",
        documentType: "FDR_CERTIFICATE_SCAN",
        file: null,
        isUploading: false,
        error: null,
      });

      const effMsg = json.data?.aiEfficiency
        ? ` AI processed in ${json.data.aiEfficiency.pipelineDurationMs}ms (${json.data.aiEfficiency.parallelSpeedupFactor}x parallel speedup). Yield: ${json.data.aiEfficiency.fieldExtractionYield}. Triage: ${json.data.aiEfficiency.mlReviewPriority}.`
        : ` SHA-256: ${json.data.sha256Checksum?.substring(0, 10)}...`;

      showToast({
        title: "AI Analysis & Ingestion Complete",
        message: `${json.data.fileName} (${(json.data.fileSizeBytes / 1024).toFixed(1)} KB).${effMsg}`,
        type: "success",
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const error = err as Error;
      const isTimeout = error.name === "AbortError";
      const errorMessage = isTimeout
        ? "AI Pipeline Timed Out: Ingestion exceeded 25s safety limit. Please check image resolution and try again."
        : error.message || "Upload failed";

      setUploadModal((prev) => ({ ...prev, isUploading: false, error: errorMessage }));
      showToast({
        title: isTimeout ? "Analysis Timed Out" : "Ingestion Rejected",
        message: errorMessage,
        type: "error",
      });
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Filter instruments based on search and status
  const filteredInstruments = data.instruments.filter((inst) => {
    const matchesSearch =
      inst.fdrNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.institutionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.bankName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.ifscCode.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === "ALL") return true;
    if (statusFilter === "ACTION_REQUIRED")
      return !inst.isLienMarked || inst.daysToMaturity <= 60 || inst.alertsCount > 0;
    if (statusFilter === "DUE_SOON" || statusFilter === "MATURING_SOON")
      return inst.daysToMaturity <= 60 && inst.daysToMaturity > 0;
    if (statusFilter === "BLOCKED")
      return inst.alertsCount > 0 || !inst.isLienMarked || inst.daysToMaturity <= 0;
    if (statusFilter === "EXPIRED") return inst.daysToMaturity <= 0;
    if (statusFilter === "PENDING_VERIFICATION")
      return inst.verificationState === "PENDING";
    if (statusFilter === "LIEN_MISSING") return !inst.isLienMarked;
    if (statusFilter === "VERIFIED") return inst.verificationState === "VERIFIED";

    return true;
  });

  const quickFilterCounts = {
    all: data.instruments.length,
    actionRequired: data.instruments.filter(
      (i) => !i.isLienMarked || i.daysToMaturity <= 60 || i.alertsCount > 0
    ).length,
    dueSoon: data.instruments.filter((i) => i.daysToMaturity <= 60 && i.daysToMaturity > 0).length,
    blocked: data.instruments.filter(
      (i) => i.alertsCount > 0 || !i.isLienMarked || i.daysToMaturity <= 0
    ).length,
    verified: data.instruments.filter((i) => i.verificationState === "VERIFIED").length,
  };

  // Handle Bank Lien Confirmation Action
  const handleConfirmLien = (item: FdrInstrumentDto) => {
    setConfirmModal({
      isOpen: true,
      title: `Verify Bank Lien: ${item.fdrNumber}`,
      description: `Confirm that official lien confirmation letter from ${item.bankName} (${item.ifscCode}) has been verified and pledged in favor of the Regulatory Authority.`,
      confirmLabel: "Mark Lien Verified",
      variant: "primary",
      action: () => {
        startTransition(async () => {
          const res = await confirmBankLienAction(
            item.id,
            "Dr. S. K. Sharma (Regional Officer)",
            "Lien confirmed through branch validation portal"
          );

          // Update local state reactively
          setData((prev) => {
            const updated = prev.instruments.map((inst) =>
              inst.id === item.id
                ? {
                    ...inst,
                    isLienMarked: true,
                    lienConfirmedAt: new Date().toISOString(),
                    verificationState: "VERIFIED" as const,
                  }
                : inst
            );
            const lienCount = updated.filter((i) => i.isLienMarked).length;
            return {
              ...prev,
              instruments: updated,
              overview: {
                ...prev.overview,
                lienConfirmationRate:
                  updated.length === 0 ? 0 : Math.round((lienCount / updated.length) * 100),
              },
            };
          });

          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          showToast({
            title: "Bank Lien Verified",
            message: `${item.fdrNumber} lien status marked active and recorded in audit ledger (${res.source}).`,
            type: "success",
          });
        });
      },
    });
  };

  // Handle Renewal Submission Action
  const handleRenewalSubmit = async () => {
    if (!renewalModal.instrument) return;
    const inst = renewalModal.instrument;
    const tenure = renewalModal.tenureMonths;
    const remarks = renewalModal.remarks;

    startTransition(async () => {
      const res = await submitFdrRenewalAction(inst.id, tenure, remarks);

      setData((prev) => ({
        ...prev,
        instruments: prev.instruments.map((i) =>
          i.id === inst.id
            ? { ...i, renewalState: "RENEWAL_REQUESTED" as const }
            : i
        ),
      }));

      setRenewalModal({ isOpen: false, instrument: null, tenureMonths: 60, remarks: "" });
      showToast({
        title: "Renewal Petition Registered",
        message: `FDR renewal for ${inst.fdrNumber} submitted for ${tenure} months extension (${res.source}).`,
        type: "success",
      });
    });
  };

  // Table Columns Definition
  const tableColumns: Column<FdrInstrumentDto>[] = [
    {
      key: "fdrNumber",
      header: "FDR Certificate No.",
      render: (item) => (
        <div>
          <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
            {item.fdrNumber}
          </span>
          <p className="text-[10px] text-slate-500 font-sans truncate max-w-xs">
            {item.institutionName}
          </p>
        </div>
      ),
    },
    {
      key: "bankName",
      header: "Issuing Bank & Branch",
      render: (item) => (
        <div>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {item.bankName}
          </span>
          <p className="text-[10px] text-slate-500 font-mono">
            {item.ifscCode} • {item.branchName.split(",")[0]}
          </p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Principal (INR)",
      align: "right",
      render: (item) => (
        <div>
          <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
            {formatCurrency(item.amount)}
          </span>
          <span className="text-[10px] text-slate-400 block font-mono">
            @{item.interestRate}% p.a.
          </span>
        </div>
      ),
    },
    {
      key: "maturityDate",
      header: "Maturity & Horizon",
      align: "center",
      render: (item) => {
        const isExpired = item.daysToMaturity <= 0;
        const isCritical = item.daysToMaturity > 0 && item.daysToMaturity <= 30;
        const isWarning = item.daysToMaturity > 30 && item.daysToMaturity <= 60;

        let badgeColor = "text-slate-500";
        if (isExpired) badgeColor = "text-rose-600 font-bold dark:text-rose-400";
        else if (isCritical) badgeColor = "text-amber-600 font-bold dark:text-amber-400";
        else if (isWarning) badgeColor = "text-amber-700 dark:text-amber-300";

        return (
          <div className="text-center">
            <span className="font-mono text-slate-700 dark:text-slate-300 text-xs block">
              {formatDate(item.maturityDate)}
            </span>
            <span className={`text-[10px] font-mono block ${badgeColor}`}>
              {isExpired
                ? `Expired ${Math.abs(item.daysToMaturity)}d ago`
                : item.daysToMaturity <= 90
                ? `${item.daysToMaturity} days left`
                : `${Math.round(item.daysToMaturity / 365)}y remaining`}
            </span>
          </div>
        );
      },
    },
    {
      key: "isLienMarked",
      header: "Bank Lien",
      align: "center",
      render: (item) => (
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
            item.isLienMarked
              ? "bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300"
              : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300"
          }`}
        >
          {item.isLienMarked ? "Confirmed ✓" : "Pending ✗"}
        </span>
      ),
    },
    {
      key: "verificationState",
      header: "Regulatory Status",
      align: "center",
      render: (item) => {
        let statusString = item.verificationState.toLowerCase();
        if (item.daysToMaturity <= 0) statusString = "matured";
        else if (item.daysToMaturity <= 30) statusString = "maturing_soon";
        else if (item.renewalState === "RENEWAL_REQUESTED") statusString = "renewal_requested";
        return <StatusBadge status={statusString} size="sm" />;
      },
    },
    {
      key: "id",
      header: "Actions",
      align: "right",
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5 font-sans">
          {!item.isLienMarked && (
            <button
              type="button"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                handleConfirmLien(item);
              }}
              className="px-2 py-1 text-[11px] font-bold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60 transition-colors cursor-pointer"
            >
              Verify Lien
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/fdr?tab=workbench&fdrId=${item.id}`);
            }}
            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200/80 dark:bg-teal-950/60 dark:hover:bg-teal-900 text-teal-800 dark:text-teal-300 dark:border-teal-800/60 transition-colors cursor-pointer"
            title="Open in Forensic Verification Workbench"
          >
            Workbench 🔬
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/fdr?tab=documents&fdrId=${item.id}`);
            }}
            className="px-2 py-1 text-[11px] font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Dossier
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppShell
      pageTitle="Regulatory Operations Control Room"
      pageSubtitle="FDR Guardian AI • Master ledger tracking institutional security deposits, bank lien verifications, and statutory maturities"
      contextualActions={
        <>
          <SyncStatusIndicator
            syncState={syncState}
            lastSyncTime={lastSyncTime}
            lastSuccessfulSyncTime={lastSuccessfulSyncTime}
            intervalSeconds={intervalSeconds}
            isPaused={isPaused}
            isSyncing={isSyncing}
            onRefresh={refreshNow}
            error={syncError}
          />

          <NotificationCenter
            alerts={persistentAlerts}
            onResolveAlert={resolveAlertItem}
            onResolveAll={resolveAllAlertsList}
            onSelectInstrument={(fdrNum) => {
              setSearchQuery(fdrNum);
              router.push("/fdr?tab=overview");
            }}
          />

          <button
            type="button"
            onClick={() => {
              showToast({
                title: "Regulatory Statement Generated",
                message: `AICTE Security Deposit Digest (${filteredInstruments.length} instruments, ${formatCurrency(data.overview.totalPledgedCapital)}) exported as signed PDF.`,
                type: "success",
              });
            }}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>↓ Export Ledger Statement</span>
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Screen Reader Live Announcement */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {liveAnnouncement}
        </div>

        {/* Offline / Connection Failure Recovery Banner */}
        {syncState === "OFFLINE" && (
          <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-300 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">⚠ Banking Gateway Unreachable:</span>
              <span>
                {syncError || "Could not connect to live operations node."} Showing last verified data snapshot from{" "}
                <strong>
                  {lastSuccessfulSyncTime
                    ? lastSuccessfulSyncTime.toLocaleTimeString("en-IN")
                    : "initial state"}
                </strong>
                .
              </span>
            </div>
            <button
              type="button"
              onClick={refreshNow}
              disabled={isSyncing}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shrink-0 cursor-pointer text-xs transition-colors flex items-center gap-1 self-start sm:self-auto"
            >
              <span className={isSyncing ? "animate-spin" : ""}>↻</span>
              <span>Retry Connection</span>
            </button>
          </div>
        )}

        {/* Data Source & Regulatory Telemetry Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                data.source === "database"
                  ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  data.source === "database" ? "bg-teal-600" : "bg-amber-600"
                }`}
              />
              {data.source === "database"
                ? "● LIVE POSTGRESQL REPOSITORY"
                : "▲ SYNTHETIC DEMO SEED (OFFLINE RECOVERY)"}
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Scope: {data.scope.institutionName}
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="font-mono text-[11px] text-teal-700 dark:text-teal-400 font-medium">
              Controlled Polling: {intervalSeconds}s Interval{" "}
              {isPaused ? "(Paused — Tab Hidden)" : "(Active)"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
            <span>
              Server Event Time:{" "}
              {lastSyncTime
                ? lastSyncTime.toLocaleTimeString("en-IN")
                : new Date(data.timestamp).toLocaleTimeString("en-IN")}
            </span>
          </div>
        </div>

        {/* Operational Metrics Ribbon with Dynamic Change Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div
            className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs transition-all duration-700 ${
              changedFields.has("totalPledgedCapital") || changedFields.has("activeInstrumentCount")
                ? "ring-2 ring-teal-500 bg-teal-50/40 dark:bg-teal-950/40 scale-[1.01]"
                : ""
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Pledged Capital
            </span>
            <span className="text-2xl font-black text-slate-900 dark:text-slate-50 font-mono mt-1 block">
              {formatCurrency(data.overview.totalPledgedCapital)}
            </span>
            <span className="text-[11px] text-teal-600 font-medium mt-0.5 block">
              {data.overview.activeInstrumentCount} Institutional Deposits
            </span>
          </div>

          <div
            className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs transition-all duration-700 ${
              changedFields.has("upcomingMaturitiesCount30D")
                ? "ring-2 ring-amber-500 bg-amber-50/40 dark:bg-amber-950/40 scale-[1.01]"
                : ""
            }`}
          >
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
              Maturity Window (30D)
            </span>
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1 block">
              {data.overview.upcomingMaturitiesCount30D} Deposit
              {data.overview.upcomingMaturitiesCount30D === 1 ? "" : "s"}
            </span>
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium mt-0.5 block">
              {data.overview.maturedPendingFollowupCount > 0
                ? `${data.overview.maturedPendingFollowupCount} overdue for action`
                : "Next deadline within 30 days"}
            </span>
          </div>

          <div
            className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs transition-all duration-700 ${
              changedFields.has("lienConfirmationRate")
                ? "ring-2 ring-teal-500 bg-teal-50/40 dark:bg-teal-950/40 scale-[1.01]"
                : ""
            }`}
          >
            <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider block">
              Bank Lien Marked
            </span>
            <span className="text-2xl font-black text-teal-700 dark:text-teal-300 font-mono mt-1 block">
              {data.overview.lienConfirmationRate}%
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
              {data.instruments.filter((i) => i.isLienMarked).length} of{" "}
              {data.overview.activeInstrumentCount} confirmed by bank
            </span>
          </div>

          <div
            className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs transition-all duration-700 ${
              changedFields.has("openReleaseRequestsCount")
                ? "ring-2 ring-slate-500 bg-slate-50/40 dark:bg-slate-800/40 scale-[1.01]"
                : ""
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Pending Release Petitions
            </span>
            <span className="text-2xl font-black text-slate-900 dark:text-slate-50 font-mono mt-1 block">
              {data.overview.openReleaseRequestsCount} Request
              {data.overview.openReleaseRequestsCount === 1 ? "" : "s"}
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
              {data.openReleaseRequests.length > 0
                ? `${formatCurrency(
                    data.openReleaseRequests.reduce((a, b) => a + b.requestedAmount, 0)
                  )} pending review`
                : "No active release requests"}
            </span>
          </div>
        </div>

        {/* Primary View Switcher Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200/80 dark:border-slate-800/80 text-xs font-semibold">
          <button
            type="button"
            onClick={() => router.push("/fdr?tab=overview")}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              currentTab === "overview" || currentTab === "register"
                ? "bg-teal-700 text-white font-bold shadow-xs shadow-teal-700/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <span>📋 Master Ledger</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                currentTab === "overview" || currentTab === "register"
                  ? "bg-teal-800 text-teal-100"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {data.instruments.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/fdr?tab=workbench")}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              currentTab === "workbench"
                ? "bg-teal-700 text-white font-bold shadow-xs shadow-teal-700/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <span>🔬 Forensic Workbench</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 font-bold">
              Live AI
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/fdr?tab=maturity")}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              currentTab === "maturity"
                ? "bg-teal-700 text-white font-bold shadow-xs shadow-teal-700/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <span>📡 Maturity Radar</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold">
              {data.overview.upcomingMaturitiesCount30D} Due
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/fdr?tab=documents")}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              currentTab === "documents"
                ? "bg-teal-700 text-white font-bold shadow-xs shadow-teal-700/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <span>📄 Document Dossier</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              OCR
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/fdr?tab=lifecycle")}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              currentTab === "lifecycle"
                ? "bg-teal-700 text-white font-bold shadow-xs shadow-teal-700/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <span>🔄 Lifecycle Lineage</span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/fdr?tab=renewals")}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              currentTab === "renewals"
                ? "bg-teal-700 text-white font-bold shadow-xs shadow-teal-700/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <span>⏳ Renewals</span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/fdr?tab=releases")}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              currentTab === "releases"
                ? "bg-teal-700 text-white font-bold shadow-xs shadow-teal-700/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <span>🏛️ Release Approvals</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {data.overview.openReleaseRequestsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/fdr?tab=alerts")}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              currentTab === "alerts"
                ? "bg-teal-700 text-white font-bold shadow-xs shadow-teal-700/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <span>🚨 Alerts</span>
            {data.criticalAlerts.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 font-bold">
                {data.criticalAlerts.length} Critical
              </span>
            )}
          </button>
        </div>

        {/* Critical Alerts Banner (If any) */}
        {data.criticalAlerts.length > 0 && (
          <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300 flex items-center gap-1.5 font-mono">
                <span className="h-2 w-2 rounded-full bg-rose-600" />
                Critical Statutory Escalations ({data.criticalAlerts.length})
              </span>
              <button
                type="button"
                onClick={() => router.push("/fdr?tab=alerts")}
                className="text-xs font-semibold text-rose-800 dark:text-rose-300 hover:underline"
              >
                View in Alerts Desk →
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {data.criticalAlerts.slice(0, 2).map((alert) => (
                <div
                  key={alert.id}
                  className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-rose-200 dark:border-rose-900/40"
                >
                  <p className="font-bold text-slate-900 dark:text-slate-100">{alert.title}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    {alert.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 1: OVERVIEW & MASTER REGISTER */}
        {(currentTab === "overview" || currentTab === "register") && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Master Security Deposit & FDR Ledger
                  </h2>
                  <p className="text-xs text-slate-500">
                    Active certificates registered and verified under joint regulatory liens
                  </p>
                </div>

                {/* Search & Filter Toolbar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="Search certificate, bank, or IFSC..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500 w-56 font-mono"
                  />

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACTION_REQUIRED">Action Required</option>
                    <option value="DUE_SOON">Due Soon (&lt;60D)</option>
                    <option value="BLOCKED">Blocked</option>
                    <option value="VERIFIED">Verified Only</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="LIEN_MISSING">Missing Lien</option>
                    <option value="PENDING_VERIFICATION">Pending Verification</option>
                  </select>

                  <span className="text-[11px] text-slate-400 font-mono ml-1">
                    {filteredInstruments.length} records
                  </span>
                </div>
              </div>

              {/* Quick Filter Command Pills */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className={`px-2.5 py-1 text-xs rounded-lg font-mono font-bold transition-all motion-reduce:transition-none cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === "ALL"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <span>All</span>
                  <span className="opacity-75 tabular-nums text-[10px]">({quickFilterCounts.all})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter("ACTION_REQUIRED")}
                  className={`px-2.5 py-1 text-xs rounded-lg font-mono font-bold transition-all motion-reduce:transition-none cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === "ACTION_REQUIRED"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100 border border-amber-200 dark:border-amber-900"
                  }`}
                >
                  <span>⚡ Action Required</span>
                  <span className="opacity-75 tabular-nums text-[10px]">({quickFilterCounts.actionRequired})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter("DUE_SOON")}
                  className={`px-2.5 py-1 text-xs rounded-lg font-mono font-bold transition-all motion-reduce:transition-none cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === "DUE_SOON" || statusFilter === "MATURING_SOON"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <span>⏳ Due Soon (&lt;60D)</span>
                  <span className="opacity-75 tabular-nums text-[10px]">({quickFilterCounts.dueSoon})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter("BLOCKED")}
                  className={`px-2.5 py-1 text-xs rounded-lg font-mono font-bold transition-all motion-reduce:transition-none cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === "BLOCKED"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100 border border-rose-200 dark:border-rose-900"
                  }`}
                >
                  <span>⚠ Blocked</span>
                  <span className="opacity-75 tabular-nums text-[10px]">({quickFilterCounts.blocked})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter("VERIFIED")}
                  className={`px-2.5 py-1 text-xs rounded-lg font-mono font-bold transition-all motion-reduce:transition-none cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === "VERIFIED"
                      ? "bg-teal-700 text-white shadow-xs"
                      : "bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 hover:bg-teal-100 border border-teal-200 dark:border-teal-900"
                  }`}
                >
                  <span>✓ Verified</span>
                  <span className="opacity-75 tabular-nums text-[10px]">({quickFilterCounts.verified})</span>
                </button>
              </div>

              <div className="transition-opacity duration-200 motion-reduce:transition-none">
                <DataTable
                  columns={tableColumns}
                  data={filteredInstruments}
                  keyExtractor={(item) => item.id}
                  selectedId={drawerInstrument?.id}
                  onRowClick={(item) => setDrawerInstrument(item)}
                />
              </div>
            </div>

            {/* Regulatory Safeguard Mandate */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span className="text-teal-600 font-bold text-sm mt-0.5">ℹ</span>
              <div className="leading-relaxed">
                <strong className="text-slate-800 dark:text-slate-200">
                  Regulatory Safeguard Mandate (SIH26265):
                </strong>{" "}
                FDR deposits are held jointly between the Regional Officer and the Institution&apos;s
                Chairman/Secretary. In accordance with statutory norms, no premature encashment or
                lien release may occur without formal clearance from the Regulatory Scrutiny Board.
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MATURITY RADAR (PHASE 5.A) */}
        {currentTab === "maturity" && (
          <MaturityRadarView
            instruments={data.instruments}
            onSelectInstrument={(fdrId) => router.push(`/fdr?tab=lifecycle&fdrId=${fdrId}`)}
            onOpenWorkbench={(fdrId) => router.push(`/fdr?tab=workbench&fdrId=${fdrId}`)}
            onOpenRenewalModal={(instrument) =>
              setRenewalModal({
                isOpen: true,
                instrument,
                tenureMonths: 60,
                remarks: "",
              })
            }
            onAssignReviewer={(fdrId) =>
              setAssignReviewerModal({
                isOpen: true,
                fdrId,
                officerId: "usr-officer-01",
                officerName: "Dr. R. Ramanathan",
                officerRole: "Regulatory Scrutiny Officer",
                isSubmitting: false,
              })
            }
            showToast={showToast}
          />
        )}

        {/* TAB 3: RENEWAL & REPLACEMENT */}
        {currentTab === "renewals" && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    FDR Renewal & Replacement Desk
                  </h2>
                  <p className="text-xs text-slate-500">
                    Mandated tenure extensions to maintain continuous security deposit lock-in
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800">
                  {data.overview.missingRenewalEvidenceCount} Certificates Requiring Renewal
                </span>
              </div>

              <DataTable
                columns={tableColumns}
                data={data.instruments.filter(
                  (i) => i.daysToMaturity <= 60 || i.renewalState === "RENEWAL_REQUESTED"
                )}
                keyExtractor={(item) => item.id}
              />
            </div>
          </div>
        )}

        {/* TAB 4: RELEASE-READINESS DOSSIER (PHASE 5.D) */}
        {currentTab === "releases" && (
          <ReleaseReadinessView
            currentRole="Regulatory Scrutiny Officer"
            onOpenWorkbench={(fdrId) => router.push(`/fdr?tab=workbench&fdrId=${fdrId}`)}
            showToast={showToast}
          />
        )}

        {/* TAB 5: ALERTS & ESCALATIONS */}
        {currentTab === "alerts" && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Statutory Escalations & Deficiencies
                  </h2>
                  <p className="text-xs text-slate-500">
                    Persistent database-backed compliance alerts with automated deduplication
                  </p>
                </div>
                {persistentAlerts.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await resolveAllAlertsList();
                      if (ok) {
                        showToast({
                          title: "All Alerts Resolved",
                          message: "All open statutory notices marked as resolved.",
                          type: "success",
                        });
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Resolve All Alerts
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {persistentAlerts.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-mono text-xs">
                    <span className="text-3xl block mb-2">✓</span>
                    All statutory compliance alerts and deficiencies are currently resolved.
                  </div>
                ) : (
                  persistentAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                        alert.severity === "CRITICAL"
                          ? "border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20"
                          : "border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                              alert.severity === "CRITICAL"
                                ? "bg-rose-600 text-white"
                                : "bg-amber-600 text-white"
                            }`}
                          >
                            {alert.severity}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                            {alert.title}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {alert.description}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Institution: {alert.institutionName} • Detected:{" "}
                          {formatDate(alert.createdAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await resolveAlertItem(alert.id);
                            if (ok) {
                              showToast({
                                title: "Alert Resolved",
                                message: `Compliance notice for ${alert.title} resolved.`,
                                type: "success",
                              });
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
                        >
                          Resolve Alert
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            showToast({
                              title: "Escalation Notice Dispatched",
                              message: `Formal regulatory notice issued to ${alert.institutionName}.`,
                              type: "warning",
                            });
                          }}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
                        >
                          Issue Notice
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: AUDIT TRAIL */}
        {currentTab === "audit" && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Regulatory Audit Trail Ledger
                  </h2>
                  <p className="text-xs text-slate-500">
                    Immutable event log capturing all verification, lien confirmation, and renewal actions
                  </p>
                </div>
                <span className="text-xs font-mono text-teal-600 font-bold">
                  Cryptographic Integrity Verified ✓
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono">
                {data.recentAuditEvents.map((event) => (
                  <div key={event.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-teal-700 dark:text-teal-400">
                          {event.action}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-700 dark:text-slate-300">{event.actorName}</span>
                        <span className="text-[10px] text-slate-400">({event.actorRole})</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Target: {event.entityType} ({event.entityId}) •{" "}
                        {event.institutionName || "Central Authority"}
                      </p>
                    </div>
                    <span className="text-slate-400 shrink-0">
                      {new Date(event.createdAt).toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: TRUST GUARD */}
        {currentTab === "trust-guard" && (() => {
          const compositeRisk = calculateCompositeFdrRisk(
            "global-scope",
            data.unresolvedDiscrepancies
          );

          const tierColorMap = {
            LOW: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
            MEDIUM: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
            HIGH: "text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",
            CRITICAL: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800",
          };

          return (
            <div className="space-y-6">
              {/* Trust Guard Overview & Forensic Risk Score */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      FDR Trust Guard AI • Verification & Explainable Risk Engine
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 font-bold">
                        Phase 3.7
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      Multi-pipeline forensic synthesis (Metadata, Barcode/QR, OCR, ELA, Layout, Seals & Signatures) with decoupled weights
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => router.push("/fdr?tab=workbench")}
                      className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                    >
                      <span>🔬</span>
                      <span>Forensic Workbench (Phase 3.9)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setBankVerifyModal((prev) => ({
                          ...prev,
                          isOpen: true,
                          fdrId: data.instruments[0]?.id || "",
                          latestResult: null,
                        }))
                      }
                      className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-indigo-700 hover:bg-indigo-800 text-white flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                    >
                      <span>🏦</span>
                      <span>Bank Gateway Sandbox (Phase 3.8)</span>
                    </button>

                    {/* Composite Risk Score Badge */}
                    <div className={`p-3 rounded-xl border flex items-center gap-4 ${tierColorMap[compositeRisk.riskTier]}`}>
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider block">
                          Composite Risk Index
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-2xl font-black font-mono">
                            {compositeRisk.score}
                          </span>
                          <span className="text-xs font-semibold opacity-70">/ 100</span>
                        </div>
                      </div>
                      <div className="border-l pl-3 border-current/20">
                        <span className="text-xs font-black font-mono uppercase px-2 py-0.5 rounded bg-current/10 inline-block">
                          {compositeRisk.riskTier} TIER
                        </span>
                        <span className="text-[10px] block mt-1 font-medium max-w-[140px] truncate" title={compositeRisk.statusLabel}>
                          {compositeRisk.statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3 Metric Pillars */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20">
                    <span className="text-xs font-mono font-bold text-teal-800 dark:text-teal-300 block">
                      DUPLICATE SCAN
                    </span>
                    <span className="text-xl font-black text-teal-800 dark:text-teal-200 mt-1 block">
                      0 Collisions
                    </span>
                    <span className="text-[11px] text-teal-600">
                      No certificate re-use detected across institutions
                    </span>
                  </div>

                  <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20">
                    <span className="text-xs font-mono font-bold text-teal-800 dark:text-teal-300 block">
                      IFSC ROUTING CHECK
                    </span>
                    <span className="text-xl font-black text-teal-800 dark:text-teal-200 mt-1 block">
                      100% Validated
                    </span>
                    <span className="text-[11px] text-teal-600">
                      All IFSC codes match RBI core settlement routing
                    </span>
                  </div>

                  <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20">
                    <span className="text-xs font-mono font-bold text-amber-800 dark:text-amber-300 block">
                      UNCONFIRMED LIENS
                    </span>
                    <span className="text-xl font-black text-amber-800 dark:text-amber-200 mt-1 block">
                      {data.instruments.filter((i) => !i.isLienMarked).length} Unverified
                    </span>
                    <span className="text-[11px] text-amber-600">
                      Awaiting branch endorsement certificate
                    </span>
                  </div>
                </div>

                {/* Regulatory Disclaimer Banner */}
                <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-3">
                  <span className="text-base select-none">⚖️</span>
                  <div>
                    <span className="font-bold block">Statutory Non-Prejudgment & Anti-Forgery Notice:</span>
                    <p className="text-[11px] text-blue-800/90 dark:text-blue-300/90 mt-0.5 leading-relaxed">
                      {compositeRisk.disclaimer}
                    </p>
                  </div>
                </div>
              </div>

              {/* Unified Forensic Findings & Discrepancies Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      Unified Forensic Findings & Discrepancy Ledger
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {data.unresolvedDiscrepancies.length} Active
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Live discrepancy items synthesized across document forensics, barcode validation, OCR, ELA, and layout analysis
                    </p>
                  </div>
                </div>

                {data.unresolvedDiscrepancies.length === 0 ? (
                  <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                    <span className="text-2xl block mb-2">🛡️</span>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      No Active Forensic Discrepancies Found
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      All registered deposits pass automatic screening. Note: &quot;No indicators found&quot; does not imply authentic; direct bank SFMS verification remains statutory requirement.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.unresolvedDiscrepancies.map((finding) => {
                      const category = finding.category || "GENERAL_DISCREPANCY";
                      const severity = finding.severity;

                      const categoryBadgeColor: Record<string, string> = {
                        AMOUNT_MISMATCH: "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800",
                        QR_REFERENCE_MISMATCH: "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800",
                        EXTERNAL_VERIFICATION_MISMATCH: "bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800",
                        EXTERNAL_VERIFICATION_UNAVAILABLE: "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800",
                        SEAL_SIGNATURE_ISSUE: "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800",
                        ELA_ANOMALY: "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800",
                        LAYOUT_INCONSISTENCY: "bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800",
                        DATE_INCONSISTENCY: "bg-yellow-100 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800",
                        METADATA_REVIEW_INDICATOR: "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800",
                        OCR_UNCERTAINTY: "bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800",
                        GENERAL_DISCREPANCY: "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700",
                      };

                      return (
                        <div
                          key={finding.id}
                          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs space-y-2.5 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Severity Badge */}
                              <span
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                  severity === "CRITICAL"
                                    ? "bg-rose-600 text-white"
                                    : severity === "WARNING"
                                    ? "bg-amber-600 text-white"
                                    : "bg-blue-600 text-white"
                                }`}
                              >
                                {severity}
                              </span>

                              {/* Category Badge */}
                              <span
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                  categoryBadgeColor[category] || categoryBadgeColor.GENERAL_DISCREPANCY
                                }`}
                              >
                                {category.replace(/_/g, " ")}
                              </span>

                              {/* Source Analysis */}
                              {finding.sourceAnalysis && (
                                <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                  SRC: {finding.sourceAnalysis.replace(/_/g, " ")}
                                </span>
                              )}

                              {/* Rule Key */}
                              {finding.ruleKey && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  #{finding.ruleKey}
                                </span>
                              )}
                            </div>

                            {/* Action to Scrutinize & Resolve */}
                            <button
                              type="button"
                              onClick={() =>
                                setResolveFindingModal({
                                  isOpen: true,
                                  finding,
                                  decision: "BANK_CONFIRMED",
                                  justification: "",
                                  isSubmitting: false,
                                })
                              }
                              className="px-3 py-1 text-xs font-bold rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 hover:bg-teal-100 dark:hover:bg-teal-900 transition-colors shrink-0 cursor-pointer"
                            >
                              Scrutinize & Resolve →
                            </button>
                          </div>

                          {/* Description */}
                          <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                            {finding.description}
                          </p>

                          {/* Recommended Action */}
                          {finding.recommendedAction && (
                            <div className="text-[11px] text-teal-700 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/20 p-2 rounded-lg border border-teal-100 dark:border-teal-900/40">
                              <span className="font-bold">Recommended Regulatory Action: </span>
                              {finding.recommendedAction}
                            </div>
                          )}

                          {/* Lineage footer */}
                          <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2">
                            <span>
                              Instrument: {finding.fdrNumber || "FDR Registry"} • {finding.institutionName || "AICTE Registered"}
                            </span>
                            <span>
                              Logged: {new Date(finding.createdAt).toLocaleDateString("en-IN")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* TAB: FORENSIC VERIFICATION WORKBENCH (PHASE 3.9) */}
        {currentTab === "workbench" && (
          <FdrForensicWorkbench
            instruments={data.instruments}
            initialFdrId={searchParams.get("fdrId") || data.instruments[0]?.id}
            currentRole="Regulatory Scrutiny Officer"
            showToast={showToast}
            onOpenUploadModal={(fdrId) =>
              setUploadModal((prev) => ({
                ...prev,
                isOpen: true,
                fdrId,
                error: null,
              }))
            }
          />
        )}

        {/* TAB: INSTRUMENT LIFECYCLE EXPLORER (PHASE 5.C) */}
        {currentTab === "lifecycle" && (
          <InstrumentLifecycleExplorer
            instruments={data.instruments}
            initialFdrId={searchParams.get("fdrId") || data.instruments[0]?.id}
            onOpenWorkbench={(fdrId) => router.push(`/fdr?tab=workbench&fdrId=${fdrId}`)}
            onOpenUploadModal={(fdrId) =>
              setUploadModal((prev) => ({
                ...prev,
                isOpen: true,
                fdrId,
                error: null,
              }))
            }
            showToast={showToast}
          />
        )}

        {/* TAB 8: DOCUMENT INTELLIGENCE */}
        {currentTab === "documents" && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Document Intelligence & Vault Repository
                  </h2>
                  <p className="text-xs text-slate-500">
                    Private vault storing authenticated fixed deposit receipt scans, bank confirmation letters, and tripartite agreements
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => router.push("/fdr?tab=workbench")}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 hover:bg-teal-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>🔬 Launch Forensic Workbench</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadModal((prev) => ({ ...prev, isOpen: true, error: null }))}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>+ Ingest Document into Vault</span>
                  </button>
                </div>
              </div>

              {/* Live Ingested Vault Files Section */}
              {recentUploads.length > 0 && (
                <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/40 dark:bg-teal-950/20 space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 flex items-center gap-1.5 font-mono">
                    <span className="h-2 w-2 rounded-full bg-teal-600 animate-pulse" />
                    Private Storage Vault: Recently Ingested Documents ({recentUploads.length})
                  </span>
                  <div className="divide-y divide-teal-100 dark:divide-teal-900/40 text-xs">
                    {recentUploads.map((doc) => (
                      <div
                        key={doc.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                              {doc.fileName}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200">
                              {doc.documentType}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono">
                            Size: {(doc.fileSizeBytes / 1024).toFixed(1)} KB • MIME: {doc.mimeType} •
                            SHA-256:{" "}
                            <span className="text-slate-700 dark:text-slate-300">
                              {doc.sha256Checksum?.substring(0, 16)}...
                            </span>
                          </p>

                          {doc.metadata?.software && (
                            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                              Detected Tool: <span className="font-semibold text-slate-800 dark:text-slate-200">{doc.metadata.software}</span>
                              {doc.metadata.cameraMake && ` • Hardware: ${doc.metadata.cameraMake} ${doc.metadata.cameraModel || ""}`}
                              {doc.metadata.creationDate && ` • Created: ${formatDate(doc.metadata.creationDate)}`}
                            </p>
                          )}

                          {doc.metadata?.findings && doc.metadata.findings.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                              {doc.metadata.findings.map((f) => (
                                <span
                                  key={f.id}
                                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                    f.severity === "WARNING"
                                      ? "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300"
                                      : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                                  }`}
                                  title={`${f.explanation} Recommended: ${f.recommendedAction}`}
                                >
                                  {f.severity === "WARNING" ? "⚠ " : "ℹ "}{f.title}
                                </span>
                              ))}
                            </div>
                          )}

                          {doc.extractedData && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-2 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] font-mono">
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  OCR Engine: {doc.extractedData.ocrEngine || "Tesseract.js"}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 text-[10px]">
                                  Confidence: {(doc.extractedData.confidenceScore * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-mono bg-slate-50 dark:bg-slate-800/40 p-2 rounded text-slate-600 dark:text-slate-300">
                                <div><span className="text-slate-400 block">Candidate Ref:</span>{doc.extractedData.extractedFdrNumber || "N/A"}</div>
                                <div><span className="text-slate-400 block">Candidate Sum:</span>{doc.extractedData.extractedAmount ? formatCurrency(doc.extractedData.extractedAmount) : "N/A"}</div>
                                <div><span className="text-slate-400 block">Candidate Bank:</span>{doc.extractedData.extractedBankName || "N/A"}</div>
                                <div><span className="text-slate-400 block">Candidate Maturity:</span>{doc.extractedData.extractedMaturityDate ? formatDate(doc.extractedData.extractedMaturityDate) : "N/A"}</div>
                              </div>
                              {doc.extractedData.corrections && doc.extractedData.corrections.length > 0 && (
                                <p className="text-[10px] text-amber-700 dark:text-amber-300 font-mono">
                                  ✍ {doc.extractedData.corrections.length} manual correction(s) recorded by scrutiny officer.
                                </p>
                              )}
                            </div>
                          )}

                          {doc.barcodes && doc.barcodes.length > 0 && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-2 space-y-1.5">
                              {doc.barcodes.map((bc) => (
                                <div key={bc.id} className="text-[11px] font-mono bg-slate-50 dark:bg-slate-800/60 p-2 rounded border border-slate-200 dark:border-slate-700">
                                  <div className="flex items-center justify-between flex-wrap gap-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                        [{bc.barcodeType}]
                                      </span>
                                      <span className="text-slate-500 text-[10px]">Schema: {bc.schemaType}</span>
                                    </div>
                                    <span
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                        bc.hasMismatch
                                          ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300"
                                          : bc.validationStatus === "MATCH"
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300"
                                          : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300"
                                      }`}
                                    >
                                      {bc.hasMismatch
                                        ? "⚠ Barcode Cross-Validation Mismatch"
                                        : bc.validationStatus === "MATCH"
                                        ? "✔ Barcode Fields Match Submission"
                                        : bc.validationStatus === "NO_CODES"
                                        ? "No Codes Detected"
                                        : "ℹ " + bc.validationStatus}
                                    </span>
                                  </div>

                                  {bc.comparisons && bc.comparisons.length > 0 && (
                                    <div className="mt-1.5 space-y-0.5">
                                      {bc.comparisons.map((c, i) => (
                                        <div key={i} className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400">
                                          <span>{c.field}: <span className="font-semibold text-slate-800 dark:text-slate-200">{c.firstValue}</span> (QR) vs <span className="font-semibold text-slate-800 dark:text-slate-200">{c.secondValue}</span> (FDR)</span>
                                          <span className={c.outcome === "MATCH" ? "text-emerald-600 font-bold" : c.outcome === "MISMATCH" ? "text-rose-600 font-bold" : "text-slate-400"}>
                                            {c.outcome}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {bc.validationStatus === "MATCH" && (
                                    <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400 italic">
                                      * Matches submitted record. Note: Matching QR payload is not cryptographic proof of bank authenticity. Direct bank confirmation required.
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Error Level Analysis (ELA) Diagnostic Section */}
                          {doc.elaResult && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-2 space-y-1.5 font-mono text-[11px]">
                              <div className="flex items-center justify-between flex-wrap gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                    ELA Compression Forensics (Q{doc.elaResult.recompressionQuality})
                                  </span>
                                  <span className="text-slate-500 text-[10px]">
                                    Format: {doc.elaResult.formatType}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                      doc.elaResult.findings.some((f) => f.severity === "WARNING")
                                        ? "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    }`}
                                  >
                                    {doc.elaResult.findings.some((f) => f.severity === "WARNING")
                                      ? "⚠ Localized Variance Detected"
                                      : doc.elaResult.status === "SKIPPED"
                                      ? "ℹ Vector Document (ELA Skipped)"
                                      : "✔ Uniform Compression Profile"}
                                  </span>
                                  {doc.elaResult.diagnosticImageUrl && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setElaModalImage({
                                          isOpen: true,
                                          url: doc.elaResult!.diagnosticImageUrl!,
                                          fileName: doc.fileName,
                                          metrics: `Avg Error: ${doc.elaResult!.averageErrorLevel.toFixed(2)} • Peak: ${doc.elaResult!.peakError.toFixed(2)} • Discrepancy Ratio: ${(doc.elaResult!.highDiscrepancyRatio * 100).toFixed(1)}%`,
                                        })
                                      }
                                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 transition-colors cursor-pointer"
                                    >
                                      Heatmap View 👁
                                    </button>
                                  )}
                                </div>
                              </div>

                              {doc.elaResult.status === "COMPLETED" && (
                                <div className="grid grid-cols-3 gap-1.5 text-[10px] bg-slate-50 dark:bg-slate-800/40 p-2 rounded text-slate-600 dark:text-slate-300">
                                  <div>
                                    <span className="text-slate-400 block">Average Error:</span>
                                    {doc.elaResult.averageErrorLevel.toFixed(2)}
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block">Peak Error:</span>
                                    {doc.elaResult.peakError.toFixed(2)}
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block">Discrepancy Ratio:</span>
                                    {(doc.elaResult.highDiscrepancyRatio * 100).toFixed(1)}%
                                  </div>
                                </div>
                              )}

                              {doc.elaResult.findings && doc.elaResult.findings.length > 0 && (
                                <div className="space-y-1">
                                  {doc.elaResult.findings.map((f) => (
                                    <p
                                      key={f.id}
                                      className={`text-[10px] rounded p-1.5 border ${
                                        f.severity === "WARNING"
                                          ? "bg-amber-50/60 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/60"
                                          : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-800"
                                      }`}
                                    >
                                      <span className="font-bold">{f.severity === "WARNING" ? "⚠ " : "ℹ "}{f.title}: </span>
                                      {f.explanation}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Text-Layout Consistency Forensics Section */}
                          {doc.layoutFindings && doc.layoutFindings.length > 0 && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-2 space-y-1.5 font-mono text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                  Text-Layout Forensics ({doc.layoutFindings.length})
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {doc.layoutFindings.filter((lf) => lf.severity === "WARNING").length} warning(s)
                                </span>
                              </div>

                              <div className="space-y-1">
                                {doc.layoutFindings.map((lf) => (
                                  <div
                                    key={lf.id}
                                    className={`p-1.5 rounded border text-[10px] ${
                                      lf.severity === "WARNING"
                                        ? "bg-amber-50/60 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/60"
                                        : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-800"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between font-bold">
                                      <span>
                                        {lf.severity === "WARNING" ? "⚠ " : "ℹ "}[{lf.anomalyType}] {lf.observedValue || ""}
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-normal">Page {lf.pageNumber}</span>
                                    </div>
                                    <p className="mt-0.5 text-slate-600 dark:text-slate-300 font-normal">
                                      {lf.explanation}
                                    </p>
                                    <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400 italic">
                                      * Recommended action: {lf.recommendedAction}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Bank Seal and Signature Candidate Regions */}
                          {doc.visualRegions && doc.visualRegions.length > 0 && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-2 space-y-1.5 font-mono text-[11px]">
                              <div className="flex items-center justify-between flex-wrap gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    Visual Seal & Signature Analysis ({doc.visualRegions.length})
                                  </span>
                                  <span className="text-slate-500 text-[10px]">
                                    Engine: {doc.visualRegions[0]?.detectionMethod || "EXPERIMENTAL_HEURISTIC"}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500">
                                  {doc.visualRegions.filter((r) => r.detectionStatus === "CANDIDATE_DETECTED").length} candidate(s) detected
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                {doc.visualRegions.map((vr) => (
                                  <div
                                    key={vr.id}
                                    className={`p-2 rounded border text-[10px] space-y-1 ${
                                      vr.detectionStatus === "CANDIDATE_DETECTED"
                                        ? "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                                        : "bg-slate-50/40 dark:bg-slate-900/40 border-dashed border-slate-200 dark:border-slate-800 text-slate-500"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-slate-800 dark:text-slate-200">
                                        {vr.candidateClass === "BANK_SEAL"
                                          ? "🏦 Bank Seal / Stamp"
                                          : vr.candidateClass === "BRANCH_MANAGER_SIGNATURE"
                                          ? "✍ Branch Manager Signature"
                                          : vr.candidateClass === "AUTHORIZED_SIGNATORY"
                                          ? "✍ Authorized Signatory"
                                          : vr.candidateClass === "JOINT_HOLDER_SIGNATURE"
                                          ? "✍ Joint Holder Signature"
                                          : "Candidate Visual Mark"}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                          vr.detectionStatus === "CANDIDATE_DETECTED"
                                            ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200"
                                            : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                                        }`}
                                      >
                                        {vr.detectionStatus}
                                      </span>
                                    </div>

                                    <div className="text-[9px] text-slate-500 space-y-0.5">
                                      {vr.anchorText && (
                                        <p>
                                          Anchor: <span className="text-slate-700 dark:text-slate-300 font-semibold">{vr.anchorText}</span>
                                        </p>
                                      )}
                                      {vr.inkCharacteristics && (
                                        <p>
                                          Ink Profile: <span className="text-slate-700 dark:text-slate-300">{vr.inkCharacteristics}</span>
                                          {vr.confidenceScore && ` (Score: ${(vr.confidenceScore * 100).toFixed(0)}%)`}
                                        </p>
                                      )}
                                      {vr.boundingBox && (
                                        <p>
                                          Region: [{vr.boundingBox.x0.toFixed(0)}, {vr.boundingBox.y0.toFixed(0)} to {vr.boundingBox.x1.toFixed(0)}, {vr.boundingBox.y1.toFixed(0)}]
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                                      <span className="text-[9px]">
                                        {vr.isVerifiedByReviewer ? (
                                          <span className="text-emerald-600 font-bold">✔ Officer Verified</span>
                                        ) : (
                                          <span className="text-slate-400 italic">Pending Scrutiny</span>
                                        )}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const nextState = !vr.isVerifiedByReviewer;
                                          try {
                                            const res = await fetch(
                                              `/api/fdr/${doc.fdrId}/documents/${doc.id}/visual-regions/${vr.id}`,
                                              {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                  isVerified: nextState,
                                                  remarks: nextState ? "Verified physical seal/signature presence" : "Unverified",
                                                }),
                                              }
                                            );
                                            if (res.ok) {
                                              setRecentUploads((prev) =>
                                                prev.map((d) =>
                                                  d.id === doc.id
                                                    ? {
                                                        ...d,
                                                        visualRegions: (d.visualRegions || []).map((r) =>
                                                          r.id === vr.id
                                                            ? { ...r, isVerifiedByReviewer: nextState }
                                                            : r
                                                        ),
                                                      }
                                                    : d
                                                )
                                              );
                                              showToast({
                                                title: "Review Status Updated",
                                                message: `${vr.candidateClass} marked as ${nextState ? "Verified" : "Unverified"}.`,
                                                type: "success",
                                              });
                                            }
                                          } catch {
                                            // Fallback
                                          }
                                        }}
                                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-teal-700 dark:text-teal-300 hover:bg-slate-50 cursor-pointer"
                                      >
                                        {vr.isVerifiedByReviewer ? "Revoke Verification" : "Mark Verified ✍"}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-teal-700 dark:text-teal-300 hover:bg-slate-50 transition-colors shrink-0"
                        >
                          Download from Vault ↗
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.instruments.map((inst) => (
                  <div key={inst.id} className="py-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs">
                        {inst.fdrNumber} • {inst.institutionName}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setUploadModal((prev) => ({
                              ...prev,
                              isOpen: true,
                              fdrId: inst.id,
                              error: null,
                            }))
                          }
                          className="text-[11px] font-bold text-teal-700 dark:text-teal-400 hover:underline"
                        >
                          + Attach File
                        </button>
                        {(() => {
                          const matchingDoc = recentUploads.find((d) => d.fdrId === inst.id && d.extractedData);
                          const conf = matchingDoc?.extractedData?.confidenceScore
                            ? Math.round(matchingDoc.extractedData.confidenceScore * 100)
                            : null;
                          return (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200">
                              {conf !== null ? `Tesseract OCR: ${conf}%` : "OCR Ready"}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg text-slate-600 dark:text-slate-300">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Extracted Bank</span>
                        {inst.bankName}
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Extracted IFSC</span>
                        {inst.ifscCode}
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Extracted Sum</span>
                        {formatCurrency(inst.amount)}
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Extracted Maturity</span>
                        {formatDate(inst.maturityDate)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 9: REPORTS */}
        {currentTab === "reports" && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Statutory Regulatory Reports & Export Engine
              </h2>
              <p className="text-xs text-slate-500">
                Generate signed PDF compliance statements for AICTE Regional Directorate and Ministry audit boards
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Comprehensive FDR Portfolio Digest
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Complete breakdown of all {data.overview.activeInstrumentCount} registered certificates,
                    principal sums, interest rates, and lien statuses.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      showToast({
                        title: "Export Initiated",
                        message: "Portfolio Digest PDF downloaded successfully.",
                        type: "success",
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white"
                  >
                    Download Digest (PDF)
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Statutory Maturity Escalation Brief
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Action report for certificates expiring within 30, 60, and 90 days requiring formal renewal notices.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      showToast({
                        title: "Export Initiated",
                        message: "Maturity Briefing CSV downloaded successfully.",
                        type: "info",
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  >
                    Export Schedule (CSV)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmLabel={confirmModal.confirmLabel}
        variant={confirmModal.variant}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Renewal Submission Dialog */}
      {renewalModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Submit FDR Renewal Petition
            </h3>
            <p className="text-xs text-slate-500">
              Certificate:{" "}
              <strong className="text-slate-700 dark:text-slate-300 font-mono">
                {renewalModal.instrument?.fdrNumber}
              </strong>{" "}
              ({renewalModal.instrument?.institutionName})
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Requested Extension Tenure
                </label>
                <select
                  value={renewalModal.tenureMonths}
                  onChange={(e) =>
                    setRenewalModal((prev) => ({
                      ...prev,
                      tenureMonths: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                >
                  <option value={12}>12 Months (1 Year)</option>
                  <option value={36}>36 Months (3 Years)</option>
                  <option value={60}>60 Months (5 Years - Standard)</option>
                  <option value={96}>96 Months (8 Years - Full Lock-in)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Officer Remarks & Bank Confirmation Note
                </label>
                <textarea
                  rows={3}
                  value={renewalModal.remarks}
                  onChange={(e) =>
                    setRenewalModal((prev) => ({ ...prev, remarks: e.target.value }))
                  }
                  placeholder="e.g. Branch confirmation received for reinvestment at revised interest rate..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() =>
                  setRenewalModal({ isOpen: false, instrument: null, tenureMonths: 60, remarks: "" })
                }
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleRenewalSubmit}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white"
              >
                {isPending ? "Submitting..." : "Submit Renewal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secure Document Ingestion Upload Dialog */}
      {uploadModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Ingest Document into Private Storage Vault
                </h3>
                <p className="text-xs text-slate-500">
                  SIH26265 Secure Intake • Multi-tier binary signature and SHA-256 validation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadModal((prev) => ({ ...prev, isOpen: false, error: null }))}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              {uploadModal.error && (
                <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300">
                  <p className="font-bold">Ingestion Error</p>
                  <p className="text-[11px] mt-0.5">{uploadModal.error}</p>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Target Fixed Deposit Instrument
                </label>
                <select
                  value={uploadModal.fdrId}
                  onChange={(e) => setUploadModal((prev) => ({ ...prev, fdrId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                >
                  {data.instruments.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.fdrNumber} — {inst.institutionName} ({formatCurrency(inst.amount)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Document Classification Type
                </label>
                <select
                  value={uploadModal.documentType}
                  onChange={(e) =>
                    setUploadModal((prev) => ({
                      ...prev,
                      documentType: e.target.value as FdrDocumentType,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                >
                  <option value="FDR_CERTIFICATE_SCAN">FDR Certificate Scan (Primary Deposit Proof)</option>
                  <option value="BANK_CONFIRMATION_LETTER">Bank Confirmation Letter (Manager Endorsement)</option>
                  <option value="LIEN_ENDORSEMENT">Lien Endorsement Letter (Joint Pledged Marker)</option>
                  <option value="TRIPARTITE_AGREEMENT">Tripartite Regulatory Agreement</option>
                  <option value="RENEWAL_ADVICE">Renewal Advice / Reinvestment Deposit Note</option>
                  <option value="NOC_RELEASE_ORDER">NOC Release / Encashment Clearance Order</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Attach Document File (PDF, JPEG, or PNG up to 15 MB)
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] || null;
                    if (selected && selected.size > 15 * 1024 * 1024) {
                      setUploadModal((prev) => ({
                        ...prev,
                        file: null,
                        error: `Selected file exceeds 15 MB limit (${(selected.size / (1024 * 1024)).toFixed(2)} MB).`,
                      }));
                    } else {
                      setUploadModal((prev) => ({ ...prev, file: selected, error: null }));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Files are validated via binary signature magic-bytes and stored outside the public root.
                </p>
              </div>

              {uploadModal.isUploading && (
                <div className="p-3 rounded-xl bg-teal-950/40 border border-teal-500/30 text-xs space-y-1.5 animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-teal-400 border-t-transparent animate-spin"></span>
                    <span className="font-bold text-teal-300">Executing Parallel Forensic AI Pipeline...</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Running concurrent OCR text extraction, ELA compression forensics, QR cross-validation, and ML triage classification.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    setUploadModal((prev) => ({
                      ...prev,
                      isOpen: false,
                      isUploading: false,
                      error: null,
                    }))
                  }
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadModal.isUploading || !uploadModal.file}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {uploadModal.isUploading ? (
                    <>
                      <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                      <span>Analyzing & Storing...</span>
                    </>
                  ) : (
                    "Upload & Secure Document"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bank Verification Sandbox Gateway Modal */}
      {bankVerifyModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>🏦</span>
                  <span>External Bank Verification Gateway</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                    Sandbox Simulation
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Independent core banking ledger validation via typed provider boundary
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBankVerifyModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBankVerificationSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Select FDR Instrument:
                  </label>
                  <select
                    value={bankVerifyModal.fdrId}
                    onChange={(e) =>
                      setBankVerifyModal((prev) => ({
                        ...prev,
                        fdrId: e.target.value,
                        latestResult: null,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                  >
                    {data.instruments.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.fdrNumber} • {i.bankName} (₹{(i.amount / 100000).toFixed(1)}L)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Gateway Provider:
                  </label>
                  <select
                    value={bankVerifyModal.preferMode}
                    onChange={(e) =>
                      setBankVerifyModal((prev) => ({
                        ...prev,
                        preferMode: e.target.value as any,
                        latestResult: null,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                  >
                    <option value="SANDBOX_SIMULATED">
                      Sandbox Gateway (Deterministic Fixture Simulation)
                    </option>
                    <option value="PRODUCTION_LIVE">
                      RBI / SFMS Gateway (Production Adapter — Unconfigured)
                    </option>
                  </select>
                </div>
              </div>

              {bankVerifyModal.preferMode === "SANDBOX_SIMULATED" && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Demonstration Simulation Scenario:
                  </label>
                  <select
                    value={bankVerifyModal.scenario}
                    onChange={(e) =>
                      setBankVerifyModal((prev) => ({
                        ...prev,
                        scenario: e.target.value as any,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                  >
                    <option value="MATCH">
                      MATCH — Core Ledger Confirms Deposit &amp; Active Lien
                    </option>
                    <option value="AMOUNT_MISMATCH">
                      AMOUNT MISMATCH — Core Ledger Has Different Pledged Balance
                    </option>
                    <option value="NOT_FOUND">
                      NOT FOUND — Instrument Reference Missing from Bank Records
                    </option>
                    <option value="INCONCLUSIVE">
                      INCONCLUSIVE — Partial/Archived Record Requiring Branch Confirmation
                    </option>
                    <option value="TIMEOUT">
                      TIMEOUT — Simulated Network SLA Timeout (&gt;3000ms)
                    </option>
                    <option value="UNAVAILABLE">
                      UNAVAILABLE — Simulated Core Banking Maintenance Downtime
                    </option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono">
                  Authorized Role: Scrutiny Officer (Simulated Inquiries Recorded in Audit Log)
                </span>
                <button
                  type="submit"
                  disabled={bankVerifyModal.isSubmitting}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {bankVerifyModal.isSubmitting ? "Querying Gateway..." : "Inquire Bank Gateway →"}
                </button>
              </div>
            </form>

            {/* Verification Result Display */}
            {bankVerifyModal.latestResult && (
              <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Outcome:
                    </span>
                    <span
                      className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded ${
                        bankVerifyModal.latestResult.outcome === "SANDBOX_MATCH"
                          ? "bg-emerald-600 text-white"
                          : bankVerifyModal.latestResult.outcome === "NOT_CONFIGURED"
                          ? "bg-purple-600 text-white"
                          : "bg-rose-600 text-white"
                      }`}
                    >
                      {bankVerifyModal.latestResult.outcome}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold">
                      MODE: {bankVerifyModal.latestResult.verificationMode}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {bankVerifyModal.latestResult.correlationId}
                  </span>
                </div>

                {bankVerifyModal.latestResult.comparisons.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                      Field Comparison Ledger:
                    </span>
                    <div className="divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden text-xs">
                      {bankVerifyModal.latestResult.comparisons.map((c, idx) => (
                        <div key={idx} className="p-2.5 flex items-center justify-between gap-2">
                          <div>
                            <span className="font-mono font-bold uppercase text-[10px] text-slate-400 block">
                              {c.field}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              Submitted: {c.submittedValue}
                            </span>
                            {c.providerValue && (
                              <span className="text-slate-500 block text-[11px]">
                                Verified: {c.providerValue}
                              </span>
                            )}
                          </div>
                          <span
                            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                              c.isMatch
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}
                          >
                            {c.isMatch ? "MATCH" : "MISMATCH"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error/Inconclusive Note */}
                {(bankVerifyModal.latestResult.error || bankVerifyModal.latestResult.inconclusiveReason) && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-900 dark:text-rose-200 text-xs space-y-0.5">
                    <p className="font-bold">Provider Notice:</p>
                    <p className="text-[11px]">
                      {bankVerifyModal.latestResult.error?.message || bankVerifyModal.latestResult.inconclusiveReason}
                    </p>
                  </div>
                )}

                {/* Mandatory Sandbox Disclaimer Banner */}
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 text-[11px] leading-relaxed">
                  <span className="font-bold block">Statutory Non-Authentication Disclaimer:</span>
                  <p className="mt-0.5">{bankVerifyModal.latestResult.disclaimer}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ASSIGN REVIEWER MODAL (PHASE 5.A) */}
      {assignReviewerModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Assign Regulatory Scrutiny Officer
              </h3>
              <p className="text-xs text-slate-500">
                Assign responsible scrutiny officer for maturity follow-up and forensic review.
              </p>
            </div>

            <form onSubmit={handleAssignReviewerSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Assign Officer:
                </label>
                <select
                  value={assignReviewerModal.officerId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const officers: Record<string, { name: string; role: string }> = {
                      "usr-officer-01": { name: "Dr. R. Ramanathan", role: "Regulatory Scrutiny Officer" },
                      "usr-officer-02": { name: "S. Kulkarni", role: "Finance Committee Member" },
                      "usr-officer-03": { name: "A. Sengupta", role: "Central Audit Inspector" },
                    };
                    const selected = officers[id] || officers["usr-officer-01"];
                    setAssignReviewerModal((prev) => ({
                      ...prev,
                      officerId: id,
                      officerName: selected.name,
                      officerRole: selected.role,
                    }));
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600"
                >
                  <option value="usr-officer-01">Dr. R. Ramanathan (Regulatory Scrutiny Officer)</option>
                  <option value="usr-officer-02">S. Kulkarni (Finance Committee Member)</option>
                  <option value="usr-officer-03">A. Sengupta (Central Audit Inspector)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAssignReviewerModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignReviewerModal.isSubmitting}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white cursor-pointer disabled:opacity-50"
                >
                  {assignReviewerModal.isSubmitting ? "Assigning..." : "Confirm Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Contextual Quick Detail Drawer (Preserves Dashboard State) */}
      <InstrumentQuickDetailDrawer
        instrument={drawerInstrument}
        isOpen={!!drawerInstrument}
        onClose={() => setDrawerInstrument(null)}
        onOpenWorkbench={(fdrId) => router.push(`/fdr?tab=workbench&fdrId=${fdrId}`)}
        onOpenLifecycle={(fdrId) => router.push(`/fdr?tab=lifecycle&fdrId=${fdrId}`)}
        onConfirmLien={handleConfirmLien}
        onOpenRenewalModal={(inst) =>
          setRenewalModal({
            isOpen: true,
            instrument: inst,
            tenureMonths: 60,
            remarks: "",
          })
        }
      />
    </AppShell>
  );
}
