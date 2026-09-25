import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const html=await fs.readFile('index.html','utf8');
const js=await fs.readFile('assets/app.js','utf8');
const cloud=await fs.readFile('assets/cloud-progress.js','utf8');
const studyPlan=await fs.readFile('assets/study-plan.js','utf8');
const ux=await fs.readFile('assets/ux-enhancements.js','utf8');
const canonical=await fs.readFile('assets/canonical-editais.js','utf8');
const sw=await fs.readFile('service-worker.js','utf8');
const buildScript=await fs.readFile('scripts/build.mjs','utf8');
const syncNotion=await fs.readFile('scripts/sync-notion.mjs','utf8');
const backlogScript=await fs.readFile('scripts/build-taxonomy-backlog.mjs','utf8');
const taxonomySync=await fs.readFile('scripts/sync-editorial-taxonomies.mjs','utf8');
const metadata=JSON.parse(await fs.readFile('data/metadata.json','utf8'));
const taxonomyBacklog=JSON.parse(await fs.readFile('data/taxonomy-backlog.json','utf8'));
const editais=JSON.parse(await fs.readFile('data/editais.json','utf8'));
const competitions=JSON.parse(await fs.readFile('data/competitions.json','utf8'));
const tceCompetition=competitions.find(item=>item.id==='tce-go');
if(!tceCompetition||tceCompetition.status!=='ativo'||tceCompetition.dashboardUrl!=='https://rodrigorosadantas.github.io/tce-go-dashboard/'||tceCompetition.officialExamUrl!=='https://www.concursosfcc.com.br/concursos/tcego122/index.html') throw new Error('Atalhos do dashboard e da prova oficial FCC TCE-GO ausentes ou inválidos.');
if(!js.includes('c.dashboardUrl')||!js.includes('c.officialExamUrl')||!js.includes("url.protocol==='https:'")||!js.includes("rel='noopener noreferrer'")||!js.includes('painel de estudos próprio')) throw new Error('Cartão externo seguro do TCE-GO ausente.');
const tceGoEdict=JSON.parse(await fs.readFile('data/tce-go-edital.json','utf8'));
if(tceCompetition.questionCount!==340||tceCompetition.topicCount!==448||tceGoEdict.canonicalAxisCount!==448||tceGoEdict.canonicalDirectQuestions!==0) throw new Error('Trilha TCE-GO precisa expor as contagens e o limite de vínculo exato.');
if(!js.includes('tce-go-fcc-tcego-2022-controle-externo')||!js.includes('tce-go-edital')||!js.includes('data-tce-material')||!js.includes('data-tce-section')) throw new Error('Banco FCC TCE-GO, provas ou filtros por matéria ausentes.');
if(!canonical.includes("const TCE_GO_CANONICAL_DATA='./data/tce-go-edital.json'")||!canonical.includes('subjectQuestionCounts')) throw new Error('Verticalizado oficial TCE-GO não está integrado à página de editais.');
const seedfCompetition=competitions.find(item=>item.id==='seedf');
if(!/nenhuma/i.test(tceGoEdict.mappingNote)||!seedfCompetition?.excludedRoles?.includes('Analista — Monitor')) throw new Error('Nota de granularidade TCE-GO ou foco de cargo SEEDF ausente.');

