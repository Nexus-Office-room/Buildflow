import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Auth/config storage: a plain file at ~/.nexus/config (mode 600), same
// backend philosophy as similar CLI tools — never a database. Holds either
// the Supabase access/refresh tokens obtained via `buildflow login` (browser or
// --token) or a scoped Buildflow API token via `buildflow login --api-token`
// (Addendum 15: nxo_live_... / nxo_test_..., hash-only server-side), plus
// the base URL of the Buildflow web app the CLI talks to.

export interface NexusConfig {
  baseUrl: string;
  // Supabase session credentials (browser login / --token paste).
  accessToken?: string;
  refreshToken?: string;
  email?: string;
  // Scoped Buildflow API token (login --api-token). Mutually exclusive in
  // practice with accessToken: whichever was set last wins at request time.
  apiToken?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".nexus");
const CONFIG_FILE = path.join(CONFIG_DIR, "config");

export function defaultBaseUrl(): string {
  return process.env.NEXUS_BASE_URL ?? "http://localhost:3000";
}

export function loadConfig(): NexusConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<NexusConfig>;
    return { ...{ baseUrl: defaultBaseUrl() }, ...parsed, baseUrl: parsed.baseUrl ?? defaultBaseUrl() };
  } catch {
    return { baseUrl: defaultBaseUrl() };
  }
}

export function saveConfig(update: Partial<NexusConfig>): NexusConfig {
  const next = { ...loadConfig(), ...update };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  return next;
}

export function clearAuth(): void {
  saveConfig({
    accessToken: undefined,
    refreshToken: undefined,
    email: undefined,
    apiToken: undefined,
  });
}
