'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = ['#3730a3','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

interface Props {
  data:       Record<string, unknown>[];
  items:      string[];
  cumulative?: boolean;   // true = 累積折れ線
}

export default function TrendLineChart({ data, items, cumulative = false }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || !data?.length) return null;

  // 累積モード: 各日付の値を積み上げる
  const chartData = cumulative
    ? (() => {
        const running: Record<string, number> = {};
        items.forEach(i => { running[i] = 0; });
        return data.map(row => {
          const next: Record<string, unknown> = { date: row.date };
          items.forEach(item => {
            if (row[item] !== undefined) running[item] += row[item] as number;
            next[item] = +running[item].toFixed(1);
          });
          return next;
        });
      })()
    : data;

  return (
    <div style={{ width:'100%', height:256 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top:5, right:10, left:-20, bottom:5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
          <XAxis dataKey="date" tick={{ fontSize:10, fill:'#78716c' }} tickLine={false} />
          <YAxis tick={{ fontSize:10, fill:'#78716c' }} tickLine={false} />
          <Tooltip
            contentStyle={{
              background:'#1e1b4b', border:'none',
              borderRadius:12, color:'#fff',
              fontSize:12, padding:'8px 12px',
            }}
          />
          {items.length > 1 && <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />}
          {items.map((item, i) => (
            <Line
              key={item} type="monotone" dataKey={item}
              stroke={COLORS[i % COLORS.length]} strokeWidth={2}
              dot={{ r:3, fill:COLORS[i % COLORS.length] }}
              activeDot={{ r:5 }} connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
