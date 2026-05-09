# 百錬自得（Forge_in_Fire） - ARCHITECTURE.md

> 剣道の稽古・技の習熟度を記録し、成長をゲーミフィケーションで可視化するWebアプリ。

---

## 1. アプリ概要と技術スタック

### フロントエンド

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 15（App Router / TypeScript） |
| ホスティング | Cloudflare Pages（`@cloudflare/next-on-pages` ビルド / `wrangler.toml` 管理） |
| スタイリング | Tailwind CSS + インラインスタイル（サイバー和風テーマ） |
| フォント | M PLUS Rounded 1c |
| グラフ | Recharts（AreaChart / RadarChart） |
| スキルグリッド | @xyflow/react v12（六角形カスタムノード・アニメーションエッジ） ★ Phase5更新 |
| アイコン | lucide-react |
| データフェッチ/キャッシュ | SWR（ホーム・門下生一覧/詳細・記録画面の GET キャッシュ化）★ Phase6追加 |
| PWA | @ducanh2912/next-pwa（サービスワーカー自動生成・オフラインキャッシュ）★ Phase7追加 |

### バックエンド・データベース

| 項目 | 内容 |
|---|---|
| バックエンド | Google Apps Script（GAS）Web App（doGet / doPost） |
| データベース | Google Sheets（スプレッドシート ID: `1jmXq7bdvSG_HVjTe0ArEAi8xStmVfh_FpIb90TxYS5I`） |
| CORS回避 | Next.js の `/api/gas` プロキシルート経由 |

---

## 2. ディレクトリ構成と各ファイルの役割

```text
Forge_in_Fire/
├── DB_SCHEMA.md                        # DBテーブルとカラムの定義書
├── ROADMAP.md                          # 開発ロードマップとフェーズ管理
├── DEPLOY_GUIDE.md                     # デプロイ手順書
├── README.md                           # プロジェクト概要
├── wrangler.toml                       # Cloudflare Pages デプロイ・環境変数設定
├── tailwind.config.ts                  # Tailwind CSS 設定（サイバー和風カラートークン）
├── postcss.config.js                   # PostCSS 設定
├── package.json                        # 依存パッケージ管理
├── tsconfig.json                       # TypeScript 設定
├── next.config.ts                      # Next.js設定（PWA設定を @ducanh2912/next-pwa でラップ）★ Phase7更新
│
├── gas/
│   └── Code.gs                         # GASバックエンド全処理 ★ Phase9.1 bugfix
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # ルートレイアウト（AuthGuard・ナビゲーション・PWAメタデータ）
│   │   ├── manifest.ts                 # PWAマニフェスト（アプリ名・アイコン・テーマカラー等）
│   │   ├── globals.css                 # デザイントークン・共通CSS（サイバー和風テーマ）
│   │   ├── page.tsx                    # ホーム画面。HUD KPI・SkillGrid・分析・UserStatusCard・鏡映分析インサイト表示。★ Phase11.1更新
│   │   ├── record/
│   │   │   └── page.tsx                # 記録画面（稽古記録・技の評価・★Phase11 皆伝判定/トースト）
│   │   ├── login/
│   │   │   └── page.tsx                # ログイン画面
│   │   ├── rivals/
│   │   │   ├── page.tsx                # 門下生一覧
│   │   │   └── [id]/page.tsx           # 他ユーザー閲覧 + 他者評価（UserStatusCard使用）
│   │   ├── settings/
│   │   │   ├── tasks/page.tsx          # カスタム評価項目設定
│   │   │   └── profile/page.tsx        # プロフィール設定（段位・座右の銘・得意技ID選択）
│   │   ├── achievements/
│   │   │   └── page.tsx                # 実績バッジ一覧画面
│   │   ├── debug/page.tsx              # ログビューア
│   │   └── api/gas/route.ts            # GASプロキシ
│   │
│   ├── components/
│   │   ├── Navigation.tsx              # ボトムナビ（4ボタン: ホーム・稽古記録・門下生・ログアウト）
│   │   ├── AuthGuard.tsx               # 未ログイン時リダイレクト
│   │   ├── UserStatusCard.tsx          # ユーザーステータス共通コンポーネント（7行レイアウト）★ Phase11.1更新
│   │   ├── TaskEvalCard.tsx            # 課題評価カード共通コンポーネント ★ Phase11 mastery prop追加
│   │   ├── MasteryToast.tsx            # 免許皆伝トースト（黒×金×朱印） ★ Phase11新規
│   │   └── charts/
│   │       ├── RadarChart.tsx          # 稽古スコアバランス（横型プログレスバー）
│   │       ├── TechniqueRadarChart.tsx # 技の傾向・習熟度バランスを表示するレーダーチャート
│   │       ├── XPTimelineChart.tsx     # XP累積推移（ステップライン・ネオングラデーション）★ Phase11.1更新
│   │       ├── ActivityHeatmap.tsx     # 稽古カレンダー
│   │       ├── SkillGrid.tsx           # スキルグリッド（六角形ノード・アニメーションエッジ）
│   │       ├── PlaystyleCharts.tsx     # プレイスタイル分析
│   │       ├── TrendLineChart.tsx      # スコア推移折れ線
│   │       └── MatchupScroll.tsx       # 剣風相性の横スクロール一覧表示コンポーネント ★ Phase10
│   │
│   ├── lib/
│   │   ├── api.ts                      # GAS APIクライアント
│   │   ├── auth.ts                     # 認証ユーティリティ
│   │   ├── epithet.ts                  # 3層称号判定ロジック
│   │   ├── mastery.ts                  # 免許皆伝（Mastery）判定ロジック ★ Phase11新規
│   │   ├── matchupTheme.ts             # 相性（S/W）のサイバー和風カラーパレット定義 ★ Phase10
│   │   └── logger.ts                   # クライアントロガー
│   │
│   └── types/
│       └── index.ts                    # 全型定義・XP/レベル計算関数 ★ xpMultiplier統合 / Phase11更新
│
└── public/                             # (treeコマンド除外対象だが運用上存在)
    ├── sw.js                           # サービスワーカー（ビルド時に自動生成）
    ├── workbox-*.js                    # Workboxランタイム（ビルド時に自動生成）
    ├── icon-192x192.png                # PWAアイコン（要手動配置）
    └── icon-512x512.png                # PWAアイコン（要手動配置）
