// src/lib/api.ts
// =====================================================================
// 百錬自得 - Forged in Fire / Supabase API クライアント
// ★ Phase3 (DB Migration): GAS Proxy を全廃し Supabase SDK へ全面移行。
//   - gasGet / gasPost / parseGASResponse を削除。
//   - Export 関数名・シグネチャは互換維持（UIコンポーネント無改修で稼働）。
//   - XP / Level / Decay の算出を本レイヤーへ移譲（types のユーティリティを使用）。
//   - SWR キャッシュ戦略（Phase17）はそのまま継承。
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import useSWR, { mutate, type SWRConfiguration } from 'swr';
import type {
  Achievement,
  AchievementMasterEntry,
  DashboardData,
  DecayInfo,
  EpithetMasterEntry,
  EvaluatePeerResponse,
  LogEntry,
  MatchupMasterEntry,
  NextLevelInfo,
  PeerEvalItem,
  PeerLogEntry,
  PeerStyleEntry,
  ReceivedReason,
  ReceivedStatEntry,
  ReceivedStats,
  SaveLogPayload,
  SaveLogResponse,
  TaskDetails,
  TaskDiff,
  Technique,
  TechniqueMasterEntry,
  TitleMasterEntry,
  UserStatus,
  UserTask,
  XpHistoryEntry,
} from '@/types';
import {
  SEVERITY_MULT,
  calcLevelFromXp,
  calcNextLevel,
  getPeerMultiplier,
  titleForLevel,
} from '@/types';
import { logger } from '@/lib/logger';
import { getCurrentUserId } from '@/lib/auth';

// =====================================================================
// Supabase クライアント初期化
// =====================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  logger.error('api', 'Supabase 環境変数が未設定です', {
    detail: { url: !!SUPABASE_URL, key: !!SUPABASE_ANON_KEY },
  });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // 移行互換: 自前 user_master 認証を踏襲
    autoRefreshToken: false,
  },
});

// =====================================================================
// 内部ヘルパー: 認証ガード
// =====================================================================

/**
 * 現在のユーザーIDを取得。未認証なら AUTH_REQUIRED を投げる。
 * （GAS版 gasGet/gasPost のガード挙動を踏襲）
 */
function requireUserId(): string {
  const userId = getCurrentUserId();
  if (!userId) {
    logger.warn('api', 'AUTH_REQUIRED: requireUserId blocked');
    throw new Error('AUTH_REQUIRED');
  }
  return userId;
}

/**
 * Supabase の PostgrestError を共通フォーマットで throw する。
 */
function throwIfError(error: unknown, context: string): void {
  if (error) {
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
    logger.error('supabase', `DBエラー: ${context}`, { detail: { message } });
    throw new Error(`Supabase error (${context}): ${message}`);
  }
}

// =====================================================================
// XP 減衰ロジック（旧 GAS 移譲）
// =====================================================================
//
// 設計方針:
//   - 最終稽古日からの経過日数に応じて XP を減衰させる。
//   - 1日の猶予後、1日あたり basePenalty を減算（下限はレベル維持境界）。
//   - fetchDashboard 時に「表示用の減衰情報」を算出して返す。
//   - 実際の XP 控除（user_status への書き込み）は別途バッチ or saveLog 前に行う設計。
//     ここでは Read 時に「適用予定 / 経過日数」を計算して DecayInfo を返す。
// =====================================================================

const DECAY_GRACE_DAYS = 1;       // 猶予日数
const DECAY_PER_DAY = 10;         // 1日あたりの減衰XP

/**
 * 最終稽古日から本日までの経過日数を算出。
 */
function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const last = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = today.getTime() - last.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * DecayInfo を算出（表示用）。
 */
function calcDecayInfo(lastPracticeDate: string | null | undefined): DecayInfo {
  const days = daysSince(lastPracticeDate);
  const effectiveDays = Math.max(0, days - DECAY_GRACE_DAYS);
  const applied = effectiveDays * DECAY_PER_DAY;
  return {
    applied,
    days_absent: days,
    today_penalty: days > DECAY_GRACE_DAYS ? DECAY_PER_DAY : 0,
  };
}

// =====================================================================
// SWR 共通設定（★ Phase17 継承）
// =====================================================================

const baseSWRConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: true,
  keepPreviousData: true,
  errorRetryCount: 2,
  shouldRetryOnError: (err: Error) => err.message !== 'AUTH_REQUIRED',
};

// マスタ系（ほぼ不変）: 60分
const masterSWRConfig: SWRConfiguration = {
  ...baseSWRConfig,
  dedupingInterval: 60 * 60 * 1000,
};

// ユーザー個人系（ダッシュボード/技/実績）: 5分
const userSWRConfig: SWRConfiguration = {
  ...baseSWRConfig,
  dedupingInterval: 5 * 60 * 1000,
};

// 門下生一覧系: 10分
const rivalsSWRConfig: SWRConfiguration = {
  ...baseSWRConfig,
  dedupingInterval: 10 * 60 * 1000,
};

// =====================================================================
// mutate ヘルパー（Write 後の連動更新 / ★ Phase17 継承）
// =====================================================================

export async function mutateMyDashboard(): Promise<void> {
  await Promise.all([
    mutate(['dashboard']),
    mutate(['techniques']),
    mutate('achievements'),
    mutate('minigameStatus'),
  ]);
}

export async function mutateAfterPeerEval(targetId: string): Promise<void> {
  await Promise.all([
    mutate('rivals'),
    mutate(['rivalDashboard', targetId]),
    mutate(['dashboard']),
    mutate(['techniques']),
  ]);
}

export async function mutateAll(): Promise<void> {
  await mutate(() => true, undefined, { revalidate: false });
}

// =====================================================================
// 型補助（Supabase row → アプリ型 の中間表現）
// =====================================================================

interface UserStatusRow {
  user_id: string;
  total_xp: number;
  level: number;
  last_practice_date: string | null;
  real_rank: string | null;
  motto: string | null;
  favorite_technique: string | null;
}

interface UserTaskRow {
  id: string;
  user_id: string;
  task_text: string;
  status: string;
  created_at: string;
  updated_at: string;
  task_details: TaskDetails | null;
}

interface LogRow {
  date: string;
  task_id: string;
  score: number;
  xp_earned: number;
}

interface TechniqueMasterRow {
  id: string;
  body_part: string;
  action_type: string;
  sub_category: string;
  name: string;
}

interface UserTechniqueRow {
  technique_id: string;
  points: number;
  last_rating: number;
  last_quantity: number | null;
  last_quality: number | null;
  last_feedback: string | null;
}

// =====================================================================
// マスタ取得（共通・低レベル）
// =====================================================================

/**
 * technique_master 全件を取得し、アプリ型へマッピング。
 */
async function loadTechniqueMaster(): Promise<TechniqueMasterEntry[]> {
  const { data, error } = await supabase
    .from('technique_master')
    .select('id, body_part, action_type, sub_category, name')
    .order('id', { ascending: true });
  throwIfError(error, 'loadTechniqueMaster');

  return ((data ?? []) as TechniqueMasterRow[]).map((r) => ({
    id: r.id,
    bodyPart: r.body_part,
    actionType: r.action_type,
    subCategory: r.sub_category,
    name: r.name,
  }));
}

/**
 * title_master 全件を取得。
 */
async function loadTitleMaster(): Promise<TitleMasterEntry[]> {
  const { data, error } = await supabase
    .from('title_master')
    .select('level, title')
    .order('level', { ascending: true });
  throwIfError(error, 'loadTitleMaster');

  return ((data ?? []) as Array<{ level: number; title: string }>).map((r) => ({
    level: r.level,
    title: r.title,
  }));
}

