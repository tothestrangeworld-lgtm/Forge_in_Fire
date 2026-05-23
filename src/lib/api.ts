// src/lib/api.ts
// =====================================================================
// 百錬自得 - GAS API クライアント（マルチユーザー対応）
// ブラウザ → /api/gas（Next.jsプロキシ）→ GAS
// ★ Phase4: updateTasks を TaskDiff[] 対応に変更。settings 関連を削除。
// ★ Phase6: fetchAchievements 追加。saveLog の戻り値に newAchievements を追加。
// ★ Phase7: evaluatePeer を PeerEvalItem[] 対応に変更。fetchTodayEvaluations 追加。
// ★ Phase8: updateTechniqueRating を quantity / quality の2引数に変更。
// ★ Phase13.2: updateTechniqueRating を完全削除。与打は saveLog の givenTechs に統合。
// ★ SWR:  useDashboardSWR / useTechniquesSWR / useRivalsSWR / useRivalDashboardSWR を追加。
// ★ Phase14: registerUser を追加（新規アカウント作成）。
// ★ Phase17: SWR最適化（爆速化）
//   - revalidateIfStale / revalidateOnReconnect を false に固定
//   - dedupingInterval をカテゴリ別に最適化（マスタ60分・ユーザー5分・一覧10分）
//   - keepPreviousData=true で画面遷移時のチラつき防止
//   - mutate ヘルパー（mutateAfterWrite 系）を新設し、Write 後の連動更新を統一
// =====================================================================

import useSWR, { mutate, type SWRConfiguration } from 'swr';
import type {
  Achievement,
  DashboardData,
  EpithetMasterEntry,
  EvaluatePeerResponse,
  GASResponse,
  PeerEvalItem,
  SaveLogPayload,
  SaveLogResponse,
  TaskDiff,
  Technique,
  TechniqueMasterEntry,
} from '@/types';
import { loggedFetch, logger } from '@/lib/logger';
import { getCurrentUserId } from '@/lib/auth';

const PROXY = '/api/gas';

// user_id が不要なアクション一覧
const NO_USER_ID_ACTIONS = ['getEpithetMaster', 'getUsers', 'ping'] as const;

// ★ Phase14: POST でも user_id が不要なアクション一覧
const NO_AUTH_POST_ACTIONS = ['login', 'register'] as const;

// ===== レスポンスパーサー =====
async function parseGASResponse<T>(res: Response, action: string): Promise<T> {
  let text = '';
  try {
    text = await res.text();
    const json = JSON.parse(text) as GASResponse<T>;
    if (json.status === 'error') {
      logger.error('gas', `GASエラー: ${action}`, { detail: json.message });
      throw new Error(json.message ?? 'GAS returned error status');
    }
    return json.data as T;
  } catch (err) {
    if (err instanceof SyntaxError) {
      logger.error('gas', `JSONパースエラー: ${action}`, { detail: { raw: text.slice(0, 500) } });
      throw new Error(`Invalid JSON from GAS (${action}): ${text.slice(0, 120)}`);
    }
    throw err;
  }
}

// ===== GET（user_id を自動付与） =====
async function gasGet<T>(params: Record<string, string>): Promise<T> {
  const action  = params.action ?? 'unknown';
  const userId  = getCurrentUserId();
  const needsUserId = !(NO_USER_ID_ACTIONS as readonly string[]).includes(action);

  if (needsUserId && !userId) {
    logger.warn('api', `AUTH_REQUIRED: gasGet blocked (action=${action})`);
    throw new Error('AUTH_REQUIRED');
  }

  const merged = needsUserId
    ? { ...params, user_id: params.user_id ?? userId }
    : params;

  const url = new URL(PROXY, location.origin);
  Object.entries(merged).forEach(([k, v]) => url.searchParams.set(k, v as string));

  const res = await loggedFetch(url.toString(), { cache: 'no-store' }, { category: 'gas', action });
  return parseGASResponse<T>(res, action);
}

// ===== POST（user_id を自動付与） =====
async function gasPost<T>(body: Record<string, unknown>): Promise<T> {
  const action    = (body.action as string) ?? 'unknown';
  const userId    = getCurrentUserId();
  const needsUserId = !(NO_AUTH_POST_ACTIONS as readonly string[]).includes(action);

  if (needsUserId && !userId) {
    logger.warn('api', `AUTH_REQUIRED: gasPost blocked (action=${action})`);
    throw new Error('AUTH_REQUIRED');
  }

  const merged = needsUserId
    ? { ...body, user_id: userId }
    : body;

  const res = await loggedFetch(PROXY, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(merged),
  }, { category: 'gas', action });

  return parseGASResponse<T>(res, action);
}

