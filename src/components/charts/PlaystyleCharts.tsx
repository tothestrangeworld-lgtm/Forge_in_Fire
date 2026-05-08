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
import MatchupScroll from '../MatchupScroll';

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

// =====================================================================
// Degree によるカラーパレット ★ MatchupScroll.tsx と完全同期
//   S(得意): 青〜シアン系 / W(苦手): 赤〜マゼンタ系
//   degree が高いほど 色相が鮮やかに / Glow が強く / ボーダー太く
// =====================================================================
type DegreeTheme = {
  primary:     string;   // メインカラー（テキスト・アイコン）
  textBright:  string;   // 強調テキスト（TargetStyle名）
  bg:          string;   // 背景
  bgHover:     string;   // hover時の背景
  border:      string;   // ボーダー色
  borderW:     number;   // ボーダー太さ
  glow:        string;   // box-shadow
  glowHover:   string;   // hover時の box-shadow
  innerGlow:   string;   // inset box-shadow
};

function getDegreeTheme(matchType: string, degree: number): DegreeTheme {
  const isStrong = matchType === 'S';
  const d        = Math.max(1, Math.min(3, degree || 1));

  if (isStrong) {
    // ── 得意（S）: 青〜シアン系 ──
    if (d === 1) {
      return {
        primary:    '#5eead4',
        textBright: '#ccfbf1',
        bg:         'rgba(20,83,75,0.22)',
        bgHover:    'rgba(20,83,75,0.34)',
        border:     'rgba(45,212,191,0.40)',
        borderW:    1,
        glow:       'none',
        glowHover:  '0 0 10px rgba(45,212,191,0.20)',
        innerGlow:  'inset 0 0 8px rgba(45,212,191,0.06)',
      };
    }
    if (d === 2) {
      return {
        primary:    '#34d399',
        textBright: '#d1fae5',
        bg:         'rgba(16,185,129,0.20)',
        bgHover:    'rgba(16,185,129,0.32)',
        border:     'rgba(52,211,153,0.65)',
        borderW:    1.5,
        glow:       '0 0 14px rgba(52,211,153,0.30), 0 0 28px rgba(16,185,129,0.14)',
        glowHover:  '0 0 22px rgba(52,211,153,0.45), 0 0 40px rgba(16,185,129,0.22)',
        innerGlow:  'inset 0 0 14px rgba(52,211,153,0.10)',
      };
    }
    // d === 3 ── ネオンシアン（最強）
    return {
      primary:    '#22d3ee',
      textBright: '#ecfeff',
      bg:         'rgba(8,145,178,0.26)',
      bgHover:    'rgba(8,145,178,0.40)',
      border:     'rgba(34,211,238,0.90)',
      borderW:    2,
      glow:       '0 0 20px rgba(34,211,238,0.55), 0 0 40px rgba(34,211,238,0.30), 0 0 60px rgba(34,211,238,0.15)',
      glowHover:  '0 0 28px rgba(34,211,238,0.75), 0 0 56px rgba(34,211,238,0.45), 0 0 80px rgba(34,211,238,0.22)',
      innerGlow:  'inset 0 0 22px rgba(34,211,238,0.18)',
    };
  } else {
    // ── 苦手（W）: 赤〜マゼンタ系 ──
    if (d === 1) {
      return {
        primary:    '#fda4af',
        textBright: '#fecdd3',
        bg:         'rgba(127,29,29,0.24)',
        bgHover:    'rgba(127,29,29,0.36)',
        border:     'rgba(225,29,72,0.40)',
        borderW:    1,
        glow:       'none',
        glowHover:  '0 0 10px rgba(225,29,72,0.20)',
        innerGlow:  'inset 0 0 8px rgba(225,29,72,0.06)',
      };
    }
    if (d === 2) {
      return {
        primary:    '#f87171',
        textBright: '#fee2e2',
        bg:         'rgba(220,38,38,0.22)',
        bgHover:    'rgba(220,38,38,0.34)',
        border:     'rgba(248,113,113,0.65)',
        borderW:    1.5,
        glow:       '0 0 14px rgba(248,113,113,0.30), 0 0 28px rgba(220,38,38,0.14)',
        glowHover:  '0 0 22px rgba(248,113,113,0.45), 0 0 40px rgba(220,38,38,0.22)',
        innerGlow:  'inset 0 0 14px rgba(248,113,113,0.10)',
      };
    }
    // d === 3 ── 紅蓮マゼンタ（警告）
    return {
      primary:    '#f0abfc',
      textBright: '#fae8ff',
      bg:         'rgba(134,25,143,0.28)',
      bgHover:    'rgba(134,25,143,0.42)',
      border:     'rgba(240,171,252,0.90)',
      borderW:    2,
      glow:       '0 0 20px rgba(240,171,252,0.55), 0 0 40px rgba(217,70,239,0.32), 0 0 60px rgba(192,38,211,0.18)',
      glowHover:  '0 0 28px rgba(240,171,252,0.75), 0 0 56px rgba(217,70,239,0.50), 0 0 80px rgba(192,38,211,0.28)',
      innerGlow:  'inset 0 0 22px rgba(240,171,252,0.18)',
    };
  }
}

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

    // ── ★ Phase10 / 10.1: BaseStyle 判定 ──
    // 優先順位:
    //   1. matchupMaster.baseStyle に存在するキーのうち、最もXPが高いもの（subCategory > bodyPart > actionType の順で評価）
    //   2. 該当なしの場合、subCategory > bodyPart > actionType の順で最大XPを採用
    let baseStyle = '';

    // すべての候補をフラット化（重複除去のため Map 使用：先勝ち＝ subCategory が最優先）
    const flatCandidates = new Map<string, number>();
    Object.entries(subTotals).forEach(([k, v])    => { if (!flatCandidates.has(k)) flatCandidates.set(k, v); });
    Object.entries(bodyTotals).forEach(([k, v])   => { if (!flatCandidates.has(k)) flatCandidates.set(k, v); });
    Object.entries(actionTotals).forEach(([k, v]) => { if (!flatCandidates.has(k)) flatCandidates.set(k, v); });

    const sortedCandidates = Array.from(flatCandidates.entries())
      .map(([key, pts]) => ({ key, pts }))
      .sort((a, b) => b.pts - a.pts);

    if (matchupMaster.length > 0) {
      const styleSet = new Set(matchupMaster.map(m => m.baseStyle));
      const hit = sortedCandidates.find(c => styleSet.has(c.key) && c.pts > 0);
      if (hit) baseStyle = hit.key;
    }
    if (!baseStyle && sortedCandidates.length > 0 && sortedCandidates[0].pts > 0) {
      baseStyle = sortedCandidates[0].key;
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

      {/* ── ★ Phase10 / 10.1: BaseStyle と相性タグ ─────────────────────── */}
      {baseStyle && (
        <div style={{ marginTop: 18 }}>
          {/* BaseStyle ラベル */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 10, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.14em',
              color: 'rgba(165,180,252,0.7)',
            }}>
              YOUR BASE STYLE
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: 999,
              background: 'rgba(99,102,241,0.18)',
              border: '1px solid rgba(129,140,248,0.45)',
              fontSize: '0.8rem', fontWeight: 800, color: '#c7d2fe',
              boxShadow: '0 0 12px rgba(99,102,241,0.22)',
            }}>
              <span style={{ fontSize: 12 }}>⚔︎</span>
              {baseStyle}
            </span>
          </div>

          {/* 相性タグ群 */}
          {userMatchups.length > 0 ? (
            <>
              <p style={{
                margin: '0 0 10px', fontSize: '0.62rem',
                color: 'rgba(165,180,252,0.6)', letterSpacing: '0.08em',
              }}>
                剣風相性（タップで詳細）
              </p>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,           // ★ タグ間の余白を拡張
              }}>
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
              padding: '0.6rem 0.85rem', borderRadius: 10,
              background: 'rgba(99,102,241,0.04)',
              border: '1px dashed rgba(99,102,241,0.2)',
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
// MatchupTag ★ Phase10 / 10.1
// 相性タグ（matchType / degree によって色と発光が変化）
// MatchupScroll.tsx の getDegreeTheme と完全同期。
// =====================================================================
interface TagProps {
  matchup: MatchupMasterEntry;
  onClick: () => void;
}

