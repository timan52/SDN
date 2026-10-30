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
  const TABS = [['identity','01 IDENTITÄT'],['attributes','02 SKILLMATRIX'],['abilities','03 FÄHIGKEITEN'],['equipment','04 AUSRÜSTUNG'],['personality','05 CHARAKTER'],['history','06 HISTORIE'],['medical','07 MEDIZINISCHE AKTE'],['relationships','08 BEZIEHUNGEN'],['missions','09 EINSÄTZE'],['file-notes','10 AKTENNOTIZ'],['secret','11 TOP SECRET']];
  const OUTCOMES = {closed:'ABGESCHLOSSEN',success:'ABGESCHLOSSEN', partial:'ABGESCHLOSSEN',failure:'ABGESCHLOSSEN',open:'NOCH OFFEN'};
  const REPORT_LEVELS = ['E','D','C','B','A','S'];
  const reportLevelText = value => REPORT_LEVELS.includes(String(value||'').toUpperCase()) ? 'LEVEL '+String(value).toUpperCase() : 'NICHT EINGESTUFT';
  const reportLevelBadge = r => REPORT_LEVELS.includes(String(r.level||'').toUpperCase()) ? `<span class="sdn-report-level sdn-report-level-${safe(String(r.level).toLowerCase())}">${safe(reportLevelText(r.level))}</span>` : '';
  const DAMAGE = {no:'Keine bekannten Schäden',yes:'Schäden dokumentiert',unknown:'Noch ungeklärt'};
  // Blank form template ONLY. The online site must NEVER ship character records.
  const BASE = {
    uid:'',alias:'',name:'',sdnId:'',role:'',hasSecretIdentity:'',activityStatus:'',raceType:'',raceName:'',raceOrigin:'',raceFeatures:'',skillNotes:'',equipmentItems:'',costumeDescription:'',
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
  let characters=[],reports=[],fileNotes=[],selectedId='',activeTab='identity',view='directory',gmMode=false,hrMode=false,dispatcherMode=false;
  let directoryFilter='all', directoryPosition='all', directorySort='new', missionOwnership='all', missionCase='all', missionSort='new', missionSearch='';
  let directoryScroll=0, missionScroll=0, missionFilterOpen=false;
  let editTarget=null,editNew=false,nextChar=1,nextMission=1,nextTicket=1,reportFocus=null,missionFilter='all',reportEditTarget=null;
  let stagedPortrait=null, portraitPreviewUrl=null, revealedCivilNameFor=null;
  const backend=window.SDNBackend;
  const live=Boolean(backend?.enabled);
  const picked = () => characters.find(c=>c.uid===selectedId) || characters[0];
  const total = c => STAT_KEYS.reduce((v,[k])=>v+Number(c?.stats?.[k]||0),0);
  const stamp = () => new Date().toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});
  const berlinDate = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const editableKeys = ['name','alias','role','hasSecretIdentity','height','weight','age','sex','birthplace','birthday','classCode','raceType','raceName','raceOrigin','raceFeatures','skillNotes','equipmentItems','costumeDescription','hair','eyes','build','skin','distinguishing','description','impression','character','motivation','behavior','assessment','likes','dislikes','background','criminalRecord','formerAffiliations','medicalConditions','medicalInjuries','medicalTreatments','medicalAllergies','powerName','origin','powerDescription','weaknesses','generalWeaknesses','generalStrengths','generalAbilities'];
  const secretEditKeys = ['notes'];
  const fieldNames = {name:'Name',alias:'Alias',role:'Position',hasSecretIdentity:'Geheime Identität',height:'Größe',weight:'Gewicht',age:'Alter',sex:'Geschlecht',birthplace:'Geburtsort',birthday:'Geburtstag',discordChannelUrl:'Discord-Charakterkanal (URL)',classCode:'Fähigkeitsklasse',raceType:'Rasse',raceName:'Bezeichnung der Rasse',raceOrigin:'Herkunft der Rasse',raceFeatures:'Besonderheiten der Rasse',skillNotes:'Anmerkungen zur Skillmatrix',equipmentItems:'Ausstattung',costumeDescription:'Superheldenkostüm',hair:'Haarfarbe',eyes:'Augenfarbe',build:'Statur',skin:'Teint',distinguishing:'Besondere Merkmale',description:'Beschreibung des Aussehens',impression:'Besonderheiten',character:'Persönlichkeit',motivation:'Motivation',behavior:'Sozialverhalten',assessment:'Psychologisches Gutachten',likes:'Likes',dislikes:'Dislikes',background:'Hintergrundgeschichte',criminalRecord:'Strafregister',formerAffiliations:'Ehemalige Zugehörigkeiten',medicalConditions:'Vorerkrankungen / Dauerhafte Beschwerden',medicalInjuries:'Verletzungen / Medizinische Vorfälle',medicalTreatments:'Behandlungen / Operationen',medicalAllergies:'Allergien / Medizinische Einschränkungen',powerName:'Fähigkeitsname',origin:'Ursprung',powerDescription:'Beschreibung',weaknesses:'Schwächen',generalWeaknesses:'Allgemeine Schwächen',generalStrengths:'Allgemeine Stärken',generalAbilities:'Sonstige allgemeine Fähigkeiten',notes:'TOP SECRET'};
  const sensitiveKeys = new Set(['classCode','powerName','origin','powerDescription','weaknesses','generalWeaknesses','generalStrengths','generalAbilities','powers','stats']);
  const secretKeys = new Set(['notes']);
  const valueText = v => v === null || v === '' || v === undefined ? 'Keine Daten vorhanden' : typeof v==='object' ? JSON.stringify(v,null,2) : String(v);
  const statLabel = v => v === null || v === undefined || v === '' ? 'Keine Daten vorhanden' : String(v);
  const legacySecret = c => c.secret?.notes || [c.secret?.coverName,c.secret?.coverDetails].filter(Boolean).join(' — ') || '';
  const displayEmpty = v => String(v??'').trim() ? safe(v) : '<span class="missing-inline">Keine Daten vorhanden</span>';
  const pendingCount = c => c.proposals.filter(p=>p.status==='pending').length;
  const categoryFor = key => key==='stats'?'attribute':sensitiveKeys.has(key)?'ability':'normal';
  const fieldLocation = key => key in BASE.appearance?'appearance':key in BASE.personality?'personality':key in BASE.history?'history':secretKeys.has(key)?'secret':'root';
  const fieldValue = (c,key) => {const loc=fieldLocation(key);return loc==='root'?c?.[key]:c?.[loc]?.[key];};
  const setField = (c,key,value) => {const loc=fieldLocation(key);if(loc==='root')c[key]=value;else {c[loc] ||= {};c[loc][key]=value;}};
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
      return `<button type="button" class="sdn-directory-card sdn-position-${positionClass(c)}" data-directory-open="${safe(c.uid)}"><div class="sdn-dir-photo ${src?'':'no-photo'}">${src?`<img src="${safe(src)}" alt="Portrait von ${safe(c.alias)}" loading="lazy">`:`<span>${safe((c.alias||'?')[0])}</span>`}</div><div class="sdn-dir-details"><strong>${safe(c.alias||'UNBENANNT')}</strong><div class="sdn-position-row"><span class="sdn-position-tag">${safe(c.role||'Position unbekannt')}</span>${activityBadge(c)}</div><small>${safe(ownerName(c))}</small><div class="sdn-card-approval">${cardApproval(c.status!=='approved'||applications||changes,c.status==='approved',c.ownerId===backend?.userId)}${gmMode&&applications?'<span class="sdn-card-reason">NEUER ANTRAG</span>':''}${gmMode&&changes?'<span class="sdn-card-reason">ÄNDERUNG</span>':''}</div></div></button>`;
    }).join(''):'<div class="sdn-directory-empty">Keine Helden mit diesen Such- und Filtereinstellungen gefunden.</div>';
    // The archive uses normal document scrolling, not an internally scrollable canvas.
    $('directoryCards').querySelectorAll('[data-directory-open]').forEach(button=>button.addEventListener('click',()=>{
      directoryScroll=window.scrollY;
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
    const icons=[
      '<rect x="-11" y="-9" width="22" height="14" rx="4"/><path d="M-6 -9v7M0 -9v7M6 -9v7M-7 5v7H7V5M-11 -2c-3 2-3 6 0 8l4 2"/>',
      '<path d="M0 -12l9 3v8c0 6-5 9-9 12-4-3-9-6-9-12v-8z"/>',
      '<circle cx="-1" cy="-10" r="2.5"/><path d="M-3 -5l5 4 5-1 4 3M2 -1l-4 6-7 4M2 -1l2 6 6 5M-3 -4l-8 2"/>',
      '<path d="M-10 -8h20a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H0l-7 5V7h-3a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z"/><path d="M-6 -2h12M-6 2h8"/>',
      '<path d="M0 -11c-5-3-10 1-10 5-4 3-2 9 3 10 0 5 7 7 7 3 0 4 7 2 7-3 5-1 7-7 3-10 0-4-5-8-10-5v18M-8 -2l5 3M8 -2L3 1"/>'
    ];
    const labels=STAT_KEYS.map(([key,label],i)=>{const a=-Math.PI/2+2*Math.PI*i/5;const x=cx+Math.cos(a)*150,y=cy+Math.sin(a)*136;return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" class="sdn-radar-symbol" aria-label="${safe(label)}"><title>${safe(label)}</title>${icons[i]}</g>`}).join('');
    return `<div class="radar-wrap"><svg class="radar-svg" viewBox="0 0 380 337" role="img" aria-label="Radar-Diagramm: ${STAT_KEYS.map(([k,n])=>`${n} ${c.stats[k]} von 10`).join(', ')}"><polygon points="${polygon([10,10,10,10,10])}" fill="#e0e8d8" fill-opacity=".6"/>${grid}${axes}<polygon points="${polygon(values)}" fill="#d9813e" fill-opacity=".26" stroke="#db7530" stroke-width="3" stroke-linejoin="round"/>${ticks}${labels}</svg></div>`;
  }
  function statBars(c){return `<div class="stat-box"><div class="stat-box-header">ATTRIBUTE EVALUATION <span>${total(c)} / 27 PTS</span></div>${STAT_KEYS.map(([k,n])=>`<div class="stat-row"><span>${n}</span><div><b style="width:${Number(c.stats[k]||0)*10}%"></b></div><strong>${safe(statLabel(c.stats[k]))}${c.stats[k] == null?'':'/10'}</strong></div>`).join('')}<div class="stat-foot">WERTE VON 0,5 BIS 10 · 0,5ER-SCHRITTE · MAXIMAL 27 PUNKTE<br>Bei Erstanträgen maximal 15 Punkte und 6 pro Attribut.</div></div>`;}
  function recordPair(label,value){return `<div class="small-record"><small>${safe(label)}</small><strong>${label==='BÜRGERLICHER NAME' && String(value).startsWith('<span class="sdn-name-spoiler ') ? value : show(value)}</strong></div>`;}
  function subsection(label,value){return `<div class="dossier-section"><div class="tab-heading">${safe(label)}</div>${paragraph(value)}</div>`;}
  function missionCard(r,compact=false){
    const heroes=reportParticipants(r);
    const closed=caseState(r)==='closed';
    const badge=cardApproval(r.status==='pending',r.status==='approved',r.submittedByMe,r.status==='rejected');
    const dispatcher=reportDispatcher(r);
    const team=heroes.length?heroes.map(c=>safe(c.alias)).join(' · '):'Keine zugewiesenen Akten';
    const meta=[safe(r.date||r.startDate),safe(r.location||'Ohne Ortsangabe'),...(r.customer?[safe(r.customer)]:[])].filter(Boolean).join(' · ');
    return `<button type="button" class="mission-card sdn-case-card sdn-case-clickable" data-open-report="${safe(r.id)}" aria-label="Einsatzprotokoll ${safe(r.title)} öffnen"><h3>${safe(r.title)}</h3><div class="mission-card-meta" title="${meta}">${meta}</div><div class="sdn-case-classifications">${reportLevelBadge(r)}<span class="sdn-case-stamp ${closed?'is-closed':'is-open'}">${closed?'ABGESCHLOSSEN':'FALL OFFEN'}</span></div><div class="sdn-case-people">${dispatcher?`<p class="sdn-case-person-row" title="${safe(dispatcher.alias)}"><strong>DISPATCHER:</strong> <span>${safe(dispatcher.alias)}</span></p>`:''}<p class="sdn-case-person-row" title="${team}"><strong>TEAM:</strong> <span>${team}</span></p></div>${customerRatingHtml(r)}<div class="sdn-card-approval">${badge}</div></button>`;
  }
  function tabContent(c){
    switch(activeTab){
      case 'identity': {
        const raceType=String(c.raceType||'');
        const secretName=c.hasSecretIdentity==='yes' && String(c.name||'').trim().length>0;
        const concealed=secretName && revealedCivilNameFor!==c.uid;
        const civil=secretName
          ? `<span class="sdn-name-spoiler ${concealed?'is-concealed':'is-revealed'}"><span class="sdn-name-text">${concealed?'••••••••':show(c.name)}</span><button type="button" data-reveal-name="true" aria-label="Bürgerlichen Namen ${concealed?'anzeigen':'verbergen'}" aria-expanded="${!concealed}">${concealed?'ANZEIGEN':'VERBERGEN'}</button></span>`
          : (c.name||'');
        return `<div class="sdn-section-intro"><small>01 / PERSONENDATEN</small><h3>Identität</h3></div><div class="sdn-doc-grid">
          <div class="sdn-doc-column"><section class="sdn-paper-card"><h4>PERSONENDATEN</h4><div class="sdn-fact-lines">
            ${recordPair('BÜRGERLICHER NAME',civil)}
            ${recordPair('GESCHLECHT',({male:'Männlich',female:'Weiblich',diverse:'Divers'})[c.sex]||c.sex)}
            ${recordPair('GEHEIME IDENTITÄT',c.hasSecretIdentity==='yes'?'Ja':c.hasSecretIdentity==='no'?'Nein':'')}
            ${recordPair('ALTER',c.age)}${recordPair('GEBURTSTAG',c.birthday)}${recordPair('GEBURTSORT',c.birthplace)}
            ${recordPair('GRÖSSE',c.height)}${recordPair('GEWICHT',c.weight)}</div></section>
            <section class="sdn-paper-card"><h4>RASSE</h4><div class="sdn-fact-lines">${recordPair('RASSE',raceType==='human'?'Mensch':raceType==='other'?'Andere':'')}
              ${raceType==='other' ? `${recordPair('BEZEICHNUNG',c.raceName)}${recordPair('HERKUNFT DER RASSE',c.raceOrigin)}${recordPair('BESONDERHEITEN DER RASSE',c.raceFeatures)}` : ''}</div></section>
          </div><div class="sdn-doc-column"><section class="sdn-paper-card"><h4>ÄUSSERE MERKMALE</h4><div class="sdn-fact-lines">
            ${recordPair('HAARFARBE',c.appearance?.hair)}${recordPair('AUGENFARBE',c.appearance?.eyes)}
            ${recordPair('STATUR',c.appearance?.build)}${recordPair('HAUT / TEINT',c.appearance?.skin)}
            ${recordPair('BESONDERE MERKMALE',c.appearance?.distinguishing)}</div></section>
            <section class="sdn-paper-card"><h4>ERSCHEINUNGSBILD</h4>${paragraph(c.appearance?.description)}</section>
            <section class="sdn-paper-card"><h4>BESONDERHEITEN</h4>${paragraph(c.appearance?.impression)}</section>
          </div></div>`;
      }
      case 'attributes':return `<div class="sdn-section-intro"><small>02 / ATTRIBUTSVERTEILUNG</small><h3>Skillmatrix</h3></div><div class="sdn-skill-layout"><div class="sdn-skill-radar">${radar(c)}</div><div class="sdn-skill-side">${statBars(c)}<section class="sdn-paper-card sdn-skill-note"><h4>ANMERKUNGEN</h4>${paragraph(c.skillNotes)}</section>${c.proposals.some(p=>p.status==='pending')?'<p class="pending-hint">Neue Werte werden erst nach Freigabe sichtbar.</p>':''}</div></div>`;
      case 'abilities':return `<div class="sdn-section-intro"><small>03 / FÄHIGKEITSPROFIL</small><h3>Fähigkeiten</h3></div><div class="sdn-ability-stack">
        <section class="sdn-ability-area"><div class="sdn-ability-header"><h4>SPEZIALFÄHIGKEIT</h4></div><div class="sdn-ability-facts">${recordPair('FÄHIGKEIT',c.powerName)}${recordPair('KLASSE',c.classCode)}${recordPair('URSPRUNG',c.origin)}</div>
          ${subsection('BESCHREIBUNG',c.powerDescription)}${subsection('NACHTEIL/EINSCHRÄNKUNG/SCHWÄCHE',c.weaknesses)}
          <div class="tab-heading">MOVES / ANGRIFFE / UNTERFÄHIGKEITEN</div>
          ${c.powers?.length?`<div class="sdn-move-list">${c.powers.map((p,i)=>`<div class="sdn-move"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${show(p.title)}</strong>${paragraph(p.text)}</div></div>`).join('')}</div>`:'<div class="missing-field">Keine Daten vorhanden</div>'}
        </section><section class="sdn-ability-area sdn-general-area"><div class="sdn-ability-header"><h4>ALLGEMEINES PROFIL</h4></div>
          ${subsection('ALLGEMEINE STÄRKEN',c.generalStrengths)}${subsection('ALLGEMEINE SCHWÄCHEN',c.generalWeaknesses)}${subsection('SONSTIGE ALLGEMEINE FÄHIGKEITEN',c.generalAbilities)}
        </section></div>`;
      case 'equipment':return `<div class="sdn-section-intro"><small>04 / MATERIAL UND BEKLEIDUNG</small><h3>Ausrüstung</h3></div><div class="sdn-equipment-grid"><section class="sdn-paper-card"><h4>AUSSTATTUNG</h4>${paragraph(c.equipmentItems)}</section><section class="sdn-paper-card"><h4>SUPERHELDENKOSTÜM</h4>${paragraph(c.costumeDescription)}</section></div>`;
      case 'personality':return `<div class="sdn-section-intro"><small>05 / PERSONALBEURTEILUNG</small><h3>Charakter</h3></div><div class="sdn-doc-grid"><div class="sdn-doc-column">${subsection('PERSÖNLICHKEIT',c.personality?.character)}${subsection('MOTIVATION',c.personality?.motivation)}${subsection('VERHALTEN',c.personality?.behavior)}</div><div class="sdn-doc-column">${subsection('PSYCHOLOGISCHE EINSCHÄTZUNG',c.personality?.assessment)}${subsection('LIKES',c.personality?.likes)}${subsection('DISLIKES',c.personality?.dislikes)}</div></div>`;
      case 'history':return `<div class="sdn-section-intro"><small>06 / HISTORISCHE ANGABEN</small><h3>Historie</h3></div>${subsection('HINTERGRUNDGESCHICHTE',c.history?.background)}${subsection('STRAFREGISTER',c.history?.criminalRecord)}${subsection('EHEMALIGE ZUGEHÖRIGKEITEN',c.history?.formerAffiliations)}`;
      case 'medical':return `<div class="sdn-section-intro"><small>07 / ÄRZTLICHES GUTACHTEN</small><h3>Medizinische Akte</h3></div><div class="sdn-doc-grid"><div class="sdn-doc-column">${subsection('VORERKRANKUNGEN',c.history?.medicalConditions)}${subsection('ALLERGIEN / EINSCHRÄNKUNGEN',c.history?.medicalAllergies)}</div><div class="sdn-doc-column">${subsection('VERLETZUNGEN / VORFÄLLE',c.history?.medicalInjuries)}${subsection('BEHANDLUNGEN / OPERATIONEN',c.history?.medicalTreatments)}</div></div>`;
      case 'relationships':{
        if(c.status!=='approved')return '<div class="missing-field">Bekanntschaften können erst nach der Freigabe der Personalakte eingetragen werden.</div>';
        const linked=(c.relationships||[]).map(rel=>({rel,target:characters.find(ch=>ch.uid===rel.targetId)})).filter(item=>item.target);
        return `<div class="tab-heading heading-with-action"><span>BEKANNTSCHAFTEN / ${linked.length} EINTRÄGE</span><button type="button" class="paper-quick-action" data-add-related title="Neue Bekanntschaft beantragen">＋ BEKANNTSCHAFT</button></div><p class="subtle-paragraph">Eine Bekanntschaft besteht aus einer verlinkten Personalakte, der Beziehungsart und einer frei formulierten Beschreibung. Ergänzungen und Änderungen werden als Tickets eingereicht.</p><div class="relationship-grid">${linked.length?linked.map(({rel,target})=>`<article class="relationship-card"><div class="relationship-card-top"><div class="relationship-portrait ${target.photo?'':'placeholder'}">${target.photo?`<img src="${safe(live ? backend.imageUrl(target.photo) : target.photo)}" alt="Portrait von ${safe(target.alias)}" loading="lazy"/>`:`<span>${safe((target.alias||'?').charAt(0))}</span>`}</div><div class="relationship-card-ident"><small>PERSONALVERWEIS / #${safe(target.sdnId)}</small><h3>${safe(target.alias)}</h3><span>${safe(rel.type||'NICHT KLASSIFIZIERT')}</span></div></div><p>${show(rel.description)}</p><div class="relationship-actions"><button type="button" class="mini-action" data-open-related="${safe(target.uid)}">PERSONALAKTE ↗</button><button type="button" class="paper-icon-action" data-edit-related="${safe(target.uid)}" title="Bekanntschaft bearbeiten" aria-label="Bekanntschaft mit ${safe(target.alias)} bearbeiten">✎</button></div></article>`).join(''):'<div class="missing-field">Noch keine Bekanntschaften vermerkt. Über das Plus kann eine Verknüpfung zu einem anderen Charakter eingereicht werden.</div>'}</div>`;
      }

        case 'missions':{
        const missions=approvedFor(c.uid);
        const completed=missions.filter(r=>caseState(r)==='closed');
        const levelCounts=Object.fromEntries(REPORT_LEVELS.map(level=>[level,completed.filter(r=>String(r.level||'').toUpperCase()===level).length]));
        const levelSummary=`<section class="sdn-mission-level-summary" aria-label="Abgeschlossene Einsätze pro Level"><div class="tab-heading">ABGESCHLOSSENE EINSÄTZE NACH LEVEL</div><div class="sdn-mission-level-grid">${REPORT_LEVELS.map(level=>`<div class="sdn-mission-level-count sdn-level-count-${level.toLowerCase()}"><span>LEVEL ${level}</span><strong>${levelCounts[level]}</strong></div>`).join('')}</div></section>`;
        return `<div class="sdn-section-intro"><small>09 / EINSATZÜBERSICHT</small><h3>Einsätze</h3></div>${levelSummary}<div class="tab-heading">FREIGEGEBENE EINSATZAKTEN / ${missions.length} TREFFER</div><div class="mission-cards embedded">${missions.length?missions.map(r=>missionCard(r,true)).join(''):'<div class="missing-field">Für diese Person liegen derzeit keine freigegebenen Einsatzberichte vor.</div>'}</div><button class="mini-action under-missions" type="button" id="allMissions">ALLE EINSÄTZE ANSEHEN ↗</button>`;}
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
    const publicPortrait=c.photo?(live ? backend.imageUrl(c.photo) : c.photo):'';
    const channelLink=/^https:\/\/discord\.com\/channels\/\d+\/\d+$/.test(c.discordChannelUrl||'')
      ? `<a class="sdn-head-link" href="${safe(c.discordChannelUrl)}" target="_blank" rel="noopener noreferrer">↗ CHARAKTERKANAL</a>` : '';
    const forumWarning=gmMode && live && c.status==='approved' && !channelLink
      ? `<div class="sdn-publish-warning">Discord-Forenbeitrag noch nicht verknüpft. <button type="button" data-sync-forum="${safe(c.uid)}">FORENBEITRAG ERSTELLEN / ERNEUT VERSUCHEN</button></div>` : '';
    const publishWarning=gmMode && live && c.portrait?.preview && c.portrait.preview!==c.portrait.publishedPreview
      ? (()=>{const ticket=c.proposals.find(t=>t.status==='approved' && (t.isNew||t.operations.some(op=>op.kind==='portrait'&&op.after?.preview===c.portrait.preview)));return ticket?`<div class="sdn-publish-warning portrait-publication">Portrait genehmigt, aber noch nicht veröffentlicht. <button type="button" data-publish-portrait="${safe(ticket._dbId)}">VERÖFFENTLICHUNG ERNEUT VERSUCHEN</button></div>`:'';})() : '';
    $('recordBody').innerHTML=`<article class="paper-frame sdn-aktenblatt">
      <div class="paper-mast"><div><div class="paper-wordmark">S<span>D</span>N</div><small>SUPERHERO DISPATCH NETWORK / PERSONNEL DIVISION</small></div><div class="paper-serial">PERSONALAKTE <b>${safe(c.sdnId)}</b></div></div>
      <div class="file-main"><div class="sdn-head-layout"><div class="portrait-container ${publicPortrait?'':'placeholder'}">${publicPortrait?`<img src="${safe(publicPortrait)}" alt="Portrait von ${safe(c.alias)}" />`:`<span>${safe((c.alias||'?')[0])}</span>`}</div>
      <div class="sdn-head-data"><div class="eyebrow">PERSONALAKTE / ${safe(c.sdnId)}</div><div class="file-titleline"><div><h2>${safe(c.alias)}</h2><div class="sdn-head-badges"><span class="sdn-record-position sdn-position-${positionClass(c)}">${show(c.role)}</span>${activityBadge(c)}</div></div><div class="classification approval-stamp ${safe(c.status)}">${statusText(c.status)}</div></div>
        <div class="sdn-head-info"><div><small>SPIELER (DISCORD)</small><strong>${safe(ownerName(c))}</strong></div>${channelLink?`<div class="sdn-head-channel">${channelLink}</div>`:''}</div>
      </div></div></div>${publishWarning}${forumWarning}
      <nav class="paper-tabs" aria-label="Abschnitte der Personalakte" role="tablist">${tabs.map(([id,label])=>`<button class="paper-tab ${activeTab===id?'active':''} ${id==='secret'?'secret-tab':''}" type="button" role="tab" data-tab="${id}" aria-selected="${activeTab===id}">${label}</button>`).join('')}</nav>
      <section class="tab-content" role="tabpanel">${tabContent(c)}</section><div class="file-bottom"><span>SDN / ${safe(c.sdnId)}</span><span>INOFFIZIELLES DISPATCH-FANPROJEKT</span></div>
    </article>`;
    document.querySelectorAll('[data-sync-forum]').forEach(button=>button.addEventListener('click',async()=>{
      try{button.disabled=true;const response=await backend.syncCharacterForum(button.dataset.syncForum);
        await reloadRemote();
        if(!response.created && !response.alreadyLinked)alert('Kein Forenbeitrag erstellt. Bitte Supabase-Protokoll der Edge Function prüfen.');
      }catch(e){button.disabled=false;alert('Discord-Forenbeitrag noch nicht erstellt: '+e.message);}
    }));
    document.querySelectorAll('[data-publish-portrait]').forEach(button=>button.addEventListener('click',async()=>{
      try{button.disabled=true;await backend.publishPortrait(button.dataset.publishPortrait);await reloadRemote();}
      catch(e){button.disabled=false;alert('GitHub-Veröffentlichung fehlgeschlagen: '+e.message);}
    }));
    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.tab;renderRecord();}));
    $('recordBody').querySelector('[data-reveal-name]')?.addEventListener('click',()=>{revealedCivilNameFor=revealedCivilNameFor===c.uid?null:c.uid;renderRecord();});
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
    document.querySelectorAll('[data-remove-img]').forEach(b=>b.addEventListener('click',()=>openEdit(false,'12 / PORTRAIT')));
    document.querySelector('[data-add-related]')?.addEventListener('click',()=>openEdit(false,'10 / BEZIEHUNGEN',{addRelation:true}));
    document.querySelectorAll('[data-edit-related]').forEach(b=>b.addEventListener('click',()=>openEdit(false,'10 / BEZIEHUNGEN',{targetId:b.dataset.editRelated})));
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
    if(view==='missions')missionScroll=window.scrollY;
    reportFocus=b.dataset.openReport;navigate('mission-detail');
  }));}
  function renderMissions(){
    const root=$('missionsView');
    // In the detail state the archive is not mounted at all. Reviews happen here only.
    if(view==='mission-detail'){
      const report=reportFocus&&currentMission(reportFocus);
      root.innerHTML=`<div class="sdn-detail-topbar"><button type="button" class="sdn-return-button" id="backMissions">← ZUR EINSATZÜBERSICHT</button><div class="record-top-actions">${report?`${gmMode||(dispatcherMode&&report.submittedByMe)||!live?`<button type="button" class="text-button" id="reportChangesButton">ÄNDERUNGEN ${(report.edits||[]).filter(e=>e.status==='pending').length?`<b class="pending-counter">${(report.edits||[]).filter(e=>e.status==='pending').length}</b>`:''} <span>↗</span></button>`:''}<button type="button" class="text-button" id="printReportButton">DRUCKEN <span>↗</span></button>${gmMode&&report.status==='pending'?`<button type="button" class="outline-button" data-review-report="${safe(report.id)}:approve">BERICHT FREIGEBEN ✓</button><button type="button" class="outline-button" data-review-report="${safe(report.id)}:reject">ABLEHNEN</button>`:''}${gmMode&&report.status==='approved'?`<button type="button" class="outline-button" id="syncOperationForum">↗ DISCORD-NOTRUF SYNCHRONISIEREN</button>`:''}${gmMode?`<button type="button" class="outline-button sdn-danger-button" data-delete-report="${safe(report.id)}">EINSATZPROTOKOLL LÖSCHEN</button>`:''}${report.status==='approved'&&(gmMode||(dispatcherMode&&report.submittedByMe)||!live)?`<button type="button" class="outline-button" id="editReportButton">✎ DATEN BEARBEITEN</button>`:''}`:''}</div></div><div class="mission-detail">${report?reportDetail(report):'<div class="detail-empty"><h3>EINSATZAKTE NICHT GEFUNDEN</h3><p>Bitte zurück zum Einsatzarchiv wechseln.</p></div>'}</div>`;
      $('editReportButton')?.addEventListener('click',()=>openMissionDialog(report));
      $('syncOperationForum')?.addEventListener('click',async()=>{try{await backend.syncOperationForum(report._dbId);await reloadRemote();}catch(e){alert('Discord-Synchronisierung fehlgeschlagen: '+e.message);}});
      $('printReportButton')?.addEventListener('click',()=>window.print());
      $('reportChangesButton')?.addEventListener('click',()=>document.getElementById('reportEditRequests')?.scrollIntoView({behavior:'smooth',block:'start'}));
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
      root.innerHTML=`<div class="mission-dashboard"><div class="sdn-directory-filters sdn-report-filters"><label class="sdn-search-label">SUCHE<input type="search" id="missionSearch" placeholder="Einsatz, Kunde, Held, Discord ..." value="${safe(missionSearch)}" autocomplete="off"></label><details class="sdn-filter-menu" ${missionFilterOpen?'open':''}><summary>FILTER <span class="sdn-filter-chevron" aria-hidden="true">⌄</span></summary><div class="sdn-filter-popover"><label>ANZEIGE<select id="missionOwnership">${missionOptions.map(([v,l])=>`<option value="${v}" ${missionOwnership===v?'selected':''}>${l}</option>`).join('')}</select></label><label>FALLSTATUS<select id="missionCase"><option value="all" ${missionCase==='all'?'selected':''}>Alle Fälle</option><option value="open" ${missionCase==='open'?'selected':''}>Offen</option><option value="closed" ${missionCase==='closed'?'selected':''}>Abgeschlossen</option></select></label></div></details><label>SORTIEREN<select id="missionSort"><option value="new" ${missionSort==='new'?'selected':''}>Neueste zuerst</option><option value="old" ${missionSort==='old'?'selected':''}>Älteste zuerst</option></select></label></div><div class="sdn-directory-results"><span>${visible.length} EINSATZAKTEN</span>${gmMode||dispatcherMode||!live?`<button class="operation-add" type="button" id="newMission">＋ EINSATZPROTOKOLL ERSTELLEN</button>`:''}</div><div class="missions-catalog" id="missionCards" aria-label="Einsatzarchiv">${visible.length?visible.map(r=>missionCard(r)).join(''):'<div class="mission-empty">Keine Einsatzberichte mit diesen Filtern.</div>'}</div></div>`;
      $('newMission')?.addEventListener('click',()=>openMissionDialog());
      $('missionSearch').addEventListener('input',e=>{missionSearch=e.target.value;missionScroll=0;const caret=e.target.selectionStart;renderMissions();const next=$('missionSearch');next.focus();next.setSelectionRange(caret,caret);});
      $('missionOwnership').addEventListener('change',e=>{missionOwnership=e.target.value;missionScroll=0;renderMissions();});
      $('missionCase').addEventListener('change',e=>{missionCase=e.target.value;missionScroll=0;renderMissions();});
      $('missionSort').addEventListener('change',e=>{missionSort=e.target.value;missionScroll=0;renderMissions();});
      root.querySelector('.sdn-filter-menu')?.addEventListener('toggle',event=>{missionFilterOpen=event.currentTarget.open;});
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
      if(live){try{await backend.reviewReport(r._dbId,decision==='approve');await reloadRemote();if(decision==='approve') { try { await backend.syncOperationForum(r._dbId);await reloadRemote(); } catch(err) { alert('Bericht freigegeben, aber Discord-Veröffentlichung noch ausstehend: '+err.message); } }}catch(err){alert(err.message);}return;}
      r.status=decision==='approve'?'approved':'rejected';r.reviewed='Demo-Spielleitung · '+stamp();renderMissions();
    }));
    root.querySelectorAll('[data-review-report-edit]').forEach(b=>b.addEventListener('click',async()=>{
      if(!gmMode||view!=='mission-detail')return;
      const [id,action]=b.dataset.reviewReportEdit.split(':');
      const report=currentMission(reportFocus),ticket=report?.edits?.find(t=>t.id===id);
      if(!ticket||ticket.status!=='pending')return;
      if(action==='reject'&&!confirm('Diesen Änderungsantrag ablehnen?'))return;
      b.disabled=true;
      try{
        if(live){await backend.reviewReportEdit(id,action==='approve');await reloadRemote();if(action==='approve') { try { await backend.syncOperationForum(report._dbId);await reloadRemote(); } catch(err) { alert('Änderung genehmigt, Discord-Synchronisierung noch ausstehend: '+err.message); } }}
        else {
          if(action==='approve'){
            const conflict=Object.keys(ticket.patch).some(k=>JSON.stringify(report[k]??null)!==JSON.stringify(ticket.baseReport[k]??null));
            if(conflict)throw new Error('Konflikt: Eine der beantragten Angaben wurde inzwischen geändert.');
            Object.assign(report,ticket.patch);
          }
          ticket.status=action==='approve'?'approved':'rejected'; renderMissions();
        }
      }catch(err){b.disabled=false;alert('Änderungsantrag konnte nicht bearbeitet werden: '+err.message);}
    }));
    root.querySelectorAll('[data-open-character]').forEach(b=>b.addEventListener('click',()=>{selectedId=b.dataset.openCharacter;activeTab='missions';navigate('personnel');}));
  }
  function reportEditsHtml(r){
    const edits=(r.edits||[]);
    if(!gmMode && live && !r.submittedByMe)return '';
    const labels={title:'Einsatzbezeichnung',level:'Einsatzlevel',customer:'Kunde',outcome:'Abschluss / Ergebnis',customerStars:'Kundensterne',customerComment:'Kundenkommentar',startDate:'Einsatzbeginn',endDate:'Einsatzende',location:'Einsatzort',rpLink:'Link zum RP',participants:'Beteiligte Helden',dispatcherId:'Dispatcher',situation:'Ausgangslage',events:'Einsatzverlauf',damageStatus:'Zivile Infrastruktur betroffen',damages:'Schadensbericht',notes:'Zusatzvermerke'};
    const format=(key,value)=>{
      if(key==='participants')return Array.isArray(value)?value.map(id=>characters.find(c=>c.uid===id)?.alias||id).join(' · '):'—';
      if(key==='dispatcherId')return characters.find(c=>c.uid===value)?.alias||value||'—';
      if(key==='customerStars')return value?`${value}/5 ★`:'—';
      return value===undefined||value===null||value===''?'—':String(value);
    };
    const rows=edits.map(t=>{
      const keys=Object.keys(t.patch||{}).filter(key=>key!=='date'&&key!=='caseStatus');
      return `<article class="ticket-card"><div class="ticket-top"><div><span class="ticket-id">ÄNDERUNGSANTRAG · ${safe(String(t.id).slice(0,8).toUpperCase())}</span><h3>${safe(r.title)}</h3><small>${safe(t.time)} · ${safe(t.requestedBy)}</small></div><span class="report-status ${safe(t.status)}">${t.status==='pending'?'IN PRÜFUNG':t.status==='approved'?'GENEHMIGT':'ABGELEHNT'}</span></div><div class="ticket-comment"><span>ANMERKUNG ZUM ANTRAG</span><p>${safe(t.comment||'Keine Anmerkung hinzugefügt.')}</p></div><div class="ticket-difflist">${keys.map(key=>`<div class="ticket-diff"><div class="ticket-diff-label">${safe(labels[key]||key)}</div><div class="ticket-beforeafter"><div><small>VORHER</small><pre>${safe(format(key,t.baseReport?.[key]))}</pre></div><div><small>BEANTRAGT</small><pre>${safe(format(key,t.patch[key]))}</pre></div></div></div>`).join('')}</div>${gmMode&&t.status==='pending'?`<div class="ticket-review"><strong>ENTSCHEIDUNG DER SPIELLEITUNG</strong><div class="action-pair"><button type="button" data-review-report-edit="${safe(t.id)}:approve">✓ ÄNDERUNG GENEHMIGEN</button><button type="button" data-review-report-edit="${safe(t.id)}:reject">× ABLEHNEN</button></div></div>`:''}</article>`;
    }).join('');
    return `<div id="reportEditRequests" class="sdn-report-edits"><div class="tab-heading">ÄNDERUNGSANTRÄGE / ${edits.length}</div>${rows||'<div class="missing-field">Für dieses Einsatzprotokoll liegen noch keine Änderungsanträge vor.</div>'}</div>`;
  }
  function reportDetail(r){
    const participants=(r.participants||[]).map(id=>characters.find(c=>c.uid===id)).filter(Boolean);
    const dispatcher=reportDispatcher(r);
    return `<article class="report-paper"><div class="report-paper-bar"><span>SUPERHERO DISPATCH NETWORK // OPERATIONS</span><b>${safe(r.id)}</b></div><div class="report-paper-inner"><div class="report-main-heading"><div><span class="eyebrow">EINSATZBERICHT / FIELD REPORT</span><h2>${safe(r.title)}</h2></div><div class="sdn-report-detail-stamps"><div class="classification approval-stamp ${r.status==='approved'?'approved':'pending'}">${r.status==='approved'?'APPROVED':r.status==='pending'?'PENDING':'REJECTED'}<small>${r.status==='approved'?'SDN · VERIFIZIERT':r.status==='pending'?'REVIEW REQUIRED':'NICHT FREIGEGEBEN'}</small></div><div class="sdn-case-stamp ${caseState(r)==='closed'?'is-closed':'is-open'}">${caseState(r)==='closed'?'ABGESCHLOSSEN':'FALL OFFEN'}</div></div></div><div class="report-meta-grid">${[['AKTENNUMMER',r.id],['EINSATZLEVEL',REPORT_LEVELS.includes(String(r.level||'').toUpperCase()) ? String(r.level).toUpperCase() : 'Nicht eingestuft'],['EINSATZBEGINN',r.startDate||r.date],['EINSATZENDE',r.endDate||'Keine Daten vorhanden'],['EINSATZORT',r.location||'Unbekannt'],['ERGEBNIS',OUTCOMES[r.outcome]],['KUNDE',r.customer||'Keine Daten vorhanden']].map(([l,v])=>recordPair(l,v)).join('')}</div><div class="tab-heading spaced-heading">EINGESETZTES PERSONAL</div><div class="person-pills">${participants.map(c=>`<button class="person-pill" data-open-character="${safe(c.uid)}" type="button">${safe(c.alias)} <span>SDN #${safe(c.sdnId)} ↗</span></button>`).join('')}</div><div class="report-dispatcher-section"><div class="tab-heading">DISPATCHER</div>${dispatcher?`<button class="person-pill" data-open-character="${safe(dispatcher.uid)}" type="button">${safe(dispatcher.alias)} <span>SDN #${safe(dispatcher.sdnId)} ↗</span></button>`:'<p class="report-no-dispatcher">Nicht zugewiesen</p>'}</div>${subsection('01 / AUSGANGSLAGE',r.situation)}${subsection('02 / EINSATZVERLAUF',r.events)}<div class="tab-heading">03 / ZIVILE INFRASTRUKTUR</div><p class="report-emphasis">${safe(DAMAGE[r.damageStatus]||'Unbekannt')}</p>${r.damageStatus==='yes'?subsection('SCHADENSBERICHT',r.damages):''}${subsection('04 / ZUSATZVERMERKE',r.notes)}${customerRatingHtml(r,true)}${caseState(r)==='closed'?subsection('KUNDENKOMMENTAR',r.customerComment):''}${r.forumUrl&&/^https:\/\/discord\.com\/channels\/\d+\/\d+$/.test(r.forumUrl)?`<a class="report-rp-link" href="${safe(r.forumUrl)}" target="_blank" rel="noopener noreferrer">↗ NOTRUF IM DISCORD-FORUM</a>`:''}${r.rpLink&&/^https:\/\/(?:discord\.com|discordapp\.com)\/channels\/\d+\/\d+\/\d+$/.test(r.rpLink)?`<a class="report-rp-link" href="${safe(r.rpLink)}" target="_blank" rel="noopener noreferrer">↗ ZUM DISCORD-RP</a>`:''}${r.requestComment?subsection('ANMERKUNG ZUM ANTRAG',r.requestComment):''}<div class="report-conclusion">ABSCHLUSSVERMERK <strong>${safe(OUTCOMES[r.outcome]||'UNBEKANNT')}</strong></div><div class="report-signatures"><span>EINGEREICHT VON<br><strong>${safe(r.submitted)}</strong></span><span>FREIGABE<br><strong>${r.status==='approved'?safe(r.reviewed||'Spielleitung'):'NOCH NICHT FREIGEGEBEN'}</strong></span></div>${reportEditsHtml(r)}</div></article>`;
  }
  function navigate(to){
    const previousView=view;
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
    const backToDirectory=to==='directory' && previousView==='personnel';
    const backToMissions=to==='missions' && previousView==='mission-detail';
    requestAnimationFrame(()=>window.scrollTo({top:backToDirectory?directoryScroll:backToMissions?missionScroll:0,behavior:'instant'}));
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
    const nameFields=['name','alias'].map(key=>formInput(key,fieldNames[key],{max:150})).join('')+selectField('role','POSITION',[['','Position auswählen'],...positions.map(x=>[x,x])])+selectField('hasSecretIdentity','GEHEIME IDENTITÄT',[['','Bitte auswählen'],['yes','Ja'],['no','Nein']])+['age','height','weight','birthplace','birthday'].map(key=>formInput(key,fieldNames[key],{max:150})).join('')+selectField('sex','GESCHLECHT',[['','Bitte auswählen'],['male','Männlich'],['female','Weiblich'],['diverse','Divers']]);
    const appearance=['hair','eyes','build','skin','distinguishing'].map(k=>formInput(k,fieldNames[k])).join('')+['description','impression'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:2500})).join('');
    const raceFields=selectField('raceType','RASSE',[['','Keine Daten vorhanden'],['human','Mensch'],['other','Andere']])+
      `<div class="span2 sdn-race-details" id="raceOtherFields"><div class="form-grid">${formInput('raceName','BEZEICHNUNG DER RASSE',{max:150})}${formInput('raceOrigin','HERKUNFT DER RASSE',{area:true,wide:true,max:2500})}${formInput('raceFeatures','BESONDERHEITEN DER RASSE',{area:true,wide:true,max:3500})}</div></div>`;

    const classSelect=selectField('classCode','FÄHIGKEITSKLASSE',['','E','D','C','B','A','S'].map(x=>[x,x||'Keine Daten vorhanden']));
    const abilities=classSelect+['powerName','origin'].map(k=>formInput(k,fieldNames[k])).join('')+formInput('powerDescription','BESCHREIBUNG',{area:true,wide:true,max:5000})+formInput('weaknesses','SCHWÄCHEN',{area:true,wide:true,max:5000})+`<label class="span2">MOVES / ANGRIFFE / UNTERFÄHIGKEITEN (JE ZEILE „NAME | BESCHREIBUNG“)<textarea name="powersText" rows="5" maxlength="5000">${safe(editTarget.powers.map(p=>p.title+' | '+p.text).join('\n'))}</textarea></label>`+['generalWeaknesses','generalStrengths','generalAbilities'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:5000})).join('');
    const stats=`<div class="span2"><div class="stat-form" id="statForm">${STAT_KEYS.map(([k,n])=>`<label>${n}<input name="stat_${k}" type="number" min="0.5" max="${isNew?6:10}" step="0.5" value="${editTarget.stats[k]??''}" ${gmMode?'':'required'}/></label>`).join('')}</div><div class="stat-form-total" id="statTotal"></div><span class="field-hint">${isNew?'Neue Charaktere: maximal 15 Punkte insgesamt und 6 pro Attribut.':'Änderungen: maximal 27 Punkte insgesamt und 10 pro Attribut.'} Werte in 0,5er-Schritten. ${gmMode?'SL: Felder dürfen für „Keine Daten vorhanden“ leer bleiben.':''}</span></div>`+formInput('skillNotes','ANMERKUNGEN ZUR SKILLMATRIX',{area:true,wide:true,max:5000});
    const personal=['character','motivation','behavior','assessment','likes','dislikes'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:3000})).join('');
    const history=['background','criminalRecord','formerAffiliations'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:5000})).join('');
    const medical=['medicalConditions','medicalAllergies','medicalInjuries','medicalTreatments'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:3500})).join('');
    const equipment=['equipmentItems','costumeDescription'].map(k=>formInput(k,fieldNames[k],{area:true,wide:true,max:5000,rows:5})).join('');
    const relationsEditor='<div class="span2 relationship-editor-intro">Pro Bekanntschaft sind nur drei Angaben nötig: verknüpfter Charakter, Art der Beziehung und freier Beschreibungstext. Weitere Informationen kannst du jederzeit durch Bearbeiten des Textes ergänzen.</div><div class="span2" id="relationshipRows"></div><button class="relationship-add" id="addRelationship" type="button">＋ NEUE BEKANNTSCHAFT</button>';
    const secret=gmMode?`<label class="span2">TOP SECRET<textarea name="secretNotes" maxlength="7000" rows="7">${safe(legacySecret(editTarget))}</textarea></label>`:'';
    $('editFields').innerHTML=section('01 / PERSONALDATEN',nameFields,true)
      +section('02 / RASSE',raceFields,false)
      +section('03 / ERSCHEINUNGSBILD',appearance,false)
      +section('04 / SKILLMATRIX',stats,false)
      +section('05 / FÄHIGKEITEN',abilities,false)
      +section('06 / AUSRÜSTUNG',equipment,false)
      +section('07 / PSYCHOLOGISCHES GUTACHTEN',personal,false)
      +section('08 / HISTORIE',history,false)
      +section('09 / KRANKENAKTE',medical,false)
      +((!isNew&&editTarget.status==='approved')?section('10 / BEZIEHUNGEN',relationsEditor,false):'')
      +(gmMode?section('11 / TOP SECRET',secret,false):'')
      +section('12 / PORTRAIT',`<div class="span2 sdn-portrait-editor"><img id="portraitEditPreview" class="sdn-portrait-preview" src="${safe(editTarget.photo||'')}" alt="Aktueller Portraitausschnitt"/><div><div class="sdn-portrait-options"><input type="file" id="portraitFile" accept="image/png,image/jpeg,image/webp"/><button type="button" id="portraitPick">＋ BILD AUSWÄHLEN</button><button type="button" id="portraitRecrop" ${editTarget.portrait?.original?'':'disabled'}>✎ AUSSCHNITT BEARBEITEN</button></div><p class="sdn-portrait-note" id="portraitEditNote">Maximal 1 MB. Kein Ganzkörperbild – wähle einen gut erkennbaren Portraitausschnitt. Beachte die Bildrichtlinien des Discord-Servers.</p><div class="sdn-portrait-reference"><div class="sdn-portrait-reference-placeholder">BEISPIELPORTRAIT<br><small>MUSTERBILD FOLGT</small></div></div></div></div>`,true);
    document.querySelectorAll('#statForm input').forEach(input=>input.addEventListener('input',updateStatTotal));
    const updateRace=()=>{const other=$('editForm').elements.raceType?.value==='other';$('raceOtherFields').hidden=!other;};
    $('editForm').elements.raceType?.addEventListener('change',updateRace);updateRace();
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
    if(updates.raceType!=='other'){updates.raceName='';updates.raceOrigin='';updates.raceFeatures='';}
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

  function openMissionDialog(report=null){
    if(report && report.status!=='approved'){alert('Erst nach der Freigabe des Notrufs kann der Einsatz bearbeitet werden.');return;}
    if(live && !gmMode && !(dispatcherMode && (!report || report.submittedByMe))) { alert('Nur Dispatcher oder die SL dürfen Einsätze anlegen bzw. eigene Einsätze bearbeiten.'); return; }
    reportEditTarget=report;
    const creating=!report;
    const f=$('missionForm');f.reset();
    $('missionDialogTitle').textContent=creating?'NOTRUF ERSTELLEN':'EINSATZPROTOKOLL BEARBEITEN';
    $('missionDialogDescription').textContent=creating
      ?'Nach Freigabe durch die Spielleitung wird der offene Einsatz als Notruf im Discord-Forum veröffentlicht. Teilnehmer, RP-Link und Einsatzverlauf werden später ergänzt.'
      :'Änderungen an einem bestehenden Einsatzprotokoll werden als Antrag zur Freigabe eingereicht. Bis dahin bleibt der bisherige Bericht unverändert.';
    $('missionInitialStatus').hidden=!creating;
    document.querySelectorAll('#missionDialog [data-mission-edit-only]').forEach(el=>{el.hidden=creating;});
    f.elements.outcome.value='open';
    f.elements.startDate.value=berlinDate();
    f.elements.startDate.readOnly=true;
    f.elements.endDate.readOnly=true;
    f.elements.dispatcherId.required=true;
    const updateOutcome=()=>{
      const done=!creating && f.elements.outcome.value==='closed';
      f.elements.endDate.disabled=!done;
      f.elements.endDate.required=false;
      if(done && !f.elements.endDate.value)f.elements.endDate.value=berlinDate();
      if(!done){f.elements.endDate.value='';f.elements.customerStars.value='';f.elements.customerComment.value='';}
      $('missionCustomerReview').hidden=creating;
      $('missionCustomerReview').classList.toggle('is-disabled',!done);
      $('customerReviewHint').textContent=done?'OPTIONAL · Bei abgeschlossenen Einsätzen':'ERST BEI ABGESCHLOSSENEM FALL VERFÜGBAR';
      f.elements.customerStars.disabled=!done;
      f.elements.customerComment.disabled=!done;
      $('customerStarPreview').textContent=done&&f.elements.customerStars.value
        ?`${'★'.repeat(Number(f.elements.customerStars.value))}${'☆'.repeat(5-Number(f.elements.customerStars.value))}`:'☆☆☆☆☆';
      f.elements.events.required=done;
    };
    const updateDamage=()=>{const has=!creating&&f.elements.damageStatus.value==='yes';f.elements.damages.disabled=!has;if(!has)f.elements.damages.value='';};
    f.elements.outcome.onchange=updateOutcome;
    f.elements.damageStatus.onchange=updateDamage;
    f.elements.customerStars.onchange=updateOutcome;
    $('missionDispatcher').innerHTML='<option value="">Dispatcher auswählen</option>'+characters
      .filter(c=>c.status==='approved'&&String(c.role||'').trim().toLowerCase()==='dispatcher')
      .map(c=>`<option value="${safe(c.uid)}">${safe(c.alias)} · SDN #${safe(c.sdnId)}</option>`).join('');
    $('participantChecks').innerHTML=characters.filter(c=>!live||c.status==='approved')
      .map(c=>`<label class="participant-option"><input type="checkbox" name="participant" value="${safe(c.uid)}"><span>${safe(c.alias)} <small>#${safe(c.sdnId)}</small></span></label>`).join('');
    if(report){
      for(const key of ['title','level','customer','startDate','endDate','location','rpLink','situation','events','damageStatus','damages','notes','customerStars','customerComment','dispatcherId']){
        if(f.elements[key])f.elements[key].value=report[key]??(key==='startDate'?report.date||'':'');
      }
      f.elements.outcome.value=report.outcome==='open'?'open':'closed';
      $('participantChecks').querySelectorAll('input[name="participant"]').forEach(ch=>ch.checked=(report.participants||[]).includes(ch.value));
      // A closed report cannot be reopened after its Discord completion notification.
      f.elements.outcome.querySelector('option[value="open"]').disabled=f.elements.outcome.value==='closed';
    }else{
      f.elements.outcome.querySelector('option[value="open"]').disabled=false;
    }
    $('missionComment').value='';updateOutcome();updateDamage();
    $('missionError').textContent='';$('missionDialog').showModal();
  }

  function saveMission(evt){
    evt.preventDefault();
    const f=$('missionForm'),creating=!reportEditTarget;
    $('missionError').textContent='';
    const dispatcherId=String(f.elements.dispatcherId.value||'').trim();
    const dispatcher=characters.find(c=>String(c.uid)===dispatcherId && c.status==='approved' && String(c.role||'').trim().toLowerCase()==='dispatcher');
    if(!dispatcher){$('missionError').textContent='Bitte einen freigegebenen Dispatcher aus der Liste auswählen.';return;}
    const base={
      title:f.elements.title.value.trim(), level:f.elements.level.value,
      customer:f.elements.customer.value.trim(), location:f.elements.location.value.trim(),
      situation:f.elements.situation.value.trim(), dispatcherId
    };
    if(!REPORT_LEVELS.includes(base.level)){$('missionError').textContent='Bitte ein Einsatzlevel von E bis S auswählen.';return;}
    if(!base.title||!base.customer||!base.location||!base.situation){$('missionError').textContent='Einsatzname, Kunde, Einsatzort und Ausgangslage sind erforderlich.';return;}
    const comment=$('missionComment').value.trim();
    if(creating){
      // No advanced fields are sent when creating a callout. The SQL RPC sets
      // the official start date, initial state and empty advanced fields.
      const data={...base,requestComment:comment};
      if(live&&!gmMode&&!dispatcherMode){$('missionError').textContent='Nur Dispatcher und die SL dürfen Einsätze anlegen.';return;}
      if(live){
        backend.submitReport(data).then(async id=>{
          reportFocus=id;missionFilter='all';$('missionDialog').close();await reloadRemote();navigate('mission-detail');
        }).catch(e=>{$('missionError').textContent='Notruf nicht gespeichert: '+e.message;});return;
      }
      const id='OPS-'+String(nextMission++).padStart(4,'0');
      reports.unshift({...base,id,startDate:berlinDate(),date:berlinDate(),endDate:'',outcome:'open',caseStatus:'open',
        participants:[],rpLink:'',events:'',damageStatus:'no',damages:'',notes:'',customerStars:'',customerComment:'',
        requestComment:comment,status:'pending',submitted:'Demo-Spieler · '+stamp(),reviewed:''});
      reportFocus=id;missionFilter='all';$('missionDialog').close();navigate('mission-detail');return;
    }
    const original=reportEditTarget;
    const closed=f.elements.outcome.value==='closed';
    const currentClosed=original.outcome!=='open';
    if(currentClosed&&!closed){$('missionError').textContent='Ein abgeschlossener Einsatz kann nicht wieder auf Offen gestellt werden.';return;}
    const participants=[...$('participantChecks').querySelectorAll('input:checked')].map(el=>el.value);
    const rpLink=f.elements.rpLink.value.trim();
    if(rpLink&&!/^https:\/\/(?:discord\.com|discordapp\.com)\/channels\/\d+\/\d+\/\d+$/.test(rpLink)){
      $('missionError').textContent='Bitte einen Discord-Link zur ersten RP-Nachricht eintragen.';return;
    }
    if(closed&&(!f.elements.events.value.trim()||!participants.length)){
      $('missionError').textContent='Zum Abschluss werden ein Einsatzverlauf und mindestens ein beteiligter Held benötigt.';return;
    }
    const damageStatus=f.elements.damageStatus.value;
    const candidate={...base,
      startDate:original.startDate||original.date,date:original.date||original.startDate,
      outcome:closed?'closed':'open',caseStatus:closed?'closed':'open',
      endDate:closed?(currentClosed?original.endDate:berlinDate()):'',
      customerStars:closed?f.elements.customerStars.value:'',customerComment:closed?f.elements.customerComment.value.trim():'',
      rpLink,participants,events:f.elements.events.value.trim(),
      damageStatus,damages:damageStatus==='yes'?f.elements.damages.value.trim():'',notes:f.elements.notes.value.trim()
    };
    const fields=['title','level','customer','endDate','location','rpLink','customerStars','customerComment','situation','events','outcome','caseStatus','damageStatus','damages','notes','dispatcherId','participants'];
    const patch=Object.fromEntries(fields.filter(k=>JSON.stringify(original[k]??null)!==JSON.stringify(candidate[k]??null)).map(k=>[k,candidate[k]]));
    if(!Object.keys(patch).length){$('missionError').textContent='Es wurden keine Änderungen vorgenommen.';return;}
    if(live){
      backend.submitReportEdit(original._dbId,candidate,comment).then(async()=>{
        reportFocus=original.id;$('missionDialog').close();reportEditTarget=null;await reloadRemote();navigate('mission-detail');
      }).catch(e=>{$('missionError').textContent='Änderungsantrag konnte nicht gespeichert werden: '+e.message;});return;
    }
    original.edits=original.edits||[];
    original.edits.unshift({id:'local-edit-'+String(nextTicket++),time:stamp(),comment,requestedBy:'Demo-Spieler',status:'pending',baseReport:clone(original),patch});
    reportFocus=original.id;$('missionDialog').close();reportEditTarget=null;navigate('mission-detail');
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
      if(!sess){showGate('PERSONNEL ACCESS','Für den SDN-Zugang benötigst du eine Freigaberolle der Spielleitung. Stelle deine Charakteridee zunächst im Discord-Ticketsystem vor.',true);return;}
      const role=await backend.verify();
      if(!role.member){showGate('ACCESS DENIED','Du benötigst die SDN-Zugangsrolle. Reiche deine Charakteridee zuerst über ein Discord-Ticket bei der Spielleitung ein.');return;}
      gmMode=role.admin;hrMode=Boolean(role.hr);dispatcherMode=Boolean(role.dispatcher);renderGM();
      // An SL visit retries queued forum publications after temporary Discord outages.
      if (gmMode) {
        try { await backend.syncCharacterForum(); await backend.syncOperationForum(); }
        catch (e) { console.warn('Forum-Synchronisierung ausstehend:', e.message); }
      }
      await reloadRemote();navigate('directory');
      // Discord posts link directly to the approved personnel file.
      const requested = new URLSearchParams(location.search).get('character')
        || sessionStorage.getItem('sdn_requested_character');
      if (requested && /^[0-9a-f-]{36}$/i.test(requested)) {
        sessionStorage.removeItem('sdn_requested_character');
        const linked = characters.find(c => c.uid === requested && c.status === 'approved');
        if (linked) { selectedId=linked.uid;activeTab='identity';navigate('personnel'); }
      }
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
        try{const fresh=await backend.verify();if(!fresh.member){showGate('ACCESS REVOKED','Deine SDN-Zugangsrolle wurde nicht mehr bestätigt.');return;}gmMode=fresh.admin;hrMode=Boolean(fresh.hr);dispatcherMode=Boolean(fresh.dispatcher);renderGM();}
        catch{showGate('ACCESS PAUSED','Sicherheitsprüfung nicht möglich. Bitte Seite neu laden.');}
      },2*60*1000);
    }catch(error){showGate('VERBINDUNG FEHLGESCHLAGEN',error.message);}
  }
  $('authLogin').addEventListener('click',()=>{
    const wanted=new URLSearchParams(location.search).get('character');
    if(wanted && /^[0-9a-f-]{36}$/i.test(wanted)) sessionStorage.setItem('sdn_requested_character',wanted);
    backend.login().catch(e=>showGate('LOGIN FEHLGESCHLAGEN',e.message,true));
  });
  $('authRetry').addEventListener('click',()=>location.reload());
  startOnline();
})();
