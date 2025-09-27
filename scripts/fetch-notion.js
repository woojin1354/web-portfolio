import fs from 'fs';
import path from 'path';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_TOKEN || !DB_ID) {
  console.error('Missing NOTION_TOKEN or NOTION_DATABASE_ID');
  process.exit(1);
}

const NOTION_API = `https://api.notion.com/v1/databases/${DB_ID}/query`;
const HEADERS = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

const plain = (rich) => (rich?.map?.(r => r?.plain_text ?? '').join('') ?? '');

async function fetchAllPages() {
  const pages = [];
  let body = { page_size: 100, sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }] };
  while (true) {
    const resp = await fetch(NOTION_API, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
    if (!resp.ok) {
      const t = await resp.text();
      console.error('Notion API error:', resp.status, t);
      process.exit(1);
    }
    const data = await resp.json();
    pages.push(...(data.results ?? []));
    if (data.has_more && data.next_cursor) {
      body.start_cursor = data.next_cursor;
    } else break;
  }
  return pages;
}

function pickTitle(props) {
  const cand = props.Title?.title ?? props.Name?.title;
  if (cand?.length) return plain(cand);
  for (const v of Object.values(props)) {
    if (v?.type === 'title' && v.title?.length) return plain(v.title);
  }
  return '(제목 없음)';
}

function pickDate(props) {
  const cand = props.Date?.date;
  if (cand?.start) return cand.start;
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
  // 1) "Status"라는 이름의 status/select 우선
  const s1 = props.Status?.status?.name ?? props.Status?.select?.name;
  if (s1) return s1;

  // 2) 어떤 컬럼이든 type이 status/select이면 그걸 사용
  for (const v of Object.values(props)) {
    if (v?.type === 'status') return v.status?.name ?? '알수없음';
    if (v?.type === 'select') return v.select?.name ?? '알수없음';
  }
  return '알수없음';
}

function pickImage(page, props) {
  // Image 파일 컬럼이 있으면 우선 사용
  if (props.Image?.files?.length) {
    const f = props.Image.files[0];
    return f.type === 'external' ? f.external?.url : f.file?.url;
  }
  // 없으면 page.cover 사용
  if (page.cover) {
    return page.cover.type === 'external' ? page.cover.external?.url : page.cover.file?.url;
  }
  return null; // 프론트에서 기본 이미지로 대체
}

function mapPage(page) {
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
  };
}

async function main() {
  const pages = await fetchAllPages();
  const projects = pages.map(mapPage);
  const out = { projects, generatedAt: new Date().toISOString() };
  const outPath = path.join(process.cwd(), 'public', 'projects.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`Wrote ${projects.length} projects → ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
