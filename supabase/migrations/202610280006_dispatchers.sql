-- SDN v0.14: optional Dispatcher for reports and safe link cleanup on deletion.
-- Requires all migrations through 202610280005_deletion_activity.sql (v0.13).
-- Existing data remains unchanged. Do not rerun older migrations afterwards.
BEGIN;

create or replace function public.sdn_submit_report(p_report jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare no bigint; participant jsonb;
begin
 if not public.sdn_is_member() then raise exception 'Discord-Mitgliedschaft erforderlich';end if;
 if jsonb_typeof(p_report)<>'object' or length(p_report::text)>45000 or
   nullif(trim(p_report->>'title'),'') is null or nullif(trim(p_report->>'date'),'') is null or
   nullif(trim(p_report->>'situation'),'') is null or nullif(trim(p_report->>'events'),'') is null or
   jsonb_typeof(p_report->'participants')<>'array' or jsonb_array_length(p_report->'participants')<1 or jsonb_array_length(p_report->'participants')>30 then
   raise exception 'Unvollständiger Einsatzbericht';
 end if;
 if coalesce(p_report->>'outcome','open') not in ('open','success','partial','failure') then
   raise exception 'Unbekannter Einsatzabschluss.';
 end if;
 if length(coalesce(p_report->>'customer',''))>130 or length(coalesce(p_report->>'customerComment',''))>2000 then
   raise exception 'Kundenangaben überschreiten die zulässige Länge.';
 end if;
 if nullif(p_report->>'customerStars','') is not null
   and coalesce(p_report->>'customerStars','') !~ '^[1-5]$' then
   raise exception 'Kundensterne müssen zwischen 1 und 5 liegen.';
 end if;
 if coalesce(p_report->>'outcome','open')='open' and
   (nullif(p_report->>'customerStars','') is not null or nullif(trim(coalesce(p_report->>'customerComment','')),'') is not null) then
   raise exception 'Kundenbewertung und Kundenkommentar erst bei abgeschlossenen Einsätzen erlaubt.';
 end if;
 if coalesce(p_report->>'outcome','open') <> 'open' and nullif(p_report->>'endDate','') is null then
   raise exception 'Abgeschlossene Einsätze benötigen ein Einsatzende.';
 end if;
 if nullif(p_report->>'endDate','') is not null and p_report->>'endDate' < p_report->>'date' then
   raise exception 'Einsatzende liegt vor dem Einsatzbeginn.';
 end if;
 if p_report->>'damageStatus' <> 'yes' and coalesce(p_report->>'damages','') <> '' then
   raise exception 'Schadensbericht nur bei betroffener ziviler Infrastruktur.';
 end if;
 -- A dispatcher is independent of the heroes listed under 'participants'.
 -- The dispatcher must be a verified, approved character with role 'Dispatcher'.
 if nullif(trim(coalesce(p_report->>'dispatcherId','')),'') is not null then
   if (p_report->>'dispatcherId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
     raise exception 'Ungültige Dispatcher-ID.';
   end if;
   if not exists (
     select 1 from public.sdn_characters c
     where c.id=(p_report->>'dispatcherId')::uuid
       and c.status='approved' and c.data->>'role'='Dispatcher'
   ) then
     raise exception 'Als Dispatcher ist nur ein freigegebener Charakter mit der Position Dispatcher zulässig.';
   end if;
 end if;
 for participant in select value from jsonb_array_elements(p_report->'participants') loop
  if jsonb_typeof(participant)<>'string' or not exists (
    select 1 from public.sdn_characters where id=(participant #>> '{}')::uuid and status='approved') then
    raise exception 'Einsatz enthält ungültigen oder noch nicht freigegebenen Charakter';
  end if;
 end loop;
 insert into public.sdn_reports(submitted_by,report) values(auth.uid(),p_report - 'id' - 'status' - 'submitted' - 'reviewed' - 'organization' - 'villain')
 returning report_no into no;
 return 'OPS-'||lpad(no::text,4,'0');
end; $$;

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

  -- Also unlink the optional dispatcher's position in all reports.
  -- This works for pending and approved reports, and retains the report itself.
  update public.sdn_reports r
     set report = r.report - 'dispatcherId'
   where r.report->>'dispatcherId'=p_character_id::text;

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


-- PostgreSQL enforces the same security boundary as the previous version.
REVOKE ALL ON FUNCTION public.sdn_submit_report(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdn_submit_report(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.sdn_delete_character(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdn_delete_character(uuid) TO authenticated;
COMMIT;
