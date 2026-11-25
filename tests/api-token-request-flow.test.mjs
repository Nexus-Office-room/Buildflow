import "./register-loader.mjs";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateApiToken } from "@/lib/apiTokens";

// ---------------------------------------------------------------------------
// requestIdentity helpers on the token path: scopedClient picks the admin
// client for tokens and the session client otherwise, and
// assertProjectOwnership enforces ownership explicitly for tokens only.
// The helpers are pure routing/DB-shape logic, so a small stub suffices.
// ---------------------------------------------------------------------------

// Minimal stub: from().select().eq().eq().maybeSingle() chain that reports
// whether the requested row "exists" based on the recorded filters.
function stubSupabase({ exists = true, error = null } = {}) {
  const queries = [];
  const chain = () => {
    const q = { filters: [], table: null, result: { data: exists ? { id: "p1" } : null, error } };
    const builder = {
      select: () => builder,
      eq: (col, val) => {
        q.filters.push([col, val]);
        return builder;
      },
      maybeSingle: async () => {
        queries.push(q);
        // Ownership holds iff user_id was among the eq filters.
        const hasUserFilter = q.filters.some(([col]) => col === "user_id");
        return hasUserFilter ? q.result : { data: null, error: { message: "stub" } };
      },
      single: async () => q.result,
    };
    return builder;
  };
  return {
    from: (table) => {
      const b = chain();
      b.tableValue = table;
      // expose table for assertions
      b.from = table;
      return b;
    },
    queries,
  };
}

// Pull the real module through the alias loader. requestScope is kept free
// of Next.js imports so it loads in plain Node.
const { assertProjectOwnership } = await import("@/lib/requestScope");

describe("token-path request helpers", () => {
  const tokenIdentity = {
    userId: "u1",
    email: null,
    token: { userId: "u1", tokenId: "t1", tokenName: "CLI", scopes: ["projects:read"] },
  };
  const sessionIdentity = { userId: "u1", email: "u1@example.com" };

  test("assertProjectOwnership is a no-op on the session path (RLS governs)", async () => {
    const supabase = stubSupabase({ exists: false });
    const res = await assertProjectOwnership(supabase, sessionIdentity, "p1");
    assert.equal(res, null, "session requests must not hit the ownership query");
    assert.equal(supabase.queries.length, 0);
  });

  test("assertProjectOwnership queries with the token's user_id filter", async () => {
    const supabase = stubSupabase({ exists: true });
    const res = await assertProjectOwnership(supabase, tokenIdentity, "p1");
    assert.equal(res, null);
    const q = supabase.queries[0];
    assert.ok(q.filters.some(([col, val]) => col === "user_id" && val === "u1"));
    assert.ok(q.filters.some(([col, val]) => col === "id" && val === "p1"));
  });

  test("assertProjectOwnership returns 404 (not 403) for a foreign project", async () => {
    const supabase = stubSupabase({ exists: false });
    const res = await assertProjectOwnership(supabase, tokenIdentity, "other-users-project");
    assert.ok(res);
    assert.equal(res.status, 404, "must be indistinguishable from a missing project");
    const body = await res.json();
    assert.equal(body.error, "Project not found");
  });

  test("assertProjectOwnership fails closed on a DB error", async () => {
    const supabase = stubSupabase({ error: { message: "boom" } });
    const res = await assertProjectOwnership(supabase, tokenIdentity, "p1");
    assert.ok(res);
    assert.equal(res.status, 404);
  });
});

// ---------------------------------------------------------------------------
// The nxo_ format gate used by the CLI before storing anything.
// ---------------------------------------------------------------------------

describe("CLI api-token format gate", () => {
  test("generated tokens always pass the structural check", async () => {
    const { token } = generateApiToken("live");
    assert.match(token, /^nxo_(live|test)_[A-Za-z0-9_-]{40,}$/);
  });
});
