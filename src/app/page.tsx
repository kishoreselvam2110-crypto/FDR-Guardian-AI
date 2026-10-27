import { Header } from "@/components/Header";
import { StatusCard } from "@/components/StatusCard";
import { formatDate } from "@/lib/utils";
import { dbConfig } from "@/lib/db";

export default function Home() {
  const currentDate = formatDate(new Date());

  const features = [
    {
      label: "Routes (/src/app)",
      status: "Ready",
      description: "Next.js 15 App Router architecture with React Server Components enabled.",
    },
    {
      label: "UI Modules (/src/components)",
      status: "Configured",
      description: "Reusable component library styled with Tailwind CSS.",
    },
    {
      label: "Lib & Database (/src/lib)",
      status: "Configured",
      description: `Database config active (max connections: ${dbConfig.maxConnections}) with shared utility helpers.`,
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <Header
        title="SIH 2026 Full-Stack Application"
        subtitle={`Initialized on ${currentDate} • Next.js 15 App Router + TypeScript + Tailwind CSS`}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto p-8 space-y-8">
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 bg-white dark:bg-zinc-900 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Project Architecture Initialized</h2>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm max-w-2xl mb-6">
            Your full-stack application template is set up with standard module directories, TypeScript typing, and Tailwind CSS utility styling.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {features.map((feature) => (
              <StatusCard
                key={feature.label}
                label={feature.label}
                status={feature.status}
                description={feature.description}
              />
            ))}
          </div>
        </section>

        <section className="p-6 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 text-sm text-zinc-500 dark:text-zinc-400 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Development server running cleanly</span>
          </div>
          <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded">
            npm run dev
          </code>
        </section>
      </main>
    </div>
  );
}
