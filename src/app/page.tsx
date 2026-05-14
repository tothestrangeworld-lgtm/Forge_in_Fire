// src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { RotateCcw, Loader2, TrendingDown, Settings } from 'lucide-react';
import Link from 'next/link';
import type { EpithetMasterEntry, UserTask, Achievement } from '@/types';
import {
  calcLevelFromXp, calcNextLevel, levelColor, resolveTechniqueName,
} from '@/types';
import { useDashboardSWR, resetStatus, fetchAchievements } from '@/lib/api';
import { calcEpithet } from '@/lib/epithet';
import type { EpithetResult } from '@/lib/epithet';
import { calcMasteryStatus } from '@/lib/mastery';
import { getAuthUser } from '@/lib/auth';
import { UserStatusCard } from '@/components/UserStatusCard';
import { TaskScoreDistCard } from '@/components/TaskScoreDistCard';
import dynamic from 'next/dynamic';

const XPTimelineChart = dynamic(() => import('@/components/charts/XPTimelineChart'), { ssr: false });
const SkillGrid       = dynamic(() => import('@/components/charts/SkillGrid'),       { ssr: false, loading: () => <ChartSkeleton h={380} /> });
const PlaystyleCharts = dynamic(() => import('@/components/charts/PlaystyleCharts'), { ssr: false, loading: () => <ChartSkeleton h={180} /> });

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

  const activeTasks: UserTask[] = (tasks ?? []).filter(t => t.status === 'active');
  const peerLogs = data.peerLogs ?? [];

  // スコア分布データの算出
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
    return {
      taskText: t.task_text,
      selfDist, selfTotalPts, selfTotalCount,
      peerDist, peerTotalPts, peerTotalCount,
    };
  });

  const hasScoreData = scoreDistData.some(d => d.selfTotalCount > 0 || d.peerTotalCount > 0);
  const isDecaying   = (decay?.days_absent ?? 0) > 3;

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
          <h1 className="kanji-title" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>百錬自得</h1>
        </div>
        <button
          onClick={() => setShowReset(v => !v)}
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: '1.5px solid rgba(99,102,241,0.2)',
            background: 'rgba(15,14,42,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'rgba(99,102,241,0.5)',
          }}
        >
          <RotateCcw style={{ width: 14, height: 14 }} />
        </button>
      </header>

      {showReset && (
        <div className="hud-card animate-fade-up" style={{ marginBottom: '0.75rem', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p style={{ fontWeight: 700, color: '#f87171', fontSize: '0.85rem', margin: '0 0 6px' }}>⚠️ レベルリセット</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowReset(false)}
              style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(15,14,42,0.6)', cursor: 'pointer', fontSize: '0.8rem', color: 'rgba(129,140,248,0.6)' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.15)', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
            >
              リセットする
            </button>
          </div>
        </div>
      )}

      {/* 減衰警告 */}
      {isDecaying && (
        <div className="hud-card animate-fade-up" style={{ marginBottom: '0.75rem', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingDown color="#f87171" size={20} />
          <p style={{ color: '#f87171', fontSize: '0.8rem', margin: 0, fontWeight: 700 }}>
            稽古の間隔が空いているため、XPが減衰しています。
          </p>
        </div>
      )}

      {/* UserStatusCard（showSettingsLink=true で歯車アイコンを表示） */}
      <div className="animate-fade-up delay-100" style={{ marginBottom: '0.75rem' }}>
        <UserStatusCard
          userName={user?.name ?? '剣士'}
          epithet={epithet}
          totalXp={status.total_xp}
          level={level}
          realRank={status.real_rank}
          motto={status.motto}
          achiev={achiev}
          showSettingsLink={true}
        />
      </div>

      {/* ★ Phase-ex3: 課題別評価スコア分布 — TaskScoreDistCard へ移譲 */}
      <div className="hud-card animate-fade-up delay-300" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="section-title">課題別 評価スコア分布（直近50回）</span>
          <Link
            href="/settings/tasks"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26,
              borderRadius: 7,
              border: '1px solid rgba(99,102,241,0.25)',
              background: 'rgba(15,14,42,0.6)',
              color: 'rgba(99,102,241,0.55)',
              textDecoration: 'none',
              flexShrink: 0,
            }}
            title="課題登録設定へ"
            aria-label="課題登録設定へ"
          >
            <Settings style={{ width: 13, height: 13 }} />
          </Link>
        </div>

        {hasScoreData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {scoreDistData.map(({
              taskText,
              selfDist, selfTotalPts, selfTotalCount,
              peerDist, peerTotalPts, peerTotalCount,
            }) => {
              // インサイト判定
              let insight = '';
              if (peerTotalCount > 0 && selfTotalCount > 0) {
                const s = selfTotalPts / selfTotalCount;
                const p = peerTotalPts / peerTotalCount;
                if (p - s >= 1.0) insight = '【過小評価】剣友評価 >> 自己評価';
                else if (s - p >= 1.0) insight = '【過大評価】自己評価 >> 剣友評価';
                else insight = '【明鏡止水】自己評価 ≒ 剣友評価';
              }

              // 進捗ステータス
              const mastery = calcMasteryStatus(logs ?? [], taskText);

              return (
                <TaskScoreDistCard
                  key={taskText}
                  taskText={taskText}
                  selfDist={selfDist}
                  selfTotalPts={selfTotalPts}
                  selfTotalCount={selfTotalCount}
                  peerDist={peerDist}
                  peerTotalPts={peerTotalPts}
                  peerTotalCount={peerTotalCount}
                  mastery={mastery}
                  insight={insight}
                />
              );
            })}
          </div>
        ) : (
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'rgba(99,102,241,0.4)', padding: '1.5rem 0', margin: 0 }}>
            評価項目を設定して稽古を記録すると、ここにスコア分布が表示されます
          </p>
        )}
      </div>

      {/* XP推移グラフ */}
      {xpHistory && xpHistory.length > 0 && (
        <div className="hud-card animate-fade-up delay-300" style={{ marginBottom: '1rem' }}>
          <span className="section-title">XP獲得推移</span>
          <div style={{ height: 160, marginTop: 12 }}>
            <XPTimelineChart xpHistory={xpHistory} />
          </div>
        </div>
      )}

      {/* SkillGrid（技の修練度） */}
      {techniques.length > 0 && (
        <div className="hud-card animate-fade-up delay-300" style={{ marginBottom: '1rem' }}>
          <span className="section-title">Skill Grid</span>
          <div style={{ height: 380, marginTop: 12 }}>
          <SkillGrid
            techniques={techniques}
            signatureTechId={status.favorite_technique}
            receivedStats={data.receivedStats}
          />
          </div>
        </div>
      )}

      {/* プレイスタイル分析 */}
      {techniques.length > 0 && (
        <div className="hud-card animate-fade-up delay-300" style={{ marginBottom: '1rem' }}>
          <span className="section-title">PLAY STYLE</span>
          <PlaystyleCharts
            techniques={techniques}
            matchupMaster={matchupMaster}
            peersStyle={peersStyle}
            techniqueMaster={techMaster}
            receivedStats={data.receivedStats}
          />
        </div>
      )}

    </div>
  );
}

// ユーティリティ・スケルトン等
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
