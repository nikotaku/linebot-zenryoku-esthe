const CFG = window.RL_CONFIG;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const READONLY = params.get('view') === '1';
if (READONLY) document.body.classList.add('readonly');

const state = { books: [], notes: {}, voices: {}, year: null, query: '', current: null };

/* ---------- Supabase REST ---------- */
const H = { apikey: CFG.supabaseKey, Authorization: `Bearer ${CFG.supabaseKey}` };
const rest = (path, opt = {}) =>
  fetch(`${CFG.supabaseUrl}/rest/v1/${path}`, { ...opt, headers: { ...H, 'content-type': 'application/json', ...(opt.headers || {}) } });
async function upsertNote(bookId, fields) {
  const row = { book_id: bookId, ...fields, updated_at: new Date().toISOString() };
  const r = await rest('reading_notes', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error(await r.text());
  const [saved] = await r.json();
  state.notes[bookId] = saved;
  return saved;
}
const publicUrl = (path) => `${CFG.supabaseUrl}/storage/v1/object/public/${CFG.bucket}/${path}`;

/* ---------- utils ---------- */
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200); };
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const dateOf = (b) => state.notes[b.id]?.read_date || b.readDate || b.createdDate;
const yearOf = (b) => Number(dateOf(b).slice(0, 4));
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const cleanTitle = (t) => t.replace(/<[^>]+>/g, '');
function hue(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
const PALETTE = ['#2f3e46', '#6b2737', '#284b63', '#3d405b', '#5c4d3c', '#264653', '#7a3b2e', '#33415c', '#4a5240', '#582f0e'];
const siteUrl = () => location.origin;

/* ---------- data ---------- */
async function loadBooks() {
  try {
    const r = await fetch('/api/books');
    if (r.status === 200) return r.json();
  } catch {}
  return (await fetch('/data/books.json')).json();
}
async function loadNotes() {
  try {
    const [n, v] = await Promise.all([
      rest('reading_notes?select=*').then((r) => (r.ok ? r.json() : [])),
      rest('reading_voices?select=*&order=created_at.asc').then((r) => (r.ok ? r.json() : [])),
    ]);
    state.notes = Object.fromEntries(n.map((x) => [x.book_id, x]));
    state.voices = {};
    for (const x of v) (state.voices[x.book_id] ||= []).push(x);
  } catch (e) { console.warn(e); }
}

/* ---------- stats ---------- */
function monthsSpan(fromY, fromM, toY, toM) { return (toY - fromY) * 12 + (toM - fromM) + 1; }
function renderStats() {
  const now = new Date();
  const cy = now.getFullYear(), cm = now.getMonth() + 1;
  const dates = state.books.map(dateOf).sort();
  const first = dates[0] || `${cy}-01-01`;
  const fy = Number(first.slice(0, 4)), fm = Number(first.slice(5, 7));
  const years = [...new Set(state.books.map(yearOf))].sort((a, b) => b - a);
  if (state.year == null) state.year = Number(params.get('y')) || years[0] || cy;

  const tabs = $('#yearTabs'); tabs.innerHTML = '';
  for (const y of [...years, 'all']) {
    const b = document.createElement('button');
    b.textContent = y === 'all' ? 'すべて' : `${y}年`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(state.year === y));
    b.onclick = () => { state.year = y; renderStats(); renderShelf(); };
    tabs.append(b);
  }

  const total = state.books.length;
  const allMonths = monthsSpan(fy, fm, cy, cm);
  $('#statTotal').textContent = total;
  $('#statAvgAll').textContent = fmt1(total / allMonths);

  const bars = $('#monthBars'); bars.innerHTML = '';
  let counts, labels;
  if (state.year === 'all') {
    $('#lblYear').textContent = '年平均';
    const ys = [...years].reverse();
    counts = ys.map((y) => state.books.filter((b) => yearOf(b) === y).length);
    labels = ys.map((y) => `${String(y).slice(2)}年`);
    $('#statYear').textContent = fmt1(total / (allMonths / 12));
    $('#statAvg').textContent = fmt1(total / allMonths);
    $('#monthsCap').textContent = '年別の冊数';
    bars.style.gridTemplateColumns = `repeat(${ys.length}, 1fr)`;
  } else {
    const y = state.year;
    const inYear = state.books.filter((b) => yearOf(b) === y);
    counts = Array.from({ length: 12 }, (_, i) => inYear.filter((b) => Number(dateOf(b).slice(5, 7)) === i + 1).length);
    labels = counts.map((_, i) => `${i + 1}月`);
    const startM = y === fy ? fm : 1;
    const endM = y === cy ? cm : 12;
    const span = Math.max(1, endM - startM + 1);
    $('#lblYear').textContent = `${y}年`;
    $('#statYear').textContent = inYear.length;
    $('#statAvg').textContent = fmt1(inYear.length / span);
    $('#monthsCap').textContent = `${y}年 月別の冊数（月平均は${startM}〜${endM}月の${span}か月で計算）`;
    bars.style.gridTemplateColumns = 'repeat(12, 1fr)';
  }
  const max = Math.max(1, ...counts);
  counts.forEach((c, i) => {
    const el = document.createElement('div'); el.className = 'mb';
    el.innerHTML = `<span class="v">${c || ''}</span><span class="bar ${c ? '' : 'zero'}" style="height:${(c / max) * 82}%"></span><span class="m">${labels[i]}</span>`;
    el.title = `${labels[i]}: ${c}冊`;
    bars.append(el);
  });
}

