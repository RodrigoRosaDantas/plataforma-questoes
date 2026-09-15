const PROGRESS_KEY='plataforma.questoes.progress.v1';
let reviewSummaryTimer=null;
let resultInsightTimer=null;
let performanceTopicTimer=null;
let facetTimer=null;
let facetReloadTimer=null;
let facetRows=[];
let facetUniverses={};

const FACET_CONFIG=[
  {id:'filterConcurso',key:'concurso',label:'Concurso'},
  {id:'filterOrgao',key:'orgao',label:'Órgão'},
  {id:'filterCargo',key:'cargo',label:'Cargo'},
  {id:'filterBanca',key:'banca',label:'Banca'},
  {id:'filterAno',key:'ano',label:'Ano'},
  {id:'filterDisciplina',key:'disciplina',label:'Disciplina'},
  {id:'filterAssunto',key:'assunto',label:'Assunto'},
  {id:'filterSubassunto',key:'subassunto',label:'Subassunto'},
  {id:'filterFormato',key:'formato',label:'Formato'}
];

function readProgress(){
  try{return JSON.parse(localStorage.getItem(PROGRESS_KEY)||'null')||{};}catch{return {};}
}
function unresolvedError(item){
  return Boolean(item&&typeof item==='object')&&(Number(item.lastError)||0)>(Number(item.lastCorrect)||0);
}
function dueReview(item,now=Date.now()){
  if(!item||typeof item!=='object'||item.stage==='Dominada')return false;
  const dueAt=Number(item.dueAt)||0;
  return !dueAt||dueAt<=now;
}
function scheduledReview(item,now=Date.now()){
  if(!item||typeof item!=='object'||item.stage==='Dominada')return false;
  return (Number(item.dueAt)||0)>now;
}
function activeMark(item){return Boolean(item)&&!item.removed;}
function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function smartReviewSummaryHtml(){
  const progress=readProgress(),now=Date.now();
  const errors=Object.values(progress.errors||{}).filter(unresolvedError).length;
  const due=Object.values(progress.reviews||{}).filter(item=>dueReview(item,now)).length;
  const scheduled=Object.values(progress.reviews||{}).filter(item=>scheduledReview(item,now)).length;
  const marked=Object.values(progress.marked||{}).filter(activeMark).length;
  const immediate=errors||due;
  if(immediate){
    return `<p><strong>${errors}</strong> erros ativos · <strong>${due}</strong> revisões vencidas · <strong>${marked}</strong> marcadas</p><button class="secondary" data-go="review">Abrir revisão</button>`;
  }
  if(scheduled||marked){
    return `<p><strong>Sem revisão vencida.</strong> ${scheduled} agendadas · ${marked} marcadas</p><button class="secondary" data-go="review">Ver caderno</button>`;
  }
  return 'Sem revisões pendentes.';
}
function renderSmartReviewSummary(){
  const root=document.querySelector('#reviewSummary');
  if(!root)return;
  const html=smartReviewSummaryHtml();
  if(root.innerHTML!==html)root.innerHTML=html;
}
function scheduleReviewSummary(){
  clearTimeout(reviewSummaryTimer);
  reviewSummaryTimer=setTimeout(()=>{reviewSummaryTimer=null;renderSmartReviewSummary();},20);
}
function installReviewSummarySync(){
  const root=document.querySelector('#reviewSummary');
  if(!root)return;
  const observer=new MutationObserver(()=>scheduleReviewSummary());
  observer.observe(root,{subtree:true,childList:true,characterData:true});
  window.addEventListener('progress:changed',scheduleReviewSummary);
  window.addEventListener('storage',event=>{if(event.key===PROGRESS_KEY)scheduleReviewSummary();});
  scheduleReviewSummary();
}
function resolverVisible(){
  const view=document.querySelector('[data-view="resolver"]');
  return Boolean(view&&!view.classList.contains('hidden'));
}
function editableTarget(target){
  if(!(target instanceof Element))return false;
  return Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
}
function visibleButton(selector){
  const button=document.querySelector(selector);
  return button&&!button.disabled&&!button.classList.contains('hidden')?button:null;
}
function answerButtonForKey(key){
  const buttons=[...document.querySelectorAll('#answers [data-answer]:not([disabled])')];
  if(/^\d$/.test(key)){
    const index=Number(key)-1;
    return index>=0&&index<buttons.length?buttons[index]:null;
  }
  const normalized=key.toLowerCase();
  const exact=buttons.find(button=>String(button.dataset.answer||'').toLowerCase()===normalized);
  if(exact)return exact;
  if(['a','b','c','d','e'].includes(normalized)){
    return buttons.find(button=>String(button.dataset.answer||'').toLowerCase().startsWith(normalized))||null;
  }
  return null;
}
function handleResolverShortcut(event){
  if(!resolverVisible()||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||editableTarget(event.target))return;
  const key=event.key;
  let action=null;
  if(/^[1-5]$/.test(key)||/^[a-eA-E]$/.test(key))action=answerButtonForKey(key);
  else if(key==='Enter')action=visibleButton('#confirmAnswer')||visibleButton('#nextQuestion');
  else if(key.toLowerCase()==='m')action=visibleButton('#markQuestion');
  else if(key==='ArrowLeft')action=visibleButton('#prevQuestion');
  else if(key==='ArrowRight')action=visibleButton('#nextQuestion');
  if(!action)return;
  event.preventDefault();
  action.click();
}
function installResolverShortcuts(){
  document.addEventListener('keydown',handleResolverShortcut);
  const top=document.querySelector('[data-view="resolver"] .resolver-topline');
  if(!top||document.querySelector('#resolverShortcutHint'))return;
  const hint=document.createElement('div');
  hint.id='resolverShortcutHint';
  hint.className='resolver-shortcut-hint';
  hint.setAttribute('aria-label','Atalhos de teclado do resolvedor');
  hint.innerHTML='<span>Atalhos</span><kbd>A–E</kbd><small>ou</small><kbd>1–5</kbd><small>responder</small><kbd>Enter</kbd><small>confirmar/avançar</small><kbd>M</kbd><small>marcar</small><kbd>←</kbd><kbd>→</kbd><small>navegar</small>';
  top.insertAdjacentElement('afterend',hint);
}
function latestSession(){
  const history=readProgress().history;
  return Array.isArray(history)&&history.length?history[0]:null;
}
function sessionDisciplineStats(record){
  const map=new Map();
  for(const answer of Array.isArray(record?.answers)?record.answers:[]){
    if(answer.blank||answer.given===null||answer.given==='')continue;
    const label=String(answer.disciplina||'Sem classificação').trim()||'Sem classificação';
    const row=map.get(label)||{label,total:0,correct:0,wrong:0,time:0};
    row.total+=1;
    row.time+=Math.max(0,Number(answer.time)||0);
    if(answer.isCorrect===true)row.correct+=1;else row.wrong+=1;
    map.set(label,row);
  }
  return [...map.values()].map(row=>({...row,precision:row.total?Math.round(row.correct/row.total*100):0})).sort((a,b)=>a.precision-b.precision||b.wrong-a.wrong||b.total-a.total);
}
function sessionReading(precision){
  if(precision>=80)return {label:'Boa consistência',tone:'strong',text:'A sessão terminou com uma base sólida. O melhor ganho agora tende a vir de revisar os poucos erros e avançar para questões novas.'};
  if(precision>=60)return {label:'Atenção seletiva',tone:'attention',text:'O resultado mostra domínio parcial. Vale atacar primeiro a disciplina com menor precisão antes de abrir um bloco muito amplo.'};
  return {label:'Reforço prioritário',tone:'priority',text:'A sessão concentrou erros suficientes para justificar um bloco curto e direcionado antes de aumentar a dificuldade ou o volume.'};
}
function renderResultInsight(){
  const metrics=document.querySelector('#resultMetrics'),breakdown=document.querySelector('#resultBreakdown');
  if(!metrics||!breakdown)return;
  const resultView=document.querySelector('[data-view="result"]');
  if(!resultView||resultView.classList.contains('hidden'))return;
  const record=latestSession();
  if(!record)return;
  const answers=Array.isArray(record.answers)?record.answers:[];
  const answered=answers.filter(answer=>!answer.blank&&answer.given!==null&&answer.given!=='');
  const correct=answered.filter(answer=>answer.isCorrect===true).length;
  const wrong=answered.length-correct;
  const blank=answers.filter(answer=>answer.blank||answer.given===null||answer.given==='').length;
  const precision=answered.length?Math.round(correct/answered.length*100):0;
  const disciplines=sessionDisciplineStats(record);
  const weak=disciplines.find(row=>row.wrong>0)||disciplines[0]||null;
  const reading=sessionReading(precision);
  let card=document.querySelector('#resultSessionInsight');
  if(!card){
    card=document.createElement('article');
    card.id='resultSessionInsight';
    card.className='card result-session-insight';
    breakdown.insertAdjacentElement('beforebegin',card);
  }
  const weakMarkup=weak?`<div class="result-focus"><span>FOCO DA PRÓXIMA BATERIA</span><strong>${escapeHtml(weak.label)}</strong><small>${weak.precision}% de precisão · ${weak.correct}/${weak.total} acertos · ${weak.wrong} erro(s)</small>${weak.label!=='Sem classificação'?`<button type="button" class="secondary" data-insight-discipline="${escapeHtml(weak.label)}">Praticar esta disciplina →</button>`:''}</div>`:'';
  card.innerHTML=`
    <div class="result-insight-head"><div><span class="kicker">DIAGNÓSTICO DA SESSÃO</span><h2>${escapeHtml(reading.label)}</h2><p>${escapeHtml(reading.text)}</p></div><span class="result-reading result-reading-${reading.tone}">${precision}% precisão</span></div>
    <div class="result-diagnostic-grid">
      <div><strong>${correct}</strong><span>acertos respondidos</span></div>
      <div><strong>${wrong}</strong><span>erros ativos gerados</span></div>
      <div><strong>${blank}</strong><span>em branco</span></div>
      <div><strong>${disciplines.length}</strong><span>disciplinas na sessão</span></div>
    </div>
    ${weakMarkup}`;
}
function scheduleResultInsight(){
  clearTimeout(resultInsightTimer);
  resultInsightTimer=setTimeout(()=>{resultInsightTimer=null;renderResultInsight();},20);
}
function installResultInsight(){
  const metrics=document.querySelector('#resultMetrics');
  if(!metrics)return;
  const observer=new MutationObserver(scheduleResultInsight);
  observer.observe(metrics,{subtree:true,childList:true,characterData:true});
  window.addEventListener('progress:changed',scheduleResultInsight);
}
function allAnsweredHistory(){
  const history=readProgress().history;
  return (Array.isArray(history)?history:[]).flatMap(record=>(Array.isArray(record.answers)?record.answers:[]).map(answer=>({...answer,sessionFinishedAt:Number(record.finishedAt)||0}))).filter(answer=>!answer.blank&&answer.given!==null&&answer.given!=='');
}
function topicPerformance(){
  const map=new Map();
  for(const answer of allAnsweredHistory()){
    const assunto=String(answer.assunto||'').trim();
    if(!assunto)continue;
    const disciplina=String(answer.disciplina||'Sem disciplina').trim()||'Sem disciplina';
    const key=normalize(disciplina)+'::'+normalize(assunto);
    const row=map.get(key)||{disciplina,assunto,total:0,correct:0,wrong:0,lastAt:0};
    row.total+=1;
    if(answer.isCorrect===true)row.correct+=1;else row.wrong+=1;
    row.lastAt=Math.max(row.lastAt,answer.sessionFinishedAt||0);
    map.set(key,row);
  }
  return [...map.values()].map(row=>({...row,precision:row.total?Math.round(row.correct/row.total*100):0}));
}
function priorityTopics(){
  return topicPerformance().filter(row=>row.total>=2&&row.wrong>0).sort((a,b)=>a.precision-b.precision||b.wrong-a.wrong||b.total-a.total||b.lastAt-a.lastAt).slice(0,8);
}
function renderPerformanceTopics(){
  const charts=document.querySelector('#performanceCharts');
  if(!charts)return;
  const view=document.querySelector('[data-view="performance"]');
  if(!view||view.classList.contains('hidden'))return;
  let section=document.querySelector('#performanceTopicInsights');
  if(!section){
    section=document.createElement('section');
    section.id='performanceTopicInsights';
    section.className='performance-topic-section';
    charts.insertAdjacentElement('afterend',section);
  }
  const topics=priorityTopics();
  if(!topics.length){
    section.innerHTML='<article class="card"><span class="kicker">ASSUNTOS PRIORITÁRIOS</span><h2>Ainda falta amostra por assunto</h2><p>Depois de pelo menos duas respostas no mesmo assunto e um erro, a plataforma passa a indicar prioridades mais granulares aqui.</p></article>';
    return;
  }
  section.innerHTML=`
    <div class="section-heading"><span class="kicker">GRANULARIDADE</span><h2>Assuntos que mais pedem reforço</h2><p>Ordenação por menor precisão, quantidade de erros e volume respondido.</p></div>
    <div class="topic-priority-grid">
      ${topics.map((topic,index)=>`<article class="card topic-priority-card"><div class="topic-priority-head"><span>PRIORIDADE ${index+1}</span><strong>${topic.precision}%</strong></div><h3>${escapeHtml(topic.assunto)}</h3><p>${escapeHtml(topic.disciplina)}</p><small>${topic.correct}/${topic.total} acertos · ${topic.wrong} erro(s)</small><div class="topic-priority-bar" aria-label="Precisão ${topic.precision}%"><span style="width:${Math.max(0,Math.min(100,topic.precision))}%"></span></div><button type="button" class="text-button" data-ux-topic="${escapeHtml(topic.assunto)}" data-ux-discipline="${escapeHtml(topic.disciplina)}">Praticar este assunto →</button></article>`).join('')}
    </div>`;
}
function schedulePerformanceTopics(){
  clearTimeout(performanceTopicTimer);
  performanceTopicTimer=setTimeout(()=>{performanceTopicTimer=null;renderPerformanceTopics();},25);
}
function chooseOption(select,value){
  if(!select||!value)return false;
  const target=normalize(value);
  const option=[...select.options].find(item=>normalize(item.value)===target||normalize(item.textContent)===target);
  if(!option)return false;
  select.value=option.value;
  select.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
}
function openTopicFromPerformance(discipline,topic){
  document.querySelector('[data-go="questions"]')?.click();
  setTimeout(()=>{
    chooseOption(document.querySelector('#filterDisciplina'),discipline);
    chooseOption(document.querySelector('#filterAssunto'),topic);
    document.querySelector('#startSession')?.focus({preventScroll:true});
  },80);
}
function installPerformanceTopics(){
  const metrics=document.querySelector('#performanceMetrics');
  if(!metrics)return;
  const observer=new MutationObserver(schedulePerformanceTopics);
  observer.observe(metrics,{subtree:true,childList:true,characterData:true});
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-ux-topic]');
    if(!button)return;
    openTopicFromPerformance(button.dataset.uxDiscipline||'',button.dataset.uxTopic||'');
  });
  window.addEventListener('progress:changed',schedulePerformanceTopics);
}