const manifest=JSON.parse(await fs.readFile('manifest.webmanifest','utf8'));
const v2=await fs.readFile('assets/v2.css','utf8');
if(!html.includes('id="mobileBottomNav"')||!js.includes('MOBILE_ROUTES')||!js.includes('#mobileBottomNav [data-go]')||!v2.includes('.mobile-bottom-nav button.active')||!v2.includes('env(safe-area-inset-bottom)')) throw new Error('Navegação inferior móvel acessível ou segura não foi incluída.');
if(!html.includes('id="questionBaseText"')||!js.includes('q.baseText||')) throw new Error('Texto-base das questões FCC não é exibido no resolvedor.');
const shell=html+'\n'+js;
const migrationNames=(await fs.readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
const migrations=await Promise.all(migrationNames.map(async name=>({name,sql:await fs.readFile(`supabase/migrations/${name}`,'utf8')})));

for(const marker of ['Banco de questões','Provas aplicadas','Simulados','Revisar','Desempenho','Importar provas','Ajustes e dados']) if(!shell.includes(marker)) throw new Error(`Navegação ausente: ${marker}`);
for(const marker of ['finishSession','ProgressStore','applyFilters','renderQuestionMap','loadRelease','refreshRelease','buildVerticalizedEditais','openTopic','openOfficialProof','officialExams']) if(!js.includes(marker)) throw new Error(`Contrato JS ausente: ${marker}`);
if(js.includes('NOTION_TOKEN')||html.includes('NOTION_TOKEN')) throw new Error('Segredo do Notion não pode existir no frontend.');
if(!/plataforma-questoes-v\d+/.test(sw)) throw new Error('Cache PWA não versionado.');
if(!sw.includes('./assets/logo.svg')||!html.includes('./assets/logo.svg')) throw new Error('Logo não incluída no shell público/PWA.');
if(!html.includes('class="mobile-brand"')) throw new Error('Marca móvel ausente.');
if(!html.includes('id="finishSession"')) throw new Error('Fluxo explícito de finalização ausente.');
if(!js.includes('answer-copy')||!js.includes('const isBinary=')) throw new Error('Renderização das alternativas binárias ausente.');
if(!html.includes('data-refresh-release')) throw new Error('Atualização manual da release ausente.');
if(!html.includes('editalStatus')) throw new Error('Status do edital verticalizado ausente.');
if(!js.includes('disciplina:discipline')) throw new Error('Filtro de tópico não referencia a disciplina correta.');
if(!js.includes('data-topic-cargo')||!js.includes("setQuestionFilter('filterCargo',cargo)")) throw new Error('Filtro de tópico não preserva o cargo.');
if(!js.includes('data-proof-cargo')||!js.includes("setQuestionFilter('filterCargo',career)")) throw new Error('Prova oficial não abre o recorte interativo do cargo.');
if(!js.includes('tjdft-provas')) throw new Error('Catálogo TJDFT não é carregado pelo frontend.');
if(!sw.includes('./data/tjdft-provas.json')) throw new Error('Catálogo TJDFT não está no cache de dados do PWA.');
if(!html.includes('Provas e questões no banco')) throw new Error('Tela de provas aplicadas ausente.');
if(!js.includes("cloud-progress.js")||!js.includes("syncCloudProgress")) throw new Error('Sincronização de progresso ausente.');
if(!html.includes('id="cloudEmail"')||!html.includes('id="performanceCharts"')) throw new Error('Controles de conta/desempenho ausentes.');
if(/service_role|sb_secret_/i.test(html+'\n'+js+'\n'+cloud+'\n'+studyPlan+'\n'+ux+'\n'+canonical+'\n'+sw)) throw new Error('Segredo do Supabase não pode existir no frontend.');

for(const marker of ['assets/v2.css','id="sidebarBackdrop"','id="editalSearch"','id="filterToggle"','id="resolverProgress"','id="performanceInsights"','id="installApp"']) if(!html.includes(marker)) throw new Error(`Contrato V2 ausente: ${marker}`);
for(const marker of ['id="filterConcurso"','id="filterSubassunto"','app.js?v=platform-v2-7']) if(!html.includes(marker)) throw new Error(`Filtro nativo ausente: ${marker}`);
for(const marker of ["concurso:'filterConcurso'","subassunto:'filterSubassunto'","populateSelect('filterConcurso'","populateSelect('filterSubassunto'","if(f.concurso && q.concurso!==f.concurso)","if(f.subassunto && q.subassunto!==f.subassunto)","concurso:q?.concurso||''","subassunto:q?.subassunto||''"]) if(!js.includes(marker)) throw new Error(`Contrato de filtro nativo ausente: ${marker}`);
for(const marker of ["{id:'filterConcurso',key:'concurso'","{id:'filterSubassunto',key:'subassunto'"]) if(!ux.includes(marker)) throw new Error(`Faceta nativa ausente: ${marker}`);
if(!sw.includes('./assets/app.js?v=platform-v2-7')) throw new Error('PWA não referencia o app com as referências da prova-fonte atualizadas.');
for(const file of ['tce-go-fcc-tcego-2022-controle-externo.json','tce-go-fcc-tcego-2022-contabilidade.json','tce-go-fcc-tcego-2014-administrativa.json','tce-go-fcc-tcece-2015-tecnico-administrativo.json','tce-go-edital.json']) if(!sw.includes('./data/'+file)) throw new Error(`PWA não armazena o arquivo de estudo TCE-GO: ${file}`);
for(const marker of ['setSidebarOpen','renderActiveFilters','shuffleItems','aria-pressed','renderInstallState','renderProgressSurface']) if(!js.includes(marker)) throw new Error(`Comportamento V2 ausente: ${marker}`);
if(js.includes("progress:changed',()=>renderAll")) throw new Error('Persistência ainda dispara renderização integral.');
if(js.includes('sort(()=>Math.random()-.5)')) throw new Error('Embaralhamento enviesado ainda presente.');
for(const marker of ["$$('.view').forEach","$$('#nav [data-go], #mobileBottomNav [data-go]').forEach","$$('#questionMap [data-map]').forEach"]) if(!js.includes(marker)) throw new Error('Consulta de lista não usa querySelectorAll: '+marker);
if(!sw.includes('DATA_CACHE')||!sw.includes('canonicalDataRequest')) throw new Error('Cache canônico de dados ausente.');
const shellDefinition=sw.match(/const SHELL=\[([\s\S]*?)\];/)?.[1]||'';
if(shellDefinition.includes('data/questions.json')) throw new Error('Arquivo de questões não deve ser pré-carregado no shell.');
if(!manifest.icons.some(icon=>icon.sizes==='192x192')||!manifest.icons.some(icon=>icon.sizes==='512x512')) throw new Error('Ícones PWA PNG ausentes.');
if(!v2.includes('@media (max-width: 1024px)')||!v2.includes('@media (max-width: 680px)')) throw new Error('Breakpoints de iPad e celular ausentes.');

if(!cloud.includes("import './study-plan.js';")) throw new Error('Plano diário não é carregado pela aplicação.');
if(!cloud.includes("import './ux-enhancements.js';")) throw new Error('Melhorias de UX não são carregadas pela aplicação.');
if(!sw.includes('./assets/study-plan.js')) throw new Error('Plano diário não está no cache offline do PWA.');
if(!sw.includes('./assets/ux-enhancements.js')) throw new Error('Melhorias de UX não estão no cache offline do PWA.');
for(const marker of ['PLANO DE HOJE','30 min','60 min','90 min','America/Sao_Paulo','data-plan-action']) if(!studyPlan.includes(marker)) throw new Error(`Contrato do plano diário ausente: ${marker}`);
for(const marker of ['reviewSummary','unresolvedError','data-answer','ArrowRight','markQuestion','resolver-shortcut-hint','resultSessionInsight','sessionDisciplineStats','data-insight-discipline','performanceTopicInsights','priorityTopics','data-ux-topic','FACET_CONFIG','facetCounts','data-facet-managed','Filtros combinados','opções incompatíveis ficam ocultas','COVERAGE_FIELDS','editorialCoverageCard','Cobertura da taxonomia','A plataforma não inventa concurso']) if(!ux.includes(marker)) throw new Error(`Contrato de UX ausente: ${marker}`);
for(const marker of ['countMissing','taxonomyCoverage','publishedMissing','coveragePercent','sourceAudit: { records: transformed.length, published: questions.length, excluded, formats, missing, publishedMissing, taxonomy }']) if(!syncNotion.includes(marker)) throw new Error(`Auditoria editorial ausente: ${marker}`);
if(!metadata.sourceAudit?.taxonomy?.published) throw new Error('Metadata publicado não contém cobertura da taxonomia.');
for(const field of ['concurso','edital','topicoEdital','disciplina','assunto','subassunto','cargo']){
  const item=metadata.sourceAudit.taxonomy.published[field];
  if(!item||!Number.isFinite(item.coveragePercent)||!Number.isFinite(item.filled)||!Number.isFinite(item.missing)) throw new Error(`Cobertura publicada inválida: ${field}`);
}

for(const marker of ['canonicalComplete','readyForVerticalization','needsBasicTaxonomy','priority','taxonomy-backlog.json']) if(!backlogScript.includes(marker)) throw new Error(`Gerador de backlog ausente: ${marker}`);
if(taxonomyBacklog.schemaVersion!==1) throw new Error('Schema do backlog editorial inválido.');
if(taxonomyBacklog.releaseSnapshotId!==metadata.releaseSnapshotId) throw new Error('Backlog editorial não corresponde à release atual.');
const backlogTotals=taxonomyBacklog.totals||{};
if(Number(backlogTotals.canonicalMapped)+Number(backlogTotals.backlog)!==Number(backlogTotals.published)) throw new Error('Backlog editorial não fecha com o total publicado.');
if(Number(backlogTotals.published)!==Number(metadata.questionCount)) throw new Error('Backlog editorial diverge do metadata publicado.');
if(Number(backlogTotals.readyForVerticalization)>Number(backlogTotals.backlog)) throw new Error('Backlog pronto para verticalização excede o passivo total.');
if(Number(backlogTotals.needsBasicTaxonomy)+Number(backlogTotals.readyForVerticalization)!==Number(backlogTotals.backlog)) throw new Error('Classificação operacional do backlog não fecha com o passivo total.');
for(const key of ['byOrgao','byCargo','byDisciplina','byAssunto','groups']) if(!Array.isArray(taxonomyBacklog.priority?.[key])) throw new Error(`Fila de prioridade ausente no backlog: ${key}`);

for(const marker of ['seedf-edital.json','tjdft-edital.json','canonicalAxisCount','canonicalLinkedAxes','canonicalDirectQuestions','directQuestionCount','editorialPolicy']) if(!taxonomySync.includes(marker)) throw new Error(`Sincronização canônica ausente: ${marker}`);
if(!Array.isArray(editais)) throw new Error('data/editais.json deve conter um array.');
const seedf=editais.find(item=>item.competitionId==='seedf');
const tjdft=editais.find(item=>item.competitionId==='tjdft');
const sedes=editais.find(item=>item.competitionId==='sedes-df-2026');
if(!seedf||!Number.isInteger(seedf.canonicalAxisCount)||seedf.canonicalAxisCount<1||seedf.canonicalAxes?.length!==seedf.canonicalAxisCount) throw new Error('Taxonomia canônica SEEDF inconsistente.');
if(!tjdft||!Number.isInteger(tjdft.canonicalAxisCount)||tjdft.canonicalAxisCount<1||tjdft.canonicalAxes?.length!==tjdft.canonicalAxisCount) throw new Error('Taxonomia canônica TJDFT inconsistente.');
if(seedf.editorialPolicy?.official!==false||seedf.sourceKind!=='projected') throw new Error('SEEDF pré-edital deve permanecer explicitamente projetado e não oficial.');
if(tjdft.editorialPolicy?.official!==false||tjdft.sourceKind!=='historical-base') throw new Error('TJDFT pré-edital deve permanecer explicitamente como base histórica e não oficial.');
if(!sedes||sedes.status!=='histórico') throw new Error('SEDES/DF deve permanecer como trilha histórica.');
for(const edital of [seedf,tjdft]){
  if(!Number.isFinite(edital.canonicalLinkedAxes)||!Number.isFinite(edital.canonicalDirectQuestions)) throw new Error(`Cobertura canônica inválida: ${edital.competitionId}`);
  if(edital.canonicalLinkedAxes<0||edital.canonicalLinkedAxes>edital.canonicalAxisCount||edital.canonicalDirectQuestions<0) throw new Error(`Contadores canônicos fora do intervalo: ${edital.competitionId}`);
  for(const axis of edital.canonicalAxes){
    if(!axis.topic||!axis.subject||!Number.isFinite(axis.directQuestionCount)||axis.directQuestionCount<0) throw new Error(`Eixo canônico inválido em ${edital.competitionId}.`);
  }
}
for(const marker of ['TAXONOMIA CANÔNICA','Vínculo direto','Sem vínculo direto no banco','directQuestionCount','canonicalDirectQuestions']) if(!canonical.includes(marker)) throw new Error(`Interface canônica ausente: ${marker}`);
if(canonical.includes('questions.json')) throw new Error('Interface canônica não deve reler o banco completo de questões no navegador.');
if(!sw.includes('./assets/canonical-editais.js')||!sw.includes('./data/taxonomy-backlog.json')) throw new Error('PWA não inclui módulo/dados canônicos esperados.');
if(!buildScript.includes('canonical-editais.js')||!buildScript.includes('canonicalScript')) throw new Error('Build publicado não injeta o módulo canônico.');

const privilegeHardening=migrations.find(item=>item.name.includes('harden_student_profile_sync_privileges'))?.sql||'';
const legacyProfilePolicy=migrations.find(item=>item.name.includes('preserve_legacy_profile_ids_during_sync'))?.sql||'';
for(const marker of [
  'revoke all privileges on table public.student_profiles from anon',
  'grant insert (id, user_id, is_active) on table public.student_profiles to authenticated',
  'grant update (is_active, updated_at) on table public.student_profiles to authenticated',
  'revoke all privileges on table public.student_progress_states from anon',
  'grant select, insert, update on table public.student_progress_states to authenticated',
  'revoke execute on function public.ensure_student_profile() from public, anon',
  'grant execute on function public.ensure_student_profile() to authenticated'
]) if(!privilegeHardening.includes(marker)) throw new Error(`Hardening Supabase ausente: ${marker}`);
for(const marker of ['using (user_id = (select auth.uid()))','with check (user_id = (select auth.uid()))']) if(!legacyProfilePolicy.includes(marker)) throw new Error(`Compatibilidade de perfil legado ausente: ${marker}`);
const allMigrations=migrations.map(item=>item.sql).join('\n');
if(/grant\s+[^;]*\bon\s+(?:table\s+)?public\.student_progress_states\s+to\s+anon\b/i.test(allMigrations)) throw new Error('Progresso não pode conceder acesso ao papel anon.');
if(/grant\s+all(?:\s+privileges)?\s+on\s+(?:table\s+)?public\.student_progress_states\s+to\s+authenticated\b/i.test(allMigrations)) throw new Error('Progresso não pode conceder privilégios amplos ao papel authenticated.');

for(const file of ['assets/app.js','assets/cloud-progress.js','assets/study-plan.js','assets/ux-enhancements.js','assets/canonical-editais.js','service-worker.js','scripts/build.mjs','scripts/sync-notion.mjs','scripts/build-taxonomy-backlog.mjs','scripts/sync-editorial-taxonomies.mjs','scripts/validate-tce-go.mjs','scripts/smoke-published.mjs']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(syntax.status!==0)throw new Error('JavaScript inválido em '+file+'\n'+(syntax.stderr||syntax.stdout));
}
console.log('OK: V2 responsiva, navegação, plano diário, UX, cobertura/backlog, taxonomia canônica SEEDF/TJDFT, filtros, resolvedor, persistência, PWA, cache e hardening Supabase validados.');
