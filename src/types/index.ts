// types/index.ts
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
// ★ Phase8 Step3-1: getDashboard レスポンスに peerLogs を追加
//   - PeerLogEntry 型を新設
//   - DashboardData に peerLogs?: PeerLogEntry[] を追加
// ★ Phase9: 称号システム刷新（3層構造・DBフラグ参照型レア度判定）
//   - EpithetMasterEntry に rarity フィールドを追加
//   - EpithetResult 型を新3層構造に全面刷新
// ★ Phase9.1: 二つ名の由来説明文を追加
//   - EpithetMasterEntry に description フィールドを追加（GAS列: F列）
//   - EpithetResult に epithetDescription フィールドを追加
// ★ Phase9.5: DB最適化 - title カラム排除（正規化）
//   - UserStatus から title プロパティを削除
//   - XpHistoryEntry から title プロパティを削除
//   - 称号は level + titleMaster から動的に calcTitleFromMaster() で導出する
// ★ Phase10: 剣風相性＆マッチングシステム
//   - MatchupMasterEntry 型を追加（MatchupMaster シート A〜F列）
//   - PeerStyleEntry 型を追加（他の剣友のスタイル把握用）
//   - DashboardData に matchupMaster?: MatchupMasterEntry[] を追加
//   - DashboardData に peersStyle?: PeerStyleEntry[] を追加
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
  // ★ Phase9.5: title を削除。称号は titleForLevel(level, titleMaster) で動的導出する
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
// ★ Phase9.5: title カラムを削除（DB正規化）
// =====================================================================
export interface XpHistoryEntry {
  date:           string;
  type:           'gain' | 'decay' | 'reset' | 'peer_eval' | string;
  amount:         number;
  reason:         string;
  total_xp_after: number;
  level:          number;
  // ★ Phase9.5: title を削除。表示時は titleForLevel(level, titleMaster) で動的導出する
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

// =====================================================================
// MatchupMasterEntry ★ Phase10
// MatchupMaster シートの1行（全ユーザー共通マスタ）
// GAS列構成: A=BaseStyle, B=MatchType, C=Degree, D=TargetStyle, E=Reason, F=Advice
// =====================================================================
export interface MatchupMasterEntry {
  /** 自分の得意技スタイル（例: "出端技"） */
  baseStyle:   string;
  /** 'S' = 強い/得意, 'W' = 弱い/苦手 */
  matchType:   'S' | 'W' | string;
  /** 相性の強さ（1〜3）。3が最強の相性 */
  degree:      number;
  /** 相手の得意技スタイル（例: "払い技"） */
  targetStyle: string;
  /** 相性の理由テキスト */
  reason:      string;
  /** 対策・アドバイステキスト（タスクへワンタップ追加可能） */
  advice:      string;
}

// =====================================================================
// PeerStyleEntry ★ Phase10
// 他の剣友のスタイル把握用エントリ
// UserMaster + user_status を JOIN して GAS が返却する
// =====================================================================
export interface PeerStyleEntry {
  userId:            string;
  name:              string;
  /** 得意技ID（例: "T001"）。未設定の場合 undefined */
  favoriteTechnique?: string;
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
  /**
   * 他者から受けた評価ログ。★ Phase8 Step3-1
   * peer_evaluations シートの target_id === userId の行を
   * task_id → item_name に JOIN して返す。
   */
  peerLogs?:        PeerLogEntry[];
  /**
   * ★ Phase10: 剣風相性マスタ全件。
   * フロント側で自分の BaseStyle に合致する行をフィルタして表示する。
   */
  matchupMaster?:   MatchupMasterEntry[];
  /**
   * ★ Phase10: 自分以外の剣友のスタイル一覧。
   * targetStyle に該当する favoriteTechnique を持つ剣友を検索するために使用。
   */
  peersStyle?:      PeerStyleEntry[];
}

// =====================================================================
// PeerLogEntry ★ Phase8 Step3-1
// =====================================================================
export interface PeerLogEntry {
  date:      string;  // YYYY-MM-DD
  item_name: string;  // 課題テキスト（task_id → JOIN済み）
  score:     number;  // 1〜5（評価者がつけたスコア）
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
// ★ Phase9.5: title を削除
// =====================================================================
export interface SaveLogResponse {
  xp_earned:        number;
  total_xp:         number;
  level:            number;
  newAchievements?: Achievement[];
}

// =====================================================================
// updateTasks ペイロード ★ Phase4
// =====================================================================
export interface TaskDiff {
  id?:  string;
  text: string;
}

// =====================================================================
// 他者評価 ★ Phase7
// =====================================================================

export interface PeerEvalItem {
  taskId: string;
  score:  number;
}

export interface EvaluatePeerResponse {
  xp_granted:      number;
  evaluator_level: number;
  multiplier:      number;
  evaluated_tasks: string[];
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

export interface AchievementMasterEntry {
  id:             string;
  name:           string;
  conditionType:  string;
  conditionValue: number;
  description:    string;
  hint:           string;
  iconType:       string;
}

export interface Achievement {
  id:          string;
  name:        string;
  description: string;
  hint:        string;
  iconType:    string;
  isUnlocked:  boolean;
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
// 技の習熟度（Technique）★ Phase8 拡張
// =====================================================================

export interface Technique {
  id:           string;
  bodyPart:     string;
  actionType:   string;
  subCategory:  string;
  name:         string;
  points:       number;
  lastRating:   number;
  lastQuantity?: number;
  lastQuality?:  number;
  lastFeedback?: string;
}

export interface TechniqueUpdateResponse {
  id:           string;
  points:       number;
  earnedPoints: number;
  feedback:     string;
  total_xp:     number;
  level:        number;
  lastRating:   number;
}

// =====================================================================
// 二つ名（Epithet）システム ★ Phase9 刷新 / Phase9.1 description 追加
// =====================================================================

/**
 * EpithetMaster シートの1行
 *
 * DB_SCHEMA.md 列構成: A=ID, B=Category, C=TriggerValue, D=Name, E=Rarity, F=Description
 *
 * ★ Phase9:   rarity フィールドを追加。Rarity列（N/R/SR）をフロントが直接参照する
 *             「データ駆動型レア度判定」を採用（再デプロイ不要でスタイルが変わる）。
 * ★ Phase9.1: description フィールドを追加。二つ名の由来説明文。
 *             GAS が EpithetMaster を返す際に F列もフロントに渡すこと。
 *             旧マスタには存在しない場合があるため optional。
 */
export interface EpithetMasterEntry {
  id:           string;
  category:     string;
  triggerValue: string;
  name:         string;
  /**
   * ★ Phase9.1: 二つ名の由来説明文（例: "捨て身の技を好む剣士に与えられる称号"）。
   * GAS の EpithetMaster F列。旧マスタには存在しない場合があるため optional。
   * 空または undefined の場合、calcEpithet() が "まだ見ぬ剣の道を歩む者" にフォールバック。
   */
  description?: string;
  /**
   * ★ Phase9: レア度フラグ（EpithetMaster の E列）。
   *   N  → Normal   （墨黒 #2B2B2B）
   *   R  → Rare     （藍鉄色 #2C4F7C）
   *   SR → Super Rare（深紅 #8B2E2E + fontWeight:800 + letterSpacing:0.18em）
   */
  rarity?: 'N' | 'R' | 'SR';
}

export interface DashboardWithEpithet {
  epithetMaster?: EpithetMasterEntry[];
}

// =====================================================================
// ユーティリティ: 得意技IDから技名を解決する
// =====================================================================

export function resolveTechniqueName(
  id: string | undefined | null,
  master: TechniqueMasterEntry[] | undefined,
): string {
  if (!id) return '';
  if (!master || master.length === 0) return id;
  const found = master.find(m => m.id === id);
  return found ? found.name : id;
}
