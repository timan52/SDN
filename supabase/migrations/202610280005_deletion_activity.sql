-- SDN v0.13 – SL-only deletion with link cleanup + post-approval activity tag.
-- Prerequisites: all migrations through v0.12 have been applied.
-- Run ONCE in the Supabase SQL Editor after exporting important data.
-- Character/report deletion is PERMANENT. Audit keeps only a tombstone event.

begin;

-- The label lives in the character's existing JSONB document.
-- Keep creation and modification rules enforced by PostgreSQL, not the browser.
create or replace function public.sdn_enforce_activity_status()
returns trigger language plpgsql set search_path = '' as $$
declare activity text := coalesce(new.data->>'activityStatus', '');
begin
  if activity not in ('', 'active', 'inactive') then
    raise exception 'Ungültiger Aktivitätsstatus. Erlaubt: aktiv oder inaktiv.';
  end if;
  if new.status='draft' and activity <> '' then
    raise exception 'Ein Aktivitätsstatus kann erst nach der Charakterfreigabe gesetzt werden.';
  end if;
  return new;
end;
$$;

drop trigger if exists sdn_enforce_activity_status_trigger on public.sdn_characters;
create trigger sdn_enforce_activity_status_trigger
before insert or update of data,status on public.sdn_characters
for each row execute function public.sdn_enforce_activity_status();

-- Extend the field whitelist for PLAYER change tickets.
-- Every player's status change still requires approval through sdn_review_ticket.
create or replace function public.sdn_field_path(k text) returns text[]
language plpgsql immutable set search_path = '' as $$
begin
  if k = any(array['hair','eyes','build','skin','distinguishing','description','impression']) then
    return array['appearance',k];
  elsif k = any(array['character','motivation','behavior','assessment','likes','dislikes']) then
    return array['personality',k];
  elsif k = any(array['background','criminalRecord','formerAffiliations','medicalConditions',
                     'medicalInjuries','medicalTreatments','medicalAllergies','medicalNotes']) then
    return array['history',k];
  elsif k = any(array['hasCover','coverName','coverDetails','notes']) then
    return array['secret',k];
  elsif k = any(array['name','alias','sdnId','role','hasSecretIdentity','height','weight','age','sex','blood',
                     'birthplace','birthday','player','discordChannelUrl','classCode','personalNotes','powerName',
                     'received','origin','powerDescription','weaknesses','generalWeaknesses','generalStrengths',
                     'generalAbilities','activityStatus']) then
    return array[k];
  else
    raise exception 'Unzulässiges Aktenfeld: %', k;
  end if;
end;
$$;

