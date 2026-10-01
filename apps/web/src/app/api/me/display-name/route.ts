import { NextResponse } from "next/server";
import {
  getRequestIdentity,
  requireScopeForRequest,
  apiTokenErrorResponse,
  scopedClient,
} from "@/lib/requestIdentity";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateProfile, sanitizeDisplayName } from "@/lib/profile";

// Addendum 9 Phase 1: display-name identity.
// Addendum 10 Phase 3: also returns avatar_url, email, GitHub metadata, and
// account created_at so the profile page can show full account info.
// Dual auth (GET): browser session or Nexus API token (projects:read) — the
// token path doubles as `nexus whoami` and returns no token material.

export async function GET(req: Request) {
  const auth = await getRequestIdentity(req);
  if ("response" in auth) return auth.response;
  try {
    requireScopeForRequest(auth.identity, "projects:read");
  } catch (err) {
    const safe = apiTokenErrorResponse(err);
    if (safe) return safe;
    throw err;
  }
  const supabase = await scopedClient(auth.identity);
  const user = { id: auth.identity.userId, email: auth.identity.email };

  // Surface the real failure reason (e.g. a missing `profiles` table when a
  // migration hasn't run against this environment) instead of an opaque 500.
  let profile;
  try {
    profile = await getOrCreateProfile(supabase, user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load profile";
    console.error("[display-name GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Session requests carry the full Supabase user; token requests only have
  // the identity resolved from the token row (no email, no app_metadata).
  const sessionUser = auth.identity.token ? null : await getAuthUser(supabase);

  return NextResponse.json({
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    // One-time naming prompt: shown until the user picks a name (or skips).
    needsDisplayName: profile.display_name.length === 0,
    // Account metadata for the profile page (session-only extras).
    email: sessionUser?.email ?? user.email ?? null,
    githubLogin:
      sessionUser &&
      (sessionUser.app_metadata as Record<string, unknown>)?.provider === "github"
        ? ((sessionUser.user_metadata as Record<string, unknown>)?.user_name ??
          (sessionUser.user_metadata as Record<string, unknown>)?.preferred_username ??
          null)
        : null,
    memberSince: sessionUser?.created_at ?? profile.created_at,
    // CLI whoami hint: which credential authenticated this request. For API
    // tokens, echo back the token's own safe metadata (name + scopes — the
    // caller already knows these; the raw token and hash never appear).
    via: auth.identity.token ? "api_token" : "session",
    ...(auth.identity.token
      ? { apiToken: { name: auth.identity.token.tokenName, scopes: auth.identity.token.scopes } }
      : {}),
  });
}

// Fetches the full auth user only on the session path (the admin client can
// also fetch users by id, but the extra round-trip isn't needed for tokens).
async function getAuthUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Body: { displayName: string }
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const displayName = sanitizeDisplayName(typeof body?.displayName === "string" ? body.displayName : "");
  if (!displayName) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ displayName });
}
