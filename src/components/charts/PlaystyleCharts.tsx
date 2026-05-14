// src/components/charts/PlaystyleCharts.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type {
  Technique, MatchupMasterEntry, PeerStyleEntry, TechniqueMasterEntry,
  ReceivedStats, ReceivedReason,
} from '@/types';
import { RECEIVED_REASON_LABELS } from '@/types';
import MatchupScroll from '@/components/charts/MatchupScroll';
import RadarChart from '@/components/charts/RadarChart';
import { getDegreeTheme, getTagHoverStyles } from '@/lib/matchupTheme';

interface Props {
  techniques:       Technique[];
  matchupMaster?:   MatchupMasterEntry[];
  peersStyle?:      PeerStyleEntry[];
  techniqueMaster?: TechniqueMasterEntry[];
  /** ★ Phase13: 被打統計（与打との対比表示に使用） */
  receivedStats?:   ReceivedStats;
}

// =====================================================================
// ★ Phase13.3: ACTION BALANCE のカラーパレット
// 外側=与打（青系）、内側=被打（赤系）の二重ドーナツ
// =====================================================================
// 与打（外側ドーナツ・青系）
const COLOR_GIVEN_OFFENSE  = '#00e5ff';   // シアン:   仕掛け
const COLOR_GIVEN_DEFENSE  = '#818cf8';   // インディゴ: 応じ

// 被打（内側ドーナツ・赤系）
const COLOR_RECV_OFFENSE   = '#ff0055';   // クリムゾン: 仕掛け（被打）
const COLOR_RECV_DEFENSE   = '#fb923c';   // オレンジ赤: 応じ（被打）

// 部位（BodyPart）の表示順を固定
const BODY_PART_AXIS = ['面', '小手', '胴', '突き'];

const TOOLTIP_STYLE = {
  background: '#1e1b4b', border: 'none',
  borderRadius: 10, color: '#fff',
  fontSize: 12, padding: '8px 12px',
};

