import fs from 'node:fs/promises';

function replaceOnce(source, from, to, label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: esperado 1 trecho, encontrado ${count}.`);
  return source.replace(from,to);
}

let app=await fs.readFile('assets/app.js','utf8');
let ux=await fs.readFile('assets/ux-enhancements.js','utf8');

if(app.includes("competitionScope: '',")&&ux.includes('function currentCompetitionScope()')){
  console.log('Escopo de trilha já aplicado.');
  process.exit(0);
}

app=replaceOnce(
  app,
  "  installPrompt: null, swRegistration: null, editalQuery: '', filtersOpen: false,\n",
  "  installPrompt: null, swRegistration: null, editalQuery: '', filtersOpen: false, competitionScope: '',\n",
  'estado da aplicação'
);
app=replaceOnce(
  app,
  "const FILTER_LABELS = {concurso:'Concurso',orgao:'Órgão',cargo:'Cargo',banca:'Banca',ano:'Ano',disciplina:'Disciplina',assunto:'Assunto',subassunto:'Subassunto',formato:'Formato',text:'Texto'};",
  "const FILTER_LABELS = {trilha:'Trilha',concurso:'Concurso',orgao:'Órgão',cargo:'Cargo',banca:'Banca',ano:'Ano',disciplina:'Disciplina',assunto:'Assunto',subassunto:'Subassunto',formato:'Formato',text:'Texto'};",
  'rótulos dos filtros'
);
app=replaceOnce(
  app,
  `function questionBelongsTo(q,competitionId){\n  const hay=[q.concurso,q.orgao,q.cargo,q.nomeMaterial].filter(Boolean).join(' ');\n  if(competitionId==='seedf') return /SEEDF/i.test(hay);\n  if(competitionId==='tjdft') return /TJDFT|Tribunal de Justiça do Distrito Federal/i.test(hay);\n  if(competitionId==='sedes-df-2026') return /SEDES/i.test(hay);\n  return false;\n}\n`,
  `function questionBelongsTo(q,competitionId){\n  const hay=[q.concurso,q.orgao,q.cargo,q.nomeMaterial].filter(Boolean).join(' ');\n  if(competitionId==='seedf') return /SEEDF/i.test(hay);\n  if(competitionId==='tjdft') return /TJDFT|Tribunal de Justiça do Distrito Federal/i.test(hay);\n  if(competitionId==='sedes-df-2026') return /SEDES/i.test(hay);\n  return false;\n}\nfunction competitionLabel(competitionId){\n  return ({seedf:'SEEDF',tjdft:'TJDFT','sedes-df-2026':'SEDES/DF 2026'})[competitionId]||String(competitionId||'');\n}\nfunction setCompetitionScope(competitionId=''){\n  const next=['seedf','tjdft','sedes-df-2026'].includes(competitionId)?competitionId:'';\n  if(state.competitionScope===next)return;\n  state.competitionScope=next;\n  if(next)document.documentElement.dataset.competitionScope=next;else delete document.documentElement.dataset.competitionScope;\n  window.dispatchEvent(new CustomEvent('competition-scope:changed',{detail:{competitionId:next}}));\n}\n`,
  'helpers de trilha'
);
app=replaceOnce(
  app,
  `      const key=removeFilter.dataset.removeFilter,id=FILTER_TO_ELEMENT[key],element=id?$('#'+id):null;\n      if(element)element.value='';\n      if(key==='text')$('#globalSearch').value='';\n      applyFilters();return;`,
  `      const key=removeFilter.dataset.removeFilter,id=FILTER_TO_ELEMENT[key],element=id?$('#'+id):null;\n      if(element)element.value='';\n      if(key==='text')$('#globalSearch').value='';\n      if(key==='trilha')setCompetitionScope('');\n      applyFilters();return;`,
  'remoção do filtro de trilha'
);
app=replaceOnce(
  app,
  `function resetQuestionFilters(){\n  ['filterConcurso','filterOrgao','filterCargo','filterBanca','filterAno','filterDisciplina','filterAssunto','filterSubassunto','filterFormato'].forEach(id=>{const el=$('#'+id);if(el)el.value='';});\n  $('#filterText').value=''; $('#globalSearch').value='';\n}`,
  `function resetQuestionFilters(){\n  ['filterConcurso','filterOrgao','filterCargo','filterBanca','filterAno','filterDisciplina','filterAssunto','filterSubassunto','filterFormato'].forEach(id=>{const el=$('#'+id);if(el)el.value='';});\n  $('#filterText').value=''; $('#globalSearch').value=''; setCompetitionScope('');\n}`,
  'limpeza dos filtros'
);
app=replaceOnce(
  app,
  `function openCompetition(competitionId){\n  const sample=state.questions.find(q=>questionBelongsTo(q,competitionId));\n  navigate('questions'); resetQuestionFilters();\n  if(sample) setQuestionFilter('filterOrgao',sample.orgao);\n  applyFilters();\n  toast(sample?fmt(state.filtered.length)+' questões nesta trilha.':'Ainda não há questões publicadas nesta trilha.');\n}`,
  `function openCompetition(competitionId){\n  const hasQuestions=state.questions.some(q=>questionBelongsTo(q,competitionId));\n  navigate('questions'); resetQuestionFilters(); setCompetitionScope(competitionId);\n  applyFilters();\n  toast(hasQuestions?fmt(state.filtered.length)+' questões na trilha '+competitionLabel(competitionId)+'.':'Ainda não há questões publicadas nesta trilha.');\n}`,
  'abertura da trilha'
);
app=replaceOnce(
  app,
  `function applyFilters(){\n  const f={concurso:$('#filterConcurso').value,orgao:$('#filterOrgao').value,cargo:$('#filterCargo').value,banca:$('#filterBanca').value,ano:$('#filterAno').value,disciplina:$('#filterDisciplina').value,assunto:$('#filterAssunto').value,subassunto:$('#filterSubassunto').value,formato:$('#filterFormato').value,text:$('#filterText').value.trim().toLowerCase()};\n  state.filtered=state.questions.filter(q=>{\n    if(f.concurso && q.concurso!==f.concurso) return false;`,
  `function applyFilters(){\n  const f={trilha:state.competitionScope?competitionLabel(state.competitionScope):'',concurso:$('#filterConcurso').value,orgao:$('#filterOrgao').value,cargo:$('#filterCargo').value,banca:$('#filterBanca').value,ano:$('#filterAno').value,disciplina:$('#filterDisciplina').value,assunto:$('#filterAssunto').value,subassunto:$('#filterSubassunto').value,formato:$('#filterFormato').value,text:$('#filterText').value.trim().toLowerCase()};\n  state.filtered=state.questions.filter(q=>{\n    if(state.competitionScope&&!questionBelongsTo(q,state.competitionScope)) return false;\n    if(f.concurso && q.concurso!==f.concurso) return false;`,
  'aplicação do escopo de trilha'
);

ux=replaceOnce(
  ux,
  `    formato:String(question.formato||''),\n    search:[question.enunciado,question.concurso,question.edital,question.topicoEdital,question.disciplina,question.assunto,question.subassunto,question.cargo,question.banca,question.nomeMaterial].join(' ').toLowerCase()`,
  `    formato:String(question.formato||''),\n    trailHay:normalize([question.concurso,question.orgao,question.cargo,question.nomeMaterial].join(' ')),\n    search:[question.enunciado,question.concurso,question.edital,question.topicoEdital,question.disciplina,question.assunto,question.subassunto,question.cargo,question.banca,question.nomeMaterial].join(' ').toLowerCase()`,
  'dados facetados da trilha'
);
ux=replaceOnce(
  ux,
  `function facetSelections(){\n  const selections={text:String(document.querySelector('#filterText')?.value||'').trim().toLowerCase()};\n  FACET_CONFIG.forEach(config=>{selections[config.key]=String(document.querySelector('#'+config.id)?.value||'');});\n  return selections;\n}\nfunction facetMatches(row,selections,exceptKey=''){\n  for(const config of FACET_CONFIG){`,
  `function facetSelections(){\n  const selections={text:String(document.querySelector('#filterText')?.value||'').trim().toLowerCase()};\n  FACET_CONFIG.forEach(config=>{selections[config.key]=String(document.querySelector('#'+config.id)?.value||'');});\n  return selections;\n}\nfunction currentCompetitionScope(){return String(document.documentElement.dataset.competitionScope||'');}\nfunction facetBelongsToScope(row,scope){\n  if(!scope)return true;\n  if(scope==='seedf')return /seedf/i.test(row.trailHay);\n  if(scope==='tjdft')return /tjdft|tribunal de justica do distrito federal/i.test(row.trailHay);\n  if(scope==='sedes-df-2026')return /sedes/i.test(row.trailHay);\n  return true;\n}\nfunction facetMatches(row,selections,exceptKey=''){\n  if(!facetBelongsToScope(row,currentCompetitionScope()))return false;\n  for(const config of FACET_CONFIG){`,
  'facetas por trilha'
);
ux=replaceOnce(
  ux,
  `  const status=document.querySelector('#facetStatus');\n  if(status)status.innerHTML=\`<strong>Filtros combinados</strong><span>\${facetRows.length.toLocaleString('pt-BR')} questões indexadas · opções incompatíveis ficam ocultas.</span>\`;`,
  `  const status=document.querySelector('#facetStatus');\n  if(status){\n    const scope=currentCompetitionScope();\n    const scopedCount=scope?facetRows.filter(row=>facetBelongsToScope(row,scope)).length:facetRows.length;\n    const scopeLabel=scope?({seedf:'SEEDF',tjdft:'TJDFT','sedes-df-2026':'SEDES/DF 2026'}[scope]||scope):'';\n    status.innerHTML=\`<strong>Filtros combinados\${scopeLabel?' · '+escapeHtml(scopeLabel):''}</strong><span>\${scopedCount.toLocaleString('pt-BR')} questões no recorte · opções incompatíveis ficam ocultas.</span>\`;\n  }`,
  'status das facetas'
);
ux=replaceOnce(
  ux,
  `  document.addEventListener('input',event=>{\n    if(event.target?.id==='filterText'||event.target?.id==='globalSearch')scheduleFacetRender(90);\n  });`,
  `  document.addEventListener('input',event=>{\n    if(event.target?.id==='filterText'||event.target?.id==='globalSearch')scheduleFacetRender(90);\n  });\n  window.addEventListener('competition-scope:changed',()=>scheduleFacetRender(0));`,
  'sincronização das facetas com a trilha'
);
ux=replaceOnce(
  ux,
  `function openTopicFromPerformance(discipline,topic){\n  document.querySelector('[data-go="questions"]')?.click();\n  setTimeout(()=>{\n    chooseOption(document.querySelector('#filterDisciplina'),discipline);`,
  `function openTopicFromPerformance(discipline,topic){\n  document.querySelector('[data-go="questions"]')?.click();\n  setTimeout(()=>{\n    document.querySelector('#clearFilters')?.click();\n    chooseOption(document.querySelector('#filterDisciplina'),discipline);`,
  'atalho de desempenho sem filtro residual'
);

await fs.writeFile('assets/app.js',app);
await fs.writeFile('assets/ux-enhancements.js',ux);
console.log('Escopo de trilha aplicado ao núcleo e às facetas.');
