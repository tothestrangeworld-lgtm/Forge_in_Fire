'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { DashboardData } from '@/types';
import { fetchDashboard } from '@/lib/api';

const RadarChart      = dynamic(() => import('@/components/charts/RadarChart'),      { ssr: false, loading: () => <ChartLoading /> });
const TrendLineChart  = dynamic(() => import('@/components/charts/TrendLineChart'),  { ssr: false, loading: () => <ChartLoading /> });
const XPTimelineChart = dynamic(() => import('@/components/charts/XPTimelineChart'), { ssr: false, loading: () => <ChartLoading /> });

type Tab = 'radar' | 'trend' | 'heatmap';

export default function HistoryPage() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>('radar');

  useEffect(() => {
    fetchDashboard().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;
  if (!data)   return null;

  const { logs, settings } = data;
  const activeItems = settings.filter(s => s.is_active).map(s => s.item_name);

  /* ── レーダー用データ ── */
  const totals: Record<string, { sum: number; count: number }> = {};
  activeItems.forEach(i => { totals[i] = { sum: 0, count: 0 }; });
  logs.forEach(l => {
    if (totals[l.item_name]) { totals[l.item_name].sum += l.score; totals[l.item_name].count++; }
  });
  const radarData = activeItems.map(item => ({
    subject:  item,
    score:    totals[item].count > 0 ? +(totals[item].sum / totals[item].count).toFixed(1) : 0,
    fullMark: 5,
  }));
  const hasRadarData = radarData.some(d => d.score > 0);

  /* ── 折れ線用データ（累積モード） ── */
  const dateMap: Record<string, Record<string, { sum: number; count: number }>> = {};
  logs.forEach(l => {
    if (!dateMap[l.date]) dateMap[l.date] = {};
    if (!dateMap[l.date][l.item_name]) dateMap[l.date][l.item_name] = { sum: 0, count: 0 };
    dateMap[l.date][l.item_name].sum   += l.score;
    dateMap[l.date][l.item_name].count += 1;
  });
  const trendData = Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => {
      const row: Record<string, unknown> = { date: date.slice(5) };
      activeItems.forEach(item => {
        if (items[item]) row[item] = +(items[item].sum / items[item].count).toFixed(1);
      });
      return row;
    });
  const uniqueDates = Object.keys(dateMap).length;

  /* ── 統計（総ログ数は削除） ── */
  const totalSessions = uniqueDates;
  const avgScore      = logs.length > 0
    ? (logs.reduce((a, b) => a + b.score, 0) / logs.length).toFixed(1)
    : '—';

  const tabs: { key: Tab; label: string }[] = [
    { key: 'radar',   label: 'バランス'  },
    { key: 'trend',   label: '蓄積推移'  },
    { key: 'heatmap', label: 'XP推移'   },
  ];

  return (
    <div className="animate-fade-up" style={{ padding: '1.5rem 1rem 0' }}>

      {/* ヘッダー */}
      <header style={{ marginBottom: '1.5rem' }}>
        <span className="section-title">可視化</span>
        <h1 style={{ fontSize:'1.75rem', fontWeight:800, color:'var(--ai)', margin:0, letterSpacing:'-0.02em' }}>
          成長の記録
        </h1>
      </header>

      {/* 統計カード（2列） */}
      <div
        className="animate-fade-up delay-100"
        style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:'1rem' }}
      >
        {[
          { label:'総稽古数', value: `${totalSessions}回` },
          { label:'平均スコア', value: String(avgScore)   },
        ].map(({ label, value }) => (
          <div key={label} className="wa-card" style={{ textAlign:'center', padding:'0.75rem 0.5rem' }}>
            <p style={{ fontSize:'0.62rem', color:'#a8a29e', margin:'0 0 4px' }}>{label}</p>
            <p style={{ fontWeight:800, color:'var(--ai)', fontSize:'1.2rem', margin:0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* タブ */}
      <div
        className="animate-fade-up delay-200"
        style={{ display:'flex', gap:4, background:'#eef2ff', borderRadius:16, padding:4, marginBottom:'1rem' }}
      >
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex:1, fontSize:'0.78rem', fontWeight:700, padding:'0.5rem 0',
              borderRadius:12, border:'none', cursor:'pointer', fontFamily:'inherit',
              background: tab === t.key ? '#fff' : 'transparent',
              color:      tab === t.key ? 'var(--ai)' : '#a8a29e',
              boxShadow:  tab === t.key ? '0 1px 4px rgba(99,102,241,.12)' : 'none',
              transition: 'all .2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* チャートエリア */}
      <div className="wa-card animate-fade-up delay-300">
        {tab === 'radar' && (
          <>
            <span className="section-title">直近50稽古の平均評価</span>
            {hasRadarData
              ? <RadarChart data={radarData} />
              : <EmptyState icon="📊" text="稽古を記録するとレーダーチャートが表示されます" />
            }
          </>
        )}

        {tab === 'trend' && (
          <>
            <span className="section-title">稽古スコアの累積推移</span>
            {uniqueDates >= 2
              ? <TrendLineChart data={trendData} items={activeItems} cumulative={true} />
              : <EmptyState
                  icon="📈"
                  text="2日以上の稽古から表示されます"
                  sub={`現在 ${uniqueDates}日分のデータ`}
                />
            }
          </>
        )}

        {tab === 'heatmap' && (
          <>
            <span className="section-title">XP推移（稽古開始〜今日）</span>
            <XPTimelineChart logs={logs} compact={false} />
          </>
        )}
      </div>

    </div>
  );
}

function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div style={{ textAlign:'center', padding:'2.5rem 1rem' }}>
      <p style={{ fontSize:'2.5rem', marginBottom:'0.75rem' }}>{icon}</p>
      <p style={{ color:'#78716c', fontSize:'0.85rem', fontWeight:600, margin:0 }}>{text}</p>
      {sub && <p style={{ color:'#a8a29e', fontSize:'0.75rem', marginTop:6 }}>{sub}</p>}
    </div>
  );
}

function ChartLoading() {
  return (
    <div style={{ height:220, borderRadius:12, background:'linear-gradient(90deg,#eef2ff,#e0e7ff,#eef2ff)', backgroundSize:'200%', animation:'shimmer 1.4s infinite' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div style={{ padding:'1.5rem 1rem', display:'flex', flexDirection:'column', gap:12 }}>
      {[28,60,44,260].map((h,i) => (
        <div key={i} style={{ height:h, borderRadius:16, background:'linear-gradient(90deg,#eef2ff,#e0e7ff,#eef2ff)', backgroundSize:'200%', animation:`shimmer 1.4s ${i*0.1}s infinite` }} />
      ))}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}
