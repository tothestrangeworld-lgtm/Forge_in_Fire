// =====================================================================
// 百錬自得 - 型定義・レベル/XPロジック
// ★ Phase4 正規化:
//   - SaveLogPayload.items を item_name → task_id に変更
//   - DashboardData.settings フィールドを廃止
//   - Setting 型を廃止
// ★ Phase6: アチーブメントシステム型追加
//   - Achievement 型・AchievementMasterEntry 型を追加
//   - SaveLogResponse に newAchievements フィールドを追加
// ★ Phase7: 個別課題単位の他者評価対応
//   - PeerEvalItem 型を追加
//   - EvaluatePeerResponse を配列評価レスポンス対応に更新
// ★ Phase8: 技の稽古 量×質マトリックス対応
//   - Technique 型に lastQuantity / lastQuality / lastFeedback を追加
//   - TechniqueUpdateResponse に earnedPoints / feedback / total_xp / level を追加
// =====================================================================

export interface LogEntry {
  date:      string;
  item_name: string; // GAS 側で task_id → task_text に JOIN して返す
  score:     number;
  xp_earned: number;
}

export interface UserStatus {
  total_xp:            number;
  level:               number;
  title:               string;
  last_practice_date?: string | null;
  real_rank?:          string;
  motto?:              string;
  /**
   * 得意技ID（例: "T001"）。
   * 表示時は techniqueMaster を参照して技名に変換する。
   */
  favorite_technique?: string;
}

export interface NextLevelInfo {
  required: number | null;
  title:    string;
}

export interface DecayInfo {
  applied:       number;
  days_absent:   number;
  today_penalty: number;
}

/** title_master シートの1行 */
export interface TitleMasterEntry {
  level: number;
  title: string;
}

// =====================================================================
// technique_master シートの1行（全ユーザー共通マスタ）
// GAS列構成: ID, BodyPart, ActionType, SubCategory, Name
// =====================================================================
export interface TechniqueMasterEntry {
  id:          string;   // 例: "T001"
  bodyPart:    string;   // 例: "面"
  actionType:  string;   // 例: "仕掛け技"
  subCategory: string;   // 例: "出端技"
  name:        string;   // 例: "出小手"
}

// =====================================================================
// xp_history シートの1行
// =====================================================================
export interface XpHistoryEntry {
  date:           string;
  type:           'gain' | 'decay' | 'reset' | 'peer_eval' | string;
  amount:         number;
  reason:         string;
  total_xp_after: number;
  level:          number;
  title:          string;
}

// =====================================================================
// user_tasks
// =====================================================================

export interface UserTask {
  id:         string;
  task_text:  string;
  status:     'active' | 'archived' | string;
  created_at: string;
  updated_at: string;
}

export interface DashboardData {
  status:           UserStatus;
  tasks?:           UserTask[];        // 評価項目（active / archived 含む）
  logs:             LogEntry[];        // GASがJOINして item_name を復元済み
  nextLevelXp:      NextLevelInfo;
  decay?:           DecayInfo;
  titleMaster?:     TitleMasterEntry[];
  epithetMaster?:   EpithetMasterEntry[];
  /** XP全イベント履歴（直近90件）*/
  xpHistory?:       XpHistoryEntry[];
  /**
   * technique_master の全件。getDashboard で返される。
   * 得意技ID → 技名変換や SkillGrid のハイライトに使用。
   */
  techniqueMaster?: TechniqueMasterEntry[];
}

// =====================================================================
// SaveLogPayload
// ★ Phase4: items[].task_id（UUID）を使用。item_name は廃止。
// =====================================================================
export interface SaveLogPayload {
  action: 'saveLog';
  date:   string;
  items:  Array<{ task_id: string; score: number }>;
}

// =====================================================================
// SaveLogResponse
// ★ Phase6: newAchievements フィールドを追加
// =====================================================================
export interface SaveLogResponse {
  xp_earned:        number;
  total_xp:         number;
  level:            number;
  title:            string;
  /**
   * 今回の saveLog で新たに解除されたアチーブメント一覧。
   * 解除なしの場合は空配列 [] が返る。
   */
  newAchievements?: Achievement[];
}

