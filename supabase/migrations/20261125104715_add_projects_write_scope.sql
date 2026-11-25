-- Add the new scope without granting it to any existing token.
alter table public.api_tokens drop constraint api_tokens_scopes_valid;
alter table public.api_tokens add constraint api_tokens_scopes_valid check (
  scopes <@ array['projects:read','projects:write','pipeline:run','vault:read','vault:write','deploy:trigger']::text[]
);
