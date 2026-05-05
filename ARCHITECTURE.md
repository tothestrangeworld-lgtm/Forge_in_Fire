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
│   └── Code.gs                             # GASバックエンド全処理
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                      # ルートレイアウト（AuthGuard・ナビゲーション・PWAメタデータ）★ Phase7更新
│   │   ├── manifest.ts                     # PWAマニフェスト（アプリ名・アイコン・テーマカラー等）★ Phase7追加
│   │   ├── globals.css                     # デザイントークン・共通CSS（サイバー和風テーマ）
│   │   ├── page.tsx                        # ホーム画面（HUD KPI・スキルグリッド・分析・プロフィール・実績バッジ導線）★ Phase8更新
│   │   ├── record/
│   │   │   └── page.tsx                    # 記録画面（稽古記録・技の評価）★ Phase4更新
│   │   ├── login/
│   │   │   └── page.tsx                    # ログイン画面
│   │   ├── rivals/
│   │   │   ├── page.tsx                    # 門下生一覧
│   │   │   └── [id]/page.tsx               # 他ユーザー閲覧 + 他者評価（5段階★）★ Phase5更新
│   │   ├── settings/
│   │   │   ├── tasks/page.tsx              # カスタム評価項目設定 ★ Phase4更新
│   │   │   └── profile/page.tsx            # プロフィール設定（段位・座右の銘・得意技ID選択）
│   │   ├── achievements/
│   │   │   └── page.tsx                    # 実績バッジ一覧画面（ホーム画面プロフィールエリアから導線）★ Phase8更新
│   │   ├── debug/page.tsx                  # ログビューア
│   │   └── api/gas/route.ts                # GASプロキシ
│   │
│   ├── components/
│   │   ├── Navigation.tsx                  # ボトムナビ（4ボタン: ホーム・稽古記録・門下生・ログアウト）★ Phase8更新
│   │   ├── AuthGuard.tsx                   # 未ログイン時リダイレクト
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
│   │   ├── epithet.ts                      # 二つ名判定ロジック
│   │   ├── xpMultiplier.ts                 # 段位 → XP倍率変換
│   │   └── logger.ts                       # クライアントロガー
│   │
│   └── types/
│       └── index.ts                        # 全型定義・XP/レベル計算関数 ★ Phase6更新
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

#### `user_techniques`（ユーザーごとの技習熟度）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | technique_id | 技のID（`technique_master` の ID と紐づく） |
| C | Points | 累積ポイント（無制限に蓄積。UIは視覚的キャップで上限表示） |
| D | LastRating | 直近の星評価（1〜5） |

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

#### `peer_evaluations`（他者評価ログ）★ Phase5更新
| 列 | カラム名 | 内容 |
|---|---|---|
| A | evaluator_id | 評価者ID |
| B | target_id | 対象者ID |
| C | date | 評価日時 |
| D | score | 評価スコア（1〜5） ★ Phase5追加 |
| E | xp_granted | 付与XP（score × 2 × 倍率） ★ Phase5更新 |

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
| B | BodyPart | 部位 |
| C | ActionType | 種別（仕掛け技・応じ技等） |
| D | SubCategory | サブカテゴリ |
| E | Name | 技の名前 |

> `getDashboard` が全件を `techniqueMaster` としてフロントに返す。

#### `title_master`（称号テーブル）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | level | 称号獲得レベル |
| B | title | 称号名 |

#### `EpithetMaster`（二つ名マスタ）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | ID | 識別ID |
| B | Category | 判定カテゴリ |
| C | TriggerValue | 照合キー |
| D | Name | 修飾語 |
| E | Description | 説明文 |

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
| `getDashboard` | `user_id` | ステータス・タスク・ログ（JOIN済み）・マスタ・xpHistory・techniqueMaster を返す。XP減衰も自動適用。★ Phase4: settings フィールド廃止 |
| `getLogs` | `user_id`, `limit` | ログ一覧（task_id → item_name にJOIN済み）★ Phase4更新 |
| `getUserStatus` | `user_id` | XP・レベル・称号・プロフィール |
| `getTechniques` | `user_id` | 技習熟度（technique_master × user_techniques JOIN済み） |
| `getEpithetMaster` | なし | 二つ名マスタ |
| `getUsers` | なし | ユーザー一覧（パスワード除く） |
| `getAchievements` | `user_id` | 全実績データ（achievement_master × user_achievements JOIN済み）★ Phase6追加 |

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
| `updateTechniqueRating` | `user_id`, `id`, `rating` | user_techniques を upsert |
| `evaluatePeer` | `user_id`, `target_id`, `score` | 他者評価（5段階スコア付きXP付与）★ Phase5更新 |

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

