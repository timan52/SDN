-- SDN v0.8 upgrade for an EXISTING v0.7 database.
-- Run ONCE, separately from the original initial migration. No tables are dropped.
-- Adds a minimally exposed Discord display-name lookup and assigns random
-- character IDs on the server; the player's submitted value is ignored.

create table if not exists public.sdn_discord_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discord_name text not null check (length(discord_name) between 1 and 100),
  discord_username text not null check (length(discord_username) between 1 and 100),
  updated_at timestamptz not null default now()
);

alter table public.sdn_discord_profiles enable row level security;
drop policy if exists sdn_discord_profiles_read on public.sdn_discord_profiles;
create policy sdn_discord_profiles_read
  on public.sdn_discord_profiles for select to authenticated
  using (public.sdn_is_member());
revoke all on public.sdn_discord_profiles from anon, authenticated;
grant select on public.sdn_discord_profiles to authenticated;

create or replace function public.sdn_assign_random_character_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare random_id text;
begin
  -- This is only used for a NEW row. Existing approved IDs remain unchanged.
  -- The random result is not controlled by p_create or the browser.
  loop
    random_id := 'SDN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (
      select 1 from public.sdn_characters c where c.data->>'sdnId'=random_id
    );
  end loop;
  new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{sdnId}', to_jsonb(random_id), true);
  return new;
end;
$$;

drop trigger if exists sdn_random_character_id on public.sdn_characters;
create trigger sdn_random_character_id
before insert on public.sdn_characters
for each row execute function public.sdn_assign_random_character_id();

revoke all on function public.sdn_assign_random_character_id() from public, anon, authenticated;

-- No schema change for reports: caseStatus, organization and villain are
-- optional keys inside the existing report JSONB document.
-- Older reports without caseStatus are interpreted using their outcome field.

-- Character IDs are permanent. Even a manually constructed change ticket
-- cannot replace an approved (or draft) ID after it has been assigned.
create or replace function public.sdn_keep_character_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.data->>'sdnId' is distinct from old.data->>'sdnId' then
    raise exception 'Die zufällig zugewiesene SDN-ID kann nicht geändert werden.';
  end if;
  return new;
end;
$$;
drop trigger if exists sdn_immutable_character_id on public.sdn_characters;
create trigger sdn_immutable_character_id
before update on public.sdn_characters
for each row execute function public.sdn_keep_character_id();
revoke all on function public.sdn_keep_character_id() from public, anon, authenticated;
