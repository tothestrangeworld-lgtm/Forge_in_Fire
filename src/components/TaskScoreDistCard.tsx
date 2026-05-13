// src/components/TaskScoreDistCard.tsx
// =====================================================================
// 百錬自得 - 課題別スコア分布カード（ダッシュボード用 共通コンポーネント）
// 自分のダッシュボード / 剣友ダッシュボードの両方で使用する。
//
// ★ Phase-ex3 Step1: 新規作成
// ★ Phase-ex3 修正:
//   - ヘッダーを縦積みレイアウトへ変更（モバイル時の縦割れ防止）
//   - Mastery表示を flexWrap で折り返し対応
//   - スマホでも反応するカスタムツールチップ（State駆動）を実装
//
// 【設計方針】
//   - 4行構成（ヘッダー / 自己分布バー / 剣友分布バー / インサイト）
//   - 自己と剣友のスコア分布を100%積み上げバーで可視化
//   - mastery データが渡された場合は、ヘッダー右側に免許皆伝ステータスを表示
//   - 各セグメントタップで吹き出しを表示
// =====================================================================

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { MasteryStatus } from '@/types';
import {
  MASTERY_REQUIRED_COUNT,
  isNearDiscern,
  shouldShowCombo,
} from '@/lib/mastery';

// ---------------------------------------------------------------------
// 100%積み上げバー用カラーマップ（インディゴ階調）
// ---------------------------------------------------------------------
const SCORE_COLORS: Record<number, string> = {
  5: '#4f46e5',
  4: '#6366f1',
  3: '#818cf8',
  2: '#c7d2fe',
  1: '#e0e7ff',
};

// ---------------------------------------------------------------------
// 履歴ドット用カラーマップ
// ---------------------------------------------------------------------
const DOT_COLORS: Record<number, string> = {
  1: '#f87171',
  2: '#fb923c',
  3: '#fbbf24',
  4: '#86efac',
  5: '#fde68a',
};

// =====================================================================
// ツールチップ State 型
// =====================================================================

interface TooltipState {
  score: number;   // 1〜5
  count: number;   // 何回
  pct:   string;   // "23.5%" のような表示用文字列
  x:     number;   // カード基準のX座標 (px)
  y:     number;   // カード基準のY座標 (px)
  label: string;   // "自分" / "剣友"
}

// =====================================================================
// Props
// =====================================================================

export interface TaskScoreDistCardProps {
  taskText:        string;
  selfDist:        Record<number, number>;
  selfTotalPts:    number;
  selfTotalCount:  number;
  peerDist?:       Record<number, number>;
  peerTotalPts?:   number;
  peerTotalCount?: number;
  mastery?:        MasteryStatus | null;
  insight?:        string;
}

// =====================================================================
// メインコンポーネント
// =====================================================================

