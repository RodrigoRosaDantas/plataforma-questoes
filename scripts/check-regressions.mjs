import fs from 'node:fs/promises';

const app=await fs.readFile('assets/app.js','utf8');
const ux=await fs.readFile('assets/ux-enhancements.js','utf8');
const cloud=await fs.readFile('assets/cloud-progress.js','utf8');
const studyPlan=await fs.readFile('assets/study-plan.js','utf8');
const canonical=await fs.readFile('assets/canonical-editais.js','utf8');
const taxonomySync=await fs.readFile('scripts/sync-editorial-taxonomies.mjs','utf8');
const casMigration=await fs.readFile('supabase/migrations/20260916141000_fix_progress_state_compare_and_swap_column_ambiguity.sql','utf8');
const attemptIdempotencyMigration=await fs.readFile('supabase/migrations/20260916142500_harden_question_attempt_idempotency.sql','utf8');
const profilePrivilegeMigration=await fs.readFile('supabase/migrations/20260916181501_restore_column_scoped_student_profile_write.sql','utf8');
const v2=await fs.readFile('assets/v2.css','utf8');
const sw=await fs.readFile('service-worker.js','utf8');
const editais=JSON.parse(await fs.readFile('data/editais.json','utf8'));
const candidates=JSON.parse(await fs.readFile('data/taxonomy-candidates.json','utf8'));
const reviewGroups=JSON.parse(await fs.readFile('data/taxonomy-review-groups.json','utf8'));

function requireMarker(source,marker,message){
  if(!source.includes(marker))throw new Error(message+`: ${marker}`);
}
const normalize=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');

// Trilhas: SEEDF/TJDFT precisam ser recortes reais, independentes da baixa cobertura de Concurso/Edital.
for(const marker of [
  "competitionScope: ''",
  "const FILTER_LABELS = {trilha:'Trilha'",
  'function setCompetitionScope(competitionId=\'\')',
  "document.documentElement.dataset.competitionScope=next",
  "if(key==='trilha')setCompetitionScope('')",
  'navigate(\'questions\'); resetQuestionFilters(); setCompetitionScope(competitionId);',
  'if(state.competitionScope&&!questionBelongsTo(q,state.competitionScope)) return false'
]) requireMarker(app,marker,'Contrato do escopo real de trilha ausente');
if(app.includes("if(sample) setQuestionFilter('filterOrgao',sample.orgao)"))throw new Error('Atalho de trilha voltou a depender do órgão da primeira questão.');
for(const marker of [
  'trailHay:normalize([question.concurso,question.orgao,question.cargo,question.nomeMaterial].join(\' \'))',
  'function currentCompetitionScope()',
  'function facetBelongsToScope(row,scope)',
  "if(!facetBelongsToScope(row,currentCompetitionScope()))return false",
  "window.addEventListener('competition-scope:changed',()=>scheduleFacetRender(0))",
  "document.querySelector('#clearFilters')?.click()"
]) requireMarker(ux,marker,'Facetas/desempenho perderam sincronização com o escopo de trilha');

