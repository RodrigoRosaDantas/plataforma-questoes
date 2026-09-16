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
  `function mergeReviewMap(localValue,remoteValue,errors){`,
  `function rebuildErrorsFromHistory(history,fallbackValue){\n  const fallback=fallbackValue&&typeof fallbackValue==='object'&&!Array.isArray(fallbackValue)?fallbackValue:{};\n  const derived={};\n  for(const record of Array.isArray(history)?history:[]){\n    const finishedAt=Math.max(0,Number(record?.finishedAt)||0);\n    const seen=new Set();\n    for(const answer of Array.isArray(record?.answers)?record.answers:[]){\n      const id=String(answer?.questionId||'');\n      if(!id||seen.has(id))continue;\n      seen.add(id);\n      const answered=(answer?.given!==undefined&&answer?.given!==null&&answer?.given!=='')||answer?.blank===false;\n      const correct=answer?.isCorrect===true;\n      const item=derived[id]||(derived[id]={count:0,lastError:0,lastCorrect:0});\n      if(answered&&!correct){item.count+=1;item.lastError=Math.max(item.lastError,finishedAt);}\n      else if(correct)item.lastCorrect=Math.max(item.lastCorrect,finishedAt);\n    }\n  }\n  const result={};\n  for(const id of new Set([...Object.keys(fallback),...Object.keys(derived)])){\n    const legacy=fallback[id]&&typeof fallback[id]==='object'?fallback[id]:{};\n    const current=derived[id]||{};\n    const count=Math.max(Number(legacy.count)||0,Number(current.count)||0);\n    const lastError=Math.max(Number(legacy.lastError)||0,Number(current.lastError)||0);\n    const lastCorrect=Math.max(Number(legacy.lastCorrect)||0,Number(current.lastCorrect)||0);\n    if(count<=0&&lastError<=0)continue;\n    result[id]={...legacy,...current,count,lastError};\n    if(lastCorrect>0)result[id].lastCorrect=lastCorrect;\n    else delete result[id].lastCorrect;\n  }\n  return result;\n}\nfunction mergeReviewMap(localValue,remoteValue,errors){`,
  'reconstrução de erros pelo histórico'
);

app=replaceOnce(
  app,
  `function mergeProgressState(local,remote){\n  const left=local&&typeof local==='object'?local:{},right=remote&&typeof remote==='object'?remote:{};\n  const mergedErrors=mergeProgressMap(left.errors,right.errors);\n  const mergedReviews=mergeReviewMap(left.reviews,right.reviews,mergedErrors);\n  const merged={...left,version:Math.max(Number(left.version)||1,Number(right.version)||1),history:cloudProgress.mergeHistory(left.history,right.history),marked:mergeProgressMap(left.marked,right.marked),errors:mergedErrors,reviews:mergedReviews,notes:mergeProgressMap(left.notes,right.notes)};`,
  `function mergeProgressState(local,remote){\n  const left=local&&typeof local==='object'?local:{},right=remote&&typeof remote==='object'?remote:{};\n  const mergedHistory=cloudProgress.mergeHistory(left.history,right.history);\n  const mergedErrorFallback=mergeProgressMap(left.errors,right.errors);\n  const mergedErrors=rebuildErrorsFromHistory(mergedHistory,mergedErrorFallback);\n  const mergedReviews=mergeReviewMap(left.reviews,right.reviews,mergedErrors);\n  const merged={...left,version:Math.max(Number(left.version)||1,Number(right.version)||1),history:mergedHistory,marked:mergeProgressMap(left.marked,right.marked),errors:mergedErrors,reviews:mergedReviews,notes:mergeProgressMap(left.notes,right.notes)};`,
  'merge de erros derivado do histórico'
);

const anchor=`if(cloud.includes("resolution=merge-duplicates"))throw new Error('Sessão concluída voltou a poder ser sobrescrita na nuvem.');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Erros: contagem e relógios são reconstruídos do histórico idempotente após o merge.\nfor(const marker of [\n  'function rebuildErrorsFromHistory(history,fallbackValue)',\n  'const seen=new Set()',\n  'if(answered&&!correct){item.count+=1;item.lastError=Math.max(item.lastError,finishedAt);}',\n  'const count=Math.max(Number(legacy.count)||0,Number(current.count)||0)',\n  'const mergedHistory=cloudProgress.mergeHistory(left.history,right.history)',\n  'const mergedErrorFallback=mergeProgressMap(left.errors,right.errors)',\n  'const mergedErrors=rebuildErrorsFromHistory(mergedHistory,mergedErrorFallback)'\n]) requireMarker(app,marker,'Reconstrução confiável do caderno de erros ausente');`,
  'proteção de erros derivados no CI'
);
checks=replaceOnce(
  checks,
  `if(cacheVersion<53)throw new Error('Cache PWA regrediu para uma versão anterior à idempotência do histórico multiaparelho.');`,
  `if(cacheVersion<55)throw new Error('Cache PWA regrediu para uma versão anterior à reconstrução de erros pelo histórico.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v54';","const CACHE_PREFIX='plataforma-questoes-v55';",'cache PWA');

await fs.writeFile('assets/app.js',app);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Caderno de erros passou a reconstruir contagem e relógios a partir do histórico consolidado.');
