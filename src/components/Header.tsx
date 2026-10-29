"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  className?: string;
}

export function Header({ title, subtitle, className }: HeaderProps) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/", label: "Portal Home", active: pathname === "/" },
    { href: "/fdr", label: "Control Room", active: pathname === "/fdr" },
    { href: "/fdr?tab=workbench", label: "Forensic Workbench", active: false },
    { href: "/fdr?tab=maturity", label: "Maturity Radar", active: false },
    { href: "/admin/dashboard", label: "Scrutiny Console", active: pathname === "/admin/dashboard" },
  ];

  return (
    <header
      className={cn(
        "w-full sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md transition-all",
        className
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand / Title */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-teal-700 via-teal-600 to-cyan-500 flex items-center justify-center text-white shadow-sm shadow-teal-500/20 group-hover:scale-105 transition-transform">
              <span className="text-base font-black">🛡️</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
                  FDR Guardian AI
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                  SIH26265
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
                Institutional Security Deposit & Forensic Integrity System
              </p>
            </div>
          </Link>
        </div>

        {/* Center / Navigation Pills */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100/70 dark:bg-slate-900/70 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-xs font-semibold">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all",
                link.active
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-800/50"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/fdr"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 shadow-sm shadow-teal-600/20 hover:shadow-teal-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="h-2 w-2 rounded-full bg-teal-200 animate-pulse" />
            <span>Launch Control Room →</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
