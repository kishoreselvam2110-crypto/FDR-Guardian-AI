"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { FDR_NAVIGATION_ITEMS } from "@/lib/navigation";

export interface SearchableItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "Navigation" | "Instrument" | "Quick Filter" | "Operation";
  href?: string;
  action?: () => void;
  badge?: string;
  badgeVariant?: "teal" | "amber" | "rose" | "slate";
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  customItems?: SearchableItem[];
}

const DEFAULT_COMMANDS: SearchableItem[] = [
  {
    id: "cmd-nav-overview",
    title: "Master Register & Ledger",
    subtitle: "Active institutional security deposits and regulatory liens",
    category: "Navigation",
    href: "/fdr?tab=overview",
    badge: "Tab 1",
    badgeVariant: "teal",
  },
  {
    id: "cmd-nav-maturity",
    title: "FDR Maturity Radar",
    subtitle: "Predictive maturity horizon tracking and overdue follow-ups",
    category: "Navigation",
    href: "/fdr?tab=maturity",
    badge: "Tab 2",
    badgeVariant: "amber",
  },
  {
    id: "cmd-nav-workbench",
    title: "Forensic Evidence Workbench",
    subtitle: "3-way comparison matrix: Submitted vs OCR vs Bank Verified",
    category: "Navigation",
    href: "/fdr?tab=workbench",
    badge: "Tab 3",
    badgeVariant: "teal",
  },
  {
    id: "cmd-nav-lifecycle",
    title: "Instrument Lifecycle Explorer",
    subtitle: "Non-overwriting predecessor/replacement node graph & chronological timeline",
    category: "Navigation",
    href: "/fdr?tab=lifecycle&fdrId=fdr-synth-102",
    badge: "Tab 4",
    badgeVariant: "slate",
  },
  {
    id: "cmd-nav-releases",
    title: "Release-Readiness Dossier",
    subtitle: "5-criteria statutory checklist and 5-state release workflow",
    category: "Navigation",
    href: "/fdr?tab=releases",
    badge: "Tab 5",
    badgeVariant: "rose",
  },
  {
    id: "cmd-nav-admin",
    title: "Affiliation Scrutiny Console",
    subtitle: "Institutional compliance evaluation and deficiencies register",
    category: "Navigation",
    href: "/admin/dashboard",
    badge: "Admin",
    badgeVariant: "slate",
  },
  {
    id: "cmd-filter-action",
    title: "Filter: Action Required",
    subtitle: "Show instruments with pending liens, open discrepancies, or overdue renewals",
    category: "Quick Filter",
    href: "/fdr?tab=overview&filter=ACTION_REQUIRED",
    badge: "Quick Filter",
    badgeVariant: "amber",
  },
  {
    id: "cmd-filter-duesoon",
    title: "Filter: Maturing Soon (<60D)",
    subtitle: "Show instruments approaching mandatory extension horizon",
    category: "Quick Filter",
    href: "/fdr?tab=overview&filter=MATURING_SOON",
    badge: "Quick Filter",
    badgeVariant: "amber",
  },
  {
    id: "cmd-filter-blocked",
    title: "Filter: Blocked Deposits",
    subtitle: "Show instruments with open discrepancies or missing bank liens",
    category: "Quick Filter",
    href: "/fdr?tab=overview&filter=BLOCKED",
    badge: "Quick Filter",
    badgeVariant: "rose",
  },
  {
    id: "cmd-rec-fdr-102",
    title: "FDR-2023-HDFC-99321 — Bharat College of Research",
    subtitle: "₹25,00,000 • HDFC Bank Ltd • Maturity: Dec 2026",
    category: "Instrument",
    href: "/fdr?tab=lifecycle&fdrId=fdr-synth-102",
    badge: "FDR Record",
    badgeVariant: "teal",
  },
  {
    id: "cmd-rec-fdr-101",
    title: "FDR-2024-SBI-88214 — Apex Institute of Science & Technology",
    subtitle: "₹35,00,000 • State Bank of India • Maturity: Nov 2027",
    category: "Instrument",
    href: "/fdr?tab=overview&query=SBI-88214",
    badge: "FDR Record",
    badgeVariant: "teal",
  },
  {
    id: "cmd-rec-fdr-105",
    title: "FDR-2018-ICICI-11002 — Apex Institute of Technology",
    subtitle: "₹10,00,000 • ICICI Bank Ltd • Release Petition Active",
    category: "Instrument",
    href: "/fdr?tab=releases",
    badge: "Release Petition",
    badgeVariant: "rose",
  },
];

export function GlobalSearchModal({ isOpen, onClose, customItems = [] }: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems = useMemo(() => {
    return [...customItems, ...DEFAULT_COMMANDS];
  }, [customItems]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 10);
    const q = query.toLowerCase();
    return allItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [allItems, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  // Listen for keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          handleExecute(filteredItems[selectedIndex]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex]);

  const handleExecute = (item: SearchableItem) => {
    onClose();
    if (item.action) {
      item.action();
    } else if (item.href) {
      router.push(item.href);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command & Search Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-100 motion-reduce:animate-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-100 motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Box */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <span className="text-slate-400 font-bold text-sm shrink-0">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search FDR #, bank, or quick filter (e.g. 'Maturity', 'HDFC', 'Blocked')..."
            className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none font-sans"
            aria-autocomplete="list"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1 text-xs">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs font-mono">
              No matching records or commands for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleExecute(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors motion-reduce:transition-none cursor-pointer ${
                    isSelected
                      ? "bg-teal-50 dark:bg-teal-950/60 ring-1 ring-inset ring-teal-500/40"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.title}
                      </span>
                      {item.badge && (
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                            item.badgeVariant === "amber"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : item.badgeVariant === "rose"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              : item.badgeVariant === "teal"
                              ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.subtitle && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono shrink-0">
                    {item.category} ↵
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
          </div>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
