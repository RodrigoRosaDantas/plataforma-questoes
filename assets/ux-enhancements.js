const PROGRESS_KEY='plataforma.questoes.progress.v1';
let reviewSummaryTimer=null;

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
function installStyles(){
  if(document.querySelector('#uxEnhancementStyles'))return;
  const style=document.createElement('style');
  style.id='uxEnhancementStyles';
  style.textContent=`
    .resolver-shortcut-hint{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:10px 0 2px;color:inherit;font-size:.74rem;opacity:.72}
    .resolver-shortcut-hint>span{font-weight:800;letter-spacing:.04em;text-transform:uppercase;margin-right:3px}.resolver-shortcut-hint small{font-size:inherit}.resolver-shortcut-hint kbd{font:inherit;font-weight:800;line-height:1;padding:4px 6px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-bottom-width:2px;border-radius:6px;background:color-mix(in srgb,currentColor 5%,transparent)}
    @media(max-width:760px),(pointer:coarse){.resolver-shortcut-hint{display:none}}
  `;
  document.head.appendChild(style);
}
function init(){installStyles();installReviewSummarySync();installResolverShortcuts();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();