import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}
function canonicalQuestion(question) {
  return {
    id: question.id,
    enunciado: question.enunciado,
    textoBase: question.textoBase,
    alternativas: question.alternativas,
    gabarito: question.gabarito,
    disciplina: question.disciplina,
    assunto: question.assunto,
    subassunto: question.subassunto,
    formato: question.formato,
    banca: question.banca,
    cargo: question.cargo,
    concurso: question.concurso,
    edital: question.edital,
    topicoEdital: question.topicoEdital,
    comentarioGeral: question.comentarioGeral,
    fundamentoLegal: question.fundamentoLegal,
    pegadinha: question.pegadinha
  };
}
function contentHash(question) {
  return createHash('sha256').update(stableStringify(canonicalQuestion(question))).digest('hex');
}
const questions=JSON.parse(await fs.readFile('data/questions.json','utf8'));
const meta=JSON.parse(await fs.readFile('data/metadata.json','utf8'));
if(!Array.isArray(questions)) throw new Error('data/questions.json precisa ser um array.');
if(meta.questionCount!==questions.length) throw new Error(`metadata.questionCount (${meta.questionCount}) diverge do JSON (${questions.length}).`);
if(!meta.sampleMode && questions.length<1000) throw new Error(`Regressão de acervo: release não-amostra com apenas ${questions.length} questões.`);
if(meta.schemaVersion<2) throw new Error('Metadata sem contrato canônico v2.');
if(!meta.releaseSnapshotId) throw new Error('Metadata sem releaseSnapshotId.');
const ids=new Set();
let invalid=0;
const unusableGabaritos=new Set(['anulada','sem gabarito']);
for(const q of questions){
  if(!q.id||!q.enunciado||!q.gabarito||!q.disciplina||!q.cargo||!q.banca) invalid++;
  if(!Number.isInteger(q.contentVersion)||q.contentVersion<1) throw new Error('Questão sem versão canônica: '+q.id);
  if(!/^[0-9a-f]{64}$/.test(String(q.contentHash||''))) throw new Error('Hash canônico inválido: '+q.id);
  if(contentHash(q)!==q.contentHash) throw new Error('Hash canônico divergente: '+q.id);
  if(!q.sourceSnapshot||q.sourceSnapshot.pageId!==q.notionPageId||q.sourceSnapshot.contentHash!==q.contentHash||q.sourceSnapshot.releaseId!==meta.releaseSnapshotId) throw new Error('Snapshot de origem inconsistente: '+q.id);
  if(ids.has(q.id)) throw new Error(`ID duplicado: ${q.id}`); ids.add(q.id);
  if(q.bloqueioManual||q.duplicada||String(q.auditoria).toLowerCase()==='não aprovada') throw new Error(`Gate editorial violado: ${q.id}`);
  if(q.anulada||unusableGabaritos.has(String(q.gabarito||'').trim().toLowerCase())) throw new Error(`Questão anulada/sem gabarito publicada: ${q.id}`);
  if(q.formato==='Discursiva') throw new Error(`Formato discursivo sem fluxo de correção objetiva: ${q.id}`);
  if(q.formato!=='Certo / Errado' && Object.values(q.alternativas||{}).filter(v=>String(v||'').trim()).length<2) throw new Error(`Questão sem alternativas suficientes: ${q.id}`);
}
const expectedReleaseSnapshotId = createHash('sha256')
  .update(stableStringify(questions.map(question => ({id: question.id, contentHash: question.contentHash})).sort((a,b) => String(a.id).localeCompare(String(b.id)))))
  .digest('hex');
if(expectedReleaseSnapshotId!==meta.releaseSnapshotId) throw new Error('releaseSnapshotId divergente do catálogo publicado.');

if(invalid) throw new Error(`${invalid} questões falharam nos campos essenciais.`);
if(meta.sourceAudit?.published!==undefined && meta.sourceAudit.published!==questions.length) throw new Error('metadata.sourceAudit.published diverge do JSON.');
if(meta.sourceAudit?.records!==undefined && meta.sourceAudit.published!==undefined && meta.sourceAudit.records!==meta.sourceAudit.published+(meta.sourceAudit.excluded||0)) throw new Error('Auditoria de origem inconsistente: publicados + excluídos não fecha o total.');

