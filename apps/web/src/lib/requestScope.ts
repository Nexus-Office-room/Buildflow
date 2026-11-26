import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestIdentity } from "@/lib/requestIdentity";

// Project-scoped guard for token-authenticated requests. With the admin
// client RLS is bypassed, so "the user can see this project" must be checked
// explicitly. Web-session requests keep their RLS-backed behavior unchanged
// (their ownership is enforced by row-level security inside every query).
//
// Kept free of Next.js imports (no next/headers) so the logic is testable
// in plain Node — requestIdentity re-exports this for route use.

export async function assertProjectOwnership(
  supabase: SupabaseClient,
  identity: RequestIdentity,
  projectId: string
): Promise<Response | null> {
  if (!identity.token) return null; // session path: RLS already scopes this
  const { data: project, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", identity.userId)
    .maybeSingle();
  // Both a DB error and a missing row map to the same 404: existence of a
  // foreign project must be indistinguishable from a nonexistent one.
  if (error || !project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  return null;
}
