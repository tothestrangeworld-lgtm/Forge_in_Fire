# 百錬自得（Forge_in_Fire） - ARCHITECTURE.md

> 剣道の稽古・技の習熟度を記録し、成長をゲーミフィケーションで可視化するWebアプリ。

---

## 1. アプリ概要と技術スタック

### フロントエンド

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 15（App Router / TypeScript） |
| ホスティング | Cloudflare Pages（`@cloudflare/next-on-pages` ビルド） |
| スタイリング | Tailwind CSS + インラインスタイル（サイバー和風テーマ） |
| フォント | M PLUS Rounded 1c |
| グラフ | Recharts（AreaChart） |
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

```
Forge_in_Fire/
├── gas/
│   └── Code.gs                             # GASバックエンド全処理 ★ Phase9.1 bugfix: EpithetMaster列マッピング修正
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                      # ルートレイアウト（AuthGuard・ナビゲーション・PWAメタデータ）★ Phase7更新
│   │   ├── manifest.ts                     # PWAマニフェスト（アプリ名・アイコン・テーマカラー等）★ Phase7追加
│   │   ├── globals.css                     # デザイントークン・共通CSS（サイバー和風テーマ）
│   │   ├── page.tsx                        # ホーム画面（HUD KPI・SkillGrid・分析・UserStatusCard使用）★ Phase9.1更新
│   │   ├── record/
│   │   │   └── page.tsx                    # 記録画面（稽古記録・技の評価）★ Phase4更新
│   │   ├── login/
│   │   │   └── page.tsx                    # ログイン画面
│   │   ├── rivals/
│   │   │   ├── page.tsx                    # 門下生一覧
│   │   │   └── [id]/page.tsx               # 他ユーザー閲覧 + 他者評価（UserStatusCard使用）★ Phase9.1更新
│   │   ├── settings/
│   │   │   ├── tasks/page.tsx              # カスタム評価項目設定 ★ Phase4更新
│   │   │   └── profile/page.tsx            # プロフィール設定（段位・座右の銘・得意技ID選択）
│   │   ├── achievements/
│   │   │   └── page.tsx                    # 実績バッジ一覧画面（UserStatusCard内の実績バッジから導線）
│   │   ├── debug/page.tsx                  # ログビューア
│   │   └── api/gas/route.ts                # GASプロキシ
│   │
│   ├── components/
│   │   ├── Navigation.tsx                  # ボトムナビ（4ボタン: ホーム・稽古記録・門下生・ログアウト）★ Phase8更新
│   │   ├── AuthGuard.tsx                   # 未ログイン時リダイレクト
│   │   ├── UserStatusCard.tsx              # ★ Phase9.1新規: ユーザーステータス共通コンポーネント（7行レイアウト）
│   │   └── charts/
│   │       ├── RadarChart.tsx              # 稽古スコアバランス（横型プログレスバー）
│   │       ├── XPTimelineChart.tsx         # XP累積推移（ステップライン・ネオングラデーション）
│   │       ├── ActivityHeatmap.tsx         # 稽古カレンダー
│   │       ├── SkillGrid.tsx               # スキルグリッド（六角形ノード・アニメーションエッジ） ★ Phase5更新
│   │       ├── PlaystyleCharts.tsx         # プレイスタイル分析
│   │       └── TrendLineChart.tsx          # スコア推移折れ線
│   │
│   ├── lib/
│   │   ├── api.ts                          # GAS APIクライアント ★ Phase6更新
│   │   ├── auth.ts                         # 認証ユーティリティ
│   │   ├── epithet.ts                      # 3層称号判定ロジック ★ Phase9全面刷新 / Phase9.1 SUBCATEGORY_ORDER修正
│   │   ├── xpMultiplier.ts                 # 段位 → XP倍率変換
│   │   └── logger.ts                       # クライアントロガー
│   │
│   └── types/
│       └── index.ts                        # 全型定義・XP/レベル計算関数 ★ Phase9.1更新
│
├── next.config.ts                          # Next.js設定（PWA設定を @ducanh2912/next-pwa でラップ）★ Phase7更新
└── public/
    ├── sw.js                               # サービスワーカー（ビルド時に自動生成）★ Phase7追加
    ├── workbox-*.js                        # Workboxランタイム（ビルド時に自動生成）★ Phase7追加
    ├── icon-192x192.png                    # PWAアイコン（要手動配置）
    └── icon-512x512.png                    # PWAアイコン（要手動配置）
```

---

## 3. データベース設計（スプレッドシート構成）

### ユーザー固有シート（A列は必ず `user_id`）

#### `user_status`
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | total_xp | 累積XP |
| C | level | レベル（1〜99） |
| D | title | 称号 |
| E | last_practice_date | 最終稽古日（YYYY-MM-DD） |
| F | last_decay_date | 最終減衰適用日（YYYY-MM-DD） |
| G | real_rank | リアル段位（例: 初段）|
| H | motto | 座右の銘 |
| I | favorite_technique | 得意技ID（例: T001） |

