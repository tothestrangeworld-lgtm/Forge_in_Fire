'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Radar, RadarChart as RechartsRadar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts';
import type { Technique } from '@/types';

interface Props {
  techniques: Technique[];
}

export default function TechniqueRadarChart({ techniques }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const data = useMemo(() => {
    // BodyPart ごとに Points を合計
    const totals: Record<string, number> = {};
    techniques.forEach(t => {
      if (!t.bodyPart) return;
      totals[t.bodyPart] = (totals[t.bodyPart] || 0) + t.points;
    });

    if (Object.keys(totals).length === 0) return [];

    const max = Math.max(...Object.values(totals), 1);
    return Object.entries(totals).map(([bodyPart, points]) => ({
      subject:  bodyPart,
      points,
      fullMark: max,
    }));
  }, [techniques]);

  if (!mounted) return null;

  if (data.length === 0) {
    return (
      <div style={{ textAlign:'center', padding:'2rem 1rem', color:'#a8a29e', fontSize:'0.85rem' }}>
        技を評価するとチャートが表示されます
      </div>
    );
  }

  return (
    <div style={{ width:'100%', height:240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadar data={data} outerRadius="65%">
          <PolarGrid stroke="#e0e7ff" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fontSize:11, fill:'#44403c', fontFamily:'M PLUS Rounded 1c,sans-serif' }}
          />
          <PolarRadiusAxis
            angle={90}
            tick={{ fontSize:9, fill:'#a5b4fc' }}
            tickCount={4}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background:'#1e1b4b', border:'none',
              borderRadius:12, color:'#fff',
              fontSize:12, padding:'8px 12px',
            }}
            formatter={(v: number) => [`${v.toLocaleString()} pt`, '合計ポイント']}
          />
          <Radar
            name="合計ポイント"
            dataKey="points"
            stroke="#3730a3"
            fill="#4f46e5"
            fillOpacity={0.25}
            strokeWidth={2}
            dot={{ fill:'#1e1b4b', r:3 }}
          />
        </RechartsRadar>
      </ResponsiveContainer>
    </div>
  );
}
