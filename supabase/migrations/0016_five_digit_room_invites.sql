-- Room creators choose a short numeric invite code. Backfill existing rooms
-- before enforcing the new format.
do $$
declare
  target record;
  candidate text;
  candidate_number integer := 0;
begin
  for target in
    select id
    from public.office_rooms
    where invite_code !~ '^[0-9]{5}$'
    order by created_at, id
  loop
    loop
      candidate_number := candidate_number + 1;
      if candidate_number > 99999 then
        raise exception 'Cannot assign unique five-digit invite codes: code space exhausted';
      end if;
      candidate := lpad(candidate_number::text, 5, '0');
      exit when not exists (
        select 1 from public.office_rooms where invite_code = candidate
      );
    end loop;
    update public.office_rooms set invite_code = candidate where id = target.id;
  end loop;
end;
$$;

alter table public.office_rooms
  add constraint office_rooms_invite_code_five_digits
  check (invite_code ~ '^[0-9]{5}$');

-- Keep failed guesses in the database so serverless instances share one limit.
create table if not exists public.office_room_join_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 10)
);
alter table public.office_room_join_attempts enable row level security;
revoke all on table public.office_room_join_attempts from public, anon, authenticated;

create or replace function public.join_office_room(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_room uuid;
  attempt_window timestamptz;
  failed_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_invite_code is null or p_invite_code !~ '^[0-9]{5}$' then
    return null;
  end if;

  select window_started_at, failed_attempts
    into attempt_window, failed_count
    from public.office_room_join_attempts
    where user_id = auth.uid();
  if found and attempt_window > now() - interval '15 minutes' and failed_count >= 10 then
    raise exception 'Too many incorrect invite codes';
  end if;

  select id into matched_room
    from public.office_rooms
    where invite_code = p_invite_code;
  if matched_room is null then
    insert into public.office_room_join_attempts as attempts(user_id, window_started_at, failed_attempts)
      values (auth.uid(), now(), 1)
      on conflict (user_id) do update set
        window_started_at = case
          when attempts.window_started_at <= now() - interval '15 minutes' then now()
          else attempts.window_started_at
        end,
        failed_attempts = case
          when attempts.window_started_at <= now() - interval '15 minutes' then 1
          else attempts.failed_attempts + 1
        end;
    return null;
  end if;

  delete from public.office_room_join_attempts where user_id = auth.uid();
  insert into public.office_room_members(room_id, user_id, role)
    values (matched_room, auth.uid(), 'member')
    on conflict (room_id, user_id) do nothing;
  return matched_room;
end;
$$;
