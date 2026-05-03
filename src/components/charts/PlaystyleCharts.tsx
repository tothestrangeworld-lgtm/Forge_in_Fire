'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import type { Technique } from '@/types';

interface Props { techniques: Technique[]; }

// ダークモード対応カラー
const ACTION_COLORS      = ['#6366f1', '#f59e0b'];  // 仕掛け技・応じ技
const SUBCATEGORY_COLORS = ['#818cf8', '#34d399', '#f59e0b', '#f472b6', '#60a5fa', '#a78bfa'];

const TOOLTIP_STYLE = {
  background: '#1e1b4b', border: 'none',
  borderRadius: 10, color: '#fff',
  fontSize: 12, padding: '8px 12px',
};

// カスタム中央ラベル（ドーナツ用）
function DonutLabel({ cx, cy, totalPts }: { cx: number; cy: number; totalPts: number }) {
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#c7d2fe" fontSize={10} fontWeight={600}>
        合計
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#fff" fontSize={18} fontWeight={800}>
        {totalPts}
      </text>
      <text x={cx} y={cy + 26} textAnchor="middle" fill="#a5b4fc" fontSize={9}>
        pt
      </text>
    </g>
  );
}

export default function PlaystyleCharts({ techniques }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { actionData, subData, totalPts } = useMemo(() => {
    const actionTotals: Record<string, number> = {};
    const subTotals:    Record<string, number> = {};

    techniques.forEach(t => {
      if (t.actionType)  actionTotals[t.actionType]  = (actionTotals[t.actionType]  ?? 0) + t.points;
      if (t.subCategory) subTotals[t.subCategory]    = (subTotals[t.subCategory]    ?? 0) + t.points;
    });

    const actionData = Object.entries(actionTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const subData = Object.entries(subTotals)
      .map(([subject, value]) => ({ subject, value, fullMark: Math.max(...Object.values(subTotals), 1) }))
      .sort((a, b) => b.value - a.value);

    const totalPts = techniques.reduce((s, t) => s + t.points, 0);

    return { actionData, subData, totalPts };
  }, [techniques]);

  if (!mounted) return null;
  if (totalPts === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem', color: '#a8a29e', fontSize: '0.82rem' }}>
        技を評価するとプレイスタイル分析が表示されます
      </div>
    );
  }

  return (
    // ── flex横並び（スマホでも1行） ──
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%',
    }}>

      {/* ── ドーナツチャート（ActionType）: 幅40% ── */}
      <div style={{
        flex: '0 0 40%',
        minWidth: 0,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 14,
        padding: '0.75rem 0.4rem 0.5rem',
        border: '1px solid rgba(129,140,248,0.15)',
      }}>
        <p style={{
          textAlign: 'center', fontSize: '0.62rem', fontWeight: 700,
          color: '#a5b4fc', letterSpacing: '0.08em', marginBottom: 4,
        }}>
          仕掛け / 応じ
        </p>
        <div style={{ width: '100%', height: 150 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={actionData}
                cx="50%" cy="50%"
                innerRadius="46%" outerRadius="68%"
                paddingAngle={3}
                dataKey="value"
                labelLine={false}
              >
                {actionData.map((_, i) => (
                  <Cell key={i} fill={ACTION_COLORS[i % ACTION_COLORS.length]} strokeWidth={0} />
                ))}
                <DonutLabel cx={0} cy={0} totalPts={totalPts} />
              </Pie>
              <PieTooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [`${v} pt`, name]}
              />
              <Legend
                iconType="circle"
                iconSize={7}
                wrapperStyle={{ fontSize: 9, color: '#c7d2fe', paddingTop: 4 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── レーダーチャート（SubCategory）: 幅60% ── */}
      <div style={{
        flex: '0 0 calc(60% - 8px)',
        minWidth: 0,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 14,
        padding: '0.75rem 0.4rem 0.5rem',
        border: '1px solid rgba(129,140,248,0.15)',
      }}>
        <p style={{
          textAlign: 'center', fontSize: '0.62rem', fontWeight: 700,
          color: '#a5b4fc', letterSpacing: '0.08em', marginBottom: 4,
        }}>
          技の種類バランス
        </p>
        <div style={{ width: '100%', height: 150 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={subData} outerRadius="62%">
              <PolarGrid stroke="rgba(129,140,248,0.25)" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontSize: 8, fill: '#c7d2fe', fontFamily: 'M PLUS Rounded 1c, sans-serif' }}
              />
              <PolarRadiusAxis tick={false} axisLine={false} />
              <Radar
                dataKey="value"
                stroke="#818cf8"
                fill="#6366f1"
                fillOpacity={0.35}
                strokeWidth={1.5}
                dot={{ fill: '#a5b4fc', r: 2, strokeWidth: 0 }}
              />
              <PieTooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [`${v} pt`, 'ポイント']}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
