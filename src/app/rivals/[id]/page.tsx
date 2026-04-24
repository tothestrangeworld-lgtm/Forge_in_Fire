// src/app/rivals/[id]/page.tsx
'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Swords, Star, TrendingUp, Trophy, Calendar, ThumbsUp, CheckCircle } from 'lucide-react';
import { fetchDashboard, fetchTechniques, fetchUsers, evaluatePeer } from '@/lib/api';
import { calcEpithet } from '@/lib/epithet';
import { getCurrentUserId } from '@/lib/auth';
import type { DashboardData, Technique, UserTask } from '@/types';

export const runtime = 'edge';

// Recharts は SSR 非対応のため dynamic import
const RadarChart       = dynamic(() => import('@/components/charts/RadarChart'),       { ssr: false });
const XPTimelineChart  = dynamic(() => import('@/components/charts/XPTimelineChart'),  { ssr: false });
const ActivityHeatmap  = dynamic(() => import('@/components/charts/ActivityHeatmap'),  { ssr: false });
const PlaystyleCharts  = dynamic(() => import('@/components/charts/PlaystyleCharts'),  { ssr: false });
const SkillGrid        = dynamic(() => import('@/components/charts/SkillGrid'),        { ssr: false });

// =====================================================================
// XP → 次レベルまでの進捗（型定義から xpForLevel を利用）
// =====================================================================
function xpForLevel(n: number): number {
  return n <= 1 ? 0 : Math.floor(100 * Math.pow(n - 1, 1.8));
}

