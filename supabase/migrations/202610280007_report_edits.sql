-- SDN v0.16: changes to existing operational reports require reviewed tickets.
-- Run once AFTER migrations 001 through 006. Existing reports are unchanged.
-- Do not re-run earlier migrations after this one.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sdn_report_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.sdn_reports(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  base_report jsonb NOT NULL CHECK(jsonb_typeof(base_report)='object'),
  patch jsonb NOT NULL CHECK(jsonb_typeof(patch)='object' AND patch <> '{}'::jsonb),
  comment text NOT NULL DEFAULT '' CHECK(char_length(comment) <= 1500),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS sdn_report_edits_report_idx ON public.sdn_report_edits(report_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sdn_report_edits_pending_idx ON public.sdn_report_edits(status) WHERE status='pending';
ALTER TABLE public.sdn_report_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sdn_report_edits_read ON public.sdn_report_edits;
CREATE POLICY sdn_report_edits_read ON public.sdn_report_edits
  FOR SELECT TO authenticated USING (
    public.sdn_is_member() AND
    (requested_by=(SELECT auth.uid()) OR public.sdn_is_admin())
  );
REVOKE ALL ON public.sdn_report_edits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sdn_report_edits TO authenticated;

-- The RPCs must enforce validation themselves, not trust a browser-side form.
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
REVOKE ALL ON FUNCTION public.sdn_validate_report_revision(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sdn_submit_report_edit(
  p_report_id uuid, p_candidate jsonb, p_comment text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rec public.sdn_reports%rowtype; k text; patch_doc jsonb:='{}'::jsonb;
        next_doc jsonb; new_id uuid;
        editable_keys text[]:=ARRAY['title','customer','startDate','endDate','date','location','rpLink',
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

CREATE OR REPLACE FUNCTION public.sdn_review_report_edit(
  p_edit_id uuid,p_approve boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE req public.sdn_report_edits%rowtype; rec public.sdn_reports%rowtype;
        k text; updated_doc jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.sdn_is_admin() THEN
   RAISE EXCEPTION 'Nur die Spielleitung darf Einsatzänderungen genehmigen.';
 END IF;
 SELECT * INTO req FROM public.sdn_report_edits WHERE id=p_edit_id FOR UPDATE;
 IF NOT FOUND OR req.status<>'pending' THEN
   RAISE EXCEPTION 'Antrag bereits bearbeitet oder nicht gefunden.';
 END IF;
 SELECT * INTO rec FROM public.sdn_reports WHERE id=req.report_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Einsatzbericht wurde gelöscht.'; END IF;
 IF p_approve THEN
   IF rec.status<>'approved' THEN
     RAISE EXCEPTION 'Zuerst muss der ursprüngliche Einsatzbericht freigegeben werden.';
   END IF;
   FOR k IN SELECT jsonb_object_keys(req.patch) LOOP
     IF rec.report->k IS DISTINCT FROM req.base_report->k THEN
       RAISE EXCEPTION 'Konflikt: Feld % wurde seit Antragstellung geändert. Bitte neu einreichen.',k;
     END IF;
   END LOOP;
   updated_doc:=rec.report || req.patch;
   PERFORM public.sdn_validate_report_revision(updated_doc);
   UPDATE public.sdn_reports SET report=updated_doc WHERE id=rec.id;
 END IF;
 UPDATE public.sdn_report_edits SET
   status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
   reviewed_by=auth.uid(),reviewed_at=now() WHERE id=req.id;
 INSERT INTO public.sdn_audit(character_id,actor_id,action,ref)
 VALUES(null,auth.uid(),CASE WHEN p_approve THEN 'report_edit_approved' ELSE 'report_edit_rejected' END,req.report_id::text);
END;
$$;
REVOKE ALL ON FUNCTION public.sdn_submit_report_edit(uuid,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sdn_review_report_edit(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdn_submit_report_edit(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sdn_review_report_edit(uuid,boolean) TO authenticated;
COMMIT;
