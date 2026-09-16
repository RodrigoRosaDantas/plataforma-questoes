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
  `  $('#resultMetrics').innerHTML=[['Corretas',correct],['Erradas',wrong],['Em branco',blank],['Pontuação',\`${'${percent.toFixed(1)}'}%\`],['Precisão',\`${'${precision.toFixed(1)}'}%\`],['Tempo',clock(elapsed)],['Média/questão',clock(r.total?Math.round(elapsed/r.total):0)],['Total',r.total]].map(metricHtml).join('');\n  const by=aggregateBy(r.answers,'disciplina');\n  $('#resultBreakdown').innerHTML=Object.entries(by).map(([k,v])=>\`<article class="card"><h2>${'${escapeHtml(k||\'Sem disciplina\')}'}</h2><p>${'${v.correct}'}/${'${v.total}'} corretas · ${'${Math.round(v.correct/v.total*100)}'}%</p></article>\`).join('')||'<div class="card empty-state">Sem dados.</div>';`,
  `  $('#resultMetrics').innerHTML=[['Corretas',correct],['Erradas',rawWrong],['Em branco',blank],['Pontuação',\`${'${percent.toFixed(1)}'}%\`],['Precisão',\`${'${precision.toFixed(1)}'}%\`],['Tempo',clock(elapsed)],['Média/questão',clock(r.total?Math.round(elapsed/r.total):0)],['Total',r.total]].map(metricHtml).join('');\n  const by=aggregateBy(r.answers,'disciplina');\n  $('#resultBreakdown').innerHTML=Object.entries(by).map(([k,v])=>{const answered=Math.max(0,v.total-v.blank),percent=answered?Math.round(v.correct/answered*100):0;return \`<article class="card"><h2>${'${escapeHtml(k||\'Sem disciplina\')}'}</h2><p>${'${v.correct}'}/${'${answered}'} corretas · ${'${percent}'}%${'${v.blank?` · ${v.blank} em branco`:``}'}</p></article>\`;}).join('')||'<div class="card empty-state">Sem dados.</div>';`,
  'resultado por disciplina'
);
app=replaceOnce(
  app,
  `function renderPerformance(){\n  const history=store.load().history;`,
  `function recordPrecision(record){\n  const correct=Number(record?.correct)||0;\n  const rawWrong=Number.isFinite(record?.rawWrong)?Number(record.rawWrong):Number(record?.wrong)||0;\n  const answered=correct+rawWrong;\n  return answered?correct/answered*100:0;\n}\nfunction renderPerformance(){\n  const history=store.load().history;`,
  'helper de precisão histórica'
);
app=replaceOnce(
  app,
  `  const best=history.length?Math.max(...history.map(record=>{const answered=(record.correct||0)+(record.wrong||0);return answered?record.correct/answered*100:0;})):0;`,
  `  const best=history.length?Math.max(...history.map(recordPrecision)):0;`,
  'melhor sessão'
);
app=replaceOnce(
  app,
  `  const trend=sessions.map((record,index)=>{const answered=(record.correct||0)+(record.wrong||0);return {value:answered?record.correct/answered*100:0,label:new Date(record.finishedAt||Date.now()).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' · '+(index+1)};});`,
  `  const trend=sessions.map((record,index)=>({value:recordPrecision(record),label:new Date(record.finishedAt||Date.now()).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' · '+(index+1)}));`,
  'tendência por sessão'
);

const anchor=`if(ux.includes('readFacetDataset(true)'))throw new Error('Facetas voltaram a forçar uma segunda leitura integral de questions.json.');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Precisão: brancos não entram no denominador nem aparecem como erradas na leitura analítica.\nfor(const marker of [\n  "['Erradas',rawWrong]",\n  'const answered=Math.max(0,v.total-v.blank)',\n  'function recordPrecision(record)',\n  'const rawWrong=Number.isFinite(record?.rawWrong)?Number(record.rawWrong):Number(record?.wrong)||0',\n  'const best=history.length?Math.max(...history.map(recordPrecision)):0',\n  'value:recordPrecision(record)'\n]) requireMarker(app,marker,'Contrato de precisão sem brancos ausente');\nif(app.includes("['Erradas',wrong]"))throw new Error('Resultado voltou a misturar brancos com respostas erradas.');`,
  'proteção de precisão'
);
checks=replaceOnce(
  checks,
  `if(cacheVersion<45)throw new Error('Cache PWA regrediu para uma versão anterior à reutilização em memória das facetas.');`,
  `if(cacheVersion<47)throw new Error('Cache PWA regrediu para uma versão anterior à correção de precisão e brancos.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v46';","const CACHE_PREFIX='plataforma-questoes-v47';",'cache PWA');

await fs.writeFile('assets/app.js',app);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Precisão, erradas e brancos alinhados em resultado e desempenho histórico.');
