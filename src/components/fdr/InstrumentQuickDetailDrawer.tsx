"use client";

import React, { useEffect } from "react";
import type { FdrInstrumentDto } from "@/lib/fdr/types";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface InstrumentQuickDetailDrawerProps {
  instrument: FdrInstrumentDto | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenWorkbench: (fdrId: string) => void;
  onOpenLifecycle: (fdrId: string) => void;
  onConfirmLien?: (instrument: FdrInstrumentDto) => void;
  onOpenRenewalModal?: (instrument: FdrInstrumentDto) => void;
}

export function InstrumentQuickDetailDrawer({
  instrument,
  isOpen,
  onClose,
  onOpenWorkbench,
  onOpenLifecycle,
  onConfirmLien,
  onOpenRenewalModal,
}: InstrumentQuickDetailDrawerProps) {
  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !instrument) return null;

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

  const isExpired = instrument.daysToMaturity <= 0;
  const isCritical = instrument.daysToMaturity > 0 && instrument.daysToMaturity <= 30;
  const isWarning = instrument.daysToMaturity > 30 && instrument.daysToMaturity <= 60;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Instrument Quick Detail: ${instrument.fdrNumber}`}
      className="fixed inset-0 z-50 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-2xs transition-opacity animate-in fade-in duration-200 motion-reduce:animate-none"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 pointer-events-none">
        <div className="w-screen max-w-md pointer-events-auto bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 motion-reduce:animate-none">
          {/* Header */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/60 dark:bg-slate-800/40">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-base text-slate-900 dark:text-slate-100">
                  {instrument.fdrNumber}
                </span>
                <StatusBadge status={instrument.verificationState} size="sm" />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
                {instrument.institutionName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              ×
            </button>
          </div>

          {/* Drawer Body */}
          <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
            {/* Financial Telemetry Card */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                Pledged Principal & Yield
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCurrency(instrument.amount)}
                </span>
                <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400">
                  @{instrument.interestRate}% p.a.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Established Date</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    {formatDate(instrument.issueDate)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Mandated Maturity</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    {formatDate(instrument.maturityDate)}
                  </span>
                </div>
              </div>
            </div>

            {/* Issuing Bank & Joint Custody */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                Issuing Bank & Joint Custody
              </span>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                      {instrument.bankName}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      IFSC: {instrument.ifscCode} • {instrument.branchName}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      instrument.isLienMarked
                        ? "bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950 dark:text-teal-300"
                        : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    {instrument.isLienMarked ? "Lien Marked ✓" : "Lien Pending ✗"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  <strong>Joint Holder:</strong> {instrument.jointHolderName || "Regional Officer (AICTE / State Board)"}
                </p>

                {!instrument.isLienMarked && onConfirmLien && (
                  <button
                    type="button"
                    onClick={() => onConfirmLien(instrument)}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950 dark:hover:bg-teal-900 text-teal-800 dark:text-teal-300 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>✓ Mark Bank Lien Confirmed</span>
                  </button>
                )}
              </div>
            </div>

            {/* Maturity Horizon Status */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                Maturity Horizon & Renewal Status
              </span>
              <div
                className={`p-3.5 rounded-xl border ${
                  isExpired
                    ? "bg-rose-50/60 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900"
                    : isCritical
                    ? "bg-amber-50/60 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
                    : isWarning
                    ? "bg-amber-50/30 border-amber-200 dark:bg-amber-950/10 dark:border-amber-900"
                    : "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {isExpired
                      ? `Matured ${Math.abs(instrument.daysToMaturity)} days ago`
                      : `${instrument.daysToMaturity} days remaining`}
                  </span>
                  <span className="font-mono text-[10px] uppercase font-bold text-slate-500">
                    Tenure: {instrument.tenureMonths} Months
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                  {isExpired
                    ? "Statutory tenure has lapsed. Mandatory extension petition or continuous replacement instrument required."
                    : isCritical
                    ? "Approaching 30-day statutory expiry window. Prioritize renewal verification."
                    : "Within approved operational validity."}
                </p>

                {(isExpired || isCritical) &&
                  instrument.renewalState !== "RENEWAL_REQUESTED" &&
                  onOpenRenewalModal && (
                    <button
                      type="button"
                      onClick={() => onOpenRenewalModal(instrument)}
                      className="w-full mt-2 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>↻ Petition FDR Extension</span>
                    </button>
                  )}
              </div>
            </div>

            {/* Invariant & Safeguard Notice */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 text-[11px] text-slate-500 space-y-1">
              <p>
                <strong>Statutory Safeguard:</strong> This instrument remains preserved in the immutable audit ledger. Historical replacements are linked via non-overwriting node relationships.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenWorkbench(instrument.id);
              }}
              className="w-full py-2 px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>🔬 Open in Forensic Workbench</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenLifecycle(instrument.id);
              }}
              className="w-full py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>📊 View Lifecycle Node Graph & Timeline</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
