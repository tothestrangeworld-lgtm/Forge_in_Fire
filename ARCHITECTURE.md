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
│   │   │   └── [id]/page.tsx               # 他ユーザー閲覧 + 他者評価（5段階★）★ Phase5更新
│   │   ├── settings/
│   │   │   ├── tasks/page.tsx              # カスタム評価項目設定 ★ Phase4更新
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
│   │       ├── SkillGrid.tsx               # スキルグリッド（六角形ノード・アニメーションエッジ） ★ Phase5更新
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

---

## 6. 主要なデータモデル（TypeScript型定義）

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

### 放射状等間隔レイアウト（Radial Equal-Spacing Layout） ★ Phase5 刷新 / Phase5.1 軽量化

#### 採用理由

旧レイアウト（ツリー形式）では、BodyPart ノードを N 等分した方向に放射し、
その先に配下の技を扇状に並べる構造をとっていた。
この方式では**「面」のように技が多い部位に広い領域が割り当てられ、技の少ない部位がスカスカになる**という
視覚的偏りが生じていた。

**放射状等間隔レイアウトでは、全末端ノード（技）の数を基準に外周を等分するため、
部位ごとの技の数に関わらずグリッド全体の密度が均一になる。**

#### Phase 5.1 軽量化改訂（クラッシュ対策）

Phase 5.0 では zoom 時に Chrome がクラッシュする問題が発生した。
原因は以下の組み合わせによる GPU メモリ枯渇：

1. **`clip-path` + `filter: drop-shadow()` の多重スタック**
   clip-path 要素に filter を使うと各ノードが独立した GPU コンポジットレイヤーを生成する。
   ノード数（~30件）× 多重 drop-shadow × zoom 時のピクセル増大 = GPU メモリ枯渇。
2. **`filter` をアニメーションで変化** → 毎フレーム全ノードが再描画。

**Phase 5.1 の対策:**

| 変更前（Phase 5.0） | 変更後（Phase 5.1） | 理由 |
|---|---|---|
| `filter: drop-shadow()` 多重スタック | `box-shadow` のみ | GPU レイヤー生成ゼロ |
| `clip-path` 六角形 | `border-radius: 50%` 円形 | コンポジットコスト排除 |
| ノードサイズを習熟度で変化 | サイズ固定・発光のみ変化 | レイアウト再計算を回避 |
| `animated: true` エッジアニメーション | 静的エッジ | 毎フレーム再描画を排除 |
| 動的半径計算（`totalTechs × size / 2π`） | 外周スロット数・半径を固定 | 計算シンプル化 |
| `maxZoom: 3` | `maxZoom: 2.5` | 過剰 zoom 時のピクセル過多を防止 |

#### アルゴリズム概要（Phase 5.1）

```
1. BodyPart ごとに技をグループ化し、合計ポイント降順でソート
2. 全技を最大 OUTER_SLOTS = 24 件に制限して展開
3. 外周半径 R_OUTER = 200px（固定）
4. 各技にグローバル角度を割り当て:
     angle[i] = (2π / OUTER_SLOTS) × i - π/2   ← 真上（12時）から時計回り
5. 各技を外周円上に配置（ノードサイズ固定 42px）:
     (x, y) = (R_OUTER × cos(angle), R_OUTER × sin(angle))
6. 各 BodyPart を中間半径（R_MID = R_OUTER × 0.46）に配置:
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

#### レイアウト定数（Phase 5.1）

| 定数 | 値 | 意味 |
|---|---|---|
| `OUTER_SLOTS` | `24` | 外周スロット数（固定） |
| `R_OUTER` | `200` | 外周半径（px） |
| `R_MID_RATIO` | `0.46` | BodyPart を外周の何割の位置に置くか |
| `TECH_NODE_SIZE` | `42` | 技ノードの直径（px・固定） |
| `BP_NODE_SIZE` | `56` | 部位ノードの直径（px・固定） |
| `CORE_NODE_SIZE` | `64` | COREノードの直径（px・固定） |

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

### ✅ SkillGrid 円形ノード + 放射状等間隔レイアウト（Phase5.1） ★ 軽量化済み
- `border-radius: 50%` の円形ノード（clip-path を廃止してコンポジットコストを排除）
- 発光は `box-shadow` のみ（`filter: drop-shadow` を廃止して GPU レイヤー生成ゼロに）
- ノードサイズ固定・習熟度は発光強度のみで表現
- エッジアニメーション廃止（静的エッジで毎フレーム再描画を排除）
- `TECH_SCORE_CAP = 10` による視覚的キャップを維持（ポイント自体は無制限蓄積）
- カンスト / 得意技の `@keyframes` は `box-shadow` のみアニメーション（filterを変化させない）
- 外周スロット `OUTER_SLOTS = 24` 固定・`R_OUTER = 200px` でコンパクト配置
- 部位ノードは円形平均（Circular Mean）で配下技の重心方向・R_MID 位置に配置
- `maxZoom: 2.5` に制限（過剰 zoom 時のピクセル過多クラッシュを防止）

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

---

## 10. スプレッドシートの手動変更が必要な作業

### Phase4 移行時
> **⚠️ GAS の再デプロイだけでなく、スプレッドシートの手動変更も必要です。**

| シート | 変更内容 |
|---|---|
| `logs` | C列ヘッダーを `item_name` → `task_id` に変更 |

既存の `logs` データ（旧 `item_name` 文字列）は GAS の `buildTaskTextMap` が `task_id` として扱おうとしますが、旧データは UUID ではなくテキストのため変換できません。旧データは `item_name` がそのまま表示されます（表示上は問題なし）。新規記録分から UUID で正しく保存されます。

### Phase5 移行時（他者評価スコア化）★ NEW

| シート | 変更内容 |
|---|---|
| `peer_evaluations` | D列ヘッダーを `xp_granted` → `score` に変更し、E列に `xp_granted` を追加 |

> 既存レコード（旧4列）は D列が `xp_granted` 値のまま残ります。新規評価分から `[evaluator_id, target_id, date, score, xp_granted]` の5列構成で正しく保存されます。旧データはXP集計には影響しません。

---

## 11. 今後の拡張ポイント

- [ ] ランキング画面
- [ ] PWA対応（オフライン記録 → 同期）
- [ ] パスワードのハッシュ化
- [ ] アチーブメント（記念バッジ）システム
- [x] 他者評価の5段階スコア化（Phase5 完了）
- [ ] 他者評価の累計受信数・平均スコアをダッシュボードに表示
- [ ] 段位倍率の管理画面
- [ ] 旧 logs データの一括マイグレーション（item_name → task_id）
- [ ] ページ遷移時・保存完了時のマイクロインタラクション（Phase5 残）
