"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ChatPanel, { setChatProjectId, type RunWithSteps } from "@/components/chat/ChatPanel";
import CodeCanvas from "@/components/canvas/CodeCanvas";
import ModelRouterPanel from "@/components/settings/ModelRouterPanel";
import ConnectionsPanel from "@/components/settings/ConnectionsPanel";
import IntegrationsPanel from "@/components/settings/IntegrationsPanel";
import BrandingPanel from "@/components/settings/BrandingPanel";
import UpgradeCard from "@/components/settings/UpgradeCard";
import BuildflowLogo from "@/components/brand/BuildflowLogo";
import AccountPanel from "@/components/settings/AccountPanel";
import DisplayNamePrompt from "@/components/account/DisplayNamePrompt";
import DeployDesk from "@/components/deploy/DeployDesk";
import MemoryBoard from "@/components/memory/MemoryBoard";
import CostMeter from "@/components/cost/CostMeter";
import AuditLog from "@/components/governance/AuditLog";
import PermissionsPanel from "@/components/governance/PermissionsPanel";
import DesignStudio from "@/components/design/DesignStudio";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import type { Deploy, Integration, Project, ProjectFile, ProjectMemory, Role } from "@/types/db";
import type { ProviderName } from "@/lib/providers";

type Tab = "chat" | "canvas" | "design" | "memory" | "settings" | "deploy" | "cost" | "audit" | "permissions";
type ConnectionProvider = "github" | "vercel";

