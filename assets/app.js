import { cloudProgress } from './cloud-progress.js';
const ROUTES = [
  ['home','<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/></svg>','Início'],
  ['edits','<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5v-16ZM5 5.5v16M8 7h8M8 11h7"/></svg>','Banco e editais'],
  ['questions','<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM8 7h8M8 11h6M8 15h4"/></svg>','Banco de questões'],
  ['proofs','<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM15 3v5h5M8 14l2 2 5-5"/></svg>','Provas aplicadas'],
  ['simulations','<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a9 9 0 1 0 9 9M12 7v5l3 2M12 3v4"/></svg>','Simulados'],
  ['review','<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11a8 8 0 1 0 2 5M20 11V5M20 11h-6"/></svg>','Revisar'],
  ['performance','<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6"/></svg>','Desempenho'],
  ['import','<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 16V4M8 8l4-4 4 4M5 14v5h14v-5"/></svg>','Importar provas'],
  ['settings','<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M11 16v4"/></svg>','Ajustes e dados']
];

const state = {
  questions: [], meta: {}, competitions: [], editais: [], officialExams: [], filtered: [],
  session: null, timer: null, startedAt: null, currentView: 'home', hiddenAt: null, syncLabel: 'Release publicada', cloud: {status:'loading',email:'',profileId:'',message:''}
};

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const fmt = n => new Intl.NumberFormat('pt-BR').format(n || 0);
const uniq = arr => [...new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ''))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true}));
const escapeHtml = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const seconds = ms => Math.max(0, Math.floor(ms/1000));
const clock = sec => `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;

class ProgressStore {
  constructor(){ this.key='plataforma.questoes.progress.v1'; }
  load(){ try { return this.normalize(JSON.parse(localStorage.getItem(this.key))); } catch { return this.empty(); } }
  empty(){ return {history:[], marked:{}, errors:{}, reviews:{}, notes:{}, activeSession:null, version:1}; }
  normalize(raw){
    const base=this.empty();
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) return base;
    const objectOrEmpty=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    return {
      ...base,
      version:Number.isFinite(raw.version)?raw.version:1,
      history:Array.isArray(raw.history)?raw.history.filter(x=>x&&typeof x==='object'):[],
      marked:objectOrEmpty(raw.marked),
      errors:objectOrEmpty(raw.errors),
      reviews:objectOrEmpty(raw.reviews),
      notes:objectOrEmpty(raw.notes),
      activeSession:raw.activeSession&&typeof raw.activeSession==='object'&&!Array.isArray(raw.activeSession)?raw.activeSession:null
    };
  }
  save(data){ localStorage.setItem(this.key, JSON.stringify(data)); window.dispatchEvent(new CustomEvent('progress:changed')); }
  mutate(fn){ const d=this.load(); fn(d); this.save(d); return d; }
  clear(){ localStorage.removeItem(this.key); }
}
const store = new ProgressStore();

async function loadRelease(){
  const stamp=Date.now();
  const names=['questions','metadata','competitions','editais','tjdft-provas'];
  const payloads=await Promise.all(names.map(name=>fetch('./data/'+name+'.json?refresh='+stamp,{cache:'no-store'}).then(response=>{
    if(!response.ok) throw new Error('Falha ao carregar '+name+'.json');
    return response.json();
  })));
  return payloads;
}

async function boot(){
  try{
    const [q,m,c,e,p]=await loadRelease();
    state.questions=q; state.meta=m; state.competitions=c; state.editais=e; state.officialExams=p; state.filtered=[...q];
    state.syncLabel=state.meta.sampleMode?'Amostra local':'Release publicada';
    renderNav(); bindGlobal(); populateFilters(); applyFilters(); renderAll();
    const progress=store.load(); if(progress.activeSession) hydrateSession(progress.activeSession);
    void initCloudProgress();
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }catch(err){
    document.body.innerHTML='<main style="padding:32px"><h1>Não foi possível carregar a release.</h1><p>'+escapeHtml(err.message)+'</p></main>';
  }
}

async function refreshRelease(){
  const buttons=$$('[data-refresh-release]');
  buttons.forEach(button=>{button.disabled=true;button.classList.add('is-refreshing');});
  const label=$('#refreshLabel'); if(label) label.textContent='Atualizando…';
  state.syncLabel='Consultando release…';
  const status=$('#syncStatus'); if(status) status.textContent=state.syncLabel;
  try{
    const [q,m,c,e,p]=await loadRelease();
    state.questions=q; state.meta=m; state.competitions=c; state.editais=e; state.officialExams=p; state.filtered=[...q];
    state.syncLabel='Atualizada · '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    populateFilters(); applyFilters(); renderAll();
    toast('Release atualizada: '+fmt(q.length)+' questões disponíveis.');
  }catch(err){
    state.syncLabel='Atualização indisponível';
    toast('Não foi possível atualizar a release publicada.');
  }finally{
    buttons.forEach(button=>{button.disabled=false;button.classList.remove('is-refreshing');});
    if(label) label.textContent='Atualizar';
    const currentStatus=$('#syncStatus'); if(currentStatus) currentStatus.textContent=state.syncLabel;
  }
}

function saveHistoryIfChanged(history){
  const next=Array.isArray(history)?history:[];
  const current=store.load().history;
  if(JSON.stringify(current)!==JSON.stringify(next))store.mutate(progress=>{progress.history=next;});
}
async function syncCloudProgress(options={}){
  const cloud=cloudProgress.snapshot;
  if(!cloud.authenticated)return;
  const result=await cloudProgress.syncLocal(store.load().history);
  if(result.history)saveHistoryIfChanged(result.history);
  if(!result.synced)return;
  try{
    const remote=await cloudProgress.loadCloudHistory();
    saveHistoryIfChanged(cloudProgress.mergeHistory(store.load().history,remote));
    if(!options.silent)toast('Progresso sincronizado entre os aparelhos.');
  }catch{
    if(!options.silent)toast('Progresso salvo localmente; tente sincronizar novamente.');
  }
}
function renderCloudAccount(){
  const cloud=state.cloud||cloudProgress.snapshot;
  const statusLabels={loading:'Conectando…',signed_out:'Modo local',pending:'Link enviado',authenticated:'Sincronizado',syncing:'Sincronizando…',error:'Indisponível'};
  const statusEl=$('#cloudStatus'); if(statusEl)statusEl.textContent=statusLabels[cloud.status]||'Modo local';
  const description=$('#cloudDescription');
  if(description){
    const defaultText=cloud.status==='signed_out'?'Entre com seu e-mail para levar tentativas e desempenho para outro aparelho.':cloud.status==='pending'?'Abra o link recebido por e-mail para concluir o acesso.':cloud.status==='authenticated'?'Sua conta está conectada. O conteúdo continua público no GitHub; somente seu progresso vai para o Supabase.':cloud.status==='syncing'?'Enviando tentativas e sessões recentes…':'Sincronização temporariamente indisponível. O progresso local continua salvo.';
    description.textContent=cloud.message||defaultText;
  }
  const signedIn=Boolean(cloud.profileId)&&['authenticated','syncing','error'].includes(cloud.status);
  $('#cloudSignedOut')?.classList.toggle('hidden',signedIn);
  $('#cloudSignedIn')?.classList.toggle('hidden',!signedIn);
  const email=$('#cloudAccountEmail'); if(email)email.textContent=cloud.email||'';
}
async function requestCloudAccess(){
  const input=$('#cloudEmail'), button=$('#cloudSignIn');
  try{
    if(button)button.disabled=true;
    await cloudProgress.requestMagicLink(input?.value||'');
    toast('Link de acesso enviado. Confira seu e-mail.');
  }catch(error){toast(error.message||'Não foi possível enviar o link.');}
  finally{if(button)button.disabled=false;renderCloudAccount();}
}
async function initCloudProgress(){
  cloudProgress.subscribe(cloud=>{state.cloud=cloud;renderCloudAccount();});
  try{
    await cloudProgress.init();
    if(cloudProgress.snapshot.authenticated)await syncCloudProgress({silent:true});
  }catch{renderCloudAccount();}
}
function enrichAnswer(answer){
  const question=state.questions.find(item=>item.id===answer.questionId);
  return Object.assign({},answer,{
    disciplina:answer.disciplina||question?.disciplina||'',
    assunto:answer.assunto||question?.assunto||'',
    correctAnswer:answer.correctAnswer||question?.gabarito||null
  });
}
function trendChart(points){
  if(!points.length)return '<div class="empty-state">Conclua uma sessão para ver a evolução.</div>';
  const width=720,height=250,left=42,right=18,top=20,bottom=38;
  const innerWidth=width-left-right,innerHeight=height-top-bottom;
  const x=index=>points.length===1?left+innerWidth/2:left+(innerWidth*index/(points.length-1));
  const y=value=>top+innerHeight-(Math.max(0,Math.min(100,value))*innerHeight/100);
  const grid=[0,25,50,75,100].map(value=>'<line x1="'+left+'" x2="'+(width-right)+'" y1="'+y(value)+'" y2="'+y(value)+'" class="chart-grid-line"/><text x="4" y="'+(y(value)+4)+'" class="chart-axis-label">'+value+'%</text>').join('');
  const line=points.map((point,index)=>x(index)+','+y(point.value)).join(' ');
  const dots=points.map((point,index)=>'<circle cx="'+x(index)+'" cy="'+y(point.value)+'" r="5" class="chart-dot"><title>'+escapeHtml(point.label)+': '+point.value.toFixed(1)+'%</title></circle>').join('');
  const labels=points.map((point,index)=>index===0||index===points.length-1?'<text x="'+x(index)+'" y="'+(height-10)+'" text-anchor="'+(index===0?'start':'end')+'" class="chart-axis-label">'+escapeHtml(point.label)+'</text>':'').join('');
  return '<svg class="trend-chart" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Evolução da precisão por sessão">'+grid+'<polyline points="'+line+'" class="chart-line"/>'+dots+labels+'</svg>';
}

function renderNav(){
  $('#nav').innerHTML=ROUTES.map(([id,icon,label])=>`<button type="button" data-go="${id}" class="${id==='home'?'active':''}"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('');
}

