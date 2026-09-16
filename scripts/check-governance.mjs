import fs from 'node:fs/promises';

const metadata=JSON.parse(await fs.readFile('data/metadata.json','utf8'));
const backlog=JSON.parse(await fs.readFile('data/taxonomy-backlog.json','utf8'));

if(metadata.releasePolicy?.canonicalTaxonomyRequiresExportApproval!==true){
  throw new Error('Gate canônico deve exigir aprovação explícita para exportação.');
}
if(metadata.releasePolicy?.legacyCompatibilityUntilCanonicalMigration!==true){
  throw new Error('Compatibilidade do legado deve permanecer explícita durante a migração canônica.');
}

const governance=metadata.sourceAudit?.governance;
if(!governance) throw new Error('Metadata não contém auditoria de governança canônica.');

for(const field of ['canonicalRecords','canonicalApproved','canonicalBlockedByApproval','legacyCompatibilityRecords']){
  const value=Number(governance[field]);
  if(!Number.isInteger(value)||value<0) throw new Error(`Contador de governança inválido: ${field}`);
}

const canonicalRecords=Number(governance.canonicalRecords);
const canonicalApproved=Number(governance.canonicalApproved);
const canonicalBlocked=Number(governance.canonicalBlockedByApproval);
const legacyRecords=Number(governance.legacyCompatibilityRecords);
const sourceRecords=Number(metadata.sourceAudit?.records);
const canonicalPublished=Number(backlog.totals?.canonicalMapped);

if(canonicalApproved+canonicalBlocked!==canonicalRecords){
  throw new Error('Governança não fecha: canônicos devem ser iguais a aprovados + retidos.');
}
if(canonicalRecords+legacyRecords!==sourceRecords){
  throw new Error('Governança não fecha com o total da fonte: canônicos + legado divergem do Banco Mestre.');
}
if(canonicalPublished!==canonicalApproved){
  throw new Error('Publicação canônica diverge das aprovações explícitas do Notion.');
}
if(canonicalApproved>Number(metadata.questionCount)){
  throw new Error('Aprovações canônicas excedem o total de questões publicadas.');
}

console.log(`OK: governança editorial íntegra — ${canonicalApproved}/${canonicalRecords} canônicos aprovados, ${canonicalBlocked} retidos e ${legacyRecords} registros em compatibilidade legada.`);
