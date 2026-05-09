'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { XpHistoryEntry, TitleMasterEntry } from '@/types';
import { titleForLevel } from '@/types';

// =====================================================================
// XPTimelineChart（改修2）
//
// 【設計方針】
//   - type="stepAfter" でステップライン（階段状）に変更
//   - ネオングラデーション塗りつぶしで「積み上がるオーラ」を表現
//   - xp_history（イベントソーシング）を正データソースとして使用
// ★ Phase9.5: XpHistoryEntry から title が削除されたため、
//   ToolTip の称号表示を titleForLevel(level, titleMaster) で動的導出するよう変更。
//   titleMaster を optional Props として受け取る。
// ★ Phase11.1: AreaChart の margin を調整し、X軸ラベルの見切れを解消。
// =====================================================================

interface Props {
  xpHistory?:   XpHistoryEntry[];
  compact?:     boolean;
  /** ★ Phase9.5: 称号の動的導出に使用。未指定時はフォールバック称号テーブルを使用。 */
  titleMaster?: TitleMasterEntry[];
}

function toDisplayDate(dateStr: string): string {
  const d = dateStr.slice(0, 10);
  const parts = d.split('-');
  if (parts.length < 3) return dateStr;
  return `${parseInt(parts[1])}/${parts[2]}`;
}

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

const TYPE_LABEL: Record<string, string> = {
  gain:      '稽古獲得',
  decay:     'XP減衰',
  reset:     'リセット',
  peer_eval: '他者評価',
};

// ===== カスタム Tooltip =====
interface PayloadItem {
  payload?: {
    type?:   string;
    reason?: string;
    level?:  number;
    amount?: number;
    /** ★ Phase9.5: 動的に計算した称号名 */
    titleLabel?: string;
  };
  value?: number;
}

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: PayloadItem[];
  label?:  string;
}) {
  if (!active || !payload?.length) return null;
  const item   = payload[0];
  const xp     = item.value ?? 0;
  const { type, reason, level, amount, titleLabel } = item.payload ?? {};
  const typeLabel = TYPE_LABEL[type ?? ''] ?? type ?? '';
  const sign      = (amount ?? 0) >= 0 ? '+' : '';
  const amtColor  = (amount ?? 0) >= 0 ? '#34d399' : '#f87171';

  return (
    <div style={{
      background: 'rgba(10,9,24,0.96)',
      border: '1px solid rgba(129,140,248,0.3)',
      borderRadius: 10,
      color: '#e0e7ff',
      fontSize: 11,
      padding: '8px 12px',
      lineHeight: 1.7,
      boxShadow: '0 0 16px rgba(99,102,241,0.25)',
    }}>
      <div style={{ color: 'rgba(129,140,248,0.7)', marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'rgba(167,139,250,0.8)' }}>{typeLabel}</div>
      {amount !== undefined && (
        <div style={{ color: amtColor, fontWeight: 700 }}>
          {sign}{amount?.toLocaleString()} XP
        </div>
      )}
      <div style={{ color: '#e0e7ff', fontWeight: 800 }}>
        累積 {xp.toLocaleString()} XP
      </div>
      {level !== undefined && level > 0 && (
        <div style={{ color: 'rgba(129,140,248,0.7)' }}>
          Lv {level}
          {/* ★ Phase9.5: 動的導出した称号を表示 */}
          {titleLabel ? ` ・ ${titleLabel}` : ''}
        </div>
      )}
      {reason && (
        <div style={{ color: 'rgba(99,102,241,0.7)', fontSize: 10, marginTop: 2 }}>{reason}</div>
      )}
    </div>
  );
}

