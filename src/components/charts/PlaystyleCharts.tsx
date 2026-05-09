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
import MatchupScroll from '@/components/charts/MatchupScroll';
import { getDegreeTheme, getTagHoverStyles } from '@/lib/matchupTheme';

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

  // モーダル開閉ステート
  const [selectedMatchup, setSelectedMatchup] = useState<MatchupMasterEntry | null>(null);

  // baseStyles を「純粋に subTotals の上位3件」で抽出
  const { actionData, subData, totalPts, baseStyles } = useMemo(() => {
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

    const baseStyles: string[] = Object.entries(subTotals)
      .filter(([, pts]) => pts > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([key]) => key);

    return { actionData, subData, totalPts, baseStyles };
  }, [techniques]);

  // 各 baseStyle ごとに該当する matchupMaster データをグルーピング
  const matchupGroups = useMemo(() => {
    if (baseStyles.length === 0 || matchupMaster.length === 0) return [];
    return baseStyles.map(style => ({
      style,
      matchups: matchupMaster
        .filter(m => m.baseStyle === style)
        .sort((a, b) => {
          if (a.matchType !== b.matchType) return a.matchType === 'S' ? -1 : 1;
          return (b.degree ?? 0) - (a.degree ?? 0);
        }),
    })).filter(g => g.matchups.length > 0);
  }, [baseStyles, matchupMaster]);

  // モーダル表示時の baseStyle
  const modalBaseStyle = selectedMatchup?.baseStyle ?? (baseStyles[0] ?? '');

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
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '100%',
      }}>

        {/* ドーナツチャート（ActionType） */}
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

        {/* レーダーチャート（SubCategory） */}
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

      {/* BaseStyle バッジ */}
      {baseStyles.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 10, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.14em',
              color: 'rgba(165,180,252,0.7)',
              flexShrink: 0,
            }}>
              YOUR BASE STYLE
            </span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {baseStyles.map((style, idx) => (
                <span
                  key={style}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 9px', borderRadius: 999,
                    background: idx === 0
                      ? 'rgba(99,102,241,0.22)'
                      : 'rgba(99,102,241,0.12)',
                    border: idx === 0
                      ? '1px solid rgba(129,140,248,0.55)'
                      : '1px solid rgba(129,140,248,0.30)',
                    fontSize: '0.7rem', fontWeight: 800, color: '#c7d2fe',
                    boxShadow: idx === 0 ? '0 0 10px rgba(99,102,241,0.22)' : 'none',
                  }}
                >
                  <span style={{
                    fontSize: '0.55rem', fontWeight: 700,
                    color: 'rgba(165,180,252,0.6)',
                    letterSpacing: '0.06em',
                  }}>
                    {idx + 1}
                  </span>
                  {style}
                </span>
              ))}
            </div>
          </div>

          {/* 相性タグ */}
          {matchupGroups.length > 0 ? (
            <>
              <p style={{
                margin: '0 0 8px', fontSize: '0.6rem',
                color: 'rgba(165,180,252,0.55)', letterSpacing: '0.08em',
              }}>
                剣風相性（タップで詳細）
              </p>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                {matchupGroups.map(group => (
                  <div
                    key={group.style}
                    style={{
                      borderRadius: 10,
                      background: 'rgba(99,102,241,0.04)',
                      border: '1px solid rgba(129,140,248,0.14)',
                      padding: '7px 9px 8px',
                    }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      marginBottom: 6,
                    }}>
                      <span style={{
                        fontSize: 9, color: 'rgba(165,180,252,0.55)',
                        fontWeight: 700,
                      }}>
                        ▸
                      </span>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 800,
                        color: 'rgba(199,210,254,0.78)',
                        letterSpacing: '0.04em',
                      }}>
                        {group.style}
                      </span>
                      <span style={{
                        fontSize: '0.55rem', fontWeight: 600,
                        color: 'rgba(165,180,252,0.45)',
                        marginLeft: 2,
                      }}>
                        ({group.matchups.length})
                      </span>
                    </div>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                    }}>
                      {group.matchups.map((m, idx) => (
                        <MatchupTag
                          key={`${m.baseStyle}-${m.targetStyle}-${idx}`}
                          matchup={m}
                          onClick={() => setSelectedMatchup(m)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : matchupMaster.length > 0 ? (
            <p style={{
              margin: 0, fontSize: '0.7rem', color: 'rgba(99,102,241,0.4)',
              padding: '0.6rem 0.85rem', borderRadius: 10,
              background: 'rgba(99,102,241,0.04)',
              border: '1px dashed rgba(99,102,241,0.2)',
            }}>
              該当する相性データはまだ登録されていません
            </p>
          ) : null}
        </div>
      )}

      <MatchupScroll
        open={!!selectedMatchup}
        onClose={() => setSelectedMatchup(null)}
        matchup={selectedMatchup}
        baseStyle={modalBaseStyle}
        peers={peersStyle}
        techniqueMaster={techniqueMaster}
      />
    </>
  );
}

// =====================================================================
// MatchupTag ★ Phase11.1 最終調整版
// 「文字ラベル」を撤廃し、色と Glow のみで相性を表現する。
// =====================================================================
interface TagProps {
  matchup: MatchupMasterEntry;
  onClick: () => void;
}

function MatchupTag({ matchup, onClick }: TagProps) {
  const isStrong = matchup.matchType === 'S';
  const degree   = Math.max(1, Math.min(3, matchup.degree || 1));
  const theme    = getDegreeTheme(matchup.matchType, degree);
  const hover    = getTagHoverStyles(matchup.matchType, degree);

  const padX = degree === 3 ? 12 : 10;
  const padY = degree === 3 ? 6 : 5;

  const pulseName = `tagPulse_${isStrong ? 'S' : 'W'}_${degree}`;
  const baseShadow  = `${theme.glow}${theme.glow !== 'none' ? ', ' : ''}${theme.innerGlow}`.replace(/^,\s*/, '');
  const hoverShadow = `${hover.glowHover}, ${theme.innerGlow}`;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: `${padY}px ${padX}px`,
        minHeight: 30,
        borderRadius: 999,
        background: theme.bg,
        border: `${theme.borderW}px solid ${theme.border}`,
        boxShadow: baseShadow,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
        animation: degree === 3 ? `${pulseName} 2.6s ease-in-out infinite` : 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)';
        e.currentTarget.style.background = hover.bgHover;
        e.currentTarget.style.boxShadow = hoverShadow;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.background = theme.bg;
        e.currentTarget.style.boxShadow = baseShadow;
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(0.97)';
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
      }}
      title={`${isStrong ? '得意' : '苦手'} (Degree ${degree}) vs ${matchup.targetStyle}`}
    >
      {degree === 3 && (
        <style>{`
          @keyframes ${pulseName} {
            0%, 100% { box-shadow: ${baseShadow}; }
            50%      { box-shadow: ${hoverShadow}; }
          }
        `}</style>
      )}

      {/* TargetStyle 名（色とGlowで属性を表現） */}
      <span style={{
        fontSize: degree === 3 ? '0.78rem' : degree === 2 ? '0.74rem' : '0.72rem',
        fontWeight: degree === 3 ? 800 : 700,
        color: theme.textBright,
        letterSpacing: '0.04em',
        textShadow: degree >= 2 ? `0 0 5px ${theme.primary}` : 'none',
      }}>
        {matchup.targetStyle}
      </span>
    </button>
  );
}