'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { XpHistoryEntry } from '@/types';

// =====================================================================
// XPTimelineChart
//
// 【設計方針】
//   旧実装では LogEntry[] からフロントエンドでXPを疑似再計算していたため、
//   レベルリセット・減衰が正しく反映されない構造的欠陥があった。
//   本コンポーネントは GAS の xp_history（イベントソーシング）を正として
//   受け取り、total_xp_after をそのまま Y軸にマッピングするだけのシンプルな実装。
// =====================================================================

interface Props {
  xpHistory?: XpHistoryEntry[];
  compact?:   boolean; // true = ホーム用の小さい版
}

// "YYYY-MM-DD HH:mm:ss" または "YYYY-MM-DD" → "M/DD" 表示用文字列
function toDisplayDate(dateStr: string): string {
  const d = dateStr.slice(0, 10); // "YYYY-MM-DD"
  const parts = d.split('-');
  if (parts.length < 3) return dateStr;
  return `${parseInt(parts[1])}/${parts[2]}`;
}

// X軸ティック：月初め "M/01" の重複を除いたラベルのみ
function buildXTicks(data: XpHistoryEntry[]): string[] {
  const seen = new Set<string>();
  return data
    .map(e => toDisplayDate(e.date))
    .filter(label => {
      if (!label.endsWith('/01')) return false;
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

// Tooltip の種別ラベル
const TYPE_LABEL: Record<string, string> = {
  gain:  '稽古獲得',
  decay: 'XP減衰',
  reset: 'リセット',
};

// Tooltip カスタムコンテンツ
interface TooltipPayloadItem {
  payload?: {
    type?:   string;
    reason?: string;
    level?:  number;
    amount?: number;
  };
  value?: number;
}

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?:  string;
}) {
  if (!active || !payload?.length) return null;
  const item    = payload[0];
  const xp      = item.value ?? 0;
  const { type, reason, level, amount } = item.payload ?? {};
  const typeLabel = TYPE_LABEL[type ?? ''] ?? type ?? '';
  const sign      = (amount ?? 0) >= 0 ? '+' : '';

  return (
    <div style={{
      background: '#1e1b4b', border: 'none', borderRadius: 10,
      color: '#fff', fontSize: 11, padding: '8px 12px', lineHeight: 1.7,
    }}>
      <div style={{ color: '#c7d2fe', marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#a5b4fc' }}>{typeLabel}</div>
      {amount !== undefined && (
        <div style={{ color: (amount ?? 0) >= 0 ? '#34d399' : '#f87171' }}>
          {sign}{amount?.toLocaleString()} XP
        </div>
      )}
      <div style={{ color: '#fff', fontWeight: 'bold' }}>
        累積 {xp.toLocaleString()} XP
      </div>
      {level && (
        <div style={{ color: '#a5b4fc' }}>Lv {level}</div>
      )}
      {reason && (
        <div style={{ color: '#818cf8', fontSize: 10, marginTop: 2 }}>{reason}</div>
      )}
    </div>
  );
}

export default function XPTimelineChart({ xpHistory = [], compact = false }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  if (!xpHistory.length) {
    return (
      <div style={{
        textAlign: 'center', padding: '2rem',
        color: '#a8a29e', fontSize: '0.85rem',
      }}>
        稽古を記録するとXP推移が表示されます
      </div>
    );
  }

  const maxXP  = Math.max(...xpHistory.map(e => e.total_xp_after));
  const height = compact ? 160 : 240;
  const xTicks = buildXTicks(xpHistory);

  // Recharts 用フラット配列へ変換（余計なフィールドを展開）
  const chartData = xpHistory.map(e => ({
    label:          toDisplayDate(e.date),
    total_xp_after: Math.max(0, e.total_xp_after),
    amount:         e.amount,
    type:           e.type,
    reason:         e.reason,
    level:          e.level,
    title:          e.title,
  }));

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="xpGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.03} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" vertical={false} />

          <XAxis
            dataKey="label"
            ticks={xTicks}
            tick={{ fontSize: 9, fill: '#a5b4fc' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#a5b4fc' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
          />

          <Tooltip content={<CustomTooltip />} />

          <ReferenceLine
            y={maxXP}
            stroke="#818cf8"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: `最高 ${maxXP.toLocaleString()}`,
              position: 'insideTopRight',
              fontSize: 9,
              fill: '#818cf8',
            }}
          />

          <Area
            type="monotone"
            dataKey="total_xp_after"
            stroke="#3730a3"
            strokeWidth={compact ? 1.5 : 2}
            fill="url(#xpGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#1e1b4b', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
