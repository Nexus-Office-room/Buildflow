"use client";

import { useState } from "react";
import { useApprovalFlow } from "@/components/common/ApprovalDialog";
import type { Integration, IntegrationType } from "@/types/db";
import { createNexusClient } from "@nexus-office/api-client";

const nexus = createNexusClient();

export default function IntegrationsPanel({
  projectId,
  initialIntegrations,
}: {
  projectId: string;
  initialIntegrations: Integration[];
}) {
  const [integrations, setIntegrations] = useState<Integration[]>(
    initialIntegrations.filter((integration) => integration.type === "hosting"),
  );
  const [showForm, setShowForm] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>(
    {}
  );
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Deleting an integration is a risky production action (Addendum 3): a
  // 409 APPROVAL_REQUIRED response raises the confirm dialog first.
  const { fetchWithApproval, dialogEl } = useApprovalFlow(projectId);

  async function handleAdd(data: {
    type: IntegrationType;
    name: string;
    base_url: string;
    api_key: string;
    extra_config: string;
  }) {
    setError(null);
    let extraConfig = {};
    if (data.extra_config.trim()) {
      try {
        extraConfig = JSON.parse(data.extra_config);
      } catch {
        setError("Extra Config must be valid JSON");
        return;
      }
    }

    try {
      const { data: result } = await nexus.client.request<{
        integration?: { id: string; name: string; type: string; base_url: string | null };
        error?: string;
      }>("POST", `/api/projects/${projectId}/integrations`, {
        type: data.type,
        name: data.name,
        base_url: data.base_url,
        api_key: data.api_key,
        extra_config: extraConfig,
      });
      if (!result?.integration) {
        setError(result?.error ?? "Failed to add integration");
        return;
      }
      setIntegrations((prev) => [
        ...prev.filter((i) => i.name !== result.integration!.name),
        result.integration as unknown as typeof prev[number],
      ]);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add integration");
    }
  }

  async function handleDelete(integrationId: string) {
    const { res, data } = await fetchWithApproval(
      `/api/projects/${projectId}/integrations/${integrationId}`,
      { method: "DELETE" }
    );
    if (data.cancelled) return;
    if (res.ok) setIntegrations((prev) => prev.filter((i) => i.id !== integrationId));
  }

  async function handleTest(integrationId: string) {
    setTesting(integrationId);
    try {
      const result = (await nexus.testIntegration(projectId, integrationId)) as {
        ok: boolean;
        message: string;
      };
      setTestResults((prev) => ({ ...prev, [integrationId]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [integrationId]: {
          ok: false,
          message: err instanceof Error ? err.message : "Test failed",
        },
      }));
    }
    setTesting(null);
  }

  return (
    <section>
      {dialogEl}
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Hosting integrations</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-[var(--role-strategist)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          {showForm ? "Cancel" : "Add hosting service"}
        </button>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Connect deploy hooks and hosting services here. Add AI provider tokens in one place under Model Router.
      </p>

      {showForm && <AddIntegrationForm onSubmit={handleAdd} error={error} />}

      <div className="space-y-2">
        {integrations.map((integration) => {
          const result = testResults[integration.id];
          return (
            <div
              key={integration.id}
              className="glass-panel rounded-lg p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{integration.name}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase text-neutral-400">
                      Hosting
                    </span>
                  </div>
                  <p className="truncate text-xs text-neutral-500">
                    {integration.base_url ?? "no base URL"}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(integration.id)}
                  className="shrink-0 text-xs text-neutral-600 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => handleTest(integration.id)}
                  disabled={testing === integration.id}
                  className="rounded bg-white/5 px-2 py-1 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-50"
                >
                  {testing === integration.id ? "Testing…" : "Test Connection"}
                </button>
                {result && (
                  <span className={`text-xs ${result.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {result.message}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {integrations.length === 0 && !showForm && (
          <p className="text-sm text-neutral-500">No hosting integrations added yet.</p>
        )}
      </div>
    </section>
  );
}

function AddIntegrationForm({
  onSubmit,
  error,
}: {
  onSubmit: (data: {
    type: IntegrationType;
    name: string;
    base_url: string;
    api_key: string;
    extra_config: string;
  }) => void;
  error: string | null;
}) {
  const type: IntegrationType = "hosting";
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [extraConfig, setExtraConfig] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!baseUrl.trim()) return;
    setSaving(true);
    await onSubmit({ type, name: name.trim(), base_url: baseUrl.trim(), api_key: apiKey.trim(), extra_config: extraConfig });
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel mb-4 space-y-2 rounded-lg p-4">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='Hosting service name (e.g. "Netlify")'
          className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500"
        />
      </div>

      <input
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder="Deploy hook URL (e.g. https://api.netlify.com/build_hooks/xxxx)"
        className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500"
      />
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="API key (optional for most deploy hooks)"
        className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500"
      />
      <textarea
        value={extraConfig}
        onChange={(e) => setExtraConfig(e.target.value)}
        placeholder='Extra config JSON (optional), e.g. {"org_id": "..."}'
        rows={2}
        className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 font-mono text-xs text-neutral-100 outline-none focus:border-neutral-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={saving || !name.trim() || !baseUrl.trim()}
        className="rounded bg-[var(--role-strategist)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save hosting integration"}
      </button>
    </form>
  );
}
