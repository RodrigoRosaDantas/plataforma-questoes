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
  "headers:{Prefer:'resolution=merge-duplicates,return=minimal'},",
  "headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},",
  'preservação da primeira sessão concluída'
);
cloud=replaceOnce(
  cloud,
  "for(const batch of chunks(attemptRows,500))await request('/rest/v1/question_attempts',{",
  "for(const batch of chunks(attemptRows,500))await request('/rest/v1/question_attempts?on_conflict=profile_id,question_set_id,question_id',{",
  'chave explícita de idempotência das tentativas'
);
cloud=replaceOnce(
  cloud,
  "const attempts=await fetchRows('/rest/v1/question_attempts?select=question_set_id,question_id,answer,is_correct,duration_ms,answered_at,client_event_id&question_set_id=not.is.null&order=answered_at.desc');",
  "const attempts=await fetchRows('/rest/v1/question_attempts?select=question_set_id,question_id,answer,is_correct,duration_ms,answered_at,client_event_id&question_set_id=not.is.null&order=answered_at.asc');",
  'ordenação canônica das tentativas'
);
cloud=replaceOnce(
  cloud,
  `  const answerMap=new Map();\n  attempts.forEach(row=>{\n    const key=String(row.question_set_id||'');\n    if(!key)return;\n    if(!answerMap.has(key))answerMap.set(key,[]);\n    answerMap.get(key).push({\n      questionId:String(row.question_id),`,
  `  const answerMap=new Map();\n  const seenAttempts=new Set();\n  attempts.forEach(row=>{\n    const key=String(row.question_set_id||''),questionId=String(row.question_id||'');\n    if(!key||!questionId)return;\n    const attemptKey=key+'::'+questionId;\n    if(seenAttempts.has(attemptKey))return;\n    seenAttempts.add(attemptKey);\n    if(!answerMap.has(key))answerMap.set(key,[]);\n    answerMap.get(key).push({\n      questionId,`,
  'deduplicação defensiva na leitura'
);
cloud=replaceOnce(
  cloud,
  `function mergeHistory(localHistory,remoteHistory){\n  const merged=new Map();\n  (Array.isArray(localHistory)?localHistory:[]).forEach(record=>merged.set(String(record.id),record));\n  (Array.isArray(remoteHistory)?remoteHistory:[]).forEach(remote=>{\n    const id=String(remote.id);\n    const local=merged.get(id);\n    if(!local){merged.set(id,remote);return;}\n    const answers=(local.answers?.length||0)>=(remote.answers?.length||0)?local.answers:remote.answers;\n    merged.set(id,Object.assign({},remote,local,{answers}));\n  });\n  return [...merged.values()].sort((a,b)=>(Number(b.finishedAt)||0)-(Number(a.finishedAt)||0));\n}`,
  `function historyRecordTime(record){\n  const value=Number(record?.finishedAt);\n  return Number.isFinite(value)&&value>0?value:Number.POSITIVE_INFINITY;\n}\nfunction mergeCanonicalAnswers(canonicalAnswers,fallbackAnswers){\n  const fallbackByQuestion=new Map((Array.isArray(fallbackAnswers)?fallbackAnswers:[]).map(answer=>[String(answer?.questionId||''),answer]));\n  const metadataKeys=['correctAnswer','concurso','disciplina','assunto','subassunto','questionVersion','questionHash','releaseSnapshotId','sourceSnapshot'];\n  return (Array.isArray(canonicalAnswers)?canonicalAnswers:[]).map(answer=>{\n    const fallback=fallbackByQuestion.get(String(answer?.questionId||''));\n    if(!fallback)return answer;\n    const merged={...fallback,...answer};\n    metadataKeys.forEach(key=>{if((answer?.[key]===undefined||answer?.[key]===null||answer?.[key]==='')&&fallback?.[key]!==undefined&&fallback?.[key]!==null&&fallback?.[key]!=='')merged[key]=fallback[key];});\n    return merged;\n  });\n}\nfunction mergeHistory(localHistory,remoteHistory){\n  const merged=new Map();\n  (Array.isArray(localHistory)?localHistory:[]).forEach(record=>merged.set(String(record.id),record));\n  (Array.isArray(remoteHistory)?remoteHistory:[]).forEach(remote=>{\n    const id=String(remote.id);\n    const local=merged.get(id);\n    if(!local){merged.set(id,remote);return;}\n    const localTime=historyRecordTime(local),remoteTime=historyRecordTime(remote);\n    const canonical=remoteTime<localTime?remote:local;\n    const fallback=canonical===local?remote:local;\n    const answers=mergeCanonicalAnswers(canonical.answers,fallback.answers);\n    merged.set(id,Object.assign({},fallback,canonical,{answers}));\n  });\n  return [...merged.values()].sort((a,b)=>(Number(b.finishedAt)||0)-(Number(a.finishedAt)||0));\n}`,
  'merge canônico do histórico'
);

checks=replaceOnce(
  checks,
  `const casMigration=await fs.readFile('supabase/migrations/20260916141000_fix_progress_state_compare_and_swap_column_ambiguity.sql','utf8');`,
  `const casMigration=await fs.readFile('supabase/migrations/20260916141000_fix_progress_state_compare_and_swap_column_ambiguity.sql','utf8');\nconst attemptIdempotencyMigration=await fs.readFile('supabase/migrations/20260916142500_harden_question_attempt_idempotency.sql','utf8');`,
  'leitura da migration de idempotência'
);
const anchor=`]) requireMarker(casMigration,marker,'Contrato SQL de compare-and-swap ausente');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Histórico multiaparelho: primeira conclusão é canônica e tentativas são idempotentes por bateria/questão.\nfor(const marker of [\n  "/rest/v1/question_attempts?on_conflict=profile_id,question_set_id,question_id",\n  "order=answered_at.asc",\n  'const seenAttempts=new Set()',\n  'if(seenAttempts.has(attemptKey))return;',\n  'function historyRecordTime(record)',\n  'function mergeCanonicalAnswers(canonicalAnswers,fallbackAnswers)',\n  'const canonical=remoteTime<localTime?remote:local'\n]) requireMarker(cloud,marker,'Contrato de idempotência do histórico ausente');\nif(cloud.includes("resolution=merge-duplicates"))throw new Error('Sessão concluída voltou a poder ser sobrescrita na nuvem.');\nfor(const marker of [\n  'question_attempts_profile_set_question_unique',\n  'unique (profile_id, question_set_id, question_id)'\n]) requireMarker(attemptIdempotencyMigration,marker,'Constraint de idempotência das tentativas ausente');`,
  'proteção do histórico idempotente no CI'
);
checks=replaceOnce(
  checks,
  `if(cacheVersion<51)throw new Error('Cache PWA regrediu para uma versão anterior à proteção contra sessão concluída ressurgir.');`,
  `if(cacheVersion<53)throw new Error('Cache PWA regrediu para uma versão anterior à idempotência do histórico multiaparelho.');`,
  'versão mínima PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v52';","const CACHE_PREFIX='plataforma-questoes-v53';",'cache PWA');

await fs.writeFile('assets/cloud-progress.js',cloud);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Histórico e tentativas ficaram idempotentes por bateria, preservando a primeira conclusão.');
