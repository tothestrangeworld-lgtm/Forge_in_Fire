// =====================================================================
// 百錬自得 - 型定義・レベル/XPロジック
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
  total_xp: number;
  level:    number;
  title:    string;
  last_practice_date?: string | null;
  real_rank?: string;
  motto?: string;
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
   * 'peer_eval' : 他者からの評価 ★ NEW
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
  status:         UserStatus;
  settings:       Setting[];
  logs:           LogEntry[];
  nextLevelXp:    NextLevelInfo;
  decay?:         DecayInfo;
  titleMaster?:   TitleMasterEntry[];
  epithetMaster?: EpithetMasterEntry[];
  /** XP全イベント履歴（直近90件）。XPTimelineChart の正データソース */
  xpHistory?:     XpHistoryEntry[];
  tasks?:         UserTask[];
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
// 他者評価 ★ NEW
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
// 低レベルはサクサク、高レベルになるほど重くなる
// =====================================================================
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.8));
}

// 称号はキリのいいレベルのみ（剣道にちなんだ称号）
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

// 称号マスタをオブジェクト化（動的データ or ハードコードフォールバック）
function buildTitleTable(master?: TitleMasterEntry[]): Record<number, string> {
  if (master && master.length > 0) {
    return Object.fromEntries(master.map(e => [e.level, e.title]));
  }
  return TITLE_MAP;
}

// 現在レベルの称号（動的マスタ対応）
export function titleForLevel(level: number, master?: TitleMasterEntry[]): string {
  const table = buildTitleTable(master);
  let title = Object.values(table)[0] ?? '入門';
  for (const lv of Object.keys(table).map(Number).sort((a, b) => a - b)) {
    if (level >= lv) title = table[lv];
    else break;
  }
  return title;
}

// 次の称号が得られるレベルと名前（動的マスタ対応）
export function nextTitleLevel(level: number, master?: TitleMasterEntry[]): { level: number; title: string } | null {
  const table = buildTitleTable(master);
  for (const lv of Object.keys(table).map(Number).sort((a, b) => a - b)) {
    if (lv > level) return { level: lv, title: table[lv] };
  }
  return null;
}

// XPからレベルを計算
export function calcLevelFromXp(xp: number): number {
  let level = 1;
  for (let n = 1; n <= 99; n++) {
    if (xp >= xpForLevel(n)) level = n;
    else break;
  }
  return Math.min(level, 99);
}

// 現在レベルのXP進捗率（0〜100）
export function calcProgressPercent(xp: number): number {
  const level = calcLevelFromXp(xp);
  if (level >= 99) return 100;
  const current = xpForLevel(level);
  const next    = xpForLevel(level + 1);
  return Math.round(((xp - current) / (next - current)) * 100);
}

// 旧API互換（dashboard page で使用）
export function calcNextLevel(xp: number, master?: TitleMasterEntry[]): { xp: number; title: string } | null {
  const level = calcLevelFromXp(xp);
  if (level >= 99) return null;
  return { xp: xpForLevel(level + 1), title: titleForLevel(level + 1, master) };
}

// レベルカラー
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
// 他者評価XP倍率（アプリ内レベル） ★ NEW
// GAS の getPeerLevelMultiplier と同じロジック（フロント表示用）
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
// 技の習熟度（TechniqueMastery）
// =====================================================================

/** TechniqueMastery シートの1行に対応する型 */
export interface Technique {
  id:          string;
  bodyPart:    string;  // 部位（例: 上半身, 下半身, 全身）
  actionType:  string;  // 動作種別（例: 打突, 足さばき, 構え）
  subCategory: string;  // サブカテゴリ（例: 面, 小手, 胴）
  name:        string;  // 技の名前
  points:      number;  // 累積ポイント
  lastRating:  number;  // 直近の星評価（1〜5）
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
  triggerValue: string;       // 照合キー（例: '仕掛け技', '出端技', '初期', 'バランス'）
  name:         string;       // 修飾語（例: '怒涛の', '後の先を極めし'）
  description:  string;       // 説明文
}

/** getDashboard レスポンスに含まれる二つ名マスタ */
export interface DashboardWithEpithet {
  epithetMaster?: EpithetMasterEntry[];
}
