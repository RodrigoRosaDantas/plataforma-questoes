import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(), dist=path.join(root,'dist');
await fs.rm(dist,{recursive:true,force:true}); await fs.mkdir(dist,{recursive:true});
for(const entry of ['index.html','manifest.webmanifest','service-worker.js','assets','data']) await fs.cp(path.join(root,entry),path.join(dist,entry),{recursive:true});
await fs.writeFile(path.join(dist,'.nojekyll'),'');
console.log('dist/ gerado para GitHub Pages.');
