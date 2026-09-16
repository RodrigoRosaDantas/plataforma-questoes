import fs from 'node:fs/promises';

function replaceOnce(source,from,to,label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: esperado 1 trecho, encontrado ${count}.`);
  return source.replace(from,to);
}
function replaceCount(source,from,to,expected,label){
  const count=source.split(from).length-1;
  if(count!==expected)throw new Error(`${label}: esperado ${expected} trechos, encontrado ${count}.`);
  return source.split(from).join(to);
}

let app=await fs.readFile('assets/app.js','utf8');
let ux=await fs.readFile('assets/ux-enhancements.js','utf8');
let checks=await fs.readFile('scripts/check-regressions.mjs','utf8');
let sw=await fs.readFile('service-worker.js','utf8');

app=replaceCount(
  app,
  `populateFilters(); applyFilters(); renderAll();`,
  `populateFilters(); window.dispatchEvent(new CustomEvent('questions:loaded',{detail:{questions:q}})); applyFilters(); renderAll();`,
  2,
  'publicação do dataset carregado'
);

ux=replaceOnce(
  ux,
  `  return rows;\n}\nasync function readFacetDataset(force=false){\n  const canonical=new URL('./data/questions.json',location.href);`,
  `  return rows;\n}\nfunction acceptFacetQuestions(questions){\n  if(!Array.isArray(questions)||!questions.length)return false;\n  facetRows=compactFacetRows(questions);\n  if(document.querySelector('#facetStatus'))renderFacetOptions();\n  return true;\n}\nwindow.addEventListener('questions:loaded',event=>{acceptFacetQuestions(event.detail?.questions);});\nasync function readFacetDataset(force=false){\n  if(!force&&facetRows.length)return facetRows;\n  const canonical=new URL('./data/questions.json',location.href);`,
  'consumo em memória das questões'
);
ux=replaceOnce(
  ux,
  `async function reloadFacetDataset(){\n  const rows=await readFacetDataset(true);\n  if(!rows.length)return;\n  facetRows=rows;\n  renderFacetOptions();\n}`,
  `async function reloadFacetDataset(){\n  if(facetRows.length){renderFacetOptions();return;}\n  const rows=await readFacetDataset(false);\n  if(!rows.length)return;\n  facetRows=rows;\n  renderFacetOptions();\n}`,
  'refresh sem refetch duplicado'
);

const anchor=`if(app.includes('Number(value.dueAt)||0,Number(value.removedAt)||0'))throw new Error('dueAt voltou a ser tratado como timestamp principal de conflito.');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Facetas: reutilizam o questions.json já carregado pelo núcleo antes de recorrer ao fallback de rede/cache.\nfor(const marker of [\n  "window.dispatchEvent(new CustomEvent('questions:loaded',{detail:{questions:q}}))",\n  "window.addEventListener('questions:loaded',event=>{acceptFacetQuestions(event.detail?.questions);})",\n  'function acceptFacetQuestions(questions)',\n  'if(!force&&facetRows.length)return facetRows;',\n  'if(facetRows.length){renderFacetOptions();return;}'\n]) requireMarker(app.includes(marker)?app:ux,marker,'Contrato de reutilização em memória das facetas ausente');\nif(ux.includes('readFacetDataset(true)'))throw new Error('Facetas voltaram a forçar uma segunda leitura integral de questions.json.');`,
  'proteção de memória das facetas'
);
checks=replaceOnce(
  checks,
  `if(cacheVersion<43)throw new Error('Cache PWA regrediu para uma versão anterior à correção de merge D0/D7/D20.');`,
  `if(cacheVersion<45)throw new Error('Cache PWA regrediu para uma versão anterior à reutilização em memória das facetas.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v44';","const CACHE_PREFIX='plataforma-questoes-v45';",'cache PWA');

await fs.writeFile('assets/app.js',app);
await fs.writeFile('assets/ux-enhancements.js',ux);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Facetas passaram a reutilizar o dataset já carregado; segunda leitura integral ficou apenas como fallback.');
