import fs from 'node:fs/promises';

function replaceOnce(source,from,to,label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: esperado 1 trecho, encontrado ${count}.`);
  return source.replace(from,to);
}

let app=await fs.readFile('assets/app.js','utf8');
let checks=await fs.readFile('scripts/check-regressions.mjs','utf8');
let sw=await fs.readFile('service-worker.js','utf8');

app=replaceOnce(
  app,
  `function entryTime(value){\n  if(!value||typeof value!=='object')return 0;\n  return Math.max(Number(value.updatedAt)||0,Number(value.lastSavedAt)||0,Number(value.lastError)||0,Number(value.lastCorrect)||0,Number(value.at)||0,Number(value.dueAt)||0,Number(value.removedAt)||0);\n}\nfunction mergeProgressMap(localValue,remoteValue){`,
  `function entryTime(value){\n  if(!value||typeof value!=='object')return 0;\n  const explicit=Math.max(Number(value.updatedAt)||0,Number(value.lastSavedAt)||0,Number(value.lastError)||0,Number(value.lastCorrect)||0,Number(value.at)||0,Number(value.removedAt)||0);\n  return explicit||Number(value.dueAt)||0;\n}\nfunction reviewEntryTime(value,error){\n  if(!value||typeof value!=='object')return 0;\n  const explicit=Math.max(Number(value.updatedAt)||0,Number(value.lastSavedAt)||0,Number(value.lastError)||0,Number(value.lastCorrect)||0,Number(value.at)||0,Number(value.removedAt)||0);\n  if(explicit)return explicit;\n  const dueAt=Number(value.dueAt)||0,stage=String(value.stage||'');\n  if(stage==='Dominada')return Number(error?.lastCorrect)||0;\n  if(stage==='D20')return Math.max(0,dueAt-20*864e5);\n  if(stage==='D7')return Math.max(0,dueAt-7*864e5);\n  return dueAt;\n}\nfunction mergeProgressMap(localValue,remoteValue){`,
  'relógio de conflito'
);
app=replaceOnce(
  app,
  `function mergeProgressState(local,remote){\n  const left=local&&typeof local==='object'?local:{},right=remote&&typeof remote==='object'?remote:{};\n  const merged={...left,version:Math.max(Number(left.version)||1,Number(right.version)||1),history:cloudProgress.mergeHistory(left.history,right.history),marked:mergeProgressMap(left.marked,right.marked),errors:mergeProgressMap(left.errors,right.errors),reviews:mergeProgressMap(left.reviews,right.reviews),notes:mergeProgressMap(left.notes,right.notes)};`,
  `function mergeReviewMap(localValue,remoteValue,errors){\n  const local=localValue&&typeof localValue==='object'&&!Array.isArray(localValue)?localValue:{};\n  const remote=remoteValue&&typeof remoteValue==='object'&&!Array.isArray(remoteValue)?remoteValue:{};\n  const merged={...local};\n  for(const id of Object.keys(remote)){\n    if(!Object.prototype.hasOwnProperty.call(local,id)){merged[id]=remote[id];continue;}\n    merged[id]=reviewEntryTime(local[id],errors?.[id])>=reviewEntryTime(remote[id],errors?.[id])?local[id]:remote[id];\n  }\n  return merged;\n}\nfunction mergeProgressState(local,remote){\n  const left=local&&typeof local==='object'?local:{},right=remote&&typeof remote==='object'?remote:{};\n  const mergedErrors=mergeProgressMap(left.errors,right.errors);\n  const mergedReviews=mergeReviewMap(left.reviews,right.reviews,mergedErrors);\n  const merged={...left,version:Math.max(Number(left.version)||1,Number(right.version)||1),history:cloudProgress.mergeHistory(left.history,right.history),marked:mergeProgressMap(left.marked,right.marked),errors:mergedErrors,reviews:mergedReviews,notes:mergeProgressMap(left.notes,right.notes)};`,
  'merge especializado de revisões'
);
app=replaceOnce(
  app,
  `        if(r){r.stage=r.stage==='D0'?'D7':r.stage==='D7'?'D20':'Dominada';r.dueAt=r.stage==='D7'?finishedAt+7*864e5:r.stage==='D20'?finishedAt+20*864e5:null;}`,
  `        if(r){r.stage=r.stage==='D0'?'D7':r.stage==='D7'?'D20':'Dominada';r.dueAt=r.stage==='D7'?finishedAt+7*864e5:r.stage==='D20'?finishedAt+20*864e5:null;r.updatedAt=finishedAt;}`,
  'timestamp de avanço da revisão'
);
app=replaceOnce(
  app,
  `        p.reviews[a.questionId]={stage:'D0',dueAt:finishedAt};`,
  `        p.reviews[a.questionId]={stage:'D0',dueAt:finishedAt,updatedAt:finishedAt};`,
  'timestamp de erro/reinício da revisão'
);

const insertAfter=`if(app.includes("authenticated:'Sincronizado'"))throw new Error('Conta autenticada não pode ser apresentada como sincronizada sem confirmação de gravação.');`;
checks=replaceOnce(
  checks,
  insertAfter,
  `${insertAfter}\n\n// Revisões multiaparelho: dueAt é agenda, não timestamp de conflito.\nfor(const marker of [\n  'function reviewEntryTime(value,error)',\n  "if(stage==='Dominada')return Number(error?.lastCorrect)||0",\n  "if(stage==='D20')return Math.max(0,dueAt-20*864e5)",\n  "if(stage==='D7')return Math.max(0,dueAt-7*864e5)",\n  'function mergeReviewMap(localValue,remoteValue,errors)',\n  'const mergedErrors=mergeProgressMap(left.errors,right.errors)',\n  'const mergedReviews=mergeReviewMap(left.reviews,right.reviews,mergedErrors)',\n  'r.updatedAt=finishedAt',\n  "p.reviews[a.questionId]={stage:'D0',dueAt:finishedAt,updatedAt:finishedAt}"\n]) requireMarker(app,marker,'Contrato de sincronização D0/D7/D20 ausente');\nif(app.includes('Number(value.dueAt)||0,Number(value.removedAt)||0'))throw new Error('dueAt voltou a ser tratado como timestamp principal de conflito.');`
  ,'proteção de revisão multiaparelho'
);
checks=replaceOnce(
  checks,
  `if(cacheVersion<41)throw new Error('Cache PWA regrediu para uma versão anterior ao status explícito da nuvem.');`,
  `if(cacheVersion<43)throw new Error('Cache PWA regrediu para uma versão anterior à correção de merge D0/D7/D20.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v42';","const CACHE_PREFIX='plataforma-questoes-v43';",'cache PWA');

await fs.writeFile('assets/app.js',app);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Merge de revisões corrigido com timestamps reais e compatibilidade com registros legados.');
