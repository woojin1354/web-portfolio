// scripts/fetch-notion.js  (ESM)
// Node 20 내장 fetch 사용 - Popup.js가 content: string[]만 읽으므로
// 표/파일 등을 '사람이 읽을 수 있는 평문'으로 ASCII 렌더링합니다.

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

const plain = (rich) => (rich?.map?.(r => r?.plain_text ?? '').join('') ?? '');

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

// --- properties pickers ---
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

// --- helpers for text rendering ---
function richToText(rich) {
  return (rich ?? []).map(r => r?.plain_text ?? '').join('');
}
function rtCellToTextArr(richArr) {
  // table_cell의 rich_text[] → 하나의 문자열로
  return (richArr ?? []).map(r => r?.plain_text ?? '').join('');
}
function truncate(s, n = 120) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ASCII 테이블 유틸
function makeAsciiTable(rows, hasColHeader, hasRowHeader) {
  // rows: string[][]  (각 행의 셀 텍스트)
  if (!rows.length) return ['(빈 표)'];

  const colCount = Math.max(...rows.map(r => r.length));
  const widths = Array.from({ length: colCount }, (_, i) =>
    Math.max(...rows.map(r => (r[i]?.length ?? 0)), 3)
  );

  const sep = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';

  const lineFor = (cells) =>
    '|' + cells.map((c, i) => ' ' + (c ?? '').padEnd(widths[i]) + ' ').join('|') + '|';

  const out = [];
  out.push('(표)');
  out.push(sep);

  rows.forEach((row, ri) => {
    // 행 헤더 효과: 첫 칸만 굵게는 못하지만 접두사로 표기
    const cells = row.map((c, ci) => {
      if ((hasRowHeader && ci === 0) || (hasColHeader && ri === 0)) {
        return String(c ?? '') + ''; // Popup은 텍스트만이므로 별도 마킹 생략
      }
      return String(c ?? '');
    });

    out.push(lineFor(cells));
    if (hasColHeader && ri === 0) out.push(sep);
  });

  out.push(sep);
  return out;
}

// children fetcher (분량 커질 수 있어 while-페이지네이션 처리)
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

// --- blocks -> "읽기 좋은 평문 라인" ---
// 주의: Popup.js가 줄 단위로만 보여주므로, 링크/강조/색상 등은 텍스트에 녹여 표시
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
      out.push(indent + '1. ' + txt); // 실번호는 Popup 제한상 유지 어려움
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

    // === 리치 미디어/링크: 사람이 읽을 수 있게 1~2줄 요약 ===
    case 'image': {
      const d = block.image;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      const cap = (d?.caption ?? []).map(c => c?.plain_text ?? '').join('');
      out.push(indent + `🖼️ 이미지${cap ? `: ${truncate(cap, 100)}` : ''}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'file': {
      const d = block.file;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      const name = d?.name ?? '파일';
      const cap = (d?.caption ?? []).map(c => c?.plain_text ?? '').join('');
      out.push(indent + `📎 파일: ${name}${cap ? ` — ${truncate(cap, 100)}` : ''}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'pdf': {
      const d = block.pdf;
      const url = d?.type === 'external' ? d.external?.url : d?.file?.url;
      const name = d?.name ?? 'PDF';
      out.push(indent + `📄 PDF: ${name}`);
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
      const d = block.embed;
      const url = d?.url ?? null;
      out.push(indent + `🔗 임베드`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }
    case 'bookmark': {
      const d = block.bookmark;
      const url = d?.url ?? null;
      const cap = (d?.caption ?? []).map(c => c?.plain_text ?? '').join('');
      out.push(indent + `🔖 북마크${cap ? `: ${truncate(cap, 100)}` : ''}`);
      if (url) out.push(indent + `URL: ${url}`);
      break;
    }

    // === 표: ASCII 테이블로 구성해 하나의 블록으로 렌더 ===
    case 'table': {
      const tw = block.table?.table_width ?? 0;
      const hasColHeader = !!block.table?.has_column_header;
      const hasRowHeader = !!block.table?.has_row_header;

      // 자식(table_row) 불러와서 셀 텍스트 추출
      const children = await fetchBlockChildrenRaw(block.id);
      const rows = children
        .filter(c => c.type === 'table_row')
        .map(c => (c.table_row?.cells ?? []).map(rtCellToTextArr));

      const lines = makeAsciiTable(rows, hasColHeader, hasRowHeader);
      out.push(...lines.map(l => indent + l));
      // table은 여기서 끝(행을 개별 라인으로 이미 변환했으므로 재귀 불필요)
      return out;
    }

    // 알 수 없는/미지원은 타입만
    default: {
      out.push(indent + `[${t}]`);
      break;
    }
  }

  // 하위 블록 재귀 (표는 위에서 처리했으므로 제외)
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
    // 루트: pageId 자체의 children
    const roots = await fetchBlockChildrenRaw(pageId);
    const lines = [];
    for (const b of roots) {
      const part = await blockToPlainLines(b, 0);
      lines.push(...part);
    }
    // 불필요한 연속 공백 라인 정리
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
      const content = await fetchPagePlainContent(page.id); // 평문화된 리치 텍스트 라인
      return { ...base, content };
    })
  );

  const out = { projects, generatedAt: new Date().toISOString() };
  const outPath = path.join(process.cwd(), 'public', 'projects.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`Wrote ${projects.length} projects → ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