#### `logs`（稽古評価ログ）★ Phase4 完全正規化
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | date | 稽古日（YYYY-MM-DD） |
| C | task_id | 評価項目ID（`user_tasks` の `id` と紐づく UUID）★ item_name から変更 |
| D | score | 評価（1〜5） |
| E | xp_earned | 獲得XP |

> **設計原則（Phase4）:**
> C列ヘッダーをスプレッドシート上で `item_name` → `task_id` に**手動変更**済み。
> 保存時は UUID を格納し、読み取り時に `user_tasks` と JOIN して `item_name` に変換する。
> フロントエンドには従来通り `item_name` フィールドで返すため、チャート等の表示ロジックは無変更。

#### `settings`（稽古の意識項目）★ **廃止済み（Phase4）**
> **⚠️ このシートは廃止済み。** 物理シートが残存していても GAS からは一切アクセスしない。
> 評価項目管理は `user_tasks` に完全一本化。

#### `user_tasks`（カスタム評価項目マスタ）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | id | 項目UUID（`logs.task_id` から参照される） |
| B | user_id | ユーザーID |
| C | task_text | 評価項目名 |
| D | status | `active` / `archived` |
| E | created_at | 作成日時 |
| F | updated_at | 更新日時 |

> **アーカイブ仕様（Phase4）:**
> テキストを変更して保存すると、旧タスクは `archived` に変更され、新 UUID で新タスクが作成される。
> 元のテキストに戻して保存した場合は「変更なし」と判定し、既存 UUID を維持する。
> `archived` タスクも物理削除せず保持することで、過去ログの JOIN 復元が可能。

#### `user_techniques`（ユーザーごとの技習熟度）★ Phase8 拡張
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | technique_id | 技のID（`technique_master` の ID と紐づく） |
| C | Points | 累積ポイント（無制限に蓄積。UIは視覚的キャップで上限表示） |
| D | LastRating | 直近の質スコア（1〜5） |
| E | last_quantity | 直近の量スコア（1〜5）★ Phase8追加 |
| F | last_quality | 直近の質スコア（1〜5、D列と同値）★ Phase8追加 |
| G | last_feedback | 直近の四字熟語フィードバック ★ Phase8追加 |

#### `xp_history`（XP増減履歴）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | date | タイムスタンプ（YYYY-MM-DD HH:mm:ss） |
| C | type | gain / decay / reset / peer_eval |
| D | amount | 増減量（減衰・リセットはマイナス） |
| E | reason | 理由テキスト |
| F | total_xp_after | 適用後のXP（グラフY軸） |
| G | level | 適用後のレベル |
| H | title | 適用後の称号 |

#### `peer_evaluations`（他者評価ログ）★ Phase7 更新
| 列 | カラム名 | 内容 |
|---|---|---|
| A | evaluator_id | 評価者ID |
| B | target_id | 対象者ID |
| C | task_id | 評価対象課題ID（UUID）★ Phase7追加 |
| D | date | 評価日時 |
| E | score | 評価スコア（1〜5） |
| F | xp_granted | 付与XP |

#### `user_achievements`（ユーザー取得実績）★ Phase6追加
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | achievement_id | 実績ID（`achievement_master` の `achievement_id` と紐づく） |
| C | unlocked_at | 解除日時（YYYY-MM-DD HH:mm:ss） |

> **設計原則（Phase6）:**
> 一度解除された実績は再解除されない（重複チェックあり）。
> 物理削除は行わない（履歴として永続保持）。

---

### 全ユーザー共通マスタ

#### `technique_master`（技マスタ）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | ID | 技の識別ID（例: T001） |
| B | BodyPart | 部位（面・小手・胴・突き） |
| C | ActionType | 種別（仕掛け技・応じ技等） |
| D | SubCategory | サブカテゴリ（例: 出端技・払い技・返し技） |
| E | Name | 技の名前（例: 出小手） |

> `getDashboard` が全件を `techniqueMaster` としてフロントに返す。

#### `title_master`（称号テーブル）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | level | 称号獲得レベル |
| B | title | 称号名 |

#### `EpithetMaster`（二つ名マスタ）★ Phase9 / Phase9.1 列更新
| 列 | カラム名 | 内容 |
|---|---|---|
| A | ID | 識別ID（例: E001） |
| B | Category | 判定カテゴリ（現在は `styleCombo` 固定） |
| C | TriggerValue | 照合キー。SubCategory 上位3件を**固定順序でカンマ結合**した文字列 |
| D | Name | 二つ名テキスト（例: `暴君`）。UI表示時は自動でダブルクォーテーションで囲む |
| E | Rarity | ★ Phase9追加。レア度フラグ（`N` / `R` / `SR`）。UIの文字色・スタイルに直接使用 |
| F | Description | ★ Phase9.1追加。二つ名の由来説明文。タップ時のインライントグル表示に使用 |

