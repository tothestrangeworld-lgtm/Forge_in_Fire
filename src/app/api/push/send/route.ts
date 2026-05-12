// src/app/api/push/send/route.ts
// =====================================================================
// PWAプッシュ通知 - 送信API ★ Phase12
//
// 役割:
//   GAS の毎日21時トリガーが、通知対象ユーザー（優先度1〜3で1人1通）を
//   判定し、subscription 情報と共に targets[] として POST してくる。
//   このエンドポイントは web-push ライブラリで VAPID 認証付きの
//   Web Push を逐次送信し、結果をまとめて返却する。
//
// リクエスト形式:
//   POST /api/push/send
//   Body: PushSendRequest = { token, targets[] }
//
// 認証:
//   ボディ内の token と環境変数 PUSH_INTERNAL_TOKEN の一致を要求。
//
// 重要な実行環境注意:
//   web-push は Node.js の crypto に依存するため Edge Runtime では
//   動作しない。本ファイルは export const runtime = 'nodejs' を明示。
//   Cloudflare Pages にデプロイする場合は wrangler.toml に
//   compatibility_flags = ["nodejs_compat"] を設定すること。
//
// 410/404 応答:
//   購読が失効しているため、results[].expired = true を返す。
//   GAS 側はこの結果を受けて push_subscriptions シートから該当行を
//   削除すべき（後続フェーズで実装）。
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import type {
  PushSendRequest,
  PushSendResponse,
  PushSendResultEntry,
  PushSendTarget,
} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ---------------------------------------------------------------------
// 環境変数
// ---------------------------------------------------------------------
const VAPID_PUBLIC_KEY    = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY   = process.env.VAPID_PRIVATE_KEY            ?? '';
const VAPID_SUBJECT       = process.env.VAPID_SUBJECT                ?? 'mailto:admin@example.com';
const PUSH_INTERNAL_TOKEN = process.env.PUSH_INTERNAL_TOKEN          ?? '';

// ---------------------------------------------------------------------
// VAPID 初期化（プロセス起動時に1回）
// ---------------------------------------------------------------------
let vapidConfigured = false;
function ensureVapid(): void {
  if (vapidConfigured) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('VAPID keys are not configured.');
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

// ---------------------------------------------------------------------
// 送信ペイロード生成
// ---------------------------------------------------------------------
interface PushPayloadJson {
  title:    string;
  body:     string;
  url:      string;
  category: string;
  /** 通知 tag。同種通知の重複表示を抑止する */
  tag:      string;
  /** ServiceWorker 側で使うアイコン */
  icon:     string;
  badge:    string;
}

function buildPayload(target: PushSendTarget): string {
  const payload: PushPayloadJson = {
    title:    target.title,
    body:     target.body,
    url:      target.url ?? '/',
    category: target.category,
    tag:      `forge-${target.category}`,
    icon:     '/icon-192x192.png',
    badge:    '/icon-192x192.png',
  };
  return JSON.stringify(payload);
}

// ---------------------------------------------------------------------
// 個別送信
// ---------------------------------------------------------------------
async function sendOne(target: PushSendTarget): Promise<PushSendResultEntry> {
  try {
    const payload = buildPayload(target);
    const result = await webpush.sendNotification(
      {
        endpoint: target.subscription.endpoint,
        keys:     target.subscription.keys,
      },
      payload,
      {
        TTL:     60 * 60 * 12, // 12時間
        urgency: 'normal',
      },
    );
    return {
      userId:  target.userId,
      success: true,
      status:  result.statusCode,
    };
  } catch (err: unknown) {
    // web-push のエラーは statusCode を持つ
    const e = err as { statusCode?: number; body?: string; message?: string };
    const status = typeof e.statusCode === 'number' ? e.statusCode : 0;
    const expired = status === 404 || status === 410;
    return {
      userId:  target.userId,
      success: false,
      expired,
      status,
      message: e.body ?? e.message ?? 'unknown error',
    };
  }
}

// ---------------------------------------------------------------------
// 入力検証
// ---------------------------------------------------------------------
function isValidTarget(t: unknown): t is PushSendTarget {
  if (!t || typeof t !== 'object') return false;
  const x = t as Record<string, unknown>;
  if (typeof x.userId !== 'string') return false;
  if (typeof x.title !== 'string')  return false;
  if (typeof x.body !== 'string')   return false;
  if (typeof x.category !== 'string') return false;
  if (!x.subscription || typeof x.subscription !== 'object') return false;
  const sub = x.subscription as Record<string, unknown>;
  if (typeof sub.endpoint !== 'string') return false;
  if (!sub.keys || typeof sub.keys !== 'object') return false;
  const keys = sub.keys as Record<string, unknown>;
  if (typeof keys.p256dh !== 'string') return false;
  if (typeof keys.auth   !== 'string') return false;
  return true;
}

// ---------------------------------------------------------------------
// POST ハンドラ
// ---------------------------------------------------------------------
export async function POST(req: NextRequest): Promise<NextResponse<PushSendResponse>> {
  try {
    // 認証: ヘッダ or ボディの token を確認
    const headerToken = req.headers.get('x-push-token') ?? '';

    let body: PushSendRequest;
    try {
      body = (await req.json()) as PushSendRequest;
    } catch {
      return NextResponse.json(
        {
          status:    'error',
          total:     0,
          succeeded: 0,
          failed:    0,
          results:   [],
          message:   'Invalid JSON body.',
        },
        { status: 400 },
      );
    }

    const providedToken = headerToken || body?.token || '';
    if (!PUSH_INTERNAL_TOKEN || providedToken !== PUSH_INTERNAL_TOKEN) {
      return NextResponse.json(
        {
          status:    'error',
          total:     0,
          succeeded: 0,
          failed:    0,
          results:   [],
          message:   'Unauthorized.',
        },
        { status: 401 },
      );
    }

    // VAPID 初期化（鍵未設定時はここで例外）
    try {
      ensureVapid();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'VAPID init failed';
      return NextResponse.json(
        {
          status:    'error',
          total:     0,
          succeeded: 0,
          failed:    0,
          results:   [],
          message:   msg,
        },
        { status: 500 },
      );
    }

    if (!Array.isArray(body.targets)) {
      return NextResponse.json(
        {
          status:    'error',
          total:     0,
          succeeded: 0,
          failed:    0,
          results:   [],
          message:   'targets must be an array.',
        },
        { status: 400 },
      );
    }

    const validTargets: PushSendTarget[] = body.targets.filter(isValidTarget);
    const invalidCount = body.targets.length - validTargets.length;

    if (validTargets.length === 0) {
      return NextResponse.json(
        {
          status:    'ok',
          total:     body.targets.length,
          succeeded: 0,
          failed:    invalidCount,
          results:   [],
          message:   invalidCount > 0 ? 'No valid targets.' : 'No targets.',
        },
        { status: 200 },
      );
    }

    // 並列送信（同時実行数を制限してエンドポイント側のレート制御に配慮）
    const CONCURRENCY = 10;
    const results: PushSendResultEntry[] = [];
    for (let i = 0; i < validTargets.length; i += CONCURRENCY) {
      const chunk = validTargets.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(sendOne));
      results.push(...chunkResults);
    }

    const succeeded = results.filter(r => r.success).length;
    const failed    = results.length - succeeded + invalidCount;

    return NextResponse.json(
      {
        status:    'ok',
        total:     body.targets.length,
        succeeded,
        failed,
        results,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      {
        status:    'error',
        total:     0,
        succeeded: 0,
        failed:    0,
        results:   [],
        message:   `send failed: ${message}`,
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-push-token',
    },
  });
}