function questionBelongsTo(q,competitionId){
  const hay=[q.orgao,q.cargo,q.nomeMaterial].filter(Boolean).join(' ');
  if(competitionId==='seedf') return /SEEDF/i.test(hay);
  if(competitionId==='tjdft') return /TJDFT|Tribunal de Justiça do Distrito Federal/i.test(hay);
  if(competitionId==='sedes-df-2026') return /SEDES/i.test(hay);
  return false;
}

function buildVerticalizedEditais(){
  return state.editais.map(config=>{
    const pool=state.questions.filter(q=>questionBelongsTo(q,config.competitionId));
    const cargoValues=[...new Set(pool.map(q=>String(q.cargo||'').trim()).filter(Boolean))];
    const splitByCargo=cargoValues.length>1;
    const byDiscipline=new Map();
    pool.forEach(q=>{
      const discipline=String(q.disciplina||'Sem disciplina').trim()||'Sem disciplina';
      const cargo=String(q.cargo||'Sem cargo').trim()||'Sem cargo';
      const assunto=String(q.assunto||'').trim();
      const axisKey=splitByCargo?cargo+'::'+discipline:discipline;
      if(!byDiscipline.has(axisKey)) byDiscipline.set(axisKey,{label:splitByCargo?cargo+' · '+discipline:discipline,questionCount:0,unmappedCount:0,topics:new Map(),orgao:q.orgao||'',cargo:splitByCargo?cargo:''});
      const axis=byDiscipline.get(axisKey); axis.questionCount++;
      if(!assunto){axis.unmappedCount++;return;}
      const topicKey=splitByCargo?cargo+'::'+assunto:assunto;
      if(!axis.topics.has(topicKey)) axis.topics.set(topicKey,{label:assunto,questionCount:0,subassuntos:new Set(),filter:{orgao:q.orgao||axis.orgao,cargo:splitByCargo?cargo:'',disciplina:discipline,assunto}});
      const topic=axis.topics.get(topicKey); topic.questionCount++;
      const subassunto=String(q.subassunto||'').trim(); if(subassunto) topic.subassuntos.add(subassunto);
    });
    const axes=[...byDiscipline.values()].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR',{numeric:true})).map(axis=>({
      ...axis,
      topics:[...axis.topics.values()].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR',{numeric:true})).map(topic=>({...topic,subassuntos:[...topic.subassuntos].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}))}))
    }));
    const mappedQuestionCount=axes.reduce((sum,axis)=>sum+axis.topics.reduce((inner,topic)=>inner+topic.questionCount,0),0);
    return {...config,questionCount:pool.length,mappedQuestionCount,unmappedQuestionCount:pool.length-mappedQuestionCount,axisCount:axes.length,axes,questionFilter:{orgao:pool[0]?.orgao||''},mappingNote:pool.length?'Tópicos derivados da taxonomia publicada de disciplina e assunto'+(splitByCargo?' e separados por cargo.':'.'):'Ainda não há questões desta trilha na release publicada.'};
  });
}