### アチーブメント解除フロー（Phase6）★ NEW

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

#### 実績判定ロジック詳細

**`streak_days`（連続稽古日数）**

`calcCurrentStreak(logSheet, userId, todayStr)` が、logs シート上のユニーク稽古日セットを構築し、今日から1日ずつ遡って連続している日数を返す。saveLog 後に呼ぶため、当日分は必ずセットに含まれる。

**`total_practices`（累計稽古日数）**

`calcTotalPractices(logSheet, userId, todayStr)` が、logs シートのユニーク稽古日数（稽古を行った日の種類数）を返す。同一日の複数エントリは1日としてカウントする。

**エラー安全性**

`checkAndUnlockAchievements` 内のエラーは `try/catch` で捕捉し `gasLog` に記録する。判定失敗は `saveLog` のレスポンスをブロックせず、`newAchievements: []` が返る。

---

## 5.5 ナビゲーション構成（Phase8 更新）★ UPDATED

### ボトムナビゲーション — 4ボタン構成

モバイル UX 最適化のため、Phase8 にてボトムナビを **5ボタン → 4ボタン** に変更。
「実績（Trophy）」ボタンをナビから削除し、代わりに **ホーム画面のプロフィールエリア** に実績バッジ導線を追加した。
ボタン数が1つ減ることで各タップターゲットの横幅が広がり、親指での操作が容易になる。

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

### 実績ページへのアクセス（Phase8 変更点）

実績一覧（`/achievements`）へのアクセスは、ホーム画面プロフィールエリアの **実績バッジ** から行う。

- バッジは XP・称号カード内の「得意技バッジ」と同行に横並びで表示される
- 解除数 / 総数を `🏆 実績: X/Y` 形式でリアルタイム表示（`fetchAchievements()` で非同期取得）
- サイバー和風テーマに合わせた透過背景 + 細枠線デザイン（`rgba(79,70,229,0.08)` 背景 / `rgba(99,102,241,0.28)` ボーダー）

### ページ遷移図

```
                    ┌──────────┐
            ┌──────▶│  /login  │
            │       └──────────┘
            │ 未認証        │ ログイン成功
            │    ┌──────────▼────────────────────┐
            │    │    / (ホーム)                   │
            │    │  HUD KPI・SkillGrid             │
            │    │  プロフィールエリア               │
            │    │    └─[🏆 実績バッジ]──────────────────────┐
            │    └──────────┬────────────────────┘           │
            │               │ BottomNav                       │
            │    ┌──────────┼──────────┐                     │
            │    ▼          ▼          ▼                      ▼
            │ /record    /rivals   /settings/*         /achievements
            │ 稽古記録   門下生一覧   設定              実績バッジ一覧
            │ ★Phase4       │                          ★Phase6追加
            │               ├── /rivals/[id]
            │               │   他ユーザー閲覧
            │               │   + 他者評価 ★Phase5
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
// api.ts の fetchSettings() / updateSettings() も廃止
```

### ★ Phase4 更新: SaveLogPayload

```typescript
// 変更前
items: Array<{ item_name: string; score: number }>

// 変更後
items: Array<{ task_id: string; score: number }>
// task_id は UserTask.id（UUID）
```

### ★ Phase4 更新: updateTasks ペイロード

```typescript
// 変更前: string[]（テキストの配列）
// 変更後: TaskDiff[]
export interface TaskDiff {
  id?:  string;  // 既存タスク UUID（テキスト変更なしの場合のみ）
  text: string;  // タスクテキスト
}
```

### ★ Phase6 追加: Achievement・AchievementMasterEntry

