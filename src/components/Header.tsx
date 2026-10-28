import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export function Header({ title, subtitle, className }: HeaderProps) {
  return (
    <header className={cn("w-full py-4 px-6 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur sticky top-0 z-20 shadow-2xs", className)}>
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/fdr"
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300 animate-pulse" />
            <span>FDR Guardian Control Room →</span>
          </Link>
          <Link
            href="/admin/dashboard"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 transition-colors"
          >
            Scrutiny Console
          </Link>
        </div>
      </div>
    </header>
  );
}
