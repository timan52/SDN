-- SDN v0.17 – Einsatzlevel E–S, sowohl für neue Einsätze als auch Änderungstickets.
-- Voraussetzung: Migrationen bis einschließlich 202610280007_report_edits.sql (v0.16).
-- Vorhandene Berichte ohne Einsatzlevel bleiben unverändert und weiterhin abrufbar.
-- Das Level wird beim Bearbeiten der bestehenden Akte ergänzt.

BEGIN;

-- Der CHECK erlaubt ausdrücklich fehlende Werte für alte Datensätze,
-- verbietet aber ungültige Level bei neu angelegten oder bearbeiteten Berichten.
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint
   WHERE conname = 'sdn_reports_level_e_to_s'
     AND conrelid = 'public.sdn_reports'::regclass
 ) THEN
   ALTER TABLE public.sdn_reports
     ADD CONSTRAINT sdn_reports_level_e_to_s
     CHECK ((report->>'level') IS NULL OR (report->>'level') IN ('E','D','C','B','A','S'));
 END IF;
END $$;

-- Neuanlagen müssen ein gültiges Einsatzlevel enthalten.
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
 if coalesce(p_report->>'level','') not in ('E','D','C','B','A','S') then
   raise exception 'Einsatzlevel E bis S ist erforderlich.';
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


-- Bestehende Einsatzakten dürfen auch nachträglich ein Level erhalten.
CREATE OR REPLACE FUNCTION public.sdn_validate_report_revision(p_report jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry jsonb; val text; k text;
BEGIN
 IF jsonb_typeof(p_report) IS DISTINCT FROM 'object' OR length(p_report::text)>45000 THEN
   RAISE EXCEPTION 'Ungültiger oder zu langer Einsatzbericht.';
 END IF;
 IF nullif(trim(coalesce(p_report->>'title','')),'') IS NULL
    OR length(p_report->>'title')>100
    OR nullif(trim(coalesce(p_report->>'situation','')),'') IS NULL
    OR nullif(trim(coalesce(p_report->>'events','')),'') IS NULL
    OR nullif(trim(coalesce(p_report->>'startDate',p_report->>'date','')),'') IS NULL THEN
     RAISE EXCEPTION 'Einsatzbezeichnung, Einsatzbeginn, Ausgangslage und Verlauf sind erforderlich.';
 END IF;
 IF length(coalesce(p_report->>'situation',''))>3000
    OR length(coalesce(p_report->>'events',''))>5000
    OR length(coalesce(p_report->>'notes',''))>3000
    OR length(coalesce(p_report->>'damages',''))>3000
    OR length(coalesce(p_report->>'location',''))>150
    OR length(coalesce(p_report->>'customer',''))>130
    OR length(coalesce(p_report->>'customerComment',''))>2000 THEN
     RAISE EXCEPTION 'Die maximale Textlänge wurde überschritten.';
 END IF;
 IF p_report ? 'level' AND coalesce(p_report->>'level','') NOT IN ('E','D','C','B','A','S') THEN
   RAISE EXCEPTION 'Ungültiges Einsatzlevel. Zulässig ist E bis S.';
 END IF;
 IF coalesce(p_report->>'outcome','open') NOT IN ('open','success','partial','failure') THEN
   RAISE EXCEPTION 'Ungültiger Abschlussstatus.';
 END IF;
 IF coalesce(p_report->>'damageStatus','no') NOT IN ('yes','no','unknown') THEN
   RAISE EXCEPTION 'Ungültiger Schadensstatus.';
 END IF;
 IF coalesce(p_report->>'startDate',p_report->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
   RAISE EXCEPTION 'Ungültiges Datum für Einsatzbeginn.';
 END IF;
 IF nullif(p_report->>'endDate','') IS NOT NULL AND (p_report->>'endDate') !~ '^\d{4}-\d{2}-\d{2}$' THEN
   RAISE EXCEPTION 'Ungültiges Datum für Einsatzende.';
 END IF;
 IF coalesce(p_report->>'outcome','open')='open' THEN
   IF nullif(coalesce(p_report->>'endDate',''),'') IS NOT NULL
      OR nullif(coalesce(p_report->>'customerStars',''),'') IS NOT NULL
      OR nullif(trim(coalesce(p_report->>'customerComment','')),'') IS NOT NULL THEN
      RAISE EXCEPTION 'Offene Fälle dürfen kein Einsatzende und keine Kundenbewertung enthalten.';
   END IF;
 ELSE
   IF nullif(p_report->>'endDate','') IS NULL THEN
     RAISE EXCEPTION 'Abgeschlossene Fälle benötigen ein Einsatzende.';
   END IF;
 END IF;
 IF nullif(p_report->>'endDate','') IS NOT NULL AND (p_report->>'endDate') < coalesce(p_report->>'startDate',p_report->>'date','') THEN
   RAISE EXCEPTION 'Das Einsatzende liegt vor dem Beginn.';
 END IF;
 IF nullif(p_report->>'customerStars','') IS NOT NULL AND (p_report->>'customerStars') !~ '^[1-5]$' THEN
   RAISE EXCEPTION 'Kundensterne müssen zwischen 1 und 5 liegen.';
 END IF;
 IF p_report->>'damageStatus' <> 'yes' AND nullif(coalesce(p_report->>'damages',''),'') IS NOT NULL THEN
   RAISE EXCEPTION 'Schadensbericht nur bei betroffener ziviler Infrastruktur.';
 END IF;
 IF nullif(p_report->>'rpLink','') IS NOT NULL AND
   p_report->>'rpLink' !~ '^https://(discord[.]com|discordapp[.]com)/channels/[0-9]+/[0-9]+/[0-9]+$' THEN
   RAISE EXCEPTION 'Ungültiger Discord-Link zum RP.';
 END IF;
 IF jsonb_typeof(p_report->'participants') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_report->'participants') > 30 THEN
   RAISE EXCEPTION 'Ungültige Beteiligtenliste.';
 END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_report->'participants') LOOP
   val:=entry #>> '{}';
   IF jsonb_typeof(entry) IS DISTINCT FROM 'string'
      OR val !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR NOT EXISTS (SELECT 1 FROM public.sdn_characters c WHERE c.id=val::uuid AND c.status='approved') THEN
     RAISE EXCEPTION 'Ungültiger oder nicht freigegebener Einsatzteilnehmer.';
   END IF;
 END LOOP;
 val:=nullif(p_report->>'dispatcherId','');
 IF val IS NOT NULL THEN
   IF val !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR NOT EXISTS (SELECT 1 FROM public.sdn_characters c WHERE c.id=val::uuid AND c.status='approved' AND c.data->>'role'='Dispatcher') THEN
     RAISE EXCEPTION 'Nur ein freigegebener Dispatcher kann zugeordnet werden.';
   END IF;
 END IF;
