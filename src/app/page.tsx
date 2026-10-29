import Link from "next/link";
import { Header } from "@/components/Header";
import { ApplicationWizard } from "@/components/ApplicationWizard";
import { formatDate } from "@/lib/utils";

export default function Home() {
  const currentDate = formatDate(new Date());

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-teal-500 selection:text-white">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-b from-white via-slate-50/50 to-slate-100/60 dark:from-slate-900 dark:via-slate-900/50 dark:to-slate-950 p-8 sm:p-12 shadow-sm">
          {/* Subtle Ambient Glow */}
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-teal-500/10 dark:bg-teal-400/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-96 h-96 bg-cyan-500/10 dark:bg-cyan-400/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-4xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
              <span>SIH26265 • Ministry of Education & Regulatory Compliance System</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-slate-50 leading-[1.15]">
                AI-Powered FDR Forensic &amp; Regulatory Verification Platform
              </h1>
              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                End-to-end forensic scrutiny of institutional Fixed Deposit Receipts (FDRs). 
                Multi-layer tamper detection, bank lien validation, and statutory lock-in governance—empowering scrutiny officers with tamper-evident evidence.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/fdr"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-teal-700 hover:bg-teal-800 shadow-md shadow-teal-700/20 hover:shadow-lg hover:shadow-teal-700/30 transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                <span>Launch Control Room</span>
                <span className="text-base">→</span>
              </Link>

              <Link
                href="/fdr?tab=workbench"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 shadow-xs transition-all hover:scale-[1.01]"
              >
                <span>Forensic AI Workbench</span>
                <span className="text-sm">🔬</span>
              </Link>

              <Link
                href="/admin/dashboard"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-all"
              >
                <span>Scrutiny Console</span>
                <span className="text-xs text-slate-400">↗</span>
              </Link>
            </div>
          </div>

          {/* Operational Metrics Ribbon */}
          <div className="mt-10 pt-8 border-t border-slate-200/70 dark:border-slate-800/70 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Total Pledged Capital
              </span>
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-50 font-mono mt-1 block">
                ₹3,42,50,000
              </span>
              <span className="text-xs text-teal-600 dark:text-teal-400 font-medium mt-0.5 block">
                Across Registered Colleges
              </span>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Forensic Pipeline
              </span>
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-50 font-mono mt-1 block">
                6 Layers
              </span>
              <span className="text-xs text-slate-500 font-medium mt-0.5 block">
                OCR • QR • ELA • Ink • Layout • Metadata
              </span>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Bank Reconciliation
              </span>
              <span className="text-2xl sm:text-3xl font-black text-teal-700 dark:text-teal-400 font-mono mt-1 block">
                100% Typed
              </span>
              <span className="text-xs text-slate-500 font-medium mt-0.5 block">
                Correlation ID Tracking
              </span>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Audit Lineage
              </span>
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-50 font-mono mt-1 block">
                Immutable
              </span>
              <span className="text-xs text-slate-500 font-medium mt-0.5 block">
                Preserves Historical Lineage
              </span>
            </div>
          </div>
        </section>

        {/* Core Architecture Cards (3-Column Bento Grid) */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Core Regulatory &amp; Forensic Capabilities
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Integrated modules architected to eliminate security deposit forgery and procedural lapses.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xs hover:shadow-md transition-shadow space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="h-10 w-10 rounded-xl bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60 flex items-center justify-center text-lg">
                  🔬
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                  Forensic AI Workbench
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Multi-tier forensic evidence analysis: Error Level Analysis (ELA) for image splicing, QR payload cross-checking against certificate details, and PDF metadata modification detection.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link
                  href="/fdr?tab=workbench"
                  className="text-xs font-bold text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 inline-flex items-center gap-1"
                >
                  <span>Open Evidence Workbench</span>
                  <span>→</span>
                </Link>
              </div>
            </div>

            {/* Card 2 */}
            <div className="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xs hover:shadow-md transition-shadow space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="h-10 w-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border border-cyan-200/60 dark:border-cyan-800/60 flex items-center justify-center text-lg">
                  📊
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                  Master FDR Ledger &amp; Radar
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Unified repository for statutory fixed deposit certificates. Tracks active joint lien endorsements, 30/60/90-day maturity horizons, and prevents unauthorized premature encashment.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link
                  href="/fdr"
                  className="text-xs font-bold text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 inline-flex items-center gap-1"
                >
                  <span>Explore Master Ledger</span>
                  <span>→</span>
                </Link>
              </div>
            </div>

            {/* Card 3 */}
            <div className="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xs hover:shadow-md transition-shadow space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 flex items-center justify-center text-lg">
                  🏦
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                  Bank Sandbox &amp; Scrutiny Board
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Deterministic bank verification gateway testing match/mismatch outcomes with strict anti-prejudgment rules. AI assists officers without ever autonomously approving release petitions.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link
                  href="/admin/dashboard"
                  className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 inline-flex items-center gap-1"
                >
                  <span>Open Scrutiny Console</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Institutional Affiliation & Dossier Ingestion Wizard Section */}
        <section className="space-y-6 pt-4">
          <div className="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xs">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                    Institutional Affiliation &amp; Dossier Submission Wizard
                  </h2>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Applicant Module
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Submit applicant institution dossier, evaluate real-time Faculty-Student Ratio (1:20), and review Built-Up Area norms.
                </p>
              </div>
              <Link
                href="/fdr"
                className="self-start sm:self-auto px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Go to FDR Verification →
              </Link>
            </div>

            <ApplicationWizard />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/50 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 FDR Guardian AI (SIH26265) • Educational Affiliation &amp; Statutory Security Deposit Platform</p>
          <div className="flex items-center gap-4">
            <Link href="/fdr" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
              FDR Control Room
            </Link>
            <span>•</span>
            <Link href="/fdr?tab=workbench" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
              Forensic Workbench
            </Link>
            <span>•</span>
            <Link href="/admin/dashboard" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
              Scrutiny Console
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
