# 百錬自得 (Forged in Fire) - System Architecture

## 1. システム概要
『百錬自得』は、剣道における日々の稽古（与打・被打・課題進捗）を記録し、プレイスタイルや弱点を可視化するPWA対応のデータ分析アプリケーションである。
仲間との見取り稽古（相互評価）機能や、データに応じた称号（Epithet）付与など、ゲーミフィケーションを通じたモチベーション向上を目的とする。

★ Phase 15 にて「試合時特大レバレッジ（×10）」機能を実装。日々の稽古と試合の
データ価値を明確に分離し、試合記録に対して XP・分析ポイント共に 10倍 の重みを与える。

## 2. 技術スタック
- **Frontend**: Next.js 15 (App Router), React, TypeScript
- **Styling**: Tailwind CSS
- **Charts / UI**: Recharts (Playstyle/Radar), React Flow (SkillGrid), Lucide React (Icons)
- **Backend / Database**: Google Apps Script (GAS) + Google Sheets
- **Hosting**: Cloudflare Pages
- **Web Push**: Cloudflare Workers + VAPID

## 3. ディレクトリ構成
```text
C:\Forge_in_Fire
├── ARCHITECTURE.md       # システムアーキテクチャ設計書（本番構成）
├── DB_SCHEMA.md          # データベース（Google Sheets）スキーマ定義
├── DEPLOY_GUIDE.md       # デプロイ手順書（Cloudflare, GAS）
├── ROADMAP.md            # 開発ロードマップ・Phase管理
├── gas/
│   └── Code.gs           # バックエンド（API, データベース操作, Push通知バッチ）
├── src/
│   ├── app/              # Next.js App Router (ページ群)
│   │   ├── achievements/ # 実績・バッジ一覧画面
│   │   ├── api/          # Next.js API Routes (GAS中継, Push配信用)
│   │   ├── debug/        # 開発・デバッグ用画面
│   │   ├── login/        # ログイン・新規登録画面
│   │   ├── record/       # 稽古記録画面（与打・被打・課題一括登録／試合フラグ付き）
│   │   ├── rivals/       # 門下生一覧（プルダウンソート対応）＆詳細画面
│   │   ├── settings/     # プロフィール・課題設定画面
│   │   ├── globals.css   # グローバルスタイル（サイバーネオン定義）
│   │   ├── layout.tsx    # 全体レイアウト（PWA対応, AuthGuard）
│   │   ├── manifest.ts   # PWAマニフェスト生成
│   │   └── page.tsx      # マイページ（ダッシュボード, 各種チャート表示）
│   ├── components/       # UIコンポーネント
│   │   ├── charts/       # グラフ・可視化コンポーネント（SkillGrid, RadarChart等）
│   │   ├── AuthGuard.tsx # 認証ガード・リダイレクト処理
│   │   └── Navigation.tsx# 下部ナビゲーションバー
│   ├── lib/              # 共通ロジック・APIクライアント
│   │   ├── api.ts        # GAS通信クライアント (SWRラッパー)
│   │   ├── auth.ts       # 認証状態管理 (localStorage)
│   │   ├── epithet.ts    # 称号計算ロジック
│   │   ├── mastery.ts    # 部位別修練度計算
│   │   └── webpush-edge.ts # Web Pushクライアント処理
│   └── types/
│       └── index.ts      # TypeScript 型定義 (全アプリ共通)
├── worker/
│   └── index.ts          # Cloudflare Workers エッジ処理（オプション用）
├── open-next.config.ts   # OpenNext 設定
├── tailwind.config.ts    # Tailwind 設定
└── wrangler.toml         # Cloudflare Workers デプロイ設定
4. データフロー概要
4.1 稽古記録フロー（与打・被打・課題評価）
[Frontend: /record]
  │
  │  ユーザー入力:
  │   - 課題評価 (items: { task_id, score }[])
  │   - 与打     (givenTechs:    { techniqueId, quantity, quality, isMatch }[])
  │   - 被打     (receivedTechs: { techniqueId, quantity, reason,  isMatch }[])
  ↓
[GAS: doPost → saveLog]
  │
  │  1. 課題評価XPを計算（段位倍率を乗算）
  │  2. 与打XP・分析ポイント計算
  │       - 通常時: ceil(QUANTITY_BASE[q] * QUALITY_MULT[q])
  │       - 試合時: 上記 × 10  ★ Phase 15
  │     → user_techniques.Points も上記値で加算
  │     → technique_logs に 1行追記（is_match 含む）
  │  3. 被打XP・分析ポイント計算
  │       - 通常時: 25 * quantity (= 5XP × 5倍正直記録ボーナス)
  │       - 試合時: 25 * quantity * 10 = ベース50倍  ★ Phase 15
  │     → received_technique_logs に 1行追記（is_match 含む）
  │  4. user_status / xp_history を「1回だけ」更新
  │  5. アチーブメント判定
  ↓
[Google Sheets]
  - logs / user_status / xp_history
  - technique_logs (is_match 列付き)
  - received_technique_logs (is_match 列付き)
  - user_techniques (Points は試合時 ×10 反映済み)
4.2 ダッシュボード描画フロー
[Frontend: /]
  │
  ↓
[GAS: doGet → getDashboard]
  │
  │  1. user_status / tasks / logs / xp_history を集約
  │  2. technique_master / titleMaster / epithetMaster
  │  3. peerLogs / matchupMaster / peersStyle
  │  4. receivedStats を集計
  │     - received_technique_logs を走査
  │     - is_match=true の行は receivedPoints を ×10 で集計  ★ Phase 15
  │     - 技別/原因別にソート＆集計
  ↓
[Frontend: 各種チャート]
  - SkillGrid       ← user_techniques.Points (試合分は加算済み)
  - PlaystyleChart  ← user_techniques.Points 集計
  - 弱点ヒートマップ ← receivedStats.byTechnique (試合分は ×10 反映済み)
  - レーダーチャート ← receivedStats.byReason
5. 試合時特大レバレッジ仕様（Phase 15）
5.1 設計思想
日々の地稽古と公式試合は、剣士にとってまったく価値の異なる経験である。
試合は「実戦データ」として希少性が高く、与打・被打ともに通常記録の 10倍の重み を与える。
1試合の記録が、平均的な10日分の稽古に相当する経験値・分析ポイントとして集計される。
5.2 入力UI（/record 画面）
与打セクション・被打セクションの各行に 「試合」チェックボックス を配置（左端）。
チェックが入ると、行全体が金色グロウで強調され、視覚的に試合記録であることを明示。
1回の saveLog 呼び出し内で、試合記録と通常記録を混在させて保存可能。
5.3 計算ロジック（GAS saveLog）
与打 (givenTechs[])
var matchMult  = isMatch ? 10 : 1;
var baseEarned = Math.ceil(QUANTITY_BASE[quantity] * QUALITY_MULT[quality]);
var earned     = baseEarned * matchMult;

// XP加算
givenXp += earned;

// user_techniques.Points にも earned (×10適用済み) を加算
// → SkillGrid / PlaystyleChart にそのまま反映される
量	質	通常時XP	試合時XP
1 (少ない)	1 (偶然)	1	10
3 (標準的)	3 (確実)	30	300
5 (多い)	5 (無想)	250	2,500
被打 (receivedTechs[])
var matchMult = isMatch ? 10 : 1;
var earned    = 25 * quantity * matchMult;
//              └┬┘
//          5XP × 5倍正直記録ボーナス
量	通常時XP	試合時XP
1	25	250
3	75	750
5	125	1,250
被打分析ポイント (getReceivedStatsData)
var sevMult   = SEVERITY_MULT_GAS[reason]; // 1.0 〜 3.0
var matchMult = isMatch ? 10 : 1;
var pts       = quantity * sevMult * matchMult;
量	原因 (係数)	通常時pts	試合時pts
1	攻め負け (1.0)	1.0	10.0
3	居着き (1.5)	4.5	45.0
5	手元上がり (3.0)	15.0	150.0
5.4 互換性
既存の technique_logs / received_technique_logs の過去レコードは is_match 列が空セル。
GAS は is_match === true || is_match === 'TRUE' の判定で読み込むため、空セルは自動的に 通常記録（×1） として扱われる。
過去データの再計算は不要。
6. XP・レベル・称号システム
6.1 XPカーブ
xpForLevel(n) = floor(100 * (n-1)^1.8)
レベル1〜99の指数カーブ。
レベル50到達に必要なXP: 約 35,000
レベル99到達に必要なXP: 約 545,000
6.2 称号（Title）
レベル区切りで自動付与（title_master シート参照）。
例: 入門 → 素振り → 初段 → ... → 範士 → 剣聖 → 剣神 → 剣道の神
6.3 二つ名（Epithet）
プレイスタイルに応じて動的に付与される追加称号。
EpithetMaster のレア度（N / R / SR）でフロント側のスタイル装飾を切り替え。
6.4 XP減衰
最終稽古日から3日以上空くと毎日減衰。
dailyPenalty(d) = floor(20 * (d-3)^1.3)
6.5 段位倍率（課題評価）
{ 初段:1.2, 弐段:1.5, 参段:1.8, 四段:2.2, 五段:2.7,
  六段:3.4, 七段:4.2, 八段:5.0 }
7. 他者評価システム（見取り稽古）
7.1 評価レベル倍率
function getPeerMultiplier(level) {
  if (level >= 80) return 5.0;
  if (level >= 60) return 3.0;
  if (level >= 40) return 2.0;
  if (level >= 30) return 1.5;
  if (level >= 20) return 1.2;
  return 1.0;
}
7.2 XP配分（Phase13.6）
評価された側（target）: ceil(totalScoreSum * 4 * mult) XP
評価した側（evaluator）: evaluatedTasks.length * 20 XP（見取り稽古ボーナス・倍率なし）
7.3 匿名化（Phase-ex1）
xp_history.reason には評価者名を含めず、「剣友からの評価（N課題・合計スコア: M）」と記録。
8. PWAプッシュ通知システム（Phase 12）
8.1 トリガー
GAS の時間ベーストリガー（毎日21時実行・dailyPushJob）。
8.2 通知優先度（1ユーザーにつき1通知）
優先度	カテゴリ	タイトル	本文
1	decay_warning	XP減衰警告	【警告】最終稽古記録から48時間経過。明日からXPが減衰します。
2	achievement	実績リーチ	実績解除の予兆あり。
3	peer_eval	他者評価サマリー	あなたの稽古が評価されました。
8.3 配信フロー
GAS dailyPushJob
  ↓ POST /api/push/send (token認証)
Next.js API Route (Cloudflare Pages)
  ↓ Web Push (VAPID)
ServiceWorker
  ↓
ユーザー端末
9. データ削除・リセット
ユーザー単位での削除は deleteRowsByUserId(sheet, userId) で実装。
clearContents() は使用禁止（他ユーザーへの影響を防ぐため）。
10. 開発・デプロイ
GAS: clasp でデプロイ。Code.gs をスプレッドシートにバインド。
Frontend: pnpm build && wrangler pages deploy でCloudflare Pagesへデプロイ。
環境変数:
NEXT_PUBLIC_GAS_URL: GAS WebApp URL
PUSH_INTERNAL_TOKEN: GAS-Next.js 間共有シークレット
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: Web Push用
GAS スクリプトプロパティ: PUSH_INTERNAL_TOKEN, NEXT_API_BASE
最終更新: Phase 15 完了時点（試合時特大レバレッジ実装）