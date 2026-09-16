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
  `  const ids=new Set([...sessionMap.keys(),...answerMap.keys()]);`,
  `  // Uma sessão relacional sem tentativas indica upload parcial; não é uma conclusão canônica.\n  // Baterias concluídas, inclusive totalmente em branco, geram uma tentativa por questão.\n  const ids=new Set(answerMap.keys());`,
  'exclusão de sessões órfãs'
);

const anchor=`if(cloud.includes(\"row.ended_at?new Date(row.ended_at).getTime():Date.now()\"))throw new Error('Histórico cloud voltou a inventar finishedAt com Date.now().');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Upload parcial: study_session sem nenhuma tentativa não pode virar bateria concluída de 0 questões.\nfor(const marker of [\n  'const ids=new Set(answerMap.keys())',\n  'Uma sessão relacional sem tentativas indica upload parcial'\n]) requireMarker(cloud,marker,'Proteção contra sessão relacional órfã ausente');\nif(cloud.includes('const ids=new Set([...sessionMap.keys(),...answerMap.keys()])'))throw new Error('Sessão órfã voltou a ser reconstruída como histórico concluído.');`,
  'gate de sessão órfã'
);

checks=replaceOnce(
  checks,
  `if(cacheVersion<63)throw new Error('Cache PWA regrediu para uma versão anterior à ordenação estável do histórico cloud.');`,
  `if(cacheVersion<65)throw new Error('Cache PWA regrediu para uma versão anterior à proteção contra sessões órfãs.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v64';","const CACHE_PREFIX='plataforma-questoes-v65';",'cache PWA');

await fs.writeFile('assets/cloud-progress.js',cloud);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Sessões relacionais sem tentativas deixam de ser tratadas como baterias concluídas.');
