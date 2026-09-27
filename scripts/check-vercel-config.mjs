#!/usr/bin/env node
/**
 * Vercel deployment config guard for the Nexus Office monorepo.
 *
 * Fails when the Next.js app's location (apps/web) doesn't match what Vercel
 * will actually build — the misconfiguration that produced
 * NEXT_NO_ROUTES_MANIFEST / NEXT_OUTPUT_DIR_MISSING production failures after
 * the Addendum 17 monorepo move (see TESTING.md → Deployment → "Vercel Root
 * Directory / workspace build (monorepo)").
 *
 * Two tiers:
 *   1. Repo checks (always run): Next.js app location, apps/web/vercel.json
 *      (framework, workspace-root install command), lockfile/workspaces.
 *   2. Dashboard checks (only when VERCEL_TOKEN + VERCEL_PROJECT_ID are set):
 *      compares the live project's Root Directory / Install Command / Build
 *      Command against tier 1. The dashboard always overrides vercel.json, so
 *      this is the only tier that catches the real failure mode.
 *
 * Usage:
 *   node scripts/check-vercel-config.mjs [--ci] [--strict]
 *
 * Exit codes: 0 = pass (warnings allowed), 1 = failure.
 *   --ci      label output for CI (behavior identical)
 *   --strict  promote warnings to failures (e.g. fail when the dashboard
 *             cannot be reached)
 *
 * Fail-open policy: a dashboard check that cannot run (missing token, 401,
 * network error) warns instead of failing, unless --strict. A MISMATCH always
 * fails once the dashboard was actually read.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const CI = args.includes("--ci");
const STRICT = args.includes("--strict");

const root = process.cwd();
let failures = 0;
let warnings = 0;

const fail = (msg) => { failures += 1; console.error(`  ✗ ${msg}`); };
const warn = (msg) => { warnings += 1; console.warn(`  ⚠ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);
const info = (msg) => console.log(`  · ${msg}`);

const normalizeDir = (v) => String(v ?? "").trim().replace(/^\.\//, "").replace(/\/+$/, "");

/** Find the Next.js app under apps/ (single app expected). */
function detectAppDir() {
  // Test hook: pin the expected app dir without touching the real repo layout.
  if (process.env.NEXUS_EXPECTED_APP_DIR) return normalizeDir(process.env.NEXUS_EXPECTED_APP_DIR);
  const appsRoot = path.join(root, "apps");
  if (!existsSync(appsRoot)) return null;
  for (const entry of readdirSync(appsRoot)) {
    const pkgPath = path.join(appsRoot, entry, "package.json");
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps?.next) return `apps/${entry}`;
    } catch {
      // unreadable package.json — skip
    }
  }
  return null;
}

function readJsonIfExists(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return { __parseError: String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Tier 1: repo checks                                                 */
/* ------------------------------------------------------------------ */

console.log("Vercel config guard" + (CI ? " (ci)" : ""));
console.log("Tier 1 — repo checks:");

const appDir = detectAppDir();

if (!appDir) {
  fail("could not detect the Next.js app under apps/ (no package.json with a `next` dependency)");
} else {
  ok(`Next.js app detected at ${appDir}/`);

  const appPkg = readJsonIfExists(path.join(root, appDir, "package.json"));
  if (appPkg.__parseError || !appPkg.scripts?.build?.includes("next build")) {
    fail(`${appDir}/package.json has no build script running "next build"`);
  } else {
    ok(`${appDir}/package.json build script runs "next build"`);
  }

  const nextConfig = ["ts", "mjs", "js"].find((ext) =>
    existsSync(path.join(root, appDir, `next.config.${ext}`))
  );
  if (!nextConfig) {
    fail(`${appDir}/next.config.{ts,mjs,js} missing — is this still the app directory?`);
  } else {
    ok(`${appDir}/next.config.${nextConfig} present`);
  }

  const appVercelJson = readJsonIfExists(path.join(root, appDir, "vercel.json"));
  if (appVercelJson === null) {
    info(`no ${appDir}/vercel.json — relying on dashboard Install/Build Command`);
  } else if (appVercelJson.__parseError) {
    fail(`${appDir}/vercel.json is not valid JSON: ${appVercelJson.__parseError}`);
  } else {
    // This file is ONLY read when the dashboard Root Directory already points
    // at appDir — it cannot set Root Directory itself (dashboard/API only).
    if (appVercelJson.framework !== "nextjs") {
      warn(`${appDir}/vercel.json does not pin "framework": "nextjs"`);
    } else {
      ok(`${appDir}/vercel.json pins framework "nextjs"`);
    }
    const install = String(appVercelJson.installCommand ?? "");
    if (install && install.includes("../..")) {
      ok(`${appDir}/vercel.json installCommand installs from the workspace root (${install})`);
    } else if (install) {
      fail(
        `${appDir}/vercel.json installCommand (${install}) does not install from the workspace root — ` +
        "workspace siblings (packages/*) will not be linked; expected something like \"cd ../.. && npm ci\""
      );
    } else {
      warn(`${appDir}/vercel.json has no installCommand — Vercel's default installs only ${appDir}, which breaks workspace siblings`);
    }
    const build = String(appVercelJson.buildCommand ?? "");
    if (build && !build.includes("next build")) {
      warn(`${appDir}/vercel.json buildCommand (${build}) does not run "next build"`);
    }
  }

  if (existsSync(path.join(root, "vercel.json"))) {
    warn(
      "a vercel.json exists at the repo root — it is IGNORED once the dashboard Root Directory " +
      "points at a subfolder; move its settings into apps/web/vercel.json"
    );
  }

  const rootPkg = readJsonIfExists(path.join(root, "package.json"));
  const workspaces = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : null;
  if (!workspaces) {
    fail("root package.json does not declare workspaces");
  } else if (!workspaces.includes("apps/*") || !workspaces.includes("packages/*")) {
    warn(`root package.json workspaces (${workspaces.join(", ")}) does not cover apps/* and packages/*`);
  } else {
    ok("root package.json declares workspaces apps/* + packages/*");
  }
  if (!existsSync(path.join(root, "package-lock.json"))) {
    warn("no package-lock.json at the repo root — npm ci on Vercel/CI will fail");
  }
}

/* ------------------------------------------------------------------ */
/* Tier 2: dashboard checks (env-gated)                                */
/* ------------------------------------------------------------------ */

console.log("Tier 2 — Vercel dashboard checks:");

const token = process.env.VERCEL_TOKEN;
const projectId = process.env.VERCEL_PROJECT_ID;
const teamId = process.env.VERCEL_TEAM_ID;

if (!token || !projectId) {
  const msg =
    "skipped: set VERCEL_TOKEN + VERCEL_PROJECT_ID (env vars locally; GitHub Actions secrets in CI) " +
    "to compare against the live project settings — this is the only check that catches a " +
    "Root Directory drift, which is what broke production";
  if (STRICT) fail(msg);
  else warn(msg);
} else {
  // VERCEL_API_BASE exists for testing (offline fake server); production default is the real API.
  const apiBase = (process.env.VERCEL_API_BASE ?? "https://api.vercel.com").replace(/\/+$/, "");
  const url = new URL(`${apiBase}/v9/projects/${encodeURIComponent(projectId)}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const msg = `could not read project settings from the Vercel API (HTTP ${res.status}) — verify VERCEL_TOKEN scope and VERCEL_PROJECT_ID`;
      if (STRICT) fail(msg);
      else warn(msg);
    } else {
      const proj = await res.json();
      const dashboardRoot = normalizeDir(proj.rootDirectory);
      if (!appDir) {
        warn("dashboard check skipped — no local app dir detected to compare against");
      } else if (dashboardRoot !== appDir) {
        fail(
          `Vercel Root Directory is ${dashboardRoot ? `"${dashboardRoot}"` : "EMPTY (repo root)"}, ` +
          `but the Next.js app lives in "${appDir}" — Vercel will build/collect output in the wrong place ` +
          `(NEXT_NO_ROUTES_MANIFEST / NEXT_OUTPUT_DIR_MISSING).\n` +
          `    Fix in the dashboard: Project → Settings → General → Root Directory → ${appDir}\n` +
          `    or via API:\n` +
          `    curl -X PATCH -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \\\n` +
          `      -d '{"rootDirectory":"${appDir}"}' "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID"`
        );
      } else {
        ok(`dashboard Root Directory matches ${appDir}`);
      }

      // vercel.json inside the app dir only takes effect when the dashboard
      // doesn't override the commands. Surface conflicts loudly.
      const appVercelJson = appDir ? readJsonIfExists(path.join(root, appDir, "vercel.json")) ?? {} : {};
      const appVercelUsable = !appVercelJson.__parseError;
      for (const [field, fileValue] of [
        ["installCommand", appVercelUsable ? appVercelJson.installCommand : undefined],
        ["buildCommand", appVercelUsable ? appVercelJson.buildCommand : undefined],
      ]) {
        const dashboardValue = proj[field];
        if (dashboardValue && fileValue && dashboardValue.trim() !== String(fileValue).trim()) {
          warn(
            `dashboard ${field} ("${dashboardValue}") overrides ${appDir}/vercel.json ("${fileValue}") — ` +
            "the committed file is NOT authoritative; align them or clear the dashboard field"
          );
        }
      }
      if (proj.framework && proj.framework !== "nextjs") {
        warn(`dashboard framework is "${proj.framework}", expected "nextjs"`);
      }
    }
  } catch (err) {
    const msg = `could not reach the Vercel API (${err?.cause?.code ?? err?.name ?? "error"}) — dashboard settings unverified`;
    if (STRICT) fail(msg);
    else warn(msg);
  }
}

/* ------------------------------------------------------------------ */
/* Summary                                                            */
/* ------------------------------------------------------------------ */

console.log("");
if (failures > 0) {
  console.error(`✗ Vercel config guard FAILED: ${failures} error(s), ${warnings} warning(s).`);
  console.error("  Do not deploy — see TESTING.md → Deployment → \"Vercel Root Directory / workspace build (monorepo)\".");
  process.exit(1);
}
if (warnings > 0) {
  console.log(`⚠ Vercel config guard passed with ${warnings} warning(s).`);
  process.exit(0);
}
console.log("✓ Vercel config guard passed.");
