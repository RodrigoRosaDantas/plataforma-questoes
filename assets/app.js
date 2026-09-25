Warning: truncated output (original token count: 22486)
Total output lines: 1090

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
const MOBILE_ROUTES = [['home','Início'],['questions','Questões'],['review','Revisar'],['performance','Desempenho']];
const TCE_SOURCE_PRIORITY = new Map([
  ['tcego-fcc-2022-controle-externo-selecao',1],
  ['tcego-fcc-2022-contabilidade-selecao',2],
  ['tcego-fcc-2014-admin',3],
  ['tcece-fcc-2015-tecnico-admin',4]
]);

const state = {
  questions: [], meta: {}, competitions: [], editais: [], officialExams: [], tceGoEdict: null, filtered: [],
  session: null, timer: null, startedAt: null, currentView: 'home', hiddenAt: null, syncLabel: 'Release publicada',
  cloudSyncTimer: null, noteDrafts: {}, searchTimer: null, editalTimer: null,
  installPrompt: null, swRegistration: null, editalQuery: '', filtersOpen: false, competitionScope: '', tceSectionScope: '', tceMaterialScope: '',
  cloud: {status:'loading',email:'',profileId:'',message:''},
  externalContext: ''
};

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const fmt = n => new Intl.NumberFormat('pt-BR').format(n || 0);
const uniq = arr => [...new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ''))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true}));
const escapeHtml = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const seconds = ms => Math.max(0, Math.floor(ms/1000));
const clock = sec => `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
const VIEW_IDS = new Set(['home','edits','questions','proofs','simulations','resolver','result','review','performance','import','settings']);
const FILTER_TO_ELEMENT = {concurso:'filterConcurso',orgao:'filterOrgao',cargo:'filterCargo',banca:'filterBanca',ano:'filterAno',disciplina:'filterDisciplina',assunto:'filterAssunto',subassunto:'filterSubassunto',formato:'filterFormato',text:'filterText'};
const FILTER_LABELS = {trilha:'Trilha',concurso:'Concurso',orgao:'Órgão',cargo:'Cargo',banca:'Banca',ano:'Ano',disciplina:'Disciplina',assunto:'Assunto',subassunto:'Subassunto',formato:'Formato',text:'Texto'};

function routeFromUrl(){
  const route=new URL(window.location.href).searchParams.get('view')||'home';
  return VIEW_IDS.has(route)?route:'home';
}
function applyQuestionDeepLinkFromUrl(){
  const params=new URL(window.location.href).searchParams;
  const keys={disciplina:'filterDisciplina',assunto:'filterAssunto',subassunto:'filterSubassunto',orgao:'filterOrgao',cargo:'filterCargo',concurso:'filterConcurso',banca:'filterBanca',ano:'filterAno',formato:'filterFormato'};
  const requested=routeFromUrl()==='questions';
  if(!requested)return {active:false,autostart:false};
  resetQuestionFilters();
  let matched=0,missed=0;
  Object.entries(keys).forEach(([param,id])=>{
    const value=params.get(param);
    if(!value)return;
    const el=$('#'+id);
    if(el&&[...el.options].some(option=>option.value===value)){el.value=value;matched++;}
    else missed++;
  });
  const dxx=String(params.get('dxx')||'').toUpperCase(),sxx=String(params.get('sxx')||'').toUpperCase();
  state.externalContext=/^D\d{3}$/.test(dxx)?['TCE',dxx,/^S\d{2}$/.test(sxx)?sxx:''].filter(Boolean).join(' · '):'';
  const size=Math.max(0,Number(params.get('size'))||0);
  if(size&&$('#sessionSize'))$('#sessionSize').value=String(size);
  return {active:matched>0,autostart:params.get('autostart')==='1'&&matched>0&&missed===0,missed};
}
function syncViewUrl(view,replace=false){
  const url=new URL(window.location.href);
  if(view==='home')url.searchParams.delete('view');else url.searchParams.set('view',view);
  window.history[replace?'replaceState':'pushState']({view},'',url);
}
function setSidebarOpen(open){
  const sidebar=$('#sidebar'),backdrop=$('#sidebarBackdrop'),button=$('#menuButton');
  if(!sidebar||!backdrop||!button)return;
  sidebar.classList.toggle('open',open);
  backdrop.classList.toggle('hidden',!open);
  button.setAttribute('aria-expanded',String(open));
  button.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
  document.body.classList.toggle('menu-open',open);
}
function setTheme(theme){
  const next=theme==='dark'?'dark':'light';
  document.documentElement.dataset.theme=next;
  localStorage.setItem('plataforma.questoes.theme',next);
  const button=$('#themeButton');
  if(button){button.setAttribute('aria-pressed',String(next==='dark'));button.setAttribute('aria-label',next==='dark'?'Usar tema claro':'Usar tema escuro');}
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=next==='dark'?'#090f20':'#111936';
}
function updateNetworkStatus(){
  const online=navigator.onLine;
  const status=$('#networkStatus');
  if(status){status.textContent=online?'Online':'Offline';status.classList.toggle('offline',!online);}
}
function completeLoading(){
  document.body.setAttribute('aria-busy','false');
  const loading=$('#appLoading');if(loading)loading.hidden=true;
}
function renderProgressSurface(){
  if(state.currentView==='home')renderHome();
  if(state.currentView==='review')renderReview();
  if(state.currentView==='performance')renderPerformance();
}
function shuffleItems(items){
  const shuffled=[...items];
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  return shuffled;
}
function isStandalone(){
  return window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
}
function renderInstallState(){
  const card=$('#installCard'),button=$('#installApp'),status=$('#installStatus');
  if(!card||!button||!status)return;
  if(isStandalone()){status.textContent='A plataforma já está instalada neste aparelho.';button.classList.add('hidden');return;}
  button.classList.remove('hidden');
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  if(state.installPrompt){button.textContent='Instalar neste aparelho';status.textContent='Instalação disponível. Seus dados locais continuam neste aparelho e podem ser sincronizados pela conta.';}
  else if(isiOS){button.textContent='Como instalar no iPhone ou iPad';status.textContent='No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.';}
  else{button.textContent='Ver opção de instalação';status.textContent='Use a opção “Instalar aplicativo” do menu do navegador quando ela estiver disponível.';}
}
async function installApp(){
  if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;renderInstallState();return;}
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(isiOS?'No Safari: Compartilhar → Adicionar à Tela de Início.':'Abra o menu do navegador e escolha “Instalar aplicativo”.');
}


const DEFAULT_SCORING_POLICY = {
  version: 1,
  blankCountsAsWrong: false,
  negativeMarking: 0,
  annulledExcluded: true,
  precisionDenominator: 'answered',
  feedback: 'after-confirmation'
};
function currentScoringPolicy(){
  const configured=state.meta?.scoringPolicy&&typeof state.meta.scoringPolicy==='object'?state.meta.scoringPolicy:{};
  const negative=Number(configured.negativeMarking);
  return {...DEFAULT_SCORING_POLICY,...configured,negativeMarking:Number.isFinite(negative)&&negative>=0?negative:0};
}
function entryTime(value){
  if(!value||typeof value!=='object')return 0;
  const explicit=Math.max(Number(value.updatedAt)||0,Number(value.lastSavedAt)||0,Number(value.lastError)||0,Number(value.lastCorrect)||0,Number(value.at)||0,Number(value.removedAt)||0);
  return explicit||Number(value.dueAt)||0;
}
function reviewEntryTime(value,error){
  if(!value||typeof value!=='object')return 0;
  const explicit=Math.max(Number(value.updatedAt)||0,Number(value.lastSavedAt)||0,Number(value.lastError)||0,Number(value.lastCorrect)||0,Number(value.at)||0,Number(value.removedAt)||0);
  if(explicit)return explicit;
  const dueAt=Number(value.dueAt)||0,stage=String(value.stage||'');
  if(stage==='Dominada')return Number(error?.lastCorrect)||0;
  if(stage==='D20')return Math.max(0,dueAt-20*864e5);
  if(stage==='D7')return Math.max(0,dueAt-7*864e5);
  return dueAt;
}
function mergeProgressMap(localValue,remoteValue){
  const local=localValue&&typeof localValue==='object'&&!Array.isArray(localValue)?localValue:{};
  const remote=remoteValue&&typeof remoteValue==='object'&&!Array.isArray(remoteValue)?remoteValue:{};
  const merged={...local};
  for(const id of Object.keys(remote)){
    if(!Object.prototype.hasOwnProperty.call(local,id)){merged[id]=remote[id];continue;}
    merged[id]=entryTime(local[id])>=entryTime(remote[id])?local[id]:remote[id];
  }
  return merged;
}
function rebuildErrorsFromHistory(history,fallbackValue){
  const fallback=fallbackValue&&typeof fallbackValue==='object'&&!Array.isArray(fallbackValue)?fallbackValue:{};
  const derived={};
  for(const record of Array.isArray(history)?history:[]){
    const finishedAt=Math.max(0,Number(record?.finishedAt)||0);
    const seen=new Set();
    for(const answer of Array.isArray(record?.answers)?record.answers:[]){
      const id=String(answer?.questionId||'');
      if(!id||seen.has(id))continue;
      seen.add(id);
      const answered=(answer?.given!==undefined&&answer?.given!==null&&answer?.given!=='')||answer?.blank===false;
      const correct=answer?.isCorrect===true;
      const item=derived[id]||(derived[id]={count:0,lastError:0,lastCorrect:0});
      if(answered&&!correct){item.count+=1;item.lastError=Math.max(item.lastError,finishedAt);}
      else if(correct)item.lastCorrect=Math.max(item.lastCorrect,finishedAt);
    }
  }
  const result={};
  for(const id of new Set([...Object.keys(fallback),...Object.keys(derived)])){
    const legacy=fallback[id]&&typeof fallback[id]==='object'?fallback[id]:{};
    const current=derived[id]||{};
    const count=Math.max(Number(legacy.count)||0,Number(current.count)||0);
    const lastError=Math.max(Number(legacy.lastError)||0,Number(current.lastError)||0);
    const lastCorrect=Math.max(Number(legacy.lastCorrect)||0,Number(current.lastCorrect)||0);
    if(count<=0&&lastError<=0)continue;
    result[id]={...legacy,...current,count,lastError};
    if(lastCorrect>0)result[id].lastCorrect=lastCorrect;
    else delete result[id].lastCorrect;
  }
  return result;
}
function mergeReviewMap(localValue,remoteValue,errors){
  const local=localValue&&typeof localValue==='object'&&!Array.isArray(localValue)?localValue:{};
  const remote=remoteValue&&typeof remoteValue==='object'&&!Array.isArray(remoteValue)?remoteValue:{};
  const merged={...local};
  for(const id of Object.keys(remote)){
    if(!Object.prototype.hasOwnProperty.call(local,id)){merged[id]=remote[id];continue;}
    merged[id]=reviewEntryTime(local[id],errors?.[id])>=reviewEntryTime(remote[id],errors?.[id])?local[id]:remote[id];
  }
  return merged;
}
function reconcileReviewsWithErrors(reviewValue,errorValue){
  const reviews=reviewValue&&typeof reviewValue==='object'&&!Array.isArray(reviewValue)?reviewValue:{};
  const errors=errorValue&&typeof errorValue==='object'&&!Array.isArray(errorValue)?errorValue:{};
  const result={...reviews};
  for(const [id,error] of Object.entries(errors)){
    const lastError=Math.max(0,Number(error?.lastError)||0);
    const lastCorrect=Math.max(0,Number(error?.lastCorrect)||0);
    if(!lastError||lastError<=lastCorrect)continue;
    const current=result[id];
    if(!current||lastError>reviewEntryTime(current,error))result[id]={stage:'D0',dueAt:lastError,updatedAt:lastError};
  }
  return result;
}
function mergeProgressState(local,remote){
  const left=local&&typeof local==='object'?local:{},right=remote&&typeof remote==='object'?remote:{};
  const mergedHistory=cloudProgress.mergeHistory(left.history,right.history);
  const mergedErrorFallback=mergeProgressMap(left.errors,right.errors);
  const mergedErrors=rebuildErrorsFromHistory(mergedHistory,mergedErrorFallback);
  const mergedReviewCandidates=mergeReviewMap(left.reviews,right.reviews,mergedErrors);
  const mergedReviews=reconcileReviewsWithErrors(mergedReviewCandidates,mergedErrors);
  const merged={...left,version:Math.max(Number(left.version)||1,Number(right.version)||1),history:mergedHistory,marked:mergeProgressMap(left.marked,right.marked),errors:mergedErrors,reviews:mergedReviews,notes:mergeProgressMap(left.notes,right.notes)};
  const cutoff=Math.max(Number(left.activeSessionClearedAt)||0,Number(right.activeSessionClearedAt)||0);
  const completedSessionIds=new Set((merged.history||[]).map(record=>String(record?.id||'')).filter(Boolean));
  const active=[left,right].filter(value=>value.activeSession&&typeof value.activeSession==='object').map(value=>value.activeSession).sort((a,b)=>entryTime(b)-entryTime(a))[0]||null;
  merged.activeSession=active&&entryTime(active)>cutoff&&!completedSessionIds.has(String(active.id||''))?active:null;
  merged.activeSessionClearedAt=cutoff;
  return merged;
}
function cloudStatePayload(progress){
  return {version:Number(progress.version)||1,history:Array.isArray(progress.history)?progress.history:[],marked:progress.marked||{},errors:progress.errors||{},reviews:progress.reviews||{},notes:progress.notes||{},activeSession:progress.activeSession||null,activeSessionClearedAt:Number(progress.activeSessionClearedAt)||0};
}
function scheduleCloudSync(){
  if(!cloudProgress.snapshot.authenticated)return;
  clearTimeout(state.cloudSyncTimer);
  state.cloudSyncTimer=setTimeout(()=>{state.cloudSyncTimer=null;void syncCloudProgress({silent:true});},1200);
}
class ProgressStore {
  constructor(){ this.key='plataforma.questoes.progress.v1'; }
  load(){ try { return this.normalize(JSON.parse(localStorage.getItem(this.key))); } catch { return this.empty(); } }
  empty(){ return {history:[], marked:{}, errors:{}, reviews:{}, notes:{}, activeSession:null, activeSessionClearedAt:0, version:1}; }
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
      activeSession:raw.activeSession&&typeof raw.activeSession==='object'&&!Array.isArray(raw.activeSession)?raw.activeSession:null,
      activeSessionClearedAt:Number.isFinite(raw.activeSessionClearedAt)?Math.max(0,raw.activeSessionClearedAt):0
    };
  }
  save(data){ localStorage.setItem(this.key, JSON.stringify(data)); window.dispatchEvent(new CustomEvent('progress:changed')); }
  mutate(fn){ const d=this.load(); fn(d); this.save(d); return d; }
  clear(){ localStorage.removeItem(this.key); }
}
const store = new ProgressStore();

async function loadRelease(){
  const stamp=Date.now();
  const supplementalNames=[
    'tce-go-fcc-tcego-2022-controle-externo',
    'tce-go-fcc-tcego-2022-contabilidade',
    'tce-go-fcc-tcego-2014-administrativa',
    'tce-go-fcc-tcece-2015-tecnico-administrativo',
    'tce-go-edital'
  ];
  const names=['questions','metadata','competitions','editais','tjdft-provas',...supplementalNames];
  const payloads=await Promise.all(names.map(name=>fetch('./data/'+name+'.json?refresh='+stamp,{cache:'no-store'}).then(response=>{
    if(!response.ok) throw new Error('Falha ao carregar '+name+'.json');
    return response.json();
  })));
  const [questions,metadata,competitions,editais,officialExams,...supplemental]=payloads;
  const tceGoEdict=supplemental[4];
  const tceQuestions=supplemental.slice(0,4).flatMap(file=>Array.isArray(file?.questions)?file.questions:[]);
  const tceConfig={
    competitionId:'tce-go',
    title:tceGoEdict?.title||'TCE-GO 2026 · Técnico de Controle Externo — Técnico Administrativo',
    source:tceGoEdict?.source||'Anexo II do Edital nº 01/2026 consolidado com a Retificação nº 02/2026',
    mappingNote:tceGoEdict?.mappingNote||'Questões FCC correlacionadas por matéria; sem vínculo confirmado com subitem específico do edital.',
    mappingGranularity:tceGoEdict?.mappingGranularity||'subject',
    questionPoolCount:tceQuestions.length,
    exactTopicMappings:Number(tceGoEdict?.exactTopicMappings)||0,
    topicCount:Number(tceGoEdict?.canonicalAxisCount)||0
  };
  return [questions.concat(tceQuestions),metadata,competitions,[...editais,tceConfig],officialExams,tceGoEdict];
}

async function boot(){
  try{
    const [q,m,c,e,p,tceGoEdict]=await loadRelease();
    state.questions=q; state.meta=m; state.competitions=c; state.editais=e; state.officialExams=p; state.tceGoEdict=tceGoEdict; state.filtered=[...q];
    state.syncLabel=state.meta.sampleMode?'Amostra local':'Release publicada';
    renderNav(); bindGlobal(); populateFilters(); window.dispatchEvent(new CustomEvent('questions:loaded',{detail:{questions:q}}));
    const requested=routeFromUrl();
    const deepLink=applyQuestionDeepLinkFromUrl();
    applyFilters(); renderAll();
    const progress=store.load(); if(progress.activeSession) hydrateSession(progress.activeSession);
    navigate(requested==='resolver'&&!state.session?'home':requested,{history:false});
    if(deepLink.missed) toast('O link externo contém filtro que não existe nesta release.');
    else if(deepLink.autostart&&state.filtered.length) startSessionFromFilters();
    else if(deepLink.active) toast(fmt(state.filtered.length)+' questões encontradas pelo link externo.');
    void initCloudProgress();
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').then(registration=>{state.swRegistration=registration;return registration.update();}).catch(()=>{});
    completeLoading();
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
    const [q,m,c,e,p,tceGoEdict]=await loadRelease();
    state.questions=q; state.meta=m; state.competitions=c; state.editais=e; state.officialExams=p; state.tceGoEdict=tceGoEdict; state.filtered=[...q];
    state.syncLabel='Atualizada · '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    populateFilters(); window.dispatchEvent(new CustomEvent('questions:loaded',{detail:{questions:q}})); applyFilters(); renderAll();
    state.swRegistration?.update().catch(()=>{});
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
    let finalState=store.load(),saved=false;
    for(let attempt=0;attempt<4;attempt+=1){
      const [remoteHistory,remoteState]=await Promise.all([cloudProgress.loadCloudHistory(),cloudProgress.loadCloudState()]);
      const remotePayload=remoteState?.state&&typeof remoteState.state==='object'?{...remoteState.state,history:cloudProgress.mergeHistory(remoteState.state.history,remoteHistory)}:{history:remoteHistory};
      const local=store.load(),merged=mergeProgressState(local,remotePayload);
      if(JSON.stringify(local)!==JSON.stringify(merged))store.save(merged);
      finalState=store.load();
      const write=await cloudProgress.saveCloudState(cloudStatePayload(finalState),Number(remoteState?.state_version)||0);
      if(write.saved){saved=true;break;}
      if(!write.conflict)throw new Error('Falha ao salvar o estado da nuvem.');
    }
    if(!saved)throw new Error('A nuvem mudou repetidamente durante a sincronização.');
    const active=finalState.activeSession;
    const localSessionId=String(state.session?.id||'');
    const completedRecord=localSessionId?(finalState.history||[]).find(record=>String(record?.id||'')===localSessionId):null;
    if(completedRecord&&(!active||String(active.id||'')!==localSessionId)){
      clearInterval(state.timer);state.timer=null;state.session=null;state.hiddenAt=null;
      if(state.currentView==='resolver'){renderResult(completedRecord);navigate('result',{replace:true});}
      toast('Esta bateria foi concluída em outro aparelho.');
    }else if(active&&(!state.session||entryTime(active)>entryTime(state.session)))hydrateSession(active);
    if(!options.silent)toast('Progresso sincronizado entre os aparelhos.');
  }catch{
    if(!options.silent)toast('Progresso salvo localmente; tente sincronizar novamente.');
  }
}
function renderCloudAccount(){
  const cloud=state.cloud||cloudProgress.snapshot;
  const statusLabels={loading:'Conectando…',signed_out:'Modo local',pending:'Link enviado',authenticated:'Conta conectada',syncing:'Sincronizando…',error:'Nuvem indisponível'};
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
    concurso:answer.concurso||question?.concurso||'',
    disciplina:answer.disciplina||question?.disciplina||'',
    assunto:answer.assunto||question?.assunto||'',
    subassunto:answer.subassunto||question?.subassunto||'',
    correctAnswer:answer.correctAnswer||question?.gabarito||null,
    questionVersion:answer.questionVersion||question?.contentVersion||null,
    questionHash:answer.questionHash||question?.contentHash||null,
    releaseSnapshotId:answer.releaseSnapshotId||state.meta?.releaseSnapshotId||null,
    sourceSnapshot:answer.sourceSnapshot||question?.sourceSnapshot||null
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
  const icons=new Map(ROUTES.map(([id,icon])=>[id,icon]));
  const mobile=$('#mobileBottomNav');
  if(mobile)mobile.innerHTML=MOBILE_ROUTES.map(([id,label])=>`<button type="button" data-go="${id}" class="${id==='home'?'active':''}" aria-label="${label}" ${id==='home'?'aria-current="page"':''}><span class="mobile-nav-icon" aria-hidden="true">${icons.get(id)||''}</span><span class="mobile-nav-label">${label}</span></button>`).join('');
}

function questionBelongsTo(q,competitionId){
  const hay=[q.concurso,q.orgao,q.cargo,q.nomeMaterial].filter(Boolean).join(' ');
  if(competitionId==='seedf'){
    if(!/SEEDF/i.test(hay))return false;
    const config=state.competitions.find(item=>item.id==='seedf')||{};
    const roleText=normalizeSearch([q.cargo,q.cargoFonte,q.sourceRole].filter(Boolean).join(' '));
    const excluded=(config.excludedRoles||['Analista — Monitor']).map(normalizeSearch);
    const included=[...(config.focusRoles||[]),...(config.sharedRoles||[])].map(normalizeSearch);
    return !excluded.some(role=>role&&roleText.includes(role))||included.some(role=>role&&roleText.includes(role));
  }
  if(competitionId==='tjdft') return /TJDFT|Tribunal de Justiça do Distrito Federal/i.test(hay);
  if(competitionId==='sedes-df-2026') return /SEDES/i.test(hay);
  if(competitionId==='tce-go') return /TCE-GO/i.test(hay);
  return false;
}
function competitionLabel(competitionId){
  return ({seedf:'SEEDF',tjdft:'TJDFT','sedes-df-2026':'SEDES/DF 2026','tce-go':'TCE-GO'})[competitionId]||String(competitionId||'');
}
function setCompetitionScope(competitionId=''){
  const next=['seedf','tjdft','sedes-df-2026','tce-go'].includes(competitionId)?competitionId:'';
  if(state.competitionScope===next)return;
  state.competitionScope=next;
  if(next!=='tce-go'){state.tceSectionScope='';state.tceMaterialScope='';}
  if(next)document.documentElement.dataset.competitionScope=next;else delete document.documentElement.dataset.competitionScope;
  window.dispatchEvent(new CustomEvent('competition-scope:changed',{detail:{competitionId:next}}));
}

function buildVerticalizedEditais(){
  return state.editais.map(config=>{
    const pool=state.questions.filter(q=>questionBelongsTo(q,config.competitionId));
    const cargoValues=[...new Set(pool.map(q=>String(q.c…7486 tokens truncated…pty">Aguardando questões</span>';
    const summaryText=isTceGo?`${fmt(edital.questionCount)} correlatas por matéria · ${fmt(edital.topicCount)} tópicos no edital`:`${fmt(edital.mappedQuestionCount)} em tópicos · ${fmt(edital.axisCount)} disciplinas`;
    const noteText=isTceGo?'Os grupos por matéria podem se sobrepor. Os 448 itens oficiais aparecem abaixo; ainda não há vínculo direto questão a questão com esses subitens.':'Abra uma disciplina e escolha o tópico. A bateria será criada somente com aquele conteúdo.';
    return `<article class="card edital-card"><div class="edital-card-head"><div><span class="kicker">${escapeHtml(String(edital.competitionId||'').toUpperCase())}</span><h2>${escapeHtml(edital.title)}</h2><p>${escapeHtml(edital.mappingNote)}</p></div><div class="edital-count"><strong>${fmt(edital.questionCount)}</strong><span>questões no recorte</span></div></div><div class="edital-summary">${status}<span>${summaryText}</span></div><p class="edital-note">${noteText}</p>${axisMarkup}<div class="edital-footer"><small>Fonte: ${escapeHtml(edital.source||'Release publicada')}</small>${edital.questionCount?`<button type="button" class="secondary" data-edital-filter="${escapeHtml(edital.competitionId)}">Abrir todas as questões</button>`:''}</div></article>`;
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
  const cards=entries=>entries.length?entries.map(([name,qs])=>{
    const materialId=qs.find(question=>question.sourceMaterialId)?.sourceMaterialId;
    const action=materialId?`<button type="button" class="primary" data-tce-material="${escapeHtml(materialId)}">Fazer questões deste caderno →</button>`:'';
    return '<article class="card"><span class="kicker">'+fmt(qs.length)+' QUESTÕES</span><h2>'+escapeHtml(name)+'</h2><p>'+escapeHtml(uniq(qs.map(q=>q.banca)).join(' · '))+'</p>'+action+'</article>';
  }).join(''):'<div class="card empty-state">Nenhum item deste tipo na release atual.</div>';
  const officialGroups=new Map();
  state.officialExams.forEach(exam=>{
    const key=exam.career||'TJDFT';
    if(!officialGroups.has(key)) officialGroups.set(key,[]);
    officialGroups.get(key).push(exam);
  });
  const canonicalExamCount=state.officialExams.filter(exam=>exam.examType==='Tipo 1').length;
  const interactiveCareerCount=[...officialGroups.keys()].filter(career=>officialProofQuestions(career).length).length;
  const interactiveQuestionCount=[...officialGroups.keys()].reduce((sum,career)=>sum+officialProofQuestions(career).length,0);
  const officialMarkup=officialGroups.size?[
    '<section class="card proof-source-note proof-section-wide"><div class="proof-source-eyebrow"><span class="kicker">FONTE OFICIAL · TJDFT 2022</span><span class="status-badge status-live">'+fmt(state.officialExams.length)+' cadernos</span></div><h2>Provas oficiais do último concurso</h2><p>Os PDFs abaixo são os cadernos originais hospedados pela FGV. Há '+fmt(canonicalExamCount)+' provas canônicas Tipo 1; '+fmt(interactiveCareerCount)+' já possuem '+fmt(interactiveQuestionCount)+' questões revisadas e interativas. Os Tipos 2, 3 e 4 são variantes do mesmo cargo e não são importados como questões duplicadas.</p><div class="release-actions"><a class="secondary" href="'+escapeHtml(state.officialExams[0].sourcePageUrl)+'" target="_blank" rel="noreferrer">Índice oficial FGV →</a><a class="secondary" href="'+escapeHtml(state.officialExams[0].officialPortalUrl)+'" target="_blank" rel="noreferrer">Portal do TJDFT →</a></div></section>',
    [...officialGroups.entries()].map(([career,exams])=>{const available=officialProofQuestions(career).length;return [
      '<article class="card official-proof-card"><div class="card-head"><div><span class="kicker">TJDFT · 2022</span><h2>'+escapeHtml(career)+'</h2></div><span class="status-badge '+(available?'status-live':'status-empty')+'">'+(available?fmt(available)+' interativas':'Em preparação')+'</span></div><p class="proof-summary">'+escapeHtml(exams[0].level)+' · '+escapeHtml(exams[0].board)+' · '+fmt(exams[0].objectiveCount)+' objetivas · '+escapeHtml(exams[0].discursiveLabel)+' · '+fmt(exams[0].durationMinutes)+' min</p><div class="proof-coverage"><div><strong>'+(available?fmt(available)+' questões prontas':'Fonte oficial catalogada')+'</strong><small>'+(available?'Abra o recorte desta prova e escolha quantidade e modo.':'A transcrição ainda não passou pelos gates editoriais.')+'</small></div>'+(available?'<button type="button" class="primary" data-proof-cargo="'+escapeHtml(career)+'">Fazer questões →</button>':'')+'</div><div class="proof-variants">',
      exams.map(exam=>'<a class="proof-variant" href="'+escapeHtml(exam.proofUrl)+'" target="_blank" rel="noreferrer"><strong>'+escapeHtml(exam.examType)+'</strong><small>Abrir PDF oficial →</small></a>').join(''),
      '</div><div class="release-actions"><a class="secondary" href="'+escapeHtml(exams[0].answerKeyUrl)+'" target="_blank" rel="noreferrer">Gabarito definitivo</a><a class="secondary" href="'+escapeHtml(exams[0].noticeUrl)+'" target="_blank" rel="noreferrer">Edital-base</a></div></article>'
    ].join('')}).join('')
  ].join(''):'';
  const archive=grouped('prova');
  const archiveMarkup=archive.length?'<div class="proof-section-wide archive-heading"><p class="eyebrow">QUESTÕES JÁ CATALOGADAS</p><h2>Materiais disponíveis no banco</h2></div>'+cards(archive):'';
  $('#proofList').innerHTML=(officialMarkup+archiveMarkup)||'<div class="card empty-state">Nenhum item deste tipo na release atual.</div>';
  $('#simulationList').innerHTML=cards(grouped('simulado'));
}
function renderRelease(){
  const releaseStatus=$('#releaseStatus'); if(releaseStatus) releaseStatus.textContent=state.syncLabel;
  const m=state.meta;
  const policy=currentScoringPolicy();
  const tceGoCount=state.questions.filter(question=>questionBelongsTo(question,'tce-go')).length;
  $('#releaseDetails').innerHTML=[['Schema',m.schemaVersion],['Snapshot',m.releaseSnapshotId?String(m.releaseSnapshotId).slice(0,12)+'…':'—'],['Gerado em',m.generatedAt?new Date(m.generatedAt).toLocaleString('pt-BR'):'—'],['Fonte principal',m.source],['Data source',m.dataSourceId],['Questões na release Notion',m.questionCount],['Questões FCC TCE-GO correlatas',tceGoCount],['Total no banco',state.questions.length],['Provas oficiais TJDFT',state.officialExams.length],['Pontuação',policy.negativeMarking?'penalidade configurada':'sem penalidade'],['Modo',m.sampleMode?'amostra':'publicado']].map(([k,v])=>`<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v??'—')}</dd>`).join('');
}

function startSessionFromFilters(){
  const poolSource=state.filtered.filter(q=>answerOptions(q).length); const max=poolSource.length;
  if(!max){toast('Nenhuma questão objetiva disponível neste recorte.');return;}
  if(max!==state.filtered.length) toast('Questões discursivas foram mantidas fora da bateria objetiva.');
  const size=Math.min(max,Math.max(1,+$('#sessionSize').value||10));let pool=$('#shuffleQuestions').checked?(state.competitionScope==='tce-go'?shuffleTceSources(poolSource):shuffleItems(poolSource)):[...poolSource];pool=pool.slice(0,size);
  createSession(pool,$('#sessionMode').value);
}
function createSession(items,mode='training'){
  const now=Date.now();
  const s={id:crypto.randomUUID?.()||String(now),items:items.map(q=>q.id),index:0,mode,answers:{},confirmed:{},questionTimes:{},startedAt:now,pausedMs:0,currentEnteredAt:now,lastSavedAt:now,releaseSnapshotId:state.meta?.releaseSnapshotId||null};
  state.session=s; persistActive(); navigate('resolver'); startTimer(); renderResolver();
}
function sessionMap(value,ids){ const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{}; return Object.fromEntries(ids.filter(id=>Object.prototype.hasOwnProperty.call(source,id)).map(id=>[id,source[id]])); }
function hydrateSession(saved){
  if(!saved||!Array.isArray(saved.items)){ store.mutate(p=>p.activeSession=null); state.session=null; return; }
  const completed=store.load().history.find(record=>String(record?.id||'')===String(saved.id||''));
  if(completed){
    const finishedAt=Number(completed.finishedAt)||Date.now();
    store.mutate(p=>{p.activeSession=null;p.activeSessionClearedAt=Math.max(Number(p.activeSessionClearedAt)||0,finishedAt);});
    state.session=null;state.hiddenAt=null;return;
  }
  const items=saved.items.filter(id=>{const q=state.questions.find(item=>item.id===id);return q&&answerOptions(q).length;});
  if(!items.length){ store.mutate(p=>p.activeSession=null); state.session=null; return; }
  const s=JSON.parse(JSON.stringify(saved));
  s.id=s.id||String(Date.now()); s.items=items; s.index=Math.min(items.length-1,Math.max(0,Number.isInteger(s.index)?s.index:0)); s.mode=s.mode==='exam'?'exam':'training';
  s.answers=sessionMap(s.answers,items); s.confirmed=sessionMap(s.confirmed,items); s.questionTimes=sessionMap(s.questionTimes,items);
  s.startedAt=Number.isFinite(s.startedAt)?s.startedAt:Date.now(); s.pausedMs=Math.max(0,Number(s.pausedMs)||0); s.lastSavedAt=Number(s.lastSavedAt)||Date.now();
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
  if(!state.session)return;
  const q=currentQuestion();if(!q)return;
  const s=state.session,p=store.load(),position=s.index+1,total=s.items.length,percent=Math.round(position/Math.max(1,total)*100);
  $('#resolverPosition').textContent=`${position}/${total}`;
  $('#resolverTimer').textContent=clock(seconds(elapsedMs(s)));
  const progress=$('#resolverProgress'),progressBar=$('#resolverProgressBar');
  if(progress){progress.setAttribute('aria-valuenow',String(percent));progress.setAttribute('aria-valuetext',`Questão ${position} de ${total}`);}
  if(progressBar)progressBar.style.width=percent+'%';
  const progressLabel=$('#resolverProgressLabel');if(progressLabel)progressLabel.textContent=`${percent}% concluído`;
  const modeLabel=$('#resolverModeLabel');if(modeLabel)modeLabel.textContent=s.mode==='exam'?'Modo prova':'Treino comentado';
  $('#questionMeta').innerHTML=[q.formato,q.disciplina,q.assunto,q.subassunto,q.banca].map(chip).join('');
  const questionSource=$('#questionSource');
  if(questionSource){questionSource.textContent=questionSourceDescription(q);questionSource.classList.toggle('hidden',!q.sourceLabel);}
  const questionBaseText=$('#questionBaseText');
  if(questionBaseText){questionBaseText.textContent=q.baseText||'';questionBaseText.classList.toggle('hidden',!q.baseText);}
  const questionText=$('#questionText');questionText.textContent=q.enunciado;questionText.setAttribute('role','heading');questionText.setAttribute('aria-level','2');questionText.setAttribute('tabindex','-1');
  const opts=answerOptions(q),chosen=s.answers[q.id],confirmed=Boolean(s.confirmed[q.id]);
  const isBinary=q.formato==='Certo / Errado'||['Certo','Errado'].includes(q.gabarito);
  const answers=$('#answers');answers.setAttribute('aria-label',`Alternativas da questão ${position}`);
  answers.innerHTML=opts.map(([key,text])=>{
    let cls='answer';if(chosen===key)cls+=' selected';if(confirmed&&s.mode==='training'){if(key===q.gabarito)cls+=' correct';else if(chosen===key)cls+=' wrong';}
    const answerKey=isBinary?String(key).slice(0,1):key;
    return `<button type="button" class="${cls}" data-answer="${escapeHtml(key)}" ${confirmed?'disabled':''} aria-pressed="${chosen===key}" aria-label="${escapeHtml(text)}"><span class="answer-key">${escapeHtml(answerKey)}</span><span class="answer-copy">${escapeHtml(text)}</span></button>`;
  }).join('');
  $$('#answers [data-answer]').forEach(button=>button.addEventListener('click',()=>{
    s.answers[q.id]=button.dataset.answer;persistActive();renderResolver();
    [...$$('#answers [data-answer]')].find(item=>item.dataset.answer===s.answers[q.id])?.focus();
  }));
  const feedback=$('#feedback'),showFeedback=confirmed&&s.mode==='training';
  feedback.classList.toggle('hidden',!showFeedback);feedback.classList.remove('is-correct','is-wrong');
  if(showFeedback){feedback.innerHTML=feedbackHtml(q,chosen);feedback.classList.add(chosen===q.gabarito?'is-correct':'is-wrong');}
  const savedNote=typeof p.notes[q.id]==='string'?p.notes[q.id]:(p.notes[q.id]?.text||'');
  const hasDraft=Object.prototype.hasOwnProperty.call(state.noteDrafts,q.id),noteText=hasDraft?String(state.noteDrafts[q.id]||''):savedNote;
  const noteInput=$('#questionNote');if(noteInput){noteInput.value=noteText;noteInput.setAttribute('aria-label','Anotação da questão '+q.id);}
  const noteCounter=$('#questionNoteCounter');if(noteCounter)noteCounter.textContent=noteText.length+'/4000';
  const noteStatus=$('#questionNoteStatus');if(noteStatus)noteStatus.textContent=hasDraft&&noteText!==savedNote?'Edição não salva':noteText?'Salva neste aparelho':'Ainda não salva';
  const confirm=$('#confirmAnswer');confirm.classList.toggle('hidden',confirmed);confirm.disabled=!chosen&&!confirmed;
  $('#nextQuestion').classList.toggle('hidden',!confirmed||s.index===total-1);
  const canFinish=s.index===total-1&&(s.mode==='exam'||confirmed);
  $('#finishSession').classList.toggle('hidden',!canFinish);
  $('#prevQuestion').disabled=s.index===0;
  const marked=Boolean(p.marked[q.id])&&!p.marked[q.id].removed,markButton=$('#markQuestion');
  markButton.textContent=marked?'★ Marcada':'☆ Marcar';markButton.setAttribute('aria-pressed',String(marked));
  renderQuestionMap();
}
function answerOptions(q){
  if(q.formato==='Certo / Errado' || ['Certo','Errado'].includes(q.gabarito)) return [['Certo','Certo'],['Errado','Errado']];
  return Object.entries(q.alternativas||{}).filter(([,v])=>String(v||'').trim());
}
function feedbackHtml(q,chosen){ const ok=chosen===q.gabarito; return `<strong>${ok?'Resposta correta.':'Resposta incorreta.'}</strong> Gabarito: <strong>${escapeHtml(q.gabarito)}</strong>${q.comentarioGeral?`<p>${escapeHtml(q.comentarioGeral)}</p>`:''}${q.fundamentoLegal?`<p><strong>Fundamento:</strong> ${escapeHtml(q.fundamentoLegal)}</p>`:''}${q.pegadinha?`<p><strong>Pegadinha:</strong> ${escapeHtml(q.pegadinha)}</p>`:''}`; }
function confirmAnswer(){const q=currentQuestion(),s=state.session;if(!q||!s)return;if(!s.answers[q.id]){toast('Selecione uma resposta.');return;}s.confirmed[q.id]=true;persistActive();renderResolver();if(s.mode==='training')requestAnimationFrame(()=>$('#feedback')?.focus());}
function moveQuestion(delta){if(!state.session)return;saveQuestionTime();const s=state.session;s.index=Math.max(0,Math.min(s.items.length-1,s.index+delta));persistActive();renderResolver();requestAnimationFrame(()=>$('#questionText')?.focus());}
function renderQuestionMap(){const s=state.session,p=store.load(),root=$('#questionMap');root.innerHTML=s.items.map((id,index)=>{const current=index===s.index,answered=Boolean(s.answers[id]),marked=p.marked[id]&&!p.marked[id].removed;return `<button type="button" data-map="${index}" class="${current?'current ':''}${answered?'answered ':''}${marked?'marked':''}" aria-label="Questão ${index+1}${answered?', respondida':''}${marked?', marcada':''}" ${current?'aria-current="step"':''}>${index+1}</button>`;}).join('');$$('#questionMap [data-map]').forEach(button=>button.addEventListener('click',()=>{saveQuestionTime();s.index=+button.dataset.map;s.currentEnteredAt=Date.now();persistActive();renderResolver();requestAnimationFrame(()=>$('#questionText')?.focus());}));}
function persistActive(){
  if(!state.session)return;
  state.session.lastSavedAt=Date.now();
  store.mutate(p=>{p.activeSession=JSON.parse(JSON.stringify(state.session));p.activeSessionClearedAt=0;});
  scheduleCloudSync();
}
function toggleMarked(){
  const q=currentQuestion(); if(!q)return;
  store.mutate(p=>{
    const current=p.marked[q.id];
    p.marked[q.id]=current&&!current.removed?{removed:true,removedAt:Date.now()}:{at:Date.now()};
  });
  renderResolver(); scheduleCloudSync();
}
function saveQuestionNote(){
  const q=currentQuestion(),input=$('#questionNote'); if(!q||!input)return;
  const text=input.value.trim().slice(0,4000),now=Date.now();
  delete state.noteDrafts[q.id];
  store.mutate(p=>{p.notes[q.id]={text,updatedAt:now};});
  renderResolver(); toast(text?'Anotação salva.':'Anotação removida.'); scheduleCloudSync();
}

function advanceReviewIfDue(review,finishedAt){
  if(!review||review.stage==='Dominada')return false;
  const dueAt=Math.max(0,Number(review.dueAt)||0);
  if(dueAt>finishedAt)return false;
  review.stage=review.stage==='D0'?'D7':review.stage==='D7'?'D20':'Dominada';
  review.dueAt=review.stage==='D7'?finishedAt+7*864e5:review.stage==='D20'?finishedAt+20*864e5:null;
  review.updatedAt=finishedAt;
  return true;
}
function finishSession(){
  const s=state.session;if(!s)return;
  const existing=store.load().history.find(record=>String(record?.id||'')===String(s.id||''));
  if(existing){
    clearInterval(state.timer);state.timer=null;state.session=null;state.hiddenAt=null;
    const finishedAt=Number(existing.finishedAt)||Date.now();
    store.mutate(p=>{p.activeSession=null;p.activeSessionClearedAt=Math.max(Number(p.activeSessionClearedAt)||0,finishedAt);});
    renderResult(existing);navigate('result',{replace:true});toast('Esta bateria já havia sido concluída em outro aparelho.');void syncCloudProgress({silent:true});return;
  }
  saveQuestionTime(); clearInterval(state.timer);
  const policy=currentScoringPolicy(),finishedAt=Date.now();
  const answers=s.items.map(id=>{
    const q=state.questions.find(x=>x.id===id),given=s.answers[id]||null;
    return {questionId:id,given,correctAnswer:q?.gabarito||null,isCorrect:given===q?.gabarito,blank:!given,time:s.questionTimes[id]||0,concurso:q?.concurso||'',disciplina:q?.disciplina||'',assunto:q?.assunto||'',subassunto:q?.subassunto||'',questionVersion:q?.contentVersion||null,questionHash:q?.contentHash||null,releaseSnapshotId:state.meta?.releaseSnapshotId||s.releaseSnapshotId||null,sourceSnapshot:q?.sourceSnapshot||null,clientEventId:crypto.randomUUID?.()||('evt-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))};
  });
  const correct=answers.filter(a=>a.isCorrect).length,rawWrong=answers.filter(a=>a.given&&!a.isCorrect).length,blank=answers.filter(a=>a.blank).length;
  const wrong=rawWrong+(policy.blankCountsAsWrong?blank:0),penaltyWrong=policy.blankCountsAsWrong?wrong:rawWrong;
  const score=correct-(Number(policy.negativeMarking)||0)*penaltyWrong,answered=correct+rawWrong;
  const record={id:s.id,finishedAt,startedAt:s.startedAt,mode:s.mode,total:s.items.length,correct,wrong,rawWrong,blank,answered,score,scorePercent:s.items.length?score/s.items.length*100:0,scoringPolicyVersion:policy.version,elapsedMs:elapsedMs(s),answers};
  store.mutate(p=>{
    p.history.unshift(record);p.activeSession=null;p.activeSessionClearedAt=finishedAt;
    answers.forEach(a=>{
      if(a.isCorrect){
        if(p.errors[a.questionId])p.errors[a.questionId].lastCorrect=finishedAt;
        const r=p.reviews[a.questionId];
        if(r)advanceReviewIfDue(r,finishedAt);
      }else if(a.given){
        p.errors[a.questionId]={count:(p.errors[a.questionId]?.count||0)+1,lastError:finishedAt};
        p.reviews[a.questionId]={stage:'D0',dueAt:finishedAt,updatedAt:finishedAt};
      }
    });
  });
  state.hiddenAt=null;state.session=null;renderResult(record);navigate('result');void syncCloudProgress({silent:true});
}
function renderResult(r){
  const policy=currentScoringPolicy(),correct=Number(r.correct)||0,wrong=Number(r.wrong)||0,rawWrong=Number.isFinite(r.rawWrong)?r.rawWrong:wrong,blank=Number(r.blank)||0;
  const answered=Number.isFinite(r.answered)?r.answered:correct+rawWrong,precision=answered?correct/answered*100:0;
  const score=Number.isFinite(r.score)?r.score:correct-(Number(policy.negativeMarking)||0)*(policy.blankCountsAsWrong?wrong:rawWrong);
  const percent=Number.isFinite(r.scorePercent)?r.scorePercent:(r.total?score/r.total*100:0),elapsed=seconds(r.elapsedMs??(r.finishedAt-r.startedAt));
  $('#resultMetrics').innerHTML=[['Corretas',correct],['Erradas',rawWrong],['Em branco',blank],['Pontuação',`${percent.toFixed(1)}%`],['Precisão',`${precision.toFixed(1)}%`],['Tempo',clock(elapsed)],['Média/questão',clock(r.total?Math.round(elapsed/r.total):0)],['Total',r.total]].map(metricHtml).join('');
  const by=aggregateBy(r.answers,'disciplina');
  $('#resultBreakdown').innerHTML=Object.entries(by).map(([k,v])=>{const answered=Math.max(0,v.total-v.blank),percent=answered?Math.round(v.correct/answered*100):0;return `<article class="card"><h2>${escapeHtml(k||'Sem disciplina')}</h2><p>${v.correct}/${answered} corretas · ${percent}%${v.blank?` · ${v.blank} em branco`:``}</p></article>`;}).join('')||'<div class="card empty-state">Sem dados.</div>';
}
function redoErrors(){ const h=store.load().history[0]; if(!h)return; const qs=h.answers.filter(a=>!a.isCorrect&&a.given).map(a=>state.questions.find(q=>q.id===a.questionId)).filter(q=>q&&answerOptions(q).length); if(!qs.length){toast('Não há erradas objetivas nessa sessão.');return;} createSession(qs,'training'); }

function renderReview(){ const p=store.load(); const ids=uniq([...Object.keys(p.errors||{}),...Object.keys(p.marked||{}).filter(id=>!p.marked[id]?.removed),...Object.keys(p.reviews||{})]); const root=$('#reviewList'); if(!ids.length){root.innerHTML='<div class="card empty-state">Nenhuma questão em revisão ainda.</div>';return;} root.innerHTML=ids.map(id=>{const q=state.questions.find(x=>x.id===id);if(!q)return'';const e=p.errors[id],r=p.reviews[id],m=p.marked[id];return `<article class="card"><div class="chips">${e?chip(`${e.count} erro(s)`):''}${r?chip(r.stage):''}${m?chip('Marcada'):''}</div><h2>${escapeHtml(q.disciplina||'Questão')}</h2><p>${escapeHtml(q.enunciado)}</p><button class="secondary" data-review-one="${escapeHtml(id)}">Resolver agora</button></article>`;}).join(''); $$('[data-review-one]').forEach(b=>b.addEventListener('click',()=>{const q=state.questions.find(x=>x.id===b.dataset.reviewOne);if(q)createSession([q],'training');})); }
function recordPrecision(record){
  const correct=Number(record?.correct)||0;
  const rawWrong=Number.isFinite(record?.rawWrong)?Number(record.rawWrong):Number(record?.wrong)||0;
  const answered=correct+rawWrong;
  return answered?correct/answered*100:0;
}
function renderPerformance(){
  const history=store.load().history;
  const all=history.flatMap(record=>(record.answers||[]).map(enrichAnswer));
  const total=all.length,attempted=all.filter(answer=>!answer.blank),correct=all.filter(answer=>answer.isCorrect).length;
  const answeredCount=attempted.length,precision=answeredCount?correct/answeredCount*100:0;
  const avg=total?all.reduce((sum,answer)=>sum+(answer.time||0),0)/total:0;
  const best=history.length?Math.max(...history.map(recordPrecision)):0;
  $('#performanceMetrics').innerHTML=[['Respondidas',answeredCount],['Acertos',correct],['Precisão',precision.toFixed(1)+'%'],['Tempo médio',clock(Math.round(avg))],['Sessões',history.length],['Melhor sessão',best.toFixed(1)+'%']].map(metricHtml).join('');
  const sessions=[...history].sort((a,b)=>(a.finishedAt||0)-(b.finishedAt||0)).slice(-12);
  const trend=sessions.map((record,index)=>({value:recordPrecision(record),label:new Date(record.finishedAt||Date.now()).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' · '+(index+1)}));
  const by=aggregateBy(all,'disciplina');
  const entries=Object.entries(by).sort((a,b)=>{const pa=a[1].correct/Math.max(1,a[1].total-a[1].blank),pb=b[1].correct/Math.max(1,b[1].total-b[1].blank);return pa-pb||b[1].total-a[1].total;});
  const insightRoot=$('#performanceInsights');
  if(insightRoot){
    const weak=entries.filter(([,value])=>value.total-value.blank>0).slice(0,3);
    insightRoot.innerHTML=weak.length?weak.map(([discipline,value],index)=>{const answered=value.total-value.blank,percent=answered?value.correct/answered*100:0;return `<article class="insight-card"><span>PRIORIDADE ${index+1}</span><strong>${escapeHtml(discipline||'Sem disciplina')}</strong><p>${percent.toFixed(0)}% de precisão em ${answered} ${answered===1?'resposta':'respostas'}. Uma nova bateria pode consolidar este ponto.</p><button type="button" class="text-button" data-insight-discipline="${escapeHtml(discipline)}">Praticar esta disciplina →</button></article>`;}).join(''):'<article class="insight-card"><span>PRÓXIMO PASSO</span><strong>Conclua sua primeira bateria</strong><p>Com algumas respostas, a plataforma passa a indicar onde concentrar o estudo.</p><button type="button" class="text-button" data-go="questions">Montar bateria →</button></article>';
  }
  const chartRoot=$('#performanceCharts');
  if(chartRoot)chartRoot.innerHTML='<div class="chart-grid"><article class="card chart-card"><div class="chart-head"><div><span class="kicker">EVOLUÇÃO</span><h2>Precisão por sessão</h2></div><span class="chart-caption">Últimas '+sessions.length+'</span></div><div class="chart-scroll">'+trendChart(trend)+'</div></article><article class="card chart-card"><div class="chart-head"><div><span class="kicker">FOCO</span><h2>Precisão por disciplina</h2></div><span class="chart-caption">'+entries.length+' áreas</span></div><div class="bar-chart">'+(entries.length?entries.slice(0,10).map(([key,value])=>{const percent=value.correct/Math.max(1,value.total-value.blank)*100;return '<div class="bar-row"><div class="bar-label"><span>'+escapeHtml(key||'Sem disciplina')+'</span><strong>'+percent.toFixed(0)+'%</strong></div><div class="bar-track"><span class="bar-fill" style="width:'+Math.max(0,Math.min(100,percent))+'%"></span></div><small>'+value.total+' respostas · '+value.blank+' em branco</small></div>';}).join(''):'<div class="empty-state">Responda questões para ver seus pontos fortes e fracos.</div>')+'</div></article></div>';
  $('#performanceBreakdown').innerHTML=entries.length?entries.map(([key,value])=>{const answered=value.total-value.blank,percent=answered?value.correct/answered*100:0;return '<article class="card"><span class="kicker">'+value.total+' RESPOSTAS</span><h2>'+escapeHtml(key||'Sem disciplina')+'</h2><p>'+percent.toFixed(1)+'% de precisão · '+value.blank+' em branco</p></article>';}).join(''):'<div class="card empty-state">Conclua uma bateria para gerar desempenho.</div>';
}
function aggregateBy(arr,key){return arr.reduce((m,a)=>{const k=a[key]||'Sem classificação';m[k]??={total:0,correct:0,blank:0};m[k].total++;if(a.blank)m[k].blank++;else if(a.isCorrect)m[k].correct++;return m;},{});}

async function validateImport(e){ const file=e.target.files[0]; if(!file)return; try{const data=JSON.parse(await file.text());const arr=Array.isArray(data)?data:data.questions;if(!Array.isArray(arr))throw new Error('Esperado array de questões ou {questions:[...]}.');const missing=arr.filter(q=>!q.enunciado||!q.gabarito).length;$('#importReport').textContent=`Arquivo válido\nRegistros: ${arr.length}\nSem enunciado/gabarito: ${missing}\n\nPré-validação apenas: nada foi publicado nem enviado ao Notion.`;}catch(err){$('#importReport').textContent=`Arquivo inválido: ${err.message}`;}}
function exportProgress(){ const blob=new Blob([JSON.stringify(store.load(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`plataforma-questoes-progresso-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000); }
function resetProgress(){ if(!confirm('Zerar somente o progresso deste aparelho? O banco de questões e o progresso sincronizado na nuvem não serão alterados.'))return;store.clear();state.noteDrafts={};state.session=null;state.hiddenAt=null;clearTimeout(state.cloudSyncTimer);clearInterval(state.timer);renderAll();navigate('home');toast('Progresso local zerado.');}
function toast(msg){ const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200); }

boot();
