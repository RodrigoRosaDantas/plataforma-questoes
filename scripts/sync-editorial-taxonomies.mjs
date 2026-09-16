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

function normalizeAxis(axis){
  const topic=String(axis.topic||'').trim();
  const subject=String(axis.subject||'').trim();
  if(!topic||!subject)throw new Error('Eixo canônico sem topic/subject.');
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
    sourceLastEditedAt:axis.sourceLastEditedAt||null
  };
}

function normalizeSnapshot(payload,source){
  const canonicalAxes=payload.axes.map(normalizeAxis);
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
    canonicalAxes
  };
}

const snapshots=[];
for(const source of sources)snapshots.push(normalizeSnapshot(await fetchJson(source),source));

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
  canonicalAxes:[]
};

const output=[...snapshots,historical];
await fs.writeFile('data/editais.json',JSON.stringify(output,null,2)+'\n');
console.log(`Taxonomias sincronizadas: ${snapshots.map(item=>`${item.competitionId}=${item.canonicalAxisCount}`).join(' · ')}.`);
