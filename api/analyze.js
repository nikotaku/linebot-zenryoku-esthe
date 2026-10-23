// POST /api/analyze  { title, note, notionNote, transcripts: [] }
// ANTHROPIC_API_KEY が設定されていれば Claude で感想への考察を返す
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: 'AI未設定',
      detail: 'Vercel の環境変数に ANTHROPIC_API_KEY を追加すると AI考察が使えるようになります。',
    });
  }
  const { title = '', note = '', notionNote = '', transcripts = [] } = req.body || {};
  const memo = [notionNote && `【Notionの記録】\n${notionNote}`, note && `【感想】\n${note}`,
    transcripts.length && `【ボイスメモ書き起こし】\n${transcripts.join('\n---\n')}`]
    .filter(Boolean).join('\n\n');
  if (!memo.trim()) return res.status(400).json({ error: '感想かボイスメモを先に残してください' });

  const prompt = `あなたは読書会の良き対話相手です。以下は『${title}』を読んだ人の感想です。

${memo}

この感想に対して、日本語で次の構成の考察を書いてください（全体で600字程度、見出しは【】で）:
【要点】感想の核になっている主張を1〜2文で
【深掘り】その主張の背景にある価値観や、本の内容とのつながり
【別の視点】反対の立場や見落としがちな論点をひとつ
【次の一手】仕事や生活で試せる具体的なアクションを2つ
【次に読む本】関連して読むと面白い本を2冊（実在する本のみ、書名と著者）
感想の言葉を引用しつつ、持ち上げすぎず率直に。`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-sonnet-5-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'AI呼び出し失敗', detail: j?.error?.message || r.status });
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    return res.status(200).json({ analysis: text });
  } catch (e) {
    return res.status(502).json({ error: 'AI呼び出し失敗', detail: String(e) });
  }
}
