'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Flame, RotateCcw, Loader2, TrendingDown } from 'lucide-react';
import type { DashboardData, EpithetMasterEntry, Technique } from '@/types';
import {
  calcLevelFromXp, calcProgressPercent, calcNextLevel,
  titleForLevel, nextTitleLevel, levelColor,
} from '@/types';
import { fetchDashboard, resetStatus, fetchTechniques } from '@/lib/api';
import { calcEpithet } from '@/lib/epithet';
import dynamic from 'next/dynamic';

const RadarChart       = dynamic(() => import('@/components/charts/RadarChart'),       { ssr: false });
const XPTimelineChart  = dynamic(() => import('@/components/charts/XPTimelineChart'),  { ssr: false });
const SkillGrid        = dynamic(() => import('@/components/charts/SkillGrid'),        { ssr: false, loading: () => <ChartSkeleton h={500} /> });
const PlaystyleCharts  = dynamic(() => import('@/components/charts/PlaystyleCharts'),  { ssr: false, loading: () => <ChartSkeleton h={180} /> });

// =====================================================================
// メインページ
// =====================================================================
export default function DashboardPage() {
  const [data, setData]             = useState<DashboardData | null>(null);
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [resetting, setReset]       = useState(false);
  const [showReset, setShowReset]   = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([fetchDashboard(), fetchTechniques()])
      .then(([dash, techs]) => { setData(dash); setTechniques(techs); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <DashboardSkeleton />;
  if (error)   return <ErrorState message={error} />;
  if (!data)   return null;

  const { status, logs, settings, decay } = data;
  const tm          = data.titleMaster;
  const em          = data.epithetMaster ?? [] as EpithetMasterEntry[];
  const level       = calcLevelFromXp(status.total_xp);
  const title       = titleForLevel(level, tm);
  const nextLv      = calcNextLevel(status.total_xp, tm);
  const progressPct = calcProgressPercent(status.total_xp);
  const nextTitle   = nextTitleLevel(level, tm);
  const color       = levelColor(level);
  const epithet     = calcEpithet(techniques, em);

  // 統計
  const today = new Date(); today.setHours(0,0,0,0);
  const dow    = today.getDay();
  const monday = new Date(today); monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const thisWeek = new Set(
    logs.filter(l => { const d = new Date(l.date); d.setHours(0,0,0,0); return d >= monday && d <= sunday && d <= today; }).map(l => l.date)
  ).size;
  const streak  = calcStreak(logs.map(l => l.date));

  // 稽古評価レーダー用
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
  const hasRadarData = radarData.some(d => d.score > 0);

  // 減衰
  const isDecaying   = (decay?.days_absent ?? 0) > 3;
  const decayPerDay  = decay?.today_penalty ?? 0;
  const appliedToday = decay?.applied ?? 0;

  // 稽古統計
  const totalSessions = new Set(logs.map(l => l.date)).size;
  const avgScore      = logs.length > 0
    ? (logs.reduce((a, b) => a + b.score, 0) / logs.length).toFixed(1) : '—';

  async function handleReset() {
    if (!confirm('レベルとXPをリセットします。稽古ログは残ります。よろしいですか？')) return;
    setReset(true);
    try { await resetStatus(); load(); }
    finally { setReset(false); setShowReset(false); }
  }

  return (
    <div className="animate-fade-up" style={{ padding:'1.5rem 1rem 0' }}>

      {/* ── ① ステータスエリア ─────────────────────────── */}

      {/* ヘッダー行 */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
        <div>
          <span className="section-title">稽古記録アプリ</span>
          <h1 style={{ fontSize:'1.75rem', fontWeight:800, color:'var(--ai)', letterSpacing:'-0.02em', margin:0 }}>
            百錬自得
          </h1>
        </div>
        <button onClick={() => setShowReset(v => !v)}
          style={{ width:32, height:32, borderRadius:8, border:'1.5px solid #e0e7ff', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#a5b4fc', flexShrink:0 }}
          title="リセット設定">
          <RotateCcw style={{ width:14, height:14 }} />
        </button>
      </header>

      {/* リセットパネル */}
      {showReset && (
        <div className="wa-card animate-fade-up" style={{ marginBottom:'0.75rem', border:'1.5px solid #fee2e2', background:'#fff5f5' }}>
          <p style={{ fontWeight:700, color:'#991b1b', fontSize:'0.85rem', margin:'0 0 6px' }}>⚠️ レベルリセット</p>
          <p style={{ fontSize:'0.75rem', color:'#78716c', margin:'0 0 12px' }}>XP・レベル・称号を初期値に戻します。稽古ログは削除されません。</p>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowReset(false)} style={{ flex:1, padding:'8px', borderRadius:8, border:'1.5px solid #e0e7ff', background:'#fff', cursor:'pointer', fontSize:'0.8rem', fontFamily:'inherit', fontWeight:600, color:'#78716c' }}>キャンセル</button>
            <button onClick={handleReset} disabled={resetting} style={{ flex:1, padding:'8px', borderRadius:8, border:'none', background:'#dc2626', color:'#fff', cursor:'pointer', fontSize:'0.8rem', fontFamily:'inherit', fontWeight:700 }}>
              {resetting ? <Loader2 style={{ width:14, height:14, animation:'spin .8s linear infinite' }} /> : 'リセットする'}
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </button>
          </div>
        </div>
      )}

      {/* 減衰警告 */}
      {isDecaying && (
        <div className="animate-fade-up" style={{
          marginBottom:'0.75rem', borderRadius:14,
          background: decayPerDay >= 100 ? '#fef2f2' : '#fffbeb',
          border:`1.5px solid ${decayPerDay >= 100 ? '#fca5a5' : '#fde68a'}`,
          padding:'0.75rem 1rem', display:'flex', alignItems:'center', gap:10,
        }}>
          <div style={{ width:36, height:36, borderRadius:10, background: decayPerDay >= 100 ? '#fee2e2' : '#fef3c7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <TrendingDown style={{ width:18, height:18, color: decayPerDay >= 100 ? '#dc2626' : '#d97706' }} />
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:'0.8rem', fontWeight:700, color: decayPerDay >= 100 ? '#991b1b' : '#92400e', margin:'0 0 2px' }}>{decay?.days_absent}日間稽古していません</p>
            <p style={{ fontSize:'0.68rem', color: decayPerDay >= 100 ? '#b91c1c' : '#b45309', margin:0 }}>
              現在 <span style={{ fontWeight:700 }}>-{decayPerDay} XP/日</span> ペースで減少中
              {appliedToday > 0 && ` （本日 -${appliedToday} XP 適用済み）`}
            </p>
          </div>
        </div>
      )}

      {/* XP + 二つ名カード（統合） */}
      <div className="wa-card animate-fade-up delay-100" style={{
        marginBottom:'0.75rem',
        background:'linear-gradient(135deg,#1e1b4b 0%,#2d2666 100%)',
        border:'1px solid rgba(129,140,248,0.2)',
      }}>
        {/* 二つ名 + 称号 */}
        <div style={{ marginBottom:'0.85rem' }}>
          <span style={{ fontSize:'0.82rem', fontWeight:600, color:'#a5b4fc', letterSpacing:'0.06em', display:'block', lineHeight:1.3 }}>
            {epithet.name}
          </span>
          <span style={{ fontSize:'1.75rem', fontWeight:800, color:'#fff', letterSpacing:'-0.02em', display:'block', lineHeight:1.2 }}>
            {title}
          </span>
          <span style={{ fontSize:'0.65rem', color:'rgba(199,210,254,0.4)', display:'block', marginTop:2 }}>
            {epithet.description}
          </span>
        </div>

        {/* XP + プログレス */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.6rem' }}>
          <div>
            <span className="section-title" style={{ color:'rgba(199,210,254,0.5)' }}>TOTAL XP</span>
            <p style={{ fontSize:'2rem', fontWeight:800, color:'#fff', margin:0, lineHeight:1 }}>
              {status.total_xp.toLocaleString()}
              <span style={{ fontSize:'0.85rem', fontWeight:500, color:'rgba(199,210,254,0.5)', marginLeft:4 }}>xp</span>
            </p>
          </div>
          <div style={{ textAlign:'right' }}>
            <span style={{ display:'inline-block', fontSize:'0.68rem', fontWeight:700, padding:'0.2rem 0.65rem', borderRadius:999, background:color, color:'#fff' }}>{title}</span>
            <p style={{ fontSize:'0.65rem', color:'rgba(199,210,254,0.4)', marginTop:3 }}>Lv.{level}</p>
          </div>
        </div>

        {nextLv && (
          <>
            <div className="xp-bar-track" style={{ background:'rgba(255,255,255,0.12)' }}>
              <div className="xp-bar-fill" style={{ width:`${progressPct}%`, background:'linear-gradient(90deg,#818cf8,#c7d2fe)' }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
              <p style={{ fontSize:'0.65rem', color:'rgba(199,210,254,0.45)', margin:0 }}>
                次のLv.{level+1}まで <span style={{ fontWeight:700, color:'#c7d2fe' }}>{(nextLv.xp - status.total_xp).toLocaleString()} xp</span>
              </p>
              {nextTitle && <p style={{ fontSize:'0.65rem', color:'rgba(199,210,254,0.3)', margin:0 }}>「{nextTitle.title}」→ Lv.{nextTitle.level}</p>}
            </div>
          </>
        )}
        {!nextLv && <p style={{ fontSize:'0.75rem', color:'#fde68a', fontWeight:700, marginTop:6 }}>🏆 最高位「剣道の神」に到達！</p>}
      </div>

      {/* 統計ミニカード */}
      <div className="animate-fade-up delay-100" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:'0.75rem' }}>
        {[
          { icon:<Flame style={{width:16,height:16,color:'#f97316'}}/>, bg:'#fff7ed', label:'連続', value:`${streak}日` },
          { icon:<TrendingUp style={{width:16,height:16,color:'#6366f1'}}/>, bg:'#eef2ff', label:'今週', value:`${thisWeek}回` },
          { icon:<span style={{fontSize:14}}>⚔️</span>, bg:'#f0fdf4', label:'総稽古', value:`${totalSessions}回` },
          { icon:<span style={{fontSize:14}}>📊</span>, bg:'#fdf4ff', label:'平均', value:String(avgScore) },
        ].map(({ icon, bg, label, value }) => (
          <div key={label} className="wa-card" style={{ padding:'0.6rem 0.4rem', textAlign:'center' }}>
            <div style={{ width:28, height:28, borderRadius:8, background:bg, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 4px' }}>{icon}</div>
            <p style={{ fontSize:'0.6rem', color:'#a8a29e', margin:0 }}>{label}</p>
            <p style={{ fontSize:'0.9rem', fontWeight:800, color:'var(--ai)', margin:0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── ② スキルグリッドエリア ─────────────────────── */}
      <div className="animate-fade-up delay-200" style={{ marginBottom:'0.75rem' }}>
        <span className="section-title">スキルグリッド</span>
        <SkillGrid techniques={techniques} />
        <p style={{ fontSize:'0.62rem', color:'#a8a29e', marginTop:5, textAlign:'right' }}>
          ピンチ/スクロールで拡大・縮小
        </p>
      </div>

      {/* ── ③ 分析エリア ─────────────────────────────── */}

      {/* プレイスタイル分析 */}
      {techniques.length > 0 && (
        <div className="animate-fade-up delay-200" style={{
          marginBottom:'0.75rem', padding:'0.85rem 1rem',
          borderRadius:16, background:'linear-gradient(135deg,#0d0b2a,#1a1744)',
          border:'1px solid rgba(99,102,241,0.2)',
        }}>
          <span className="section-title">プレイスタイル分析</span>
          <PlaystyleCharts techniques={techniques} />
        </div>
      )}

      {/* 稽古評価レーダー + XP推移 */}
      <div className="wa-card animate-fade-up delay-300" style={{ marginBottom:'0.75rem' }}>
        <span className="section-title">稽古スコアバランス（直近50回）</span>
        {hasRadarData
          ? <RadarChart data={radarData} />
          : <p style={{ textAlign:'center', fontSize:'0.82rem', color:'#a8a29e', padding:'1.5rem 0' }}>稽古を記録するとグラフが表示されます</p>
        }
      </div>

      <div className="wa-card animate-fade-up delay-300" style={{ marginBottom:'1rem' }}>
        <span className="section-title">XP推移</span>
        <XPTimelineChart logs={logs} compact={true} />
      </div>

    </div>
  );
}

// =====================================================================
// ユーティリティ
// =====================================================================
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

function StatCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: string }) {
  return (
    <div className="wa-card" style={{ display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ width:40, height:40, borderRadius:12, background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{icon}</div>
      <div>
        <p style={{ fontSize:'0.65rem', color:'#a8a29e', margin:0 }}>{label}</p>
        <p style={{ fontSize:'1.3rem', fontWeight:800, color:'var(--ai)', margin:0, lineHeight:1.2 }}>{value}</p>
      </div>
    </div>
  );
}

// =====================================================================
// ローディング・エラー・スケルトン
// =====================================================================
function ChartSkeleton({ h }: { h: number }) {
  return (
    <div style={{ height:h, borderRadius:16, background:'linear-gradient(90deg,#eef2ff,#e0e7ff,#eef2ff)', backgroundSize:'200%', animation:'shimmer 1.4s infinite' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div style={{ padding:'1.5rem 1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
      {[28,140,70,520,200,280].map((h,i) => (
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
      <a href="/debug" style={{ display:'inline-block', marginTop:16, fontSize:'0.75rem', color:'#6366f1', fontWeight:700 }}>🔍 ログを確認する</a>
    </div>
  );
}