```typescript
/** achievement_master シートの1行（全ユーザー共通マスタ） */
export interface AchievementMasterEntry {
  id:             string;  // 例: "ACH001"
  name:           string;  // 例: "初稽古"
  conditionType:  string;  // "streak_days" | "total_practices"
  conditionValue: number;  // 例: 7
  description:    string;
  hint:           string;
  iconType:       string;  // フロントでアイコン選択に使用
}

/** getAchievements API が返す要素型（マスタ + user_achievements JOIN済み） */
export interface Achievement {
  id:          string;
  name:        string;
  description: string;
  hint:        string;       // 未解除時に表示するヒント
  iconType:    string;
  isUnlocked:  boolean;
  unlockedAt:  string | null; // YYYY-MM-DD HH:mm:ss、未解除は null
}
```

### ★ Phase6 更新: SaveLogResponse

```typescript
export interface SaveLogResponse {
  xp_earned:        number;
  total_xp:         number;
  level:            number;
  title:            string;
  newAchievements?: Achievement[]; // 今回新規解除された実績一覧（空配列の場合あり）
}
```

### DashboardData（Phase4 後）

```typescript
DashboardData: {
  status:           UserStatus
  // settings フィールドは廃止
  tasks?:           UserTask[]          // 評価項目（active/archived含む）
  logs:             LogEntry[]          // GASがJOINして item_name を復元済み
  nextLevelXp:      NextLevelInfo
  decay?:           DecayInfo
  titleMaster?:     TitleMasterEntry[]
  epithetMaster?:   EpithetMasterEntry[]
  xpHistory?:       XpHistoryEntry[]
  techniqueMaster?: TechniqueMasterEntry[]
}
```

---

## 7. SkillGrid のノード設計（Phase5 更新） ★ NEW

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

> **React Flow と clip-path の共存について:**
> ハンドル（Handle）を全て中心座標（`top: 50%, left: 50%`）に透明配置することで、
> clip-path による非矩形ノードでも接続線が正しく描画される。

---

### 放射状等間隔レイアウト（Radial Equal-Spacing Layout） ★ Phase5 刷新

#### 採用理由

旧レイアウト（ツリー形式）では、BodyPart ノードを N 等分した方向に放射し、
その先に配下の技を扇状に並べる構造をとっていた。
この方式では**「面」のように技が多い部位に広い領域が割り当てられ、技の少ない部位がスカスカになる**という
視覚的偏りが生じていた。

**放射状等間隔レイアウトでは、全末端ノード（技）の数を基準に外周を等分するため、
部位ごとの技の数に関わらずグリッド全体の密度が均一になる。**

#### アルゴリズム概要

```
1. BodyPart ごとに技をグループ化し、合計ポイント降順でソート
2. 全技を1本のリストに展開（totalTechs 件）
3. 外周半径 R_OUTER をダイナミックに計算:
     R_OUTER = max(MIN_R_OUTER, totalTechs × MAX_TECH_DISPLAY_SIZE × SPACING_FACTOR / 2π)
4. 各技にグローバル角度を割り当て:
     angle[i] = (2π / totalTechs) * i - π/2   ← 真上（12時）から時計回り
5. 各技を外周円上に配置:
     (x, y) = (R_OUTER × cos(angle), R_OUTER × sin(angle))
6. 各 BodyPart を中間半径（R_MID = R_OUTER × 0.5）に配置:
     avgAngle = atan2(Σsin(子角度), Σcos(子角度))   ← 円形平均（Circular Mean）
     (x, y) = (R_MID × cos(avgAngle), R_MID × sin(avgAngle))
```

#### 円形平均（Circular Mean）について

BodyPart ノードの位置は、配下の技の角度の「平均方向」に置く。
通常の算術平均では 350° と 10° の平均が誤って 180° になるが、
`atan2(Σsin, Σcos)` を用いることで正しく 0° が得られる。

```typescript
const sinSum = childAngles.reduce((s, a) => s + Math.sin(a), 0);
const cosSum = childAngles.reduce((s, a) => s + Math.cos(a), 0);
const avgAngle = Math.atan2(sinSum, cosSum);
```

#### 衝突回避（ダイナミック・サイジング）

末端ノード数に応じて外周半径を自動拡大し、隣接ノードの重なりを防ぐ。

```
周長 ≥ totalTechs × MAX_TECH_DISPLAY_SIZE × SPACING_FACTOR
→ R_OUTER ≥ (totalTechs × 78px × 1.55) / 2π
```

