#!/usr/bin/env node
// E2E: the full nxo_ API-token lifecycle against a live web app + Supabase.
//
// Run with:  NEXUS_E2E=1 npm run test:e2e
//
// Environment (in order of preference):
//   1. A running local Supabase stack (`supabase start`) — the script reads
//      `supabase status -o env` for the URL/keys and always uses those.
//   2. NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from
//      .env.local, plus SUPABASE_SERVICE_ROLE_KEY if present.
//
// The script boots `next dev` on a scratch port with those credentials,
// signs up a throwaway user via the Supabase REST auth API, mints a real
// nxo_live_ token through /api/account/api-tokens, then exercises the
// scoped routes: allowed scope → 200, missing scope → 403, revoked token
// → 401. Skips cleanly (exit 0) when prerequisites are missing.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "apps", "web");

function envLocal(dir) {
  const file = path.join(dir, ".env.local");
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function supabaseLocalEnv() {
  try {
    const res = spawnSync("npx", ["supabase", "status", "-o", "env"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 60_000,
    });
    if (res.status !== 0) return null;
    const env = {};
    for (const line of res.stdout.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
    if (env.API_URL && (env.SERVICE_ROLE_KEY || env.SECRET_KEY)) return env;
    return null;
  } catch {
    return null;
  }
}

const fileEnv = { ...envLocal(ROOT), ...envLocal(WEB) };
const local = supabaseLocalEnv();

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  local?.API_URL ??
  fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  local?.ANON_KEY ??
  fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  local?.SERVICE_ROLE_KEY ??
  local?.SECRET_KEY ??
  fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (process.env.NEXUS_E2E !== "1") {
  console.log("SKIP: NEXUS_E2E=1 not set (this test boots a live server).");
  process.exit(0);
}
if (!SUPABASE_URL || !ANON_KEY) {
  console.log("SKIP: no Supabase URL/anon key available (.env.local or `supabase start`).");
  process.exit(0);
}

const PORT = 3977 + Math.floor(Math.random() * 100);
const WEB_URL = `http://127.0.0.1:${PORT}`;
const EMAIL = `e2e-nxo-${Date.now()}@example.com`;
const PASSWORD = `pw-${Math.random().toString(36).slice(2)}-A1!`;

let server;
let passed = 0;
let failed = 0;

function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✕ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function api(pathname, init = {}, token) {
  const headers = { "Content-Type": "application/json", ...(init.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${WEB_URL}${pathname}`, { ...init, headers });
}

async function waitForServer(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${WEB_URL}/login`, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function main() {
  console.log(`E2E nxo_ token flow — web on ${WEB_URL}, supabase ${SUPABASE_URL}`);

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: WEB,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      // The token-auth path uses the service-role client; the local stack
      // provides a deterministic dev key. Absent key → covered by the
      // graceful-skip below on the first token-authenticated call.
      ...(SERVICE_ROLE_KEY ? { SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY } : {}),
      NEXUS_MOCK_LLM: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});

  if (!(await waitForServer())) {
    throw new Error("next dev did not become ready in time");
  }
  console.log("  ✓ next dev ready");

  // 1. Throwaway user via Supabase REST signup (local stacks auto-confirm).
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const signup = await signupRes.json().catch(() => null);
  const supabaseToken = signup?.access_token;
  if (!supabaseToken) {
    console.log(
      "SKIP: signup returned no session (email confirmation enabled?) — cannot drive the cookie-free token flow."
    );
    return;
  }
  ok("test user signed up", Boolean(supabaseToken));

  // 2. Mint an nxo_ token (scoped read-only) through the management route.
  const createRes = await api(
    "/api/account/api-tokens",
    { method: "POST", body: JSON.stringify({ name: "e2e runner", scopes: ["projects:read"] }) },
    supabaseToken
  );
  const created = await createRes.json().catch(() => null);
  ok("token created (201)", createRes.status === 201, `got ${createRes.status}`);
  const nxoToken = created?.token;
  ok("token has nxo_live_ shape", /^nxo_live_[A-Za-z0-9_-]{43}$/.test(nxoToken ?? ""));

  // 3. Scoped calls.
  const listRes = await api("/api/projects", {}, nxoToken);
  ok("GET /api/projects 200 with projects:read", listRes.status === 200);
  const listBody = await listRes.json().catch(() => null);
  ok("projects array present", Array.isArray(listBody?.projects));

  const deniedCreate = await api(
    "/api/projects",
    { method: "POST", body: JSON.stringify({ name: "denied" }) },
    nxoToken
  );
  ok("read-only token cannot create projects", deniedCreate.status === 403, `got ${deniedCreate.status}`);

  const writeTokenRes = await api(
    "/api/account/api-tokens",
    { method: "POST", body: JSON.stringify({ name: "e2e writer", scopes: ["projects:write"] }) },
    supabaseToken
  );
  ok("write token created", writeTokenRes.status === 201, `got ${writeTokenRes.status}`);
  const writeToken = (await writeTokenRes.json().catch(() => null))?.token;
  const createProject = await api(
    "/api/projects",
    { method: "POST", body: JSON.stringify({ name: "e2e-nxo-proj" }) },
    writeToken
  );
  ok("write token creates project", createProject.status === 201, `got ${createProject.status}`);
  const projectId = (await createProject.json().catch(() => null))?.project?.id;
  ok("project id returned", typeof projectId === "string");
  const deniedPatch = await api(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ github_repo: "example/denied" }) }, nxoToken);
  ok("read-only token cannot update projects", deniedPatch.status === 403, `got ${deniedPatch.status}`);
  const writePatch = await api(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ github_repo: "example/allowed" }) }, writeToken);
  ok("write token updates own project", writePatch.status === 200, `got ${writePatch.status}`);
  const deniedRead = await api("/api/projects", {}, writeToken);
  ok("write scope does not grant read scope", deniedRead.status === 403, `got ${deniedRead.status}`);

  const who = await api("/api/me/display-name", {}, nxoToken);
  const whoBody = await who.json().catch(() => null);
  ok("whoami 200", who.status === 200);
  ok("whoami reports api_token", whoBody?.via === "api_token");
  ok(
    "whoami echoes token name + scopes",
    whoBody?.apiToken?.name === "e2e runner" && Array.isArray(whoBody?.apiToken?.scopes)
  );

  // 4. Missing scopes → 403 (server names only the missing scope).
  const pipelineRes = await api(
    "/api/pipeline",
    { method: "POST", body: JSON.stringify({ projectId, message: "hi" }) },
    nxoToken
  );
  ok("pipeline without pipeline:run → 403", pipelineRes.status === 403, `got ${pipelineRes.status}`);

  const promptsRes = await api("/api/prompts", {}, nxoToken);
  ok("prompts without vault:read → 403", promptsRes.status === 403, `got ${promptsRes.status}`);

  const deployRes = await api(`/api/projects/${projectId}/deploy`, { method: "POST", body: "{}" }, nxoToken);
  ok("deploy without deploy:trigger → 403", deployRes.status === 403, `got ${deployRes.status}`);

  // 5. Revocation → 401 everywhere.
  const listTokens = await api("/api/account/api-tokens", {}, supabaseToken);
  const tokensBody = await listTokens.json().catch(() => null);
  const tokenId = tokensBody?.tokens?.find((t) => t.token_prefix === nxoToken.slice(0, 17))?.id;
  ok("token listed for owner", Boolean(tokenId));

  const revokeRes = await api(
    "/api/account/api-tokens",
    { method: "DELETE", body: JSON.stringify({ id: tokenId }) },
    supabaseToken
  );
  ok("revoke 200", revokeRes.status === 200, `got ${revokeRes.status}`);

  const revokedRes = await api("/api/projects", {}, nxoToken);
  ok("revoked token → 401", revokedRes.status === 401, `got ${revokedRes.status}`);

  // ---------------------------------------------------------------------
  // 6. Cross-tenant security: a SECOND user's token must not touch the
  // first user's project. Ownership failures must be 404 (existence of a
  // foreign project must not be distinguishable from a missing one).
  // ---------------------------------------------------------------------
  const email2 = `e2e-nxo-b-${Date.now()}@example.com`;
  const signup2 = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email2, password: PASSWORD }),
  });
  const session2 = (await signup2.json().catch(() => null))?.access_token;
  ok("second user signed up", Boolean(session2));

  const create2 = await api(
    "/api/account/api-tokens",
    { method: "POST", body: JSON.stringify({ name: "attacker probe", scopes: ["projects:read", "projects:write", "pipeline:run", "deploy:trigger"] }) },
    session2
  );
  const nxo2 = (await create2.json().catch(() => null))?.token;
  ok("second user's token created", typeof nxo2 === "string");

  // projects:read lists ONLY your own projects (admin-client path must not leak).
  const list2 = await api("/api/projects", {}, nxo2);
  const list2Body = await list2.json().catch(() => null);
  const leaked = (list2Body?.projects ?? []).some((p) => p.id === projectId);
  ok("foreign project NOT in second user's list", leaked === false);

  // Direct project access → 404, indistinguishable from nonexistent.
  const foreignGet = await api(`/api/projects/${projectId}`, {}, nxo2);
  ok("foreign project GET → 404", foreignGet.status === 404, `got ${foreignGet.status}`);

  const foreignPatch = await api(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ github_repo: "example/foreign" }) }, nxo2);
  ok("foreign project update → 404", foreignPatch.status === 404, `got ${foreignPatch.status}`);

  // Foreign pipeline run must be refused even with pipeline:run held.
  const foreignPipeline = await api(
    "/api/pipeline",
    { method: "POST", body: JSON.stringify({ projectId, message: "own this project" }) },
    nxo2
  );
  ok("foreign project pipeline → 404/403", foreignPipeline.status === 404 || foreignPipeline.status === 403, `got ${foreignPipeline.status}`);

  // Foreign deploy must be refused even with deploy:trigger held.
  const foreignDeploy = await api(
    `/api/projects/${projectId}/deploy`,
    { method: "POST", body: JSON.stringify({ confirmed: true }) },
    nxo2
  );
  ok("foreign project deploy → 404/403", foreignDeploy.status === 404 || foreignDeploy.status === 403, `got ${foreignDeploy.status}`);

  // Foreign merge (write path) refused too.
  const foreignMerge = await api(
    `/api/projects/${projectId}/merge`,
    { method: "POST", body: JSON.stringify({ runId: "00000000-0000-0000-0000-000000000000" }) },
    nxo2
  );
  ok("foreign project merge → 404/403", foreignMerge.status === 404 || foreignMerge.status === 403, `got ${foreignMerge.status}`);

  // whoami must never echo token material.
  const whoBodyText = await (await api("/api/me/display-name", {}, nxo2)).text();
  ok("whoami leaks no token material", !whoBodyText.includes("nxo_") && !whoBodyText.includes(nxo2));
}

main()
  .catch((err) => {
    failed++;
    console.log(`  ✕ ${err?.message ?? err}`);
  })
  .finally(() => {
    server?.kill("SIGTERM");
    // Give next dev a moment, then clear its scratch build dir? Keep .next —
    // it is gitignored and speeds up later runs.
    console.log(`\nE2E result: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  });
