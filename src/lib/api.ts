// src/lib/api.ts
// =====================================================================
// 百錬自得 - GAS API クライアント（マルチユーザー対応）
// ブラウザ → /api/gas（Next.jsプロキシ）→ GAS
// =====================================================================

import type {
  DashboardData,
  EpithetMasterEntry,
  EvaluatePeerResponse,
  GASResponse,
  SaveLogPayload,
  SaveLogResponse,
  Setting,
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

  // 認証ガード: user_id が必要なのに未認証ならフェッチをブロック
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
 * レスポンスには techniqueMaster（technique_master 全件）が含まれる。★ UPDATED
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
// settings
// =====================================================================

export async function fetchSettings(): Promise<Setting[]> {
  return gasGet<Setting[]>({ action: 'getSettings' });
}

export async function updateSettings(items: Setting[]): Promise<{ updated: number }> {
  return gasPost<{ updated: number }>({ action: 'updateSettings', items } as Record<string, unknown>);
}

// =====================================================================
// logs
// =====================================================================

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
  /**
   * 得意技ID（例: "T001"）。
   * ★ UPDATED: 自由記述テキストから technique_master の ID に変更。
   */
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

export async function updateTasks(tasks: string[]): Promise<{ active_count: number }> {
  logger.info('api', '評価項目をまとめて更新', { detail: { count: tasks.length } });
  return gasPost<{ active_count: number }>({ action: 'updateTasks', tasks });
}

// =====================================================================
// 他者評価
// =====================================================================

/**
 * 対象ユーザーを評価する（1日1回制限）。
 * 評価者のアプリ内レベルに応じた倍率が基本XP（10）に乗算され、対象者に付与される。
 *
 * @param targetId 評価対象のユーザーID
 * @returns 付与XP・評価者レベル・倍率
 * @throws 当日すでに評価済みの場合、GASが 429 エラーを返しスローされる
 */
export async function evaluatePeer(targetId: string): Promise<EvaluatePeerResponse> {
  logger.info('api', `他者評価送信: target=${targetId}`);
  return gasPost<EvaluatePeerResponse>({ action: 'evaluatePeer', target_id: targetId });
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
 * ★ NEW
 */
export async function fetchTechniqueMaster(): Promise<TechniqueMasterEntry[]> {
  // getDashboard 経由で取得するのが本来だが、
  // profile 画面のように getDashboard 全体を呼びたくない場合に使う。
  // GAS 側は getDashboard の techniqueMaster フィールドに含める設計なので、
  // ここでは getDashboard を呼んで techniqueMaster だけを返す。
  logger.info('api', 'techniqueMaster 取得');
  const dashboard = await fetchDashboard();
  return dashboard.techniqueMaster ?? [];
}
