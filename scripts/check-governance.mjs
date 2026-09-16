import fs from 'node:fs/promises';

const metadata=JSON.parse(await fs.readFile('data/metadata.json','utf8'));
const backlog=JSON.parse(await fs.readFile('data/taxonomy-backlog.json','utf8'));
const taxonomyCandidates=JSON.parse(await fs.readFile('data/taxonomy-candidates.json','utf8'));
const taxonomyReviewGroups=JSON.parse(await fs.readFile('data/taxonomy-review-groups.json','utf8'));
const requireFreshTaxonomy=process.env.REQUIRE_TAXONOMY_FRESH!=='false';

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

if(requireFreshTaxonomy){
  for(const [name,artifact] of [['taxonomy-candidates',taxonomyCandidates],['taxonomy-review-groups',taxonomyReviewGroups]]){
    if(artifact?.sourceReleaseSnapshotId!==metadata.releaseSnapshotId){
      throw new Error(`${name} está obsoleto: release de origem diverge da release publicada.`);
    }
    if(Number(artifact?.sourceQuestionCount)!==Number(metadata.questionCount)){
      throw new Error(`${name} está obsoleto: total de questões de origem diverge da release publicada.`);
    }
  }
  if(taxonomyReviewGroups.sourceCandidateSchemaVersion!==taxonomyCandidates.schemaVersion){
    throw new Error('Lotes de revisão não correspondem ao schema atual da triagem taxonômica.');
  }
}

const taxonomyMessage=requireFreshTaxonomy
  ?`triagem vinculada à release ${metadata.releaseSnapshotId}`
  :'triagem será reconciliada no estágio taxonômico seguinte';
console.log(`OK: governança editorial íntegra — ${canonicalApproved}/${canonicalRecords} canônicos aprovados, ${canonicalBlocked} retidos e ${legacyRecords} registros em compatibilidade legada; ${taxonomyMessage}.`);
