// src/components/charts/PlaystyleCharts.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import type {
  Technique, MatchupMasterEntry, PeerStyleEntry, TechniqueMasterEntry,
} from '@/types';
import MatchupScroll from './MatchupScroll';

interface Props {
  techniques:       Technique[];
  matchupMaster?:   MatchupMasterEntry[];
  peersStyle?:      PeerStyleEntry[];
  techniqueMaster?: TechniqueMasterEntry[];
}

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

export default function PlaystyleCharts({
  techniques,
  matchupMaster   = [],
  peersStyle      = [],
  techniqueMaster = [],
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ★ Phase10: モーダル開閉ステート
  const [selectedMatchup, setSelectedMatchup] = useState<MatchupMasterEntry | null>(null);

  const { actionData, subData, totalPts, baseStyle } = useMemo(() => {
    const actionTotals: Record<string, number> = {};
    const subTotals:    Record<string, number> = {};
    const bodyTotals:   Record<string, number> = {};

    techniques.forEach(t => {
      if (t.actionType)  actionTotals[t.actionType]  = (actionTotals[t.actionType]  ?? 0) + t.points;
      if (t.subCategory) subTotals[t.subCategory]    = (subTotals[t.subCategory]    ?? 0) + t.points;
      if (t.bodyPart)    bodyTotals[t.bodyPart]      = (bodyTotals[t.bodyPart]      ?? 0) + t.points;
    });

    const actionData = Object.entries(actionTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const subData = Object.entries(subTotals)
      .map(([subject, value]) => ({ subject, value, fullMark: Math.max(...Object.values(subTotals), 1) }))
      .sort((a, b) => b.value - a.value);

    const totalPts = techniques.reduce((s, t) => s + t.points, 0);

    // ── ★ Phase10: BaseStyle 判定 ──
    // subCategory > bodyPart > actionType の優先順で、もっともポイントの高いものを BaseStyle にする。
    // ただし matchupMaster と照合してヒットするものを優先採用する。
    let baseStyle = '';
    const candidates: Array<{ key: string; pts: number }> = [];
    Object.entries(subTotals).forEach(([k, v]) => candidates.push({ key: k, pts: v }));
    Object.entries(bodyTotals).forEach(([k, v]) => candidates.push({ key: k, pts: v }));
    Object.entries(actionTotals).forEach(([k, v]) => candidates.push({ key: k, pts: v }));
    candidates.sort((a, b) => b.pts - a.pts);

    if (matchupMaster.length > 0) {
      // matchupMaster の baseStyle に存在するキーを優先
      const styleSet = new Set(matchupMaster.map(m => m.baseStyle));
      const hit = candidates.find(c => styleSet.has(c.key) && c.pts > 0);
      if (hit) baseStyle = hit.key;
    }
    if (!baseStyle && candidates.length > 0 && candidates[0].pts > 0) {
      baseStyle = candidates[0].key;
    }

    return { actionData, subData, totalPts, baseStyle };
  }, [techniques, matchupMaster]);

  // ★ Phase10: 現在の BaseStyle に合致する相性データを抽出
  const userMatchups = useMemo(() => {
    if (!baseStyle || matchupMaster.length === 0) return [];
    return matchupMaster
      .filter(m => m.baseStyle === baseStyle)
      .sort((a, b) => {
        // 1. matchType 優先（S → W）
        if (a.matchType !== b.matchType) return a.matchType === 'S' ? -1 : 1;
        // 2. degree 降順
        return (b.degree ?? 0) - (a.degree ?? 0);
      });
  }, [baseStyle, matchupMaster]);

  if (!mounted) return null;
  if (totalPts === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem', color: '#a8a29e', fontSize: '0.82rem' }}>
        技を評価するとプレイスタイル分析が表示されます
      </div>
    );
  }

  return (
    <>
      {/* ── flex横並び（スマホでも1行） ── */}
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

      {/* ── ★ Phase10: BaseStyle と相性タグ ─────────────────────── */}
      {baseStyle && (
        <div style={{ marginTop: 12 }}>
          {/* BaseStyle ラベル */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 8, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.14em',
              color: 'rgba(165,180,252,0.7)',
            }}>
              YOUR BASE STYLE
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 999,
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(129,140,248,0.4)',
              fontSize: '0.78rem', fontWeight: 800, color: '#c7d2fe',
              boxShadow: '0 0 10px rgba(99,102,241,0.18)',
            }}>
              <span style={{ fontSize: 11 }}>⚔︎</span>
              {baseStyle}
            </span>
          </div>

          {/* 相性タグ群 */}
          {userMatchups.length > 0 ? (
            <>
              <p style={{
                margin: '0 0 6px', fontSize: '0.62rem',
                color: 'rgba(165,180,252,0.6)', letterSpacing: '0.08em',
              }}>
                剣風相性（タップで詳細）
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {userMatchups.map((m, idx) => (
                  <MatchupTag
                    key={`${m.baseStyle}-${m.targetStyle}-${idx}`}
                    matchup={m}
                    onClick={() => setSelectedMatchup(m)}
                  />
                ))}
              </div>
            </>
          ) : matchupMaster.length > 0 ? (
            <p style={{
              margin: 0, fontSize: '0.7rem', color: 'rgba(99,102,241,0.4)',
              padding: '0.5rem 0.75rem', borderRadius: 10,
              background: 'rgba(99,102,241,0.04)',
              border: '1px dashed rgba(99,102,241,0.18)',
            }}>
              「{baseStyle}」の相性データはまだ登録されていません
            </p>
          ) : null}
        </div>
      )}

      {/* ── ★ Phase10: 剣風書ポップアップ ──────────────────────── */}
      <MatchupScroll
        open={!!selectedMatchup}
        onClose={() => setSelectedMatchup(null)}
        matchup={selectedMatchup}
        baseStyle={baseStyle}
        peers={peersStyle}
        techniqueMaster={techniqueMaster}
      />
    </>
  );
}

