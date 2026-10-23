// GET /api/cover?t=<title>
// Google Books でタイトル検索 → 表紙候補URLを返す（NDLサムネイル優先、なければGoogle）
export default async function handler(req, res) {
  const t = String(req.query.t || '').trim();
  if (!t) return res.status(400).json({ error: 'missing title' });
  // 副題（―― 以降）や全角スペース以降を落として検索精度を上げる
  const q = t.split(/――|—|\s{2,}|　/)[0].trim() || t;
  const candidates = [];
  try {
    const key = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : '';
    const r = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(q)}&maxResults=5&printType=books${key}`
    );
    const j = await r.json();
    for (const it of j.items || []) {
      const v = it.volumeInfo || {};
      const isbn = (v.industryIdentifiers || []).find((x) => x.type === 'ISBN_13')?.identifier;
      if (isbn) candidates.push(`https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`);
      const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
      if (img) candidates.push(img.replace('http://', 'https://').replace('&edge=curl', ''));
      if (candidates.length >= 4) break;
    }
  } catch (e) {
    /* noop: 候補なしで返す */
  }
  res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
  return res.status(200).json({ query: q, candidates });
}
