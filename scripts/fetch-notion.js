// scripts/fetch-notion.js  (ESM)
// Node 20 내장 fetch 사용
// 표(table)는 안전한 HTML 문자열로 만들고, "__HTML__:" 프리픽스를 붙여 전달합니다.
// 나머지 블록은 텍스트 라인으로 만듭니다.

import fs from 'fs';
import path from 'path';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_TOKEN || !DB_ID) {
  console.error('Missing NOTION_TOKEN or NOTION_DATABASE_ID');
  process.exit(1);
}

const BASE = 'https://api.notion.com/v1';
const HEADERS = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

const HTML_PREFIX = '__HTML__:'; // ← 안전 HTML 마커

// ========== Notion HTTP ==========
async function notionPost(url, body) {
  const res = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body ?? {}) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Notion API error ${res.status} @ POST ${url} :: ${t}`);
  }
  return res.json();
}
async function notionGet(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Notion API error ${res.status} @ GET ${url} :: ${t}`);
  }
  return res.json();
}
async function fetchAllPages() {
  const pages = [];
  let body = { page_size: 100, sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }] };
  while (true) {
    const data = await notionPost(`${BASE}/databases/${DB_ID}/query`, body);
    pages.push(...(data.results ?? []));
    if (data.has_more && data.next_cursor) body.start_cursor = data.next_cursor;
    else break;
  }
  return pages;
}

// ========== Property pickers ==========
const plain = (rich) => (rich?.map?.(r => r?.plain_text ?? '').join('') ?? '');
function pickTitle(props) {
  const cand = props.Title?.title ?? props.Name?.title;
  if (cand?.length) return plain(cand);
  for (const v of Object.values(props)) {
    if (v?.type === 'title' && v.title?.length) return plain(v.title);
  }
  return '(제목 없음)';
}
function pickDate(props) {
  const c = props.Date?.date;
  if (c?.start) return c.start;
  for (const v of Object.values(props)) {
    if (v?.type === 'date' && v.date?.start) return v.date.start;
  }
  return null;
}
function pickTags(props) {
  const cand = props['Multi-select']?.multi_select ?? props.Tags?.multi_select;
  if (Array.isArray(cand)) return cand.map(t => t.name);
  for (const v of Object.values(props)) {
    if (v?.type === 'multi_select' && Array.isArray(v.multi_select)) {
      return v.multi_select.map(t => t.name);
    }
  }
  return [];
}
function pickStatus(props) {
  const s1 = props.Status?.status?.name ?? props.Status?.select?.name;
  if (s1) return s1;
  for (const v of Object.values(props)) {
    if (v?.type === 'status') return v.status?.name ?? '알수없음';
    if (v?.type === 'select') return v.select?.name ?? '알수없음';
  }
  return '알수없음';
}
function pickImage(page, props) {
  if (props.Image?.files?.length) {
    const f = props.Image.files[0];
    return f.type === 'external' ? f.external?.url : f.file?.url;
  }
  if (page.cover) {
    return page.cover.type === 'external' ? page.cover.external?.url : page.cover.file?.url;
  }
  return null;
}

// ========== Text helpers ==========
function richToText(rich) {
  return (rich ?? []).map(r => r?.plain_text ?? '').join('');
}
function rtCellToTextArr(richArr) {
  return (richArr ?? []).map(r => r?.plain_text ?? '').join('');
}
function truncate(s, n = 120) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function shortUrl(u) {
  try {
    const url = new URL(u);
    const parts = url.pathname.split('/').filter(Boolean);
    const tail = parts.slice(-1)[0] ?? '';
    return `${url.host}/${tail.slice(0, 24)}${tail.length > 24 ? '…' : ''}`;
  } catch { return u; }
}

