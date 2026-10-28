-- SDN v0.11: Formulare, halbe Attributpunkte, SL-only TOP SECRET.
-- NUR NACH v0.8 UND v0.10 ANWENDEN. Keine Daten werden gelöscht.

drop policy if exists sdn_secret_read on public.sdn_character_secrets;
create policy sdn_secret_read on public.sdn_character_secrets for select to authenticated
 using (public.sdn_is_member() and public.sdn_is_admin());

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
                     'received','origin','powerDescription','weaknesses','generalWeaknesses','generalStrengths','generalAbilities']) then
  return array[k];
 else
  raise exception 'Unzulässiges Aktenfeld: %', k;
 end if;
end; $$;

create or replace function public.sdn_validate_stats(doc jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare k text; v numeric; sum_points numeric := 0; raw text;
begin
 foreach k in array array['combat','vigor','mobility','charisma','intellect'] loop
  raw := doc #>> array['stats',k];
  -- Null: ausschließlich Spielleitungsakten ohne Wert; bei Spielern im Submit-RPC gesperrt.
  if raw is null then continue; end if;
  if raw !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Ungültiger Wert für %',k; end if;
  v := raw::numeric;
  if v < 0.5 or v > 10 or mod(v*2,1) <> 0 then
    raise exception 'Attribut % nur von 0,5 bis 10 in 0,5er-Schritten.',k;
  end if;
  sum_points := sum_points + v;
 end loop;
 if sum_points > 27 then raise exception 'Attributbudget überschritten (%/27).', sum_points; end if;
end; $$;

create or replace function public.sdn_validate_creation_stats(doc jsonb, allow_missing boolean) returns void
language plpgsql immutable set search_path = '' as $$
declare k text; v numeric; total_points numeric := 0; raw text;
begin
 perform public.sdn_validate_stats(doc);
 foreach k in array array['combat','vigor','mobility','charisma','intellect'] loop
  raw := doc #>> array['stats',k];
  if raw is null then
    if not allow_missing then raise exception 'Bei neuen Charakteren muss % angegeben werden.',k; end if;
    continue;
  end if;
  v:=raw::numeric;
  if v > 6 then raise exception 'Neuer Charakter: % darf maximal 6 Punkte haben.',k; end if;
  total_points:=total_points+v;
 end loop;
 if total_points > 15 then raise exception 'Bei neuen Charakteren sind maximal 15 Punkte erlaubt.';end if;
end; $$;

create or replace function public.sdn_apply_ticket(doc jsonb, ops jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare op jsonb; k text; kind text; path text[]; before_value jsonb; after_value jsonb;
 cur jsonb; items jsonb; result_items jsonb; img jsonb; rel jsonb; match_rel jsonb;
 found boolean;
begin
 for op in select value from jsonb_array_elements(ops) loop
  kind := op->>'kind'; k := op->>'key'; before_value := op->'before'; after_value := op->'after';
  if kind='field' then
    path := public.sdn_field_path(k);
    cur := doc #> path;
    if cur is distinct from before_value and cur is distinct from after_value then
      raise exception 'Konflikt: Feld % wurde seit Einreichung verändert.',k;
    end if;
    if jsonb_typeof(after_value) <> 'string' then raise exception 'Ungültiger Feldwert: %',k; end if;
    doc := jsonb_set(doc,path,after_value,true);
  elsif kind='stat' then
    if k <> all(array['combat','vigor','mobility','charisma','intellect']) then raise exception 'Unbekanntes Attribut'; end if;
    path := array['stats',k];cur := doc #> path;
    if cur is distinct from before_value and cur is distinct from after_value then raise exception 'Konflikt: Attribut %.',k; end if;
    if jsonb_typeof(after_value) not in ('number','null') then raise exception 'Ungültiger Attributwert'; end if;
    doc := jsonb_set(doc,path,after_value,true);
  elsif kind='powers' then
    cur := doc->'powers';
    if cur is distinct from before_value and cur is distinct from after_value then raise exception 'Konflikt: Fähigkeiten.'; end if;
    if jsonb_typeof(after_value) <> 'array' then raise exception 'Ungültige Fähigkeiten'; end if;
    doc := jsonb_set(doc,array['powers'],after_value,true);
  elsif kind='portrait' then
    if k<>'portrait' then raise exception 'Unbekannter Portraitantrag.';end if;
    cur:=coalesce(doc->'portrait','null'::jsonb);
    if cur is distinct from coalesce(before_value,'null'::jsonb) and
       cur is distinct from coalesce(after_value,'null'::jsonb) then
       raise exception 'Konflikt: Portrait wurde inzwischen verändert.';
    end if;
    doc:=jsonb_set(doc,array['portrait'],after_value || jsonb_build_object('publishedPreview',coalesce(doc#>>'{portrait,publishedPreview}','')),true);
  elsif kind='relation' then
    items := coalesce(doc->'relationships','[]'::jsonb);
    select value into match_rel from jsonb_array_elements(items) where value->>'targetId'=k limit 1;
    cur := coalesce(match_rel,'null'::jsonb);
    if cur is distinct from coalesce(before_value,'null'::jsonb)
       and cur is distinct from coalesce(after_value,'null'::jsonb) then
       raise exception 'Konflikt: Bekanntschaft %.',k;
    end if;
    if after_value <> 'null'::jsonb then
      if jsonb_typeof(after_value)<>'object' or after_value->>'targetId' is distinct from k
        or length(coalesce(after_value->>'description',''))>6000 or length(coalesce(after_value->>'type',''))>100 then
         raise exception 'Ungültige Bekanntschaft';
      end if;
      if not exists(select 1 from public.sdn_characters where id=k::uuid and status='approved') then
         raise exception 'Verknüpfte Akte existiert nicht oder ist nicht freigegeben.';
      end if;
    end if;
    select coalesce(jsonb_agg(value),'[]'::jsonb) into result_items
      from jsonb_array_elements(items) where value->>'targetId' is distinct from k;
    if after_value <> 'null'::jsonb then result_items := result_items || jsonb_build_array(after_value); end if;
    doc := jsonb_set(doc,array['relationships'],result_items,true);
  else
    raise exception 'Nicht unterstützter Antragstyp %.',kind;
  end if;
 end loop;
 perform public.sdn_validate_stats(doc);
 return doc;
end; $$;

create or replace function public.sdn_submit_ticket(
 p_character_id uuid, p_create jsonb, p_operations jsonb, p_changes jsonb,
 p_comment text default ''
) returns table(character_id uuid, ticket_code text)
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); c public.sdn_characters%rowtype;
 new_record jsonb; new_secret jsonb; op jsonb; priority_flag boolean := false;
 ticket_id uuid; ticket_num bigint;
begin
 if current_user_id is null or not public.sdn_is_member() then raise exception 'Discord-Mitgliedschaft erforderlich'; end if;
 if length(coalesce(p_comment,''))>1500 then raise exception 'Kommentar zu lang'; end if;
 if jsonb_typeof(coalesce(p_operations,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_operations,'[]'::jsonb))>80
    or length(coalesce(p_operations,'[]'::jsonb)::text)>250000 then raise exception 'Antrag enthält zu viele oder zu große Änderungen'; end if;
 if jsonb_typeof(coalesce(p_changes,'[]'::jsonb))<>'array' or length(coalesce(p_changes,'[]'::jsonb)::text)>100000 then
   raise exception 'Ungültige Änderungsübersicht'; end if;
 if p_character_id is null then
   if jsonb_typeof(p_create)<>'object' or length(p_create::text)>100000 then raise exception 'Ungültige neue Akte'; end if;
   if nullif(trim(p_create->>'alias'),'') is null or nullif(trim(p_create->>'name'),'') is null then raise exception 'Name und Alias erforderlich'; end if;
   perform public.sdn_validate_creation_stats(p_create,public.sdn_is_admin());
   if not public.sdn_is_admin() and (coalesce(p_create->>'role','') not in ('Superheld','Dispatcher','Teamleiter','Manager','Standortleitung','Techniker','Arzt')
      or coalesce(p_create->>'hasSecretIdentity','') not in ('yes','no')
      or coalesce(p_create->>'sex','') not in ('male','female','diverse')) then
     raise exception 'Position, geheime Identität und Geschlecht müssen ausgewählt werden.';
   end if;
   -- No public third-party portrait URL or unverified relationship target can be injected.
   if coalesce(p_create->>'photo','') <> '' then
     raise exception 'Portraitbilder benötigen ein eigenes Uploadverfahren.';
   end if;
   if jsonb_typeof(p_create->'relationships') <> 'array' or jsonb_array_length(p_create->'relationships') > 0 then
     raise exception 'Ungültige Beziehungsliste';
   end if;
   for op in select value from jsonb_array_elements(p_create->'relationships') loop
     if jsonb_typeof(op)<>'object' or length(coalesce(op->>'type',''))>100
        or length(coalesce(op->>'description',''))>6000 or not exists (
         select 1 from public.sdn_characters where id=(op->>'targetId')::uuid and status='approved'
       ) then raise exception 'Eine Bekanntschaft verweist auf eine ungültige Akte.'; end if;
   end loop;
   if p_create->'portrait' is null then raise exception 'Für neue Charaktere ist ein Portrait erforderlich.'; end if;
   perform public.sdn_validate_portrait(p_create->'portrait',current_user_id);
   new_secret := case when public.sdn_is_admin() then coalesce(p_create->'secret','{}'::jsonb) else '{"notes":""}'::jsonb end;
   new_record := (p_create - 'secret' - 'proposals' - 'changeLog' - 'status' - 'uid' - 'images' - 'player') || jsonb_build_object('player',coalesce((select dp.discord_name from public.sdn_discord_profiles dp where dp.user_id=current_user_id),'Discord-Spieler'),'photo','','portrait',(p_create->'portrait') || jsonb_build_object('publishedPreview','')); 
   insert into public.sdn_characters(owner_id,status,data) values (current_user_id,'draft',new_record)
     returning * into c;
   insert into public.sdn_character_secrets(character_id,data) values(c.id,new_secret);
   priority_flag:=true;
 else
   select * into c from public.sdn_characters where id=p_character_id for update;
   if not found then raise exception 'Akte nicht gefunden'; end if;
   if c.owner_id <> current_user_id and not public.sdn_is_admin() then raise exception 'Keine Berechtigung zum Bearbeiten'; end if;
   if jsonb_array_length(coalesce(p_operations,'[]'::jsonb))=0 then raise exception 'Antrag enthält keine Änderungen'; end if;
   for op in select value from jsonb_array_elements(p_operations) loop
     if op->>'kind'='field' then
       perform public.sdn_field_path(op->>'key');
       if op->>'key' = any(array['notes','hasCover','coverName','coverDetails']) and not public.sdn_is_admin() then
         raise exception 'TOP SECRET darf nur von der Spielleitung bearbeitet werden.';
       end if;
     elsif op->>'kind'='stat' then
       if op->>'key' <> all(array['combat','vigor','mobility','charisma','intellect']) then raise exception 'Unbekanntes Attribut'; end if;
       if op->'after'='null'::jsonb and not public.sdn_is_admin() then raise exception 'Spieler müssen Attributwerte angeben.';end if;
     elsif op->>'kind'='powers' then
       if op->>'key'<>'powers' then raise exception 'Unbekannte Fähigkeiten'; end if;
     elsif op->>'kind'='relation' then
       if c.status <> 'approved' then raise exception 'Bekanntschaften sind erst nach der Freigabe möglich.';end if;
       if not (op->>'key' ~ '^[0-9a-f-]{36}$') then raise exception 'Ungültige Verknüpfung'; end if;
     elsif op->>'kind'='portrait' then
       if op->>'key'<>'portrait' then raise exception 'Falsches Portraitfeld';end if;
       perform public.sdn_validate_portrait(op->'after',current_user_id);
     else raise exception 'Unbekannter Änderungstyp'; end if;
     if op->>'kind' in ('stat','powers') or op->>'key' = any(array['classCode','powerName','received','origin','powerDescription','weaknesses']) then priority_flag:=true;end if;
   end loop;
 end if;
 insert into public.sdn_tickets(character_id,requested_by,comment,operations,changes,priority,is_new)
 values (c.id,current_user_id,coalesce(p_comment,''),coalesce(p_operations,'[]'::jsonb),coalesce(p_changes,'[]'::jsonb),priority_flag,p_character_id is null)
 returning id,ticket_no into ticket_id,ticket_num;
 insert into public.sdn_audit(character_id,actor_id,action,ref) values(c.id,current_user_id,'ticket_submitted','CHG-'||lpad(ticket_num::text,4,'0'));
 character_id:=c.id;ticket_code:='CHG-'||lpad(ticket_num::text,4,'0');return next;
end; $$;

create or replace function public.sdn_review_ticket(p_ticket_id uuid,p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.sdn_tickets%rowtype;c public.sdn_characters%rowtype; working jsonb; private_doc jsonb;
begin
 if not public.sdn_is_admin() then raise exception 'Nur die Spielleitung darf Anträge freigeben';end if;
 select * into t from public.sdn_tickets where id=p_ticket_id for update;
 if not found or t.status<>'pending' then raise exception 'Ticket nicht mehr offen';end if;
 select * into c from public.sdn_characters where id=t.character_id for update;
 if p_approve then
   if t.is_new then
     if c.status <> 'draft' then raise exception 'Neue Akte wurde bereits bearbeitet/freigegeben';end if;
     perform public.sdn_validate_creation_stats(c.data,true);
     update public.sdn_characters set status='approved',version=version+1,updated_at=now() where id=c.id;
   else
     select data into private_doc from public.sdn_character_secrets where character_id=c.id;
     working := c.data || jsonb_build_object('secret',coalesce(private_doc,'{}'::jsonb));
     working := public.sdn_apply_ticket(working,t.operations);
     update public.sdn_characters set data=working-'secret',version=version+1,updated_at=now() where id=c.id;
     insert into public.sdn_character_secrets(character_id,data) values(c.id,coalesce(working->'secret','{}'::jsonb))
       on conflict(character_id) do update set data=excluded.data;
   end if;
 end if;
 update public.sdn_tickets set status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(), reviewed_at=now() where id=t.id;
 insert into public.sdn_audit(character_id,actor_id,action,ref)
 values(c.id,auth.uid(),case when p_approve then 'ticket_approved' else 'ticket_rejected' end,
        'CHG-'||lpad(t.ticket_no::text,4,'0'));
end; $$;

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
 insert into public.sdn_reports(submitted_by,report) values(auth.uid(),p_report - 'id' - 'status' - 'submitted' - 'reviewed')
 returning report_no into no;
 return 'OPS-'||lpad(no::text,4,'0');
end; $$;

revoke all on function public.sdn_validate_creation_stats(jsonb,boolean) from public,anon,authenticated;
-- Keine zusätzlichen Rechte für RPCs erforderlich: Grants der bestehenden Migration bleiben gültig.