// =====================================================================
// updateTasks ペイロード
// ★ Phase4: スマート差分に対応
//   - id あり: 既存タスクを再アクティブ化（テキスト不変＝IDを維持）
//   - id なし: 新規タスクとして UUID 発行
// =====================================================================
export interface TaskDiff {
  id?:  string;   // 既存タスクの UUID（テキスト変更なしの場合に渡す）
  text: string;   // タスクテキスト
}

// =====================================================================
// 他者評価 ★ Phase7: 個別課題単位の評価対応
// =====================================================================

/**
 * evaluatePeer リクエストの課題単位評価アイテム
 * task_id に対して 1〜5 のスコアを設定する
 */
export interface PeerEvalItem {
  taskId: string;  // user_tasks の id（UUID）
  score:  number;  // 1〜5
}

/**
 * evaluatePeer レスポンス
 * ★ Phase7: 配列評価に対応。evaluated_tasks / skipped_tasks を追加。
 */
export interface EvaluatePeerResponse {
  xp_granted:      number;    // 今回付与した合計XP（0 の場合は全スキップ）
  evaluator_level: number;    // 評価者のアプリ内レベル
  multiplier:      number;    // 評価者レベル倍率
  /** 今回新たに評価に成功した task_id 一覧 */
  evaluated_tasks: string[];
  /** 本日すでに評価済みでスキップした task_id 一覧 */
  skipped_tasks:   string[];
}

export interface GASResponse<T> {
  status:   'ok' | 'error';
  data?:    T;
  message?: string;
}

// =====================================================================
// アチーブメント（実績バッジ）システム ★ Phase6
// =====================================================================

/**
 * achievement_master シートの1行（全ユーザー共通マスタ）
 * GAS列構成: achievement_id, name, condition_type, condition_value, description, hint, icon_type
 *
 * condition_type の種類:
 *   - 'streak_days'     : 連続稽古日数 >= condition_value
 *   - 'total_practices' : 累計稽古日数 >= condition_value
 *   （将来拡張: 'total_xp', 'level_reached' など）
 */
export interface AchievementMasterEntry {
  id:             string;  // 例: "ACH001"
  name:           string;  // 例: "初稽古"
  conditionType:  string;  // 例: "total_practices"
  conditionValue: number;  // 例: 1
  description:    string;  // 例: "初めての稽古を記録した"
  hint:           string;  // 例: "稽古記録を1回つけよう"
  iconType:       string;  // 例: "first_step"（フロントでアイコン選択に使用）
}

/**
 * フロントエンド向けアチーブメント型。
 * getAchievements API が返す配列の要素。
 * achievement_master と user_achievements を JOIN した結果。
 */
export interface Achievement {
  /** achievement_id（例: "ACH001"）*/
  id:          string;
  /** バッジ名（例: "初稽古"）*/
  name:        string;
  /** 解除条件の説明（例: "初めての稽古を記録した"）*/
  description: string;
  /** 未解除時のヒント文（例: "稽古記録を1回つけよう"）*/
  hint:        string;
  /**
   * アイコン種別（例: "streak", "milestone", "legendary"）。
   * フロントエンドでアイコン・カラーを切り替えるためのキー。
   */
  iconType:    string;
  /** 解除済みなら true */
  isUnlocked:  boolean;
  /** 解除日時（YYYY-MM-DD HH:mm:ss）。未解除なら null */
  unlockedAt:  string | null;
}

// =====================================================================
// レベル1〜99 指数カーブXPテーブル
// xpForLevel(n) = floor(100 * (n-1)^1.8)
// =====================================================================
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.8));
}

const TITLE_MAP: Record<number, string> = {
  1:  '入門',
  5:  '素振り',
  10: '初段',
  15: '弐段',
  20: '参段',
  25: '四段',
  30: '五段',
  35: '錬士',
  40: '教士',
  50: '範士',
  60: '剣聖',
  70: '剣豪',
  80: '剣鬼',
  90: '剣神',
  99: '剣道の神',
};

function buildTitleTable(master?: TitleMasterEntry[]): Record<number, string> {
  if (master && master.length > 0) {
    return Object.fromEntries(master.map(e => [e.level, e.title]));
  }
  return TITLE_MAP;
}

export function titleForLevel(level: number, master?: TitleMasterEntry[]): string {
  const table = buildTitleTable(master);
  let title = Object.values(table)[0] ?? '入門';
  for (const lv of Object.keys(table).map(Number).sort((a, b) => a - b)) {
    if (level >= lv) title = table[lv];
    else break;
  }
  return title;
}

