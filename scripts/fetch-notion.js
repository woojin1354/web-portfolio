// scripts/fetch-notion.js (ESM, Node 20)
// - 표(table)는 HTML 문자열에 "__HTML__:" 프리픽스 붙여 content에 넣음
// - 첨부/이미지/북마크 등은 "라벨 한 줄" + "URL: ..." 한 줄로만 출력 (호스트 요약/캡션 생략)
// - JSX 절대 사용하지 않음

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

const HTML_PREFIX = '__HTML__:'; // 안전 HTML 마커

// ---------- Notion HTTP ----------
async function notionPost(url, body) {
  const res = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body ?? {}) });
  if (!res.ok) throw new Error(`Notion API error ${res.status} @ POST ${url} :: ${await res.text()}`);
  return res.json();
}
async function notionGet(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Notion API error ${res.status} @ GET ${url} :: ${await res.text()}`);
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

// ---------- Property pickers ----------
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

// ---------- Helpers ----------
function richToText(rich) { return (rich ?? []).map(r => r?.plain_text ?? '').join(''); }
function rtCellToTextArr(richArr) { return (richArr ?? []).map(r => r?.plain_text ?? '').join(''); }

// children (pagination)
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

// Safe HTML (table)
function esc(s = '') {
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}
function makeHtmlTable(rows, hasColHeader, hasRowHeader) {
  const trs = rows.map((cells, ri) => {
    const tds = cells.map((txt, ci) => {
      const isHeader = (hasColHeader && ri === 0) || (hasRowHeader && ci === 0);
      const Tag = isHeader ? 'th' : 'td';
      return `<${Tag}>${esc(String(txt ?? '')).replaceAll('\n','<br/>')}</${Tag}>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  return `<div class="notion-table-wrap"><table class="notion-table"><tbody>${trs}</tbody></table></div>`;
}

// ---------- Block -> lines/HTML ----------
async function blockToPlainLines(block, depth = 0) {
  const indent = '  '.repeat(Math.min(depth, 6));
  const out = [];
  const t = block.type;
  const get = () => richToText(block[t]?.rich_text);

  switch (t) {
    case 'paragraph': {
      const txt = get(); if (txt.trim()) out.push(indent + txt);
      break;
    }
    case 'heading_1':
    case 'heading_2':
    case 'heading_3': {
      const txt = get(); if (txt.trim()) {
        const mark = t === 'heading_1' ? '# ' : t === 'heading_2' ? '## ' : '### ';
        out.push(indent + mark + txt);
      }
      break;
    }
    case 'bulleted_list_item': { out.push(indent + '• ' + get()); break; }
    case 'numbered_list_item': { out.push(indent + '1. ' + get()); break; } // 간단 표기
    case 'to_do': {
      const txt = richToText(block.to_do?.rich_text);
      out.push(indent + `${block.to_do?.checked ? '[x]' : '[ ]'} ${txt}`);
      break;
    }
    case 'quote': { out.push(indent + `> ${get()}`); break; }
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
    case 'toggle': { out.push(indent + '▸ ' + richToText(block.toggle?.rich_text)); break; }

    // 미디어/링크: 라벨 한 줄 + URL 줄 (간단/일관)
    case 'image': {
      const d = block.image;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      out.push(indent + `🖼️ 이미지`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'file': {
      const d = block.file;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      const name = d?.name || '파일';
      out.push(indent + `📎 ${name}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'pdf': {
      const d = block.pdf;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      const name = d?.name || 'PDF';
      out.push(indent + `📄 ${name}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'video': {
      const d = block.video;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      out.push(indent + `🎞️ 비디오`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'embed': {
      const url = block.embed?.url ?? null;
      out.push(indent + `🔗 임베드`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'bookmark': {
      const url = block.bookmark?.url ?? null;
      out.push(indent + `🔖 북마크`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }

    // 표 → HTML 문자열 + 프리픽스
    case 'table': {
      const hasColHeader = !!block.table?.has_column_header;
      const hasRowHeader = !!block.table?.has_row_header;
      const children = await fetchBlockChildrenRaw(block.id);
      const rows = children
        .filter(c => c.type === 'table_row')
        .map(c => (c.table_row?.cells ?? []).map(rtCellToTextArr));
      const html = makeHtmlTable(rows, hasColHeader, hasRowHeader);
      out.push(HTML_PREFIX + html);
      return out;
    }

    default: {
      out.push(indent + `[${t}]`);
      break;
    }
  }

  // children 재귀 (table 제외)
  if (block.has_children && block.type !== 'table') {
    const kids = await fetchBlockChildrenRaw(block.id);
    for (const kb of kids) out.push(...await blockToPlainLines(kb, depth + 1));
  }
  return out;
}

async function fetchPagePlainContent(pageId) {
  try {
    const roots = await fetchBlockChildrenRaw(pageId);
    const lines = [];
    for (const b of roots) lines.push(...await blockToPlainLines(b, 0));
    // 연속 공백 1줄로 정리
    const out = [];
    let prevEmpty = false;
    for (const l of lines) {
      const empty = !l.trim();
      if (empty && prevEmpty) continue;
      out.push(l);
      prevEmpty = empty;
    }
    return out;
  } catch (e) {
    console.error('fetchPagePlainContent error:', e.message);
    return [];
  }
}

// ---------- Mapping & Main ----------
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
  const projects = await Promise.all(pages.map(async (page) => {
    const base = mapPropsOnly(page);
    const content = await fetchPagePlainContent(page.id);
    return { ...base, content };
  }));

  const out = { projects, generatedAt: new Date().toISOString() };
  const outPath = path.join(process.cwd(), 'public', 'projects.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`Wrote ${projects.length} projects → ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });