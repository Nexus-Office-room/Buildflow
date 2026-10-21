"use client";

import { useEffect, useState } from "react";
import { ROLES, type Role } from "@/types/db";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/pipeline/roles";
import { MODEL_CATALOG, PROVIDER_LABELS } from "@/lib/providers/catalog";
import { DEFAULT_PROVIDER_CONFIG, type ProviderName } from "@/lib/providers";
import { AI_PROVIDER_CHOICES, DIRECT_AI_PROVIDER_VALUES } from "@/lib/providers/connections";
import { createNexusClient } from "@nexus-office/api-client";
import { useApprovalFlow } from "@/components/common/ApprovalDialog";
import type { Integration } from "@/types/db";

const nexus = createNexusClient();

interface RoleModelRow {
  role: Role;
  provider: string;
  model: string;
}

const PROVIDERS: ProviderName[] = ["anthropic", "openai", "google"];
const BUILT_IN_PROVIDERS = new Set<string>(PROVIDERS);

// Gateways whose model list we fetch live instead of hardcoding.
const DYNAMIC_MODEL_GATEWAYS = new Set(
  AI_PROVIDER_CHOICES.filter((choice) => choice.kind === "compatible")
    .map((choice) => choice.value.toLowerCase()),
);

function isDynamicGateway(name: string): boolean {
  return DYNAMIC_MODEL_GATEWAYS.has(name.toLowerCase());
}

function monthlyLimitText(): string {
  // Display-only mirror of lib/shared-ai's default; the authoritative cap is
  // server-side (NEXUS_FREE_MONTHLY_RUNS).
  return "50";
}