| 定数 | 値 | 意味 |
|---|---|---|
| `MIN_R_OUTER` | `320` | 最小外周半径（px） |
| `R_MID_RATIO` | `0.50` | BodyPart を外周の何割の位置に置くか |
| `SPACING_FACTOR` | `1.55` | 隣接ノード間のスペース係数 |
| `MAX_TECH_DISPLAY_SIZE` | `78` | 末端ノードの最大表示サイズ（px） |

---

### 視覚的キャップ（上限）設計

```
TECH_SCORE_CAP = 10   // TechniqueNode の視覚的上限スコア
BP_SCORE_CAP   = 50   // BodyPartNode の視覚的上限スコア（配下技の合計）

techNorm = Math.min(points / TECH_SCORE_CAP, 1.0)
// → ポイントは無限に蓄積できるが、UIサイズとエフェクトは 0.0〜1.0 でクランプ
```

**設計の意図:** `points` はゲームプレイの進捗を正確に記録し続けるが、
ノードのサイズや発光量を無制限に拡大するとレイアウトが崩壊する。
キャップを設けることで「カンスト状態」を明示しつつ、グリッドの視認性を維持する。

### エフェクトのしきい値

| 状態 | 条件 | エフェクト |
|---|---|---|
| 未練習 | `points === 0` | 暗色・発光なし |
| 練習中 | `0 < norm ≤ 0.2` | 深紫グラデーション・微発光 |
| 習熟中 | `0.2 < norm ≤ 0.6` | 紫グラデーション・中発光 |
| 高習熟 | `0.6 < norm < 1.0` | 明紫グラデーション・強発光 |
| **カンスト** | `norm ≥ 1.0`（`points ≥ TECH_SCORE_CAP`） | 黄金グラデーション・`maxed-pulse` アニメーション・MAXバッジ |
| **得意技** | `id === signatureTechId` | 深紅オーラ・`signature-pulse` アニメーション・★バッジ（カンストより優先） |

### エッジ（接続線）設計

```typescript
edges.push({
  animated: true,   // ReactFlow の stroke-dasharray アニメーション
  style: {
    stroke: edgeColor,
    filter: 'drop-shadow(0 0 4px <color>)',  // サイバーグロー
  },
});
```

- `animated: true` に加え `@keyframes dashmove` で dash の流れる方向・速度を統一制御。
- エッジ色は接続先ノードの状態に連動（深紅＝得意技 → 金＝MAX → 紫 → 半透明の4段階）。
- シグネチャー技・カンスト技へのエッジは二重グロー（強調）。

---

## 8. 環境変数

| 変数名 | 必須 | 内容 |
|---|---|---|
| `GAS_URL` | ✅ | GAS Web App の公開URL（サーバーサイドのみ） |

---

## 9. 実装済みの主要機能

### ✅ 稽古XP記録システム（Phase4 完全正規化済み）
- `user_tasks` の active 項目（最大5件）を **task_id（UUID）** で logs に保存
- 読み取り時に JOIN して item_name を復元。フロント側変更なし。

### ✅ settings シート廃止（Phase4）
- `getSettings` / `updateSettings` GASアクション削除
- `Setting` 型・`DashboardData.settings` フィールド削除
- `fetchSettings()` / `updateSettings()` API 関数削除

### ✅ 課題のスマート変更検知・アーカイブ（Phase4）
- 初期値に戻した場合は「変更なし」と判定し既存 UUID を維持
- テキスト変更時は旧タスクをアーカイブし、新 UUID で別項目として登録
- 変更インジケーター（「新規」「変更」「削除」）を UI に表示

### ✅ XP・レベルシステム（Lv1〜99）
- 指数カーブ: `xpForLevel(n) = floor(100 × (n-1)^1.8)`

### ✅ XP減衰システム
- 3日間猶予 → 4日目以降 `floor(20 × (d-3)^1.3)` / 日

### ✅ 技DB正規化（technique_master + user_techniques）

