"use client";

import React, { useState, useMemo } from "react";
import type {
  FdrInstrumentDto,
  MaturityHorizonFilter,
  MaturityFollowUpTask,
} from "@/lib/fdr/types";
import { evaluateMaturityFollowUpTasks } from "@/lib/fdr/lifecycleService";

interface MaturityRadarViewProps {
  instruments: FdrInstrumentDto[];
  onSelectInstrument: (fdrId: string) => void;
  onOpenWorkbench: (fdrId: string) => void;
  onOpenRenewalModal: (instrument: FdrInstrumentDto) => void;
  onAssignReviewer: (fdrId: string) => void;
  showToast: (toast: {
    title: string;
    message: string;
    type: "success" | "info" | "warning" | "error";
  }) => void;
}

export function MaturityRadarView({
  instruments,
  onSelectInstrument,
  onOpenWorkbench,
  onOpenRenewalModal,
  onAssignReviewer,
  showToast,
}: MaturityRadarViewProps) {
  // Filters
  const [institutionFilter, setInstitutionFilter] = useState<string>("ALL");
  const [horizonFilter, setHorizonFilter] = useState<MaturityHorizonFilter>("ALL");
  const [adminStatusFilter, setAdminStatusFilter] = useState<string>("ALL");
  const [verificationFilter, setVerificationFilter] = useState<string>("ALL");
  const [assignmentFilter, setAssignmentFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 8;

  // Active follow-up tasks evaluated from real instruments
  const followUpTasks = useMemo(() => {
    return evaluateMaturityFollowUpTasks(instruments);
  }, [instruments]);

  // Unique institutions list for dropdown
  const uniqueInstitutions = useMemo(() => {
    const map = new Map<string, string>();
    for (const inst of instruments) {
      map.set(inst.institutionId, inst.institutionName);
    }
    return Array.from(map.entries());
  }, [instruments]);

  // Filtered instruments
  const filteredInstruments = useMemo(() => {
    return instruments.filter((inst) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          inst.fdrNumber.toLowerCase().includes(q) ||
          inst.institutionName.toLowerCase().includes(q) ||
          inst.bankName.toLowerCase().includes(q) ||
          inst.ifscCode.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // 2. Institution Filter
      if (institutionFilter !== "ALL" && inst.institutionId !== institutionFilter) {
        return false;
      }

      // 3. Maturity Horizon
      if (horizonFilter === "EXPIRED" && inst.daysToMaturity > 0) return false;
      if (horizonFilter === "CRITICAL_30D" && (inst.daysToMaturity <= 0 || inst.daysToMaturity > 30)) return false;
      if (horizonFilter === "WARNING_60D" && (inst.daysToMaturity <= 30 || inst.daysToMaturity > 60)) return false;
      if (horizonFilter === "HORIZON_90D" && (inst.daysToMaturity <= 60 || inst.daysToMaturity > 90)) return false;
      if (horizonFilter === "HEALTHY_ABOVE_90D" && inst.daysToMaturity <= 90) return false;

      // 4. Administrative Status
      if (adminStatusFilter !== "ALL" && inst.administrativeState !== adminStatusFilter) {
        return false;
      }

      // 5. Verification Status
      if (verificationFilter !== "ALL" && inst.verificationState !== verificationFilter) {
        return false;
      }

      // 6. Assignment Filter
      if (assignmentFilter === "UNASSIGNED") {
        const task = followUpTasks.find((t) => t.fdrId === inst.id);
        if (task && task.assignedOfficer) return false;
      } else if (assignmentFilter === "ASSIGNED") {
        const task = followUpTasks.find((t) => t.fdrId === inst.id);
        if (!task || !task.assignedOfficer) return false;
      }

      return true;
    });
  }, [
    instruments,
    searchQuery,
    institutionFilter,
    horizonFilter,
    adminStatusFilter,
    verificationFilter,
    assignmentFilter,
    followUpTasks,
  ]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredInstruments.length / pageSize));
  const paginatedInstruments = filteredInstruments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Formatters
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

  const scrollToTable = () => {
    document.getElementById("maturity-table-anchor")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      {/* 1. OPERATIONAL KPI METRIC TILES - INTERACTIVE HORIZON SELECTORS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => {
            setHorizonFilter(horizonFilter === "EXPIRED" ? "ALL" : "EXPIRED");
            setCurrentPage(1);
            scrollToTable();
          }}
          className={`p-3.5 rounded-xl border text-left transition-all motion-reduce:transition-none cursor-pointer ${
            horizonFilter === "EXPIRED"
              ? "border-rose-500 ring-2 ring-rose-500 bg-rose-100/80 dark:bg-rose-950/60 shadow-sm"
              : "border-rose-300 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20 hover:border-rose-400"
          }`}
        >
          <span className="text-[10px] font-mono font-bold text-rose-700 dark:text-rose-300 block uppercase">
            Matured / Expired
          </span>
          <span className="text-2xl font-black text-rose-800 dark:text-rose-100 font-mono tabular-nums mt-0.5 block">
            {instruments.filter((i) => i.daysToMaturity <= 0).length}
          </span>
          <span className="text-[10px] text-rose-600 dark:text-rose-400">Lock-in broken</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setHorizonFilter(horizonFilter === "CRITICAL_30D" ? "ALL" : "CRITICAL_30D");
            setCurrentPage(1);
            scrollToTable();
          }}
          className={`p-3.5 rounded-xl border text-left transition-all motion-reduce:transition-none cursor-pointer ${
            horizonFilter === "CRITICAL_30D"
              ? "border-amber-500 ring-2 ring-amber-500 bg-amber-100/80 dark:bg-amber-950/60 shadow-sm"
              : "border-amber-300 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 hover:border-amber-400"
          }`}
        >
          <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-300 block uppercase">
            Critical (&lt; 30 Days)
          </span>
          <span className="text-2xl font-black text-amber-800 dark:text-amber-100 font-mono tabular-nums mt-0.5 block">
            {instruments.filter((i) => i.daysToMaturity > 0 && i.daysToMaturity <= 30).length}
          </span>
          <span className="text-[10px] text-amber-600 dark:text-amber-400">Notice dispatched</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setHorizonFilter(horizonFilter === "WARNING_60D" ? "ALL" : "WARNING_60D");
            setCurrentPage(1);
            scrollToTable();
          }}
          className={`p-3.5 rounded-xl border text-left transition-all motion-reduce:transition-none cursor-pointer ${
            horizonFilter === "WARNING_60D"
              ? "border-teal-500 ring-2 ring-teal-500 bg-teal-100/80 dark:bg-teal-950/60 shadow-sm"
              : "border-teal-300 dark:border-teal-900 bg-teal-50/60 dark:bg-teal-950/20 hover:border-teal-400"
          }`}
        >
          <span className="text-[10px] font-mono font-bold text-teal-700 dark:text-teal-300 block uppercase">
            Warning (30 - 60D)
          </span>
          <span className="text-2xl font-black text-teal-800 dark:text-teal-100 font-mono tabular-nums mt-0.5 block">
            {instruments.filter((i) => i.daysToMaturity > 30 && i.daysToMaturity <= 60).length}
          </span>
          <span className="text-[10px] text-teal-600 dark:text-teal-400">Early monitoring</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setHorizonFilter(horizonFilter === "HORIZON_90D" ? "ALL" : "HORIZON_90D");
            setCurrentPage(1);
            scrollToTable();
          }}
          className={`p-3.5 rounded-xl border text-left transition-all motion-reduce:transition-none cursor-pointer ${
            horizonFilter === "HORIZON_90D"
              ? "border-indigo-500 ring-2 ring-indigo-500 bg-indigo-100/80 dark:bg-indigo-950/60 shadow-sm"
              : "border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 hover:border-indigo-400"
          }`}
        >
          <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300 block uppercase">
            Horizon (60 - 90D)
          </span>
          <span className="text-2xl font-black text-indigo-800 dark:text-indigo-100 font-mono tabular-nums mt-0.5 block">
            {instruments.filter((i) => i.daysToMaturity > 60 && i.daysToMaturity <= 90).length}
          </span>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400">Planning stage</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAssignmentFilter(assignmentFilter === "UNASSIGNED" ? "ALL" : "UNASSIGNED");
            setCurrentPage(1);
            scrollToTable();
          }}
          className={`p-3.5 rounded-xl border text-left transition-all motion-reduce:transition-none cursor-pointer ${
            assignmentFilter === "UNASSIGNED"
              ? "border-amber-500 ring-2 ring-amber-500 bg-amber-100/80 dark:bg-amber-950/60 shadow-sm"
              : "border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10 hover:border-amber-400"
          }`}
        >
          <span className="text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300 block uppercase">
            Missing Renewal
          </span>
          <span className="text-2xl font-black text-amber-900 dark:text-amber-200 font-mono tabular-nums mt-0.5 block">
            {followUpTasks.filter((t) => t.missingRenewalEvidence).length}
          </span>
          <span className="text-[10px] text-amber-600 dark:text-amber-400">Evidence pending</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAssignmentFilter(assignmentFilter === "ASSIGNED" ? "ALL" : "ASSIGNED");
            setCurrentPage(1);
            scrollToTable();
          }}
          className={`p-3.5 rounded-xl border text-left transition-all motion-reduce:transition-none cursor-pointer ${
            assignmentFilter === "ASSIGNED"
              ? "border-slate-500 ring-2 ring-slate-500 bg-slate-200 dark:bg-slate-800 shadow-sm"
              : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-slate-400"
          }`}
        >
          <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 block uppercase">
            Overdue Follow-ups
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-50 font-mono tabular-nums mt-0.5 block">
            {followUpTasks.length}
          </span>
          <span className="text-[10px] text-slate-500">Active queue items</span>
        </button>
      </div>

      {/* 2. OVERDUE FOLLOW-UP TASKS DESK */}
      {followUpTasks.length > 0 && (
        <div className="p-4 rounded-2xl border border-amber-300/80 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/10 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-600" />
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-amber-900 dark:text-amber-200">
                Statutory Maturity Follow-Up Queue ({followUpTasks.length} Active Tasks)
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              Prioritized by urgency & remaining lock-in tenure
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {followUpTasks.slice(0, 3).map((task) => (
              <div
                key={task.id}
                className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 shadow-2xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                    {task.fdrNumber}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      task.priority === "HIGH"
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    {task.daysToMaturity <= 0 ? "MATURED" : `${task.daysToMaturity}d left`}
                  </span>
                </div>

                <div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate">
                    {task.institutionName}
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    {task.recommendedAction}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                  <span className="text-slate-500 font-mono">
                    {task.assignedOfficer ? `👤 ${task.assignedOfficer.split(" ")[0]}` : "Unassigned"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectInstrument(task.fdrId)}
                      className="px-2 py-0.5 font-bold rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Detail
                    </button>
                    <button
                      type="button"
                      onClick={() => onAssignReviewer(task.fdrId)}
                      className="px-2 py-0.5 font-bold rounded bg-teal-50 hover:bg-teal-100 dark:bg-teal-950 dark:hover:bg-teal-900 text-teal-800 dark:text-teal-300 cursor-pointer"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. MULTI-FACETED FILTER CONTROLS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search reference, institution, bank, or IFSC..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Institution Filter */}
            <select
              value={institutionFilter}
              onChange={(e) => {
                setInstitutionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            >
              <option value="ALL">All Institutions</option>
              {uniqueInstitutions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name.length > 30 ? name.substring(0, 30) + "..." : name}
                </option>
              ))}
            </select>

            {/* Maturity Horizon Filter */}
            <select
              value={horizonFilter}
              onChange={(e) => {
                setHorizonFilter(e.target.value as MaturityHorizonFilter);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            >
              <option value="ALL">All Horizons</option>
              <option value="EXPIRED">Already Matured / Expired (&lt;= 0d)</option>
              <option value="CRITICAL_30D">Critical (&lt; 30 Days)</option>
              <option value="WARNING_60D">Warning (30 - 60 Days)</option>
              <option value="HORIZON_90D">Horizon (60 - 90 Days)</option>
              <option value="HEALTHY_ABOVE_90D">Healthy (&gt; 90 Days)</option>
            </select>

            {/* Administrative Status */}
            <select
              value={adminStatusFilter}
              onChange={(e) => {
                setAdminStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            >
              <option value="ALL">All Admin States</option>
              <option value="PLEDGED_ACTIVE">Pledged Active</option>
              <option value="MATURED_PENDING_ACTION">Matured (Action Pending)</option>
              <option value="RENEWED">Renewed</option>
              <option value="RELEASE_PENDING">Release Pending</option>
              <option value="RELEASED">Released</option>
            </select>

            {/* Verification Status */}
            <select
              value={verificationFilter}
              onChange={(e) => {
                setVerificationFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            >
              <option value="ALL">All Verification States</option>
              <option value="VERIFIED">Verified</option>
              <option value="PENDING">Pending</option>
              <option value="DEFICIENT">Deficient</option>
              <option value="REJECTED">Rejected</option>
            </select>

            {/* Assignment Filter */}
            <select
              value={assignmentFilter}
              onChange={(e) => {
                setAssignmentFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            >
              <option value="ALL">All Assignments</option>
              <option value="ASSIGNED">Assigned Reviewer</option>
              <option value="UNASSIGNED">Unassigned</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. MASTER RADAR TABLE WITH ACCESSIBLE PAGINATION */}
      <div id="maturity-table-anchor" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs scroll-mt-6 transition-all duration-200 motion-reduce:transition-none">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Maturity Radar & Early-Warning Register
            </h2>
            <p className="text-xs text-slate-500">
              Showing {filteredInstruments.length} matched security deposit instrument{filteredInstruments.length === 1 ? "" : "s"}
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400">
            Real-time Radar Sync Active
          </span>
        </div>

        {filteredInstruments.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-mono text-xs">
            <span className="text-3xl block mb-2">🔍</span>
            No instruments match the selected filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-3 pl-4">Instrument Reference</th>
                  <th className="p-3">Institution & Bank</th>
                  <th className="p-3">Deposit Amount</th>
                  <th className="p-3">Maturity Date</th>
                  <th className="p-3">Remaining Horizon</th>
                  <th className="p-3">Lien & Renewal</th>
                  <th className="p-3">Reviewer</th>
                  <th className="p-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedInstruments.map((inst) => {
                  const task = followUpTasks.find((t) => t.fdrId === inst.id);
                  const isExpired = inst.daysToMaturity <= 0;
                  const isCritical = inst.daysToMaturity > 0 && inst.daysToMaturity <= 30;
                  const isWarning = inst.daysToMaturity > 30 && inst.daysToMaturity <= 60;

                  return (
                    <tr
                      key={inst.id}
                      onClick={() => onSelectInstrument(inst.id)}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="p-3 pl-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {inst.fdrNumber}
                        {inst.predecessorId && (
                          <span className="block text-[9px] text-amber-600 font-mono mt-0.5">
                            ↳ Replaced Predecessor
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 max-w-xs truncate">
                          {inst.institutionName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {inst.bankName} • {inst.ifscCode}
                        </div>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(inst.amount)}
                      </td>
                      <td className="p-3 font-mono text-slate-700 dark:text-slate-300">
                        {formatDate(inst.maturityDate)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isExpired
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              : isCritical
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : isWarning
                              ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {isExpired
                            ? `Overdue (${Math.abs(inst.daysToMaturity)}d)`
                            : `${inst.daysToMaturity} Days`}
                        </span>
                      </td>
                      <td className="p-3 text-[11px]">
                        <span
                          className={`font-semibold block ${
                            inst.isLienMarked ? "text-teal-600" : "text-rose-600"
                          }`}
                        >
                          {inst.isLienMarked ? "✓ Lien Marked" : "⚠ Lien Missing"}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {inst.renewalState === "RENEWAL_REQUESTED"
                            ? "Renewal Petition In Review"
                            : inst.renewalState}
                        </span>
                      </td>
                      <td className="p-3 text-[11px] text-slate-600 dark:text-slate-400">
                        {task?.assignedOfficer ? (
                          <span className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                            {task.assignedOfficer}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td
                        className="p-3 pr-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectInstrument(inst.id)}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950 dark:hover:bg-teal-900 text-teal-800 dark:text-teal-300 cursor-pointer"
                            title="Open in Instrument Lifecycle Explorer"
                          >
                            Lifecycle 🔍
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenWorkbench(inst.id)}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                            title="Open Evidence Discrepancy Workbench"
                          >
                            Workbench 🔬
                          </button>

                          {(isExpired || isCritical) &&
                            inst.renewalState !== "RENEWAL_REQUESTED" && (
                              <button
                                type="button"
                                onClick={() => onOpenRenewalModal(inst)}
                                className="px-2 py-1 text-[11px] font-bold rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-300 cursor-pointer"
                              >
                                Renew
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. ACCESSIBLE PAGINATION */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {currentPage} of {totalPages} ({filteredInstruments.length} total)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
