# 読書記録 (reading-log)

Notionの「training room」データベース（ラベル＝本）から読書記録を表示するサイト。

- 年間冊数／月平均／月別グラフ
- 本のジャケット（Google Books → 国立国会図書館サムネイル、なければタイポ表紙。手動差し替え可）
- 感想の書き込み（自動保存）・読了日の修正
- ボイスメモ（録音＋対応ブラウザでは自動文字起こし）
- AI考察（Claude）
- シェア（端末の共有、X、LINE、リンクコピー）。シェアされたリンクは `?view=1` の閲覧専用表示

## 構成
- `public/` 静的サイト（vanilla JS）
- `api/books.js` Notionからライブ取得（`NOTION_TOKEN` 未設定時は `public/data/books.json` のスナップショットを使用）
- `api/cover.js` 表紙検索
- `api/analyze.js` AI考察（`ANTHROPIC_API_KEY` 必須）
- 保存先: Supabase `reading_notes` / `reading_voices` テーブル、Storage `reading-voice` バケット

## 環境変数（Vercel）
| キー | 用途 |
|---|---|
| `ANTHROPIC_API_KEY` | AI考察 |
| `AI_MODEL` | 任意。既定 `claude-sonnet-5-5` |
| `NOTION_TOKEN` | Notionライブ同期（インテグレーションを training room に接続） |
| `NOTION_DB_ID` | 任意。既定 `b9002a5cd4dd41ecbb1413073338e3b4` |
| `GOOGLE_BOOKS_API_KEY` | 任意。表紙検索のレート制限対策 |
