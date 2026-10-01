import "./register-loader.mjs";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  authenticateApiToken,
  generateApiToken,
  hashApiToken,
  requireScope,
  hasScope,
  ScopeError,
  ApiTokenAuthError,
  apiTokenErrorResponse,
} from "@/lib/apiTokens";

// ---------------------------------------------------------------------------
// Minimal Supabase stub: just enough of the PostgREST chain used by
// authenticateApiToken (from -> select -> eq -> maybeSingle) plus
// auth.admin.getUserById and the last_used_at update chain.
// ---------------------------------------------------------------------------
function stubClient({ row, userExists = true, updateError = null }) {
  const updates = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: row ?? null, error: null }),
    update: (values) => {
      updates.push(values);
      return {
        eq: async () => ({ error: updateError }),
        then(resolve) {
          return Promise.resolve({ error: updateError }).then(resolve);
        },
      };
    },
  };
  return {
    from: () => chain,
    updates,
    auth: {
      admin: {
        getUserById: async () => (userExists ? { data: { id: "u1" }, error: null } : { data: null, error: { code: "user_not_found" } }),
      },
    },
  };
}

function reqWith(token) {
  return new Request("http://localhost:3000/api/projects", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const baseRow = (over = {}) => ({
  id: "tok-1",
  user_id: "u1",
  name: "My laptop CLI",
  token_hash: null,
  scopes: ["projects:read", "vault:read"],
  revoked_at: null,
  expires_at: null,
  ...over,
});

// ---------------------------------------------------------------------------
// 5. Token authentication — valid token
// ---------------------------------------------------------------------------
describe("authenticateApiToken", () => {
  test("accepts a valid token and returns identity + scopes", async () => {
    const { token } = generateApiToken("live");
    const client = stubClient({ row: baseRow({ token_hash: hashApiToken(token) }) });
    const ctx = await authenticateApiToken(reqWith(token), client);
    assert.equal(ctx.userId, "u1");
    assert.equal(ctx.tokenId, "tok-1");
    assert.equal(ctx.tokenName, "My laptop CLI");
    assert.deepEqual(ctx.scopes, ["projects:read", "vault:read"]);
  });

  test("updates last_used_at (fire-and-forget)", async () => {
    const { token } = generateApiToken();
    const client = stubClient({ row: baseRow({ token_hash: hashApiToken(token) }) });
    await authenticateApiToken(reqWith(token), client);
    await new Promise((r) => setImmediate(r));
    assert.equal(client.updates.length, 1);
    assert.ok(client.updates[0].last_used_at, "last_used_at set");
  });

  // ---------------------------------------------------------------------
  // 6. Invalid tokens
  // ---------------------------------------------------------------------
  test("rejects a missing Authorization header with 401", async () => {
    await assert.rejects(
      () => authenticateApiToken(reqWith(null), stubClient({ row: null })),
      (err) => err instanceof ApiTokenAuthError && err.status === 401
    );
  });

  test("rejects a non-Bearer scheme with 401", async () => {
    const req = new Request("http://x", { headers: { Authorization: "Basic abc" } });
    await assert.rejects(() => authenticateApiToken(req, stubClient({ row: null })), ApiTokenAuthError);
  });

  test("rejects a token with the wrong scheme (not nxo_) with 401", async () => {
    await assert.rejects(
      () => authenticateApiToken(reqWith("sk_live_abcdefghijklmnopqrstuvwx"), stubClient({ row: null })),
      ApiTokenAuthError
    );
  });

  test("rejects an unknown token (no matching hash) with 401", async () => {
    const { token } = generateApiToken();
    await assert.rejects(
      () => authenticateApiToken(reqWith(token), stubClient({ row: null })),
      (err) => err instanceof ApiTokenAuthError && err.status === 401
    );
  });

  test("rejects a token whose hash does not match the stored hash with 401", async () => {
    const { token } = generateApiToken();
    const client = stubClient({ row: baseRow({ token_hash: "0".repeat(64) }) });
    await assert.rejects(() => authenticateApiToken(reqWith(token), client), ApiTokenAuthError);
  });

  // ---------------------------------------------------------------------
  // 7. Revoked token
  // ---------------------------------------------------------------------
  test("rejects a revoked token with 401", async () => {
    const { token } = generateApiToken();
    const client = stubClient({
      row: baseRow({ token_hash: hashApiToken(token), revoked_at: new Date().toISOString() }),
    });
    await assert.rejects(() => authenticateApiToken(reqWith(token), client), ApiTokenAuthError);
  });

  // ---------------------------------------------------------------------
  // 8. Expired token
  // ---------------------------------------------------------------------
  test("rejects an expired token with 401", async () => {
    const { token } = generateApiToken();
    const client = stubClient({
      row: baseRow({ token_hash: hashApiToken(token), expires_at: new Date(Date.now() - 1000).toISOString() }),
    });
    await assert.rejects(() => authenticateApiToken(reqWith(token), client), ApiTokenAuthError);
  });

  test("accepts a token that expires in the future", async () => {
    const { token } = generateApiToken();
    const client = stubClient({
      row: baseRow({ token_hash: hashApiToken(token), expires_at: new Date(Date.now() + 86_400_000).toISOString() }),
    });
    const ctx = await authenticateApiToken(reqWith(token), client);
    assert.equal(ctx.userId, "u1");
  });

  // ---------------------------------------------------------------------
  // Leak prevention: identical, non-revealing 401 for every failure mode
  // ---------------------------------------------------------------------
  test("all 401 failure modes return the same generic message (no oracle)", async () => {
    const { token } = generateApiToken();
    const cases = [
      async () => authenticateApiToken(reqWith(null), stubClient({ row: null })),
      async () => authenticateApiToken(reqWith("nxo_live_totallyunknownvalueaaaaaaaaaaaaaaaaaaaaaa"), stubClient({ row: null })),
      async () =>
        authenticateApiToken(reqWith(token), stubClient({ row: baseRow({ token_hash: hashApiToken(token), revoked_at: "2020-01-01" }) })),
      async () =>
        authenticateApiToken(reqWith(token), stubClient({ row: baseRow({ token_hash: hashApiToken(token), expires_at: "2020-01-01" }) })),
    ];
    const messages = new Set();
    for (const fn of cases) {
      try {
        await fn();
        assert.fail("should have thrown");
      } catch (err) {
        assert.ok(err instanceof ApiTokenAuthError && err.status === 401);
        messages.add(err.message);
      }
    }
    assert.equal(messages.size, 1, "one generic message for all failure modes");
  });

  test("error responses never contain the token or hash material", async () => {
    const { token, tokenHash } = generateApiToken();
    const client = stubClient({ row: baseRow({ token_hash: tokenHash, revoked_at: "2020-01-01" }) });
    try {
      await authenticateApiToken(reqWith(token), client);
      assert.fail("should have thrown");
    } catch (err) {
      const res = apiTokenErrorResponse(err);
      assert.ok(res);
      assert.equal(res.status, 401);
      const body = await res.text();
      assert.ok(!body.includes(token), "raw token must not leak");
      assert.ok(!body.includes(tokenHash), "hash must not leak");
    }
  });
});

// ---------------------------------------------------------------------------
// 10–11. Scope enforcement
// ---------------------------------------------------------------------------
describe("scope enforcement", () => {
  const ctx = (scopes) => ({ userId: "u1", tokenId: "t", tokenName: "n", scopes });

  test("hasScope/requireScope accept a token holding the scope", () => {
    const c = ctx(["projects:read", "vault:write"]);
    assert.ok(hasScope(c, "projects:read"));
    assert.doesNotThrow(() => requireScope(c, "vault:write"));
  });

  test("requireScope throws ScopeError for a missing scope", () => {
    const c = ctx(["projects:read"]);
    assert.throws(() => requireScope(c, "deploy:trigger"), ScopeError);
    assert.throws(() => requireScope(c, "vault:write"), ScopeError);
  });

  test("ScopeError maps to HTTP 403 with a safe message", async () => {
    const c = ctx(["projects:read"]);
    try {
      requireScope(c, "deploy:trigger");
      assert.fail("should have thrown");
    } catch (err) {
      const res = apiTokenErrorResponse(err);
      assert.ok(res);
      assert.equal(res.status, 403);
      const body = await res.text();
      assert.match(body, /lacks the required scope/);
      assert.ok(!body.includes("nxo_"), "no token material in 403");
    }
  });
});
