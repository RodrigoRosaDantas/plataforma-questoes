import fs from 'node:fs/promises';

const questions=JSON.parse(await fs.readFile('data/questions.json','utf8'));
const editais=JSON.parse(await fs.readFile('data/editais.json','utf8'));
if(!Array.isArray(questions)||!Array.isArray(editais))throw new Error('Dados editoriais inválidos.');

const TARGETS=new Set(['seedf','tjdft']);
const STOPWORDS=new Set(['a','as','o','os','e','de','da','das','do','dos','em','no','nos','na','nas','para','por','com','sem','ao','aos','um','uma','uns','umas','que','ou','se','sobre','entre','conforme','aplicado','aplicada','aplicaveis','aplicavel','nocao','nocoes']);
const text=value=>String(value??'').trim();
const normalize=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const tokens=value=>new Set(normalize(value).split(' ').filter(token=>token.length>=3&&!STOPWORDS.has(token)));
const canonicalComplete=q=>Boolean(text(q.concurso)&&text(q.edital)&&text(q.topicoEdital));

function belongsToCompetition(question,competitionId){
  const hay=[question.concurso,question.orgao,question.cargo,question.nomeMaterial].filter(Boolean).join(' ');
  if(competitionId==='seedf')return /SEEDF|Secretaria de Estado de Educação do Distrito Federal/i.test(hay);
  if(competitionId==='tjdft')return /TJDFT|Tribunal de Justiça do Distrito Federal/i.test(hay);
  return false;
}
function competitionFor(question){
  for(const id of TARGETS)if(belongsToCompetition(question,id))return id;
  return '';
}
function cargoFamily(value){
  const v=normalize(value);
  if(!v)return '';
  if(v.includes('nucleo comum'))return 'common';
  if(v.includes('gestor'))return 'gestor';
  if(v.includes('monitor'))return 'monitor';
  if(v.includes('tecnico judiciario')||(/^tecnico\b/.test(v)&&v.includes('administr')))return 'tecnico';
  if(v.includes('analista judiciario'))return 'analista-tjdft';
  if(v.includes('analista'))return 'analista';
  return v;
}
function cargoCompatibility(questionCargo,axisCargos=[]){
  if(!axisCargos.length)return {compatible:true,kind:'unspecified'};
  const q=normalize(questionCargo),qFamily=cargoFamily(questionCargo);
  let fallback=false;
  for(const cargo of axisCargos){
    const a=normalize(cargo),aFamily=cargoFamily(cargo);
    if(aFamily==='common')return {compatible:true,kind:'common'};
    if(q&&a&&q===a)return {compatible:true,kind:'exact'};
    if(qFamily&&aFamily&&qFamily===aFamily)return {compatible:true,kind:'family'};
    if(qFamily==='analista'&&aFamily==='analista-tjdft')fallback=true;
    if(qFamily==='analista-tjdft'&&aFamily==='analista')fallback=true;
  }
  return {compatible:fallback,kind:fallback?'broad-family':'none'};
}
function subjectRelation(discipline,subject){
  const d=normalize(discipline),s=normalize(subject);
  if(!d||!s)return 'none';
  if(d===s)return 'exact';
  const parts=String(subject||'').split(';').map(normalize).filter(Boolean);
  if(parts.includes(d))return 'component';
  if(parts.some(part=>part.includes(d)||d.includes(part)))return 'related';
  return 'none';
}
function tokenCoverage(query,axis){
  const wanted=tokens(query);
  if(!wanted.size)return 0;
  const available=tokens([axis.topic,axis.subtopic,axis.subject].filter(Boolean).join(' '));
  let hit=0;
  for(const token of wanted)if(available.has(token))hit+=1;
  return Number((hit/wanted.size).toFixed(3));
}
function canonicalTopicMatch(question,axes){
  const current=normalize(question.topicoEdital);
  if(!current)return null;
  return axes.find(axis=>normalize(axis.topic)===current)||null;
}
function classify(question,axes,queryText){
  const query=normalize(queryText);
  const scored=[];
  for(const axis of axes){
    const cargo=cargoCompatibility(question.cargo,axis.cargos||[]);
    if(!cargo.compatible)continue;
    const subject=subjectRelation(question.disciplina,axis.subject);
    const exactTopic=Boolean(query&&query===normalize(axis.topic));
    const phraseMatch=Boolean(query&&normalize([axis.topic,axis.subtopic].join(' ')).includes(query));
    const coverage=tokenCoverage(queryText,axis);
    const meaningful=exactTopic||phraseMatch||subject!=='none'||coverage>=0.25;
    if(!meaningful)continue;
    let score=0;
    if(exactTopic)score+=100;
    else if(phraseMatch)score+=45;
    if(subject==='exact')score+=40;
    else if(subject==='component')score+=30;
    else if(subject==='related')score+=15;
    if(cargo.kind==='exact')score+=15;
    else if(cargo.kind==='family')score+=12;
    else if(cargo.kind==='common')score+=8;
    else if(cargo.kind==='broad-family')score+=5;
    score+=Math.round(coverage*25);
    if(score>0)scored.push({axis,score,subject,cargo:cargo.kind,coverage,exactTopic,phraseMatch});
  }
  scored.sort((a,b)=>b.score-a.score||b.coverage-a.coverage||String(a.axis.topic).localeCompare(String(b.axis.topic),'pt-BR'));
  const subjectCompatible=scored.filter(item=>['exact','component'].includes(item.subject));
  const exact=scored.filter(item=>item.exactTopic);
  const best=scored[0]||null;
  let classification='none',reason='Nenhum eixo atingiu evidência mínima semântica/estrutural.';
  if(exact.length===1){
    classification='strong';
    reason='Texto de classificação coincide exatamente com um único tópico canônico compatível com o cargo.';
  }else if(subjectCompatible.length===1&&best&&(best.phraseMatch||best.coverage>=0.5)){
    classification='strong';
    reason='Há um único eixo compatível por matéria/cargo e evidência textual relevante; ainda exige revisão editorial.';
  }else if(best&&(best.score>=45||subjectCompatible.length>0)){
    classification='ambiguous';
    reason=subjectCompatible.length>1
      ?'Há múltiplos eixos compatíveis na mesma matéria/cargo.'
      :'Há compatibilidade estrutural ou textual, mas evidência insuficiente para classificar como candidato forte.';
  }
  const suggestions=scored.slice(0,3).map(item=>({
    axisId:item.axis.id,
    topic:item.axis.topic,
    subject:item.axis.subject,
    cargos:item.axis.cargos||[],
    layer:item.axis.layer||'',
    sourceBase:item.axis.sourceBase||'',
    score:item.score,
    subjectRelation:item.subject,
    cargoRelation:item.cargo,
    tokenCoverage:item.coverage,
    phraseMatch:item.phraseMatch,
    exactTopic:item.exactTopic
  }));
  return {classification,reason,suggestions};
}