export default function OfficeWorkspace({
  project,
  displayName,
  avatarUrl,
  email,
  initialRuns,
  initialFiles,
  initialMemory,
  initialRoleModels,
  initialApiKeyProviders,
  initialConnectionProviders,
  initialDeploys,
  initialIntegrations,
}: {
  project: Project;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  initialRuns: RunWithSteps[];
  initialFiles: ProjectFile[];
  initialMemory: ProjectMemory | null;
  initialRoleModels: { role: Role; provider: string; model: string }[];
  initialApiKeyProviders: ProviderName[];
  initialConnectionProviders: ConnectionProvider[];
  initialDeploys: Deploy[];
  initialIntegrations: Integration[];
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const [canvasKey, setCanvasKey] = useState(0);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  // Addendum 17: the merge-status UI inside ChatPanel needs the project id
  // for its approve/reject/undo calls.
  setChatProjectId(project.id);
  // Local copy so BrandingPanel toggles (e.g. preview watermark) apply
  // immediately without a full refetch.
  const [projectState, setProjectState] = useState<Project>(project);

  function applyProjectPatch(patch: Partial<Project>) {
    setProjectState((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="flex h-screen flex-col text-neutral-100">
      {/* Addendum 9: one-time "What should we call you?" prompt — shows until
          a display name is saved (skipping defers it to the next visit). */}
      {displayName === "" && <DisplayNamePrompt />}
      {/* Addendum 13: tour re-runnable from inside the workspace via "?". */}
      <OnboardingTour autoStart={false} />
      <header className="workspace-header">
        <div className="workspace-header__top">
          <div className="workspace-header__identity">
            <BuildflowLogo surface="nav" className="shrink-0" />
            <Link href="/projects" className="workspace-header__breadcrumb">
              ~/buildflow
            </Link>
            <span className="workspace-header__separator" aria-hidden="true">/</span>
            <h1 className="workspace-header__title" title={projectState.name}>
              {projectState.name}
            </h1>
          </div>

          <div className="workspace-header__actions" role="group" aria-label="Workspace tools">
            <Link href="/prompts" className="workspace-shortcut" title="Prompt vault" aria-label="Prompt vault">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M5.25 2.75h6l3.5 3.5v10.5H5.25V2.75Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M11.25 2.9v3.6h3.5M7.75 10h4.5M7.75 13h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              <span>Vault</span>
            </Link>
            <Link href="/companions" className="workspace-shortcut" title="Companions" aria-label="Companions">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M10 2.5 11.7 7l4.55 1.75-4.55 1.7L10 15l-1.7-4.55L3.75 8.75 8.3 7 10 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="m15.5 13 .75 1.75L18 15.5l-1.75.75L15.5 18l-.75-1.75L13 15.5l1.75-.75L15.5 13Z" fill="currentColor"/></svg>
              <span>Companions</span>
            </Link>
            <Link href="/office-chat" className="workspace-shortcut" title="Team chat" aria-label="Team chat">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3 4.25h14v9.5H9l-4.5 3v-3H3v-9.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M6.25 8h7.5M6.25 10.75h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              <span>Team chat</span>
            </Link>
            <UserAvatarMenu
              displayName={displayName}
              avatarUrl={avatarUrl}
              email={email ?? ""}
              open={avatarMenuOpen}
              onToggle={() => setAvatarMenuOpen((v) => !v)}
              onClose={() => setAvatarMenuOpen(false)}
            />
          </div>
        </div>

        <nav className="workspace-header__nav" aria-label="Workspace sections">
          <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
            Chat
          </TabButton>
          <TabButton active={tab === "canvas"} onClick={() => setTab("canvas")}>
            Canvas
          </TabButton>
          <TabButton active={tab === "design"} onClick={() => setTab("design")}>
            Design Studio
          </TabButton>
          <TabButton active={tab === "memory"} onClick={() => setTab("memory")}>
            Memory
          </TabButton>
          <TabButton active={tab === "deploy"} onClick={() => setTab("deploy")}>
            Deploy
          </TabButton>
          <TabButton active={tab === "cost"} onClick={() => setTab("cost")}>
            Cost
          </TabButton>
          <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>
            Audit
          </TabButton>
          <TabButton active={tab === "permissions"} onClick={() => setTab("permissions")}>
            Perms
          </TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
            Config
          </TabButton>
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "chat" && (
          <div className="mx-auto h-full max-w-3xl" data-tour="office-chat">
            <ChatPanel
              projectId={project.id}
              initialRuns={initialRuns}
              onFilesChanged={() => setCanvasKey((k) => k + 1)}
            />
          </div>
        )}
        {tab === "canvas" && (
          <div data-tour="code-canvas">
            <CodeCanvas
              key={canvasKey}
              projectId={projectState.id}
              initialFiles={initialFiles}
              showWatermark={projectState.show_preview_watermark}
            />
          </div>
        )}
        {tab === "memory" && (
          <div data-tour="memory-audit">
            <MemoryBoard
              projectId={project.id}
              initialMemory={initialMemory}
              displayName={displayName}
            />
          </div>
        )}
        {tab === "design" && (
          <DesignStudio
            projectId={project.id}
            projectName={projectState.name}
            initialSummary={initialMemory?.summary ?? ""}
            onSendToAI={() => setTab("chat")}
          />
        )}
        {tab === "deploy" && (
          <div data-tour="deploy-desk">
            <DeployDesk
              project={projectState}
              initialDeploys={initialDeploys}
              hostingIntegrations={initialIntegrations.filter((i) => i.type === "hosting")}
            />
          </div>
        )}
        {tab === "cost" && <CostMeter projectId={project.id} />}
        {tab === "audit" && (
          <AuditLog projectId={project.id} displayName={displayName} />
        )}
        {tab === "permissions" && <PermissionsPanel projectId={project.id} />}
        {tab === "settings" && (
          <div className="space-y-10">
            <div className="mx-auto max-w-2xl px-6 pt-8">
              <AccountPanel />
            </div>
            <div className="mx-auto max-w-2xl px-6 pt-8">
              <UpgradeCard isPro={projectState.is_pro} />
            </div>
            <div className="mx-auto max-w-2xl px-6">
              <BrandingPanel project={projectState} onChanged={applyProjectPatch} />
            </div>
            <div data-tour="model-router">
              <ModelRouterPanel
                projectId={project.id}
                initialRoleModels={initialRoleModels}
                initialApiKeyProviders={initialApiKeyProviders}
                initialIntegrations={initialIntegrations}
              />
            </div>
            <div className="mx-auto max-w-2xl px-6">
              <ConnectionsPanel initialConfigured={initialConnectionProviders} />
            </div>
            <div className="mx-auto max-w-2xl px-6 pb-8">
              <IntegrationsPanel projectId={project.id} initialIntegrations={initialIntegrations.filter((i) => i.type === "hosting")} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`workspace-tab${active ? " workspace-tab--active" : ""}`}
    >
      {children}
    </button>
  );
}

function UserAvatarMenu({
  displayName,
  avatarUrl,
  email,
  open,
  onToggle,
  onClose,
}: {
  displayName: string;
  avatarUrl: string | null;
  email: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const initials =
    (displayName || email)
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U";
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  return (
    <div className="relative shrink-0">
      <button
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-neutral-200 hover:bg-neutral-700 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--role-strategist)]"
      >
        {avatarUrl && failedAvatarUrl !== avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName || "Your avatar"}
            width={32}
            height={32}
            className="h-full w-full rounded-full object-cover"
            onError={() => setFailedAvatarUrl(avatarUrl)}
          />
        ) : (
          initials
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute top-10 right-0 z-20 w-48 rounded-lg border border-neutral-800 bg-neutral-900 py-1 shadow-xl"
          >
            <div className="px-3 py-2 font-mono text-xs text-neutral-500">
              {displayName && <div className="font-medium text-neutral-200">{displayName}</div>}
              {email && <div className="truncate">{email}</div>}
            </div>
            <Link
              href="/account/profile"
              onClick={onClose}
              className="block px-3 py-1.5 font-mono text-xs text-neutral-300 hover:bg-neutral-800 hover:text-[var(--term-accent)]"
              role="menuitem"
            >
              ~/account
            </Link>
            <Link
              href="/download"
              onClick={onClose}
              className="block px-3 py-1.5 font-mono text-xs text-neutral-300 hover:bg-neutral-800 hover:text-[var(--term-accent)]"
              role="menuitem"
            >
              ~/desktop-app
            </Link>
            <form action="/auth/signout" method="post" className="m-0">
              <button
                type="submit"
                onClick={onClose}
                className="w-full px-3 py-1.5 text-left font-mono text-xs text-neutral-300 hover:bg-neutral-800 hover:text-[var(--role-ops)]"
                role="menuitem"
              >
                logout
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
