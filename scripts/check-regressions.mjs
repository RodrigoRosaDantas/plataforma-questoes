import fs from 'node:fs/promises';

const cloud=await fs.readFile('assets/cloud-progress.js','utf8');
const studyPlan=await fs.readFile('assets/study-plan.js','utf8');
const canonical=await fs.readFile('assets/canonical-editais.js','utf8');
const taxonomySync=await fs.readFile('scripts/sync-editorial-taxonomies.mjs','utf8');
const v2=await fs.readFile('assets/v2.css','utf8');
const sw=await fs.readFile('service-worker.js','utf8');
const editais=JSON.parse(await fs.readFile('data/editais.json','utf8'));
const candidates=JSON.parse(await fs.readFile('data/taxonomy-candidates.json','utf8'));
const reviewGroups=JSON.parse(await fs.readFile('data/taxonomy-review-groups.json','utf8'));

function requireMarker(source,marker,message){
  if(!source.includes(marker))throw new Error(message+`: ${marker}`);
}
const normalize=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');

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
  'clientEventId:validUuid(answer.clientEventId)?answer.clientEventId:uuid()',
  "setStatus('authenticated','Nuvem atualizada às '+clock+'. Seu progresso está disponível para outros aparelhos conectados à mesma conta.')"
]) requireMarker(cloud,marker,'Contrato de robustez Supabase ausente');
if(cloud.includes('options:{email_redirect_to'))throw new Error('Magic Link voltou ao payload de redirect legado no corpo da requisição.');
if(/authenticated\s*:\s*status===['"]authenticated['"]/.test(cloud))throw new Error('Autenticação não pode depender apenas do estado visual da sincronização.');

// Edital canônico: módulo ativo, associação estável e ambiguidade explícita.
requireMarker(studyPlan,"import './canonical-editais.js';",'Taxonomia canônica deixou de ser carregada pela aplicação');
for(const marker of [
  "const CANONICAL_DATA='./data/editais.json'",
  'data-canonical-section',
  'Vínculo direto',
  'canonical-link-ambiguous',
  'Tópico repetido',
  "const competitionId=text(card.querySelector('[data-edital-filter]')?.dataset.editalFilter)",
  "find(edital=>text(edital.competitionId)===competitionId)",
  "const CLOUD_DEVICE_KEY='plataforma.questoes.device.v1'",
  'localStorage.removeItem(CLOUD_DEVICE_KEY)'
]) requireMarker(canonical,marker,'Contrato do edital canônico/migração local ausente');
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
if(cacheVersion<37)throw new Error('Cache PWA regrediu para uma versão anterior à auditoria de vínculos canônicos.');
for(const marker of ["'./assets/cloud-progress.js'","'./assets/study-plan.js'","'./assets/canonical-editais.js'"]) requireMarker(sw,marker,'Módulo crítico ausente do shell PWA');

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

console.log('OK: regressões críticas de Supabase, editais canônicos, mobile, PWA e triagem editorial protegidas.');
