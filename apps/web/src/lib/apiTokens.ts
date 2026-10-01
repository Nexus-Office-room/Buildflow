import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Nexus Office API tokens (`nxo_live_...` / `nxo_test_...`).
//
// Security model:
// - The raw token is generated once from crypto-strength randomness and shown
//   exactly once (in the create response). It is never persisted, logged, or
//   returned again — only its SHA-256 hash is stored (api_tokens.token_hash).
// - The prefix (`nxo_live_` + first 8 random chars) is stored separately so
//   the UI can identify keys without revealing the secret part.
// - Lookup is constant-ish-time: the hash column has a UNIQUE index, and
//   failure paths all return the same generic 401 (no user/token existence
//   leaks).
// - Authentication and authorization are separate steps: a valid token
//   authenticates; requireScope() authorizes the specific operation.

export const API_TOKEN_PREFIX = "nxo_";

// Scopes: read-only by default; write/deploy scopes must be explicitly
// selected at creation time (enforced in the create route and UI).
export const API_TOKEN_SCOPES = [
  "projects:read",
  "pipeline:run",
  "vault:read",
  "vault:write",
  "deploy:trigger",
] as const;

export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

// Scope → required capability mapping for docs/UI copy.
export const API_TOKEN_SCOPE_LABELS: Record<ApiTokenScope, string> = {
  "projects:read": "Read your projects (read-only)",
  "pipeline:run": "Run the AI pipeline on a project (write)",
  "vault:read": "Read Prompt Vault entries (read-only)",
  "vault:write": "Create, update, and delete Prompt Vault entries (write)",
  "deploy:trigger": "Trigger production deploys (write)",
};

const WRITE_SCOPES: ReadonlySet<ApiTokenScope> = new Set([
  "pipeline:run",
  "vault:write",
  "deploy:trigger",
]);

export function isWriteScope(scope: ApiTokenScope): boolean {
  return WRITE_SCOPES.has(scope);
}

export function isApiTokenScope(scope: string): scope is ApiTokenScope {
  return (API_TOKEN_SCOPES as readonly string[]).includes(scope);
}

// Raw secret: 32 random bytes → 43 base64url chars (~192 bits of entropy).
const SECRET_BYTES = 32;

// Stable prefix length used for display: scheme + 8 chars of the secret.
const DISPLAY_SECRET_CHARS = 8;

export interface GeneratedApiToken {
  token: string;
  tokenPrefix: string;
  tokenHash: string;
}

export function generateApiToken(variant: "live" | "test" = "live"): GeneratedApiToken {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const token = `nxo_${variant}_${secret}`;
  return {
    token,
    tokenPrefix: token.slice(0, API_TOKEN_PREFIX.length + variant.length + 1 + DISPLAY_SECRET_CHARS),
    tokenHash: hashApiToken(token),
  };
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Structural check only (cheap, before any DB work): scheme + opaque secret.
export function isApiTokenFormat(token: string): token is string {
  return /^nxo_(live|test)_[A-Za-z0-9_-]{40,}$/.test(token);
}

// Compares the supplied bearer token against a stored hash in constant time.
function tokenMatches(token: string, storedHash: string): boolean {
  const supplied = Buffer.from(hashApiToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (supplied.length !== stored.length) return false;
  return timingSafeEqual(supplied, stored);
}

// ---------------------------------------------------------------------------
// Request context: attached by authenticateApiToken and consumed by routes.
// ---------------------------------------------------------------------------

export interface ApiTokenContext {
  userId: string;
  tokenId: string;
  tokenName: string;
  scopes: ApiTokenScope[];
}

export class ApiTokenAuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "ApiTokenAuthError";
    this.status = status;
  }
}

