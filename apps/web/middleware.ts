import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function setupPageHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b0d12" />
    <title>Buildflow — Setup required</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px 20px;
        background:
          radial-gradient(ellipse at 12% 8%, rgba(239, 68, 68, .09), transparent 34rem),
          radial-gradient(ellipse at 90% 92%, rgba(59, 130, 246, .1), transparent 38rem),
          #0b0d12;
        color: #e5e7eb;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .card {
        width: 100%;
        max-width: 680px;
        background: rgba(16, 18, 25, .96);
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 18px;
        padding: 28px;
        box-shadow: 0 24px 80px rgba(0,0,0,.45);
      }
      .brand { display: flex; align-items: center; gap: 15px; margin-bottom: 24px; }
      .brand img { width: 56px; height: 56px; flex: none; }
      .eyebrow { margin: 0 0 4px; color: #93c5fd; font-size: 11px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
      h1 { margin: 0; font-size: 23px; line-height: 1.2; letter-spacing: -.025em; color: #f8fafc; }
      p.sub { margin: 0 0 22px; color: #cbd5e1; font-size: 14px; line-height: 1.7; }
      ol { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
      li { display: flex; gap: 14px; align-items: flex-start; padding: 15px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(255,255,255,.025); }
      .step { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border: 1px solid rgba(96,165,250,.3); border-radius: 50%; background: rgba(96,165,250,.08); color: #93c5fd; font: 600 11px ui-monospace, monospace; }
      .step-title { margin: 1px 0 4px; color: #f1f5f9; font-size: 13px; font-weight: 600; }
      .step-copy { margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.6; }
      code {
        font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
        overflow-wrap: anywhere;
        color: #bfdbfe;
        background: rgba(59,130,246,.09);
        border-radius: 4px;
        padding: 2px 4px;
      }
      .supabase { color: #93c5fd; text-decoration: underline; text-decoration-color: rgba(147,197,253,.4); text-underline-offset: 3px; }
      .hint { margin: 20px 0 0; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.08); font-size: 11px; line-height: 1.7; color: #64748b; }
      .hint code { color: #cbd5e1; background: rgba(255,255,255,.06); }
      @media (max-width: 540px) { .card { padding: 22px 18px; } .brand img { width: 48px; height: 48px; } h1 { font-size: 20px; } li { padding: 13px; } }
    </style>
  </head>
  <body>
    <div class="card">
      <header class="brand">
        <img src="/brand/buildflow-mark.svg" alt="Buildflow logo" width="56" height="56" />
        <div><p class="eyebrow">Workspace setup</p><h1>Connect Buildflow</h1></div>
      </header>
      <p class="sub">The app is running, but this environment doesn’t have its Supabase connection configured yet. Use your existing project; you don’t need to create another one.</p>
      <ol>
        <li><span class="step">01</span><div><p class="step-title">Connect your Supabase project</p><p class="step-copy">In <a class="supabase" href="https://supabase.com/dashboard">Supabase → Project Settings → API</a>, copy the Project URL and anon/publishable key.</p></div></li>
        <li><span class="step">02</span><div><p class="step-title">Add the connection settings</p><p class="step-copy">Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in the environment where Buildflow runs.</p></div></li>
        <li><span class="step">03</span><div><p class="step-title">Restart and reload</p><p class="step-copy">Locally, add them to <code>apps/web/.env.local</code> and restart the app. In Vercel, add them to the correct environment and redeploy.</p></div></li>
      </ol>
      <p class="hint">If the database has not been initialized, apply the SQL files in <code>supabase/migrations/</code>. To enable AI runs, also configure <code>NEXUS_ENCRYPTION_KEY</code> and at least one provider API key.</p>
    </div>
    <script>setTimeout(() => location.reload(), 15000);</script>
  </body>
</html>`;
}

// Serves a friendly "setup required" screen instead of a raw 500 whenever
// the Supabase env vars aren't present yet — the /office/ static UI still
// loads normally since it doesn't need a server session.
export async function middleware(request: NextRequest) {
  if (isConfigured()) return updateSession(request);

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/office/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error:
          "Buildflow is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Settings → Environment.",
      },
      { status: 503 }
    );
  }

  return new NextResponse(setupPageHtml(), {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|office|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
