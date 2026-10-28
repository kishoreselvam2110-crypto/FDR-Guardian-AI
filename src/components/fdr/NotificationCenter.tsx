"use client";

import React, { useState } from "react";
import type { AlertDto } from "@/lib/fdr/types";

interface NotificationCenterProps {
  alerts: AlertDto[];
  onResolveAlert: (alertId: string) => Promise<boolean>;
  onResolveAll: () => Promise<boolean>;
  onSelectInstrument?: (fdrNumber: string) => void;
}

export function NotificationCenter({
  alerts,
  onResolveAlert,
  onResolveAll,
  onSelectInstrument,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "CRITICAL" | "WARNING">("ALL");
  const [isResolving, setIsResolving] = useState<string | null>(null);

  const unreadCount = alerts.filter((a) => !a.isResolved).length;
  const criticalCount = alerts.filter((a) => !a.isResolved && a.severity === "CRITICAL").length;

  const filteredAlerts = alerts
    .filter((a) => !a.isResolved)
    .filter((a) => {
      if (filter === "CRITICAL") return a.severity === "CRITICAL";
      if (filter === "WARNING") return a.severity === "WARNING";
      return true;
    });

  const handleResolve = async (alertId: string) => {
    setIsResolving(alertId);
    try {
      await onResolveAlert(alertId);
    } finally {
      setIsResolving(null);
    }
  };

  return (
    <div className="relative">
      {/* Notification Bell Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Regulatory Notifications (${unreadCount} unread)`}
        className="relative p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center cursor-pointer"
      >
        <span className="text-sm">🔔</span>
        {unreadCount > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold font-mono text-white flex items-center justify-center shadow-xs transition-transform duration-200 motion-reduce:transition-none ${
              criticalCount > 0 ? "bg-rose-600" : "bg-amber-600"
            }`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel Modal / Slide-over */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-2xs"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 top-full mt-2 w-96 max-w-[92vw] max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Statutory Alerts Desk
                  </h3>
                  {criticalCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
                      {criticalCount} Critical
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Persistent compliance alerts with deduplication
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none p-1 cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Filter Tabs & Bulk Actions */}
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40 text-xs">
              <div className="flex items-center gap-1 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setFilter("ALL")}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    filter === "ALL"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  All ({unreadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("CRITICAL")}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    filter === "CRITICAL"
                      ? "bg-rose-600 text-white font-bold"
                      : "text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50"
                  }`}
                >
                  Critical ({criticalCount})
                </button>
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => onResolveAll()}
                  className="text-[11px] font-bold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  Resolve All
                </button>
              )}
            </div>

            {/* Alert List */}
            <div className="overflow-y-auto p-3 space-y-2.5 flex-1 divide-y divide-slate-100 dark:divide-slate-800/50">
              {filteredAlerts.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs font-mono">
                  <span className="text-2xl block mb-1">✓</span>
                  All statutory compliance alerts resolved.
                </div>
              ) : (
                filteredAlerts.map((alert) => (
                  <div key={alert.id} className="pt-2 first:pt-0 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold uppercase ${
                              alert.severity === "CRITICAL"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                : alert.severity === "WARNING"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {alert.severity}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug">
                            {alert.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          {alert.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
                      <span>
                        {alert.fdrNumber ? `Ref: ${alert.fdrNumber}` : alert.institutionName} •{" "}
                        {new Date(alert.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>

                      <div className="flex items-center gap-2">
                        {alert.fdrNumber && onSelectInstrument && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectInstrument(alert.fdrNumber!);
                              setIsOpen(false);
                            }}
                            className="text-teal-600 dark:text-teal-400 font-bold hover:underline cursor-pointer"
                          >
                            Locate →
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleResolve(alert.id)}
                          disabled={isResolving === alert.id}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                        >
                          {isResolving === alert.id ? "Resolving..." : "Mark Resolved"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-center text-[10px] font-mono text-slate-400">
              * Database-backed persistent ledger • Zero duplicate alerts on refresh
            </div>
          </div>
        </>
      )}
    </div>
  );
}
