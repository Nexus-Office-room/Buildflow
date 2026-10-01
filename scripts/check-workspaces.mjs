// Guard: every workspace package must actually exist with real sources. A
// rebase/merge that drops a packages/*/package.json (or empties its src/)
// silently breaks every commit built on top — and previously only surfaced
// as a blocked production deploy three commits later (Addendum 15 rebase).
// This check turns that into a same-commit CI failure.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const workspaces = rootPkg.workspaces ?? [];

let failures = 0;
function fail(msg) {
  failures += 1;
  console.error(`  ✕ ${msg}`);
}
function warn(msg) {
  console.log(`  ⚠ ${msg}`);
}

function checkPackage(dir, label) {
  const st = statSync(dir, { throwIfNoEntry: false });
  if (!st?.isDirectory()) return;

  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) {
    fail(`${label}/package.json missing (root workspaces: ${JSON.stringify(workspaces)})`);
    return;
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(manifest, "utf8"));
  } catch (err) {
    fail(`${label}/package.json is not valid JSON: ${err.message}`);
    return;
  }

  // A name that doesn't match the directory convention breaks the
  // "@nexus-office/<dir>": "*" references consumers use. Only packages/
  // are convention-named; apps keep their historical ("web") names and are
  // referenced by path in root scripts, not by bare "*" specifiers.
  const dirName = label.split("/").pop();
  if (label.startsWith("packages/") && pkg.name !== `@nexus-office/${dirName}` && pkg.name !== `@nexus/${dirName}`) {
    warn(`${label}: package name "${pkg.name}" doesn't follow the <scope>/${dirName} convention`);
  }

  const src = join(dir, "src");
  if (existsSync(src) && statSync(src).isDirectory()) {
    const files = readdirSync(src).filter((f) => !f.startsWith("."));
    if (files.length === 0) fail(`${label}/src is empty`);
  }
}

for (const pattern of workspaces) {
  if (pattern.includes("*")) {
    const base = pattern.replace(/\*.*$/, "").replace(/\/$/, "");
    const dir = join(root, base);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      checkPackage(join(dir, entry), `${base}/${entry}`);
    }
  } else {
    checkPackage(join(root, pattern), pattern);
  }
}

if (failures > 0) {
  console.error(`\n✗ Workspace integrity check FAILED: ${failures} problem(s).`);
  process.exit(1);
}
console.log("✓ Workspace integrity check passed.");