> **⚠️ Phase9.1 bugfix:** 旧 `Code.gs` では E列（Rarity）と F列（Description）のマッピングが逆になっていた。
> 修正後: `rarity = row[4]`（E列）、`description = row[5]`（F列）。
> GAS の再デプロイで修正を反映すること。

> **TriggerValue の構築ルール（★ Phase9.1 SUBCATEGORY_ORDER 修正）:**
> `localeCompare('ja')` によるソートを廃止し、以下の固定順序配列で TriggerValue を生成する。
> Python の `sorted()` と完全一致させることで「未知なる」バグを解消した。
>
> ```typescript
> const SUBCATEGORY_ORDER = [
>   '二段打ち', '出端技', '基本', '引き技', '打ち落とし技',
>   '払い技', '抜き技', '摺り上げ技', '返し技'
> ];
> ```
>
> 例: 上位3件 `['払い技', '出端技', '基本']` → SUBCATEGORY_ORDER 順にソート → `'出端技,基本,払い技'`

| Rarity 値 | 意味 | UI文字色 | 追加スタイル |
|---|---|---|---|
| `N` | Normal | `#A1A1AA`（明るいグレー）★ Phase9.1: `#2B2B2B` から変更 | なし |
| `R` | Rare | `#2C4F7C`（藍鉄色） | なし |
| `SR` | Super Rare | `#8B2E2E`（深紅） | `fontWeight: 800` + `letterSpacing: 0.18em` |

> **データ駆動型設計:** フロントエンドは Rarity 列の値をそのまま UI に反映する。
> コード側でレア度を計算しないため、スプレッドシートの編集だけで演出が変わり再デプロイ不要。
> GAS は `getEpithetMasterData()` / `getDashboard()` で E列・F列もフロントに返すこと。

#### `UserMaster`（ユーザー管理）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | name | 表示名 |
| C | password | パスコード |
| D | role | admin / member |

#### `achievement_master`（実績バッジマスタ）★ Phase6追加
| 列 | カラム名 | 内容 |
|---|---|---|
| A | achievement_id | 実績ID（例: ACH001） |
| B | name | バッジ名（例: 初稽古） |
| C | condition_type | 解除条件種別（`streak_days` / `total_practices`） |
| D | condition_value | 解除条件値（数値） |
| E | description | 解除済み時の説明文 |
| F | hint | 未解除時のヒント文 |
| G | icon_type | アイコン種別キー（フロント側でアイコン選択に使用） |

> **GASによるデフォルト投入:**
> `achievement_master` シートが存在しない場合、GAS が初回アクセス時に以下の8件を自動挿入する。
> 追加・変更はスプレッドシートを直接編集することで反映される（再デプロイ不要）。

| achievement_id | name | condition_type | condition_value |
|---|---|---|---|
| ACH001 | 初稽古 | total_practices | 1 |
| ACH002 | 三日坊主克服 | streak_days | 3 |
| ACH003 | 一週間の剣士 | streak_days | 7 |
| ACH004 | 精進十日 | streak_days | 10 |
| ACH005 | 一ヶ月皆勤 | streak_days | 30 |
| ACH006 | 十稽古 | total_practices | 10 |
| ACH007 | 五十稽古 | total_practices | 50 |
| ACH008 | 百錬自得 | total_practices | 100 |

#### `error_logs`（システムログ）
timestamp / level / action / message / detail の5列。1000行超で自動削除。

---

## 4. APIエンドポイント（GASのAction一覧）

### doGet（データ取得）

| action | 主要パラメータ | 内容 |
|---|---|---|
| `getDashboard` | `user_id` | ステータス・タスク・ログ（JOIN済み）・マスタ・xpHistory・techniqueMaster・peerLogs を返す。XP減衰も自動適用。★ Phase8 Step3-1: peerLogs 追加 |
| `getLogs` | `user_id`, `limit` | ログ一覧（task_id → item_name にJOIN済み）★ Phase4更新 |
| `getUserStatus` | `user_id` | XP・レベル・称号・プロフィール |
| `getTechniques` | `user_id` | 技習熟度（technique_master × user_techniques JOIN済み） |
| `getEpithetMaster` | なし | 二つ名マスタ（★ Phase9.1: rarity=E列・description=F列 のマッピング修正済み） |
| `getUsers` | なし | ユーザー一覧（パスワード除く） |
| `getAchievements` | `user_id` | 全実績データ（achievement_master × user_achievements JOIN済み）★ Phase6追加 |
| `getTodayEvaluations` | `user_id`, `target_id` | 今日の評価済み task_id 一覧★ Phase7追加 |

> **★ REMOVED:** `getSettings` アクションを廃止。

### doPost（データ書き込み）

