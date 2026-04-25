// =====================================================================
// 百錬自得 - 型定義・レベル/XPロジック
// ★ 改修2: TechniqueMasterEntry 追加、DashboardData に techniqueMaster 追加
// =====================================================================

export interface Setting {
  item_name: string;
  is_active: boolean;
}

export interface LogEntry {
  date:      string;
  item_name: string;
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
   * ★ UPDATED: 自由記述テキストから technique_master の ID に変更。
   * 表示時は techniqueMaster を参照して技名に変換すること。
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
// technique_master シートの1行（全ユーザー共通マスタ）★ NEW
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
// xp_history シートの1行（イベントソーシング用）
// GAS列構成: user_id, date, type, amount, reason, total_xp_after, level, title
// =====================================================================
export interface XpHistoryEntry {
  /** 記録日（タイムスタンプの日付部分）"YYYY-MM-DD" */
  date:           string;
  /**
   * イベント種別
   * 'gain'      : 自己稽古記録
   * 'decay'     : XP減衰
   * 'reset'     : レベルリセット
   * 'peer_eval' : 他者からの評価
   */
  type:           'gain' | 'decay' | 'reset' | 'peer_eval' | string;
  /** XP増減量。獲得は正値、減衰・リセットはマイナス値または 0 */
  amount:         number;
  /** 理由テキスト（例: "稽古記録（4/13・9項目）", "3日間稽古なし", "師範からの評価"） */
  reason:         string;
  /** イベント適用後の累積XP（グラフのY軸に直接使用） */
  total_xp_after: number;
  /** 適用後のレベル */
  level:          number;
  /** 適用後の称号 */
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
  settings:         Setting[];
  logs:             LogEntry[];
  nextLevelXp:      NextLevelInfo;
  decay?:           DecayInfo;
  titleMaster?:     TitleMasterEntry[];
  epithetMaster?:   EpithetMasterEntry[];
  /** XP全イベント履歴（直近90件）。XPTimelineChart の正データソース */
  xpHistory?:       XpHistoryEntry[];
  tasks?:           UserTask[];
  /**
   * technique_master の全件。getDashboard で返される。
   * プロフィールの得意技ID → 技名変換や SkillGrid のハイライトに使用。
   * ★ NEW
   */
  techniqueMaster?: TechniqueMasterEntry[];
}

export interface SaveLogPayload {
  action: 'saveLog';
  date:   string;
  items:  Array<{ item_name: string; score: number }>;
}

export interface SaveLogResponse {
  xp_earned: number;
  total_xp:  number;
  level:     number;
  title:     string;
}

// =====================================================================
// 他者評価
// =====================================================================

/** evaluatePeer API のレスポンス */
export interface EvaluatePeerResponse {
  /** 対象者に付与されたXP（倍率適用済み） */
  xp_granted:      number;
  /** 評価者のアプリ内レベル */
  evaluator_level: number;
  /** 適用された倍率 */
  multiplier:      number;
}

export interface GASResponse<T> {
  status:   'ok' | 'error';
  data?:    T;
  message?: string;
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
// =====================================================================

/** user_techniques × technique_master を JOIN した結果の型 */
export interface Technique {
  id:          string;
  bodyPart:    string;
  actionType:  string;
  subCategory: string;
  name:        string;
  points:      number;
  lastRating:  number;
}

/** updateTechniqueRating のレスポンス */
export interface TechniqueUpdateResponse {
  id:         string;
  points:     number;
  lastRating: number;
}

// =====================================================================
// 二つ名（Epithet）システム
// =====================================================================

/** EpithetMaster シートの1行 */
export interface EpithetMasterEntry {
  id:           string;
  category:     string;       // 'status' | 'actionType' | 'subCategory' | 'balance'
  triggerValue: string;
  name:         string;
  description:  string;
}

export interface DashboardWithEpithet {
  epithetMaster?: EpithetMasterEntry[];
}

// =====================================================================
// ユーティリティ: 得意技IDから技名を解決する
// ★ NEW: favorite_technique がIDになったため、表示箇所で使用する
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
