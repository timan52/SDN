/** SDN: create a Discord Forum post only after a character is approved.
 * Called by authenticated GM clients, uses a durable DB queue + lease.
 * Required secrets: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID,
 * DISCORD_FORUM_CHANNEL_ID, SDN_SITE_URL, SDN_ALLOWED_ORIGINS.
 * Standard Supabase SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are available on the server.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
const botToken = Deno.env.get('DISCORD_BOT_TOKEN') ?? '';
const guildId = Deno.env.get('DISCORD_GUILD_ID') ?? '';
const forumId = Deno.env.get('DISCORD_FORUM_CHANNEL_ID') ?? '';
const siteUrl = Deno.env.get('SDN_SITE_URL') ?? '';
const origins = (Deno.env.get('SDN_ALLOWED_ORIGINS') ?? 'http://localhost:8000').split(',').map(x=>x.trim());
const snowflake = /^\d{16,22}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function result(code:number, payload:unknown, origin:string|null) {
  return new Response(JSON.stringify(payload),{status:code,headers:{
    'Content-Type':'application/json','Cache-Control':'no-store',
    'Access-Control-Allow-Origin':origin && origins.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin',
  }});
}
async function discord(path:string, options:RequestInit = {}) {
  const response = await fetch('https://discord.com/api/v10'+path, {
    ...options, headers: { Authorization:`Bot ${botToken}`,Accept:'application/json',
      ...(options.body ? {'Content-Type':'application/json'}:{}), ...(options.headers??{}) },
    signal:AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`Discord API HTTP ${response.status}: ${String(payload?.message ?? 'Anfrage fehlgeschlagen').slice(0,120)}`);
  return payload;
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  const reply = (status:number,payload:unknown)=>result(status,payload,origin);
  if(request.method==='OPTIONS') return reply(200,{ok:true});
  if(request.method!=='POST') return reply(405,{error:'Method not allowed'});
  if(origin && !origins.includes(origin)) return reply(403,{error:'Origin not allowed'});
  if(!supabaseUrl || !serviceKey || !botToken || !snowflake.test(guildId) || !snowflake.test(forumId) || !/^https:\/\//.test(siteUrl))
    return reply(503,{error:'Forum synchronization not fully configured'});
  const jwt=request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!jwt) return reply(401,{error:'Login erforderlich'});
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:account,error:authError}=await admin.auth.getUser(jwt);
  if(authError || !account.user) return reply(401,{error:'Ungültige Sitzung'});
  const {data:access,error:accessError}=await admin.from('sdn_access')
    .select('is_admin,verified_until').eq('user_id',account.user.id).maybeSingle();
  if(accessError || !access?.is_admin || Date.parse(access.verified_until)<=Date.now())
    return reply(403,{error:'Nur eine frisch geprüfte SL darf Forenbeiträge veröffentlichen'});

  let requestedId:string|null=null;
  try {
    const body=await request.json();
    if(body?.characterId != null) {
      if(typeof body.characterId!=='string' || !uuid.test(body.characterId)) return reply(400,{error:'Ungültige Charakter-ID'});
      requestedId=body.characterId;
    }
  } catch { return reply(400,{error:'Ungültige Anfrage'}); }
  try {
    const channel=await discord(`/channels/${forumId}`);
    if(channel.type!==15 || channel.guild_id!==guildId) return reply(409,{error:'Konfigurierte Discord-ID gehört nicht zu einem Forum dieses Servers'});
    // Explicit retry can also bootstrap an already approved character from
    // an earlier version. It never alters an existing, linked forum post.
    if(requestedId){
      const {data:record,error:recordError}=await admin.from('sdn_characters').select('id,status,data').eq('id',requestedId).maybeSingle();
      if(recordError || !record || record.status!=='approved') return reply(404,{error:'Keine freigegebene Personalakte zu dieser ID'});
      if(record.data?.discordChannelUrl) return reply(200,{ok:true,created:0,alreadyLinked:true});
      const {error:enqueueError}=await admin.from('sdn_forum_jobs').upsert({character_id:requestedId},
        {onConflict:'character_id',ignoreDuplicates:true});
      if(enqueueError) throw new Error('Forenauftrag konnte nicht erzeugt werden: '+enqueueError.message);
    }
    let created=0; const errors:string[]=[];
    // Small bounded batch; remaining jobs are picked up by the next SL login.
    for(let i=0;i<(requestedId?1:5);i++) {
      const {data:claimed,error:claimError}=await admin.rpc('sdn_claim_forum_job',{p_character_id:requestedId});
      if(claimError) throw new Error(claimError.message);
      const job=Array.isArray(claimed)?claimed[0]:null;
      if(!job) break;
      try {
        if(!snowflake.test(job.discord_id)) throw new Error('Kein verifizierter Discord-Nutzer zum Charakter hinterlegt');
        if(job.needs_portrait && !job.portrait_url) throw new Error('Genehmigtes Portrait ist noch nicht auf GitHub veröffentlicht');
        // Check the owner is still a guild member before mentioning them.
        const owner=await discord(`/guilds/${guildId}/members/${job.discord_id}`);
        if(owner?.pending) throw new Error('Discord-Mitgliedschaft des Spielers noch ausstehend');
        const name=String(job.alias||'Neuer Charakter').replace(/@/g,'@\u200b').slice(0,90);
        const link=new URL(siteUrl);
        link.searchParams.set('character',job.character_id);
        const embed:Record<string,unknown>={
          title:`Personalakte: ${name}`,
          description:`[Personalakte im SDN-Archiv öffnen](${link.toString()})`,
          color:0xe99155,
          footer:{text:String(job.sdn_id||'SDN').slice(0,100)},
        };
        if(job.portrait_url && /^https:\/\/[a-z0-9.-]+\//i.test(job.portrait_url)) embed.image={url:job.portrait_url};
        const thread=await discord(`/channels/${forumId}/threads`,{
          method:'POST',body:JSON.stringify({
            name:`${name} · ${String(job.sdn_id||'SDN').slice(0,30)}`.slice(0,100),
            message:{
              content:`<@${job.discord_id}> Deine Personalakte wurde genehmigt. Hier kannst du zusätzliche Charakterbilder und Referenzen sammeln.`,
              embeds:[embed],allowed_mentions:{parse:[],users:[job.discord_id],roles:[]},
            },
          }),
        });
        if(!snowflake.test(String(thread?.id??''))) throw new Error('Discord hat keine Thread-ID zurückgegeben');
        const {error:doneError}=await admin.rpc('sdn_complete_forum_job',{
          p_character_id:job.character_id,p_claim_token:job.claim_token,
          p_thread_id:String(thread.id),p_message_id:thread.message?.id?String(thread.message.id):null,p_guild_id:guildId,
        });
        if(doneError) throw new Error('Forenbeitrag wurde erstellt, aber der Datenbanklink konnte nicht gespeichert werden: '+doneError.message);
        created++;
      } catch(err) {
        const message=err instanceof Error?err.message:String(err);
        const {error:failError}=await admin.rpc('sdn_fail_forum_job',{
          p_character_id:job.character_id,p_claim_token:job.claim_token,p_reason:message,
        });
        errors.push(`Charakter ${job.character_id}: ${message}`+(failError?' (Fehler beim Statusspeichern)':''));
        // Don't retry an immediately failing oldest job repeatedly in one invocation.
        break;
      }
    }
    return reply(errors.length?207:200,{ok:errors.length===0,created,errors});
  }catch(error){return reply(502,{error:error instanceof Error?error.message:'Forum-Synchronisierung fehlgeschlagen'});}
});
