"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FDR_NAVIGATION_ITEMS, NavItem } from "@/lib/navigation";

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  currentRole: string;
  onRoleChange: (role: string) => void;
}

export const REGULATORY_ROLES = [
  "Regulatory Scrutiny Officer",
  "AICTE Regional Director",
  "Finance & Bank Liaison Desk",
  "Institution Nodal Officer",
  "Central Audit Inspector",
];

export function Sidebar({
  isOpen,
  onClose,
  currentRole,
  onRoleChange,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "overview";
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  // Group items by section
  const operations = FDR_NAVIGATION_ITEMS.filter((i) => i.section === "operations");
  const compliance = FDR_NAVIGATION_ITEMS.filter((i) => i.section === "compliance");
  const governance = FDR_NAVIGATION_ITEMS.filter((i) => i.section === "governance");

  const isNavActive = (item: NavItem) => {
    if (pathname === "/fdr") {
      if (item.href === "/fdr" && !searchParams.get("tab")) return true;
      const itemTab = item.href.includes("?tab=") ? item.href.split("?tab=")[1] : "";
      return currentTab === itemTab;
    }
    return pathname === item.href;
  };

  const renderNavGroup = (title: string, items: NavItem[]) => (
    <div className="space-y-1">
      <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
        {title}
      </p>
      {items.map((item) => {
        const active = isNavActive(item);
        let badgeStyle = "bg-slate-800 text-slate-300";
        if (item.badgeVariant === "teal") badgeStyle = "bg-teal-950 text-teal-300 border border-teal-800/60";
        if (item.badgeVariant === "amber") badgeStyle = "bg-amber-950 text-amber-300 border border-amber-800/60";
        if (item.badgeVariant === "rose") badgeStyle = "bg-rose-950 text-rose-300 border border-rose-800/60";

        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onClose}
            className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all duration-150 ${
              active
                ? "bg-slate-800/80 text-white font-semibold border-l-2 border-teal-400 pl-2.5"
                : "text-slate-300 hover:bg-slate-800/40 hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 transition-colors ${
                  active ? "bg-teal-400" : "bg-slate-600 group-hover:bg-slate-400"
                }`}
                aria-hidden="true"
              />
              <span className="truncate">{item.name}</span>
            </div>

            {item.badge && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${badgeStyle}`}>
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-[#071324] border-r border-slate-800/90 text-slate-200 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/90 bg-[#06101f]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-black text-sm shadow-sm ring-1 ring-teal-400/30">
                FD
              </div>
              <div>
                <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                  <span>FDR Guardian AI</span>
                </h1>
                <p className="text-[10px] text-teal-400 font-medium">
                  Security Deposit Intelligence
                </p>
              </div>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="lg:hidden text-slate-400 hover:text-white p-1 text-sm"
                aria-label="Close navigation"
              >
                ✕
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between px-2 py-1 rounded bg-slate-900/80 border border-slate-800 text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>CONTROL ROOM</span>
            </span>
            <span className="text-teal-400 font-bold">NODE 01</span>
          </div>
        </div>

        {/* Navigation Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          {renderNavGroup("Core Operations", operations)}
          {renderNavGroup("Compliance & Queues", compliance)}
          {renderNavGroup("Trust & Governance", governance)}

          {/* Cross-Link to Preserved Modules */}
          <div className="pt-2 border-t border-slate-800/80 space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              Institutional Affiliation Suite
            </p>
            <Link
              href="/"
              onClick={onClose}
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/50 ${
                pathname === "/" ? "bg-slate-800 text-white font-semibold" : ""
              }`}
            >
              <span>Applicant Affiliation Wizard</span>
              <span className="text-[10px] font-mono text-slate-500">/</span>
            </Link>
            <Link
              href="/admin/dashboard"
              onClick={onClose}
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/50 ${
                pathname === "/admin/dashboard" ? "bg-slate-800 text-white font-semibold" : ""
              }`}
            >
              <span>Scrutiny Inspection Console</span>
              <span className="text-[10px] font-mono text-slate-500">/admin</span>
            </Link>
          </div>
        </div>

        {/* User Profile & Role Selector */}
        <div className="p-3 border-t border-slate-800/90 bg-[#06101f]">
          <div
            onClick={() => setRoleModalOpen(true)}
            className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center font-bold text-xs shrink-0">
                SO
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">Dr. R. Ramanathan</p>
                <p className="text-[10px] text-teal-400 truncate font-mono">{currentRole}</p>
              </div>
            </div>
            <span className="text-slate-500 text-xs">↕</span>
          </div>
        </div>
      </aside>

      {/* Role Switcher Dialog */}
      {roleModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setRoleModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Switch Regulatory Operational Role
              </h3>
              <p className="text-[11px] text-slate-500">
                Select your authorization profile to simulate role permissions
              </p>
            </div>

            <div className="space-y-1.5">
              {REGULATORY_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    onRoleChange(role);
                    setRoleModalOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${
                    currentRole === role
                      ? "bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 font-bold border border-teal-200 dark:border-teal-800"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <span>{role}</span>
                  {currentRole === role && <span className="text-teal-600">✓</span>}
                </button>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="text-xs px-3 py-1 text-slate-500 hover:text-slate-700 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