### ✅ SkillGrid 六角形カスタムノード + 放射状等間隔レイアウト（Phase5） ★ NEW
- 全ノードを `clip-path` ベースの六角形に変更（CoreNode は八角形で区別）
- `TECH_SCORE_CAP = 10` による視覚的キャップを導入（ポイント自体は無制限蓄積）
- カンスト到達時の黄金パルス発光アニメーション（`maxed-pulse`）
- 得意技の深紅オーラ・バッジ（`signature-pulse`）
- 全エッジを `animated: true` + サイバーグロースタイルに変更
- レイアウトを放射状等間隔（Radial Equal-Spacing）に刷新し、部位ごとの視覚的密度の偏りを解消
- 円形平均（Circular Mean）で BodyPart を配下技の正確な重心方向に配置
- ダイナミック半径計算で技の数が増えても隣接ノードが重ならないよう自動調整

### ✅ 得意技ハイライト（SkillGrid・シグネチャームーブ）

### ✅ プロフィール設定の得意技を `<select>` 選択式に変更

### ✅ SkillGrid 表示修正
- `fetchTechniques()` と `fetchDashboard()` を独立して実行し、技取得失敗がダッシュボードをブロックしないよう修正

### ✅ サイバー和風デザイン（globals.css）

### ✅ HUD風デジタルカウンター（ホーム画面）

### ✅ XP推移グラフ（ステップライン・ネオングラデーション）

### ✅ 稽古スコアバランス（横型プログレスバー）

### ✅ マルチユーザー・ログイン・他者評価（5段階★評価）★ Phase5更新

### ✅ 他者評価の5段階スコア化（Phase5）
- `rivals/[id]/page.tsx` の「評価する」単一ボタンを廃止し、**1〜5の星ボタン選択UI** に変更
- 選択中スコアに応じた日本語ラベルを表示（例：「非常によく取り組んでいる」）
- スコア確定後に送信ボタンが活性化、送信中はローディング・二重送信ブロック
- GAS の XP 計算式を `score × 2 × 評価者レベル倍率` に変更
- `peer_evaluations` シートに `score` カラムを追加（D列）
- `xp_history` の reason に「○○からの評価（スコア: X）」とスコアを明記

### ✅ アチーブメント（実績バッジ）システム バックエンド・API層（Phase6） ★ NEW
- `achievement_master` シート（全ユーザー共通マスタ）と `user_achievements` シートを新設
- `achievement_master` が存在しない場合、GAS が初回アクセス時にデフォルト8件を自動挿入
- `saveLog` の末尾に `checkAndUnlockAchievements()` フックを追加
  - `streak_days`（連続稽古日数）と `total_practices`（累計稽古日数）の2種類の条件を判定
  - 解除済みチェックで重複登録を防止
  - 新規解除分を `user_achievements` に記録し、`saveLog` のレスポンスに `newAchievements` として返却
- `getAchievements` doGet アクションを追加（マスタ×解除状況の JOIN済みデータを返す）
- `fetchAchievements()` API 関数を `api.ts` に追加
- `Achievement` 型・`AchievementMasterEntry` 型を `types/index.ts` に追加
- `SaveLogResponse.newAchievements?: Achievement[]` フィールドを追加
- エラー安全設計: 判定失敗は `saveLog` のレスポンスをブロックしない（`newAchievements: []` で返る）

### ✅ 体感速度最適化とPWA化（スマホアプリ化）（Phase6/7） ★ NEW

#### SWRによるデータキャッシュ化（Phase6）
- `swr` を導入し、ホーム画面・門下生一覧・門下生詳細・記録画面の GET リクエストをキャッシュ化
- 初回ロード後はキャッシュから即時返却するため、**2回目以降の画面表示を0秒（ロードなし）** で描画
- バックグラウンドで最新データを再取得（stale-while-revalidate）し、常に最新情報を保持
- `api.ts` の各フェッチ関数を SWR の `fetcher` として接続

#### PWA対応（Phase7）
- `@ducanh2912/next-pwa` を導入し、`next.config.ts` でビルド時にサービスワーカーを自動生成
- `src/app/manifest.ts`（Next.js `MetadataRoute.Manifest` 型）でアプリ名・アイコン・テーマカラー・表示モードを定義
- `src/app/layout.tsx` の `metadata` に `appleWebApp`・`manifest`・`icons` を追加し、iOS/Android 双方でホーム画面追加に対応
- `display: 'standalone'` でフルスクリーン起動（ブラウザUIなし）のネイティブアプリライクな体験を実現
- Workbox によるオフラインキャッシュにより、圏外環境でも既閲覧ページを表示可能
- 開発環境（`NODE_ENV === "development"`）ではサービスワーカーを無効化し、デバッグ体験を保護

