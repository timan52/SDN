-- SDN v0.26. Apply ONCE after v0.25 and all preceding migrations.
-- Apply SQL first, then immediately deploy the v0.26 verify-discord function.
BEGIN;

ALTER TABLE public.sdn_access
  ADD COLUMN IF NOT EXISTS is_dispatcher boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sdn_is_dispatcher()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.sdn_access a
   WHERE a.user_id=(SELECT auth.uid()) AND a.verified_until>now() AND a.is_dispatcher=true);
$$;
REVOKE ALL ON FUNCTION public.sdn_is_dispatcher() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sdn_is_dispatcher() TO authenticated;

-- Open callouts may be published before anybody joins. Closed reports need a
-- completed timeline, an end date and at least one participating hero.
CREATE OR REPLACE FUNCTION public.sdn_validate_report_revision(p_report jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry jsonb; val text;
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
    OR length(coalesce(p_report->>'customerComment',''))>2000 THEN
   RAISE EXCEPTION 'Die maximale Textlänge wurde überschritten.';
 END IF;
 IF coalesce(p_report->>'level','') NOT IN ('E','D','C','B','A','S') THEN
   RAISE EXCEPTION 'Einsatzlevel E bis S ist erforderlich.';
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
   IF nullif(p_report->>'endDate','') IS NULL OR nullif(trim(coalesce(p_report->>'events','')),'') IS NULL THEN
     RAISE EXCEPTION 'Abgeschlossene Fälle benötigen Einsatzende und Einsatzverlauf.';
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
 IF coalesce(p_report->>'outcome','open') <> 'open' AND jsonb_array_length(p_report->'participants')=0 THEN
   RAISE EXCEPTION 'Abgeschlossene Einsätze benötigen mindestens einen beteiligten Helden.';
 END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_report->'participants') LOOP
   val:=entry #>> '{}';
   IF jsonb_typeof(entry) IS DISTINCT FROM 'string'
      OR val !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR NOT EXISTS (SELECT 1 FROM public.sdn_characters c WHERE c.id=val::uuid AND c.status='approved') THEN
     RAISE EXCEPTION 'Ungültiger oder nicht freigegebener Einsatzteilnehmer.';
   END IF;
 END LOOP;
 val:=nullif(p_report->>'dispatcherId','');
 IF val IS NULL OR val !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'Ein Dispatcher muss ausgewählt werden.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sdn_characters c
   WHERE c.id=val::uuid AND c.status='approved' AND c.data->>'role'='Dispatcher') THEN
   RAISE EXCEPTION 'Nur freigegebene Charaktere mit der Position Dispatcher sind zulässig.';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.sdn_validate_report_revision(jsonb) FROM PUBLIC,anon,authenticated;