export function TaskScoreDistCard({
  taskText,
  selfDist,
  selfTotalPts,
  selfTotalCount,
  peerDist,
  peerTotalPts    = 0,
  peerTotalCount  = 0,
  mastery,
  insight,
}: TaskScoreDistCardProps) {

  const showMastery = mastery != null && mastery.evalCount > 0;
  const showPeer    = peerTotalCount > 0 && peerDist != null;

  const selfAvg = selfTotalCount > 0
    ? (selfTotalPts / selfTotalCount).toFixed(2)
    : '—';
  const peerAvg = peerTotalCount > 0
    ? (peerTotalPts / peerTotalCount).toFixed(2)
    : '—';

  // ── ★ ツールチップ State ─────────────────────────────────
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // 外側クリック / Esc で閉じる
  useEffect(() => {
    if (!tooltip) return;

    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      // バー内部のクリックは onClick で別処理されるため、ここでは
      // カード外（または余白）をクリックしたときに閉じるだけでよい
      if (cardRef.current && !cardRef.current.contains(target)) {
        setTooltip(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTooltip(null);
    };

    // capture=true で一度コンテナで処理した後に届くように
    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('touchstart', handleDocClick as unknown as EventListener);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('touchstart', handleDocClick as unknown as EventListener);
      document.removeEventListener('keydown', handleKey);
    };
  }, [tooltip]);

  // セグメントクリック共通ハンドラ
  const handleSegmentClick = useCallback((args: {
    score: number;
    count: number;
    total: number;
    label: string;
    event: React.MouseEvent<HTMLDivElement>;
  }) => {
    const { score, count, total, label, event } = args;
    if (!cardRef.current) return;

    const cardRect    = cardRef.current.getBoundingClientRect();
    const segmentRect = event.currentTarget.getBoundingClientRect();

    // セグメントの中央上端を、カード基準の相対座標に変換
    const x = segmentRect.left + segmentRect.width / 2 - cardRect.left;
    const y = segmentRect.top - cardRect.top;

    const pct = total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '0%';

    setTooltip(prev => {
      // 同じセグメントを再タップ → 閉じる
      if (prev && prev.score === score && prev.label === label) return null;
      return { score, count, pct, x, y, label };
    });
  }, []);

  // カード余白クリックで閉じる（バー以外）
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // バー要素 / ツールチップ自体をクリックしたときは無視
    const target = e.target as HTMLElement;
    if (target.closest('[data-bar-segment]')) return;
    if (target.closest('[data-tooltip]'))     return;
    setTooltip(null);
  };

  return (
    <div
      ref={cardRef}
      onClick={handleCardClick}
      style={{
        position:     'relative',
        padding:      '12px 14px',
        borderRadius: 12,
        background:   'rgba(49,46,129,0.35)',
        border:       '1px solid rgba(139,92,246,0.2)',
        transition:   'all 0.2s ease',
      }}
    >
      {/* ── 1行目 ヘッダー: 課題テキスト → Mastery表示（縦積み） ── */}
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'stretch',
        gap:            8,
        marginBottom:   10,
      }}>
        <p style={{
          margin:     0,
          fontSize:   13,
          fontWeight: 700,
          color:      '#ede9fe',
          lineHeight: 1.4,
          wordBreak:  'break-word',
        }}>
          {taskText}
        </p>

        {showMastery && mastery && (
          <div>
            <MasteryHeaderRow mastery={mastery} />
          </div>
        )}
      </div>

      {/* ── 2行目 メインバー: 自己評価分布 ── */}
      <div style={{ marginBottom: showPeer ? 6 : 4 }}>
        <DistRowLabel
          label="自分"
          avg={selfAvg}
          count={selfTotalCount}
        />
        <StackedBar
          dist={selfDist}
          total={selfTotalCount}
          height={12}
          ariaLabel="自己評価のスコア分布"
          label="自分"
          onSegmentClick={handleSegmentClick}
        />
      </div>

      {/* ── 3行目 サブバー: 剣友評価分布 ── */}
      {showPeer && (
        <div style={{ marginBottom: 4 }}>
          <DistRowLabel
            label="剣友"
            avg={peerAvg}
            count={peerTotalCount}
            sub
          />
          <StackedBar
            dist={peerDist!}
            total={peerTotalCount}
            height={8}
            ariaLabel="剣友評価のスコア分布"
            label="剣友"
            onSegmentClick={handleSegmentClick}
          />
        </div>
      )}

      {/* ── 4行目 インサイト ── */}
      {insight && (
        <div style={{
          marginTop:  8,
          textAlign:  'right',
          fontSize:   11,
          fontWeight: 700,
          color:      '#fde68a',
          letterSpacing: '0.04em',
        }}>
          {insight}
        </div>
      )}

      {/* ── ★ カスタムツールチップ ── */}
      {tooltip && (
        <Tooltip tooltip={tooltip} />
      )}
    </div>
  );
}

export default TaskScoreDistCard;

// =====================================================================
// ツールチップ（吹き出し）
// =====================================================================

