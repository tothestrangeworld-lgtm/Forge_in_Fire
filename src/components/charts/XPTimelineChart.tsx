'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { LogEntry } from '@/types';

interface Props {
  logs:    LogEntry[];
  compact?: boolean; // true = ホーム用の小さい版
}

interface DataPoint {
  date:      string; // 表示用 "MM/DD"
  xp:        number; // 累積XP
  gained:    number; // その日の獲得XP（稽古日のみ > 0）
  lost:      number; // その日の減衰XP（> 0）
  isPractice: boolean;
}

// GASと同じ減衰計算
function dailyPenalty(daysSince: number): number {
  if (daysSince <= 3) return 0;
  return Math.floor(20 * Math.pow(daysSince - 3, 1.3));
}

function buildXPTimeline(logs: LogEntry[]): DataPoint[] {
  if (!logs.length) return [];

  // 日付ごとにXP獲得を集計（基本XP50 + ボーナス）
  const dailyGain: Record<string, number> = {};
  logs.forEach(l => {
    const d = (l.date ?? '').slice(0, 10);
    if (!d) return;
    if (!dailyGain[d]) dailyGain[d] = 50; // 基本XP（稽古1回につき1回だけ加算）
    dailyGain[d] += l.xp_earned;
  });

  // 同日複数稽古の重複加算を防ぐため、uniqueな稽古日ベースで基本XPを整理
  const practiceDates = new Set(logs.map(l => (l.date ?? '').slice(0, 10)).filter(Boolean));

  const sortedDates = [...practiceDates].sort();
  if (!sortedDates.length) return [];

  const result: DataPoint[] = [];
  let cumXP        = 0;
  let lastPractice: Date | null = null;

  const start = new Date(sortedDates[0]);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  for (const cur = new Date(start); cur <= today; cur.setDate(cur.getDate() + 1)) {
    const y  = cur.getFullYear();
    const m  = String(cur.getMonth() + 1).padStart(2, '0');
    const d  = String(cur.getDate()).padStart(2, '0');
    const ds = `${y}-${m}-${d}`;

    let gained = 0;
    let lost   = 0;

    if (dailyGain[ds]) {
      gained = dailyGain[ds];
      cumXP += gained;
      lastPractice = new Date(cur);
    } else if (lastPractice) {
      const daysSince = Math.floor((cur.getTime() - lastPractice.getTime()) / 86400000);
      lost   = dailyPenalty(daysSince);
      cumXP  = Math.max(0, cumXP - lost);
    }

    result.push({
      date:       `${cur.getMonth() + 1}/${d}`,
      xp:         Math.max(0, cumXP),
      gained,
      lost,
      isPractice: !!dailyGain[ds],
    });
  }

  return result;
}

// データが多い場合は間引き（X軸の視認性確保）
function sampleData(data: DataPoint[], maxPoints: number): DataPoint[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0 || i === data.length - 1);
}

export default function XPTimelineChart({ logs, compact = false }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const allData = useMemo(() => buildXPTimeline(logs), [logs]);

  if (!mounted) return null;
  if (!allData.length) return (
    <div style={{ textAlign:'center', padding:'2rem', color:'#a8a29e', fontSize:'0.85rem' }}>
      稽古を記録するとXP推移が表示されます
    </div>
  );

  const chartData = sampleData(allData, compact ? 60 : 120);
  const maxXP     = Math.max(...allData.map(d => d.xp));
  const height    = compact ? 160 : 240;

  // X軸は月初めのみ表示
  const xTicks = chartData
    .filter(d => d.date.endsWith('/01'))
    .map(d => d.date);

  return (
    <div style={{ width:'100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top:8, right:4, left:-28, bottom:0 }}>
          <defs>
            <linearGradient id="xpGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.03} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" vertical={false} />

          <XAxis
            dataKey="date"
            ticks={xTicks}
            tick={{ fontSize:9, fill:'#a5b4fc' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize:9, fill:'#a5b4fc' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)}
          />

          <Tooltip
            contentStyle={{
              background:'#1e1b4b', border:'none',
              borderRadius:10, color:'#fff',
              fontSize:11, padding:'8px 12px',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'xp') return [`${value.toLocaleString()} XP`, '累積XP'];
              return [value, name];
            }}
            labelStyle={{ color:'#c7d2fe', marginBottom:4 }}
          />

          {/* 最高XPに参照線 */}
          <ReferenceLine
            y={maxXP}
            stroke="#818cf8"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{ value:`最高 ${maxXP.toLocaleString()}`, position:'insideTopRight', fontSize:9, fill:'#818cf8' }}
          />

          <Area
            type="monotone"
            dataKey="xp"
            stroke="#3730a3"
            strokeWidth={compact ? 1.5 : 2}
            fill="url(#xpGradient)"
            dot={false}
            activeDot={{ r:4, fill:'#1e1b4b', strokeWidth:0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