// =====================================================================
// MatchupTag ★ Phase10
// 相性タグ（matchType / degree によって色と発光が変化）
// =====================================================================
interface TagProps {
  matchup: MatchupMasterEntry;
  onClick: () => void;
}

function MatchupTag({ matchup, onClick }: TagProps) {
  const isStrong = matchup.matchType === 'S';
  const degree   = Math.max(1, Math.min(3, matchup.degree || 1));

  // matchType によるベースカラー（S=緑系/青系、W=赤系/紫系）
  const color   = isStrong ? '#34d399' : '#f87171';
  const bgBase  = isStrong ? 'rgba(16,185,129,'  : 'rgba(239,68,68,';
  const brBase  = isStrong ? 'rgba(52,211,153,'  : 'rgba(248,113,113,';

  // degree によって透明度・ボーダー幅・glow 強度を調整
  const bgAlpha     = degree === 3 ? 0.18 : degree === 2 ? 0.12 : 0.08;
  const brAlpha     = degree === 3 ? 0.7  : degree === 2 ? 0.5  : 0.35;
  const borderWidth = degree === 3 ? 2    : degree === 2 ? 1.5  : 1;
  const glow        = degree === 3
    ? `0 0 14px ${bgBase}0.45), 0 0 28px ${bgBase}0.22)`
    : degree === 2
      ? `0 0 8px ${bgBase}0.28)`
      : 'none';

  const symbol = isStrong ? '⚔︎' : '⛨';
  const label  = isStrong ? '得意' : '苦手';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: degree === 3 ? '6px 12px' : '5px 10px',
        borderRadius: 999,
        background: `${bgBase}${bgAlpha})`,
        border: `${borderWidth}px solid ${brBase}${brAlpha})`,
        boxShadow: glow,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      title={`${label} (Degree ${degree}) vs ${matchup.targetStyle}`}
    >
      <span style={{
        fontSize: degree === 3 ? 12 : 11,
        color,
        filter: degree === 3 ? `drop-shadow(0 0 4px ${color})` : 'none',
      }}>
        {symbol}
      </span>
      <span style={{
        fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em',
        color, opacity: 0.85,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: degree === 3 ? '0.78rem' : '0.72rem',
        fontWeight: degree === 3 ? 800 : 700,
        color: degree === 3 ? '#fff' : '#e0e7ff',
        letterSpacing: '0.02em',
      }}>
        {matchup.targetStyle}
      </span>
      {/* degree インジケーター */}
      <span style={{ display: 'inline-flex', gap: 1.5, marginLeft: 1 }}>
        {[1, 2, 3].map(n => (
          <span
            key={n}
            style={{
              width: 3, height: 3, borderRadius: '50%',
              background: n <= degree ? color : 'rgba(255,255,255,0.15)',
              boxShadow: n <= degree && degree === 3 ? `0 0 3px ${color}` : 'none',
            }}
          />
        ))}
      </span>
    </button>
  );
}
