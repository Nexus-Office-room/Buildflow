// Minimal Node ESM loader: resolves the web app's `@/*` path alias to real
// file paths so test files can import app modules outside Next.js.
// Registered with: node --experimental-strip-types --import ./tests/register-loader.mjs
const PROJECT_ROOT = new URL("../apps/web/", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = new URL(specifier.replace("@/", "src/"), PROJECT_ROOT).href;
    // Try .ts extension first (matches the actual source files).
    try {
      return await nextResolve(target + ".ts", context);
    } catch {
      return nextResolve(target, context);
    }
  }
  return nextResolve(specifier, context);
}