// Simple in-process per-token rate limiter (Phase 9). Fixed 60-second window;
// enough to stop a leaked token from being hammered without adding a second
// rate-limiting framework (Nexus has none yet). Survives within one server
// process, which is where all token traffic arrives in this deployment.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 120;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkTokenRateLimit(tokenId: string): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(tokenId);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(tokenId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    // Opportunistic cleanup so the map can't grow unbounded.
    if (rateBuckets.size > 10_000) {
      for (const [key, b] of rateBuckets) {
        if (b.resetAt <= now) rateBuckets.delete(key);
      }
    }
    return { ok: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > RATE_MAX_REQUESTS) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

function unauthorized(): ApiTokenAuthError {
  // One generic message for every failure mode (missing header, bad scheme,
  // unknown token, revoked, expired, unknown user) — nothing about *why*.
  return new ApiTokenAuthError(401, "Invalid or expired API token");
}

// `supabase` is injectable for tests; production always uses the default
// service-role client. Every caller shares this single authentication path.
export async function authenticateApiToken(
  req: Request,
  supabase: SupabaseClient = createAdminClient()
): Promise<ApiTokenContext> {
  // 1–2. Extract and confirm Bearer authentication.
  const header = req.headers.get("authorization");
  if (!header || !/^Bearer\s+/i.test(header)) throw unauthorized();
  const token = header.replace(/^Bearer\s+/i, "").trim();

  // 3. Expected nxo_ format.
  if (!isApiTokenFormat(token)) throw unauthorized();

  // 4–5. Hash with the same mechanism; find the record by exact hash match.
  const tokenHash = hashApiToken(token);
  const { data: row, error } = await supabase
    .from("api_tokens")
    .select("id, user_id, name, token_hash, scopes, revoked_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !row || !tokenMatches(token, row.token_hash)) throw unauthorized();

  // 6–8. Revocation, expiry, and user validity.
  if (row.revoked_at) throw unauthorized();
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) throw unauthorized();
  if (!(await userExists(supabase, row.user_id))) throw unauthorized();

  // Rate limit per token (Phase 9) — checked only for tokens that are valid.
  const rate = checkTokenRateLimit(row.id);
  if (!rate.ok) {
    throw new ApiTokenAuthError(
      403,
      `API token rate limit exceeded. Retry in ${rate.retryAfterSeconds}s.`
    );
  }

  // 9. Touch last_used_at (best-effort, fire-and-forget — never blocks).
  void supabase
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(({ error: updateError }) => {
      if (updateError) console.warn("[api-tokens] last_used_at update failed");
    });

  // 10–11. Authenticated identity + scopes for the route to authorize with.
  return {
    userId: row.user_id,
    tokenId: row.id,
    tokenName: row.name,
    scopes: (row.scopes ?? []).filter((s: string): s is ApiTokenScope =>
      isApiTokenScope(s)
    ),
  };
}



async function userExists(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { error } = await supabase.auth.admin.getUserById(userId);
  // A missing user returns error.code === "user_not_found"; any *other*
  // error (network, config) must NOT silently fail open — fail closed.
  if (!error) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Scope enforcement (Phase 6): authorization is separate from authentication.
// ---------------------------------------------------------------------------

export class ScopeError extends Error {
  requiredScope: ApiTokenScope;
  constructor(requiredScope: ApiTokenScope) {
    super(`This API token lacks the required scope: ${requiredScope}`);
    this.name = "ScopeError";
    this.requiredScope = requiredScope;
  }
}

export function hasScope(ctx: ApiTokenContext, scope: ApiTokenScope): boolean {
  return ctx.scopes.includes(scope);
}

// Throws ScopeError (→ HTTP 403 at the route boundary) when the token is not
// authorized for `scope`. Never mentions which scopes the token *does* have.
export function requireScope(ctx: ApiTokenContext, scope: ApiTokenScope): void {
  if (!hasScope(ctx, scope)) throw new ScopeError(scope);
}

// Route-boundary helpers: map auth errors onto safe HTTP responses. Errors
// never include the supplied token or any hash material.
export function apiTokenErrorResponse(err: unknown): Response | null {
  if (err instanceof ApiTokenAuthError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (err instanceof ScopeError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