// Supabase: sessão válida deve continuar autenticada mesmo após uma falha transitória.
for(const marker of [
  "const hasSession=()=>Boolean(session?.access_token)",
  'authenticated:hasSession()',
  'async function ensureProfile()',
  "if(!hasSession())return {synced:false,history:normalized,count:0}",
  "await ensureProfile();",
  "/auth/v1/otp?redirect_to=",
  'bytes[6]=(bytes[6]&0x0f)|0x40',
  'bytes[8]=(bytes[8]&0x3f)|0x80',
  'function validUuid(value)',
  'if(validUuid(saved))return saved;',
  'if(saved)localStorage.removeItem(DEVICE_KEY);',
  'clientEventId:validUuid(answer.clientEventId)?answer.clientEventId:uuid()',
  "setStatus('authenticated','Nuvem atualizada às '+clock+'. Seu progresso está disponível para outros aparelhos conectados à mesma conta.')"
]) requireMarker(cloud,marker,'Contrato de robustez Supabase ausente');
if(cloud.includes('options:{email_redirect_to'))throw new Error('Magic Link voltou ao payload de redirect legado no corpo da requisição.');
if(/authenticated\s*:\s*status===['"]authenticated['"]/.test(cloud))throw new Error('Autenticação não pode depender apenas do estado visual da sincronização.');
requireMarker(app,"authenticated:'Conta conectada'",'Interface voltou a chamar mera autenticação de sincronização concluída');
if(app.includes("authenticated:'Sincronizado'"))throw new Error('Conta autenticada não pode ser apresentada como sincronizada sem confirmação de gravação.');

// Supabase: provisionamento do perfil usa grants por coluna, nunca escrita ampla na tabela.
for(const marker of [
  'revoke insert, update on table public.student_profiles from authenticated;',
  'grant insert (id, user_id, is_active) on table public.student_profiles to authenticated;',
  'grant update (is_active, updated_at) on table public.student_profiles to authenticated;'
]) requireMarker(profilePrivilegeMigration,marker,'Contrato de privilégios por coluna do perfil ausente');
if(/grant\s+(?:insert\s*,\s*update|update\s*,\s*insert)\s+on\s+table\s+public\.student_profiles\s+to\s+authenticated/i.test(profilePrivilegeMigration))throw new Error('Migration de perfil voltou a conceder escrita ampla na tabela.');

// Concorrência multiaparelho: gravação do estado usa compare-and-swap + merge/retry.
for(const marker of [
  "/rest/v1/rpc/compare_and_swap_student_progress_state",
  'p_expected_version:expected',
  "setStatus('syncing','Outro aparelho atualizou a nuvem. Mesclando as alterações…')"
]) requireMarker(cloud,marker,'Cliente CAS da nuvem ausente');
if(cloud.includes('/rest/v1/student_progress_states?on_conflict=profile_id'))throw new Error('Estado da nuvem voltou ao upsert cego sem controle de versão.');
for(const marker of [
  'for(let attempt=0;attempt<4;attempt+=1)',
  'Number(remoteState?.state_version)||0',
  'if(write.saved){saved=true;break;}',
  'if(!write.conflict)throw new Error',
  "if(!saved)throw new Error('A nuvem mudou repetidamente durante a sincronização.')"
]) requireMarker(app,marker,'Retry de conflito do estado da nuvem ausente');
for(const marker of [
  'compare_and_swap_student_progress_state',
  'progress.state_version = p_expected_version',
  'return query select false, coalesce(v_row.state_version, 0)',
  'revoke all on function public.compare_and_swap_student_progress_state(text,bigint,jsonb,text) from anon',
  'grant execute on function public.compare_and_swap_student_progress_state(text,bigint,jsonb,text) to authenticated'
]) requireMarker(casMigration,marker,'Contrato SQL de compare-and-swap ausente');

// Histórico multiaparelho: primeira conclusão é canônica e tentativas são idempotentes por bateria/questão.
for(const marker of [
  "/rest/v1/question_attempts?on_conflict=profile_id,question_set_id,question_id",
  "order=answered_at.asc",
  'const seenAttempts=new Set()',
  'if(seenAttempts.has(attemptKey))return;',
  'function historyRecordTime(record)',
  'function mergeCanonicalAnswers(canonicalAnswers,fallbackAnswers)',
  'const canonical=remoteTime<localTime?remote:local'
]) requireMarker(cloud,marker,'Contrato de idempotência do histórico ausente');
if(cloud.includes("resolution=merge-duplicates"))throw new Error('Sessão concluída voltou a poder ser sobrescrita na nuvem.');
for(const marker of [
  'const canonicalIds=new Set(canonicalList.map',
  'const missingFallback=fallbackList.filter',
  'canonicalIds.add(id);',
  'return [...mergedCanonical,...missingFallback];',
  'a cópia completa posterior cura apenas questionIds ausentes'
]) requireMarker(cloud,marker,'Cura de upload parcial multi-lote ausente');
for(const marker of [
  'const correct=answers.filter(answer=>answer?.isCorrect===true).length;',
  'const blank=answers.filter(answer=>answer?.blank===true).length;',
  'const wrong=Math.max(0,answers.length-correct-blank);',
  'total:answers.length,correct,wrong,blank',
  'Métricas derivadas acompanham o array final'
]) requireMarker(cloud,marker,'Reconciliação das métricas do histórico após merge ausente');

// Paginação da nuvem: nunca aceitar histórico parcialmente carregado como se estivesse completo.
for(const marker of [
  'const CLOUD_PAGE_SIZE=1000',
  'const CLOUD_MAX_PAGES=100',
  'async function fetchRows(path,maxPages=CLOUD_MAX_PAGES)',
  "if(data.length<CLOUD_PAGE_SIZE)return rows",
  "if(page===safePages-1)throw new Error('Histórico da nuvem excedeu o limite seguro de '"
]) requireMarker(cloud,marker,'Proteção contra truncamento silencioso do histórico da nuvem ausente');
if(cloud.includes('async function fetchRows(path,maxPages=20)'))throw new Error('Paginação da nuvem regrediu para o teto silencioso de 20 mil registros.');

// Histórico cloud: paginação precisa de ordem total e nunca pode inventar horário atual para dado legado.
for(const marker of [
  'order=ended_at.desc,activity_id.asc',
  'order=answered_at.asc,question_set_id.asc,question_id.asc',
  'const attemptTimeMap=new Map()',
  'attemptTimeMap.set(key,Math.max(Number(attemptTimeMap.get(key))||0,answeredAt))',
  'const attemptFinishedAt=Number(attemptTimeMap.get(id))||0',
  'const finishedAt=Number.isFinite(endedAt)&&endedAt>0?endedAt:attemptFinishedAt'
]) requireMarker(cloud,marker,'Ordenação/fallback temporal confiável do histórico cloud ausente');
if(cloud.includes("row.ended_at?new Date(row.ended_at).getTime():Date.now()"))throw new Error('Histórico cloud voltou a inventar finishedAt com Date.now().');
if(cloud.includes('Number(value)||Date.now()'))throw new Error('Upload relacional voltou a inventar timestamp atual para histórico legado.');
for(const marker of [
  'const relational=normalized.filter(record=>{',
  'return Number.isFinite(finishedAt)&&finishedAt>0;',
  'const sessionRows=relational.map(record=>({',
  'started_at:iso(record.startedAt)||iso(record.finishedAt)',
  'const attemptRows=relational.flatMap(record=>record.answers.map(answer=>({'
]) requireMarker(cloud,marker,'Proteção temporal do upload relacional ausente');

// Upload parcial: study_session sem nenhuma tentativa não pode virar bateria concluída de 0 questões.
for(const marker of [
  'const ids=new Set(answerMap.keys())',
  'Uma sessão relacional sem tentativas indica upload parcial'
]) requireMarker(cloud,marker,'Proteção contra sessão relacional órfã ausente');
if(cloud.includes('const ids=new Set([...sessionMap.keys(),...answerMap.keys()])'))throw new Error('Sessão órfã voltou a ser reconstruída como histórico concluído.');

// Erros: contagem e relógios são reconstruídos do histórico idempotente após o merge.
for(const marker of [
  'function rebuildErrorsFromHistory(history,fallbackValue)',
  'const seen=new Set()',
  'if(answered&&!correct){item.count+=1;item.lastError=Math.max(item.lastError,finishedAt);}',
  'const count=Math.max(Number(legacy.count)||0,Number(current.count)||0)',
  'const mergedHistory=cloudProgress.mergeHistory(left.history,right.history)',
  'const mergedErrorFallback=mergeProgressMap(left.errors,right.errors)',
  'const mergedErrors=rebuildErrorsFromHistory(mergedHistory,mergedErrorFallback)'
]) requireMarker(app,marker,'Reconstrução confiável do caderno de erros ausente');

// Revisões: erro ativo reconstruído pelo histórico deve prevalecer sobre estágio antigo.
for(const marker of [
  'function reconcileReviewsWithErrors(reviewValue,errorValue)',
  'if(!lastError||lastError<=lastCorrect)continue;',
  "if(!current||lastError>reviewEntryTime(current,error))result[id]={stage:'D0',dueAt:lastError,updatedAt:lastError}",
  'const mergedReviewCandidates=mergeReviewMap(left.reviews,right.reviews,mergedErrors)',
  'const mergedReviews=reconcileReviewsWithErrors(mergedReviewCandidates,mergedErrors)'
]) requireMarker(app,marker,'Reconciliação entre caderno de erros e D0/D7/D20 ausente');

// D0/D7/D20: acerto antecipado não pode encurtar o intervalo agendado.
for(const marker of [
  'function advanceReviewIfDue(review,finishedAt)',
  "if(!review||review.stage==='Dominada')return false",
  'if(dueAt>finishedAt)return false;',
  "review.stage=review.stage==='D0'?'D7':review.stage==='D7'?'D20':'Dominada'",
  'review.updatedAt=finishedAt',
  'if(r)advanceReviewIfDue(r,finishedAt)'
]) requireMarker(app,marker,'Proteção dos intervalos D0/D7/D20 ausente');
if(app.includes("if(r){r.stage=r.stage==='D0'?'D7'"))throw new Error('Revisão voltou a avançar sem conferir o vencimento.');
for(const marker of [
  'question_attempts_profile_set_question_unique',
  'unique (profile_id, question_set_id, question_id)'
]) requireMarker(attemptIdempotencyMigration,marker,'Constraint de idempotência das tentativas ausente');

// Sessões multiaparelho: uma bateria concluída nunca pode ressurgir como ativa.
for(const marker of [
  "const completedSessionIds=new Set((merged.history||[]).map(record=>String(record?.id||'')).filter(Boolean))",
  "!completedSessionIds.has(String(active.id||''))",
  "const completedRecord=localSessionId?(finalState.history||[]).find(record=>String(record?.id||'')===localSessionId):null",
  "toast('Esta bateria foi concluída em outro aparelho.')",
  "const completed=store.load().history.find(record=>String(record?.id||'')===String(saved.id||''))",
  "const existing=store.load().history.find(record=>String(record?.id||'')===String(s.id||''))",
  "toast('Esta bateria já havia sido concluída em outro aparelho.')"
]) requireMarker(app,marker,'Proteção contra sessão concluída ressurgir ausente');
if(app.includes('merged.activeSession=active&&entryTime(active)>cutoff?active:null;'))throw new Error('Sessão concluída voltou a poder ser reativada pelo merge.');

// Revisões multiaparelho: dueAt é agenda, não timestamp de conflito.
for(const marker of [
  'function reviewEntryTime(value,error)',
  "if(stage==='Dominada')return Number(error?.lastCorrect)||0",
  "if(stage==='D20')return Math.max(0,dueAt-20*864e5)",
  "if(stage==='D7')return Math.max(0,dueAt-7*864e5)",
  'function mergeReviewMap(localValue,remoteValue,errors)',
  'const mergedErrorFallback=mergeProgressMap(left.errors,right.errors)',
  'const mergedReviewCandidates=mergeReviewMap(left.reviews,right.reviews,mergedErrors)',
  'review.updatedAt=finishedAt',
  "p.reviews[a.questionId]={stage:'D0',dueAt:finishedAt,updatedAt:finishedAt}"
]) requireMarker(app,marker,'Contrato de sincronização D0/D7/D20 ausente');
if(app.includes('Number(value.dueAt)||0,Number(value.removedAt)||0'))throw new Error('dueAt voltou a ser tratado como timestamp principal de conflito.');

// Tombstones multiaparelho: remoções precisam vencer versões antigas no merge.
for(const marker of [
  'Number(value.updatedAt)||0',
  'Number(value.removedAt)||0',
  'merged[id]=entryTime(local[id])>=entryTime(remote[id])?local[id]:remote[id]',
  'p.marked[q.id]=current&&!current.removed?{removed:true,removedAt:Date.now()}:{at:Date.now()}',
  'p.notes[q.id]={text,updatedAt:now}'
]) requireMarker(app,marker,'Proteção de tombstones de marcações/anotações ausente');


// Facetas: reutilizam o questions.json já carregado pelo núcleo antes de recorrer ao fallback de rede/cache.
for(const marker of [
  "window.dispatchEvent(new CustomEvent('questions:loaded',{detail:{questions:q}}))",
  "window.addEventListener('questions:loaded',event=>{acceptFacetQuestions(event.detail?.questions);})",
  'function acceptFacetQuestions(questions)',
  'if(!force&&facetRows.length)return facetRows;',
  'if(facetRows.length){renderFacetOptions();return;}'
]) requireMarker(app.includes(marker)?app:ux,marker,'Contrato de reutilização em memória das facetas ausente');
if(ux.includes('readFacetDataset(true)'))throw new Error('Facetas voltaram a forçar uma segunda leitura integral de questions.json.');

// Precisão: brancos não entram no denominador nem aparecem como erradas na leitura analítica.
for(const marker of [
  "['Erradas',rawWrong]",
  'const answered=Math.max(0,v.total-v.blank)',
  'function recordPrecision(record)',
  'const rawWrong=Number.isFinite(record?.rawWrong)?Number(record.rawWrong):Number(record?.wrong)||0',
  'const best=history.length?Math.max(...history.map(recordPrecision)):0',
  'value:recordPrecision(record)'
]) requireMarker(app,marker,'Contrato de precisão sem brancos ausente');
if(app.includes("['Erradas',wrong]"))throw new Error('Resultado voltou a misturar brancos com respostas erradas.');

// Edital canônico: módulo ativo, associação estável e ambiguidade explícita.
requireMarker(studyPlan,"import './canonical-editais.js';",'Taxonomia canônica deixou de ser carregada pela aplicação');
for(const marker of [
  "const CANONICAL_DATA='./data/editais.json'",
  'data-canonical-section',
  'Vínculo direto',
  'canonical-link-ambiguous',
  'Tópico repetido',
  "const competitionId=text(card.querySelector('[data-edital-filter]')?.dataset.editalFilter)",
  "find(edital=>text(edital.competitionId)===competitionId)"
]) requireMarker(canonical,marker,'Contrato do edital canônico ausente');
if(canonical.includes('plataforma.questoes.device.v1')||canonical.includes('DEVICE_KEY'))throw new Error('Edital canônico voltou a manipular identidade de dispositivo da nuvem.');
for(const marker of [
  'function topicMultiplicity(axes)',
  'directLinkAmbiguous',
  'directQuestionCount:directLinkAmbiguous?0:',
  'canonicalAmbiguousAxes'
]) requireMarker(taxonomySync,marker,'Gerador canônico perdeu a proteção contra ambiguidade');

if(!Array.isArray(editais)||!editais.length)throw new Error('data/editais.json precisa conter os editais canônicos.');
const ids=editais.map(item=>String(item.competitionId||''));
if(new Set(ids).size!==ids.length)throw new Error('competitionId duplicado em data/editais.json.');
for(const edital of editais){
  const axes=Array.isArray(edital.canonicalAxes)?edital.canonicalAxes:[];
  if(Number(edital.canonicalAxisCount)!==axes.length)throw new Error(`${edital.competitionId}: canonicalAxisCount diverge dos eixos.`);
  const linkedAxes=axes.filter(axis=>Number(axis.directQuestionCount||0)>0).length;
  const directQuestions=axes.reduce((sum,axis)=>sum+Math.max(0,Number(axis.directQuestionCount)||0),0);
  const ambiguousAxes=axes.filter(axis=>axis.directLinkAmbiguous===true).length;
  if(Number(edital.canonicalLinkedAxes)!==linkedAxes)throw new Error(`${edital.competitionId}: canonicalLinkedAxes não fecha.`);
  if(Number(edital.canonicalDirectQuestions)!==directQuestions)throw new Error(`${edital.competitionId}: canonicalDirectQuestions não fecha.`);
  if(Number(edital.canonicalAmbiguousAxes)!==ambiguousAxes)throw new Error(`${edital.competitionId}: canonicalAmbiguousAxes não fecha.`);
  for(const axis of axes){
    if(axis.directLinkAmbiguous===true&&Number(axis.directQuestionCount)!==0)throw new Error(`${edital.competitionId}: eixo ambíguo recebeu vínculo direto.`);
  }
  const topicCounts=new Map();
  for(const axis of axes){
    const topic=normalize(axis.topic);
    if(topic)topicCounts.set(topic,(topicCounts.get(topic)||0)+1);
  }
  for(const axis of axes){
    if(Number(axis.directQuestionCount||0)>0&&(topicCounts.get(normalize(axis.topic))||0)!==1)throw new Error(`${edital.competitionId}: vínculo direto apontou para tópico canônico não único.`);
  }
}

// Mobile: impede o retorno do painel estreito observado em celular.
requireMarker(v2,'.hero-side { width: 100%; grid-template-columns: minmax(0, 1fr); justify-items: stretch; }','Correção mobile do painel de estudo ausente');
requireMarker(v2,'.hero-scorecard { width: 100%; max-width: none; }','Scorecard mobile não ocupa a largura útil');
requireMarker(v2,'.scorecard-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }','Grade 2x2 do scorecard no celular ausente');

// PWA: qualquer alteração crítica no shell precisa chegar sem depender do cache anterior.
const cacheVersion=Number(sw.match(/plataforma-questoes-v(\d+)/)?.[1]||0);
if(cacheVersion<69)throw new Error('Cache PWA regrediu para uma versão anterior à reconciliação das métricas cloud.');
for(const marker of ["'./assets/cloud-progress.js'","'./assets/study-plan.js'","'./assets/ux-enhancements.js'","'./assets/canonical-editais.js'"]) requireMarker(sw,marker,'Módulo crítico ausente do shell PWA');

// Triagem editorial: nunca transforma heurística em writeback automático.
if(candidates.schemaVersion!==3)throw new Error('Schema da triagem editorial deve permanecer em v3.');
if(candidates.policy?.writeback!==false||candidates.policy?.automaticApplication!==false)throw new Error('Triagem editorial não pode habilitar writeback/aplicação automática.');
if(candidates.policy?.strongRequiresTextEvidence!==true)throw new Error('Candidato forte deve continuar exigindo evidência textual.');
if(candidates.policy?.outOfScopeExcludedFromReviewQueue!==true)throw new Error('Itens fora do escopo devem permanecer fora da fila de revisão.');
const candidateEntries=Array.isArray(candidates.entries)?candidates.entries:[];
if(candidateEntries.length!==Number(candidates.totals?.reviewQueue))throw new Error('Fila de revisão diverge da quantidade de entradas da triagem.');
const strongEntries=candidateEntries.filter(item=>item.classification==='strong');
if(strongEntries.length!==Number(candidates.totals?.strong))throw new Error('Total de candidatos fortes diverge das entradas classificadas.');
if(Number(candidates.totals?.strongWithTextEvidence)!==Number(candidates.totals?.strong))throw new Error('Há candidato forte sem evidência textual registrada.');

if(reviewGroups.schemaVersion!==1||reviewGroups.sourceCandidateSchemaVersion!==3)throw new Error('Contrato dos lotes editoriais incompatível com a triagem v3.');
if(reviewGroups.policy?.writeback!==false||reviewGroups.policy?.automaticApplication!==false)throw new Error('Lotes editoriais não podem habilitar alteração automática do Banco Mestre.');
const cohesive=Array.isArray(reviewGroups.cohesiveStrongGroups)?reviewGroups.cohesiveStrongGroups:[];
if(cohesive.length!==Number(reviewGroups.totals?.cohesiveStrongGroups))throw new Error('Total de lotes coesos diverge do relatório.');
const cohesiveQuestions=cohesive.reduce((sum,group)=>sum+Number(group.count||0),0);
if(cohesiveQuestions!==Number(reviewGroups.totals?.questionsInCohesiveStrongGroups))throw new Error('Quantidade de questões dos lotes coesos não fecha.');
if(cohesiveQuestions!==Number(candidates.totals?.strong))throw new Error('Nem todos os candidatos fortes estão representados em lotes coesos.');
for(const group of cohesive){
  if(group.cohesiveStrong!==true||Number(group.uniqueBestAxes)!==1||!group.proposedAxis?.axisId)throw new Error('Lote marcado como coeso não possui destino canônico único.');
  if(Number(group.classificationCounts?.strong)!==Number(group.count))throw new Error('Lote coeso contém questão que não foi classificada como forte.');
}

console.log('OK: regressões críticas de trilhas, Supabase, editais canônicos, mobile, PWA e triagem editorial protegidas.');