| action | 主要パラメータ | 内容 |
|---|---|---|
| `login` | `user_id` or `name`, `password` | 認証 |
| `saveLog` | `user_id`, `date`, `items[]` | 稽古ログ保存。レスポンスに `newAchievements` を含む。★ Phase6更新 |
| `updateTasks` | `user_id`, `tasks[]` | 評価項目のスマート差分保存（後述）★ Phase4更新 |
| `archiveTask` | `user_id`, `task_id` | 個別タスクをアーカイブ |
| `updateProfile` | `user_id`, `real_rank`, `motto`, `favorite_technique` | プロフィール更新（`favorite_technique` は技ID） |
| `resetStatus` | `user_id` | XP・レベル初期化 |
| `updateTechniqueRating` | `user_id`, `id`, `quantity`, `quality` | 技習熟度を量×質で更新。XP・xp_history 連動。★ Phase8刷新 |
| `evaluatePeer` | `user_id`, `target_id`, `items[]` | 課題単位の他者評価（配列）★ Phase7更新 |

> **★ REMOVED:** `updateSettings` アクションを廃止。

---

## 5. データフロー

### 稽古記録の正規化（Phase4）

```
【記録時】
フロント record/page.tsx
  └─ saveLog({ items: [{ task_id: "uuid-...", score: 4 }] })
       └─ GAS saveLog()
            └─ logs シートに [user_id, date, task_id, score, xp_earned] を保存

【読み取り時】
GAS getDashboard() / getLogs()
  └─ buildTaskTextMap(ss, userId)  ← user_tasks の id→text マップ構築
       └─ logs 行の task_id を item_name に変換
            └─ フロントには { date, item_name, score, xp_earned } で返す
```

> **ポイント:** フロントエンドの表示ロジック（RadarChart、ログ一覧等）は
> `item_name` フィールドを使い続けており、**Phase4 の変更に対して無変更**。

### 課題のスマート差分保存（Phase4）

```
フロント tasks/page.tsx
  ├─ 初期ロード時に originalTasks を保持
  └─ 保存時: values[i] と originalTasks[i].task_text を比較
       ├─ 一致（変更なし or 元に戻した）→ { id: original.id, text } を送信
       │      └─ GAS: 既存行を active に保ち text を更新
       └─ 不一致 or 新規 → { text } のみ送信（id なし）
              └─ GAS: 旧 ID をアーカイブ、新 UUID を発行して active で追加
```

### アチーブメント解除フロー（Phase6）

```
【saveLog 時の実績判定フック】

GAS saveLog()
  ├─ logs シートへ記録
  ├─ user_status を更新
  ├─ xp_history へ記録
  └─ checkAndUnlockAchievements(ss, userId, date, logSheet)
       ├─ achievement_master から全マスタを取得
       ├─ user_achievements からユーザーの解除済み ID セットを構築
       ├─ 未解除かつ対象 condition_type のものだけ判定
       │    ├─ 'streak_days'     → calcCurrentStreak() で今日からの連続日数を算出
       │    └─ 'total_practices' → calcTotalPractices() でユニーク稽古日数を算出
       ├─ 条件を満たすものを user_achievements に追記（unlocked_at = 現在時刻）
       └─ 新規解除一覧を saveLog のレスポンスに newAchievements として含める

【独立取得】
フロント → fetchAchievements()
  └─ GAS getAchievements()
       ├─ achievement_master 全件取得
       ├─ user_achievements から当該ユーザーの解除済みマップを構築
       └─ JOIN結果を Achievement[] として返す
            { id, name, description, hint, iconType, isUnlocked, unlockedAt }
```

---

## 5.5 ナビゲーション構成（Phase8 更新）

### ボトムナビゲーション — 4ボタン構成

モバイル UX 最適化のため、Phase8 にてボトムナビを **5ボタン → 4ボタン** に変更。
「実績（Trophy）」ボタンをナビから削除し、代わりに **`UserStatusCard` の2行目** に実績バッジ導線を統合した（Phase9.1）。

```
┌─────────────────────────────────────┐
│  ホーム   稽古記録   門下生  ユーザー名 │
│   🏠       ⚔️      👥     🚪      │  ← BottomNav（60px）
└─────────────────────────────────────┘
   /         /record   /rivals   logout
```

| # | ラベル | アイコン（lucide-react） | リンク先 | ハイライト条件 |
|---|---|---|---|---|
| 1 | ホーム | `Home` | `/` | `pathname === '/'` |
| 2 | 稽古記録 | `Swords` | `/record` | `pathname.startsWith('/record')` |
| 3 | 門下生 | `Users` | `/rivals` | `pathname.startsWith('/rivals')` |
| 4 | ユーザー名 | `LogOut` | — | ボタン（logout処理） |

### 実績ページへのアクセス

実績一覧（`/achievements`）へのアクセスは **`UserStatusCard` 2行目の実績バッジ**（`🏆 X/Y`）から行う。
ホーム画面では `achiev` prop を渡して表示。rivals 画面では `achiev` prop を省略して非表示。