// ===== カスタムドット（gain/decay等でアイコン切り替え） =====
interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { type?: string };
}
function CustomDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined) return null;
  const type = payload?.type ?? '';

  if (type === 'decay') {
    return (
      <circle cx={cx} cy={cy} r={3}
        fill="#f87171" stroke="rgba(248,113,113,0.4)" strokeWidth={4} />
    );
  }
  if (type === 'peer_eval') {
    return (
      <circle cx={cx} cy={cy} r={3.5}
        fill="#fbbf24" stroke="rgba(251,191,36,0.4)" strokeWidth={4} />
    );
  }
  if (type === 'reset') {
    return (
      <circle cx={cx} cy={cy} r={3}
        fill="#818cf8" stroke="rgba(129,140,248,0.4)" strokeWidth={4} />
    );
  }
  // gain
  return (
    <circle cx={cx} cy={cy} r={2}
      fill="#a78bfa" stroke="transparent" strokeWidth={0} />
  );
}

export default function XPTimelineChart({ xpHistory = [], compact = false, titleMaster }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  if (!xpHistory.length) {
    return (
      <div style={{
        textAlign: 'center', padding: '2rem',
        color: 'rgba(99,102,241,0.4)', fontSize: '0.85rem',
      }}>
        稽古を記録するとXP推移が表示されます
      </div>
    );
  }

  const maxXP  = Math.max(...xpHistory.map(e => e.total_xp_after));
  const height = compact ? 160 : 220;
  const xTicks = buildXTicks(xpHistory);

  const chartData = xpHistory.map(e => ({
    label:          toDisplayDate(e.date),
    total_xp_after: Math.max(0, e.total_xp_after),
    amount:         e.amount,
    type:           e.type,
    reason:         e.reason,
    level:          e.level,
    // ★ Phase9.5: title フィールドが XpHistoryEntry から削除されたため
    //   titleForLevel() で動的に称号ラベルを計算してチャートデータに埋め込む
    titleLabel:     titleForLevel(e.level, titleMaster),
  }));

  // グラデーション ID（複数インスタンスの衝突防止）
  const gradId = compact ? 'xpGradientCompact' : 'xpGradientFull';

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {/*
          ★ Phase11.1: margin.bottom を 20 → 28 に増やし、
          X軸の日付ラベルが下端で見切れないよう修正。
          left も -26 → -20 に微調整してY軸数値の左クリップを緩和。
        */}
        <AreaChart data={chartData} margin={{ top: 10, right: 6, left: -20, bottom: 28 }}>
          <defs>
            {/* ★ ネオングラデーション（積み上がるオーラ） */}
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#7c3aed" stopOpacity={0.55} />
              <stop offset="40%"  stopColor="#4f46e5" stopOpacity={0.30} />
              <stop offset="80%"  stopColor="#38bdf8" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#0f0e2a" stopOpacity={0.05} />
            </linearGradient>
            {/* ストローク用グロー（filter） */}
            <filter id="neonGlow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(99,102,241,0.08)"
            vertical={false}
          />

          <XAxis
            dataKey="label"
            ticks={xTicks}
            tick={{ fontSize: 9, fill: 'rgba(99,102,241,0.5)' }}
            tickLine={false}
            axisLine={false}
            /* ★ Phase11.1: ラベルを少し下げてバーとの重なりを防ぐ */
            dy={6}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'rgba(99,102,241,0.5)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* 最高XPの基準線 */}
          <ReferenceLine
            y={maxXP}
            stroke="rgba(167,139,250,0.35)"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: `最高 ${maxXP.toLocaleString()}`,
              position: 'insideTopRight',
              fontSize: 9,
              fill: 'rgba(167,139,250,0.55)',
            }}
          />

          {/* ★ type="stepAfter" でステップライン（階段状） */}
          <Area
            type="stepAfter"
            dataKey="total_xp_after"
            stroke="#a78bfa"
            strokeWidth={compact ? 1.5 : 2}
            fill={`url(#${gradId})`}
            dot={<CustomDot />}
            activeDot={{
              r: 5,
              fill: '#a78bfa',
              stroke: 'rgba(167,139,250,0.4)',
              strokeWidth: 4,
            }}
            style={{ filter: 'drop-shadow(0 0 4px rgba(167,139,150,0.5))' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
