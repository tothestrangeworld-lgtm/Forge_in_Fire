# 百錬自得（Forge_in_Fire） - DB_SCHEMA.md

> Google Sheets をデータベースとして使用するアプリのスキーマ定義。
> GAS（Google Apps Script）が各シートを読み書きする際の列構成を記載する。

---

## ユーザー固有シート（A列は必ず `user_id`）

### `user_status`

★ Phase9.5: `title` 列を物理削除。称号は `level` + `title_master` からフロントで動的導出する。

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | user_id | string | ユーザーID |
| B | total_xp | number | 累積XP |
| C | level | number | レベル（1〜99） |
| D | last_practice_date | string | 最終稽古日（YYYY-MM-DD） |
| E | last_decay_date | string | 最終減衰適用日（YYYY-MM-DD） |
| F | real_rank | string | リアル段位（例: 初段） |
| G | motto | string | 座右の銘 |
| H | favorite_technique | string | 得意技ID（例: T001） |

> **Phase9.5 移行メモ:**
> 旧スキーマにあった D列（title）を削除し、D列以降を1つ左に詰めた。
> title は `title_master` と `level` から `titleForLevel()` で常に動的計算する。
> スプレッドシート上でも D列（title）を手動で列削除してから再デプロイすること。

---

### `logs`（稽古評価ログ）★ Phase11

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | user_id | string | ユーザーID |
| B | date | string | 稽古日（YYYY-MM-DD） |
| C | task_id | string | 評価項目ID（user_tasks の id と紐づく UUID） |
| D | score | number | 評価（1〜5） |
| E | xp_earned | number | 獲得XP |

> **設計原則（Phase4）:** C列は item_name（文字列）から task_id（UUID）に変更済み。
> 読み取り時は GAS が user_tasks と JOIN して item_name に変換し、フロントに返す。
## 鏡映分析（Insight）の実装方針
`logs`（自己評価）と `peer_evaluations`（他者評価）の各課題IDごとのスコアを突合し、フロントエンドで平均値を計算・比較する。
- 自己評価: `logs` (task_idでフィルタ)
- 他者評価: `peer_evaluations` (target_id=自分のuser_id かつ task_idでフィルタ)
両者の平均スコアの差分に基づき、過小/過大評価、または明鏡止水の判定を行い、ダッシュボードの分布UI下部に表示する。

---

### `settings`（意識項目）— ★ **廃止済み（Phase4）**

> このシートは廃止済み。物理シートが残存していても GAS からは一切アクセスしない。
> 評価項目管理は `user_tasks` に完全一本化。

---

### `user_tasks`（カスタム評価項目マスタ）

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | id | string | 項目UUID（logs.task_id から参照） |
| B | user_id | string | ユーザーID |
| C | task_text | string | 評価項目名 |
| D | status | string | `active` / `archived` |
| E | created_at | string | 作成日時 |
| F | updated_at | string | 更新日時 |

---

### `user_techniques`（ユーザーごとの技習熟度）★ Phase8 拡張

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | user_id | string | ユーザーID |
| B | technique_id | string | 技のID（technique_master の ID と紐づく） |
| C | Points | number | 累積ポイント（無制限蓄積。UIは視覚的キャップで上限表示） |
| D | LastRating | number | 直近の質スコア（1〜5） |
| E | last_quantity | number | 直近の量スコア（1〜5）★ Phase8追加 |
| F | last_quality | number | 直近の質スコア（1〜5、D列と同値）★ Phase8追加 |
| G | last_feedback | string | 直近の四字熟語フィードバック ★ Phase8追加 |

---

### `xp_history`（XP増減履歴）

★ Phase9.5: `title` 列を物理削除。称号は `level` + `title_master` からフロントで動的導出する。

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | user_id | string | ユーザーID |
| B | date | string | タイムスタンプ（YYYY-MM-DD HH:mm:ss） |
| C | type | string | gain / decay / reset / peer_eval |
| D | amount | number | 増減量（減衰・リセットはマイナス） |
| E | reason | string | 理由テキスト |
| F | total_xp_after | number | 適用後のXP（グラフY軸） |
| G | level | number | 適用後のレベル |

> **Phase9.5 移行メモ:**
> 旧スキーマにあった H列（title）を削除した。計7列構成。
> `writeXpHistory()` の引数からも `title` を除去済み。
> フロント側の `XPTimelineChart` は `titleForLevel(level, titleMaster)` で Tooltip に称号を動的表示する。
> スプレッドシート上でも H列（title）を手動で列削除してから再デプロイすること。

