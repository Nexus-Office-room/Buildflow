import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  authenticateApiToken,
  apiTokenErrorResponse,
  requireScope,
  type ApiTokenContext,
  type ApiTokenScope,
} from "@/lib/apiTokens";
import { assertProjectOwnership } from "@/lib/requestScope";

export { apiTokenErrorResponse };

// Route-level authentication helper: web sessions (cookie) and Nexus API
// tokens (Authorization: Bearer nxo_live_...) resolve to the same identity
// shape. The CLI and api-client never create a second auth system — they go
// through the exact same authenticateApiToken() the API routes use.

export interface RequestIdentity {
  userId: string;
  email: string | null;
  // Present only for API-token requests (used for audit attribution).
  token?: ApiTokenContext;
}

// Two independent singletons (web client per request; token context per auth)
// would double-read the DB, so this resolves exactly one identity per request.
export async function getRequestIdentity(req: Request): Promise<
  { identity: RequestIdentity } | { response: Response }
> {
  const authHeader = req.headers.get("authorization");
  if (authHeader && /^Bearer\s+nxo_/i.test(authHeader)) {
    // API-token path (CLI / api-client). Failure modes map to 401/403 with
    // safe, non-revealing messages.
    try {
      const ctx = await authenticateApiToken(req);
      return { identity: { userId: ctx.userId, email: null, token: ctx } };
    } catch (err) {
      const safe = apiTokenErrorResponse(err);
      return {
        response: safe ?? new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
      };
    }
  }

  // Web-session path (browser). Unchanged behavior for existing UI calls.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) };
  }
  return { identity: { userId: user.id, email: user.email ?? null } };
}

// Convenience for token-scoped routes: enforce a scope when the request came
// in with an API token. Web-session requests are always authorized (the UI is
// the owner acting directly); tokens must hold the scope.
export function requireScopeForRequest(
  identity: RequestIdentity,
  scope: ApiTokenScope
): void {
  if (identity.token) requireScope(identity.token, scope);
}

// Resolves the Supabase client for a dual-auth route: the session client
// (cookie auth, RLS applies) for browser requests, or the service-role
// client for API-token requests. The admin client bypasses RLS, so every
// query on that path MUST filter by the token's user_id — use
// assertProjectOwnership for project-scoped rows.
export async function scopedClient(identity: RequestIdentity): Promise<SupabaseClient> {
  return identity.token ? createAdminClient() : createClient();
}

export { assertProjectOwnership };

// Audit attribution (Phase 10): names the credential behind an action without
// ever including the raw token, its hash, or the authorization header. Used as
// audit metadata, e.g. { via: "API token: My laptop CLI" }.
export function auditAttribution(identity: RequestIdentity): string {
  return identity.token ? `API token: ${identity.token.tokenName}` : "web session";
}

export type { User };