### ページ遷移図

```
                    ┌──────────┐
            ┌──────▶│  /login  │
            │       └──────────┘
            │ 未認証        │ ログイン成功
            │    ┌──────────▼────────────────────┐
            │    │    / (ホーム)                   │
            │    │  UserStatusCard ★Phase9.1      │
            │    │    └─[🏆 実績バッジ]──────────────────────┐
            │    │  HUD KPI・SkillGrid・分析        │           │
            │    └──────────┬────────────────────┘           │
            │               │ BottomNav                       │
            │    ┌──────────┼──────────┐                     │
            │    ▼          ▼          ▼                      ▼
            │ /record    /rivals   /settings/*         /achievements
            │ 稽古記録   門下生一覧   設定              実績バッジ一覧
            │ ★Phase4       │
            │               ├── /rivals/[id]
            │               │   他ユーザー閲覧（UserStatusCard）
            │               │   + 他者評価 ★Phase5/7
            │          /settings/tasks
            │          /settings/profile
            │
            └─────────── AuthGuard（未ログイン時リダイレクト）
```

---

## 6. 型定義（主要インターフェース）

### ★ Phase4 廃止

```typescript
// 廃止済み
export interface Setting { item_name: string; is_active: boolean; }
// DashboardData.settings フィールドも廃止
```

### ★ Phase9 / Phase9.1: EpithetMasterEntry

```typescript
export interface EpithetMasterEntry {
  id:           string;
  category:     string;
  triggerValue: string;
  name:         string;
  /**
   * ★ Phase9.1: 二つ名の由来説明文（F列）。
   * EpithetNameButton のインライントグルで表示。
   * 空の場合は "まだ見ぬ剣の道を歩む者" にフォールバック。
   */
  description?: string;
  /**
   * ★ Phase9: レア度フラグ（E列）。N / R / SR。
   * コードでレア度を計算せず、マスタ値をそのままUIに反映する。
   */
  rarity?: 'N' | 'R' | 'SR';
}
```

### ★ Phase9 / Phase9.1: EpithetResult（3層構造）

```typescript
// src/lib/epithet.ts で定義・export
export interface EpithetResult {
  epithetName:        string;        // Layer1: 二つ名（例: "暴君"）
  epithetRarity:      'N'|'R'|'SR';  // Layer1: レア度フラグ（マスタ直接参照）
  epithetDescription: string;        // Layer1: 由来説明文（★ Phase9.1追加）
  favoritePartTitle:  string;        // Layer2: 得意部位称号（例: "小手一閃"）
  levelTitle:         string;        // Layer3: レベル称号（例: "初段"）
}

// 呼び出しシグネチャ（Phase9以降）
calcEpithet(
  techniques:    Technique[],
  epithetMaster: EpithetMasterEntry[],
  level:         number,           // ← calcLevelFromXp() 済みの値
  titleMaster?:  TitleMasterEntry[],
): EpithetResult
```

### ★ Phase6 追加: Achievement・AchievementMasterEntry

```typescript
export interface AchievementMasterEntry {
  id:             string;
  name:           string;
  conditionType:  string;  // "streak_days" | "total_practices"
  conditionValue: number;
  description:    string;
  hint:           string;
  iconType:       string;
}

export interface Achievement {
  id:          string;
  name:        string;
  description: string;
  hint:        string;
  iconType:    string;
  isUnlocked:  boolean;
  unlockedAt:  string | null;
}
```

### DashboardData（Phase8 Step3-1 後）

```typescript
DashboardData: {
  status:           UserStatus
  tasks?:           UserTask[]
  logs:             LogEntry[]          // GASがJOINして item_name を復元済み
  nextLevelXp:      NextLevelInfo
  decay?:           DecayInfo
  titleMaster?:     TitleMasterEntry[]
  epithetMaster?:   EpithetMasterEntry[]  // Phase9.1: rarity + description を含む
  xpHistory?:       XpHistoryEntry[]
  techniqueMaster?: TechniqueMasterEntry[]
  peerLogs?:        PeerLogEntry[]        // Phase8 Step3-1 追加
}
```

---

## 6.5 称号システム（Phase9 / Phase9.1）★ UPDATED

### 概要：3層構造

```
┌─────────────────────────────────────────────┐
│  "暴君"（タップで由来表示）  吉木直人          │  ← Layer1: 二つ名（Rarity で色変化）
│  Lv.15  初段  🏆 8/24                       │  ← Layer3: レベル称号 + 実績バッジ
│  信条: 百錬自得                               │  ← 座右の銘（未設定時は非表示）
│  部位称号: 小手一閃  リアル段位: 初段          │  ← Layer2: 得意部位称号 + 段位
│  TOTAL XP: 12,340                           │  ← 経験値
│  [████████░░░░░░░] 次のLv.16まで 660 xp    │  ← プログレスバー + 残XP
└─────────────────────────────────────────────┘
```

