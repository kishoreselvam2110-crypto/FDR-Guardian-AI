"use client";

import React, { useState } from "react";
import type { FdrSyncState } from "@/lib/fdr/types";

interface SyncStatusIndicatorProps {
  syncState: FdrSyncState;
  lastSyncTime: Date | null;
  lastSuccessfulSyncTime: Date | null;
  intervalSeconds?: number;
  isPaused?: boolean;
  isSyncing?: boolean;
  onRefresh: () => void;
  error?: string | null;
}

export function SyncStatusIndicator({
  syncState,
  lastSyncTime,
  lastSuccessfulSyncTime,
  intervalSeconds = 30,
  isPaused = false,
  isSyncing = false,
  onRefresh,
  error,
}: SyncStatusIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const getStatusBadge = () => {
    switch (syncState) {
      case "SYNCING":
        return {
          label: "Syncing...",
          sublabel: "Querying banking nodes",
          pillClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800",
          dotClass: "bg-cyan-500 animate-spin",
          icon: "↻",
        };
      case "UPDATED":
        return {
          label: "Updated",
          sublabel: "Latest snapshot confirmed",
          pillClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 ring-1 ring-emerald-400/50",
          dotClass: "bg-emerald-500 ring-2 ring-emerald-400 ring-offset-1 motion-reduce:ring-0",
          icon: "✓",
        };
      case "STALE":
        return {
          label: "Stale Data",
          sublabel: `Last sync > ${intervalSeconds + 15}s ago`,
          pillClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800",
          dotClass: "bg-amber-500",
          icon: "⚠",
        };
      case "OFFLINE":
        return {
          label: "Offline",
          sublabel: "Gateway node unreachable",
          pillClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
          dotClass: "bg-rose-500",
          icon: "✕",
        };
      case "LIVE":
      default:
        return {
          label: isPaused ? "Paused (Tab Hidden)" : "Live Sync",
          sublabel: `${intervalSeconds}s controlled polling`,
          pillClass: isPaused
            ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700"
            : "bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800",
          dotClass: isPaused ? "bg-slate-400" : "bg-teal-500",
          icon: "●",
        };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="relative inline-flex items-center gap-2">
      {/* Synchronization State Pill */}
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div
          role="status"
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold cursor-help transition-all ${badge.pillClass}`}
        >
          <span className={`h-2 w-2 rounded-full ${badge.dotClass}`} />
          <span>{badge.label}</span>
          <span className="text-[10px] font-normal opacity-75 hidden sm:inline">
            ({intervalSeconds}s)
          </span>
        </div>

        {/* Hover Disclosure Tooltip */}
        {showTooltip && (
          <div className="absolute right-0 top-full mt-2 w-80 p-3 rounded-xl bg-slate-900 text-white text-xs shadow-xl z-50 border border-slate-700 font-sans space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-mono text-[11px]">
              <span className="font-bold text-teal-400">TELEMETRY SYNC STATUS</span>
              <span className="text-slate-400">STATE: {syncState}</span>
            </div>

            <p className="text-slate-300 text-[11px] leading-relaxed">
              <strong>Mechanism:</strong> Controlled polling via protected Next.js Route Handler (<code>/api/fdr/sync</code>). Refreshes every {intervalSeconds} seconds.
            </p>

            <div className="space-y-1 font-mono text-[10px] text-slate-400 border-t border-slate-800 pt-1.5">
              <p>
                <strong>Last Gateway Sync:</strong>{" "}
                {lastSyncTime ? lastSyncTime.toLocaleTimeString("en-IN") : "Pending"}
              </p>
              <p>
                <strong>Last Valid Data:</strong>{" "}
                {lastSuccessfulSyncTime
                  ? lastSuccessfulSyncTime.toLocaleTimeString("en-IN")
                  : "Pending"}
              </p>
              <p>
                <strong>Tab Status:</strong>{" "}
                {isPaused ? "Paused (Page hidden to conserve bandwidth)" : "Active & Polling"}
              </p>
              {error && (
                <p className="text-rose-400 font-sans text-[11px] mt-1">
                  <strong>Error:</strong> {error}
                </p>
              )}
            </div>

            <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-1">
              * Does not claim sub-second updates; uses controlled HTTP polling with in-flight request locking.
            </div>
          </div>
        )}
      </div>

      {/* Manual Refresh Button */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={isSyncing}
        title="Trigger immediate manual synchronization"
        className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
          isSyncing
            ? "border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:border-slate-700"
            : syncState === "OFFLINE"
            ? "border-rose-400 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
        }`}
      >
        <span className={isSyncing ? "animate-spin inline-block" : ""}>↻</span>
        <span className="hidden sm:inline">
          {isSyncing ? "Syncing..." : syncState === "OFFLINE" ? "Retry Sync" : "Sync Now"}
        </span>
      </button>
    </div>
  );
}
