# Buildflow

A persistent 5-role AI team (Strategist, Builder, Analyst, QA, Ops) for vibe coders,
running on Next.js + Supabase, with a terminal CLI over the same API.

## Monorepo layout (Addendum 17)

```
apps/
  web/                 # Next.js app (UI + API routes)
  cli/                 # `buildflow` CLI (login, chat, sync, vault, deploy, undo, REPL)
packages/
  pipeline-types/      # shared TypeScript types (zero runtime deps)
  github-sync/         # GitHub commit/vault/diff logic shared by web + CLI
  api-client/          # @buildflow/api-client — typed client for the web API
supabase/              # migrations (run in filename order)
```

npm workspaces: install once at the root (`npm install`), run app commands
from the root (`npm run dev`, `npm run build`, `npm run typecheck`,
`npm run cli -- --help`).

## Status: MVP + v2 modules + isolation

- **Project workspace** — create/select a project; each has persistent memory
  (tech stack, decisions log, open issues) in Supabase.
- **Office Chat** — every message runs the Strategist first. Simple questions get
  a direct answer; real work triggers the full pipeline
  (Strategist → Builder → Analyst → QA → Ops), with the full transcript persisted
  per project and Ops updating memory before the run completes.
- **Code Canvas** — file tree + Monaco editor + a best-effort static preview
  iframe, plus an "Undo last run" rollback button.
- **Agent isolation** — every run's Builder writes land on an isolated per-run
  snapshot (`run_snapshots`), scope-checked against a File Scoper's declared
  file list, then merged (auto by default, or gated behind a reviewable diff
  per project via "Require approval before merging code changes").
- **Model Router** — per-role, per-project provider and model selection, with
  per-user API keys encrypted at rest (`role_models`, `api_keys` tables).
- **Cost Meter** — running token/cost estimate per project from persisted steps.
- **Memory Board, Prompt Vault, Deploy Desk, Governance** — role capabilities,
  approval gating, audit log, and an encrypted secrets vault.
- **CLI** — `buildflow login | whoami | projects list | chat | sync | vault | deploy | undo`,
  plus a conversational REPL when run with no arguments in a project directory.
  See `apps/cli/`.