-- SECURITY DEFINER RPC: merely hiding the Create button is not sufficient.
CREATE OR REPLACE FUNCTION public.sdn_submit_report(p_report jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE no bigint; payload jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.sdn_is_member() OR
    NOT (public.sdn_is_admin() OR public.sdn_is_dispatcher()) THEN
   RAISE EXCEPTION 'Nur Dispatcher oder die Spielleitung dürfen Einsätze erstellen.';
 END IF;
 payload:=p_report - 'id' - 'status' - 'submitted' - 'reviewed' - 'organization' - 'villain'
                  - 'forumUrl' - 'forumThreadId';
 PERFORM public.sdn_validate_report_revision(payload);
 INSERT INTO public.sdn_reports(submitted_by,report) VALUES(auth.uid(),payload)
 RETURNING report_no INTO no;
 RETURN 'OPS-'||lpad(no::text,4,'0');
END;
$$;
REVOKE ALL ON FUNCTION public.sdn_submit_report(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sdn_submit_report(jsonb) TO authenticated;

-- A report can only be edited by its submitter (if currently authorized as a
-- dispatcher) or SL. Only SL may approve the resulting edit ticket.
CREATE OR REPLACE FUNCTION public.sdn_submit_report_edit(
 p_report_id uuid,p_candidate jsonb,p_comment text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rec public.sdn_reports%rowtype; k text; patch_doc jsonb:='{}'::jsonb;
        next_doc jsonb; new_id uuid;
        editable_keys text[]:=ARRAY['title','level','customer','startDate','endDate','date','location','rpLink',
          'customerStars','customerComment','situation','events','outcome','caseStatus','damageStatus',
          'damages','notes','dispatcherId','participants'];
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
 IF NOT FOUND OR rec.status NOT IN ('approved','pending') THEN
   RAISE EXCEPTION 'Einsatzprotokoll nicht bearbeitbar.';
 END IF;
 IF rec.submitted_by<>auth.uid() AND NOT public.sdn_is_admin() THEN
   RAISE EXCEPTION 'Nur der ursprüngliche Ersteller oder die SL darf den Einsatz bearbeiten.';
 END IF;
 FOREACH k IN ARRAY editable_keys LOOP
   IF p_candidate ? k AND p_candidate->k IS DISTINCT FROM rec.report->k THEN
     patch_doc:=patch_doc || jsonb_build_object(k,p_candidate->k);
   END IF;
 END LOOP;
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

-- Durable outbox; no client can alter its state or forge a Discord thread URL.
CREATE TABLE IF NOT EXISTS public.sdn_operation_forum_jobs (
 report_id uuid PRIMARY KEY REFERENCES public.sdn_reports(id) ON DELETE CASCADE,
 guild_id text,
 thread_id text UNIQUE,
 starter_message_id text,
 close_revision integer NOT NULL DEFAULT 0,
 notified_revision integer NOT NULL DEFAULT 0,
 close_message_revision integer NOT NULL DEFAULT 0,
 close_message_id text,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','failed','done')),
 claim_token uuid,
 claim_until timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sdn_operation_forum_state_idx
 ON public.sdn_operation_forum_jobs(state,created_at);
ALTER TABLE public.sdn_operation_forum_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sdn_operation_forum_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sdn_operation_forum_jobs TO authenticated;
DROP POLICY IF EXISTS sdn_operation_forum_read ON public.sdn_operation_forum_jobs;
CREATE POLICY sdn_operation_forum_read ON public.sdn_operation_forum_jobs FOR SELECT TO authenticated
 USING(public.sdn_is_member() AND EXISTS (
  SELECT 1 FROM public.sdn_reports r WHERE r.id=report_id
    AND (r.status='approved' OR r.submitted_by=(SELECT auth.uid()) OR public.sdn_is_admin())
 ));

CREATE OR REPLACE FUNCTION public.sdn_queue_operation_forum()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE finish_now boolean; prior_closed boolean; newly_approved boolean;
BEGIN
 IF new.status<>'approved' THEN RETURN new; END IF;
 finish_now:=coalesce(new.report->>'outcome','open')<>'open';
 newly_approved:=tg_op='INSERT';
 IF tg_op='UPDATE' THEN newly_approved:=old.status IS DISTINCT FROM 'approved'; END IF;
 IF newly_approved THEN
   INSERT INTO public.sdn_operation_forum_jobs(report_id,close_revision)
   VALUES(new.id, CASE WHEN finish_now THEN 1 ELSE 0 END)
   ON CONFLICT(report_id) DO NOTHING;
 ELSIF tg_op='UPDATE' THEN
   prior_closed:=coalesce(old.report->>'outcome','open')<>'open';
   IF finish_now AND NOT prior_closed THEN
     INSERT INTO public.sdn_operation_forum_jobs(report_id,close_revision)
     VALUES(new.id,1)
     ON CONFLICT(report_id) DO UPDATE
       SET close_revision=public.sdn_operation_forum_jobs.close_revision+1,
           close_message_id=NULL,close_message_revision=0,
           state='pending',updated_at=now();
   END IF;
 END IF;
 RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS sdn_operation_forum_queue ON public.sdn_reports;
CREATE TRIGGER sdn_operation_forum_queue AFTER INSERT OR UPDATE OF status,report
 ON public.sdn_reports FOR EACH ROW EXECUTE FUNCTION public.sdn_queue_operation_forum();

CREATE OR REPLACE FUNCTION public.sdn_claim_operation_forum_job(p_report_id uuid DEFAULT NULL)
RETURNS TABLE(report_id uuid, report_no bigint, report_data jsonb, thread_id text,
 starter_message_id text, close_revision integer, notified_revision integer,
 close_message_id text, close_message_revision integer, claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE chosen uuid; new_claim uuid:=gen_random_uuid();
BEGIN
 SELECT j.report_id INTO chosen
  FROM public.sdn_operation_forum_jobs j
  JOIN public.sdn_reports r ON r.id=j.report_id
  WHERE r.status='approved' AND (p_report_id IS NULL OR j.report_id=p_report_id)
    AND (j.state IN ('pending','failed') OR (j.state='processing' AND j.claim_until<now()))
  ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1;
 IF chosen IS NULL THEN RETURN; END IF;
 UPDATE public.sdn_operation_forum_jobs j SET state='processing',claim_token=new_claim,
   claim_until=now()+interval '3 minutes',attempts=attempts+1,last_error=NULL,updated_at=now()
 WHERE j.report_id=chosen;
 RETURN QUERY SELECT j.report_id,r.report_no,r.report,j.thread_id,j.starter_message_id,
   j.close_revision,j.notified_revision,j.close_message_id,j.close_message_revision,new_claim
 FROM public.sdn_operation_forum_jobs j JOIN public.sdn_reports r ON r.id=j.report_id
 WHERE j.report_id=chosen;
END;
$$;

CREATE OR REPLACE FUNCTION public.sdn_operation_forum_mark_thread(p_report_id uuid,p_claim uuid,p_thread text,p_message text,p_guild text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF p_thread !~ '^\d{16,22}$' OR p_guild !~ '^\d{16,22}$' OR (p_message IS NOT NULL AND p_message !~ '^\d{16,22}$') THEN
  RAISE EXCEPTION 'Invalid Discord thread or message ID'; END IF;
 UPDATE public.sdn_operation_forum_jobs SET thread_id=p_thread,guild_id=p_guild,starter_message_id=p_message,updated_at=now()
 WHERE report_id=p_report_id AND claim_token=p_claim AND state='processing' AND thread_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forum thread claim expired'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sdn_operation_forum_mark_close_message(
 p_report_id uuid,p_claim uuid,p_message text,p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF p_message !~ '^\d{16,22}$' THEN RAISE EXCEPTION 'Invalid Discord message ID'; END IF;
 UPDATE public.sdn_operation_forum_jobs SET close_message_id=p_message,
  close_message_revision=p_revision,updated_at=now()
 WHERE report_id=p_report_id AND claim_token=p_claim AND state='processing' AND close_revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forum close message claim expired'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sdn_operation_forum_mark_reaction(p_report_id uuid,p_claim uuid,p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 UPDATE public.sdn_operation_forum_jobs
 SET notified_revision=p_revision,updated_at=now()
 WHERE report_id=p_report_id AND claim_token=p_claim AND state='processing'
  AND close_revision=p_revision AND close_message_id IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forum closure claim expired'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sdn_operation_forum_finish(p_report_id uuid,p_claim uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 UPDATE public.sdn_operation_forum_jobs
 SET state=CASE WHEN thread_id IS NOT NULL AND notified_revision>=close_revision THEN 'done' ELSE 'pending' END,
     claim_token=NULL,claim_until=NULL,updated_at=now()
 WHERE report_id=p_report_id AND claim_token=p_claim AND state='processing';
 IF NOT FOUND THEN RAISE EXCEPTION 'Forum job claim expired'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sdn_operation_forum_fail(p_report_id uuid,p_claim uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 UPDATE public.sdn_operation_forum_jobs SET state='failed',last_error=left(coalesce(p_reason,'Unknown'),1000),
 claim_token=NULL,claim_until=NULL,updated_at=now()
 WHERE report_id=p_report_id AND claim_token=p_claim AND state='processing';
END;
$$;
REVOKE ALL ON FUNCTION public.sdn_queue_operation_forum(),
 public.sdn_claim_operation_forum_job(uuid),
 public.sdn_operation_forum_mark_thread(uuid,uuid,text,text,text),
 public.sdn_operation_forum_mark_close_message(uuid,uuid,text,integer),
 public.sdn_operation_forum_mark_reaction(uuid,uuid,integer),
 public.sdn_operation_forum_finish(uuid,uuid),
 public.sdn_operation_forum_fail(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sdn_claim_operation_forum_job(uuid),
 public.sdn_operation_forum_mark_thread(uuid,uuid,text,text,text),
 public.sdn_operation_forum_mark_close_message(uuid,uuid,text,integer),
 public.sdn_operation_forum_mark_reaction(uuid,uuid,integer),
 public.sdn_operation_forum_finish(uuid,uuid),
 public.sdn_operation_forum_fail(uuid,uuid,text) TO service_role;

-- No backfill: do not publish existing/test missions without explicit SL action.
UPDATE public.sdn_access SET verified_until=now();
COMMIT;
