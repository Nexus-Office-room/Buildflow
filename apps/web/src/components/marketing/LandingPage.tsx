import Link from "next/link";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/pipeline/roles";
import { ROLE_ICONS } from "@/lib/pipeline/roleIcons";
import { ROLES, type Role } from "@/types/db";
import BuildflowLogo from "@/components/brand/BuildflowLogo";
import MaskRevealHero from "./MaskRevealHero";

const ROLE_TAGLINES: Record<Role, string> = {
  strategist: "Reads the ask, decides how much ceremony it actually needs.",
  builder: "Writes the real code and files, straight into your project.",
  analyst: "Reviews the build for edge cases and gaps before it ships.",
  qa: "Runs a final correctness pass and flags what to test.",
  ops: "Delivers the answer and logs what changed, permanently.",
};

export default function LandingPage() {
  return (
    <div className="buildflow-landing min-h-screen text-neutral-100">
      <header className="landing-header mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" aria-label="Buildflow home" className="flex items-center gap-2.5">
          <BuildflowLogo surface="nav" />
          <span className="text-sm font-semibold tracking-wide">Buildflow</span>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-5">
          <a href="#how-it-works" className="hidden text-sm text-neutral-400 transition hover:text-white sm:inline">
            How it works
          </a>
          <Link href="/login" className="text-sm text-neutral-400 hover:text-neutral-200">
            Log in
          </Link>
          <Link
            href="/login"
            className="btn-terminal rounded-md bg-[var(--role-strategist)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="landing-hero mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-8 lg:min-h-[min(760px,calc(100dvh-76px))] lg:grid-cols-[0.92fr_1.08fr] lg:gap-12 lg:pb-16 lg:pt-10">
        <div className="hero-copy relative z-10">
          <div className="landing-eyebrow mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium tracking-wide text-neutral-300">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--role-strategist)] shadow-[0_0_12px_rgba(239,68,68,.85)]" />
            A focused workspace for building with AI
          </div>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.03] tracking-[-0.055em] sm:text-6xl lg:text-[4.35rem]">
            Your AI team, <span className="hero-headline-accent">in one flow.</span>
          </h1>
          <p className="mt-5 max-w-lg text-pretty text-base leading-7 text-neutral-400 sm:text-lg sm:leading-8">
            Plan, build, review, and ship from one workspace that keeps every project’s context close.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/login"
              className="btn-terminal inline-flex items-center gap-2 rounded-md bg-[var(--role-strategist)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(239,68,68,.16)] hover:opacity-90"
          >
              Start building <span aria-hidden="true">→</span>
          </Link>
            <a href="#how-it-works" className="rounded-md border border-white/10 px-5 py-3 text-sm font-medium text-neutral-200 transition hover:border-white/25 hover:bg-white/[0.04]">
              Explore the workflow
            </a>
          </div>
          <div className="mt-8 flex items-center gap-3 text-xs text-neutral-500">
            <span className="flex -space-x-1.5" aria-hidden="true">
              {ROLES.slice(0, 3).map((role) => {
                const Icon = ROLE_ICONS[role];
                return <span key={role} className="flex h-7 w-7 items-center justify-center rounded-full border border-[#11131a]" style={{ backgroundColor: ROLE_COLORS[role] }}><Icon className="h-3.5 w-3.5 text-white" /></span>;
              })}
            </span>
            <span>One team. Five focused roles.</span>
          </div>
        </div>

        <MaskRevealHero />
      </section>

      {/* The 5 roles */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-8 px-6 pb-20">
        <h2 className="mb-8 text-center text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Five roles, one relay
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ROLES.map((role) => {
            const Icon = ROLE_ICONS[role];
            const color = ROLE_COLORS[role];
            return (
              <div key={role} className="glass-panel rounded-xl p-5">
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: color }}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="mb-1 text-sm font-semibold" style={{ color }}>
                  {ROLE_LABELS[role]}
                </h3>
                <p className="text-xs leading-relaxed text-neutral-400">
                  {ROLE_TAGLINES[role]}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Before / after */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="glass-panel rounded-xl p-6">
            <h3 className="mb-3 text-sm font-semibold text-neutral-400">
              Without Buildflow
            </h3>
            <ul className="space-y-2 text-sm text-neutral-500">
              <li>— A chat tab that forgets everything tomorrow</li>
              <li>— A separate editor for the actual code</li>
              <li>— A notes doc for decisions, if you remember to write one</li>
              <li>— A deploy dashboard in a third tab</li>
              <li>— No idea what any of it cost this month</li>
            </ul>
          </div>
          <div className="glass-panel rounded-xl p-6" style={{ borderColor: "var(--role-analyst)" }}>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--role-analyst)" }}>
              With Buildflow
            </h3>
            <ul className="space-y-2 text-sm text-neutral-300">
              <li>— One workspace per project, memory included</li>
              <li>— Code lands directly in a live editor + preview</li>
              <li>— Every decision auto-logged by Ops, every run</li>
              <li>— Deploy straight to GitHub + Vercel from the same screen</li>
              <li>— A running cost meter, per role, per run</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 pb-12 text-center text-xs text-neutral-600">
        Buildflow
      </footer>
    </div>
  );
}
