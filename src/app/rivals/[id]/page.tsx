// src/app/rivals/[id]/page.tsx
'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Swords, Star, TrendingUp, Trophy, CheckCircle } from 'lucide-react';
import { useRivalDashboardSWR, evaluatePeer } from '@/lib/api';
import { calcEpithet } from '@/lib/epithet';
import type { EpithetResult } from '@/lib/epithet';
import { getCurrentUserId } from '@/lib/auth';
import { calcLevelFromXp } from '@/types';
import type { PeerEvalItem, UserTask } from '@/types';
import { UserStatusCard } from '@/components/UserStatusCard';

export const runtime = 'edge';

const XPTimelineChart = dynamic(() => import('@/components/charts/XPTimelineChart'), { ssr: false });
const PlaystyleCharts = dynamic(() => import('@/components/charts/PlaystyleCharts'), { ssr: false });
const SkillGrid       = dynamic(() => import('@/components/charts/SkillGrid'),       { ssr: false });

const SCORE_COLORS: Record<number, string> = {
  5: '#4f46e5', 4: '#6366f1', 3: '#818cf8', 2: '#c7d2fe', 1: '#e0e7ff',
};

const SCORE_LABELS = [
  '', '少し取り組んでいる', '取り組んでいる', '概ね取り組んでいる',
  'よく取り組んでいる', '非常によく取り組んでいる',
] as const;

