// =====================================================================
// 百錬自得 - GAS API クライアント
// ブラウザ → /api/gas（Next.jsプロキシ）→ GAS
// CORSを回避するためブラウザは直接GASを叩かない
// =====================================================================

import type {
  DashboardData,
  GASResponse,
  SaveLogPayload,
  SaveLogResponse,
  Setting,
} from '@/types';
import { loggedFetch, logger } from '@/lib/logger';

// 常に自サーバーの /api/gas を経由する（CORS回避）
const PROXY = '/api/gas';

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
      logger.error('gas', `JSONパースエラー: ${action}`, {
        detail: { raw: text.slice(0, 500) },
      });
      throw new Error(`Invalid JSON from GAS (${action}): ${text.slice(0, 120)}`);
    }
    throw err;
  }
}

// ===== GET（プロキシ経由） =====
async function gasGet<T>(params: Record<string, string>): Promise<T> {
  const action = params.action ?? 'unknown';
  const url    = new URL(PROXY, location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await loggedFetch(url.toString(), { cache: 'no-store' }, {
    category: 'gas',
    action,
  });
  return parseGASResponse<T>(res, action);
}

// ===== POST（プロキシ経由） =====
async function gasPost<T>(body: object & { action?: string }): Promise<T> {
  const action = (body as Record<string, string>).action ?? 'unknown';

  const res = await loggedFetch(PROXY, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  }, { category: 'gas', action });

  return parseGASResponse<T>(res, action);
}

// ===== 公開API =====

export async function fetchDashboard(): Promise<DashboardData> {
  return gasGet<DashboardData>({ action: 'getDashboard' });
}

export async function fetchSettings(): Promise<Setting[]> {
  return gasGet<Setting[]>({ action: 'getSettings' });
}

export async function saveLog(payload: Omit<SaveLogPayload, 'action'>): Promise<SaveLogResponse> {
  logger.info('api', `稽古記録送信: ${payload.date} (${payload.items.length}項目)`);
  return gasPost<SaveLogResponse>({ action: 'saveLog', ...payload });
}

export async function updateSettings(items: Setting[]): Promise<{ updated: number }> {
  return gasPost<{ updated: number }>({ action: 'updateSettings', items });
}

// ステータスリセット
export async function resetStatus(): Promise<{ total_xp: number; level: number; title: string }> {
  return gasPost<{ total_xp: number; level: number; title: string }>({ action: 'resetStatus' });
}
