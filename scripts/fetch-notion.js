import { Client } from '@notionhq/client';
import fs from 'fs';
import path from 'path';


const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_TOKEN || !DB_ID) {
  console.error('Missing NOTION_TOKEN or NOTION_DATABASE_ID');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });
const plain = (rich) => (rich?.map?.(r => r?.plain_text).join('') ?? '');

async function fetchAll(database_id) {
  const out = [];
  let cursor;
  do {
    const resp = await notion.databases.query({
      database_id,
      start_cursor: cursor,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    });
    out.push(...resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return out;
}

function mapPage(page) {
  const p = page.properties ?? {};
  const title =
    p.Name?.title?.[0]?.plain_text ??
    p.Title?.title?.[0]?.plain_text ?? '(제목 없음)';

  const date = p.Date?.date?.start ?? null;

  const tags =
    p['Multi-select']?.multi_select?.map(t => t.name) ??
    p.Tags?.multi_select?.map(t => t.name) ?? [];

  const status = p.Status?.select?.name ?? '알수없음';

  let image = null;
  if (page.cover) {
    image = page.cover.type === 'external'
      ? page.cover.external?.url
      : page.cover.file?.url;
  }
  if (!image) image = null;
  
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
  const pages = await fetchAll(DB_ID);
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
