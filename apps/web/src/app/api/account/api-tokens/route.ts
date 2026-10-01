import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  API_TOKEN_SCOPES,
  isApiTokenScope,
  generateApiToken,
  type ApiTokenScope,
} from "@/lib/apiTokens";

// Management endpoints for Nexus API tokens. Session-authenticated (browser
// cookie) — the tokens created here are used by the CLI/API, not the browser.
// The raw token exists ONLY in the POST /api/account/api-tokens response,
// at creation time. There is no read path that returns it again.

// GET: list the caller's tokens — safe metadata only (prefix, never the raw
// token or the hash).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: tokens, error } = await supabase
    .from("api_tokens")
    .select("id, name, token_prefix, scopes, last_used_at, created_at, expires_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tokens: tokens ?? [], scopes: API_TOKEN_SCOPES });
}

// POST: create a token. Body: { name: string, scopes: string[], expiresInDays?: number | null }
// Returns the raw token exactly once, with the one-time-display warning.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  const rawScopes = Array.isArray(body?.scopes) ? body.scopes : [];
  const expiresInDays =
    body?.expiresInDays === null || body?.expiresInDays === undefined
      ? null
      : Number(body.expiresInDays);

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  // Default to read-only permissions (Phase 4). Write/deploy scopes are only
  // granted when the client explicitly lists them.
  const scopes: ApiTokenScope[] = [];
  for (const s of rawScopes) {
    if (typeof s !== "string" || !isApiTokenScope(s)) {
      return NextResponse.json({ error: `Invalid scope: ${String(s)}` }, { status: 400 });
    }
    if (!scopes.includes(s)) scopes.push(s);
  }
  const effectiveScopes: ApiTokenScope[] = scopes.length
    ? scopes
    : ["projects:read", "vault:read"];

  if (
    expiresInDays !== null &&
    (!Number.isFinite(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)
  ) {
    return NextResponse.json(
      { error: "expiresInDays must be between 1 and 365, or null for no expiry" },
      { status: 400 }
    );
  }

  const { token, tokenPrefix, tokenHash } = generateApiToken("live");
  const expiresAt =
    expiresInDays !== null
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { data: row, error } = await supabase
    .from("api_tokens")
    .insert({
      user_id: user.id,
      name,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      scopes: effectiveScopes,
      expires_at: expiresAt,
    })
    .select("id, name, token_prefix, scopes, created_at, expires_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit: token creation is security-sensitive and project-independent
  // (audit_events.project_id is nullable since migration 0013).
  await createAdminClient()
    .from("audit_events")
    .insert({
      project_id: null,
      user_id: user.id,
      actor: "user",
      action: "api_token.created",
      target: tokenPrefix,
      metadata: { name, scopes: effectiveScopes, expires_at: expiresAt },
    });

  return NextResponse.json(
    {
      token,
      warning: "This token will not be shown again. Copy it now.",
      record: row,
    },
    { status: 201 }
  );
}

// DELETE: revoke one of the caller's tokens. Body/query: { id: string }
// Revocation is permanent — the row stays for the audit trail but the token
// can never authenticate again.
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: revoked, error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id, token_prefix, name")
    .single();

  if (error || !revoked) {
    return NextResponse.json(
      { error: "Token not found or already revoked" },
      { status: 404 }
    );
  }

  await createAdminClient()
    .from("audit_events")
    .insert({
      project_id: null,
      user_id: user.id,
      actor: "user",
      action: "api_token.revoked",
      target: revoked.token_prefix,
      metadata: { name: revoked.name },
    });

  return NextResponse.json({ ok: true });
}
