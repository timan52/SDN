-- SDN v0.10: Append-only personnel file notes (on existing v0.8 DB).
-- Run once in Supabase SQL Editor BEFORE updating the website.
-- No existing character, report, or ticket records are modified.

alter table public.sdn_access
  add column if not exists is_hr boolean not null default false;

create or replace function public.sdn_is_hr()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sdn_access a
    where a.user_id = (select auth.uid())
      and a.verified_until > now() and a.is_hr
  );
$$;
revoke all on function public.sdn_is_hr() from public, anon;
grant execute on function public.sdn_is_hr() to authenticated;

create table if not exists public.sdn_file_notes (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.sdn_characters(id) on delete cascade,
  author_character_id uuid not null references public.sdn_characters(id),
  actor_id uuid not null references auth.users(id),
  author_alias text not null check (char_length(author_alias) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists sdn_file_notes_character_time
  on public.sdn_file_notes(character_id, created_at desc);
alter table public.sdn_file_notes enable row level security;

-- Only verified guild members who can already read the target dossier may
-- retrieve its notes. No client-facing insert, update, or delete policy.
drop policy if exists sdn_file_notes_member_read on public.sdn_file_notes;
create policy sdn_file_notes_member_read on public.sdn_file_notes
  for select to authenticated
  using (public.sdn_is_member() and exists (
    select 1 from public.sdn_characters c
    where c.id = sdn_file_notes.character_id
      and (c.status='approved' or c.owner_id=(select auth.uid()) or public.sdn_is_admin())
  ));
revoke all on table public.sdn_file_notes from anon, authenticated;
grant select on public.sdn_file_notes to authenticated;

-- Server validates BOTH staff membership (SL or HR) and that the author
-- persona is the logged-in user's OWN approved character. Caller cannot
-- supply a timestamp, display name, or Discord user ID.
create or replace function public.sdn_add_file_note(
  p_character_id uuid,
  p_author_character_id uuid,
  p_body text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_author text;
  v_id uuid;
begin
  if v_actor is null or not public.sdn_is_member() then
    raise exception 'Gültige Discord-Servermitgliedschaft erforderlich';
  end if;
  if not (public.sdn_is_admin() or public.sdn_is_hr()) then
    raise exception 'Nur SL oder HR dürfen Aktennotizen erstellen';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 5000 then
    raise exception 'Aktennotiz muss 1 bis 5.000 Zeichen enthalten';
  end if;
  if not exists (
    select 1 from public.sdn_characters
    where id = p_character_id and status = 'approved'
  ) then
    raise exception 'Aktennotizen sind nur für freigegebene Charaktere möglich';
  end if;
  select left(nullif(btrim(c.data->>'alias'),''),120)
  into v_author
  from public.sdn_characters c
  where c.id=p_author_character_id and c.owner_id=v_actor and c.status='approved';
  if v_author is null then
    raise exception 'Bitte einen eigenen freigegebenen Charakter als Verfasser wählen';
  end if;
  insert into public.sdn_file_notes
    (character_id,author_character_id,actor_id,author_alias,body)
  values (p_character_id,p_author_character_id,v_actor,v_author,btrim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.sdn_add_file_note(uuid,uuid,text) from public,anon;
grant execute on function public.sdn_add_file_note(uuid,uuid,text) to authenticated;
