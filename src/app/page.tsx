import { Header } from "@/components/Header";
import { ApplicationWizard } from "@/components/ApplicationWizard";
import { formatDate } from "@/lib/utils";

export default function Home() {
  const currentDate = formatDate(new Date());

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <Header
        title="SIH 2026 Educational Affiliation Portal"
        subtitle={`Live Session • ${currentDate} • Next.js 15 App Router + Prisma ORM + Tailwind CSS`}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-8">
        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Institutional Affiliation Application Wizard
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 max-w-3xl">
              Complete the sequential steps to submit your institution dossier. The dynamic compliance engine evaluates your Faculty-Student Ratio (1:20) and Built-Up Area norms in real time.
            </p>
          </div>

          <ApplicationWizard />
        </section>
      </main>
    </div>
  );
}