// =====================================================================
// ★ Phase17: SWR 共通設定（カテゴリ別）
// =====================================================================
//
// 設計方針:
//   - revalidateOnFocus / revalidateIfStale / revalidateOnReconnect を全て false にする
//     → GAS通信は重く、ユーザー側のキャッシュをできるだけ温かく保つ
//   - dedupingInterval をカテゴリ別に分ける
//     - マスタ系: 60分（ほぼ不変）
//     - ユーザー個人: 5分（自分の操作後は mutate で能動的に更新）
//     - 門下生一覧: 10分（他者の更新は即時性不要）
//   - keepPreviousData=true でページ間遷移時のチラつき防止
//   - shouldRetryOnError は AUTH_REQUIRED 以外なら最大2回
// =====================================================================

const baseSWRConfig: SWRConfiguration = {
  revalidateOnFocus:     false,
  revalidateOnReconnect: false,
  revalidateIfStale:     true,        
  keepPreviousData:      true,         // ★ Phase17: 遷移時のチラつき防止
  errorRetryCount:       2,
  shouldRetryOnError:    (err: Error) => err.message !== 'AUTH_REQUIRED',
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
// ★ Phase17: mutate ヘルパー（Write 後の連動更新）
// =====================================================================
//
// 各 Write 操作後にフロント側のキャッシュも即座に無効化することで、
// 「画面に古いデータが残る」問題を防ぐ。
// GAS 側のキャッシュもパージ済みなので、再フェッチ時は最新データが取れる。
// =====================================================================

/**
 * 自分のダッシュボード関連キャッシュを無効化
 * (saveLog / updateProfile / resetStatus / updateTasks / archiveTask /
 *  saveMinigameResult の後に呼ぶ)
 */
export async function mutateMyDashboard(): Promise<void> {
  await Promise.all([
    mutate(['dashboard']),
    mutate(['techniques']),
    mutate('achievements'),
    mutate('minigameStatus'),
  ]);
}

/**
 * 門下生一覧および対象ユーザーのキャッシュを無効化
 * (evaluatePeer の後に呼ぶ)
 */
export async function mutateAfterPeerEval(targetId: string): Promise<void> {
  await Promise.all([
    mutate('rivals'),
    mutate(['rivalDashboard', targetId]),
    mutate(['dashboard']),     // 自分のXPも変動
    mutate(['techniques']),    // 自分の見取り稽古ボーナスもUI反映
  ]);
}

/**
 * 全 SWR キャッシュをクリア（ログイン/ログアウト時に使用）
 */
export async function mutateAll(): Promise<void> {
  await mutate(() => true, undefined, { revalidate: false });
}

// =====================================================================
// 認証
// =====================================================================

export interface LoginPayload  { user_id?: string; name?: string; password: string; }
export interface LoginResponse { user_id: string; name: string; role: string; }

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  return gasPost<LoginResponse>({ action: 'login', ...payload });
}

// ★ Phase14: 新規アカウント作成
export interface RegisterPayload  { name: string; password: string; }
export interface RegisterResponse { user_id: string; name: string; role: string; }

export async function registerUser(params: RegisterPayload): Promise<RegisterResponse> {
  logger.info('api', `新規登録送信: name=${params.name}`);
  const result = await gasPost<RegisterResponse>({ action: 'register', ...params });
  // ★ Phase17: 門下生一覧に新規ユーザーが追加されるためフロントキャッシュもパージ
  await mutate('rivals');
  return result;
}

// =====================================================================
// ★ Phase17: GASレスポンスに合わせた門下生型
// =====================================================================
// Code.gs の getUsers() は user_status の masteryMap を集計して
// 全ユーザーに level / masteryStats を必ず付与して返却する。
// フォールバック値:
//   level:        1
//   masteryStats: { "面": 0, "小手": 0, "胴": 0, "突き": 0 }
//
// optional 指定は防御的プログラミングのため。実行時は必ず値が存在する。
// =====================================================================
export interface RivalUser {
  user_id:       string;
  name:          string;
  role:          string;
  level?:        number;
  masteryStats?: { '面': number; '小手': number; '胴': number; '突き': number };
}

