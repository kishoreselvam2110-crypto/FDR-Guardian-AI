"use client";

import React from "react";
import Link from "next/link";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AlertItem {
  id: string;
  level: "critical" | "warning" | "info";
  title: string;
  description: string;
  timestamp: string;
  href: string;
}

const REGULATORY_NOTIFICATIONS: AlertItem[] = [
  {
    id: "notif-1",
    level: "critical",
    title: "Maturity Breach Warning (₹35 Lakhs)",
    description: "Apex Institute FDR-2024-SBI-8821 enters critical 14-day expiry window without renewal confirmation.",
    timestamp: "12m ago",
    href: "/fdr?tab=maturity",
  },
  {
    id: "notif-2",
    level: "warning",
    title: "Bank Lien Confirmation Required",
    description: "HDFC Bank Branch #1042 lien confirmation letter pending for Bharat College (FDR-2025-HDFC-9932).",
    timestamp: "1h ago",
    href: "/fdr?tab=trust-guard",
  },
  {
    id: "notif-3",
    level: "info",
    title: "Security Deposit Release Petition",
    description: "National Academy submitted refund dossier following completion of 8-year statutory tenure.",
    timestamp: "3h ago",
    href: "/fdr?tab=releases",
  },
  {
    id: "notif-4",
    level: "critical",
    title: "Statutory Deficit Alert",
    description: "Engineering program total deposit is ₹25L vs mandatory statutory norm of ₹35L.",
    timestamp: "5h ago",
    href: "/fdr?tab=alerts",
  },
];

export function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Regulatory Alerts & Feeds
            </h3>
            <p className="text-[11px] text-slate-500">Live operational events and maturity escalations</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm p-1"
            aria-label="Close notifications"
          >
            ✕
          </button>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-2">
          {REGULATORY_NOTIFICATIONS.map((item) => {
            let badgeClass = "bg-slate-100 text-slate-700";
            let indicatorColor = "bg-slate-500";

            if (item.level === "critical") {
              badgeClass = "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300";
              indicatorColor = "bg-rose-600";
            } else if (item.level === "warning") {
              badgeClass = "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300";
              indicatorColor = "bg-amber-500";
            } else if (item.level === "info") {
              badgeClass = "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300";
              indicatorColor = "bg-teal-600";
            }

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                className="p-3.5 flex items-start gap-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors block"
              >
                <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${indicatorColor}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider font-mono ${badgeClass}`}>
                      {item.level}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{item.timestamp}</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-center">
          <Link
            href="/fdr?tab=alerts"
            onClick={onClose}
            className="text-xs font-bold text-teal-700 dark:text-teal-400 hover:underline"
          >
            Open Full Escalations Register →
          </Link>
        </div>
      </div>
    </div>
  );
}
