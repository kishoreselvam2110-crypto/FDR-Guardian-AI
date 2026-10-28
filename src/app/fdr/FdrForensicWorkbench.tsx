"use client";

import React, { useState, useEffect, useTransition } from "react";
import type {
  FdrInstrumentDto,
  DocumentDto,
  RiskFindingDto,
  CompositeRiskScoreDto,
  BankVerificationResponseDto,
  RiskFindingCategory,
  RiskFindingSeverity,
} from "@/lib/fdr/types";
import {
  resolveRiskFindingServerAction,
  submitFieldCorrectionAction,
  requestAdditionalEvidenceAction,
  getFdrForensicDetailsAction,
  requestBankVerificationAction,
} from "@/lib/fdr/service";
import { calculateCompositeFdrRisk } from "@/lib/fdr/riskEngine";
import {
  OCR_CONFIDENCE_STATUTORY_DISCLAIMER,
  compareEvidenceFields,
} from "@/lib/fdr/lifecycleService";
import type { EvidenceDiscrepancyField } from "@/lib/fdr/types";

interface FdrForensicWorkbenchProps {
  instruments: FdrInstrumentDto[];
  initialFdrId?: string;
  currentRole: string;
  showToast: (toast: {
    title: string;
    message: string;
    type: "success" | "info" | "warning" | "error";
  }) => void;
  onOpenUploadModal: (fdrId: string) => void;
}

