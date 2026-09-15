const PROGRESS_KEY='plataforma.questoes.progress.v1';
let reviewSummaryTimer=null;
let resultInsightTimer=null;

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
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
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
function installStyles(){
  if(document.querySelector('#uxEnhancementStyles'))return;
  const style=document.createElement('style');
  style.id='uxEnhancementStyles';
  style.textContent=`
    .resolver-shortcut-hint{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:10px 0 2px;color:inherit;font-size:.74rem;opacity:.72}
    .resolver-shortcut-hint>span{font-weight:800;letter-spacing:.04em;text-transform:uppercase;margin-right:3px}.resolver-shortcut-hint small{font-size:inherit}.resolver-shortcut-hint kbd{font:inherit;font-weight:800;line-height:1;padding:4px 6px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-bottom-width:2px;border-radius:6px;background:color-mix(in srgb,currentColor 5%,transparent)}
    .result-session-insight{margin:18px 0}.result-insight-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.result-insight-head p{max-width:760px;margin-bottom:0}.result-reading{white-space:nowrap;padding:7px 10px;border:1px solid currentColor;border-radius:999px;font-size:.78rem;font-weight:850}.result-reading-strong{color:#067647}.result-reading-attention{color:#b54708}.result-reading-priority{color:#b42318}.result-diagnostic-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:20px 0}.result-diagnostic-grid div{display:grid;gap:3px;padding:12px;border:1px solid var(--border,#d9deea);border-radius:12px}.result-diagnostic-grid strong{font-size:1.25rem}.result-diagnostic-grid span{font-size:.76rem;opacity:.7}.result-focus{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;align-items:center;padding-top:16px;border-top:1px solid var(--border,#d9deea)}.result-focus>span{grid-column:1/-1;font-size:.7rem;font-weight:850;letter-spacing:.05em;opacity:.65}.result-focus>strong{font-size:1rem}.result-focus>small{grid-column:1/2;opacity:.72}.result-focus>button{grid-column:2;grid-row:2/4}
    @media(max-width:760px),(pointer:coarse){.resolver-shortcut-hint{display:none}.result-insight-head{display:grid}.result-reading{justify-self:start}.result-diagnostic-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.result-focus{grid-template-columns:1fr}.result-focus>*{grid-column:1!important;grid-row:auto!important}.result-focus>button{width:100%;margin-top:8px}}
  `;
  document.head.appendChild(style);
}
function init(){installStyles();installReviewSummarySync();installResolverShortcuts();installResultInsight();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();