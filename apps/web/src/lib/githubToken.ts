// Shared understanding of "what is actually wrong with this user's GitHub
// connection". Before this module, every route folded three very different
// situations into one null token and one RECONNECT_GITHUB response:
//
//   1. token absent            → user never connected (or revoked app-side)
//   2. token undecryptable     → vault row exists but fails its GCM auth tag
//                                (NEXUS_ENCRYPTION_KEY changed/missing since
//                                it was written) — reconnecting OAuth does
//                                NOT fix this; re-entering the key does
//   3. token present but GitHub rejects it / lacks scope → reconnect fixes it
//
// GitHub OAuth tokens (the only kind this app stores — via Supabase
// signInWithOAuth provider_token) do not expire on a timer, and this app has
// no GitHub App / refresh-token flow, so "expired" was never the real state.
// Rate limits (403 "rate limit exceeded") were also misreported as reconnect
// requests. See TESTING.md → Deployment → GitHub connection notes.

import { NextResponse } from "next/server";

export type GitHubConnectionState =
  | "ok"
  | "not_connected" // no token in the vault at all
  | "undecryptable" // token stored but unreadable — server-side key problem
  | "unauthorized"; // GitHub rejected the token (revoked) or scope insufficient

export interface GitHubTokenResult {
  token: string | null;
  state: GitHubConnectionState;
  // Machine-readable reason for the API response / server log.
  code: "OK" | "GITHUB_NOT_CONNECTED" | "GITHUB_TOKEN_UNREADABLE";
}

export function resolveGitHubTokenError(
  tokenState: "ok" | "missing" | "undecryptable"
): GitHubTokenResult {
  if (tokenState === "ok") return { token: null, state: "ok", code: "OK" };
  if (tokenState === "missing") {
    return { token: null, state: "not_connected", code: "GITHUB_NOT_CONNECTED" };
  }
  return { token: null, state: "undecryptable", code: "GITHUB_TOKEN_UNREADABLE" };
}

// Maps a thrown error from the shared GitHub client (or any layer) onto the
// connection state the UI should present. Rate limits are NOT a connection
// problem — they get their own code so the picker can say "try again soon"
// instead of demanding a reconnect.
export type GitHubCallFailure =
  | "unauthorized" // 401 — token revoked/rejected → reconnect
  | "scope" // 403 (non-rate-limit) — token lacks permission → reconnect with broader scopes
  | "rate_limited" // 403/429 rate limit → retry later, reconnect pointless
  | "network" // fetch failed / timeout → retry
  | "other";

export function classifyGitHubCallError(err: unknown): GitHubCallFailure {
  const message = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|network|ENOTFOUND|ECONNRESET|ETIMEDOUT|aborted/i.test(message)) {
    return "network";
  }
  if (/\brate limit\b/i.test(message)) return "rate_limited";
  if (/\b401\b/.test(message)) return "unauthorized";
  if (/\b403\b/.test(message)) return "scope";
  return "other";
}

// The canonical per-state API response bodies. All legacy consumers key on
// error === "RECONNECT_GITHUB", which is now emitted ONLY for the two states
// reconnecting can actually fix.
export const GITHUB_TOKEN_ERRORS = {
  GITHUB_NOT_CONNECTED: { error: "RECONNECT_GITHUB", reason: "not_connected" },
  GITHUB_TOKEN_UNREADABLE: {
    error: "RECONNECT_GITHUB",
    reason: "token_unreadable",
  },
} as const;

// Ready-to-return NextResponse for a failed token resolution. 401 for
// "never connected" (reconnect applies); 503 for "stored but unreadable"
// (a server-side key problem — reconnecting cannot fix it, so it must not
// look like a normal auth challenge).
export function githubTokenErrorResponse(result: GitHubTokenResult): NextResponse {
  if (result.code === "GITHUB_NOT_CONNECTED") {
    return NextResponse.json(GITHUB_TOKEN_ERRORS.GITHUB_NOT_CONNECTED, { status: 401 });
  }
  return NextResponse.json(GITHUB_TOKEN_ERRORS.GITHUB_TOKEN_UNREADABLE, { status: 503 });
}

// One-line server log for diagnosing recurring reports — the exact detail
// the original bug report asked for ("log the actual error, not the generic
// fallback"). Never logs the token itself, only its shape.
export function logGitHubTokenState(
  route: string,
  userId: string,
  state: "missing" | "undecryptable"
): void {
  const shape =
    state === "undecryptable"
      ? "stored ciphertext exists but decryption failed (NEXUS_ENCRYPTION_KEY changed/missing?)"
      : "no token row found";
  console.error(
    `[github-token] ${route}: user=${userId} state=${state} — ${shape}`
  );
}