### ✅ モバイル UX 最適化（Phase8） ★ NEW
- ボトムナビを **5ボタン → 4ボタン** に変更（`Trophy`/実績ボタンを削除）
- 実績ページへの導線をホーム画面プロフィールエリアの **実績バッジ**（`🏆 実績: X/Y`）に移設
- バッジは `fetchAchievements()` で解除数/総数を非同期取得してリアルタイム表示
- サイバー和風テーマに合わせた透過背景 + 細枠線デザイン

---

## 10. スプレッドシートの手動変更が必要な作業

### Phase4 移行時
> **⚠️ GAS の再デプロイだけでなく、スプレッドシートの手動変更も必要です。**

| シート | 変更内容 |
|---|---|
| `logs` | C列ヘッダーを `item_name` → `task_id` に変更 |

既存の `logs` データ（旧 `item_name` 文字列）は GAS の `buildTaskTextMap` が `task_id` として扱おうとしますが、旧データは UUID ではなくテキストのため変換できません。旧データは `item_name` がそのまま表示されます（表示上は問題なし）。新規記録分から UUID で正しく保存されます。

### Phase5 移行時（他者評価スコア化）

| シート | 変更内容 |
|---|---|
| `peer_evaluations` | D列ヘッダーを `xp_granted` → `score` に変更し、E列に `xp_granted` を追加 |

> 既存レコード（旧4列）は D列が `xp_granted` 値のまま残ります。新規評価分から `[evaluator_id, target_id, date, score, xp_granted]` の5列構成で正しく保存されます。旧データはXP集計には影響しません。

### Phase6 移行時（アチーブメントシステム）★ NEW

| シート | 変更内容 |
|---|---|
| `achievement_master` | **新規作成。** シートが存在しない場合、GAS が初回 `getAchievements` 呼び出し時に自動作成・デフォルトデータを投入する。 |
| `user_achievements` | **新規作成。** GAS が初回書き込み時に自動作成する。 |

> スプレッドシート上で `achievement_master` に行を追加・編集することで、GAS の再デプロイなしに実績の種類を増やせます。現時点でサポートされる `condition_type` は `streak_days` と `total_practices` の2種類です。

### Phase7 移行時（PWA化）★ NEW

| 作業 | 内容 |
|---|---|
| パッケージインストール | `npm install @ducanh2912/next-pwa swr` を実行 |
| アイコン配置 | `public/icon-192x192.png` と `public/512x512.png` を手動で配置（推奨: 剣道・百錬自得をイメージしたデザイン） |
| ビルド確認 | `npm run build` 後に `public/sw.js` と `public/workbox-*.js` が生成されることを確認 |

### Phase8 移行時（モバイル UX 最適化）★ NEW

| 作業 | 内容 |
|---|---|
| ファイル更新 | `src/components/Navigation.tsx` を上書き（Trophy インポート・ボタン削除） |
| ファイル更新 | `src/app/page.tsx` を上書き（実績バッジ追加・`fetchAchievements` 呼び出し） |
| 再デプロイ | GAS 再デプロイ不要。Cloudflare Pages は GitHub push で自動デプロイ。 |

---

## 11. 今後の拡張ポイント

- [ ] アチーブメント `condition_type` の拡張（`total_xp`, `level_reached`, `technique_mastery` 等）
- [ ] ランキング画面
- [x] PWA対応（オフライン記録 → 同期）★ Phase7 完了
- [ ] パスワードのハッシュ化
- [x] アチーブメント（記念バッジ）システム バックエンド・API層（Phase6 Step1 完了）
- [x] 他者評価の5段階スコア化（Phase5 完了）
- [ ] 他者評価の累計受信数・平均スコアをダッシュボードに表示
- [ ] 段位倍率の管理画面
- [ ] 旧 logs データの一括マイグレーション（item_name → task_id）
- [ ] ページ遷移時・保存完了時のマイクロインタラクション（Phase5 残）
- [ ] アチーブメント解除通知 UI（トースト・バッジアニメーション）
- [ ] PWAアイコンのデザイン制作（192px・512px）
- [x] モバイル UX 最適化（ボトムナビ4ボタン化・実績導線ホーム統合）★ Phase8 完了
