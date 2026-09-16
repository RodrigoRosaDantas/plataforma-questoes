import fs from 'node:fs/promises';

const report=JSON.parse(await fs.readFile('data/taxonomy-candidates.json','utf8'));
if(report?.schemaVersion!==3||!Array.isArray(report.entries))throw new Error('Triagem editorial v3 não encontrada.');
if(!report.sourceReleaseSnapshotId)throw new Error('Triagem editorial sem release de origem identificada.');

const text=value=>String(value??'').trim();
const normalize=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

function sourceLabel(entry){
  return entry.issue==='filled-noncanonical'
    ?text(entry.current?.topicoEdital)
    :text(entry.current?.assunto);
}
function baseKey(entry){
  return [entry.competitionId,entry.issue,entry.current?.cargo,entry.current?.disciplina,sourceLabel(entry)].map(normalize).join('¦');
}

const buckets=new Map();
for(const entry of report.entries){
  const key=baseKey(entry);
  if(!buckets.has(key))buckets.set(key,[]);
  buckets.get(key).push(entry);
}

const groups=[];
for(const rows of buckets.values()){
  const first=rows[0];
  const bestIds=new Set(rows.map(row=>row.suggestions?.[0]?.axisId||'').filter(Boolean));
  const allStrong=rows.every(row=>row.classification==='strong');
  const allWithBest=rows.every(row=>Boolean(row.suggestions?.[0]?.axisId));
  const allTextEvidence=rows.every(row=>{
    const best=row.suggestions?.[0];
    return Boolean(best&&(best.exactTopic||best.phraseMatch||Number(best.tokenCoverage)>=0.5));
  });
  const cohesive=allStrong&&allWithBest&&allTextEvidence&&bestIds.size===1;
  const best=cohesive?first.suggestions[0]:null;
  const classificationCounts=rows.reduce((acc,row)=>{
    acc[row.classification]=(acc[row.classification]||0)+1;
    return acc;
  },{});
  groups.push({
    competitionId:first.competitionId,
    issue:first.issue,
    cargo:text(first.current?.cargo),
    disciplina:text(first.current?.disciplina),
    currentLabel:sourceLabel(first),
    count:rows.length,
    classificationCounts,
    uniqueBestAxes:bestIds.size,
    cohesiveStrong:cohesive,
    proposedAxis:best?{
      axisId:best.axisId,
      topic:best.topic,
      subject:best.subject,
      cargos:best.cargos||[],
      layer:best.layer||'',
      sourceBase:best.sourceBase||''
    }:null,
    evidence:cohesive?{
      minTokenCoverage:Number(Math.min(...rows.map(row=>Number(row.suggestions?.[0]?.tokenCoverage)||0)).toFixed(3)),
      exactTopicCount:rows.filter(row=>row.suggestions?.[0]?.exactTopic).length,
      phraseMatchCount:rows.filter(row=>row.suggestions?.[0]?.phraseMatch).length
    }:null,
    sampleQuestionIds:rows.slice(0,8).map(row=>row.questionId)
  });
}

groups.sort((a,b)=>Number(b.cohesiveStrong)-Number(a.cohesiveStrong)||b.count-a.count||a.competitionId.localeCompare(b.competitionId)||a.currentLabel.localeCompare(b.currentLabel,'pt-BR'));
const cohesiveGroups=groups.filter(group=>group.cohesiveStrong);
const byCompetition={};
for(const competitionId of ['seedf','tjdft']){
  const all=groups.filter(group=>group.competitionId===competitionId);
  const cohesive=all.filter(group=>group.cohesiveStrong);
  byCompetition[competitionId]={
    groups:all.length,
    cohesiveStrongGroups:cohesive.length,
    questionsInCohesiveStrongGroups:cohesive.reduce((sum,group)=>sum+group.count,0),
    unresolvedGroups:all.length-cohesive.length
  };
}
const output={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  sourceCandidateSchemaVersion:report.schemaVersion,
  sourceReleaseSnapshotId:report.sourceReleaseSnapshotId,
  sourceQuestionCount:Number(report.sourceQuestionCount),
  policy:{
    writeback:false,
    automaticApplication:false,
    cohesiveDefinition:'Mesmo concurso, tipo de pendência, cargo, disciplina e rótulo atual; todas as questões fortes, com evidência textual e o mesmo melhor eixo canônico.',
    note:'Lotes coesos reduzem a fila de revisão, mas ainda não autorizam alteração automática do Banco Mestre.'
  },
  totals:{
    groups:groups.length,
    cohesiveStrongGroups:cohesiveGroups.length,
    questionsInCohesiveStrongGroups:cohesiveGroups.reduce((sum,group)=>sum+group.count,0),
    unresolvedGroups:groups.length-cohesiveGroups.length
  },
  byCompetition,
  cohesiveStrongGroups:cohesiveGroups,
  groups
};

await fs.writeFile('data/taxonomy-review-groups.json',JSON.stringify(output,null,2)+'\n');
console.log(`Lotes editoriais: ${output.totals.groups} grupos · ${output.totals.cohesiveStrongGroups} coesos · ${output.totals.questionsInCohesiveStrongGroups} questões em lotes coesos.`);
