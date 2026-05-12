# 百錬自得（Forge_in_Fire） - ARCHITECTURE.md

> 剣道の稽古・技の習熟度を記録し、成長をゲーミフィケーションで可視化するWebアプリ。

---

## 1. アプリ概要と技術スタック

### フロントエンド

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 15（App Router / TypeScript） |
| ホスティング | Cloudflare Pages（`@cloudflare/next-on-pages` ビルド / `wrangler.toml` 管理） |
| スタイリング | Tailwind CSS + インラインスタイル(サイバー和風テーマ) |
| フォント | M PLUS Rounded 1c |
| グラフ | Recharts(AreaChart / RadarChart) |
| スキルグリッド | @xyflow/react v12（六角形カスタムノード・アニメーションエッジ）★ Phase5更新 |
| アイコン | lucide-react |
| データフェッチ/キャッシュ | SWR（ホーム・門下生一覧/詳細・記録画面の GET キャッシュ化）★ Phase6追加 |
| PWA | @ducanh2912/next-pwa（サービスワーカー自動生成・オフラインキャッシュ・カスタムワーカー結合）★ Phase7追加 / Phase12拡張 |
| Push通知 | Web Push API + 自前 VAPID 実装（Web Crypto API）★ Phase12新規 |

### バックエンド・データベース

| 項目 | 内容 |
|---|---|
| バックエンド | Google Apps Script（GAS）Web App（doGet / doPost） |
| データベース | Google Sheets（スプレッドシート ID: `1jmXq7bdvSG_HVjTe0ArEAi8xStmVfh_FpIb90TxYS5I`） |
| CORS回避 | Next.js の `/api/gas` プロキシルート経由 |
| Push通知配信 | Next.js API Routes (`/api/push/send`) を Edge Runtime で実装。GASは21時トリガーで対象判定のみを担当し、暗号化送信はNext.jsへ委譲 ★ Phase12 |

---

## 2. ディレクトリ構成と各ファイルの役割

```text
Forge_in_Fire/
├── DB_SCHEMA.md                        # DBテーブルとカラムの定義書（Phase12: push_subscriptions 追加）
├── ROADMAP.md                          # 開発ロードマップとフェーズ管理
├── DEPLOY_GUIDE.md                     # デプロイ手順書
├── README.md                           # プロジェクト概要
├── wrangler.toml                       # Cloudflare Pages デプロイ・環境変数設定
├── tailwind.config.ts                  # Tailwind CSS 設定（サイバー和風カラートークン）
├── postcss.config.js                   # PostCSS 設定
├── package.json                        # 依存パッケージ管理
├── tsconfig.json                       # TypeScript 設定（worker/**/*.ts を include に追加 ★ Phase12）
├── next.config.ts                      # Next.js設定（PWA設定 + customWorkerSrc='worker' ★ Phase12更新）
│
├── gas/
│   └── Code.gs                         # GASバックエンド全処理 ★ Phase12 では未更新（Step3で実装予定）
│
├── worker/                             # ★ Phase12 新規: カスタムService Worker
│   └── index.ts                        # push / notificationclick / pushsubscriptionchange ハンドラ
│                                       # ビルド時に next-pwa が自動生成 sw.js 末尾へ結合する
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
│   │   │   └── profile/page.tsx        # プロフィール設定（段位・座右の銘・得意技ID選択・★Phase12 Push通知トグル）
│   │   ├── achievements/
│   │   │   └── page.tsx                # 実績バッジ一覧画面
│   │   ├── debug/page.tsx              # ログビューア
│   │   └── api/
│   │       ├── gas/route.ts            # GASプロキシ
│   │       └── push/                   # ★ Phase12 新規
│   │           ├── subscribe/route.ts  # サブスクリプション登録API（Edge Runtime / GASプロキシ）
│   │           └── send/route.ts       # Push送信API（Edge Runtime / VAPID自前実装）
│   │
│   ├── components/
│   │   ├── Navigation.tsx              # ボトムナビ（4ボタン: ホーム・稽古記録・門下生・ログアウト）
│   │   ├── AuthGuard.tsx               # 未ログイン時リダイレクト
│   │   ├── UserStatusCard.tsx          # ユーザーステータス共通コンポーネント（7行レイアウト）★ Phase11.1更新
│   │   ├── TaskEvalCard.tsx            # 課題スコア入力カード（星評価）
│   │   ├── MasteryToast.tsx            # 免許皆伝トースト（黒×金×朱印） ★ Phase11
│   │   ├── TaskScoreDistCard.tsx       # 課題別スコア分布カード（自己/他者評価突合）
│   │   └── charts/
│   │       ├── RadarChart.tsx          # 稽古スコアバランス（横型プログレスバー）
│   │       ├── TechniqueRadarChart.tsx # 技の傾向・習熟度バランスを表示するレーダーチャート
│   │       ├── XPTimelineChart.tsx     # XP累積推移（ステップライン・ネオングラデーション）
│   │       ├── ActivityHeatmap.tsx     # 稽古カレンダー
│   │       ├── SkillGrid.tsx           # スキルグリッド（六角形ノード・アニメーションエッジ）
│   │       ├── PlaystyleCharts.tsx     # プレイスタイル分析
│   │       ├── TrendLineChart.tsx      # スコア推移折れ線
│   │       └── MatchupScroll.tsx       # 剣風相性の横スクロール一覧表示コンポーネント ★ Phase10
│   │
│   ├── lib/
│   │   ├── api.ts                      # GAS APIクライアント
│   │   ├── auth.ts                     # 認証ユーティリティ（getAuthUser / getCurrentUserId 等）
│   │   ├── epithet.ts                  # 3層称号判定ロジック
│   │   ├── mastery.ts                  # 免許皆伝（Mastery）判定ロジック ★ Phase11
│   │   ├── matchupTheme.ts             # 相性（S/W）のサイバー和風カラーパレット ★ Phase10
│   │   ├── webpush-edge.ts             # ★ Phase12 新規: Edge Runtime互換 Web Push送信ライブラリ
│   │   │                                #   （VAPID JWT + aes128gcm 暗号化を Web Crypto API で自前実装）
│   │   └── logger.ts                   # クライアントロガー
│   │
│   └── types/
│       └── index.ts                    # 全型定義・XP/レベル計算関数 ★ Phase12: Push通知関連型を追加
│
└── public/                             # (treeコマンド除外対象だが運用上存在)
    ├── sw.js                           # サービスワーカー（ビルド時に自動生成）★ worker/index.ts が結合される
    ├── workbox-*.js                    # Workboxランタイム（ビルド時に自動生成）
    ├── icon-192x192.png                # PWAアイコン（要手動配置・通知アイコンにも使用）
    └── icon-512x512.png                # PWAアイコン（要手動配置）
