# 百錬自得（Forge_in_Fire） - ARCHITECTURE.md

> 剣道の稽古・技の習熟度を記録し、成長をゲーミフィケーションで可視化するWebアプリ。

---

## 1. アプリ概要と技術スタック

### フロントエンド

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 15.5.15（App Router / TypeScript） |
| ホスティング | Cloudflare Pages（`@cloudflare/next-on-pages` ビルド） |
| スタイリング | Tailwind CSS + インラインスタイル（サイバー和風テーマ） |
| フォント | M PLUS Rounded 1c |
| グラフ | Recharts（AreaChart） |
| スキルグリッド | @xyflow/react v12（ノード・エッジ動的描画） |
| アイコン | lucide-react |

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
│   │   ├── layout.tsx                      # ルートレイアウト（AuthGuard・ナビゲーション）
│   │   ├── globals.css                     # デザイントークン・共通CSS（サイバー和風テーマ）
│   │   ├── page.tsx                        # ホーム画面（HUD KPI・スキルグリッド・分析・プロフィール）
│   │   ├── record/
│   │   │   └── page.tsx                    # 記録画面（稽古記録・技の評価）★ Phase4更新
│   │   ├── login/
│   │   │   └── page.tsx                    # ログイン画面
│   │   ├── rivals/
│   │   │   ├── page.tsx                    # 門下生一覧
│   │   │   └── [id]/page.tsx               # 他ユーザー閲覧 + 他者評価
│   │   ├── settings/
│   │   │   ├── tasks/page.tsx              # カスタム評価項目設定
│   │   │   └── profile/page.tsx            # プロフィール設定（段位・座右の銘・得意技ID選択）
│   │   ├── debug/page.tsx                  # ログビューア
│   │   └── api/gas/route.ts                # GASプロキシ
│   │
│   ├── components/
│   │   ├── Navigation.tsx                  # ボトムナビ
│   │   ├── AuthGuard.tsx                   # 未ログイン時リダイレクト
│   │   └── charts/
│   │       ├── RadarChart.tsx              # 稽古スコアバランス（横型プログレスバー）
│   │       ├── XPTimelineChart.tsx         # XP累積推移（ステップライン・ネオングラデーション）
│   │       ├── ActivityHeatmap.tsx         # 稽古カレンダー
│   │       ├── SkillGrid.tsx               # スフィア盤（得意技ハイライト対応）
│   │       ├── PlaystyleCharts.tsx         # プレイスタイル分析
│   │       └── TrendLineChart.tsx          # スコア推移折れ線
│   │
│   ├── lib/
│   │   ├── api.ts                          # GAS APIクライアント ★ Phase4更新
│   │   ├── auth.ts                         # 認証ユーティリティ
│   │   ├── epithet.ts                      # 二つ名判定ロジック
│   │   ├── xpMultiplier.ts                 # 段位 → XP倍率変換
│   │   └── logger.ts                       # クライアントロガー
│   │
│   └── types/
│       └── index.ts                        # 全型定義・XP/レベル計算関数 ★ Phase4更新
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

#### `logs`（稽古評価ログ）★ Phase4 正規化
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | date | 稽古日（YYYY-MM-DD） |
| C | task_id | 評価項目ID（`user_tasks` の `id` と紐づく）★ UPDATED（旧: item_name） |
| D | score | 評価（1〜5） |
| E | xp_earned | 獲得XP |

> **設計原則（Phase4）:** C列を item_name（テキスト文字列）から task_id（UUID）に変更。
> これにより評価項目のリネームや論理削除が logs に影響しなくなる。
> GAS の `getDashboard` / `getLogs` は `user_tasks` とJOINして `item_name` を復元し、
> フロントエンドには従来通り `item_name` フィールドで返す（フロント側の変更不要）。

#### `settings`（稽古の意識項目）★ **廃止済み（Phase4）**
> **⚠️ このシートは廃止済み。** 旧実装の名残として物理的に残存する可能性があるが、
> GAS コードからは全てのアクセスが削除された。評価項目管理は `user_tasks` に完全一本化。
> フロントエンドでも `Setting` 型・`settings` フィールドは廃止。

#### `user_tasks`（カスタム評価項目マスタ）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | id | 項目UUID（`logs.task_id` から参照される） |
| B | user_id | ユーザーID |
| C | task_text | 評価項目名 |
| D | status | `active` / `archived` |
| E | created_at | 作成日時 |
| F | updated_at | 更新日時 |

