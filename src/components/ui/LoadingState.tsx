import React from "react";

export function LoadingState({
  message = "Loading regulatory data...",
  subtext = "Syncing ledger with core banking nodes",
}: {
  message?: string;
  subtext?: string;
}) {
  return (
    <div className="w-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="relative">
        <div className="w-10 h-10 rounded-full border-3 border-slate-200 dark:border-slate-800 border-t-teal-600 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-teal-600 animate-ping" />
        </div>
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{message}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtext}</p>
      </div>
    </div>
  );
}