END;
$$;

-- Das neue Feld muss in Änderungstickets erlaubt sein.
CREATE OR REPLACE FUNCTION public.sdn_submit_report_edit(
  p_report_id uuid, p_candidate jsonb, p_comment text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rec public.sdn_reports%rowtype; k text; patch_doc jsonb:='{}'::jsonb;
        next_doc jsonb; new_id uuid;
        editable_keys text[]:=ARRAY['title','level','customer','startDate','endDate','date','location','rpLink',
        'customerStars','customerComment','situation','events','outcome','caseStatus','damageStatus',
        'damages','notes','dispatcherId','participants'];
BEGIN
 IF auth.uid() IS NULL OR NOT public.sdn_is_member() THEN
   RAISE EXCEPTION 'Discord-Mitgliedschaft erforderlich.';
 END IF;
 IF jsonb_typeof(p_candidate) IS DISTINCT FROM 'object' OR length(p_candidate::text)>45000 THEN
   RAISE EXCEPTION 'Ungültige Einsatzänderung.';
 END IF;
 IF length(coalesce(p_comment,''))>1500 THEN
   RAISE EXCEPTION 'Die Anmerkung darf höchstens 1.500 Zeichen lang sein.';
 END IF;
 SELECT * INTO rec FROM public.sdn_reports WHERE id=p_report_id FOR UPDATE;
 IF NOT FOUND OR rec.status NOT IN ('approved','pending') THEN
   RAISE EXCEPTION 'Einsatzprotokoll nicht bearbeitbar.';
 END IF;
 IF rec.submitted_by <> auth.uid() AND NOT public.sdn_is_admin() THEN
   RAISE EXCEPTION 'Nur der Antragsteller oder die Spielleitung darf diesen Bericht bearbeiten.';
 END IF;
 FOREACH k IN ARRAY editable_keys LOOP
   IF p_candidate ? k AND p_candidate->k IS DISTINCT FROM rec.report->k THEN
     patch_doc:=patch_doc || jsonb_build_object(k,p_candidate->k);
   END IF;
 END LOOP;
 IF patch_doc='{}'::jsonb THEN
   RAISE EXCEPTION 'Keine Änderungen vorhanden.';
 END IF;
 next_doc:=rec.report || patch_doc;
 PERFORM public.sdn_validate_report_revision(next_doc);
 INSERT INTO public.sdn_report_edits(report_id,requested_by,base_report,patch,comment)
 VALUES(p_report_id,auth.uid(),rec.report,patch_doc,coalesce(p_comment,'')) RETURNING id INTO new_id;
 RETURN new_id;
END;
$$;


COMMIT;