> `logs.task_id → user_tasks.id` で JOIN。archived になったタスクも保持することで
> 過去ログの復元に使用できる。

#### `user_techniques`（ユーザーごとの技習熟度）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | user_id | ユーザーID |
| B | technique_id | 技のID（`technique_master` の ID と紐づく） |
| C | Points | 累積ポイント |
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

#### `peer_evaluations`（他者評価ログ）
| 列 | カラム名 | 内容 |
|---|---|---|
| A | evaluator_id | 評価者ID |
| B | target_id | 対象者ID |
| C | date | 評価日時 |
| D | xp_granted | 付与XP（倍率適用済み） |

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

> **★ REMOVED:** `getSettings` アクションを廃止。

### doPost（データ書き込み）

| action | 主要パラメータ | 内容 |
|---|---|---|
| `login` | `user_id` or `name`, `password` | 認証 |
| `saveLog` | `user_id`, `date`, `items[]` | 稽古ログ保存。`items[].task_id`（UUID）+ `score` を受け取り、logs シートの C列に `task_id` を保存。★ Phase4更新 |
| `updateTasks` | `user_id`, `tasks[]` | 評価項目を一括上書き登録 |
| `archiveTask` | `user_id`, `task_id` | 個別タスクをアーカイブ |
| `updateProfile` | `user_id`, `real_rank`, `motto`, `favorite_technique` | プロフィール更新（`favorite_technique` は技ID） |
| `resetStatus` | `user_id` | XP・レベル初期化 |
| `updateTechniqueRating` | `user_id`, `id`, `rating` | user_techniques を upsert |
| `evaluatePeer` | `user_id`, `target_id` | 他者評価（倍率付きXP付与） |

> **★ REMOVED:** `updateSettings` アクションを廃止。

---

## 5. データフロー：稽古記録の正規化（Phase4）

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
> 変更はバックエンド（GAS）と記録フォームの送信処理のみ。

---

## 6. 主要なデータモデル（TypeScript型定義）

### ★ Phase4 廃止

```typescript
// 廃止済み
export interface Setting { item_name: string; is_active: boolean; }
// DashboardData.settings フィールドも廃止
```

### ★ Phase4 更新: SaveLogPayload

```typescript
// 変更前
items: Array<{ item_name: string; score: number }>

// 変更後
items: Array<{ task_id: string; score: number }>
// task_id は UserTask.id（UUID）
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

## 7. 環境変数

| 変数名 | 必須 | 内容 |
|---|---|---|
| `GAS_URL` | ✅ | GAS Web App の公開URL（サーバーサイドのみ） |

---

## 8. 実装済みの主要機能

### ✅ 稽古XP記録システム（Phase4 正規化済み）
- `user_tasks` の active 項目（最大5件）を task_id で logs に保存
- 読み取り時に JOIN して item_name を復元

### ✅ settings シート廃止（Phase4）
- `getSettings` / `updateSettings` GASアクション削除
- `Setting` 型・`DashboardData.settings` フィールド削除
- `fetchSettings()` / `updateSettings()` API 関数削除

### ✅ XP・レベルシステム（Lv1〜99）
- 指数カーブ: `xpForLevel(n) = floor(100 × (n-1)^1.8)`

### ✅ XP減衰システム
- 3日間猶予 → 4日目以降 `floor(20 × (d-3)^1.3)` / 日

### ✅ 技DB正規化（technique_master + user_techniques）

### ✅ 得意技ハイライト（SkillGrid・シグネチャームーブ）

### ✅ サイバー和風デザイン（globals.css）

### ✅ HUD風デジタルカウンター（ホーム画面）

### ✅ XP推移グラフ（ステップライン・ネオングラデーション）

### ✅ 稽古スコアバランス（横型プログレスバー）

### ✅ マルチユーザー・ログイン・他者評価

---

## 9. 今後の拡張ポイント

- [ ] ランキング画面
- [ ] PWA対応（オフライン記録 → 同期）
- [ ] パスワードのハッシュ化
- [ ] アチーブメント（記念バッジ）システム
- [ ] 他者評価の累計受信数をダッシュボードに表示
- [ ] 段位倍率の管理画面
