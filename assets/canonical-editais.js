const CANONICAL_DATA='./data/editais.json';
const TCE_GO_CANONICAL_DATA='./data/tce-go-edital.json';
const COMPETITIONS_DATA='./data/competitions.json';
let canonicalState=null;
let canonicalTimer=null;

const text=value=>String(value??'').trim();
const normalize=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=value=>Number(value||0).toLocaleString('pt-BR');

async function loadCanonicalState(force=false){
  const suffix=force?`?canonical=${Date.now()}`:'';
  const [response,tceResponse,competitionResponse]=await Promise.all([
    fetch(CANONICAL_DATA+suffix,{cache:force?'no-store':'force-cache'}),
    fetch(TCE_GO_CANONICAL_DATA+suffix,{cache:force?'no-store':'force-cache'}),
    fetch(COMPETITIONS_DATA+suffix,{cache:force?'no-store':'force-cache'})
  ]);
  if(!response.ok)throw new Error('Taxonomia canônica indisponível.');
  const [editais,tceGo,competitions]=await Promise.all([response.json(),tceResponse.ok?tceResponse.json():null,competitionResponse.ok?competitionResponse.json():[]]);
  if(!Array.isArray(editais))throw new Error('Dados canônicos inválidos.');
  if(tceGo&&(!Array.isArray(tceGo.canonicalAxes)||Number(tceGo.canonicalAxisCount)!==tceGo.canonicalAxes.length))throw new Error('Taxonomia TCE-GO inválida.');
  canonicalState={editais:tceGo?[...editais,tceGo]:editais,competitions:Array.isArray(competitions)?competitions:[]};
  return canonicalState;
}

