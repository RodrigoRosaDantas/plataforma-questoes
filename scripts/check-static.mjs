import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const html=await fs.readFile('index.html','utf8');
const js=await fs.readFile('assets/app.js','utf8');
const sw=await fs.readFile('service-worker.js','utf8');
const manifest=JSON.parse(await fs.readFile('manifest.webmanifest','utf8'));
const v2=await fs.readFile('assets/v2.css','utf8');
const shell=html+'\n'+js;

for(const marker of ['Banco de questões','Provas aplicadas','Simulados','Revisar','Desempenho','Importar provas','Ajustes e dados']) if(!shell.includes(marker)) throw new Error(`Navegação ausente: ${marker}`);
for(const marker of ['finishSession','ProgressStore','applyFilters','renderQuestionMap','loadRelease','refreshRelease','buildVerticalizedEditais','openTopic','officialExams']) if(!js.includes(marker)) throw new Error(`Contrato JS ausente: ${marker}`);
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
if(js.includes("$('.view').forEach")||js.includes("$('#nav [data-go]').forEach")||js.includes("$('#questionMap [data-map]').forEach")) throw new Error('Consulta de lista usa querySelector em vez de querySelectorAll.');
if(!sw.includes('DATA_CACHE')||!sw.includes('canonicalDataRequest')) throw new Error('Cache canônico de dados ausente.');
const shellDefinition=sw.match(/const SHELL=\[([\s\S]*?)\];/)?.[1]||'';
if(shellDefinition.includes('data/questions.json')) throw new Error('Arquivo de questões não deve ser pré-carregado no shell.');
if(!manifest.icons.some(icon=>icon.sizes==='192x192')||!manifest.icons.some(icon=>icon.sizes==='512x512')) throw new Error('Ícones PWA PNG ausentes.');
if(!v2.includes('@media (max-width: 1024px)')||!v2.includes('@media (max-width: 680px)')) throw new Error('Breakpoints de iPad e celular ausentes.');

for(const file of ['assets/app.js','assets/cloud-progress.js','service-worker.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(syntax.status!==0)throw new Error('JavaScript inválido em '+file+'\n'+(syntax.stderr||syntax.stdout));
}
console.log('OK: V2 responsiva, navegação, filtros, resolvedor, persistência, PWA e cache validados.');
