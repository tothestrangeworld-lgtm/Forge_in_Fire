// =====================================================================
// 百錬自得 - GAS プロキシ
// ブラウザ → /api/gas → GAS（サーバー間なのでCORSなし）
// =====================================================================

import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const GAS_URL = process.env.GAS_URL ?? process.env.NEXT_PUBLIC_GAS_URL ?? '';

function slog(level: 'INFO'|'WARN'|'ERROR', msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}][${level}][gas-proxy] ${msg}`;
  if (level === 'ERROR') console.error(line, data ?? '');
  else if (level === 'WARN') console.warn(line, data ?? '');
  else console.log(line, data ?? '');
}

// ===== GET プロキシ =====
export async function GET(req: NextRequest) {
  if (!GAS_URL) {
    slog('ERROR', 'GAS_URL 未設定');
    return Response.json({ status: 'error', message: 'GAS_URL is not configured' }, { status: 500 });
  }

  // クエリパラメータをそのままGASに転送
  const incoming = new URL(req.url);
  const target   = new URL(GAS_URL);
  incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v));

  const action = incoming.searchParams.get('action') ?? 'unknown';
  const start  = Date.now();

  try {
    slog('INFO', `GET → ${action}`);
    const res  = await fetch(target.toString(), {
      redirect: 'follow',
      headers:  { 'User-Agent': 'Hyakuren-Proxy/1.0' },
    });
    const text = await res.text();
    const ms   = Date.now() - start;

    slog('INFO', `GET ← ${action} ${res.status} (${ms}ms)`);

    return new Response(text, {
      status:  res.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    const ms = Date.now() - start;
    slog('ERROR', `GET ✗ ${action} (${ms}ms)`, {
      message: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { status: 'error', message: `Proxy fetch failed: ${err instanceof Error ? err.message : err}` },
      { status: 502 }
    );
  }
}

// ===== POST プロキシ =====
export async function POST(req: NextRequest) {
  if (!GAS_URL) {
    slog('ERROR', 'GAS_URL 未設定');
    return Response.json({ status: 'error', message: 'GAS_URL is not configured' }, { status: 500 });
  }

  let body: unknown;
  let action = 'unknown';
  try {
    body   = await req.json();
    action = (body as Record<string, string>).action ?? 'unknown';
  } catch {
    return Response.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });
  }

  const start = Date.now();
  slog('INFO', `POST → ${action}`);

  try {
    const res  = await fetch(GAS_URL, {
      method:   'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':   'Hyakuren-Proxy/1.0',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const ms   = Date.now() - start;

    slog('INFO', `POST ← ${action} ${res.status} (${ms}ms)`);

    return new Response(text, {
      status:  res.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    const ms = Date.now() - start;
    slog('ERROR', `POST ✗ ${action} (${ms}ms)`, {
      message: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { status: 'error', message: `Proxy fetch failed: ${err instanceof Error ? err.message : err}` },
      { status: 502 }
    );
  }
}