/**
 * epithet_master 全件を取得。
 */
async function loadEpithetMaster(): Promise<EpithetMasterEntry[]> {
  const { data, error } = await supabase
    .from('epithet_master')
    .select('id, category, trigger_value, name, rarity, description')
    .order('id', { ascending: true });
  throwIfError(error, 'loadEpithetMaster');

  return (
    (data ?? []) as Array<{
      id: string;
      category: string;
      trigger_value: string;
      name: string;
      rarity: 'N' | 'R' | 'SR' | null;
      description: string | null;
    }>
  ).map((r) => ({
    id: r.id,
    category: r.category,
    triggerValue: r.trigger_value,
    name: r.name,
    rarity: r.rarity ?? undefined,
    description: r.description ?? undefined,
  }));
}

/**
 * matchup_master 全件を取得。
 */
async function loadMatchupMaster(): Promise<MatchupMasterEntry[]> {
  const { data, error } = await supabase
    .from('matchup_master')
    .select('base_style, match_type, degree, target_style, reason, advice');
  throwIfError(error, 'loadMatchupMaster');

  return (
    (data ?? []) as Array<{
      base_style: string;
      match_type: string;
      degree: number;
      target_style: string;
      reason: string;
      advice: string;
    }>
  ).map((r) => ({
    baseStyle: r.base_style,
    matchType: r.match_type,
    degree: r.degree,
    targetStyle: r.target_style,
    reason: r.reason,
    advice: r.advice,
  }));
}

// =====================================================================
// 被打統計の集計（received_technique_logs → ReceivedStats）
// =====================================================================

interface ReceivedLogRow {
  technique_id: string;
  quantity: number;
  reason: number;
  is_match: boolean | null;
}

/**
 * received_technique_logs を集計し ReceivedStats を構築する。
 * receivedPoints = Σ(quantity × SEVERITY_MULT[reason] × (isMatch ? 10 : 1))
 */