// ========== Children fetch (pagination) ==========
async function fetchBlockChildrenRaw(blockId) {
  const results = [];
  let cursor;
  do {
    const data = await notionGet(`${BASE}/blocks/${blockId}/children${cursor ? `?start_cursor=${cursor}` : ''}`);
    results.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

// ========== Safe HTML ==========
function esc(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
function makeHtmlTable(rows, hasColHeader, hasRowHeader) {
  // rows: string[][]
  const trs = rows.map((cells, ri) => {
    const tds = cells.map((txt, ci) => {
      const isHeader = (hasColHeader && ri === 0) || (hasRowHeader && ci === 0);
      const Tag = isHeader ? 'th' : 'td';
      return `<${Tag}>${esc(String(txt ?? '')).replaceAll('\n', '<br/>')}</${Tag}>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  // 안전하게 우리가 만든 HTML임을 나타내는 wrapper + 클래스
  return `<div class="notion-table-wrap"><table class="notion-table"><tbody>${trs}</tbody></table></div>`;
}

// ========== Block → plain lines or HTML (table) ==========
async function blockToPlainLines(block, depth = 0) {
  const indent = '  '.repeat(Math.min(depth, 6));
  const out = [];
  const t = block.type;
  const get = () => richToText(block[t]?.rich_text);

  switch (t) {
    case 'paragraph': {
      const txt = get();
      if (txt.trim().length) out.push(indent + txt);
      break;
    }
    case 'heading_1':
    case 'heading_2':
    case 'heading_3': {
      const txt = get();
      if (txt.trim().length) {
        const mark = t === 'heading_1' ? '# ' : t === 'heading_2' ? '## ' : '### ';
        out.push(indent + mark + txt);
      }
      break;
    }
    case 'bulleted_list_item': {
      const txt = get();
      out.push(indent + '• ' + txt);
      break;
    }
    case 'numbered_list_item': {
      const txt = get();
      out.push(indent + '1. ' + txt);
      break;
    }
    case 'to_do': {
      const txt = richToText(block.to_do?.rich_text);
      const checked = block.to_do?.checked ? '[x]' : '[ ]';
      out.push(indent + `${checked} ${txt}`);
      break;
    }
    case 'quote': {
      const txt = get();
      out.push(indent + `> ${txt}`);
      break;
    }
    case 'callout': {
      const txt = richToText(block.callout?.rich_text);
      const emoji = block.callout?.icon?.emoji ?? '💡';
      out.push(indent + `${emoji} ${txt}`);
      break;
    }
    case 'code': {
      const txt = block.code?.rich_text?.map(r => r.plain_text ?? '').join('') ?? '';
      const lang = block.code?.language ?? '';
      out.push(indent + '```' + lang);
      out.push(...txt.split('\n').map(l => indent + l));
      out.push(indent + '```');
      break;
    }
    case 'toggle': {
      const txt = richToText(block.toggle?.rich_text);
      out.push(indent + '▸ ' + txt);
      break;
    }

    // ==== Media / Links (요약 + 실제 URL 별도 줄) ====
    case 'image': {
      const d = block.image;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      const cap = (d?.caption ?? []).map(c => c?.plain_text ?? '').join('');
      const label = url ? `(${shortUrl(url)})` : '';
      out.push(indent + `🖼️ 이미지 ${label}${cap ? ` — ${truncate(cap, 90)}` : ''}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'file': {
      const d = block.file;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      const name = d?.name ?? '파일';
      const cap = (d?.caption ?? []).map(c => c?.plain_text ?? '').join('');
      const label = url ? `(${shortUrl(url)})` : '';
      out.push(indent + `📎 ${name} ${label}${cap ? ` — ${truncate(cap, 90)}` : ''}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'pdf': {
      const d = block.pdf;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      const name = d?.name ?? 'PDF';
      const label = url ? `(${shortUrl(url)})` : '';
      out.push(indent + `📄 ${name} ${label}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'video': {
      const d = block.video;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      const label = url ? `(${shortUrl(url)})` : '';
      out.push(indent + `🎞️ 비디오 ${label}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'embed': {
      const d = block.embed;
      const url = d?.url ?? null;
      const label = url ? `(${shortUrl(url)})` : '';
      out.push(indent + `🔗 임베드 ${label}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'bookmark': {
      const d = block.bookmark;
      const url = d?.url ?? null;
      const cap = (d?.caption ?? []).map(c => c?.plain_text ?? '').join('');
      const label = url ? `(${shortUrl(url)})` : '';
      out.push(indent + `🔖 북마크 ${label}${cap ? ` — ${truncate(cap, 90)}` : ''}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }

    // ==== Table → HTML 테이블 문자열 + 프리픽스 ====
    case 'table': {
      const hasColHeader = !!block.table?.has_column_header;
      const hasRowHeader = !!block.table?.has_row_header;
      const children = await fetchBlockChildrenRaw(block.id);
      const rows = children
        .filter(c => c.type === 'table_row')
        .map(c => (c.table_row?.cells ?? []).map(rtCellToTextArr));

      const html = makeHtmlTable(rows, hasColHeader, hasRowHeader);
      out.push(HTML_PREFIX + html);   // ← "__HTML__:" + html
      return out; // 표는 여기서 종료
    }

    default: {
      out.push(indent + `[${t}]`);
      break;
    }
  }

  // children 재귀 (table 제외)
  if (block.has_children && block.type !== 'table') {
    const kids = await fetchBlockChildrenRaw(block.id);
    for (const kb of kids) {
      const childLines = await blockToPlainLines(kb, depth + 1);
      for (const ln of childLines) out.push(ln);
    }
  }
  return out;
}

async function fetchPagePlainContent(pageId) {
  try {
    const roots = await fetchBlockChildrenRaw(pageId);
    const lines = [];
    for (const b of roots) {
      const part = await blockToPlainLines(b, 0);
      lines.push(...part);
    }
    // 연속 공백 줄 정리
    const trimmed = [];
    let prevEmpty = false;
    for (const l of lines) {
      const empty = !l.trim();
      if (empty && prevEmpty) continue;
      trimmed.push(l);
      prevEmpty = empty;
    }
    return trimmed;
  } catch (e) {
    console.error('fetchPagePlainContent error:', e.message);
    return [];
  }
}

// ========== Mapping & Main ==========
function mapPropsOnly(page) {
  const props = page.properties ?? {};
  return {
    id: page.id,
    title: pickTitle(props),
    date: pickDate(props),
    tags: pickTags(props),
    status: pickStatus(props),
    image: pickImage(page, props),
    description: '',
    lastEdited: page.last_edited_time,
    url: page.url,
  };
}

async function main() {
  const pages = await fetchAllPages();
  const projects = await Promise.all(
    pages.map(async (page) => {
      const base = mapPropsOnly(page);
      const content = await fetchPagePlainContent(page.id); // 텍스트 라인 + (table은 HTML-프리픽스)
      return { ...base, content };
    })
  );

  const out = { projects, generatedAt: new Date().toISOString() };
  const outPath = path.join(process.cwd(), 'public', 'projects.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`Wrote ${projects.length} projects → ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });