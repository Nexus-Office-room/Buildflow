#!/usr/bin/env node
/**
 * Runs on `npm install` (package.json "prepare") to point core.hooksPath at
 * .githooks so the pre-push Vercel config guard runs for every clone.
 * Silently no-ops outside a git checkout (e.g. a downloaded zip).
 */
import { execSync } from "node:child_process";

try {
  execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
  console.log("✓ git hooks enabled — pre-push runs scripts/check-vercel-config.mjs");
} catch {
  // Not a git repo (zip download, sandboxed install) — nothing to configure.
}
