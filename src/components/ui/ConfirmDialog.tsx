"use client";

import React, { useEffect } from "react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger" | "warning";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm Action",
  cancelLabel = "Cancel",
  variant = "primary",
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  let confirmBtnClass = "bg-teal-700 hover:bg-teal-800 text-white";
  if (variant === "danger") {
    confirmBtnClass = "bg-rose-700 hover:bg-rose-800 text-white";
  } else if (variant === "warning") {
    confirmBtnClass = "bg-amber-600 hover:bg-amber-700 text-white";
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <h3
            id="confirm-dialog-title"
            className="text-base font-bold text-slate-900 dark:text-slate-100"
          >
            {title}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-60 ${confirmBtnClass}`}
          >
            {isLoading && (
              <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
            )}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
