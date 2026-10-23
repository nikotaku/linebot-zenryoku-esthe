// GET /api/books
// NOTION_TOKEN があれば Notion から最新の読書記録をライブ取得。なければ 204 → フロントは同梱スナップショットを使う
const DB_ID = process.env.NOTION_DB_ID || 'b9002a5cd4dd41ecbb1413073338e3b4';

const plain = (rt = []) => rt.map((x) => x.plain_text).join('');

async function pageText(id, token) {
  const r = await fetch(`https://api.notion.com/v1/blocks/${id}/children?page_size=100`, {
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' },
  });
  const j = await r.json();
  return (j.results || [])
    .map((b) => plain(b[b.type]?.rich_text))
    .join('\n')
    .trim();
}

export default async function handler(req, res) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(204).end();
  try {
    const books = [];
    let cursor;
    do {
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'content-type': 'application/json' },
        body: JSON.stringify({
          filter: { property: 'ラベル', select: { equals: '本' } },
          start_cursor: cursor,
          page_size: 100,
        }),
      });
      const j = await r.json();
      if (!r.ok) return res.status(502).json({ error: j.message });
      for (const p of j.results) {
        const props = p.properties || {};
        const titleProp = Object.values(props).find((v) => v.type === 'title');
        books.push({
          id: p.id.replace(/-/g, ''),
          title: plain(titleProp?.title),
          readDate: props['読了日']?.date?.start || null,
          createdDate: p.created_time.slice(0, 10),
          notionUrl: p.url,
          notionCover: p.cover?.file?.url || p.cover?.external?.url || null,
        });
      }
      cursor = j.has_more ? j.next_cursor : undefined;
    } while (cursor);
    // 本文（感想）を取得
    await Promise.all(books.map(async (b) => { b.notionNote = (await pageText(b.id, token)) || null; }));
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=600');
    return res.status(200).json({ source: 'Notion（ライブ）', syncedAt: new Date().toISOString(), books });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
}
