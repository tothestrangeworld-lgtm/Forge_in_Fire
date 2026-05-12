// src/app/api/push/subscribe/route.ts
// =====================================================================
// PWAプッシュ通知 - サブスクリプション登録API ★ Phase12
//
// 役割:
//   ブラウザの ServiceWorkerRegistration.pushManager.subscribe() で
//   取得した PushSubscription を、GAS の push_subscriptions シートへ
//   保存する（upsert）。
//
// リクエスト形式:
//   POST /api/push/subscribe
//   Body: { userId: string, subscription: PushSubscriptionPayload }
//
// 内部動作:
//   GAS の Web App に対して
//     { action: 'savePushSubscription', userId, subscription }
//   を POST する。GAS 側は user_id をキーに upsert する。
//
// Edge Runtime 互換（fetch のみ使用、Node API 非依存）
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import type {
  PushSubscribeRequest,
  PushSubscribeResponse,
  PushSubscriptionPayload,
} from '@/types';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL ?? '';
const PUSH_INTERNAL_TOKEN = process.env.PUSH_INTERNAL_TOKEN ?? '';

function isValidSubscription(sub: unknown): sub is PushSubscriptionPayload {
  if (!sub || typeof sub !== 'object') return false;
  const s = sub as Record<string, unknown>;
  if (typeof s.endpoint !== 'string' || s.endpoint.length === 0) return false;
  if (!s.keys || typeof s.keys !== 'object') return false;
  const k = s.keys as Record<string, unknown>;
  if (typeof k.p256dh !== 'string' || k.p256dh.length === 0) return false;
  if (typeof k.auth !== 'string' || k.auth.length === 0) return false;
  return true;
}

export async function POST(req: NextRequest): Promise<NextResponse<PushSubscribeResponse>> {
  try {
    if (!GAS_WEBAPP_URL) {
      return NextResponse.json(
        { status: 'error', message: 'GAS_WEBAPP_URL is not configured.' },
        { status: 500 },
      );
    }

    let body: PushSubscribeRequest;
    try {
      body = (await req.json()) as PushSubscribeRequest;
    } catch {
      return NextResponse.json(
        { status: 'error', message: 'Invalid JSON body.' },
        { status: 400 },
      );
    }

    if (!body || typeof body.userId !== 'string' || body.userId.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'userId is required.' },
        { status: 400 },
      );
    }

    if (!isValidSubscription(body.subscription)) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid subscription object.' },
        { status: 400 },
      );
    }

    // GAS Web App へ転送（GAS 側で push_subscriptions シートへ upsert）
    const gasRes = await fetch(GAS_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:       'savePushSubscription',
        token:        PUSH_INTERNAL_TOKEN,
        userId:       body.userId,
        subscription: body.subscription,
      }),
      // GAS への redirect を確実に追従
      redirect: 'follow',
    });

    if (!gasRes.ok) {
      const text = await gasRes.text().catch(() => '');
      return NextResponse.json(
        {
          status:  'error',
          message: `GAS responded ${gasRes.status}: ${text.slice(0, 200)}`,
        },
        { status: 502 },
      );
    }

    let gasJson: { status?: string; message?: string } = {};
    try {
      gasJson = (await gasRes.json()) as { status?: string; message?: string };
    } catch {
      // GAS が JSON を返さなかった場合は ok とみなす
      gasJson = { status: 'ok' };
    }

    if (gasJson.status === 'error') {
      return NextResponse.json(
        { status: 'error', message: gasJson.message ?? 'GAS returned error.' },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { status: 'ok', message: 'Subscription saved.' },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { status: 'error', message: `subscribe failed: ${message}` },
      { status: 500 },
    );
  }
}

// CORS preflight 用（同一オリジンであれば不要だが念のため）
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