/* ---------- covers ---------- */
function typoCover(title) {
  const d = document.createElement('div');
  d.className = 'typo';
  d.style.background = PALETTE[hue(title) % PALETTE.length];
  const tt = document.createElement('div'); tt.className = 'tt'; tt.textContent = title;
  const rule = document.createElement('div'); rule.className = 'rule';
  d.append(tt, rule);
  return d;
}
const coverCache = ls.get('rl-covers') || {};
async function coverCandidates(b) {
  const manual = state.notes[b.id]?.cover_url;
  if (manual) return [manual];
  const list = [];
  if (b.notionCover) list.push(b.notionCover);
  if (coverCache[b.id]) return [...list, ...coverCache[b.id]];
  try {
    const r = await fetch(`/api/cover?t=${encodeURIComponent(cleanTitle(b.title))}`);
    const j = await r.json();
    coverCache[b.id] = j.candidates || [];
    ls.set('rl-covers', coverCache);
    return [...list, ...coverCache[b.id]];
  } catch { return list; }
}
function mountCover(el, b) {
  el.innerHTML = '';
  el.append(typoCover(cleanTitle(b.title)));
  coverCandidates(b).then((cands) => {
    const tryNext = (i) => {
      if (i >= cands.length) return;
      const img = new Image();
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        if (img.naturalWidth < 40) return tryNext(i + 1); // 1px等のダミー画像を除外
        el.querySelector('.typo')?.remove(); el.querySelector('img')?.remove(); el.prepend(img);
      };
      img.onerror = () => tryNext(i + 1);
      img.src = cands[i];
    };
    tryNext(0);
  });
}
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); mountCover(e.target, e.target._book); }
}, { rootMargin: '300px' });

/* ---------- shelf ---------- */
function renderShelf() {
  const ul = $('#shelf'); ul.innerHTML = '';
  const q = state.query.trim().toLowerCase();
  const list = state.books
    .filter((b) => state.year === 'all' || yearOf(b) === state.year)
    .filter((b) => !q || cleanTitle(b.title).toLowerCase().includes(q))
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  $('#shelfTitle').textContent = `本棚　${list.length}冊`;
  for (const b of list) {
    const li = document.createElement('li');
    const btn = document.createElement('button'); btn.className = 'book';
    const cv = document.createElement('div'); cv.className = 'cover'; cv._book = b;
    cv.append(typoCover(cleanTitle(b.title)));
    io.observe(cv);
    const t = document.createElement('div'); t.className = 't'; t.textContent = cleanTitle(b.title);
    const d = document.createElement('div'); d.className = 'd'; d.textContent = dateOf(b).replaceAll('-', '.');
    const bd = document.createElement('div'); bd.className = 'badges';
    const n = state.notes[b.id];
    if (n?.note || b.notionNote) bd.insertAdjacentHTML('beforeend', '<span class="badge on">感想</span>');
    if (state.voices[b.id]?.length) bd.insertAdjacentHTML('beforeend', '<span class="badge on">声</span>');
    if (n?.ai_analysis) bd.insertAdjacentHTML('beforeend', '<span class="badge on">AI</span>');
    btn.append(cv, t, d, bd);
    btn.onclick = () => openDetail(b.id);
    li.append(btn); ul.append(li);
  }
}