async function buildReceivedStats(
  userId: string,
  techMaster: TechniqueMasterEntry[],
): Promise<ReceivedStats> {
  const { data, error } = await supabase
    .from('received_technique_logs')
    .select('technique_id, quantity, reason, is_match')
    .eq('user_id', userId);
  throwIfError(error, 'buildReceivedStats');

  const rows = (data ?? []) as ReceivedLogRow[];

  const masterMap = new Map(techMaster.map((m) => [m.id, m]));
  const perTech = new Map<string, ReceivedStatEntry>();
  const byReason: Record<ReceivedReason, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalReceived = 0;
  let totalPoints = 0;

  for (const row of rows) {
    const reason = (row.reason as ReceivedReason) ?? 1;
    const qty = row.quantity ?? 0;
    const leverage = row.is_match ? 10 : 1;
    const points = qty * (SEVERITY_MULT[reason] ?? 1) * leverage;

    totalReceived += qty;
    totalPoints += points;
    byReason[reason] = (byReason[reason] ?? 0) + qty;

    let entry = perTech.get(row.technique_id);
    if (!entry) {
      const m = masterMap.get(row.technique_id);
      entry = {
        techniqueId: row.technique_id,
        techniqueName: m?.name ?? row.technique_id,
        bodyPart: m?.bodyPart,
        subCategory: m?.subCategory,
        totalQuantity: 0,
        receivedPoints: 0,
        reasonBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
      perTech.set(row.technique_id, entry);
    }
    entry.totalQuantity += qty;
    entry.receivedPoints += points;
    entry.reasonBreakdown[reason] = (entry.reasonBreakdown[reason] ?? 0) + qty;
  }

  const byTechnique = Array.from(perTech.values()).sort(
    (a, b) => b.receivedPoints - a.receivedPoints,
  );

  return {
    totalReceived,
    totalPoints,
    byTechnique,
    byReason,
  };
}

// =====================================================================
// 門下生スタイル一覧の構築（peersStyle）
// =====================================================================

/**
 * 自分以外の全ユーザーについて、user_techniques の Points を
 * SubCategory 別に集計し、上位4 SubCategory を topStyles として返す。
 */
async function buildPeersStyle(
  selfUserId: string,
  techMaster: TechniqueMasterEntry[],
): Promise<PeerStyleEntry[]> {
  // 全ユーザー基本情報（users テーブル / id カラム）
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, name')
    .neq('id', selfUserId);
  throwIfError(uErr, 'buildPeersStyle:users');

  // 全 user_status（得意技参照用）
  const { data: statuses, error: sErr } = await supabase
    .from('user_status')
    .select('user_id, favorite_technique');
  throwIfError(sErr, 'buildPeersStyle:status');

  // 全 user_techniques（SubCategory 集計用）
  const { data: techs, error: tErr } = await supabase
    .from('user_techniques')
    .select('user_id, technique_id, points');
  throwIfError(tErr, 'buildPeersStyle:techniques');

  const favMap = new Map(
    ((statuses ?? []) as Array<{ user_id: string; favorite_technique: string | null }>).map(
      (s) => [s.user_id, s.favorite_technique],
    ),
  );
  const subCatMap = new Map(techMaster.map((m) => [m.id, m.subCategory]));

  // user_id → (subCategory → pointsSum)
  const agg = new Map<string, Map<string, number>>();
  for (const row of (techs ?? []) as Array<{
    user_id: string;
    technique_id: string;
    points: number;
  }>) {
    const sub = subCatMap.get(row.technique_id);
    if (!sub) continue;
    let inner = agg.get(row.user_id);
    if (!inner) {
      inner = new Map();
      agg.set(row.user_id, inner);
    }
    inner.set(sub, (inner.get(sub) ?? 0) + (row.points ?? 0));
  }

  return ((users ?? []) as Array<{ id: string; name: string }>).map((u) => {
    const inner = agg.get(u.id);
    const topStyles = inner
      ? Array.from(inner.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([sub]) => sub)
      : [];
    return {
      userId: u.id,
      name: u.name,
      favoriteTechnique: favMap.get(u.id) ?? undefined,
      topStyles,
    };
  });
}

// =====================================================================
// 他者評価ログの構築（peerLogs）
// =====================================================================

async function buildPeerLogs(
  targetUserId: string,
  taskTextMap: Map<string, string>,
): Promise<PeerLogEntry[]> {
  const { data, error } = await supabase
    .from('peer_evaluations')
    .select('date, task_id, score')
    .eq('target_id', targetUserId)
    .order('date', { ascending: false })
    .limit(90);
  throwIfError(error, 'buildPeerLogs');

  return ((data ?? []) as Array<{ date: string; task_id: string; score: number }>).map(
    (r) => ({
      date: r.date,
      task_id: r.task_id,
      item_name: taskTextMap.get(r.task_id) ?? r.task_id,
      score: r.score,
    }),
  );
}

// =====================================================================
// ダッシュボード（中核 Read）
// =====================================================================

/**
 * 指定ユーザー（省略時は自分）の DashboardData を組み立てて返す。
 * 複数テーブルを Promise.all で並列フェッチし、types/index.ts が期待する
 * 構造へ完全マッピングする。
 */
export async function fetchDashboard(targetUserId?: string): Promise<DashboardData> {
  const userId = targetUserId ?? requireUserId();
  logger.info('api', `getDashboard: user=${userId}`);

  // ---- 並列フェッチ ----
  const [
    statusRes,
    tasksRes,
    logsRes,
    xpHistoryRes,
    techMaster,
    titleMaster,
    epithetMaster,
    matchupMaster,
  ] = await Promise.all([
    supabase
      .from('user_status')
      .select(
        'user_id, total_xp, level, last_practice_date, real_rank, motto, favorite_technique',
      )
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_tasks')
      .select('id, user_id, task_text, status, created_at, updated_at, task_details')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('logs')
      .select('date, task_id, score, xp_earned')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(200),
    supabase
      .from('xp_history')
      .select('date, type, amount, reason, total_xp_after, level')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(90),
    loadTechniqueMaster(),
    loadTitleMaster(),
    loadEpithetMaster(),
    loadMatchupMaster(),
  ]);

  throwIfError(statusRes.error, 'fetchDashboard:status');
  throwIfError(tasksRes.error, 'fetchDashboard:tasks');
  throwIfError(logsRes.error, 'fetchDashboard:logs');
  throwIfError(xpHistoryRes.error, 'fetchDashboard:xpHistory');

  // ---- user_status マッピング（行が無ければ初期値で生成）----
  const statusRow = statusRes.data as UserStatusRow | null;
  const totalXp = statusRow?.total_xp ?? 0;
  const level = statusRow?.level ?? calcLevelFromXp(totalXp);

  const status: UserStatus = {
    total_xp: totalXp,
    level,
    last_practice_date: statusRow?.last_practice_date ?? null,
    real_rank: statusRow?.real_rank ?? undefined,
    motto: statusRow?.motto ?? undefined,
    favorite_technique: statusRow?.favorite_technique ?? undefined,
  };

  // ---- user_tasks マッピング ----
  const taskRows = (tasksRes.data ?? []) as UserTaskRow[];
  const tasks: UserTask[] = taskRows.map((r) => ({
    id: r.id,
    task_text: r.task_text,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    details: r.task_details ?? undefined,
  }));

  // task_id → task_text の解決マップ（logs / peerLogs の JOIN 用）
  const taskTextMap = new Map(taskRows.map((r) => [r.id, r.task_text]));

  // ---- logs マッピング（task_id → item_name JOIN）----
  // ★ task_id を一意キーとして保持。item_name は UI 表示用の補助情報に留める。
  const logRows = (logsRes.data ?? []) as LogRow[];
  const logs: LogEntry[] = logRows.map((r) => ({
    date: r.date,
    task_id: r.task_id,
    item_name: taskTextMap.get(r.task_id) ?? r.task_id,
    score: r.score,
    xp_earned: r.xp_earned,
  }));

  // ---- xp_history マッピング ----
  const xpHistory: XpHistoryEntry[] = (
    (xpHistoryRes.data ?? []) as Array<{
      date: string;
      type: string;
      amount: number;
      reason: string;
      total_xp_after: number;
      level: number;
    }>
  ).map((r) => ({
    date: r.date,
    type: r.type,
    amount: r.amount,
    reason: r.reason,
    total_xp_after: r.total_xp_after,
    level: r.level,
  }));

  // ---- 次レベル情報（types ユーティリティで算出）----
  const next = calcNextLevel(totalXp, titleMaster);
  const nextLevelXp: NextLevelInfo = {
    required: next ? next.xp - totalXp : null,
    title: next ? next.title : titleForLevel(level, titleMaster),
  };

  // ---- 減衰情報 ----
  const decay = calcDecayInfo(status.last_practice_date);

  // ---- 派生データ（被打統計・門下生スタイル・他者評価ログ）----
  const [receivedStats, peersStyle, peerLogs] = await Promise.all([
    buildReceivedStats(userId, techMaster),
    buildPeersStyle(userId, techMaster),
    buildPeerLogs(userId, taskTextMap),
  ]);

  return {
    status,
    tasks,
    logs,
    nextLevelXp,
    decay,
    titleMaster,
    epithetMaster,
    xpHistory,
    techniqueMaster: techMaster,
    peerLogs,
    matchupMaster,
    peersStyle,
    receivedStats,
  };
}

// ---- useDashboardSWR の戻り値型 ----
export interface DashboardSWRData {
  dashboard: DashboardData;
  techniques: Technique[];
}

/**
 * ホーム画面用 SWR フック。
 * ダッシュボードと技一覧を並列取得し { dashboard, techniques } で返す。
 */
export function useDashboardSWR(targetUserId?: string) {
  const key = targetUserId ? ['dashboard', targetUserId] : ['dashboard'];

  return useSWR<DashboardSWRData, Error>(
    key,
    async () => {
      const [dashboard, techniques] = await Promise.all([
        fetchDashboard(targetUserId),
        fetchTechniques(targetUserId),
      ]);
      return { dashboard, techniques };
    },
    userSWRConfig,
  );
}

// =====================================================================
// 技の習熟度（TechniqueMastery）Read
// =====================================================================

/**
 * 指定ユーザーの技習熟度一覧を取得。
 * technique_master を左基準に user_techniques を LEFT JOIN した形で返す。
 */
export async function fetchTechniques(targetUserId?: string): Promise<Technique[]> {
  const userId = targetUserId ?? requireUserId();

  const [techMaster, userTechRes] = await Promise.all([
    loadTechniqueMaster(),
    supabase
      .from('user_techniques')
      .select(
        'technique_id, points, last_rating, last_quantity, last_quality, last_feedback',
      )
      .eq('user_id', userId),
  ]);

  throwIfError(userTechRes.error, 'fetchTechniques');

  const userTechMap = new Map(
    ((userTechRes.data ?? []) as UserTechniqueRow[]).map((r) => [r.technique_id, r]),
  );

  return techMaster.map((m) => {
    const ut = userTechMap.get(m.id);
    return {
      id: m.id,
      bodyPart: m.bodyPart,
      actionType: m.actionType,
      subCategory: m.subCategory,
      name: m.name,
      points: ut?.points ?? 0,
      lastRating: ut?.last_rating ?? 0,
      lastQuantity: ut?.last_quantity ?? undefined,
      lastQuality: ut?.last_quality ?? undefined,
      lastFeedback: ut?.last_feedback ?? undefined,
    };
  });
}

/**
 * 技の習熟度一覧を SWR でキャッシュ付きフェッチする。
 */
export function useTechniquesSWR(targetUserId?: string) {
  const key = targetUserId ? ['techniques', targetUserId] : ['techniques'];

  return useSWR<Technique[], Error>(
    key,
    () => fetchTechniques(targetUserId),
    userSWRConfig,
  );
}

// =====================================================================
// 門下生（ライバル）一覧 Read
// =====================================================================

// ---- GAS互換の門下生型（シグネチャ維持）----
export interface RivalUser {
  user_id: string;
  name: string;
  role: string;
  level?: number;
  masteryStats?: { '面': number; '小手': number; '胴': number; '突き': number };
}

/**
 * 全ユーザー一覧を取得。
 * users + user_status + user_techniques を集計し、
 * level と masteryStats（部位別ポイント）を必ず付与して返す。
 */
export async function fetchUsers(): Promise<RivalUser[]> {
  const [usersRes, statusRes, techMaster, userTechRes] = await Promise.all([
    supabase.from('users').select('id, name, role'),
    supabase.from('user_status').select('user_id, total_xp, level'),
    loadTechniqueMaster(),
    supabase.from('user_techniques').select('user_id, technique_id, points'),
  ]);

  throwIfError(usersRes.error, 'fetchUsers:users');
  throwIfError(statusRes.error, 'fetchUsers:status');
  throwIfError(userTechRes.error, 'fetchUsers:techniques');

  const statusMap = new Map(
    ((statusRes.data ?? []) as Array<{
      user_id: string;
      total_xp: number;
      level: number;
    }>).map((s) => [s.user_id, s]),
  );

  // technique_id → bodyPart 解決
  const bodyPartMap = new Map(techMaster.map((m) => [m.id, m.bodyPart]));

  // user_id → masteryStats 集計
  const masteryAgg = new Map<
    string,
    { '面': number; '小手': number; '胴': number; '突き': number }
  >();
  for (const row of (userTechRes.data ?? []) as Array<{
    user_id: string;
    technique_id: string;
    points: number;
  }>) {
    const part = bodyPartMap.get(row.technique_id);
    if (part !== '面' && part !== '小手' && part !== '胴' && part !== '突き') continue;
    let stats = masteryAgg.get(row.user_id);
    if (!stats) {
      stats = { '面': 0, '小手': 0, '胴': 0, '突き': 0 };
      masteryAgg.set(row.user_id, stats);
    }
    stats[part] += row.points ?? 0;
  }

  return ((usersRes.data ?? []) as Array<{
    id: string;
    name: string;
    role: string;
  }>).map((u) => {
    const st = statusMap.get(u.id);
    const level = st?.level ?? calcLevelFromXp(st?.total_xp ?? 0);
    const masteryStats =
      masteryAgg.get(u.id) ?? { '面': 0, '小手': 0, '胴': 0, '突き': 0 };
    return {
      user_id: u.id,
      name: u.name,
      role: u.role,
      level,
      masteryStats,
    };
  });
}

/**
 * 門下生一覧画面用 SWR フック。
 */
export function useRivalsSWR() {
  return useSWR<RivalUser[], Error>('rivals', () => fetchUsers(), rivalsSWRConfig);
}

// ---- useRivalDashboardSWR の戻り値型 ----
export interface RivalDashboardSWRData {
  dashboard: DashboardData;
  techniques: Technique[];
  targetName: string;
  initialEvaluatedTaskIds: string[];
}

/**
 * 門下生詳細画面用 SWR フック。
 */
export function useRivalDashboardSWR(targetId: string | null) {
  return useSWR<RivalDashboardSWRData, Error>(
    targetId ? ['rivalDashboard', targetId] : null,
    async ([, uid]: [string, string]) => {
      const [dashboard, techniques, users, todayEval] = await Promise.all([
        fetchDashboard(uid),
        fetchTechniques(uid),
        fetchUsers(),
        fetchTodayEvaluations(uid),
      ]);
      const targetName = users.find((u) => u.user_id === uid)?.name ?? uid;
      return {
        dashboard,
        techniques,
        targetName,
        initialEvaluatedTaskIds: todayEval.evaluated_task_ids,
      };
    },
    rivalsSWRConfig,
  );
}

// =====================================================================
// 他者評価ログ Read（今日の評価済み課題）
// =====================================================================

/**
 * 今日、自分が指定ユーザーを評価済みの task_id 一覧を取得する。
 */
export async function fetchTodayEvaluations(
  targetId: string,
): Promise<{ evaluated_task_ids: string[] }> {
  const evaluatorId = requireUserId();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(today.getDate()).padStart(2, '0')}`;

  logger.info('api', `getTodayEvaluations: target=${targetId}`);

  const { data, error } = await supabase
    .from('peer_evaluations')
    .select('task_id')
    .eq('evaluator_id', evaluatorId)
    .eq('target_id', targetId)
    .eq('date', todayStr);
  throwIfError(error, 'fetchTodayEvaluations');

  return {
    evaluated_task_ids: ((data ?? []) as Array<{ task_id: string }>).map(
      (r) => r.task_id,
    ),
  };
}

// =====================================================================
// マスタ（共通）Read
// =====================================================================

/**
 * 二つ名マスタを取得。
 */
export async function fetchEpithetMaster(): Promise<EpithetMasterEntry[]> {
  return loadEpithetMaster();
}

/**
 * 二つ名マスタの SWR フック（60分キャッシュ）。
 */
export function useEpithetMasterSWR() {
  return useSWR<EpithetMasterEntry[], Error>(
    'epithetMaster',
    () => fetchEpithetMaster(),
    masterSWRConfig,
  );
}

/**
 * technique_master を取得（互換維持: 旧実装は dashboard 経由だった）。
 */
export async function fetchTechniqueMaster(): Promise<TechniqueMasterEntry[]> {
  logger.info('api', 'techniqueMaster 取得');
  return loadTechniqueMaster();
}

// =====================================================================
// アチーブメント（実績バッジ）Read
// =====================================================================

interface AchievementMasterRow {
  id: string;
  name: string;
  condition_type: string;
  condition_value: number;
  description: string;
  hint: string;
  icon_type: string;
}

/**
 * 指定ユーザーの実績一覧を取得。
 * achievement_master を全件取得し、user_achievements の解除状況を JOIN する。
 */
export async function fetchAchievements(
  targetUserId?: string,
): Promise<Achievement[]> {
  const userId = targetUserId ?? requireUserId();
  logger.info('api', 'アチーブメント取得');

  const [masterRes, unlockedRes] = await Promise.all([
    supabase
      .from('achievement_master')
      .select(
        'id, name, condition_type, condition_value, description, hint, icon_type',
      )
      .order('id', { ascending: true }),
    supabase
      .from('user_achievements')
      .select('achievement_id, unlocked_at')
      .eq('user_id', userId),
  ]);

  throwIfError(masterRes.error, 'fetchAchievements:master');
  throwIfError(unlockedRes.error, 'fetchAchievements:unlocked');

  const unlockedMap = new Map(
    ((unlockedRes.data ?? []) as Array<{
      achievement_id: string;
      unlocked_at: string | null;
    }>).map((r) => [r.achievement_id, r.unlocked_at]),
  );

  return ((masterRes.data ?? []) as AchievementMasterRow[]).map((m) => {
    const unlockedAt = unlockedMap.get(m.id) ?? null;
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      hint: m.hint,
      iconType: m.icon_type,
      isUnlocked: unlockedMap.has(m.id),
      unlockedAt,
    };
  });
}

/**
 * アチーブメントの SWR フック（5分キャッシュ）。
 */
export function useAchievementsSWR(targetUserId?: string) {
  const key = targetUserId ? ['achievements', targetUserId] : 'achievements';
  return useSWR<Achievement[], Error>(
    key,
    () => fetchAchievements(targetUserId),
    userSWRConfig,
  );
}

// =====================================================================
// ↓↓↓ Write 系（saveLog / evaluatePeer / updateTasks / 認証 /
//     プロフィール / リセット / ミニゲーム）は【第2部】で出力します。
// =====================================================================
// =====================================================================
// ↓↓↓ ここから【第2部】Write 系
//     XP / Level 計算を本レイヤーに内包し、Supabase へ永続化する。
// =====================================================================

// =====================================================================
// 内部ヘルパー: 日付・XP永続化
// =====================================================================

/**
 * 本日の日付を YYYY-MM-DD 形式（ローカル）で返す。
 */
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * 本日（実行環境のローカルタイムゾーン）の開始・終了時刻を ISO 文字列で返す。
 * TIMESTAMPTZ カラム（created_at 等）の日付境界クエリに使用する。
 *   start = 本日 00:00:00.000（ローカル）
 *   end   = 本日 23:59:59.999（ローカル）
 */
function getTodayRangeISO(): { startOfDay: string; endOfDay: string } {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  return { startOfDay: start.toISOString(), endOfDay: end.toISOString() };
}

/**
 * 現在の user_status を取得（無ければ初期値）。
 * XP 加算の起点として使用する。
 */
async function loadUserStatusRow(userId: string): Promise<UserStatusRow> {
  const { data, error } = await supabase
    .from('user_status')
    .select(
      'user_id, total_xp, level, last_practice_date, real_rank, motto, favorite_technique',
    )
    .eq('user_id', userId)
    .maybeSingle();
  throwIfError(error, 'loadUserStatusRow');

  const row = data as UserStatusRow | null;
  return (
    row ?? {
      user_id: userId,
      total_xp: 0,
      level: 1,
      last_practice_date: null,
      real_rank: null,
      motto: null,
      favorite_technique: null,
    }
  );
}

/**
 * XP を加算し user_status を更新、xp_history に1行追記する共通処理。
 *
 * @returns 更新後の { total_xp, level }
 */
async function applyXpGain(params: {
  userId: string;
  deltaXp: number;
  type: XpHistoryEntry['type'];
  reason: string;
  touchPracticeDate?: boolean; // true なら last_practice_date を本日に更新
}): Promise<{ total_xp: number; level: number }> {
  const { userId, deltaXp, type, reason, touchPracticeDate } = params;

  const current = await loadUserStatusRow(userId);
  const nextTotalXp = Math.max(0, (current.total_xp ?? 0) + deltaXp);
  const nextLevel = calcLevelFromXp(nextTotalXp);
  const date = todayString();

  // ---- user_status を UPSERT ----
  const upsertPayload: Record<string, unknown> = {
    user_id: userId,
    total_xp: nextTotalXp,
    level: nextLevel,
  };
  if (touchPracticeDate) {
    upsertPayload.last_practice_date = date;
  }

  const { error: upErr } = await supabase
    .from('user_status')
    .upsert(upsertPayload, { onConflict: 'user_id' });
  throwIfError(upErr, 'applyXpGain:upsertStatus');

  // ---- xp_history に追記 ----
  const { error: histErr } = await supabase.from('xp_history').insert({
    user_id: userId,
    date,
    type,
    amount: deltaXp,
    reason,
    total_xp_after: nextTotalXp,
    level: nextLevel,
  });
  throwIfError(histErr, 'applyXpGain:insertHistory');

  return { total_xp: nextTotalXp, level: nextLevel };
}

// =====================================================================
// 認証（user_master 照合）
// =====================================================================

export interface LoginPayload {
  user_id?: string;
  name?: string;
  password: string;
}
export interface LoginResponse {
  user_id: string;
  name: string;
  role: string;
}

/**
 * ログイン認証。
 * id もしくは name + passcode で users テーブルを照合する。
 *
 * ⚠️ パスコードは移行互換のため平文比較（旧GAS仕様踏襲）。
 *    本番運用では Supabase Auth もしくは pgcrypto への移行を強く推奨。
 */
export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  logger.info('api', `ログイン試行: id=${payload.user_id ?? ''} name=${payload.name ?? ''}`);

  let query = supabase
    .from('users')
    .select('id, name, role, passcode')
    .limit(1);

  if (payload.user_id) {
    query = query.eq('id', payload.user_id);
  } else if (payload.name) {
    query = query.eq('name', payload.name);
  } else {
    throw new Error('AUTH_INVALID: user_id または name が必要です');
  }

  const { data, error } = await query.maybeSingle();
  throwIfError(error, 'loginUser');

  const row = data as
    | { id: string; name: string; role: string; passcode: string }
    | null;

  if (!row || row.passcode !== payload.password) {
    logger.warn('api', 'ログイン失敗: 認証情報不一致');
    throw new Error('AUTH_FAILED: 識別子またはパスワードが一致しません');
  }

  return { user_id: row.id, name: row.name, role: row.role };
}

// ★ 新規アカウント作成
export interface RegisterPayload {
  name: string;
  password: string;
}
export interface RegisterResponse {
  user_id: string;
  name: string;
  role: string;
}

/**
 * 新規アカウントを作成する。
 * users に1行 INSERT し、対応する user_status の初期行も生成する。
 */
export async function registerUser(
  params: RegisterPayload,
): Promise<RegisterResponse> {
  logger.info('api', `新規登録送信: name=${params.name}`);

  // ---- 名前の重複チェック ----
  const { data: dup, error: dupErr } = await supabase
    .from('users')
    .select('id')
    .eq('name', params.name)
    .maybeSingle();
  throwIfError(dupErr, 'registerUser:dupCheck');
  if (dup) {
    throw new Error('REGISTER_DUPLICATE: 同名の剣士が既に存在します');
  }

  // ---- id 採番（UUID）----
  const newUserId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `U${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const role = 'user';

  // ---- users へ INSERT ----
  const { error: insErr } = await supabase.from('users').insert({
    id: newUserId,
    name: params.name,
    passcode: params.password,
    role,
  });
  throwIfError(insErr, 'registerUser:insertUsers');

  // ---- user_status の初期行を生成 ----
  const { error: stErr } = await supabase.from('user_status').insert({
    user_id: newUserId,
    total_xp: 0,
    level: 1,
    last_practice_date: null,
    favorite_technique: null,
  });
  throwIfError(stErr, 'registerUser:insertStatus');

  // ★ 門下生一覧に新規ユーザーが追加されるためフロントキャッシュをパージ
  await mutate('rivals');

  return { user_id: newUserId, name: params.name, role };
}

// =====================================================================
// プロフィール更新
// =====================================================================

export async function updateProfile(data: {
  real_rank?: string;
  motto?: string;
  favorite_technique?: string;
}): Promise<{ updated: boolean }> {
  const userId = requireUserId();

  const patch: Record<string, unknown> = { user_id: userId };
  if (data.real_rank !== undefined) patch.real_rank = data.real_rank;
  if (data.motto !== undefined) patch.motto = data.motto;
  if (data.favorite_technique !== undefined)
    patch.favorite_technique = data.favorite_technique;

  const { error } = await supabase
    .from('user_status')
    .upsert(patch, { onConflict: 'user_id' });
  throwIfError(error, 'updateProfile');

  // ★ プロフィール変更後にキャッシュを無効化
  await mutateMyDashboard();
  await mutate('rivals');
  return { updated: true };
}

// =====================================================================
// ステータスリセット
// =====================================================================

/**
 * 自分の XP / レベルを初期化する。
 * user_status を 0 / Lv1 に戻し、xp_history に reset イベントを残す。
 */
export async function resetStatus(): Promise<{
  total_xp: number;
  level: number;
  title: string;
}> {
  const userId = requireUserId();

  const current = await loadUserStatusRow(userId);
  const date = todayString();

  const { error: upErr } = await supabase
    .from('user_status')
    .upsert(
      { user_id: userId, total_xp: 0, level: 1 },
      { onConflict: 'user_id' },
    );
  throwIfError(upErr, 'resetStatus:upsert');

  const { error: histErr } = await supabase.from('xp_history').insert({
    user_id: userId,
    date,
    type: 'reset',
    amount: -(current.total_xp ?? 0),
    reason: '修行のやり直し（ステータス初期化）',
    total_xp_after: 0,
    level: 1,
  });
  throwIfError(histErr, 'resetStatus:insertHistory');

  // 称号は title_master を参照して導出
  const titleMaster = await loadTitleMaster();
  const title = titleForLevel(1, titleMaster);

  // ★ リセット後にキャッシュを無効化
  await mutateMyDashboard();
  await mutate('rivals');

  return { total_xp: 0, level: 1, title };
}

// =====================================================================
// 評価項目（user_tasks）一括更新
// =====================================================================

/**
 * 評価項目を一括保存する。
 *
 * TaskDiff[] の各要素について:
 *   - id 有り  → 既存タスクを UPDATE（task_text / task_details）
 *   - id 無し  → 新規 INSERT（status='active'）
 * 送信されなかった既存 active タスクは archived へ退避する。
 *
 * @returns { active_count } 更新後の active なタスク件数
 */
export async function updateTasks(
  tasks: TaskDiff[],
): Promise<{ active_count: number }> {
  const userId = requireUserId();
  logger.info('api', '評価項目をまとめて更新', { detail: { count: tasks.length } });

  const now = new Date().toISOString();

  // ---- 既存タスクを取得（差分アーカイブ判定用）----
  const { data: existingRows, error: exErr } = await supabase
    .from('user_tasks')
    .select('id, status')
    .eq('user_id', userId);
  throwIfError(exErr, 'updateTasks:fetchExisting');

  const existingIds = new Set(
    ((existingRows ?? []) as Array<{ id: string; status: string }>)
      .filter((r) => r.status === 'active')
      .map((r) => r.id),
  );

  const keepIds = new Set<string>();

  // ---- 各 TaskDiff を UPSERT ----
  for (const t of tasks) {
    if (t.id) {
      keepIds.add(t.id);
      const { error: upErr } = await supabase
        .from('user_tasks')
        .update({
          task_text: t.text,
          task_details: t.details ?? null,
          status: 'active',
          updated_at: now,
        })
        .eq('id', t.id)
        .eq('user_id', userId);
      throwIfError(upErr, 'updateTasks:update');
    } else {
      const newId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
      keepIds.add(newId);
      const { error: insErr } = await supabase.from('user_tasks').insert({
        id: newId,
        user_id: userId,
        task_text: t.text,
        task_details: t.details ?? null,
        status: 'active',
        created_at: now,
        updated_at: now,
      });
      throwIfError(insErr, 'updateTasks:insert');
    }
  }

  // ---- 送信されなかった既存 active を archived へ ----
  const toArchive = Array.from(existingIds).filter((id) => !keepIds.has(id));
  if (toArchive.length > 0) {
    const { error: arcErr } = await supabase
      .from('user_tasks')
      .update({ status: 'archived', updated_at: now })
      .eq('user_id', userId)
      .in('id', toArchive);
    throwIfError(arcErr, 'updateTasks:archive');
  }

  // ★ tasks 変動でダッシュボードも変わる
  await mutateMyDashboard();

  return { active_count: keepIds.size };
}

// =====================================================================
// 稽古ログ保存（saveLog）★ XP計算の中核
// =====================================================================
//
// XP 内訳:
//   1. 課題評価 (items)      : Σ score × XP_PER_SCORE
//   2. 正直記録ボーナス (受) : Σ +5 × quantity × (isMatch ? 10 : 1)
//   3. 技の稽古 (与)         : Σ quantity × quality × (isMatch ? 10 : 1) × XP_PER_GIVEN_POINT
//
// 副作用:
//   - logs              : items を1行ずつ INSERT
//   - received_technique_logs : receivedTechs を INSERT
//   - technique_logs    : givenTechs を INSERT
//   - user_techniques   : givenTechs の points を UPSERT 加算
//   - user_status       : XP / level / last_practice_date 更新
//   - xp_history        : gain イベント追記
// =====================================================================

const XP_PER_SCORE = 10;          // 課題評価: スコア1あたりのXP
const XP_PER_RECEIVED = 5;        // 正直記録ボーナス: quantity 1あたりのXP
const XP_PER_GIVEN_POINT = 2;     // 与打: (quantity×quality) 1ポイントあたりのXP

export async function saveLog(
  payload: Omit<SaveLogPayload, 'action'>,
): Promise<SaveLogResponse> {
  const userId = requireUserId();
  logger.info(
    'api',
    `稽古記録送信: ${payload.date} (${payload.items.length}項目)`,
  );

  const date = payload.date || todayString();

  // ---- 1. 課題評価 XP ----
  let xpFromPractice = 0;
  const logRows = payload.items.map((it) => {
    const earned = it.score * XP_PER_SCORE;
    xpFromPractice += earned;
    return {
      user_id: userId,
      date,
      task_id: it.task_id,
      score: it.score,
      xp_earned: earned,
    };
  });

  if (logRows.length > 0) {
    const { error: logErr } = await supabase.from('logs').insert(logRows);
    throwIfError(logErr, 'saveLog:insertLogs');
  }

  // ---- 2. 被打（received）XP・ログ ----
  let xpFromReceived = 0;
  let receivedSaved = 0;
  const receivedTechs = payload.receivedTechs ?? [];
  if (receivedTechs.length > 0) {
    const receivedRows = receivedTechs.map((r) => {
      const leverage = r.isMatch ? 10 : 1;
      const earned = XP_PER_RECEIVED * r.quantity * leverage;
      xpFromReceived += earned;
      return {
        user_id: userId,
        date,
        technique_id: r.techniqueId,
        quantity: r.quantity,
        reason: r.reason,
        is_match: r.isMatch ?? false,
      };
    });
    receivedSaved = receivedRows.length;
    const { error: recErr } = await supabase
      .from('received_technique_logs')
      .insert(receivedRows);
    throwIfError(recErr, 'saveLog:insertReceived');
  }

  // ---- 3. 与打（given）XP・ログ・習熟度 UPSERT ----
  let xpFromGiven = 0;
  let givenSaved = 0;
  const givenTechs = payload.givenTechs ?? [];
  if (givenTechs.length > 0) {
    const givenRows = givenTechs.map((g) => {
      const leverage = g.isMatch ? 10 : 1;
      const points = g.quantity * g.quality * leverage;
      const earned = points * XP_PER_GIVEN_POINT;
      xpFromGiven += earned;
      return {
        user_id: userId,
        date,
        technique_id: g.techniqueId,
        quantity: g.quantity,
        quality: g.quality,
        xp_earned: earned,
        is_match: g.isMatch ?? false,
      };
    });
    givenSaved = givenRows.length;

    const { error: givErr } = await supabase
      .from('technique_logs')
      .insert(givenRows);
    throwIfError(givErr, 'saveLog:insertGiven');

    // ---- user_techniques の points を加算 UPSERT ----
    // 同一技が複数回送られる可能性に備え、techniqueId 単位で集約してから加算する。
    const givenAgg = new Map<
      string,
      { points: number; lastQuantity: number; lastQuality: number }
    >();
    for (const g of givenTechs) {
      const leverage = g.isMatch ? 10 : 1;
      const points = g.quantity * g.quality * leverage;
      const prev = givenAgg.get(g.techniqueId);
      if (prev) {
        prev.points += points;
        prev.lastQuantity = g.quantity;
        prev.lastQuality = g.quality;
      } else {
        givenAgg.set(g.techniqueId, {
          points,
          lastQuantity: g.quantity,
          lastQuality: g.quality,
        });
      }
    }

    // 既存 points を取得して加算する（UPSERT で増分加算するため）
    const techIds = Array.from(givenAgg.keys());
    const { data: curTechs, error: curErr } = await supabase
      .from('user_techniques')
      .select('technique_id, points')
      .eq('user_id', userId)
      .in('technique_id', techIds);
    throwIfError(curErr, 'saveLog:fetchUserTechniques');

    const curPointsMap = new Map(
      ((curTechs ?? []) as Array<{ technique_id: string; points: number }>).map(
        (r) => [r.technique_id, r.points ?? 0],
      ),
    );

    const utUpsertRows = Array.from(givenAgg.entries()).map(([techId, v]) => ({
      user_id: userId,
      technique_id: techId,
      points: (curPointsMap.get(techId) ?? 0) + v.points,
      last_rating: v.lastQuality,
      last_quantity: v.lastQuantity,
      last_quality: v.lastQuality,
    }));

    const { error: utErr } = await supabase
      .from('user_techniques')
      .upsert(utUpsertRows, { onConflict: 'user_id,technique_id' });
    throwIfError(utErr, 'saveLog:upsertUserTechniques');
  }

  // ---- XP 合算 → user_status / xp_history 更新 ----
  const totalDelta = xpFromPractice + xpFromReceived + xpFromGiven;
  const { total_xp, level } = await applyXpGain({
    userId,
    deltaXp: totalDelta,
    type: 'gain',
    reason: `稽古記録 ${date}`,
    touchPracticeDate: true,
  });

  // ---- 実績解除判定 ----
  const newAchievements = await checkAndUnlockAchievements(userId, {
    total_xp,
    level,
  });

  const result: SaveLogResponse = {
    xp_earned: totalDelta,
    xp_from_practice: xpFromPractice,
    xp_from_received: xpFromReceived,
    xp_from_given: xpFromGiven,
    given_saved: givenSaved,
    received_saved: receivedSaved,
    total_xp,
    level,
    newAchievements,
  };

  // ★ 自分のキャッシュをパージ（門下生一覧のレベルも変動）
  await mutateMyDashboard();
  await mutate('rivals');

  return result;
}

// =====================================================================
// 実績解除判定（簡易版）
// =====================================================================
//
// achievement_master の condition_type / condition_value を評価し、
// 未解除かつ条件達成のものを user_achievements に INSERT する。
//
// 対応 condition_type:
//   - 'total_xp'    : 累計XPが condition_value 以上
//   - 'level'       : レベルが condition_value 以上
//   - 'log_count'   : logs の件数が condition_value 以上
//   - 'streak_days' : 連続稽古日数が condition_value 以上
//
// それ以外の type は将来拡張用としてスキップする。
// =====================================================================

async function checkAndUnlockAchievements(
  userId: string,
  status: { total_xp: number; level: number },
): Promise<Achievement[]> {
  // マスタと解除済みを取得
  const [masterRes, unlockedRes, logCountRes] = await Promise.all([
    supabase
      .from('achievement_master')
      .select(
        'id, name, condition_type, condition_value, description, hint, icon_type',
      ),
    supabase
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', userId),
    supabase
      .from('logs')
      .select('date', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  throwIfError(masterRes.error, 'checkAchievements:master');
  throwIfError(unlockedRes.error, 'checkAchievements:unlocked');
  throwIfError(logCountRes.error, 'checkAchievements:logCount');

  const unlockedSet = new Set(
    ((unlockedRes.data ?? []) as Array<{ achievement_id: string }>).map(
      (r) => r.achievement_id,
    ),
  );
  const logCount = logCountRes.count ?? 0;

  // 連続稽古日数（streak）算出のため日付一覧を取得
  let streakDays = 0;
  const needStreak = ((masterRes.data ?? []) as AchievementMasterRow[]).some(
    (m) => m.condition_type === 'streak_days' && !unlockedSet.has(m.id),
  );
  if (needStreak) {
    const { data: dateRows, error: dErr } = await supabase
      .from('logs')
      .select('date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(400);
    throwIfError(dErr, 'checkAchievements:streakDates');
    streakDays = calcStreakDays(
      ((dateRows ?? []) as Array<{ date: string }>).map((r) => r.date),
    );
  }

  const nowIso = new Date().toISOString();
  const newlyUnlocked: Achievement[] = [];
  const insertRows: Array<{
    user_id: string;
    achievement_id: string;
    unlocked_at: string;
  }> = [];

  for (const m of (masterRes.data ?? []) as AchievementMasterRow[]) {
    if (unlockedSet.has(m.id)) continue;

    let achieved = false;
    switch (m.condition_type) {
      case 'total_xp':
        achieved = status.total_xp >= m.condition_value;
        break;
      case 'level':
        achieved = status.level >= m.condition_value;
        break;
      case 'log_count':
        achieved = logCount >= m.condition_value;
        break;
      case 'streak_days':
        achieved = streakDays >= m.condition_value;
        break;
      default:
        achieved = false;
    }

    if (achieved) {
      insertRows.push({
        user_id: userId,
        achievement_id: m.id,
        unlocked_at: nowIso,
      });
      newlyUnlocked.push({
        id: m.id,
        name: m.name,
        description: m.description,
        hint: m.hint,
        iconType: m.icon_type,
        isUnlocked: true,
        unlockedAt: nowIso,
      });
    }
  }

  if (insertRows.length > 0) {
    const { error: insErr } = await supabase
      .from('user_achievements')
      .insert(insertRows);
    throwIfError(insErr, 'checkAchievements:insert');
  }

  return newlyUnlocked;
}

/**
 * 日付配列（降順 / 重複あり可）から、本日 or 昨日起点の連続日数を算出する。
 */
function calcStreakDays(dates: string[]): number {
  const uniqueSorted = Array.from(new Set(dates)).sort((a, b) =>
    a < b ? 1 : -1,
  );
  if (uniqueSorted.length === 0) return 0;

  const toDate = (s: string) => new Date(s + 'T00:00:00');
  const oneDay = 1000 * 60 * 60 * 24;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const latest = toDate(uniqueSorted[0]);

  const gapFromToday = Math.floor(
    (today.getTime() - latest.getTime()) / oneDay,
  );
  // 最新稽古が本日でも昨日でもなければ連続は途切れている
  if (gapFromToday > 1) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueSorted.length; i++) {
    const prev = toDate(uniqueSorted[i - 1]);
    const cur = toDate(uniqueSorted[i]);
    const gap = Math.floor((prev.getTime() - cur.getTime()) / oneDay);
    if (gap === 1) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

// =====================================================================
// 他者評価（evaluatePeer）★ Phase7
// =====================================================================
//
// 処理:
//   1. 今日すでに評価済みの (target, task) はスキップ。
//   2. peer_evaluations へ INSERT。
//   3. 被評価者(target)に「評価スコア × 倍率」のXPを付与。
//   4. 評価者(self)に「見取り稽古ボーナス」を付与。
//
// 倍率は評価者のレベルに応じた getPeerMultiplier を使用する。
// =====================================================================

const PEER_XP_PER_SCORE = 8;          // 被評価者: スコア1あたり基礎XP
const EVALUATOR_BONUS_PER_ITEM = 3;   // 評価者: 1項目あたりの見取り稽古ボーナス

export async function evaluatePeer(
  targetId: string,
  items: PeerEvalItem[],
): Promise<EvaluatePeerResponse> {
  const evaluatorId = requireUserId();
  logger.info(
    'api',
    `他者評価送信: target=${targetId} items=${items.length}件`,
  );

  const date = todayString();

  // ---- 既評価の task_id を取得（重複防止）----
  const { data: doneRows, error: doneErr } = await supabase
    .from('peer_evaluations')
    .select('task_id')
    .eq('evaluator_id', evaluatorId)
    .eq('target_id', targetId)
    .eq('date', date);
  throwIfError(doneErr, 'evaluatePeer:fetchDone');

  const doneSet = new Set(
    ((doneRows ?? []) as Array<{ task_id: string }>).map((r) => r.task_id),
  );

  const evaluatedTasks: string[] = [];
  const skippedTasks: string[] = [];
  const insertRows: Array<{
    evaluator_id: string;
    target_id: string;
    task_id: string;
    score: number;
    date: string;
  }> = [];

  for (const it of items) {
    if (doneSet.has(it.taskId)) {
      skippedTasks.push(it.taskId);
      continue;
    }
    evaluatedTasks.push(it.taskId);
    insertRows.push({
      evaluator_id: evaluatorId,
      target_id: targetId,
      task_id: it.taskId,
      score: it.score,
      date,
    });
  }

  // ---- 評価レコード INSERT ----
  if (insertRows.length > 0) {
    const { error: insErr } = await supabase
      .from('peer_evaluations')
      .insert(insertRows);
    throwIfError(insErr, 'evaluatePeer:insert');
  }

  // ---- 倍率（評価者レベル基準）----
  const evaluatorStatus = await loadUserStatusRow(evaluatorId);
  const multiplier = getPeerMultiplier(evaluatorStatus.level ?? 1);

  // ---- 被評価者(target)へXP付与 ----
  let xpGranted = 0;
  if (evaluatedTasks.length > 0) {
    const baseScore = insertRows.reduce((sum, r) => sum + r.score, 0);
    xpGranted = Math.round(baseScore * PEER_XP_PER_SCORE * multiplier);
    await applyXpGain({
      userId: targetId,
      deltaXp: xpGranted,
      type: 'peer_eval',
      reason: `${evaluatorStatus.user_id} からの評価`,
      touchPracticeDate: false,
    });
  }

  // ---- 評価者(self)へ見取り稽古ボーナス ----
  let evaluatorXp = 0;
  let evaluatorLevelAfter = evaluatorStatus.level ?? 1;
  if (evaluatedTasks.length > 0) {
    evaluatorXp = evaluatedTasks.length * EVALUATOR_BONUS_PER_ITEM;
    const after = await applyXpGain({
      userId: evaluatorId,
      deltaXp: evaluatorXp,
      type: 'peer_eval',
      reason: '見取り稽古ボーナス',
      touchPracticeDate: false,
    });
    evaluatorLevelAfter = after.level;
  }

  const result: EvaluatePeerResponse = {
    xp_granted: xpGranted,
    evaluator_xp: evaluatorXp,
    evaluator_level: evaluatorLevelAfter,
    multiplier,
    evaluated_tasks: evaluatedTasks,
    skipped_tasks: skippedTasks,
  };

  // ★ 双方のキャッシュを無効化
  await mutateAfterPeerEval(targetId);
  return result;
}

// =====================================================================
// 反射神経ミニゲーム『刹那ノ見切』★ Phase16
// =====================================================================

export interface MinigameStatus {
  todayPlayed: number;
  dailyLimit: number;
  remaining: number;
  locked: boolean;
  bestTimeMs: number | null;
}

export interface MinigameSaveResult {
  saved: true;
  earnedXp: number;
  totalXp: number;
  level: number;
  todayPlayed: number;
  remaining: number;
  locked: boolean;
  averageTime: number;
  rank: string;
}

export type MinigameRank = 'S' | 'A' | 'B' | 'C' | 'F';

const MINIGAME_DAILY_LIMIT = 5;

// ランク別 獲得XP
const MINIGAME_RANK_XP: Record<MinigameRank, number> = {
  S: 50,
  A: 30,
  B: 20,
  C: 10,
  F: 5,
};

/**
 * 本日のミニゲーム挑戦状況を取得する。
 * minigame_scores から本日プレイ回数と自己ベストを集計する。
 * created_at は TIMESTAMPTZ のため、本日の日付境界（ISO）で範囲照合する。
 */
export async function fetchMinigameStatus(): Promise<MinigameStatus> {
  const userId = requireUserId();
  logger.info('api', 'ミニゲームステータス取得');

  const { startOfDay, endOfDay } = getTodayRangeISO();

  const [todayRes, bestRes] = await Promise.all([
    supabase
      .from('minigame_scores')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay),
    supabase
      .from('minigame_scores')
      .select('average_time')
      .eq('user_id', userId)
      .order('average_time', { ascending: true })
      .limit(1),
  ]);

  throwIfError(todayRes.error, 'fetchMinigameStatus:today');
  throwIfError(bestRes.error, 'fetchMinigameStatus:best');

  const todayPlayed = todayRes.count ?? 0;
  const bestRow = (bestRes.data ?? [])[0] as { average_time: number } | undefined;
  const remaining = Math.max(0, MINIGAME_DAILY_LIMIT - todayPlayed);

  return {
    todayPlayed,
    dailyLimit: MINIGAME_DAILY_LIMIT,
    remaining,
    locked: remaining <= 0,
    bestTimeMs: bestRow?.average_time ?? null,
  };
}

/**
 * ミニゲームステータスの SWR フック（5分キャッシュ）。
 */
export function useMinigameStatusSWR() {
  return useSWR<MinigameStatus, Error>(
    'minigameStatus',
    () => fetchMinigameStatus(),
    userSWRConfig,
  );
}

/**
 * ミニゲームの試合結果を保存し、XPを付与する。
 * 1日の挑戦上限を超えている場合はエラーを投げる。
 * minigame_scores に保存し、created_at（TIMESTAMPTZ）の日付境界で上限を判定する。
 */
export async function saveMinigameResult(payload: {
  averageTime: number;
  rank: MinigameRank;
}): Promise<MinigameSaveResult> {
  const userId = requireUserId();
  logger.info(
    'api',
    `ミニゲーム結果送信: rank=${payload.rank} avg=${payload.averageTime}ms`,
  );

  const { startOfDay, endOfDay } = getTodayRangeISO();

  // ---- 上限チェック ----
  const { count, error: cntErr } = await supabase
    .from('minigame_scores')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay);
  throwIfError(cntErr, 'saveMinigameResult:countCheck');

  const playedBefore = count ?? 0;
  if (playedBefore >= MINIGAME_DAILY_LIMIT) {
    throw new Error('MINIGAME_LOCKED: 本日の挑戦回数は上限に達しています');
  }

  // ---- ログ INSERT ----
  // created_at は DB 側 DEFAULT now() に委ねるため明示指定しない。
  const earnedXp = MINIGAME_RANK_XP[payload.rank] ?? 0;
  const { error: insErr } = await supabase.from('minigame_scores').insert({
    user_id: userId,
    average_time: payload.averageTime,
    rank: payload.rank,
    earned_xp: earnedXp,
  });
  throwIfError(insErr, 'saveMinigameResult:insert');

  // ---- XP 付与 ----
  const { total_xp, level } = await applyXpGain({
    userId,
    deltaXp: earnedXp,
    type: 'gain',
    reason: `刹那ノ見切 [${payload.rank}]`,
    touchPracticeDate: false,
  });

  const todayPlayed = playedBefore + 1;
  const remaining = Math.max(0, MINIGAME_DAILY_LIMIT - todayPlayed);

  const result: MinigameSaveResult = {
    saved: true,
    earnedXp,
    totalXp: total_xp,
    level,
    todayPlayed,
    remaining,
    locked: remaining <= 0,
    averageTime: payload.averageTime,
    rank: payload.rank,
  };

  // ★ ステータス＋ダッシュボード（XP変動）を一括無効化
  await mutateMyDashboard();
  await mutate('rivals');

  return result;
}
