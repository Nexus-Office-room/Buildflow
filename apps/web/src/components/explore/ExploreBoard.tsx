"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createNexusClient } from "@nexus-office/api-client";
import BuildflowLogo from "@/components/brand/BuildflowLogo";

const nexus = createNexusClient();
const categories = ["All Builds", "Fullstack", "Mobile", "AI Apps", "Web3", "DevOps"] as const;

interface PublicPrompt {
  prompt_id: string;
  author_display_name: string;
  author_avatar_url: string | null;
  title: string;
  body: string;
  preview: string;
  tags: string[];
  updated_at: string;
}

function matchesCategory(prompt: PublicPrompt, category: string) {
  if (category === "All Builds") return true;
  const terms: Record<string, string[]> = {
    Fullstack: ["fullstack", "full-stack", "web", "backend", "frontend"],
    Mobile: ["mobile", "ios", "android", "expo", "react native"],
    "AI Apps": ["ai", "llm", "agent", "machine learning", "chatbot"],
    Web3: ["web3", "blockchain", "crypto", "solidity", "smart contract"],
    DevOps: ["devops", "deploy", "docker", "ci/cd", "infrastructure"],
  };
  const haystack = [...prompt.tags, prompt.title, prompt.preview].join(" ").toLowerCase();
  return (terms[category] ?? []).some((term) => haystack.includes(term));
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "B";
}

