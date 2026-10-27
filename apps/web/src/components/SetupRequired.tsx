import BuildflowLogo from "@/components/brand/BuildflowLogo";

const STEPS = [
  {
    number: "01",
    title: "Connect your Supabase project",
    content: (
      <>
        Open <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200">Supabase</a> <span aria-hidden="true">→</span> Project Settings <span aria-hidden="true">→</span> API and copy the Project URL and anon/publishable key.
      </>
    ),
  },
  {
    number: "02",
    title: "Add the connection settings",
    content: (
      <>
        Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in the environment where you run Buildflow.
      </>
    ),
  },
  {
    number: "03",
    title: "Restart and reload",
    content: (
      <>
        Locally, add them to <code>apps/web/.env.local</code> and restart the web app. In Vercel, add them to the correct environment and redeploy.
      </>
    ),
  },
];

export default function SetupRequired() {
  return (
    <main className="setup-shell grid min-h-screen place-items-center px-5 py-6 sm:px-8 sm:py-12">
      <section className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#101219]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-9">
        <header className="mb-5 flex flex-wrap items-center gap-4 sm:mb-7">
          <BuildflowLogo surface="card" className="h-14 w-14 shrink-0" />
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300">Workspace setup</p>
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Connect Buildflow</h1>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-red-400/25 bg-red-400/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-300">
            Setup required
          </span>
        </header>

        <p className="mb-5 max-w-xl text-sm leading-6 text-slate-300 sm:mb-6">
          The app is running, but this environment doesn’t have its Supabase connection configured yet. Use your existing project; you don’t need to create another one.
        </p>

        <ol className="space-y-2 sm:space-y-3">
          {STEPS.map((step) => (
            <li key={step.number} className="flex gap-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 sm:p-5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-blue-400/25 bg-blue-400/[0.08] font-mono text-xs font-semibold text-blue-300">
                {step.number}
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-slate-100">{step.title}</h2>
                <p className="mt-1.5 break-words text-xs leading-5 text-slate-400 [&_code]:rounded [&_code]:bg-blue-400/[0.08] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-blue-200">
                  {step.content}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-5 border-t border-white/[0.08] pt-4 text-xs leading-5 text-slate-500 sm:mt-6 sm:pt-5">
          If the database has not been initialized, apply the SQL files in <code className="font-mono text-slate-300">supabase/migrations/</code>. To enable AI runs, also configure <code className="font-mono text-slate-300">NEXUS_ENCRYPTION_KEY</code> and at least one provider API key.
        </p>
      </section>
    </main>
  );
}
