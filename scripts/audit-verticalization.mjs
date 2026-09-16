import fs from 'node:fs/promises';

const questions=JSON.parse(await fs.readFile('data/questions.json','utf8'));
const editais=JSON.parse(await fs.readFile('data/editais.json','utf8'));

const scopes={
  seedf: hay=>/SEEDF/i.test(hay),
  tjdft: hay=>/TJDFT|Tribunal de Justiça do Distrito Federal/i.test(hay),
  'sedes-df-2026': hay=>/SEDES/i.test(hay)
};
const normalize=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const hay=q=>[q.concurso,q.orgao,q.cargo,q.nomeMaterial].filter(Boolean).join(' ');
const top=(map,limit=15)=>[...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR')).slice(0,limit).map(([value,count])=>({value,count}));
const add=(map,value)=>{const key=String(value||'').trim()||'(vazio)';map.set(key,(map.get(key)||0)+1);};

const byScope=Object.fromEntries(Object.keys(scopes).map(id=>[id,{
  count:0,missingAssunto:0,missingSubassunto:0,explicitConcurso:0,explicitEdital:0,explicitTopicoEdital:0,
  disciplinas:new Map(),cargos:new Map(),orgaos:new Map()
}]));
const none={count:0,disciplinas:new Map(),cargos:new Map(),orgaos:new Map(),samples:[]};
const overlaps={count:0,patterns:new Map(),samples:[]};
const idCounts=new Map();

for(const q of questions){
  add(idCounts,q.id);
  const memberships=Object.entries(scopes).filter(([,matcher])=>matcher(hay(q))).map(([id])=>id);
  if(!memberships.length){
    none.count+=1; add(none.disciplinas,q.disciplina);add(none.cargos,q.cargo);add(none.orgaos,q.orgao);
    if(none.samples.length<20)none.samples.push({id:q.id,orgao:q.orgao||'',cargo:q.cargo||'',disciplina:q.disciplina||'',concurso:q.concurso||'',nomeMaterial:q.nomeMaterial||''});
  }
  if(memberships.length>1){
    overlaps.count+=1;add(overlaps.patterns,memberships.sort().join('+'));
    if(overlaps.samples.length<20)overlaps.samples.push({id:q.id,memberships,orgao:q.orgao||'',cargo:q.cargo||'',concurso:q.concurso||'',nomeMaterial:q.nomeMaterial||''});
  }
  for(const id of memberships){
    const s=byScope[id];s.count+=1;
    if(!String(q.assunto||'').trim())s.missingAssunto+=1;
    if(!String(q.subassunto||'').trim())s.missingSubassunto+=1;
    if(String(q.concurso||'').trim())s.explicitConcurso+=1;
    if(String(q.edital||'').trim())s.explicitEdital+=1;
    if(String(q.topicoEdital||'').trim())s.explicitTopicoEdital+=1;
    add(s.disciplinas,q.disciplina);add(s.cargos,q.cargo);add(s.orgaos,q.orgao);
  }
}

const duplicateIds=[...idCounts.entries()].filter(([,count])=>count>1).map(([id,count])=>({id,count}));
const editalAudit=editais.map(edital=>{
  const axes=Array.isArray(edital.canonicalAxes)?edital.canonicalAxes:[];
  const directlyLinked=axes.filter(axis=>Number(axis.directQuestionCount)||Array.isArray(axis.directQuestionIds)&&axis.directQuestionIds.length);
  const directQuestions=axes.reduce((sum,axis)=>sum+(Number(axis.directQuestionCount)||0),0);
  const subjects=new Set(axes.map(axis=>normalize(axis.subject)).filter(Boolean));
  const scopeQuestions=questions.filter(q=>scopes[edital.competitionId]?.(hay(q)));
  const subjectCovered=scopeQuestions.filter(q=>subjects.has(normalize(q.disciplina))).length;
  const exactTopicCovered=scopeQuestions.filter(q=>axes.some(axis=>normalize(axis.subject)===normalize(q.disciplina)&&normalize(axis.topic)===normalize(q.assunto))).length;
  return {
    competitionId:edital.competitionId,
    title:edital.title,
    status:edital.status,
    canonicalAxisCountConfigured:Number(edital.canonicalAxisCount)||0,
    canonicalAxisCountActual:axes.length,
    canonicalLinkedAxesConfigured:Number(edital.canonicalLinkedAxes)||0,
    canonicalDirectQuestionsConfigured:Number(edital.canonicalDirectQuestions)||0,
    directlyLinkedAxesActual:directlyLinked.length,
    directQuestionsActual:directQuestions,
    scopeQuestionCount:scopeQuestions.length,
    subjectCoveredQuestionCount:subjectCovered,
    exactCanonicalTopicQuestionCount:exactTopicCovered,
    axisSubjects:[...new Set(axes.map(axis=>axis.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'))
  };
});

const serializedScopes={};
for(const [id,s] of Object.entries(byScope))serializedScopes[id]={
  count:s.count,
  missingAssunto:s.missingAssunto,
  missingAssuntoPercent:s.count?Number((s.missingAssunto/s.count*100).toFixed(2)):0,
  missingSubassunto:s.missingSubassunto,
  explicitConcurso:s.explicitConcurso,
  explicitEdital:s.explicitEdital,
  explicitTopicoEdital:s.explicitTopicoEdital,
  topDisciplinas:top(s.disciplinas),topCargos:top(s.cargos),topOrgaos:top(s.orgaos)
};

const report={
  generatedAt:new Date().toISOString(),
  questionCount:questions.length,
  duplicateQuestionIds:duplicateIds,
  scopes:serializedScopes,
  unscoped:{count:none.count,percent:questions.length?Number((none.count/questions.length*100).toFixed(2)):0,topDisciplinas:top(none.disciplinas),topCargos:top(none.cargos),topOrgaos:top(none.orgaos),samples:none.samples},
  overlaps:{count:overlaps.count,patterns:top(overlaps.patterns),samples:overlaps.samples},
  editais:editalAudit
};

await fs.writeFile('data/verticalization-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
