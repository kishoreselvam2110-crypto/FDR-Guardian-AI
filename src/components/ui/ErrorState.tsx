import React from "react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Regulatory Service Unreachable",
  message = "Failed to synchronize ledger records. Check gateway network status or credential access.",
  code,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="w-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 font-black text-xl">
        !
      </div>
      <div className="max-w-md">
        <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h4>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{message}</p>
        {code && (
          <code className="inline-block mt-2 font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
            ERR_CODE: {code}
          </code>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity"
        >
          Retry Connection ↺
        </button>
      )}
    </div>
  );
}
