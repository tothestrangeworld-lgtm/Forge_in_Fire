'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, ArrowLeft, Bell, BellOff, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import type { TechniqueMasterEntry, PushSubscriptionPayload } from '@/types';
import { fetchDashboard, updateProfile } from '@/lib/api';
import { getAuthUser } from '@/lib/auth';

// =====================================================================
// プロフィール設定画面
// ★ Phase4:
//   - favorite_technique をテキスト入力 → <select>（技ID）に変更
//   - techniqueMaster（getDashboard レスポンス）を利用
// ★ Phase12:
//   - PWA Push通知の許可トグル/購読ロジックを追加
//   - サイバー和風テーマに合わせたON/OFFスイッチUI
//   - getAuthUser() 経由でユーザーIDを型安全に取得
//   - urlBase64ToUint8Array を Uint8Array<ArrayBuffer> 明示型に修正
//     （TypeScript 5.7+ の Uint8Array ジェネリック化対応）
// =====================================================================

const RANK_OPTIONS = ['無段', '初段', '弐段', '参段', '四段', '五段', '六段', '七段', '八段'] as const;
type RankOption = (typeof RANK_OPTIONS)[number];

// ---------------------------------------------------------------------
// Push通知ユーティリティ
// ---------------------------------------------------------------------

type PushPermissionState =
  | 'unsupported'   // ブラウザ非対応
  | 'default'       // 未許可（未確認）
  | 'granted'       // 許可済み
  | 'denied'        // 拒否済み
  | 'subscribed';   // このアプリで購読登録済み

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/**
 * Base64URL → Uint8Array 変換（Web Push API の applicationServerKey 用）
 *
 * ★ TypeScript 5.7+ 対応:
 *   Uint8Array がジェネリック化（Uint8Array<TArrayBuffer>）されたため、
 *   ArrayBuffer をバックに持つ純粋な Uint8Array を生成する必要がある。
 *   new ArrayBuffer(len) → new Uint8Array(buffer) の順で生成することで、
 *   Uint8Array<ArrayBuffer> 型として確定させる。
 *   pushManager.subscribe() の applicationServerKey が要求する
 *   BufferSource 型に正しく代入できるようになる。
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : '';
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // フォーム値
  const [realRank, setRealRank]               = useState<RankOption>('無段');
  const [motto, setMotto]                     = useState('');
  const [favTechId, setFavTechId]             = useState('');   // 技ID（例: "T001"）
  const [techniqueMaster, setTechniqueMaster] = useState<TechniqueMasterEntry[]>([]);

  // ★ Phase12: Push通知関連
  const [pushState, setPushState]       = useState<PushPermissionState>('default');
  const [pushBusy, setPushBusy]         = useState(false);
  const [pushMessage, setPushMessage]   = useState<string | null>(null);
  const [pushError, setPushError]       = useState<string | null>(null);

  // -------------------------------------------------------------------
  // 初期ロード
  // -------------------------------------------------------------------
  useEffect(() => {
    fetchDashboard()
      .then(d => {
        const seededRank =
          d.status.real_rank && (RANK_OPTIONS as readonly string[]).includes(d.status.real_rank)
            ? (d.status.real_rank as RankOption)
            : '無段';
        setRealRank(seededRank);
        setMotto(d.status.motto ?? '');
        setFavTechId(d.status.favorite_technique ?? '');
        setTechniqueMaster(d.techniqueMaster ?? []);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
        setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      })
      .finally(() => setLoading(false));
  }, []);

  // -------------------------------------------------------------------
  // ★ Phase12: 現在のPush購読状態を取得
  // -------------------------------------------------------------------
  const refreshPushState = useCallback(async () => {
    if (!isPushSupported()) {
      setPushState('unsupported');
      return;
    }
    const perm = Notification.permission;
    if (perm === 'denied') {
      setPushState('denied');
      return;
    }
    if (perm === 'default') {
      setPushState('default');
      return;
    }
    // granted: 既存サブスクリプションを確認
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setPushState('granted');
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setPushState(sub ? 'subscribed' : 'granted');
    } catch {
      setPushState('granted');
    }
  }, []);

  useEffect(() => {
    void refreshPushState();
  }, [refreshPushState]);

  // -------------------------------------------------------------------
  // ★ Phase12: Push通知をONにする
  // -------------------------------------------------------------------
  const enablePush = useCallback(async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushError(null);
    setPushMessage(null);
    try {
      if (!isPushSupported()) {
        throw new Error('このブラウザはPush通知に対応していません');
      }
      if (!VAPID_PUBLIC_KEY) {
        throw new Error('VAPID公開鍵が未設定です（NEXT_PUBLIC_VAPID_PUBLIC_KEY）');
      }

      // ★ getAuthUser() 経由で型安全にユーザーIDを取得
      const authUser = getAuthUser();
      const userId = authUser?.user_id ?? '';
      if (!userId) {
        throw new Error('ログイン情報が取得できません。再ログインしてください');
      }

      // 1) 通知許可
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPushState(perm === 'denied' ? 'denied' : 'default');
        throw new Error(
          perm === 'denied'
            ? '通知が拒否されました。ブラウザ設定から許可してください'
            : '通知許可が得られませんでした',
        );
      }

      // 2) Service Worker 取得（next-pwa の sw.js を待つ）
      const reg = await navigator.serviceWorker.ready;

      // 3) 既存サブスクリプションがあれば一度解除（鍵変更などに備える）
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe().catch(() => undefined);
      }

      // 4) 購読
      //    BufferSource 型に明示的に確定させる（TS 5.7+ の型厳格化対応）
      const appServerKey: BufferSource = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: appServerKey,
      });

      // 5) JSON 化して /api/push/subscribe へ送信
      const subJson = sub.toJSON() as unknown as PushSubscriptionPayload;
      if (!subJson?.endpoint || !subJson?.keys?.p256dh || !subJson?.keys?.auth) {
        throw new Error('購読情報の生成に失敗しました');
      }

      const res = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, subscription: subJson }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`サーバー登録失敗 (${res.status}): ${text.slice(0, 120)}`);
      }
      const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
      if (json.status === 'error') {
        throw new Error(json.message ?? '登録に失敗しました');
      }

      setPushState('subscribed');
      setPushMessage('通知を有効にしました');
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'Push通知の有効化に失敗しました');
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy]);

  // -------------------------------------------------------------------
  // ★ Phase12: Push通知をOFFにする
  // -------------------------------------------------------------------
  const disablePush = useCallback(async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushError(null);
    setPushMessage(null);
    try {
      if (!isPushSupported()) {
        throw new Error('このブラウザはPush通知に対応していません');
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
        }
      }
      // ※サーバー側の購読レコード削除は将来的にAPIを追加（Phase12 Step3以降）
      setPushState('granted');
      setPushMessage('通知を無効にしました（端末側）');
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'Push通知の無効化に失敗しました');
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy]);

  // -------------------------------------------------------------------
  // 既存ロジック
  // -------------------------------------------------------------------
  const mottoLen = useMemo(() => motto.length, [motto]);

  const groupedTechs = useMemo(() => {
    const map: Record<string, TechniqueMasterEntry[]> = {};
    techniqueMaster.forEach(t => {
      const group = t.actionType || '未分類';
      if (!map[group]) map[group] = [];
      map[group].push(t);
    });
    return map;
  }, [techniqueMaster]);

  const selectedTechName = useMemo(() => {
    if (!favTechId) return '';
    const found = techniqueMaster.find(t => t.id === favTechId);
    return found ? found.name : favTechId;
  }, [favTechId, techniqueMaster]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        real_rank:          realRank === '無段' ? '' : realRank,
        motto,
        favorite_technique: favTechId,
      });
      router.push('/');
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  // 共通スタイル
  const selectStyle: React.CSSProperties = {
    width: '100%',
    borderRadius: 12,
    border: '1.5px solid rgba(129,140,248,0.25)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e0e7ff',
    padding: '10px 12px',
    outline: 'none',
    fontFamily: 'inherit',
    fontSize: '0.85rem',
    colorScheme: 'dark',
  };
  const inputStyle: React.CSSProperties = { ...selectStyle };

  // ---------------------------------------------------------------
  // Push トグルの表示状態を計算
  // ---------------------------------------------------------------
  const isOn = pushState === 'subscribed';
  const isBlocked = pushState === 'denied' || pushState === 'unsupported';

  return (
    <div className="animate-fade-up" style={{ padding: '1.5rem 1rem 0' }}>

      {/* ヘッダー */}
      <header style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(129,140,248,0.2)',
          color: '#a5b4fc', textDecoration: 'none', flexShrink: 0,
        }} title="RETURN HOME">
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </Link>
        <div>
          <span className="section-title" style={{ display: 'block' }}>SETTINGS</span>
          <h1 style={{
            fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #e0e7ff, #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            PROFILE
          </h1>
        </div>
      </header>

      <div className="hud-card" style={{ marginBottom: '0.75rem' }}>
        <p style={{ margin: '0 0 14px', fontSize: '0.8rem', fontWeight: 700, color: 'rgba(129,140,248,0.5)', lineHeight: 1.5 }}>
          リアル段位に応じて獲得XPに倍率がかかります。
        </p>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[44, 44, 80].map((h, i) => (
              <div key={i} style={{ height: h, borderRadius: 12, background: 'rgba(99,102,241,0.06)' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── リアル段位 ── */}
            <div>
              <span className="section-title">リアル段位</span>
              <select
                value={realRank}
                onChange={e => setRealRank(e.target.value as RankOption)}
                style={selectStyle}
              >
                {RANK_OPTIONS.map(r => (
                  <option key={r} value={r} style={{ background: '#0f0e2a', color: '#e0e7ff' }}>
                    {r}
                  </option>
                ))}
              </select>
              <p style={{ margin: '4px 0 0', fontSize: '0.68rem', color: 'rgba(129,140,248,0.45)', paddingLeft: 4 }}>
                {(() => {
                  const MULTI: Record<string, number> = {
                    '初段':1.2, '弐段':1.5, '参段':1.8, '四段':2.2, '五段':2.7, '六段':3.4, '七段':4.2, '八段':5.0,
                  };
                  const m = MULTI[realRank] ?? 1.0;
                  return `XP倍率: ×${m.toFixed(1)}`;
                })()}
              </p>
            </div>

            {/* ── 座右の銘 ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span className="section-title">信条</span>
                <span style={{ fontSize: 11, color: 'rgba(99,102,241,0.35)', fontWeight: 700 }}>
                  {mottoLen}/20
                </span>
              </div>
              <input
                value={motto}
                maxLength={20}
                onChange={e => setMotto(e.target.value)}
                placeholder="例）守破離"
                style={inputStyle}
              />
            </div>

            {/* ── 得意技 ── */}
            <div>
              <span className="section-title">得意技</span>

              {techniqueMaster.length === 0 ? (
                <input
                  value={favTechId}
                  onChange={e => setFavTechId(e.target.value)}
                  placeholder="technique_master データがありません"
                  style={inputStyle}
                />
              ) : (
                <select
                  value={favTechId}
                  onChange={e => setFavTechId(e.target.value)}
                  style={selectStyle}
                >
                  <option value="" style={{ background: '#0f0e2a', color: 'rgba(99,102,241,0.4)' }}>
                    ── 選択してください ──
                  </option>
                  {Object.entries(groupedTechs).map(([actionType, techs]) => (
                    <optgroup
                      key={actionType}
                      label={actionType}
                      style={{ background: '#0f0e2a', color: 'rgba(129,140,248,0.7)' }}
                    >
                      {techs.map(t => (
                        <option
                          key={t.id}
                          value={t.id}
                          style={{ background: '#0f0e2a', color: '#e0e7ff' }}
                        >
                          {t.name}
                          {t.subCategory ? `（${t.subCategory}）` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}

              {favTechId && selectedTechName && (
                <div style={{
                  marginTop: 8,
                  padding: '7px 12px',
                  borderRadius: 10,
                  background: 'rgba(120,53,15,0.2)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 13, filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.7))' }}>★</span>
                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(251,191,36,0.6)', letterSpacing: '0.08em' }}>
                      シグネチャームーブ
                    </span>
                    <br />
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fde68a' }}>
                      {selectedTechName}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(251,191,36,0.4)', marginLeft: 6 }}>
                      {favTechId}
                    </span>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* エラー */}
        {error && (
          <div style={{
            marginTop: 12, padding: 12,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 12,
            fontSize: '0.85rem', color: '#f87171',
          }}>
            {error}
          </div>
        )}

        {/* 保存ボタン */}
        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="btn-ai"
          >
            {saving ? (
              <>
                <Loader2 style={{ width: 16, height: 16, animation: 'spin .8s linear infinite' }} />
                保存中...
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </>
            ) : (
              <>
                <Save style={{ width: 16, height: 16 }} />
                保存してホームへ
              </>
            )}
          </button>
        </div>
      </div>

      {/* =================================================== */}
      {/* ★ Phase12: Push通知設定カード                       */}
      {/* =================================================== */}
      <div className="hud-card" style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className="section-title" style={{ margin: 0 }}>NOTIFICATION</span>
        </div>
        <h2 style={{
          fontSize: '1.05rem', fontWeight: 800, margin: '0 0 6px',
          color: '#e0e7ff', letterSpacing: '-0.01em',
        }}>
          プッシュ通知
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: 'rgba(129,140,248,0.5)', lineHeight: 1.6 }}>
          必要な報せを届けます。<br />
        </p>

        {/* トグルスイッチ */}
        <div
          onClick={() => {
            if (pushBusy || isBlocked) return;
            void (isOn ? disablePush() : enablePush());
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (pushBusy || isBlocked) return;
              void (isOn ? disablePush() : enablePush());
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 16px',
            borderRadius: 14,
            background: isOn
              ? 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.12))'
              : 'rgba(255,255,255,0.04)',
            border: isOn
              ? '1.5px solid rgba(168,85,247,0.45)'
              : '1.5px solid rgba(129,140,248,0.2)',
            cursor: (pushBusy || isBlocked) ? 'not-allowed' : 'pointer',
            opacity: isBlocked ? 0.5 : 1,
            transition: 'all 0.25s ease',
            boxShadow: isOn
              ? '0 0 24px rgba(168,85,247,0.18), inset 0 0 12px rgba(168,85,247,0.08)'
              : 'none',
          }}
        >
          {/* アイコン */}
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isOn
              ? 'radial-gradient(circle, rgba(168,85,247,0.35), rgba(99,102,241,0.2))'
              : 'rgba(99,102,241,0.08)',
            border: isOn
              ? '1px solid rgba(168,85,247,0.5)'
              : '1px solid rgba(129,140,248,0.2)',
          }}>
            {pushBusy ? (
              <Loader2 style={{ width: 18, height: 18, color: '#a78bfa', animation: 'spin .8s linear infinite' }} />
            ) : isOn ? (
              <Bell style={{ width: 18, height: 18, color: '#c4b5fd', filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.7))' }} />
            ) : (
              <BellOff style={{ width: 18, height: 18, color: 'rgba(129,140,248,0.5)' }} />
            )}
          </div>

          {/* テキスト */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.9rem', fontWeight: 800, color: '#e0e7ff', letterSpacing: '-0.01em',
            }}>
              {isOn ? '通知 有効' : '通知 無効'}
            </div>
            <div style={{
              fontSize: '0.7rem', color: 'rgba(129,140,248,0.55)', marginTop: 2,
            }}>
              {pushState === 'unsupported' && 'このブラウザは非対応'}
              {pushState === 'denied'      && 'ブラウザ設定で拒否されています'}
              {pushState === 'default'     && 'タップして許可する'}
              {pushState === 'granted'     && 'タップして購読を開始'}
              {pushState === 'subscribed'  && 'タップで停止'}
            </div>
          </div>

          {/* スイッチ本体 */}
          <div style={{
            width: 48, height: 26, borderRadius: 13,
            background: isOn
              ? 'linear-gradient(135deg, #a78bfa, #6366f1)'
              : 'rgba(99,102,241,0.15)',
            border: isOn
              ? '1px solid rgba(168,85,247,0.6)'
              : '1px solid rgba(129,140,248,0.25)',
            position: 'relative',
            transition: 'all 0.25s ease',
            flexShrink: 0,
            boxShadow: isOn
              ? '0 0 12px rgba(168,85,247,0.5), inset 0 1px 2px rgba(255,255,255,0.15)'
              : 'inset 0 1px 2px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: isOn
                ? 'radial-gradient(circle at 30% 30%, #fff, #e0e7ff)'
                : 'rgba(226,232,240,0.7)',
              position: 'absolute',
              top: 2,
              left: isOn ? 25 : 2,
              transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }} />
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>

        {/* 通知メッセージ */}
        {pushMessage && (
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 10,
            fontSize: '0.78rem', color: '#86efac',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Bell style={{ width: 14, height: 14 }} />
            {pushMessage}
          </div>
        )}
        {pushError && (
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            fontSize: '0.78rem', color: '#fca5a5',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
            <span style={{ flex: 1, lineHeight: 1.5 }}>{pushError}</span>
          </div>
        )}

        {/* 詳細注釈 */}
{/*         <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(15,14,42,0.5)',
          borderLeft: '2px solid rgba(168,85,247,0.4)',
          borderRadius: 6,
        }}> */}
{/*           <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(168,85,247,0.7)', letterSpacing: '0.1em', marginBottom: 4 }}>
            通知される内容
          </div>
          <ul style={{
            margin: 0, paddingLeft: 16,
            fontSize: '0.7rem', color: 'rgba(129,140,248,0.55)',
            lineHeight: 1.7,
          }}>
            <li>XP減衰警告（最終稽古から48時間経過時）</li>
            <li>実績解除の予兆（連続稽古日数が達成1日前）</li>
            <li>他者評価サマリー（誰かが稽古を評価した日）</li>
          </ul> */}
        </div>
      </div>
/*     </div> */
  );
}
