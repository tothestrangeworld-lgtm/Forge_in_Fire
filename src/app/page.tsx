// src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { RotateCcw, Loader2, TrendingDown } from 'lucide-react';
import type { EpithetMasterEntry, UserTask, Achievement } from '@/types';
import {
  calcLevelFromXp, calcNextLevel, levelColor, resolveTechniqueName,
} from '@/types';
import { useDashboardSWR, resetStatus, fetchAchievements } from '@/lib/api';
import { calcEpithet } from '@/lib/epithet';
import type { EpithetResult } from '@/lib/epithet';
import { getAuthUser } from '@/lib/auth';
import { UserStatusCard } from '@/components/UserStatusCard';
import dynamic from 'next/dynamic';

const XPTimelineChart = dynamic(() => import('@/components/charts/XPTimelineChart'), { ssr: false });
const SkillGrid       = dynamic(() => import('@/components/charts/SkillGrid'),       { ssr: false, loading: () => <ChartSkeleton h={500} /> });
const PlaystyleCharts = dynamic(() => import('@/components/charts/PlaystyleCharts'), { ssr: false, loading: () => <ChartSkeleton h={180} /> });

const SCORE_COLORS: Record<number, string> = {
  5: '#4f46e5', 4: '#6366f1', 3: '#818cf8', 2: '#c7d2fe', 1: '#e0e7ff',
};

