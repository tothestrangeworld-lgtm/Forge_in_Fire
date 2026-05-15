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
//   - PeerStyleEntry 型を追加(他の剣友のスタイル把握用)
//   - DashboardData に matchupMaster?: MatchupMasterEntry[] を追加
//   - DashboardData に peersStyle?: PeerStyleEntry[] を追加
// ★ Phase11: 免許皆伝（Mastery）システム
//   - MasteryPhase 型を追加（'training' | 'discerning' | 'mastered'）
//   - MasteryStatus 型を追加（フロントエンド計算結果）
// ★ Phase-ex4: 剣風相性マッチングの「上位4スタイル」対応
//   - PeerStyleEntry に topStyles?: string[] を追加
//     （user_techniques から SubCategory 別ポイント上位4件を集計）
// ★ Phase12: PWAプッシュ通知基盤
//   - PushSubscriptionPayload / PushSubscriptionRecord 型を追加
//   - PushSendRequest / PushSendResponse 型を追加
// ★ Phase13: 被打分析機能（弱点の可視化）
//   - ReceivedReason 型（深刻度1〜5の悪癖カテゴリ）を追加
//   - ReceivedTechniqueSelection 型を追加（saveLog の receivedTechs ペイロード）
//   - ReceivedStatEntry / ReceivedStats 型を追加（getDashboard レスポンス集計用）
//   - SaveLogPayload に receivedTechs?: ReceivedTechniqueSelection[] を追加
//   - DashboardData に receivedStats?: ReceivedStats を追加
//   - 深刻度係数（SEVERITY_MULT）を export
// ★ Phase13.2: 技記録のスマート化（与打を saveLog に統合）
//   - GivenTechniqueSelection 型を追加（saveLog の givenTechs ペイロード）
//   - SaveLogPayload に givenTechs?: GivenTechniqueSelection[] を追加
//   - SaveLogResponse に xp_from_practice / xp_from_received / xp_from_given を追加
//   - Technique.lastFeedback / lastQuantity / lastQuality は四字熟語廃止のため
//     optional のまま残置（既存DBレコード互換）
//   - GivenStrikeQuality 型（1〜5）と QUALITY_LABELS マップを追加
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
// PeerStyleEntry ★ Phase10 / Phase-ex4 拡張
// 他の剣友のスタイル把握用エントリ
// UserMaster + user_status + user_techniques を JOIN して GAS が返却する
// =====================================================================
export interface PeerStyleEntry {
  userId:             string;
  name:               string;
  /** 得意技ID（例: "T001"）。未設定の場合 undefined */
  favoriteTechnique?: string;
  /**
   * ★ Phase-ex4: user_techniques の Points を SubCategory 別に集計し、
   * 上位最大4件の SubCategory 文字列を降順で格納。
   * 修練実績がない剣友は undefined または空配列。
   * 例: ['出端技', '払い技', '基本', '返し技']
   */
  topStyles?:         string[];
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
   * ★ Phase10 / Phase-ex4: 自分以外の剣友のスタイル一覧。
   * targetStyle に該当する topStyles を持つ剣友を検索するために使用。
   */
  peersStyle?:      PeerStyleEntry[];
  /**
   * ★ Phase13: 被打分析の集計結果。
   * received_technique_logs を技別・原因別に集計してフロントへ返す。
   * 深刻度係数を乗じた receivedPoints で弱点ヒートマップを描画する。
   */
  receivedStats?:   ReceivedStats;
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
  /**
   * ★ Phase13: その日の地稽古で「打たれた技」の記録。
   * 任意項目。1件につき正直記録ボーナス +5XP × quantity が付与される。
   */
  receivedTechs?: ReceivedTechniqueSelection[];
  /**
   * ★ Phase13.2: その日の地稽古で「磨きたい・実際に振った技」の記録。
   * 旧 updateTechniqueRating を統合。saveLog 内で量×質マトリックスから
   * earnedPoints を算出し、user_techniques を UPSERT、technique_logs に追記、
   * user_status / xp_history を一括更新する。
   */
  givenTechs?: GivenTechniqueSelection[];
}

