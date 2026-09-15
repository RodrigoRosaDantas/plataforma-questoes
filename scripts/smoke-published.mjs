const rawUrl=process.env.SITE_URL||process.argv[2]||'';
const expectedSha=String(process.env.EXPECTED_SHA||'').trim();
if(!rawUrl){
  console.error('SITE_URL ausente.');
  process.exit(2);
}
const root=new URL(rawUrl.endsWith('/')?rawUrl:rawUrl+'/');
const stamp=Date.now().toString(36);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function target(relative=''){
  const url=new URL(relative,root);
  url.searchParams.set('__smoke',stamp);
  return url;
}
async function request(relative,{json=false}={}){
  const url=target(relative);
  const response=await fetch(url,{headers:{'cache-control':'no-cache','user-agent':'plataforma-questoes-smoke'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`${relative||'/'} respondeu ${response.status}`);
  if(json){
    const text=await response.text();
    try{return JSON.parse(text);}catch{throw new Error(`${relative} não retornou JSON válido`);}
  }
  return response.text();
}
function ensure(condition,message){if(!condition)throw new Error(message);}

async function smoke(){
  const index=await request('');
  ensure(index.includes('<title>Plataforma de Questões</title>'),'Home publicada não contém o título esperado.');
  ensure(index.includes('id="main"'),'Shell público não contém a área principal.');
  ensure(index.includes('./assets/app.js'),'Home não referencia o app principal.');

  for(const view of ['questions','review','performance','settings']){
    const html=await request(`?view=${view}`);
    ensure(html.includes('Plataforma de Questões'),`Rota ${view} não entregou o shell da aplicação.`);
  }

  const [app,cloud,planner,sw,manifest,metadata,questions,competitions,editais,proofs,deployment]=await Promise.all([
    request('assets/app.js'),
    request('assets/cloud-progress.js'),
    request('assets/study-plan.js'),
    request('service-worker.js'),
    request('manifest.webmanifest',{json:true}),
    request('data/metadata.json',{json:true}),
    request('data/questions.json',{json:true}),
    request('data/competitions.json',{json:true}),
    request('data/editais.json',{json:true}),
    request('data/tjdft-provas.json',{json:true}),
    request('deployment.json',{json:true})
  ]);

  ensure(app.includes("cloud-progress.js")&&app.includes('loadRelease'),'app.js publicado não contém os contratos essenciais.');
  ensure(cloud.includes("import './study-plan.js';"),'cloud-progress publicado não carrega o Plano de Hoje.');
  ensure(planner.includes('PLANO DE HOJE')&&planner.includes('30 min')&&planner.includes('90 min'),'Plano 30/60/90 não foi publicado corretamente.');
  ensure(/plataforma-questoes-v\d+/.test(sw),'Service worker publicado não possui cache versionado.');
  ensure(sw.includes('./assets/study-plan.js'),'Service worker publicado não cacheia o Plano de Hoje.');

  ensure(Array.isArray(manifest.icons)&&manifest.icons.some(icon=>icon.sizes==='192x192')&&manifest.icons.some(icon=>icon.sizes==='512x512'),'Manifest publicado sem ícones PWA essenciais.');
  ensure(metadata&&metadata.schemaVersion>=2,'Metadata publicada com schema inesperado.');
  ensure(metadata.sampleMode===false,'A publicação está em modo de amostra.');
  ensure(typeof metadata.releaseSnapshotId==='string'&&metadata.releaseSnapshotId.length>=32,'Snapshot da release ausente ou inválido.');
  ensure(Number(metadata.questionCount)>0,'Metadata indica zero questões publicadas.');
  ensure(Array.isArray(questions),'questions.json publicado não é uma lista.');
  ensure(questions.length===Number(metadata.questionCount),`Contagem divergente: metadata=${metadata.questionCount}, questions=${questions.length}.`);
  ensure(Array.isArray(competitions)&&competitions.length>0,'Catálogo de concursos vazio ou inválido.');
  ensure(Array.isArray(editais),'Editais publicados em formato inválido.');
  ensure(Array.isArray(proofs),'Catálogo de provas oficiais em formato inválido.');

  ensure(deployment?.schemaVersion===1,'Identidade do deploy ausente ou inválida.');
  ensure(typeof deployment.sourceSha==='string'&&deployment.sourceSha.length>=7,'SHA do deploy ausente.');
  ensure(deployment.releaseSnapshotId===metadata.releaseSnapshotId,'deployment.json aponta para snapshot editorial diferente do publicado.');
  ensure(Number(deployment.questionCount)===questions.length,'deployment.json tem contagem diferente da release publicada.');
  if(expectedSha)ensure(deployment.sourceSha===expectedSha,`Pages ainda serve ${deployment.sourceSha.slice(0,12)}, esperado ${expectedSha.slice(0,12)}.`);

  console.log(`OK: site publicado saudável em ${root.href}`);
  console.log(`Commit ${deployment.sourceSha.slice(0,12)} · release ${metadata.releaseSnapshotId.slice(0,12)} · ${questions.length} questões · ${competitions.length} concursos · ${proofs.length} registros de provas.`);
}

let lastError;
for(let attempt=1;attempt<=5;attempt++){
  try{
    console.log(`Smoke publicado: tentativa ${attempt}/5`);
    await smoke();
    process.exit(0);
  }catch(error){
    lastError=error;
    console.error(`Tentativa ${attempt} falhou: ${error.message}`);
    if(attempt<5)await delay(4000*attempt);
  }
}
console.error('Smoke test pós-publicação falhou:',lastError?.stack||lastError);
process.exit(1);
