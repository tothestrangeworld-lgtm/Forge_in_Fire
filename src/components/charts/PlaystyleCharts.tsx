// src/components/charts/PlaystyleCharts.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import type {
  Technique, MatchupMasterEntry, PeerStyleEntry, TechniqueMasterEntry,
  ReceivedStats, ReceivedReason,
} from '@/types';
import { RECEIVED_REASON_LABELS } from '@/types';
import MatchupScroll from '@/components/charts/MatchupScroll';
import { getDegreeTheme, getTagHoverStyles } from '@/lib/matchupTheme';

interface Props {
  techniques:       Technique[];
  matchupMaster?:   MatchupMasterEntry[];
  peersStyle?:      PeerStyleEntry[];
  techniqueMaster?: TechniqueMasterEntry[];
  /** ★ Phase13: 被打統計（与打との対比表示に使用） */
  receivedStats?:   ReceivedStats;
}

// ダークモード対応カラー
const ACTION_COLORS      = ['#6366f1', '#f59e0b'];  // 仕掛け技・応じ技
const SUBCATEGORY_COLORS = ['#818cf8', '#34d399', '#f59e0b', '#f472b6', '#60a5fa', '#a78bfa'];
// ★ Phase13: 被打用カラーパレット
const RECEIVED_COLOR        = '#ef4444';   // red-500
const RECEIVED_COLOR_LIGHT  = '#fca5a5';   // red-300
const RECEIVED_ACTION_COLORS = ['#dc2626', '#f97316'];   // 仕掛け技(深紅) / 応じ技(オレンジ赤)

