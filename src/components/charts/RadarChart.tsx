'use client';

import { useState, useEffect } from 'react';
import {
  Radar, RadarChart as RechartsRadar,
  PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts';

interface RadarDataPoint { subject: string; score: number; fullMark: number; }
interface Props { data: RadarDataPoint[]; }

export default function RadarChart({ data }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || !data?.length) return null;

  return (
    <div style={{ width:'100%', height:240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadar data={data} outerRadius="70%">
          <PolarGrid stroke="#e0e7ff" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fontSize:11, fill:'#44403c', fontFamily:'M PLUS Rounded 1c,sans-serif' }}
          />
          <Tooltip
            contentStyle={{
              background:'#1e1b4b', border:'none',
              borderRadius:12, color:'#fff',
              fontSize:12, padding:'8px 12px',
            }}
            formatter={(v: number) => [v + ' / 5', 'スコア']}
          />
          <Radar
            name="スコア" dataKey="score"
            stroke="#3730a3" fill="#4f46e5" fillOpacity={0.3}
            strokeWidth={2} dot={{ fill:'#1e1b4b', r:3 }}
          />
        </RechartsRadar>
      </ResponsiveContainer>
    </div>
  );
}
