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
  `  const cutoff=Math.max(Number(left.activeSessionClearedAt)||0,Number(right.activeSessionClearedAt)||0);\n  const active=[left,right].filter(value=>value.activeSession&&typeof value.activeSession==='object').map(value=>value.activeSession).sort((a,b)=>entryTime(b)-entryTime(a))[0]||null;\n  merged.activeSession=active&&entryTime(active)>cutoff?active:null;\n  merged.activeSessionClearedAt=cutoff;`,
  `  const cutoff=Math.max(Number(left.activeSessionClearedAt)||0,Number(right.activeSessionClearedAt)||0);\n  const completedSessionIds=new Set((merged.history||[]).map(record=>String(record?.id||'')).filter(Boolean));\n  const active=[left,right].filter(value=>value.activeSession&&typeof value.activeSession==='object').map(value=>value.activeSession).sort((a,b)=>entryTime(b)-entryTime(a))[0]||null;\n  merged.activeSession=active&&entryTime(active)>cutoff&&!completedSessionIds.has(String(active.id||''))?active:null;\n  merged.activeSessionClearedAt=cutoff;`,
  'merge de sessão concluída'
);

app=replaceOnce(
  app,
  `    const active=finalState.activeSession;\n    if(active&&(!state.session||entryTime(active)>entryTime(state.session)))hydrateSession(active);\n    if(!options.silent)toast('Progresso sincronizado entre os aparelhos.');`,
  `    const active=finalState.activeSession;\n    const localSessionId=String(state.session?.id||'');\n    const completedRecord=localSessionId?(finalState.history||[]).find(record=>String(record?.id||'')===localSessionId):null;\n    if(completedRecord&&(!active||String(active.id||'')!==localSessionId)){\n      clearInterval(state.timer);state.timer=null;state.session=null;state.hiddenAt=null;\n      if(state.currentView==='resolver'){renderResult(completedRecord);navigate('result',{replace:true});}\n      toast('Esta bateria foi concluída em outro aparelho.');\n    }else if(active&&(!state.session||entryTime(active)>entryTime(state.session)))hydrateSession(active);\n    if(!options.silent)toast('Progresso sincronizado entre os aparelhos.');`,
  'encerramento local após conclusão remota'
);

app=replaceOnce(
  app,
  `function hydrateSession(saved){\n  if(!saved||!Array.isArray(saved.items)){ store.mutate(p=>p.activeSession=null); state.session=null; return; }\n  const items=saved.items.filter(id=>{const q=state.questions.find(item=>item.id===id);return q&&answerOptions(q).length;});`,
  `function hydrateSession(saved){\n  if(!saved||!Array.isArray(saved.items)){ store.mutate(p=>p.activeSession=null); state.session=null; return; }\n  const completed=store.load().history.find(record=>String(record?.id||'')===String(saved.id||''));\n  if(completed){\n    const finishedAt=Number(completed.finishedAt)||Date.now();\n    store.mutate(p=>{p.activeSession=null;p.activeSessionClearedAt=Math.max(Number(p.activeSessionClearedAt)||0,finishedAt);});\n    state.session=null;state.hiddenAt=null;return;\n  }\n  const items=saved.items.filter(id=>{const q=state.questions.find(item=>item.id===id);return q&&answerOptions(q).length;});`,
  'hidratação de sessão já concluída'
);

app=replaceOnce(
  app,
  `function finishSession(){\n  saveQuestionTime(); clearInterval(state.timer); const s=state.session; if(!s)return;\n  const policy=currentScoringPolicy(),finishedAt=Date.now();`,
  `function finishSession(){\n  const s=state.session;if(!s)return;\n  const existing=store.load().history.find(record=>String(record?.id||'')===String(s.id||''));\n  if(existing){\n    clearInterval(state.timer);state.timer=null;state.session=null;state.hiddenAt=null;\n    const finishedAt=Number(existing.finishedAt)||Date.now();\n    store.mutate(p=>{p.activeSession=null;p.activeSessionClearedAt=Math.max(Number(p.activeSessionClearedAt)||0,finishedAt);});\n    renderResult(existing);navigate('result',{replace:true});toast('Esta bateria já havia sido concluída em outro aparelho.');void syncCloudProgress({silent:true});return;\n  }\n  saveQuestionTime(); clearInterval(state.timer);\n  const policy=currentScoringPolicy(),finishedAt=Date.now();`,
  'bloqueio de dupla finalização'
);

const anchor=`]) requireMarker(casMigration,marker,'Contrato SQL de compare-and-swap ausente');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Sessões multiaparelho: uma bateria concluída nunca pode ressurgir como ativa.\nfor(const marker of [\n  'const completedSessionIds=new Set((merged.history||[]).map(record=>String(record?.id||\'\')).filter(Boolean))',\n  \"!completedSessionIds.has(String(active.id||''))\",\n  \"const completedRecord=localSessionId?(finalState.history||[]).find(record=>String(record?.id||'')===localSessionId):null\",\n  \"toast('Esta bateria foi concluída em outro aparelho.')\",\n  \"const completed=store.load().history.find(record=>String(record?.id||'')===String(saved.id||''))\",\n  \"const existing=store.load().history.find(record=>String(record?.id||'')===String(s.id||''))\",\n  \"toast('Esta bateria já havia sido concluída em outro aparelho.')\"\n]) requireMarker(app,marker,'Proteção contra sessão concluída ressurgir ausente');\nif(app.includes('merged.activeSession=active&&entryTime(active)>cutoff?active:null;'))throw new Error('Sessão concluída voltou a poder ser reativada pelo merge.');`,
  'proteção de sessão concluída no CI'
);

checks=replaceOnce(
  checks,
  `if(cacheVersion<49)throw new Error('Cache PWA regrediu para uma versão anterior ao compare-and-swap multiaparelho.');`,
  `if(cacheVersion<51)throw new Error('Cache PWA regrediu para uma versão anterior à proteção contra sessão concluída ressurgir.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v50';","const CACHE_PREFIX='plataforma-questoes-v51';",'cache PWA');

await fs.writeFile('assets/app.js',app);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Sessões concluídas ficaram protegidas contra retomada e dupla finalização multiaparelho.');
