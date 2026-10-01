import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only admin client (service role). Used exclusively where RLS cannot
// apply because the request carries a Nexus API token (`nxo_live_...`) instead
// of a Supabase session: token lookup, last_used_at updates, and serving
// token-authenticated requests. Every query on this path MUST scope rows by
// the authenticated user explicitly — RLS is bypassed here.
//
// Web-session routes keep using createClient() from lib/supabase/server.
let admin: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (admin) return admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  admin = createClient(url, serviceKey, {
    auth: {
      // No session/cookie machinery on the admin client — it never acts as a
      // signed-in browser user, and persisting sessions would be wrong here.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return admin;
}
