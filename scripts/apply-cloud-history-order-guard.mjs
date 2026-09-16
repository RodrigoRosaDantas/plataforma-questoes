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
  `const sessions=await fetchRows('/rest/v1/study_sessions?select=activity_id,started_at,ended_at,duration_ms&activity_type=eq.question_set&activity_id=not.is.null&order=ended_at.desc');\n  const attempts=await fetchRows('/rest/v1/question_attempts?select=question_set_id,question_id,answer,is_correct,duration_ms,answered_at,client_event_id&question_set_id=not.is.null&order=answered_at.asc');`,
  `const sessions=await fetchRows('/rest/v1/study_sessions?select=activity_id,started_at,ended_at,duration_ms&activity_type=eq.question_set&activity_id=not.is.null&order=ended_at.desc,activity_id.asc');\n  const attempts=await fetchRows('/rest/v1/question_attempts?select=question_set_id,question_id,answer,is_correct,duration_ms,answered_at,client_event_id&question_set_id=not.is.null&order=answered_at.asc,question_set_id.asc,question_id.asc');`,
  'ordenação total da paginação'
);

cloud=replaceOnce(
  cloud,
  `  const answerMap=new Map();\n  const seenAttempts=new Set();`,
  `  const answerMap=new Map();\n  const attemptTimeMap=new Map();\n  const seenAttempts=new Set();`,
  'mapa temporal das tentativas'
);

cloud=replaceOnce(
  cloud,
  `    if(!answerMap.has(key))answerMap.set(key,[]);\n    answerMap.get(key).push({`,
  `    if(!answerMap.has(key))answerMap.set(key,[]);\n    const answeredAt=row.answered_at?new Date(row.answered_at).getTime():0;\n    if(Number.isFinite(answeredAt)&&answeredAt>0)attemptTimeMap.set(key,Math.max(Number(attemptTimeMap.get(key))||0,answeredAt));\n    answerMap.get(key).push({`,
  'captura do answered_at real'
);

cloud=replaceOnce(
  cloud,
  `    const finishedAt=row.ended_at?new Date(row.ended_at).getTime():Date.now();\n    const startedAt=row.started_at?new Date(row.started_at).getTime():finishedAt;\n    const elapsedMs=Number(row.duration_ms)||answers.reduce((sum,answer)=>sum+answer.time*1000,0);\n    return {id,finishedAt,startedAt,mode:'training',total:answers.length,correct,wrong,blank,elapsedMs,answers,source:'supabase'};`,
  `    const endedAt=row.ended_at?new Date(row.ended_at).getTime():0;\n    const attemptFinishedAt=Number(attemptTimeMap.get(id))||0;\n    const finishedAt=Number.isFinite(endedAt)&&endedAt>0?endedAt:attemptFinishedAt;\n    const rawStartedAt=row.started_at?new Date(row.started_at).getTime():0;\n    const startedAt=Number.isFinite(rawStartedAt)&&rawStartedAt>0?rawStartedAt:finishedAt;\n    const elapsedMs=Number(row.duration_ms)||answers.reduce((sum,answer)=>sum+answer.time*1000,0);\n    return {id,finishedAt,startedAt,mode:'training',total:answers.length,correct,wrong,blank,elapsedMs,answers,source:'supabase'};`,
  'fallback temporal sem Date.now'
);

const anchor=`if(cloud.includes('async function fetchRows(path,maxPages=20)'))throw new Error('Paginação da nuvem regrediu para o teto silencioso de 20 mil registros.');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Histórico cloud: paginação precisa de ordem total e nunca pode inventar horário atual para dado legado.\nfor(const marker of [\n  'order=ended_at.desc,activity_id.asc',\n  'order=answered_at.asc,question_set_id.asc,question_id.asc',\n  'const attemptTimeMap=new Map()',\n  'attemptTimeMap.set(key,Math.max(Number(attemptTimeMap.get(key))||0,answeredAt))',\n  'const attemptFinishedAt=Number(attemptTimeMap.get(id))||0',\n  'const finishedAt=Number.isFinite(endedAt)&&endedAt>0?endedAt:attemptFinishedAt'\n]) requireMarker(cloud,marker,'Ordenação/fallback temporal confiável do histórico cloud ausente');\nif(cloud.includes(\"row.ended_at?new Date(row.ended_at).getTime():Date.now()\"))throw new Error('Histórico cloud voltou a inventar finishedAt com Date.now().');`,
  'gate de ordem e fallback temporal'
);

checks=replaceOnce(
  checks,
  `if(cacheVersion<61)throw new Error('Cache PWA regrediu para uma versão anterior à proteção contra truncamento da nuvem.');`,
  `if(cacheVersion<63)throw new Error('Cache PWA regrediu para uma versão anterior à ordenação estável do histórico cloud.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v62';","const CACHE_PREFIX='plataforma-questoes-v63';",'cache PWA');

await fs.writeFile('assets/cloud-progress.js',cloud);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Histórico cloud com ordenação total e fallback temporal baseado em answered_at.');