const axisByCompetition=new Map(editais.filter(edital=>TARGETS.has(edital.competitionId)).map(edital=>[edital.competitionId,edital.canonicalAxes||[]]));
const entries=[];
const canonicalMatched={seedf:0,tjdft:0};
for(const question of questions){
  const competitionId=competitionFor(question);
  if(!competitionId)continue;
  const axes=axisByCompetition.get(competitionId)||[];
  const complete=canonicalComplete(question);
  const exactCanonical=complete?canonicalTopicMatch(question,axes):null;
  if(exactCanonical){canonicalMatched[competitionId]+=1;continue;}
  const issue=complete?'filled-noncanonical':'incomplete';
  const queryText=complete?question.topicoEdital:question.assunto;
  const candidate=classify(question,axes,queryText);
  entries.push({
    questionId:String(question.id),
    competitionId,
    issue,
    current:{
      concurso:text(question.concurso),
      edital:text(question.edital),
      topicoEdital:text(question.topicoEdital),
      cargo:text(question.cargo),
      disciplina:text(question.disciplina),
      assunto:text(question.assunto),
      subassunto:text(question.subassunto)
    },
    classification:candidate.classification,
    reason:candidate.reason,
    suggestions:candidate.suggestions
  });
}

function summarize(rows,matched=0){
  const summary={
    reviewQueue:rows.length,
    incomplete:rows.filter(row=>row.issue==='incomplete').length,
    filledNoncanonical:rows.filter(row=>row.issue==='filled-noncanonical').length,
    canonicalMatched:matched,
    strong:0,
    ambiguous:0,
    none:0,
    strongExactTopic:0,
    strongWithTextEvidence:0
  };
  for(const row of rows){
    summary[row.classification]+=1;
    if(row.classification==='strong'){
      const best=row.suggestions[0];
      if(best?.exactTopic)summary.strongExactTopic+=1;
      if(best?.exactTopic||best?.phraseMatch||Number(best?.tokenCoverage)>=0.5)summary.strongWithTextEvidence+=1;
    }
  }
  return summary;
}
const byCompetition={};
for(const competitionId of TARGETS){
  const rows=entries.filter(entry=>entry.competitionId===competitionId);
  byCompetition[competitionId]=summarize(rows,canonicalMatched[competitionId]||0);
}
const totals=summarize(entries,Object.values(canonicalMatched).reduce((sum,value)=>sum+value,0));
const output={
  schemaVersion:2,
  generatedAt:new Date().toISOString(),
  policy:{
    writeback:false,
    automaticApplication:false,
    strongRequiresTextEvidence:true,
    note:'Relatório de triagem. Candidato forte ainda exige revisão editorial; nenhuma sugestão altera o Banco Mestre automaticamente.'
  },
  totals,
  byCompetition,
  entries
};
await fs.writeFile('data/taxonomy-candidates.json',JSON.stringify(output,null,2)+'\n');
console.log(`Triagem canônica: ${totals.reviewQueue} na fila · ${totals.incomplete} incompletas · ${totals.filledNoncanonical} preenchidas não canônicas · ${totals.strong} fortes · ${totals.ambiguous} ambíguas · ${totals.none} sem candidato · ${totals.canonicalMatched} já canônicas.`);
