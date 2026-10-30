-- SDN v0.27 – apply once AFTER 202610300001_dispatcher_operations_forum.sql.
-- This updates only the report validation and submission RPCs. Existing reports
-- and Discord outbox jobs are not deleted or migrated.
BEGIN;

CREATE OR REPLACE FUNCTION public.sdn_validate_report_revision(p_report jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry jsonb; val text; result text;
BEGIN
 IF jsonb_typeof(p_report) IS DISTINCT FROM 'object' OR length(p_report::text)>45000 THEN
   RAISE EXCEPTION 'Ungültiger oder zu langer Einsatzbericht.';
 END IF;
 IF nullif(trim(coalesce(p_report->>'title','')),'') IS NULL
    OR length(coalesce(p_report->>'title',''))>100
    OR nullif(trim(coalesce(p_report->>'situation','')),'') IS NULL
    OR nullif(trim(coalesce(p_report->>'customer','')),'') IS NULL
    OR nullif(trim(coalesce(p_report->>'location','')),'') IS NULL
    OR nullif(trim(coalesce(p_report->>'startDate',p_report->>'date','')),'') IS NULL THEN
   RAISE EXCEPTION 'Einsatzname, Kunde, Einsatzort, Einsatzbeginn und Ausgangslage sind erforderlich.';
 END IF;
 IF length(coalesce(p_report->>'situation',''))>3000 OR length(coalesce(p_report->>'events',''))>5000
    OR length(coalesce(p_report->>'notes',''))>3000 OR length(coalesce(p_report->>'damages',''))>3000
    OR length(coalesce(p_report->>'location',''))>150 OR length(coalesce(p_report->>'customer',''))>130
    OR length(coalesce(p_report->>'customerComment',''))>2000 OR length(coalesce(p_report->>'requestComment',''))>1500 THEN
   RAISE EXCEPTION 'Die maximale Textlänge wurde überschritten.';
 END IF;
 IF coalesce(p_report->>'level','') NOT IN ('E','D','C','B','A','S') THEN
   RAISE EXCEPTION 'Einsatzlevel E bis S ist erforderlich.';
 END IF;
 result:=coalesce(p_report->>'outcome','open');
 -- Old reports may still contain success/partial/failure; new creation uses open
 -- and a later completion uses closed. We preserve historical data.
 IF result NOT IN ('open','closed','success','partial','failure') THEN
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
 IF result='open' THEN
   IF nullif(coalesce(p_report->>'endDate',''),'') IS NOT NULL
      OR nullif(coalesce(p_report->>'customerStars',''),'') IS NOT NULL
      OR nullif(trim(coalesce(p_report->>'customerComment','')),'') IS NOT NULL THEN
     RAISE EXCEPTION 'Offene Fälle dürfen kein Einsatzende und keine Kundenbewertung enthalten.';
   END IF;
 ELSE
   IF nullif(p_report->>'endDate','') IS NULL OR nullif(trim(coalesce(p_report->>'events','')),'') IS NULL THEN
     RAISE EXCEPTION 'Abgeschlossene Fälle benötigen ein Einsatzende und den Einsatzverlauf.';
   END IF;
 END IF;
 IF nullif(p_report->>'endDate','') IS NOT NULL AND (p_report->>'endDate') < coalesce(p_report->>'startDate',p_report->>'date','') THEN
   RAISE EXCEPTION 'Das Einsatzende liegt vor dem Beginn.';
 END IF;
 IF nullif(p_report->>'customerStars','') IS NOT NULL AND (p_report->>'customerStars') !~ '^[1-5]$' THEN
   RAISE EXCEPTION 'Kundensterne müssen zwischen 1 und 5 liegen.';
 END IF;
 IF coalesce(p_report->>'damageStatus','no') <> 'yes' AND nullif(coalesce(p_report->>'damages',''),'') IS NOT NULL THEN
   RAISE EXCEPTION 'Schadensbericht nur bei betroffener ziviler Infrastruktur.';
 END IF;
 IF nullif(p_report->>'rpLink','') IS NOT NULL AND
    p_report->>'rpLink' !~ '^https://(discord[.]com|discordapp[.]com)/channels/[0-9]+/[0-9]+/[0-9]+$' THEN
   RAISE EXCEPTION 'Ungültiger Discord-Link zum RP.';
 END IF;
 IF jsonb_typeof(p_report->'participants') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_report->'participants')>30 THEN
   RAISE EXCEPTION 'Ungültige Beteiligtenliste.';
 END IF;
 IF result<>'open' AND jsonb_array_length(p_report->'participants')=0 THEN
   RAISE EXCEPTION 'Abgeschlossene Einsätze benötigen mindestens einen beteiligten Helden.';
 END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_report->'participants') LOOP
   val:=entry #>> '{}';
   IF jsonb_typeof(entry) IS DISTINCT FROM 'string'
      OR val !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR NOT EXISTS (SELECT 1 FROM public.sdn_characters c WHERE c.id=val::uuid AND c.status='approved') THEN
     RAISE EXCEPTION 'Ungültiger oder nicht freigegebener Einsatzteilnehmer.';
   END IF;
 END LOOP;
 val:=trim(coalesce(p_report->>'dispatcherId',''));
 IF val='' THEN
   RAISE EXCEPTION 'Dispatcher-Auswahl wurde nicht übermittelt. Bitte Dispatcher erneut auswählen.';
 END IF;
 IF val !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Ungültige Dispatcher-ID. Bitte den Charakter erneut auswählen.';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.sdn_characters c WHERE c.id=val::uuid
     AND c.status='approved' AND lower(trim(coalesce(c.data->>'role','')))='dispatcher') THEN
   RAISE EXCEPTION 'Der gewählte Dispatcher ist nicht freigegeben oder besitzt nicht die Position Dispatcher.';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.sdn_validate_report_revision(jsonb) FROM PUBLIC,anon,authenticated;

