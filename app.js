/* SDN v0.7 – server-backed archive with a single approved public portrait. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clone = obj => obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const show = value => String(value ?? '').trim() ? safe(value) : '<span class="missing-inline">Keine Daten vorhanden</span>';
  const paragraph = value => `<p class="dossier-paragraph">${show(value)}</p>`;
  const STAT_KEYS = [['combat','COMBAT'],['vigor','VIGOR'],['mobility','MOBILITY'],['charisma','CHARISMA'],['intellect','INTELLECT']];
  const ACTIVITY = {active:'AKTIV',inactive:'INAKTIV'};
  const POSITIONS = ['Superheld','Dispatcher','Teamleiter','Manager','Standortleitung','Techniker','Arzt'];
  const POSITION_CLASS = {'Superheld':'superheld','Dispatcher':'dispatcher','Teamleiter':'teamleiter','Manager':'manager','Standortleitung':'standortleitung','Standortleiter':'standortleitung','Techniker':'techniker','Arzt':'arzt'};
  const positionName = c => String(c?.role||'').trim();
  const positionClass = c => POSITION_CLASS[positionName(c)] || 'unbekannt';
  const TABS = [['identity','01 IDENTITÄT'],['attributes','02 ATTRIBUTE'],['abilities','03 FÄHIGKEITEN'],['personality','04 PERSÖNLICHKEIT'],['history','05 HISTORIE'],['relationships','06 BEZIEHUNGEN'],['missions','07 EINSÄTZE'],['file-notes','08 AKTENNOTIZ'],['secret','09 TOP SECRET']];
  const OUTCOMES = {success:'ERFOLGREICH ABGESCHLOSSEN', partial:'TEILWEISE ERFOLGREICH',failure:'NICHT ERFOLGREICH',open:'NOCH OFFEN'};
  const DAMAGE = {no:'Keine bekannten Schäden',yes:'Schäden dokumentiert',unknown:'Noch ungeklärt'};
  // Blank form template ONLY. The online site must NEVER ship character records.
  const BASE = {
    uid:'',alias:'',name:'',sdnId:'',role:'',hasSecretIdentity:'',affiliation:'S.D.N.',activityStatus:'',
    height:'',weight:'',age:'',sex:'',blood:'',birthplace:'',birthday:'',player:'',discordChannelUrl:'',
    status:'draft',classCode:'—',
    appearance:{hair:'',eyes:'',build:'',skin:'',distinguishing:'',description:'',impression:''},
    personality:{character:'',motivation:'',behavior:'',assessment:'',likes:'',dislikes:''},
    history:{background:'',criminalRecord:'',formerAffiliations:'',medicalConditions:'',medicalInjuries:'',medicalTreatments:'',medicalAllergies:'',medicalNotes:''},
    relationships:[], secret:{notes:''},
    powerName:'',origin:'',powerDescription:'',powers:[],weaknesses:'',generalWeaknesses:'',generalStrengths:'',generalAbilities:'',
    stats:{combat:0.5,vigor:0.5,mobility:0.5,charisma:0.5,intellect:0.5},photo:'',portrait:null,
    warning:'',changeLog:[],proposals:[]
  };
  const REPORTS = [];
  let characters=[],reports=[],fileNotes=[],selectedId='',activeTab='identity',view='directory',gmMode=false,hrMode=false;
  let directoryFilter='all', directoryPosition='all', directorySort='new', missionOwnership='all', missionCase='all', missionSort='new', missionSearch='';
  let directoryScroll=0, missionScroll=0;
  let editTarget=null,editNew=false,nextChar=1,nextMission=1,nextTicket=1,reportFocus=null,missionFilter='all';
  let stagedPortrait=null, portraitPreviewUrl=null;
  const backend=window.SDNBackend;
  const live=Boolean(backend?.enabled);
  const picked = () => characters.find(c=>c.uid===selectedId) || characters[0];
  const total = c => STAT_KEYS.reduce((v,[k])=>v+Number(c.stats[k]||0),0);
  const stamp = () => new Date().toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});
  const editableKeys = ['name','alias','role','hasSecretIdentity','height','weight','age','sex','birthplace','birthday','discordChannelUrl','classCode','hair','eyes','build','skin','distinguishing','description','impression','character','motivation','behavior','assessment','likes','dislikes','background','criminalRecord','formerAffiliations','medicalConditions','medicalInjuries','medicalTreatments','medicalAllergies','powerName','origin','powerDescription','weaknesses','generalWeaknesses','generalStrengths','generalAbilities'];
  const secretEditKeys = ['notes'];
  const fieldNames = {name:'Name',alias:'Alias',role:'Position',hasSecretIdentity:'Geheime Identität',height:'Größe',weight:'Gewicht',age:'Alter',sex:'Geschlecht',birthplace:'Geburtsort',birthday:'Geburtstag',discordChannelUrl:'Discord-Charakterkanal (URL)',classCode:'Fähigkeitsklasse',hair:'Haarfarbe',eyes:'Augenfarbe',build:'Statur',skin:'Teint',distinguishing:'Besondere Merkmale',description:'Beschreibung des Aussehens',impression:'Besonderheiten',character:'Persönlichkeit',motivation:'Motivation',behavior:'Sozialverhalten',assessment:'Psychologisches Gutachten',likes:'Likes',dislikes:'Dislikes',background:'Hintergrundgeschichte',criminalRecord:'Strafregister',formerAffiliations:'Ehemalige Zugehörigkeiten',medicalConditions:'Vorerkrankungen / Dauerhafte Beschwerden',medicalInjuries:'Verletzungen / Medizinische Vorfälle',medicalTreatments:'Behandlungen / Operationen',medicalAllergies:'Allergien / Medizinische Einschränkungen',powerName:'Fähigkeitsname',origin:'Ursprung',powerDescription:'Beschreibung',weaknesses:'Schwächen',generalWeaknesses:'Allgemeine Schwächen',generalStrengths:'Allgemeine Stärken',generalAbilities:'Sonstige allgemeine Fähigkeiten',notes:'TOP SECRET'};
  const sensitiveKeys = new Set(['classCode','powerName','origin','powerDescription','weaknesses','generalWeaknesses','generalStrengths','generalAbilities','powers','stats']);
  const secretKeys = new Set(['notes']);
  const valueText = v => v === null || v === '' || v === undefined ? 'Keine Daten vorhanden' : typeof v==='object' ? JSON.stringify(v,null,2) : String(v);
  const statLabel = v => v === null || v === undefined || v === '' ? 'Keine Daten vorhanden' : String(v);
  const legacySecret = c => c.secret?.notes || [c.secret?.coverName,c.secret?.coverDetails].filter(Boolean).join(' — ') || '';
  const displayEmpty = v => String(v??'').trim() ? safe(v) : '<span class="missing-inline">Keine Daten vorhanden</span>';
  const pendingCount = c => c.proposals.filter(p=>p.status==='pending').length;
  const categoryFor = key => key==='stats'?'attribute':sensitiveKeys.has(key)?'ability':'normal';
  const fieldLocation = key => key in BASE.appearance?'appearance':key in BASE.personality?'personality':key in BASE.history?'history':secretKeys.has(key)?'secret':'root';
  const fieldValue = (c,key) => {const loc=fieldLocation(key);return loc==='root'?c[key]:c[loc]?.[key];};
  const setField = (c,key,value) => {const loc=fieldLocation(key);if(loc==='root')c[key]=value;else c[loc][key]=value;};
  const logChange = (c,title,fields=[]) => {c.changeLog.unshift({title,fields,time:stamp()});};
  const currentMission = id => reports.find(r=>r.id===id);
  const approvedFor = uid => reports.filter(r=>r.status==='approved' && ((r.participants||[]).includes(uid) || r.dispatcherId===uid));
  const statusText = s => s==='approved'?'APPROVED':s==='draft'?'DRAFT':'PENDING';
  const isStaff = () => gmMode || hrMode;
  const cardApproval = (pending, approved, isOwn, rejected=false) => {
    if (gmMode) return `<span class="sdn-approval-badge ${rejected?'is-rejected':pending?'is-pending':'is-approved'}">${rejected?'ABGELEHNT':pending?'OFFEN':'FREIGEGEBEN'}</span>`;
    return pending && isOwn ? '<span class="sdn-approval-badge is-pending">OFFEN</span>' : '';
  };
  const ownCharacters = () => characters.filter(c=>c.ownerId===backend?.userId && c.status==='approved');
  const activityBadge = c => ACTIVITY[c?.activityStatus] ? `<span class="sdn-activity-tag ${safe(c.activityStatus)}">${ACTIVITY[c.activityStatus]}</span>` : '';
  const statusDescription = s => s==='approved'?'FREIGEGEBEN':s==='draft'?'ENTWURF · NICHT FREIGEGEBEN':'FREIGABE AUSSTEHEND';

  const ownerName = c => c.ownerDiscord || c.player || (c.ownerId === backend?.userId ? 'Du' : 'Discord-Spieler');
  const caseState = r => r.caseStatus === 'closed' || (!r.caseStatus && r.outcome !== 'open') ? 'closed' : 'open';
  const customerRating = r => {
    if (caseState(r)!=='closed' || r.customerStars==null || r.customerStars==='') return 0;
    const n=Number(r.customerStars);
    return Number.isInteger(n)&&n>=1&&n<=5?n:0;
  };
  const customerRatingHtml = (r, showEmpty=false) => {
    if (caseState(r)!=='closed') return '';
    const stars=customerRating(r);
    if (!stars) return showEmpty ? '<div class="sdn-customer-stars sdn-stars-unrated"><strong>KUNDENBEWERTUNG</strong><span>Keine Kundensterne vergeben</span></div>' : '';
    return `<div class="sdn-customer-stars" aria-label="Kundenbewertung: ${stars} von 5 Sternen"><span class="sdn-stars" aria-hidden="true">${'★'.repeat(stars)}<span class="sdn-stars-empty">${'☆'.repeat(5-stars)}</span></span><span class="sdn-star-count">${stars}/5 KUNDENSTERNE</span></div>`;
  };
  const reportParticipants = r => (r.participants || []).map(id=>characters.find(c=>c.uid===id)).filter(Boolean);
  const reportDispatcher = r => characters.find(c=>c.uid===r.dispatcherId && c.role==='Dispatcher');
  const hasNewRequest = c => (c.proposals || []).some(t=>t.status==='pending' && t.isNew);
  const hasChangeRequest = c => (c.proposals || []).some(t=>t.status==='pending' && !t.isNew);
  function renderDirectory(){
    const filterSelect=$('directoryFilter'), search=$('directorySearch');
    $('directoryPosition').value=directoryPosition;
    if(!filterSelect||!search)return;
    const adminFilters=[['changes','Offene Änderungen (SL)'],['applications','Neue Heldenanträge (SL)']];
    for(const [value,label] of adminFilters){
      let option=filterSelect.querySelector(`option[value="${value}"]`);
      if(gmMode&&!option){option=new Option(label,value);filterSelect.add(option);}
      if(!gmMode&&option)option.remove();
    }
    if(!gmMode&&['changes','applications'].includes(directoryFilter))directoryFilter='all';
    filterSelect.value=directoryFilter;
    const q=search.value.toLocaleLowerCase('de').trim();
    const filtered=characters.filter(c=>{
      const visible=(c.status==='approved'||gmMode||c.ownerId===backend?.userId);
      const scope=directoryFilter==='mine' ? (c.ownerId===backend?.userId) :
          directoryFilter==='changes' ? hasChangeRequest(c) :
          directoryFilter==='applications' ? hasNewRequest(c) : (c.status==='approved'||gmMode||c.ownerId===backend?.userId);
      const searchable=[c.alias,c.name,c.sdnId,c.ownerDiscord,c.ownerDiscordUsername,c.player,c.role].join(' ').toLocaleLowerCase('de');
      return visible && scope && (directoryPosition==='all'||c.role===directoryPosition) && searchable.includes(q);
    }).sort((a,b)=>{
      const byPosition=String(a.role||'').localeCompare(String(b.role||''),'de');
      if(directorySort==='position'||directorySort==='position-desc'){
        return (directorySort==='position'?byPosition:-byPosition)||String(a.alias||'').localeCompare(String(b.alias||''),'de');
      }
      const order=Number(new Date(b.createdAt||0))-Number(new Date(a.createdAt||0));
      return (directorySort==='new'?order:-order) || String(a.alias).localeCompare(String(b.alias),'de');
    });
    $('directoryCount').textContent=filtered.length+(filtered.length===1?' AKTE':' AKTEN');
    $('directoryCards').innerHTML=filtered.length?filtered.map(c=>{
      const src=c.photo?(live?backend.imageUrl(c.photo):c.photo):'';
      const applications=hasNewRequest(c), changes=hasChangeRequest(c);
      return `<button type="button" class="sdn-directory-card sdn-position-${positionClass(c)}" data-directory-open="${safe(c.uid)}"><div class="sdn-dir-photo ${src?'':'no-photo'}">${src?`<img src="${safe(src)}" alt="Portrait von ${safe(c.alias)}" loading="lazy">`:`<span>${safe((c.alias||'?')[0])}</span>`}</div><div class="sdn-dir-details"><strong>${safe(c.alias||'UNBENANNT')}</strong><span class="sdn-position-tag">${safe(c.role||'Position unbekannt')}</span><small>${safe(ownerName(c))}</small><div class="sdn-card-approval">${cardApproval(c.status!=='approved'||applications||changes,c.status==='approved',c.ownerId===backend?.userId)}${gmMode&&applications?'<span class="sdn-card-reason">NEUER ANTRAG</span>':''}${gmMode&&changes?'<span class="sdn-card-reason">ÄNDERUNG</span>':''}</div>${activityBadge(c)}</div></button>`;
    }).join(''):'<div class="sdn-directory-empty">Keine Helden mit diesen Such- und Filtereinstellungen gefunden.</div>';
    $('directoryCards').scrollTop=directoryScroll;
    $('directoryCards').querySelectorAll('[data-directory-open]').forEach(button=>button.addEventListener('click',()=>{
      directoryScroll=$('directoryCards').scrollTop;
      selectedId=button.dataset.directoryOpen;activeTab='identity';navigate('personnel');
    }));
  }
  const factRow=(label,value)=>`<div class="identity-item"><small>${safe(label)}</small><strong>${show(value)}</strong></div>`;
  function facts(c){return [ ['BÜRGERLICHER NAME',c.name],['HELDENALIAS',c.alias],['POSITION',c.role],['ORGANISATION',c.affiliation],['ALTER (LAUT AKTE)',c.age],['GRÖSSE',c.height],['GEWICHT',c.weight],['GEHEIME IDENTITÄT',c.hasSecretIdentity==='yes'?'Ja':c.hasSecretIdentity==='no'?'Nein':''],['GEBURTSORT',c.birthplace],['GEBURTSDATUM',c.birthday],['GESCHLECHT',({male:'Männlich',female:'Weiblich',diverse:'Divers'})[c.sex]||c.sex],['SPIELER (DISCORD)',ownerName(c)] ].map(([l,v])=>factRow(l,v)).join('');}
  function radar(c){
    const cx=190,cy=160,radius=113;
    const pt=(i,value)=>{const a=-Math.PI/2+2*Math.PI*i/5;const r=radius*Number(value||0)/10;return [(cx+r*Math.cos(a)).toFixed(1),(cy+r*Math.sin(a)).toFixed(1)];};
    const polygon=(values)=>values.map((v,i)=>pt(i,v).join(',')).join(' ');
    let grid='';for(let level=2;level<=10;level+=2)grid+=`<polygon points="${polygon([level,level,level,level,level])}" fill="none" stroke="#a8b8aa" stroke-width=".85" opacity=".55"/>`;
    let axes='';for(let i=0;i<5;i++){const [x,y]=pt(i,10);axes+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#b7c0af" stroke-width=".8"/>`;}
    const values=STAT_KEYS.map(([k])=>Number(c.stats[k]||0));
    const ticks=values.map((v,i)=>{const [x,y]=pt(i,v);return `<circle cx="${x}" cy="${y}" r="4.5" fill="#ff9241" stroke="#253932" stroke-width="1.5"/>`}).join('');
    const labels=STAT_KEYS.map(([key,label],i)=>{const a=-Math.PI/2+2*Math.PI*i/5;const x=cx+Math.cos(a)*150,y=cy+Math.sin(a)*136;return `<text x="${x.toFixed(1)}" y="${(y+4).toFixed(1)}" fill="#263b34" text-anchor="middle" font-size="11" font-family="monospace" font-weight="800">${label}</text><text x="${x.toFixed(1)}" y="${(y+17).toFixed(1)}" fill="#aa6937" text-anchor="middle" font-size="10" font-family="monospace" font-weight="800">${safe(statLabel(c.stats[key]))}${c.stats[key] == null?'':'/10'}</text>`}).join('');
    return `<div class="radar-wrap"><svg class="radar-svg" viewBox="0 0 380 337" role="img" aria-label="Radar-Diagramm: ${STAT_KEYS.map(([k,n])=>`${n} ${c.stats[k]} von 10`).join(', ')}"><polygon points="${polygon([10,10,10,10,10])}" fill="#e0e8d8" fill-opacity=".6"/>${grid}${axes}<polygon points="${polygon(values)}" fill="#d9813e" fill-opacity=".26" stroke="#db7530" stroke-width="3" stroke-linejoin="round"/>${ticks}${labels}</svg></div>`;
  }
  function statBars(c){return `<div class="stat-box"><div class="stat-box-header">ATTRIBUTE EVALUATION <span>${total(c)} / 27 PTS</span></div>${STAT_KEYS.map(([k,n])=>`<div class="stat-row"><span>${n}</span><div><b style="width:${Number(c.stats[k]||0)*10}%"></b></div><strong>${safe(statLabel(c.stats[k]))}${c.stats[k] == null?'':'/10'}</strong></div>`).join('')}<div class="stat-foot">WERTE VON 0,5 BIS 10 · 0,5ER-SCHRITTE · MAXIMAL 27 PUNKTE<br>Bei Erstanträgen maximal 15 Punkte und 6 pro Attribut.</div></div>`;}
  function recordPair(label,value){return `<div class="small-record"><small>${safe(label)}</small><strong>${show(value)}</strong></div>`;}
  function subsection(label,value){return `<div class="dossier-section"><div class="tab-heading">${safe(label)}</div>${paragraph(value)}</div>`;}
  function missionCard(r,compact=false){
    const heroes=reportParticipants(r);
    const closed=caseState(r)==='closed';
    const badge=cardApproval(r.status==='pending',r.status==='approved',r.submittedByMe,r.status==='rejected');
    const dispatcher=reportDispatcher(r);
    return `<button type="button" class="mission-card sdn-case-card sdn-case-clickable" data-open-report="${safe(r.id)}" aria-label="Einsatzprotokoll ${safe(r.title)} öffnen"><div class="sdn-case-stamp ${closed?'is-closed':'is-open'}">${closed?'ABGESCHLOSSEN':'FALL OFFEN'}</div><h3>${safe(r.title)}</h3><div class="mission-card-meta">${safe(r.date||r.startDate)} · ${safe(r.location||'Ohne Ortsangabe')}</div>${r.customer?`<p class="sdn-case-extra">KUNDE: ${safe(r.customer)}</p>`:''}<p class="sdn-case-heroes">${heroes.length?heroes.map(c=>safe(c.alias)).join(' · '):'Keine zugewiesenen Akten'}</p>${dispatcher?`<p class="sdn-case-dispatcher">DISPATCHER: ${safe(dispatcher.alias)}</p>`:''}${customerRatingHtml(r)}<div class="sdn-card-approval">${badge}</div></button>`;
  }
  function tabContent(c){
    switch(activeTab){
      case 'identity':return `<div class="tab-heading">ERSCHEINUNGSBILD / VISUAL IDENTIFICATION</div><div class="appearance-facts">${[['HAARFARBE',c.appearance.hair],['AUGENFARBE',c.appearance.eyes],['STATUR',c.appearance.build],['HAUT / TEINT',c.appearance.skin],['BESONDERE MERKMALE',c.appearance.distinguishing],['GRÖSSE',c.height]].map(([k,v])=>recordPair(k,v)).join('')}</div>${subsection('AUSSEHEN / BESCHREIBUNG',c.appearance.description)}${subsection('BESONDERHEITEN',c.appearance.impression)}`;
      case 'attributes':return `<div class="tab-heading">ATTRIBUTE / PERFORMANCE PROFILE</div><div class="radar-layout">${radar(c)}<div><div class="score-large">${total(c)} <small>/ 27 PUNKTE</small></div><p class="subtle-paragraph">Radarprofil der fünf Dispatch-Attribute. Attribute steigen in 0,5er-Schritten von 0,5 bis 10. Bei Änderungen gelten maximal 27 Gesamtpunkte.</p>${statBars(c)}${c.proposals.some(p=>p.status==='pending')?'<p class="pending-hint">Änderungsantrag offen: neue Werte erscheinen erst nach Freigabe.</p>':''}</div></div>`;
      case 'abilities':return `<div class="tab-heading">FÄHIGKEITSAKTE / POWER ASSESSMENT</div><div class="abilities-head">${[['FÄHIGKEIT',c.powerName],['URSPRUNG',c.origin],['KLASSIFIZIERUNG','KLASSE '+c.classCode]].map(([k,v])=>recordPair(k,v)).join('')}</div>${subsection('BESCHREIBUNG',c.powerDescription)}<div class="tab-heading">MOVES / ANGRIFFE / UNTERFÄHIGKEITEN</div>${c.powers.length?`<div class="power-summary">${c.powers.map(p=>`<div class="power-card"><b>${safe(p.title)}</b><p>${safe(p.text)}</p></div>`).join('')}</div>`:'<div class="missing-field">Noch keine Einzelfähigkeiten eingetragen.</div>'}<div class="tab-heading spaced-heading">SCHWÄCHEN / EINSCHRÄNKUNGEN</div><div class="weakness-block">${show(c.weaknesses)}</div>${subsection('ALLGEMEINE SCHWÄCHEN',c.generalWeaknesses)}${subsection('ALLGEMEINE STÄRKEN',c.generalStrengths)}${subsection('SONSTIGE ALLGEMEINE FÄHIGKEITEN',c.generalAbilities)}`;
      case 'personality':return `${subsection('PERSÖNLICHKEIT / CHARAKTER',c.personality.character)}${subsection('MOTIVATION / ZIELE',c.personality.motivation)}${subsection('VERHALTEN / SOZIALPROFIL',c.personality.behavior)}${subsection('PSYCHOLOGISCHE EINSCHÄTZUNG',c.personality.assessment)}${subsection('LIKES',c.personality.likes)}${subsection('DISLIKES',c.personality.dislikes)}<div class="source-note">Diese Felder wurden bewusst nicht aus der widersprüchlichen Excel-Charakterakte übernommen.</div>`;
      case 'history':return `${subsection('BIOGRAFIE / HINTERGRUNDGESCHICHTE',c.history.background)}${subsection('STRAFREGISTER / RECHTLICHE VORFÄLLE',c.history.criminalRecord)}${subsection('FRÜHERE ZUGEHÖRIGKEITEN',c.history.formerAffiliations)}<div class="medical-file"><div class="medical-file-head"><span>✚ MEDICAL RECORD</span><small>TEIL DER PERSONALHISTORIE</small></div><div class="appearance-facts">${recordPair('VORERKRANKUNGEN',c.history.medicalConditions)}${recordPair('ALLERGIEN / EINSCHRÄNKUNGEN',c.history.medicalAllergies)}</div>${subsection('VERLETZUNGEN / MEDIZINISCHE VORFÄLLE',c.history.medicalInjuries)}${subsection('BEHANDLUNGEN / OPERATIONEN',c.history.medicalTreatments)}</div><div class="source-note">Die Krankenakte beschreibt ausschließlich die fiktive Spielfigur. Zugangsbeschränkungen lassen sich später pro Aktenbereich festlegen.</div>`;
      case 'relationships':{
        if(c.status!=='approved')return '<div class="missing-field">Bekanntschaften können erst nach der Freigabe der Personalakte eingetragen werden.</div>';
        const linked=(c.relationships||[]).map(rel=>({rel,target:characters.find(ch=>ch.uid===rel.targetId)})).filter(item=>item.target);
        return `<div class="tab-heading heading-with-action"><span>BEKANNTSCHAFTEN / ${linked.length} EINTRÄGE</span><button type="button" class="paper-quick-action" data-add-related title="Neue Bekanntschaft beantragen">＋ BEKANNTSCHAFT</button></div><p class="subtle-paragraph">Eine Bekanntschaft besteht aus einer verlinkten Personalakte, der Beziehungsart und einer frei formulierten Beschreibung. Ergänzungen und Änderungen werden als Tickets eingereicht.</p><div class="relationship-grid">${linked.length?linked.map(({rel,target})=>`<article class="relationship-card"><div class="relationship-card-top"><div class="relationship-portrait ${target.photo?'':'placeholder'}">${target.photo?`<img src="${safe(live ? backend.imageUrl(target.photo) : target.photo)}" alt="Portrait von ${safe(target.alias)}" loading="lazy"/>`:`<span>${safe((target.alias||'?').charAt(0))}</span>`}</div><div class="relationship-card-ident"><small>PERSONALVERWEIS / #${safe(target.sdnId)}</small><h3>${safe(target.alias)}</h3><span>${safe(rel.type||'NICHT KLASSIFIZIERT')}</span></div></div><p>${show(rel.description)}</p><div class="relationship-actions"><button type="button" class="mini-action" data-open-related="${safe(target.uid)}">PERSONALAKTE ↗</button><button type="button" class="paper-icon-action" data-edit-related="${safe(target.uid)}" title="Bekanntschaft bearbeiten" aria-label="Bekanntschaft mit ${safe(target.alias)} bearbeiten">✎</button></div></article>`).join(''):'<div class="missing-field">Noch keine Bekanntschaften vermerkt. Über das Plus kann eine Verknüpfung zu einem anderen Charakter eingereicht werden.</div>'}</div><div class="source-note">Jede Verknüpfung verwendet die interne Charakter-ID und bleibt bei einer Aliasänderung erhalten. Es können mehrere Anträge parallel offen sein.</div>`;
      }

        case 'missions':{const missions=approvedFor(c.uid);return `<div class="tab-heading">FREIGEGEBENE EINSATZAKTEN / ${missions.length} TREFFER</div><p class="subtle-paragraph">Nur von der Spielleitung freigegebene Berichte, in denen dieser Charakter als Teilnehmer aufgeführt ist, werden hier verknüpft.</p><div class="mission-cards embedded">${missions.length?missions.map(r=>missionCard(r,true)).join(''):'<div class="missing-field">Für diese Person liegen derzeit keine freigegebenen Einsatzberichte vor.</div>'}</div><button class="mini-action under-missions" type="button" id="allMissions">ALLE EINSÄTZE ANSEHEN ↗</button>`;}
      case 'file-notes':{
        const list=fileNotes.filter(n=>n.characterId===c.uid);
        const options=ownCharacters().map(author=>`<option value="${safe(author.uid)}">${safe(author.alias)} · ${safe(author.sdnId)}</option>`).join('');
        const input=isStaff() ? `<form class="sdn-note-form" id="fileNoteForm"><label>EIGENER CHARAKTER<select name="authorCharacter" required><option value="">CHARAKTER AUSWÄHLEN</option>${options}</select></label><label>AKTENNOTIZ<textarea name="body" maxlength="5000" required rows="5" placeholder="Notiz zur Personalakte …"></textarea></label><p id="fileNoteError" class="form-error" role="alert"></p><button class="paper-quick-action" type="submit" ${options?'':'disabled'}>＋ AKTENNOTIZ ANHÄNGEN</button>${options?'':'<p class="source-note">Du benötigst einen eigenen freigegebenen Charakter, um eine Aktennotiz zu verfassen.</p>'}</form>`:'';
        return `<div class="tab-heading">AKTENNOTIZEN / ${list.length} EINTRÄGE</div><div class="sdn-file-notes">${list.length?list.map(n=>`<article class="sdn-file-note"><p class="sdn-file-note-body">${safe(n.body)}</p><footer><strong>${safe(n.authorAlias)}</strong><time datetime="${safe(n.createdAt)}">${safe(new Date(n.createdAt).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}))}</time></footer></article>`).join(''):'<div class="missing-field">Noch keine Aktennotizen vorhanden.</div>'}</div>${input}`;
      }
      case 'secret':return gmMode?`<div class="secret-heading">▣ TOP SECRET / AUTHORIZED PERSONNEL ONLY</div><div class="secret-paper">${subsection('GEHEIME INFORMATIONEN',legacySecret(c))}</div>`:'<div class="locked-sheet"><h3>TOP SECRET</h3><p>Nur die Spielleitung hat Zugriff auf diese Informationen.</p></div>';
      case 'audit':return `<div class="tab-heading">ÄNDERUNGSVERLAUF / TICKET CENTER</div><p class="subtle-paragraph">Du kannst mehrere Tickets parallel einreichen. Jeder Antrag zeigt die geänderten Felder im Vorher-nachher-Vergleich. Erst nach Freigabe wird die Akte aktualisiert; überschneidende Anträge werden auf Konflikte geprüft.</p>${c.proposals.length?`<div class="tab-heading">EINGEREICHTE TICKETS / ${c.proposals.length}</div>${c.proposals.map(p=>`<article class="ticket-card"><div class="ticket-top"><div><span class="ticket-id">${safe(p.id)}</span><h3>${safe(p.title)}</h3><small>${safe(p.time)} · ${safe(p.requestedBy||'Demo-Spieler')}</small></div><span class="report-status ${p.status==='pending'?'pending':p.status==='approved'?'approved':'rejected'}">${p.status==='pending'?'IN PRÜFUNG':p.status==='approved'?'GENEHMIGT':'ABGELEHNT'}</span></div>${p.priority?'<div class="priority-label">⚠ WICHTIG FÜR DIE SPIELLEITUNG · ATTRIBUTE / FÄHIGKEITEN BETROFFEN</div>':''}${p.portraitPreview&&live&&backend.proposalImageUrl(p.portraitPreview)?`<div class="ticket-portrait-compare"><span>BEANTRAGTES PORTRAIT / VORSCHAU</span><img src="${safe(backend.proposalImageUrl(p.portraitPreview))}" alt="Zur Prüfung eingereichtes Portrait" loading="lazy"/></div>`:''}<div class="ticket-comment"><span>BEGRÜNDUNG / ANMERKUNG</span><p>${safe(p.comment||'Keine Anmerkung hinzugefügt.')}</p></div><div class="ticket-difflist">${(p.changes||[]).map(d=>`<div class="ticket-diff ${d.category==='normal'?'':'ticket-sensitive'}"><div class="ticket-diff-label">${d.category==='attribute'?'⚠ ATTRIBUTE · ':d.category==='ability'?'⚠ FÄHIGKEITEN · ':''}${safe(d.label)}</div><div class="ticket-beforeafter"><div><small>VORHER</small><pre>${safe(d.before||'—')}</pre></div><div><small>BEANTRAGT</small><pre>${safe(d.after||'—')}</pre></div></div></div>`).join('')||'<p>Keine Felder aufgelistet.</p>'}</div>${p.status==='pending'&&ticketConflicts(c,p).length?`<div class="ticket-conflict"><strong>⚠ KONFLIKT MIT EINER BEREITS FREIGEGEBENEN ÄNDERUNG</strong><p>${ticketConflicts(c,p).map(safe).join(' · ')}</p><small>Die betroffenen Änderungen bitte erneut auf dem neuesten Aktenstand einreichen. Die bestehende Akte wird nicht überschrieben.</small></div>`:''}${gmMode&&p.status==='pending'?`<div class="ticket-review"><strong>ENTSCHEIDUNG DER SPIELLEITUNG</strong><div class="action-pair"><button data-review-change="${safe(p.id)}:approve" type="button" ${ticketConflicts(c,p).length?'disabled title="Konflikt – nicht automatisch genehmigbar"':''}>✓ GESAMTES TICKET GENEHMIGEN</button><button data-review-change="${safe(p.id)}:reject" type="button">× ABLEHNEN</button></div></div>`:''}</article>`).join('')}`:'<div class="missing-field">Noch keine Änderungsanträge vorhanden.</div>'}<div class="tab-heading spaced-heading">AKTENEREIGNISSE</div>${c.changeLog.length?c.changeLog.map(entry=>`<div class="audit-entry"><b>${safe(entry.title)}</b><p>${entry.fields.map(f=>safe(f)).join(', ')||'Statusaktualisierung'}</p><small>${safe(entry.time)}</small></div>`).join(''):'<div class="missing-field">Für diesen Charakter liegen noch keine Teständerungen vor.</div>'}<div class="source-note">Alle Online-Tickets und Freigaben werden protokolliert. Konfliktprüfungen laufen auch serverseitig.</div>`;

        default:return '';
    }
  }
  function renderRecord(){
    const c=picked();if(!c){$('recordBody').innerHTML='<div class="detail-empty"><h3>NO RECORD SELECTED</h3><p>Es sind noch keine Personalakten freigegeben. Du kannst eine neue Akte zur Prüfung einreichen.</p></div>'; $('editButton').hidden=true; $('approveButton').hidden=true; $('activityButton').hidden=true; $('deleteCharacterButton').hidden=true; $('fileCrumb').textContent='—';return;}
    $('editButton').hidden=live&&!gmMode&&c.ownerId!==backend.userId;
    $('fileCrumb').textContent=c.sdnId;
    $('auditButton').innerHTML=`ÄNDERUNGEN ${pendingCount(c)?`<b class="pending-counter">${pendingCount(c)}</b>`:''} <span>↗</span>`;
    $('approveButton').hidden=!gmMode||live&&c.status==='draft';
    $('activityButton').hidden=c.status!=='approved'||(live&&!gmMode&&c.ownerId!==backend.userId);
    $('activityButton').textContent=c.activityStatus ? `STATUS: ${ACTIVITY[c.activityStatus]} ✎` : 'AKTIVITÄT SETZEN';
    $('deleteCharacterButton').hidden=!gmMode;
    $('approveButton').textContent=c.status==='approved'?'FREIGABE ZURÜCKZIEHEN':'AKTE FREIGEBEN ✓';
    const tabs=[...TABS.filter(([id])=>id!=='secret'||(gmMode&&(!live||c._canReadSecret))),...(activeTab==='audit'?[['audit','11 ÄNDERUNGEN']]:[])];
    if(activeTab==='secret'&&!gmMode)activeTab='identity';
    $('recordBody').innerHTML=`<article class="paper-frame"><div class="paper-mast"><div><div class="paper-wordmark">S<span>D</span>N<span>.</span></div><small>SUPERHERO DISPATCH NETWORK</small></div><div class="paper-serial">FILE NO. <b>${safe(c.sdnId)}</b><br>REF / <b>PERSONNEL</b><br>STATUS / <b>${statusText(c.status)}</b></div></div><div class="file-main"><div class="file-titleline"><div><div class="eyebrow">PERSONNEL DOSSIER / CLASSIFIED</div><h2>${safe(c.alias)}</h2><p class="file-subtitle">${show(c.name)} <span style="padding:0 8px">·</span> ${show(c.role)}</p><div class="sdn-file-activity">${activityBadge(c)}</div></div><div class="classification approval-stamp ${safe(c.status)}">${statusText(c.status)}<small>${c.status==='approved'?'SDN · VERIFIZIERT':c.status==='draft'?'NICHT FREIGEGEBEN':'REVIEW REQUIRED'}</small></div></div><div class="identity-grid"><div class="portrait-container ${c.photo?'':'placeholder'}">${c.photo?`<img src="${safe(live ? backend.imageUrl(c.photo) : c.photo)}" alt="Portrait ${safe(c.alias)}"/>`:`<span>${safe((c.alias||'?')[0])}</span>`}<div class="portrait-label"><span>ID ${safe(c.sdnId)}</span><span>01 / 01</span></div></div><div class="identity-fields">${facts(c)}${/^https:\/\/discord\.com\/channels\/\d+\/\d+$/.test(c.discordChannelUrl||'')?`<a class="record-discord-link" href="${safe(c.discordChannelUrl)}" target="_blank" rel="noopener noreferrer">↗ DISCORD-CHARAKTERKANAL ÖFFNEN</a>`:''}</div></div><div class="tape"></div></div>${gmMode && live && c.portrait?.preview && c.portrait.preview!==c.portrait.publishedPreview ? (()=>{const ticket=c.proposals.find(t=>t.status==='approved' && (t.isNew||t.operations.some(op=>op.kind==='portrait' && op.after?.preview===c.portrait.preview)));return ticket?`<div class="sdn-publish-warning portrait-publication">Das neue Portrait wurde genehmigt, aber noch nicht auf GitHub Pages veröffentlicht. Das bisherige bleibt aktiv. <button type="button" data-publish-portrait="${safe(ticket._dbId)}">VERÖFFENTLICHUNG ERNEUT VERSUCHEN</button></div>`:'';})():''}<nav class="paper-tabs" aria-label="Abschnitte der Personalakte" role="tablist">${tabs.map(([id,label])=>`<button class="paper-tab ${activeTab===id?'active':''} ${id==='secret'?'secret-tab':''}" type="button" role="tab" data-tab="${id}" aria-selected="${activeTab===id}">${label}</button>`).join('')}</nav><section class="tab-content" role="tabpanel">${tabContent(c)}</section><div class="file-bottom"><span>SDN RECORDS OFFICE // ${safe(c.sdnId)}</span><span>FAN CONCEPT — UNOFFICIAL</span><b>FILE / ${safe(activeTab).toUpperCase()}</b></div></article>`;
    document.querySelectorAll('[data-publish-portrait]').forEach(button=>button.addEventListener('click',async()=>{
      try{button.disabled=true;await backend.publishPortrait(button.dataset.publishPortrait);await reloadRemote();}
      catch(e){button.disabled=false;alert('GitHub-Veröffentlichung fehlgeschlagen: '+e.message);}
    }));
    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.tab;renderRecord();}));
    $('fileNoteForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      if(!isStaff())return;
      const form=e.currentTarget, authorId=form.elements.authorCharacter.value, body=form.elements.body.value.trim();
      const error=$('fileNoteError'); error.textContent='';
      if(!ownCharacters().some(ch=>ch.uid===authorId)){error.textContent='Bitte einen eigenen freigegebenen Charakter auswählen.';return;}
      if(!body||body.length>5000){error.textContent='Bitte eine Notiz mit maximal 5.000 Zeichen eingeben.';return;}
      const button=form.querySelector('button[type="submit"]'); button.disabled=true;
      try{
        if(live){await backend.addFileNote(c.uid,authorId,body);await reloadRemote();}
        else{
          const author=characters.find(ch=>ch.uid===authorId);
          fileNotes.unshift({id:'local-'+Date.now(),characterId:c.uid,authorId,authorAlias:author.alias,body,createdAt:new Date().toISOString()});
          renderRecord();
        }
      }catch(ex){button.disabled=false;error.textContent='Notiz nicht gespeichert: '+ex.message;}
    });
    $('allMissions')?.addEventListener('click',()=>navigate('missions'));
    attachOpenReport($('recordBody'));
    document.querySelectorAll('[data-open-related]').forEach(b=>b.addEventListener('click',()=>{
      const target=characters.find(ch=>ch.uid===b.dataset.openRelated);if(!target)return;
      selectedId=target.uid;activeTab='identity';renderAll();
      if(matchMedia('(max-width:860px)').matches)$('recordPanel').scrollIntoView({behavior:'smooth'});
    }));
    document.querySelectorAll('[data-remove-img]').forEach(b=>b.addEventListener('click',()=>openEdit(false,'10 / BILDER')));
    document.querySelector('[data-add-related]')?.addEventListener('click',()=>openEdit(false,'07 / BEZIEHUNGEN',{addRelation:true}));
    document.querySelectorAll('[data-edit-related]').forEach(b=>b.addEventListener('click',()=>openEdit(false,'07 / BEZIEHUNGEN',{targetId:b.dataset.editRelated})));
    document.querySelectorAll('[data-review-change]').forEach(b=>b.addEventListener('click',async ()=>{
      if(!gmMode)return;const [id,decision]=b.dataset.reviewChange.split(':');const p=c.proposals.find(x=>x.id===id);if(!p||p.status!=='pending')return;
      if(live){
        try {const result=await backend.reviewTicket(p._dbId,decision==='approve');await reloadRemote();if(result?.warning)alert(result.warning);}
        catch(err){alert('Ticket konnte nicht bearbeitet werden: '+err.message);}
        return;
      }
      if(decision==='approve'){
        const problems=ticketConflicts(c,p);
        if(problems.length){renderAll();return;}
        applyOperations(c,p.operations);
        p.status='approved';if(p.isNew)c.status='approved';
        logChange(c,'ÄNDERUNGSTICKET GENEHMIGT',[p.id,...p.changes.map(x=>x.label)]);
      }else{
        p.status='rejected';if(p.isNew)c.status='draft';
        logChange(c,'ÄNDERUNGSTICKET ABGELEHNT',[p.id,...p.changes.map(x=>x.label)]);
      }renderAll();
    }));
  }
  function attachOpenReport(root){root.querySelectorAll('[data-open-report]').forEach(b=>b.addEventListener('click',()=>{
    const archive=$('missionCards');if(view==='missions'&&archive)missionScroll=archive.scrollTop;
    reportFocus=b.dataset.openReport;navigate('mission-detail');
  }));}
  function renderMissions(){
    const root=$('missionsView');
    // In the detail state the archive is not mounted at all. Reviews happen here only.
    if(view==='mission-detail'){
      const report=reportFocus&&currentMission(reportFocus);
      root.innerHTML=`<div class="sdn-detail-topbar"><button type="button" class="sdn-return-button" id="backMissions">← ZUR EINSATZÜBERSICHT</button><span>EINSATZAKTE / ${safe(report?.id||'—')}</span></div><div class="mission-detail">${report?reportDetail(report):'<div class="detail-empty"><h3>EINSATZAKTE NICHT GEFUNDEN</h3><p>Bitte zurück zum Einsatzarchiv wechseln.</p></div>'}</div>`;
      $('backMissions').addEventListener('click',()=>{reportFocus=null;navigate('missions');});
    } else {
      if(!gmMode&&missionOwnership==='pending')missionOwnership='all';
      const q=missionSearch.toLocaleLowerCase('de').trim();
      const visible=reports.filter(r=>{
        const heroes=reportParticipants(r);
        const dispatcher=reportDispatcher(r);
        const mine=r.submittedByMe||heroes.some(c=>c.ownerId===backend?.userId)||dispatcher?.ownerId===backend?.userId;
        const scope=missionOwnership==='mine'?mine:missionOwnership==='pending'?gmMode&&r.status==='pending':true;
        const state=missionCase==='all'||caseState(r)===missionCase;
        const searchText=[r.title,r.id,r.customer,r.location,r.submitted,...heroes.flatMap(c=>[c.alias,c.name,c.ownerDiscord,c.ownerDiscordUsername]),...(dispatcher?[dispatcher.alias,dispatcher.name,dispatcher.ownerDiscord,dispatcher.ownerDiscordUsername]:[])].join(' ').toLocaleLowerCase('de');
        return scope&&state&&searchText.includes(q);
      }).sort((a,b)=>{
        const order=Number(new Date(b.createdAt||b.date||0))-Number(new Date(a.createdAt||a.date||0));
        return (missionSort==='new'?order:-order)||String(a.id).localeCompare(String(b.id));
      });
      const missionOptions=[['all','Alle Einsätze'],['mine','Meine Einsätze'],...(gmMode?[['pending','Offene Berichtsfreigaben (SL)']]:[])];
      root.innerHTML=`<div class="mission-dashboard"><div class="sdn-directory-filters sdn-report-filters"><label class="sdn-search-label">SUCHE<input type="search" id="missionSearch" placeholder="Einsatz, Kunde, Held, Discord ..." value="${safe(missionSearch)}" autocomplete="off"></label><label>ANZEIGE<select id="missionOwnership">${missionOptions.map(([v,l])=>`<option value="${v}" ${missionOwnership===v?'selected':''}>${l}</option>`).join('')}</select></label><label>FALLSTATUS<select id="missionCase"><option value="all" ${missionCase==='all'?'selected':''}>Alle Fälle</option><option value="open" ${missionCase==='open'?'selected':''}>Offen</option><option value="closed" ${missionCase==='closed'?'selected':''}>Abgeschlossen</option></select></label><label>SORTIEREN<select id="missionSort"><option value="new" ${missionSort==='new'?'selected':''}>Neueste zuerst</option><option value="old" ${missionSort==='old'?'selected':''}>Älteste zuerst</option></select></label></div><div class="sdn-directory-results"><span>${visible.length} EINSATZAKTEN</span><button class="operation-add" type="button" id="newMission">＋ EINSATZPROTOKOLL ERSTELLEN</button></div><div class="missions-catalog" id="missionCards" tabindex="0" aria-label="Scrollbares Einsatzarchiv">${visible.length?visible.map(r=>missionCard(r)).join(''):'<div class="mission-empty">Keine Einsatzberichte mit diesen Filtern.</div>'}</div></div>`;
      $('newMission').addEventListener('click',openMissionDialog);
      $('missionSearch').addEventListener('input',e=>{missionSearch=e.target.value;missionScroll=0;const caret=e.target.selectionStart;renderMissions();const next=$('missionSearch');next.focus();next.setSelectionRange(caret,caret);});
      $('missionOwnership').addEventListener('change',e=>{missionOwnership=e.target.value;missionScroll=0;renderMissions();});
      $('missionCase').addEventListener('change',e=>{missionCase=e.target.value;missionScroll=0;renderMissions();});
      $('missionSort').addEventListener('change',e=>{missionSort=e.target.value;missionScroll=0;renderMissions();});
      $('missionCards').scrollTop=missionScroll;
      attachOpenReport(root);
    }
    // These controls are only present in the report detail view.
    root.querySelectorAll('[data-delete-report]').forEach(b=>b.addEventListener('click',async ()=>{
      if(!gmMode || view!=='mission-detail')return;
      const r=currentMission(b.dataset.deleteReport);
      if(!r)return;
      if(!confirm(`Einsatzprotokoll „${r.title}“ (${r.id}) WIRKLICH ENDGÜLTIG LÖSCHEN?\n\nDie Verknüpfungen in allen Personalakten verschwinden. Dieser Vorgang kann nicht rückgängig gemacht werden.`))return;
      if(live){try{b.disabled=true;await backend.deleteReport(r._dbId);reportFocus=null;await reloadRemote();navigate('missions');}catch(err){b.disabled=false;alert('Einsatzprotokoll konnte nicht gelöscht werden: '+err.message);}return;}
      reports=reports.filter(x=>x.id!==r.id);reportFocus=null;navigate('missions');
    }));
    root.querySelectorAll('[data-review-report]').forEach(b=>b.addEventListener('click',async ()=>{
      if(!gmMode||view!=='mission-detail')return;
      const [id,decision]=b.dataset.reviewReport.split(':');const r=currentMission(id);
      if(!r||r.status!=='pending')return;
      if(live){try{await backend.reviewReport(r._dbId,decision==='approve');await reloadRemote();}catch(err){alert(err.message);}return;}
      r.status=decision==='approve'?'approved':'rejected';r.reviewed='Demo-Spielleitung · '+stamp();renderMissions();
    }));
    root.querySelectorAll('[data-open-character]').forEach(b=>b.addEventListener('click',()=>{selectedId=b.dataset.openCharacter;activeTab='missions';navigate('personnel');}));
  }
  function reportDetail(r){
    const participants=(r.participants||[]).map(id=>characters.find(c=>c.uid===id)).filter(Boolean);
    const dispatcher=reportDispatcher(r);
    return `<article class="report-paper"><div class="report-paper-bar"><span>SUPERHERO DISPATCH NETWORK // OPERATIONS</span><b>${safe(r.id)}</b></div><div class="report-paper-inner"><div class="report-main-heading"><div><span class="eyebrow">EINSATZBERICHT / FIELD REPORT</span><h2>${safe(r.title)}</h2></div><div class="sdn-report-detail-stamps"><div class="classification approval-stamp ${r.status==='approved'?'approved':'pending'}">${r.status==='approved'?'APPROVED':r.status==='pending'?'PENDING':'REJECTED'}<small>${r.status==='approved'?'SDN · VERIFIZIERT':r.status==='pending'?'REVIEW REQUIRED':'NICHT FREIGEGEBEN'}</small></div><div class="sdn-case-stamp ${caseState(r)==='closed'?'is-closed':'is-open'}">${caseState(r)==='closed'?'ABGESCHLOSSEN':'FALL OFFEN'}</div></div></div><div class="report-meta-grid">${[['AKTENNUMMER',r.id],['EINSATZBEGINN',r.startDate||r.date],['EINSATZENDE',r.endDate||'Keine Daten vorhanden'],['EINSATZORT',r.location||'Unbekannt'],['ERGEBNIS',OUTCOMES[r.outcome]],['KUNDE',r.customer||'Keine Daten vorhanden']].map(([l,v])=>recordPair(l,v)).join('')}</div><div class="tab-heading spaced-heading">EINGESETZTES PERSONAL</div><div class="person-pills">${participants.map(c=>`<button class="person-pill" data-open-character="${safe(c.uid)}" type="button">${safe(c.alias)} <span>SDN #${safe(c.sdnId)} ↗</span></button>`).join('')}</div><div class="report-dispatcher-section"><div class="tab-heading">DISPATCHER</div>${dispatcher?`<button class="person-pill" data-open-character="${safe(dispatcher.uid)}" type="button">${safe(dispatcher.alias)} <span>SDN #${safe(dispatcher.sdnId)} ↗</span></button>`:'<p class="report-no-dispatcher">Nicht zugewiesen</p>'}</div>${subsection('01 / AUSGANGSLAGE',r.situation)}${subsection('02 / EINSATZVERLAUF',r.events)}<div class="tab-heading">03 / ZIVILE INFRASTRUKTUR</div><p class="report-emphasis">${safe(DAMAGE[r.damageStatus]||'Unbekannt')}</p>${r.damageStatus==='yes'?subsection('SCHADENSBERICHT',r.damages):''}${subsection('04 / ZUSATZVERMERKE',r.notes)}${customerRatingHtml(r,true)}${caseState(r)==='closed'?subsection('KUNDENKOMMENTAR',r.customerComment):''}${r.rpLink&&/^https:\/\/(?:discord\.com|discordapp\.com)\/channels\/\d+\/\d+\/\d+$/.test(r.rpLink)?`<a class="report-rp-link" href="${safe(r.rpLink)}" target="_blank" rel="noopener noreferrer">↗ ZUM DISCORD-RP</a>`:''}${r.requestComment?subsection('ANMERKUNG ZUM ANTRAG',r.requestComment):''}<div class="report-conclusion">ABSCHLUSSVERMERK <strong>${safe(OUTCOMES[r.outcome]||'UNBEKANNT')}</strong></div><div class="report-signatures"><span>EINGEREICHT VON<br><strong>${safe(r.submitted)}</strong></span><span>FREIGABE<br><strong>${r.status==='approved'?safe(r.reviewed||'Spielleitung'):'NOCH NICHT FREIGEGEBEN'}</strong></span></div>${gmMode?`<div class="sdn-danger-zone"><button type="button" class="sdn-danger-button" data-delete-report="${safe(r.id)}">EINSATZPROTOKOLL LÖSCHEN</button></div>`:''}${gmMode&&r.status==='pending'?`<div class="review-box"><strong>SPIELLEITUNG / FREIGABE</strong><p>Die Verknüpfung zur Personalakte wird erst bei Freigabe sichtbar.</p><div class="action-pair"><button data-review-report="${safe(r.id)}:approve" type="button">✓ BERICHT FREIGEBEN</button><button data-review-report="${safe(r.id)}:reject" type="button">× ABLEHNEN</button></div></div>`:''}<div class="source-note">Einsatzberichte werden nach Freigabe mit den beteiligten Akten verknüpft.</div></div></article>`;
  }
  function navigate(to){
    view=to;
    const directory=to==='directory', personnel=to==='personnel', mission=to==='missions', report=to==='mission-detail';
    $('heroDirectory').hidden=!directory;
    $('personnelView').hidden=!personnel;
    $('missionsView').hidden=!(mission||report);
    $('workspaceIntro').hidden=!(directory||mission);
    if(directory){
      $('introTitle').innerHTML='PERSONAL<em>DATENBANK</em>';
      $('introCode').textContent='// 01. PERSONNEL';
      $('introSubtitle').textContent='Übersicht aller Personalakten des SDN';
    } else if(mission){
      $('introTitle').innerHTML='EINSATZ<em>PROTOKOLLE</em>';
      $('introCode').textContent='// 02. OPERATIONS';
      $('introSubtitle').textContent='Übersicht aller dokumentierten Einsätze des SDN';
    }
    document.querySelectorAll('.rail-button').forEach(b=>b.classList.toggle('active',b.dataset.action===((mission||report)?'missions':'roster')));
    if(mission||report)renderMissions();else if(personnel)renderAll();else renderDirectory();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function renderAll(){renderRecord();}
  const formInput=(key,label,opts={})=>{const v=editNew?'':fieldValue(editTarget,key);const max=opts.max||255;return `<label class="${opts.wide?'span2':''}">${safe(label)}${opts.hint?`<span class="field-hint">${safe(opts.hint)}</span>`:''}${opts.area?`<textarea name="${key}" maxlength="${max}" rows="${opts.rows||3}">${safe(v)}</textarea>`:`<input name="${key}" maxlength="${max}" value="${safe(v)}" />`}</label>`;};
  const selectField=(key,label,values)=>`<label>${safe(label)}<select name="${key}">${!values.some(([v])=>v===String(fieldValue(editTarget,key)??''))&&fieldValue(editTarget,key)?`<option selected value="${safe(fieldValue(editTarget,key))}">Bisher: ${safe(fieldValue(editTarget,key))}</option>`:''}${values.map(([value,title])=>`<option value="${safe(value)}" ${String(fieldValue(editTarget,key)??'')===String(value)?'selected':''}>${safe(title)}</option>`).join('')}</select></label>`;
  const section=(title,contents,open=false)=>`<details class="editor-group" ${open?'open':''}><summary>${safe(title)} <span>＋</span></summary><div class="form-grid">${contents}</div></details>`;
  function openEdit(isNew=false,focusSection='',quick={}){
    if(live&&!isNew&&!gmMode&&picked()?.ownerId!==backend.userId){alert('Nur eigene Akten dürfen bearbeitet werden.');return;}
    editNew=isNew;stagedPortrait=null;if(portraitPreviewUrl){URL.revokeObjectURL(portraitPreviewUrl);portraitPreviewUrl=null;}
    editTarget=isNew?clone({...BASE,uid:'draft-'+nextChar,sdnId:'',status:'draft'}):picked();
    if(isNew&&gmMode)STAT_KEYS.forEach(([k])=>{editTarget.stats[k]=null;});
    $('dialogTitle').textContent=isNew?'NEUE PERSONALAKTE':'AKTE BEARBEITEN';
    const positions=['Superheld','Dispatcher','Teamleiter','Manager','Standortleitung','Techniker','Arzt'];
    const nameFields=['name','alias'].map(key=>formInput(key,fieldNames[key],{max:150})).join('')+selectField('role','POSITION',[['','Position auswählen'],...positions.map(x=>[x,x])])+selectField('hasSecretIdentity','GEHEIME IDENTITÄT',[['','Bitte auswählen'],['yes','Ja'],['no','Nein']])+['age','height','weight','birthplace','birthday'].map(key=>formInput(key,fieldNames[key],{max:150})).join('')+selectField('sex','GESCHLECHT',[['','Bitte auswählen'],['male','Männlich'],['female','Weiblich'],['diverse','Divers']])+formInput('discordChannelUrl',fieldNames.discordChannelUrl,{max:150});
    const appearance=['hair','eyes','build','skin','distinguishing'].map(k=>formInput(k,fieldNames[k])).join('')+['description','impression'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:2500})).join('');
    const classSelect=selectField('classCode','FÄHIGKEITSKLASSE',['','E','D','C','B','A','S'].map(x=>[x,x||'Keine Daten vorhanden']));
    const abilities=classSelect+['powerName','origin'].map(k=>formInput(k,fieldNames[k])).join('')+formInput('powerDescription','BESCHREIBUNG',{area:true,wide:true,max:5000})+formInput('weaknesses','SCHWÄCHEN',{area:true,wide:true,max:5000})+`<label class="span2">MOVES / ANGRIFFE / UNTERFÄHIGKEITEN (JE ZEILE „NAME | BESCHREIBUNG“)<textarea name="powersText" rows="5" maxlength="5000">${safe(editTarget.powers.map(p=>p.title+' | '+p.text).join('\n'))}</textarea></label>`+['generalWeaknesses','generalStrengths','generalAbilities'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:5000})).join('');
    const stats=`<div class="span2"><div class="stat-form" id="statForm">${STAT_KEYS.map(([k,n])=>`<label>${n}<input name="stat_${k}" type="number" min="0.5" max="${isNew?6:10}" step="0.5" value="${editTarget.stats[k]??''}" ${gmMode?'':'required'}/></label>`).join('')}</div><div class="stat-form-total" id="statTotal"></div><span class="field-hint">${isNew?'Neue Charaktere: maximal 15 Punkte insgesamt und 6 pro Attribut.':'Änderungen: maximal 27 Punkte insgesamt und 10 pro Attribut.'} Werte in 0,5er-Schritten. ${gmMode?'SL: Felder dürfen für „Keine Daten vorhanden“ leer bleiben.':''}</span></div>`;
    const personal=['character','motivation','behavior','assessment','likes','dislikes'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:3000})).join('');
    const history=['background','criminalRecord','formerAffiliations'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:5000})).join('')+'<div class="span2 subeditor-heading">✚ KRANKENAKTE</div>'+['medicalConditions','medicalAllergies','medicalInjuries','medicalTreatments'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:3500})).join('');
    const relationsEditor='<div class="span2 relationship-editor-intro">Pro Bekanntschaft sind nur drei Angaben nötig: verknüpfter Charakter, Art der Beziehung und freier Beschreibungstext. Weitere Informationen kannst du jederzeit durch Bearbeiten des Textes ergänzen.</div><div class="span2" id="relationshipRows"></div><button class="relationship-add" id="addRelationship" type="button">＋ NEUE BEKANNTSCHAFT</button>';
    const secret=gmMode?`<label class="span2">TOP SECRET<textarea name="secretNotes" maxlength="7000" rows="7">${safe(legacySecret(editTarget))}</textarea></label>`:'';
    $('editFields').innerHTML=section('01 / PERSONALDATEN',nameFields,true)+section('02 / ERSCHEINUNGSBILD',appearance,true)+section('03 / ATTRIBUTE',stats,true)+section('04 / FÄHIGKEITEN',abilities,false)+section('05 / PERSÖNLICHKEIT',personal,false)+section('06 / HISTORIE',history,false)+((!isNew&&editTarget.status==='approved')?section('07 / BEZIEHUNGEN',relationsEditor,false):'')+(gmMode?section('08 / TOP SECRET',secret,false):'')+section('09 / PORTRAIT',`<div class="span2 sdn-portrait-editor"><img id="portraitEditPreview" class="sdn-portrait-preview" src="${safe(editTarget.photo||'')}" alt="Aktueller Portraitausschnitt"/><div><div class="sdn-portrait-options"><input type="file" id="portraitFile" accept="image/png,image/jpeg,image/webp"/><button type="button" id="portraitPick">＋ BILD AUSWÄHLEN</button><button type="button" id="portraitRecrop" ${editTarget.portrait?.original?'':'disabled'}>✎ AUSSCHNITT BEARBEITEN</button></div><p class="sdn-portrait-note" id="portraitEditNote">Maximal 1 MB. Kein Ganzkörperbild – wähle einen gut erkennbaren Portraitausschnitt. Beachte die Bildrichtlinien des Discord-Servers.</p><div class="sdn-portrait-reference"><div class="sdn-portrait-reference-placeholder">BEISPIELPORTRAIT<br><small>MUSTERBILD FOLGT</small></div><p>Hier wird das vom RP-Team bereitgestellte Muster angezeigt.</p></div></div></div>`,true);
    document.querySelectorAll('#statForm input').forEach(input=>input.addEventListener('input',updateStatTotal));
    if(!isNew&&editTarget.status==='approved'){(editTarget.relationships||[]).forEach(rel=>addRelationRow(rel));$('addRelationship').addEventListener('click',()=>addRelationRow());}
    $('portraitPick').addEventListener('click',()=>$('portraitFile').click());
    $('portraitFile').addEventListener('change',async e=>{
      if(!e.target.files[0])return;
      try{if(e.target.files[0].size>1024*1024)throw new Error('Das hochgeladene Bild darf maximal 1 MB groß sein.');const result=await window.SDNPortraitEditor.edit(e.target.files[0]);if(result)stagePortrait(result,true);}
      catch(err){$('formError').textContent=err.message;}finally{e.target.value='';}
    });
    $('portraitRecrop').addEventListener('click',async()=>{
      try{
        const source=stagedPortrait?.source || (live?await backend.originalBlob(editTarget.portrait?.original):null);
        if(!source)throw new Error('Originalbild nicht verfügbar – neues Bild auswählen.');
        const result=await window.SDNPortraitEditor.edit(source,stagedPortrait?.crop||editTarget.portrait?.crop||null);
        if(result)stagePortrait(result,!Boolean(editTarget.portrait?.original)||Boolean(stagedPortrait?.newSource));
      }catch(err){$('formError').textContent=err.message;}
    });
    $('proposalComment').value='';
    $('dialogTitle').textContent=isNew?'NEUE PERSONALAKTE EINREICHEN':'ÄNDERUNGSANTRAG VORBEREITEN';
    const openTickets=isNew?0:pendingCount(editTarget);
    $('pendingEditWarning').hidden=openTickets===0;
    $('pendingEditWarning').textContent=`BEREITS ${openTickets} ${openTickets===1?'TICKET':'TICKETS'} IN PRÜFUNG. Du kannst trotzdem weitere Anträge einreichen. Bei Überschneidungen prüft die Spielleitung auf Konflikte.`;
    $('submitEdit').disabled=false;
    updateStatTotal();$('formError').textContent='';$('editDialog').showModal();
    if(focusSection){const group=[...$('editFields').querySelectorAll('.editor-group')].find(x=>x.querySelector('summary')?.textContent.includes(focusSection));if(group){group.open=true;setTimeout(()=>group.scrollIntoView({block:'start',behavior:'instant'}),0);}}
    if(quick.addRelation&&$('relationshipRows')){addRelationRow();}
    if(quick.targetId&&$('relationshipRows')){const row=[...$('relationshipRows').children].find(r=>r.querySelector('.rel-target')?.value===quick.targetId);if(row){row.classList.add('row-edit-highlight');setTimeout(()=>row.scrollIntoView({block:'center',behavior:'instant'}),0);}}
  }
  function stagePortrait(result,newSource){
    if(portraitPreviewUrl)URL.revokeObjectURL(portraitPreviewUrl);
    portraitPreviewUrl=URL.createObjectURL(result.preview);
    stagedPortrait={...result,newSource};
    $('portraitEditPreview').src=portraitPreviewUrl;
    $('portraitEditNote').textContent=`Vorgemerkt: ${Math.round(result.preview.size/1024)} KB. Maximal 1 MB, kein Ganzkörperbild. Beachte die Bildrichtlinien des Discord-Servers.`;
    $('portraitRecrop').disabled=false;
  }
  function addRelationRow(rel={targetId:'',type:'',description:''}){
    const options=characters.filter(c=>c.uid!==editTarget.uid).map(c=>`<option value="${safe(c.uid)}" ${rel.targetId===c.uid?'selected':''}>${safe(c.alias)} · SDN #${safe(c.sdnId)}</option>`).join('');
    const row=document.createElement('div');row.className='relationship-edit-row';
    row.innerHTML=`<div class="relationship-edit-row-head"><strong>BEKANNTSCHAFT</strong><button type="button" class="relation-remove">ENTFERNEN ×</button></div><div class="form-grid"><label>VERKNÜPFTE PERSONALAKTE<select class="rel-target"><option value="">Bitte Charakter auswählen</option>${options}</select></label><label>ART DER BEZIEHUNG<input class="rel-type" value="${safe(rel.type)}" maxlength="100" placeholder="z. B. Freundschaft, Rivalität, Familie" /></label><label class="span2">BESCHREIBUNG DER BEZIEHUNG<textarea class="rel-description" maxlength="6000" rows="5" placeholder="Wie stehen sie zueinander? Gemeinsame Erlebnisse, Veränderungen, persönliche Einschätzung …">${safe(rel.description)}</textarea></label></div>`;
    row.querySelector('.relation-remove').addEventListener('click',()=>row.remove());
    $('relationshipRows').appendChild(row);return row;
  }

    function updateStatTotal(){const f=$('editForm');const vals=STAT_KEYS.map(([k])=>f.elements['stat_'+k]?.value);const ns=vals.filter(v=>v!=='').map(Number);const sum=ns.reduce((a,b)=>a+b,0);const limit=editNew?15:27;const max=editNew?6:10;const invalid=sum>limit||ns.some(n=>n<0.5||n>max||Math.round(n*2)!==n*2)||(!gmMode&&ns.length!==5);$('statTotal').textContent=`${sum.toLocaleString('de-DE')} / ${limit} PUNKTE ${gmMode&&ns.length<5?'· Fehlende Werte: Keine Daten vorhanden':''}`;$('statTotal').classList.toggle('invalid',invalid);}
  function toDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Bild konnte nicht gelesen werden'));reader.readAsDataURL(file);});}
  function readableList(relations){return relations.map(r=>{
    const ch=characters.find(x=>x.uid===r.targetId);return `${ch?.alias||r.targetId} (${r.type||'Beziehung'}): ${r.description||'—'}`;
  }).join('\n\n');}
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function makeDiff(before,after){
    const differences=[],operations=[];
    const add=(kind,key,label,oldVal,newVal,category='normal')=>{
      if(same(oldVal,newVal))return;
      differences.push({label,before:valueText(oldVal),after:valueText(newVal),category});
      operations.push({kind,key,before:clone(oldVal),after:clone(newVal),label});
    };
    for(const key of editableKeys)add('field',key,fieldNames[key]||key,fieldValue(before,key),fieldValue(after,key),categoryFor(key));
    if(gmMode)add('field','notes','TOP SECRET',legacySecret(before),legacySecret(after));
    for(const [key,label] of STAT_KEYS)add('stat',key,label,before.stats[key],after.stats[key],'attribute');
    add('powers','powers','Einzelfähigkeiten',before.powers,after.powers,'ability');
    const oldMap=new Map((before.relationships||[]).map(r=>[r.targetId,r]));
    const newMap=new Map((after.relationships||[]).map(r=>[r.targetId,r]));
    for(const id of new Set([...oldMap.keys(),...newMap.keys()])){
      const old=oldMap.get(id)||null,fresh=newMap.get(id)||null;
      const ch=characters.find(x=>x.uid===id);const label='Bekanntschaft · '+(ch?.alias||id);
      if(same(old,fresh))continue;
      differences.push({label,before:old?readableList([old]):'Keine Bekanntschaft',after:fresh?readableList([fresh]):'Bekanntschaft entfernt',category:'normal'});
      operations.push({kind:'relation',key:id,before:clone(old),after:clone(fresh),label});
    }
    if(!same(before.portrait,after.portrait)) {
      differences.push({label:'Offizielles Portrait / Ausschnitt',before:before.portrait?'Bisheriger Ausschnitt':'Keines',after:'Neues Portrait oder neuer Ausschnitt',category:'normal'});
      operations.push({kind:'portrait',key:'portrait',before:clone(before.portrait||null),after:clone(after.portrait),label:'Offizielles Portrait / Ausschnitt'});
    }
    return {differences,operations};
  }
  // Überprüft jeden beantragten Datensatz gegen die *aktuelle* freigegebene Akte.
  // Gleiche Felder können kollidieren; unabhängige Felder/Beziehungen/Bilder bleiben sicher kombinierbar.
  function ticketConflicts(c,p){
    if(p.isNew&&c.status==='draft')return [];
    const conflicts=[];
    for(const op of p.operations||[]){
      let current;
      if(op.kind==='field')current=fieldValue(c,op.key);
      else if(op.kind==='stat')current=c.stats[op.key];
      else if(op.kind==='powers')current=c.powers;
      else if(op.kind==='relation')current=c.relationships.find(r=>r.targetId===op.key)||null;
      else if(op.kind==='portrait')current=c.portrait||null;
      if(!same(current,op.before)&&!same(current,op.after))conflicts.push(op.label+' (zwischenzeitlich verändert)');
    }
    if(!conflicts.length){
      const preview=clone(c);applyOperations(preview,p.operations);
      if(total(preview)>27)conflicts.push('Attribute: zusammen mehr als 27 Punkte');
      if(STAT_KEYS.some(([k])=>preview.stats[k]!=null&&(!Number.isFinite(Number(preview.stats[k]))||preview.stats[k]<0.5||preview.stats[k]>10||Math.round(preview.stats[k]*2)!==preview.stats[k]*2)))conflicts.push('Attribute: unzulässiger Wert');
    }
    return [...new Set(conflicts)];
  }
  function applyOperations(c,operations){
    for(const op of operations||[]){
      if(op.kind==='field')setField(c,op.key,clone(op.after));
      else if(op.kind==='stat')c.stats[op.key]=Number(op.after);
      else if(op.kind==='powers')c.powers=clone(op.after);
      else if(op.kind==='relation'){
        const index=c.relationships.findIndex(r=>r.targetId===op.key);
        if(op.after===null){if(index>=0)c.relationships.splice(index,1);}
        else if(index>=0)c.relationships[index]=clone(op.after);
        else c.relationships.push(clone(op.after));
      }else if(op.kind==='portrait')c.portrait=clone(op.after);
    }
  }
  async function saveEdit(evt){
    evt.preventDefault();const f=$('editForm');$('formError').textContent='';
    const updates={};for(const key of editableKeys)updates[key]=f.elements[key].value.trim();
    if(gmMode)updates.notes=f.elements.secretNotes.value.trim();
    if(!gmMode&&(!updates.alias||!updates.name)){$('formError').textContent='Alias und bürgerlicher Name müssen eingetragen werden.';return;}
    if(editNew&&!gmMode&&(!updates.role||!['yes','no'].includes(updates.hasSecretIdentity)||!['male','female','diverse'].includes(updates.sex))){$('formError').textContent='Bitte Position, geheime Identität und Geschlecht auswählen.';return;}
    if(gmMode){if(!updates.alias)updates.alias='Keine Daten vorhanden';if(!updates.name)updates.name='Keine Daten vorhanden';}
    const stats={};let sum=0;const max=editNew?6:10,limit=editNew?15:27;for(const [k] of STAT_KEYS){const raw=f.elements['stat_'+k].value.trim();if(raw===''&&gmMode){stats[k]=null;continue;}const n=Number(raw);if(!raw||!Number.isFinite(n)||n<0.5||n>max||Math.round(n*2)!==n*2){$('formError').textContent=`Attributwerte müssen zwischen 0,5 und ${max} liegen (0,5er-Schritte).`;return;}stats[k]=n;sum+=n;}
    if(sum>limit){$('formError').textContent=`Attributbudget überschritten: ${sum} / ${limit} Punkte.`;return;}
    const powers=f.elements.powersText.value.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const split=line.indexOf('|');return {title:split>=0?line.slice(0,split).trim():line,text:split>=0?line.slice(split+1).trim():''};});
    const relationships=[];const seen=new Set();
    for(const row of document.querySelectorAll('#relationshipRows .relationship-edit-row')){
      const targetId=row.querySelector('.rel-target').value;const type=row.querySelector('.rel-type').value.trim();const description=row.querySelector('.rel-description').value.trim();
      if(!targetId&&!type&&!description)continue;
      if(!targetId||!type||!description){$('formError').textContent='Für jede Bekanntschaft müssen Charakter, Beziehungsart und Beschreibung angegeben werden.';return;}
      if(targetId===editTarget.uid||!characters.some(c=>c.uid===targetId)){$('formError').textContent='Ungültige verknüpfte Personalakte.';return;}
      if(seen.has(targetId)){$('formError').textContent='Jeder Charakter kann pro Personalakte nur einmal als Beziehung verknüpft werden.';return;}
      seen.add(targetId);relationships.push({targetId,type,description});
    }
    if(updates.discordChannelUrl && !/^https:\/\/discord\.com\/channels\/\d+\/\d+$/.test(updates.discordChannelUrl)){$('formError').textContent='Discord-Kanallink muss https://discord.com/channels/SERVER_ID/KANAL_ID entsprechen.';return;}
    const candidate=clone(editTarget);
    for(const [key,v] of Object.entries(updates))setField(candidate,key,v);
    candidate.stats=stats;candidate.powers=powers;candidate.relationships=(editNew||editTarget.status!=='approved')?clone(editTarget.relationships||[]):relationships;
    if(gmMode)candidate.secret={...(candidate.secret||{}),notes:updates.notes};
    try {
      if(stagedPortrait){
        const sourcePath=stagedPortrait.newSource
          ? (live?await backend.uploadPortraitBlob(stagedPortrait.source,'original'):await toDataURL(stagedPortrait.source))
          : editTarget.portrait?.original;
        const previewPath=live?await backend.uploadPortraitBlob(stagedPortrait.preview,'preview'):await toDataURL(stagedPortrait.preview);
        candidate.portrait={original:sourcePath,preview:previewPath,crop:stagedPortrait.crop,publishedPreview:editTarget.portrait?.publishedPreview||''};
      }
      if(editNew&&!candidate.portrait)throw new Error('Bitte für die neue Akte ein Portrait auswählen.');
    }catch(error){$('formError').textContent=error.message;return;}
    const {differences,operations}=makeDiff(editTarget,candidate);
    if(!differences.length){$('formError').textContent='Es wurden noch keine Änderungen vorgenommen.';return;}
    const comment=$('proposalComment').value.trim();
    if(live){
      try{const result=await backend.submitTicket({characterId:editNew?null:editTarget.uid,candidate,operations,changes:differences,comment});
        selectedId=result.character_id; activeTab='audit';$('editDialog').close();await reloadRemote(); navigate('personnel');}
      catch(error){$('formError').textContent='Antrag nicht gespeichert: '+error.message;}
      return;
    }
    const p={id:'CHG-'+String(nextTicket++).padStart(4,'0'),title:editNew?'NEUE PERSONALAKTE · '+candidate.alias:'ÄNDERUNGSANTRAG · '+editTarget.alias,time:stamp(),requestedBy:'Demo-Spieler',status:'pending',comment,operations,changes:differences,priority:differences.some(d=>d.category!=='normal'),isNew:editNew};
    if(editNew){
      const draft=clone(editTarget);draft.alias='ENTWURF '+nextChar;draft.name='Freigabe ausstehend';draft.status='draft';draft.proposals.unshift(p);logChange(draft,'NEUE AKTE ZUR FREIGABE EINGEREICHT',['Ticket '+p.id]);characters.push(draft);selectedId=draft.uid;nextChar++;
    }else{editTarget.proposals.unshift(p);logChange(editTarget,'ÄNDERUNGSTICKET EINGEREICHT',[p.id,...differences.map(d=>d.label)]);}
    activeTab='audit';$('editDialog').close();navigate('personnel');
  }

    function openMissionDialog(){
    const f=$('missionForm');f.reset();
    f.elements.outcome.value='open';
    f.elements.startDate.value=new Date().toISOString().slice(0,10);
    const updateOutcome=()=>{
      const done=f.elements.outcome.value!=='open';
      f.elements.endDate.disabled=!done;
      f.elements.endDate.required=done;
      $('missionCustomerReview').hidden=false;
      $('missionCustomerReview').classList.toggle('is-disabled',!done);
      $('customerReviewHint').textContent=done?'OPTIONAL · Bei abgeschlossenen Einsätzen':'ERST BEI ABGESCHLOSSENEM FALL VERFÜGBAR';
      f.elements.customerStars.disabled=!done;
      f.elements.customerComment.disabled=!done;
      $('customerStarPreview').textContent=done&&f.elements.customerStars.value ? `${'★'.repeat(Number(f.elements.customerStars.value))}${'☆'.repeat(5-Number(f.elements.customerStars.value))}` : '☆☆☆☆☆';
      if(!done){f.elements.endDate.value='';f.elements.customerStars.value='';f.elements.customerComment.value='';}
    };
    const updateDamage=()=>{const has=f.elements.damageStatus.value==='yes';f.elements.damages.disabled=!has;if(!has)f.elements.damages.value='';};
    f.elements.outcome.onchange=updateOutcome;f.elements.damageStatus.onchange=updateDamage;
    f.elements.customerStars.onchange=updateOutcome;updateOutcome();updateDamage();
    $('missionDispatcher').innerHTML='<option value="">Kein Dispatcher zugewiesen</option>'+characters.filter(c=>c.status==='approved'&&c.role==='Dispatcher').map(c=>`<option value="${safe(c.uid)}">${safe(c.alias)} · SDN #${safe(c.sdnId)}</option>`).join('');
    $('participantChecks').innerHTML=characters.filter(c=>!live||c.status==='approved').map(c=>`<label class="participant-option"><input type="checkbox" name="participant" value="${safe(c.uid)}"><span>${safe(c.alias)} <small>#${safe(c.sdnId)}</small></span></label>`).join('');
    $('missionError').textContent='';$('missionDialog').showModal();
  }
  function saveMission(evt){
    evt.preventDefault();const f=$('missionForm');$('missionError').textContent='';const data={};
    for(const key of ['title','customer','startDate','endDate','location','rpLink','customerStars','customerComment','situation','events','outcome','damageStatus','damages','notes'])data[key]=f.elements[key].value.trim();
    data.date=data.startDate;
    data.caseStatus=data.outcome==='open'?'open':'closed';
    if(data.outcome==='open'){data.endDate='';data.customerStars='';data.customerComment='';}
    if(data.damageStatus!=='yes')data.damages='';
    if(data.caseStatus==='closed'&&!data.endDate){$('missionError').textContent='Bitte das Einsatzende für abgeschlossene Einsätze angeben.';return;}
    if(data.endDate && data.endDate < data.startDate){$('missionError').textContent='Das Einsatzende darf nicht vor dem Einsatzbeginn liegen.';return;}
    if(data.customerStars&&!/^[1-5]$/.test(data.customerStars)){$('missionError').textContent='Bitte eine Kundenbewertung von 1 bis 5 Sternen auswählen.';return;}
    if(data.rpLink&&!/^https:\/\/(?:discord\.com|discordapp\.com)\/channels\/\d+\/\d+\/\d+$/.test(data.rpLink)){$('missionError').textContent='Bitte einen Discord-Link zur ersten RP-Nachricht eintragen.';return;}
    data.dispatcherId=f.elements.dispatcherId.value.trim();
    if(data.dispatcherId&&!characters.some(c=>c.uid===data.dispatcherId&&c.status==='approved'&&c.role==='Dispatcher')){ $('missionError').textContent='Als Dispatcher kann nur ein freigegebener Charakter mit der Position Dispatcher ausgewählt werden.';return;}
    data.requestComment=$('missionComment').value.trim();
    const participants=[...$('participantChecks').querySelectorAll('input:checked')].map(el=>el.value);
    if(!data.title||!data.startDate||!data.situation||!data.events||!participants.length){$('missionError').textContent='Bitte Einsatzname, Einsatzbeginn, Ausgangslage, Verlauf und mindestens einen Teilnehmer angeben.';return;}
    if(live){backend.submitReport({...data,participants}).then(async id=>{reportFocus=id;missionFilter='all';$('missionDialog').close();await reloadRemote();navigate('mission-detail');}).catch(e=>{$('missionError').textContent='Bericht nicht gespeichert: '+e.message;});return;}
    const id='OPS-'+String(nextMission++).padStart(4,'0');
    reports.unshift({...data,id,participants,status:'pending',submitted:'Demo-Spieler · '+stamp(),reviewed:''});
    reportFocus=id;missionFilter='all';$('missionDialog').close();navigate('mission-detail');
  }
  function reset(){if(live)return;if(!confirm('Alle Änderungen, Bilder, Protokolle und Freigaben der Demo-Sitzung zurücksetzen?'))return;
    characters=[clone(BASE)];reports=clone(REPORTS);selectedId=BASE.uid;activeTab='identity';view='directory';gmMode=false;nextChar=1;nextMission=3;nextTicket=1;reportFocus=null;missionFilter='all';directoryScroll=0;missionScroll=0;renderGM();navigate('directory');}
  function renderGM(){$('gmToggle').textContent=live?(gmMode?'SPIELLEITUNG · ABMELDEN':hrMode?'HR · ABMELDEN':'MITGLIED · ABMELDEN'):(gmMode?'SPIELLEITUNG · DEMO':'SPIELERANSICHT');$('gmToggle').classList.toggle('is-gm',gmMode);}

  function openActivityDialog(){
    const c=picked();if(!c||c.status!=='approved')return;
    if(live&&!gmMode&&c.ownerId!==backend.userId)return;
    const form=$('activityForm');form.reset();
    form.elements.activityStatus.value=c.activityStatus==='inactive'?'inactive':'active';
    $('activityError').textContent='';
    $('activityCommentWrap').hidden=gmMode;
    $('activityHelp').textContent=gmMode?'Als Spielleitung kannst du den Tag direkt setzen.':'Der neue Status wird als Änderungsticket eingereicht und erscheint erst nach Freigabe.';
    $('activitySubmit').textContent=gmMode?'STATUS SPEICHERN':'ANTRAG ABSENDEN';
    $('activityDialog').showModal();
  }
  async function saveActivity(e){
    e.preventDefault(); const c=picked(); if(!c||c.status!=='approved')return;
    const form=$('activityForm'),newStatus=form.elements.activityStatus.value;
    if(!['active','inactive'].includes(newStatus))return;
    if(newStatus===c.activityStatus){$('activityError').textContent='Dieser Status ist bereits gesetzt.';return;}
    const button=$('activitySubmit');button.disabled=true;
    try{
      if(gmMode){
        if(live){await backend.setCharacterActivity(c.uid,newStatus);await reloadRemote();}
        else{c.activityStatus=newStatus;logChange(c,'AKTIVITÄTSSTATUS DURCH SL GEÄNDERT',[ACTIVITY[newStatus]]);}
      }else{
        const before=c.activityStatus||'';
        // Legacy records have no activityStatus key. Omit before instead of
        // sending JSON null/empty string, so server-side conflict checks work.
        const previous=Object.prototype.hasOwnProperty.call(c,'activityStatus') ? {before:c.activityStatus} : {};
        const operations=[{kind:'field',key:'activityStatus',...previous,after:newStatus}];
        const changes=[{label:'Aktivitätsstatus',before:ACTIVITY[before]||'Nicht gesetzt',after:ACTIVITY[newStatus],category:'normal'}];
        if(live){await backend.submitTicket({characterId:c.uid,candidate:null,operations,changes,comment:form.elements.activityComment.value.trim()});await reloadRemote();}
        else{c.proposals.unshift({id:'CHG-'+String(nextTicket++).padStart(4,'0'),status:'pending',isNew:false,priority:false,operations,changes,comment:form.elements.activityComment.value.trim(),time:stamp(),requestedBy:'Demo-Spieler'});}
      }
      $('activityDialog').close();renderDirectory();renderRecord();
    }catch(err){$('activityError').textContent='Status konnte nicht gespeichert werden: '+err.message;}
    finally{button.disabled=false;}
  }
  $('activityButton').addEventListener('click',openActivityDialog);
  $('activityCancel').addEventListener('click',()=>$('activityDialog').close());
  $('activityForm').addEventListener('submit',saveActivity);
  $('deleteCharacterButton').addEventListener('click',async()=>{
    if(!gmMode)return;
    const c=picked();if(!c)return;
    if(!confirm(`Personalakte „${c.alias}“ (${c.sdnId}) WIRKLICH ENDGÜLTIG LÖSCHEN?\n\nAlle Verknüpfungen in Einsatzberichten und Bekanntschaften werden entfernt. Zugehörige Tickets und Aktennotizen werden gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden.`))return;
    const button=$('deleteCharacterButton');button.disabled=true;
    try{
      if(live){await backend.deleteCharacter(c.uid);selectedId='';await reloadRemote();}
      else{
        for(const ch of characters){if(ch.uid===c.uid)continue;ch.relationships=(ch.relationships||[]).filter(rel=>rel.targetId!==c.uid);ch.proposals=ch.proposals.filter(p=>!p.operations?.some(op=>op.kind==='relation'&&op.key===c.uid));}
        reports=reports.map(r=>({...r,participants:(r.participants||[]).filter(x=>x!==c.uid),dispatcherId:r.dispatcherId===c.uid?'':r.dispatcherId}));
        fileNotes=fileNotes.filter(n=>n.characterId!==c.uid);
        characters=characters.filter(ch=>ch.uid!==c.uid);
      }
      navigate('directory');
    }catch(err){alert('Personalakte konnte nicht gelöscht werden: '+err.message);}
    finally{button.disabled=false;}
  });

  $('directorySearch').addEventListener('input',()=>{directoryScroll=0;renderDirectory();});
  $('directoryFilter').addEventListener('change',e=>{directoryFilter=e.target.value;directoryScroll=0;renderDirectory();});
  $('directoryPosition').addEventListener('change',e=>{directoryPosition=e.target.value;directoryScroll=0;renderDirectory();});
  $('directorySort').addEventListener('change',e=>{directorySort=e.target.value;directoryScroll=0;renderDirectory();});
  $('directoryAdd').addEventListener('click',()=>openEdit(true));
  $('backDirectory').addEventListener('click',()=>navigate('directory'));
  $('editButton').addEventListener('click',()=>openEdit());$('editForm').addEventListener('submit',saveEdit);
  $('closeDialog').addEventListener('click',()=>$('editDialog').close());$('cancelEdit').addEventListener('click',()=>$('editDialog').close());
  $('missionForm').addEventListener('submit',saveMission);$('closeMissionDialog').addEventListener('click',()=>$('missionDialog').close());$('cancelMission').addEventListener('click',()=>$('missionDialog').close());
  $('gmToggle').addEventListener('click',()=>{if(live){backend.logout();return;}gmMode=!gmMode;renderGM();view==='personnel'?renderRecord():(view==='missions'||view==='mission-detail'?renderMissions():renderDirectory());});
  $('approveButton').addEventListener('click',async ()=>{
    if(!gmMode)return;const c=picked();if(!c)return;
    if(live){try{await backend.setCharacterStatus(c.uid,c.status!=='approved');await reloadRemote();}catch(error){alert(error.message);}return;}
    if(c.status==='approved'){
      if(!confirm('Freigabe dieser Personalakte in der lokalen Demo zurückziehen?'))return;
      c.status='pending';logChange(c,'AKTENFREIGABE ZURÜCKGEZOGEN',['Status: PENDING']);
    }else{
      c.status='approved';logChange(c,'PERSONALAKTE FREIGEGEBEN',['Status: APPROVED']);
    }
    renderAll();
  });
  $('auditButton').addEventListener('click',()=>{activeTab='audit';renderRecord();});$('printButton').addEventListener('click',()=>window.print());$('resetDemo').addEventListener('click',reset);if(live)$('resetDemo').hidden=true;
  // The redundant security banner was removed from the layout.
  $('closePrivacy').addEventListener('click',()=>$('privacyDialog').close());$('gotItPrivacy').addEventListener('click',()=>$('privacyDialog').close());
  document.querySelectorAll('.rail-button').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.action==='roster')navigate('directory');
    else {reportFocus=null;navigate('missions');}
  }));
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();navigate('directory');$('directorySearch').focus();}});
  async function reloadRemote(){
    const data=await backend.loadAll();
    characters=data.characters;reports=data.reports;fileNotes=data.fileNotes||[];
    if(!characters.some(c=>c.uid===selectedId))selectedId=characters[0]?.uid||'';
    if(view==='missions'||view==='mission-detail')renderMissions();else if(view==='directory')renderDirectory();else renderAll();
  }
  function showGate(title,message,showLogin=false){
    document.body.classList.add('secure-locked');
    $('authTitle').textContent=title;
    $('authMessage').textContent=message;
    $('authLogin').hidden=!showLogin;
    $('authGate').hidden=false;
  }
  async function startOnline(){
    showGate('VERBINDUNG ZUM SDN','Authentifizierung wird geprüft …');
    if(!live){showGate('SYSTEM NICHT KONFIGURIERT','Bitte zuerst Supabase und Discord verbinden. Siehe README.md. Die v0.5-ZIP bleibt als lokale Designvorschau verfügbar.');return;}
    try{
      const sess=await backend.session();
      if(!sess){showGate('PERSONNEL ACCESS','Nur Mitglieder des Discord-RP-Servers dürfen Personalakten lesen.',true);return;}
      const role=await backend.verify();
      if(!role.member){showGate('ACCESS DENIED','Dieser Discord-Account ist kein bestätigtes Mitglied des RP-Servers.');return;}
      gmMode=role.admin;hrMode=Boolean(role.hr);renderGM();
      await reloadRemote();navigate('directory');
      $('authGate').hidden=true;document.body.classList.remove('secure-locked');
      document.querySelector('.sync-indicator').innerHTML='<i></i> SERVER CONNECTED';
      // Display the authenticated member's verified Discord server name, never a placeholder.
      const name = String(backend.discordDisplayName || '').trim();
      const nameSlot = $('discordSessionName');
      nameSlot.hidden = !name;
      nameSlot.textContent = name;
      nameSlot.title = name ? 'Discord: ' + name : '';
      document.querySelector('.topbar-cut').hidden = !name;
      setInterval(async()=>{
        try{const fresh=await backend.verify();if(!fresh.member){showGate('ACCESS REVOKED','Die Mitgliedschaft wurde nicht mehr bestätigt.');return;}gmMode=fresh.admin;hrMode=Boolean(fresh.hr);renderGM();}
        catch{showGate('ACCESS PAUSED','Sicherheitsprüfung nicht möglich. Bitte Seite neu laden.');}
      },2*60*1000);
    }catch(error){showGate('VERBINDUNG FEHLGESCHLAGEN',error.message);}
  }
  $('authLogin').addEventListener('click',()=>backend.login().catch(e=>showGate('LOGIN FEHLGESCHLAGEN',e.message,true)));
  $('authRetry').addEventListener('click',()=>location.reload());
  startOnline();
})();
