import fs from 'fs';
import path from 'path';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_TOKEN || !DB_ID) {
  console.error('Missing NOTION_TOKEN or NOTION_DATABASE_ID');
  process.exit(1);
}

const NOTION_API = 'https://api.notion.com/v1/databases/' + DB_ID + '/query';
const HEADERS = {
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

const plain = (rich) => (rich?.map?.(r => r?.plain_text).join('') ?? '');

async function fetchAllPages() {
  const pages = [];
  let body = {
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    page_size: 100
  };
  while (true) {
    const resp = await fetch(NOTION_API, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error('Notion API error:', resp.status, t);
      process.exit(1);
    }
    const data = await resp.json();
    pages.push(...(data.results || []));
    if (data.has_more && data.next_cursor) {
      body.start_cursor = data.next_cursor;
    } else {
      break;
    }
  }
  return pages;
}

function mapPage(page) {
  const props = page.properties || {};

  const title =
    props.Name?.title?.[0]?.plain_text ??
    props.Title?.title?.[0]?.plain_text ??
    '(제목 없음)';

  const date = props.Date?.date?.start ?? null;

  const tags =
    props['Multi-select']?.multi_select?.map(t => t.name) ??
    props.Tags?.multi_select?.map(t => t.name) ?? [];

  const status =
    props.Status?.status?.name ??
    props.Status?.select?.name ??
    '알수없음';

  let image = null;
  if (page.cover) {
    image = page.cover.type === 'external'
      ? page.cover.external?.url
      : page.cover.file?.url;
  }

  return {
    id: page.id,
    title,
    date,
    tags,
    status,
    image,
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

main().catch(err => {
  console.error(err);
  process.exit(1);
});