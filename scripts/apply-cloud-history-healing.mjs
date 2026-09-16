import fs from 'node:fs/promises';

function replaceOnce(source,from,to,label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: esperado 1 trecho, encontrado ${count}.`);
  return source.replace(from,to);
}

let cloud=await fs.readFile('assets/cloud-progress.js','utf8');
let checks=await fs.readFile('scripts/check-regressions.mjs','utf8');
let sw=await fs.readFile('service-worker.js','utf8');

cloud=replaceOnce(
  cloud,
  `function iso(value){\n  const date=new Date(Number(value)||Date.now());\n  return Number.isNaN(date.getTime())?new Date().toISOString():date.toISOString();\n}`,
  `function iso(value){\n  const numeric=Number(value);\n  if(!Number.isFinite(numeric)||numeric<=0)return null;\n  const date=new Date(numeric);\n  return Number.isNaN(date.getTime())?null:date.toISOString();\n}`,
  'timestamp sem relógio inventado'
);

cloud=replaceOnce(
  cloud,
  `    await ensureProfile();\n    const sessionRows=normalized.map(record=>({`,
  `    await ensureProfile();\n    // A camada relacional só recebe conclusões com relógio real; o CAS JSON preserva legado sem inventar data.\n    const relational=normalized.filter(record=>{\n      const finishedAt=Number(record?.finishedAt);\n      return Number.isFinite(finishedAt)&&finishedAt>0;\n    });\n    const sessionRows=relational.map(record=>({`,
  'filtragem de histórico temporalmente válido'
);

cloud=replaceOnce(
  cloud,
  `      started_at:iso(record.startedAt),\n      ended_at:iso(record.finishedAt),`,
  `      started_at:iso(record.startedAt)||iso(record.finishedAt),\n      ended_at:iso(record.finishedAt),`,
  'fallback de started_at para conclusão real'
);

cloud=replaceOnce(
  cloud,
  `    const attemptRows=normalized.flatMap(record=>record.answers.map(answer=>({`,
  `    const attemptRows=relational.flatMap(record=>record.answers.map(answer=>({`,
  'tentativas apenas de conclusões com timestamp válido'
);

const oldMerge=`function mergeCanonicalAnswers(canonicalAnswers,fallbackAnswers){\n  const fallbackByQuestion=new Map((Array.isArray(fallbackAnswers)?fallbackAnswers:[]).map(answer=>[String(answer?.questionId||''),answer]));\n  const metadataKeys=['correctAnswer','concurso','disciplina','assunto','subassunto','questionVersion','questionHash','releaseSnapshotId','sourceSnapshot'];\n  return (Array.isArray(canonicalAnswers)?canonicalAnswers:[]).map(answer=>{\n    const fallback=fallbackByQuestion.get(String(answer?.questionId||''));\n    if(!fallback)return answer;\n    const merged={...fallback,...answer};\n    metadataKeys.forEach(key=>{if((answer?.[key]===undefined||answer?.[key]===null||answer?.[key]==='')&&fallback?.[key]!==undefined&&fallback?.[key]!==null&&fallback?.[key]!=='')merged[key]=fallback[key];});\n    return merged;\n  });\n}`;
const newMerge=`function mergeCanonicalAnswers(canonicalAnswers,fallbackAnswers){\n  const canonicalList=Array.isArray(canonicalAnswers)?canonicalAnswers:[];\n  const fallbackList=Array.isArray(fallbackAnswers)?fallbackAnswers:[];\n  const fallbackByQuestion=new Map(fallbackList.map(answer=>[String(answer?.questionId||''),answer]));\n  const metadataKeys=['correctAnswer','concurso','disciplina','assunto','subassunto','questionVersion','questionHash','releaseSnapshotId','sourceSnapshot'];\n  const canonicalIds=new Set(canonicalList.map(answer=>String(answer?.questionId||'')).filter(Boolean));\n  const mergedCanonical=canonicalList.map(answer=>{\n    const fallback=fallbackByQuestion.get(String(answer?.questionId||''));\n    if(!fallback)return answer;\n    const merged={...fallback,...answer};\n    metadataKeys.forEach(key=>{if((answer?.[key]===undefined||answer?.[key]===null||answer?.[key]==='')&&fallback?.[key]!==undefined&&fallback?.[key]!==null&&fallback?.[key]!=='')merged[key]=fallback[key];});\n    return merged;\n  });\n  // Se um upload em lotes falhar no meio, a cópia completa posterior cura apenas questionIds ausentes.\n  const missingFallback=fallbackList.filter(answer=>{\n    const id=String(answer?.questionId||'');\n    if(!id||canonicalIds.has(id))return false;\n    canonicalIds.add(id);\n    return true;\n  });\n  return [...mergedCanonical,...missingFallback];\n}`;
cloud=replaceOnce(cloud,oldMerge,newMerge,'cura de respostas ausentes em lote parcial');

const temporalAnchor=`if(cloud.includes(\"row.ended_at?new Date(row.ended_at).getTime():Date.now()\"))throw new Error('Histórico cloud voltou a inventar finishedAt com Date.now().');`;
checks=replaceOnce(
  checks,
  temporalAnchor,
  `${temporalAnchor}\nif(cloud.includes('Number(value)||Date.now()'))throw new Error('Upload relacional voltou a inventar timestamp atual para histórico legado.');\nfor(const marker of [\n  'const relational=normalized.filter(record=>{',\n  'return Number.isFinite(finishedAt)&&finishedAt>0;',\n  'const sessionRows=relational.map(record=>({',\n  'started_at:iso(record.startedAt)||iso(record.finishedAt)',\n  'const attemptRows=relational.flatMap(record=>record.answers.map(answer=>({'\n]) requireMarker(cloud,marker,'Proteção temporal do upload relacional ausente');`,
  'gate de timestamp legado'
);

const historyAnchor=`if(cloud.includes(\"resolution=merge-duplicates\"))throw new Error('Sessão concluída voltou a poder ser sobrescrita na nuvem.');`;
checks=replaceOnce(
  checks,
  historyAnchor,
  `${historyAnchor}\nfor(const marker of [\n  'const canonicalIds=new Set(canonicalList.map',\n  'const missingFallback=fallbackList.filter',\n  'canonicalIds.add(id);',\n  'return [...mergedCanonical,...missingFallback];',\n  'a cópia completa posterior cura apenas questionIds ausentes'\n]) requireMarker(cloud,marker,'Cura de upload parcial multi-lote ausente');`,
  'gate de cura multi-lote'
);

checks=replaceOnce(
  checks,
  `if(cacheVersion<65)throw new Error('Cache PWA regrediu para uma versão anterior à proteção contra sessões órfãs.');`,
  `if(cacheVersion<67)throw new Error('Cache PWA regrediu para uma versão anterior à cura do histórico cloud.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v66';","const CACHE_PREFIX='plataforma-questoes-v67';",'cache PWA');

await fs.writeFile('assets/cloud-progress.js',cloud);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Histórico cloud protegido contra timestamps inventados e uploads multi-lote parciais.');