/* ---------- detail ---------- */
let saveTimer;
function openDetail(id, push = true) {
  const b = state.books.find((x) => x.id === id);
  if (!b) return;
  state.current = b;
  const n = state.notes[id] || {};
  const cv = document.createElement('div'); cv.className = 'cover';
  $('#dCover').replaceChildren(cv);
  mountCover(cv, b);
  if (!READONLY) {
    const change = document.createElement('button');
    change.className = 'btn ghost'; change.style.cssText = 'margin-top:10px;font-size:12px;padding:4px 10px';
    change.textContent = '表紙を変える';
    change.onclick = async () => {
      const url = prompt('表紙画像のURL（空にすると自動検索に戻ります）', n.cover_url || '');
      if (url === null) return;
      await upsertNote(id, { cover_url: url.trim() || null });
      openDetail(id, false); renderShelf();
    };
    $('#dCover').append(change);
  }
  $('#dTitle').textContent = cleanTitle(b.title);
  $('#dDate').value = dateOf(b);
  $('#dNotion').href = b.notionUrl; $('#dNotion').hidden = READONLY;
  $('#dNotionBlock').hidden = !b.notionNote;
  $('#dNotionNote').textContent = b.notionNote || '';
  $('#dNote').value = n.note || '';
  $('#dNoteRead').textContent = n.note || (b.notionNote ? '' : 'まだ感想はありません。');
  $('#saveState').textContent = n.updated_at ? `保存済み ${new Date(n.updated_at).toLocaleString('ja-JP')}` : '';
  renderAI(n);
  renderVoices();
  updateShareLinks();
  if (push) history.pushState({ b: id }, '', `?b=${id}${READONLY ? '&view=1' : ''}`);
  if (!$('#detail').open) $('#detail').showModal();
}
function renderAI(n) {
  const out = $('#aiOut');
  out.textContent = n.ai_analysis || (READONLY ? '' : '');
  if (n.ai_analysis && n.ai_at) {
    const m = document.createElement('div'); m.className = 'ai-meta';
    m.textContent = `${new Date(n.ai_at).toLocaleString('ja-JP')} 生成`;
    out.append(m);
  }
  $('#aiBtn').textContent = n.ai_analysis ? 'もう一度考察してもらう' : '感想から考察してもらう';
  $('#aiBtn').closest('.block').hidden = READONLY && !n.ai_analysis;
}
function renderVoices() {
  const b = state.current; const ul = $('#voices'); ul.innerHTML = '';
  const vs = state.voices[b.id] || [];
  if (READONLY && !vs.length) { ul.closest('.block').hidden = true; return; }
  ul.closest('.block').hidden = false;
  for (const v of vs) {
    const li = document.createElement('li');
    const meta = document.createElement('div'); meta.className = 'vm';
    const when = document.createElement('span'); when.textContent = new Date(v.created_at).toLocaleString('ja-JP') + (v.duration_sec ? ` · ${Math.round(v.duration_sec)}秒` : '');
    meta.append(when);
    if (!READONLY) {
      const del = document.createElement('button'); del.className = 'del'; del.textContent = '削除';
      del.onclick = async () => {
        if (!confirm('このボイスメモを削除しますか？')) return;
        await rest(`reading_voices?id=eq.${v.id}`, { method: 'DELETE' });
        await fetch(`${CFG.supabaseUrl}/storage/v1/object/${CFG.bucket}/${v.path}`, { method: 'DELETE', headers: H });
        state.voices[b.id] = vs.filter((x) => x.id !== v.id); renderVoices(); renderShelf();
      };
      meta.append(del);
    }
    const au = document.createElement('audio'); au.controls = true; au.preload = 'none'; au.src = publicUrl(v.path);
    li.append(meta, au);
    if (v.transcript) { const p = document.createElement('p'); p.className = 'vt'; p.textContent = v.transcript; li.append(p); }
    ul.append(li);
  }
}
$('#closeDetail').onclick = () => $('#detail').close();
$('#detail').addEventListener('close', () => {
  if (rec) stopRec();
  state.current = null;
  if (new URLSearchParams(location.search).get('b')) history.pushState({}, '', READONLY ? '?view=1' : location.pathname);
});
$('#detail').addEventListener('click', (e) => { if (e.target === $('#detail')) $('#detail').close(); });
window.addEventListener('popstate', () => {
  const id = new URLSearchParams(location.search).get('b');
  if (id) openDetail(id, false); else if ($('#detail').open) $('#detail').close();
});