export function FdrForensicWorkbench({
  instruments,
  initialFdrId,
  currentRole,
  showToast,
  onOpenUploadModal,
}: FdrForensicWorkbenchProps) {
  const [selectedFdrId, setSelectedFdrId] = useState<string>(
    initialFdrId || instruments[0]?.id || ""
  );
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [findings, setFindings] = useState<RiskFindingDto[]>([]);
  const [compositeRisk, setCompositeRisk] = useState<CompositeRiskScoreDto | null>(null);
  const [bankVerifications, setBankVerifications] = useState<BankVerificationResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPending, startTransition] = useTransition();

  // Filters for findings
  const [findingStatusFilter, setFindingStatusFilter] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [findingSeverityFilter, setFindingSeverityFilter] = useState<"ALL" | RiskFindingSeverity>("ALL");

  // Review Modals
  const [resolveModal, setResolveModal] = useState<{
    isOpen: boolean;
    finding: RiskFindingDto | null;
    decision: "BANK_CONFIRMED" | "ACCEPTED_RISK" | "FALSE_POSITIVE" | "REJECTED_INSTRUMENT";
    justification: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    finding: null,
    decision: "BANK_CONFIRMED",
    justification: "",
    isSubmitting: false,
  });

  const [correctionModal, setCorrectionModal] = useState<{
    isOpen: boolean;
    documentId: string;
    extractionId: string;
    fieldName: string;
    currentValue: string;
    correctedValue: string;
    justification: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    documentId: "",
    extractionId: "",
    fieldName: "",
    currentValue: "",
    correctedValue: "",
    justification: "",
    isSubmitting: false,
  });

  const [evidenceRequestModal, setEvidenceRequestModal] = useState<{
    isOpen: boolean;
    findingId?: string;
    documentId?: string;
    note: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    findingId: undefined,
    documentId: undefined,
    note: "",
    isSubmitting: false,
  });

  const [elaModal, setElaModal] = useState<{
    isOpen: boolean;
    url: string;
    fileName: string;
    metrics: string;
  } | null>(null);

  const [bankSimModal, setBankSimModal] = useState<{
    isOpen: boolean;
    scenario: "MATCH" | "AMOUNT_MISMATCH" | "NOT_FOUND" | "INCONCLUSIVE" | "TIMEOUT" | "UNAVAILABLE";
    isSubmitting: boolean;
  }>({
    isOpen: false,
    scenario: "MATCH",
    isSubmitting: false,
  });

  const selectedInstrument = instruments.find((i) => i.id === selectedFdrId) || instruments[0];

  // Load details for selected FDR
  const loadFdrForensics = async (fdrId: string) => {
    if (!fdrId) return;
    setIsLoading(true);
    try {
      const details = await getFdrForensicDetailsAction(fdrId);
      setDocuments(details.documents || []);
      setFindings(details.findings || []);
      setCompositeRisk(details.compositeRisk);
      setBankVerifications(details.bankVerifications || []);
    } catch {
      showToast({
        title: "Telemetry Sync Warning",
        message: "Could not retrieve live forensic records. Displaying offline cached fixtures.",
        type: "warning",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedFdrId) {
      loadFdrForensics(selectedFdrId);
    }
  }, [selectedFdrId]);

  // Formatters
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Extract latest primary document
  const primaryDoc = documents[0] || null;
  const ocrData = primaryDoc?.extractedData || null;
  const barcodes = primaryDoc?.barcodes || [];
  const primaryBarcode = barcodes[0] || null;
  const metadata = primaryDoc?.metadata || null;
  const ela = primaryDoc?.elaResult || null;
  const visualRegions = primaryDoc?.visualRegions || [];
  const latestBankVerification = bankVerifications[0] || null;

  // Evidence matrix rows
  const evidenceMatrix = [
    {
      fieldKey: "fdrNumber",
      fieldLabel: "FDR Reference Number",
      submitted: selectedInstrument?.fdrNumber || "—",
      ocr: ocrData?.extractedFdrNumber || (ocrData ? "NOT DETECTED" : null),
      ocrConfidence: ocrData?.confidenceScore ?? null,
      barcode: primaryBarcode?.extractedFdrNumber || (primaryBarcode ? "NOT IN SCHEMA" : null),
      metadata: (metadata?.rawMetadata?.Title as string) || (metadata?.rawMetadata?.Subject as string) || null,
      bankValue: latestBankVerification?.comparisons?.find((c) => c.field === "fdrNumber")?.providerValue || null,
      isMismatch:
        (ocrData?.extractedFdrNumber && ocrData.extractedFdrNumber !== selectedInstrument?.fdrNumber) ||
        (primaryBarcode?.extractedFdrNumber && primaryBarcode.extractedFdrNumber !== selectedInstrument?.fdrNumber) ||
        (latestBankVerification && !latestBankVerification.comparisons?.find((c) => c.field === "fdrNumber")?.isMatch),
    },
    {
      fieldKey: "amount",
      fieldLabel: "Principal Deposit Amount",
      submitted: selectedInstrument ? formatCurrency(selectedInstrument.amount) : "—",
      ocr: ocrData?.extractedAmount ? formatCurrency(ocrData.extractedAmount) : (ocrData ? "NOT DETECTED" : null),
      ocrConfidence: ocrData?.confidenceScore ?? null,
      barcode: primaryBarcode?.extractedAmount ? formatCurrency(primaryBarcode.extractedAmount) : (primaryBarcode ? "NOT IN SCHEMA" : null),
      metadata: null,
      bankValue:
        latestBankVerification?.verifiedFields?.amount != null
          ? formatCurrency(latestBankVerification.verifiedFields.amount)
          : latestBankVerification?.verifiedAmount != null
          ? formatCurrency(latestBankVerification.verifiedAmount)
          : null,
      isMismatch:
        (ocrData?.extractedAmount && Math.abs(ocrData.extractedAmount - (selectedInstrument?.amount || 0)) > 1) ||
        (primaryBarcode?.extractedAmount && Math.abs(primaryBarcode.extractedAmount - (selectedInstrument?.amount || 0)) > 1) ||
        (latestBankVerification && !latestBankVerification.comparisons?.find((c) => c.field === "amount")?.isMatch),
    },
    {
      fieldKey: "bankName",
      fieldLabel: "Issuing Bank Name",
      submitted: selectedInstrument?.bankName || "—",
      ocr: ocrData?.extractedBankName || (ocrData ? "NOT DETECTED" : null),
      ocrConfidence: ocrData?.confidenceScore ?? null,
      barcode: primaryBarcode?.extractedBankName || (primaryBarcode ? "NOT IN SCHEMA" : null),
      metadata: metadata?.producer || metadata?.software || null,
      bankValue: latestBankVerification?.verifiedFields?.bankName || latestBankVerification?.verifiedBankName || null,
      isMismatch:
        (ocrData?.extractedBankName && !ocrData.extractedBankName.toLowerCase().includes((selectedInstrument?.bankName || "").toLowerCase().substring(0, 4))) ||
        (latestBankVerification && !latestBankVerification.comparisons?.find((c) => c.field === "issuingBank")?.isMatch),
    },
    {
      fieldKey: "ifscCode",
      fieldLabel: "Branch IFSC Code",
      submitted: selectedInstrument?.ifscCode || "—",
      ocr: ocrData?.extractedIfsc || (ocrData ? "NOT DETECTED" : null),
      ocrConfidence: ocrData?.confidenceScore ?? null,
      barcode: (primaryBarcode?.parsedFields?.ifsc as string) || null,
      metadata: null,
      bankValue: latestBankVerification?.comparisons?.find((c) => c.field === "ifscCode")?.providerValue || null,
      isMismatch:
        (ocrData?.extractedIfsc && ocrData.extractedIfsc !== selectedInstrument?.ifscCode) ||
        (latestBankVerification && !latestBankVerification.comparisons?.find((c) => c.field === "ifscCode")?.isMatch),
    },
    {
      fieldKey: "maturityDate",
      fieldLabel: "Statutory Maturity Date",
      submitted: selectedInstrument ? formatDate(selectedInstrument.maturityDate) : "—",
      ocr: ocrData?.extractedMaturityDate ? formatDate(ocrData.extractedMaturityDate) : (ocrData ? "NOT DETECTED" : null),
      ocrConfidence: ocrData?.confidenceScore ?? null,
      barcode: primaryBarcode?.extractedMaturityDate ? formatDate(primaryBarcode.extractedMaturityDate) : null,
      metadata: metadata?.creationDate ? formatDate(metadata.creationDate) : null,
      bankValue: null,
      isMismatch:
        (ocrData?.extractedMaturityDate && selectedInstrument?.maturityDate &&
          new Date(ocrData.extractedMaturityDate).toDateString() !== new Date(selectedInstrument.maturityDate).toDateString()),
    },
    {
      fieldKey: "jointHolderName",
      fieldLabel: "Lien / Joint Holder",
      submitted: selectedInstrument?.jointHolderName || "Member Secretary, AICTE",
      ocr: ocrData?.extractedInstitutionName || (ocrData ? "NOT DETECTED" : null),
      ocrConfidence: ocrData?.confidenceScore ?? null,
      barcode: (primaryBarcode?.parsedFields?.holder as string) || null,
      metadata: metadata?.creator || null,
      bankValue: (latestBankVerification?.verifiedFields?.isLienMarked || latestBankVerification?.isLienConfirmed)
        ? "Active Lien Confirmed (AICTE)"
        : null,
      isMismatch: false,
    },
  ];

  // Phase 5: 5-field granular discrepancy analysis
  const granularDiscrepancyFields = selectedInstrument
    ? compareEvidenceFields(selectedInstrument, primaryDoc, latestBankVerification)
    : [];

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    if (findingStatusFilter === "OPEN" && f.isResolved) return false;
    if (findingStatusFilter === "RESOLVED" && !f.isResolved) return false;
    if (findingSeverityFilter !== "ALL" && f.severity !== findingSeverityFilter) return false;
    return true;
  });

  // Handle Finding Resolution
  const handleResolveSubmit = async () => {
    if (!resolveModal.finding) return;
    setResolveModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      await resolveRiskFindingServerAction({
        findingId: resolveModal.finding.id,
        fdrId: selectedInstrument.id,
        decision: resolveModal.decision,
        justification: resolveModal.justification,
        officerId: "usr-officer",
        officerName: "Officer J. Sharma (Central Scrutiny)",
        officerRole: currentRole,
      });

      showToast({
        title: "Forensic Finding Resolved",
        message: `Finding #${resolveModal.finding.ruleKey || resolveModal.finding.riskCode} marked as ${resolveModal.decision}.`,
        type: "success",
      });

      setResolveModal({
        isOpen: false,
        finding: null,
        decision: "BANK_CONFIRMED",
        justification: "",
        isSubmitting: false,
      });

      loadFdrForensics(selectedInstrument.id);
    } catch (err: unknown) {
      showToast({
        title: "Resolution Failed",
        message: (err as Error).message,
        type: "error",
      });
      setResolveModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Handle OCR Correction Submit
  const handleCorrectionSubmit = async () => {
    setCorrectionModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      await submitFieldCorrectionAction({
        extractionId: correctionModal.extractionId,
        fdrId: selectedInstrument.id,
        fieldName: correctionModal.fieldName,
        correctedValue: correctionModal.correctedValue,
        justification: correctionModal.justification,
        officerId: "usr-officer",
        officerName: "Officer J. Sharma (Central Scrutiny)",
        officerRole: currentRole,
      });

      showToast({
        title: "Candidate Field Corrected",
        message: `Field '${correctionModal.fieldName}' updated to '${correctionModal.correctedValue}' with audit lineage.`,
        type: "success",
      });

      setCorrectionModal({
        isOpen: false,
        documentId: "",
        extractionId: "",
        fieldName: "",
        currentValue: "",
        correctedValue: "",
        justification: "",
        isSubmitting: false,
      });

      loadFdrForensics(selectedInstrument.id);
    } catch (err: unknown) {
      showToast({
        title: "Correction Failed",
        message: (err as Error).message,
        type: "error",
      });
      setCorrectionModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Handle Evidence Request Submit
  const handleEvidenceRequestSubmit = async () => {
    setEvidenceRequestModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      await requestAdditionalEvidenceAction({
        fdrId: selectedInstrument.id,
        findingId: evidenceRequestModal.findingId,
        documentId: evidenceRequestModal.documentId,
        note: evidenceRequestModal.note,
        officerId: "usr-officer",
        officerName: "Officer J. Sharma (Central Scrutiny)",
        officerRole: currentRole,
      });

      showToast({
        title: "Evidence Petition Dispatched",
        message: "Official clarification request immutably logged and routed to institution nodal officer.",
        type: "success",
      });

      setEvidenceRequestModal({
        isOpen: false,
        findingId: undefined,
        documentId: undefined,
        note: "",
        isSubmitting: false,
      });
    } catch (err: unknown) {
      showToast({
        title: "Request Failed",
        message: (err as Error).message,
        type: "error",
      });
      setEvidenceRequestModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Handle Bank Sandbox Simulation
  const handleBankSimulationSubmit = async () => {
    setBankSimModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const res = await requestBankVerificationAction({
        fdrId: selectedInstrument.id,
        fdrNumber: selectedInstrument.fdrNumber,
        amount: selectedInstrument.amount,
        bankName: selectedInstrument.bankName,
        ifscCode: selectedInstrument.ifscCode,
        officerUserId: "usr-officer",
        officerName: "Officer J. Sharma (Central Scrutiny)",
        officerRole: currentRole,
        simulationScenario: bankSimModal.scenario,
      });

      showToast({
        title: "Bank Gateway Queried (Sandbox)",
        message: `Inquiry completed: Outcome ${res.outcome}. Simulation logged under correlation ID ${res.correlationId}.`,
        type: res.outcome === "SANDBOX_MATCH" ? "success" : "warning",
      });

      setBankSimModal((prev) => ({ ...prev, isOpen: false, isSubmitting: false }));
      loadFdrForensics(selectedInstrument.id);
    } catch (err: unknown) {
      showToast({
        title: "Gateway Query Failed",
        message: (err as Error).message,
        type: "error",
      });
      setBankSimModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Category Badge Colors
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
  };

  const calculatedRisk = compositeRisk || calculateCompositeFdrRisk(selectedFdrId, findings);

  return (
    <div className="space-y-6">
      {/* SECTION 1: INSTRUMENT SELECTOR & COMPOSITE HEALTH HEADER */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl select-none">🔬</span>
              <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-100">
                FDR Forensic Verification Workbench
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 font-bold">
                Phase 3.9 Live
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Multi-pipeline document forensic workspace reconciling uploaded evidence against core banking records
            </p>
          </div>

          {/* Instrument Selector Dropdown */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
              Select Instrument:
            </label>
            <select
              value={selectedFdrId}
              onChange={(e) => setSelectedFdrId(e.target.value)}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 cursor-pointer min-w-[260px]"
            >
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.fdrNumber} • {inst.bankName} (₹{(inst.amount / 100000).toFixed(1)}L)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => loadFdrForensics(selectedFdrId)}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Refresh telemetry from vault"
            >
              ↺
            </button>
          </div>
        </div>

        {/* Selected Instrument Core Metrics Ribbon */}
        {selectedInstrument && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                FDR Reference
              </span>
              <span className="text-xs font-black font-mono text-slate-900 dark:text-slate-100 block mt-0.5">
                {selectedInstrument.fdrNumber}
              </span>
              <span className="text-[10px] text-slate-500 truncate block">
                {selectedInstrument.institutionName}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Pledged Sum
              </span>
              <span className="text-xs font-black font-mono text-teal-700 dark:text-teal-300 block mt-0.5">
                {formatCurrency(selectedInstrument.amount)}
              </span>
              <span className="text-[10px] text-slate-500 block">
                Tenure: {selectedInstrument.tenureMonths} Mo
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Issuing Bank
              </span>
              <span className="text-xs font-black text-slate-900 dark:text-slate-100 block mt-0.5 truncate" title={selectedInstrument.bankName}>
                {selectedInstrument.bankName}
              </span>
              <span className="text-[10px] font-mono text-slate-500 block">
                IFSC: {selectedInstrument.ifscCode}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Maturity Date
              </span>
              <span className="text-xs font-black font-mono text-slate-900 dark:text-slate-100 block mt-0.5">
                {formatDate(selectedInstrument.maturityDate)}
              </span>
              <span className={`text-[10px] font-bold block ${selectedInstrument.daysToMaturity <= 30 ? "text-rose-600" : "text-slate-500"}`}>
                {selectedInstrument.daysToMaturity} Days Remaining
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Lien Status
              </span>
              <span className={`text-xs font-black block mt-0.5 ${selectedInstrument.isLienMarked ? "text-emerald-600" : "text-amber-600"}`}>
                {selectedInstrument.isLienMarked ? "✔ LIEN CONFIRMED" : "⚠ UNCONFIRMED"}
              </span>
              <span className="text-[10px] text-slate-500 block truncate" title={selectedInstrument.jointHolderName || "AICTE"}>
                {selectedInstrument.jointHolderName || "Member Secretary, AICTE"}
              </span>
            </div>

            <div className={`p-3 rounded-xl border flex flex-col justify-between ${
              calculatedRisk.riskTier === "CRITICAL"
                ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200"
                : calculatedRisk.riskTier === "HIGH"
                ? "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900 text-orange-900 dark:text-orange-200"
                : calculatedRisk.riskTier === "MEDIUM"
                ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200"
                : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200"
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                Risk Index
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black font-mono">
                  {calculatedRisk.score}
                </span>
                <span className="text-[10px] font-bold uppercase">/ 100 ({calculatedRisk.riskTier})</span>
              </div>
              <span className="text-[9px] font-medium truncate block opacity-90" title={calculatedRisk.statusLabel}>
                {calculatedRisk.statusLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: DOCUMENT WORKSPACE & ANALYZER TELEMETRY */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>📁</span>
              <span>1. Authorized Document Workspace</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                {documents.length} Vault Asset{documents.length === 1 ? "" : "s"}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Cryptographically validated original files with granular analyzer execution states. Checks only mark completed when analyzer has genuinely run.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenUploadModal(selectedFdrId)}
            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-teal-700 hover:bg-teal-800 text-white shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>+ Attach Document to Vault</span>
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 space-y-2">
            <span className="text-2xl block">📄</span>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              No Documents Ingested for FDR {selectedInstrument?.fdrNumber}
            </p>
            <p className="text-[11px] max-w-md mx-auto">
              Please ingest the scanned fixed deposit receipt (PDF, PNG, or JPEG) to initialize forensic OCR, metadata extraction, ELA compression analysis, and seal detection.
            </p>
            <button
              type="button"
              onClick={() => onOpenUploadModal(selectedFdrId)}
              className="mt-2 px-3 py-1 text-xs font-bold rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 cursor-pointer"
            >
              Upload Document Now
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {documents.map((doc) => {
              const hasOcr = !!doc.extractedData;
              const hasMetadata = !!doc.metadata;
              const hasBarcodes = !!(doc.barcodes && doc.barcodes.length > 0);
              const hasEla = !!doc.elaResult;
              const hasVisual = !!(doc.visualRegions && doc.visualRegions.length > 0);

              return (
                <div key={doc.id} className="py-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs">
                          {doc.fileName}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 font-bold">
                          {doc.documentType}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {(doc.fileSizeBytes / 1024).toFixed(1)} KB • {doc.mimeType}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-slate-400">
                        SHA-256: <span className="text-slate-600 dark:text-slate-300">{doc.sha256Checksum?.substring(0, 20)}...</span> • Uploaded: {formatDate(doc.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`/api/fdr/${selectedFdrId}/documents/${doc.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-teal-700 dark:text-teal-300 hover:bg-slate-50 transition-colors"
                      >
                        Authorized Download / Preview ↗
                      </a>
                    </div>
                  </div>

                  {/* AI Engine Efficiency & Accuracy Telemetry Bar */}
                  {doc.aiEfficiency && (
                    <div className="p-3 rounded-xl bg-gradient-to-r from-teal-950/40 via-slate-900/60 to-indigo-950/40 border border-teal-500/30 text-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span className="font-bold text-slate-200">AI Engine Efficiency & Accuracy Telemetry</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-900/60 text-teal-300 border border-teal-700/50 font-bold">
                            ⚡ {doc.aiEfficiency.parallelSpeedupFactor}x Parallel Speedup
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="text-slate-400">Pipeline Execution:</span>
                          <span className="text-emerald-400 font-bold">{doc.aiEfficiency.pipelineDurationMs} ms</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono pt-1">
                        <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">OCR Engine Latency</span>
                          <span className="text-teal-300 font-bold">{doc.aiEfficiency.ocrDurationMs} ms</span>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Field Extraction Yield</span>
                          <span className="text-cyan-300 font-bold">{doc.aiEfficiency.fieldExtractionYield}</span>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">ML Review Priority</span>
                          <span
                            className={`font-bold ${
                              doc.aiEfficiency.mlReviewPriority === "ELEVATED_PRIORITY"
                                ? "text-rose-400"
                                : "text-emerald-400"
                            }`}
                          >
                            {doc.aiEfficiency.mlReviewPriority}
                          </span>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Elevated Scrutiny Risk</span>
                          <span
                            className={`font-bold ${
                              doc.aiEfficiency.mlElevatedProbability >= 0.5
                                ? "text-rose-400"
                                : "text-teal-300"
                            }`}
                          >
                            {(doc.aiEfficiency.mlElevatedProbability * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 flex flex-wrap items-center justify-between gap-1 pt-0.5">
                        <span>
                          Assigned Queue:{" "}
                          <strong className="text-slate-300">{doc.aiEfficiency.mlTriageQueue}</strong>
                        </span>
                        <span className="text-teal-400/80 font-mono text-[9px]">
                          Model: RandomForest(100 Trees) • WASM OCR • Multi-Stage Parallel
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 6 Analyzer State Badges (Strict Rule: Never show completed if not run) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[10px] font-mono">
                    {/* 1. OCR State */}
                    <div className={`p-2 rounded-lg border ${
                      hasOcr
                        ? "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}>
                      <span className="font-bold uppercase tracking-wider block opacity-70">
                        OCR Engine
                      </span>
                      <span className="font-bold block mt-0.5">
                        {hasOcr ? (
                          <span>✔ {doc.extractedData?.ocrEngine || "Tesseract.js"}</span>
                        ) : (
                          <span className="opacity-60">⚪ NOT RUN</span>
                        )}
                      </span>
                      {hasOcr && doc.extractedData?.confidenceScore && (
                        <span className="text-[9px] opacity-80 block">
                          Conf: {(doc.extractedData.confidenceScore * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>

                    {/* 2. Metadata Forensics State */}
                    <div className={`p-2 rounded-lg border ${
                      hasMetadata
                        ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}>
                      <span className="font-bold uppercase tracking-wider block opacity-70">
                        Metadata Analysis
                      </span>
                      <span className="font-bold block mt-0.5 truncate" title={doc.metadata?.software || doc.metadata?.creator || "Analyzed"}>
                        {hasMetadata ? (
                          <span>✔ {doc.metadata?.software || "Completed"}</span>
                        ) : (
                          <span className="opacity-60">⚪ NOT ANALYZED</span>
                        )}
                      </span>
                      {hasMetadata && doc.metadata?.producer && (
                        <span className="text-[9px] opacity-80 block truncate">
                          {doc.metadata.producer}
                        </span>
                      )}
                    </div>

                    {/* 3. Barcode & QR State */}
                    <div className={`p-2 rounded-lg border ${
                      hasBarcodes
                        ? doc.barcodes?.some((b) => b.hasMismatch)
                          ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                          : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}>
                      <span className="font-bold uppercase tracking-wider block opacity-70">
                        QR / Barcode
                      </span>
                      <span className="font-bold block mt-0.5">
                        {hasBarcodes ? (
                          doc.barcodes?.some((b) => b.hasMismatch) ? (
                            <span>⚠ MISMATCH</span>
                          ) : (
                            <span>✔ {doc.barcodes![0].validationStatus}</span>
                          )
                        ) : (
                          <span className="opacity-60">⚪ NO CODES RUN</span>
                        )}
                      </span>
                      {hasBarcodes && (
                        <span className="text-[9px] opacity-80 block">
                          [{doc.barcodes![0].barcodeType}]
                        </span>
                      )}
                    </div>

                    {/* 4. ELA Forensics State */}
                    <div className={`p-2 rounded-lg border ${
                      hasEla
                        ? doc.elaResult?.status === "SKIPPED"
                          ? "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200"
                          : "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}>
                      <span className="font-bold uppercase tracking-wider block opacity-70">
                        ELA Recompression
                      </span>
                      <span className="font-bold block mt-0.5">
                        {hasEla ? (
                          doc.elaResult?.status === "SKIPPED" ? (
                            <span>ℹ VECTOR SKIPPED</span>
                          ) : (
                            <span>✔ Q{doc.elaResult?.recompressionQuality} PROFILED</span>
                          )
                        ) : (
                          <span className="opacity-60">⚪ NOT PROFILED</span>
                        )}
                      </span>
                      {hasEla && doc.elaResult?.diagnosticImageUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setElaModal({
                              isOpen: true,
                              url: doc.elaResult!.diagnosticImageUrl!,
                              fileName: doc.fileName,
                              metrics: `Avg Error: ${doc.elaResult!.averageErrorLevel.toFixed(2)} • Peak: ${doc.elaResult!.peakError.toFixed(2)} • Discrepancy: ${(doc.elaResult!.highDiscrepancyRatio * 100).toFixed(1)}%`,
                            })
                          }
                          className="text-[9px] font-bold text-purple-700 dark:text-purple-300 underline block cursor-pointer"
                        >
                          Heatmap View 👁
                        </button>
                      )}
                    </div>

                    {/* 5. Seal & Signature State (Experimental Heuristic distinction) */}
                    <div className={`p-2 rounded-lg border ${
                      hasVisual
                        ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}>
                      <span className="font-bold uppercase tracking-wider block opacity-70">
                        Visual Seals/Signs
                      </span>
                      <span className="font-bold block mt-0.5">
                        {hasVisual ? (
                          <span>✔ {doc.visualRegions?.filter((r) => r.detectionStatus === "CANDIDATE_DETECTED").length} Candidates</span>
                        ) : (
                          <span className="opacity-60">⚪ NOT DETECTED</span>
                        )}
                      </span>
                      <span className="text-[8px] opacity-75 block text-amber-700 dark:text-amber-300 truncate" title="Experimental Heuristic Analysis (No fabricated trained weights)">
                        HEURISTIC-ONLY
                      </span>
                    </div>

                    {/* 6. Bank Gateway State */}
                    <div className={`p-2 rounded-lg border ${
                      latestBankVerification
                        ? latestBankVerification.outcome === "SANDBOX_MATCH"
                          ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                          : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}>
                      <span className="font-bold uppercase tracking-wider block opacity-70">
                        Bank Gateway
                      </span>
                      <span className="font-bold block mt-0.5 truncate">
                        {latestBankVerification ? (
                          <span>{latestBankVerification.outcome}</span>
                        ) : (
                          <span className="opacity-60">⚪ PENDING INQUIRY</span>
                        )}
                      </span>
                      <span className="text-[8px] opacity-75 block truncate">
                        {latestBankVerification ? latestBankVerification.verificationMode : "SANDBOX_READY"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 3: MULTI-SOURCE EVIDENCE COMPARISON PANEL */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>⚖️</span>
              <span>2. Multi-Source Evidence Comparison Panel</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                Field Cross-Validation Matrix
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Side-by-side reconciliation of institution-submitted values against OCR extractions, QR payloads, metadata observations, and independent bank ledgers.
            </p>
          </div>
        </div>

        {/* Statutory Disclaimer: OCR Confidence is Not Document Authenticity */}
        <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <span className="text-base">⚖️</span>
          <div>
            <span className="font-bold uppercase tracking-wider font-mono text-[10px] text-amber-950 dark:text-amber-100 block">
              Statutory Evidence Non-Authenticity Disclosures
            </span>
            <p className="mt-0.5 text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
              {OCR_CONFIDENCE_STATUTORY_DISCLAIMER}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                <th className="py-2.5 px-3">Canonical Field</th>
                <th className="py-2.5 px-3">Institution Submission</th>
                <th className="py-2.5 px-3">OCR Extracted (Tesseract)</th>
                <th className="py-2.5 px-3">QR Decoded Payload</th>
                <th className="py-2.5 px-3">Independent Bank Value</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Reviewer Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {evidenceMatrix.map((row) => (
                <tr key={row.fieldKey} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">
                    {row.fieldLabel}
                  </td>
                  <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                    {row.submitted}
                  </td>
                  <td className="py-3 px-3">
                    {row.ocr ? (
                      <div className="space-y-0.5">
                        <span className={`font-semibold ${row.isMismatch ? "text-rose-600 dark:text-rose-400 font-black" : "text-slate-700 dark:text-slate-300"}`}>
                          {row.ocr}
                        </span>
                        {row.ocrConfidence && (
                          <span className="text-[9px] text-slate-400 block font-normal">
                            Conf: {(row.ocrConfidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Not extracted</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {row.barcode ? (
                      <span className="text-slate-700 dark:text-slate-300 font-semibold">
                        {row.barcode}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {row.bankValue ? (
                      <div className="space-y-0.5">
                        <span className="text-slate-800 dark:text-slate-200 font-semibold">
                          {row.bankValue}
                        </span>
                        <span className="text-[9px] text-indigo-600 dark:text-indigo-400 block font-bold">
                          [SIMULATED]
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {row.isMismatch ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300">
                        ⚠ MISMATCH
                      </span>
                    ) : row.ocr || row.barcode || row.bankValue ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                        ✔ MATCH
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                        ⚪ PENDING
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {row.ocr && primaryDoc && (
                      <button
                        type="button"
                        onClick={() =>
                          setCorrectionModal({
                            isOpen: true,
                            documentId: primaryDoc.id,
                            extractionId: primaryDoc.extractedData?.id || `ocr_${primaryDoc.id}`,
                            fieldName: row.fieldKey,
                            currentValue: String(row.ocr),
                            correctedValue: String(row.submitted),
                            justification: "",
                            isSubmitting: false,
                          })
                        }
                        className="px-2 py-1 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-teal-700 dark:text-teal-300 transition-colors cursor-pointer"
                        title="Submit scrutiny officer correction with justification"
                      >
                        Correct OCR ✍
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phase 5.B: Granular Discrepancy Cards with Comparison Rules, Next Steps & Corrections */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Field Comparison Rules & Regulatory Prescriptions
            </h4>
            <span className="text-[11px] text-slate-400 font-mono">
              OCR Clarity ≠ Document Authenticity
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {granularDiscrepancyFields.map((field) => (
              <div
                key={`workbench-field-${field.fieldKey}`}
                className={`p-3.5 rounded-xl border ${
                  field.isMismatch
                    ? "border-rose-300 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40"
                } space-y-2 text-xs`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {field.fieldLabel}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
                      field.isMismatch
                        ? "bg-rose-600 text-white"
                        : "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                    }`}
                  >
                    {field.isMismatch ? "DISCREPANCY" : "MATCHED"}
                  </span>
                </div>

                <div className="space-y-1 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-mono text-[9px] block uppercase">Comparison Rule</span>
                    <p className="text-slate-700 dark:text-slate-300 font-mono">{field.comparisonRule}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-mono text-[9px] block uppercase">Analytical Explanation</span>
                    <p className="text-slate-700 dark:text-slate-300">{field.explanation}</p>
                  </div>
                  <div>
                    <span className="text-teal-700 dark:text-teal-400 font-mono text-[9px] block uppercase font-bold">Required Next Step</span>
                    <p className="text-teal-800 dark:text-teal-300 font-medium">{field.requiredNextStep}</p>
                  </div>
                </div>

                {field.corrections.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-500">
                    <span className="font-bold text-teal-600">Corrected by: </span>
                    {field.corrections[0].correctedByUserName} ({field.corrections[0].correctedByUserRole}) — &quot;{field.corrections[0].justification}&quot;
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 4: FORENSIC FINDINGS PANEL */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>🛡️</span>
              <span>3. Forensic Findings & Discrepancy Ledger</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                {findings.length} Finding{findings.length === 1 ? "" : "s"} ({findings.filter((f) => !f.isResolved).length} Open)
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Explainable discrepancies synthesized across metadata analysis, barcode validation, OCR, ELA compression, and heuristic visual regions.
            </p>
          </div>

          {/* Findings Filter Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-[11px] font-bold bg-slate-50 dark:bg-slate-800">
              {(["ALL", "OPEN", "RESOLVED"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFindingStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    findingStatusFilter === st
                      ? "bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <select
              value={findingSeverityFilter}
              onChange={(e) => setFindingSeverityFilter(e.target.value as any)}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="INFORMATIONAL">Informational</option>
            </select>
          </div>
        </div>

        {filteredFindings.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 space-y-1">
            <span className="text-2xl block">✔</span>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              No Matching Forensic Findings for this Filter
            </p>
            <p className="text-[10px]">
              No active discrepancies detected. Notice: Absence of findings does not guarantee authenticity without bank lien confirmation.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFindings.map((finding) => {
              const category = finding.category || "GENERAL_DISCREPANCY";
              const isResolved = finding.isResolved;

              return (
                <div
                  key={finding.id}
                  className={`p-4 rounded-xl border shadow-2xs space-y-3 transition-all ${
                    isResolved
                      ? "bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-80"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Severity Badge */}
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          finding.severity === "CRITICAL"
                            ? "bg-rose-600 text-white"
                            : finding.severity === "WARNING"
                            ? "bg-amber-600 text-white"
                            : "bg-blue-600 text-white"
                        }`}
                      >
                        {finding.severity}
                      </span>

                      {/* Category Badge */}
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          categoryBadgeColor[category] || "bg-slate-100 text-slate-700 border-slate-300"
                        }`}
                      >
                        {category.replace(/_/g, " ")}
                      </span>

                      {/* Source Analysis Method */}
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

                      {/* Resolution State Badge */}
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          isResolved
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {isResolved ? `RESOLVED (${finding.resolutionState || "CLOSED"})` : "OPEN FOR REVIEW"}
                      </span>
                    </div>

                    {/* Action Buttons for Scrutiny Officers */}
                    <div className="flex items-center gap-2">
                      {!isResolved && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setEvidenceRequestModal({
                                isOpen: true,
                                findingId: finding.id,
                                documentId: finding.documentId || undefined,
                                note: `Discrepancy identified in ${category}: ${finding.description}. Please provide certified issuing branch endorsement letter.`,
                                isSubmitting: false,
                              })
                            }
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            Request Evidence 📨
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setResolveModal({
                                isOpen: true,
                                finding,
                                decision: "BANK_CONFIRMED",
                                justification: "",
                                isSubmitting: false,
                              })
                            }
                            className="px-3 py-1 text-[11px] font-bold rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 hover:bg-teal-100 transition-colors cursor-pointer font-bold"
                          >
                            Scrutinize & Resolve ⚖️
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Finding Explanation */}
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                    {finding.description}
                  </p>

                  {/* Supporting Evidence Detail */}
                  {finding.evidence && (
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-1">
                      <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px] block">
                        Supporting Forensic Evidence:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px]">
                        {Object.entries(finding.evidence).map(([key, val]) => (
                          <div key={key} className="truncate">
                            <span className="text-slate-400">{key}: </span>
                            <span className="text-slate-800 dark:text-slate-200 font-semibold">
                              {typeof val === "object" ? JSON.stringify(val) : String(val)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended Action */}
                  {finding.recommendedAction && (
                    <div className="text-[11px] text-teal-700 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/20 p-2 rounded-lg border border-teal-100 dark:border-teal-900/40">
                      <span className="font-bold">Recommended Regulatory Action: </span>
                      {finding.recommendedAction}
                    </div>
                  )}

                  {/* Resolved Lineage Footer */}
                  {isResolved && finding.reviewerJustification && (
                    <div className="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-[10px] space-y-1 text-emerald-900 dark:text-emerald-300">
                      <div className="flex items-center justify-between font-bold">
                        <span>Reviewer Decision: {finding.reviewerDecision}</span>
                        <span>Resolved: {formatDate(finding.resolvedAt)}</span>
                      </div>
                      <p className="italic">
                        Justification: &quot;{finding.reviewerJustification}&quot;
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 5: BANK VERIFICATION GATEWAY & AUDIT PANEL */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>🏦</span>
              <span>4. Bank Verification Gateway Panel</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                Phase 3.8 Boundary
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Core ledger inquiry via Bank Verification Provider. Demonstrates independent confirmation without claiming simulation as live verification.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setBankSimModal({ isOpen: true, scenario: "MATCH", isSubmitting: false })}
            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>🏦 Query Bank Gateway (Sandbox Simulation)</span>
          </button>
        </div>

        {latestBankVerification ? (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Latest Gateway Outcome:
                </span>
                <span
                  className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded ${
                    latestBankVerification.outcome === "SANDBOX_MATCH"
                      ? "bg-emerald-600 text-white"
                      : latestBankVerification.outcome === "NOT_CONFIGURED"
                      ? "bg-purple-600 text-white"
                      : "bg-rose-600 text-white"
                  }`}
                >
                  {latestBankVerification.outcome}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold">
                  MODE: {latestBankVerification.verificationMode}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Correlation: {latestBankVerification.correlationId}
              </span>
            </div>

            {/* Field Comparison Ledger */}
            {latestBankVerification.comparisons && latestBankVerification.comparisons.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Core Banking Reconciliation Ledger:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  {latestBankVerification.comparisons.map((c, i) => (
                    <div key={i} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">{c.field}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${c.isMatch ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                          {c.isMatch ? "MATCH" : "MISMATCH"}
                        </span>
                      </div>
                      <p className="text-slate-800 dark:text-slate-200 font-semibold truncate">
                        Sub: {c.submittedValue}
                      </p>
                      {c.providerValue && (
                        <p className="text-slate-500 text-[10px] truncate">
                          Bnk: {c.providerValue}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Statutory Disclaimer */}
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 text-[11px] leading-relaxed">
              <span className="font-bold block">Statutory Non-Authentication Notice:</span>
              <p className="mt-0.5">{latestBankVerification.disclaimer}</p>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 space-y-1">
            <span className="text-2xl block">⏳</span>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              No External Inquiries Initiated for FDR {selectedInstrument?.fdrNumber}
            </p>
            <p className="text-[10px]">
              Click &quot;Query Bank Gateway&quot; to test independent reconciliation against deterministic synthetic fixtures.
            </p>
          </div>
        )}
      </div>

      {/* MODAL 1: FINDING RESOLUTION MODAL */}
      {resolveModal.isOpen && resolveModal.finding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Scrutinize & Resolve Forensic Finding
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {resolveModal.finding.fdrNumber} • #{resolveModal.finding.ruleKey || resolveModal.finding.riskCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResolveModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500">Finding:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {resolveModal.finding.category?.replace(/_/g, " ") || resolveModal.finding.riskCode}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  {resolveModal.finding.severity}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                {resolveModal.finding.description}
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleResolveSubmit();
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Regulatory Resolution Decision:
                </label>
                <select
                  value={resolveModal.decision}
                  onChange={(e) =>
                    setResolveModal((prev) => ({
                      ...prev,
                      decision: e.target.value as any,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium cursor-pointer"
                >
                  <option value="BANK_CONFIRMED">
                    BANK CONFIRMED — Issuing Bank Authenticated via SFMS / Confirmation Letter
                  </option>
                  <option value="ACCEPTED_RISK">
                    ACCEPTED RISK — Technical Discrepancy Formally Accepted by Authority
                  </option>
                  <option value="FALSE_POSITIVE">
                    FALSE POSITIVE — Scanning Artifact / Baseline Noise Dismissed
                  </option>
                  <option value="REJECTED_INSTRUMENT">
                    REJECTED INSTRUMENT — Statutory Deficit or Fraud Discrepancy Confirmed
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mandatory Scrutiny Rationale & Justification:
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain the regulatory basis for resolving this discrepancy (minimum 10 characters)..."
                  value={resolveModal.justification}
                  onChange={(e) =>
                    setResolveModal((prev) => ({
                      ...prev,
                      justification: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-1 focus:ring-teal-500"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  This decision will be immutably recorded in the regulatory audit ledger under {currentRole} credentials.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setResolveModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    resolveModal.isSubmitting ||
                    resolveModal.justification.trim().length < 10
                  }
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {resolveModal.isSubmitting ? "Recording Audit Decision..." : "Commit Decision to Ledger"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: FIELD CORRECTION MODAL */}
      {correctionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Scrutiny Officer Candidate Field Correction
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Correcting field: <span className="font-bold">{correctionModal.fieldName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectionModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCorrectionSubmit();
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-500 mb-1">
                  Original Extracted Value (Uncorrected):
                </label>
                <input
                  type="text"
                  disabled
                  value={correctionModal.currentValue}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Corrected Financial / Instrument Value:
                </label>
                <input
                  type="text"
                  required
                  value={correctionModal.correctedValue}
                  onChange={(e) =>
                    setCorrectionModal((prev) => ({
                      ...prev,
                      correctedValue: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Officer Justification Note:
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain why the candidate reading was adjusted (e.g. OCR misread font glyph)..."
                  value={correctionModal.justification}
                  onChange={(e) =>
                    setCorrectionModal((prev) => ({
                      ...prev,
                      justification: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCorrectionModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    correctionModal.isSubmitting ||
                    correctionModal.justification.trim().length < 5
                  }
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {correctionModal.isSubmitting ? "Persisting Correction..." : "Save Correction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REQUEST ADDITIONAL EVIDENCE MODAL */}
      {evidenceRequestModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Request Additional Documentary Evidence
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Dispatch formal deficiency petition to {selectedInstrument?.institutionName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEvidenceRequestModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleEvidenceRequestSubmit();
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Official Deficiency / Clarification Notice:
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Detail the additional evidence requested (e.g. original branch endorsement certificate with manager seal, SFMS reference code)..."
                  value={evidenceRequestModal.note}
                  onChange={(e) =>
                    setEvidenceRequestModal((prev) => ({
                      ...prev,
                      note: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-1 focus:ring-teal-500"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  This official petition will be immutably recorded in the compliance ledger and routed to the institution nodal officer.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEvidenceRequestModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    evidenceRequestModal.isSubmitting ||
                    evidenceRequestModal.note.trim().length < 10
                  }
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {evidenceRequestModal.isSubmitting ? "Dispatching Petition..." : "Dispatch Evidence Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ELA DIAGNOSTIC HEATMAP MODAL */}
      {elaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                  Error Level Analysis (ELA) Diagnostic Heatmap
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {elaModal.fileName} • {elaModal.metrics}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setElaModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center p-2 min-h-[280px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={elaModal.url}
                alt="ELA Diagnostic Heatmap"
                className="max-h-[420px] w-auto object-contain rounded"
              />
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-3 rounded-xl text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold">Regulatory Antiforgery Protocol Disclaimer:</p>
              <p className="text-[10px] leading-relaxed">
                Bright high-contrast clusters highlight regions where recompression error deviates from baseline. Natural variations occur from legitimate image cropping, contrast adjustments, digital bank seals, and scanner hardware sharpening. ELA serves as an investigative guide for human scrutiny, NEVER definitive proof of forgery.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setElaModal(null)}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: BANK SIMULATION SCENARIO MODAL */}
      {bankSimModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Bank Verification Gateway Inquiry (Phase 3.8 Sandbox)
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {selectedInstrument?.fdrNumber} • {selectedInstrument?.bankName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBankSimModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Demonstration Simulation Scenario:
                </label>
                <select
                  value={bankSimModal.scenario}
                  onChange={(e) =>
                    setBankSimModal((prev) => ({
                      ...prev,
                      scenario: e.target.value as any,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium cursor-pointer"
                >
                  <option value="MATCH">
                    MATCH — Core Ledger Confirms Deposit & Active Lien
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

              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 text-[10px] leading-relaxed">
                <span className="font-bold block">Statutory Non-Prejudgment Invariant:</span>
                This sandbox inquiry produces deterministic demonstration results for verification testing. It will NEVER be represented as an authorized live bank confirmation.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setBankSimModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bankSimModal.isSubmitting}
                  onClick={handleBankSimulationSubmit}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {bankSimModal.isSubmitting ? "Querying Gateway..." : "Execute Inquiry →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
