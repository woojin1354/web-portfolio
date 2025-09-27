// scripts/fetch-notion.js  (ESM)
// Node 20 내장 fetch 사용
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

// --- blocks → plain text lines ---
// 모든 하위 블록을 재귀로 펼쳐서 plain text 배열로 변환합니다.
async function fetchBlockChildren(blockId) {
  const lines = [];
  let cursor;
  do {
    const data = await notionGet(`${BASE}/blocks/${blockId}/children${cursor ? `?start_cursor=${cursor}` : ''}`);
    for (const b of data.results ?? []) {
      lines.push(...await blockToPlainLines(b));
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return lines;
}

function richToText(rich) {
  return (rich ?? []).map(r => r?.plain_text ?? '').join('');
}

async function blockToPlainLines(block, depth = 0) {
  const indent = '  '.repeat(Math.min(depth, 6));
  const out = [];
  const t = block.type;

  // 텍스트 본문 추출
  const get = (k) => richToText(block[t]?.rich_text);

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
      out.push(indent + `💡 ${txt}`);
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
    case 'bookmark':
    case 'link_to_page':
    case 'equation':
    case 'synced_block':
    case 'template':
    case 'table':
    case 'table_row':
    case 'video':
    case 'image':
    case 'pdf':
    case 'file':
    case 'embed': {
      // 미지원/비텍스트 블록은 간단한 표시만
      out.push(indent + `[${t}]`);
      break;
    }
    default: {
      // 알 수 없는 타입도 라인으로 표시
      out.push(indent + `[${t}]`);
      break;
    }
  }

  // 하위 블록 재귀
  if (block.has_children) {
    const childLines = await fetchBlockChildren(block.id);
    for (const ln of childLines) {
      out.push(ln);
    }
  }
  return out;
}

async function fetchPagePlainContent(pageId) {
  try {
    return await fetchBlockChildren(pageId);
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
    description: '', // 별도 속성을 쓰지 않으면 비워둠
    lastEdited: page.last_edited_time,
    url: page.url,
  };
}

async function main() {
  const pages = await fetchAllPages();

  // 페이지 본문까지 포함해서 병렬 처리
  const projects = await Promise.all(
    pages.map(async (page) => {
      const base = mapPropsOnly(page);
      const content = await fetchPagePlainContent(page.id); // ← 전체 본문(plain lines)
      return { ...base, content }; // content: string[]
    })
  );

  const out = { projects, generatedAt: new Date().toISOString() };
  const outPath = path.join(process.cwd(), 'public', 'projects.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`Wrote ${projects.length} projects → ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