const tjdftProvas=JSON.parse(await fs.readFile('data/tjdft-provas.json','utf8'));
if(!Array.isArray(tjdftProvas)||tjdftProvas.length!==38) throw new Error('Catálogo TJDFT incompleto: esperado 38 cadernos oficiais.');
const proofIds=new Set(), proofUrls=new Set();
for(const exam of tjdftProvas){
  for(const field of ['id','career','level','examType','board','proofUrl','answerKeyUrl','noticeUrl','sourcePageUrl','officialPortalUrl']) if(!exam[field]) throw new Error('Catálogo TJDFT sem '+field+'.');
  if(exam.competitionId!=='tjdft'||exam.year!==2022||exam.board!=='FGV'||exam.objectiveCount!==60) throw new Error('Metadado TJDFT inconsistente: '+exam.id);
  if(!/^https:\/\/conhecimento\.fgv\.br\//.test(exam.proofUrl)||!/^https:\/\/conhecimento\.fgv\.br\//.test(exam.answerKeyUrl)||!/^https:\/\/conhecimento\.fgv\.br\//.test(exam.noticeUrl)||!/^https:\/\/conhecimento\.fgv\.br\//.test(exam.sourcePageUrl)) throw new Error('Fonte oficial FGV inválida: '+exam.id);
  if(!/^https:\/\/www\.tjdft\.jus\.br\//.test(exam.officialPortalUrl)) throw new Error('Portal TJDFT inválido: '+exam.id);
  if(proofIds.has(exam.id)) throw new Error('ID duplicado no catálogo TJDFT: '+exam.id);
  if(proofUrls.has(exam.proofUrl)) throw new Error('URL duplicada no catálogo TJDFT: '+exam.proofUrl);
  proofIds.add(exam.id); proofUrls.add(exam.proofUrl);
}

const examsByCareer=new Map();
for(const exam of tjdftProvas){
  if(!examsByCareer.has(exam.career)) examsByCareer.set(exam.career,[]);
  examsByCareer.get(exam.career).push(exam);
}
if(examsByCareer.size!==17) throw new Error(`Catálogo TJDFT deveria representar 17 cargos, mas contém ${examsByCareer.size}.`);
const canonicalExamByCareer=new Map();
for(const [career,exams] of examsByCareer){
  const types=new Set(exams.map(exam=>exam.examType));
  if(types.size!==exams.length) throw new Error('Tipo de caderno duplicado no cargo: '+career);
  const canonical=exams.filter(exam=>exam.examType==='Tipo 1');
  if(canonical.length!==1) throw new Error('Cada cargo TJDFT precisa de exatamente um caderno canônico Tipo 1: '+career);
  canonicalExamByCareer.set(career,canonical[0]);
}
const interactiveTjdft=questions.filter(q=>q.concurso==='TJDFT 2022'&&q.banca==='FGV');
const interactiveByCareer=new Map();
for(const question of interactiveTjdft){
  const canonical=canonicalExamByCareer.get(question.cargo);
  if(!canonical) throw new Error('Questão TJDFT sem caderno canônico catalogado: '+question.id);
  if(question.sourceUrl!==canonical.proofUrl) throw new Error('Questão TJDFT não aponta para o caderno Tipo 1 do cargo: '+question.id);
  if(!/-T1-Q\d{2}$/.test(question.id)) throw new Error('Questão TJDFT fora do padrão canônico Tipo 1: '+question.id);
  if(!Number.isInteger(question.numeroOriginal)||question.numeroOriginal<1||question.numeroOriginal>canonical.objectiveCount) throw new Error('Número original TJDFT inválido: '+question.id);
  if(!interactiveByCareer.has(question.cargo)) interactiveByCareer.set(question.cargo,new Set());
  const numbers=interactiveByCareer.get(question.cargo);
  if(numbers.has(question.numeroOriginal)) throw new Error('Questão TJDFT duplicada por cargo/número: '+question.id);
  numbers.add(question.numeroOriginal);
}

console.log(`OK: ${questions.length} questões, IDs únicos e gates editoriais preservados${meta.sampleMode?' (modo amostra)':''}; ${tjdftProvas.length} cadernos oficiais, ${canonicalExamByCareer.size} provas canônicas Tipo 1 e ${interactiveByCareer.size} provas TJDFT interativas.`);