-- On creation the database sets the initial status, date, and all advanced
-- fields. A caller cannot submit a pre-closed report or forged start/end dates.
CREATE OR REPLACE FUNCTION public.sdn_submit_report(p_report jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE no bigint; payload jsonb; today_local text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.sdn_is_member() OR
    NOT (public.sdn_is_admin() OR public.sdn_is_dispatcher()) THEN
   RAISE EXCEPTION 'Nur Dispatcher oder die Spielleitung dürfen Einsätze erstellen.';
 END IF;
 IF jsonb_typeof(p_report) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Ungültiger Notruf.';
 END IF;
 today_local:=to_char(timezone('Europe/Berlin',now()),'YYYY-MM-DD');
 payload:=jsonb_build_object(
   'title',trim(coalesce(p_report->>'title','')),
   'level',trim(coalesce(p_report->>'level','')),
   'customer',trim(coalesce(p_report->>'customer','')),
   'location',trim(coalesce(p_report->>'location','')),
   'situation',trim(coalesce(p_report->>'situation','')),
   'dispatcherId',trim(coalesce(p_report->>'dispatcherId','')),
   'requestComment',trim(coalesce(p_report->>'requestComment','')),
   'startDate',today_local,'date',today_local,
   'outcome','open','caseStatus','open','endDate','',
   'participants','[]'::jsonb,'rpLink','','events','',
   'damageStatus','no','damages','','notes','',
   'customerStars','','customerComment',''
 );
 PERFORM public.sdn_validate_report_revision(payload);
 INSERT INTO public.sdn_reports(submitted_by,report) VALUES(auth.uid(),payload)
 RETURNING report_no INTO no;
 RETURN 'OPS-'||lpad(no::text,4,'0');
END;
$$;
REVOKE ALL ON FUNCTION public.sdn_submit_report(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sdn_submit_report(jsonb) TO authenticated;

-- A dispatcher can only edit their own report. Its original start date is
-- immutable. The end date is generated by the database when the first
-- completion is requested; it cannot be supplied by the browser.
CREATE OR REPLACE FUNCTION public.sdn_submit_report_edit(
 p_report_id uuid,p_candidate jsonb,p_comment text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rec public.sdn_reports%rowtype; k text; patch_doc jsonb:='{}'::jsonb;
        next_doc jsonb; new_id uuid; next_outcome text;
        editable_keys text[]:=ARRAY['title','level','customer','location','rpLink',
          'customerStars','customerComment','situation','events','outcome',
          'damageStatus','damages','notes','dispatcherId','participants'];
BEGIN
 IF auth.uid() IS NULL OR NOT public.sdn_is_member() OR
    NOT (public.sdn_is_admin() OR public.sdn_is_dispatcher()) THEN
   RAISE EXCEPTION 'Nur Dispatcher oder die Spielleitung dürfen Einsatzänderungen beantragen.';
 END IF;
 IF jsonb_typeof(p_candidate) IS DISTINCT FROM 'object' OR length(p_candidate::text)>45000 THEN
   RAISE EXCEPTION 'Ungültige Einsatzänderung.';
 END IF;
 IF length(coalesce(p_comment,''))>1500 THEN RAISE EXCEPTION 'Anmerkung zu lang.'; END IF;
 SELECT * INTO rec FROM public.sdn_reports WHERE id=p_report_id FOR UPDATE;
 IF NOT FOUND OR rec.status IS DISTINCT FROM 'approved' THEN
   RAISE EXCEPTION 'Einsatzprotokoll nicht bearbeitbar.';
 END IF;
 IF rec.submitted_by<>auth.uid() AND NOT public.sdn_is_admin() THEN
   RAISE EXCEPTION 'Nur der ursprüngliche Ersteller oder die SL darf den Einsatz bearbeiten.';
 END IF;
 next_outcome:=coalesce(p_candidate->>'outcome',rec.report->>'outcome','open');
 IF next_outcome NOT IN ('open','closed') THEN
   RAISE EXCEPTION 'Es stehen nur die Status Offen und Abgeschlossen zur Verfügung.';
 END IF;
 IF coalesce(rec.report->>'outcome','open')<>'open' AND next_outcome='open' THEN
   RAISE EXCEPTION 'Ein abgeschlossener Einsatz kann nicht wieder geöffnet werden.';
 END IF;
 FOREACH k IN ARRAY editable_keys LOOP
   IF p_candidate ? k AND p_candidate->k IS DISTINCT FROM rec.report->k THEN
     patch_doc:=patch_doc || jsonb_build_object(k,p_candidate->k);
   END IF;
 END LOOP;
 -- Canonical status and timestamps; do not accept endDate/caseStatus from client.
 IF next_outcome='closed' AND coalesce(rec.report->>'outcome','open')='open' THEN
   patch_doc:=patch_doc || jsonb_build_object('endDate',to_char(timezone('Europe/Berlin',now()),'YYYY-MM-DD'),'caseStatus','closed','outcome','closed');
 ELSIF next_outcome='open' THEN
   patch_doc:=patch_doc || jsonb_build_object('caseStatus','open');
 END IF;
 IF patch_doc='{}'::jsonb THEN RAISE EXCEPTION 'Keine Änderungen vorhanden.'; END IF;
 next_doc:=rec.report || patch_doc;
 PERFORM public.sdn_validate_report_revision(next_doc);
 INSERT INTO public.sdn_report_edits(report_id,requested_by,base_report,patch,comment)
 VALUES(p_report_id,auth.uid(),rec.report,patch_doc,coalesce(p_comment,'')) RETURNING id INTO new_id;
 RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.sdn_submit_report_edit(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sdn_submit_report_edit(uuid,jsonb,text) TO authenticated;
COMMIT;
