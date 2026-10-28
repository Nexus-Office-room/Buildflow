"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";
import { injectWatermark } from "@/lib/brand";
import type { ProjectFile } from "@/types/db";
import { createNexusClient } from "@buildflow/api-client";

const fileCache = new Map<string, { files: ProjectFile[]; timestamp: number }>();
const CACHE_TTL = 15_000;

// Same-origin shared client — file CRUD + undo go through
// @buildflow/api-client instead of raw fetch.
const nexus = createNexusClient();

function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    html: "html",
    md: "markdown",
    py: "python",
  };
  return map[ext] ?? "plaintext";
}

export default function CodeCanvas({
  projectId,
  initialFiles,
  showWatermark = true,
}: {
  projectId: string;
  initialFiles: ProjectFile[];
  showWatermark?: boolean;
}) {
  // On first mount (initial page load) prefer the client-side cache when it's
  // still fresh, skipping a redundant refetch after a recent visit. Computed
  // in the lazy initializer instead of an effect, so there's no cascading
  // setState pass. Later mounts (e.g. parent bumps the key after a pipeline
  // run) fall through to the fetch effect below.
  const [files, setFiles] = useState<ProjectFile[]>(() => {
    const cached = fileCache.get(projectId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.files;
    return initialFiles;
  });
  const [selectedPath, setSelectedPath] = useState<string | null>(initialFiles[0]?.path ?? null);
  const [draft, setDraft] = useState<string>(initialFiles[0]?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Addendum 17: "Undo last run" — reverts the most recent applied run's
  // isolated snapshot back to its pre-run state.
  const [undoing, setUndoing] = useState(false);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => files.find((f) => f.path === selectedPath) ?? null,
    [files, selectedPath]
  );

  function selectFile(path: string) {
    setSelectedPath(path);
    setDraft(files.find((f) => f.path === path)?.content ?? "");
  }

  async function refreshFiles() {
    const nextFiles = (await nexus.listFiles(projectId)) as ProjectFile[];
    setFiles(nextFiles);
    fileCache.set(projectId, { files: nextFiles, timestamp: Date.now() });
    const stillSelected = nextFiles.find((f) => f.path === selectedPath);
    if (stillSelected) {
      setDraft(stillSelected.content);
    } else if (nextFiles[0]) {
      setSelectedPath(nextFiles[0].path);
      setDraft(nextFiles[0].content);
    }
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const saved = await nexus.saveFile(projectId, selected.path, draft);
      setFiles((prev) => prev.map((f) => (f.path === saved.path ? { ...f, ...saved } as ProjectFile : f)));
    } catch {
      // Keep the draft in the editor so the user can retry — same UX as
      // the previous silently-ignored failure, minus the lost edit.
    }
    setSaving(false);
  }

  async function handleUndoLastRun() {
    if (undoing) return;
    setUndoing(true);
    setUndoMessage(null);
    try {
      const result = await nexus.undoLastRun(projectId);
      setUndoMessage(result.message);
      if (result.undone) await refreshFiles();
    } catch {
      setUndoMessage("Undo failed.");
    } finally {
      setUndoing(false);
    }
  }

  useEffect(() => {
    // Always refetch on mount when this isn't a fresh first load — e.g. the
    // parent bumps the key after a pipeline run to pick up new server files.
    // The cache read for first load happens in the files initializer above.
    // Deferred to a microtask so the effect body itself stays setState-free.
    if (files === initialFiles || fileCache.has(projectId)) {
      void Promise.resolve().then(() => refreshFiles());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watermark is appended to the iframe srcdoc at render time only — the
  // underlying file contents are never modified.
  const previewHtml = useMemo(
    () => (showWatermark ? injectWatermark(buildPreviewHtml(files)) : buildPreviewHtml(files)),
    [files, showWatermark]
  );

  return (
    <div className="flex h-full">
      {/* File tree */}
      <aside className="canvas-sidebar w-56 shrink-0 overflow-y-auto p-2">
        <div className="canvas-sidebar__heading mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
            Files
          </span>
          <button
            onClick={refreshFiles}
            className="canvas-refresh text-[11px] text-neutral-400 hover:text-white"
          >
            Refresh
          </button>
        </div>
        {/* Addendum 17: rollback — every run merges from its own isolated
            snapshot, so "Undo last run" always restores the exact pre-run
            state of the files it touched. */}
        <button
          onClick={handleUndoLastRun}
          disabled={undoing}
          className="canvas-undo mb-2 w-full rounded px-2 py-1.5 text-[11px] text-neutral-300 disabled:opacity-50"
          title="Revert the most recent pipeline run's changes to their pre-run state"
        >
          <span aria-hidden="true" className="mr-1.5">↶</span>{undoing ? "Undoing…" : "Undo last run"}
        </button>
        {undoMessage && (
          <p className="mb-2 px-1 text-[11px] text-neutral-500">{undoMessage}</p>
        )}
        {files.length === 0 && (
          <p className="canvas-sidebar__empty px-1 text-xs">
            Your project files will appear here after the Builder creates them.
          </p>
        )}
        <ul className="space-y-0.5">
          {files.map((f) => (
            <li key={f.path}>
              <button
                onClick={() => selectFile(f.path)}
                className={`w-full truncate rounded px-2 py-1 text-left text-xs ${
                  f.path === selectedPath
                    ? "canvas-file--active"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                }`}
                title={f.path}
              >
                {f.path}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="canvas-toolbar flex items-center justify-between px-3 py-1.5">
          <span className="canvas-toolbar__path truncate text-xs text-neutral-300">
            {selected?.path ?? "No file selected"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPreview((v) => !v)}
              className="canvas-toolbar__button rounded px-2.5 py-1.5 text-xs text-neutral-100"
            >
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
            <button
              onClick={handleSave}
              disabled={!selected || saving}
              className="canvas-toolbar__save rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-45"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className={showPreview ? "w-1/2 min-w-0" : "w-full min-w-0"}>
            {selected ? (
              <Editor
                height="100%"
                theme="vs-dark"
                path={selected.path}
                language={languageForPath(selected.path)}
                value={draft}
                onChange={(v) => setDraft(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            ) : (
              <div className="canvas-empty">
                <div className="canvas-empty__mark" aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none">
                    <path d="M14 7.5h13l9 9V39H14V7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M27 8v9h9M19 24h12M19 30h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="m8 19 2 2 4-4" stroke="#6ea5ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="canvas-empty__eyebrow">Buildflow canvas</p>
                <h2>{files.length ? "Choose a file to get started" : "Your canvas is ready"}</h2>
                <p className="canvas-empty__copy">
                  {files.length
                    ? "Select a file from the project tree to inspect and edit its code."
                    : "Start a build in Chat and your project files will appear here, ready to edit and preview."}
                </p>
                {!files.length && (
                  <Link className="canvas-empty__action" href={`/projects/${projectId}`}>
                    <span>Open project chat</span>
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </Link>
                )}
              </div>
            )}
          </div>

          {showPreview && (
            <div className="w-1/2 min-w-0 border-l border-neutral-800">
              <iframe
                title="Live preview"
                srcDoc={previewHtml}
                sandbox="allow-scripts"
                className="h-full w-full bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Best-effort static preview: renders an index.html file if present, or
// wraps a single HTML-ish file. This is intentionally simple for the MVP —
// full bundling of a Next.js project tree is out of scope for the canvas.
function buildPreviewHtml(files: ProjectFile[]): string {
  const index = files.find((f) => /(^|\/)index\.html$/.test(f.path));
  if (index) return index.content;

  const html = files.find((f) => f.path.endsWith(".html"));
  if (html) return html.content;

  return `<!doctype html><html><body style="font-family:sans-serif;padding:2rem;color:#666">
    <p>No index.html found in this project's files yet.</p>
  </body></html>`;
}