// =====================================================================
// SaveLogResponse
// ★ Phase6: newAchievements フィールドを追加
// ★ Phase9.5: title を削除
// =====================================================================
export interface SaveLogResponse {
  xp_earned:        number;     // 全XP合算（課題 + 被打ボーナス + 与打）
  /** ★ Phase13.2: 内訳（任意） */
  xp_from_practice?: number;    // 課題評価分
  xp_from_received?: number;    // 正直記録ボーナス（被打）
  xp_from_given?:    number;    // 技の稽古分（与打）
  /** ★ Phase13.2: 与打の保存件数 */
  given_saved?:      number;
  received_saved?:   number;
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
  evaluator_xp?:   number;        // ★ Phase13.6: 見取り稽古ボーナス
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
// 免許皆伝（Mastery）システム ★ Phase11
// =====================================================================

/**
 * 課題の習熟ステータスフェーズ。
 *
 *  - training:    通常訓練中（安定率 < 80% など）
 *  - discerning:  「見極め」状態（安定率80%以上 + 直近5回中4回以上が★4-5）
 *  - mastered:    免許皆伝（見極め中に3連続★4-5を達成。永続）
 */
export type MasteryPhase = 'training' | 'discerning' | 'mastered';

/**
 * 課題の習熟ステータス。
 * フロントエンドが logs から動的計算する（DB保存なし）。
 */
export interface MasteryStatus {
  /** 直近10件の安定率（0〜100） */
  stability:         number;
  /** 直近10件のスコア配列（古→新） */
  recentScores:      number[];
  /** 現在のフェーズ */
  phase:             MasteryPhase;
  /** 「見極め」中の連続★4-5カウント（0〜MASTERY_REQUIRED_COUNT） */
  breakthroughCount: number;
  /** phase === 'mastered' の真偽値（便宜的なエイリアス） */
  isMastered:        boolean;
  /** 直近10件として参照できた評価数（10未満時の表示用） */
  evalCount:         number;
  /**
   * 最新側から遡って★4-5が連続している回数。
   * training 状態の COMBO! 演出に使用。
   */
  currentStreak:     number;
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
  /**
   * ★ Phase13.2: 四字熟語フィードバックは廃止。
   * 既存DBレコードとの互換のため optional フィールドは残置するが、
   * 新規記録では書き込まない。表示UI側でも非表示化する。
   */
  lastQuantity?: number;
  lastQuality?:  number;
  lastFeedback?: string;
}

/**
 * @deprecated ★ Phase13.2: updateTechniqueRating API は廃止。
 * 与打の記録は saveLog の givenTechs で送信し、SaveLogResponse を受け取る。
 * 型自体は段階的削除のために残置するが、新規実装では使用しないこと。
 */
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

// =====================================================================
// PWA Push通知システム ★ Phase12
// =====================================================================

/**
 * Web Push API 標準の PushSubscription を JSON 化した形（toJSON() の戻り値）。
 * フロントエンドの ServiceWorkerRegistration.pushManager.subscribe() で取得し、
 * /api/push/subscribe にこの形のまま POST する。
 */
export interface PushSubscriptionPayload {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth:   string;
  };
}

/**
 * /api/push/subscribe へ POST する際のリクエストボディ。
 * userId と subscription を一緒に送り、GAS の push_subscriptions シートへ
 * (user_id, subscription_json) として upsert する。
 */
export interface PushSubscribeRequest {
  userId:       string;
  subscription: PushSubscriptionPayload;
}

export interface PushSubscribeResponse {
  status:  'ok' | 'error';
  message?: string;
}

/**
 * push_subscriptions シートの1行を表すレコード。
 * GAS が getPushTargets() で返却する際の形式。
 *
 * DB列構成:
 *   A: user_id
 *   B: subscription_json（PushSubscriptionPayload を JSON.stringify したもの）
 */
export interface PushSubscriptionRecord {
  userId:       string;
  subscription: PushSubscriptionPayload;
}

/**
 * 通知の優先度カテゴリ。
 *  - decay_warning:   優先度1 - XP減衰警告（最終稽古日が2日前）
 *  - achievement:     優先度2 - 実績リーチ（streak_days 実績の解除条件 -1日）
 *  - peer_eval:       優先度3 - 他者評価サマリー（今日 peer_evaluations で評価された）
 */
export type PushNotificationCategory = 'decay_warning' | 'achievement' | 'peer_eval';

/**
 * 1ユーザーへの送信単位。GAS の毎日21時トリガーで判定後、
 * /api/push/send に targets[] としてまとめて POST する。
 */
export interface PushSendTarget {
  userId:       string;
  subscription: PushSubscriptionPayload;
  category:     PushNotificationCategory;
  title:        string;
  body:         string;
  /** クリック時に開かせたいパス（例: '/', '/record'） */
  url?:         string;
}

/**
 * /api/push/send への POSTボディ。
 * GAS ↔ Next.js 間は token ヘッダ or ボディ内の token で認証する。
 */
export interface PushSendRequest {
  /** 共有シークレット（環境変数 PUSH_INTERNAL_TOKEN と一致する必要あり） */
  token:   string;
  targets: PushSendTarget[];
}

export interface PushSendResultEntry {
  userId:    string;
  success:   boolean;
  /** 410/404 等で購読が無効化された場合 true（GAS 側で行削除すべき） */
  expired?:  boolean;
  message?:  string;
  status?:   number;
}

export interface PushSendResponse {
  status:    'ok' | 'error';
  total:     number;
  succeeded: number;
  failed:    number;
  results:   PushSendResultEntry[];
  message?:  string;
}

// =====================================================================
// 被打分析（Received Strikes）システム ★ Phase13
// =====================================================================

/**
 * 被打の原因（Reason）= 剣道における悪癖の深刻度。
 * 数値が大きいほど「より根深い／矯正困難な悪癖」を示す。
 *
 *  1: 攻め負け     - 相手の攻めに押されて打たれた（受動的）
 *  2: 単調         - 攻めが読まれて先を取られた（パターン化）
 *  3: 居着き       - 足が止まり反応できなかった
 *  4: 体勢崩れ     - 重心が崩れて隙を作った
 *  5: 手元上がり   - 手元が浮き、最も重大な悪癖（先生指摘最多）
 */
