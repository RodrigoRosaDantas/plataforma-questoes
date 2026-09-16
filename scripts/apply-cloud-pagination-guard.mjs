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
  `async function fetchRows(path,maxPages=20){\n  const rows=[];\n  for(let page=0;page<maxPages;page++){\n    const data=await request(path+'&offset='+(page*1000)+'&limit=1000');\n    if(!Array.isArray(data)){if(page===0)return [];break;}\n    rows.push(...data);\n    if(data.length<1000)break;\n  }\n  return rows;\n}`,
  `const CLOUD_PAGE_SIZE=1000;\nconst CLOUD_MAX_PAGES=100;\nasync function fetchRows(path,maxPages=CLOUD_MAX_PAGES){\n  const rows=[];\n  const safePages=Math.max(1,Number(maxPages)||CLOUD_MAX_PAGES);\n  for(let page=0;page<safePages;page++){\n    const data=await request(path+'&offset='+(page*CLOUD_PAGE_SIZE)+'&limit='+CLOUD_PAGE_SIZE);\n    if(!Array.isArray(data)){\n      if(page===0)return [];\n      throw new Error('Resposta paginada inválida durante a leitura do histórico da nuvem.');\n    }\n    rows.push(...data);\n    if(data.length<CLOUD_PAGE_SIZE)return rows;\n    if(page===safePages-1)throw new Error('Histórico da nuvem excedeu o limite seguro de '+(safePages*CLOUD_PAGE_SIZE)+' registros. Sincronização interrompida para evitar truncamento.');\n  }\n  return rows;\n}`,
  'paginação segura do histórico'
);

const anchor=`if(cloud.includes("resolution=merge-duplicates"))throw new Error('Sessão concluída voltou a poder ser sobrescrita na nuvem.');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Paginação da nuvem: nunca aceitar histórico parcialmente carregado como se estivesse completo.\nfor(const marker of [\n  'const CLOUD_PAGE_SIZE=1000',\n  'const CLOUD_MAX_PAGES=100',\n  'async function fetchRows(path,maxPages=CLOUD_MAX_PAGES)',\n  \"if(data.length<CLOUD_PAGE_SIZE)return rows\",\n  \"if(page===safePages-1)throw new Error('Histórico da nuvem excedeu o limite seguro de '\"\n]) requireMarker(cloud,marker,'Proteção contra truncamento silencioso do histórico da nuvem ausente');\nif(cloud.includes('async function fetchRows(path,maxPages=20)'))throw new Error('Paginação da nuvem regrediu para o teto silencioso de 20 mil registros.');`,
  'gate de paginação no CI'
);

checks=replaceOnce(
  checks,
  `if(cacheVersion<59)throw new Error('Cache PWA regrediu para uma versão anterior à proteção dos intervalos D0/D7/D20.');`,
  `if(cacheVersion<61)throw new Error('Cache PWA regrediu para uma versão anterior à proteção contra truncamento da nuvem.');`,
  'versão mínima PWA'
);

sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v60';","const CACHE_PREFIX='plataforma-questoes-v61';",'cache PWA');

await fs.writeFile('assets/cloud-progress.js',cloud);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Paginação da nuvem protegida contra truncamento silencioso.');
