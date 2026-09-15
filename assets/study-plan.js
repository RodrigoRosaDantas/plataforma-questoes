const PLAN_KEY='plataforma.questoes.daily-plan.v1';
const PROGRESS_KEY='plataforma.questoes.progress.v1';
const PLANS={
  30:{minutes:30,questions:10,review:5,label:'30 min'},
  60:{minutes:60,questions:20,review:10,label:'60 min'},
  90:{minutes:90,questions:30,review:15,label:'90 min'}
};

function readJson(key,fallback={}){
  try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch{return fallback;}
}
function progressSummary(){
  const progress=readJson(PROGRESS_KEY,{});
  const errors=Object.keys(progress.errors||{}).length;
  const reviews=Object.keys(progress.reviews||{}).length;
  const marked=Object.values(progress.marked||{}).filter(item=>!item?.removed).length;
  return {errors,reviews,marked,pending:new Set([...Object.keys(progress.errors||{}),...Object.keys(progress.reviews||{})]).size,active:Boolean(progress.activeSession)};
}
function selectedPlan(){
  const saved=readJson(PLAN_KEY,{});
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
function planSteps(plan,summary){
  const first=summary.pending
    ? {code:'01',title:`Revisar até ${Math.min(plan.review,summary.pending)} pendência(s)`,detail:`Você tem ${summary.pending} questão(ões) entre erros e revisões.`,action:'review',button:'Abrir revisão'}
    : {code:'01',title:'Aquecer pelo edital',detail:'Escolha um tópico prioritário antes de abrir questões novas.',action:'edits',button:'Escolher tópico'};
  return [
    first,
    {code:'02',title:`Resolver ${plan.questions} questões`,detail:`Bloco principal sugerido para uma janela de ${plan.label}.`,action:'questions',button:'Montar bateria'},
    {code:'03',title:'Fechar o ciclo com evidências',detail:'Confira precisão e disciplinas que pedem reforço antes do próximo bloco.',action:'performance',button:'Ver desempenho'}
  ];
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
  const steps=planSteps(plan,summary);
  card.innerHTML=`
    <div class="card-head daily-plan-head">
      <div><span class="kicker">PLANO DE HOJE</span><h2>Um roteiro para o tempo que você tem</h2></div>
      <span class="daily-plan-status">${summary.active?'Sessão em andamento · ':''}${summary.pending} pendência(s)</span>
    </div>
    <p class="daily-plan-copy">Escolha uma janela. A plataforma transforma seus erros/revisões e o banco atual em uma sequência curta de próxima ação.</p>
    <div class="daily-plan-options" role="group" aria-label="Tempo disponível para estudar">
      ${Object.values(PLANS).map(item=>`<button type="button" class="${item.minutes===plan.minutes?'active':''}" data-plan-minutes="${item.minutes}" aria-pressed="${item.minutes===plan.minutes}">${item.label}</button>`).join('')}
    </div>
    <div class="daily-plan-steps">
      ${steps.map(step=>`<div class="daily-plan-step"><span>${step.code}</span><div><strong>${step.title}</strong><small>${step.detail}</small></div><button type="button" class="secondary" data-plan-action="${step.action}" data-plan-size="${plan.questions}">${step.button}</button></div>`).join('')}
    </div>`;
}
function go(view){
  const trigger=document.querySelector(`[data-go="${view}"]`);
  if(trigger){trigger.click();return true;}
  return false;
}
function openQuestionBuilder(size){
  if(!go('questions'))return;
  setTimeout(()=>{
    const input=document.querySelector('#sessionSize');
    if(!input)return;
    input.value=String(size);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    input.focus({preventScroll:true});
  },80);
}
function bindPlan(){
  document.addEventListener('click',event=>{
    const option=event.target.closest('[data-plan-minutes]');
    if(option){savePlan(option.dataset.planMinutes);renderPlan();return;}
    const action=event.target.closest('[data-plan-action]');
    if(!action)return;
    const target=action.dataset.planAction;
    if(target==='questions')openQuestionBuilder(Number(action.dataset.planSize)||10);
    else go(target);
  });
  window.addEventListener('progress:changed',()=>renderPlan());
  window.addEventListener('storage',event=>{if(event.key===PROGRESS_KEY||event.key===PLAN_KEY)renderPlan();});
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
    .daily-plan-copy{max-width:760px;margin-top:-2px}
    .daily-plan-options{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
    .daily-plan-options button{border:1px solid var(--border,#d9deea);background:transparent;color:inherit;border-radius:999px;padding:9px 14px;font:inherit;font-weight:750;cursor:pointer}
    .daily-plan-options button.active{background:var(--accent,#4656e8);border-color:var(--accent,#4656e8);color:#fff}
    .daily-plan-steps{display:grid;gap:10px}
    .daily-plan-step{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--border,#e3e6ee)}
    .daily-plan-step>span{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--accent,#4656e8) 12%,transparent);font-size:.78rem;font-weight:850}
    .daily-plan-step div{display:grid;gap:3px;min-width:0}.daily-plan-step small{opacity:.72;line-height:1.35}
    @media(max-width:760px){.brasilia-clock{display:none}.daily-plan-head{display:grid}.daily-plan-status{justify-self:start}.daily-plan-step{grid-template-columns:36px minmax(0,1fr)}.daily-plan-step button{grid-column:1/-1;width:100%}}
  `;
  document.head.appendChild(style);
}
function init(){installStyles();installClock();renderPlan();bindPlan();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
