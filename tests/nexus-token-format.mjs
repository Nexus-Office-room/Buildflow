// Structural check for Nexus API tokens, mirrored from the web app
// (apps/web/src/lib/apiTokens.ts), so tests can validate the format
// contract without importing the app surface.
export function looksLikeNexusToken(/** @type {string} */ token) {
  return /^nxo_(live|test)_[A-Za-z0-9_-]{40,}$/.test(token);
}