export default function RivalDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: targetId } = use(params);
  const router = useRouter();

  const { data: swrData, error: swrError, isLoading: loading } = useRivalDashboardSWR(targetId);

  const dashboard  = swrData?.dashboard  ?? null;
  const techniques = swrData?.techniques ?? [];
  const targetName = swrData?.targetName ?? '';

  const error = swrError && swrError.message !== 'AUTH_REQUIRED'
    ? 'データの読み込みに失敗しました'
    : '';

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // 他者評価ステート
  const [taskScores,       setTaskScores]       = useState<Record<string, number | null>>({});
  const [evaluatedTaskIds, setEvaluatedTaskIds] = useState<Set<string>>(new Set());
  const [evalLoading,      setEvalLoading]      = useState(false);
  const [evalResult,       setEvalResult]       = useState<{ xp: number; mult: number; count: number } | null>(null);
  const [evalError,        setEvalError]        = useState('');

  const initializedRef = useRef(false);
  useEffect(() => {
    if (swrData && !initializedRef.current) {
      initializedRef.current = true;
      setEvaluatedTaskIds(new Set(swrData.initialEvaluatedTaskIds));
    }
  }, [swrData]);

  const handleEvaluate = async () => {
    if (evalLoading || !dashboard) return;
    const activeTasks: UserTask[] = (dashboard.tasks ?? []).filter(t => t.status === 'active');
    const items: PeerEvalItem[] = activeTasks
      .filter(t => !evaluatedTaskIds.has(t.id) && taskScores[t.id] != null)
      .map(t => ({ taskId: t.id, score: taskScores[t.id]! }));
    if (items.length === 0) return;

    setEvalLoading(true); setEvalError(''); setEvalResult(null);
    try {
      const res = await evaluatePeer(targetId, items);
      setEvaluatedTaskIds(prev => {
        const next = new Set(prev);
        res.evaluated_tasks.forEach(id => next.add(id));
        res.skipped_tasks.forEach(id => next.add(id));
        return next;
      });
      setTaskScores(prev => {
        const next = { ...prev };
        items.forEach(item => { next[item.taskId] = null; });
        return next;
      });
      setEvalResult({ xp: res.xp_granted, mult: res.multiplier, count: res.evaluated_tasks.length });
    } catch (err: unknown) {
      setEvalError(err instanceof Error ? (err.message || '評価の送信に失敗しました。') : '評価の送信に失敗しました。');
    } finally {
      setEvalLoading(false);
    }
  };

  // ── ローディング ──
  if (loading) {
    return (
      <main style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #312e81', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
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
          <button onClick={() => router.back()} style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa', cursor: 'pointer' }}>
            戻る
          </button>
        </div>
      </main>
    );
  }

  const { status, logs, xpHistory, epithetMaster } = dashboard;
  const tm          = dashboard.titleMaster;
  const activeTasks: UserTask[] = (dashboard.tasks ?? []).filter(t => t.status === 'active');
  const myUserId    = getCurrentUserId();
  const isSelf      = myUserId === targetId;

  const level   = calcLevelFromXp(status.total_xp);
  const epithet: EpithetResult | null = (epithetMaster && techniques.length > 0)
    ? calcEpithet(techniques, epithetMaster, level, tm)
    : null;

  // 課題別スコア分布
  const scoreDistData = activeTasks.map(t => {
    const dist: Record<number, number> = { 1:0,2:0,3:0,4:0,5:0 };
    let totalPts = 0, totalCount = 0;
    logs.slice(-50).forEach(l => {
      if (l.item_name === t.task_text) {
        const s = l.score as number;
        if (s >= 1 && s <= 5) dist[s] = (dist[s] ?? 0) + 1;
        totalPts += s; totalCount++;
      }
    });
    return { taskText: t.task_text, dist, totalPts, totalCount };
  });
  const hasScoreData = scoreDistData.some(d => d.totalCount > 0);

  const hasSelectableItems  = activeTasks.some(t => !evaluatedTaskIds.has(t.id) && taskScores[t.id] != null);
  const hasUnevaluatedTasks = activeTasks.some(t => !evaluatedTaskIds.has(t.id));
  const allTasksEvaluated   = activeTasks.length > 0 && !hasUnevaluatedTasks;

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 90 }}>

      {/* ── ヘッダー ──────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'linear-gradient(135deg, #0f0c29 0%, #1e1b4b 70%, #312e81 100%)',
        borderBottom: '1px solid rgba(139,92,246,0.3)',
        padding: '14px 16px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 430, margin: '0 auto' }}>
          <button onClick={() => router.back()} style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft style={{ width: 18, height: 18, color: '#a78bfa' }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Swords style={{ width: 15, height: 15, color: '#6d28d9', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#7c6fad', letterSpacing: '0.06em' }}>閲覧中</span>
            </div>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: '#ede9fe', letterSpacing: '0.06em', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {targetName} のダッシュボード
            </h1>
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', borderRadius: 6, padding: '3px 7px', flexShrink: 0 }}>
            READ ONLY
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 430, margin: '0 auto', padding: '16px 16px 0' }}>

        {/* ── ★ 共通ステータスカード ────────────────────────────── */}
        {epithet ? (
          <div style={{ marginBottom: 14 }}>
            <UserStatusCard
              userName={targetName}
              epithet={epithet}
              totalXp={status.total_xp}
              level={level}
              realRank={status.real_rank}
              motto={status.motto}
              // rivals 画面では achiev バッジを非表示（自分のホーム画面のみ表示）
            />
            {/* 最終稽古日（rivals 画面のみ追加表示） */}
            {status.last_practice_date && (
              <div style={{
                marginTop: 8, padding: '7px 12px', borderRadius: 10,
                background: 'rgba(49,46,129,0.35)',
                border: '1px solid rgba(99,102,241,0.18)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(129,140,248,0.45)', letterSpacing: '0.04em' }}>
                  最終稽古:
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(199,210,254,0.8)' }}>
                  {status.last_practice_date
                    ? new Date(status.last_practice_date).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      }).replace(/\//g, '/')
                    : '---'}
                </span>
              </div>
            )}
          </div>
        ) : (
          /* epithet が null（技データなし）の場合の簡易ステータス表示 */
          <div style={{
            marginBottom: 14, padding: '16px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(30,27,75,0.9), rgba(49,46,129,0.7))',
            border: '1px solid rgba(139,92,246,0.3)',
          }}>
            <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#ede9fe' }}>{targetName}</p>
            <p style={{ margin: 0, fontSize: 13, color: '#a78bfa' }}>
              Lv.{status.level} ・ {status.total_xp.toLocaleString()} XP
            </p>
            {status.last_practice_date && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#7c6fad' }}>最終稽古: {status.last_practice_date}</p>
            )}
          </div>
        )}

        {/* ── 1. 現在の課題 + 他者評価 ──────────────────────────── */}
        <div className="wa-card" style={{
          background: 'linear-gradient(135deg, rgba(13,11,42,0.92), rgba(30,27,75,0.82))',
          border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: 16, padding: '14px 12px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd', letterSpacing: '0.06em' }}>
              現在の課題
              {isSelf && <span style={{ fontSize: 10, color: 'rgba(199,210,254,0.35)', marginLeft: 8 }}>READ ONLY</span>}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
              background: activeTasks.length > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)',
              border: activeTasks.length > 0 ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(148,163,184,0.25)',
              color: activeTasks.length > 0 ? '#86efac' : 'rgba(226,232,240,0.65)',
              borderRadius: 999, padding: '3px 8px', flexShrink: 0,
            }}>
              {activeTasks.length > 0 ? `${activeTasks.length} ACTIVE` : 'NONE'}
            </span>
          </div>

          {activeTasks.length === 0 && (
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(199,210,254,0.55)' }}>課題はまだ設定されていません</p>
          )}

          {activeTasks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeTasks.map((task, idx) => {
                const isEvaluated   = evaluatedTaskIds.has(task.id);
                const selectedScore = taskScores[task.id] ?? null;
                return (
                  <div key={task.id} style={{
                    padding: '10px 12px', borderRadius: 12,
                    background: isEvaluated ? 'rgba(34,197,94,0.07)' : 'rgba(49,46,129,0.35)',
                    border: isEvaluated ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(139,92,246,0.2)',
                    opacity: isEvaluated ? 0.75 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: isSelf ? 0 : 8 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, flexShrink: 0,
                        color: isEvaluated ? '#86efac' : '#a78bfa',
                        background: isEvaluated ? 'rgba(34,197,94,0.12)' : 'rgba(109,40,217,0.2)',
                        border: isEvaluated ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(109,40,217,0.35)',
                        borderRadius: 5, padding: '2px 6px', marginTop: 2,
                      }}>
                        {isEvaluated ? '評価済' : `課題 ${idx + 1}`}
                      </span>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: isEvaluated ? 'rgba(199,210,254,0.55)' : '#ede9fe', lineHeight: 1.35, wordBreak: 'break-word', flex: 1 }}>
                        {task.task_text}
                      </p>
                    </div>
                    {!isSelf && !isEvaluated && (
                      <>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                          {[1,2,3,4,5].map(s => {
                            const filled = selectedScore !== null && s <= selectedScore;
                            return (
                              <button key={s}
                                onClick={() => setTaskScores(prev => ({ ...prev, [task.id]: prev[task.id] === s ? null : s }))}
                                disabled={evalLoading}
                                style={{
                                  width: 40, height: 40, borderRadius: 10,
                                  border: filled ? '1px solid rgba(251,191,36,0.6)' : '1px solid rgba(139,92,246,0.3)',
                                  background: filled ? 'linear-gradient(135deg, rgba(180,130,0,0.25), rgba(251,191,36,0.18))' : 'rgba(30,27,75,0.5)',
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                                  cursor: evalLoading ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.15s ease',
                                  transform: filled ? 'scale(1.08)' : 'scale(1)',
                                  padding: 0,
                                }}
                              >
                                <Star style={{ width: 18, height: 18, color: filled ? '#fbbf24' : 'rgba(139,92,246,0.5)', fill: filled ? '#fbbf24' : 'transparent' }} />
                                <span style={{ fontSize: 8, fontWeight: 700, color: filled ? '#fde68a' : 'rgba(139,92,246,0.5)' }}>{s}</span>
                              </button>
                            );
                          })}
                        </div>
                        {selectedScore !== null && (
                          <p style={{ margin: '6px 0 0', fontSize: 10, textAlign: 'center', fontWeight: 700, color: '#fde68a' }}>
                            {SCORE_LABELS[selectedScore]}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!isSelf && activeTasks.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {evalResult && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, marginBottom: 10 }}>
                  <CheckCircle style={{ width: 16, height: 16, color: '#86efac', flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#86efac' }}>{evalResult.count}件の課題を評価しました！</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(134,239,172,0.7)' }}>{targetName} に +{evalResult.xp} XP（×{evalResult.mult} 倍率）</p>
                  </div>
                </div>
              )}
              {evalError && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, marginBottom: 10 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#fca5a5' }}>{evalError}</p>
                </div>
              )}
              {allTasksEvaluated && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#86efac', fontSize: 13, fontWeight: 800 }}>
                  <CheckCircle style={{ width: 15, height: 15 }} />
                  本日の全課題を評価済み
                </div>
              )}
              {!allTasksEvaluated && (
                <>
                  <p style={{ margin: '0 0 10px', fontSize: 11, color: 'rgba(199,210,254,0.55)' }}>各課題の取り組みを評価してください（複数選択可）</p>
                  <button
                    onClick={handleEvaluate}
                    disabled={evalLoading || !hasSelectableItems}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '12px 16px', borderRadius: 12,
                      border: hasSelectableItems ? '1px solid rgba(251,191,36,0.5)' : '1px solid rgba(100,100,120,0.3)',
                      background: hasSelectableItems ? 'linear-gradient(135deg, rgba(120,80,0,0.35), rgba(251,191,36,0.2))' : 'rgba(30,27,75,0.4)',
                      color: hasSelectableItems ? '#fde68a' : 'rgba(199,210,254,0.3)',
                      fontSize: 13, fontWeight: 800, letterSpacing: '0.05em',
                      cursor: (evalLoading || !hasSelectableItems) ? 'not-allowed' : 'pointer',
                      opacity: evalLoading ? 0.7 : 1,
                    }}
                  >
                    {evalLoading ? (
                      <>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(251,191,36,0.3)', borderTopColor: '#fbbf24', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                        送信中…
                      </>
                    ) : hasSelectableItems ? (
                      <>
                        <Star style={{ width: 15, height: 15, fill: '#fbbf24', color: '#fbbf24' }} />
                        {activeTasks.filter(t => !evaluatedTaskIds.has(t.id) && taskScores[t.id] != null).length}件の課題を評価する
                      </>
                    ) : (
                      <>
                        <Star style={{ width: 15, height: 15 }} />
                        評価したい課題のスコアを選んでください
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── 2. スキルグリッド ────────────────────────────────── */}
        {mounted && techniques.length > 0 && (
          <div className="wa-card" style={{ borderRadius: 16, padding: '14px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Swords style={{ width: 15, height: 15, color: '#a78bfa' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.05em' }}>技の習熟度</span>
              </div>
              <span style={{ fontSize: 9, color: '#6d28d9', fontWeight: 700, background: 'rgba(109,40,217,0.12)', border: '1px solid rgba(109,40,217,0.25)', borderRadius: 5, padding: '2px 6px' }}>
                VIEW ONLY
              </span>
            </div>
            <div style={{ pointerEvents: 'none', userSelect: 'none' }}>
              <SkillGrid techniques={techniques} signatureTechId={status.favorite_technique ?? undefined} />
            </div>
          </div>
        )}

        {/* ── 3. XP推移チャート ──────────────────────────────── */}
        {/*
         * ★ Phase9.5: XpHistoryEntry から title が削除されたため、
         * titleMaster を渡して Tooltip 内で動的に称号を導出する。
         */}
        {mounted && xpHistory && xpHistory.length > 0 && (
          <div className="wa-card" style={{ borderRadius: 16, padding: '14px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <TrendingUp style={{ width: 15, height: 15, color: '#a78bfa' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.05em' }}>XP推移</span>
            </div>
            <XPTimelineChart xpHistory={xpHistory} compact titleMaster={tm} />
          </div>
        )}

        {/* ── 4. 課題別 評価スコア分布 ───────────────────────── */}
        {mounted && (
          <div className="wa-card" style={{ borderRadius: 16, padding: '14px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Star style={{ width: 15, height: 15, color: '#a78bfa' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.05em' }}>課題別 評価スコア分布（直近50回）</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {([5,4,3,2,1] as const).map(n => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: SCORE_COLORS[n], flexShrink: 0 }} />
                  <span style={{ fontSize: '0.6rem', color: 'rgba(199,210,254,0.5)', fontWeight: 600 }}>{n}</span>
                </div>
              ))}
            </div>
            {hasScoreData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scoreDistData.map(({ taskText, dist, totalPts, totalCount }) => (
                  <div key={taskText} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: '0 0 30%', minWidth: 0, fontSize: '0.72rem', fontWeight: 700, color: 'rgba(199,210,254,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {taskText}
                    </div>
                    <div style={{ flex: '0 0 55%', minWidth: 0, height: 12, borderRadius: 6, overflow: 'hidden', background: 'rgba(99,102,241,0.1)', display: 'flex' }}>
                      {totalCount > 0
                        ? ([5,4,3,2,1] as const).map(score => {
                            const pct = (dist[score] / totalCount) * 100;
                            if (pct <= 0) return null;
                            return <div key={score} title={`評価${score}: ${dist[score]}回`} style={{ width: `${pct}%`, background: SCORE_COLORS[score], flexShrink: 0 }} />;
                          })
                        : <div style={{ width: '100%', background: 'rgba(99,102,241,0.08)', borderRadius: 6 }} />}
                    </div>
                    <div style={{ flex: '0 0 15%', textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, color: totalCount > 0 ? '#a5b4fc' : 'rgba(99,102,241,0.25)', whiteSpace: 'nowrap' }}>
                      {totalCount > 0 ? `${totalPts} pt` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'rgba(99,102,241,0.4)', padding: '1.5rem 0', margin: 0 }}>
                稽古ログがまだ記録されていません
              </p>
            )}
          </div>
        )}

        {/* ── 5. プレイスタイル分析 ───────────────────────────── */}
        {mounted && techniques.length > 0 && epithetMaster && (
          <div className="wa-card" style={{ borderRadius: 16, padding: '14px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Trophy style={{ width: 15, height: 15, color: '#a78bfa' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.05em' }}>プレイスタイル分析</span>
            </div>
            <PlaystyleCharts techniques={techniques} />
          </div>
        )}

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
