### 📄 DB_SCHEMA.md (Phase 14.1 完了時点)

```markdown
# Database Schema (Google Sheets)

バックエンド（GAS）は、スプレッドシートをデータベースとして利用する。
各シートの1行目はヘッダー行であり、列構成は以下の通り（Phase 14.1 時点）。

## 1. ユーザー情報・設定
### `users`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | ユーザーID (UUID) |
| B | name | string | 剣士名 |
| C | passcode | string | ログイン用パスコード(4桁) |
| D | xp | number | 累計経験値 |
| E | level | number | 現在のレベル |
| F | created_at | string | アカウント作成日時 |
| G | last_login | string | 最終ログイン日時 |

### `tasks`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | 課題ID (UUID) |
| B | user_id | string | 所有ユーザーのID |
| C | name | string | 課題の内容 |
| D | created_at | string | 作成日時 |
| E | is_active | boolean| 現在有効な課題か (true/false) |

## 2. ログ・履歴データ
### `logs` (課題進捗ログ)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | ログID (UUID) |
| B | user_id | string | ユーザーID |
| C | task_id | string | 評価対象の課題ID |
| D | score | number | 評価スコア (0~10) |
| E | date | string | 稽古日付 (YYYY-MM-DD) |
| F | notes | string | 自由記述メモ |
| G | created_at | string | 記録日時 |

### `user_techniques` (与打・累積マスタリー)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | technique_id | string | 技マスターのID |
| C | total_pts | number | 累計獲得ポイント (SkillGrid用) |
| D | last_used | string | 最終成功日時 |
| E | last_quantity| number | 最後に記録した際の「量」 |
| F | last_quality | number | 最後に記録した際の「質」 |
| G | last_feedback| string | 最後に生成された四字熟語 |

### `technique_logs` (与打・詳細ログ)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | ログID (UUID) |
| B | user_id | string | ユーザーID |
| C | technique_id | string | 技マスターのID |
| D | quantity | number | 打突の量 (1~5) |
| E | quality | number | 打突の質 (1~3) |
| F | earned_pts | number | この記録で獲得したポイント |
| G | created_at | string | 記録日時 |

### `received_technique_logs` (被打・詳細ログ)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | ログID (UUID) |
| B | user_id | string | ユーザーID |
| C | technique_id | string | 打たれた技（マスターID） |
| D | quantity | number | 打たれた回数 |
| E | reason | string | 打たれた原因 (居着き, 単調など) |
| F | created_at | string | 記録日時 |

### `xp_history` (経験値獲得履歴)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | 履歴ID (UUID) |
| B | user_id | string | ユーザーID |
| C | date | string | 獲得日付 (YYYY-MM-DD) |
| D | xp_gained | number | 獲得したXP量 |
| E | reason | string | 獲得理由 (Daily Training, Bonus等) |
| F | total_xp_after| number | 獲得後の累計XP |
| G | created_at | string | 記録日時 |

## 3. ソーシャル・その他
### `peer_evaluations` (見取り稽古)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | 評価ID (UUID) |
| B | source_id | string | 評価した人 (User A) |
| C | target_id | string | 評価された人 (User B) |
| D | task_id | string | 対象となった課題ID |
| E | rating | number | 評価スコア (0~10) |
| F | comment | string | アドバイス内容 |
| G | created_at | string | 記録日時 |

### `push_subscriptions` (Web Push 通知)
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | endpoint | string | PushサービスのURL |
| C | keys_p256dh| string | 公開鍵 (p256dh) |
| D | keys_auth | string | 認証シークレット (auth) |
| E | updated_at | string | 最終更新日時 |

## 4. マスターデータ系
※ `TechniqueMaster`, `MatchupMaster`, `EpithetMaster`, `AchievementMaster` はシステム固定値として定義され、列構造の変更は行わないため本定義からは省略（詳細は `src/types/index.ts` を参照）。