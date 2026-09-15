import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const html=await fs.readFile('index.html','utf8');
const js=await fs.readFile('assets/app.js','utf8');
const sw=await fs.readFile('service-worker.js','utf8');
const manifest=JSON.parse(await fs.readFile('manifest.webmanifest','utf8'));
const v2=await fs.readFile('assets/v2.css','utf8');
const shell=html+'\n'+js;
const migrationNames=(await fs.readdir('supabase/migrations'))
  .filter(name=>name.endsWith('.sql'))
  .sort();
const migrations=(await Promise.all(migrationNames.map(async name=>({
  name,
  sql:await fs.readFile(`supabase/migrations/${name}`,'utf8')
}))));

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
if(!html.includes('Provas oficiais e materiais')) throw new Error('Tela de provas oficiais ausente.');
if(!js.includes("cloud-progress.js")||!js.includes("syncCloudProgress")) throw new Error('Sincronização de progresso ausente.');
if(!html.includes('id="cloudEmail"')||!html.includes('id="performanceCharts"')) throw new Error('Controles de conta/desempenho ausentes.');
if(/service_role|sb_secret_/i.test(html+'\n'+js+'\n'+sw)) throw new Error('Segredo do Supabase não pode existir no frontend.');

for(const marker of ['assets/v2.css','id="sidebarBackdrop"','id="editalSearch"','id="filterToggle"','id="resolverProgress"','id="performanceInsights"','id="installApp"']) if(!html.includes(marker)) throw new Error(`Contrato V2 ausente: ${marker}`);
for(const marker of ['setSidebarOpen','renderActiveFilters','shuffleItems','aria-pressed','renderInstallState','renderProgressSurface']) if(!js.includes(marker)) throw new Error(`Comportamento V2 ausente: ${marker}`);
if(js.includes("progress:changed',()=>renderAll")) throw new Error('Persistência ainda dispara renderização integral.');
if(js.includes('sort(()=>Math.random()-.5)')) throw new Error('Embaralhamento enviesado ainda presente.');
for(const marker of ["$$('.view').forEach","$$('#nav [data-go]').forEach","$$('#questionMap [data-map]').forEach"]) if(!js.includes(marker)) throw new Error('Consulta de lista não usa querySelectorAll: '+marker);
if(!sw.includes('DATA_CACHE')||!sw.includes('canonicalDataRequest')) throw new Error('Cache canônico de dados ausente.');
const shellDefinition=sw.match(/const SHELL=\[([\s\S]*?)\];/)?.[1]||'';
if(shellDefinition.includes('data/questions.json')) throw new Error('Arquivo de questões não deve ser pré-carregado no shell.');
if(!manifest.icons.some(icon=>icon.sizes==='192x192')||!manifest.icons.some(icon=>icon.sizes==='512x512')) throw new Error('Ícones PWA PNG ausentes.');
if(!v2.includes('@media (max-width: 1024px)')||!v2.includes('@media (max-width: 680px)')) throw new Error('Breakpoints de iPad e celular ausentes.');

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
for(const marker of [
  'using (user_id = (select auth.uid()))',
  'with check (user_id = (select auth.uid()))'
]) if(!legacyProfilePolicy.includes(marker)) throw new Error(`Compatibilidade de perfil legado ausente: ${marker}`);
const allMigrations=migrations.map(item=>item.sql).join('\n');
if(/grant\s+[^;]*\bon\s+(?:table\s+)?public\.student_progress_states\s+to\s+anon\b/i.test(allMigrations)) throw new Error('Progresso não pode conceder acesso ao papel anon.');
if(/grant\s+all(?:\s+privileges)?\s+on\s+(?:table\s+)?public\.student_progress_states\s+to\s+authenticated\b/i.test(allMigrations)) throw new Error('Progresso não pode conceder privilégios amplos ao papel authenticated.');

for(const file of ['assets/app.js','assets/cloud-progress.js','service-worker.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(syntax.status!==0)throw new Error('JavaScript inválido em '+file+'\n'+(syntax.stderr||syntax.stdout));
}
console.log('OK: V2 responsiva, navegação, filtros, resolvedor, persistência, PWA, cache e hardening Supabase validados.');