export default function DashboardPage() {
  const [resetting, setReset]     = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [achiev, setAchiev]       = useState<{ unlocked: number; total: number } | null>(null);
  const user = getAuthUser();

  const { data: swrData, error: swrError, isLoading, mutate } = useDashboardSWR();

  const data       = swrData?.dashboard ?? null;
  const techniques = swrData?.techniques ?? [];

  const error = swrError instanceof Error && swrError.message !== 'AUTH_REQUIRED'
    ? swrError.message
    : null;

  useEffect(() => {
    fetchAchievements()
      .then((list: Achievement[]) =>
        setAchiev({ unlocked: list.filter(a => a.isUnlocked).length, total: list.length })
      )
      .catch(() => setAchiev({ unlocked: 0, total: 0 }));
  }, []);

  if (isLoading) return <DashboardSkeleton />;
  if (error)     return <ErrorState message={error} />;
  if (!data)     return null;

  const { status, logs, decay, xpHistory, tasks } = data;
  const tm         = data.titleMaster;
  const em         = data.epithetMaster ?? [] as EpithetMasterEntry[];
  const techMaster = data.techniqueMaster ?? [];
  const level      = calcLevelFromXp(status.total_xp);

  const matchupMaster = data.matchupMaster ?? [];
  const peersStyle    = data.peersStyle    ?? [];

  const epithet: EpithetResult = calcEpithet(techniques, em, level, tm);

  const today  = new Date(); today.setHours(0,0,0,0);
  const dow    = today.getDay();
  const monday = new Date(today); monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const thisWeek = new Set(
    logs.filter(l => {
      const d = new Date(l.date); d.setHours(0,0,0,0);
      return d >= monday && d <= sunday && d <= today;
    }).map(l => l.date)
  ).size;
  const streak        = calcStreak(logs.map(l => l.date));
  const totalSessions = new Set(logs.map(l => l.date)).size;
  const avgScore      = logs.length > 0
    ? (logs.reduce((a, b) => a + b.score, 0) / logs.length).toFixed(1) : '—';

  const activeTasks: UserTask[] = (tasks ?? []).filter(t => t.status === 'active');
  const peerLogs = data.peerLogs ?? [];

  const scoreDistData = activeTasks.map(t => {
    const selfDist: Record<number, number> = { 1:0,2:0,3:0,4:0,5:0 };
    let selfTotalPts = 0, selfTotalCount = 0;
    (logs ?? []).slice(-50).forEach(l => {
      if (l.item_name === t.task_text) {
        const s = l.score as number;
        if (s >= 1 && s <= 5) selfDist[s] = (selfDist[s] ?? 0) + 1;
        selfTotalPts += s; selfTotalCount++;
      }
    });
    const peerDist: Record<number, number> = { 1:0,2:0,3:0,4:0,5:0 };
    let peerTotalPts = 0, peerTotalCount = 0;
    peerLogs.slice(-50).forEach(l => {
      if (l.item_name === t.task_text) {
        const s = l.score as number;
        if (s >= 1 && s <= 5) peerDist[s] = (peerDist[s] ?? 0) + 1;
        peerTotalPts += s; peerTotalCount++;
      }
    });
    return { taskText: t.task_text, dist: selfDist, totalPts: selfTotalPts, totalCount: selfTotalCount,
             peerDist, peerTotalPts, peerTotalCount };
  });
  const hasScoreData = scoreDistData.some(d => d.totalCount > 0 || d.peerTotalCount > 0);

  const isDecaying   = (decay?.days_absent ?? 0) > 3;
  const decayPerDay  = decay?.today_penalty ?? 0;
  const appliedToday = decay?.applied ?? 0;

  async function handleReset() {
    if (!confirm('レベルとXPをリセットします。稽古ログは残ります。よろしいですか？')) return;
    setReset(true);
    try { await resetStatus(); await mutate(); }
    finally { setReset(false); setShowReset(false); }
  }

  return (
    <div className="animate-fade-up" style={{ padding: '1.5rem 1rem 0' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div>
          <span className="section-title">稽古記録アプリ</span>
          <h1 className="kanji-title" style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
            百錬自得
          </h1>
        </div>
        <button
          onClick={() => setShowReset(v => !v)}
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: '1.5px solid rgba(99,102,241,0.2)',
            background: 'rgba(15,14,42,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'rgba(99,102,241,0.5)', flexShrink: 0,
          }}
          title="リセット設定"
        >
          <RotateCcw style={{ width: 14, height: 14 }} />
        </button>
      </header>

      {showReset && (
        <div className="hud-card animate-fade-up" style={{ marginBottom: '0.75rem', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p style={{ fontWeight: 700, color: '#f87171', fontSize: '0.85rem', margin: '0 0 6px' }}>⚠️ レベルリセット</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowReset(false)} style={{
              flex: 1, padding: '8px', borderRadius: 8,
              border: '1px solid rgba(99,102,241,0.2)',
              background: 'rgba(15,14,42,0.6)', cursor: 'pointer',
              fontSize: '0.8rem', color: 'rgba(129,140,248,0.6)',
            }}>キャンセル</button>
            <button onClick={handleReset} disabled={resetting} style={{
              flex: 1, padding: '8px', borderRadius: 8,
              border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.15)', color: '#f87171',
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
            }}>リセットする</button>
          </div>
        </div>
      )}

      {isDecaying && (
        <div className="animate-fade-up" style={{
          marginBottom: '0.75rem', borderRadius: 14,
          background: decayPerDay >= 100 ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.07)',
          border: `1.5px solid ${decayPerDay >= 100 ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.25)'}`,
          padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: decayPerDay >= 100 ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingDown style={{ width: 18, height: 18, color: decayPerDay >= 100 ? '#f87171' : '#fbbf24' }} />
          </div>
          <div>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: decayPerDay >= 100 ? '#f87171' : '#fbbf24', margin: 0 }}>{decay?.days_absent}日間稽古していません</p>
          </div>
        </div>
      )}

      <div className="animate-fade-up delay-100" style={{ marginBottom: '0.75rem' }}>
        <UserStatusCard
          userName={user?.name ?? '剣士'}
          epithet={epithet}
          totalXp={status.total_xp}
          level={level}
          realRank={status.real_rank}
          motto={status.motto}
          achiev={achiev}
        />
      </div>

      <div className="hud-card animate-fade-up delay-300" style={{ marginBottom: '1rem' }}>
        <span className="section-title">課題別 評価スコア分布（直近50回）</span>
        {hasScoreData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {scoreDistData.map(({ taskText, totalPts, totalCount, peerTotalPts, peerTotalCount }) => {
              const selfAvg = totalCount > 0 ? totalPts / totalCount : 0;
              const peerAvg = peerTotalCount > 0 ? peerTotalPts / peerTotalCount : 0;
              let insight = '';
              if (peerTotalCount > 0) {
                if (peerAvg - selfAvg >= 1.0) insight = '【過小評価】剣友評価 >> 自己評価';
                else if (selfAvg - peerAvg >= 1.0) insight = '【過大評価】自己評価 >> 剣友評価';
                else insight = '【明鏡止水】自己評価 ≒ 剣友評価';
              }
              return (
                <div key={taskText}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#c7d2fe' }}>{taskText}</div>
                    <div style={{ fontSize: '0.7rem', color: '#818cf8' }}>S:{selfAvg.toFixed(1)} / P:{peerAvg > 0 ? peerAvg.toFixed(1) : '—'}</div>
                  </div>
                  {insight && (
                    <div style={{ fontSize: '10px', color: '#6366f1', marginTop: 2, fontWeight: 600, letterSpacing: '0.02em' }}>
                      {insight}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'rgba(99,102,241,0.4)', padding: '1.5rem 0', margin: 0 }}>
            評価項目を設定して稽古を記録すると、ここにスコア分布が表示されます
          </p>
        )}
      </div>

      {techniques.length > 0 && (
        <div className="hud-card animate-fade-up delay-300" style={{ marginBottom: '1rem' }}>
          <span className="section-title">プレイスタイル分析</span>
          <PlaystyleCharts techniques={techniques} matchupMaster={matchupMaster} peersStyle={peersStyle} techniqueMaster={techMaster} />
        </div>
      )}
    </div>
  );
}

function calcStreak(dates: string[]): number {
  const unique = [...new Set(dates)].sort().reverse();
  if (!unique.length) return 0;
  const today = new Date(); today.setHours(0,0,0,0);
  let streak = 0;
  for (let i = 0; i < unique.length; i++) {
    const d = new Date(unique[i]); d.setHours(0,0,0,0);
    const expected = new Date(today); expected.setDate(today.getDate() - i);
    if (d.getTime() === expected.getTime()) streak++; else break;
  }
  return streak;
}

function ChartSkeleton({ h }: { h: number }) {
  return <div style={{ height: h, borderRadius: 16, background: 'rgba(99,102,241,0.06)' }} />;
}

function DashboardSkeleton() {
  return <div style={{ padding: '1.5rem 1rem' }}><div style={{ height: 200, borderRadius: 16, background: 'rgba(99,102,241,0.06)' }} /></div>;
}

function ErrorState({ message }: { message: string }) {
  return <div style={{ padding: '5rem 2rem', textAlign: 'center' }}>{message}</div>;
}