この7行レイアウトは `UserStatusCard` コンポーネントとして実装され、
ホーム画面と rivals 画面で完全に同一のコードを使用する。

### Layer 1: 二つ名（EpithetMaster / styleCombo）

**TriggerKey 生成アルゴリズム（★ Phase9.1 SUBCATEGORY_ORDER 修正）:**

```
1. user_techniques から subCategory ごとの累計ポイントを集計
2. ポイント降順ソート（同点時: SUBCATEGORY_ORDER の indexOf 順）で上位3件抽出
3. 上位3件を SUBCATEGORY_ORDER 順でソートしてカンマ結合 → triggerKey
   ※ localeCompare('ja') を廃止。Python の sorted() と完全一致させる。
4. EpithetMaster から category === 'styleCombo' かつ triggerValue === triggerKey を検索
5. Name / Rarity / Description をそのまま返す（コードでレア度計算しない）
6. 未登録: epithetName="未知なる", epithetRarity="N", epithetDescription=フォールバック
```

**由来のインライントグル表示（★ Phase9.1）:**
二つ名テキストをタップすると、Rarity に対応したアクセントカラーの吹き出しが展開し、
`epithetDescription`（由来説明文）のみがシンプルに表示される。`【由来】` ラベルは非表示。

### Layer 2: 得意部位称号

| 累計ポイント | サフィックス | 例（小手） |
|---|---|---|
| 10000以上 | `の神髄` | 小手の神髄 |
| 5000以上 | `免許皆伝` | 小手免許皆伝 |
| 2000以上 | `一閃` | 小手一閃 |
| 500以上 | `の練達` | 小手の練達 |
| 100以上 | `修練者` | 小手修練者 |
| 0以上 | `の嗜み` | 小手の嗜み |

### Layer 3: レベル称号
`titleForLevel(level, titleMaster)` で title_master から取得。

---

## 6.6 UserStatusCard コンポーネント（Phase9.1 新設）★ NEW

### 配置場所

`src/components/UserStatusCard.tsx`

### 目的

ホーム画面（`src/app/page.tsx`）とライバル画面（`src/app/rivals/[id]/page.tsx`）で
以前は独自に実装されていたステータス表示エリアを、単一の共通コンポーネントに統一する。
これにより、UIの変更箇所が1ファイルに集約され、両画面の表示が常に一致する。

### 7行レイアウト仕様

| 行 | 内容 | サイズ | 備考 |
|---|---|---|---|
| 1行目 | `"二つ名"（トグル）` + `氏名` | 1.25rem | 両要素同一サイズ。Rarity で二つ名色変化 |
| 2行目 | `Lv.XX バッジ` + `レベル称号` + `🏆 実績バッジ` | small | 実績は `achiev` prop が渡された場合のみ表示 |
| 3行目 | `信条:` + motto | small | motto 未設定時は行ごと非表示 |
| 4行目 | `部位称号:` + 値 ／ `リアル段位:` + 値 | small | ラベルは薄色、値を強調 |
| 区切り線 | — | — | rgba(99,102,241,0.15) |
| 5行目 | `TOTAL XP:` + 数値 | 1.6rem | tabular-nums でデジタル感 |
| 6行目 | XPプログレスバー | — | グラデーション + グロー |
| 7行目 | `次のLv.XX まで XXXX xp` + `XX%` | small | **称号名は非表示**（ワクワク感のため） |

### Props

```typescript
export interface UserStatusCardProps {
  userName:    string;                             // 表示ユーザー名
  epithet:     EpithetResult;                      // calcEpithet() の戻り値
  totalXp:     number;                             // status.total_xp
  level:       number;                             // calcLevelFromXp(totalXp)
  realRank?:   string;                             // 空/"無段" → "無段" 表示
  motto?:      string;                             // 未設定時は3行目を非表示
  achiev?:     { unlocked: number; total: number } | null;
  // ↑ ホーム画面から渡す。rivals 画面では省略（実績バッジ非表示）
}
```

### ラベルと値の視覚的区別

| 要素 | スタイル |
|---|---|
| ラベル（`信条:` `部位称号:` `TOTAL XP:` など） | `rgba(129,140,248,0.45)`・`0.65rem`・`fontWeight:600` |
| 値（motto テキスト・称号・XP数値など） | `rgba(199,210,254,0.88)`・`0.72rem`・`fontWeight:700` |
| TOTAL XP 数値 | `#e0e7ff`・`1.6rem`・`fontWeight:900` |

### EpithetNameButton（インナーコンポーネント）

`UserStatusCard` 内で定義するローカルコンポーネント。
1行目の二つ名部分を構成し、タップで由来トグルを展開する。
同コンポーネントは rivals 画面でも `UserStatusCard` 経由で同一コードが適用される。

---

## 7. SkillGrid のノード設計（Phase5 更新）

### 概要

