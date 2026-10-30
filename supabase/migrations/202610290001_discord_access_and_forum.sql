-- SDN v0.25: persistent forum-post publication queue.
-- Requires all earlier SDN migrations (through v0.21).
-- The access-role gate is handled in verify-discord: sdn_access.verified_until
-- is extended ONLY for approved guild role holders or SDN staff.
-- Existing RLS policies and SECURITY DEFINER write functions all call
-- sdn_is_member(), which checks this expiration.

create table if not exists public.sdn_forum_jobs (
  character_id uuid primary key references public.sdn_characters(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','processing','failed','done')),
  thread_id text unique,
  starter_message_id text,
  claim_token uuid,
  claim_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sdn_forum_jobs_state_idx
  on public.sdn_forum_jobs(state,created_at);

alter table public.sdn_forum_jobs enable row level security;
revoke all on public.sdn_forum_jobs from public, anon, authenticated;
-- No RLS policies: ONLY the protected Edge Function (service_role) manages jobs.

-- An approved character automatically gets a queued forum creation job.
create or replace function public.sdn_queue_forum_post()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' then
    if tg_op = 'INSERT' then
      insert into public.sdn_forum_jobs(character_id)
      values (new.id) on conflict (character_id) do nothing;
    elsif old.status is distinct from 'approved' then
      insert into public.sdn_forum_jobs(character_id)
      values (new.id) on conflict (character_id) do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists sdn_character_queue_forum on public.sdn_characters;
create trigger sdn_character_queue_forum
  after insert or update of status on public.sdn_characters
  for each row execute function public.sdn_queue_forum_post();

-- Called only by the Edge Function using the service_role key.
-- Claim is atomic and leased so two SL requests cannot publish the same job at once.
create or replace function public.sdn_claim_forum_job(p_character_id uuid default null)
returns table(character_id uuid,owner_id uuid,alias text,sdn_id text,
              portrait_url text,needs_portrait boolean,discord_id text,claim_token uuid)
language plpgsql security definer set search_path = '' as $$
declare selected_id uuid; next_claim uuid := gen_random_uuid();
begin
  select j.character_id into selected_id
    from public.sdn_forum_jobs j
    join public.sdn_characters c on c.id=j.character_id
   where c.status='approved'
     and (p_character_id is null or j.character_id=p_character_id)
     and (j.state in ('pending','failed') or (j.state='processing' and j.claim_until<now()))
   order by j.created_at for update of j skip locked limit 1;
  if selected_id is null then return; end if;
  update public.sdn_forum_jobs j set state='processing',claim_token=next_claim,
    claim_until=now()+interval '3 minutes',attempts=attempts+1,
    last_error=null,updated_at=now()
    where j.character_id=selected_id;
  return query
    select c.id,c.owner_id,coalesce(c.data->>'alias',''),
      coalesce(c.data->>'sdnId',''),coalesce(c.data->>'photo',''),
      (coalesce(c.data #>> '{portrait,preview}','')<>'') as needs_portrait,
      coalesce(a.discord_id,''),next_claim
      from public.sdn_characters c
      left join public.sdn_access a on a.user_id=c.owner_id
      where c.id=selected_id;
end $$;

create or replace function public.sdn_complete_forum_job(
  p_character_id uuid,p_claim_token uuid,p_thread_id text,p_message_id text,p_guild_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare n integer; channel_link text;
begin
  if p_thread_id !~ '^[0-9]{16,22}$' or p_guild_id !~ '^[0-9]{16,22}$'
     or (p_message_id is not null and p_message_id !~ '^[0-9]{16,22}$') then
    raise exception 'Invalid Discord identifier'; end if;
  update public.sdn_forum_jobs set state='done',thread_id=p_thread_id,
    starter_message_id=p_message_id,claim_token=null,claim_until=null,
    updated_at=now(),last_error=null
    where character_id=p_character_id and claim_token=p_claim_token
      and state='processing';
  get diagnostics n = row_count;
  if n<>1 then raise exception 'Forum job claim no longer valid'; end if;
  channel_link := 'https://discord.com/channels/'||p_guild_id||'/'||p_thread_id;
  update public.sdn_characters
     set data=jsonb_set(data,'{discordChannelUrl}',to_jsonb(channel_link),true),
         updated_at=now()
   where id=p_character_id and status='approved';
end $$;

create or replace function public.sdn_fail_forum_job(
  p_character_id uuid,p_claim_token uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sdn_forum_jobs set state='failed',last_error=left(coalesce(p_reason,'Unknown error'),1000),
    claim_token=null,claim_until=null,updated_at=now()
    where character_id=p_character_id and claim_token=p_claim_token
      and state='processing';
end $$;

revoke all on function public.sdn_queue_forum_post(),
  public.sdn_claim_forum_job(uuid),
  public.sdn_complete_forum_job(uuid,uuid,text,text,text),
  public.sdn_fail_forum_job(uuid,uuid,text)
from public, anon, authenticated;
grant execute on function public.sdn_claim_forum_job(uuid),
  public.sdn_complete_forum_job(uuid,uuid,text,text,text),
  public.sdn_fail_forum_job(uuid,uuid,text)
to service_role;

-- Earlier approved records are intentionally NOT backfilled, to avoid
-- suddenly publishing test characters. Opt-in backfill is in README.


-- Once the bot manages the forum URL, players must not be able to forge it
-- via normal tickets or a newly submitted character. The bot finalization
-- runs with the service_role credential and is the only allowed writer.
create or replace function public.sdn_guard_bot_forum_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    if tg_op='INSERT' then
      if coalesce(new.data->>'discordChannelUrl','') <> '' then
        raise exception 'Der Discord-Charakterkanal wird ausschließlich vom SDN-Bot vergeben';
      end if;
    elsif coalesce(new.data->>'discordChannelUrl','') is distinct from
          coalesce(old.data->>'discordChannelUrl','') then
      raise exception 'Der Discord-Charakterkanal wird ausschließlich vom SDN-Bot vergeben';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sdn_guard_forum_link on public.sdn_characters;
create trigger sdn_guard_forum_link before insert or update of data on public.sdn_characters
  for each row execute function public.sdn_guard_bot_forum_link();
revoke all on function public.sdn_guard_bot_forum_link() from public,anon,authenticated;

-- Invalidate pre-migration membership checks. New role-based checks must
-- refresh a user's access before RLS will accept them.
update public.sdn_access set verified_until = now();
