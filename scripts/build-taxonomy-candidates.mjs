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
function classify(question,axes){
  const assunto=normalize(question.assunto);
  const scored=[];
  for(const axis of axes){
    const cargo=cargoCompatibility(question.cargo,axis.cargos||[]);
    if(!cargo.compatible)continue;
    const subject=subjectRelation(question.disciplina,axis.subject);
    const exactTopic=Boolean(assunto&&assunto===normalize(axis.topic));
    const phraseMatch=Boolean(assunto&&normalize([axis.topic,axis.subtopic].join(' ')).includes(assunto));
    const coverage=tokenCoverage(question.assunto,axis);
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
  let classification='none',reason='Nenhum eixo atingiu evidência mínima semântica/estrutural.';
  if(exact.length===1){classification='strong';reason='Assunto atual coincide exatamente com um único tópico canônico compatível com o cargo.';}
  else if(subjectCompatible.length===1){classification='strong';reason='Há um único eixo compatível por matéria e cargo; requer revisão editorial antes de aplicar.';}
  else if(scored[0]&&(scored[0].score>=45||subjectCompatible.length>1)){
    classification='ambiguous';
    reason=subjectCompatible.length>1?'Há múltiplos eixos compatíveis na mesma matéria/cargo.':'Há evidência textual parcial, mas não suficiente para vínculo automático.';
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
    exactTopic:item.exactTopic
  }));
  return {classification,reason,suggestions};
}

const axisByCompetition=new Map(editais.filter(edital=>TARGETS.has(edital.competitionId)).map(edital=>[edital.competitionId,edital.canonicalAxes||[]]));
const entries=[];
for(const question of questions){
  if(canonicalComplete(question))continue;
  const competitionId=competitionFor(question);
  if(!competitionId)continue;
  const axes=axisByCompetition.get(competitionId)||[];
  const candidate=classify(question,axes);
  entries.push({
    questionId:String(question.id),
    competitionId,
    current:{cargo:text(question.cargo),disciplina:text(question.disciplina),assunto:text(question.assunto),subassunto:text(question.subassunto)},
    classification:candidate.classification,
    reason:candidate.reason,
    suggestions:candidate.suggestions
  });
}

function summarize(rows){
  const summary={pending:rows.length,strong:0,ambiguous:0,none:0};
  for(const row of rows)summary[row.classification]+=1;
  return summary;
}
const byCompetition={};
for(const competitionId of TARGETS)byCompetition[competitionId]=summarize(entries.filter(entry=>entry.competitionId===competitionId));
const totals=summarize(entries);
const output={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  policy:{
    writeback:false,
    automaticApplication:false,
    note:'Relatório de triagem. Candidato forte ainda exige revisão editorial; nenhuma sugestão altera o Banco Mestre automaticamente.'
  },
  totals,
  byCompetition,
  entries
};
await fs.writeFile('data/taxonomy-candidates.json',JSON.stringify(output,null,2)+'\n');
console.log(`Candidatos editoriais: ${totals.pending} pendentes · ${totals.strong} fortes · ${totals.ambiguous} ambíguos · ${totals.none} sem candidato.`);
