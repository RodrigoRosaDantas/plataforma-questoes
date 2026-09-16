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
  `function mergeProgressState(local,remote){`,
  `function reconcileReviewsWithErrors(reviewValue,errorValue){\n  const reviews=reviewValue&&typeof reviewValue==='object'&&!Array.isArray(reviewValue)?reviewValue:{};\n  const errors=errorValue&&typeof errorValue==='object'&&!Array.isArray(errorValue)?errorValue:{};\n  const result={...reviews};\n  for(const [id,error] of Object.entries(errors)){\n    const lastError=Math.max(0,Number(error?.lastError)||0);\n    const lastCorrect=Math.max(0,Number(error?.lastCorrect)||0);\n    if(!lastError||lastError<=lastCorrect)continue;\n    const current=result[id];\n    if(!current||lastError>reviewEntryTime(current,error))result[id]={stage:'D0',dueAt:lastError,updatedAt:lastError};\n  }\n  return result;\n}\nfunction mergeProgressState(local,remote){`,
  'reconciliação entre erro ativo e revisão'
);

app=replaceOnce(
  app,
  `  const mergedErrors=rebuildErrorsFromHistory(mergedHistory,mergedErrorFallback);\n  const mergedReviews=mergeReviewMap(left.reviews,right.reviews,mergedErrors);\n  const merged={...left,version:Math.max(Number(left.version)||1,Number(right.version)||1),history:mergedHistory,marked:mergeProgressMap(left.marked,right.marked),errors:mergedErrors,reviews:mergedReviews,notes:mergeProgressMap(left.notes,right.notes)};`,
  `  const mergedErrors=rebuildErrorsFromHistory(mergedHistory,mergedErrorFallback);\n  const mergedReviewCandidates=mergeReviewMap(left.reviews,right.reviews,mergedErrors);\n  const mergedReviews=reconcileReviewsWithErrors(mergedReviewCandidates,mergedErrors);\n  const merged={...left,version:Math.max(Number(left.version)||1,Number(right.version)||1),history:mergedHistory,marked:mergeProgressMap(left.marked,right.marked),errors:mergedErrors,reviews:mergedReviews,notes:mergeProgressMap(left.notes,right.notes)};`,
  'uso da reconciliação no merge'
);

checks=replaceOnce(
  checks,
  `'const mergedReviews=mergeReviewMap(left.reviews,right.reviews,mergedErrors)'`,
  `'const mergedReviewCandidates=mergeReviewMap(left.reviews,right.reviews,mergedErrors)'`,
  'contrato D0/D7/D20 atualizado para candidatos'
);
const anchor=`]) requireMarker(app,marker,'Reconstrução confiável do caderno de erros ausente');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Revisões: erro ativo reconstruído pelo histórico deve prevalecer sobre estágio antigo.\nfor(const marker of [\n  'function reconcileReviewsWithErrors(reviewValue,errorValue)',\n  'if(!lastError||lastError<=lastCorrect)continue;',\n  \"if(!current||lastError>reviewEntryTime(current,error))result[id]={stage:'D0',dueAt:lastError,updatedAt:lastError}\",\n  'const mergedReviewCandidates=mergeReviewMap(left.reviews,right.reviews,mergedErrors)',\n  'const mergedReviews=reconcileReviewsWithErrors(mergedReviewCandidates,mergedErrors)'\n]) requireMarker(app,marker,'Reconciliação entre caderno de erros e D0/D7/D20 ausente');`,
  'proteção da reconciliação no CI'
);
checks=replaceOnce(
  checks,
  `if(cacheVersion<55)throw new Error('Cache PWA regrediu para uma versão anterior à reconstrução de erros pelo histórico.');`,
  `if(cacheVersion<57)throw new Error('Cache PWA regrediu para uma versão anterior à reconciliação entre erros e revisões.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v56';","const CACHE_PREFIX='plataforma-questoes-v57';",'cache PWA');

await fs.writeFile('assets/app.js',app);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Revisões reconciliadas com o último erro/acerto do histórico consolidado.');
