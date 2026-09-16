import fs from 'node:fs/promises';

function replaceOnce(source,from,to,label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: esperado 1 trecho, encontrado ${count}.`);
  return source.replace(from,to);
}

let cloud=await fs.readFile('assets/cloud-progress.js','utf8');
let canonical=await fs.readFile('assets/canonical-editais.js','utf8');
let checks=await fs.readFile('scripts/check-regressions.mjs','utf8');
let sw=await fs.readFile('service-worker.js','utf8');

const legacyCanonical=`const CLOUD_DEVICE_KEY='plataforma.questoes.device.v1';\ntry{\n  const savedDevice=localStorage.getItem(CLOUD_DEVICE_KEY);\n  if(savedDevice&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(savedDevice))localStorage.removeItem(CLOUD_DEVICE_KEY);\n}catch{}\n\n`;
canonical=replaceOnce(canonical,legacyCanonical,'','remoção do acoplamento de device no edital');

cloud=replaceOnce(
  cloud,
  `function deviceId(){\n  try{\n    const saved=localStorage.getItem(DEVICE_KEY);\n    if(saved)return saved;\n    const next=uuid();\n    localStorage.setItem(DEVICE_KEY,next);\n    return next;\n  }catch{return uuid();}\n}`,
  `function deviceId(){\n  try{\n    const saved=localStorage.getItem(DEVICE_KEY);\n    if(validUuid(saved))return saved;\n    if(saved)localStorage.removeItem(DEVICE_KEY);\n    const next=uuid();\n    localStorage.setItem(DEVICE_KEY,next);\n    return next;\n  }catch{return uuid();}\n}`,
  'responsabilidade do device id'
);

checks=replaceOnce(
  checks,
  `  'function validUuid(value)',\n  'clientEventId:validUuid(answer.clientEventId)?answer.clientEventId:uuid()',`,
  `  'function validUuid(value)',\n  'if(validUuid(saved))return saved;',\n  'if(saved)localStorage.removeItem(DEVICE_KEY);',\n  'clientEventId:validUuid(answer.clientEventId)?answer.clientEventId:uuid()',`,
  'contrato de device no Supabase'
);
checks=replaceOnce(
  checks,
  `  "find(edital=>text(edital.competitionId)===competitionId)",\n  "const CLOUD_DEVICE_KEY='plataforma.questoes.device.v1'",\n  'localStorage.removeItem(CLOUD_DEVICE_KEY)'\n]) requireMarker(canonical,marker,'Contrato do edital canônico/migração local ausente');`,
  `  "find(edital=>text(edital.competitionId)===competitionId)"\n]) requireMarker(canonical,marker,'Contrato do edital canônico ausente');\nif(canonical.includes('plataforma.questoes.device.v1')||canonical.includes('DEVICE_KEY'))throw new Error('Edital canônico voltou a manipular identidade de dispositivo da nuvem.');`,
  'isolamento do módulo canônico'
);
checks=replaceOnce(
  checks,
  `if(cacheVersion<38)throw new Error('Cache PWA regrediu para uma versão anterior ao escopo real das trilhas.');`,
  `if(cacheVersion<40)throw new Error('Cache PWA regrediu para uma versão anterior à separação entre nuvem e edital canônico.');`,
  'versão mínima do PWA'
);
sw=replaceOnce(sw,"const CACHE_PREFIX='plataforma-questoes-v39';","const CACHE_PREFIX='plataforma-questoes-v40';",'cache PWA');

await fs.writeFile('assets/cloud-progress.js',cloud);
await fs.writeFile('assets/canonical-editais.js',canonical);
await fs.writeFile('scripts/check-regressions.mjs',checks);
await fs.writeFile('service-worker.js',sw);
console.log('Responsabilidade de device isolada no módulo de nuvem; PWA v40.');
