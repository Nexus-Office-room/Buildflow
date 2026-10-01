-- ============================================================
-- Addendum 15 — Nexus Office API tokens (purely additive).
-- Lets users create `nxo_live_...` credentials for the Nexus CLI / API.
-- Only a SHA-256 hash of each token is stored; the raw token exists solely
-- in the create response (and the user's clipboard / CLI config).
-- ============================================================

create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint api_tokens_scopes_valid check (
    scopes <@ array['projects:read','pipeline:run','vault:read','vault:write','deploy:trigger']::text[]
  ),
  constraint api_tokens_name_len check (char_length(name) between 1 and 60),
  constraint api_tokens_prefix_len check (char_length(token_prefix) <= 24)
);

create index if not exists api_tokens_user_created_idx on api_tokens (user_id, created_at desc);
create index if not exists api_tokens_hash_idx on api_tokens (token_hash);

alter table api_tokens enable row level security;

create policy "api_tokens_owner_all" on api_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Token lifecycle events (create / revoke / auth-denied) happen outside any
-- project. audit_events.project_id is NOT NULL today and cascades to projects;
-- relax it so system-level token activity can be audit-logged too. The
-- /api/projects/[id]/audit route already filters by project_id, so its
-- behavior is unchanged (NULL rows can never appear in a project timeline).
-- ---------------------------------------------------------------------------
alter table audit_events alter column project_id drop not null;
drop index if exists audit_events_project_created_idx;
create index if not exists audit_events_project_created_idx on audit_events (project_id, created_at desc);
create index if not exists audit_events_user_created_idx on audit_events (user_id, created_at desc);

-- Non-project audit events (token lifecycle) stay visible to their owner
-- only; project-scoped rows keep the existing project-ownership policy.
create policy "audit_events_owner_no_project" on audit_events
  for all using (project_id is null and auth.uid() = user_id) with check (
    project_id is null and auth.uid() = user_id
  );
