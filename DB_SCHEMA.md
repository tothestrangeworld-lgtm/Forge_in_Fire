# DB_SCHEMA.md — 百錬自得 データベース定義書

> **Single Source of Truth**
> 本ドキュメントは `Code.gs`（GAS バックエンド）・`types/index.ts`（フロントエンド型定義）・各シートの実CSV を三者照合して生成した、唯一の正式データ定義書です。
>
> - **列順・物理名** … 実CSVヘッダー行を最優先とする
> - **型・論理的意味** … `types/index.ts` を正とする
> - **初期化ロジック・制約** … `Code.gs` の `appendRow` / `getRange.setValues` を参照
>
> 最終更新: 2026-05-02
> 対応フェーズ: Phase8 Step1（技の稽古 量×質マトリックス）まで反映済み

---

## 目次

1. [ユーザー系シート](#1-ユーザー系シート)
   - 1-1. UserMaster
   - 1-2. user_status
   - 1-3. user_tasks
   - 1-4. user_techniques
   - 1-5. user_achievements
2. [ログ・履歴系シート](#2-ログ履歴系シート)
   - 2-1. logs
   - 2-2. xp_history
   - 2-3. peer_evaluations
   - 2-4. technique_logs ★ Phase8 新設
3. [マスタ系シート](#3-マスタ系シート)
   - 3-1. technique_master
   - 3-2. title_master
   - 3-3. EpithetMaster
   - 3-4. achievement_master
4. [システム系シート](#4-システム系シート)
   - 4-1. error_logs
5. [廃止済みシート](#5-廃止済みシート)
6. [XP・レベル計算仕様](#6-xpレベル計算仕様)
7. [シート間リレーション図](#7-シート間リレーション図)

---

## 1. ユーザー系シート

### 1-1. UserMaster

**シート名:** `UserMaster`
**役割:** ログイン認証用のユーザーマスタ。全ユーザー共通。
**自動作成:** シート不在時に `getUserMasterSheet()` が作成し、デフォルトユーザー（U0001）を挿入する。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `user_id` | string | PK, NOT NULL | ユーザーID。例: `U0001`。全ユーザー系・ログ系シートの FK となる基底キー |
| B | `name` | string | NOT NULL | 表示名。例: `吉木直人` |
| C | `password` | string | NOT NULL | ログインパスワード（平文）。`login()` で照合する |
| D | `role` | string | NOT NULL | 権限種別。現状 `admin` のみ運用。将来的に `user` / `guest` 等を想定 |

**備考:**
- `login()` は `user_id`（A列）または `name`（B列）と `password`（C列）の組み合わせで認証する
- `getUsers()` レスポンスには `password` を含めない（セキュリティ上除外）

---

### 1-2. user_status

**シート名:** `user_status`
**役割:** ユーザーごとのXP・レベル・称号・プロフィール等の現在状態を管理する。1ユーザー1行。
**定数名:** `SHEET_STATUS`
**自動作成:** `saveLog()` / `resetStatus()` 等が初回書き込み時に `appendRow` で行を生成する。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `user_id` | string | PK, FK → UserMaster.user_id | ユーザーID |
| B | `total_xp` | number | NOT NULL, ≥0 | 累計XP。減衰・リセット後も `Math.max(0, ...)` でゼロ以上を保証 |
| C | `level` | number | NOT NULL, 1〜99 | 現在のアプリ内レベル。`calcLevel(xp)` で算出 |
| D | `title` | string | NOT NULL | 現在の称号。`title_master` から `calcTitleFromMaster()` で導出 |
| E | `last_practice_date` | date (YYYY-MM-DD) | NULLABLE | 最終稽古日。`saveLog()` 時に当日日付で更新。XP減衰の起点として使用 |
| F | `last_decay_date` | date (YYYY-MM-DD) | NULLABLE | 最終XP減衰適用日。1日1回の減衰重複適用を防ぐガード |
| G | `real_rank` | string | NULLABLE | リアル段位。`updateProfile()` で設定。`''`（無段）〜`八段` の9値。XP倍率計算に使用（下記参照） |
| H | `motto` | string | NULLABLE | 座右の銘。最大20文字。`updateProfile()` で設定 |
| I | `favorite_technique_id` | string | NULLABLE, FK → technique_master.id | 得意技ID。例: `T001`。`updateProfile()` で設定。フロントでは `techniqueMaster` を参照して技名に変換する |

**備考:**
- `saveLog()` が `statSheet.getRange(r, 1, 1, 6).setValues(...)` で更新するのは A〜F 列（6列）のみ。G・H・I 列（real_rank / motto / favorite_technique_id）は `updateProfile()` が専用に更新する
- XP減衰: `applyDecay()` が毎回 getDashboard 時に実行。`last_practice_date` からの経過日数が4日以上かつ当日未適用の場合に `penalty = floor(20 × (days-3)^1.3)` を減算し `last_decay_date` を更新する
- リアル段位XP倍率: `{ '初段':1.2, '弐段':1.5, '参段':1.8, '四段':2.2, '五段':2.7, '六段':3.4, '七段':4.2, '八段':5.0 }`

---

### 1-3. user_tasks

**シート名:** `user_tasks`
**役割:** 各ユーザーの稽古評価項目（課題）を管理する。課題テキストの変更はID変更を伴う（スマート差分運用）。
**定数名:** `SHEET_USER_TASKS`

> ⚠️ **CSVヘッダー上の既知の不整合:** 実CSVの1行目が `id,user_id,task_text,status,created_at,`（F列ヘッダーが空欄）となっているが、`Code.gs` では `updated_at` として扱われており（コメント・変数名・処理ロジック全て一致）、6列目の正式な物理名は `updated_at` である。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `id` | string (UUID v4) | PK, NOT NULL | タスクID。`Utilities.getUuid()` で自動発行。`logs.task_id` の参照先 |
| B | `user_id` | string | FK → UserMaster.user_id, NOT NULL | 所有ユーザーID |
| C | `task_text` | string | NOT NULL | 課題テキスト。例: `右手に力が入りすぎない` |
| D | `status` | string | NOT NULL | `active`（稽古中）/ `archived`（アーカイブ）/ `completed`（完了済み） の3値 |
| E | `created_at` | datetime (YYYY-MM-DD HH:mm:ss) | NOT NULL | 作成日時（JST） |
| F | `updated_at` | datetime (YYYY-MM-DD HH:mm:ss) | NOT NULL | 最終更新日時（JST）。アーカイブ時・アクティブ復帰時に更新 |

**備考:**
- `updateTasks()` のスマート差分ロジック:
  - `id` あり → 既存行を `active` に戻してテキストを更新（ID を維持）
  - `id` なし → 新規行として UUID を発行して `appendRow`
  - 送られてこなかった `active` 行 → 自動的に `archived` へ
- `buildTaskTextMap()` は `archived` 含む全行から `{ task_id → task_text }` マップを生成し、`getLogs()` / `getDashboard()` の JOIN に使用する
- `logs.task_id` の参照先として、削除は行わず必ず `archived` で論理削除する

---

### 1-4. user_techniques

**シート名:** `user_techniques`
**役割:** ユーザーごとの技の習熟度（累計ポイント・直近の量/質/フィードバック）を管理する。1ユーザー × 1技 = 1行。
**定数名:** `SHEET_USER_TECHNIQUES`
**自動作成:** `updateTechniqueRating()` が初回書き込み時に自動作成する。
**★ Phase8 変更:** 列を4列→7列に拡張。`last_quantity`, `last_quality`, `last_feedback` を追加。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `user_id` | string | PK(複合), FK → UserMaster.user_id, NOT NULL | ユーザーID |
| B | `technique_id` | string | PK(複合), FK → technique_master.id, NOT NULL | 技ID。例: `T001` |
| C | `Points` | number | NOT NULL, ≥0 | 累計習熟ポイント。`updateTechniqueRating()` の都度 `+= earnedPoints` で加算。`earnedPoints = ceil(量基礎点 × 質倍率)` |
| D | `LastRating` | number | NOT NULL, 1〜5 | 直近の質（quality）スコア（上書き）。`updateTechniqueRating()` で毎回 quality 値に置き換える |
| E | `last_quantity` | number | NOT NULL, 1〜5 | ★ Phase8追加。直近の量スコア（上書き）。稽古の本数・繰り返し数の自己評価 |
| F | `last_quality` | number | NOT NULL, 1〜5 | ★ Phase8追加。直近の質スコア（上書き）。D列 `LastRating` と同値（可読性のため列名付きで保持） |
| G | `last_feedback` | string | NOT NULL | ★ Phase8追加。直近の四字熟語フィードバック（上書き）。例: `切磋琢磨`、`百錬自得` |

**備考:**
- 複合主キー: `(user_id, technique_id)` の組み合わせでユニーク
- `getTechniques()` は `technique_master` と LEFT JOIN し、`user_techniques` に存在しない技は `Points:0 / lastRating:0 / lastQuantity:0 / lastQuality:0 / lastFeedback:''` として返す
- Phase8以前の既存行は E〜G 列が空の場合がある（新規書き込み・更新時に自動補完される）
- ポイント計算仕様は [6-5. 技の稽古XP計算](#6-5-技の稽古xp計算phase8) を参照

---

### 1-5. user_achievements

**シート名:** `user_achievements`
**役割:** ユーザーが解除したアチーブメント（実績バッジ）の記録。Phase6 追加。
**定数名:** `SHEET_USER_ACHIEVEMENTS`
**自動作成:** `getUserAchievementsSheet()` が自動作成する。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `user_id` | string | PK(複合), FK → UserMaster.user_id, NOT NULL | ユーザーID |
| B | `achievement_id` | string | PK(複合), FK → achievement_master.achievement_id, NOT NULL | 解除したアチーブメントID。例: `ACH001` |
| C | `unlocked_at` | datetime (YYYY-MM-DD HH:mm:ss) | NOT NULL | 解除日時（JST）。`checkAndUnlockAchievements()` 内の `nowJstTs()` で記録 |

**備考:**
- 複合主キー: `(user_id, achievement_id)` の組み合わせでユニーク（1ユーザーが同一アチーブメントを重複解除しない）
- `getAchievements()` は全 `achievement_master` に対してこのシートを LEFT JOIN し、`isUnlocked` / `unlockedAt` を付与して返す

---

## 2. ログ・履歴系シート

### 2-1. logs

**シート名:** `logs`
**役割:** 稽古記録の本体。1セッション × 1課題 = 1行で追記される。
**定数名:** `SHEET_LOGS`
**自動作成:** `saveLog()` が初回書き込み時に自動作成する。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `user_id` | string | FK → UserMaster.user_id, NOT NULL | ユーザーID |
| B | `date` | date (YYYY-MM-DD) | NOT NULL | 稽古日（フロントが送信した date パラメータを使用、当日以外も可） |
| C | `task_id` | string (UUID v4) | FK → user_tasks.id, NOT NULL | ★ Phase4 変更点。旧: `item_name`（文字列直書き）→ 現在: UUID。GAS が `getLogs()` / `getDashboard()` 返却時に `buildTaskTextMap()` でテキストに JOIN する |
| D | `score` | number | NOT NULL, 1〜5 | 自己評価スコア |
| E | `xp_earned` | number | NOT NULL, ≥0 | このスコアで得た XP ボーナス（`SCORE_BONUS = {5:30, 4:20, 3:10, 2:5, 1:2}`）。セッション基本XP(50)は別途 user_status で加算 |

**備考:**
- `getLogs()` はフロントへのレスポンス時に `task_id` → `item_name` に変換して返すため、フロント（`LogEntry` 型）には `task_id` は露出しない
- 行は削除されない（追記のみ）。過去ログ参照のために `user_tasks` は論理削除で保持する
- アチーブメント判定の streak / 累計稽古日数計算は、このシートの B 列（date）を基に行われる

---

### 2-2. xp_history

**シート名:** `xp_history`
**役割:** XPの全増減イベントの監査ログ。1イベント1行で追記。最大1001行（超過時に古い行を自動削除）ではなく、`getDashboard()` は直近90件のみ返す。
**定数名:** `SHEET_XP_HIST`
**自動作成:** `writeXpHistory()` が初回書き込み時に自動作成する。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `user_id` | string | FK → UserMaster.user_id, NOT NULL | ユーザーID |
| B | `date` | datetime (YYYY-MM-DD HH:mm:ss) | NOT NULL | イベント発生日時（JST）。`nowJstTs()` で記録 |
| C | `type` | string | NOT NULL | イベント種別。`gain`（稽古XP獲得）/ `decay`（減衰）/ `reset`（リセット）/ `peer_eval`（他者評価XP付与）の4値 |
| D | `amount` | number | NOT NULL | XP変化量。`gain` / `peer_eval` は正の整数。`decay` は負の整数。`reset` は0 |
| E | `reason` | string | NOT NULL | イベント理由の説明文。例: `稽古記録（2026-04-23・5項目）`、`3日間稽古なし（減衰）` |
| F | `total_xp_after` | number | NOT NULL, ≥0 | イベント適用後の累計XP |
| G | `level` | number | NOT NULL, 1〜99 | イベント適用後のレベル |
| H | `title` | string | NOT NULL | イベント適用後の称号 |

---

### 2-3. peer_evaluations

**シート名:** `peer_evaluations`
**役割:** 他者評価の記録。評価者が対象ユーザーの特定課題に行った評価を1課題1行で記録する。Phase7 で `task_id` 列を追加。
**定数名:** `SHEET_PEER_EVALS`
**自動作成:** `evaluatePeer()` が初回書き込み時に自動作成する。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `evaluator_id` | string | FK → UserMaster.user_id, NOT NULL | 評価を行ったユーザーのID |
| B | `target_id` | string | FK → UserMaster.user_id, NOT NULL | 評価された（XPを受け取る）ユーザーのID。`evaluator_id` と同値は不可 |
| C | `task_id` | string (UUID v4) | FK → user_tasks.id, NULLABLE | ★ Phase7 追加列。評価対象の課題ID。Phase6以前の旧行はこの列が空の場合がある |
| D | `date` | datetime (YYYY-MM-DD HH:mm:ss) | NOT NULL | 評価実行日時（JST）。`nowJstTs()` で記録 |
| E | `score` | number | NOT NULL, 1〜5 | 評価スコア |
| F | `xp_granted` | number | NOT NULL, ≥0 | この行に帰属する付与XP。`evaluatePeer()` は一旦0で `appendRow` した後、全評価完了後に遡及更新（`perItemXp = ceil(totalXp / evaluatedCount)`）する |

**備考:**
- 重複評価ガード: 同一 `(evaluator_id, target_id, task_id, date の日付部分)` の組み合わせは `skipped_tasks` に分類され記録しない
- XP計算式: `xpGranted = ceil(Σscores × 2 × getPeerLevelMultiplier(evaluator_level))`
- 評価者レベル倍率: `level < 20: ×1.0`, `≥20: ×1.2`, `≥30: ×1.5`, `≥40: ×2.0`, `≥60: ×3.0`, `≥80: ×5.0`（`Code.gs` の `getPeerLevelMultiplier()` と `index.ts` の `getPeerMultiplier()` は同一ロジック）

---

### 2-4. technique_logs ★ Phase8 新設

**シート名:** `technique_logs`
**役割:** 技の稽古記録の全履歴。`updateTechniqueRating()` の呼び出し毎に1行追記される。`user_techniques` は最新状態のスナップショット、このシートは完全な時系列履歴。
**定数名:** `SHEET_TECH_LOGS`
**自動作成:** `updateTechniqueRating()` が初回書き込み時に自動作成する。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `user_id` | string | FK → UserMaster.user_id, NOT NULL | ユーザーID |
| B | `date` | datetime (YYYY-MM-DD HH:mm:ss) | NOT NULL | 記録日時（JST）。`nowJstTs()` で記録 |
| C | `technique_id` | string | FK → technique_master.id, NOT NULL | 技ID。例: `T001` |
| D | `quantity` | number | NOT NULL, 1〜5 | 量スコア（本数・繰り返しの自己評価）。1=ほぼゼロ 〜 5=大量 |
| E | `quality` | number | NOT NULL, 1〜5 | 質スコア（精度・集中度の自己評価）。1=散漫 〜 5=完璧 |
| F | `xp_earned` | number | NOT NULL, ≥0 | この稽古で獲得したXP。`ceil(QUANTITY_BASE[quantity] × QUALITY_MULT[quality])` |
| G | `feedback` | string | NOT NULL | 四字熟語フィードバック。量×質の組み合わせに対応する25パターンの一つ。例: `百錬自得`、`切磋琢磨` |

**備考:**
- 行は追記のみ。削除・更新は行わない（完全な稽古ログ）
- `user_techniques` との関係: このシートが「稽古の全履歴」、`user_techniques` が「最新状態のサマリー」
- ポイント計算表:

| 量＼質 | 1 (×0.1) | 2 (×0.5) | 3 (×1.0) | 4 (×2.0) | 5 (×5.0) |
|---|---|---|---|---|---|
| **1 (基礎点10)** | 1pt 点滴穿石 | 5pt 一念発起 | 10pt 虚心坦懐 | 20pt 明鏡止水 | 50pt 一撃必殺 |
| **2 (基礎点20)** | 2pt 試行錯誤 | 10pt 日進月歩 | 20pt 一意専心 | 40pt 不撓不屈 | 100pt 電光石火 |
| **3 (基礎点30)** | 3pt 継続是力 | 15pt 磨斧作針 | 30pt 切磋琢磨 | 60pt 剣禅一如 | 150pt 勇猛精進 |
| **4 (基礎点40)** | 4pt 積小成大 | 20pt 臥薪嘗胆 | 40pt 粒粒辛苦 | 80pt 威風堂々 | 200pt 破竹之勢 |
| **5 (基礎点50)** | 5pt 徒労無功 | 25pt 七転八起 | 50pt 心技体一 | 100pt 鬼神之勇 | 250pt 百錬自得 |

---

## 3. マスタ系シート

### 3-1. technique_master

**シート名:** `technique_master`
**役割:** 剣道技の全件マスタ。全ユーザー共通。user_id なし。
**定数名:** `SHEET_TECH_MASTER`

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `id` | string | PK, NOT NULL | 技ID。例: `T001`。`user_techniques.technique_id` / `user_status.favorite_technique_id` の FK 参照先 |
| B | `BodyPart` | string | NOT NULL | 打突部位。例: `面`、`小手`、`胴`、`突き` |
| C | `ActionType` | string | NOT NULL | 技の大分類。例: `仕掛け技`、`応じ技` |
| D | `SubCategory` | string | NOT NULL | 技の中分類。例: `出端技`、`基本`、`引き技` |
| E | `Name` | string | NOT NULL | 技名。例: `飛び込み面`、`出小手` |

**備考:**
- `getTechniqueMasterData()` はフロントへ camelCase（`bodyPart`, `actionType`, `subCategory`, `name`）で返す（`TechniqueMasterEntry` 型）
- `EpithetMaster` の `category: 'actionType'` / `'subCategory'` はこのシートの B/D 列の値を `triggerValue` として参照する

---

### 3-2. title_master

**シート名:** `title_master`
**役割:** レベルと称号の対応マスタ。全ユーザー共通。
**定数名:** `SHEET_TITLE_MASTER`
**自動作成:** `getTitleMasterData()` が初回参照時に自動作成し、デフォルト15段階を挿入する。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `level` | number | PK, NOT NULL | この称号が適用される最低レベル |
| B | `title` | string | NOT NULL | 称号名。例: `入門`、`初段`、`錬士`、`剣道の神` |

**デフォルトデータ（15行）:**

| level | title |
|---|---|
| 1 | 入門 |
| 5 | 素振り |
| 10 | 初段 |
| 15 | 弐段 |
| 20 | 参段 |
| 25 | 四段 |
| 30 | 五段 |
| 35 | 錬士 |
| 40 | 教士 |
| 50 | 範士 |
| 60 | 剣聖 |
| 70 | 剣豪 |
| 80 | 剣鬼 |
| 90 | 剣神 |
| 99 | 剣道の神 |

**備考:** `calcTitleFromMaster(level, master)` は level 昇順にソートし「level 以上の最大値の称号」を返す（下位互換方式）

---

### 3-3. EpithetMaster

**シート名:** `EpithetMaster`
**役割:** ユーザーに表示する「二つ名」のマスタ。技の傾向によって動的に選択される。全ユーザー共通。
**定数名:** `SHEET_EPITHET_MASTER`
**自動作成:** `getEpithetMasterData()` が初回参照時に自動作成し、デフォルト6件を挿入する。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `ID` | string/number | PK, NOT NULL | 二つ名ID。例: `E000`（実データ）またはシーケンス整数（デフォルト）。`EpithetMasterEntry.id` に対応 |
| B | `Category` | string | NOT NULL | 二つ名の発動カテゴリ。`status`（初期状態）/ `actionType`（技種別比率）/ `subCategory`（最多サブカテゴリ）/ `balance`（バランス） |
| C | `TriggerValue` | string | NOT NULL | 発動条件値。`Category` に応じた文字列。例: `仕掛け技`、`出端技`、`初期`、`バランス` |
| D | `Name` | string | NOT NULL | 二つ名テキスト（前置詞部分）。例: `怒涛の`、`後の先を極めし` |
| E | `Description` | string | NULLABLE | 発動条件の説明文。例: `仕掛け技のポイントが7割以上` |

---

### 3-4. achievement_master

**シート名:** `achievement_master`
**役割:** アチーブメント（実績バッジ）の全件マスタ。全ユーザー共通。Phase6 追加。
**定数名:** `SHEET_ACHIEVEMENT_MASTER`
**自動作成:** `getAchievementMasterSheet()` が初回参照時に自動作成し、デフォルト8件を挿入する。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `achievement_id` | string | PK, NOT NULL | アチーブメントID。例: `ACH001`。`user_achievements.achievement_id` の FK 参照先 |
| B | `name` | string | NOT NULL | バッジ名。例: `初稽古`、`百錬自得` |
| C | `condition_type` | string | NOT NULL | 解除条件の種別。現行: `streak_days`（連続稽古日数）/ `total_practices`（累計稽古日数）の2種 |
| D | `condition_value` | number | NOT NULL | 解除条件の閾値。`condition_type` に対応する整数値 |
| E | `description` | string | NOT NULL | 解除済み時に表示する説明文。例: `初めての稽古を記録した` |
| F | `hint` | string | NOT NULL | 未解除時に表示するヒント文。例: `稽古記録を1回つけよう` |
| G | `icon_type` | string | NOT NULL | フロントエンドでアイコン・カラーを切り替えるためのキー。例: `first_step`、`streak_3`、`legendary` |

**デフォルトデータ（8件）:**

| achievement_id | name | condition_type | condition_value | icon_type |
|---|---|---|---|---|
| ACH001 | 初稽古 | total_practices | 1 | first_step |
| ACH002 | 三日坊主克服 | streak_days | 3 | streak_3 |
| ACH003 | 一週間の剣士 | streak_days | 7 | streak_7 |
| ACH004 | 精進十日 | streak_days | 10 | streak_10 |
| ACH005 | 一ヶ月皆勤 | streak_days | 30 | streak_30 |
| ACH006 | 十稽古 | total_practices | 10 | milestone_10 |
| ACH007 | 五十稽古 | total_practices | 50 | milestone_50 |
| ACH008 | 百錬自得 | total_practices | 100 | legendary |

---

## 4. システム系シート

### 4-1. error_logs

**シート名:** `error_logs`
**役割:** GAS バックエンドの全アクションログ（INFO / WARN / ERROR）。デバッグ・監査用。
**定数名:** `SHEET_ERRORLOGS`
**自動作成:** `gasLog()` が初回書き込み時に自動作成する。最大行数は1001行（超過時に古い50行を自動削除）。

| 列 | 物理名 | 型 | 制約 | 説明 |
|---|---|---|---|---|
| A | `timestamp` | datetime (YYYY-MM-DD HH:mm:ss) | NOT NULL | ログ記録日時（JST） |
| B | `level` | string | NOT NULL | ログレベル。`INFO` / `WARN` / `ERROR` の3値 |
| C | `action` | string | NOT NULL | 実行されたアクション名。例: `saveLog`、`getDashboard`、`getTechniques` |
| D | `message` | string | NOT NULL | ログメッセージ本文 |
| E | `detail` | string | NULLABLE | 追加情報（JSON文字列、最大500文字にトリミング）。エラー時のスタック情報等 |

---

## 5. 廃止済みシート

| シート名 | 廃止フェーズ | 廃止理由 |
|---|---|---|
| `settings` | Phase4 | ユーザー設定をシートで管理する設計を廃止。`user_status` の G〜I 列（`real_rank` / `motto` / `favorite_technique_id`）に統合した |

---

## 6. XP・レベル計算仕様

本仕様は `Code.gs` と `types/index.ts` で**完全に同一ロジックを実装**している。両者の乖離は重大なバグの原因となるため、一方を変更する場合は必ず他方も同期すること。

### 6-1. XP → レベル変換

```
xpForLevel(n) = floor(100 × (n-1)^1.8)  // n = 1〜99
xpForLevel(1) = 0
xpForLevel(2) = 100
xpForLevel(10) ≒ 4,900
xpForLevel(99) ≒ 459,512
```

`calcLevel(xp)` は n=1 から 99 まで走査し、`xp >= xpForLevel(n)` を満たす最大の n を返す（上限99）。

### 6-2. saveLog XP計算

```
1. 基本XP = 50（1セッション固定）
2. スコアボーナス = { 5:30, 4:20, 3:10, 2:5, 1:2 }[score] × 課題数分加算
3. リアル段位倍率 = { 初段:1.2, 弐段:1.5, 参段:1.8, 四段:2.2, 五段:2.7, 六段:3.4, 七段:4.2, 八段:5.0, 無段:1.0 }
4. 獲得XP = ceil((基本XP + スコアボーナス合計) × 段位倍率)
```

### 6-3. XP減衰計算

```
penalty = floor(20 × (daysAbsent - 3)^1.3)  // daysAbsent > 3 の場合のみ
```

発動条件: 最終稽古日から4日以上経過 かつ 当日未適用（`last_decay_date ≠ today`）

### 6-4. 他者評価XP計算

```
xpGranted = ceil(Σ(評価スコア) × 2 × 評価者レベル倍率)
```

### 6-5. 技の稽古XP計算（Phase8）

`updateTechniqueRating()` が使用するポイント計算式。`saveLog()` とは独立した XP 源。

```
量基礎点 = { 1:10, 2:20, 3:30, 4:40, 5:50 }
質倍率   = { 1:0.1, 2:0.5, 3:1.0, 4:2.0, 5:5.0 }
獲得XP   = ceil(量基礎点[quantity] × 質倍率[quality])
```

最小: 量1×質1 = 1pt（点滴穿石）
最大: 量5×質5 = 250pt（百錬自得）

この獲得XP は `user_status.total_xp` に直接加算され、レベル・称号・`xp_history` が連動して更新される。

---

## 7. シート間リレーション図

```
UserMaster (user_id)
    │
    ├──── user_status     (A: user_id)
    │         └── I: favorite_technique_id ──→ technique_master (id)
    │
    ├──── user_tasks      (B: user_id)  [A: id = UUID]
    │
    ├──── user_techniques (A: user_id)
    │         └── B: technique_id ──────────→ technique_master (id)
    │
    ├──── user_achievements (A: user_id)
    │         └── B: achievement_id ─────→ achievement_master (achievement_id)
    │
    ├──── logs            (A: user_id)
    │         └── C: task_id ────────────→ user_tasks (id)
    │
    ├──── xp_history      (A: user_id)
    │
    ├──── technique_logs  (A: user_id)  ★ Phase8 新設
    │         └── C: technique_id ──────→ technique_master (id)
    │
    └──── peer_evaluations
              A: evaluator_id ────────────→ UserMaster (user_id)
              B: target_id ───────────────→ UserMaster (user_id)
              C: task_id ─────────────────→ user_tasks (id)

共通マスタ（user_id なし）
    technique_master     ← user_techniques.technique_id
                         ← user_status.favorite_technique_id
                         ← technique_logs.technique_id         ★ Phase8
    title_master         ← saveLog / applyDecay / evaluatePeer / updateTechniqueRating での称号算出
    EpithetMaster        ← フロントエンドでの二つ名算出
    achievement_master   ← user_achievements.achievement_id
```

---

*本ドキュメントは `DB_SCHEMA.md` として管理し、スキーマ変更時は必ず本ファイルを更新してから実装すること。*
