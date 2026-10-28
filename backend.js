/* SDN online connector. No privileged keys or Discord secrets belong in this file. */
(() => {
  'use strict';
  const cfg = { ...(window.SDN_CONFIG || {}) };
  cfg.supabaseUrl = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.supabaseUrl || '') &&
    typeof cfg.supabasePublishableKey === 'string' &&
    !cfg.supabasePublishableKey.includes('YOUR_') && cfg.supabasePublishableKey.length > 20;
  let client, user, memberInfo, currentDiscordName = '';
  const previewUrls = new Map();
  const errorMessage = e => e?.message || String(e);
  const handle = (r) => { if (r.error) throw new Error(errorMessage(r.error)); return r.data; };
  const asCode = (prefix, no) => `${prefix}-${String(no).padStart(4, '0')}`;

  async function prepare() {
    if (!configured) throw new Error('Supabase ist noch nicht konfiguriert. Bitte config.example.js als config.js einrichten.');
    if (!client) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    return client;
  }

  async function session() {
    await prepare();
    const result = handle(await client.auth.getSession());
    if (!result.session) return null;
    const remote = handle(await client.auth.getUser());
    user = remote.user;
    return result.session;
  }

  async function login() {
    await prepare();
    handle(await client.auth.signInWithOAuth({
      provider: 'discord', options: { redirectTo: location.href.split('?')[0].split('#')[0] },
    }));
  }
  async function logout() {
    if (client) await client.auth.signOut();
    location.reload();
  }

  async function verify() {
    const s = await session();
    if (!s) return { member: false, loginRequired: true, admin: false };
    const r = await fetch(`${cfg.supabaseUrl}/functions/v1/verify-discord`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.supabasePublishableKey,
        'Authorization': `Bearer ${s.access_token}`,
      },
      body: '{}',
      cache: 'no-store',
    });
    let payload;
    try { payload = await r.json(); } catch { payload = {}; }
    if (!r.ok) throw new Error(payload.error || 'Mitgliedschaft konnte nicht verifiziert werden.');
    memberInfo = payload;
    return payload;
  }

  // The ONLY file uploads in v0.7 are private originals and proposal previews.
  async function uploadPortraitBlob(blob, label) {
    await session();
    if (!user || !(blob instanceof Blob) || blob.type !== 'image/webp' || blob.size > 1024 * 1024)
      throw new Error('Für ein Portrait darf nur ein optimiertes WebP bis 1 MB hochgeladen werden.');
    const path = `${user.id}/${crypto.randomUUID()}-${label}.webp`;
    handle(await client.storage.from('sdn-images').upload(path, blob, { contentType:'image/webp', upsert:false, cacheControl:'3600' }));
    return `sdn/${path}`;
  }
  async function originalBlob(path) {
    await session();
    if (!path?.startsWith('sdn/')) throw new Error('Keine private Bildvorlage vorhanden. Neues Portrait auswählen.');
    return handle(await client.storage.from('sdn-images').download(path.substring(4)));
  }
  async function publishPortrait(ticketId) {
    const sess=await session();
    if (!sess || !memberInfo?.admin) throw new Error('Nur die Spielleitung darf Portraits veröffentlichen.');
    const res=await fetch(`${cfg.supabaseUrl}/functions/v1/publish-portrait`, {
      method:'POST', headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${sess.access_token}`},
      body:JSON.stringify({ticketId}), cache:'no-store',
    });
    let json={}; try { json=await res.json(); } catch{}
    if (!res.ok) throw new Error(json.error||'Portraitveröffentlichung fehlgeschlagen');
    return json;
  }
  async function loadAll() {
    if (!memberInfo?.member) throw new Error('Mitgliedschaft erforderlich');
    const [c, s, t, r, a, profiles, notes, reportEdits] = await Promise.all([
      client.from('sdn_characters').select('id,owner_id,status,data,version,created_at').order('created_at'),
      client.from('sdn_character_secrets').select('character_id,data'),
      client.from('sdn_tickets').select('id,ticket_no,character_id,requested_by,comment,operations,changes,priority,is_new,status,created_at,reviewed_at').order('created_at', { ascending: false }),
      client.from('sdn_reports').select('id,report_no,submitted_by,report,status,created_at,reviewed_at').order('created_at', { ascending: false }),
      client.from('sdn_audit').select('character_id,actor_id,action,ref,occurred_at').order('occurred_at', { ascending: false }),
      client.from('sdn_discord_profiles').select('user_id,discord_name,discord_username'),
      client.from('sdn_file_notes').select('id,character_id,author_character_id,author_alias,body,created_at').order('created_at',{ascending:false}),
      client.from('sdn_report_edits').select('id,report_id,requested_by,base_report,patch,comment,status,created_at,reviewed_at').order('created_at',{ascending:false}),
    ]);
    [c, s, t, r, a, profiles, notes, reportEdits].forEach(handle);
    const names = new Map(profiles.data.map(row => [row.user_id, row]));
    // Guild nickname is verified and stored server-side after Discord membership check.
    // Fall back to OAuth metadata only if there is no verified profile yet.
    currentDiscordName = String(names.get(user.id)?.discord_name || user.user_metadata?.full_name || user.user_metadata?.user_name || user.user_metadata?.name || '').trim().slice(0, 100);
    const displayOwner = id => names.get(id)?.discord_name || (id === user.id ? 'Du' : 'Discord-Spieler');
    const userSearchName = id => names.get(id)?.discord_username || '';
    const secrets = new Map(s.data.map(rec => [rec.character_id, rec.data]));
    const proposals = new Map();
    for (const row of t.data) {
      const entry = {
        _dbId: row.id, id: asCode('CHG', row.ticket_no),
        requestedBy: row.requested_by === user.id ? 'Du' : 'Anderes Servermitglied',
        title: row.is_new ? 'NEUE PERSONALAKTE' : 'ÄNDERUNGSANTRAG',
        status: row.status, comment: row.comment || '', priority: row.priority,
        isNew: row.is_new, changes: row.changes || [], operations: row.operations || [],
        portraitPreview: row.operations?.find(op=>op.kind==='portrait')?.after?.preview || '',
        time: new Date(row.created_at).toLocaleString('de-DE'),
      };
      const group = proposals.get(row.character_id) || [];
      group.push(entry); proposals.set(row.character_id, group);
    }
    // Only ticket requesters and the game master can retrieve these private
    // cropped previews. They remain invisible to other guild members.
    for(const old of previewUrls.values())URL.revokeObjectURL(old);
    previewUrls.clear();
    const previews=[...new Set([...proposals.values()].flat().filter(t=>t.status==='pending' && t.portraitPreview).map(t=>t.portraitPreview))];
    await Promise.all(previews.map(async path=>{
      if(!path.startsWith('sdn/'))return;
      const {data,error}=await client.storage.from('sdn-images').download(path.substring(4));
      if(!error&&data)previewUrls.set(path,URL.createObjectURL(data));
    }));
    const audits = new Map();
    for (const row of a.data) {
      const group = audits.get(row.character_id) || [];
      group.push({ title: row.action.replaceAll('_', ' ').toUpperCase(), fields: [row.ref || ''], time: new Date(row.occurred_at).toLocaleString('de-DE') });
      audits.set(row.character_id, group);
    }
    const chars = c.data.map(row => ({
      ...row.data,
      uid: row.id, ownerId: row.owner_id, status: row.status, createdAt: row.created_at,
      ownerDiscord: displayOwner(row.owner_id), ownerDiscordUsername: userSearchName(row.owner_id),
      secret: secrets.get(row.id) || { hasCover: 'unknown', coverName: '', coverDetails: '' },
      _canReadSecret: secrets.has(row.id),
      proposals: proposals.get(row.id) || [], changeLog: audits.get(row.id) || [],
    }));

    const editsByReport=new Map();
    for(const e of reportEdits.data){
      const list=editsByReport.get(e.report_id)||[];
      list.push({id:e.id,requestedBy:displayOwner(e.requested_by),baseReport:e.base_report,patch:e.patch,comment:e.comment,status:e.status,time:new Date(e.created_at).toLocaleString('de-DE')});
      editsByReport.set(e.report_id,list);
    }
    const reports = r.data.map(row => ({
      ...row.report, _dbId: row.id, id: asCode('OPS', row.report_no),
      status: row.status, submittedByMe: row.submitted_by === user.id, submitted: displayOwner(row.submitted_by), createdAt: row.created_at,
      edits:editsByReport.get(row.id)||[],
      reviewed: row.reviewed_at ? new Date(row.reviewed_at).toLocaleString('de-DE') : '',
    }));
    return { characters: chars, reports, fileNotes: notes.data.map(n=>({ id:n.id, characterId:n.character_id, authorId:n.author_character_id, authorAlias:n.author_alias, body:n.body, createdAt:n.created_at })) };
  }

  function normalizeOperations(operations) {
    return operations.map(op => {
      const res = JSON.parse(JSON.stringify(op));
      if (res.image) delete res.image.displaySrc;
      return res;
    });
  }
  async function submitTicket({ characterId, candidate, operations, changes, comment }) {
    const res = await client.rpc('sdn_submit_ticket', {
      p_character_id: characterId || null,
      p_create: characterId ? null : JSON.parse(JSON.stringify(candidate, (k, v) => ['_canReadSecret','ownerId','displaySrc'].includes(k) ? undefined : v)),
      p_operations: normalizeOperations(operations),
      p_changes: changes,
      p_comment: comment,
    });
    const rows = handle(res);
    return rows?.[0];
  }
  async function reviewTicket(dbId, approve) {
    handle(await client.rpc('sdn_review_ticket', { p_ticket_id: dbId, p_approve: approve }));
    if (approve) {
      const ticket=handle(await client.from('sdn_tickets').select('is_new,operations,character_id').eq('id',dbId).single());
      const character=handle(await client.from('sdn_characters').select('data').eq('id',ticket.character_id).single());
      const changed=ticket.is_new ? Boolean(character.data.portrait?.preview) : ticket.operations.some(op=>op.kind==='portrait');
      if (changed) {
        try { await publishPortrait(dbId); }
        catch(e) { return {warning:'Ticket genehmigt, aber das Portrait ist noch nicht veröffentlicht: '+e.message+' – erneute Veröffentlichung in der Akte möglich.'}; }
      }
    }
    return {warning:null};
  }
  async function setCharacterStatus(dbId, approved) {
    handle(await client.rpc('sdn_set_character_status', { p_character_id: dbId, p_approved: approved }));
  }
  // These RPCs enforce Discord-verified SL privileges in PostgreSQL.
  async function deleteCharacter(characterId) {
    await session();
    return handle(await client.rpc('sdn_delete_character', { p_character_id: characterId }));
  }
  async function deleteReport(reportId) {
    await session();
    return handle(await client.rpc('sdn_delete_report', { p_report_id: reportId }));
  }
  async function setCharacterActivity(characterId, activity) {
    await session();
    return handle(await client.rpc('sdn_set_character_activity', { p_character_id: characterId, p_activity: activity }));
  }
  async function addFileNote(characterId, authorCharacterId, body) {
    const result=await client.rpc('sdn_add_file_note', {p_character_id:characterId,p_author_character_id:authorCharacterId,p_body:body});
    return handle(result);
  }
  async function submitReport(report) {
    return handle(await client.rpc('sdn_submit_report', { p_report: report }));
  }
  async function reviewReport(dbId, approve) {
    handle(await client.rpc('sdn_review_report', { p_report_id: dbId, p_approve: approve }));
  }
  async function submitReportEdit(dbId,candidate,comment=''){
    await session();
    return handle(await client.rpc('sdn_submit_report_edit', {p_report_id:dbId,p_candidate:candidate,p_comment:comment}));
  }
  async function reviewReportEdit(editId,approve){
    await session();
    return handle(await client.rpc('sdn_review_report_edit',{p_edit_id:editId,p_approve:approve}));
  }

  window.SDNBackend = {
    enabled: configured, prepare, session, login, logout, verify, loadAll,
    submitTicket, reviewTicket, setCharacterStatus, submitReport, reviewReport, submitReportEdit, reviewReportEdit, addFileNote,
    deleteCharacter, deleteReport, setCharacterActivity,
    uploadPortraitBlob, originalBlob, publishPortrait,
    proposalImageUrl: path => previewUrls.get(path) || '',
    imageUrl: path => (typeof path === 'string' && /^https:\/\/[a-z0-9-]+\.github\.io\//i.test(path) ? path : ''),
    get userId() { return user?.id || null; },
    get discordDisplayName() { return currentDiscordName; },
    get isAdmin() { return Boolean(memberInfo?.admin); },
    get isHR() { return Boolean(memberInfo?.hr); },
  };
})();
