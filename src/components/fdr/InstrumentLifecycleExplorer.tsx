"use client";

import React, { useState, useEffect, useTransition } from "react";
import type {
  FdrInstrumentDto,
  InstrumentLifecycleDetailDto,
} from "@/lib/fdr/types";
import { getInstrumentLifecycleDetail } from "@/lib/fdr/lifecycleService";

interface InstrumentLifecycleExplorerProps {
  instruments: FdrInstrumentDto[];
  initialFdrId?: string;
  onOpenWorkbench: (fdrId: string) => void;
  onOpenUploadModal: (fdrId: string) => void;
  showToast: (toast: {
    title: string;
    message: string;
    type: "success" | "info" | "warning" | "error";
  }) => void;
}

export function InstrumentLifecycleExplorer({
  instruments,
  initialFdrId,
  onOpenWorkbench,
  onOpenUploadModal,
  showToast,
}: InstrumentLifecycleExplorerProps) {
  const [selectedFdrId, setSelectedFdrId] = useState<string>(
    initialFdrId || instruments[0]?.id || ""
  );
  const [detail, setDetail] = useState<InstrumentLifecycleDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"timeline" | "lineage" | "documents" | "obligations">("timeline");
  const [isPending, startTransition] = useTransition();

  const loadLifecycle = async (fdrId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/fdr/${fdrId}/lifecycle`);
      const json = await res.json();
      if (json.success && json.data) {
        setDetail(json.data);
      } else {
        // Fallback to direct client service evaluation
        const fallback = await getInstrumentLifecycleDetail(fdrId);
        setDetail(fallback);
      }
    } catch {
      const fallback = await getInstrumentLifecycleDetail(fdrId);
      setDetail(fallback);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedFdrId) {
      loadLifecycle(selectedFdrId);
    }
  }, [selectedFdrId]);

  const inst = detail?.instrument;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);

  const formatDate = (val?: string | null) => {
    if (!val) return "N/A";
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

  return (
    <div className="space-y-6">
      {/* 1. INSTRUMENT SELECTOR BAR */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
              Instrument Lifecycle Dossier
            </span>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <select
                value={selectedFdrId}
                onChange={(e) => setSelectedFdrId(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600"
              >
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.fdrNumber} — {i.institutionName}
                  </option>
                ))}
              </select>

              {inst && (
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    inst.administrativeState === "PLEDGED_ACTIVE"
                      ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                      : inst.administrativeState === "MATURED_PENDING_ACTION"
                      ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  {inst.administrativeState}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenWorkbench(selectedFdrId)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer"
            >
              Forensic Workbench 🔬
            </button>
            <button
              type="button"
              onClick={() => onOpenUploadModal(selectedFdrId)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              + Upload Document
            </button>
          </div>
        </div>
      </div>

      {isLoading || !detail || !inst ? (
        <div className="p-16 text-center text-slate-400 font-mono text-xs">
          <span className="animate-spin text-2xl block mb-2">↻</span>
          Retrieving complete instrument lifecycle and lineage relationships...
        </div>
      ) : (
        <>
          {/* 2. INSTRUMENT OVERVIEW CARD */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                  {inst.fdrNumber}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {inst.institutionName} • Pledged in favor of {inst.jointHolderName}
                </p>
              </div>

              <div className="text-right">
                <span className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCurrency(inst.amount)}
                </span>
                <span className="text-[11px] text-slate-500 font-mono block">
                  {inst.tenureMonths} Months @ {inst.interestRate}% p.a.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-400 text-[10px] block uppercase">Issuing Bank</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {inst.bankName}
                </span>
                <span className="text-[11px] text-slate-500 block">{inst.ifscCode}</span>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] block uppercase">Branch Location</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {inst.branchName}
                </span>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] block uppercase">Issue & Maturity</span>
                <span className="text-slate-700 dark:text-slate-300 block">
                  Issued: {formatDate(inst.issueDate)}
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">
                  Matures: {formatDate(inst.maturityDate)} ({inst.daysToMaturity}d left)
                </span>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] block uppercase">Lien & Renewal</span>
                <span
                  className={`font-bold block ${
                    inst.isLienMarked ? "text-teal-600" : "text-rose-600"
                  }`}
                >
                  {inst.isLienMarked ? "✓ Bank Lien Active" : "⚠ Lien Missing"}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  State: {inst.renewalState}
                </span>
              </div>
            </div>
          </div>

          {/* 3. WORKSPACE SUB-NAVIGATION TABS */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("timeline")}
              className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === "timeline"
                  ? "bg-teal-700 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Unified Timeline ({detail.timeline.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("lineage")}
              className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === "lineage"
                  ? "bg-teal-700 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Lineage & Replacement Graph ({detail.lineageGraph.nodes.length} Nodes)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("documents")}
              className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === "documents"
                  ? "bg-teal-700 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Linked Scans & Vault ({detail.documents.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("obligations")}
              className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === "obligations"
                  ? "bg-teal-700 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Outstanding Obligations ({detail.outstandingObligations.length})
            </button>
          </div>

          {/* 4. TAB CONTENT: UNIFIED CHRONOLOGICAL TIMELINE */}
          {activeTab === "timeline" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Chronological Lifecycle Ledger
                </h4>
                <span className="text-xs text-slate-500 font-mono">
                  Synthesized from Vault, Bank Gateway & Scrutiny Logs
                </span>
              </div>

              <div className="relative pl-6 border-l-2 border-teal-500/30 dark:border-teal-500/20 space-y-6">
                {detail.timeline.map((event) => (
                  <div key={event.id} className="relative group">
                    {/* Timeline Node Dot */}
                    <div
                      className={`absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                        event.severity === "CRITICAL"
                          ? "bg-rose-600 ring-4 ring-rose-100 dark:ring-rose-950"
                          : event.severity === "SUCCESS"
                          ? "bg-teal-600 ring-4 ring-teal-100 dark:ring-teal-950"
                          : event.severity === "WARNING"
                          ? "bg-amber-600 ring-4 ring-amber-100 dark:ring-amber-950"
                          : "bg-slate-400"
                      }`}
                    />

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {event.eventType.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          {new Date(event.timestamp).toLocaleString("en-IN")}
                        </span>
                        {event.actorName && (
                          <span className="text-[10px] font-mono text-teal-600">
                            by {event.actorName} ({event.actorRole})
                          </span>
                        )}
                      </div>

                      <h5 className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                        {event.title}
                      </h5>

                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {event.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. TAB CONTENT: LINEAGE & REPLACEMENT GRAPH */}
          {activeTab === "lineage" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-6">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Predecessor & Replacement Lineage Graph
                </h4>
                <p className="text-xs text-slate-500">
                  Under statutory mandate, replaced instruments are never overwritten. Historical certificates are preserved immutably.
                </p>
              </div>

              {/* Visual Interactive Node Tree */}
              <div className="flex flex-col lg:flex-row items-center justify-center gap-4 py-6">
                {detail.lineageGraph.nodes.map((node, index) => (
                  <React.Fragment key={node.id}>
                    {/* Node Card */}
                    <div
                      onClick={() => {
                        if (!node.isCurrent) {
                          setSelectedFdrId(node.id);
                        }
                      }}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer max-w-xs w-full shadow-md ${
                        node.isCurrent
                          ? "border-teal-600 bg-teal-50/40 dark:bg-teal-950/20 ring-4 ring-teal-600/10"
                          : node.isPredecessor
                          ? "border-amber-400 bg-amber-50/30 dark:bg-amber-950/10 opacity-80 hover:opacity-100"
                          : "border-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/10 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
                            node.isCurrent
                              ? "bg-teal-700 text-white"
                              : node.isPredecessor
                              ? "bg-amber-600 text-white"
                              : "bg-indigo-600 text-white"
                          }`}
                        >
                          {node.isCurrent
                            ? "ACTIVE INSTRUMENT"
                            : node.isPredecessor
                            ? "PREDECESSOR (SUPERSEDED)"
                            : "REPLACEMENT SUCCESSOR"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {node.tenureDates}
                        </span>
                      </div>

                      <h5 className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 mt-2">
                        {node.fdrNumber}
                      </h5>

                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {node.bankName}
                      </p>

                      <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 text-xs font-mono">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {formatCurrency(node.amount)}
                        </span>
                        <span className="text-slate-500 text-[10px]">
                          {node.administrativeState}
                        </span>
                      </div>

                      {!node.isCurrent && (
                        <span className="text-[10px] text-teal-600 font-bold block text-center mt-2 hover:underline">
                          Inspect Node Dossier →
                        </span>
                      )}
                    </div>

                    {/* Connecting Directed Arrow */}
                    {index < detail.lineageGraph.nodes.length - 1 && (
                      <div className="flex flex-col items-center justify-center text-slate-400 font-mono text-xs">
                        <span className="text-lg hidden lg:block">➔</span>
                        <span className="text-lg block lg:hidden">↓</span>
                        <span className="text-[9px] text-center font-bold text-teal-600 uppercase">
                          Superseded By
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {detail.lineageGraph.nodes.length === 1 && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center font-mono">
                  This instrument represents an original statutory pledge without prior historical predecessor replacements.
                </div>
              )}
            </div>
          )}

          {/* 6. TAB CONTENT: LINKED DOCUMENTS */}
          {activeTab === "documents" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Secure Vault Documents ({detail.documents.length})
                </h4>
                <button
                  type="button"
                  onClick={() => onOpenUploadModal(selectedFdrId)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 cursor-pointer"
                >
                  + Add Document
                </button>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {detail.documents.map((doc) => (
                  <div key={doc.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {doc.fileName}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {doc.documentType.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        SHA-256: {doc.sha256Checksum || "N/A"} • Size: {(doc.fileSizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-teal-600 font-bold">
                        {doc.isVerified ? "✓ Verified" : "Pending Review"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7. TAB CONTENT: OUTSTANDING OBLIGATIONS */}
          {activeTab === "obligations" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Regulatory Compliance Checklist & Outstanding Obligations
                </h4>
                <p className="text-xs text-slate-500">
                  Deficiencies that block release petitions or encashment clearances
                </p>
              </div>

              {detail.outstandingObligations.length === 0 ? (
                <div className="p-8 text-center text-teal-600 font-mono text-xs">
                  <span className="text-3xl block mb-2">✓</span>
                  All statutory obligations, bank liens, and forensic checks are fully satisfied.
                </div>
              ) : (
                <div className="space-y-3">
                  {detail.outstandingObligations.map((obl) => (
                    <div
                      key={obl.id}
                      className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                        obl.severity === "CRITICAL"
                          ? "border-rose-300 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20"
                          : "border-amber-300 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              obl.severity === "CRITICAL"
                                ? "bg-rose-600 text-white"
                                : "bg-amber-600 text-white"
                            }`}
                          >
                            {obl.severity}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {obl.title}
                          </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">{obl.description}</p>
                        <p className="text-teal-700 dark:text-teal-400 font-mono text-[11px] font-bold">
                          Required Action: {obl.actionRequired}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenWorkbench(selectedFdrId)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                      >
                        Workbench →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
