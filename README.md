# 将棋コーチ — セットアップ手順

## 必要なもの

- Node.js 18以上
- Supabaseアカウント（無料）
- AnthropicのAPIキー
- Vercelアカウント（無料）

## 1. Supabaseのセットアップ

1. https://supabase.com でプロジェクト作成
2. SQL Editorで `supabase/schema.sql` を実行
3. Project Settings → API から `URL` と `service_role key` をメモ

## 2. ローカルで動かす

```bash
npm install

# .env.local.example をコピーして値を埋める
cp .env.local.example .env.local

npm run dev
# → http://localhost:3000
```

## 3. Vercelにデプロイ

```bash
npm i -g vercel
vercel
```

Vercelのダッシュボードで環境変数を設定:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `SHOGI_WARS_USERNAME`

## 使い方

1. 将棋ウォーズでKIFをダウンロード（SHOGI-EXTEND経由が便利）
2. ダッシュボードにドラッグ&ドロップ
3. 統計が自動で更新される
4. 気になった対局の「AI分析」ボタンでコーチングコメントを取得

## KIFのダウンロード方法

https://www.shogi-extend.com/swars/search にアクセスして自分のIDを入力 → 一括ダウンロード
