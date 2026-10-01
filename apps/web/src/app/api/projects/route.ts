import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestIdentity, requireScopeForRequest, apiTokenErrorResponse, type RequestIdentity } from "@/lib/requestIdentity";
import { DEFAULT_PROVIDER_CONFIG } from "@/lib/providers";
import { ROLES } from "@/types/db";

// Resolves the Supabase client for the request: session-cookie client for the
// browser (RLS applies) or the service-role client for API-token requests
// (RLS is bypassed, so every query below filters by the token's user_id —
// see lib/requestIdentity). Keeping one client per request preserves all
// existing session behavior exactly.
async function scopedClient(identity: RequestIdentity) {
  if (identity.token) return createAdminClient();
  return createClient();
}

export async function GET(req: Request) {
  // Dual auth: browser session or Nexus API token (projects:read).
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
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data });
}

export async function POST(req: Request) {
  const auth = await getRequestIdentity(req);
  if ("response" in auth) return auth.response;
  try {
    requireScopeForRequest(auth.identity, "projects:read");
  } catch (err) {
    const safe = apiTokenErrorResponse(err);
    if (safe) return safe;
    throw err;
  }
  const userId = auth.identity.userId;
  const supabase = await scopedClient(auth.identity);

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ name, user_id: userId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Seed the persistent memory row immediately so the Memory Board has
  // something to show even before the first pipeline run.
  await supabase.from("project_memory").insert({ project_id: project.id });

  // Seed explicit role_models rows using the default provider so the
  // Settings UI shows what will actually run (and this stays correct if
  // DEFAULT_PROVIDER_CONFIG ever changes after other projects already
  // have their own saved rows).
  await supabase.from("role_models").insert(
    ROLES.map((role) => ({
      project_id: project.id,
      role,
      provider: DEFAULT_PROVIDER_CONFIG.provider,
      model: DEFAULT_PROVIDER_CONFIG.model,
    }))
  );

  return NextResponse.json({ project }, { status: 201 });
}