export function nextTitleLevel(level: number, master?: TitleMasterEntry[]): { level: number; title: string } | null {
  const table = buildTitleTable(master);
  for (const lv of Object.keys(table).map(Number).sort((a, b) => a - b)) {
    if (lv > level) return { level: lv, title: table[lv] };
  }
  return null;
}

export function calcLevelFromXp(xp: number): number {
  let level = 1;
  for (let n = 1; n <= 99; n++) {
    if (xp >= xpForLevel(n)) level = n;
    else break;
  }
  return Math.min(level, 99);
}

export function calcProgressPercent(xp: number): number {
  const level = calcLevelFromXp(xp);
  if (level >= 99) return 100;
  const current = xpForLevel(level);
  const next    = xpForLevel(level + 1);
  return Math.round(((xp - current) / (next - current)) * 100);
}

export function calcNextLevel(xp: number, master?: TitleMasterEntry[]): { xp: number; title: string } | null {
  const level = calcLevelFromXp(xp);
  if (level >= 99) return null;
  return { xp: xpForLevel(level + 1), title: titleForLevel(level + 1, master) };
}

export function levelColor(level: number): string {
  if (level >= 99) return '#f59e0b';
  if (level >= 80) return '#8b5cf6';
  if (level >= 60) return '#6366f1';
  if (level >= 40) return '#0ea5e9';
  if (level >= 20) return '#10b981';
  if (level >= 10) return '#34d399';
  return '#94a3b8';
}

// =====================================================================
// 他者評価XP倍率（アプリ内レベル）
// GAS の getPeerLevelMultiplier と常に同期を保つこと
// =====================================================================
export function getPeerMultiplier(level: number): number {
  if (level >= 80) return 5.0;
  if (level >= 60) return 3.0;
  if (level >= 40) return 2.0;
  if (level >= 30) return 1.5;
  if (level >= 20) return 1.2;
  return 1.0;
}

// =====================================================================
// 技の習熟度（Technique）
// ★ Phase8: lastQuantity / lastQuality / lastFeedback を追加
// =====================================================================

/** user_techniques × technique_master を JOIN した結果の型 */
export interface Technique {
  id:           string;
  bodyPart:     string;
  actionType:   string;
  subCategory:  string;
  name:         string;
  points:       number;
  lastRating:   number;
  /** ★ Phase8: 直近の量スコア（1〜5）。Phase8以前の行は undefined になる場合がある */
  lastQuantity?: number;
  /** ★ Phase8: 直近の質スコア（1〜5）。Phase8以前の行は undefined になる場合がある */
  lastQuality?:  number;
  /** ★ Phase8: 直近の四字熟語フィードバック。Phase8以前の行は undefined になる場合がある */
  lastFeedback?: string;
}

/**
 * updateTechniqueRating のレスポンス
 * ★ Phase8: earnedPoints / feedback / total_xp / level を追加
 */
export interface TechniqueUpdateResponse {
  id:          string;
  points:      number;
  /** ★ Phase8: 今回獲得したXP（ceil(量基礎点 × 質倍率)） */
  earnedPoints: number;
  /** ★ Phase8: 四字熟語フィードバック（例: "切磋琢磨"） */
  feedback:     string;
  /** ★ Phase8: 更新後の累計XP */
  total_xp:     number;
  /** ★ Phase8: 更新後のレベル */
  level:        number;
  /** Phase7以前との互換性のため残す */
  lastRating:   number;
}

// =====================================================================
// 二つ名（Epithet）システム
// =====================================================================

/** EpithetMaster シートの1行 */
export interface EpithetMasterEntry {
  id:           string;
  category:     string;
  triggerValue: string;
  name:         string;
  description:  string;
}

export interface DashboardWithEpithet {
  epithetMaster?: EpithetMasterEntry[];
}

// =====================================================================
// ユーティリティ: 得意技IDから技名を解決する
// =====================================================================

/**
 * 技ID（例: "T001"）を techniqueMaster から検索して技名（例: "出小手"）を返す。
 * 見つからない場合は id をそのまま返す。
 */
export function resolveTechniqueName(
  id: string | undefined | null,
  master: TechniqueMasterEntry[] | undefined,
): string {
  if (!id) return '';
  if (!master || master.length === 0) return id;
  const found = master.find(m => m.id === id);
  return found ? found.name : id;
}