// =====================================================================
// 中央ラベル（ドーナツ用）
// =====================================================================
function DonutCenterLabel({ totalGiven, totalReceived }: { totalGiven: number; totalReceived: number }) {
  return (
    <g>
      <text x="50%" y="46%" textAnchor="middle" fill="#c7d2fe" fontSize={9} fontWeight={700} letterSpacing="0.1em">
        ATK / DEF
      </text>
      <text x="50%" y="56%" textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>
        <tspan fill="#7dd3fc">{totalGiven}</tspan>
        <tspan fill="rgba(165,180,252,0.4)" dx={3} dy={0}>:</tspan>
        <tspan fill="#fb7185" dx={3}>{Math.round(totalReceived)}</tspan>
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

  const [selectedMatchup, setSelectedMatchup] = useState<MatchupMasterEntry | null>(null);

  const {
    givenDonutData,
    receivedDonutData,
    radarData,
    totalGiven,
    totalReceivedPts,
    baseStyles,
    reasonRanking,
  } = useMemo(() => {
    // ─────────────────────────────
    // 与打: ActionType / SubCategory / BodyPart の集計
    // ─────────────────────────────
    let offenseTotal = 0;   // 仕掛け技
    let defenseTotal = 0;   // 応じ技
    const subTotals:    Record<string, number> = {};
    const givenByBodyPart: Record<string, number> = {};

    techniques.forEach(t => {
      const pts = t.points ?? 0;
      if (pts <= 0) return;

      // ActionType を「仕掛け技 / 応じ技」の2軸に正規化
      if (t.actionType === '仕掛け技')      offenseTotal += pts;
      else if (t.actionType === '応じ技')   defenseTotal += pts;
      else                                  offenseTotal += pts; // 不明は仕掛け扱い

      if (t.subCategory) subTotals[t.subCategory] = (subTotals[t.subCategory] ?? 0) + pts;

      if (t.bodyPart) {
        givenByBodyPart[t.bodyPart] = (givenByBodyPart[t.bodyPart] ?? 0) + pts;
      }
    });

    const totalGiven = offenseTotal + defenseTotal;

    // ─────────────────────────────
    // 被打: 部位別 + ★ Phase13.3: ActionType別の集計
    // ─────────────────────────────
    const receivedByBodyPart:   Record<string, number> = {};
    let receivedOffenseTotal = 0;   // 被打のうち、相手の仕掛け技で打たれた合計
    let receivedDefenseTotal = 0;   // 被打のうち、相手の応じ技で打たれた合計
    let totalReceivedPts     = 0;

    if (receivedStats?.byTechnique) {
      // technique_id → { actionType, bodyPart } の引きマップ
      const techMap: Record<string, { actionType?: string; bodyPart?: string }> = {};
      techniqueMaster.forEach(m => {
        techMap[m.id] = { actionType: m.actionType, bodyPart: m.bodyPart };
      });
      techniques.forEach(t => {
        if (!techMap[t.id]) techMap[t.id] = { actionType: t.actionType, bodyPart: t.bodyPart };
      });

      receivedStats.byTechnique.forEach(entry => {
        const pts = entry.receivedPoints || 0;
        if (pts <= 0) return;
        totalReceivedPts += pts;

        // 部位別集計
        const bp = entry.bodyPart || techMap[entry.techniqueId]?.bodyPart || '未分類';
        receivedByBodyPart[bp] = (receivedByBodyPart[bp] ?? 0) + pts;

        // ★ Phase13.3: ActionType別集計（被打側）
        const at = techMap[entry.techniqueId]?.actionType;
        if (at === '応じ技')      receivedDefenseTotal += pts;
        else                      receivedOffenseTotal += pts; // 仕掛け技 or 不明 は仕掛け扱い
      });
    }

    // ─────────────────────────────
    // ★ Phase13.3: ACTION BALANCE 二重ドーナツデータ
    //   - 外側（与打）: 仕掛け / 応じ
    //   - 内側（被打）: 仕掛け / 応じ
    // ─────────────────────────────
    const givenDonutData = [
      { name: '与打・仕掛け', value: offenseTotal, color: COLOR_GIVEN_OFFENSE, layer: 'given' as const },
      { name: '与打・応じ',   value: defenseTotal, color: COLOR_GIVEN_DEFENSE, layer: 'given' as const },
    ].filter(d => d.value > 0);

    const receivedDonutData = [
      { name: '被打・仕掛け', value: Math.round(receivedOffenseTotal * 10) / 10, color: COLOR_RECV_OFFENSE, layer: 'received' as const },
      { name: '被打・応じ',   value: Math.round(receivedDefenseTotal * 10) / 10, color: COLOR_RECV_DEFENSE, layer: 'received' as const },
    ].filter(d => d.value > 0);

    // ─────────────────────────────
    // ★ Phase13.3: 部位別 与打/被打 比較データ
    // ─────────────────────────────
    const allBodyParts = Array.from(new Set<string>([
      ...BODY_PART_AXIS,
      ...Object.keys(givenByBodyPart),
      ...Object.keys(receivedByBodyPart),
    ]));

    const orderedBodyParts = [
      ...BODY_PART_AXIS.filter(bp => allBodyParts.includes(bp)),
      ...allBodyParts.filter(bp => !BODY_PART_AXIS.includes(bp)),
    ];

    const maxRadarVal = Math.max(
      1,
      ...orderedBodyParts.map(bp => givenByBodyPart[bp] ?? 0),
      ...orderedBodyParts.map(bp => receivedByBodyPart[bp] ?? 0),
    );

    const radarData = orderedBodyParts
      .filter(bp => (givenByBodyPart[bp] ?? 0) > 0 || (receivedByBodyPart[bp] ?? 0) > 0)
      .map(bp => ({
        subject:  bp,
        given:    Math.round((givenByBodyPart[bp]    ?? 0) * 10) / 10,
        received: Math.round((receivedByBodyPart[bp] ?? 0) * 10) / 10,
        fullMark: maxRadarVal,
      }));

    // ─────────────────────────────
    // BaseStyle（剣風相性のキー）
    // ─────────────────────────────
    const baseStyles: string[] = Object.entries(subTotals)
      .filter(([, pts]) => pts > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([key]) => key);

    // ─────────────────────────────
    // 弱点ランキング
    // ─────────────────────────────
    const reasonRanking: Array<{ code: ReceivedReason; label: string; count: number; pct: number }> = [];
    if (receivedStats?.byReason) {
      const totalCount = (Object.values(receivedStats.byReason) as number[])
        .reduce((s, v) => s + (v || 0), 0);
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
      givenDonutData,        // ★ Phase13.3: 外側ドーナツ
      receivedDonutData,     // ★ Phase13.3: 内側ドーナツ
      radarData,
      totalGiven,
      totalReceivedPts,
      baseStyles,
      reasonRanking,
    };
  }, [techniques, receivedStats, techniqueMaster]);

  // matchupGroups
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

  const modalBaseStyle = selectedMatchup?.baseStyle ?? (baseStyles[0] ?? '');

  if (!mounted) return null;
  if (totalGiven === 0 && totalReceivedPts === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem', color: '#a8a29e', fontSize: '0.82rem' }}>
        技を評価するとプレイスタイル分析が表示されます
      </div>
    );
  }

  return (
    <>
      {/* ====================================================== */}
      {/* 上段: ACTION BALANCE 二重ドーナツ                      */}
      {/* ====================================================== */}
      <div style={{
        background:   'rgba(255,255,255,0.04)',
        borderRadius: 14,
        padding:      '0.85rem 0.6rem 0.7rem',
        border:       '1px solid rgba(129,140,248,0.15)',
        marginBottom: 12,
      }}>
        <div style={{
          textAlign:     'center',
          marginBottom:  6,
        }}>
          <p style={{
            margin:        0,
            fontSize:      '0.6rem',
            fontWeight:    800,
            color:         'rgba(165,180,252,0.7)',
            letterSpacing: '0.18em',
          }}>
            ACTION BALANCE
          </p>
          <p style={{
            margin:        '2px 0 0',
            fontSize:      '0.55rem',
            fontWeight:    600,
            color:         'rgba(199,210,254,0.5)',
            letterSpacing: '0.05em',
          }}>
            外＝与打 / 内＝被打（仕掛け・応じ）
          </p>
        </div>

        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {/* ★ Phase13.3: 内側ドーナツ = 被打（仕掛け / 応じ） */}
              {receivedDonutData.length > 0 && (
                <Pie
                  data={receivedDonutData}
                  cx="50%" cy="50%"
                  innerRadius="34%"
                  outerRadius="56%"
                  paddingAngle={3}
                  dataKey="value"
                  labelLine={false}
                  nameKey="name"
                  stroke="rgba(0,0,0,0.5)"
                  strokeWidth={1}
                >
                  {receivedDonutData.map((entry, i) => (
                    <Cell key={`recv-${i}`} fill={entry.color} />
                  ))}
                </Pie>
              )}

              {/* ★ Phase13.3: 外側ドーナツ = 与打（仕掛け / 応じ） */}
              {givenDonutData.length > 0 && (
                <Pie
                  data={givenDonutData}
                  cx="50%" cy="50%"
                  innerRadius="62%"
                  outerRadius="84%"
                  paddingAngle={3}
                  dataKey="value"
                  labelLine={false}
                  nameKey="name"
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={1}
                >
                  {givenDonutData.map((entry, i) => (
                    <Cell key={`given-${i}`} fill={entry.color} />
                  ))}
                </Pie>
              )}

              {/* 中央ラベル */}
              {(totalGiven > 0 || totalReceivedPts > 0) && (
                <DonutCenterLabel totalGiven={totalGiven} totalReceived={totalReceivedPts} />
              )}

              <PieTooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number, _name, item) => {
                  // 与打/被打 どちらの系列か判定
                  const isGiven = givenDonutData.some(d => d.name === item.payload.name);
                  const layerTotal = isGiven
                    ? givenDonutData.reduce((s, d) => s + d.value, 0)
                    : receivedDonutData.reduce((s, d) => s + d.value, 0);
                  const pct = layerTotal > 0 ? Math.round((value / layerTotal) * 100) : 0;
                  return [`${value} pt（${pct}%）`, item.payload.name];
                }}
              />

              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{
                  fontSize: 10,
                  color: '#c7d2fe',
                  paddingTop: 8,
                  letterSpacing: '0.04em',
                }}
                payload={[
                  ...givenDonutData.map((d, i) => ({
                    value: d.name,
                    type: 'circle' as const,
                    color: d.color,
                    id: `given-${i}`,
                  })),
                  ...receivedDonutData.map((d, i) => ({
                    value: d.name,
                    type: 'circle' as const,
                    color: d.color,
                    id: `recv-${i}`,
                  })),
                ]}
                formatter={(value, entry) => {
                  const allData = [...givenDonutData, ...receivedDonutData];
                  const item = allData.find(a => a.name === value);
                  return (
                    <span style={{ color: entry.color, fontWeight: 700 }}>
                      {value}
                      <span style={{
                        color: 'rgba(199,210,254,0.55)',
                        fontWeight: 600,
                        marginLeft: 4,
                      }}>
                        {item?.value ?? 0}
                      </span>
                    </span>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ====================================================== */}
      {/* 中段: 部位別 与打/被打 比較バーチャート               */}
      {/* ====================================================== */}
      <div style={{
        background:   'rgba(255,255,255,0.04)',
        borderRadius: 14,
        padding:      '0.85rem 0.7rem',
        border:       '1px solid rgba(129,140,248,0.15)',
        marginBottom: 12,
      }}>
        <div style={{ marginBottom: 10 }}>
          <p style={{
            margin:        0,
            fontSize:      '0.6rem',
            fontWeight:    800,
            color:         'rgba(165,180,252,0.7)',
            letterSpacing: '0.18em',
          }}>
            BODY PART SCORE
          </p>
          <p style={{
            margin:        '2px 0 0',
            fontSize:      '0.55rem',
            fontWeight:    600,
            color:         'rgba(199,210,254,0.5)',
            letterSpacing: '0.05em',
          }}>
            部位ごとの与打 vs 被打
          </p>
        </div>

        {radarData.length > 0 ? (
          <RadarChart data={radarData} />
        ) : (
          <p style={{
            textAlign:'center', fontSize:'0.78rem',
            color: 'rgba(165,180,252,0.4)', padding: '1rem 0', margin: 0,
          }}>
            部位別の集計データがありません
          </p>
        )}
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

      {/* ====================================================== */}
      {/* BaseStyle バッジ + 相性タグ                            */}
      {/* ====================================================== */}
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
// MatchupTag
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

const REASON_THEME: Record<ReceivedReason, { glow: string; bar: string; text: string }> = {
  1: { glow: 'rgba(251,146,60,0.55)',  bar: '#fb923c', text: '#fed7aa' },
  2: { glow: 'rgba(250,204,21,0.55)',  bar: '#facc15', text: '#fef08a' },
  3: { glow: 'rgba(244,114,182,0.55)', bar: '#f472b6', text: '#fbcfe8' },
  4: { glow: 'rgba(239,68,68,0.55)',   bar: '#ef4444', text: '#fecaca' },
  5: { glow: 'rgba(180,60,255,0.65)',  bar: '#b45cff', text: '#e9d5ff' },
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
      <div style={{
        position:   'absolute',
        top:        0,
        left:       '8%',
        right:      '8%',
        height:     1.5,
        background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.7), transparent)',
        pointerEvents: 'none',
      }} />

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
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
              }}>
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

                <span style={{
                  fontSize: isTop ? '0.82rem' : '0.78rem',
                  fontWeight: isTop ? 800 : 700,
                  color: isTop ? '#fff' : theme.text,
                  letterSpacing: '0.04em',
                  textShadow: isTop ? `0 0 6px ${theme.glow}` : 'none',
                }}>
                  {item.label}
                </span>

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

      <style>{`
        @keyframes weakness-top-pulse {
          0%, 100% { transform: scale(1);   opacity: 1;    }
          50%      { transform: scale(1.06); opacity: 0.85; }
        }
        @keyframes weakness-shimmer {
          0%   { background-position:  200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fade-up {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
