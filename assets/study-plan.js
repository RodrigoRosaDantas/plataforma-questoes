import './canonical-editais.js';

const PLAN_KEY='plataforma.questoes.daily-plan.v2';
const LEGACY_PLAN_KEY='plataforma.questoes.daily-plan.v1';
const PROGRESS_KEY='plataforma.questoes.progress.v1';
const REVIEW_FILTER_KEY='plataforma.questoes.review-filter.v1';
const PLANS={
  30:{minutes:30,questions:10,review:5,label:'30 min'},
  60:{minutes:60,questions:20,review:10,label:'60 min'},
  90:{minutes:90,questions:30,review:15,label:'90 min'}
};
const REVIEW_PRIORITY={due:0,error:1,marked:2,scheduled:3,recovered:4,other:5};
let reviewEnhanceTimer=null;
let reviewFilter=localStorage.getItem(REVIEW_FILTER_KEY)||'priority';

function readJson(key,fallback={}){
  try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch{return fallback;}
}
function normalize(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}
function escapePlan(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function escapeAttr(value){return escapePlan(value);}
function localDay(value=Date.now()){
  const date=new Date(Number(value)||Date.now());
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function progressData(){return readJson(PROGRESS_KEY,{});}
function unresolvedError(item){
  if(!item||typeof item!=='object')return false;
  return (Number(item.lastError)||0)>(Number(item.lastCorrect)||0);
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
function progressSummary(){
  const progress=progressData();
  const now=Date.now();
  const unresolvedErrorIds=Object.entries(progress.errors||{}).filter(([,item])=>unresolvedError(item)).map(([id])=>id);
  const dueReviewIds=Object.entries(progress.reviews||{}).filter(([,item])=>dueReview(item,now)).map(([id])=>id);
  const marked=Object.values(progress.marked||{}).filter(activeMark).length;
  return {
    progress,
    errors:unresolvedErrorIds.length,
    reviews:dueReviewIds.length,
    marked,
    pending:new Set([...unresolvedErrorIds,...dueReviewIds]).size,
    active:Boolean(progress.activeSession)
  };
}
function selectedPlan(){
  const saved=readJson(PLAN_KEY,readJson(LEGACY_PLAN_KEY,{}));
  const minutes=Number(saved.minutes);
  return PLANS[minutes]||PLANS[60];
}
function savePlan(minutes){localStorage.setItem(PLAN_KEY,JSON.stringify({minutes:Number(minutes),updatedAt:Date.now()}));}
function brasiliaTime(){
  return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
}
function installClock(){
  const context=document.querySelector('.topbar-context');
  if(!context||document.querySelector('#brasiliaClock'))return;
  const clock=document.createElement('span');
  clock.id='brasiliaClock';
  clock.className='brasilia-clock';
  clock.setAttribute('aria-label','Horário de Brasília');
  const update=()=>{clock.textContent='Brasília '+brasiliaTime();};
  update();
  const version=context.querySelector('strong');
  context.insertBefore(clock,version||null);
  setInterval(update,30000);
}
function todaySummary(progress){
  const today=localDay();
  const sessions=(Array.isArray(progress.history)?progress.history:[]).filter(record=>localDay(record.finishedAt||record.startedAt)===today);
  const answers=sessions.flatMap(record=>Array.isArray(record.answers)?record.answers:[]);
  const answered=answers.filter(answer=>!answer.blank&&answer.given!==null&&answer.given!=='');
  const correct=answered.filter(answer=>answer.isCorrect===true).length;
  const elapsed=sessions.reduce((sum,record)=>sum+Math.max(0,Number(record.elapsedMs)||0),0);
  return {sessions:sessions.length,questions:answers.length,answered:answered.length,correct,precision:answered.length?Math.round(correct/answered.length*100):0,minutes:Math.round(elapsed/60000)};
}
function disciplineFocus(progress){
  const map=new Map();
  for(const record of Array.isArray(progress.history)?progress.history:[]){
    for(const answer of Array.isArray(record.answers)?record.answers:[]){
      if(answer.blank||answer.given===null||answer.given==='')continue;
      const label=String(answer.disciplina||'').trim();
      if(!label)continue;
      const key=normalize(label);
      const row=map.get(key)||{label,total:0,correct:0,wrong:0,lastAt:0};
      row.total+=1;
      if(answer.isCorrect===true)row.correct+=1;else row.wrong+=1;
      row.lastAt=Math.max(row.lastAt,Number(record.finishedAt)||0);
      map.set(key,row);
    }
  }
  const candidates=[...map.values()].filter(row=>row.total>=3&&row.wrong>0).map(row=>({...row,precision:Math.round(row.correct/row.total*100)}));
  candidates.sort((a,b)=>a.precision-b.precision||b.wrong-a.wrong||b.total-a.total||b.lastAt-a.lastAt);
  return candidates[0]||null;
}
function activeSessionSize(progress){
  const active=progress.activeSession;
  if(!active||typeof active!=='object')return 0;
  if(Array.isArray(active.items))return active.items.length;
  if(Array.isArray(active.answers))return active.answers.length;
  if(Array.isArray(active.questions))return active.questions.length;
  return Number(active.total)||0;
}
function planSteps(plan,summary,today,focus){
  const remainingQuestions=Math.max(0,plan.questions-today.questions);
  const reviewCount=Math.min(plan.review,summary.pending);
  const first=summary.active
    ? {code:'01',title:'Continuar a bateria em andamento',detail:`Há uma sessão salva${activeSessionSize(summary.progress)?` com ${activeSessionSize(summary.progress)} questão(ões)`:''}. Retome antes de abrir outro bloco.`,action:'resume',button:'Continuar sessão'}
    : reviewCount
      ? {code:'01',title:`Revisar ${reviewCount} pendência(s)`,detail:`${summary.errors} erro(s) ainda não recuperado(s), ${summary.reviews} revisão(ões) vencida(s) e ${summary.marked} marcada(s).`,action:'review',button:'Abrir revisão'}
      : {code:'01',title:'Aquecer pelo edital',detail:'Sem revisão vencida agora. Escolha um tópico prioritário antes de abrir questões novas.',action:'edits',button:'Escolher tópico'};
  let second;
  if(remainingQuestions===0){
    second={code:'02',title:`Meta de ${plan.questions} questões atingida`,detail:`Hoje você já registrou ${today.questions} questão(ões) em ${today.sessions} sessão(ões).`,action:'performance',button:'Analisar resultado'};
  }else if(focus){
    second={code:'02',title:`Resolver ${remainingQuestions} em ${focus.label}`,detail:`Foco adaptativo: ${focus.precision}% de precisão em ${focus.total} respondida(s), com ${focus.wrong} erro(s).`,action:'questions',button:'Treinar ponto fraco',discipline:focus.label,size:remainingQuestions};
  }else{
    second={code:'02',title:`Resolver ${remainingQuestions} questões`,detail:`Faltam ${remainingQuestions} para a meta escolhida de ${plan.questions} questões nesta janela.`,action:'questions',button:'Montar bateria',size:remainingQuestions};
  }
  const third=today.answered
    ? {code:'03',title:`Fechar com ${today.precision}% de precisão hoje`,detail:`${today.correct}/${today.answered} respondidas corretamente · cerca de ${today.minutes} min registrados.`,action:'performance',button:'Ver desempenho'}
    : {code:'03',title:'Fechar o ciclo com evidências',detail:'Confira precisão e disciplinas que pedem reforço antes do próximo bloco.',action:'performance',button:'Ver desempenho'};
  return [first,second,third];
}
function renderPlan(){
  const home=document.querySelector('[data-view="home"]');
  if(!home)return;
  let card=document.querySelector('#dailyStudyPlan');
  if(!card){
    card=document.createElement('article');
    card.id='dailyStudyPlan';
    card.className='card daily-study-plan';
    const anchor=home.querySelector('.grid.two');
    if(anchor)anchor.insertAdjacentElement('afterend',card);else home.appendChild(card);
  }
  const plan=selectedPlan(),summary=progressSummary(),today=todaySummary(summary.progress),focus=disciplineFocus(summary.progress);
  const steps=planSteps(plan,summary,today,focus),progressPct=Math.min(100,Math.round(today.questions/plan.questions*100));
  card.innerHTML=`
    <div class="card-head daily-plan-head">
      <div><span class="kicker">PLANO DE HOJE · ADAPTATIVO</span><h2>O próximo bloco nasce do seu desempenho</h2></div>
      <span class="daily-plan-status">${summary.active?'Sessão em andamento · ':''}${today.questions}/${plan.questions} questões</span>
    </div>
    <p class="daily-plan-copy">Escolha uma janela. A plataforma combina seu progresso de hoje, erros pendentes e disciplina com menor precisão para sugerir a próxima ação.</p>
    <div class="daily-plan-progress" aria-label="Progresso da meta diária"><span style="width:${progressPct}%"></span></div>
    <div class="daily-plan-facts">
      <span><strong>${today.precision}%</strong> precisão hoje</span>
      <span><strong>${summary.pending}</strong> pendência(s)</span>
      <span><strong>${focus?escapePlan(focus.label):'—'}</strong> ${focus?'foco sugerido':'sem foco mínimo ainda'}</span>
    </div>
    <div class="daily-plan-options" role="group" aria-label="Tempo disponível para estudar">
      ${Object.values(PLANS).map(item=>`<button type="button" class="${item.minutes===plan.minutes?'active':''}" data-plan-minutes="${item.minutes}" aria-pressed="${item.minutes===plan.minutes}">${item.label}</button>`).join('')}
    </div>
    <div class="daily-plan-steps">
      ${steps.map(step=>`<div class="daily-plan-step"><span>${step.code}</span><div><strong>${escapePlan(step.title)}</strong><small>${escapePlan(step.detail)}</small></div><button type="button" class="secondary" data-plan-action="${step.action}" data-plan-size="${step.size||plan.questions}"${step.discipline?` data-plan-discipline="${escapeAttr(step.discipline)}"`:''}>${escapePlan(step.button)}</button></div>`).join('')}
    </div>`;
}
function go(view){
  const trigger=document.querySelector(`[data-go="${view}"]`);
  if(trigger){trigger.click();return true;}
  return false;
}
function chooseSelectValue(select,label){
  if(!select||!label)return false;
  const target=normalize(label);
  const option=[...select.options].find(item=>normalize(item.value)===target||normalize(item.textContent)===target);
  if(!option)return false;
  select.value=option.value;
  select.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
}
function openQuestionBuilder(size,discipline=''){
  if(!go('questions'))return;
  setTimeout(()=>{
    const disciplineSelect=document.querySelector('#filterDisciplina');
    if(discipline)chooseSelectValue(disciplineSelect,discipline);
    const input=document.querySelector('#sessionSize');
    if(input){
      input.value=String(Math.max(1,Number(size)||10));
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    document.querySelector('#startSession')?.focus({preventScroll:true});
  },120);
}
function resumeSession(){
  const trigger=document.querySelector('[data-go="resolver"]');
  if(trigger){trigger.click();return;}
  go('home');
  setTimeout(()=>document.querySelector('#resumeNow')?.click(),80);
}

function reviewState(id,progress,now=Date.now()){
  const error=progress.errors?.[id],review=progress.reviews?.[id],mark=progress.marked?.[id];
  const isError=unresolvedError(error),isDue=dueReview(review,now),isScheduled=scheduledReview(review,now),isMarked=activeMark(mark);
  const recovered=Boolean((error&&!isError)||(review?.stage==='Dominada'))&&!isDue&&!isError;
  const statuses=[];
  if(isDue)statuses.push('due');
  if(isError)statuses.push('error');
  if(isMarked)statuses.push('marked');
  if(isScheduled)statuses.push('scheduled');
  if(recovered)statuses.push('recovered');
  const primary=statuses.slice().sort((a,b)=>(REVIEW_PRIORITY[a]??99)-(REVIEW_PRIORITY[b]??99))[0]||'other';
  return {id,error,review,mark,statuses,primary,isDue,isError,isMarked,isScheduled,recovered,dueAt:Number(review?.dueAt)||0};
}
function reviewLabel(state){
  if(state.isDue)return 'Revisar agora';
  if(state.isError)return 'Erro ativo';
  if(state.isMarked)return 'Marcada';
  if(state.isScheduled)return 'Agendada';
  if(state.recovered)return 'Recuperada';
  return 'Em acompanhamento';
}
function formatReviewDate(timestamp){
  if(!timestamp)return 'agora';
  const day=localDay(timestamp),today=localDay();
  if(day===today)return 'hoje';
  return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'}).format(new Date(timestamp));
}
function reviewDetail(state){
  const parts=[];
  if(state.review?.stage)parts.push(String(state.review.stage));
  if(state.isDue)parts.push(`vence ${formatReviewDate(state.dueAt)}`);
  else if(state.isScheduled)parts.push(`próxima ${formatReviewDate(state.dueAt)}`);
  if(state.isError)parts.push(`${Number(state.error?.count)||1} erro(s)`);
  if(state.recovered&&state.error?.lastCorrect)parts.push(`recuperada ${formatReviewDate(state.error.lastCorrect)}`);
  if(state.isMarked)parts.push('marcada para consulta');
  return parts.join(' · ')||'Sem pendência imediata';
}
function reviewChip(text,kind=''){return `<span class="chip review-chip ${kind?`review-chip-${kind}`:''}">${escapePlan(text)}</span>`;}
function reviewCardMatches(state,filter){
  if(filter==='all')return true;
  if(filter==='priority')return state.isDue||state.isError;
  if(filter==='due')return state.isDue;
  if(filter==='error')return state.isError;
  if(filter==='marked')return state.isMarked;
  if(filter==='scheduled')return state.isScheduled;
  if(filter==='recovered')return state.recovered;
  return true;
}
function reviewFilterLabel(filter){
  return ({priority:'Prioridade',due:'Vencidas',error:'Erros ativos',marked:'Marcadas',scheduled:'Agendadas',recovered:'Recuperadas',all:'Todas'})[filter]||'Todas';
}
function reviewCounts(states){
  return {
    priority:states.filter(state=>state.isDue||state.isError).length,
    due:states.filter(state=>state.isDue).length,
    error:states.filter(state=>state.isError).length,
    marked:states.filter(state=>state.isMarked).length,
    scheduled:states.filter(state=>state.isScheduled).length,
    recovered:states.filter(state=>state.recovered).length,
    all:states.length
  };
}
function ensureReviewControlCenter(root,states){
  const section=root.closest('[data-view="review"]');
  if(!section)return null;
  let center=section.querySelector('#reviewControlCenter');
  if(!center){
    center=document.createElement('article');
    center.id='reviewControlCenter';
    center.className='card review-control-center';
    root.insertAdjacentElement('beforebegin',center);
  }
  const counts=reviewCounts(states),priorityCount=counts.priority;
  center.innerHTML=`
    <div class="review-center-head">
      <div><span class="kicker">CENTRAL DE REVISÃO</span><h2>${priorityCount?`${priorityCount} questão(ões) pedem ação agora`:'Revisões imediatas em dia'}</h2><p>Erros ativos e D0/D7/D20 vencidos vêm primeiro. Marcações e revisões futuras ficam separadas para não inflar sua pendência.</p></div>
      <button type="button" class="primary" data-review-next ${priorityCount?'':'disabled'}>${priorityCount?'Resolver próxima prioridade':'Sem pendência agora'}</button>
    </div>
    <div class="review-metrics" aria-label="Resumo da revisão">
      <div><strong>${counts.priority}</strong><span>prioridade agora</span></div>
      <div><strong>${counts.scheduled}</strong><span>agendadas</span></div>
      <div><strong>${counts.marked}</strong><span>marcadas</span></div>
      <div><strong>${counts.recovered}</strong><span>recuperadas</span></div>
    </div>
    <div class="review-filters" role="group" aria-label="Filtrar caderno de revisão">
      ${['priority','error','due','marked','scheduled','recovered','all'].map(filter=>`<button type="button" class="${reviewFilter===filter?'active':''}" data-review-filter="${filter}" aria-pressed="${reviewFilter===filter}">${reviewFilterLabel(filter)} <span>${counts[filter]}</span></button>`).join('')}
    </div>`;
  return center;
}
function decorateReviewCards(root,progress){
  const now=Date.now();
  const cards=[...root.querySelectorAll('article.card')].map(card=>{
    const button=card.querySelector('[data-review-one]');
    if(!button)return null;
    const id=button.dataset.reviewOne,state=reviewState(id,progress,now);
    card.dataset.reviewCenterCard='true';
    card.dataset.reviewPrimary=state.primary;
    card.dataset.reviewStatuses=state.statuses.join(' ');
    card.style.order=String(REVIEW_PRIORITY[state.primary]??99);
    const chips=card.querySelector('.chips');
    if(chips){
      const rebuilt=[];
      if(state.isError)rebuilt.push(reviewChip(`${Number(state.error?.count)||1} erro(s)`,'error'));
      if(state.review?.stage&&state.review.stage!=='Dominada')rebuilt.push(reviewChip(state.review.stage,state.isDue?'due':'scheduled'));
      if(state.isMarked)rebuilt.push(reviewChip('Marcada','marked'));
      if(state.recovered)rebuilt.push(reviewChip('Recuperada','recovered'));
      chips.innerHTML=rebuilt.join('');
    }
    let row=card.querySelector('.review-state-row');
    if(!row){row=document.createElement('div');row.className='review-state-row';const heading=card.querySelector('h2');heading?.insertAdjacentElement('beforebegin',row);}
    row.innerHTML=`<span class="review-state-badge review-state-${state.primary}">${escapePlan(reviewLabel(state))}</span><small>${escapePlan(reviewDetail(state))}</small>`;
    card.hidden=!reviewCardMatches(state,reviewFilter);
    return {card,button,state};
  }).filter(Boolean);
  return cards;
}
function enhanceReview(){
  const root=document.querySelector('#reviewList');
  if(!root)return;
  const buttons=[...root.querySelectorAll('[data-review-one]')];
  if(!buttons.length){document.querySelector('#reviewControlCenter')?.remove();return;}
  const progress=progressData();
  const decorated=decorateReviewCards(root,progress);
  const states=decorated.map(item=>item.state);
  ensureReviewControlCenter(root,states);
  root.classList.add('review-center-list');
  const visible=decorated.filter(item=>!item.card.hidden);
  const empty=root.querySelector('.review-filter-empty');
  if(!visible.length){
    if(!empty){const message=document.createElement('div');message.className='card empty-state review-filter-empty';message.textContent='Nenhuma questão neste filtro.';root.appendChild(message);}
  }else empty?.remove();
}
function scheduleReviewEnhancement(){
  clearTimeout(reviewEnhanceTimer);
  reviewEnhanceTimer=setTimeout(()=>{reviewEnhanceTimer=null;enhanceReview();},30);
}
function reviewMutationIsExternal(mutation){
  const root=document.querySelector('#reviewList');
  if(!root||!(mutation.target===root||mutation.target.closest?.('#reviewList')))return false;
  const relevant=node=>{
    if(node.nodeType!==Node.ELEMENT_NODE)return false;
    if(node.matches?.('[data-review-one]'))return true;
    if(node.matches?.('.empty-state:not(.review-filter-empty)'))return true;
    return Boolean(node.querySelector?.('[data-review-one]'));
  };
  return [...mutation.addedNodes].some(relevant);
}
function bindReviewCenter(){
  document.addEventListener('click',event=>{
    const filterButton=event.target.closest('[data-review-filter]');
    if(filterButton){
      reviewFilter=filterButton.dataset.reviewFilter||'priority';
      localStorage.setItem(REVIEW_FILTER_KEY,reviewFilter);
      enhanceReview();
      return;
    }
    const next=event.target.closest('[data-review-next]');
    if(next&&!next.disabled){
      reviewFilter='priority';localStorage.setItem(REVIEW_FILTER_KEY,reviewFilter);enhanceReview();
      const candidate=[...document.querySelectorAll('#reviewList article.card:not([hidden])')].find(card=>card.querySelector('[data-review-one]'));
      candidate?.querySelector('[data-review-one]')?.click();
    }
  });
  const observer=new MutationObserver(mutations=>{
    if(mutations.some(reviewMutationIsExternal))scheduleReviewEnhancement();
  });
  observer.observe(document.body,{subtree:true,childList:true});
  window.addEventListener('progress:changed',scheduleReviewEnhancement);
  window.addEventListener('storage',event=>{if(event.key===PROGRESS_KEY)scheduleReviewEnhancement();});
  scheduleReviewEnhancement();
}
function bindPlan(){
  document.addEventListener('click',event=>{
    const option=event.target.closest('[data-plan-minutes]');
    if(option){savePlan(option.dataset.planMinutes);renderPlan();return;}
    const action=event.target.closest('[data-plan-action]');
    if(!action)return;
    const target=action.dataset.planAction;
    if(target==='resume')resumeSession();
    else if(target==='questions')openQuestionBuilder(Number(action.dataset.planSize)||10,action.dataset.planDiscipline||'');
    else go(target);
  });
  window.addEventListener('progress:changed',()=>renderPlan());
  window.addEventListener('storage',event=>{if(event.key===PROGRESS_KEY||event.key===PLAN_KEY||event.key===LEGACY_PLAN_KEY)renderPlan();});
}
function installStyles(){
  if(document.querySelector('#dailyPlanStyles'))return;
  const style=document.createElement('style');
  style.id='dailyPlanStyles';
  style.textContent=`
    .brasilia-clock{white-space:nowrap;font-variant-numeric:tabular-nums}
    .daily-study-plan{margin-top:var(--space-5,24px)}
    .daily-plan-head{gap:16px;align-items:flex-start}.daily-plan-status{font-size:.78rem;font-weight:700;letter-spacing:.02em;padding:7px 10px;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent);white-space:nowrap}
    .daily-plan-copy{max-width:820px;margin-top:-2px}.daily-plan-progress{height:8px;border-radius:999px;overflow:hidden;background:color-mix(in srgb,currentColor 9%,transparent);margin:18px 0 12px}.daily-plan-progress span{display:block;height:100%;border-radius:inherit;background:var(--accent,#4656e8);transition:width .25s ease}
    .daily-plan-facts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.daily-plan-facts span{font-size:.82rem;padding:7px 10px;border:1px solid var(--border,#d9deea);border-radius:999px}.daily-plan-facts strong{font-weight:850}
    .daily-plan-options{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.daily-plan-options button{border:1px solid var(--border,#d9deea);background:transparent;color:inherit;border-radius:999px;padding:9px 14px;font:inherit;font-weight:750;cursor:pointer}.daily-plan-options button.active{background:var(--accent,#4656e8);border-color:var(--accent,#4656e8);color:#fff}
    .daily-plan-steps{display:grid;gap:10px}.daily-plan-step{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--border,#e3e6ee)}.daily-plan-step>span{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--accent,#4656e8) 12%,transparent);font-size:.78rem;font-weight:850}.daily-plan-step div{display:grid;gap:3px;min-width:0}.daily-plan-step small{opacity:.72;line-height:1.35}
    .review-control-center{margin-bottom:16px}.review-center-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.review-center-head p{max-width:760px;margin-bottom:0}.review-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:20px 0}.review-metrics div{padding:14px;border:1px solid var(--border,#d9deea);border-radius:14px;display:grid;gap:3px}.review-metrics strong{font-size:1.35rem}.review-metrics span{font-size:.78rem;opacity:.7}
    .review-filters{display:flex;gap:8px;flex-wrap:wrap}.review-filters button{border:1px solid var(--border,#d9deea);background:transparent;color:inherit;border-radius:999px;padding:8px 11px;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer}.review-filters button span{opacity:.65;margin-left:4px}.review-filters button.active{background:var(--accent,#4656e8);border-color:var(--accent,#4656e8);color:#fff}.review-center-list{display:flex!important;flex-direction:column;gap:12px}.review-state-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px}.review-state-row small{opacity:.7}.review-state-badge{font-size:.72rem;font-weight:850;letter-spacing:.03em;text-transform:uppercase;padding:5px 8px;border-radius:999px;border:1px solid currentColor}.review-state-due,.review-chip-due{color:#b42318}.review-state-error,.review-chip-error{color:#b54708}.review-state-marked,.review-chip-marked{color:#175cd3}.review-state-scheduled,.review-chip-scheduled{color:#6941c6}.review-state-recovered,.review-chip-recovered{color:#067647}.review-chip{font-size:.72rem}.review-filter-empty{order:999}
    @media(max-width:760px){.brasilia-clock{display:none}.daily-plan-head{display:grid}.daily-plan-status{justify-self:start}.daily-plan-facts{display:grid;grid-template-columns:1fr}.daily-plan-step{grid-template-columns:36px minmax(0,1fr)}.daily-plan-step button{grid-column:1/-1;width:100%}.review-center-head{display:grid}.review-center-head button{width:100%}.review-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.review-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.review-filters button{text-align:left}}
  `;
  document.head.appendChild(style);
}
function init(){installStyles();installClock();renderPlan();bindPlan();bindReviewCenter();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();