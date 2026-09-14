import fs from 'node:fs/promises';
import path from 'node:path';

const token = process.env.NOTION_TOKEN;
const dataSourceId = process.env.NOTION_DATA_SOURCE_ID || '784234ae-deca-4514-b60d-19524e122a89';
const apiVersion = '2026-03-11';
if (!token) throw new Error('NOTION_TOKEN não configurado. Use um GitHub Actions Secret; nunca exponha o token no frontend.');

const endpoint = `https://api.notion.com/v1/data_sources/${dataSourceId}/query`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    sourceUrl: get(p,'URL da fonte') || '',
    notionUrl: page.url,
    updatedAt: page.last_edited_time || null,
    publishedAt: get(p,'Data da publicação') || null
  };
}
function publishable(q) {
  if (!q.enunciado || !q.gabarito) return false;
  if (q.duplicada || q.bloqueioManual) return false;
  if (String(q.auditoria).toLowerCase() === 'não aprovada') return false;
  return true;
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
const questions = transformed.filter(publishable);
const excluded = transformed.length - questions.length;
const formats = Object.fromEntries([...questions.reduce((m,q)=>m.set(q.formato,(m.get(q.formato)||0)+1),new Map())]);
const missing = {
  enunciado: transformed.filter(q=>!q.enunciado).length,
  gabarito: transformed.filter(q=>!q.gabarito).length,
  disciplina: transformed.filter(q=>!q.disciplina).length,
  assunto: transformed.filter(q=>!q.assunto).length,
  cargo: transformed.filter(q=>!q.cargo).length,
  fonte: transformed.filter(q=>!q.banca).length
};
const metadata = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'Notion Banco Mestre — conteúdo editorial de questões',
  dataSourceId,
  notionApiVersion: apiVersion,
  sampleMode: false,
  questionCount: questions.length,
  sourceAudit: { records: transformed.length, published: questions.length, excluded, formats, missing }
};
await fs.mkdir(path.resolve('data'), { recursive: true });
await fs.writeFile('data/questions.json', JSON.stringify(questions,null,2)+'\n');
await fs.writeFile('data/metadata.json', JSON.stringify(metadata,null,2)+'\n');
console.log(`Release gerada: ${questions.length} publicáveis; ${excluded} excluídos por gate.`);