export async function fetchUsers(): Promise<RivalUser[]> {
  return gasGet<RivalUser[]>({ action: 'getUsers' });
}

// =====================================================================
// ダッシュボード
// =====================================================================

export async function fetchDashboard(targetUserId?: string): Promise<DashboardData> {
  return gasGet<DashboardData>(
    targetUserId
      ? { action: 'getDashboard', user_id: targetUserId }
      : { action: 'getDashboard' },
  );
}

// ---- useDashboardSWR の戻り値型 ----
export interface DashboardSWRData {
  dashboard:  DashboardData;
  techniques: Technique[];
}

/**
 * ホーム画面用 SWR フック。
 * ダッシュボードと技一覧を並列取得し { dashboard, techniques } で返す。
 * - キャッシュキー: ['dashboard'] または ['dashboard', targetUserId]
 * - dedupingInterval: 5分（ユーザー系）
 * - AUTH_REQUIRED エラー時は再試行しない。
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
// logs
// =====================================================================

/**
 * 稽古ログを保存する。
 * ★ Phase17: 保存後に自分のダッシュボード関連キャッシュを自動更新。
 */
export async function saveLog(payload: Omit<SaveLogPayload, 'action'>): Promise<SaveLogResponse> {
  logger.info('api', `稽古記録送信: ${payload.date} (${payload.items.length}項目)`);
  const result = await gasPost<SaveLogResponse>({ action: 'saveLog', ...payload });
  // ★ Phase17: 自分のキャッシュをパージ（門下生一覧のレベルも変動）
  await mutateMyDashboard();
  await mutate('rivals');
  return result;
}

// =====================================================================
// user_status
// =====================================================================

export async function resetStatus(): Promise<{ total_xp: number; level: number; title: string }> {
  const result = await gasPost<{ total_xp: number; level: number; title: string }>({ action: 'resetStatus' });
  // ★ Phase17: リセット後にキャッシュを無効化
  await mutateMyDashboard();
  await mutate('rivals');
  return result;
}

export async function updateProfile(data: {
  real_rank?:          string;
  motto?:              string;
  favorite_technique?: string;
}): Promise<{ updated: boolean }> {
  const result = await gasPost<{ updated: boolean }>({ action: 'updateProfile', ...data });
  // ★ Phase17: プロフィール変更後にキャッシュを無効化
  await mutateMyDashboard();
  await mutate('rivals');
  return result;
}

// =====================================================================
// TechniqueMastery
// =====================================================================

export async function fetchTechniques(targetUserId?: string): Promise<Technique[]> {
  return gasGet<Technique[]>(
    targetUserId
      ? { action: 'getTechniques', user_id: targetUserId }
      : { action: 'getTechniques' },
  );
}

/**
 * 技の習熟度一覧を SWR でキャッシュ付きフェッチする。
 * ★ Phase17: dedupingInterval=5分
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
// user_tasks
// =====================================================================

/**
 * 評価項目を一括保存する。
 * ★ Phase17: 保存後にキャッシュを無効化。
 */
export async function updateTasks(tasks: TaskDiff[]): Promise<{ active_count: number }> {
  logger.info('api', '評価項目をまとめて更新', { detail: { count: tasks.length } });
  const result = await gasPost<{ active_count: number }>({ action: 'updateTasks', tasks } as Record<string, unknown>);
  // ★ Phase17: tasks変動でダッシュボードも変わる
  await mutateMyDashboard();
  return result;
}

// =====================================================================
// 門下生（ライバル）★ SWR追加
// =====================================================================

/**
 * 門下生一覧画面用 SWR フック。
 * ★ Phase17: dedupingInterval=10分（他者の更新は即時性不要）
 */
export function useRivalsSWR() {
  return useSWR<RivalUser[], Error>(
    'rivals',
    () => fetchUsers(),
    rivalsSWRConfig,
  );
}

// ---- useRivalDashboardSWR の戻り値型 ----
export interface RivalDashboardSWRData {
  dashboard:              DashboardData;
  techniques:             Technique[];
  targetName:             string;
  initialEvaluatedTaskIds: string[];
}

