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
    <header className={cn("w-full py-5 px-6 md:px-8 border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur sticky top-0 z-10", className)}>
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-xs md:text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/dashboard"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
          >
            Admin Scrutiny Dashboard →
          </Link>
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
            Next.js 15
          </span>
        </div>
      </div>
    </header>
  );
}
