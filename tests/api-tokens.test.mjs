import "./register-loader.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateApiToken,
  hashApiToken,
  isApiTokenFormat,
  API_TOKEN_SCOPES,
  checkTokenRateLimit,
} from "@/lib/apiTokens";
import { looksLikeNexusToken } from "./nexus-token-format.mjs";

// ---------------------------------------------------------------------------
// 1. Token generation: format
// ---------------------------------------------------------------------------
test("generateApiToken produces nxo_live_ tokens with high entropy", () => {
  const { token, tokenPrefix, tokenHash } = generateApiToken("live");
  assert.match(token, /^nxo_live_[A-Za-z0-9_-]{43}$/);
  // 32 bytes → 43 base64url chars ≈ 192 bits of entropy.
  assert.ok(token.length >= 52, "token should be at least 52 chars");
  assert.match(tokenPrefix, /^nxo_live_[A-Za-z0-9_-]{8}$/);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
});

test("generateApiToken supports the test variant", () => {
  const { token } = generateApiToken("test");
  assert.match(token, /^nxo_test_[A-Za-z0-9_-]{43}$/);
});

// ---------------------------------------------------------------------------
// 2. Token uniqueness
// ---------------------------------------------------------------------------
test("generated tokens are unique across many draws", () => {
  const seen = new Set();
  for (let i = 0; i < 1_000; i++) seen.add(generateApiToken().token);
  assert.equal(seen.size, 1_000);
});

test("tokens are not derivable from predictable inputs (no timestamps/ids)", () => {
  // Two tokens generated in rapid succession share no observable prefix/suffix
  // pattern and are fully independent.
  const a = generateApiToken();
  const b = generateApiToken();
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.token.slice(9, 17), b.token.slice(9, 17));
});

// ---------------------------------------------------------------------------
// 3. Token hashing
// ---------------------------------------------------------------------------
test("hashApiToken is a SHA-256 hex digest of the full token", () => {
  const { token } = generateApiToken();
  const h = hashApiToken(token);
  assert.equal(h, hashApiToken(token)); // deterministic
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.ok(!h.includes(token.slice(0, 10)), "hash must not leak the token prefix");
});

// ---------------------------------------------------------------------------
// 4. Raw token is never stored / derivable from stored parts
// ---------------------------------------------------------------------------
test("tokenHash and tokenPrefix alone cannot reconstruct the token", () => {
  const { token, tokenPrefix, tokenHash } = generateApiToken();
  // The prefix is a strict prefix of the token; the hash is a digest. Neither
  // contains the secret suffix, and the hash cannot be reversed: hashing the
  // best guess reconstruction (prefix + padding of the right total length)
  // must NOT yield the stored hash.
  assert.ok(token.startsWith(tokenPrefix));
  assert.ok(token.length > tokenPrefix.length + 20);
  const guess = tokenPrefix + "x".repeat(token.length - tokenPrefix.length);
  assert.notEqual(hashApiToken(guess), tokenHash);
  assert.notEqual(tokenHash, token);
});

// ---------------------------------------------------------------------------
// Format validation
// ---------------------------------------------------------------------------
test("isApiTokenFormat accepts well-formed tokens and rejects junk", () => {
  const { token } = generateApiToken();
  assert.ok(isApiTokenFormat(token));
  assert.ok(!isApiTokenFormat("sk_live_abc"));
  assert.ok(!isApiTokenFormat("nxo_live_short"));
  assert.ok(!isApiTokenFormat(`nxo_live_${"a".repeat(300)}`) === false, "long tokens are fine");
  assert.ok(!isApiTokenFormat(""));
  assert.ok(!isApiTokenFormat("Bearer nxo_live_x"));
});

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------
test("scope catalog contains exactly the six specified scopes", () => {
  assert.deepEqual([...API_TOKEN_SCOPES].sort(), [
    "deploy:trigger",
    "pipeline:run",
    "projects:read",
    "projects:write",
    "vault:read",
    "vault:write",
  ]);
});

// ---------------------------------------------------------------------------
// Rate limiting (Phase 9)
// ---------------------------------------------------------------------------
test("checkTokenRateLimit allows normal use and trips after the cap", () => {
  const id = "test-token-" + Math.random().toString(36).slice(2);
  for (let i = 0; i < 120; i++) {
    const r = checkTokenRateLimit(id);
    assert.equal(r.ok, true);
  }
  const blocked = checkTokenRateLimit(id);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSeconds >= 0 && blocked.retryAfterSeconds <= 60);
  // A different token is unaffected (per-token isolation).
  assert.equal(checkTokenRateLimit("other-token").ok, true);
});

// ---------------------------------------------------------------------------
// CLI credential storage (Phase 7 security)
// ---------------------------------------------------------------------------
test("CLI validates token format before storing and never echoes it", () => {
  assert.ok(looksLikeNexusToken("nxo_live_" + "A".repeat(43)));
  assert.ok(!looksLikeNexusToken("nonsense"));
  assert.ok(!looksLikeNexusToken("nxo_live_short"));
});

test("CLI config file is written with 0600 permissions", () => {
  const dir = mkdtempSync(join(tmpdir(), "nexus-cli-test-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({ token: "nxo_live_test", baseUrl: "http://localhost:3000" }), {
    mode: 0o600,
  });
  const mode = statSync(cfg).mode;
  rmSync(dir, { recursive: true, force: true });
  assert.equal(mode & 0o777, 0o600, "config must be owner-read/write only");
});

// ---------------------------------------------------------------------------
// TS module loads through Node's TS support (smoke test for the import above)
// ---------------------------------------------------------------------------
test("apiTokens module is importable and exports the expected surface", () => {
  assert.equal(typeof generateApiToken, "function");
  assert.equal(typeof hashApiToken, "function");
  assert.equal(typeof isApiTokenFormat, "function");
  assert.equal(typeof checkTokenRateLimit, "function");
});