/**
 * 門下生詳細画面用 SWR フック。
 * ★ Phase17: dedupingInterval=10分
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
      const targetName = users.find(u => u.user_id === uid)?.name ?? uid;
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
// 他者評価 ★ Phase7
// =====================================================================

/**
 * 他者評価を送信する。
 * ★ Phase17: 評価後に自分・対象者・一覧のキャッシュを連動更新。
 */
export async function evaluatePeer(
  targetId: string,
  items: PeerEvalItem[],
): Promise<EvaluatePeerResponse> {
  logger.info('api', `他者評価送信: target=${targetId} items=${items.length}件`);
  const result = await gasPost<EvaluatePeerResponse>({
    action:    'evaluatePeer',
    target_id: targetId,
    items,
  } as Record<string, unknown>);
  // ★ Phase17: 双方のキャッシュを無効化
  await mutateAfterPeerEval(targetId);
  return result;
}

/**
 * 今日、自分が指定ユーザーを評価済みの task_id 一覧を取得する。
 */
export async function fetchTodayEvaluations(
  targetId: string,
): Promise<{ evaluated_task_ids: string[] }> {
  logger.info('api', `今日の評価済み課題取得: target=${targetId}`);
  return gasGet<{ evaluated_task_ids: string[] }>({
    action:    'getTodayEvaluations',
    target_id: targetId,
  });
}

// =====================================================================
// マスタ（共通）
// =====================================================================

export async function fetchEpithetMaster(): Promise<EpithetMasterEntry[]> {
  return gasGet<EpithetMasterEntry[]>({ action: 'getEpithetMaster' });
}

/**
 * ★ Phase17: 二つ名マスタの SWR フック（60分キャッシュ）
 * マスタ系はほぼ不変なので長期キャッシュ。
 */
export function useEpithetMasterSWR() {
  return useSWR<EpithetMasterEntry[], Error>(
    'epithetMaster',
    () => fetchEpithetMaster(),
    masterSWRConfig,
  );
}

export async function fetchTechniqueMaster(): Promise<TechniqueMasterEntry[]> {
  logger.info('api', 'techniqueMaster 取得');
  const dashboard = await fetchDashboard();
  return dashboard.techniqueMaster ?? [];
}

// =====================================================================
// アチーブメント（実績バッジ）★ Phase6
// =====================================================================

export async function fetchAchievements(targetUserId?: string): Promise<Achievement[]> {
  logger.info('api', 'アチーブメント取得');
  return gasGet<Achievement[]>(
    targetUserId
      ? { action: 'getAchievements', user_id: targetUserId }
      : { action: 'getAchievements' },
  );
}

/**
 * ★ Phase17: アチーブメントの SWR フック（5分キャッシュ）
 * achievements ページで使用。
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
// 反射神経ミニゲーム『刹那ノ見切』★ Phase16
// =====================================================================

export interface MinigameStatus {
  todayPlayed: number;
  dailyLimit:  number;
  remaining:   number;
  locked:      boolean;
  bestTimeMs:  number | null;
}

export interface MinigameSaveResult {
  saved:       true;
  earnedXp:    number;
  totalXp:     number;
  level:       number;
  todayPlayed: number;
  remaining:   number;
  locked:      boolean;
  averageTime: number;
  rank:        string;
}

export type MinigameRank = 'S' | 'A' | 'B' | 'C' | 'F';

export async function fetchMinigameStatus(): Promise<MinigameStatus> {
  logger.info('api', 'ミニゲームステータス取得');
  return gasGet<MinigameStatus>({ action: 'getMinigameStatus' });
}

/**
 * ★ Phase17: ミニゲームステータスの SWR フック（5分キャッシュ）
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
 * ★ Phase17: 保存後にキャッシュを無効化。
 */
export async function saveMinigameResult(payload: {
  averageTime: number;
  rank:        MinigameRank;
}): Promise<MinigameSaveResult> {
  logger.info('api', `ミニゲーム結果送信: rank=${payload.rank} avg=${payload.averageTime}ms`);
  const result = await gasPost<MinigameSaveResult>({
    action:      'saveMinigameResult',
    averageTime: payload.averageTime,
    rank:        payload.rank,
  });
  // ★ Phase17: ステータス＋ダッシュボード（XP変動）を一括無効化
  await mutateMyDashboard();
  await mutate('rivals');
  return result;
}
