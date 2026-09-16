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
  `function finishSession(){`,
  `function advanceReviewIfDue(review,finishedAt){\n  if(!review||review.stage==='Dominada')return false;\n  const dueAt=Math.max(0,Number(review.dueAt)||0);\n  if(dueAt>finishedAt)return false;\n  review.stage=review.stage==='D0'?'D7':review.stage==='D7'?'D20':'Dominada';\n  review.dueAt=review.stage==='D7'?finishedAt+7*864e5:review.stage==='D20'?finishedAt+20*864e5:null;\n  review.updatedAt=finishedAt;\n  return true;\n}\nfunction finishSession(){`,
  'helper de avanço apenas quando vencido'
);

app=replaceOnce(
  app,
  `        const r=p.reviews[a.questionId];\n        if(r){r.stage=r.stage==='D0'?'D7':r.stage==='D7'?'D20':'Dominada';r.dueAt=r.stage==='D7'?finishedAt+7*864e5:r.stage==='D20'?finishedAt+20*864e5:null;r.updatedAt=finishedAt;}`,
  `        const r=p.reviews[a.questionId];\n        if(r)advanceReviewIfDue(r,finishedAt);`,
  'avanço de revisão no fechamento da bateria'
);

const anchor=`]) requireMarker(app,marker,'Reconciliação entre caderno de erros e D0/D7/D20 ausente');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// D0/D7/D20: acerto antecipado não pode encurtar o intervalo agendado.\nfor(const marker of [\n  'function advanceReviewIfDue(review,finishedAt)',\n  \"if(!review||review.stage==='Dominada')return false\",\n  'if(dueAt>finishedAt)return false;',\n  \"review.stage=review.stage==='D0'?'D7':review.stage==='D7'?'D20':'Dominada'\",\n  'if(r)advanceReviewIfDue(r,finishedAt)'\n]) requireMarker(app,marker,'Proteção dos intervalos D0/D7/D20 ausente');\nif(app.includes(\"if(r){r.stage=r.stage==='D0'?'D7'\"))throw new Error('Revisão voltou a avançar sem conferir o vencimento.');`,
  'proteção dos intervalos no CI'
);
checks=replaceOnce(
  checks,
  `if(cacheVersion<57)throw new Error('Cache PWA regrediu para uma versão anterior à reconciliação entre erros e revisões.');`,
  `if(cacheVersion<59)throw new Error('Cache PWA regrediu para uma versão anterior à proteção dos intervalos D0/D7/D20.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v58';","const CACHE_PREFIX='plataforma-questoes-v59';",'cache PWA');

await fs.writeFile('assets/app.js',app);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('D0/D7/D20 só avançam quando a revisão está vencida; acertos antecipados preservam dueAt.');