function bindGlobal(){
  document.addEventListener('click', e=>{
    const topic=e.target.closest('[data-topic-orgao]'); if(topic){openTopic(topic.dataset.topicOrgao,topic.dataset.topicDisciplina,topic.dataset.topicAssunto,topic.dataset.topicCargo);return;}
    const edital=e.target.closest('[data-edital-filter]'); if(edital){openCompetition(edital.dataset.editalFilter);return;}
    const quick=e.target.closest('[data-quick-filter]'); if(quick){openQuickFilter(quick.dataset.quickFilter);return;}
    const refresh=e.target.closest('[data-refresh-release]'); if(refresh){refreshRelease();return;}
    const go=e.target.closest('[data-go]'); if(go){navigate(go.dataset.go);}
  });
  $('#menuButton').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  $('#themeButton').addEventListener('click',()=>{
    const root=document.documentElement; const dark=root.dataset.theme==='dark'; root.dataset.theme=dark?'light':'dark'; localStorage.setItem('plataforma.questoes.theme',root.dataset.theme);
  });
  const savedTheme=localStorage.getItem('plataforma.questoes.theme'); if(savedTheme) document.documentElement.dataset.theme=savedTheme;
  $('#globalSearch').addEventListener('input',e=>{ if(state.currentView!=='questions') navigate('questions'); $('#filterText').value=e.target.value; applyFilters(); });
  document.addEventListener('keydown',e=>{ if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus();}});
  $('#clearFilters').addEventListener('click',()=>{ ['filterOrgao','filterCargo','filterBanca','filterAno','filterDisciplina','filterAssunto','filterFormato'].forEach(id=>$('#'+id).value=''); $('#filterText').value=''; $('#globalSearch').value=''; applyFilters(); });
  ['filterOrgao','filterCargo','filterBanca','filterAno','filterDisciplina','filterAssunto','filterFormato'].forEach(id=>$('#'+id).addEventListener('change',applyFilters));
  $('#filterText').addEventListener('input',applyFilters);
  $('#startSession').addEventListener('click',startSessionFromFilters);
  $('#prevQuestion').addEventListener('click',()=>moveQuestion(-1));
  $('#nextQuestion').addEventListener('click',()=>moveQuestion(1));
  $('#confirmAnswer').addEventListener('click',confirmAnswer);
  $('#finishSession').addEventListener('click',finishSession);
  $('#markQuestion').addEventListener('click',toggleMarked);
  $('#redoErrors').addEventListener('click',redoErrors);
  $('#importFile').addEventListener('change',validateImport);
  $('#exportProgress').addEventListener('click',exportProgress);
  $('#resetProgress').addEventListener('click',resetProgress);
  $('#cloudSignIn')?.addEventListener('click',requestCloudAccess);
  $('#cloudEmail')?.addEventListener('keydown',event=>{if(event.key==='Enter')requestCloudAccess();});
  $('#cloudSync')?.addEventListener('click',()=>syncCloudProgress());
  $('#cloudSignOut')?.addEventListener('click',async()=>{await cloudProgress.signOut();toast('Conta desconectada.');renderCloudAccount();});
  window.addEventListener('online',()=>syncCloudProgress({silent:true}));
  document.addEventListener('visibilitychange',handleVisibilityChange);
  window.addEventListener('pagehide',pauseSessionForExit);
  window.addEventListener('pageshow',resumeSessionAfterReturn);
  window.addEventListener('progress:changed',()=>renderAll());
}

function navigate(view){
  if(view==='resolver' && !state.session) return;
  state.currentView=view;
  $$('.view').forEach(v=>v.classList.toggle('hidden',v.dataset.view!==view));
  $$('#nav [data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===view));
  $('#sidebar').classList.remove('open');
  $('#main').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'smooth'});
  if(view==='review') renderReview(); if(view==='performance') renderPerformance();
}

function resetQuestionFilters(){
  ['filterOrgao','filterCargo','filterBanca','filterAno','filterDisciplina','filterAssunto','filterFormato'].forEach(id=>{const el=$('#'+id);if(el)el.value='';});
  $('#filterText').value=''; $('#globalSearch').value='';
}
function setQuestionFilter(id,value){
  const el=$('#'+id); if(!el)return;
  el.value=[...el.options].some(option=>option.value===value)?value:'';
}
function openTopic(orgao,disciplina,assunto,cargo){
  navigate('questions'); resetQuestionFilters();
  setQuestionFilter('filterOrgao',orgao); setQuestionFilter('filterCargo',cargo); setQuestionFilter('filterDisciplina',disciplina); setQuestionFilter('filterAssunto',assunto);
  applyFilters();
  if(state.filtered.length){ startSessionFromFilters(); }
  else toast('Nenhuma questão encontrada neste tópico.');
}
function openCompetition(competitionId){
  const sample=state.questions.find(q=>questionBelongsTo(q,competitionId));
  navigate('questions'); resetQuestionFilters();
  if(sample) setQuestionFilter('filterOrgao',sample.orgao);
  applyFilters();
  toast(sample?fmt(state.filtered.length)+' questões nesta trilha.':'Ainda não há questões publicadas nesta trilha.');
}
function openQuickFilter(quickFilter){
  if(quickFilter==='seedf'){openCompetition('seedf');return;}
  navigate('questions'); resetQuestionFilters(); applyFilters();
}
function populateSelect(id, values, label='Todos'){
  const el=$('#'+id), old=el.value; el.innerHTML=`<option value="">${label}</option>`+uniq(values).map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if([...el.options].some(o=>o.value===old)) el.value=old;
}
function populateFilters(){
  populateSelect('filterOrgao',state.questions.map(q=>q.orgao));
  populateSelect('filterCargo',state.questions.map(q=>q.cargo));
  populateSelect('filterBanca',state.questions.map(q=>q.banca));
  populateSelect('filterAno',state.questions.map(q=>q.ano));
  populateSelect('filterDisciplina',state.questions.map(q=>q.disciplina));
  populateSelect('filterAssunto',state.questions.map(q=>q.assunto));
  populateSelect('filterFormato',state.questions.map(q=>q.formato));
}