function Tooltip({ tooltip }: { tooltip: TooltipState }) {
  const accent = SCORE_COLORS[tooltip.score] ?? '#a78bfa';

  return (
    <div
      data-tooltip
      role="tooltip"
      style={{
        position:       'absolute',
        left:           tooltip.x,
        top:            tooltip.y,
        transform:      'translate(-50%, calc(-100% - 10px))',
        zIndex:         50,
        pointerEvents:  'none',
        animation:      'distTooltipPop 0.18s ease-out',
      }}
    >
      <style>{`
        @keyframes distTooltipPop {
          0%   { opacity: 0; transform: translate(-50%, calc(-100% - 4px)) scale(0.92); }
          100% { opacity: 1; transform: translate(-50%, calc(-100% - 10px)) scale(1); }
        }
      `}</style>

      <div style={{
        position:       'relative',
        background:     'linear-gradient(135deg, rgba(13,11,42,0.97), rgba(30,27,75,0.95))',
        border:         `1px solid ${accent}`,
        borderRadius:   8,
        padding:        '6px 10px',
        boxShadow:      `0 4px 14px rgba(0,0,0,0.45), 0 0 12px ${accent}55`,
        minWidth:       110,
        backdropFilter: 'blur(6px)',
      }}>
        {/* ラベル行（自分 / 剣友） */}
        <div style={{
          display:       'flex',
          alignItems:    'center',
          gap:           6,
          marginBottom:  3,
          fontSize:      9,
          fontWeight:    800,
          color:         'rgba(199,210,254,0.7)',
          letterSpacing: '0.08em',
        }}>
          <span style={{
            width:        8,
            height:       8,
            borderRadius: 2,
            background:   accent,
            display:      'inline-block',
            boxShadow:    `0 0 4px ${accent}`,
          }} />
          {tooltip.label}
        </div>

        {/* スコア★ + 回数 */}
        <div style={{
          display:    'flex',
          alignItems: 'baseline',
          gap:        6,
          fontSize:   12,
          fontWeight: 800,
          color:      '#ede9fe',
        }}>
          <span style={{ color: accent, fontSize: 13 }}>★{tooltip.score}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {tooltip.count}回
          </span>
          <span style={{
            marginLeft:         'auto',
            fontSize:           10,
            color:              '#fde68a',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {tooltip.pct}
          </span>
        </div>

        {/* 吹き出し三角（下向き） */}
        <div style={{
          position:    'absolute',
          left:        '50%',
          bottom:      -6,
          transform:   'translateX(-50%)',
          width:       0,
          height:      0,
          borderLeft:  '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop:   `6px solid ${accent}`,
        }} />
        <div style={{
          position:    'absolute',
          left:        '50%',
          bottom:      -4,
          transform:   'translateX(-50%)',
          width:       0,
          height:      0,
          borderLeft:  '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop:   '5px solid rgba(13,11,42,0.97)',
        }} />
      </div>
    </div>
  );
}

// =====================================================================
// 小コンポーネント群
// =====================================================================

// ---------------------------------------------------------------------
// バーの上に置く小ラベル（自分 / 剣友 + 平均 + 件数）
// ---------------------------------------------------------------------

function DistRowLabel({
  label,
  avg,
  count,
  sub = false,
}: {
  label: string;
  avg:   string;
  count: number;
  sub?:  boolean;
}) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      marginBottom:   3,
      fontSize:       sub ? 9.5 : 10,
      color:          sub ? 'rgba(199,210,254,0.7)' : '#c7d2fe',
      fontWeight:     700,
      letterSpacing:  '0.04em',
    }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        平均 <span style={{ color: '#fde68a', fontWeight: 800 }}>{avg}</span>
        <span style={{ color: 'rgba(167,139,250,0.55)', marginLeft: 6 }}>
          ({count}件)
        </span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------
// 100%積み上げバー（カスタムツールチップ対応）
// ---------------------------------------------------------------------

function StackedBar({
  dist,
  total,
  height,
  ariaLabel,
  label,
  onSegmentClick,
}: {
  dist:           Record<number, number>;
  total:          number;
  height:         number;
  ariaLabel:      string;
  label:          string;
  onSegmentClick: (args: {
    score: number;
    count: number;
    total: number;
    label: string;
    event: React.MouseEvent<HTMLDivElement>;
  }) => void;
}) {
  if (total <= 0) {
    return (
      <div
        aria-label={ariaLabel}
        style={{
          width:        '100%',
          height,
          borderRadius: height / 2,
          background:   'rgba(99,102,241,0.12)',
          border:       '1px dashed rgba(139,92,246,0.25)',
        }}
      />
    );
  }

  // 5 → 1 の順に積み上げ表示（高スコアを左側へ）
  const order = [5, 4, 3, 2, 1] as const;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{
        display:      'flex',
        width:        '100%',
        height,
        borderRadius: height / 2,
        overflow:     'hidden',
        background:   'rgba(99,102,241,0.12)',
        boxShadow:    'inset 0 0 0 1px rgba(139,92,246,0.18)',
      }}
    >
      {order.map(score => {
        const count = dist[score] ?? 0;
        if (count <= 0) return null;
        const widthPct = (count / total) * 100;
        return (
          <div
            key={score}
            data-bar-segment
            onClick={(e) => {
              e.stopPropagation();
              onSegmentClick({ score, count, total, label, event: e });
            }}
            style={{
              width:      `${widthPct}%`,
              height:     '100%',
              background: SCORE_COLORS[score],
              cursor:     'pointer',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          />
        );
      })}
    </div>
  );
}

// =====================================================================
// Masteryヘッダー（旧 TaskEvalCard 中段UIを移植）
// =====================================================================

function MasteryHeaderRow({ mastery }: { mastery: MasteryStatus }) {
  if (mastery.phase === 'mastered') {
    return <MasteryRowMastered mastery={mastery} />;
  }
  if (mastery.phase === 'discerning') {
    return <MasteryRowDiscerning mastery={mastery} />;
  }
  return <MasteryRowTraining mastery={mastery} />;
}

// ---------------------------------------------------------------------
// 履歴ドット（直近10件）
// ---------------------------------------------------------------------

function HistoryDots({ scores }: { scores: number[] }) {
  const slots: (number | null)[] = [];
  const start = Math.max(0, 10 - scores.length);
  for (let i = 0; i < start; i++) slots.push(null);
  scores.forEach(s => slots.push(s));

  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
      {slots.map((s, i) => {
        if (s == null) {
          return (
            <span
              key={i}
              style={{
                width:        7,
                height:       7,
                borderRadius: '50%',
                background:   'transparent',
                border:       '1px solid rgba(167,139,250,0.25)',
                display:      'inline-block',
              }}
            />
          );
        }
        const color   = DOT_COLORS[s] ?? '#a78bfa';
        const isHigh5 = s === 5;
        return (
          <span
            key={i}
            style={{
              width:        7,
              height:       7,
              borderRadius: '50%',
              background:   color,
              boxShadow:    isHigh5 ? `0 0 4px ${color}` : 'none',
              display:      'inline-block',
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
// 訓練状態（training）
// ---------------------------------------------------------------------

function MasteryRowTraining({ mastery }: { mastery: MasteryStatus }) {
  const showCombo = shouldShowCombo(mastery);
  const isHot     = isNearDiscern(mastery);

  const stability = mastery.stability;
  const barColor  =
    stability >= 80 ? '#fbbf24' :
    stability >= 60 ? '#60a5fa' : '#a78bfa';

  const barAnim = isHot ? 'masteryHotPulse 1.6s ease-in-out infinite' : 'none';

  const comboColor = isHot ? '#fbbf24' : '#86efac';
  const comboGlow  = isHot ? '#fb923c' : '#10b981';

  return (
    <>
      <style>{`
        @keyframes masteryHotPulse {
          0%, 100% { opacity: 1;   filter: brightness(1); }
          50%      { opacity: 0.85; filter: brightness(1.25); }
        }
        @keyframes masteryComboGlow {
          0%, 100% { text-shadow: 0 0 4px var(--combo-glow), 0 0 8px var(--combo-glow); opacity: 1; }
          50%      { text-shadow: 0 0 8px var(--combo-glow), 0 0 16px var(--combo-glow); opacity: 0.92; }
        }
      `}</style>

      <div style={{
        display:    'flex',
        alignItems: 'center',
        flexWrap:   'wrap',
        gap:        8,
        rowGap:     6,
      }}>
        {/* 安定率ミニバー + % */}
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        5,
          flexShrink: 0,
          animation:  barAnim,
        }}>
          <div style={{
            width:        46,
            height:       5,
            borderRadius: 3,
            background:   'rgba(99,102,241,0.18)',
            overflow:     'hidden',
            position:     'relative',
          }}>
            <div style={{
              width:      `${stability}%`,
              height:     '100%',
              background: `linear-gradient(90deg, ${barColor}aa, ${barColor})`,
              boxShadow:  isHot ? `0 0 6px ${barColor}` : 'none',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{
            fontSize:   10,
            fontWeight: 800,
            color:      barColor,
            fontVariantNumeric: 'tabular-nums',
            minWidth:   24,
            textAlign:  'right',
          }}>
            {stability}%
          </span>
        </div>

        {/* 履歴ドット */}
        <HistoryDots scores={mastery.recentScores} />

        {/* COMBO! */}
        {showCombo && (
          <span
            style={{
              fontSize:      11,
              fontWeight:    900,
              fontStyle:     'italic',
              letterSpacing: '0.05em',
              color:         comboColor,
              whiteSpace:    'nowrap',
              animation:     'masteryComboGlow 1.4s ease-in-out infinite',
              ['--combo-glow' as never]: comboGlow,
            } as React.CSSProperties}
          >
            {mastery.currentStreak} COMBO!
          </span>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// 見極め状態（discerning）
// ---------------------------------------------------------------------

function MasteryRowDiscerning({ mastery }: { mastery: MasteryStatus }) {
  const stability = mastery.stability;

  return (
    <>
      <style>{`
        @keyframes discernShimmer {
          0%, 100% { opacity: 0.85; }
          50%      { opacity: 1; }
        }
        @keyframes discernDotGlow {
          0%, 100% { box-shadow: 0 0 3px #fbbf24aa, inset 0 0 2px #fef3c7; }
          50%      { box-shadow: 0 0 8px #fbbf24, inset 0 0 3px #fef9c3; }
        }
      `}</style>

      <div style={{
        display:    'flex',
        alignItems: 'center',
        flexWrap:   'wrap',
        gap:        8,
        rowGap:     6,
        padding:    '4px 8px',
        borderRadius: 8,
        background: 'linear-gradient(90deg, rgba(251,191,36,0.04), rgba(251,191,36,0.10), rgba(251,191,36,0.04))',
        border:     '1px solid rgba(251,191,36,0.22)',
      }}>
        {/* 安定率ミニバー（金色） */}
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        5,
          flexShrink: 0,
        }}>
          <div style={{
            width:        46,
            height:       5,
            borderRadius: 3,
            background:   'rgba(251,191,36,0.15)',
            overflow:     'hidden',
          }}>
            <div style={{
              width:      `${stability}%`,
              height:     '100%',
              background: 'linear-gradient(90deg, #fbbf24aa, #fbbf24)',
              boxShadow:  '0 0 5px #fbbf24aa',
            }} />
          </div>
          <span style={{
            fontSize:   10,
            fontWeight: 800,
            color:      '#fbbf24',
            fontVariantNumeric: 'tabular-nums',
            minWidth:   24,
            textAlign:  'right',
          }}>
            {stability}%
          </span>
        </div>

        {/* 履歴ドット */}
        <HistoryDots scores={mastery.recentScores} />

        {/* 「皆伝ノ刻」+ 進捗ドット */}
        <div style={{
          flexShrink: 0,
          display:    'flex',
          alignItems: 'center',
          gap:        6,
          animation:  'discernShimmer 2.4s ease-in-out infinite',
        }}>
          <span style={{
            fontSize:      10,
            fontWeight:    900,
            color:         '#fde68a',
            letterSpacing: '0.18em',
            textShadow:    '0 0 4px #fbbf2466',
            whiteSpace:    'nowrap',
          }}>
            【皆伝ノ刻】
          </span>
          <ProgressDots
            count={mastery.breakthroughCount}
            total={MASTERY_REQUIRED_COUNT}
          />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// 進捗ドット（◉◉○）
// ---------------------------------------------------------------------

function ProgressDots({ count, total }: { count: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < count;
        return (
          <span
            key={i}
            style={{
              width:        9,
              height:       9,
              borderRadius: '50%',
              background:   filled
                ? 'radial-gradient(circle at 30% 30%, #fef3c7, #fbbf24 70%)'
                : 'transparent',
              border:       filled
                ? '1px solid #fbbf24'
                : '1px solid rgba(251,191,36,0.45)',
              display:      'inline-block',
              animation:    filled ? 'discernDotGlow 1.8s ease-in-out infinite' : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
// 免許皆伝バッジ（mastered）
// ---------------------------------------------------------------------

function MasteryRowMastered({ mastery }: { mastery: MasteryStatus }) {
  return (
    <>
      <style>{`
        @keyframes masteredShimmer {
          0%, 100% { box-shadow: 0 0 12px rgba(251,191,36,0.35), inset 0 0 8px rgba(251,191,36,0.12); }
          50%      { box-shadow: 0 0 20px rgba(251,191,36,0.55), inset 0 0 10px rgba(251,191,36,0.20); }
        }
        @keyframes masteredScan {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>

      <div style={{
        display:    'flex',
        alignItems: 'center',
        flexWrap:   'wrap',
        gap:        8,
        rowGap:     6,
      }}>
{/*        {/* 皆伝バッジ *
        <div style={{
          position:     'relative',
          display:      'inline-flex',
          alignItems:   'center',
          gap:          7,
          background:   'linear-gradient(135deg, #0a0a0a 0%, #1a1410 50%, #0a0a0a 100%)',
          border:       '1px solid #fbbf24',
          borderRadius: 4,
          padding:      '4px 12px 4px 10px',
          animation:    'masteredShimmer 2.4s ease-in-out infinite',
          overflow:     'hidden',
          flexShrink:   0,
        }}>
          {/* スキャンライン 
          <div style={{
            position:       'absolute',
            inset:          0,
            background:     'linear-gradient(105deg, transparent 30%, rgba(251,191,36,0.18) 50%, transparent 70%)',
            backgroundSize: '200% 100%',
            animation:      'masteredScan 3s linear infinite',
            pointerEvents:  'none',
          }} />

          {/* 朱印風アクセント 
          <span style={{
            width:        7,
            height:       7,
            borderRadius: '50%',
            background:   'radial-gradient(circle at 30% 30%, #ef4444, #991b1b)',
            border:       '1px solid #fbbf24',
            boxShadow:    '0 0 4px rgba(239,68,68,0.6)',
            flexShrink:   0,
            zIndex:       1,
          }} />

          {/* テキスト 
          <span style={{
            fontSize:      10.5,
            fontWeight:    900,
            color:         '#fbbf24',
            letterSpacing: '0.32em',
            textShadow:    '0 0 6px rgba(251,191,36,0.55)',
            whiteSpace:    'nowrap',
            zIndex:        1,
          }}>
            免 許 皆 伝
          </span>
        </div> */}
      <span 
        className="text-yellow-400 text-lg drop-shadow-[0_0_8px_rgba(250,204,21,0.8)] ml-2" 
        title="免許皆伝"
      >
        ★
      </span>
        {/* 履歴ドット */}
        <HistoryDots scores={mastery.recentScores} />
      </div>
    </>
  );
}
