import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// One-click GitHub (re)connect used by the repo picker and Deploy Desk.
// Kicks off the same Supabase OAuth flow as the login page (identical
// scopes) but returns the user to wherever they came from via
// /auth/callback?next=<next>, so a failed repo search becomes:
// click "Connect GitHub" → GitHub consent → back on the picker.
//
// GET /api/auth/github?next=/projects
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const next = searchParams.get("next") ?? "/projects";
  // Only same-origin absolute paths survive the callback's validation.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/projects";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      // Must match the login page's scopes exactly: read:user user:email repo.
      scopes: "read:user user:email repo",
    },
  });

  if (error || !data?.url) {
    // Same error surface the login page uses.
    return NextResponse.redirect(
      `${origin}/login?oauth_error=${encodeURIComponent(error?.message ?? "Could not start GitHub authorization")}`
    );
  }
  return NextResponse.redirect(data.url);
}
