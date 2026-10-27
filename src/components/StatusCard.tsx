import React from "react";
import { cn } from "@/lib/utils";

interface StatusCardProps {
  label: string;
  status: string;
  description: string;
  className?: string;
}

export function StatusCard({ label, status, description, className }: StatusCardProps) {
  return (
    <div className={cn("p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur shadow-sm", className)}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono">
          {status}
        </span>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{description}</p>
    </div>
  );
}
