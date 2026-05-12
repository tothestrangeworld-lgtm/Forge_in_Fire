// src/app/api/push/send/route.ts
// =====================================================================
// PWAプッシュ通知 - 送信API ★ Phase12
//
// ★ 重要: Cloudflare Pages 制約のため Edge Runtime で動作する。
//   web-push パッケージは Node.js crypto に依存し Edge では動かないため、
//   src/lib/webpush-edge.ts に Web Crypto API ベースの自前実装を用意。
//
// リクエスト形式:
//   POST /api/push/send
//   Body: PushSendRequest = { token, targets[] }
//
// 認証:
//   x-push-token ヘッダ または body.token と環境変数 PUSH_INTERNAL_TOKEN の一致を要求
//
// 失効検出:
//   404/410 が返ったら results[].expired = true として返却。
//   GAS 側はこれをもとに push_subscriptions シートから該当行を削除する。
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  sendWebPushEdge,
  type VapidKeys,
  type PushSubscriptionForSend,
} from '@/lib/webpush-edge';
import type {
  PushSendRequest,
  PushSendResponse,
  PushSendResultEntry,
  PushSendTarget,
} from '@/types';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------
// 環境変数
// ---------------------------------------------------------------------
const VAPID_PUBLIC_KEY    = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY   = process.env.VAPID_PRIVATE_KEY            ?? '';
const VAPID_SUBJECT       = process.env.VAPID_SUBJECT                ?? 'mailto:admin@example.com';
const PUSH_INTERNAL_TOKEN = process.env.PUSH_INTERNAL_TOKEN          ?? '';

function getVapidKeys(): VapidKeys {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('VAPID keys are not configured.');
  }
  return {
    publicKey:  VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
    subject:    VAPID_SUBJECT,
  };
}

// ---------------------------------------------------------------------
// 送信ペイロード生成
// ---------------------------------------------------------------------
interface PushPayloadJson {
  title:    string;
  body:     string;
  url:      string;
  category: string;
  tag:      string;
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
    icon:     '/icons/icon-192x192.png',
    badge:    '/icons/icon-192x192.png',
  };
  return JSON.stringify(payload);
}

// ---------------------------------------------------------------------
// 個別送信
// ---------------------------------------------------------------------
async function sendOne(
  target:  PushSendTarget,
  vapid:   VapidKeys,
): Promise<PushSendResultEntry> {
  try {
    const sub: PushSubscriptionForSend = {
      endpoint: target.subscription.endpoint,
      keys: {
        p256dh: target.subscription.keys.p256dh,
        auth:   target.subscription.keys.auth,
      },
    };
    const result = await sendWebPushEdge(sub, vapid, {
      payload: buildPayload(target),
      ttl:     60 * 60 * 12,
      urgency: 'normal',
    });

    if (result.ok) {
      return {
        userId:  target.userId,
        success: true,
        status:  result.status,
      };
    }
    return {
      userId:  target.userId,
      success: false,
      expired: result.expired,
      status:  result.status,
      message: result.body?.slice(0, 200) ?? `HTTP ${result.status}`,
    };
  } catch (err) {
    return {
      userId:  target.userId,
      success: false,
      expired: false,
      status:  0,
      message: err instanceof Error ? err.message : 'unknown error',
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

    let vapid: VapidKeys;
    try {
      vapid = getVapidKeys();
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

    // 並列送信（CPU時間制約のため小ロット）
    const CONCURRENCY = 8;
    const results: PushSendResultEntry[] = [];
    for (let i = 0; i < validTargets.length; i += CONCURRENCY) {
      const chunk = validTargets.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(t => sendOne(t, vapid)));
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
