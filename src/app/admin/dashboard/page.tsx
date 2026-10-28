import { Metadata } from "next";
import Link from "next/link";
import { DashboardClient } from "./DashboardClient";

export const metadata: Metadata = {
  title: "Scrutiny Officer Inspection Station | SIH 2026",
  description: "Administrative split-screen inspection interface tracking incoming application states",
};

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Top Admin Navigation Header */}
      <header className="w-full py-4 px-6 md:px-8 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-10 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-sm">
              SIH
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Administrative Scrutiny & Inspection Console
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Regulatory Compliance Verification • Live Prisma Application Model Tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/fdr"
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-teal-300 animate-pulse" />
              <span>FDR Guardian Control Room →</span>
            </Link>
            <Link
              href="/"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              ← Applicant Portal
            </Link>
          </div>
        </div>
      </header>

      {/* Main Inspection Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        <DashboardClient />
      </main>
    </div>
  );
}