-- HR cannot delete or set status: only a currently verified SL.
create or replace function public.sdn_set_character_activity(
  p_character_id uuid, p_activity text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.sdn_is_admin() then
    raise exception 'Nur die Spielleitung darf Aktivitätsstatus direkt setzen.';
  end if;
  if p_activity not in ('active','inactive') then
    raise exception 'Nur Aktiv und Inaktiv sind zulässig.';
  end if;
  update public.sdn_characters
     set data = jsonb_set(data, '{activityStatus}', to_jsonb(p_activity), true),
         version=version+1, updated_at=now()
   where id=p_character_id and status='approved';
  if not found then raise exception 'Nur freigegebene Charaktere können einen Aktivitätsstatus erhalten.'; end if;
  insert into public.sdn_audit(character_id,actor_id,action,ref)
  values(p_character_id,auth.uid(),'character_activity_changed',p_activity);
end;
$$;

-- Preserve existing file-note text, historical author name and timestamp if
-- its author CHARACTER is deleted. The live foreign-key link is removed.
alter table public.sdn_file_notes
  alter column author_character_id drop not null;
alter table public.sdn_file_notes
  drop constraint if exists sdn_file_notes_author_character_id_fkey;
alter table public.sdn_file_notes
  add constraint sdn_file_notes_author_character_id_fkey
  foreign key (author_character_id) references public.sdn_characters(id)
  on delete set null;

create or replace function public.sdn_delete_character(p_character_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_character public.sdn_characters%rowtype;
        v_alias text;
begin
  if auth.uid() is null or not public.sdn_is_admin() then
    raise exception 'Nur die Spielleitung darf Personalakten löschen.';
  end if;
  if p_character_id is null then raise exception 'Charakter-ID fehlt.'; end if;
  select * into v_character
    from public.sdn_characters where id=p_character_id for update;
  if not found then raise exception 'Charakter nicht gefunden oder bereits gelöscht.'; end if;

  v_alias := left(coalesce(v_character.data->>'sdnId',p_character_id::text),80);

  -- Unlink this character from ALL existing reports, including pending reports.
  -- Reports without any remaining participants are intentionally retained.
  update public.sdn_reports r
     set report = jsonb_set(r.report,'{participants}',
       (select coalesce(jsonb_agg(to_jsonb(p.id) order by p.ordinality),'[]'::jsonb)
          from jsonb_array_elements_text(r.report->'participants') with ordinality as p(id,ordinality)
          where p.id <> p_character_id::text), true)
   where jsonb_typeof(r.report->'participants')='array'
     and (r.report->'participants') ? p_character_id::text;

  -- Remove relationship entries from all other character dossiers.
  update public.sdn_characters c
     set data=jsonb_set(c.data,'{relationships}',
        (select coalesce(jsonb_agg(item.value order by item.ordinality),'[]'::jsonb)
           from jsonb_array_elements(c.data->'relationships') with ordinality as item(value,ordinality)
          where item.value->>'targetId' is distinct from p_character_id::text),true),
         version=c.version+1,updated_at=now()
   where c.id<>p_character_id
     and jsonb_typeof(c.data->'relationships')='array'
     and (c.data->'relationships') @> jsonb_build_array(jsonb_build_object('targetId',p_character_id::text));

  -- Outstanding relationship proposals referring to this ID cannot be approved:
  -- reject them to prevent accidental recreation of a dangling reference.
  update public.sdn_tickets t
     set status='rejected',reviewed_by=auth.uid(),reviewed_at=now()
   where t.status='pending' and t.character_id<>p_character_id
     and exists(
       select 1 from jsonb_array_elements(t.operations) as op(value)
       where op.value->>'kind'='relation' and op.value->>'key'=p_character_id::text
     );

  -- Cascade removes this character's own tickets, TOP SECRET data, target
  -- file notes and character audits. Author references in notes on OTHER
  -- characters are set to NULL, retaining the original text/name/date.
  delete from public.sdn_characters where id=p_character_id;
  insert into public.sdn_audit(character_id,actor_id,action,ref)
  values (null,auth.uid(),'character_deleted',v_alias);
end;
$$;

create or replace function public.sdn_delete_report(p_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if auth.uid() is null or not public.sdn_is_admin() then
    raise exception 'Nur die Spielleitung darf Einsatzprotokolle löschen.';
  end if;
  if p_report_id is null then raise exception 'Einsatz-ID fehlt.'; end if;
  select 'OPS-' || lpad(r.report_no::text,4,'0') into v_code
     from public.sdn_reports r where r.id=p_report_id for update;
  if not found then raise exception 'Einsatzprotokoll nicht gefunden oder bereits gelöscht.'; end if;
  delete from public.sdn_reports where id=p_report_id;
  -- Character mission links are derived from approved reports, so deleting
  -- the report also removes the link from every character's Einsatz tab.
  insert into public.sdn_audit(character_id,actor_id,action,ref)
  values(null,auth.uid(),'report_deleted',v_code);
end;
$$;

-- SECURITY DEFINER functions are NOT automatically private just because
-- the UI hides the buttons. Restrict execution to logged-in sessions only;
-- the function bodies additionally check the Discord-verified SL role.
revoke all on function public.sdn_enforce_activity_status() from public, anon, authenticated;
revoke all on function public.sdn_delete_character(uuid) from public, anon, authenticated;
revoke all on function public.sdn_delete_report(uuid) from public, anon, authenticated;
revoke all on function public.sdn_set_character_activity(uuid,text) from public, anon, authenticated;
grant execute on function public.sdn_delete_character(uuid) to authenticated;
grant execute on function public.sdn_delete_report(uuid) to authenticated;
grant execute on function public.sdn_set_character_activity(uuid,text) to authenticated;

commit;