function layerClass(layer){
  const value=normalize(layer);
  if(value.includes('edital 2026')||value.includes('vigente'))return 'current';
  if(value.includes('atualizacao')||value.includes('legislacao atual'))return 'current';
  if(value.includes('radar')||value.includes('estrategia'))return 'radar';
  return 'historical';
}
function policyLabel(edital){
  if(edital.sourceKind==='projected')return 'PROJETADO · PRÉ-EDITAL';
  if(edital.sourceKind==='historical-base')return 'BASE HISTÓRICA · PRÉ-EDITAL';
  return String(edital.status||'').toUpperCase();
}
function groupAxes(axes){
  const groups=new Map();
  for(const axis of axes){
    const subject=text(axis.subject)||'Sem matéria';
    if(!groups.has(subject))groups.set(subject,[]);
    groups.get(subject).push(axis);
  }
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b,'pt-BR',{numeric:true}));
}
function linkedCount(axis){return Math.max(0,Number(axis.directQuestionCount)||0);}
function axisMarkup(axis){
  const linked=linkedCount(axis);
  const cargos=(axis.cargos||[]).filter(Boolean);
  const badges=(axis.sectionId?[axis.layer]:[axis.layer,axis.sourceBase,...cargos]).filter(Boolean);
  const linkState=axis.directLinkAmbiguous
    ?'<span class="canonical-link canonical-link-ambiguous">Tópico repetido · exige revisão editorial</span>'
    :linked
      ?`<span class="canonical-link canonical-link-live"><strong>${fmt(linked)}</strong> vínculo${linked===1?'':'s'} direto${linked===1?'':'s'}</span>`
      :'<span class="canonical-link canonical-link-empty">Sem vínculo direto no banco</span>';
  return `<article class="canonical-topic" data-canonical-topic="${escapeHtml(axis.id||axis.topic)}">
    <div class="canonical-topic-main">
      <div class="canonical-badges">${badges.map((badge,index)=>`<span class="canonical-badge ${index===0?'canonical-badge-'+layerClass(axis.layer):''}">${escapeHtml(badge)}</span>`).join('')}</div>
      <strong>${escapeHtml(axis.topic)}</strong>
      ${axis.subtopic?`<p>${escapeHtml(axis.subtopic)}</p>`:''}
    </div>
    <div class="canonical-topic-status">${linkState}</div>
  </article>`;
}
function canonicalMarkup(edital){
  const axes=Array.isArray(edital.canonicalAxes)?edital.canonicalAxes:[];
  if(!axes.length)return '';
  const direct=Number(edital.canonicalDirectQuestions)||axes.reduce((sum,axis)=>sum+linkedCount(axis),0);
  const linkedAxes=Number(edital.canonicalLinkedAxes)||axes.filter(axis=>linkedCount(axis)>0).length;
  const ambiguousAxes=Number(edital.canonicalAmbiguousAxes)||axes.filter(axis=>axis.directLinkAmbiguous).length;
  const groups=groupAxes(axes);
  const note=text(edital.editorialPolicy?.note)||'Taxonomia editorial da trilha.';
  const subjectMapping=edital.mappingGranularity==='subject';
  const correlated=Object.values(edital.subjectQuestionCounts||{}).reduce((sum,count)=>sum+Math.max(0,Number(count)||0),0);
  const correlatedSubjects=Object.values(edital.subjectQuestionCounts||{}).filter(count=>Number(count)>0).length;
  const summaryText=subjectMapping
    ?`${fmt(linkedAxes)}/${fmt(axes.length)} tópicos com vínculo exato · ${fmt(correlated)} questões correlatas por matéria`
    :`${fmt(linkedAxes)}/${fmt(axes.length)} eixos com vínculo direto · ${fmt(direct)} questões${ambiguousAxes?` · ${fmt(ambiguousAxes)} eixo(s) ambíguo(s)`:''}`;
  const heading=subjectMapping?`${fmt(axes.length)} tópicos do edital`:`${fmt(axes.length)} eixos do verticalizado`;
  const legend=subjectMapping
    ?'<span><i class="canonical-dot current"></i>Edital 2026</span><span><i class="canonical-dot"></i>Questões FCC correlatas por matéria</span>'
    :`<span><i class="canonical-dot historical"></i>Base histórica</span><span><i class="canonical-dot current"></i>Atualização/legislação atual</span><span><i class="canonical-dot radar"></i>Radar/projeção</span>${ambiguousAxes?'<span><i class="canonical-dot ambiguous"></i>Revisão editorial necessária</span>':''}`;
  const footnote=subjectMapping
    ?`<strong>Vínculo por matéria:</strong> ${fmt(Number(edital.questionPoolCount)||0)} questões FCC únicas cobrem ${fmt(correlatedSubjects)} matérias. Os grupos contêm ${fmt(correlated)} entradas porque algumas questões servem a mais de uma matéria. Nenhuma foi associada a um subitem específico dos ${fmt(axes.length)} tópicos.`
    :'<strong>Vínculo direto</strong> significa correspondência exata entre o campo “Tópico do edital” da questão e um eixo canônico único. Tópicos repetidos não são vinculados automaticamente; exigem desambiguação editorial.';
  return `<section class="canonical-edital" data-canonical-section="${escapeHtml(edital.competitionId)}">
    <div class="canonical-head">
      <div><span class="kicker">TAXONOMIA CANÔNICA</span><h3>${heading}</h3><p>${escapeHtml(note)}</p></div>
      <div class="canonical-summary"><span>${escapeHtml(policyLabel(edital))}</span><strong>${fmt(linkedAxes)}/${fmt(axes.length)}</strong><small>${summaryText}</small></div>
    </div>
    <div class="canonical-legend">${legend}</div>
    <div class="canonical-groups">${groups.map(([subject,items],index)=>{
      const subjectQuestions=Math.max(0,Number(edital.subjectQuestionCounts?.[subject])||0);
      const groupStatus=subjectMapping?`${fmt(subjectQuestions)} questões correlatas por matéria`:`${fmt(items.reduce((sum,item)=>sum+linkedCount(item),0))} questões ligadas`;
      const sectionId=String(edital.subjectSectionIds?.[subject]||'');
      const groupAction=subjectMapping&&subjectQuestions&&sectionId?`<div class="canonical-group-action"><small>${groupStatus}</small><button type="button" class="secondary" data-tce-section="${escapeHtml(sectionId)}">Fazer ${fmt(subjectQuestions)} questões →</button></div>`:'';
      return `<details class="canonical-group" ${index===0?'open':''}><summary><div><strong>${escapeHtml(subject)}</strong><small>${fmt(items.length)} tópico${items.length===1?'':'s'}</small></div><span>${groupStatus}</span></summary>${groupAction}<div class="canonical-topic-list">${items.map(axis=>axisMarkup(axis)).join('')}</div></details>`;
    }).join('')}</div>
    <p class="canonical-footnote">${footnote}</p>
  </section>`;
}
function visibleCanonicalEdital(edital){
  if(!edital)return null;
  if(edital.competitionId!=='seedf')return edital;
  const config=canonicalState?.competitions?.find(item=>item.id==='seedf')||{};
  const focus=new Set([...(config.focusRoles||[]),...(config.sharedRoles||[])].map(normalize));
  if(!focus.size)return edital;
  const canonicalAxes=(edital.canonicalAxes||[]).flatMap(axis=>{
    const roles=(axis.cargos||[]).filter(Boolean);
    if(!roles.length)return [axis];
    const visibleRoles=roles.filter(role=>focus.has(normalize(role)));
    return visibleRoles.length?[{...axis,cargos:visibleRoles}]:[];
  });
  const linkedAxes=canonicalAxes.filter(axis=>linkedCount(axis)>0).length;
  const direct=canonicalAxes.reduce((sum,axis)=>sum+linkedCount(axis),0);
  const ambiguous=canonicalAxes.filter(axis=>axis.directLinkAmbiguous).length;
  const note=text(edital.editorialPolicy?.note);
  return {...edital,canonicalAxes,canonicalAxisCount:canonicalAxes.length,canonicalLinkedAxes:linkedAxes,canonicalDirectQuestions:direct,canonicalAmbiguousAxes:ambiguous,editorialPolicy:{...edital.editorialPolicy,note:(note?note+' ':'')+'Exibindo o foco atual: Gestor — Administração, Analista — Apoio Administrativo e Núcleo comum. Eixos exclusivos de Analista — Monitor ficam fora desta visualização.'}};
}