function MatchupTag({ matchup, onClick }: TagProps) {
  const isStrong = matchup.matchType === 'S';
  const degree   = Math.max(1, Math.min(3, matchup.degree || 1));
  const theme    = getDegreeTheme(matchup.matchType, degree);

  const symbol = isStrong ? '⚔︎' : '⛨';
  const label  = isStrong ? '得意' : '苦手';

  // タップしたくなる質感: ボタンサイズと余白を拡張
  const padX = degree === 3 ? 14 : 12;
  const padY = degree === 3 ? 9 : 8;

  // 一意なアニメーション名（degree 3 のみ脈動）
  const pulseName = `tagPulse_${isStrong ? 'S' : 'W'}_${degree}`;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: `${padY}px ${padX}px`,
        minHeight: 36,           // ★ タップ領域を確保（モバイル）
        borderRadius: 999,
        background: theme.bg,
        border: `${theme.borderW}px solid ${theme.border}`,
        boxShadow: `${theme.glow}${theme.glow !== 'none' ? ', ' : ''}${theme.innerGlow}`.replace(/^,\s*/, ''),
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
        // degree 3 のみ脈動アニメ
        animation: degree === 3 ? `${pulseName} 2.6s ease-in-out infinite` : 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
        e.currentTarget.style.background = theme.bgHover;
        if (theme.glowHover) {
          e.currentTarget.style.boxShadow = `${theme.glowHover}, ${theme.innerGlow}`;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.background = theme.bg;
        e.currentTarget.style.boxShadow = `${theme.glow}${theme.glow !== 'none' ? ', ' : ''}${theme.innerGlow}`.replace(/^,\s*/, '');
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(0.97)';
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
      }}
      title={`${label} (Degree ${degree}) vs ${matchup.targetStyle}`}
    >
      {/* degree 3 専用 keyframes */}
      {degree === 3 && (
        <style>{`
          @keyframes ${pulseName} {
            0%, 100% { box-shadow: ${theme.glow}, ${theme.innerGlow}; }
            50%      { box-shadow: ${theme.glowHover}, ${theme.innerGlow}; }
          }
        `}</style>
      )}

      {/* シンボル（剣 or 盾） */}
      <span style={{
        fontSize: degree === 3 ? 13 : 12,
        color: theme.primary,
        filter: degree >= 2
          ? `drop-shadow(0 0 ${degree === 3 ? 6 : 4}px ${theme.primary})`
          : 'none',
        lineHeight: 1,
      }}>
        {symbol}
      </span>

      {/* ラベル（得意 / 苦手） */}
      <span style={{
        fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em',
        color: theme.primary,
        opacity: 0.92,
        textShadow: degree === 3 ? `0 0 6px ${theme.primary}` : 'none',
      }}>
        {label}
      </span>

      {/* 区切り線（degree 2以上で表示） */}
      {degree >= 2 && (
        <span style={{
          width: 1, height: 12,
          background: theme.border,
          opacity: 0.6,
        }} />
      )}

      {/* TargetStyle 名 */}
      <span style={{
        fontSize: degree === 3 ? '0.82rem' : degree === 2 ? '0.78rem' : '0.74rem',
        fontWeight: degree === 3 ? 800 : 700,
        color: theme.textBright,
        letterSpacing: '0.02em',
        textShadow: degree === 3 ? `0 0 4px ${theme.primary}` : 'none',
      }}>
        {matchup.targetStyle}
      </span>
    </button>
  );
}
