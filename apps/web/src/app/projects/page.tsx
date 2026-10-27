import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RepoImportPicker from "@/components/projects/RepoImportPicker";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import SetupRequired from "@/components/SetupRequired";
import BuildflowLogo from "@/components/brand/BuildflowLogo";

export default async function ProjectsPage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return <SetupRequired />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="projects-shell min-h-screen px-6 py-10 text-neutral-100 sm:px-8">
      {/* Addendum 13: first-time walkthrough (auto-starts once, re-runnable
          via the floating "?" button the component always renders). */}
      <OnboardingTour autoStart />
      <div className="mx-auto max-w-5xl">
        <header className="projects-header">
          {/* Keep the terminal cue, but make it read as a deliberate location bar. */}
          <div className="projects-bootline data-mono" aria-label="Current workspace location">
            <span className="projects-bootline__dot" aria-hidden="true" />
            <span className="projects-bootline__user">buildflow@studio</span>
            <span className="projects-bootline__path">~/projects</span>
            <span className="projects-bootline__command">$ ls -la</span>
          </div>

          <div className="projects-masthead">
            <div className="projects-heading">
              <BuildflowLogo surface="nav" />
              <div>
                <h1>Your Projects</h1>
                <p>Connect a repository or jump back into your work.</p>
              </div>
            </div>

            <nav className="projects-nav" aria-label="Workspace navigation">
              <Link href="/pricing" className="projects-nav__upgrade">Upgrade to Pro</Link>
              <Link href="/prompts" className="projects-nav__link">Vault</Link>
              <Link href="/companions" className="projects-nav__link">Companions</Link>
              <Link href="/office-chat" className="projects-nav__link">Team chat</Link>
              <Link href="/account/profile" className="projects-nav__link">Account</Link>
              <form action="/auth/signout" method="post">
                <SignOutButton />
              </form>
            </nav>
          </div>
        </header>

        {/* Addendum 13: GitHub repo/org picker is the only way to create a
            project now — in-app repo creation was removed. */}
        <RepoImportPicker />

        <ul className="mt-8 space-y-2" data-tour="projects-list">
          {(projects ?? []).map((p, i) => (
            <li key={p.id} className="sweep-in" style={{ animationDelay: `${i * 40}ms` }}>
              <Link
                href={`/projects/${p.id}`}
                className="glass-panel group block rounded-lg px-4 py-3 transition-all duration-200 hover:-translate-y-px hover:border-[var(--term-accent)]/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="data-mono text-[var(--term-accent)] phosphor">▸</span>
                    <span className="truncate font-mono text-sm font-medium text-neutral-100 group-hover:text-white">
                      {p.github_repo ?? p.name}
                    </span>
                  </div>
                  <span className="data-mono shrink-0 text-[10px] text-neutral-600 group-hover:text-[var(--term-accent)]">
                    open →
                  </span>
                </div>
                <div className="data-mono mt-1 text-[11px] text-neutral-600">
                  {p.github_repo ? `origin: ${p.github_repo}` : "no remote"} ·{" "}
                  {new Date(p.created_at).toLocaleDateString()}
                </div>
              </Link>
            </li>
          ))}
          {(!projects || projects.length === 0) && (
            <li className="glass-panel rounded-lg p-6 text-center">
              <p className="data-mono text-sm text-[var(--term-accent)] phosphor">
                0 workspaces found
                <span className="cursor-block" />
              </p>
              <p className="mt-2 text-sm text-neutral-400">
                Connect a repo above to open the Office.
              </p>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function SignOutButton() {
  return (
    <button
      className="projects-nav__signout"
      type="submit"
    >
      Sign out
    </button>
  );
}
