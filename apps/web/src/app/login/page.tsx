"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SetupRequired from "@/components/SetupRequired";
import NexusLogo from "@/components/brand/NexusLogo";

// `useSearchParams` below opts this page out of static prerendering unless it
// sits behind a Suspense boundary (Next.js CSR bailout). The default export
// is just that boundary; the interactive form lives in LoginForm.
export default function LoginPage({
  initialMode = "signin",
}: { initialMode?: "signin" | "signup" } = {}) {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm initialMode={initialMode} />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-panel w-full max-w-sm rounded-2xl border border-white/10 bg-[#0c0f15]/95 p-8 text-center shadow-[0_24px_90px_rgba(0,0,0,.55)]">
        <NexusLogo surface="card" className="mb-3" />
        <p className="text-sm text-neutral-400">Loading your workspace…</p>
      </div>
    </div>
  );
}

function LoginForm({ initialMode = "signin" }: { initialMode?: "signin" | "signup" }) {
  // All hooks run unconditionally on every render — the env-var gate below
  // returns early but must never skip hook calls (Rules of Hooks).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Surface OAuth errors that the /auth/callback route redirects back here
  // with, e.g. ?oauth_error=access_denied if the user cancels GitHub consent.
  // Read during render inside the Suspense boundary — no effect needed.
  const oauthErrorParam = searchParams.get("oauth_error");
  const statusMessage = oauthErrorParam ? decodeURIComponent(oauthErrorParam) : status;

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return <SetupRequired />;
  }

  const supabase = createClient();

  async function handleGitHubSignIn() {
    setOauthLoading(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // repo scope lets Deploy Desk's "Save to GitHub" push directly with
        // the user's own OAuth token instead of requiring a separate PAT.
        scopes: "read:user user:email repo",
      },
    });
    if (error) {
      setStatus(error.message);
      setOauthLoading(false);
    }
    // On success the browser navigates away to GitHub, so no further
    // state update is needed here.
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setStatus(error.message);
      else {
        router.push("/projects");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setStatus(error.message);
      else setStatus("Check your email to confirm your account, then sign in.");
    }
    setLoading(false);
  }

  return (
    <div className="auth-shell relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#080a0f] px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_18%_18%,rgba(59,130,246,0.14),transparent_38%),radial-gradient(ellipse_at_82%_82%,rgba(239,68,68,0.10),transparent_36%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.025]" />
      <div className="glass-panel relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0c0f15]/95 p-7 shadow-[0_24px_90px_rgba(0,0,0,.55)] sm:p-8">
        <div aria-hidden="true" className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
        <div className="mb-5 flex flex-col items-center text-center">
          <NexusLogo surface="card" className="mb-4" />
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Buildflow workspace
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-sm text-neutral-400">
            {mode === "signin"
              ? "Sign in to pick up where you left off."
              : "Your projects and AI team start here."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-400">
              Email address
            </span>
            <input
              type="email"
              required
              placeholder="you@domain.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/10"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-400">
              Password
            </span>
            <input
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/10"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="btn-terminal mt-1 w-full rounded-lg bg-blue-500 px-3 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(59,130,246,.16)] transition hover:bg-blue-400 disabled:opacity-50"
          >
            {loading ? "AUTHENTICATING…" : mode === "signin" ? "AUTH --IN" : "AUTH --UP"}
          </button>
        </form>

        {statusMessage && (
          <p role="status" className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-200">{statusMessage}</p>
        )}

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-neutral-800" />
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-600">
            or
          </span>
          <div className="h-px flex-1 bg-neutral-800" />
        </div>

        <button
          onClick={handleGitHubSignIn}
          disabled={oauthLoading}
          className="btn-terminal flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-3 text-sm font-medium text-neutral-200 transition hover:border-red-400/30 hover:bg-white/[0.05] disabled:opacity-50"
        >
          <GitHubIcon />
          <span className="text-sm">
            {oauthLoading ? "handshake…" : "Continue with GitHub"}
          </span>
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-5 w-full text-center text-xs text-neutral-500 transition hover:text-blue-300"
        >
          {mode === "signin" ? "no account? register →" : "have an account? auth --in →"}
        </button>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
