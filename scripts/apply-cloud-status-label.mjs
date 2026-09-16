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
  "const statusLabels={loading:'Conectando…',signed_out:'Modo local',pending:'Link enviado',authenticated:'Sincronizado',syncing:'Sincronizando…',error:'Indisponível'};",
  "const statusLabels={loading:'Conectando…',signed_out:'Modo local',pending:'Link enviado',authenticated:'Conta conectada',syncing:'Sincronizando…',error:'Nuvem indisponível'};",
  'rótulos de status da nuvem'
);

checks=replaceOnce(
  checks,
  `if(/authenticated\\s*:\\s*status===['\"]authenticated['\"]/.test(cloud))throw new Error('Autenticação não pode depender apenas do estado visual da sincronização.');`,
  `if(/authenticated\\s*:\\s*status===['\"]authenticated['\"]/.test(cloud))throw new Error('Autenticação não pode depender apenas do estado visual da sincronização.');\nrequireMarker(app,"authenticated:'Conta conectada'",'Interface voltou a chamar mera autenticação de sincronização concluída');\nif(app.includes("authenticated:'Sincronizado'"))throw new Error('Conta autenticada não pode ser apresentada como sincronizada sem confirmação de gravação.');`,
  'contrato visual da nuvem'
);
checks=replaceOnce(
  checks,
  `if(cacheVersion<40)throw new Error('Cache PWA regrediu para uma versão anterior à separação entre nuvem e edital canônico.');`,
  `if(cacheVersion<41)throw new Error('Cache PWA regrediu para uma versão anterior ao status explícito da nuvem.');`,
  'versão mínima do PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v40';","const CACHE_PREFIX='plataforma-questoes-v41';",'cache PWA');

await fs.writeFile('assets/app.js',app);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Status da conta separado da confirmação de sincronização; PWA v41.');
