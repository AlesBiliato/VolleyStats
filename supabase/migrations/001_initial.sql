begin;

create table public.rosters (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  name text not null check (char_length(name) between 1 and 200),
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table public.matches (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  status text not null check (char_length(status) between 1 and 40),
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table public.user_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  current_match_id text,
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.prepare_cloud_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := pg_catalog.now();
  else
    new.version := old.version + 1;
    new.created_at := old.created_at;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.prepare_cloud_row() from public, anon, authenticated;

create trigger rosters_prepare_cloud_row
before insert or update on public.rosters
for each row execute function public.prepare_cloud_row();

create trigger matches_prepare_cloud_row
before insert or update on public.matches
for each row execute function public.prepare_cloud_row();

create trigger user_state_prepare_cloud_row
before insert or update on public.user_state
for each row execute function public.prepare_cloud_row();

alter table public.rosters enable row level security;
alter table public.matches enable row level security;
alter table public.user_state enable row level security;

revoke all on table public.rosters, public.matches, public.user_state
from anon, authenticated;

grant select, insert, update, delete
on table public.rosters, public.matches, public.user_state
to authenticated;

create policy "rosters_select_own"
on public.rosters for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "rosters_insert_own"
on public.rosters for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "rosters_update_own"
on public.rosters for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "rosters_delete_own"
on public.rosters for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "matches_select_own"
on public.matches for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "matches_insert_own"
on public.matches for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "matches_update_own"
on public.matches for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "matches_delete_own"
on public.matches for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "user_state_select_own"
on public.user_state for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "user_state_insert_own"
on public.user_state for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "user_state_update_own"
on public.user_state for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy "user_state_delete_own"
on public.user_state for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

commit;
