# Database Schema (Google Sheets)

バックエンド（GAS）は、スプレッドシートをデータベースとして利用する。
各シートの1行目はヘッダー行であり、列構成は以下の通り（Phase 15 時点）。

★ Phase 15 にて、`technique_logs` および `received_technique_logs` の右端に
  `is_match` 列を追加し、試合時特大レバレッジ（×10）に対応。

## 1. ユーザー情報・設定
### `users` (= `UserMaster`)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | ユーザーID (例: U0001) |
| B | name | string | 剣士名 |
| C | passcode | string | ログイン用パスコード(4〜16桁) |
| D | role | string | 'admin' or 'user' |

### `user_status`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | total_xp | number | 累計経験値 |
| C | level | number | 現在のレベル |
| D | last_practice_date | string | 最終稽古日 (YYYY-MM-DD) |
| E | last_decay_date | string | 最終減衰適用日 (YYYY-MM-DD) |
| F | real_rank | string | 段位 (無段/初段/弐段/.../八段) |
| G | motto | string | 座右の銘（20文字以内） |
| H | favorite_technique | string | 得意技ID (例: T001) |

### `user_tasks`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | 課題ID (UUID) |
| B | user_id | string | 所有ユーザーのID |
| C | task_text | string | 課題の内容 |
| D | status | string | 'active' or 'archived' |
| E | created_at | string | 作成日時 |
| F | updated_at | string | 最終更新日時 |

## 2. ログ・履歴データ
### `logs` (課題進捗ログ)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | date | string | 稽古日付 (YYYY-MM-DD) |
| C | task_id | string | 評価対象の課題ID (UUID) |
| D | score | number | 評価スコア (1〜5) |
| E | xp_earned | number | この記録で獲得したXP（段位倍率適用前のスコアボーナス分） |

### `user_techniques` (与打・累積マスタリー)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | technique_id | string | 技マスターのID |
| C | Points | number | 累計獲得ポイント (SkillGrid用)。**★ Phase 15: 試合時は ×10 加算済み** |
| D | LastRating | number | 最後の評価値（1〜5） |
| E | last_quantity | number | 最後に記録した際の「量」 |
| F | last_quality | number | 最後に記録した際の「質」 |
| G | last_feedback | string | 旧四字熟語フィードバック（Phase13.2 廃止・空文字保存） |

### `technique_logs` (与打・詳細ログ)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | date | string | 記録日時 (YYYY-MM-DD HH:mm:ss) |
| C | technique_id | string | 技マスターのID |
| D | quantity | number | 打突の量 (1〜5) |
| E | quality | number | 打突の質 (1〜5) |
| F | xp_earned | number | この記録で獲得したXP（試合時は ×10 適用済み） |
| G | feedback | string | 旧四字熟語フィードバック（Phase13.2 廃止・空文字保存） |
| **H** | **is_match** | **boolean** | **★ Phase 15: 試合フラグ。true の場合、E列のXP・user_techniques.Points 共に ×10 で計算済み。空セルは false 扱い** |

### `received_technique_logs` (被打・詳細ログ)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | ログID (UUID) |
| B | user_id | string | ユーザーID |
| C | date | string | 稽古日付 (YYYY-MM-DD) |
| D | technique_id | string | 打たれた技（マスターID） |
| E | quantity | number | 打たれた回数 (1〜5) |
| F | reason | number | 打たれた原因コード (1〜5) |
| G | xp_earned | number | 正直記録ボーナスXP（通常: 25×qty / 試合時: 250×qty） |
| **H** | **is_match** | **boolean** | **★ Phase 15: 試合フラグ。true の場合、G列のXP・getReceivedStatsData の receivedPoints 共に ×10 で計算される。空セルは false 扱い** |

#### 被打原因コード (reason)
| コード | ラベル | 深刻度係数 (SEVERITY_MULT) |
|:---:|:---|:---:|
| 1 | 攻め負け | 1.0 |
| 2 | 単調 | 1.2 |
| 3 | 居着き | 1.5 |
| 4 | 体勢崩れ | 2.0 |
| 5 | 手元上がり | 3.0 |

### `xp_history` (経験値獲得履歴)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | date | string | 記録日時 (YYYY-MM-DD HH:mm:ss) |
| C | type | string | 'gain' / 'decay' / 'reset' / 'peer_eval' / 'mitori_bonus' |
| D | amount | number | 増減XP量（減衰時は負数） |
| E | reason | string | 獲得理由（評価者名は匿名化済み） |
| F | total_xp_after | number | 獲得後の累計XP |
| G | level | number | 獲得後のレベル |