$('#dNote').addEventListener('input', () => {
  const b = state.current; const val = $('#dNote').value;
  $('#saveState').textContent = '入力中…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { const s = await upsertNote(b.id, { note: val }); $('#saveState').textContent = `保存済み ${new Date(s.updated_at).toLocaleTimeString('ja-JP')}`; renderShelf(); updateShareLinks(); }
    catch (e) { $('#saveState').textContent = '保存に失敗しました。通信を確認してください。'; }
  }, 700);
});
$('#dDate').addEventListener('change', async () => {
  const b = state.current; const v = $('#dDate').value || null;
  try { await upsertNote(b.id, { read_date: v }); toast('読了日を更新しました'); renderStats(); renderShelf(); }
  catch { toast('読了日の保存に失敗しました'); }
});

/* ---------- voice ---------- */
let rec = null;
function pickMime() {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']) if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  return '';
}
async function startRec() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('このブラウザは録音に対応していません');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { return toast('マイクの使用が許可されませんでした'); }
  const mime = pickMime();
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = []; mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const started = Date.now();
  rec = { mr, stream, chunks, started, mime: mr.mimeType || mime || 'audio/webm', finals: [], bookId: state.current.id };
  // 文字起こし（対応ブラウザのみ）
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    try {
      const sr = new SR(); sr.lang = 'ja-JP'; sr.continuous = true; sr.interimResults = true;
      sr.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) rec.finals.push(e.results[i][0].transcript); else interim += e.results[i][0].transcript;
        }
        $('#liveText').textContent = rec.finals.join('') + interim;
      };
      sr.onend = () => { if (rec && rec.sr === sr) try { sr.start(); } catch {} };
      sr.start(); rec.sr = sr;
    } catch {}
  }
  mr.start(1000);
  $('#recBtn').classList.add('on'); $('#recLabel').textContent = '止めて保存';
  rec.timer = setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); $('#recTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 250);
}
async function stopRec() {
  const r = rec; rec = null;
  clearInterval(r.timer);
  $('#recBtn').classList.remove('on'); $('#recLabel').textContent = '録音する'; $('#recTime').textContent = '';
  if (r.sr) { const sr = r.sr; r.sr = null; try { sr.stop(); } catch {} }
  await new Promise((res) => { r.mr.onstop = res; r.mr.stop(); });
  r.stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(r.chunks, { type: r.mime.split(';')[0] });
  const duration = (Date.now() - r.started) / 1000;
  if (duration < 1 || !blob.size) { $('#liveText').textContent = ''; return; }
  const ext = r.mime.includes('mp4') || r.mime.includes('aac') ? 'm4a' : 'webm';
  const path = `${r.bookId}/${crypto.randomUUID()}.${ext}`;
  const transcript = $('#liveText').textContent.trim() || null;
  toast('ボイスメモを保存中…');
  try {
    const up = await fetch(`${CFG.supabaseUrl}/storage/v1/object/${CFG.bucket}/${path}`, { method: 'POST', headers: { ...H, 'content-type': blob.type, 'x-upsert': 'true' }, body: blob });
    if (!up.ok) throw new Error(await up.text());
    const ins = await rest('reading_voices', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ book_id: r.bookId, path, transcript, duration_sec: duration }) });
    if (!ins.ok) throw new Error(await ins.text());
    const [row] = await ins.json();
    (state.voices[r.bookId] ||= []).push(row);
    $('#liveText').textContent = '';
    if (state.current?.id === r.bookId) renderVoices();
    renderShelf();
    toast('ボイスメモを保存しました');
  } catch (e) { console.error(e); toast('ボイスメモの保存に失敗しました'); }
}
$('#recBtn').onclick = () => (rec ? stopRec() : startRec());

