const ROUTES = [
  ['home','⌂','Início'],['edits','▤','Banco e editais'],['questions','BQ','Banco de questões'],
  ['proofs','PA','Provas aplicadas'],['simulations','SI','Simulados'],['review','RV','Revisar'],
  ['performance','DE','Desempenho'],['import','＋','Importar provas'],['settings','AJ','Ajustes e dados']
];

const state = {
  questions: [], meta: {}, competitions: [], editais: [], filtered: [],
  session: null, timer: null, startedAt: null, currentView: 'home', hiddenAt: null
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

async function boot(){
  try{
    const [q,m,c,e] = await Promise.all([
      fetch('./data/questions.json',{cache:'no-store'}).then(r=>r.json()),
      fetch('./data/metadata.json',{cache:'no-store'}).then(r=>r.json()),
      fetch('./data/competitions.json',{cache:'no-store'}).then(r=>r.json()),
      fetch('./data/editais.json',{cache:'no-store'}).then(r=>r.json())
    ]);
    state.questions=q; state.meta=m; state.competitions=c; state.editais=e; state.filtered=[...q];
    renderNav(); bindGlobal(); populateFilters(); applyFilters(); renderAll();
    const progress=store.load(); if(progress.activeSession) hydrateSession(progress.activeSession);
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }catch(err){
    document.body.innerHTML=`<main style="padding:32px"><h1>Não foi possível carregar a release.</h1><p>${escapeHtml(err.message)}</p></main>`;
  }
}

function renderNav(){
  $('#nav').innerHTML=ROUTES.map(([id,icon,label])=>`<button type="button" data-go="${id}" class="${id==='home'?'active':''}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('');
}

function bindGlobal(){
  document.addEventListener('click', e=>{
    const go=e.target.closest('[data-go]'); if(go){ navigate(go.dataset.go); }
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
  renderHome(); renderCompetitions(); renderEditais(); renderMaterials(); renderRelease(); renderReview(); renderPerformance();
}

function renderHome(){
  const p=store.load(), hist=p.history; const answered=hist.reduce((s,h)=>s+(h.answers?.length||0),0), correct=hist.reduce((s,h)=>s+(h.correct||0),0);
  const precision=answered?Math.round(correct/answered*100):0;
  $('#homeMetrics').innerHTML=[['Questões na release',state.questions.length],['Sessões concluídas',hist.length],['Respondidas',answered],['Precisão',`${precision}%`]].map(metricHtml).join('');
  $('#datasetStamp').textContent=`${state.meta.sampleMode?'Amostra local':'Release'} · ${state.meta.generatedAt?new Date(state.meta.generatedAt).toLocaleString('pt-BR'):''}`;
  $('#connectionBadge').textContent=state.meta.sampleMode?'Amostra — sincronize Notion':'Release publicada';
  const banner=$('#sampleBanner'); banner.classList.toggle('hidden',!state.meta.sampleMode); if(state.meta.sampleMode) banner.innerHTML=`<strong>Modo de amostra.</strong> Esta cópia contém ${fmt(state.questions.length)} ${state.questions.length===1?'questão':'questões'} para validar a interface. O Banco Mestre auditado possui ${fmt(state.meta.sourceAudit?.records||0)} registros; execute o workflow de sincronização para gerar a release completa.`;
  const active=p.activeSession; $('#resumeCard').innerHTML=active?`<p><strong>${active.items.length} questões</strong> · posição ${active.index+1}/${active.items.length}</p><button class="primary" id="resumeNow">Continuar sessão</button>`:'Nenhuma sessão em andamento.';
  $('#resumeNow')?.addEventListener('click',()=>{hydrateSession(active);navigate('resolver');});
  const errs=Object.keys(p.errors||{}).length, marked=Object.keys(p.marked||{}).length, due=Object.values(p.reviews||{}).filter(r=>!r.dueAt||r.dueAt<=Date.now()).length;
  $('#reviewSummary').innerHTML=errs||marked||due?`<p><strong>${errs}</strong> erradas · <strong>${marked}</strong> marcadas · <strong>${due}</strong> revisões pendentes</p><button class="secondary" data-go="review">Abrir revisão</button>`:'Sem revisões pendentes.';
}
function metricHtml([label,value]){return `<div class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;}

function renderCompetitions(){
  $('#competitionCards').innerHTML=state.competitions.map(c=>`<div class="competition-card"><span class="status">${escapeHtml(c.status.toUpperCase())}</span><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.description)}</p><small>${escapeHtml(c.mappingStatus)}</small></div>`).join('');
}
function renderEditais(){
  $('#editalList').innerHTML=state.editais.map(e=>`<article class="card"><span class="kicker">${escapeHtml(e.competitionId.toUpperCase())}</span><h2>${escapeHtml(e.title)}</h2><p>${escapeHtml(e.status)}</p><small>Fonte: ${escapeHtml(e.source)}</small></article>`).join('');
}
function renderMaterials(){
  const grouped=(type)=>{
    const map=new Map(); state.questions.filter(q=>(q.tipoMaterial||'').toLowerCase()===type).forEach(q=>{const k=q.nomeMaterial||'Sem nome'; if(!map.has(k))map.set(k,[]);map.get(k).push(q);}); return [...map.entries()];
  };
  const cards=entries=>entries.length?entries.map(([name,qs])=>`<article class="card"><span class="kicker">${fmt(qs.length)} QUESTÕES</span><h2>${escapeHtml(name)}</h2><p>${escapeHtml(uniq(qs.map(q=>q.banca)).join(' · '))}</p></article>`).join(''):'<div class="card empty-state">Nenhum item deste tipo na release atual.</div>';
  $('#proofList').innerHTML=cards(grouped('prova')); $('#simulationList').innerHTML=cards(grouped('simulado'));
}
function renderRelease(){
  const m=state.meta; $('#releaseDetails').innerHTML=[['Schema',m.schemaVersion],['Gerado em',m.generatedAt?new Date(m.generatedAt).toLocaleString('pt-BR'):'—'],['Fonte',m.source],['Data source',m.dataSourceId],['Questões',m.questionCount],['Modo',m.sampleMode?'amostra':'publicado']].map(([k,v])=>`<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v??'—')}</dd>`).join('');
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
  $('#answers').innerHTML=opts.map(([key,text])=>{let cls='answer'; if(chosen===key)cls+=' selected'; if(confirmed&&s.mode==='training'){if(key===q.gabarito)cls+=' correct';else if(chosen===key)cls+=' wrong';}return `<button type="button" class="${cls}" data-answer="${escapeHtml(key)}" ${confirmed?'disabled':''}><span class="answer-key">${escapeHtml(key)}</span><span>${escapeHtml(text)}</span></button>`;}).join('');
  $$('#answers [data-answer]').forEach(b=>b.addEventListener('click',()=>{s.answers[q.id]=b.dataset.answer;persistActive();renderResolver();}));
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
  const answers=s.items.map(id=>{const q=state.questions.find(x=>x.id===id);const given=s.answers[id]||null;return {questionId:id,given,correctAnswer:q?.gabarito||null,isCorrect:given===q?.gabarito,blank:!given,time:s.questionTimes[id]||0,disciplina:q?.disciplina||'',assunto:q?.assunto||''};});
  const correct=answers.filter(a=>a.isCorrect).length, wrong=answers.filter(a=>a.given&&!a.isCorrect).length, blank=answers.filter(a=>a.blank).length;
  const record={id:s.id,finishedAt:Date.now(),startedAt:s.startedAt,mode:s.mode,total:s.items.length,correct,wrong,blank,elapsedMs:elapsedMs(s),answers};
  store.mutate(p=>{p.history.unshift(record);p.activeSession=null;answers.forEach(a=>{if(a.isCorrect){if(p.errors[a.questionId])p.errors[a.questionId].lastCorrect=Date.now();const r=p.reviews[a.questionId];if(r){r.stage=r.stage==='D0'?'D7':r.stage==='D7'?'D20':'Dominada';r.dueAt=r.stage==='D7'?Date.now()+7*864e5:r.stage==='D20'?Date.now()+20*864e5:null;}}else if(a.given){p.errors[a.questionId]={count:(p.errors[a.questionId]?.count||0)+1,lastError:Date.now()};p.reviews[a.questionId]={stage:'D0',dueAt:Date.now()};}});});
  state.hiddenAt=null; state.session=null; renderResult(record); navigate('result');
}
function renderResult(r){ const answered=r.correct+r.wrong, precision=answered?r.correct/answered*100:0, percent=r.total?r.correct/r.total*100:0, elapsed=seconds(r.elapsedMs??(r.finishedAt-r.startedAt)); $('#resultMetrics').innerHTML=[['Corretas',r.correct],['Erradas',r.wrong],['Em branco',r.blank],['Percentual',`${percent.toFixed(1)}%`],['Precisão',`${precision.toFixed(1)}%`],['Tempo',clock(elapsed)],['Média/questão',clock(r.total?Math.round(elapsed/r.total):0)],['Total',r.total]].map(metricHtml).join(''); const by=aggregateBy(r.answers,'disciplina'); $('#resultBreakdown').innerHTML=Object.entries(by).map(([k,v])=>`<article class="card"><h2>${escapeHtml(k||'Sem disciplina')}</h2><p>${v.correct}/${v.total} corretas · ${Math.round(v.correct/v.total*100)}%</p></article>`).join('')||'<div class="card empty-state">Sem dados.</div>'; }
function redoErrors(){ const h=store.load().history[0]; if(!h)return; const qs=h.answers.filter(a=>!a.isCorrect&&a.given).map(a=>state.questions.find(q=>q.id===a.questionId)).filter(q=>q&&answerOptions(q).length); if(!qs.length){toast('Não há erradas objetivas nessa sessão.');return;} createSession(qs,'training'); }

function renderReview(){ const p=store.load(); const ids=uniq([...Object.keys(p.errors||{}),...Object.keys(p.marked||{}),...Object.keys(p.reviews||{})]); const root=$('#reviewList'); if(!ids.length){root.innerHTML='<div class="card empty-state">Nenhuma questão em revisão ainda.</div>';return;} root.innerHTML=ids.map(id=>{const q=state.questions.find(x=>x.id===id);if(!q)return'';const e=p.errors[id],r=p.reviews[id],m=p.marked[id];return `<article class="card"><div class="chips">${e?chip(`${e.count} erro(s)`):''}${r?chip(r.stage):''}${m?chip('Marcada'):''}</div><h2>${escapeHtml(q.disciplina||'Questão')}</h2><p>${escapeHtml(q.enunciado)}</p><button class="secondary" data-review-one="${escapeHtml(id)}">Resolver agora</button></article>`;}).join(''); $$('[data-review-one]').forEach(b=>b.addEventListener('click',()=>{const q=state.questions.find(x=>x.id===b.dataset.reviewOne);if(q)createSession([q],'training');})); }
function renderPerformance(){ const h=store.load().history, all=h.flatMap(x=>x.answers||[]); const total=all.length, correct=all.filter(a=>a.isCorrect).length, precision=total?correct/total*100:0, avg=total?all.reduce((s,a)=>s+(a.time||0),0)/total:0; $('#performanceMetrics').innerHTML=[['Respondidas',total],['Acertos',correct],['Precisão',`${precision.toFixed(1)}%`],['Tempo médio',clock(Math.round(avg))]].map(metricHtml).join(''); const by=aggregateBy(all,'disciplina'); const entries=Object.entries(by).sort((a,b)=>a[1].correct/a[1].total-b[1].correct/b[1].total); $('#performanceBreakdown').innerHTML=entries.length?entries.map(([k,v])=>`<article class="card"><span class="kicker">${v.total} RESPOSTAS</span><h2>${escapeHtml(k||'Sem disciplina')}</h2><p>${Math.round(v.correct/v.total*100)}% de precisão</p></article>`).join(''):'<div class="card empty-state">Conclua uma bateria para gerar desempenho.</div>'; }
function aggregateBy(arr,key){return arr.reduce((m,a)=>{const k=a[key]||'Sem classificação';m[k]??={total:0,correct:0};m[k].total++;if(a.isCorrect)m[k].correct++;return m;},{});}

async function validateImport(e){ const file=e.target.files[0]; if(!file)return; try{const data=JSON.parse(await file.text());const arr=Array.isArray(data)?data:data.questions;if(!Array.isArray(arr))throw new Error('Esperado array de questões ou {questions:[...]}.');const missing=arr.filter(q=>!q.enunciado||!q.gabarito).length;$('#importReport').textContent=`Arquivo válido\nRegistros: ${arr.length}\nSem enunciado/gabarito: ${missing}\n\nPré-validação apenas: nada foi publicado nem enviado ao Notion.`;}catch(err){$('#importReport').textContent=`Arquivo inválido: ${err.message}`;}}
function exportProgress(){ const blob=new Blob([JSON.stringify(store.load(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`plataforma-questoes-progresso-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000); }
function resetProgress(){ if(!confirm('Zerar somente o progresso deste navegador? O banco de questões não será alterado.'))return;store.clear();state.session=null;state.hiddenAt=null;clearInterval(state.timer);renderAll();navigate('home');toast('Progresso local zerado.');}
function toast(msg){ const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200); }

boot();
