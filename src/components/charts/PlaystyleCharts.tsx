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
import { RECEIVED_REASON_LABELS, RECEIVED_REASON_FULL_LABELS } from '@/types';
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
// 与打（外側ドーナツ・蒼系）
const COLOR_GIVEN_OFFENSE  = '#1875BF';   // 明るいao（攻めの光）
const COLOR_GIVEN_DEFENSE  = '#0D3F66';   // 深いao（守りの静寂）

// 被打（内側ドーナツ・紅系）
const COLOR_RECV_OFFENSE   = '#641914';   // kuraiaka（打たれた警告）
const COLOR_RECV_DEFENSE   = '#974A45';   // akaruiaka（隙を突かれた影）

// 部位（BodyPart）の表示順を固定
const BODY_PART_AXIS = ['面', '小手', '胴', '突き'];

// =====================================================================
// ★ Phase13.3 final: ドーナツツールチップ（レーダーと統一感のある漆黒+シアン）
// =====================================================================
const TOOLTIP_STYLE: React.CSSProperties = {
  background:    'rgba(5, 4, 18, 0.95)',
  border:        '1px solid rgba(24, 117, 191, 0.45)',
  borderRadius:  10,
  color:         '#fff',
  fontSize:      12,
  fontWeight:    700,
  padding:       '8px 12px',
  boxShadow:     '0 0 14px rgba(24, 117, 191, 0.25)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  letterSpacing: '0.04em',
};

// ツールチップ内のラベル（系列名）スタイル
const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color:         'rgba(199, 210, 254, 0.85)',
  fontWeight:    600,
};

// ツールチップ内のアイテム（数値）スタイル
const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color:         '#fff',
  fontWeight:    700,
};


// =====================================================================
// ★ Phase13.3 final: 2カラム共通レイアウト用スタイル
// =====================================================================
const COLUMN_PANEL_STYLE: React.CSSProperties = {
  background:   'rgba(255,255,255,0.04)',
  borderRadius: 14,
  padding:      '0.85rem 0.5rem 0.7rem',
  border:       '1px solid rgba(129,140,248,0.15)',
  display:      'flex',
  flexDirection: 'column',
  flex:         '1 1 150px',   // ★ 280px → 150px に変更
  minWidth:     0,
};

const COLUMN_HEADER_STYLE: React.CSSProperties = {
  textAlign:     'center',
  marginBottom:  6,
};

const COLUMN_TITLE_STYLE: React.CSSProperties = {
  margin:        0,
  fontSize:      '0.6rem',
  fontWeight:    800,
  color:         'rgba(165,180,252,0.7)',
  letterSpacing: '0.18em',
};

