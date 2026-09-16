import fs from 'node:fs/promises';

function replaceOnce(source,from,to,label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: esperado 1 trecho, encontrado ${count}.`);
  return source.replace(from,to);
}

let app=await fs.readFile('assets/app.js','utf8');
let cloud=await fs.readFile('assets/cloud-progress.js','utf8');
let checks=await fs.readFile('scripts/check-regressions.mjs','utf8');
let sw=await fs.readFile('service-worker.js','utf8');

cloud=replaceOnce(
  cloud,
  `async function saveCloudState(stateValue,stateVersion=1){\n  if(!hasSession())return {saved:false};\n  await ensureProfile();\n  const updatedAt=new Date().toISOString();\n  const row={profile_id:profileId,state:stateValue&&typeof stateValue==='object'?stateValue:{},state_version:Math.max(1,Number(stateVersion)||1),device_id:deviceId(),updated_at:updatedAt};\n  await request('/rest/v1/student_progress_states?on_conflict=profile_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});\n  const clock=new Date(updatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});\n  setStatus('authenticated','Nuvem atualizada às '+clock+'. Seu progresso está disponível para outros aparelhos conectados à mesma conta.');\n  return {saved:true,updatedAt};\n}`,
  `async function saveCloudState(stateValue,expectedVersion=0){\n  if(!hasSession())return {saved:false,conflict:false};\n  await ensureProfile();\n  const expected=Math.max(0,Number(expectedVersion)||0);\n  const payload={\n    p_profile_id:profileId,\n    p_expected_version:expected,\n    p_state:stateValue&&typeof stateValue==='object'?stateValue:{},\n    p_device_id:deviceId()\n  };\n  const result=await request('/rest/v1/rpc/compare_and_swap_student_progress_state',{\n    method:'POST',\n    headers:{Prefer:'return=representation'},\n    body:JSON.stringify(payload)\n  });\n  const row=Array.isArray(result)?result[0]||{}:result||{};\n  if(row.saved===true){\n    const updatedAt=row.updated_at||new Date().toISOString();\n    const clock=new Date(updatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});\n    setStatus('authenticated','Nuvem atualizada às '+clock+'. Seu progresso está disponível para outros aparelhos conectados à mesma conta.');\n    return {saved:true,conflict:false,stateVersion:Number(row.state_version)||expected+1,updatedAt};\n  }\n  setStatus('syncing','Outro aparelho atualizou a nuvem. Mesclando as alterações…');\n  return {saved:false,conflict:true,stateVersion:Number(row.state_version)||0,updatedAt:row.updated_at||null};\n}`,
  'gravação CAS do estado'
);

app=replaceOnce(
  app,
  `  try{\n    const [remoteHistory,remoteState]=await Promise.all([cloudProgress.loadCloudHistory(),cloudProgress.loadCloudState()]);\n    const remotePayload=remoteState?.state&&typeof remoteState.state==='object'?{...remoteState.state,history:cloudProgress.mergeHistory(remoteState.state.history,remoteHistory)}:{history:remoteHistory};\n    const local=store.load(),merged=mergeProgressState(local,remotePayload);\n    if(JSON.stringify(local)!==JSON.stringify(merged))store.save(merged);\n    const finalState=store.load();\n    await cloudProgress.saveCloudState(cloudStatePayload(finalState),Math.max(Number(remoteState?.state_version)||0,Number(finalState.version)||1)+1);\n    const active=finalState.activeSession;\n    if(active&&(!state.session||entryTime(active)>entryTime(state.session)))hydrateSession(active);\n    if(!options.silent)toast('Progresso sincronizado entre os aparelhos.');\n  }catch{`,
  `  try{\n    let finalState=store.load(),saved=false;\n    for(let attempt=0;attempt<4;attempt+=1){\n      const [remoteHistory,remoteState]=await Promise.all([cloudProgress.loadCloudHistory(),cloudProgress.loadCloudState()]);\n      const remotePayload=remoteState?.state&&typeof remoteState.state==='object'?{...remoteState.state,history:cloudProgress.mergeHistory(remoteState.state.history,remoteHistory)}:{history:remoteHistory};\n      const local=store.load(),merged=mergeProgressState(local,remotePayload);\n      if(JSON.stringify(local)!==JSON.stringify(merged))store.save(merged);\n      finalState=store.load();\n      const write=await cloudProgress.saveCloudState(cloudStatePayload(finalState),Number(remoteState?.state_version)||0);\n      if(write.saved){saved=true;break;}\n      if(!write.conflict)throw new Error('Falha ao salvar o estado da nuvem.');\n    }\n    if(!saved)throw new Error('A nuvem mudou repetidamente durante a sincronização.');\n    const active=finalState.activeSession;\n    if(active&&(!state.session||entryTime(active)>entryTime(state.session)))hydrateSession(active);\n    if(!options.silent)toast('Progresso sincronizado entre os aparelhos.');\n  }catch{`,
  'retry de conflito multiaparelho'
);

checks=replaceOnce(
  checks,
  `const taxonomySync=await fs.readFile('scripts/sync-editorial-taxonomies.mjs','utf8');`,
  `const taxonomySync=await fs.readFile('scripts/sync-editorial-taxonomies.mjs','utf8');\nconst casMigration=await fs.readFile('supabase/migrations/20260916141000_fix_progress_state_compare_and_swap_column_ambiguity.sql','utf8');`,
  'leitura da migration CAS'
);
const anchor=`if(app.includes("authenticated:'Sincronizado'"))throw new Error('Conta autenticada não pode ser apresentada como sincronizada sem confirmação de gravação.');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Concorrência multiaparelho: gravação do estado usa compare-and-swap + merge/retry.\nfor(const marker of [\n  "/rest/v1/rpc/compare_and_swap_student_progress_state",\n  'p_expected_version:expected',\n  "setStatus('syncing','Outro aparelho atualizou a nuvem. Mesclando as alterações…')"\n]) requireMarker(cloud,marker,'Cliente CAS da nuvem ausente');\nif(cloud.includes('/rest/v1/student_progress_states?on_conflict=profile_id'))throw new Error('Estado da nuvem voltou ao upsert cego sem controle de versão.');\nfor(const marker of [\n  'for(let attempt=0;attempt<4;attempt+=1)',\n  'Number(remoteState?.state_version)||0',\n  'if(write.saved){saved=true;break;}',\n  'if(!write.conflict)throw new Error',\n  "if(!saved)throw new Error('A nuvem mudou repetidamente durante a sincronização.')"\n]) requireMarker(app,marker,'Retry de conflito do estado da nuvem ausente');\nfor(const marker of [\n  'compare_and_swap_student_progress_state',\n  'progress.state_version = p_expected_version',\n  'return query select false, coalesce(v_row.state_version, 0)',\n  'revoke all on function public.compare_and_swap_student_progress_state(text,bigint,jsonb,text) from anon',\n  'grant execute on function public.compare_and_swap_student_progress_state(text,bigint,jsonb,text) to authenticated'\n]) requireMarker(casMigration,marker,'Contrato SQL de compare-and-swap ausente');`,
  'proteção CAS no CI'
);
checks=replaceOnce(
  checks,
  `if(cacheVersion<47)throw new Error('Cache PWA regrediu para uma versão anterior à correção de precisão e brancos.');`,
  `if(cacheVersion<49)throw new Error('Cache PWA regrediu para uma versão anterior ao compare-and-swap multiaparelho.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v48';","const CACHE_PREFIX='plataforma-questoes-v49';",'cache PWA');

await fs.writeFile('assets/app.js',app);
await fs.writeFile('assets/cloud-progress.js',cloud);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Cliente de nuvem protegido por CAS com merge e retry.');