function findEditalForCard(card){
  const competitionId=text(card.querySelector('[data-edital-filter]')?.dataset.editalFilter);
  if(competitionId){
    const byId=canonicalState?.editais?.find(edital=>text(edital.competitionId)===competitionId);
    if(byId)return byId;
  }
  const title=normalize(card.querySelector('.edital-card-head h2')?.textContent);
  return canonicalState?.editais?.find(edital=>normalize(edital.title)===title)||null;
}
function renderCanonicalSections(){
  if(!canonicalState)return;
  const root=document.querySelector('#editalList');
  if(!root)return;
  for(const card of root.querySelectorAll('.edital-card')){
    const edital=visibleCanonicalEdital(findEditalForCard(card));
    if(!edital||!(edital.canonicalAxes||[]).length)continue;
    const stamp=[edital.competitionId,edital.sourceGeneratedAt,edital.canonicalAxisCount,edital.canonicalDirectQuestions,edital.canonicalAmbiguousAxes].join('|');
    let section=card.querySelector(':scope > .canonical-edital');
    if(section?.dataset.canonicalStamp===stamp)continue;
    const wrapper=document.createElement('div');
    wrapper.innerHTML=canonicalMarkup(edital);
    const next=wrapper.firstElementChild;
    next.dataset.canonicalStamp=stamp;
    if(section)section.replaceWith(next);
    else{
      const summary=card.querySelector(':scope > .edital-summary');
      if(summary)summary.insertAdjacentElement('afterend',next);
      else card.querySelector('.edital-card-head')?.insertAdjacentElement('afterend',next);
    }
  }
}
function scheduleCanonicalRender(delay=30){
  clearTimeout(canonicalTimer);
  canonicalTimer=setTimeout(()=>{canonicalTimer=null;renderCanonicalSections();},delay);
}
async function refreshCanonical(force=false){
  try{await loadCanonicalState(force);renderCanonicalSections();}
  catch(error){console.warn('Taxonomia canônica:',error?.message||error);}
}
function installStyles(){
  if(document.querySelector('#canonicalEditalStyles'))return;
  const style=document.createElement('style');
  style.id='canonicalEditalStyles';
  style.textContent=`
    .canonical-edital{margin:18px 0;padding:16px;border:1px solid color-mix(in srgb,var(--accent,#4656e8) 24%,var(--border,#d9deea));border-radius:16px;background:color-mix(in srgb,var(--accent,#4656e8) 3%,transparent)}
    .canonical-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.canonical-head h3{margin:4px 0 5px}.canonical-head p{margin:0;max-width:760px;font-size:.82rem;line-height:1.5;opacity:.78}.canonical-summary{display:grid;gap:2px;text-align:right;min-width:180px}.canonical-summary>span{font-size:.66rem;font-weight:850;letter-spacing:.06em;opacity:.65}.canonical-summary>strong{font-size:1.45rem}.canonical-summary>small{font-size:.7rem;opacity:.68}
    .canonical-legend{display:flex;flex-wrap:wrap;gap:10px 16px;margin:14px 0;font-size:.7rem;opacity:.78}.canonical-legend span{display:flex;align-items:center;gap:6px}.canonical-dot{width:8px;height:8px;border-radius:50%;background:currentColor}.canonical-dot.historical{opacity:.45}.canonical-dot.current{opacity:.85}.canonical-dot.radar{border:2px solid currentColor;background:transparent}.canonical-dot.ambiguous{background:transparent;border:2px dashed currentColor}
    .canonical-groups{display:grid;gap:8px}.canonical-group{border:1px solid var(--border,#d9deea);border-radius:12px;background:var(--surface,#fff);overflow:hidden}.canonical-group>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;cursor:pointer}.canonical-group>summary>div{display:grid;gap:2px}.canonical-group>summary small,.canonical-group>summary>span{font-size:.7rem;opacity:.67}.canonical-topic-list{display:grid;border-top:1px solid var(--border,#d9deea)}
    .canonical-topic{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:12px 13px;border-bottom:1px solid var(--border,#d9deea)}.canonical-topic:last-child{border-bottom:0}.canonical-topic-main{display:grid;gap:5px}.canonical-topic-main>strong{font-size:.84rem}.canonical-topic-main>p{margin:0;font-size:.73rem;line-height:1.45;opacity:.72}.canonical-badges{display:flex;gap:5px;flex-wrap:wrap}.canonical-badge{padding:3px 6px;border-radius:999px;background:color-mix(in srgb,currentColor 7%,transparent);font-size:.61rem;font-weight:750;line-height:1.2}.canonical-badge-current{font-weight:900}.canonical-badge-radar{border:1px dashed currentColor;background:transparent}.canonical-topic-status{text-align:right}.canonical-link{display:inline-flex;align-items:baseline;gap:4px;padding:5px 7px;border-radius:8px;font-size:.66rem;white-space:nowrap}.canonical-link-live{background:color-mix(in srgb,var(--accent,#4656e8) 9%,transparent);font-weight:750}.canonical-link-empty{opacity:.56;background:color-mix(in srgb,currentColor 4%,transparent)}.canonical-link-ambiguous{font-weight:750;border:1px dashed currentColor;opacity:.78}
    .canonical-footnote{margin:12px 0 0;font-size:.68rem;line-height:1.45;opacity:.7}
    @media(max-width:760px),(pointer:coarse){.canonical-head{display:grid}.canonical-summary{text-align:left;min-width:0}.canonical-topic{grid-template-columns:1fr}.canonical-topic-status{text-align:left}.canonical-link{white-space:normal}.canonical-group>summary{align-items:flex-start}}
  `;
  document.head.appendChild(style);
}
function install(){
  installStyles();
  const root=document.querySelector('#editalList');
  if(root)new MutationObserver(()=>scheduleCanonicalRender(0)).observe(root,{childList:true,subtree:true});
  document.querySelector('#editalSearch')?.addEventListener('input',()=>scheduleCanonicalRender(80));
  document.addEventListener('click',event=>{if(event.target.closest('[data-refresh-release]'))setTimeout(()=>void refreshCanonical(true),1700);});
  void refreshCanonical(false);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
