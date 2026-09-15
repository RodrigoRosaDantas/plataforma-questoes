const PLAN_KEY='plataforma.questoes.daily-plan.v2';
const LEGACY_PLAN_KEY='plataforma.questoes.daily-plan.v1';
const PROGRESS_KEY='plataforma.questoes.progress.v1';
const PLANS={
  30:{minutes:30,questions:10,review:5,label:'30 min'},
  60:{minutes:60,questions:20,review:10,label:'60 min'},
  90:{minutes:90,questions:30,review:15,label:'90 min'}
};

function readJson(key,fallback={}){
  try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch{return fallback;}
}
function normalize(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}
function localDay(value=Date.now()){
  const date=new Date(Number(value)||Date.now());
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function progressData(){return readJson(PROGRESS_KEY,{});}
function progressSummary(){
  const progress=progressData();
  const errors=Object.values(progress.errors||{}).filter(item=>!item?.removed).length;
  const reviews=Object.values(progress.reviews||{}).filter(item=>!item?.removed).length;
  const marked=Object.values(progress.marked||{}).filter(item=>!item?.removed).length;
  return {
    progress,
    errors,
    reviews,
    marked,
    pending:new Set([
      ...Object.entries(progress.errors||{}).filter(([,item])=>!item?.removed).map(([id])=>id),
      ...Object.entries(progress.reviews||{}).filter(([,item])=>!item?.removed).map(([id])=>id)
    ]).size,
    active:Boolean(progress.activeSession)
  };
}
function selectedPlan(){
  const saved=readJson(PLAN_KEY,readJson(LEGACY_PLAN_KEY,{}));
  const minutes=Number(saved.minutes);
  return PLANS[minutes]||PLANS[60];
}
function savePlan(minutes){
  localStorage.setItem(PLAN_KEY,JSON.stringify({minutes:Number(minutes),updatedAt:Date.now()}));
}
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
  return {
    sessions:sessions.length,
    questions:answers.length,
    answered:answered.length,
    correct,
    precision:answered.length?Math.round(correct/answered.length*100):0,
    minutes:Math.round(elapsed/60000)
  };
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
      ? {code:'01',title:`Revisar ${reviewCount} pendência(s)`,detail:`${summary.errors} erro(s), ${summary.reviews} revisão(ões) e ${summary.marked} marcada(s) no seu estado atual.`,action:'review',button:'Abrir revisão'}
      : {code:'01',title:'Aquecer pelo edital',detail:'Sem revisão urgente agora. Escolha um tópico prioritário antes de abrir questões novas.',action:'edits',button:'Escolher tópico'};
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
  const plan=selectedPlan();
  const summary=progressSummary();
  const today=todaySummary(summary.progress);
  const focus=disciplineFocus(summary.progress);
  const steps=planSteps(plan,summary,today,focus);
  const progressPct=Math.min(100,Math.round(today.questions/plan.questions*100));
  card.innerHTML=`
    <div class="card-head daily-plan-head">
      <div><span class="kicker">PLANO ADAPTATIVO DE HOJE</span><h2>O próximo bloco nasce do seu desempenho</h2></div>
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
function escapePlan(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function escapeAttr(value){return escapePlan(value);}
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
    const start=document.querySelector('#startSession');
    if(start)start.focus({preventScroll:true});
  },120);
}
function resumeSession(){
  const trigger=document.querySelector('[data-go="resolver"]');
  if(trigger){trigger.click();return;}
  go('home');
  setTimeout(()=>document.querySelector('#resumeCard [data-go="resolver"],#resumeCard button')?.click(),80);
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
    .daily-plan-head{gap:16px;align-items:flex-start}
    .daily-plan-status{font-size:.78rem;font-weight:700;letter-spacing:.02em;padding:7px 10px;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent);white-space:nowrap}
    .daily-plan-copy{max-width:820px;margin-top:-2px}
    .daily-plan-progress{height:8px;border-radius:999px;overflow:hidden;background:color-mix(in srgb,currentColor 9%,transparent);margin:18px 0 12px}.daily-plan-progress span{display:block;height:100%;border-radius:inherit;background:var(--accent,#4656e8);transition:width .25s ease}
    .daily-plan-facts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.daily-plan-facts span{font-size:.82rem;padding:7px 10px;border:1px solid var(--border,#d9deea);border-radius:999px}.daily-plan-facts strong{font-weight:850}
    .daily-plan-options{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
    .daily-plan-options button{border:1px solid var(--border,#d9deea);background:transparent;color:inherit;border-radius:999px;padding:9px 14px;font:inherit;font-weight:750;cursor:pointer}
    .daily-plan-options button.active{background:var(--accent,#4656e8);border-color:var(--accent,#4656e8);color:#fff}
    .daily-plan-steps{display:grid;gap:10px}
    .daily-plan-step{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--border,#e3e6ee)}
    .daily-plan-step>span{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--accent,#4656e8) 12%,transparent);font-size:.78rem;font-weight:850}
    .daily-plan-step div{display:grid;gap:3px;min-width:0}.daily-plan-step small{opacity:.72;line-height:1.35}
    @media(max-width:760px){.brasilia-clock{display:none}.daily-plan-head{display:grid}.daily-plan-status{justify-self:start}.daily-plan-facts{display:grid;grid-template-columns:1fr}.daily-plan-step{grid-template-columns:36px minmax(0,1fr)}.daily-plan-step button{grid-column:1/-1;width:100%}}
  `;
  document.head.appendChild(style);
}
function init(){installStyles();installClock();renderPlan();bindPlan();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();