## 3. ソーシャル・その他
### `peer_evaluations` (見取り稽古)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | evaluator_id | string | 評価した人のユーザーID |
| B | target_id | string | 評価された人のユーザーID |
| C | task_id | string | 対象となった課題ID |
| D | date | string | 記録日時 (YYYY-MM-DD HH:mm:ss) |
| E | score | number | 評価スコア (1〜5) |
| F | xp_granted | number | 評価された側に付与されたXP |

### `user_achievements` (実績解除履歴)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | achievement_id | string | アチーブメントID (例: ACH001) |
| C | unlocked_at | string | 解除日時 (YYYY-MM-DD HH:mm:ss) |

### `push_subscriptions` (Web Push 通知)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | subscription_json | string | PushSubscription を JSON.stringify したもの |
| C | updated_at | string | 最終更新日時 |

## 4. マスターデータ系

### `technique_master`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | ID | string | 技ID (例: T001) |
| B | BodyPart | string | 部位 (面/小手/胴/突き) |
| C | ActionType | string | 仕掛け技/応じ技/基本など |
| D | SubCategory | string | 出端技/払い技/抜き技/返し技/摺り上げ技/基本など |
| E | Name | string | 技名 (例: 出小手) |

### `title_master`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | level | number | 称号獲得レベル |
| B | title | string | 称号名 |

### `EpithetMaster` (二つ名)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | ID | string | 二つ名ID (例: E001) |
| B | Category | string | 判定カテゴリ (例: styleCombo) |
| C | TriggerValue | string | 発動条件値（カンマ区切り SubCategory リストなど） |
| D | Name | string | 二つ名（例: 神速の） |
| E | Rarity | string | レア度 (N / R / SR) |
| F | Description | string | 由来説明文 |

### `achievement_master`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | achievement_id | string | アチーブメントID |
| B | name | string | 実績名 |
| C | condition_type | string | 'streak_days' or 'total_practices' |
| D | condition_value | number | 達成条件値 |
| E | description | string | 実績解除後の説明文 |
| F | hint | string | 未解除時のヒント文 |
| G | icon_type | string | アイコンタイプ識別子 |

### `MatchupMaster` (剣風相性)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | BaseStyle | string | 自分の得意技スタイル（SubCategory） |
| B | MatchType | string | 'S' (強い/得意) or 'W' (弱い/苦手) |
| C | Degree | number | 相性の強さ (1〜3) |
| D | TargetStyle | string | 相手の得意技スタイル（SubCategory） |
| E | Reason | string | 相性の理由テキスト |
| F | Advice | string | 対策・アドバイステキスト |

## 5. システム用
### `error_logs`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | timestamp | string | 記録日時 |
| B | level | string | 'INFO' / 'WARN' / 'ERROR' |
| C | action | string | 実行アクション名 |
| D | message | string | メッセージ |
| E | detail | string | JSON文字列（500文字でカット） |

※ 1001行を超えると古い50件を自動削除。

## 6. Phase 15 マイグレーションメモ

### 既存DBに対する手動作業
Phase 15 デプロイ時、既存の以下シートに **H列のヘッダー** を追加する作業が必要：

| シート名 | H列ヘッダー |
|:---|:---|
| `technique_logs` | `is_match` |
| `received_technique_logs` | `is_match` |

### 互換性
- 既存行の H列は空セル → `is_match` は false 扱い → 通常記録（×1）として正しく集計。
- 新規シートは GAS が自動で 8列構成で作成。
- 過去データの再計算・移行は不要。

### 計算式の影響範囲
| 値 | 通常時 | 試合時 (is_match=true) |
|---|---|---|
| 与打XP（saveLog） | `ceil(QUANTITY_BASE[q] * QUALITY_MULT[q])` | 上記 × 10 |
| 与打 user_techniques.Points | 与打XPと同値で加算 | 試合時XPで加算（×10） |
| 被打XP（saveLog） | `25 * quantity` | `25 * quantity * 10` |
| 被打 receivedPoints（getReceivedStatsData） | `quantity * SEVERITY_MULT[reason]` | 上記 × 10 |

---
最終更新: Phase 15 完了時点（is_match 列追加・試合時特大レバレッジ実装）