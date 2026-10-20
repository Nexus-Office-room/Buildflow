export default function SetupRequired() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="glass-panel w-full max-w-xl rounded-xl p-8">
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--role-strategist)]" />
          <h1 className="text-xl font-semibold text-neutral-100">Nexus Office — setup required</h1>
        </div>
        <p className="mb-6 text-sm text-neutral-400">
          Supabase may already be set up. This deployment still needs its own connection settings.
        </p>
        <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-neutral-300">
          <li>
            In Supabase Settings → API, copy the project URL and publishable (anon) key.
          </li>
          <li>
            Run every migration in <span className="font-mono text-xs text-[var(--role-analyst)]">supabase/migrations/</span>{" "}
            against it (SQL editor or <span className="font-mono text-xs text-[var(--role-analyst)]">supabase db push</span>).
          </li>
          <li>
            Add <span className="font-mono text-xs text-[var(--role-analyst)]">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
            <span className="font-mono text-xs text-[var(--role-analyst)]">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to the
            matching Vercel environment (Preview or Production).
          </li>
          <li>Redeploy this environment, then reload this page.</li>
        </ol>
        <p className="text-xs text-neutral-500">
          Also add <span className="font-mono text-xs">NEXUS_ENCRYPTION_KEY</span> (base64, 32 bytes) and at least one
          provider key (e.g. <span className="font-mono text-xs">ANTHROPIC_API_KEY</span>) before running the AI pipeline.
        </p>
      </div>
    </div>
  );
}
