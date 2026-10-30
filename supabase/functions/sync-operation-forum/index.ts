/** Publish approved SDN operation callouts and close notifications in a Discord Forum.
 * Authenticated SL trigger + durable database outbox; no public admin endpoints.
 * Requires DISCORD_OPERATION_FORUM_CHANNEL_ID, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID,
 * SDN_ALLOWED_ORIGINS and Supabase server keys. No secrets in GitHub Pages code.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const url=Deno.env.get('SUPABASE_URL')??'';
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
const bot=Deno.env.get('DISCORD_BOT_TOKEN')??'';
const guild=Deno.env.get('DISCORD_GUILD_ID')??'';
const forum=Deno.env.get('DISCORD_OPERATION_FORUM_CHANNEL_ID')??'';
const allowed=(Deno.env.get('SDN_ALLOWED_ORIGINS')??'http://localhost:8000').split(',').map(x=>x.trim());
const snowflake=/^\d{16,22}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const htmlSafe=(value:unknown,max=300)=>String(value??'').replace(/@/g,'@\u200b').slice(0,max);
function reply(status:number,body:unknown,origin:string|null){return new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
  'Access-Control-Allow-Origin':origin&&allowed.includes(origin)?origin:'null',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}});}
async function discord(path:string,method='GET',body?:unknown):Promise<any>{
  const res=await fetch(`https://discord.com/api/v10${path}`,{
    method,headers:{Authorization:`Bot ${bot}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),
  });
  if(res.status===204)return {};
  const json=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(`Discord HTTP ${res.status}: ${String(json?.message??'Anfrage fehlgeschlagen').slice(0,140)}`);
  return json;
}
function code(n:unknown){return `OPS-${String(n).padStart(4,'0')}`;}
const isClosed=(report:any)=>String(report?.outcome??'open')!=='open';
async function mentionedUsers(admin:any,report:any):Promise<string[]>{
  const ids=new Set<string>((Array.isArray(report?.participants)?report.participants:[]).filter((id:unknown)=>typeof id==='string'&&uuid.test(id)));
  if(typeof report?.dispatcherId==='string'&&uuid.test(report.dispatcherId))ids.add(report.dispatcherId);
  if(ids.size===0)return [];
  const {data:characters,error:characterError}=await admin.from('sdn_characters').select('id,owner_id').in('id',[...ids]);
  if(characterError)throw new Error('Charakter-Zuordnung konnte nicht gelesen werden: '+characterError.message);
  const owners=[...new Set((characters??[]).map((c:any)=>c.owner_id).filter(Boolean))];
  if(!owners.length)return [];
  const {data:users,error:userError}=await admin.from('sdn_access').select('user_id,discord_id').in('user_id',owners);
  if(userError)throw new Error('Discord-Spielerzuordnung nicht verfügbar: '+userError.message);
  return [...new Set((users??[]).map((u:any)=>String(u.discord_id||'')).filter((v:string)=>snowflake.test(v)))];
}
async function processJob(admin:any,job:any){
  let threadId=String(job.thread_id??'');
  let starter=String(job.starter_message_id??'');
  const report=job.report_data??{};
  const op=code(job.report_no);
  const title=htmlSafe(report.title??'Einsatz',75);
  const dispatcherId=String(report.dispatcherId||'');
  const {data:dcharacter,error:dcError}=await admin.from('sdn_characters')
    .select('id,owner_id,data,status').eq('id',dispatcherId).maybeSingle();
  if(dcError||!dcharacter||dcharacter.status!=='approved')throw new Error('Zugewiesener Dispatcher nicht vorhanden');
  const dispatcherName=htmlSafe(dcharacter.data?.alias||'Unbekannt',90);
  if(!threadId){
    const description=[
      `**Einsatz:** ${title}`,
      `**Einsatzort:** ${htmlSafe(report.location||'Nicht angegeben',180)}`,
      `**Auftraggeber:** ${htmlSafe(report.customer||'Nicht angegeben',180)}`,
      `**Dispatcher:** ${dispatcherName}`,
      '',
      '**AUSGANGSLAGE**',
      htmlSafe(report.situation||'Keine Angaben',1800),
      '',
      '*Freiwillige Meldungen zur Teilnahme bitte als Antwort in diesem Beitrag. Der Dispatcher übernimmt die Zuweisung in der SDN-Personaldatenbank.*',
    ].join('\n').slice(0,1950);
    const created=await discord(`/channels/${forum}/threads`,'POST',{
      name:`🚨 ${op} · ${title}`.slice(0,100),
      message:{content:description,allowed_mentions:{parse:[],users:[],roles:[]}},
    });
    threadId=String(created?.id||'');
    starter=String(created?.message?.id||created?.id||'');
    if(!snowflake.test(threadId)||!snowflake.test(starter))throw new Error('Discord hat keine gültige Beitrags-ID geliefert');
    const {error}=await admin.rpc('sdn_operation_forum_mark_thread',{
      p_report_id:job.report_id,p_claim:job.claim_token,p_thread:threadId,p_message:starter,p_guild:guild,
    });
    if(error)throw new Error('Discord-Beitrag erstellt, aber Datenbanksicherung fehlgeschlagen: '+error.message);
  }
  if(Number(job.close_revision)>Number(job.notified_revision)){
    if(!isClosed(report)){
      // The report was reopened before the close job ran. Don't notify it as closed.
      const {error}=await admin.rpc('sdn_operation_forum_finish',{p_report_id:job.report_id,p_claim:job.claim_token});
      if(error)throw new Error(error.message);
      return {created:!job.thread_id,closed:false,skipped:true};
    }
    const revision=Number(job.close_revision);
    let closeMessage=Number(job.close_message_revision)===revision?String(job.close_message_id||''):'';
    if(!closeMessage){
      const users=await mentionedUsers(admin,report);
      const mentions=users.map(id=>`<@${id}>`).join(' ');
      const content=`❌ **EINSATZ ABGESCHLOSSEN · ${op}**\nDer Abschluss wurde von der SDN-Spielleitung genehmigt.\n${mentions}`.slice(0,1950);
      const sent=await discord(`/channels/${threadId}/messages`,'POST',{
        content,allowed_mentions:{parse:[],users:users,roles:[]},
      });
      closeMessage=String(sent?.id||'');
      if(!snowflake.test(closeMessage))throw new Error('Discord hat keine gültige Abschlussnachrichten-ID geliefert');
      const {error}=await admin.rpc('sdn_operation_forum_mark_close_message',{
        p_report_id:job.report_id,p_claim:job.claim_token,p_message:closeMessage,p_revision:revision,
      });
      if(error)throw new Error('Abschlussnachricht gesendet, aber Sicherung fehlgeschlagen: '+error.message);
    }
    await discord(`/channels/${threadId}/messages/${starter||threadId}/reactions/${encodeURIComponent('❌')}/@me`,'PUT');
    const {error}=await admin.rpc('sdn_operation_forum_mark_reaction',{
      p_report_id:job.report_id,p_claim:job.claim_token,p_revision:revision,
    });
    if(error)throw new Error('X-Reaktion gesetzt, aber Sicherung fehlgeschlagen: '+error.message);
  }
  const {error:finishError}=await admin.rpc('sdn_operation_forum_finish',{
    p_report_id:job.report_id,p_claim:job.claim_token,
  });
  if(finishError)throw new Error(finishError.message);
  return {created:!job.thread_id,closed:Number(job.close_revision)>Number(job.notified_revision)};
}
Deno.serve(async request=>{
  const origin=request.headers.get('Origin');
  const respond=(code:number,body:unknown)=>reply(code,body,origin);
  if(request.method==='OPTIONS')return respond(200,{ok:true});
  if(request.method!=='POST')return respond(405,{error:'Method not allowed'});
  if(origin&&!allowed.includes(origin))return respond(403,{error:'Origin not allowed'});
  if(!url||!key||!bot||!snowflake.test(guild)||!snowflake.test(forum))return respond(503,{error:'Discord operation forum not configured'});
  const jwt=request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!jwt)return respond(401,{error:'Discord-Login erforderlich'});
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const {data:identity,error:identityError}=await admin.auth.getUser(jwt);
  if(identityError||!identity.user)return respond(401,{error:'Ungültige Sitzung'});
  const {data:access,error:accessError}=await admin.from('sdn_access')
    .select('is_admin,verified_until').eq('user_id',identity.user.id).maybeSingle();
  if(accessError||!access?.is_admin||Date.parse(access.verified_until)<Date.now())return respond(403,{error:'Nur die SL darf Discord-Einsätze veröffentlichen'});
  let reportId:string|null=null;
  try{
    const body=await request.json();
    if(body?.reportId!=null){if(typeof body.reportId!=='string'||!uuid.test(body.reportId))return respond(400,{error:'Ungültige Einsatz-ID'});reportId=body.reportId;}
  }catch{return respond(400,{error:'Ungültige Anfrage'});}
  try{
    const channel=await discord(`/channels/${forum}`);
    if(channel.type!==15||channel.guild_id!==guild)return respond(409,{error:'Die konfigurierte Kanal-ID ist kein Forum dieses Servers'});
    if(reportId){
      const {data:r,error}=await admin.from('sdn_reports').select('id,status,report').eq('id',reportId).maybeSingle();
      if(error||!r||r.status!=='approved')return respond(404,{error:'Einsatz muss zuerst freigegeben werden'});
      const {error:queuedError}=await admin.from('sdn_operation_forum_jobs').upsert({report_id:reportId,close_revision:isClosed(r.report)?1:0},
        {onConflict:'report_id',ignoreDuplicates:true});
      if(queuedError)throw new Error(queuedError.message);
    }
    let created=0,completed=0;const errors:string[]=[];
    for(let n=0;n<(reportId?1:5);n++){
      const {data:claimed,error:claimError}=await admin.rpc('sdn_claim_operation_forum_job',{p_report_id:reportId});
      if(claimError)throw new Error(claimError.message);
      const job=Array.isArray(claimed)?claimed[0]:null;if(!job)break;
      try{
        const done=await processJob(admin,job);
        if(done.created)created++;
        if(done.closed)completed++;
      }catch(e){
        const message=e instanceof Error?e.message:String(e);
        await admin.rpc('sdn_operation_forum_fail',{p_report_id:job.report_id,p_claim:job.claim_token,p_reason:message});
        errors.push(`${code(job.report_no)}: ${message}`);break;
      }
    }
    return respond(errors.length?207:200,{ok:errors.length===0,created,completed,errors});
  }catch(e){return respond(502,{error:e instanceof Error?e.message:'Discord-Forum konnte nicht synchronisiert werden'});}
});
