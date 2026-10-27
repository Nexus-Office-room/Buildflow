-- Small team rooms for conversations shared by authenticated Buildflow users.
-- Room membership does not grant access to the owner's projects or API keys.

create table if not exists office_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists office_room_members (
  room_id uuid not null references office_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists office_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references office_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index if not exists office_room_messages_room_time_idx
  on office_room_messages (room_id, created_at desc);
create index if not exists office_room_members_user_idx
  on office_room_members (user_id, joined_at desc);

create or replace function is_office_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from office_room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

create or replace function join_office_room(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_room uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select id into matched_room from office_rooms where invite_code = p_invite_code;
  if matched_room is null then
    raise exception 'Invite link is invalid';
  end if;
  insert into office_room_members(room_id, user_id, role)
  values (matched_room, auth.uid(), 'member')
  on conflict (room_id, user_id) do nothing;
  return matched_room;
end;
$$;

create or replace function is_office_room_creator(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from office_rooms
    where id = p_room_id and created_by = auth.uid()
  );
$$;

revoke all on function is_office_room_member(uuid) from public;
revoke all on function join_office_room(text) from public;
revoke all on function is_office_room_creator(uuid) from public;
grant execute on function is_office_room_member(uuid) to authenticated;
grant execute on function join_office_room(text) to authenticated;
grant execute on function is_office_room_creator(uuid) to authenticated;

alter table office_rooms enable row level security;
alter table office_room_members enable row level security;
alter table office_room_messages enable row level security;

create policy "office_rooms_member_read" on office_rooms
  for select using (created_by = auth.uid() or is_office_room_member(id));
create policy "office_rooms_creator_insert" on office_rooms
  for insert with check (created_by = auth.uid());
create policy "office_rooms_owner_update" on office_rooms
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "office_rooms_owner_delete" on office_rooms
  for delete using (created_by = auth.uid());

create policy "office_room_members_member_read" on office_room_members
  for select using (is_office_room_member(room_id));
create policy "office_room_members_creator_add_self" on office_room_members
  for insert with check (
    user_id = auth.uid() and is_office_room_creator(room_id)
  );
create policy "office_room_members_self_leave" on office_room_members
  for delete using (user_id = auth.uid());

create policy "office_room_messages_member_read" on office_room_messages
  for select using (is_office_room_member(room_id));
create policy "office_room_messages_member_send" on office_room_messages
  for insert with check (sender_id = auth.uid() and is_office_room_member(room_id));
