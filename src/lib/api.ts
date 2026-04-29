// src/lib/api.ts
// =====================================================================
// 百錬自得 - GAS API クライアント（マルチユーザー対応）
// ブラウザ → /api/gas（Next.jsプロキシ）→ GAS
// ★ Phase4: updateTasks を TaskDiff[] 対応に変更。settings 関連を削除。
// ★ Phase6: fetchAchievements 追加。saveLog の戻り値に newAchievements を追加。
// ★ Phase7: evaluatePeer を PeerEvalItem[] 対応に変更。fetchTodayEvaluations 追加。
// =====================================================================

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
  TechniqueUpdateResponse,
} from '@/types';
import { loggedFetch, logger } from '@/lib/logger';
import { getCurrentUserId } from '@/lib/auth';

const PROXY = '/api/gas';

// user_id が不要なアクション一覧
const NO_USER_ID_ACTIONS = ['getEpithetMaster', 'getUsers', 'ping'] as const;

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
  const needsUserId = action !== 'login';

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
// 認証
// =====================================================================

export interface LoginPayload  { user_id?: string; name?: string; password: string; }
export interface LoginResponse { user_id: string; name: string; role: string; }

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  return gasPost<LoginResponse>({ action: 'login', ...payload });
}

export async function fetchUsers(): Promise<{ user_id: string; name: string; role: string }[]> {
  return gasGet<{ user_id: string; name: string; role: string }[]>({ action: 'getUsers' });
}

// =====================================================================
// ダッシュボード
// =====================================================================

/**
 * ダッシュボードを取得する。
 * レスポンスには techniqueMaster（technique_master 全件）が含まれる。
 * @param targetUserId 省略時は自分自身、指定時は対象ユーザーのデータを取得（閲覧専用）
 */
export async function fetchDashboard(targetUserId?: string): Promise<DashboardData> {
  return gasGet<DashboardData>(
    targetUserId
      ? { action: 'getDashboard', user_id: targetUserId }
      : { action: 'getDashboard' },
  );
}

// =====================================================================
// logs
// =====================================================================

/**
 * 稽古ログを保存する。
 * ★ Phase4: items[].task_id（UUID）を使用。
 * ★ Phase6: レスポンスに newAchievements（今回新規解除された実績配列）が含まれる。
 */
export async function saveLog(payload: Omit<SaveLogPayload, 'action'>): Promise<SaveLogResponse> {
  logger.info('api', `稽古記録送信: ${payload.date} (${payload.items.length}項目)`);
  return gasPost<SaveLogResponse>({ action: 'saveLog', ...payload });
}

// =====================================================================
// user_status
// =====================================================================

export async function resetStatus(): Promise<{ total_xp: number; level: number; title: string }> {
  return gasPost<{ total_xp: number; level: number; title: string }>({ action: 'resetStatus' });
}

export async function updateProfile(data: {
  real_rank?:          string;
  motto?:              string;
  favorite_technique?: string;
}): Promise<{ updated: boolean }> {
  return gasPost<{ updated: boolean }>({ action: 'updateProfile', ...data });
}

// =====================================================================
// TechniqueMastery
// =====================================================================

/**
 * 技の習熟度一覧を取得する（technique_master × user_techniques の JOIN済み）。
 * @param targetUserId 省略時は自分自身、指定時は対象ユーザーのデータを取得（閲覧専用）
 */
export async function fetchTechniques(targetUserId?: string): Promise<Technique[]> {
  return gasGet<Technique[]>(
    targetUserId
      ? { action: 'getTechniques', user_id: targetUserId }
      : { action: 'getTechniques' },
  );
}

export async function updateTechniqueRating(id: string, rating: number): Promise<TechniqueUpdateResponse> {
  logger.info('api', `技評価送信: id=${id} rating=${rating}`);
  return gasPost<TechniqueUpdateResponse>({ action: 'updateTechniqueRating', id, rating });
}

// =====================================================================
// user_tasks
// =====================================================================

/**
 * 評価項目を一括保存する。
 * ★ Phase4 スマート差分対応:
 *   - id あり → 既存タスクを再アクティブ化（テキスト変更なし）
 *   - id なし → 新規タスクとして UUID 発行
 *   - 送られなかった既存アクティブタスク → 自動アーカイブ
 */
export async function updateTasks(tasks: TaskDiff[]): Promise<{ active_count: number }> {
  logger.info('api', '評価項目をまとめて更新', { detail: { count: tasks.length } });
  return gasPost<{ active_count: number }>({ action: 'updateTasks', tasks } as Record<string, unknown>);
}

// =====================================================================
// 他者評価 ★ Phase7: 個別課題単位の評価対応
// =====================================================================

/**
 * 他者評価を送信する。
 * ★ Phase7: 課題単位の評価に変更。items には評価したい課題のみを含める。
 *   - 本日すでに評価済みの task_id は GAS 側でスキップされ skipped_tasks に含まれる。
 *   - xp は新規評価分のスコア合計 × 2 × 評価者レベル倍率で算出。
 *
 * @param targetId 評価対象のユーザーID
 * @param items    評価する課題の配列（{ taskId, score }[]）
 */
export async function evaluatePeer(
  targetId: string,
  items: PeerEvalItem[],
): Promise<EvaluatePeerResponse> {
  logger.info('api', `他者評価送信: target=${targetId} items=${items.length}件`);
  return gasPost<EvaluatePeerResponse>({
    action:    'evaluatePeer',
    target_id: targetId,
    items,
  } as Record<string, unknown>);
}

/**
 * 今日、自分が指定ユーザーを評価済みの task_id 一覧を取得する。
 * ライバル画面のロード時に呼び出し、評価済み課題の UI を disabled にするために使用する。
 *
 * @param targetId 評価対象のユーザーID
 * @returns { evaluated_task_ids: string[] }
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
 * technique_master の全件を取得する（全ユーザー共通静的マスタ）。
 * 通常は fetchDashboard の戻り値に含まれる techniqueMaster を使うこと。
 * 単独で必要な場合（プロフィール設定画面など）にのみ使用する。
 */
export async function fetchTechniqueMaster(): Promise<TechniqueMasterEntry[]> {
  logger.info('api', 'techniqueMaster 取得');
  const dashboard = await fetchDashboard();
  return dashboard.techniqueMaster ?? [];
}

// =====================================================================
// アチーブメント（実績バッジ）★ Phase6
// =====================================================================

/**
 * ユーザーの全実績データを取得する。
 * achievement_master（全件）と user_achievements を JOIN し、
 * isUnlocked / unlockedAt を含む Achievement[] を返す。
 *
 * @param targetUserId 省略時は自分自身、指定時は対象ユーザーのデータを取得（閲覧専用）
 */
export async function fetchAchievements(targetUserId?: string): Promise<Achievement[]> {
  logger.info('api', 'アチーブメント取得');
  return gasGet<Achievement[]>(
    targetUserId
      ? { action: 'getAchievements', user_id: targetUserId }
      : { action: 'getAchievements' },
  );
}
