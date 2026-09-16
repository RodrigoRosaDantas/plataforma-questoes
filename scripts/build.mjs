import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd(), dist=path.join(root,'dist');
await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(dist,{recursive:true});
for(const entry of ['index.html','manifest.webmanifest','service-worker.js','assets','data']){
  await fs.cp(path.join(root,entry),path.join(dist,entry),{recursive:true});
}
await fs.writeFile(path.join(dist,'.nojekyll'),'');

const distIndex=path.join(dist,'index.html');
let builtHtml=await fs.readFile(distIndex,'utf8');
const canonicalScript='<script type="module" src="./assets/canonical-editais.js"></script>';
if(!builtHtml.includes('canonical-editais.js')){
  if(!builtHtml.includes('</body>'))throw new Error('index.html sem fechamento de body para injetar taxonomia canônica.');
  builtHtml=builtHtml.replace('</body>',`  ${canonicalScript}\n</body>`);
  await fs.writeFile(distIndex,builtHtml);
}

const metadata=JSON.parse(await fs.readFile(path.join(root,'data','metadata.json'),'utf8'));
const deployment={
  schemaVersion:1,
  sourceSha:process.env.DEPLOY_SHA||process.env.GITHUB_SHA||'local',
  buildRunId:process.env.GITHUB_RUN_ID||null,
  buildRunNumber:process.env.GITHUB_RUN_NUMBER||null,
  builtAt:new Date().toISOString(),
  releaseSnapshotId:metadata.releaseSnapshotId||null,
  questionCount:Number(metadata.questionCount)||0
};
await fs.writeFile(path.join(dist,'deployment.json'),JSON.stringify(deployment,null,2)+'\n');
console.log(`dist/ gerado para GitHub Pages · ${deployment.sourceSha.slice(0,12)} · ${deployment.questionCount} questões · taxonomia canônica ativa.`);
