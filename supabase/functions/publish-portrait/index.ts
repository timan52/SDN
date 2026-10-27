/** Publishing an ALREADY APPROVED cropped WebP into GitHub Pages.
 *  An approved ticket can be retried; older portraits remain live until finalization.
 *  Secrets: GH_TOKEN (fine-grained contents write), GH_OWNER, GH_REPO, GH_BRANCH.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')!;
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!;
const repoOwner=Deno.env.get('GH_OWNER') ?? '';
const repo=Deno.env.get('GH_REPO') ?? '';
const branch=Deno.env.get('GH_BRANCH') ?? 'main';
const ghToken=Deno.env.get('GH_TOKEN') ?? '';
const origins=(Deno.env.get('SDN_ALLOWED_ORIGINS')??'http://localhost:8000').split(',').map(x=>x.trim());
function response(status:number,data:unknown,origin:string|null){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin&&origins.includes(origin)?origin:'null','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}})}
Deno.serve(async req=>{
  const origin=req.headers.get('Origin');
  if(req.method==='OPTIONS')return response(200,{ok:true},origin);
  if(req.method!=='POST'||(origin&&!origins.includes(origin)))return response(403,{error:'Request not permitted'},origin);
  if(![url,serviceKey,ghToken,repoOwner,repo].every(Boolean))return response(503,{error:'GitHub publishing not configured'},origin);
  try {
    const jwt=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if(!jwt)return response(401,{error:'Anmeldung erforderlich'},origin);
    const service=createClient(url,serviceKey,{auth:{persistSession:false}});
    const {data:identity,error:idErr}=await service.auth.getUser(jwt);
    if(idErr||!identity.user)return response(401,{error:'Invalid user session'},origin);
    const {data:access,error:accessErr}=await service.from('sdn_access').select('user_id,is_admin,verified_until').eq('user_id',identity.user.id).single();
    if(accessErr||!access?.is_admin||Date.parse(access.verified_until)<=Date.now())return response(403,{error:'Frisch bestätigte Spielleitungsrolle erforderlich'},origin);
    const ticketId=(await req.json())?.ticketId;
    if(typeof ticketId!=='string'||!/^[0-9a-f-]{36}$/i.test(ticketId))return response(400,{error:'Ungültiges Ticket'},origin);
    const {data:t,error:te}=await service.from('sdn_tickets').select('id,character_id,is_new,status,operations').eq('id',ticketId).single();
    if(te||!t||t.status!=='approved')return response(409,{error:'Das Ticket ist nicht freigegeben'},origin);
    const {data:record,error:ce}=await service.from('sdn_characters').select('data').eq('id',t.character_id).single();
    if(ce||!record)return response(404,{error:'Akte fehlt'},origin);
    const path=t.is_new?record.data?.portrait?.preview : t.operations?.find((op:any)=>op.kind==='portrait')?.after?.preview;
    if(!path||path!==record.data?.portrait?.preview||typeof path!=='string'||!/^sdn\/[0-9a-f-]{36}\/[0-9a-f-]{36}-preview\.webp$/i.test(path))
      return response(409,{error:'Ein neueres Portrait wurde bereits genehmigt oder Ticket enthält kein Portrait'},origin);
    const {data:blob,error:downloadError}=await service.storage.from('sdn-images').download(path.substring(4));
    if(downloadError||!blob||blob.size>1024*1024||blob.type!=='image/webp')return response(409,{error:'Geprüfte Bilddatei fehlt oder ist ungültig'},origin);
    const target=`portraits/${t.character_id}-${t.id}.webp`;
    const api=`https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repo)}/contents/${target}`;
    const headers={'Authorization':`Bearer ${ghToken}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
    const existing=await fetch(api,{headers});
    let sha: string|undefined;
    if(existing.ok){const prev=await existing.json();sha=prev.sha;}
    else if(existing.status!==404)return response(502,{error:`GitHub Datei-Prüfung: HTTP ${existing.status}`},origin);
    const bytes=new Uint8Array(await blob.arrayBuffer());
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const put=await fetch(api,{method:'PUT',headers,body:JSON.stringify({message:`SDN: approved portrait ${t.id}`,branch,content:btoa(binary),...(sha?{sha}:{})})});
    if(!put.ok){const info=await put.text();return response(502,{error:`GitHub Upload fehlgeschlagen (HTTP ${put.status}): ${info.slice(0,180)}`},origin);}
    const publicUrl=`https://${repoOwner}.github.io/${repo===''+repoOwner+'.github.io'?'':repo+'/'}${target}`;
    const {error:finalError}=await service.rpc('sdn_finalize_portrait',{p_ticket_id:t.id,p_photo_url:publicUrl});
    if(finalError)return response(409,{error:'Datei liegt auf GitHub, Veröffentlichung in der Akte ausstehend: '+finalError.message},origin);
    return response(200,{ok:true,url:publicUrl},origin);
  }catch(e){return response(500,{error:e instanceof Error?e.message:'Serverfehler'},origin);}
});
