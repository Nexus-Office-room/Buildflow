"use client";

import { useState } from "react";
import { createNexusClient } from "@buildflow/api-client";

const nexus = createNexusClient();

const FIELDS = [
  ["goal", "What are you designing?", "Describe the outcome you want."],
  ["audience", "Who is it for?", "Name the people who will use it."],
  ["screens", "Screens or components", "For example: dashboard, sign-in, project setup."],
  ["direction", "Visual direction", "Describe the feel, colors, typography, and layout."],
  ["reference", "Figma or reference link", "Paste a Figma, website, or image reference URL."],
  ["requirements", "Usability and accessibility", "Include mobile behavior, keyboard use, contrast, or other needs."],
] as const;

type Brief = Record<(typeof FIELDS)[number][0], string>;

const EMPTY_BRIEF: Brief = {
  goal: "",
  audience: "",
  screens: "",
  direction: "",
  reference: "",
  requirements: "",
};

const START = "--- NEXUS DESIGN STUDIO BRIEF ---";
const END = "--- END NEXUS DESIGN STUDIO BRIEF ---";

function readBrief(summary: string): Brief {
  const block = summary.match(/--- NEXUS DESIGN STUDIO BRIEF ---\n([\s\S]*?)\n--- END NEXUS DESIGN STUDIO BRIEF ---/);
  if (!block) return EMPTY_BRIEF;

  const brief = { ...EMPTY_BRIEF };
  for (const [key] of FIELDS) {
    const label = FIELDS.find((field) => field[0] === key)?.[1];
    if (!label) continue;
    const line = block[1].split("\n").find((entry) => entry.startsWith(`${label}: `));
    if (line) brief[key] = line.slice(label.length + 2);
  }
  return brief;
}

function formatBrief(brief: Brief): string {
  return [START, ...FIELDS.map(([key, label]) => `${label}: ${brief[key].trim().replace(/\s+/g, " ")}`), END].join("\n");
}

function removeSavedBrief(summary: string): string {
  return summary
    .replace(/\n?--- NEXUS DESIGN STUDIO BRIEF ---\n[\s\S]*?\n--- END NEXUS DESIGN STUDIO BRIEF ---\n?/g, "\n")
    .trim();
}

function briefForAI(brief: Brief, projectName: string): string {
  const details = FIELDS
    .map(([key, label]) => `${label}: ${brief[key].trim() || "Not specified"}`)
    .join("\n");
  return `Create or improve the UI/UX for the project “${projectName}” using this Design Studio brief. Follow the existing app architecture, preserve working behavior, and make the result responsive and accessible.\n\n${details}`;
}

function safeWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function DesignStudio({
  projectId,
  projectName,
  initialSummary,
  onSendToAI,
}: {
  projectId: string;
  projectName: string;
  initialSummary: string;
  onSendToAI: () => void;
}) {
  const [brief, setBrief] = useState<Brief>(() => readBrief(initialSummary));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(key: keyof Brief, value: string) {
    setBrief((current) => ({ ...current, [key]: value }));
    setMessage("");
    setError("");
  }

  async function persistBrief() {
    setSaving(true);
    setMessage("");
    setError("");
    const remainingSummary = removeSavedBrief(initialSummary);
    const savedBrief = Object.values(brief).some((value) => value.trim()) ? formatBrief(brief) : "";
    const nextSummary = [remainingSummary, savedBrief].filter(Boolean).join("\n\n");

    try {
      await nexus.client.request("PATCH", `/api/projects/${projectId}/memory`, {
        summary: nextSummary,
      });
      setMessage("Brief saved to project memory. AI roles will receive it on future runs.");
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the design brief.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    await persistBrief();
  }

  async function sendToAI() {
    if (!(await persistBrief())) return;
    try {
      localStorage.setItem(
        "nexus-pending-prompt",
        JSON.stringify({ title: "Design Studio brief", body: briefForAI(brief, projectName) })
      );
      onSendToAI();
    } catch {
      setError("The brief was saved, but could not be staged for AI chat. Open Chat and copy the brief manually.");
    }
  }

  const hasContent = Object.values(brief).some((value) => value.trim());
  const referenceUrl = safeWebUrl(brief.reference.trim());

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 text-neutral-100 sm:px-8">
      <header className="mb-8 flex flex-col justify-between gap-5 border-b border-neutral-800 pb-6 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--term-accent)]">
            Project workspace / creative direction
          </p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Design Studio</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
            Shape the experience before building it. Save a brief for the project’s AI roles or hand it to the team chat.
          </p>
        </div>
        <a
          href="https://www.figma.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-white/5 active:scale-[0.98]"
        >
          Open Figma <span aria-hidden="true">↗</span>
        </a>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="brief-heading">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 id="brief-heading" className="text-sm font-semibold">Design brief</h3>
              <p className="mt-1 text-xs text-neutral-500">Add as much detail as you have. You can refine it later.</p>
            </div>
            <span className="font-mono text-[10px] text-neutral-600">01 — 06</span>
          </div>

          <div className="divide-y divide-neutral-800 border-y border-neutral-800">
            {FIELDS.map(([key, label, hint], index) => (
              <label key={key} className="grid gap-2 py-4 sm:grid-cols-[2rem_minmax(0,1fr)] sm:gap-3">
                <span className="pt-2 font-mono text-[11px] text-neutral-600">0{index + 1}</span>
                <span className="block">
                  <span className="mb-1 block text-sm font-medium text-neutral-200">{label}</span>
                  {key === "requirements" || key === "direction" ? (
                    <textarea
                      value={brief[key]}
                      onChange={(event) => update(key, event.target.value)}
                      placeholder={hint}
                      rows={3}
                      maxLength={1000}
                      className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm leading-5 text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-500"
                    />
                  ) : (
                    <input
                      type={key === "reference" ? "url" : "text"}
                      value={brief[key]}
                      onChange={(event) => update(key, event.target.value)}
                      placeholder={hint}
                      maxLength={1000}
                      className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-500"
                    />
                  )}
                </span>
              </label>
            ))}
          </div>

          {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
          {message && <p role="status" className="mt-4 text-sm text-emerald-400">{message}</p>}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/5 active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save brief"}
            </button>
            <button
              type="button"
              onClick={sendToAI}
              disabled={saving || !hasContent}
              className="rounded-md bg-[var(--role-strategist)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Use brief in AI chat"}
            </button>
          </div>
        </section>

        <aside className="h-fit border-t border-neutral-800 pt-5 lg:sticky lg:top-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">How it connects</p>
          <ol className="mt-4 space-y-4 text-sm leading-5 text-neutral-400">
            <li className="flex gap-3"><span className="font-mono text-[var(--term-accent)]">01</span><span>Keep your design intent and reference links together.</span></li>
            <li className="flex gap-3"><span className="font-mono text-[var(--term-accent)]">02</span><span>Save it to project memory so AI roles can use it on future runs.</span></li>
            <li className="flex gap-3"><span className="font-mono text-[var(--term-accent)]">03</span><span>Send it to AI chat to start work. The brief appears in the composer for you to review.</span></li>
          </ol>
          {referenceUrl && (
            <div className="mt-6 border-t border-neutral-800 pt-4">
              <p className="mb-2 text-xs text-neutral-500">Current reference</p>
              <a
                href={referenceUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm text-[var(--term-accent)] underline decoration-neutral-700 underline-offset-4 hover:decoration-current"
              >
                {referenceUrl}
              </a>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