export default function ExploreBoard({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [prompts, setPrompts] = useState<PublicPrompt[] | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("All Builds");
  const [search, setSearch] = useState("");
  const [usedId, setUsedId] = useState<string | null>(null);
  const [reportedId, setReportedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { prompts: list, allTags: tags } = await nexus.listExplorePrompts();
        setPrompts(list);
        setAllTags(tags);
      } catch {
        setPrompts([]);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!prompts) return [];
    const q = search.trim().toLowerCase();
    return prompts.filter((p) => {
      const matchesQuery = !q || [p.title, p.body, p.preview, ...p.tags].join(" ").toLowerCase().includes(q);
      return matchesQuery && matchesCategory(p, category) && (!activeTag || p.tags.includes(activeTag));
    });
  }, [prompts, search, category, activeTag]);

  function handleUsePrompt(p: PublicPrompt) {
    if (!signedIn) {
      sessionStorage.setItem("nexus-use-prompt", JSON.stringify({ title: p.title, body: p.body }));
      router.push("/login");
      return;
    }
    localStorage.setItem("nexus-pending-prompt", JSON.stringify({ title: p.title, body: p.body }));
    setUsedId(p.prompt_id);
    setTimeout(() => router.push("/projects"), 600);
  }

  async function reportPrompt(p: PublicPrompt) {
    const reason = window.prompt(`Report “${p.title}” — why are you flagging this prompt?`);
    if (!reason?.trim()) return;
    try {
      await nexus.reportExplorePrompt(p.prompt_id, reason.trim());
      setReportedId(p.prompt_id);
      setTimeout(() => setReportedId(null), 2500);
    } catch {
      // Reporting remains best-effort, as on the original Explore feed.
    }
  }

  const featured = filtered[0];
  const builds = filtered.slice(1);

  return (
    <div className="grid min-h-[calc(100vh-5rem)] lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden border-r border-white/[0.07] px-5 py-7 lg:block">
        <Link href="/projects" className="mb-10 flex items-center gap-3 text-sm font-semibold tracking-wide text-white">
          <BuildflowLogo surface="nav" />
          Buildflow
        </Link>
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-600">Workspace</p>
        <nav aria-label="Workspace" className="space-y-1">
          {[["▦", "Projects", "/projects"], ["⌕", "Explore", "/explore"], ["▤", "Prompts", "/prompts"], ["✳", "Companions", "/companions"], ["◫", "Office", "/office"]].map(([icon, label, href]) => (
            <Link key={href} href={href} aria-current={href === "/explore" ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${href === "/explore" ? "bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20" : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"}`}>
              <span aria-hidden="true" className="w-5 text-center text-base">{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="mt-10 rounded-xl border border-red-400/15 bg-red-400/[0.045] p-4">
          <div className="mb-2 text-xs font-semibold text-red-300">Build together</div>
          <p className="text-xs leading-relaxed text-neutral-500">Find a prompt, bring it into your workspace, and make it yours.</p>
          <Link href="/prompts" className="mt-3 inline-block text-xs font-medium text-blue-300 hover:text-blue-200">Open Prompt Vault →</Link>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
        <nav aria-label="Workspace" className="mb-6 flex gap-2 overflow-x-auto lg:hidden">
          {[["Projects", "/projects"], ["Explore", "/explore"], ["Prompts", "/prompts"], ["Companions", "/companions"], ["Office", "/office"]].map(([label, href]) => <Link key={href} href={href} aria-current={href === "/explore" ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-xs ${href === "/explore" ? "bg-blue-500/10 text-blue-300" : "text-neutral-400 hover:bg-white/[0.04]"}`}>{label}</Link>)}
        </nav>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-red-300">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Community board
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Explore builds</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-400">Discover ideas and prompts shared by builders. Bring any prompt straight into your Buildflow workspace.</p>
          </div>
          <Link href="/prompts" className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-blue-400/40 hover:bg-blue-400/[0.06]">Your Prompt Vault <span className="ml-1 text-blue-300">↗</span></Link>
        </div>

        <label className="mb-5 flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-[#101319] px-4 transition focus-within:border-blue-400/50">
          <span aria-hidden="true" className="text-lg text-blue-300">⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prompts, tools, or ideas…" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-600" />
          {search && <button onClick={() => setSearch("")} className="text-xs text-neutral-500 hover:text-white">Clear</button>}
        </label>

        <div className="mb-8 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Build categories">
          {categories.map((item) => <button key={item} role="tab" aria-selected={category === item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition ${category === item ? "border-blue-400/40 bg-blue-500/15 text-blue-200" : "border-white/[0.08] bg-white/[0.025] text-neutral-400 hover:border-white/20 hover:text-white"}`}>{item}</button>)}
        </div>

        {allTags.length > 0 && <div className="-mt-4 mb-7 flex flex-wrap gap-2" aria-label="Filter by tag">
          {allTags.map((tag) => <button key={tag} aria-pressed={activeTag === tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} className={`rounded-md px-2.5 py-1 text-[11px] transition ${activeTag === tag ? "bg-red-400/15 text-red-200 ring-1 ring-red-400/30" : "bg-white/[0.04] text-neutral-500 hover:text-neutral-200"}`}>#{tag}</button>)}
        </div>}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Featured prompt</h2>
          <span className="text-xs text-neutral-600">{filtered.length} {filtered.length === 1 ? "build" : "builds"}</span>
        </div>

        {prompts === null && <div className="h-56 animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.025]" aria-label="Loading shared prompts" />}
        {prompts !== null && !featured && <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/[0.08] text-xl text-blue-300">⌕</div>
          <p className="font-medium text-white">No builds found</p>
          <p className="mt-1 text-sm text-neutral-500">Try another search or category. Shared prompts from your Prompt Vault will appear here.</p>
          <Link href="/prompts" className="mt-5 inline-flex rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400">Open Prompt Vault</Link>
        </div>}

        {featured && <article className="relative mb-9 overflow-hidden rounded-2xl border border-blue-300/15 bg-[#10141c] p-6 sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-28 h-72 w-72 rounded-full bg-blue-500/[0.12] blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-red-500/[0.08] blur-3xl" />
          <div className="relative grid gap-8 md:grid-cols-[1fr_220px] md:items-center">
            <div>
              <div className="mb-4 flex items-center gap-2"><span className="rounded-full border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-300">Community pick</span><span className="text-xs text-neutral-600">{new Date(featured.updated_at).toLocaleDateString()}</span></div>
              <h3 className="max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">{featured.title}</h3>
              <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-neutral-400">{featured.preview}</p>
              <div className="mt-5 flex flex-wrap gap-2">{featured.tags.map((tag) => <span key={tag} className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[11px] text-neutral-400">{tag}</span>)}</div>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button onClick={() => handleUsePrompt(featured)} className="rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400">{usedId === featured.prompt_id ? "Opening workspace…" : signedIn ? "Use this prompt" : "Sign in to use"}<span className="ml-2">→</span></button>
                <div className="flex items-center gap-2 text-xs text-neutral-400">{featured.author_avatar_url ? <img src={featured.author_avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-400/10 text-[10px] font-semibold text-red-200">{initials(featured.author_display_name || "Builder")}</span>}<span>Shared by <strong className="font-medium text-neutral-200">{featured.author_display_name || "Anonymous builder"}</strong></span><button onClick={() => reportPrompt(featured)} className="ml-1 text-neutral-600 hover:text-neutral-300" title="Flag this prompt for review">{reportedId === featured.prompt_id ? "Reported ✓" : "Report"}</button></div>
              </div>
            </div>
            <div className="relative hidden aspect-square items-center justify-center rounded-2xl border border-white/[0.08] bg-black/20 md:flex">
              <div aria-hidden="true" className="absolute inset-5 rounded-xl border border-blue-300/10" />
              <div aria-hidden="true" className="absolute inset-9 rounded-xl border border-red-300/10" />
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-400/[0.08] text-3xl text-blue-200 shadow-[0_0_60px_rgba(59,130,246,0.16)]">✳</div>
              <span className="absolute bottom-4 left-4 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-600">Buildflow community</span>
            </div>
          </div>
        </article>}

        {builds.length > 0 && <>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Community templates</h2><span className="text-xs text-neutral-600">Latest shared ideas</span></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {builds.map((p, i) => <article key={p.prompt_id} className="sweep-in flex min-h-64 flex-col rounded-xl border border-white/[0.08] bg-[#101319] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-blue-300/25 hover:bg-[#131821]" style={{ animationDelay: `${i * 35}ms` }}>
              <div className="mb-4 flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-400/15 bg-red-400/[0.06] text-lg text-red-200">{["◈", "⌘", "✳", "◇"][i % 4]}</div><button onClick={() => reportPrompt(p)} title="Flag this prompt for review" className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-white/[0.05] hover:text-neutral-300">{reportedId === p.prompt_id ? "Reported ✓" : "···"}</button></div>
              <h3 className="font-semibold leading-snug text-white">{p.title}</h3>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">{p.preview}</p>
              {p.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{p.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-md bg-white/[0.045] px-2 py-1 text-[10px] text-neutral-500">{tag}</span>)}</div>}
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                <div className="flex min-w-0 items-center gap-2">{p.author_avatar_url ? <img src={p.author_avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-400/10 text-[10px] font-semibold text-blue-200">{initials(p.author_display_name || "Builder")}</span>}<div className="min-w-0"><div className="truncate text-[11px] font-medium text-neutral-300">{p.author_display_name || "Anonymous builder"}</div><div className="text-[10px] text-neutral-600">{new Date(p.updated_at).toLocaleDateString()}</div></div></div>
                <button onClick={() => handleUsePrompt(p)} className="shrink-0 rounded-lg border border-blue-400/20 px-3 py-2 text-xs font-medium text-blue-200 transition hover:bg-blue-400/10">{usedId === p.prompt_id ? "Opening…" : signedIn ? "Use prompt →" : "Sign in →"}</button>
              </div>
            </article>)}
          </div>
        </>}
        {!signedIn && featured && <p className="mt-8 text-center text-xs text-neutral-600"><Link href="/login" className="text-blue-300 underline underline-offset-2 hover:text-blue-200">Sign in</Link> to bring community prompts into your workspace.</p>}
      </main>
    </div>
  );
}