function compactFacetRows(questions){
  const rows=(Array.isArray(questions)?questions:[]).map(question=>({
    concurso:String(question.concurso||''),
    orgao:String(question.orgao||''),
    cargo:String(question.cargo||''),
    banca:String(question.banca||''),
    ano:question.ano===null||question.ano===undefined?'':String(question.ano),
    disciplina:String(question.disciplina||''),
    assunto:String(question.assunto||''),
    subassunto:String(question.subassunto||''),
    formato:String(question.formato||''),
    search:[question.enunciado,question.concurso,question.edital,question.topicoEdital,question.disciplina,question.assunto,question.subassunto,question.cargo,question.banca,question.nomeMaterial].join(' ').toLowerCase()
  }));
  facetUniverses=Object.fromEntries(FACET_CONFIG.map(config=>[
    config.key,
    [...new Set(rows.map(row=>row[config.key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true}))
  ]));
  return rows;
}
async function readFacetDataset(force=false){
  const canonical=new URL('./data/questions.json',location.href);
  try{
    if(!force&&'caches' in window){
      const cached=await caches.match(canonical.href);
      if(cached?.ok)return compactFacetRows(await cached.json());
    }
  }catch{}
  try{
    const url=force?`./data/questions.json?facets=${Date.now()}`:'./data/questions.json';
    const response=await fetch(url,{cache:force?'no-store':'force-cache'});
    if(!response.ok)throw new Error('Banco de questões indisponível para facetas.');
    return compactFacetRows(await response.json());
  }catch{return [];}
}
function facetSelections(){
  const selections={text:String(document.querySelector('#filterText')?.value||'').trim().toLowerCase()};
  FACET_CONFIG.forEach(config=>{selections[config.key]=String(document.querySelector('#'+config.id)?.value||'');});
  return selections;
}
function facetMatches(row,selections,exceptKey=''){
  for(const config of FACET_CONFIG){
    if(config.key===exceptKey)continue;
    const selected=selections[config.key];
    if(selected&&row[config.key]!==selected)return false;
  }
  if(selections.text&&!row.search.includes(selections.text))return false;
  return true;
}
function facetCounts(key,selections){
  const counts=new Map();
  let candidateCount=0;
  for(const row of facetRows){
    if(!facetMatches(row,selections,key))continue;
    candidateCount+=1;
    const value=row[key];
    if(value)counts.set(value,(counts.get(value)||0)+1);
  }
  return {counts,candidateCount};
}
function renderFacetOptions(){
  if(!facetRows.length)return;
  const selections=facetSelections();
  for(const config of FACET_CONFIG){
    const select=document.querySelector('#'+config.id);
    if(!select)continue;
    const current=select.value;
    const {counts,candidateCount}=facetCounts(config.key,selections);
    const fragment=document.createDocumentFragment();
    const allOption=document.createElement('option');
    allOption.value='';
    allOption.textContent=`Todos (${candidateCount})`;
    fragment.appendChild(allOption);
    for(const value of facetUniverses[config.key]||[]){
      const count=counts.get(value)||0;
      const option=document.createElement('option');
      option.value=value;
      option.textContent=`${value} (${count})`;
      if(count===0&&value!==current){option.disabled=true;option.hidden=true;}
      fragment.appendChild(option);
    }
    select.replaceChildren(fragment);
    if((facetUniverses[config.key]||[]).includes(current))select.value=current;
    select.setAttribute('data-facet-managed','true');
    select.setAttribute('aria-label',`${config.label}. As opções mostram a quantidade disponível no recorte atual.`);
  }
  const status=document.querySelector('#facetStatus');
  if(status)status.innerHTML=`<strong>Filtros combinados</strong><span>${facetRows.length.toLocaleString('pt-BR')} questões indexadas · opções incompatíveis ficam ocultas.</span>`;
}
function clearInvalidDescendants(changedIndex){
  const selections=facetSelections();
  let cleared=false;
  for(let index=changedIndex+1;index<FACET_CONFIG.length;index+=1){
    const config=FACET_CONFIG[index];
    const select=document.querySelector('#'+config.id);
    const current=String(select?.value||'');
    if(!current)continue;
    const {counts}=facetCounts(config.key,selections);
    if((counts.get(current)||0)>0)continue;
    select.value='';
    selections[config.key]='';
    cleared=true;
  }
  return cleared;
}
function scheduleFacetRender(delay=20){
  clearTimeout(facetTimer);
  facetTimer=setTimeout(()=>{facetTimer=null;renderFacetOptions();},delay);
}
async function reloadFacetDataset(){
  const rows=await readFacetDataset(true);
  if(!rows.length)return;
  facetRows=rows;
  renderFacetOptions();
}
async function waitForAppFilters(){
  for(let attempt=0;attempt<120;attempt+=1){
    const orgao=document.querySelector('#filterOrgao');
    const cargo=document.querySelector('#filterCargo');
    if(orgao?.options?.length>1&&cargo?.options?.length>1)return true;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  return false;
}
async function installFacetedFilters(){
  const panel=document.querySelector('#filterPanel');
  if(!panel)return;
  let status=document.querySelector('#facetStatus');
  if(!status){
    status=document.createElement('div');
    status.id='facetStatus';
    status.className='facet-status';
    status.innerHTML='<strong>Filtros combinados</strong><span>Preparando contagens do acervo…</span>';
    const clear=document.querySelector('#clearFilters');
    if(clear)clear.insertAdjacentElement('beforebegin',status);else panel.appendChild(status);
  }
  await waitForAppFilters();
  facetRows=await readFacetDataset(false);
  if(!facetRows.length){status.innerHTML='<strong>Filtros combinados indisponíveis</strong><span>O banco continua funcionando com os filtros padrão.</span>';return;}
  renderFacetOptions();
  const availableCount=document.querySelector('#availableCount');
  if(availableCount){
    const observer=new MutationObserver(()=>scheduleFacetRender(0));
    observer.observe(availableCount,{subtree:true,childList:true,characterData:true});
  }
  document.addEventListener('change',event=>{
    const index=FACET_CONFIG.findIndex(config=>config.id===event.target?.id);
    if(index<0)return;
    const target=event.target;
    const trusted=event.isTrusted;
    clearTimeout(facetTimer);
    facetTimer=setTimeout(()=>{
      facetTimer=null;
      const cleared=trusted?clearInvalidDescendants(index):false;
      renderFacetOptions();
      if(cleared)target.dispatchEvent(new Event('change',{bubbles:true}));
    },0);
  });
  document.addEventListener('input',event=>{
    if(event.target?.id==='filterText'||event.target?.id==='globalSearch')scheduleFacetRender(90);
  });
  document.addEventListener('click',event=>{
    if(!event.target.closest('[data-refresh-release]'))return;
    clearTimeout(facetReloadTimer);
    facetReloadTimer=setTimeout(()=>{facetReloadTimer=null;void reloadFacetDataset();},1600);
  });
}
function scheduleFacetedInstall(){
  const run=()=>void installFacetedFilters();
  if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:1600});else setTimeout(run,450);
}

