# 百錬自得（ひゃくれんじとく）
> 剣道稽古記録・成長可視化アプリ

「百錬自得」は剣道の稽古を記録し、XP・称号システムと可視化グラフ、
AIアドバイス機能でモチベーションを維持するWebアプリです。

---

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────┐
│                   Cloudflare Pages                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Next.js 15 (App Router / Edge)           │   │
│  │                                                  │   │
│  │  / (Dashboard)     ← fetchDashboard()            │   │
│  │  /record           ← saveLog()                   │   │
│  │  /history          ← fetchDashboard()            │   │
│  │  /ai-advice        ← fetch('/api/ai-advice')     │   │
│  │  /api/ai-advice    ← Anthropic API (streaming)   │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTPS (GAS Web App URL)
                   ▼
┌─────────────────────────────────────────────────────────┐
│              Google Apps Script (doGet / doPost)         │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              Google Sheets                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐        │
│  │ settings │  │   logs   │  │  user_status   │        │
│  └──────────┘  └──────────┘  └────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

---

## ディレクトリ構造

```
hyakuren-jitoku/
├── gas/
│   └── Code.gs                    # GAS バックエンド（Sheets API）
├── src/
│   ├── app/
│   │   ├── layout.tsx             # ルートレイアウト（ナビゲーション込み）
│   │   ├── globals.css            # グローバルCSS・デザイントークン
│   │   ├── page.tsx               # ダッシュボード（ホーム）
│   │   ├── record/
│   │   │   └── page.tsx           # 稽古記録フォーム
│   │   ├── history/
│   │   │   └── page.tsx           # グラフ・可視化
│   │   ├── debug/
│   │   │   └── page.tsx           # ログビューア（/debug）
│   │   └── api/
│   │       └── gas/
│   │           └── route.ts       # GAS プロキシ（CORS回避）
│   ├── components/
│   │   ├── Navigation.tsx         # ボトムナビゲーション（3タブ）
│   │   └── charts/
│   │       ├── RadarChart.tsx     # レーダーチャート
│   │       ├── TrendLineChart.tsx # 折れ線グラフ（推移）
│   │       └── ActivityHeatmap.tsx# 稽古カレンダー（週単位）
│   ├── lib/
│   │   ├── api.ts                 # GAS APIクライアント
│   │   └── logger.ts              # クライアントロガー（localStorage）
│   └── types/
│       └── index.ts               # 型定義・XP/レベルロジック
├── .env.example                   # 環境変数テンプレート
├── .env.local                     # ローカル開発用（要自作・Git除外）
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── wrangler.toml
└── package.json
```

---

## セットアップ手順

### 1. Google Sheets の準備

スプレッドシートに以下のシートを作成（既存の場合はヘッダーを確認）：

**settings シート**
| item_name | is_active |
|-----------|-----------|
| 面打ち    | TRUE      |
| 小手打ち  | TRUE      |
| 胴打ち    | TRUE      |
| 突き      | FALSE     |
| 足さばき  | TRUE      |

**logs シート**
| date | item_name | score | xp_earned |
|------|-----------|-------|-----------|

**user_status シート**
| total_xp | level | title |
|----------|-------|-------|
| 0        | 1     | 見習い |

### 2. GAS のデプロイ

1. スプレッドシートを開き **拡張機能 → Apps Script**
2. `Code.gs` の内容を貼り付け、保存（Ctrl+S）
3. **デプロイ → 新しいデプロイ**
4. 種類: **ウェブアプリ**
5. 実行するユーザー: **自分**
6. アクセスできるユーザー: **全員**
7. デプロイ → 発行されたURLをコピー

> ⚠️ URLは `NEXT_PUBLIC_GAS_URL` に設定します

### 3. フロントエンドのローカル開発

```bash
# 依存インストール
npm install

# 環境変数設定
cp .env.example .env.local
# .env.local を編集して GAS_URL と ANTHROPIC_API_KEY を入力

# 開発サーバー起動
npm run dev
# → http://localhost:3000
```

### 4. Cloudflare Pages へのデプロイ

#### 方法A: GitHub連携（推奨）
1. リポジトリを GitHub に push
2. Cloudflare Dashboard → **Workers & Pages → Create application → Pages**
3. GitHub リポジトリを選択
4. ビルド設定:
   - **Framework preset**: Next.js
   - **Build command**: `npx @cloudflare/next-on-pages`
   - **Build output directory**: `.vercel/output/static`
5. **Environment variables** に下記を追加

#### 方法B: CLI直接デプロイ
```bash
npm run pages:build
npm run pages:deploy
```

---

## 環境変数（Cloudflare Pages Dashboard で設定）

| 変数名 | 必須 | 説明 | 例 |
|--------|------|------|----|
| `NEXT_PUBLIC_GAS_URL` | ✅ | GAS Web App URL | `https://script.google.com/macros/s/XXXX/exec` |
| `OPENROUTER_API_KEY` | ✅ | OpenRouter APIキー | `sk-or-v1-XXXXX` |
| `OPENROUTER_MODEL` | — | 使用モデル（省略時はClaude Sonnet 4） | `anthropic/claude-sonnet-4` |
| `NEXT_PUBLIC_APP_URL` | — | アプリURL（OpenRouter統計用） | `https://hyakuren.pages.dev` |

> **OpenRouter APIキーの取得:** https://openrouter.ai/settings/keys
> 無料枠あり。モデルは `OPENROUTER_MODEL` で自由に差し替え可能。

---

## XP・称号システム

| レベル | XP | 称号 |
|--------|----|------|
| 1 | 0 | 見習い |
| 2 | 300 | 白帯 |
| 3 | 800 | 素振り師 |
| 4 | 1,800 | 初段 |
| 5 | 3,500 | 弐段 |
| 6 | 6,000 | 参段 |
| 7 | 9,500 | 四段 |
| 8 | 14,000 | 五段 |
| 9 | 20,000 | 錬士 |
| 10 | 28,000 | 教士 |
| 11 | 40,000 | 範士 |

### XP計算式
```
稽古1回 = 基本XP(50) + Σ評価ボーナス
評価ボーナス: 5→+30, 4→+20, 3→+10, 2→+5, 1→+2
例) 5項目全て評価5 → 50 + (30×5) = 200 XP
```

---

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| Frontend | Next.js 15 (App Router), TypeScript |
| Styling | Tailwind CSS, Noto Serif JP |
| Charts | Recharts (Radar, Line) + カスタムヒートマップ |
| Backend | Google Apps Script (Web App) |
| Database | Google Sheets |
| AI | OpenRouter API + openai SDK (Streaming) |
| Hosting | Cloudflare Pages (Edge Runtime) |

---

## ライセンス
MIT
