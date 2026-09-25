import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const materials=[
  ['tce-go-fcc-tcego-2022-controle-externo.json','tcego-fcc-2022-controle-externo-selecao'],
  ['tce-go-fcc-tcego-2022-contabilidade.json','tcego-fcc-2022-contabilidade-selecao'],
  ['tce-go-fcc-tcego-2014-administrativa.json','tcego-fcc-2014-admin'],
  ['tce-go-fcc-tcece-2015-tecnico-administrativo.json','tcece-fcc-2015-tecnico-admin']
];
const [edital,competitions]=await Promise.all([
  fs.readFile('data/tce-go-edital.json','utf8').then(JSON.parse),
  fs.readFile('data/competitions.json','utf8').then(JSON.parse)
]);
const sectionById=new Map(edital.sections.map(section=>[section.id,section]));
const questions=[];
for(const [file,materialId] of materials){
  const catalog=JSON.parse(await fs.readFile('data/'+file,'utf8'));
  assert.equal(catalog.schemaVersion,1,`${file}: schemaVersion`);
  assert.equal(catalog.source.materialId,materialId,`${file}: source material`);
  assert.equal(catalog.source.board,'FCC',`${file}: banca`);
  assert.equal(catalog.questions.length,catalog.source.questionCount,`${file}: count`);
  questions.push(...catalog.questions);
}
assert.equal(questions.length,340,'unique TCE-GO study questions');
assert.equal(new Set(questions.map(question=>question.id)).size,questions.length,'unique question IDs');
const bySection=Object.fromEntries(edital.sections.map(section=>[section.id,0]));
const primaryBySection={...bySection};
const sourceCounts=new Map();
for(const question of questions){
  assert.ok(question.id&&question.enunciado&&question.gabarito,`missing question content: ${question.id}`);
  assert.equal(question.banca,'FCC',`${question.id}: banca`);
  assert.equal(question.concurso,'TCE-GO 2026/2027',`${question.id}: target contest`);
  assert.equal(question.formato,'Múltipla escolha A–E',`${question.id}: format`);
  assert.deepEqual(Object.keys(question.alternativas).sort(),['A','B','C','D','E'],`${question.id}: alternatives`);
  assert.ok(question.alternativas[question.gabarito],`${question.id}: answer key`);
  assert.equal(question.editalItemIds.length,0,`${question.id}: unsupported exact item mapping`);
  assert.ok(sectionById.has(question.editalSectionId),`${question.id}: primary section`);
  assert.equal(question.disciplina,sectionById.get(question.editalSectionId).title,`${question.id}: mapped discipline`);
  primaryBySection[question.editalSectionId]++;
  for(const sectionId of new Set([question.editalSectionId,...question.editalAdditionalSectionIds])){
    assert.ok(sectionById.has(sectionId),`${question.id}: additional section ${sectionId}`);
    bySection[sectionId]++;
  }
  sourceCounts.set(question.sourceMaterialId,(sourceCounts.get(question.sourceMaterialId)||0)+1);
}
assert.equal(edital.canonicalAxisCount,448,'official edital topic count');
assert.equal(edital.canonicalAxes.length,448,'verticalized topic records');
assert.equal(new Set(edital.canonicalAxes.map(axis=>axis.id)).size,448,'unique edital topic IDs');
assert.equal(edital.exactTopicMappings,0,'exact item mappings');
assert.equal(edital.canonicalDirectQuestions,0,'directly linked questions');
assert.equal(edital.questionPoolCount,340,'unique questions in the bank');
assert.equal(edital.questionPoolEntryCount,376,'overlapping matter pool entries');
assert.equal(edital.questionPoolEntryCountsOverlap,true,'overlapping matter pools are disclosed');
assert.deepEqual(edital.sectionQuestionCounts,bySection,'per-section pools include recorded cross-matter mappings');
assert.deepEqual(edital.primarySectionQuestionCounts,primaryBySection,'primary section counts');
for(const section of edital.sections){
  assert.equal(section.correlatedQuestionCount,bySection[section.id],`${section.id}: correlated count`);
  assert.equal(section.primaryQuestionCount,primaryBySection[section.id],`${section.id}: primary count`);
  assert.equal(edital.subjectQuestionCounts[section.title],bySection[section.id],`${section.id}: subject pool count`);
  assert.equal(edital.canonicalAxes.filter(axis=>axis.sectionId===section.id).length,section.topicCount,`${section.id}: topic count`);
}
for(const axis of edital.canonicalAxes){
  assert.ok(axis.id&&axis.topic&&axis.subject&&axis.sectionId,`incomplete edital topic: ${axis.id}`);
  assert.equal(axis.directQuestionCount,0,`${axis.id}: no exact item link`);
  assert.ok(sectionById.has(axis.sectionId),`${axis.id}: section`);
  assert.equal(axis.subject,sectionById.get(axis.sectionId).title,`${axis.id}: matter`);
}
assert.equal([...sourceCounts.entries()].filter(([id])=>id.startsWith('tcego-')).reduce((sum,[,count])=>sum+count,0),280,'TCE-GO source questions');
assert.equal([...sourceCounts.entries()].filter(([id])=>id.startsWith('tcece-')).reduce((sum,[,count])=>sum+count,0),60,'other Tribunal de Contas source questions');
assert.deepEqual([...sourceCounts.keys()],materials.map(([,id])=>id),'source priority: 2022 TCE-GO, 2014 TCE-GO, then TCE-CE');
const tce=competitions.find(item=>item.id==='tce-go');
assert.equal(tce?.topicCount,448,'TCE-GO competition topic metadata');
assert.equal(tce?.questionCount,340,'TCE-GO competition question metadata');
const seedf=competitions.find(item=>item.id==='seedf');
assert.deepEqual(seedf?.focusRoles,['Gestor — Administração','Analista — Apoio Administrativo']);
assert.deepEqual(seedf?.sharedRoles,['Núcleo comum']);
assert.deepEqual(seedf?.excludedRoles,['Analista — Monitor']);
console.log('OK: 340 questões FCC, 448 tópicos, pools por matéria com sobreposição explícita, zero vínculos exatos e fontes ordenadas por prioridade.');