- **Buildflow API tokens** — scoped, revocable `nxo_live_…` credentials for the CLI
  and scripts (see [API tokens](#api-tokens-nxo_live)).

## Setup

1. Create a Supabase project.
2. Run **all** migrations in `supabase/migrations/` in filename order (via the
   SQL editor, or `supabase db push` if using the CLI).
3. Copy `.env.local.example` to `apps/web/.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your
     Supabase project settings.
   - At least one provider key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or
     `GOOGLE_API_KEY` (the default provider is Google/Gemini — see
     `DEFAULT_PROVIDER_CONFIG` in `src/lib/providers/index.ts`).
   - `NEXUS_ENCRYPTION_KEY` — required for storing user API keys and secrets
     (generation command is in `.env.local.example`).
   - `CODEBUFF_API_KEY` — optional, only if you use the Codebuff provider
     (see the next section).
   - `RESEND_API_KEY` / `FEEDBACK_EMAIL` — optional, for feedback email
     notifications.
4. `npm install`
5. `npm run dev` and open http://localhost:3000. You'll be redirected to
   `/login` — sign up with an email/password (Supabase email confirmation
   applies unless disabled in your project's auth settings) or GitHub.

### Dev escape hatch

Set `NEXUS_MOCK_LLM=1` to run the whole pipeline against canned, role-aware
responses instead of real providers — no API keys or spend needed for testing
routing, persistence, and the UI.

## Codebuff provider (agent runtime)

Besides the plain LLM providers, any role can be routed to **Codebuff** — the
open agent framework that powers [Freebuff](https://freebuff.com). A role on the
`codebuff` provider runs as a *real agent* (via
[`@codebuff/sdk`](https://www.npmjs.com/package/@codebuff/sdk)) instead of a
single completion call:

- **Tools** — the agent gets a sandboxed `project_read_file` tool to read files
  from the project's Code Canvas tree (never the host filesystem). Every call is
  gated by the role's `read_files` capability in the Governance panel.
- **Structured outputs** — the Strategist returns its routing decision and Ops
  returns its memory update as validated JSON, not fenced blocks to parse.
- **Live progress** — tool calls stream to the Office Chat UI as a status line
  while the agent works.

### Enabling it

1. Get an API key at [codebuff.com/api-keys](https://www.codebuff.com/api-keys)
   and set `CODEBUFF_API_KEY` in `.env.local` (or have each user save their own
   key under Model Router → API Keys — user keys win over the server key).
2. In a project's **Model Router**, pick *Codebuff agents* for any role and
   choose a model (Gemini Flash, Claude Sonnet, GPT-5 Mini, or DeepSeek V4
   Flash).

### Credits: important

The Codebuff **apps** (CLI, Desktop, Web) include free models, but **direct
SDK/API calls bill the linked Codebuff account**. If your account has no
credits, agent runs fail with `Payment Required` — plain Anthropic/OpenAI/
Google roles keep working; only roles routed to `codebuff` are affected. Add
credits on [codebuff.com](https://codebuff.com) to make the agent path fully
functional.

## How the pipeline works

`apps/web/src/lib/pipeline/run.ts` is the orchestrator:

1. Loads the project's `project_memory` row (creating it if this is the first run).
2. Calls the Strategist with the memory + user message. The Strategist ends its
   reply with a ` ```strategist ` fenced JSON block containing
   `needs_full_pipeline` and a `direction` (roles on the Codebuff provider
   return this as structured output instead).
3. **Direct** (`needs_full_pipeline: false`): Ops writes the final answer from
   the Strategist's direction and the run ends.
4. **Pipeline** (`needs_full_pipeline: true`): a File Scoper sub-step declares
   which files the work may touch, then Builder → Analyst → QA → Ops run in
   sequence, each one receiving the project memory, the user's message, and
   every prior role's output from this turn. The Builder's fenced `path=...`
   code blocks are captured into the run's **isolated snapshot** (never written
   straight to the `files` table), scope-enforced against the declared list,
   and merged after QA/Ops — automatically, or after your review when
   `require_merge_approval` is on (Addendum 17). Ops closes with a memory
   update that gets merged into `project_memory` before the run is marked
   complete.

Every step is persisted to `pipeline_steps` (one row per role) linked to a
`pipeline_runs` row, so the full transcript is queryable per project.

All provider calls (plain LLM path) have a hard timeout and bounded retries
with exponential backoff; agent runs on the Codebuff path have their own
step limit and wall-clock timeout.

## Schema

See `supabase/migrations/`. RLS policies restrict every table to rows owned
(directly or via `project_id`/`run_id`) by `auth.uid()`.

## API tokens (`nxo_live…`)

Mint credentials at **Account → API Keys** (`/account/api-keys`). The raw
token is shown exactly once at creation — only its SHA-256 hash is stored
(`api_tokens` table, migration 0014). Token requests authenticate with
`Authorization: Bearer <token>` and hit the same routes as the web app;
what a token may do is governed by its scopes.

### Scopes

| Scope | Grants |
|---|---|
| `projects:read` | List/get projects, read merge candidates, `buildflow whoami` |
| `projects:write` | Create and update projects |
| `pipeline:run` | Run the 5-role pipeline, merge/reject/undo run snapshots |
| `vault:read` | Read Prompt Vault entries |
| `vault:write` | Create, update, delete Prompt Vault entries |
| `deploy:trigger` | Trigger production deploys and force GitHub syncs |

Tokens are read-only by default: with no scopes selected, `projects:read` and
`vault:read` are applied. Tokens can be revoked or given an expiry (7/30/90/365
days or never); each carries a fixed 120-requests/minute limit and all actions
are audit-attributed ("API token: <name>") without ever logging token material.

### CLI

Run it from the monorepo while developing:

```bash
npm run cli -- --help
```

Build a standalone Node.js 20+ package and install the generated tarball:

```bash
npm run build --workspace @buildflow/cli
npm pack --workspace @buildflow/cli
npm install --global ./buildflow-cli-0.1.0.tgz
```

The bundle includes the shared API client and GitHub helpers, so the installed
CLI does not need the monorepo or a separate `tsx` runtime.

Available commands include `login`, `logout`, `whoami`, `projects list`,
`chat`, `sync`, `vault list`, `vault use`, `deploy`, and `undo`. In a connected
project directory, running `buildflow` opens the interactive chat REPL (the legacy `nexus` command remains available).

For example:

```bash
buildflow login --api-token nxo_live_…   # validated against the server before storing
buildflow whoami                         # shows credential kind + visible project count
```

`buildflow login` (browser flow) and `buildflow login --token` (Supabase access token)
remain available; `--api-token` is the least-privilege option for shared
machines and CI. Credentials live in `~/.nexus/config` (mode 0600).

Existing API tokens do not gain `projects:write` automatically. Create a new token with that scope to create or update projects. Apply the database migration before deploying the application update.

### Endpoints and required scopes

| Endpoint | Method | Scope |
|---|---|---|
| `/api/projects` | GET | `projects:read` |
| `/api/projects` | POST | `projects:write` |
| `/api/projects/{id}` | GET | `projects:read` |
| `/api/projects/{id}` | PATCH | `projects:write` |
| `/api/pipeline` | POST | `pipeline:run` |
| `/api/projects/{id}/merge` | GET, POST | `pipeline:run` |
| `/api/projects/{id}/merge-candidate` | GET | `projects:read` |
| `/api/projects/{id}/undo` | POST | `pipeline:run` |
| `/api/projects/{id}/deploy` | POST | `deploy:trigger` |
| `/api/projects/{id}/github/sync` | POST | `deploy:trigger` |
| `/api/prompts` | GET | `vault:read` |
| `/api/prompts` | POST | `vault:write` |
| `/api/me/display-name` | GET | `projects:read` |

Example:

```bash
curl -H "Authorization: Bearer $NEXUS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<id>","message":"Add a footer to the landing page"}' \
  http://localhost:3000/api/pipeline
```

Errors are non-revealing: every invalid/revoked/expired token returns the same
generic 401, and a scope miss returns 403 naming only the missing scope.