---

### `peer_evaluations`（他者評価ログ）★ Phase11 更新

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | evaluator_id | string | 評価者ID |
| B | target_id | string | 対象者ID |
| C | task_id | string | 評価対象課題ID（UUID）★ Phase7追加 |
| D | date | string | 評価日時（YYYY-MM-DD HH:mm:ss） |
| E | score | number | 評価スコア（1〜5） |
| F | xp_granted | number | 付与XP |


## 鏡映分析（Insight）の実装方針
`logs`（自己評価）と `peer_evaluations`（他者評価）の各課題IDごとのスコアを突合し、フロントエンドで平均値を計算・比較する。
- 自己評価: `logs` (task_idでフィルタ)
- 他者評価: `peer_evaluations` (target_id=自分のuser_id かつ task_idでフィルタ)
両者の平均スコアの差分に基づき、過小/過大評価、または明鏡止水の判定を行い、ダッシュボードの分布UI下部に表示する。
---

### `user_achievements`（ユーザー取得実績）★ Phase6 追加

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | user_id | string | ユーザーID |
| B | achievement_id | string | 実績ID（achievement_master の achievement_id と紐づく） |
| C | unlocked_at | string | 解除日時（YYYY-MM-DD HH:mm:ss） |

---

## 全ユーザー共通マスタ

### `UserMaster`（ユーザー管理）

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | user_id | string | ユーザーID |
| B | name | string | 表示名 |
| C | password | string | パスコード |
| D | role | string | admin / member |

---

### `technique_master`（技マスタ）

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | ID | string | 技の識別ID（例: T001） |
| B | BodyPart | string | 部位（面・小手・胴・突き） |
| C | ActionType | string | 種別（仕掛け技・応じ技等） |
| D | SubCategory | string | サブカテゴリ（例: 出端技・払い技・返し技） |
| E | Name | string | 技の名前（例: 出小手） |

---

### `title_master`（レベル称号テーブル）

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | level | number | 称号獲得レベル |
| B | title | string | 称号名（例: 初段） |

> **Phase9.5 設計方針:**
> `user_status` と `xp_history` から物理的に `title` 列を削除したことで、
> このシートが「唯一の称号真実源（Single Source of Truth）」となった。
> `title_master` を編集するだけで全ユーザーの称号表示が一括更新される。
> 過去の xp_history レコードに紐づく称号も、再計算によって常に最新のマスタと一致する。

---

### `EpithetMaster`（二つ名マスタ）★ Phase9 列追加 / Phase9.1 Description 追加

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | ID | string | 識別ID（例: E001） |
| B | Category | string | 判定カテゴリ。現在は `styleCombo` 固定 |
| C | TriggerValue | string | 照合キー。`styleCombo` の場合は上位3 SubCategory を**五十音昇順でカンマ結合**した文字列（例: `基本,二段打ち,払い技`） |
| D | Name | string | 二つ名テキスト（例: `暴君`、`神速`）。UI表示時は自動でダブルクォーテーションで囲む |
| E | Rarity | string | ★ Phase9追加。レア度フラグ（`N` / `R` / `SR`）。UIの文字色判定に直接使用（データ駆動型設計） |
| F | Description | string | ★ Phase9.1追加。二つ名の由来説明文（例: `捨て身の技を好む剣士に与えられる称号`）。タップ時のインライントグル表示に使用。空の場合フロントが `"まだ見ぬ剣の道を歩む者"` にフォールバック |

#### Rarity の登録ルール

| Rarity 値 | 意味 | UI文字色 | 追加スタイル |
|---|---|---|---|
| `N` | Normal | `#2B2B2B`（墨黒） | なし |
| `R` | Rare | `#2C4F7C`（藍鉄色） | なし |
| `SR` | Super Rare | `#8B2E2E`（深紅） | `fontWeight: 800` + `letterSpacing: 0.18em` |

> **設計方針（Phase9 データ駆動型）:**
> フロントエンドは Rarity 列の値をそのまま UI のカラー・スタイルに反映する。
> コード側でレア度を計算しないため、スプレッドシートの編集だけで演出が変わり、**再デプロイ不要**。
> GAS は `getEpithetMasterData()` / `getDashboard()` でこの E列・F列もフロントに返すこと。

