'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Flame, RotateCcw, Loader2, TrendingDown } from 'lucide-react';
import type { DashboardData } from '@/types';
import {
  calcLevelFromXp, calcProgressPercent, calcNextLevel,
  titleForLevel, nextTitleLevel, levelColor,
} from '@/types';
import { fetchDashboard, resetStatus } from '@/lib/api';
import dynamic from 'next/dynamic';

const RadarChart      = dynamic(() => import('@/components/charts/RadarChart'),      { ssr: false });
const ActivityHeatmap = dynamic(() => import('@/components/charts/ActivityHeatmap'), { ssr: false });

export default function DashboardPage() {
  const [data, setData]           = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [resetting, setReset]     = useState(false);
  const [showReset, setShowReset] = useState(false);

  const load = () => {
    setLoading(true);
    fetchDashboard()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <DashboardSkeleton />;
  if (error)   return <ErrorState message={error} />;
  if (!data)   return null;

  const { status, logs, settings, decay } = data;
  const level       = calcLevelFromXp(status.total_xp);
  const title       = titleForLevel(level);
  const nextLv      = calcNextLevel(status.total_xp);
  const progressPct = calcProgressPercent(status.total_xp);
  const nextTitle   = nextTitleLevel(level);
  const color       = levelColor(level);

  // 今週の稽古（今週月曜〜今週日曜・今日以前のみ）
  const today = new Date(); today.setHours(0,0,0,0);
  const dow   = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const thisWeek = new Set(
    logs.filter(l => {
      const d = new Date(l.date); d.setHours(0,0,0,0);
      return d >= monday && d <= sunday && d <= today;
    }).map(l => l.date)
  ).size;

  const streak = calcStreak(logs.map(l => l.date));

  // レーダーチャート用
  const activeItems = settings.filter(s => s.is_active).map(s => s.item_name);
  const totals: Record<string, { sum: number; count: number }> = {};
  activeItems.forEach(i => { totals[i] = { sum: 0, count: 0 }; });
  logs.slice(-50).forEach(l => {
    if (totals[l.item_name]) { totals[l.item_name].sum += l.score; totals[l.item_name].count++; }
  });
  const radarData = activeItems.map(item => ({
    subject:  item,
    score:    totals[item].count > 0 ? +(totals[item].sum / totals[item].count).toFixed(1) : 0,
    fullMark: 5,
  }));
  const hasRadarData = radarData.some(d => d.score > 0);

  // 減衰状態
  const isDecaying   = (decay?.days_absent ?? 0) > 3;
  const decayPerDay  = decay?.today_penalty ?? 0;
  const appliedToday = decay?.applied ?? 0;

  async function handleReset() {
    if (!confirm('レベルとXPをリセットします。稽古ログは残ります。よろしいですか？')) return;
    setReset(true);
    try { await resetStatus(); load(); }
    finally { setReset(false); setShowReset(false); }
  }

  return (
    <div className="animate-fade-up" style={{ padding: '1.5rem 1rem 0' }}>

      {/* ヘッダー */}
      <header style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <div>
          <span className="section-title">稽古記録アプリ</span>
          <h1 style={{ fontSize:'1.75rem', fontWeight:800, color:'var(--ai)', letterSpacing:'-0.02em', lineHeight:1.2, margin:0 }}>
            百錬自得
          </h1>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ textAlign:'right' }}>
            <span style={{ display:'inline-block', fontSize:'0.7rem', fontWeight:700, padding:'0.25rem 0.75rem', borderRadius:999, background:color, color:'#fff' }}>
              {title}
            </span>
            <p style={{ fontSize:'0.7rem', color:'#a8a29e', marginTop:4, textAlign:'right' }}>Lv.{level}</p>
          </div>
          <button
            onClick={() => setShowReset(v => !v)}
            style={{ width:32, height:32, borderRadius:8, border:'1.5px solid #e0e7ff', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#a5b4fc', flexShrink:0 }}
            title="リセット設定"
          >
            <RotateCcw style={{ width:14, height:14 }} />
          </button>
        </div>
      </header>

      {/* リセットパネル */}
      {showReset && (
        <div className="wa-card animate-fade-up" style={{ marginBottom:'0.75rem', border:'1.5px solid #fee2e2', background:'#fff5f5' }}>
          <p style={{ fontWeight:700, color:'#991b1b', fontSize:'0.85rem', margin:'0 0 6px' }}>⚠️ レベルリセット</p>
          <p style={{ fontSize:'0.75rem', color:'#78716c', margin:'0 0 12px' }}>
            XP・レベル・称号を初期値に戻します。稽古ログは削除されません。
          </p>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowReset(false)} style={{ flex:1, padding:'8px', borderRadius:8, border:'1.5px solid #e0e7ff', background:'#fff', cursor:'pointer', fontSize:'0.8rem', fontFamily:'inherit', fontWeight:600, color:'#78716c' }}>
              キャンセル
            </button>
            <button onClick={handleReset} disabled={resetting} style={{ flex:1, padding:'8px', borderRadius:8, border:'none', background:'#dc2626', color:'#fff', cursor:'pointer', fontSize:'0.8rem', fontFamily:'inherit', fontWeight:700 }}>
              {resetting ? <Loader2 style={{ width:14, height:14, animation:'spin .8s linear infinite' }} /> : 'リセットする'}
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </button>
          </div>
        </div>
      )}

      {/* 減衰警告バナー */}
      {isDecaying && (
        <div
          className="animate-fade-up"
          style={{
            marginBottom:'0.75rem', borderRadius:14,
            background: decayPerDay >= 100 ? '#fef2f2' : '#fffbeb',
            border: `1.5px solid ${decayPerDay >= 100 ? '#fca5a5' : '#fde68a'}`,
            padding:'0.75rem 1rem',
            display:'flex', alignItems:'center', gap:10,
          }}
        >
          <div style={{ width:36, height:36, borderRadius:10, background: decayPerDay >= 100 ? '#fee2e2' : '#fef3c7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <TrendingDown style={{ width:18, height:18, color: decayPerDay >= 100 ? '#dc2626' : '#d97706' }} />
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:'0.8rem', fontWeight:700, color: decayPerDay >= 100 ? '#991b1b' : '#92400e', margin:'0 0 2px' }}>
              {decay?.days_absent}日間稽古していません
            </p>
            <p style={{ fontSize:'0.68rem', color: decayPerDay >= 100 ? '#b91c1c' : '#b45309', margin:0 }}>
              現在 <span style={{ fontWeight:700 }}>-{decayPerDay} XP/日</span> ペースで減少中
              {appliedToday > 0 && ` （本日 -${appliedToday} XP 適用済み）`}
            </p>
          </div>
        </div>
      )}

      {/* XPカード */}
      <div className="wa-card animate-fade-up delay-100" style={{ marginBottom:'0.75rem', background:'linear-gradient(135deg,#1e1b4b 0%,#312e81 100%)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
          <div>
            <span className="section-title" style={{ color:'rgba(199,210,254,0.6)' }}>TOTAL XP</span>
            <p style={{ fontSize:'2.5rem', fontWeight:800, color:'#fff', margin:0, lineHeight:1 }}>
              {status.total_xp.toLocaleString()}
              <span style={{ fontSize:'0.9rem', fontWeight:500, color:'rgba(199,210,254,0.6)', marginLeft:4 }}>xp</span>
            </p>
          </div>
          <div style={{ width:52, height:52, borderRadius:14, background:'rgba(255,255,255,0.12)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2 }}>
            <span style={{ fontSize:'1.2rem', lineHeight:1 }}>⚔️</span>
            <span style={{ fontSize:'0.6rem', color:'#c7d2fe', fontWeight:700 }}>Lv.{level}</span>
          </div>
        </div>

        {nextLv && (
          <>
            <div className="xp-bar-track" style={{ background:'rgba(255,255,255,0.12)' }}>
              <div className="xp-bar-fill" style={{ width:`${progressPct}%`, background:'linear-gradient(90deg,#818cf8,#c7d2fe)' }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
              <p style={{ fontSize:'0.68rem', color:'rgba(199,210,254,0.55)', margin:0 }}>
                次のLv.{level+1}まで{' '}
                <span style={{ fontWeight:700, color:'#c7d2fe' }}>{(nextLv.xp - status.total_xp).toLocaleString()} xp</span>
              </p>
              {nextTitle && (
                <p style={{ fontSize:'0.68rem', color:'rgba(199,210,254,0.4)', margin:0 }}>
                  「{nextTitle.title}」→ Lv.{nextTitle.level}
                </p>
              )}
            </div>
          </>
        )}
        {!nextLv && (
          <p style={{ fontSize:'0.75rem', color:'#fde68a', fontWeight:700 }}>🏆 最高位「剣道の神」に到達！</p>
        )}
      </div>

      {/* 統計 */}
      <div className="animate-fade-up delay-200" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'0.75rem' }}>
        <StatCard icon={<Flame style={{width:20,height:20,color:'#f97316'}}/>}    bg="#fff7ed" label="連続稽古"   value={`${streak}日`}   />
        <StatCard icon={<TrendingUp style={{width:20,height:20,color:'#6366f1'}}/>} bg="#eef2ff" label="今週の稽古" value={`${thisWeek}回`} />
      </div>

      {/* レーダーチャート */}
      {hasRadarData && (
        <div className="wa-card animate-fade-up delay-200" style={{ marginBottom:'0.75rem' }}>
          <span className="section-title">直近の稽古バランス</span>
          <RadarChart data={radarData} />
        </div>
      )}

      {/* ヒートマップ */}
      <div className="wa-card animate-fade-up delay-300" style={{ marginBottom:'1rem' }}>
        <span className="section-title">稽古カレンダー</span>
        <ActivityHeatmap logs={logs} />
      </div>

    </div>
  );
}

function StatCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: string }) {
  return (
    <div className="wa-card" style={{ display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ width:40, height:40, borderRadius:12, background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize:'0.65rem', color:'#a8a29e', margin:0 }}>{label}</p>
        <p style={{ fontSize:'1.3rem', fontWeight:800, color:'var(--ai)', margin:0, lineHeight:1.2 }}>{value}</p>
      </div>
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
    if (d.getTime() === expected.getTime()) streak++;
    else break;
  }
  return streak;
}

function DashboardSkeleton() {
  return (
    <div style={{ padding:'1.5rem 1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
      {[28,110,80,220,180].map((h,i) => (
        <div key={i} style={{ height:h, borderRadius:16, background:'linear-gradient(90deg,#eef2ff,#e0e7ff,#eef2ff)', backgroundSize:'200%', animation:`shimmer 1.4s ${i*0.1}s infinite` }} />
      ))}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ padding:'5rem 2rem', textAlign:'center' }}>
      <p style={{ fontSize:'2.5rem', marginBottom:'1rem' }}>⚠️</p>
      <p style={{ fontWeight:700, color:'var(--ai)', marginBottom:8 }}>データ取得に失敗しました</p>
      <p style={{ fontSize:'0.75rem', color:'#a8a29e' }}>{message}</p>
      <a href="/debug" style={{ display:'inline-block', marginTop:16, fontSize:'0.75rem', color:'#6366f1', fontWeight:700 }}>
        🔍 ログを確認する
      </a>
    </div>
  );
}
