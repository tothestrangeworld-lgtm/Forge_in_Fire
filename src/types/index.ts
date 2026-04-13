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
}

export interface NextLevelInfo {
  required: number | null;
  title:    string;
}

export interface DashboardData {
  status:      UserStatus;
  settings:    Setting[];
  logs:        LogEntry[];
  nextLevelXp: NextLevelInfo;
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

// 現在レベルの称号（最後に取得した称号を返す）
export function titleForLevel(level: number): string {
  let title = '入門';
  for (const lv of Object.keys(TITLE_MAP).map(Number).sort((a, b) => a - b)) {
    if (level >= lv) title = TITLE_MAP[lv];
    else break;
  }
  return title;
}

// 次の称号が得られるレベルと名前
export function nextTitleLevel(level: number): { level: number; title: string } | null {
  for (const lv of Object.keys(TITLE_MAP).map(Number).sort((a, b) => a - b)) {
    if (lv > level) return { level: lv, title: TITLE_MAP[lv] };
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
export function calcNextLevel(xp: number): { xp: number; title: string } | null {
  const level = calcLevelFromXp(xp);
  if (level >= 99) return null;
  return { xp: xpForLevel(level + 1), title: titleForLevel(level + 1) };
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
