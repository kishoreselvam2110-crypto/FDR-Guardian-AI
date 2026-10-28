"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FDR_NAVIGATION_ITEMS } from "@/lib/navigation";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { NotificationDrawer } from "./NotificationDrawer";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";

interface TopHeaderProps {
  onToggleSidebar: () => void;
  currentRole: string;
}

export function TopHeader({ onToggleSidebar, currentRole }: TopHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState("Just now");

  // Keyboard shortcut listener for Ctrl+K, /, and ?
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInput = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (!isInput && e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (!isInput && (e.key === "?" || (e.shiftKey && e.key === "?"))) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncTime("Just now");
    }, 1200);
  };

  // Determine current breadcrumb
  const currentTab = searchParams.get("tab");
  let currentPageTitle = "Command Center";
  if (pathname === "/admin/dashboard") {
    currentPageTitle = "Affiliation Scrutiny Console";
  } else if (pathname === "/") {
    currentPageTitle = "Applicant Affiliation Portal";
  } else if (currentTab) {
    const matched = FDR_NAVIGATION_ITEMS.find((item) => item.href.includes(`?tab=${currentTab}`));
    if (matched) currentPageTitle = matched.name;
  }

  return (
    <>
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 shadow-2xs">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Left: Mobile hamburger & Breadcrumbs */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onToggleSidebar}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Toggle navigation menu"
            >
              ☰
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
              <Link
                href="/fdr"
                className="hover:text-slate-900 dark:hover:text-slate-100 font-semibold truncate"
              >
                FDR Guardian AI
              </Link>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="text-slate-800 dark:text-slate-200 font-bold truncate">
                {currentPageTitle}
              </span>
            </nav>
          </div>

          {/* Right: Sync Status, Search, Notifications, Role Badge */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Live Gateway Sync Indicator */}
            <button
              type="button"
              onClick={handleManualSync}
              title="Click to manually refresh synchronization"
              className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-400 hover:border-slate-300 transition-colors"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isSyncing ? "bg-cyan-500 animate-spin" : "bg-emerald-500"
                }`}
              />
              <span className="font-mono">
                {isSyncing ? "Syncing..." : `Bank Gateway • ${lastSyncTime}`}
              </span>
            </button>

            {/* Global Search Button */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              <span>🔍</span>
              <span className="hidden sm:inline">Search...</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white dark:bg-slate-900 border rounded">
                ⌘K
              </kbd>
            </button>

            {/* Keyboard Shortcuts Button */}
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              title="Keyboard Shortcuts (?)"
              aria-label="View keyboard shortcuts"
              className="hidden sm:flex items-center justify-center p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
            >
              <span className="text-xs font-mono font-bold">⌨ ?</span>
            </button>

            {/* Notifications Bell */}
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              aria-label="View notifications"
            >
              <span className="text-sm">🔔</span>
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
            </button>

            {/* Current Role Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/80 text-[11px] font-mono font-bold text-teal-800 dark:text-teal-300">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              <span className="truncate max-w-[150px]">{currentRole}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Global Search Dialog Modal */}
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Keyboard Shortcuts Dialog Modal */}
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Notifications Drawer */}
      <NotificationDrawer isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  );
}