function applyFilters(){
  const f={orgao:$('#filterOrgao').value,cargo:$('#filterCargo').value,banca:$('#filterBanca').value,ano:$('#filterAno').value,disciplina:$('#filterDisciplina').value,assunto:$('#filterAssunto').value,formato:$('#filterFormato').value,text:$('#filterText').value.trim().toLowerCase()};
  state.filtered=state.questions.filter(q=>{
    if(f.orgao && q.orgao!==f.orgao) return false; if(f.cargo && q.cargo!==f.cargo) return false; if(f.banca && q.banca!==f.banca) return false;
    if(f.ano && String(q.ano)!==f.ano) return false; if(f.disciplina && q.disciplina!==f.disciplina) return false; if(f.assunto && q.assunto!==f.assunto) return false; if(f.formato && q.formato!==f.formato) return false;
    if(f.text){ const hay=[q.enunciado,q.disciplina,q.assunto,q.subassunto,q.cargo,q.banca,q.nomeMaterial].join(' ').toLowerCase(); if(!hay.includes(f.text)) return false; }
    return true;
  });
  const n=state.filtered.length; $('#availableCount').textContent=`${fmt(n)} ${n===1?'questão disponível':'questões disponíveis'}`; $('#sessionSize').max=Math.max(1,n); if(+$('#sessionSize').value>n) $('#sessionSize').value=Math.max(1,n);
  const active=Object.entries(f).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`); $('#filterSummary').textContent=active.length?active.join(' · '):'Sem filtros adicionais.';
  renderQuestionPreview();
}

function renderQuestionPreview(){
  const list=state.filtered.slice(0,40); const root=$('#questionPreview');
  if(!list.length){root.innerHTML='<div class="card empty-state">Nenhuma questão encontrada com estes filtros. Limpe ou altere o recorte.</div>';return;}
  root.innerHTML=list.map(q=>`<article class="question-row"><div class="chips">${chip(q.formato)}${chip(q.disciplina)}${chip(q.assunto)}${chip(q.banca)}</div><p>${escapeHtml(q.enunciado)}</p><small>${escapeHtml(q.cargo||'')} · ${escapeHtml(q.ano||'')}</small></article>`).join('')+(state.filtered.length>40?`<div class="empty-state">Exibindo prévia das primeiras 40 de ${fmt(state.filtered.length)} questões.</div>`:'');
}
const chip = v => v?`<span class="chip">${escapeHtml(v)}</span>`:'';

function renderAll(){
  renderHome(); renderCompetitions(); renderEditais(); renderMaterials(); renderRelease(); renderReview(); renderPerformance(); renderCloudAccount();
}

function renderHome(){
  const p=store.load(), hist=p.history; const answered=hist.reduce((s,h)=>s+(h.answers?.length||0),0), correct=hist.reduce((s,h)=>s+(h.correct||0),0);
  const precision=answered?Math.round(correct/answered*100):0;
  $('#homeMetrics').innerHTML=[['Questões na release',state.questions.length],['Sessões concluídas',hist.length],['Respondidas',answered],['Precisão',`${precision}%`]].map(metricHtml).join('');
  const focusCounts=[['homeSeedfCount','seedf'],['homeTjdftCount','tjdft'],['homeSedesCount','sedes-df-2026']];
  focusCounts.forEach(([id,competitionId])=>{const el=$('#'+id);if(el)el.textContent=fmt(state.questions.filter(q=>questionBelongsTo(q,competitionId)).length);});
  const syncStatus=$('#syncStatus'); if(syncStatus) syncStatus.textContent=state.syncLabel;
  const heroReleaseCount=$('#heroReleaseCount');
  if(heroReleaseCount) heroReleaseCount.textContent=fmt(state.questions.length);
  $('#datasetStamp').textContent=`${state.meta.sampleMode?'Amostra local':'Release'} · ${state.meta.generatedAt?new Date(state.meta.generatedAt).toLocaleString('pt-BR'):''}`;
  $('#connectionBadge').textContent=state.meta.sampleMode?'Amostra — sincronize Notion':'Release publicada';
  const banner=$('#sampleBanner'); banner.classList.toggle('hidden',!state.meta.sampleMode); if(state.meta.sampleMode) banner.innerHTML=`<strong>Modo de amostra.</strong> Esta cópia contém ${fmt(state.questions.length)} ${state.questions.length===1?'questão':'questões'} para validar a interface. O Banco Mestre auditado possui ${fmt(state.meta.sourceAudit?.records||0)} registros; execute o workflow de sincronização para gerar a release completa.`;
  const active=p.activeSession; $('#resumeCard').innerHTML=active?`<p><strong>${active.items.length} questões</strong> · posição ${active.index+1}/${active.items.length}</p><button class="primary" id="resumeNow">Continuar sessão</button>`:'Nenhuma sessão em andamento.';
  $('#resumeNow')?.addEventListener('click',()=>{hydrateSession(active);navigate('resolver');});
  const errs=Object.keys(p.errors||{}).length, marked=Object.keys(p.marked||{}).length, due=Object.values(p.reviews||{}).filter(r=>!r.dueAt||r.dueAt<=Date.now()).length;
  $('#reviewSummary').innerHTML=errs||marked||due?`<p><strong>${errs}</strong> erradas · <strong>${marked}</strong> marcadas · <strong>${due}</strong> revisões pendentes</p><button class="secondary" data-go="review">Abrir revisão</button>`:'Sem revisões pendentes.';
}
const metricGlyphs = ['✦','◒','✓','◔'];
const metricHints = {
  'Questões na release':'Acervo pronto para prática',
  'Sessões concluídas':'Sessões salvas neste navegador',
  'Respondidas':'Respostas registradas',
  'Precisão':'Aproveitamento acumulado',
  'Corretas':'Acertos na sessão',
  'Erradas':'Pontos para revisar',
  'Em branco':'Questões sem resposta',
  'Percentual':'Resultado da sessão',
  'Tempo':'Tempo investido',
  'Média/questão':'Ritmo médio da bateria',
  'Total':'Questões na sessão',
  'Acertos':'Acertos registrados',
  'Tempo médio':'Ritmo médio das sessões'
};
function metricHtml([label,value], index=0){
  const glyph=metricGlyphs[index%metricGlyphs.length];
  const hint=metricHints[label] || 'Indicador atualizado';
  const displayValue=typeof value==='number'?fmt(value):value;
  return `<div class="metric"><div class="metric-top"><span class="metric-label"><span class="metric-symbol" aria-hidden="true">${glyph}</span>${escapeHtml(label)}</span><span class="metric-index">${String(index+1).padStart(2,'0')}</span></div><strong>${escapeHtml(displayValue)}</strong><small>${escapeHtml(hint)}</small></div>`;
}

function renderCompetitions(){
  $('#competitionCards').innerHTML=state.competitions.map(c=>{
    const count=state.questions.filter(q=>questionBelongsTo(q,c.id)).length;
    const status=count?fmt(count)+' questões no acervo':String(c.mappingStatus||'Sem questões carregadas');
    const action=count?`<button type='button' class='text-button' data-edital-filter='${escapeHtml(c.id)}'>Abrir questões →</button>`:c.id==='tjdft'?`<button type='button' class='text-button' data-go='proofs'>Ver provas oficiais →</button>`:`<button type='button' class='text-button' data-go='edits'>Ver verticalizado →</button>`;
    return `<article class='competition-card'><span class='status'>${escapeHtml(String(c.status||'ativo').toUpperCase())}</span><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.description)}</p><div class='competition-count'><strong>${fmt(count)}</strong><span>questões associadas</span></div><small>${escapeHtml(status)}</small>${action}</article>`;
  }).join('');
}
function renderEditais(){
  const editais=buildVerticalizedEditais();
  const totalQuestions=editais.reduce((sum,e)=>sum+e.questionCount,0);
  const editalStatus=$('#editalStatus'); if(editalStatus) editalStatus.textContent=fmt(totalQuestions)+' questões mapeadas na release';
  $('#editalList').innerHTML=editais.map(e=>{
    const axes=e.axes||[];
    const axisMarkup=axes.length?`<div class='edital-axis-list'>${axes.map(axis=>{
      const topics=axis.topics.length?`<div class='topic-list'>${axis.topics.map(topic=>{
        const visibleSubs=topic.subassuntos.slice(0,3).join(' · ');
        const detail=visibleSubs?`Subassuntos: ${escapeHtml(visibleSubs)}${topic.subassuntos.length>3?' · …':''}`:'Taxonomia do banco publicada';
        return `<button type='button' class='topic-row' data-topic-orgao='${escapeHtml(topic.filter.orgao)}' data-topic-cargo='${escapeHtml(topic.filter.cargo||'')}' data-topic-disciplina='${escapeHtml(topic.filter.disciplina)}' data-topic-assunto='${escapeHtml(topic.filter.assunto)}' aria-label='Fazer ${fmt(topic.questionCount)} questões de ${escapeHtml(topic.label)}'><span class='topic-copy'><strong>${escapeHtml(topic.label)}</strong><small>${detail}</small></span><span class='topic-action'><b>${fmt(topic.questionCount)}</b><small>Fazer questões →</small></span></button>`;
      }).join('')}</div>`:`<div class='topic-empty'>Ainda não há assuntos cadastrados nesta disciplina.</div>`;
      return `<section class='edital-axis'><div class='edital-axis-head'><div><span class='kicker'>${fmt(axis.topics.length)} TÓPICOS</span><h3>${escapeHtml(axis.label)}</h3></div><span class='axis-count'>${fmt(axis.questionCount)} questões</span></div>${topics}${axis.unmappedCount?`<p class='axis-note'>${fmt(axis.unmappedCount)} questões desta disciplina ainda sem assunto cadastrado.</p>`:''}</section>`;
    }).join('')}</div>`:`<div class='edital-empty'><strong>Este verticalizado ainda não tem questões mapeadas.</strong><span>Quando a trilha entrar na release do Notion, os tópicos aparecerão aqui automaticamente.</span><button type='button' class='secondary' data-edital-filter='${escapeHtml(e.competitionId)}'>Abrir banco da trilha</button></div>`;
    const status=e.questionCount?`<span class='status-badge status-live'>Mapeamento disponível</span>`:`<span class='status-badge status-empty'>Aguardando questões</span>`;
    return `<article class='card edital-card'><div class='edital-card-head'><div><span class='kicker'>${escapeHtml(String(e.competitionId||'').toUpperCase())}</span><h2>${escapeHtml(e.title)}</h2><p>${escapeHtml(e.mappingNote)}</p></div><div class='edital-count'><strong>${fmt(e.questionCount)}</strong><span>questões no recorte</span></div></div><div class='edital-summary'>${status}<span>${fmt(e.mappedQuestionCount)} em tópicos · ${fmt(e.axisCount)} disciplinas</span></div><p class='edital-note'>Escolha um tópico para abrir o banco já filtrado e começar a responder somente aquele conteúdo.</p>${axisMarkup}<div class='edital-footer'><small>Fonte: ${escapeHtml(e.source||'Release publicada')}</small>${e.questionCount?`<button type='button' class='secondary' data-edital-filter='${escapeHtml(e.competitionId)}'>Abrir todas as questões</button>`:''}</div></article>`;
  }).join('');
}
function renderMaterials(){
  const grouped=(type)=>{
    const map=new Map();
    state.questions.filter(q=>(q.tipoMaterial||'').toLowerCase()===type).forEach(q=>{
      const k=q.nomeMaterial||'Sem nome';
      if(!map.has(k)) map.set(k,[]);
      map.get(k).push(q);
    });
    return [...map.entries()];
  };
  const cards=entries=>entries.length?entries.map(([name,qs])=>'<article class="card"><span class="kicker">'+fmt(qs.length)+' QUESTÕES</span><h2>'+escapeHtml(name)+'</h2><p>'+escapeHtml(uniq(qs.map(q=>q.banca)).join(' · '))+'</p></article>').join(''):'<div class="card empty-state">Nenhum item deste tipo na release atual.</div>';
  const officialGroups=new Map();
  state.officialExams.forEach(exam=>{
    const key=exam.career||'TJDFT';
    if(!officialGroups.has(key)) officialGroups.set(key,[]);
    officialGroups.get(key).push(exam);
  });
  const officialMarkup=officialGroups.size?[
    '<section class="card proof-source-note proof-section-wide"><div class="proof-source-eyebrow"><span class="kicker">FONTE OFICIAL · TJDFT 2022</span><span class="status-badge status-live">'+fmt(state.officialExams.length)+' cadernos</span></div><h2>Provas oficiais do último concurso</h2><p>Os PDFs abaixo são os cadernos originais hospedados pela FGV. As 232 questões dos cadernos Tipo 1 de Técnico Administrativo, Analista Administração, Analista Área Judiciária e Analista Análise de Dados já estão revisadas e interativas; os demais cadernos permanecem como fonte oficial até revisão individual.</p><div class="release-actions"><a class="secondary" href="'+escapeHtml(state.officialExams[0].sourcePageUrl)+'" target="_blank" rel="noreferrer">Índice oficial FGV →</a><a class="secondary" href="'+escapeHtml(state.officialExams[0].officialPortalUrl)+'" target="_blank" rel="noreferrer">Portal do TJDFT →</a></div></section>',
    [...officialGroups.entries()].map(([career,exams])=>[
      '<article class="card official-proof-card"><div class="card-head"><div><span class="kicker">TJDFT · 2022</span><h2>'+escapeHtml(career)+'</h2></div><span class="status-badge status-live">Histórica</span></div><p class="proof-summary">'+escapeHtml(exams[0].level)+' · '+escapeHtml(exams[0].board)+' · '+fmt(exams[0].objectiveCount)+' objetivas · '+escapeHtml(exams[0].discursiveLabel)+' · '+fmt(exams[0].durationMinutes)+' min</p><div class="proof-variants">',
      exams.map(exam=>'<a class="proof-variant" href="'+escapeHtml(exam.proofUrl)+'" target="_blank" rel="noreferrer"><strong>'+escapeHtml(exam.examType)+'</strong><small>Abrir PDF oficial →</small></a>').join(''),
      '</div><div class="release-actions"><a class="secondary" href="'+escapeHtml(exams[0].answerKeyUrl)+'" target="_blank" rel="noreferrer">Gabarito definitivo</a><a class="secondary" href="'+escapeHtml(exams[0].noticeUrl)+'" target="_blank" rel="noreferrer">Edital-base</a></div></article>'
    ].join('')).join('')
  ].join(''):'';
  const archive=grouped('prova');
  const archiveMarkup=archive.length?'<div class="proof-section-wide archive-heading"><p class="eyebrow">QUESTÕES JÁ CATALOGADAS</p><h2>Materiais disponíveis no banco</h2></div>'+cards(archive):'';
  $('#proofList').innerHTML=(officialMarkup+archiveMarkup)||'<div class="card empty-state">Nenhum item deste tipo na release atual.</div>';
  $('#simulationList').innerHTML=cards(grouped('simulado'));
}
function renderRelease(){
  const releaseStatus=$('#releaseStatus'); if(releaseStatus) releaseStatus.textContent=state.syncLabel;
  const m=state.meta; $('#releaseDetails').innerHTML=[['Schema',m.schemaVersion],['Gerado em',m.generatedAt?new Date(m.generatedAt).toLocaleString('pt-BR'):'—'],['Fonte',m.source],['Data source',m.dataSourceId],['Questões',m.questionCount],['Provas oficiais TJDFT',state.officialExams.length],['Modo',m.sampleMode?'amostra':'publicado']].map(([k,v])=>`<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v??'—')}</dd>`).join('');
}

function startSessionFromFilters(){
  const poolSource=state.filtered.filter(q=>answerOptions(q).length); const max=poolSource.length;
  if(!max){toast('Nenhuma questão objetiva disponível neste recorte.');return;}
  if(max!==state.filtered.length) toast('Questões discursivas foram mantidas fora da bateria objetiva.');
  const size=Math.min(max,Math.max(1,+$('#sessionSize').value||10)); let pool=[...poolSource]; if($('#shuffleQuestions').checked) pool.sort(()=>Math.random()-.5); pool=pool.slice(0,size);
  createSession(pool,$('#sessionMode').value);
}
function createSession(items,mode='training'){
  const now=Date.now();
  const s={id:crypto.randomUUID?.()||String(now),items:items.map(q=>q.id),index:0,mode,answers:{},confirmed:{},questionTimes:{},startedAt:now,pausedMs:0,currentEnteredAt:now};
  state.session=s; persistActive(); navigate('resolver'); startTimer(); renderResolver();
}
function sessionMap(value,ids){ const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{}; return Object.fromEntries(ids.filter(id=>Object.prototype.hasOwnProperty.call(source,id)).map(id=>[id,source[id]])); }
function hydrateSession(saved){
  if(!saved||!Array.isArray(saved.items)){ store.mutate(p=>p.activeSession=null); state.session=null; return; }
  const items=saved.items.filter(id=>{const q=state.questions.find(item=>item.id===id);return q&&answerOptions(q).length;});
  if(!items.length){ store.mutate(p=>p.activeSession=null); state.session=null; return; }
  const s=JSON.parse(JSON.stringify(saved));
  s.id=s.id||String(Date.now()); s.items=items; s.index=Math.min(items.length-1,Math.max(0,Number.isInteger(s.index)?s.index:0)); s.mode=s.mode==='exam'?'exam':'training';
  s.answers=sessionMap(s.answers,items); s.confirmed=sessionMap(s.confirmed,items); s.questionTimes=sessionMap(s.questionTimes,items);
  s.startedAt=Number.isFinite(s.startedAt)?s.startedAt:Date.now(); s.pausedMs=Math.max(0,Number(s.pausedMs)||0);
  if(s.pausedAt){ s.pausedMs+=Math.max(0,Date.now()-Number(s.pausedAt)); s.pausedAt=null; }
  s.currentEnteredAt=Date.now(); state.session=s; state.hiddenAt=null; persistActive(); startTimer(); renderResolver();
}
function currentQuestion(){ const id=state.session?.items[state.session.index]; return state.questions.find(q=>q.id===id); }
function elapsedMs(s=state.session){ if(!s)return 0; const pauseStart=s===state.session&&state.hiddenAt?state.hiddenAt:s.pausedAt; const livePause=pauseStart?Math.max(0,Date.now()-pauseStart):0; return Math.max(0,Date.now()-s.startedAt-(s.pausedMs||0)-livePause); }
function startTimer(){ clearInterval(state.timer); state.timer=setInterval(()=>{ if(!state.session)return; $('#resolverTimer').textContent=clock(seconds(elapsedMs())); },1000); }
function handleVisibilityChange(){ if(document.hidden) pauseSessionForExit(); else resumeSessionAfterReturn(); }
function pauseSessionForExit(){
  if(!state.session||state.hiddenAt)return;
  const now=Date.now(); saveQuestionTime(now); state.hiddenAt=now; state.session.pausedAt=now; persistActive();
}
function resumeSessionAfterReturn(){
  if(!state.session)return;
  const pauseStart=state.hiddenAt||state.session.pausedAt; if(!pauseStart)return;
  const now=Date.now(); state.session.pausedMs=(state.session.pausedMs||0)+Math.max(0,now-pauseStart); state.session.pausedAt=null; state.hiddenAt=null; state.session.currentEnteredAt=now; persistActive(); renderResolver();
}
function saveQuestionTime(now=Date.now()){
  if(!state.session)return; const q=currentQuestion(); if(!q)return;
  const entered=Number(state.session.currentEnteredAt)||now; const hiddenDuration=state.hiddenAt?Math.max(0,now-state.hiddenAt):0; const delta=seconds(Math.max(0,now-entered-hiddenDuration));
  state.session.questionTimes[q.id]=(state.session.questionTimes[q.id]||0)+delta; state.session.currentEnteredAt=now;
}
function renderResolver(){
  if(!state.session)return; const q=currentQuestion(); if(!q)return; const s=state.session, p=store.load();
  $('#resolverPosition').textContent=`${s.index+1}/${s.items.length}`; $('#resolverTimer').textContent=clock(seconds(elapsedMs(s)));
  $('#questionMeta').innerHTML=[q.formato,q.disciplina,q.assunto,q.banca].map(chip).join(''); $('#questionText').textContent=q.enunciado;
  const opts=answerOptions(q); const chosen=s.answers[q.id]; const confirmed=!!s.confirmed[q.id];
  const isBinary=q.formato==='Certo / Errado' || ['Certo','Errado'].includes(q.gabarito);
  $('#answers').innerHTML=opts.map(([key,text])=>{let cls='answer'; if(chosen===key)cls+=' selected'; if(confirmed&&s.mode==='training'){if(key===q.gabarito)cls+=' correct';else if(chosen===key)cls+=' wrong';} const answerKey=isBinary?String(key).slice(0,1):key; return `<button type="button" class="${cls}" data-answer="${escapeHtml(key)}" ${confirmed?'disabled':''} aria-label="${escapeHtml(text)}"><span class="answer-key">${escapeHtml(answerKey)}</span><span class="answer-copy">${escapeHtml(text)}</span></button>`;}).join('');
  $('#answers [data-answer]').forEach(b=>b.addEventListener('click',()=>{s.answers[q.id]=b.dataset.answer;persistActive();renderResolver();}));
  const feedback=$('#feedback'); feedback.classList.toggle('hidden',!(confirmed&&s.mode==='training')); if(confirmed&&s.mode==='training') feedback.innerHTML=feedbackHtml(q,chosen);
  $('#confirmAnswer').classList.toggle('hidden',confirmed); $('#nextQuestion').classList.toggle('hidden',!confirmed||s.index===s.items.length-1); $('#finishSession').classList.toggle('hidden',!confirmed||s.index!==s.items.length-1);
  $('#prevQuestion').disabled=s.index===0; const marked=!!p.marked[q.id]; $('#markQuestion').textContent=marked?'★ Marcada':'☆ Marcar'; renderQuestionMap();
}
function answerOptions(q){
  if(q.formato==='Certo / Errado' || ['Certo','Errado'].includes(q.gabarito)) return [['Certo','Certo'],['Errado','Errado']];
  return Object.entries(q.alternativas||{}).filter(([,v])=>String(v||'').trim());
}
function feedbackHtml(q,chosen){ const ok=chosen===q.gabarito; return `<strong>${ok?'Resposta correta.':'Resposta incorreta.'}</strong> Gabarito: <strong>${escapeHtml(q.gabarito)}</strong>${q.comentarioGeral?`<p>${escapeHtml(q.comentarioGeral)}</p>`:''}${q.fundamentoLegal?`<p><strong>Fundamento:</strong> ${escapeHtml(q.fundamentoLegal)}</p>`:''}${q.pegadinha?`<p><strong>Pegadinha:</strong> ${escapeHtml(q.pegadinha)}</p>`:''}`; }
function confirmAnswer(){ const q=currentQuestion(), s=state.session; if(!q||!s)return; if(!s.answers[q.id]){toast('Selecione uma resposta.');return;} s.confirmed[q.id]=true; persistActive(); renderResolver(); }
function moveQuestion(delta){ if(!state.session)return; saveQuestionTime(); const s=state.session; s.index=Math.max(0,Math.min(s.items.length-1,s.index+delta)); persistActive(); renderResolver(); }
function renderQuestionMap(){ const s=state.session,p=store.load(); $('#questionMap').innerHTML=s.items.map((id,i)=>`<button type="button" data-map="${i}" class="${i===s.index?'current ':''}${s.answers[id]?'answered ':''}${p.marked[id]?'marked':''}">${i+1}</button>`).join(''); $$('#questionMap [data-map]').forEach(b=>b.addEventListener('click',()=>{saveQuestionTime();s.index=+b.dataset.map;s.currentEnteredAt=Date.now();persistActive();renderResolver();})); }
function persistActive(){ if(!state.session)return; store.mutate(p=>p.activeSession=JSON.parse(JSON.stringify(state.session))); }
function toggleMarked(){ const q=currentQuestion(); if(!q)return; store.mutate(p=>{if(p.marked[q.id]) delete p.marked[q.id]; else p.marked[q.id]={at:Date.now()};}); renderResolver(); }

function finishSession(){
  saveQuestionTime(); clearInterval(state.timer); const s=state.session; if(!s)return;
  const answers=s.items.map(id=>{const q=state.questions.find(x=>x.id===id);const given=s.answers[id]||null;return {questionId:id,given,correctAnswer:q?.gabarito||null,isCorrect:given===q?.gabarito,blank:!given,time:s.questionTimes[id]||0,disciplina:q?.disciplina||'',assunto:q?.assunto||'',clientEventId:crypto.randomUUID?.()||('evt-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))};});
  const correct=answers.filter(a=>a.isCorrect).length, wrong=answers.filter(a=>a.given&&!a.isCorrect).length, blank=answers.filter(a=>a.blank).length;
  const record={id:s.id,finishedAt:Date.now(),startedAt:s.startedAt,mode:s.mode,total:s.items.length,correct,wrong,blank,elapsedMs:elapsedMs(s),answers};
  store.mutate(p=>{p.history.unshift(record);p.activeSession=null;answers.forEach(a=>{if(a.isCorrect){if(p.errors[a.questionId])p.errors[a.questionId].lastCorrect=Date.now();const r=p.reviews[a.questionId];if(r){r.stage=r.stage==='D0'?'D7':r.stage==='D7'?'D20':'Dominada';r.dueAt=r.stage==='D7'?Date.now()+7*864e5:r.stage==='D20'?Date.now()+20*864e5:null;}}else if(a.given){p.errors[a.questionId]={count:(p.errors[a.questionId]?.count||0)+1,lastError:Date.now()};p.reviews[a.questionId]={stage:'D0',dueAt:Date.now()};}});});
  state.hiddenAt=null; state.session=null; renderResult(record); navigate('result'); void syncCloudProgress({silent:true});
}
function renderResult(r){ const answered=r.correct+r.wrong, precision=answered?r.correct/answered*100:0, percent=r.total?r.correct/r.total*100:0, elapsed=seconds(r.elapsedMs??(r.finishedAt-r.startedAt)); $('#resultMetrics').innerHTML=[['Corretas',r.correct],['Erradas',r.wrong],['Em branco',r.blank],['Percentual',`${percent.toFixed(1)}%`],['Precisão',`${precision.toFixed(1)}%`],['Tempo',clock(elapsed)],['Média/questão',clock(r.total?Math.round(elapsed/r.total):0)],['Total',r.total]].map(metricHtml).join(''); const by=aggregateBy(r.answers,'disciplina'); $('#resultBreakdown').innerHTML=Object.entries(by).map(([k,v])=>`<article class="card"><h2>${escapeHtml(k||'Sem disciplina')}</h2><p>${v.correct}/${v.total} corretas · ${Math.round(v.correct/v.total*100)}%</p></article>`).join('')||'<div class="card empty-state">Sem dados.</div>'; }
function redoErrors(){ const h=store.load().history[0]; if(!h)return; const qs=h.answers.filter(a=>!a.isCorrect&&a.given).map(a=>state.questions.find(q=>q.id===a.questionId)).filter(q=>q&&answerOptions(q).length); if(!qs.length){toast('Não há erradas objetivas nessa sessão.');return;} createSession(qs,'training'); }

function renderReview(){ const p=store.load(); const ids=uniq([...Object.keys(p.errors||{}),...Object.keys(p.marked||{}),...Object.keys(p.reviews||{})]); const root=$('#reviewList'); if(!ids.length){root.innerHTML='<div class="card empty-state">Nenhuma questão em revisão ainda.</div>';return;} root.innerHTML=ids.map(id=>{const q=state.questions.find(x=>x.id===id);if(!q)return'';const e=p.errors[id],r=p.reviews[id],m=p.marked[id];return `<article class="card"><div class="chips">${e?chip(`${e.count} erro(s)`):''}${r?chip(r.stage):''}${m?chip('Marcada'):''}</div><h2>${escapeHtml(q.disciplina||'Questão')}</h2><p>${escapeHtml(q.enunciado)}</p><button class="secondary" data-review-one="${escapeHtml(id)}">Resolver agora</button></article>`;}).join(''); $$('[data-review-one]').forEach(b=>b.addEventListener('click',()=>{const q=state.questions.find(x=>x.id===b.dataset.reviewOne);if(q)createSession([q],'training');})); }
function renderPerformance(){
  const history=store.load().history;
  const all=history.flatMap(record=>(record.answers||[]).map(enrichAnswer));
  const total=all.length,attempted=all.filter(answer=>!answer.blank),correct=all.filter(answer=>answer.isCorrect).length;
  const precision=attempted.length?correct/attempted.length*100:0;
  const avg=total?all.reduce((sum,answer)=>sum+(answer.time||0),0)/total:0;
  const best=history.length?Math.max(...history.map(record=>{const answered=(record.correct||0)+(record.wrong||0);return answered?record.correct/answered*100:0;})):0;
  $('#performanceMetrics').innerHTML=[['Respondidas',total],['Acertos',correct],['Precisão',precision.toFixed(1)+'%'],['Tempo médio',clock(Math.round(avg))],['Sessões',history.length],['Melhor sessão',best.toFixed(1)+'%']].map(metricHtml).join('');
  const sessions=[...history].sort((a,b)=>(a.finishedAt||0)-(b.finishedAt||0)).slice(-12);
  const trend=sessions.map((record,index)=>{const answered=(record.correct||0)+(record.wrong||0);return {value:answered?record.correct/answered*100:0,label:new Date(record.finishedAt||Date.now()).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' · '+(index+1)};});
  const by=aggregateBy(all,'disciplina');
  const entries=Object.entries(by).sort((a,b)=>{
    const pa=a[1].correct/Math.max(1,a[1].total-a[1].blank),pb=b[1].correct/Math.max(1,b[1].total-b[1].blank);
    return pa-pb||b[1].total-a[1].total;
  });
  const chartRoot=$('#performanceCharts');
  if(chartRoot)chartRoot.innerHTML='<div class="chart-grid"><article class="card chart-card"><div class="chart-head"><div><span class="kicker">EVOLUÇÃO</span><h2>Precisão por sessão</h2></div><span class="chart-caption">Últimas '+sessions.length+'</span></div><div class="chart-scroll">'+trendChart(trend)+'</div></article><article class="card chart-card"><div class="chart-head"><div><span class="kicker">FOCO</span><h2>Precisão por disciplina</h2></div><span class="chart-caption">'+entries.length+' áreas</span></div><div class="bar-chart">'+(entries.length?entries.slice(0,10).map(([key,value])=>{const percent=value.correct/Math.max(1,value.total-value.blank)*100;return '<div class="bar-row"><div class="bar-label"><span>'+escapeHtml(key||'Sem disciplina')+'</span><strong>'+percent.toFixed(0)+'%</strong></div><div class="bar-track"><span class="bar-fill" style="width:'+Math.max(0,Math.min(100,percent))+'%"></span></div><small>'+value.total+' respostas · '+value.blank+' em branco</small></div>';}).join(''):'<div class="empty-state">Responda questões para ver seus pontos fortes e fracos.</div>')+'</div></article></div>';
  $('#performanceBreakdown').innerHTML=entries.length?entries.map(([key,value])=>{const answered=value.total-value.blank;const percent=answered?value.correct/answered*100:0;return '<article class="card"><span class="kicker">'+value.total+' RESPOSTAS</span><h2>'+escapeHtml(key||'Sem disciplina')+'</h2><p>'+percent.toFixed(1)+'% de precisão · '+value.blank+' em branco</p></article>';}).join(''):'<div class="card empty-state">Conclua uma bateria para gerar desempenho.</div>';
}
function aggregateBy(arr,key){return arr.reduce((m,a)=>{const k=a[key]||'Sem classificação';m[k]??={total:0,correct:0,blank:0};m[k].total++;if(a.blank)m[k].blank++;else if(a.isCorrect)m[k].correct++;return m;},{});}

async function validateImport(e){ const file=e.target.files[0]; if(!file)return; try{const data=JSON.parse(await file.text());const arr=Array.isArray(data)?data:data.questions;if(!Array.isArray(arr))throw new Error('Esperado array de questões ou {questions:[...]}.');const missing=arr.filter(q=>!q.enunciado||!q.gabarito).length;$('#importReport').textContent=`Arquivo válido\nRegistros: ${arr.length}\nSem enunciado/gabarito: ${missing}\n\nPré-validação apenas: nada foi publicado nem enviado ao Notion.`;}catch(err){$('#importReport').textContent=`Arquivo inválido: ${err.message}`;}}
function exportProgress(){ const blob=new Blob([JSON.stringify(store.load(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`plataforma-questoes-progresso-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000); }
function resetProgress(){ if(!confirm('Zerar somente o progresso deste aparelho? O banco de questões e o progresso sincronizado na nuvem não serão alterados.'))return;store.clear();state.session=null;state.hiddenAt=null;clearInterval(state.timer);renderAll();navigate('home');toast('Progresso local zerado.');}
function toast(msg){ const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200); }

boot();
