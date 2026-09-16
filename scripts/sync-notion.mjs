import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const token = process.env.NOTION_TOKEN;
const dataSourceId = process.env.NOTION_DATA_SOURCE_ID || '784234ae-deca-4514-b60d-19524e122a89';
const apiVersion = '2026-03-11';
if (!token) throw new Error('NOTION_TOKEN não configurado. Use um GitHub Actions Secret; nunca exponha o token no frontend.');

const endpoint = `https://api.notion.com/v1/data_sources/${dataSourceId}/query`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
async function readPreviousQuestions() {
  try {
    const previous = JSON.parse(await fs.readFile('data/questions.json', 'utf8'));
    return Array.isArray(previous) ? previous : [];
  } catch {
    return [];
  }
}
async function request(cursor = null, attempt = 0) {
  const body = { page_size: 100, result_type: 'page' };
  if (cursor) body.start_cursor = cursor;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': apiVersion,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if ((res.status === 429 || res.status === 503) && attempt < 5) {
    const retry = Number(res.headers.get('retry-after') || 0);
    await sleep((retry ? retry * 1000 : 1000 * 2 ** attempt) + Math.floor(Math.random() * 300));
    return request(cursor, attempt + 1);
  }
  if (!res.ok) throw new Error(`Notion ${res.status}: ${await res.text()}`);
  return res.json();
}

const plain = rich => (rich || []).map(x => x.plain_text || '').join('').trim();
function value(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title': return plain(prop.title);
    case 'rich_text': return plain(prop.rich_text);
    case 'select': return prop.select?.name ?? null;
    case 'status': return prop.status?.name ?? null;
    case 'number': return prop.number;
    case 'checkbox': return !!prop.checkbox;
    case 'url': return prop.url ?? null;
    case 'date': return prop.date?.start ?? null;
    case 'created_time': return prop.created_time ?? null;
    case 'last_edited_time': return prop.last_edited_time ?? null;
    case 'files': return (prop.files || []).map(f => f.file?.url || f.external?.url).filter(Boolean);
    case 'formula': {
      const f = prop.formula || {};
      if (f.type === 'string') return f.string;
      if (f.type === 'boolean') return f.boolean;
      if (f.type === 'number') return f.number;
      if (f.type === 'date') return f.date?.start ?? null;
      return null;
    }
    default: return null;
  }
}
function get(p, name) { return value(p[name]); }
function usableGabarito(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized && !['anulada','sem gabarito'].includes(normalized);
}
function normalizeFormat(original, gabarito, alternatives) {
  if (original) return original;
  if (['Certo','Errado'].includes(gabarito)) return 'Certo / Errado';
  const keys = Object.entries(alternatives).filter(([,v]) => v).map(([k]) => k);
  if (keys.includes('E')) return 'Múltipla escolha A–E';
  if (keys.includes('D')) return 'Múltipla escolha A–D';
  return 'Outro';
}
function transform(page) {
  const p = page.properties || {};
  const alternativas = Object.fromEntries(['A','B','C','D','E'].map(k => [k, get(p, `Alternativa ${k}`) || '']));
  const gabarito = get(p,'Gabarito') || '';
  const formatoOriginal = get(p,'Formato da questão') || '';
  const codigo = get(p,'Código') || get(p,'Questão') || page.id;
  return {
    id: codigo,
    notionPageId: page.id,
    concurso: get(p,'Concurso') || '',
    edital: get(p,'Edital') || '',
    topicoEdital: get(p,'Tópico do edital') || '',
    orgao: get(p,'Órgão') || '',
    cargo: get(p,'Cargo') || '',
    codigoCargo: get(p,'Código do cargo') || '',
    banca: get(p,'Fonte / Banca') || '',
    ano: get(p,'Ano') || null,
    disciplina: get(p,'Disciplina') || '',
    materia: get(p,'Disciplina') || '',
    assunto: get(p,'Assunto') || '',
    subassunto: get(p,'Subassunto') || '',
    formato: normalizeFormat(formatoOriginal,gabarito,alternativas),
    formatoOriginal,
    tipoMaterial: get(p,'Tipo de material') || '',
    nomeMaterial: get(p,'Nome do material') || '',
    numeroOriginal: get(p,'Número original') || null,
    enunciado: get(p,'Enunciado') || '',
    textoBase: get(p,'Texto-base') || '',
    alternativas,
    gabarito,
    comentarioGeral: get(p,'Comentário geral') || '',
    fundamentoLegal: get(p,'Fundamento legal') || '',
    pegadinha: get(p,'Pegadinha') || '',
    possuiImagem: !!get(p,'Possui imagem'),
    descricaoImagem: get(p,'Descrição da imagem') || '',
    anulada: !!get(p,'Anulada') || gabarito === 'Anulada',
    duplicada: !!get(p,'Duplicada'),
    bloqueioManual: !!get(p,'Bloqueio manual de publicação'),
    auditoria: get(p,'Auditoria de conteúdo') || '',
    exportApproved: !!get(p,'Liberada para exportação'),
    sourceUrl: get(p,'URL da fonte') || '',
    notionUrl: page.url,
    updatedAt: page.last_edited_time || null,
    publishedAt: get(p,'Data da publicação') || null
  };
}
function governedByCanonicalTaxonomy(q) {
  return [q.concurso, q.edital, q.topicoEdital].every(value => String(value || '').trim());
}
function publishable(q) {
  if (!q.id || !q.enunciado || !usableGabarito(q.gabarito)) return false;
  if (!q.disciplina || !q.cargo || !q.banca) return false;
  if (q.anulada || q.duplicada || q.bloqueioManual) return false;
  if (q.formato === 'Discursiva') return false;
  if (q.formato !== 'Certo / Errado' && Object.values(q.alternativas).filter(v => String(v || '').trim()).length < 2) return false;
  if (String(q.auditoria).toLowerCase() === 'não aprovada') return false;
  // Migração segura: registros integralmente ligados à taxonomia canônica
  // exigem aprovação editorial explícita no Notion. O legado ainda não
  // verticalizado preserva a regra anterior até sua auditoria/migração.
  if (governedByCanonicalTaxonomy(q) && !q.exportApproved) return false;
  return true;
}
function countMissing(rows) {
  return {
    enunciado: rows.filter(q=>!q.enunciado).length,
    gabarito: rows.filter(q=>!usableGabarito(q.gabarito)).length,
    concurso: rows.filter(q=>!q.concurso).length,
    edital: rows.filter(q=>!q.edital).length,
    topicoEdital: rows.filter(q=>!q.topicoEdital).length,
    disciplina: rows.filter(q=>!q.disciplina).length,
    assunto: rows.filter(q=>!q.assunto).length,
    subassunto: rows.filter(q=>!q.subassunto).length,
    cargo: rows.filter(q=>!q.cargo).length,
    fonte: rows.filter(q=>!q.banca).length
  };
}
function taxonomyCoverage(rows) {
  const total=rows.length;
  const fields=['concurso','edital','topicoEdital','disciplina','assunto','subassunto','cargo'];
  return Object.fromEntries(fields.map(field=>{
    const filled=rows.filter(q=>String(q[field]??'').trim()).length;
    return [field,{filled,missing:total-filled,coveragePercent:total?Number((filled/total*100).toFixed(2)):0}];
  }));
}