// 部位（BodyPart）の表示順を固定
const BODY_PART_AXIS = ['面', '小手', '胴', '突き'];

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
  receivedStats,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // モーダル開閉ステート
  const [selectedMatchup, setSelectedMatchup] = useState<MatchupMasterEntry | null>(null);

  // ★ Phase-ex4: baseStyles を「subTotals の上位4件」で抽出
  // ★ Phase13: 被打用の集計（actionData / radarData）を追加
  const {
    actionData, subData, totalPts, baseStyles,
    actionDataReceived, radarData, totalReceivedPts,
    reasonRanking,
  } = useMemo(() => {
    // ─────────────────────────────
    // 既存: 与打の集計
    // ─────────────────────────────
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
      .slice(0, 4)
      .map(([key]) => key);

    // ─────────────────────────────
    // ★ Phase13: 被打の集計
    // ─────────────────────────────
    const receivedActionTotals: Record<string, number> = {};
    const receivedBodyPartTotals: Record<string, number> = {};
    let totalReceivedPts = 0;

    if (receivedStats?.byTechnique) {
      // technique_id → TechniqueMasterEntry の引きやすいマップ（Props優先 / 無ければtechniques から）
      const techMap: Record<string, { actionType?: string; bodyPart?: string }> = {};
      techniqueMaster.forEach(m => { techMap[m.id] = { actionType: m.actionType, bodyPart: m.bodyPart }; });
      techniques.forEach(t => {
        if (!techMap[t.id]) techMap[t.id] = { actionType: t.actionType, bodyPart: t.bodyPart };
      });

      receivedStats.byTechnique.forEach(entry => {
        const pts = entry.receivedPoints || 0;
        if (pts <= 0) return;
        totalReceivedPts += pts;

        // bodyPart は entry に直接含まれているのでそれを優先
        const bp = entry.bodyPart || techMap[entry.techniqueId]?.bodyPart || '未分類';
        receivedBodyPartTotals[bp] = (receivedBodyPartTotals[bp] ?? 0) + pts;

        const at = techMap[entry.techniqueId]?.actionType;
        if (at) {
          receivedActionTotals[at] = (receivedActionTotals[at] ?? 0) + pts;
        }
      });
    }

    const actionDataReceived = Object.entries(receivedActionTotals)
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => b.value - a.value);

    // ─────────────────────────────
    // ★ Phase13: レーダー二重描画用データ
    // 軸を「面・小手・胴・突き」固定にし、与打/被打を同一座標で重ねる。
    // ─────────────────────────────
    const givenByBodyPart: Record<string, number> = {};
    techniques.forEach(t => {
      if (t.bodyPart && (t.points ?? 0) > 0) {
        givenByBodyPart[t.bodyPart] = (givenByBodyPart[t.bodyPart] ?? 0) + (t.points ?? 0);
      }
    });

    const maxRadarVal = Math.max(
      1,
      ...Object.values(givenByBodyPart),
      ...Object.values(receivedBodyPartTotals),
    );

    // 全部位を統合（"面・小手・胴・突き" を優先順位とし、それ以外も末尾に追加）
    const bodyPartSet = new Set<string>([
      ...BODY_PART_AXIS,
      ...Object.keys(givenByBodyPart),
      ...Object.keys(receivedBodyPartTotals),
    ]);
    const radarData = Array.from(bodyPartSet).map(bp => ({
      subject:  bp,
      given:    Math.round((givenByBodyPart[bp]            ?? 0) * 10) / 10,
      received: Math.round((receivedBodyPartTotals[bp]     ?? 0) * 10) / 10,
      fullMark: maxRadarVal,
    }));

    // ─────────────────────────────
    // ★ Phase13: 原因別ランキング
    // ─────────────────────────────
    const reasonRanking: Array<{ code: ReceivedReason; label: string; count: number; pct: number }> = [];
    if (receivedStats?.byReason) {
      const totalCount = (Object.values(receivedStats.byReason) as number[]).reduce((s, v) => s + (v || 0), 0);
      ([1, 2, 3, 4, 5] as ReceivedReason[]).forEach(code => {
        const count = receivedStats.byReason[code] || 0;
        if (count > 0) {
          reasonRanking.push({
            code,
            label: RECEIVED_REASON_LABELS[code],
            count,
            pct: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
          });
        }
      });
      reasonRanking.sort((a, b) => b.count - a.count);
    }

    return {
      actionData, subData, totalPts, baseStyles,
      actionDataReceived, radarData, totalReceivedPts,
      reasonRanking,
    };
  }, [techniques, receivedStats, techniqueMaster]);

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
            {actionDataReceived.length > 0 && (
              <span style={{
                display:    'block',
                marginTop:  2,
                fontSize:   '0.5rem',
                fontWeight: 600,
                color:      'rgba(252,165,165,0.75)',
                letterSpacing: '0.1em',
              }}>
                内＝与打 / 外＝被打
              </span>
            )}
          </p>
          <div style={{ width: '100%', height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {/* ★ Phase13: 内側ドーナツ = 与打 */}
                <Pie
                  data={actionData}
                  cx="50%" cy="50%"
                  innerRadius="32%" outerRadius="50%"
                  paddingAngle={3}
                  dataKey="value"
                  labelLine={false}
                  nameKey="name"
                >
                  {actionData.map((_, i) => (
                    <Cell key={`g-${i}`} fill={ACTION_COLORS[i % ACTION_COLORS.length]} strokeWidth={0} />
                  ))}
                  {/* 中央ラベル（与打合計を主表示） */}
                  <DonutLabel cx={0} cy={0} totalPts={totalPts} />
                </Pie>

                {/* ★ Phase13: 外側ドーナツ = 被打（データありの時のみ） */}
                {actionDataReceived.length > 0 && (
                  <Pie
                    data={actionDataReceived}
                    cx="50%" cy="50%"
                    innerRadius="58%" outerRadius="76%"
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={false}
                    nameKey="name"
                  >
                    {actionDataReceived.map((_, i) => (
                      <Cell
                        key={`r-${i}`}
                        fill={RECEIVED_ACTION_COLORS[i % RECEIVED_ACTION_COLORS.length]}
                        stroke="rgba(0,0,0,0.4)"
                        strokeWidth={0.5}
                      />
                    ))}
                  </Pie>
                )}

                <PieTooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, _name, item) => {
                    // recharts の payload から内側/外側を判別する代わりに、
                    // payload.outerRadius または item.dataKey で間接判定可能だが
                    // ここでは合計値の所属で判定する簡易ロジック
                    const isReceived =
                      actionDataReceived.some(a => a.name === item.payload.name && a.value === value) &&
                      !actionData.some(a => a.name === item.payload.name && a.value === value);
                    return [
                      `${value} pt`,
                      `${item.payload.name}（${isReceived ? '被打' : '与打'}）`,
                    ];
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={7}
                  wrapperStyle={{ fontSize: 9, color: '#c7d2fe', paddingTop: 4 }}
                  payload={[
                    ...actionData.map((a, i) => ({
                      value: `与・${a.name}`,
                      type: 'circle' as const,
                      color: ACTION_COLORS[i % ACTION_COLORS.length],
                      id:    `g-${i}`,
                    })),
                    ...actionDataReceived.map((a, i) => ({
                      value: `被・${a.name}`,
                      type: 'circle' as const,
                      color: RECEIVED_ACTION_COLORS[i % RECEIVED_ACTION_COLORS.length],
                      id:    `r-${i}`,
                    })),
                  ]}
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
            部位バランス（与打 vs 被打）
            {totalReceivedPts > 0 && (
              <span style={{
                display:    'block',
                marginTop:  2,
                fontSize:   '0.5rem',
                fontWeight: 600,
                color:      'rgba(252,165,165,0.75)',
                letterSpacing: '0.1em',
              }}>
                <span style={{ color: '#a5b4fc' }}>■ 与打</span>
                <span style={{ margin: '0 6px', opacity: 0.5 }}>/</span>
                <span style={{ color: RECEIVED_COLOR_LIGHT }}>■ 被打</span>
              </span>
            )}
          </p>
          <div style={{ width: '100%', height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              {/* ★ Phase13: 部位（面・小手・胴・突き）軸の与打/被打 二重レーダー */}
              <RadarChart data={radarData} outerRadius="62%">
                <PolarGrid stroke="rgba(129,140,248,0.25)" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 8, fill: '#c7d2fe', fontFamily: 'M PLUS Rounded 1c, sans-serif' }}
                />
                <PolarRadiusAxis tick={false} axisLine={false} />

                {/* 与打: 青 */}
                <Radar
                  name="与打"
                  dataKey="given"
                  stroke="#818cf8"
                  fill="#6366f1"
                  fillOpacity={0.32}
                  strokeWidth={1.5}
                  dot={{ fill: '#a5b4fc', r: 2, strokeWidth: 0 }}
                />

                {/* ★ Phase13: 被打: 赤（データがある時のみ重畳描画） */}
                {totalReceivedPts > 0 && (
                  <Radar
                    name="被打"
                    dataKey="received"
                    stroke={RECEIVED_COLOR}
                    fill={RECEIVED_COLOR}
                    fillOpacity={0.28}
                    strokeWidth={1.5}
                    dot={{ fill: RECEIVED_COLOR_LIGHT, r: 2, strokeWidth: 0 }}
                  />
                )}

                <PieTooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, name: string) => [`${v} pt`, name]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
      {/* ====================================================== */}
      {/* ★ Phase13: 弱点分析セクション                        */}
      {/* ====================================================== */}
      {receivedStats && reasonRanking.length > 0 && (
        <WeaknessAnalysisBlock
          ranking={reasonRanking}
          totalReceivedQty={receivedStats.totalReceived}
        />
      )}

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
// =====================================================================
// ★ Phase13: 弱点分析（Weakness Analysis）
// =====================================================================

interface WeaknessRankItem {
  code:  ReceivedReason;
  label: string;
  count: number;
  pct:   number;
}

interface WeaknessAnalysisBlockProps {
  ranking:          WeaknessRankItem[];
  totalReceivedQty: number;
}

/** 各深刻度に対応するアクセントカラー（深刻度が高いほど警戒色強め） */
const REASON_THEME: Record<ReceivedReason, { glow: string; bar: string; text: string }> = {
  1: { glow: 'rgba(251,146,60,0.55)',  bar: '#fb923c', text: '#fed7aa' },  // 攻め負け: 橙
  2: { glow: 'rgba(250,204,21,0.55)',  bar: '#facc15', text: '#fef08a' },  // 単調: 黄
  3: { glow: 'rgba(244,114,182,0.55)', bar: '#f472b6', text: '#fbcfe8' },  // 居着き: ピンク
  4: { glow: 'rgba(239,68,68,0.55)',   bar: '#ef4444', text: '#fecaca' },  // 体勢崩れ: 赤
  5: { glow: 'rgba(180,60,255,0.65)',  bar: '#b45cff', text: '#e9d5ff' },  // 手元上がり: 紫（最重大）
};

function WeaknessAnalysisBlock({ ranking, totalReceivedQty }: WeaknessAnalysisBlockProps) {
  const maxCount = Math.max(...ranking.map(r => r.count), 1);
  const top      = ranking[0];

  return (
    <div style={{
      marginTop:    18,
      padding:      '12px 12px 14px',
      borderRadius: 12,
      background:   'linear-gradient(135deg, rgba(20,5,15,0.55), rgba(30,10,20,0.45))',
      border:       '1px solid rgba(239,68,68,0.28)',
      boxShadow:    '0 0 0 1px rgba(239,68,68,0.1) inset',
      position:     'relative',
      overflow:     'hidden',
    }}>
      {/* 上端のシマー線 */}
      <div style={{
        position:   'absolute',
        top:        0,
        left:       '8%',
        right:      '8%',
        height:     1.5,
        background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.7), transparent)',
        pointerEvents: 'none',
      }} />

      {/* ヘッダ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'rgba(127,29,29,0.45)',
          border: '1px solid rgba(248,113,113,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0,
        }}>
          🛡️
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.55rem', fontWeight: 700,
            color: '#fca5a5', letterSpacing: '0.18em',
            textTransform: 'uppercase', lineHeight: 1.1,
          }}>
            WEAKNESS ANALYSIS
          </div>
          <div style={{
            fontSize: '0.88rem', fontWeight: 800,
            color: '#fff', letterSpacing: '0.02em',
            lineHeight: 1.3, textShadow: '0 0 8px rgba(239,68,68,0.4)',
          }}>
            被打の原因 ランキング
          </div>
        </div>
        <span style={{
          fontSize: '0.62rem', color: '#fca5a5', fontWeight: 700,
          padding: '3px 8px', borderRadius: 999,
          background: 'rgba(127,29,29,0.4)',
          border: '1px solid rgba(248,113,113,0.3)',
          flexShrink: 0,
        }}>
          総 {totalReceivedQty} 本
        </span>
      </div>

      {/* ランキングバー */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ranking.map((item, idx) => {
          const isTop = idx === 0;
          const widthPct = Math.round((item.count / maxCount) * 100);
          const theme = REASON_THEME[item.code];

          return (
            <div
              key={item.code}
              style={{
                position: 'relative',
                padding: '6px 9px 7px',
                borderRadius: 8,
                background: isTop
                  ? 'linear-gradient(90deg, rgba(127,29,29,0.35), rgba(60,10,20,0.2))'
                  : 'rgba(20,10,20,0.4)',
                border: isTop
                  ? `1px solid ${theme.bar}aa`
                  : '1px solid rgba(248,113,113,0.18)',
                boxShadow: isTop ? `0 0 12px ${theme.glow}` : 'none',
              }}
            >
              {/* 1行目: ランク + 名前 + バッジ + 件数 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
              }}>
                {/* ランク数字 */}
                <span style={{
                  flexShrink: 0,
                  width: 18, height: 18, borderRadius: 4,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.62rem', fontWeight: 800,
                  color: isTop ? '#fff' : 'rgba(252,165,165,0.7)',
                  background: isTop ? theme.bar : 'rgba(127,29,29,0.4)',
                  border: isTop ? 'none' : '1px solid rgba(248,113,113,0.3)',
                  letterSpacing: '0.04em',
                  textShadow: isTop ? '0 0 4px rgba(0,0,0,0.5)' : 'none',
                }}>
                  {idx + 1}
                </span>

                {/* 名前 */}
                <span style={{
                  fontSize: isTop ? '0.82rem' : '0.78rem',
                  fontWeight: isTop ? 800 : 700,
                  color: isTop ? '#fff' : theme.text,
                  letterSpacing: '0.04em',
                  textShadow: isTop ? `0 0 6px ${theme.glow}` : 'none',
                }}>
                  {item.label}
                </span>

                {/* 1位の警告バッジ */}
                {isTop && (
                  <span style={{
                    flexShrink: 0,
                    fontSize: '0.55rem', fontWeight: 800,
                    padding: '2px 7px', borderRadius: 999,
                    background: `linear-gradient(90deg, ${theme.bar}, #b45cff)`,
                    color: '#fff', letterSpacing: '0.08em',
                    boxShadow: `0 0 8px ${theme.glow}`,
                    animation: 'weakness-top-pulse 1.6s ease-in-out infinite',
                    whiteSpace: 'nowrap',
                  }}>
                    ⚠️ 最優先課題
                  </span>
                )}

                {/* 件数 / % */}
                <span style={{
                  marginLeft: 'auto', flexShrink: 0,
                  fontSize: '0.72rem', fontWeight: 700,
                  color: isTop ? '#fff' : 'rgba(252,165,165,0.85)',
                  letterSpacing: '0.04em',
                }}>
                  {item.count}本
                  <span style={{
                    fontSize: '0.6rem',
                    color: 'rgba(252,165,165,0.55)',
                    fontWeight: 600,
                    marginLeft: 4,
                  }}>
                    {item.pct}%
                  </span>
                </span>
              </div>

              {/* 2行目: 水平棒グラフ */}
              <div style={{
                position: 'relative',
                height: 6,
                borderRadius: 999,
                background: 'rgba(0,0,0,0.4)',
                overflow: 'hidden',
                border: '1px solid rgba(248,113,113,0.12)',
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${widthPct}%`,
                  background: `linear-gradient(90deg, ${theme.bar}, ${theme.bar}cc)`,
                  borderRadius: 999,
                  boxShadow: isTop
                    ? `0 0 8px ${theme.glow}, inset 0 0 4px rgba(255,255,255,0.3)`
                    : 'none',
                  transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
                }} />
                {/* シマー（1位のみ） */}
                {isTop && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${widthPct}%`,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'weakness-shimmer 2.4s linear infinite',
                    borderRadius: 999,
                  }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 1位への対策メモ（手元上がり=5 のときのみ強調メッセージ） */}
      {top && top.code === 5 && (
        <div style={{
          marginTop: 10,
          padding: '7px 10px',
          borderRadius: 8,
          background: 'rgba(75,30,120,0.35)',
          border: '1px solid rgba(180,60,255,0.45)',
          fontSize: '0.7rem',
          color: '#e9d5ff',
          lineHeight: 1.5,
          letterSpacing: '0.03em',
        }}>
          <span style={{ fontWeight: 800, color: '#fff' }}>※ 手元上がりは最重大の悪癖</span>
          <br />
          剣先を下げて構え直し、手の内の握り直しを最優先に。
        </div>
      )}

      {/* キーフレーム */}
      <style>{`
        @keyframes weakness-top-pulse {
          0%, 100% { transform: scale(1);   opacity: 1;    }
          50%      { transform: scale(1.06); opacity: 0.85; }
        }
        @keyframes weakness-shimmer {
          0%   { background-position:  200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
