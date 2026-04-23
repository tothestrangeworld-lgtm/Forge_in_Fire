// src/lib/api.ts
// =====================================================================
// 百錬自得 - GAS API クライアント（マルチユーザー対応）
// ブラウザ → /api/gas（Next.jsプロキシ）→ GAS
// =====================================================================

import type {
  DashboardData,
  EpithetMasterEntry,
  GASResponse,
  SaveLogPayload,
  SaveLogResponse,
  Setting,
  Technique,
  TechniqueUpdateResponse,
} from '@/types';
import { loggedFetch, logger } from '@/lib/logger';
import { getCurrentUserId } from '@/lib/auth';

const PROXY = '/api/gas';

// user_id が不要なアクション一覧（GET / POST 共通で参照）
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

// ===== GET（user_id を自動付与、ただし params に user_id が明示されていればそちらを優先） =====
async function gasGet<T>(params: Record<string, string>): Promise<T> {
  const action = params.action ?? 'unknown';
  const userId = getCurrentUserId();
  const needsUserId = !(NO_USER_ID_ACTIONS as readonly string[]).includes(action);

  // --- 認証ガード ---
  // user_id が必要なアクションで未認証の場合はフェッチを物理的にブロックする。
  // AuthGuard の router.replace('/login') が完了するコンマ数秒の間に
  // page.tsx の useEffect が発火してしまうレースコンディション対策。
  // 呼び出し元は err.message === 'AUTH_REQUIRED' を catch して無視すること。
  if (needsUserId && !userId) {
    logger.warn('api', `AUTH_REQUIRED: gasGet blocked (action=${action})`);
    throw new Error('AUTH_REQUIRED');
  }

  // params に user_id が明示的に渡された場合はそれを優先（他ユーザー閲覧用）。
  // 渡されていない場合は getCurrentUserId() を自動付与。
  const merged = needsUserId
    ? { ...params, user_id: params.user_id ?? userId }
    : params;

  const url = new URL(PROXY, location.origin);
  Object.entries(merged).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await loggedFetch(url.toString(), { cache: 'no-store' }, { category: 'gas', action });
  return parseGASResponse<T>(res, action);
}

// ===== POST（user_id を自動付与） =====
async function gasPost<T>(body: Record<string, unknown>): Promise<T> {
  const action = (body.action as string) ?? 'unknown';
  const userId = getCurrentUserId();
  const needsUserId = action !== 'login';

  // --- 認証ガード ---
  // login 以外で user_id が必要なアクションで未認証の場合はフェッチをブロックする。
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

export interface LoginPayload { user_id?: string; name?: string; password: string; }
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

export async function updateProfile(data: { real_rank?: string; motto?: string; favorite_technique?: string }): Promise<{ updated: boolean }> {
  return gasPost<{ updated: boolean }>({ action: 'updateProfile', ...data });
}

// =====================================================================
// TechniqueMastery
// =====================================================================

/**
 * 技の習熟度一覧を取得する。
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
  logger.info('api', '評価項目をまとめて更新', { count: tasks.length });
  return gasPost<{ active_count: number }>({ action: 'updateTasks', tasks });
}

// =====================================================================
// マスタ（共通）
// =====================================================================

export async function fetchEpithetMaster(): Promise<EpithetMasterEntry[]> {
  return gasGet<EpithetMasterEntry[]>({ action: 'getEpithetMaster' });
}