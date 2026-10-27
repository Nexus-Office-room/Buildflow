"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BuildflowLogo from "@/components/brand/BuildflowLogo";

// Account → API Keys (Addendum 15). Users mint `nxo_live_...` credentials for
// the Buildflow CLI / API. The raw token is displayed exactly once, immediately
// after creation, and can never be fetched again — only its SHA-256 hash is
// stored server-side.

interface ApiTokenScopeInfo {
  scope: string;
  label: string;
  write: boolean;
}

interface TokenRow {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

// Mirrors API_TOKEN_SCOPES / isWriteScope from lib/apiTokens (client-safe copy;
// the API route remains the enforcement point — this only drives the UI).
const SCOPES: ApiTokenScopeInfo[] = [
  { scope: "projects:read", label: "Read projects", write: false },
  { scope: "pipeline:run", label: "Run the AI pipeline", write: true },
  { scope: "vault:read", label: "Read Prompt Vault", write: false },
  { scope: "vault:write", label: "Write Prompt Vault", write: true },
  { scope: "deploy:trigger", label: "Trigger deploys", write: true },
];

const EXPIRY_OPTIONS = [
  { value: "", label: "Never expires" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ApiKeysPage() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(
    () => new Set(["projects:read", "vault:read"])
  );
  const [expiry, setExpiry] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // One-time creation result
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Stable "now" snapshot for expiry display; refreshed on each load.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refreshNow = useCallback(() => setNowMs(Date.now()), []);

  // Reload the key list; used after create/revoke. The initial fetch runs in
  // the effect below (same pattern as AccountPanel).
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/api-tokens");
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setTokens(data.tokens ?? []);
        setLoadError(null);
        refreshNow();
      } else {
        setLoadError(data?.error ?? `Request failed (HTTP ${res.status})`);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    }
  }, [refreshNow]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account/api-tokens");
        const data = await res.json().catch(() => null);
        if (res.ok && data) {
          setTokens(data.tokens ?? []);
          setNowMs(Date.now());
        } else {
          setLoadError(data?.error ?? `Request failed (HTTP ${res.status})`);
        }
      } catch {
        setLoadError("Network error");
      }
    })();
  }, []);

  function toggleScope(scope: string) {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function createToken() {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Give the key a name first.");
      return;
    }
    if (selectedScopes.size === 0) {
      setFormError("Select at least one scope.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/account/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scopes: Array.from(selectedScopes),
          expiresInDays: expiry === "" ? null : Number(expiry),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.token) {
        // The ONLY moment the raw token exists in this UI. After the user
        // dismisses/leaves this panel it is gone — the server never returns
        // it again and no component state keeps a copy.
        setFreshToken(data.token as string);
        setName("");
        setSelectedScopes(new Set(["projects:read", "vault:read"]));
        setExpiry("");
        await load();
      } else {
        setFormError(data?.error ?? `Failed to create key (HTTP ${res.status})`);
      }
    } catch {
      setFormError("Network error — key not created.");
    }
    setCreating(false);
  }

  async function copyToken() {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch("/api/account/api-tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setFormError(data?.error ?? "Failed to revoke key");
      }
      await load();
    } catch {
      setFormError("Network error — key not revoked.");
    }
    setRevokingId(null);
  }

  const loading = tokens === null && !loadError;

  return (
    <div className="min-h-screen px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <BuildflowLogo surface="nav" />
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <Link href="/account/profile" className="ml-auto text-sm text-neutral-400 hover:text-neutral-200">
            ← Account
          </Link>
        </div>

        {/* One-time token display — the only place the raw token ever appears. */}
        {freshToken && (
          <div
            role="alertdialog"
            aria-label="Your new API key"
            className="glass-panel mb-6 rounded-xl border border-amber-500/40 p-5"
          >
            <h2 className="text-sm font-semibold text-amber-400">
              Key created — copy it now
            </h2>
            <p className="mt-1 text-xs text-amber-300/90">
              This token will not be shown again. Copy it now.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code
                className="flex-1 overflow-x-auto rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs text-emerald-300"
                aria-label="Full API token (shown only once)"
              >
                {freshToken}
              </code>
              <button
                onClick={copyToken}
                className="shrink-0 rounded-md bg-[var(--role-strategist)] px-3 py-2 text-xs font-medium text-white hover:opacity-90"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => setFreshToken(null)}
              className="mt-3 text-xs text-neutral-500 underline hover:text-neutral-300"
            >
              I&apos;ve saved it — hide forever
            </button>
          </div>
        )}

        {/* Create form */}
        <section className="glass-panel mb-8 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-neutral-200">Generate a new key</h2>
          <p className="mb-4 mt-1 text-xs text-neutral-500">
            Keys authenticate the Buildflow CLI and API as you. Read-only scopes are
            the safe default — write and deploy scopes must be selected explicitly.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="key-name" className="mb-1 block text-xs font-medium text-neutral-300">
                Key name
              </label>
              <input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="e.g. My laptop CLI"
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              />
            </div>

            <fieldset>
              <legend className="mb-2 text-xs font-medium text-neutral-300">Scopes</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {SCOPES.map(({ scope, label, write }) => (
                  <label
                    key={scope}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                      selectedScopes.has(scope)
                        ? "border-[var(--role-strategist)]/60 bg-neutral-900"
                        : "border-neutral-800 bg-neutral-950"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedScopes.has(scope)}
                      onChange={() => toggleScope(scope)}
                      className="mt-0.5"
                      aria-label={`${label} (${scope})`}
                    />
                    <span>
                      <span className="block text-neutral-200">{label}</span>
                      <span className="font-mono text-[10px] text-neutral-500">
                        {scope}
                        {write ? " · write" : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="key-expiry" className="mb-1 block text-xs font-medium text-neutral-300">
                Expiration
              </label>
              <select
                id="key-expiry"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {formError && (
              <p className="text-xs text-amber-400" role="alert">
                {formError}
              </p>
            )}

            <button
              onClick={createToken}
              disabled={creating}
              className="rounded-md bg-[var(--role-strategist)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {creating ? "Generating…" : "Generate key"}
            </button>
          </div>
        </section>

        {/* Existing keys */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-200">Your keys</h2>
          {loading && <p className="text-xs text-neutral-600">Loading…</p>}
          {loadError && (
            <p className="text-xs text-red-400">
              Failed to load keys. <span className="text-neutral-500">{loadError}</span>
            </p>
          )}
          {tokens && tokens.length === 0 && (
            <p className="rounded-md border border-dashed border-neutral-800 px-4 py-6 text-center text-xs text-neutral-500">
              No API keys yet. Generate one above to use the Buildflow CLI and API.
            </p>
          )}
          {tokens && tokens.length > 0 && (
            <ul className="space-y-3">
              {tokens.map((t) => {
                const revoked = Boolean(t.revoked_at);
                // Date.now() in render is impure (react-hooks/purity); the
                // loaded-at snapshot is stable across re-renders.
                const expired =
                  !revoked && Boolean(t.expires_at) && new Date(t.expires_at!).getTime() <= nowMs;
                return (
                  <li
                    key={t.id}
                    className={`glass-panel rounded-lg p-4 ${revoked || expired ? "opacity-60" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-neutral-100">{t.name}</span>
                      <code className="rounded bg-neutral-950 px-1.5 py-0.5 font-mono text-[11px] text-neutral-400">
                        {t.token_prefix}…
                      </code>
                      {revoked && (
                        <span className="rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-red-400">
                          Revoked
                        </span>
                      )}
                      {!revoked && expired && (
                        <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-400">
                          Expired
                        </span>
                      )}
                      {!revoked && !expired && (
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-400">
                          Active
                        </span>
                      )}
                      {!revoked && (
                        <button
                          onClick={() => revoke(t.id)}
                          disabled={revokingId === t.id}
                          className="ml-auto rounded border border-red-500/40 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {revokingId === t.id ? "Revoking…" : "Revoke"}
                        </button>
                      )}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
                      <div>
                        <dt className="text-neutral-500">Scopes</dt>
                        <dd className="font-mono text-neutral-300">{t.scopes.join(", ") || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-500">Created</dt>
                        <dd className="text-neutral-300">{fmtDate(t.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-500">Last used</dt>
                        <dd className="text-neutral-300">{fmtDate(t.last_used_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-500">Expires</dt>
                        <dd className="text-neutral-300">
                          {t.expires_at ? fmtDate(t.expires_at) : "Never"}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="mt-8 text-[11px] leading-relaxed text-neutral-600">
          Treat keys like passwords. Full keys are shown once at creation and are
          never stored or displayed again — only a short prefix used to identify
          them. Revoked and expired keys stop working immediately.
        </p>
      </div>
    </div>
  );
}