#### TriggerValue の構築ルール

```
1. user_techniques から subCategory ごとの累計ポイントを集計
2. 降順ソート（同点時は localeCompare('ja') 五十音昇順）で上位3件を抽出
3. 上位3件を五十音昇順でカンマ結合（スペースなし）
   例: ['払い技', '出端技', '基本'] → 昇順ソート → '基本,出端技,払い技'
```

#### GAS での返却フィールドマッピング

```javascript
// GAS の getEpithetMasterData() / getDashboard() 内で以下のようにマッピングする
{
  id:           row[0],   // A列: ID
  category:     row[1],   // B列: Category
  triggerValue: row[2],   // C列: TriggerValue
  name:         row[3],   // D列: Name
  rarity:       row[4],   // E列: Rarity  ★ Phase9追加
  description:  row[5],   // F列: Description  ★ Phase9.1追加
}
```

---

### `achievement_master`（実績バッジマスタ）★ Phase6 追加

| 列 | カラム名 | 型 | 内容 |
|---|---|---|---|
| A | achievement_id | string | 実績ID（例: ACH001） |
| B | name | string | バッジ名（例: 初稽古） |
| C | condition_type | string | 解除条件種別（`streak_days` / `total_practices`） |
| D | condition_value | number | 解除条件値 |
| E | description | string | 解除済み時の説明文 |
| F | hint | string | 未解除時のヒント文 |
| G | icon_type | string | アイコン種別キー（フロントでアイコン選択に使用） |

> **GASによるデフォルト投入:**
> `achievement_master` シートが存在しない場合、GAS が初回アクセス時に以下8件を自動挿入する。

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

---

### `error_logs`（システムログ）

| 列 | カラム名 | 内容 |
|---|---|---|
| A | timestamp | タイムスタンプ |
| B | level | ログレベル（INFO / WARN / ERROR） |
| C | action | GASアクション名 |
| D | message | メッセージ |
| E | detail | 詳細（JSON等） |

> 1000行超で古い行を自動削除。

---

## データ設計の原則

### 正規化方針

- `logs.task_id` は UUID で格納し、読み取り時に `user_tasks` と JOIN して `item_name` を復元する。
- フロントエンドには常に `item_name`（テキスト）で返すため、チャートや表示ロジックは変更不要。
- `user_techniques` は `technique_master` と JOIN して bodyPart / actionType / subCategory / name を付加して返す。
- **★ Phase9.5:** `user_status.title` と `xp_history.title` を廃止。称号の唯一の真実源は `title_master` のみ。
  フロントおよび GAS レスポンスで称号を表示する場合は必ず `titleForLevel(level, titleMaster)` で動的計算する。

### 冪等性・アーカイブ方針

- タスクテキストを変更すると、旧タスクは `archived` になり新 UUID が発行される。
- 元のテキストに戻した場合は「変更なし」と判定し、既存 UUID を維持する。
- `archived` タスクは物理削除しない（過去ログの JOIN 復元に使用）。
- 実績（user_achievements）は一度解除されたら再解除されない。物理削除しない。

### 後方互換性

- `EpithetMaster` の E列（Rarity）・F列（Description）が存在しない旧マスタ行を参照した場合:
  - `rarity` は `undefined` → フロントが `'N'`（Normal）にフォールバック
  - `description` は `undefined` → フロントが `'まだ見ぬ剣の道を歩む者'` にフォールバック
  - エラーは発生せず、UI は墨黒の二つ名として正常に表示される。

### ★ Phase9.5 スプレッドシート移行手順

1. **`user_status` シートの D列（旧 title）を右クリック → 列を削除**
   - 旧: A(user_id), B(total_xp), C(level), **D(title)**, E(last_practice_date), ...
   - 新: A(user_id), B(total_xp), C(level), D(last_practice_date), E(last_decay_date), ...

2. **`xp_history` シートの H列（旧 title）を右クリック → 列を削除**
   - 旧: ..., F(total_xp_after), G(level), **H(title)**
   - 新: ..., F(total_xp_after), G(level)

3. **GAS を新バージョンとしてデプロイ**（本ドキュメントと同時更新の `Code.gs` を反映）

4. **動作確認:**
   - getDashboard レスポンスに `status.title` が含まれていないこと
   - xpHistory 各エントリに `title` が含まれていないこと
   - XP推移チャートの Tooltip に称号が正しく動的表示されること
