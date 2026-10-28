"use client";

import React, { useEffect } from "react";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: "Navigation" | "Operations" | "Modals";
}

const SHORTCUTS: ShortcutItem[] = [
  { keys: ["Ctrl", "K"], description: "Open Command & Search Palette", category: "Navigation" },
  { keys: ["/"], description: "Quick search filter focus", category: "Navigation" },
  { keys: ["1"], description: "Jump to Overview & Master Register", category: "Navigation" },
  { keys: ["2"], description: "Jump to Maturity Radar", category: "Navigation" },
  { keys: ["3"], description: "Jump to Forensic Evidence Workbench", category: "Navigation" },
  { keys: ["4"], description: "Jump to Instrument Lifecycle Explorer", category: "Navigation" },
  { keys: ["5"], description: "Jump to Release-Readiness Dossier", category: "Navigation" },
  { keys: ["R"], description: "Trigger immediate Gateway Telemetry sync", category: "Operations" },
  { keys: ["Esc"], description: "Close active drawer, modal, or palette", category: "Modals" },
  { keys: ["?"], description: "Toggle this Keyboard Shortcuts cheat sheet", category: "Modals" },
];

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150 motion-reduce:animate-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <span className="text-base">⌨</span>
            <h2 id="shortcuts-dialog-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Regulatory Console Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts dialog"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none p-1 cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Shortcuts Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {(["Navigation", "Operations", "Modals"] as const).map((category) => (
            <div key={category} className="space-y-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                {category}
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/70 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/30 dark:bg-slate-900/40">
                {SHORTCUTS.filter((s) => s.category === category).map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="px-3.5 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1 shrink-0 font-mono">
                      {shortcut.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          className="px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-2xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-between text-[11px] text-slate-500">
          <span>Shortcuts are inactive while typing in text inputs.</span>
          <kbd className="px-2 py-0.5 font-mono text-[10px] text-slate-500 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded">
            ESC to close
          </kbd>
        </div>
      </div>
    </div>
  );
}