`SkillGrid.tsx` は @xyflow/react を用いた技の習熟度ビジュアライザー（サイバー八卦陣）。
Phase5 にて**全ノードを六角形カスタムノード**に刷新し、**無限ポイントに対する視覚的キャップ付きUI**を導入した。
さらにレイアウトアルゴリズムを**放射状等間隔レイアウト（Radial Equal-Spacing Layout）**に刷新した。

### ノード種別とシェイプ

| ノード種別 | 形状 | clip-path |
|---|---|---|
| `CoreNode`（中心） | 八角形 | `polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)` |
| `BodyPartNode`（部位） | 六角形（大） | `polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)` |
| `TechniqueNode`（技） | 六角形（標準） | `polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)` |

---

### 放射状等間隔レイアウト（Radial Equal-Spacing Layout）

```
1. BodyPart ごとに技をグループ化し、合計ポイント降順でソート
2. 全技を1本のリストに展開（totalTechs 件）
3. 外周半径 R_OUTER をダイナミックに計算:
     R_OUTER = max(MIN_R_OUTER, totalTechs × MAX_TECH_DISPLAY_SIZE × SPACING_FACTOR / 2π)
4. 各技にグローバル角度を割り当て:
     angle[i] = (2π / totalTechs) * i - π/2
5. 各技を外周円上に配置:
     (x, y) = (R_OUTER × cos(angle), R_OUTER × sin(angle))
6. 各 BodyPart を中間半径（R_MID = R_OUTER × 0.5）に配置:
     avgAngle = atan2(Σsin(子角度), Σcos(子角度))   ← 円形平均
```

| 定数 | 値 | 意味 |
|---|---|---|
| `MIN_R_OUTER` | `320` | 最小外周半径（px） |
| `R_MID_RATIO` | `0.50` | BodyPart を外周の何割の位置に置くか |
| `SPACING_FACTOR` | `1.55` | 隣接ノード間のスペース係数 |
| `MAX_TECH_DISPLAY_SIZE` | `78` | 末端ノードの最大表示サイズ（px） |

### 視覚的キャップ（上限）設計

```
TECH_SCORE_CAP = 10   // TechniqueNode の視覚的上限スコア
techNorm = Math.min(points / TECH_SCORE_CAP, 1.0)
```

### エフェクトのしきい値

| 状態 | 条件 | エフェクト |
|---|---|---|
| 未練習 | `points === 0` | 暗色・発光なし |
| 練習中 | `0 < norm ≤ 0.2` | 深紫グラデーション・微発光 |
| 習熟中 | `0.2 < norm ≤ 0.6` | 紫グラデーション・中発光 |
| 高習熟 | `0.6 < norm < 1.0` | 明紫グラデーション・強発光 |
| **カンスト** | `norm ≥ 1.0` | 黄金グラデーション・`maxed-pulse`・MAXバッジ |
| **得意技** | `id === signatureTechId` | 深紅オーラ・`signature-pulse`・★バッジ（カンストより優先） |

---

## 8. 環境変数

| 変数名 | 必須 | 内容 |
|---|---|---|
| `GAS_URL` | ✅ | GAS Web App の公開URL（サーバーサイドのみ） |

---

## 9. 実装済みの主要機能

### ✅ 稽古XP記録システム（Phase4 完全正規化済み）
### ✅ settings シート廃止（Phase4）
### ✅ 課題のスマート変更検知・アーカイブ（Phase4）
### ✅ XP・レベルシステム（Lv1〜99）指数カーブ `xpForLevel(n) = floor(100 × (n-1)^1.8)`
### ✅ XP減衰システム（3日猶予 → `floor(20 × (d-3)^1.3)` / 日）
### ✅ 技DB正規化（technique_master + user_techniques）
### ✅ SkillGrid 六角形カスタムノード + 放射状等間隔レイアウト（Phase5）
### ✅ 他者評価の5段階スコア化（Phase5）
### ✅ アチーブメントシステム バックエンド・API層（Phase6）
### ✅ SWRによるデータキャッシュ化（Phase6）
### ✅ PWA対応（Phase7）
### ✅ evaluatePeer の課題単位配列評価化（Phase7）
### ✅ updateTechniqueRating の量×質マトリックス方式（Phase8）
### ✅ getDashboard に peerLogs 追加（Phase8 Step3-1）
### ✅ モバイル UX 最適化（ボトムナビ4ボタン化・実績導線ホーム統合）（Phase8）

### ✅ 称号システム3層構造化・DBフラグ参照型レア度判定（Phase9）
- Layer1 二つ名: StyleCombo マスタの Name / Rarity / Description をそのまま返す
- Layer2 得意部位称号: 面・小手・胴・突き の合計ポイント最大部位 × 6段階サフィックス
- Layer3 レベル称号: title_master から titleForLevel() で取得

