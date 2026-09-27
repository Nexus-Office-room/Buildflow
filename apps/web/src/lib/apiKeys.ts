import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserProviderKey, getUserProviderKeyDetailed, type SecretRead } from "@/lib/secrets";

// Reads a user-scoped provider key (github, vercel, anthropic, …) through
// the secrets vault. Legacy api_keys rows are transparently migrated into
// the vault on first read (see lib/secrets).
export async function getDecryptedApiKey(
  supabase: SupabaseClient,
  userId: string,
  provider: string
): Promise<string | null> {
  return getUserProviderKey(supabase, userId, provider);
}

// Same, but distinguishes "never stored" from "stored but undecryptable" —
// the distinction the GitHub routes need to stop showing "reconnect" for
// server-side key problems. See lib/githubToken for the response mapping.
export async function getDecryptedApiKeyDetailed(
  supabase: SupabaseClient,
  userId: string,
  provider: string
): Promise<SecretRead> {
  return getUserProviderKeyDetailed(supabase, userId, provider);
}
