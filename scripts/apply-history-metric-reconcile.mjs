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
  `    const answers=mergeCanonicalAnswers(canonical.answers,fallback.answers);\n    merged.set(id,Object.assign({},fallback,canonical,{answers}));`,
  `    const answers=mergeCanonicalAnswers(canonical.answers,fallback.answers);\n    const correct=answers.filter(answer=>answer?.isCorrect===true).length;\n    const blank=answers.filter(answer=>answer?.blank===true).length;\n    const wrong=Math.max(0,answers.length-correct-blank);\n    // Métricas derivadas acompanham o array final, inclusive após cura de upload parcial.\n    merged.set(id,Object.assign({},fallback,canonical,{answers,total:answers.length,correct,wrong,blank}));`,
  'reconciliação das métricas após merge'
);

const anchor=`]) requireMarker(cloud,marker,'Cura de upload parcial multi-lote ausente');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\nfor(const marker of [\n  'const correct=answers.filter(answer=>answer?.isCorrect===true).length;',\n  'const blank=answers.filter(answer=>answer?.blank===true).length;',\n  'const wrong=Math.max(0,answers.length-correct-blank);',\n  'total:answers.length,correct,wrong,blank',\n  'Métricas derivadas acompanham o array final'\n]) requireMarker(cloud,marker,'Reconciliação das métricas do histórico após merge ausente');`,
  'gate das métricas pós-merge'
);

checks=replaceOnce(
  checks,
  `if(cacheVersion<67)throw new Error('Cache PWA regrediu para uma versão anterior à cura do histórico cloud.');`,
  `if(cacheVersion<69)throw new Error('Cache PWA regrediu para uma versão anterior à reconciliação das métricas cloud.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v68';","const CACHE_PREFIX='plataforma-questoes-v69';",'cache PWA');

await fs.writeFile('assets/cloud-progress.js',cloud);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Métricas de histórico reconciliadas com o array final de respostas.');
