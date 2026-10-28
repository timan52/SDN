-- SDN v0.12 - Kundenbewertungen bei abgeschlossenen Einsatzberichten
-- Voraussetzung: die Migrationen bis einschliesslich v0.11 sind bereits ausgefuehrt.
-- Bestehende Einsatzberichte bleiben erhalten. Nur die Einreichungsfunktion wird angepasst.
-- Das bestehende JSONB-Feld public.sdn_reports.report speichert Kunde/Sterne/Kommentar.
-- Bei offenen Faellen keine Kundenbewertung, bei abgeschlossenen Faellen 1 bis 5 Sterne.
-- Die Berechtigungen der bereits vorhandenen RPC bleiben bei CREATE OR REPLACE erhalten.

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