/* ---------- AI ---------- */
$('#aiBtn').onclick = async () => {
  const b = state.current; const n = state.notes[b.id] || {};
  const btn = $('#aiBtn'); btn.disabled = true; btn.textContent = '考察中…（20秒ほど）';
  try {
    const r = await fetch('/api/analyze', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: cleanTitle(b.title), note: $('#dNote').value || n.note || '', notionNote: b.notionNote || '', transcripts: (state.voices[b.id] || []).map((v) => v.transcript).filter(Boolean) }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || j.error);
    const saved = await upsertNote(b.id, { ai_analysis: j.analysis, ai_at: new Date().toISOString() });
    renderAI(saved); renderShelf();
  } catch (e) {
    $('#aiOut').textContent = `考察できませんでした：${e.message}`;
  } finally { btn.disabled = false; if (!state.notes[b.id]?.ai_analysis) btn.textContent = '感想から考察してもらう'; }
};

/* ---------- share ---------- */
function shareData() {
  const b = state.current; const n = state.notes[b.id] || {};
  const url = `${siteUrl()}/?b=${b.id}&view=1`;
  let text = `『${cleanTitle(b.title)}』を読みました。`;
  const body = (n.note || b.notionNote || '').replace(/\s+/g, ' ').trim();
  if ($('#shareWithNote').checked && body && !READONLY) text += `\n「${body.slice(0, 70)}${body.length > 70 ? '…' : ''}」`;
  return { title: cleanTitle(b.title), text, url };
}
function updateShareLinks() {
  if (!state.current) return;
  const d = shareData();
  $('#shareX').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(d.text)}&url=${encodeURIComponent(d.url)}`;
  $('#shareLine').href = `https://line.me/R/msg/text/?${encodeURIComponent(`${d.text}\n${d.url}`)}`;
}
$('#shareWithNote').onchange = updateShareLinks;
async function doShare(d) {
  if (navigator.share) { try { await navigator.share(d); return; } catch (e) { if (e.name === 'AbortError') return; } }
  await copy(`${d.text}\n${d.url}`);
}
async function copy(s) {
  try { await navigator.clipboard.writeText(s); toast('コピーしました'); }
  catch { prompt('コピーしてください', s); }
}
$('#shareNative').onclick = () => doShare(shareData());
$('#copyLink').onclick = () => copy(shareData().url);
$('#shareYear').onclick = () => {
  const y = state.year;
  if (y === 'all') return doShare({ title: '読書記録', text: `これまでに${state.books.length}冊読みました（月平均${$('#statAvgAll').textContent}冊）。`, url: `${siteUrl()}/?view=1` });
  const n = state.books.filter((b) => yearOf(b) === y).length;
  doShare({ title: `${y}年の読書記録`, text: `${y}年は${n}冊読みました（月平均${$('#statAvg').textContent}冊）。`, url: `${siteUrl()}/?y=${y}&view=1` });
};

/* ---------- boot ---------- */
$('#search').addEventListener('input', (e) => { state.query = e.target.value; renderShelf(); });
(async function boot() {
  const [data] = await Promise.all([loadBooks(), loadNotes()]);
  state.books = data.books;
  const synced = String(data.syncedAt || '').slice(0, 10);
  $('#sourceLine').textContent = `${data.source} · ${data.books.length}冊${synced ? ` · ${synced} 同期` : ''}${READONLY ? ' · 閲覧用' : ''}`;
  renderStats(); renderShelf();
  const id = params.get('b'); if (id) openDetail(id, false);
})();
