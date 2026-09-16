import fs from 'node:fs/promises';

const sources=[
  {
    competitionId:'seedf',
    url:'https://raw.githubusercontent.com/RodrigoRosaDantas/seedf-ppge-dashboard/main/public/data/seedf-edital.json',
    repo:'RodrigoRosaDantas/seedf-ppge-dashboard'
  },
  {
    competitionId:'tjdft',
    url:'https://raw.githubusercontent.com/RodrigoRosaDantas/tjdft-dashboard/main/public/data/tjdft-edital.json',
    repo:'RodrigoRosaDantas/tjdft-dashboard'
  }
];

const normalize=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
function belongsToCompetition(question,competitionId){
  const hay=[question.concurso,question.orgao,question.cargo,question.nomeMaterial].filter(Boolean).join(' ');
  if(competitionId==='seedf')return /SEEDF|Secretaria de Estado de Educação do Distrito Federal/i.test(hay);
  if(competitionId==='tjdft')return /TJDFT|Tribunal de Justiça do Distrito Federal/i.test(hay);
  if(competitionId==='sedes-df-2026')return /SEDES/i.test(hay);
  return false;
}

async function fetchJson(source){
  const response=await fetch(source.url,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`${source.competitionId}: fonte editorial respondeu ${response.status}.`);
  const payload=await response.json();
  if(payload?.schemaVersion!==1)throw new Error(`${source.competitionId}: schema editorial incompatível.`);
  if(payload?.competitionId!==source.competitionId)throw new Error(`${source.competitionId}: competitionId divergente na fonte.`);
  if(!Array.isArray(payload.axes)||!payload.axes.length)throw new Error(`${source.competitionId}: fonte sem eixos editoriais.`);
  if(Number(payload.axisCount)!==payload.axes.length)throw new Error(`${source.competitionId}: axisCount não fecha com os eixos exportados.`);
  if(payload.editorialPolicy?.official!==false)throw new Error(`${source.competitionId}: fonte pré-edital deve declarar official=false.`);
  return payload;
}

function directCounts(questions,competitionId){
  const counts=new Map();
  for(const question of questions){
    if(!belongsToCompetition(question,competitionId))continue;
    const topic=normalize(question.topicoEdital);
    if(topic)counts.set(topic,(counts.get(topic)||0)+1);
  }
  return counts;
}
function topicMultiplicity(axes){
  const counts=new Map();
  for(const axis of axes){
    const topic=normalize(axis?.topic);
    if(topic)counts.set(topic,(counts.get(topic)||0)+1);
  }
  return counts;
}

function normalizeAxis(axis,counts,multiplicity){
  const topic=String(axis.topic||'').trim();
  const subject=String(axis.subject||'').trim();
  if(!topic||!subject)throw new Error('Eixo canônico sem topic/subject.');
  const topicKey=normalize(topic);
  const directLinkAmbiguous=(multiplicity.get(topicKey)||0)>1;
  return {
    id:String(axis.id||''),
    topic,
    subtopic:String(axis.subtopic||'').trim(),
    subject,
    cargos:Array.isArray(axis.cargos)?axis.cargos.map(value=>String(value||'').trim()).filter(Boolean):[],
    sourceBase:String(axis.sourceBase||'').trim(),
    layer:String(axis.layer||'').trim(),
    level:String(axis.level||'').trim(),
    sourceUrl:String(axis.sourceUrl||'').trim(),
    sourceLastEditedAt:axis.sourceLastEditedAt||null,
    directLinkAmbiguous,
    directQuestionCount:directLinkAmbiguous?0:(counts.get(topicKey)||0)
  };
}

function normalizeSnapshot(payload,source,questions){
  const counts=directCounts(questions,payload.competitionId);
  const multiplicity=topicMultiplicity(payload.axes);
  const canonicalAxes=payload.axes.map(axis=>normalizeAxis(axis,counts,multiplicity));
  const canonicalLinkedAxes=canonicalAxes.filter(axis=>axis.directQuestionCount>0).length;
  const canonicalDirectQuestions=canonicalAxes.reduce((sum,axis)=>sum+axis.directQuestionCount,0);
  const canonicalAmbiguousAxes=canonicalAxes.filter(axis=>axis.directLinkAmbiguous).length;
  return {
    competitionId:payload.competitionId,
    title:payload.competitionId==='seedf'?'SEEDF — edital verticalizado projetado':'TJDFT — edital verticalizado · base histórica 2022',
    status:'pré-edital',
    source:`${source.repo} · ${payload.title}`,
    sourceRepository:source.repo,
    sourceKind:String(payload.kind||''),
    sourceVersion:String(payload.version||''),
    sourceGeneratedAt:payload.generatedAt||null,
    sourcePageUrl:String(payload.source?.pageUrl||''),
    editorialPolicy:payload.editorialPolicy||{official:false,note:'Pré-edital.'},
    canonicalAxisCount:canonicalAxes.length,
    canonicalLinkedAxes,
    canonicalDirectQuestions,
    canonicalAmbiguousAxes,
    canonicalAxes
  };
}

const questions=JSON.parse(await fs.readFile('data/questions.json','utf8'));
if(!Array.isArray(questions))throw new Error('data/questions.json deve conter um array.');
const snapshots=[];
for(const source of sources)snapshots.push(normalizeSnapshot(await fetchJson(source),source,questions));

const historical={
  competitionId:'sedes-df-2026',
  title:'SEDES/DF 2026 — histórico',
  status:'histórico',
  source:'Banco Mestre · concurso realizado',
  sourceKind:'historical',
  sourceVersion:'2026',
  sourceGeneratedAt:null,
  sourcePageUrl:'',
  editorialPolicy:{official:true,note:'Concurso realizado; mantido somente como histórico e pós-prova.'},
  canonicalAxisCount:0,
  canonicalLinkedAxes:0,
  canonicalDirectQuestions:0,
  canonicalAmbiguousAxes:0,
  canonicalAxes:[]
};

const output=[...snapshots,historical];
await fs.writeFile('data/editais.json',JSON.stringify(output,null,2)+'\n');
console.log(`Taxonomias sincronizadas: ${snapshots.map(item=>`${item.competitionId}=${item.canonicalAxisCount} eixos/${item.canonicalDirectQuestions} vínculos/${item.canonicalAmbiguousAxes} ambíguos`).join(' · ')}.`);