// =====================================================================
// コンポーネント
// =====================================================================
export default function RivalDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: targetId } = use(params);
  const router = useRouter();

  const [dashboard,   setDashboard]   = useState<DashboardData | null>(null);
  const [techniques,  setTechniques]  = useState<Technique[]>([]);
  const [targetName,  setTargetName]  = useState('');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [mounted,     setMounted]     = useState(false);

  // ---- 他者評価ボタン用ステート ----
  const [evalLoading,  setEvalLoading]  = useState(false);
  const [evalResult,   setEvalResult]   = useState<{ xp: number; mult: number } | null>(null);
  const [evalError,    setEvalError]    = useState('');
  const [evalDone,     setEvalDone]     = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!targetId) return;

    const load = async () => {
      try {
        const [dash, techs, users] = await Promise.all([
          fetchDashboard(targetId),
          fetchTechniques(targetId),
          fetchUsers(),
        ]);
        setDashboard(dash);
        setTechniques(techs);
        const found = users.find(u => u.user_id === targetId);
        setTargetName(found?.name ?? targetId);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'AUTH_REQUIRED') return;
        setError('データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [targetId]);

  // =====================================================================
  // 他者評価ハンドラ
  // =====================================================================
  const handleEvaluate = async () => {
    if (evalLoading || evalDone) return;
    setEvalLoading(true);
    setEvalError('');
    setEvalResult(null);
    try {
      const res = await evaluatePeer(targetId);
      setEvalResult({ xp: res.xp_granted, mult: res.multiplier });
      setEvalDone(true);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('すでに評価済み') || err.message.includes('already')) {
          setEvalError('本日はすでにこのユーザーを評価しました');
          setEvalDone(true);
        } else {
          setEvalError('評価の送信に失敗しました。もう一度お試しください。');
        }
      } else {
        setEvalError('評価の送信に失敗しました。もう一度お試しください。');
      }
    } finally {
      setEvalLoading(false);
    }
  };

  // =====================================================================
  // ローディング
  // =====================================================================
  if (loading) {
    return (
      <main style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid #312e81', borderTopColor: '#a78bfa',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 14px',
          }} />
          <p style={{ color: '#7c6fad', fontSize: 13 }}>読み込み中…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  if (error || !dashboard) {
    return (
      <main style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#fca5a5' }}>
          <p style={{ marginBottom: 16 }}>{error || 'データが見つかりません'}</p>
          <button
            onClick={() => router.back()}
            style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa', cursor: 'pointer' }}
          >
            戻る
          </button>
        </div>
      </main>
    );
  }

  const { status, logs, xpHistory, epithetMaster, settings } = dashboard;
  const activeTask: UserTask | null = (dashboard.tasks ?? []).find(t => t.status === 'active') ?? null;
  const myUserId = getCurrentUserId();

  // 稽古評価レーダー用（page.tsxから移植）
  const activeItems = settings.filter(s => s.is_active).map(s => s.item_name);
  const totals: Record<string, { sum: number; count: number }> = {};
  activeItems.forEach(i => { totals[i] = { sum: 0, count: 0 }; });
  logs.slice(-50).forEach(l => {
    if (totals[l.item_name]) { totals[l.item_name].sum += l.score; totals[l.item_name].count++; }
  });
  const radarData = activeItems.map(item => ({
    subject: item,
    score:   totals[item].count > 0 ? +(totals[item].sum / totals[item].count).toFixed(1) : 0,
    fullMark: 5,
  }));
  // 二つ名の算出
  const epithet = epithetMaster && techniques.length > 0
  ? calcEpithet(techniques, epithetMaster)
  : null;

  // 次レベルまでのXP進捗
  const currentLevelXp = xpForLevel(status.level);
  const nextLevelXp    = xpForLevel(status.level + 1);
  const progressXp     = status.total_xp - currentLevelXp;
  const rangeXp        = nextLevelXp - currentLevelXp;
  const progressPct    = rangeXp > 0 ? Math.min(100, Math.round((progressXp / rangeXp) * 100)) : 100;

  // 自分自身のページでは評価ボタンを非表示
  const isSelf = myUserId === targetId;

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 90 }}>

      {/* ======================= ヘッダー ======================= */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'linear-gradient(135deg, #0f0c29 0%, #1e1b4b 70%, #312e81 100%)',
        borderBottom: '1px solid rgba(139,92,246,0.3)',
        padding: '14px 16px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 430, margin: '0 auto' }}>
          <button
            onClick={() => router.back()}
            style={{
              background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: 10, padding: '6px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          >
            <ArrowLeft style={{ width: 18, height: 18, color: '#a78bfa' }} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Swords style={{ width: 15, height: 15, color: '#6d28d9', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#7c6fad', letterSpacing: '0.06em' }}>
                閲覧中
              </span>
            </div>
            <h1 style={{
              fontSize: 17, fontWeight: 800, color: '#ede9fe',
              letterSpacing: '0.06em', margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {targetName} のダッシュボード
            </h1>
          </div>

          {/* 閲覧専用バッジ */}
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
            color: '#86efac', borderRadius: 6, padding: '3px 7px', flexShrink: 0,
          }}>
            READ ONLY
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 430, margin: '0 auto', padding: '16px 16px 0' }}>

        {/* ======================= ステータスカード ======================= */}
        <div className="wa-card" style={{
          background: 'linear-gradient(135deg, rgba(30,27,75,0.9) 0%, rgba(49,46,129,0.7) 100%)',
          border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: 18, padding: '20px 18px', marginBottom: 14,
        }}>
          {/* 二つ名 + 称号バナー */}
          {epithet && (
            <div style={{
              textAlign: 'center', marginBottom: 14,
              padding: '8px 12px',
              background: 'rgba(109,40,217,0.15)',
              border: '1px solid rgba(109,40,217,0.3)',
              borderRadius: 10,
            }}>
              <p style={{ fontSize: 11, color: '#7c6fad', margin: '0 0 2px', letterSpacing: '0.06em' }}>
                {epithet.name}
              </p>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#c4b5fd', margin: 0, letterSpacing: '0.1em' }}>
                {epithet.fullTitle}
              </p>
            </div>
          )}

          {/* Lv + XP */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #4c1d95, #6d28d9)',
              border: '2px solid rgba(167,139,250,0.5)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 9, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.05em' }}>Lv</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#ede9fe', lineHeight: 1 }}>{status.level}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: '#c4b5fd', fontWeight: 700 }}>{status.title}</span>
                <span style={{ fontSize: 11, color: '#7c6fad' }}>
                  {status.total_xp.toLocaleString()} XP
                </span>
              </div>
              {/* プログレスバー */}
              <div style={{
                height: 6, borderRadius: 6,
                background: 'rgba(109,40,217,0.2)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 6,
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #6d28d9, #a78bfa)',
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                <span style={{ fontSize: 10, color: '#6d28d9' }}>{progressPct}%</span>
                <span style={{ fontSize: 10, color: '#6d28d9' }}>
                  次: {dashboard.nextLevelXp?.title ?? `Lv${status.level + 1}`}
                </span>
              </div>
            </div>
          </div>

          {/* 最終稽古日 */}
          {status.last_practice_date && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px',
              background: 'rgba(109,40,217,0.1)',
              borderRadius: 8,
            }}>
              <Calendar style={{ width: 13, height: 13, color: '#7c6fad' }} />
              <span style={{ fontSize: 11, color: '#7c6fad' }}>
                最終稽古：{status.last_practice_date}
              </span>
            </div>
          )}
        </div>

        {/* =====================================================================
            現在の課題 + 他者評価ボタン
        ===================================================================== */}
        <div className="wa-card" style={{
          background: 'linear-gradient(135deg, rgba(13,11,42,0.92), rgba(30,27,75,0.82))',
          border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: 16,
          padding: '14px 12px',
          marginBottom: 14,
        }}>
          {/* ヘッダー行 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd', letterSpacing: '0.06em' }}>
                現在の課題
              </span>
              {isSelf && (
                <div style={{ fontSize: 10, color: 'rgba(199,210,254,0.35)', marginTop: 2 }}>
                  READ ONLY
                </div>
              )}
            </div>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
              background: activeTask ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)',
              border: activeTask ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(148,163,184,0.25)',
              color: activeTask ? '#86efac' : 'rgba(226,232,240,0.65)',
              borderRadius: 999,
              padding: '3px 8px',
              flexShrink: 0,
            }}>
              {activeTask ? 'ACTIVE' : 'NONE'}
            </span>
          </div>

          {/* 課題テキスト */}
          {activeTask ? (
            <>
              <p style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 900,
                color: '#ede9fe',
                lineHeight: 1.35,
                wordBreak: 'break-word',
              }}>
                {activeTask.task_text}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 10, color: 'rgba(199,210,254,0.35)' }}>
                更新: {activeTask.updated_at || activeTask.created_at}
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(199,210,254,0.55)' }}>
              課題はまだ設定されていません
            </p>
          )}

          {/* ── 他者評価ボタン（自分自身のページでは非表示） ── */}
          {!isSelf && (
            <div style={{ marginTop: 14 }}>
              {/* 成功フィードバック */}
              {evalResult && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px',
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: 10,
                  marginBottom: 10,
                }}>
                  <CheckCircle style={{ width: 16, height: 16, color: '#86efac', flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#86efac' }}>
                      評価を送りました！
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(134,239,172,0.7)' }}>
                      {targetName} に +{evalResult.xp} XP（×{evalResult.mult} 倍率）
                    </p>
                  </div>
                </div>
              )}

              {/* エラーフィードバック */}
              {evalError && !evalResult && (
                <div style={{
                  padding: '8px 12px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 10,
                  marginBottom: 10,
                }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#fca5a5' }}>{evalError}</p>
                </div>
              )}

              {/* 評価ボタン */}
              <button
                onClick={handleEvaluate}
                disabled={evalLoading || evalDone || !activeTask}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: evalDone
                    ? '1px solid rgba(34,197,94,0.3)'
                    : activeTask
                      ? '1px solid rgba(139,92,246,0.5)'
                      : '1px solid rgba(100,100,120,0.3)',
                  background: evalDone
                    ? 'rgba(34,197,94,0.08)'
                    : activeTask
                      ? 'linear-gradient(135deg, rgba(109,40,217,0.3), rgba(139,92,246,0.2))'
                      : 'rgba(30,27,75,0.4)',
                  color: evalDone
                    ? '#86efac'
                    : activeTask
                      ? '#c4b5fd'
                      : 'rgba(199,210,254,0.35)',
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  cursor: (evalLoading || evalDone || !activeTask) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: evalLoading ? 0.7 : 1,
                }}
              >
                {evalLoading ? (
                  <>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: '2px solid rgba(167,139,250,0.3)',
                      borderTopColor: '#a78bfa',
                      animation: 'spin 0.7s linear infinite',
                      flexShrink: 0,
                    }} />
                    送信中…
                  </>
                ) : evalDone ? (
                  <>
                    <CheckCircle style={{ width: 15, height: 15 }} />
                    本日の評価送信済み
                  </>
                ) : (
                  <>
                    <ThumbsUp style={{ width: 15, height: 15 }} />
                    {activeTask ? `「${activeTask.task_text.slice(0, 12)}${activeTask.task_text.length > 12 ? '…' : ''}」の取り組みを評価する` : '課題が設定されていません'}
                  </>
                )}
              </button>

              {/* 課題がない場合の補足テキスト */}
              {!activeTask && (
                <p style={{ margin: '6px 0 0', fontSize: 10, color: 'rgba(199,210,254,0.3)', textAlign: 'center' }}>
                  課題が設定されると評価できるようになります
                </p>
              )}
            </div>
          )}
        </div>

        {/* ======================= XP推移チャート ======================= */}
        {mounted && xpHistory && xpHistory.length > 0 && (
          <div className="wa-card" style={{ borderRadius: 16, padding: '14px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <TrendingUp style={{ width: 15, height: 15, color: '#a78bfa' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.05em' }}>
                XP推移
              </span>
            </div>
            <XPTimelineChart xpHistory={xpHistory} compact />
          </div>
        )}

        {/* ======================= 稽古カレンダー ======================= */}
        {mounted && logs && logs.length > 0 && (
          <div className="wa-card" style={{ borderRadius: 16, padding: '14px 12px', marginBottom: 14, overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Calendar style={{ width: 15, height: 15, color: '#a78bfa' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.05em' }}>
                稽古カレンダー
              </span>
            </div>
            <ActivityHeatmap logs={logs} />
          </div>
        )}

        {/* ======================= スコアバランス ======================= */}
        {mounted && logs && logs.length > 0 && (
          <div className="wa-card" style={{ borderRadius: 16, padding: '14px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Star style={{ width: 15, height: 15, color: '#a78bfa' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.05em' }}>
                稽古スコアバランス
              </span>
            </div>
            <RadarChart data={radarData} />
          </div>
        )}

        {/* ======================= スキルグリッド（閲覧専用） ======================= */}
        {mounted && techniques.length > 0 && (
          <div className="wa-card" style={{ borderRadius: 16, padding: '14px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Swords style={{ width: 15, height: 15, color: '#a78bfa' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.05em' }}>
                  技の習熟度
                </span>
              </div>
              <span style={{
                fontSize: 9, color: '#6d28d9', fontWeight: 700, letterSpacing: '0.06em',
                background: 'rgba(109,40,217,0.12)', border: '1px solid rgba(109,40,217,0.25)',
                borderRadius: 5, padding: '2px 6px',
              }}>
                VIEW ONLY
              </span>
            </div>
            {/* ポインターイベントを無効にして操作不可にする */}
            <div style={{ pointerEvents: 'none', userSelect: 'none' }}>
              <SkillGrid techniques={techniques} />
            </div>
          </div>
        )}

        {/* ======================= プレイスタイル分析 ======================= */}
        {mounted && techniques.length > 0 && epithetMaster && (
          <div className="wa-card" style={{ borderRadius: 16, padding: '14px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Trophy style={{ width: 15, height: 15, color: '#a78bfa' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.05em' }}>
                プレイスタイル分析
              </span>
            </div>
            <PlaystyleCharts
              techniques={techniques}
            />
          </div>
        )}

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
