-- SDN Personnel Archive, initial secure data model (Supabase/PostgreSQL).
-- Run in a NEW Supabase project using SQL Editor or the Supabase CLI.

create extension if not exists pgcrypto;

create table public.sdn_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discord_id text not null,
  is_admin boolean not null default false,
  verified_until timestamptz not null default '-infinity',
  checked_at timestamptz not null default now()
);
create index sdn_access_expires_idx on public.sdn_access(verified_until);

create function public.sdn_is_member() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.sdn_access a
    where a.user_id = (select auth.uid()) and a.verified_until > now());
$$;
create function public.sdn_is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.sdn_access a
    where a.user_id = (select auth.uid()) and a.verified_until > now() and a.is_admin);
$$;

create table public.sdn_characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  status text not null default 'draft' check (status in ('draft','approved','pending')),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sdn_characters_owner_idx on public.sdn_characters(owner_id);

-- TOP SECRET deliberately lives OUTSIDE the general character document.
create table public.sdn_character_secrets (
  character_id uuid primary key references public.sdn_characters(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object')
);

create table public.sdn_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no bigint generated always as identity unique,
  character_id uuid not null references public.sdn_characters(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  comment text not null default '' check (char_length(comment) <= 1500),
  operations jsonb not null default '[]'::jsonb check (jsonb_typeof(operations) = 'array'),
  changes jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
  priority boolean not null default false,
  is_new boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create index sdn_tickets_by_character on public.sdn_tickets(character_id, created_at desc);
create index sdn_tickets_pending on public.sdn_tickets(status) where status='pending';

create table public.sdn_reports (
  id uuid primary key default gen_random_uuid(),
  report_no bigint generated always as identity unique,
  submitted_by uuid not null references auth.users(id),
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

create table public.sdn_audit (
  id bigint generated always as identity primary key,
  character_id uuid references public.sdn_characters(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  ref text,
  occurred_at timestamptz not null default now()
);
create index sdn_audit_character_idx on public.sdn_audit(character_id, occurred_at desc);

alter table public.sdn_access enable row level security;
alter table public.sdn_characters enable row level security;
alter table public.sdn_character_secrets enable row level security;
alter table public.sdn_tickets enable row level security;
alter table public.sdn_reports enable row level security;
alter table public.sdn_audit enable row level security;

-- No direct client INSERT/UPDATE/DELETE policies. All writes use the reviewed RPCs.
create policy sdn_access_self_read on public.sdn_access for select to authenticated
 using (public.sdn_is_member() and (user_id = (select auth.uid()) or public.sdn_is_admin()));
create policy sdn_character_read on public.sdn_characters for select to authenticated
 using (public.sdn_is_member() and (status='approved' or owner_id=(select auth.uid()) or public.sdn_is_admin()));
create policy sdn_secret_read on public.sdn_character_secrets for select to authenticated
 using (public.sdn_is_member() and exists (
   select 1 from public.sdn_characters c where c.id=character_id
    and (c.owner_id=(select auth.uid()) or public.sdn_is_admin())
 ));
create policy sdn_tickets_read on public.sdn_tickets for select to authenticated
 using (public.sdn_is_member() and (requested_by=(select auth.uid()) or public.sdn_is_admin()));
create policy sdn_reports_read on public.sdn_reports for select to authenticated
 using (public.sdn_is_member() and (status='approved' or submitted_by=(select auth.uid()) or public.sdn_is_admin()));
create policy sdn_audit_read on public.sdn_audit for select to authenticated
 using (public.sdn_is_member() and (actor_id=(select auth.uid()) or public.sdn_is_admin() or exists (
   select 1 from public.sdn_characters c where c.id=character_id and c.owner_id=(select auth.uid())
 )));

-- Deny all direct mutations. SECURITY DEFINER entrypoints below are the only write API.
revoke all on public.sdn_access, public.sdn_characters, public.sdn_character_secrets,
  public.sdn_tickets, public.sdn_reports, public.sdn_audit from anon, authenticated;
grant select on public.sdn_access, public.sdn_characters, public.sdn_character_secrets,
  public.sdn_tickets, public.sdn_reports, public.sdn_audit to authenticated;

-- Internal helper: calculate the location of a scalar form field in the dossier.
create function public.sdn_field_path(k text) returns text[]
language plpgsql immutable set search_path = '' as $$
begin
 if k = any(array['hair','eyes','build','skin','distinguishing','description','impression']) then
  return array['appearance',k];
 elsif k = any(array['character','motivation','behavior','assessment']) then
  return array['personality',k];
 elsif k = any(array['background','criminalRecord','formerAffiliations','medicalConditions',
                     'medicalInjuries','medicalTreatments','medicalAllergies','medicalNotes']) then
  return array['history',k];
 elsif k = any(array['hasCover','coverName','coverDetails']) then
  return array['secret',k];
 elsif k = any(array['name','alias','sdnId','role','height','weight','age','sex','blood',
                     'birthplace','birthday','player','discordChannelUrl','classCode','personalNotes','powerName',
                     'received','origin','powerDescription','weaknesses']) then
  return array[k];
 else
  raise exception 'Unzulässiges Aktenfeld: %', k;
 end if;
end; $$;

create function public.sdn_validate_stats(doc jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare k text; v integer; sum_points integer := 0; raw text;
begin
 foreach k in array array['combat','vigor','mobility','charisma','intellect'] loop
  raw := doc #>> array['stats',k];
  if raw is null or raw !~ '^[0-9]{1,2}$' then raise exception 'Attribut % muss eine ganze Zahl sein.', k; end if;
  v := raw::integer;
  if v < 1 or v > 10 then raise exception 'Attribut % außerhalb 1–10.', k; end if;
  sum_points := sum_points + v;
 end loop;
 if sum_points > 27 then raise exception 'Attributbudget überschritten (%/27).', sum_points; end if;
end; $$;

-- Only an approved public image URL may be displayed. Private originals/previews
-- belong to the uploader and are never served to ordinary visitors.
create function public.sdn_validate_portrait(p jsonb, uploader uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare path text; original_path text; preview_path text; crop jsonb; k text; value numeric;
begin
 if jsonb_typeof(p) <> 'object' then raise exception 'Portraitdaten fehlen.'; end if;
 original_path:=p->>'original'; preview_path:=p->>'preview'; crop:=p->'crop';
 if original_path !~ ('^sdn/'||uploader::text||'/[a-f0-9-]{36}-original\.webp$') or
    preview_path !~ ('^sdn/'||uploader::text||'/[a-f0-9-]{36}-preview\.webp$') then
  -- Crop-only changes may reuse the approved original uploaded by the same owner.
  raise exception 'Nur eigene private WebP-Bildvorlagen sind zulässig.';
 end if;
 foreach k in array array['x','y','width','height'] loop
  if jsonb_typeof(crop->k) <> 'number' then raise exception 'Ungültige Zuschnitt-Koordinate: %',k; end if;
  value:=(crop->>k)::numeric;
  if value<0 or value>1 then raise exception 'Zuschnitt außerhalb des Bildes.'; end if;
 end loop;
 if (crop->>'width')::numeric<=0 or (crop->>'height')::numeric<=0 or
   (crop->>'x')::numeric+(crop->>'width')::numeric>1.001 or
   (crop->>'y')::numeric+(crop->>'height')::numeric>1.001 then
   raise exception 'Ungültiger Portraitausschnitt.';
 end if;
 foreach path in array array[substr(original_path,5),substr(preview_path,5)] loop
  if not exists (select 1 from storage.objects o where o.bucket_id='sdn-images' and o.name=path)
    then raise exception 'Portraitdatei ist noch nicht hochgeladen.';end if;
 end loop;
end; $$;

-- Called ONLY inside the review RPC transaction. Compares each field to the
-- submit-time snapshot (or the already-target value), then applies the patch.
create function public.sdn_apply_ticket(doc jsonb, ops jsonb) returns jsonb
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
    if jsonb_typeof(after_value) <> 'number' then raise exception 'Ungültiger Attributwert'; end if;
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

create function public.sdn_submit_ticket(
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
   perform public.sdn_validate_stats(p_create);
   -- No public third-party portrait URL or unverified relationship target can be injected.
   if coalesce(p_create->>'photo','') <> '' then
     raise exception 'Portraitbilder benötigen ein eigenes Uploadverfahren.';
   end if;
   if jsonb_typeof(p_create->'relationships') <> 'array' then
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
   new_secret := coalesce(p_create->'secret','{}'::jsonb);
   new_record := (p_create - 'secret' - 'proposals' - 'changeLog' - 'status' - 'uid' - 'images') || jsonb_build_object('photo','','portrait',(p_create->'portrait') || jsonb_build_object('publishedPreview','')); 
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
     elsif op->>'kind'='stat' then
       if op->>'key' <> all(array['combat','vigor','mobility','charisma','intellect']) then raise exception 'Unbekanntes Attribut'; end if;
     elsif op->>'kind'='powers' then
       if op->>'key'<>'powers' then raise exception 'Unbekannte Fähigkeiten'; end if;
     elsif op->>'kind'='relation' then
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

create function public.sdn_review_ticket(p_ticket_id uuid,p_approve boolean) returns void
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
     perform public.sdn_validate_stats(c.data);
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

create function public.sdn_set_character_status(p_character_id uuid,p_approved boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.sdn_is_admin() then raise exception 'Nur die Spielleitung kann Akten freigeben';end if;
 if p_approved and exists (select 1 from public.sdn_characters where id=p_character_id and status='draft') then
   raise exception 'Entwürfe müssen über ihr neues Charakterticket freigegeben werden.';
 end if;
 update public.sdn_characters set status=case when p_approved then 'approved' else 'pending' end,
  version=version+1,updated_at=now() where id=p_character_id;
 if not found then raise exception 'Akte nicht gefunden';end if;
 insert into public.sdn_audit(character_id,actor_id,action) values(p_character_id,auth.uid(),
  case when p_approved then 'character_approved' else 'character_unapproved' end);
end; $$;

create function public.sdn_submit_report(p_report jsonb) returns text
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

create function public.sdn_review_report(p_report_id uuid,p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.sdn_is_admin() then raise exception 'Nur die Spielleitung darf Einsatzberichte freigeben';end if;
 update public.sdn_reports set status=case when p_approve then 'approved' else 'rejected' end,
 reviewed_by=auth.uid(),reviewed_at=now() where id=p_report_id and status='pending';
 if not found then raise exception 'Bericht bereits bearbeitet oder nicht gefunden';end if;
end; $$;

-- Publicly invokable internal helpers are not needed; only trusted RPC entrypoints.
revoke all on function public.sdn_field_path(text),public.sdn_validate_stats(jsonb),
 public.sdn_validate_portrait(jsonb,uuid),public.sdn_apply_ticket(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.sdn_is_member(),public.sdn_is_admin(),
 public.sdn_submit_ticket(uuid,jsonb,jsonb,jsonb,text),public.sdn_review_ticket(uuid,boolean),
 public.sdn_set_character_status(uuid,boolean),public.sdn_submit_report(jsonb),
 public.sdn_review_report(uuid,boolean) from public,anon;
grant execute on function public.sdn_is_member(),public.sdn_is_admin(),
 public.sdn_submit_ticket(uuid,jsonb,jsonb,jsonb,text),public.sdn_review_ticket(uuid,boolean),
 public.sdn_set_character_status(uuid,boolean),public.sdn_submit_report(jsonb),
 public.sdn_review_report(uuid,boolean) to authenticated;

-- Private originals and proposed crops only. Official portraits are public
-- WebP files in GitHub Pages after approval; users never read Storage directly.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('sdn-images','sdn-images',false,1048576,array['image/webp'])
 on conflict(id) do update set public=false,file_size_limit=1048576,
  allowed_mime_types=array['image/webp'];
create policy sdn_storage_owner_read on storage.objects for select to authenticated
 using(bucket_id='sdn-images' and public.sdn_is_member() and
  ((storage.foldername(name))[1]=(select auth.uid())::text or public.sdn_is_admin()));
create policy sdn_storage_owner_upload on storage.objects for insert to authenticated
 with check(bucket_id='sdn-images' and public.sdn_is_member()
  and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '\.webp$');
-- No direct update/delete policy: tickets preserve proposed historical files.

-- The publisher Function is the ONLY caller of this privileged procedure.
-- This does not create a new ticket: it marks an already approved portrait as live.
create function public.sdn_finalize_portrait(p_ticket_id uuid,p_photo_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.sdn_tickets%rowtype; c public.sdn_characters%rowtype; proposed text;
begin
 select * into t from public.sdn_tickets where id=p_ticket_id and status='approved';
 if not found then raise exception 'Genehmigtes Ticket nicht gefunden.';end if;
 select * into c from public.sdn_characters where id=t.character_id for update;
 if t.is_new then proposed:=c.data#>>'{portrait,preview}';
 else select value#>>'{after,preview}' into proposed from jsonb_array_elements(t.operations) where value->>'kind'='portrait' limit 1;
 end if;
 if proposed is null or proposed is distinct from c.data#>>'{portrait,preview}' then raise exception 'Neuere Portraitänderung hat Vorrang.';end if;
 if p_photo_url !~ ('^https://[a-zA-Z0-9-]+\.github\.io/(?:[a-zA-Z0-9._/-]*/)?portraits/'||c.id::text||'-'||t.id::text||'\.webp$') then
  raise exception 'Ungültiger öffentlicher Portraitpfad.';
 end if;
 update public.sdn_characters set data=jsonb_set(
  jsonb_set(data,array['photo'],to_jsonb(p_photo_url),true),
  array['portrait','publishedPreview'],to_jsonb(proposed),true),
  updated_at=now() where id=c.id;
 insert into public.sdn_audit(character_id,actor_id,action,ref)
 values(c.id,t.reviewed_by,'portrait_published','CHG-'||lpad(t.ticket_no::text,4,'0'));
end; $$;
revoke all on function public.sdn_finalize_portrait(uuid,text) from public,anon,authenticated;
grant execute on function public.sdn_finalize_portrait(uuid,text) to service_role;
