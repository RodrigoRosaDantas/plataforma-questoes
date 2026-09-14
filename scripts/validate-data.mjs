import fs from 'node:fs/promises';
const questions=JSON.parse(await fs.readFile('data/questions.json','utf8'));
const meta=JSON.parse(await fs.readFile('data/metadata.json','utf8'));
if(!Array.isArray(questions)) throw new Error('data/questions.json precisa ser um array.');
if(meta.questionCount!==questions.length) throw new Error(`metadata.questionCount (${meta.questionCount}) diverge do JSON (${questions.length}).`);
if(!meta.sampleMode && questions.length<1000) throw new Error(`Regressão de acervo: release não-amostra com apenas ${questions.length} questões.`);
const ids=new Set();
let invalid=0;
for(const q of questions){
  if(!q.id||!q.enunciado||!q.gabarito||!q.disciplina||!q.cargo||!q.banca) invalid++;
  if(ids.has(q.id)) throw new Error(`ID duplicado: ${q.id}`); ids.add(q.id);
  if(q.bloqueioManual||q.duplicada||String(q.auditoria).toLowerCase()==='não aprovada') throw new Error(`Gate editorial violado: ${q.id}`);
}
if(invalid) throw new Error(`${invalid} questões falharam nos campos essenciais.`);
console.log(`OK: ${questions.length} questões, IDs únicos e gates editoriais preservados${meta.sampleMode?' (modo amostra)':''}.`);