let cursor = null, raw = [];
do {
  const page = await request(cursor);
  raw.push(...(page.results || []));
  cursor = page.has_more ? page.next_cursor : null;
  process.stdout.write(`\rNotion: ${raw.length} registros lidos`);
} while (cursor);
process.stdout.write('\n');

const transformed = raw.map(transform);
const previousById = new Map((await readPreviousQuestions()).map(question => [String(question.id), question]));
for (const question of transformed) {
  const hash = contentHash(question);
  const previous = previousById.get(String(question.id));
  const previousVersion = Number(previous?.contentVersion) || 0;
  question.contentHash = hash;
  question.contentVersion = String(previous?.contentHash || '') === hash
    ? Math.max(1, previousVersion)
    : Math.max(1, previousVersion + 1);
  question.sourceSnapshot = {
    dataSourceId,
    pageId: question.notionPageId || null,
    lastEditedAt: question.updatedAt || null,
    contentHash: hash
  };
}
const publishableQuestions = transformed.filter(publishable);
const questions = publishableQuestions.map(({ exportApproved, ...question }) => question);
const releaseSnapshotId = createHash('sha256')
  .update(stableStringify(questions.map(question => ({ id: question.id, contentHash: question.contentHash })).sort((a,b) => String(a.id).localeCompare(String(b.id)))))
  .digest('hex');
questions.forEach(question => {
  question.sourceSnapshot.releaseId = releaseSnapshotId;
});
const excluded = transformed.length - questions.length;
const formats = Object.fromEntries([...questions.reduce((m,q)=>m.set(q.formato,(m.get(q.formato)||0)+1),new Map())]);
const missing = countMissing(transformed);
const publishedMissing = countMissing(questions);
const taxonomy = {
  source: taxonomyCoverage(transformed),
  published: taxonomyCoverage(questions)
};
const governance = {
  canonicalRecords: transformed.filter(governedByCanonicalTaxonomy).length,
  canonicalApproved: transformed.filter(q => governedByCanonicalTaxonomy(q) && q.exportApproved).length,
  canonicalBlockedByApproval: transformed.filter(q => governedByCanonicalTaxonomy(q) && !q.exportApproved).length,
  legacyCompatibilityRecords: transformed.filter(q => !governedByCanonicalTaxonomy(q)).length
};
const metadata = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  releaseSnapshotId,
  scoringPolicy: {
    version: 1,
    blankCountsAsWrong: false,
    negativeMarking: 0,
    annulledExcluded: true,
    precisionDenominator: 'answered',
    feedback: 'after-confirmation'
  },
  source: 'Notion Banco Mestre — conteúdo editorial de questões',
  dataSourceId,
  notionApiVersion: apiVersion,
  releasePolicy: {
    excludesAnuladas: true,
    excludesSemGabarito: true,
    excludesDiscursivas: true,
    requiresEssentialFields: true,
    canonicalTaxonomyRequiresExportApproval: true,
    legacyCompatibilityUntilCanonicalMigration: true
  },
  sampleMode: false,
  questionCount: questions.length,
  sourceAudit: { records: transformed.length, published: questions.length, excluded, formats, missing, publishedMissing, taxonomy }
};
metadata.sourceAudit.governance = governance;
await fs.mkdir(path.resolve('data'), { recursive: true });
await fs.writeFile('data/questions.json', JSON.stringify(questions,null,2)+'\n');
await fs.writeFile('data/metadata.json', JSON.stringify(metadata,null,2)+'\n');
console.log(`Release gerada: ${questions.length} publicáveis; ${excluded} excluídos por gate.`);
console.log(`Governança canônica: ${governance.canonicalApproved}/${governance.canonicalRecords} aprovados para exportação; ${governance.canonicalBlockedByApproval} retidos.`);
console.log(`Cobertura publicada: Concurso ${taxonomy.published.concurso.coveragePercent}% · Assunto ${taxonomy.published.assunto.coveragePercent}% · Subassunto ${taxonomy.published.subassunto.coveragePercent}% · Tópico do edital ${taxonomy.published.topicoEdital.coveragePercent}%.`);
