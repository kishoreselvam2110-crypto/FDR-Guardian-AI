"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type ToastType = "success" | "warning" | "error" | "info";

export interface ToastMessage {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, message, type }: Omit<ToastMessage, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      setToasts((prev) => [...prev, { id, title, message, type }]);

      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast Notification Viewport */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((toast) => {
          let borderClass = "border-slate-300 dark:border-slate-700";
          let bgClass = "bg-white dark:bg-slate-900";
          let icon = "ℹ";
          let iconColor = "text-slate-600 dark:text-slate-400";

          if (toast.type === "success") {
            borderClass = "border-teal-500/30";
            bgClass = "bg-teal-50/95 dark:bg-teal-950/90 text-teal-950 dark:text-teal-100";
            icon = "✓";
            iconColor = "text-teal-600 dark:text-teal-400";
          } else if (toast.type === "warning") {
            borderClass = "border-amber-500/30";
            bgClass = "bg-amber-50/95 dark:bg-amber-950/90 text-amber-950 dark:text-amber-100";
            icon = "!";
            iconColor = "text-amber-600 dark:text-amber-400";
          } else if (toast.type === "error") {
            borderClass = "border-rose-500/30";
            bgClass = "bg-rose-50/95 dark:bg-rose-950/90 text-rose-950 dark:text-rose-100";
            icon = "✕";
            iconColor = "text-rose-600 dark:text-rose-400";
          }

          return (
            <div
              key={toast.id}
              role="alert"
              className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg backdrop-blur-sm flex items-start gap-3 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none motion-reduce:transition-none ${borderClass} ${bgClass}`}
            >
              <span className={`text-sm font-black mt-0.5 shrink-0 ${iconColor}`}>{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold leading-snug">{toast.title}</p>
                {toast.message && (
                  <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed">{toast.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="opacity-60 hover:opacity-100 text-xs px-1 text-slate-500"
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: (toast: Omit<ToastMessage, "id">) => {
        if (typeof window !== "undefined") {
          console.warn("[Toast]", toast.title, toast.message);
        }
      },
      removeToast: () => {},
    };
  }
  return context;
}
