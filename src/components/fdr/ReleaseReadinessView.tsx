"use client";

import React, { useState, useEffect } from "react";
import type {
  ReleaseReadinessEvaluationDto,
  ReleaseRequestStatus,
} from "@/lib/fdr/types";
import { AI_RELEASE_DECISION_SAFEGUARD } from "@/lib/fdr/types";

interface ReleaseReadinessViewProps {
  currentRole: string;
  onOpenWorkbench: (fdrId: string) => void;
  showToast: (toast: {
    title: string;
    message: string;
    type: "success" | "info" | "warning" | "error";
  }) => void;
}

export function ReleaseReadinessView({
  currentRole,
  onOpenWorkbench,
  showToast,
}: ReleaseReadinessViewProps) {
  const [evaluations, setEvaluations] = useState<ReleaseReadinessEvaluationDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Transition Modal State
  const [transitionModal, setTransitionModal] = useState<{
    isOpen: boolean;
    targetStatus: ReleaseRequestStatus;
    remarks: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    targetStatus: "UNDER_SCRUTINY",
    remarks: "",
    isSubmitting: false,
  });

  const loadReleases = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/fdr/releases");
      const json = await res.json();
      if (json.success && json.data) {
        setEvaluations(json.data);
        if (json.data.length > 0 && !selectedRequestId) {
          setSelectedRequestId(json.data[0].requestId);
        }
      }
    } catch {
      // Handled
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReleases();
  }, []);

  const selectedEvaluation =
    evaluations.find((e) => e.requestId === selectedRequestId) || evaluations[0];

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);

  const formatDate = (val: string) => {
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

  const handleOpenTransition = (status: ReleaseRequestStatus) => {
    setTransitionModal({
      isOpen: true,
      targetStatus: status,
      remarks: "",
      isSubmitting: false,
    });
  };

  const handleTransitionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvaluation) return;

    if (
      transitionModal.targetStatus === "REJECTED" &&
      transitionModal.remarks.trim().length < 10
    ) {
      showToast({
        title: "Justification Required",
        message: "Mandatory regulatory justification (minimum 10 characters) is required to reject a petition.",
        type: "error",
      });
      return;
    }

    setTransitionModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const res = await fetch(`/api/fdr/releases/${selectedEvaluation.requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStatus: transitionModal.targetStatus,
          remarks: transitionModal.remarks,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || json.error || "Workflow transition rejected");
      }

      showToast({
        title: "Workflow Status Updated",
        message: json.message || `Petition transitioned to ${transitionModal.targetStatus}.`,
        type: "success",
      });

      setTransitionModal({
        isOpen: false,
        targetStatus: "UNDER_SCRUTINY",
        remarks: "",
        isSubmitting: false,
      });

      // Reload list
      await loadReleases();
    } catch (err: unknown) {
      const error = err as Error;
      setTransitionModal((prev) => ({ ...prev, isSubmitting: false }));
      showToast({
        title: "Action Denied",
        message: error.message,
        type: "error",
      });
    }
  };

  // Readiness Badge Helper
  const renderReadinessBadge = (state: ReleaseReadinessEvaluationDto["readinessState"]) => {
    switch (state) {
      case "COMPLETE":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
            ✓ Complete & Ready
          </span>
        );
      case "READY_FOR_DECISION":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
            ⚖ Awaiting Decision
          </span>
        );
      case "BLOCKED_DEPENDENCY":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            ⛔ Blocked Dependencies
          </span>
        );
      case "MISSING_EVIDENCE":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            ⚠ Missing Evidence
          </span>
        );
      case "AWAITING_REVIEW":
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
            ⏱ Awaiting Scrutiny
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. MANDATED STATUTORY AI SAFEGUARD BANNER */}
      <div className="p-4 rounded-2xl border border-teal-200 dark:border-teal-900 bg-teal-50/70 dark:bg-teal-950/20 text-xs text-teal-950 dark:text-teal-200">
        <div className="flex items-start gap-2.5">
          <span className="text-lg">🛡️</span>
          <div>
            <h4 className="font-bold uppercase tracking-wider font-mono text-[11px] text-teal-950 dark:text-teal-100">
              Statutory Decision Authority Safeguard
            </h4>
            <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">
              {AI_RELEASE_DECISION_SAFEGUARD}
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-slate-400 font-mono text-xs">
          <span className="animate-spin text-2xl block mb-2">↻</span>
          Evaluating release readiness requirements and workflow state...
        </div>
      ) : evaluations.length === 0 ? (
        <div className="p-12 text-center text-slate-400 font-mono text-xs bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <span className="text-3xl block mb-2">📄</span>
          No active security deposit release petitions currently on file.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 2. PETITION SELECTION COLUMN */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500">
              Release Petitions Queue ({evaluations.length})
            </h3>

            {evaluations.map((ev) => (
              <div
                key={ev.requestId}
                onClick={() => setSelectedRequestId(ev.requestId)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs space-y-2 ${
                  selectedRequestId === ev.requestId
                    ? "border-teal-600 bg-teal-50/40 dark:bg-teal-950/20 ring-2 ring-teal-600/20"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                    {ev.fdrNumber}
                  </span>
                  {renderReadinessBadge(ev.readinessState)}
                </div>

                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {ev.institutionName}
                </p>

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span>Amount: {formatCurrency(ev.requestedAmount)}</span>
                  <span>{ev.currentStatus}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 3. DETAILED READINESS DOSSIER */}
          {selectedEvaluation && (
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                      Statutory Release Dossier #{selectedEvaluation.requestId}
                    </span>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                      {selectedEvaluation.fdrNumber} — {selectedEvaluation.institutionName}
                    </h2>
                  </div>

                  <div className="text-right">
                    <span className="text-xl font-black font-mono text-slate-900 dark:text-slate-100 block">
                      {formatCurrency(selectedEvaluation.requestedAmount)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Submitted: {formatDate(selectedEvaluation.submissionDate)}
                    </span>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-mono block">
                      Current Workflow State
                    </span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                      {selectedEvaluation.currentStatus.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] uppercase font-mono block">
                      Readiness Status
                    </span>
                    {renderReadinessBadge(selectedEvaluation.readinessState)}
                  </div>
                </div>

                {/* AI Evidence Recommendation (Strictly Advisory) */}
                <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold font-mono text-indigo-800 dark:text-indigo-300 text-[11px]">
                    <span>💡</span>
                    <span>AI Advisory Analysis (Advisory Only):</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {selectedEvaluation.aiRecommendation}
                  </p>
                </div>

                {/* 5-State Requirements Checklist */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Statutory Release Requirements Checklist
                  </h4>

                  <div className="space-y-2">
                    {selectedEvaluation.requirements.map((req) => (
                      <div
                        key={req.key}
                        className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                          req.status === "MET"
                            ? "border-teal-200 dark:border-teal-900/50 bg-teal-50/30 dark:bg-teal-950/10"
                            : req.status === "BLOCKED"
                            ? "border-rose-300 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20"
                            : "border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/10"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-bold ${
                                req.status === "MET"
                                  ? "text-teal-700 dark:text-teal-400"
                                  : req.status === "BLOCKED"
                                  ? "text-rose-700 dark:text-rose-400"
                                  : "text-amber-700 dark:text-amber-400"
                              }`}
                            >
                              {req.status === "MET" ? "✓" : req.status === "BLOCKED" ? "⛔" : "⚠"}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {req.title}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                            {req.explanation}
                          </p>
                        </div>

                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded shrink-0 ${
                            req.status === "MET"
                              ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                              : req.status === "BLOCKED"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Blocked Dependencies Alert */}
                {selectedEvaluation.blockedDependencies.length > 0 && (
                  <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-300 space-y-1">
                    <span className="font-bold font-mono text-[11px] block">
                      ⛔ BLOCKING CONDITIONS DETECTED:
                    </span>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {selectedEvaluation.blockedDependencies.map((b, idx) => (
                        <li key={idx}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Workflow Actions Bar */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenWorkbench(selectedEvaluation.fdrId)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    Open Forensic Workbench 🔬
                  </button>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Render Allowed Transitions */}
                    {selectedEvaluation.allowedTransitions.map((target) => (
                      <button
                        key={target}
                        type="button"
                        onClick={() => handleOpenTransition(target)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                          target === "APPROVED"
                            ? "bg-teal-700 hover:bg-teal-800 text-white"
                            : target === "REJECTED"
                            ? "bg-rose-600 hover:bg-rose-700 text-white"
                            : target === "DISBURSED"
                            ? "bg-indigo-700 hover:bg-indigo-800 text-white"
                            : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {target === "UNDER_SCRUTINY"
                          ? "Initiate Scrutiny"
                          : target === "COMMITTEE_REVIEW"
                          ? "Forward to Committee"
                          : target === "APPROVED"
                          ? "Authorize Approval"
                          : target === "DISBURSED"
                          ? "Confirm Disbursement"
                          : "Reject Petition"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. WORKFLOW TRANSITION MODAL */}
      {transitionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Confirm Workflow Transition: {transitionModal.targetStatus.replace(/_/g, " ")}
              </h3>
              <p className="text-xs text-slate-500">
                Executing statutory state transition for FDR #{selectedEvaluation?.fdrNumber}.
              </p>
            </div>

            <form onSubmit={handleTransitionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Official Decision Remarks / Justification:
                </label>
                <textarea
                  rows={3}
                  required={transitionModal.targetStatus === "REJECTED"}
                  value={transitionModal.remarks}
                  onChange={(e) =>
                    setTransitionModal((prev) => ({ ...prev, remarks: e.target.value }))
                  }
                  placeholder={
                    transitionModal.targetStatus === "REJECTED"
                      ? "Mandatory legal reason for rejecting refund petition (e.g. 'Premature release petition; 8-year lock-in tenure incomplete')."
                      : "Optional committee observations or scrutiny clearance reference."
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    setTransitionModal({
                      isOpen: false,
                      targetStatus: "UNDER_SCRUTINY",
                      remarks: "",
                      isSubmitting: false,
                    })
                  }
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={transitionModal.isSubmitting}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg text-white cursor-pointer disabled:opacity-50 ${
                    transitionModal.targetStatus === "REJECTED"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-teal-700 hover:bg-teal-800"
                  }`}
                >
                  {transitionModal.isSubmitting ? "Updating..." : "Confirm Transition"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