// The Codebuff runtime (same agent framework that powers Freebuff) is
// offered as a per-role provider: it runs the role as a real agent with tool
// use and structured outputs instead of a single LLM call.
const CODEBUFF_PROVIDER = "codebuff";
const CODEBUFF_MODELS = [
  { model: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (via Codebuff)" },
  { model: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (via Codebuff)" },
  { model: "openai/gpt-5-mini", label: "GPT-5 Mini (via Codebuff)" },
  { model: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash (via Codebuff)" },
];

export default function ModelRouterPanel({
  projectId,
  initialRoleModels,
  initialApiKeyProviders,
  initialIntegrations,
}: {
  projectId: string;
  initialRoleModels: RoleModelRow[];
  initialApiKeyProviders: ProviderName[];
  initialIntegrations: Integration[];
}) {
  const [assignments, setAssignments] = useState<Record<Role, RoleModelRow>>(() => {
    const map = {} as Record<Role, RoleModelRow>;
    for (const role of ROLES) {
      const existing = initialRoleModels.find((r) => r.role === role);
      map[role] = existing ?? {
        role,
        provider: DEFAULT_PROVIDER_CONFIG.provider,
        model: DEFAULT_PROVIDER_CONFIG.model,
      };
    }
    return map;
  });
  const [savingRole, setSavingRole] = useState<Role | null>(null);
  const [configuredKeys, setConfiguredKeys] = useState<Set<string>>(
    new Set(initialApiKeyProviders)
  );
  const [providerIntegrations, setProviderIntegrations] = useState(
    initialIntegrations.filter((integration) => integration.type === "ai_provider"),
  );
  const [customProviderNames, setCustomProviderNames] = useState(
    initialIntegrations.filter((integration) => integration.type === "ai_provider").map((integration) => integration.name),
  );
  const [selectedProvider, setSelectedProvider] = useState(AI_PROVIDER_CHOICES[0].value);
  const [keyDraft, setKeyDraft] = useState("");
  const [customName, setCustomName] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [removingProvider, setRemovingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const { fetchWithApproval, dialogEl } = useApprovalFlow(projectId);

  // Live model lists for dynamic gateways (OpenRouter), keyed by integration
  // name. Fetched once per unique gateway the project has an integration for.
  const [dynamicModels, setDynamicModels] = useState<
    Record<string, { models: { id: string; label: string }[]; error?: string; loading: boolean }>
  >({});

  useEffect(() => {
    const gateways = customProviderNames.filter(isDynamicGateway);
    for (const gw of gateways) {
      setDynamicModels((prev) => {
        if (prev[gw]) return prev;
        (async () => {
          try {
            const names = await nexus.listGatewayModels(projectId, gw);
            const models = names.map((id) => ({ id, label: id }));
            if (models.length) {
              setDynamicModels((p) => ({ ...p, [gw]: { models, loading: false } }));
            } else {
              setDynamicModels((p) => ({
                ...p,
                [gw]: { models: [], loading: false, error: "No models returned" },
              }));
            }
          } catch (err) {
            setDynamicModels((p) => ({
              ...p,
              [gw]: {
                models: [],
                loading: false,
                error: err instanceof Error ? err.message : "fetch failed",
              },
            }));
          }
        })();
        return { ...prev, [gw]: { models: [], loading: true } };
      });
    }
  }, [customProviderNames, projectId]);

  async function saveAssignment(role: Role, provider: string, model: string) {
    setSavingRole(role);
    setError(null);
    setAssignments((prev) => ({ ...prev, [role]: { role, provider, model } }));

    try {
      await nexus.client.request("PUT", `/api/projects/${projectId}/role-models`, {
        role,
        provider,
        model,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to save ${ROLE_LABELS[role]} model`);
    }
    setSavingRole(null);
  }

  async function saveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const choice = AI_PROVIDER_CHOICES.find((item) => item.value === selectedProvider);
    const key = keyDraft.trim();
    if (!key) return;
    setSavingKey(true);
    setError(null);
    setKeyStatus(null);

    try {
      if (!choice) throw new Error("Choose a provider first.");
      if (choice.kind === "built-in") {
        await nexus.saveApiKey(choice.value, key);
        setConfiguredKeys((prev) => new Set(prev).add(choice.value));
      } else {
        const name = choice.kind === "custom" ? customName.trim() : choice.value;
        const baseUrl = choice.kind === "custom" ? customBaseUrl.trim() : choice.baseUrl;
        if (!name || !baseUrl) throw new Error("Enter the provider name and API URL.");

        const verification = await fetch(`/api/projects/${projectId}/integrations/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base_url: baseUrl, api_key: key }),
        });
        const verificationResult = await verification.json().catch(() => null);
        if (!verification.ok || verificationResult?.ok !== true) {
          throw new Error(verificationResult?.message ?? "The provider could not verify this key.");
        }

        const { data } = await nexus.client.request<{ integration?: Integration; error?: string }>(
          "POST",
          `/api/projects/${projectId}/integrations`,
          { type: "ai_provider", name, base_url: baseUrl, api_key: key, extra_config: {} },
        );
        if (!data?.integration) throw new Error(data?.error ?? "Could not save this provider.");
        setProviderIntegrations((prev) => [...prev.filter((item) => item.name !== name), data.integration!]);
        setCustomProviderNames((prev) => prev.includes(name) ? prev : [...prev, name]);
      }
      setKeyDraft("");
      setKeyStatus(`${choice.label} key saved. It is ready to select in the role router.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save provider key");
    }
    setSavingKey(false);
  }

  async function removeKey(provider: string) {
    setRemovingProvider(provider);
    const integration = providerIntegrations.find((item) => item.name === provider);
    try {
      if (integration) {
        const { res, data } = await fetchWithApproval(
          `/api/projects/${projectId}/integrations/${integration.id}`,
          { method: "DELETE" },
        );
        if (data.cancelled) return;
        if (!res.ok) throw new Error("Could not remove this provider.");
        setProviderIntegrations((prev) => prev.filter((item) => item.id !== integration.id));
        setCustomProviderNames((prev) => prev.filter((name) => name !== provider));
      } else {
        await nexus.deleteApiKey(provider);
        setConfiguredKeys((prev) => {
          const next = new Set(prev);
          next.delete(provider);
          return next;
        });
      }
    } catch {
      setError(`Could not remove ${provider}. Please try again.`);
    } finally {
      setRemovingProvider(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-6 py-8 text-neutral-100">
      <section>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Model Router</h2>
          <span
            className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-400"
            title="Roles without an explicit assignment run on Nexus Office's shared AI key, capped at the Free-tier monthly allowance. Add your own key to remove the cap."
          >
            Using Nexus Office&apos;s shared AI (Free tier)
          </span>
        </div>
        <p className="mb-4 text-sm text-neutral-500">
          Choose which provider and model handles each role in the pipeline. Roles left on
          the default run on our shared free-tier key ({monthlyLimitText()} runs/month);
          add a provider key below or connect a provider in the catalog to use your own account.
        </p>
        <div className="space-y-2">
          {ROLES.map((role) => {
            const current = assignments[role];
            const isBuiltIn = BUILT_IN_PROVIDERS.has(current.provider);
            const isCodebuff = current.provider === CODEBUFF_PROVIDER;
            const modelsForProvider = isBuiltIn
              ? MODEL_CATALOG.filter((m) => m.provider === current.provider)
              : isCodebuff
                ? CODEBUFF_MODELS
                : [];
            return (
              <div
                key={role}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: ROLE_COLORS[role] }}
                >
                  {ROLE_LABELS[role][0]}
                </span>
                <span className="w-24 shrink-0 text-sm font-medium">{ROLE_LABELS[role]}</span>

                <select
                  value={current.provider}
                  onChange={(e) => {
                    const provider = e.target.value;
                    const firstModel =
                      provider === CODEBUFF_PROVIDER
                        ? CODEBUFF_MODELS[0].model
                        : MODEL_CATALOG.find((m) => m.provider === provider)?.model ?? "";
                    saveAssignment(role, provider, firstModel);
                  }}
                  className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                >
                  <optgroup label="Built-in">
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {PROVIDER_LABELS[p]}
                      </option>
                    ))}
                    <option value={CODEBUFF_PROVIDER}>Codebuff agents</option>
                  </optgroup>
                  {customProviderNames.length > 0 && (
                    <optgroup label="Integrations">
                      {customProviderNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {isBuiltIn ? (
                  <select
                    value={current.model}
                    onChange={(e) => saveAssignment(role, current.provider, e.target.value)}
                    className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                  >
                    {modelsForProvider.map((m) => (
                      <option key={m.model} value={m.model}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                ) : isCodebuff ? (
                  <select
                    value={
                      CODEBUFF_MODELS.some((m) => m.model === current.model)
                        ? current.model
                        : CODEBUFF_MODELS[0].model
                    }
                    onChange={(e) => saveAssignment(role, CODEBUFF_PROVIDER, e.target.value)}
                    className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                  >
                    {CODEBUFF_MODELS.map((m) => (
                      <option key={m.model} value={m.model}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                ) : isDynamicGateway(current.provider) ? (
                  (() => {
                    const entry = dynamicModels[current.provider];
                    if (!entry || entry.loading) {
                      return (
                        <span className="flex-1 text-xs text-neutral-500">
                          Loading model list…
                        </span>
                      );
                    }
                    if (entry.error || entry.models.length === 0) {
                      return (
                        <span className="flex-1 text-xs text-amber-400">
                          {entry.error ?? "No models returned"} — check the integration in
                          the Integrations panel
                        </span>
                      );
                    }
                    return (
                      <select
                        value={
                          entry.models.some((m) => m.id === current.model)
                            ? current.model
                            : entry.models[0].id
                        }
                        onChange={(e) => saveAssignment(role, current.provider, e.target.value)}
                        className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                      >
                        {entry.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    );
                  })()
                ) : (
                  <input
                    value={current.model}
                    onChange={(e) =>
                      setAssignments((prev) => ({
                        ...prev,
                        [role]: { ...prev[role], model: e.target.value },
                      }))
                    }
                    onBlur={(e) => saveAssignment(role, current.provider, e.target.value)}
                    placeholder="Model name for this integration"
                    className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-neutral-500"
                  />
                )}

                {savingRole === role && (
                  <span className="text-[11px] text-neutral-500">Saving…</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        {dialogEl}
        <h2 className="mb-1 text-lg font-semibold">AI providers &amp; tokens</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Choose a provider, paste its token, and save it here. Keys are encrypted. Some providers offer free tiers or free models; others charge per use. Check the provider&apos;s current terms and pricing.
        </p>
        <div className="space-y-2">
          {[
            ...Array.from(configuredKeys).map((provider) => ({ provider, label: PROVIDER_LABELS[provider as ProviderName] ?? provider })),
            ...providerIntegrations.map((integration) => ({ provider: integration.name, label: integration.name })),
          ].map(({ provider, label }) => (
            <div key={provider} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
              <span className="text-xs text-emerald-400">Token saved</span>
              <button
                type="button"
                onClick={() => removeKey(provider)}
                disabled={removingProvider === provider}
                className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
              >
                {removingProvider === provider ? "Removing…" : "Remove"}
              </button>
            </div>
          ))}
          {configuredKeys.size === 0 && providerIntegrations.length === 0 && (
            <p className="rounded-lg border border-dashed border-neutral-800 px-3 py-4 text-xs text-neutral-500">No provider tokens saved yet. Select a provider below to add one.</p>
          )}
        </div>
        <form onSubmit={saveKey} className="mt-4 space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-300">AI provider</span>
            <select
              value={selectedProvider}
              onChange={(event) => setSelectedProvider(event.target.value)}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            >
              {AI_PROVIDER_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
          </label>
          {selectedProvider === "__custom" && (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-300">Provider name</span>
                <input value={customName} onChange={(event) => setCustomName(event.target.value)} required placeholder="e.g. My AI provider" className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-300">OpenAI-compatible API URL</span>
                <input value={customBaseUrl} onChange={(event) => setCustomBaseUrl(event.target.value)} required type="url" placeholder="https://api.example.com/v1" className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
              </label>
            </>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-300">API token</span>
            <input
              type="password"
              autoComplete="new-password"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              required
              placeholder="Paste the token for the selected provider"
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500"
            />
          </label>
          {selectedProvider !== "__custom" && (
            <p className="text-xs text-neutral-500">{AI_PROVIDER_CHOICES.find((choice) => choice.value === selectedProvider)?.note}</p>
          )}
          <button type="submit" disabled={savingKey || !keyDraft.trim()} className="w-full rounded bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
            {savingKey ? "Saving…" : selectedProvider === "__custom" || !DIRECT_AI_PROVIDER_VALUES.has(selectedProvider) ? "Verify & save token" : "Save token"}
          </button>
          {keyStatus && <p role="status" className="text-xs text-emerald-400">{keyStatus}</p>}
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      </section>
    </div>
  );
}