const COLUMN_SUBTITLE_STYLE: React.CSSProperties = {
  margin:        '2px 0 0',
  fontSize:      '0.55rem',
  fontWeight:    600,
  color:         'rgba(199,210,254,0.5)',
  letterSpacing: '0.05em',
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

  // ★ Phase13.3.3: 弱点ツールチップの State
  const [activeWeaknessTooltip, setActiveWeaknessTooltip] = useState<number | null>(null);

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
    let receivedOffenseTotal = 0;
    let receivedDefenseTotal = 0;
    let totalReceivedPts     = 0;

    if (receivedStats?.byTechnique) {
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

        const bp = entry.bodyPart || techMap[entry.techniqueId]?.bodyPart || '未分類';
        receivedByBodyPart[bp] = (receivedByBodyPart[bp] ?? 0) + pts;

        const at = techMap[entry.techniqueId]?.actionType;
        if (at === '応じ技')      receivedDefenseTotal += pts;
        else                      receivedOffenseTotal += pts;
      });
    }

    // ─────────────────────────────
    // ★ Phase13.3: ACTION BALANCE 二重ドーナツデータ
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
    // ★ Phase13.3.2: 部位別 与打/被打 デュアルレーダーデータ
    // ─────────────────────────────
    const radarData = BODY_PART_AXIS.map(bp => ({
      subject:  bp,
      given:    Math.round((givenByBodyPart[bp]    ?? 0) * 10) / 10,
      received: Math.round((receivedByBodyPart[bp] ?? 0) * 10) / 10,
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
      givenDonutData,
      receivedDonutData,
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

  // ─────────────────────────────────────────────
  // ★ Phase13.3 final: 各サブツリーの表示可否判定
  // ─────────────────────────────────────────────
  const hasDonut = givenDonutData.length > 0 || receivedDonutData.length > 0;
  const hasRadar = radarData.some(d => d.given > 0 || d.received > 0);

  return (
    <>
      {/* ====================================================== */}
      {/* ★ Phase13.3 final: ACTION BALANCE + BODY PART SCORE 2カラム */}
      {/* ====================================================== */}
      <div style={{
        display:        'flex',
        flexDirection:  'row',
        flexWrap:       'wrap',     // 狭い画面では自動的に縦並びに
        justifyContent: 'space-between',
        alignItems:     'stretch',  // 高さを揃える
        gap:            10,
        marginBottom:   12,
      }}>

        {/* ────────────────────────────────────── */}
        {/* カラム①: ACTION BALANCE                */}
        {/* ────────────────────────────────────── */}
        {hasDonut && (
          <div style={COLUMN_PANEL_STYLE}>
            <div style={COLUMN_HEADER_STYLE}>
              <p style={COLUMN_TITLE_STYLE}>ACTION BALANCE</p>
//              <p style={COLUMN_SUBTITLE_STYLE}>外輪＝与打 / 内輪＝被打</p>
            </div>

            <div style={{ width: '100%', height: 200, flex: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {/* 内側ドーナツ = 被打 */}
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

                  {/* 外側ドーナツ = 与打 */}
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
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={(value: number, _name, item) => {
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
                    iconSize={7}
                    wrapperStyle={{
                      fontSize:      9,
                      color:         '#c7d2fe',
                      paddingTop:    6,
                      letterSpacing: '0.04em',
                      lineHeight:    1.5,
                    }}
                    payload={[
                      ...givenDonutData.map((d, i) => ({
                        value: d.name,
                        type:  'circle' as const,
                        color: d.color,
                        id:    `given-${i}`,
                      })),
                      ...receivedDonutData.map((d, i) => ({
                        value: d.name,
                        type:  'circle' as const,
                        color: d.color,
                        id:    `recv-${i}`,
                      })),
                    ]}
                    formatter={(value, entry) => {
                      const allData = [...givenDonutData, ...receivedDonutData];
                      const item    = allData.find(a => a.name === value);
                      return (
                        <span style={{ color: entry.color, fontWeight: 700 }}>
                          {value}
                          <span style={{
                            color:      'rgba(199,210,254,0.55)',
                            fontWeight: 600,
                            marginLeft: 3,
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
        )}

        {/* ────────────────────────────────────── */}
        {/* カラム②: BODY PART SCORE              */}
        {/* ────────────────────────────────────── */}
        {hasRadar && (
          <div style={COLUMN_PANEL_STYLE}>
            <div style={COLUMN_HEADER_STYLE}>
              <p style={COLUMN_TITLE_STYLE}>BODY PART SCORE</p>
              <p style={COLUMN_SUBTITLE_STYLE}>部位ごとの与打 vs 被打</p>
            </div>

            <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'center' }}>
              <RadarChart data={radarData} />
            </div>
          </div>
        )}

      </div>

      {/* ====================================================== */}
      {/* ★ Phase13.3.3: 弱点分析 (冷徹な脆弱性メーター)        */}
      {/* ====================================================== */}
      {receivedStats && reasonRanking.length > 0 && (
        <WeaknessAnalysisBlock
          ranking={reasonRanking}
          totalReceivedQty={receivedStats.totalReceived}
          activeTooltip={activeWeaknessTooltip}
          setActiveTooltip={setActiveWeaknessTooltip}
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
// ★ Phase13.3.3: WEAKNESS ANALYSIS（冷徹な脆弱性メーター）
// =====================================================================

interface WeaknessRankItem {
  code:  ReceivedReason;
  label: string;
  count: number;
  pct:   number;
}

interface WeaknessAnalysisBlockProps {
  ranking:           WeaknessRankItem[];
  totalReceivedQty:  number;
  activeTooltip:     number | null;
  setActiveTooltip:  (code: number | null) => void;
}

function WeaknessAnalysisBlock({
  ranking,
  totalReceivedQty,
  activeTooltip,
  setActiveTooltip,
}: WeaknessAnalysisBlockProps) {
  const maxCount = Math.max(...ranking.map(r => r.count), 1);

  return (
    <div style={{
      marginTop:    18,
      padding:      '14px 14px 16px',
      borderRadius: 12,
      background:   'rgba(10, 5, 8, 0.6)',
      border:       '1px solid rgba(100, 25, 20, 0.45)',
      position:     'relative',
      overflow:     'visible',
    }}>
      {/* ヘッダー */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   14,
        paddingBottom:  8,
        borderBottom:   '1px solid rgba(100, 25, 20, 0.35)',
      }}>
        <div>
          <div style={{
            fontSize:      '0.56rem',
            fontWeight:    800,
            color:         'rgba(255, 255, 255, 0.45)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
          }}>
            WEAKNESS ANALYSIS
          </div>
          <div style={{
            marginTop:     2,
            fontSize:      '0.78rem',
            fontWeight:    700,
            color:         'rgba(255, 255, 255, 0.85)',
            letterSpacing: '0.04em',
          }}>
            被打要因
          </div>
        </div>
        <span style={{
          fontSize:      '0.6rem',
          color:         'rgba(255, 255, 255, 0.5)',
          fontWeight:    600,
          letterSpacing: '0.06em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          TOTAL {totalReceivedQty}
        </span>
      </div>

      {/* ランキング行 */}
      <div>
        {ranking.map((item, idx) => {
          const isTop      = idx === 0;
          const widthPct   = Math.round((item.count / maxCount) * 100);
          const isActive   = activeTooltip === item.code;
          const rankStr    = String(idx + 1).padStart(2, '0');

          return (
            <div
              key={item.code}
              onClick={() => setActiveTooltip(isActive ? null : item.code)}
              onMouseLeave={() => setActiveTooltip(null)}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        10,
                marginBottom: idx === ranking.length - 1 ? 0 : 12,
                position:   'relative',
                cursor:     'pointer',
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* ① 順位 */}
              <span style={{
                flexShrink: 0,
                width:      18,
                fontSize:   '0.62rem',
                fontWeight: 700,
                color:      'rgba(255, 255, 255, 0.4)',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                letterSpacing: '0.04em',
                textAlign:  'left',
              }}>
                {rankStr}
              </span>

              {/* ② ラベル */}
              <span style={{
                flexShrink: 0,
                width:      64,
                fontSize:   '0.7rem',
                fontWeight: 700,
                color:      isActive
                  ? '#fff'
                  : 'rgba(255, 255, 255, 0.88)',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                overflow:   'hidden',
                textOverflow: 'ellipsis',
                transition: 'color 0.2s ease',
              }}>
                {item.label}
              </span>

              {/* ③ バー */}
              <div style={{
                flex:         1,
                position:     'relative',
                height:       6,
                background:   'rgba(255, 255, 255, 0.05)',
                borderRadius: 999,
                overflow:     'hidden',
              }}>
                <div style={{
                  position:     'absolute',
                  inset:        0,
                  width:        `${widthPct}%`,
                  background:   '#641914',
                  borderRadius: 999,
                  transition:   'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  boxShadow:    isTop
                    ? '0 0 8px rgba(255, 0, 85, 0.4)'
                    : 'none',
                  animation:    isTop
                    ? 'weakness-pulse-bar 2.4s ease-in-out infinite'
                    : 'none',
                }} />
              </div>

              {/* ④ ツールチップ */}
              {isActive && (
                <div style={{
                  position:     'absolute',
                  bottom:       'calc(100% + 6px)',
                  right:        0,
                  zIndex:       10,
                  background:   'rgba(100, 25, 20, 0.95)',
                  border:       '1px solid #ff0055',
                  borderRadius: 4,
                  padding:      '6px 10px',
                  color:        '#fff',
                  whiteSpace:   'nowrap',
                  boxShadow:    '0 4px 16px rgba(0, 0, 0, 0.6), 0 0 12px rgba(255, 0, 85, 0.25)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  animation:    'weakness-tooltip-fade 0.18s ease-out',
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    fontSize:      '0.65rem',
                    opacity:       0.8,
                    letterSpacing: '0.04em',
                    fontWeight:    600,
                  }}>
                    {RECEIVED_REASON_FULL_LABELS[item.code]}
                  </div>
                  <div style={{
                    fontSize:      '0.8rem',
                    fontWeight:    700,
                    marginTop:     4,
                    letterSpacing: '0.04em',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {item.count} pt
                    <span style={{
                      fontSize:   '0.6rem',
                      fontWeight: 600,
                      opacity:    0.7,
                      marginLeft: 6,
                    }}>
                      ({item.pct}%)
                    </span>
                  </div>
                  <div style={{
                    position:     'absolute',
                    bottom:       -5,
                    right:        14,
                    width:        8,
                    height:       8,
                    background:   'rgba(100, 25, 20, 0.95)',
                    borderRight:  '1px solid #ff0055',
                    borderBottom: '1px solid #ff0055',
                    transform:    'rotate(45deg)',
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes weakness-pulse-bar {
          0%, 100% {
            box-shadow: 0 0 6px rgba(255, 0, 85, 0.3);
            opacity: 1;
          }
          50% {
            box-shadow: 0 0 14px rgba(255, 0, 85, 0.6);
            opacity: 0.92;
          }
        }
        @keyframes weakness-tooltip-fade {
          0% {
            opacity: 0;
            transform: translateY(2px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