function installStyles(){
  if(document.querySelector('#uxEnhancementStyles'))return;
  const style=document.createElement('style');
  style.id='uxEnhancementStyles';
  style.textContent=`
    .resolver-shortcut-hint{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:10px 0 2px;color:inherit;font-size:.74rem;opacity:.72}
    .resolver-shortcut-hint>span{font-weight:800;letter-spacing:.04em;text-transform:uppercase;margin-right:3px}.resolver-shortcut-hint small{font-size:inherit}.resolver-shortcut-hint kbd{font:inherit;font-weight:800;line-height:1;padding:4px 6px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-bottom-width:2px;border-radius:6px;background:color-mix(in srgb,currentColor 5%,transparent)}
    .result-session-insight{margin:18px 0}.result-insight-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.result-insight-head p{max-width:760px;margin-bottom:0}.result-reading{white-space:nowrap;padding:7px 10px;border:1px solid currentColor;border-radius:999px;font-size:.78rem;font-weight:850}.result-reading-strong{color:#067647}.result-reading-attention{color:#b54708}.result-reading-priority{color:#b42318}.result-diagnostic-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:20px 0}.result-diagnostic-grid div{display:grid;gap:3px;padding:12px;border:1px solid var(--border,#d9deea);border-radius:12px}.result-diagnostic-grid strong{font-size:1.25rem}.result-diagnostic-grid span{font-size:.76rem;opacity:.7}.result-focus{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;align-items:center;padding-top:16px;border-top:1px solid var(--border,#d9deea)}.result-focus>span{grid-column:1/-1;font-size:.7rem;font-weight:850;letter-spacing:.05em;opacity:.65}.result-focus>strong{font-size:1rem}.result-focus>small{grid-column:1/2;opacity:.72}.result-focus>button{grid-column:2;grid-row:2/4}
    .performance-topic-section{margin-top:24px}.performance-topic-section .section-heading p{margin-top:6px}.topic-priority-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.topic-priority-card{display:grid;gap:7px}.topic-priority-card h3{margin:0;font-size:1rem}.topic-priority-card p,.topic-priority-card small{margin:0}.topic-priority-card p{opacity:.72}.topic-priority-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.topic-priority-head span{font-size:.68rem;font-weight:850;letter-spacing:.05em;opacity:.62}.topic-priority-head strong{font-size:1.2rem}.topic-priority-bar{height:6px;border-radius:999px;overflow:hidden;background:color-mix(in srgb,currentColor 9%,transparent);margin:5px 0}.topic-priority-bar span{display:block;height:100%;border-radius:inherit;background:var(--accent,#4656e8)}.topic-priority-card .text-button{justify-self:start;margin-top:4px}
    .facet-status{display:grid;gap:3px;padding:10px 11px;border:1px solid color-mix(in srgb,currentColor 13%,transparent);border-radius:10px;background:color-mix(in srgb,currentColor 3%,transparent)}.facet-status strong{font-size:.76rem}.facet-status span{font-size:.69rem;line-height:1.35;opacity:.68}
    @media(max-width:760px),(pointer:coarse){.resolver-shortcut-hint{display:none}.result-insight-head{display:grid}.result-reading{justify-self:start}.result-diagnostic-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.result-focus{grid-template-columns:1fr}.result-focus>*{grid-column:1!important;grid-row:auto!important}.result-focus>button{width:100%;margin-top:8px}.topic-priority-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}
function init(){installStyles();installReviewSummarySync();installResolverShortcuts();installResultInsight();installPerformanceTopics();scheduleFacetedInstall();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();