export type ReceivedReason = 1 | 2 | 3 | 4 | 5;

/**
 * 被打原因コード → ラベル名のマップ。
 * フロントエンドの選択UI・統計表示で使用する。
 */
export const RECEIVED_REASON_LABELS: Record<ReceivedReason, string> = {
  1: '攻め負け',
  2: '単調',
  3: '居着き',
  4: '体勢崩れ',
  5: '手元上がり',
};

/**
 * 深刻度係数（SEVERITY_MULT）。
 * 被打累計ポイント（receivedPoints）算出で各 quantity に乗算する倍率。
 * ARCHITECTURE.md の「質（Quality）」倍率と完全一致させる方針。
 *
 * receivedPoints = Σ(quantity × SEVERITY_MULT[reason])
 *
 * ⚠️ GAS Code.gs の SEVERITY_MULT と常に同期を保つこと。
 */
export const SEVERITY_MULT: Record<ReceivedReason, number> = {
  1: 1.0,
  2: 1.2,
  3: 1.5,
  4: 2.0,
  5: 3.0,
};

/**
 * saveLog の receivedTechs[] に渡す1件分の被打記録。
 *
 *  - techniqueId: technique_master の ID（例: "T001"）
 *  - quantity:    打たれた回数（1〜5）。正直記録ボーナス +5XP × quantity の対象。
 *  - reason:      被打原因コード（1〜5）。深刻度係数の指定にも使用。
 */
export interface ReceivedTechniqueSelection {
  techniqueId: string;
  quantity:    number;
  reason:      ReceivedReason;
}

/**
 * 被打統計の1技ぶんエントリ。getDashboard.receivedStats.byTechnique[] の要素。
 *
 *  - techniqueId / techniqueName: 技の識別と表示用
 *  - totalQuantity:               累計被打回数（quantity の単純合計）
 *  - receivedPoints:              深刻度係数を乗じた被打累計ポイント
 *                                 = Σ(quantity × SEVERITY_MULT[reason])
 *  - reasonBreakdown:             原因別の件数内訳（quantity 合計）
 */
export interface ReceivedStatEntry {
  techniqueId:     string;
  techniqueName:   string;
  bodyPart?:       string;
  subCategory?:    string;
  totalQuantity:   number;
  receivedPoints:  number;
  reasonBreakdown: Record<ReceivedReason, number>;
}

/**
 * 被打統計サマリー。getDashboard レスポンスの receivedStats に格納。
 * フロント側で弱点ヒートマップ・原因別Top3チャート等に利用する。
 */
export interface ReceivedStats {
  /** 全期間の被打総回数（quantity 合計） */
  totalReceived:   number;
  /** 全期間の被打累計ポイント（深刻度係数込み） */
  totalPoints:     number;
  /** 技別集計。受打ポイント降順でソート済み */
  byTechnique:     ReceivedStatEntry[];
  /** 原因別の被打回数内訳（quantity 合計） */
  byReason:        Record<ReceivedReason, number>;
}

// =====================================================================
// 与打入力（Given Strikes）★ Phase13.2
// 旧 updateTechniqueRating を saveLog に統合するためのペイロード型。
// =====================================================================

/**
 * 与打の質（Quality）= 打突の精度。
 *  1: 偶然   2: 強引   3: 確実   4: 会心   5: 無想
 */
export type GivenStrikeQuality = 1 | 2 | 3 | 4 | 5;

/**
 * 与打の質（Quality）→ ラベルマップ。
 * UI表示・選択肢生成で使用する（透明Selectハックの option text）。
 */
export const GIVEN_QUALITY_LABELS: Record<GivenStrikeQuality, string> = {
  1: '偶然 (意図せずまぐれで当たった)',
  2: '強引 (気剣体が不十分なまま当てた)',
  3: '確実 (狙い通りに基本の打突ができた)',
  4: '会心 (完璧な機会を捉えた一撃)',
  5: '無想 (無意識に体が動いた)',
};

/**
 * 被打の原因（Reason）→ フルテキスト・ラベルマップ。
 * 既存の RECEIVED_REASON_LABELS（短縮形）に対し、こちらは入力UIの
 * option text として使うフルテキスト版。
 */
export const RECEIVED_REASON_FULL_LABELS: Record<ReceivedReason, string> = {
  1: '攻め負け (相手に主導権を握られた)',
  2: '単調 (動きや技のパターンを読まれた)',
  3: '居着き (足が止まり反応が遅れた)',
  4: '体勢崩れ (打突後などの姿勢の乱れ)',
  5: '手元上がり (無意識に防御して隙を作った)',
};

/**
 * saveLog の givenTechs[] に渡す1件分の与打記録。
 *
 *  - techniqueId: technique_master の ID（例: "T001"）
 *  - quantity:    打った回数（1〜5）
 *  - quality:     打突の質（1〜5）
 */
export interface GivenTechniqueSelection {
  techniqueId: string;
  quantity:    number;          // 1〜5
  quality:     GivenStrikeQuality; // 1〜5
}
