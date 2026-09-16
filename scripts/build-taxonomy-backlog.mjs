import fs from 'node:fs/promises';

const questions=JSON.parse(await fs.readFile('data/questions.json','utf8'));
const metadata=JSON.parse(await fs.readFile('data/metadata.json','utf8'));
if(!Array.isArray(questions))throw new Error('data/questions.json deve conter um array.');

const text=value=>String(value??'').trim();
const canonicalComplete=q=>Boolean(text(q.concurso)&&text(q.edital)&&text(q.topicoEdital));
const backlog=questions.filter(q=>!canonicalComplete(q));
const mapped=questions.length-backlog.length;

function aggregate(rows,fields,{limit=250,samples=6}={}){
  const map=new Map();
  for(const question of rows){
    const values=fields.map(field=>text(question[field])||'Sem classificação');
    const key=values.join('\u241f');
    const current=map.get(key)||{
      count:0,
      withAssunto:0,
      withSubassunto:0,
      sampleIds:[],
      values
    };
    current.count+=1;
    if(text(question.assunto))current.withAssunto+=1;
    if(text(question.subassunto))current.withSubassunto+=1;
    if(current.sampleIds.length<samples)current.sampleIds.push(String(question.id));
    map.set(key,current);
  }
  return [...map.values()]
    .map(row=>Object.fromEntries([
      ...fields.map((field,index)=>[field,row.values[index]]),
      ['count',row.count],
      ['withAssunto',row.withAssunto],
      ['withSubassunto',row.withSubassunto],
      ['sampleIds',row.sampleIds]
    ]))
    .sort((a,b)=>b.count-a.count||fields.map(field=>String(a[field]).localeCompare(String(b[field]),'pt-BR')).find(value=>value!==0)||0)
    .slice(0,limit);
}

const missingDimensions={
  concurso:backlog.filter(q=>!text(q.concurso)).length,
  edital:backlog.filter(q=>!text(q.edital)).length,
  topicoEdital:backlog.filter(q=>!text(q.topicoEdital)).length,
  assunto:backlog.filter(q=>!text(q.assunto)).length,
  subassunto:backlog.filter(q=>!text(q.subassunto)).length
};
const readyForVerticalization=backlog.filter(q=>text(q.disciplina)&&text(q.cargo)&&text(q.assunto)).length;
const needsBasicTaxonomy=backlog.length-readyForVerticalization;

const report={
  schemaVersion:1,
  generatedAt:metadata.generatedAt||null,
  releaseSnapshotId:metadata.releaseSnapshotId||null,
  scope:'published-questions-without-complete-canonical-link',
  definition:'Questões publicadas em que Concurso, Edital e Tópico do edital não estão simultaneamente preenchidos.',
  totals:{
    published:questions.length,
    canonicalMapped:mapped,
    backlog:backlog.length,
    coveragePercent:questions.length?Number((mapped/questions.length*100).toFixed(2)):0,
    readyForVerticalization,
    needsBasicTaxonomy
  },
  missingDimensions,
  priority:{
    byOrgao:aggregate(backlog,['orgao'],{limit:100}),
    byCargo:aggregate(backlog,['cargo'],{limit:150}),
    byDisciplina:aggregate(backlog,['disciplina'],{limit:150}),
    byAssunto:aggregate(backlog,['disciplina','assunto'],{limit:250}),
    groups:aggregate(backlog,['orgao','cargo','disciplina','assunto'],{limit:300})
  }
};

await fs.writeFile('data/taxonomy-backlog.json',JSON.stringify(report,null,2)+'\n');
console.log(`Backlog canônico: ${report.totals.backlog}/${report.totals.published} questões; ${report.totals.readyForVerticalization} já têm cargo, disciplina e assunto.`);