### ✅ Phase9.1 バグ修正・UI統一
- **`Code.gs` 列マッピング修正:** EpithetMaster の `rarity=row[4]`（E列）・`description=row[5]`（F列）に正しくマッピング。旧実装で逆転していた列を修正。
- **`SUBCATEGORY_ORDER` 固定ソート:** `localeCompare('ja')` を廃止し、Python の `sorted()` と完全一致する固定配列でソートすることで「未知なる」バグを解消。
- **Normal レア度の文字色改善:** `#2B2B2B`（暗すぎ）→ `#A1A1AA`（ダークモード視認性向上）。
- **二つ名・ユーザー名フォントサイズ統一:** 両要素を `1.25rem` に統一し横並びのバランスを整備。
- **由来ポップアップの `【由来】` ラベル削除:** 説明文のみシンプルに表示。
- **`UserStatusCard` 共通コンポーネント化:** ホーム画面と rivals 画面のステータス表示を7行レイアウトに統一。

---

## 10. スプレッドシートの手動変更が必要な作業

### Phase4 移行時

| シート | 変更内容 |
|---|---|
| `logs` | C列ヘッダーを `item_name` → `task_id` に変更 |

### Phase5 移行時（他者評価スコア化）

| シート | 変更内容 |
|---|---|
| `peer_evaluations` | D列ヘッダーを `xp_granted` → `score` に変更し、E列に `xp_granted` を追加 |

### Phase6 移行時（アチーブメントシステム）

| シート | 変更内容 |
|---|---|
| `achievement_master` | GAS が初回 `getAchievements` 呼び出し時に自動作成・デフォルトデータを投入する |
| `user_achievements` | GAS が初回書き込み時に自動作成する |

### Phase7 移行時（PWA化・peer_evaluations 列追加）

| 作業 | 内容 |
|---|---|
| パッケージインストール | `npm install @ducanh2912/next-pwa swr` を実行 |
| アイコン配置 | `public/icon-192x192.png` と `public/512x512.png` を手動配置 |
| `peer_evaluations` | **C列に `task_id` を挿入**（旧: C=date → 新: C=task_id, D=date, E=score, F=xp_granted）|

### Phase8 移行時（user_techniques 列追加）

| シート | 変更内容 |
|---|---|
| `user_techniques` | E列 `last_quantity`、F列 `last_quality`、G列 `last_feedback` を追加（既存行は空欄でよい） |

### Phase9 移行時（EpithetMaster 列追加）

| シート | 変更内容 |
|---|---|
| `EpithetMaster` | **E列 `Rarity`**（N/R/SR）を追加。全既存行に値を入力する。空の場合は `N` として扱われる |

### Phase9.1 移行時（Description 列追加・GAS バグ修正）

| 作業 | 内容 |
|---|---|
| `EpithetMaster` スプレッドシート | **F列 `Description`**（由来説明文）を追加。空でも動作する（フォールバック文字列を表示） |
| `Code.gs` 再デプロイ | `getEpithetMasterData()` の列マッピング修正（`rarity=row[4]`・`description=row[5]`）を反映 |
| フロントエンド更新 | `src/lib/epithet.ts`・`src/app/page.tsx`・`src/app/rivals/[id]/page.tsx`・`src/components/UserStatusCard.tsx`（新規）・`src/types/index.ts` を上書き |

> **後方互換:** E列・F列が存在しない旧マスタ行は `rarity: undefined → 'N'`、`description: undefined → フォールバック文字列` として動作し、エラーは発生しない。

---

## 11. 今後の拡張ポイント

- [ ] アチーブメント `condition_type` の拡張（`total_xp`, `level_reached`, `technique_mastery` 等）
- [ ] ランキング画面
- [x] PWA対応（オフライン記録 → 同期）★ Phase7 完了
- [ ] パスワードのハッシュ化
- [x] アチーブメントシステム（Phase6 完了）
- [x] 他者評価の5段階スコア化（Phase5 完了）
- [x] 他者評価の課題単位配列化（Phase7 完了）
- [ ] 他者評価の累計受信数・平均スコアをダッシュボードに表示
- [ ] 段位倍率の管理画面
- [ ] 旧 logs データの一括マイグレーション（item_name → task_id）
- [ ] アチーブメント解除通知 UI（トースト・バッジアニメーション）
- [ ] PWAアイコンのデザイン制作（192px・512px）
- [x] モバイル UX 最適化（ボトムナビ4ボタン化・実績導線ホーム統合）★ Phase8 完了
- [x] 称号システム3層構造化・DBフラグ参照型レア度判定 ★ Phase9 完了
- [x] Phase9.1 バグ修正（列マッピング・ソート順・Normal色・フォントサイズ統一・ラベル削除）★ 完了
- [x] UserStatusCard 共通コンポーネント化（7行レイアウト統一）★ 完了
- [ ] EpithetMaster の styleCombo 以外のカテゴリ拡張（復活検討）
- [ ] SR 二つ名の演出強化（グロー・アニメーション）
