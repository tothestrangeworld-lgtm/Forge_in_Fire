// src/components/TaskEvalCard.tsx
// =====================================================================
// 百錬自得 - 課題評価カード（共通コンポーネント）
// 自己評価（record画面）/ 他者評価（rivals/[id]画面）の両方で使用する。
//
// ★ Phase11: 免許皆伝（Mastery）システムの中段UIを追加
//   - mastery prop を受け取り、3段構成（上段=課題テキスト・中段=Mastery表示・下段=星評価）に拡張
//   - training:    安定率バー + 履歴ドット + COMBO!演出（無言の予告：熱色変化＆脈動）
//   - discerning:  「皆伝ノ刻」+ 金色ドット ◉◉○（静かな緊張感）
//   - mastered:    【免許皆伝】バッジ（黒背景＋金文字＋朱印アクセント）
//   - mastery prop を省略した場合は中段非表示（rivals画面など現行UI維持）
//
// 【設計方針：コンパクト＆ユニファイド】
//   - 「引き算の美学」: 四角い枠ボタンを廃止し、星アイコンのみで評価UIを構成
//   - 上段: indexBadge（任意） + taskText
//   - 中段: ★Phase11 Mastery表示（mastery が渡された場合のみ）
//   - 下段: 星アイコン5つ（左寄せ） + 評価テキストカプセル（右寄せ）
//   - isEvaluated 時はグリーン系の薄い背景で完了表現
//
// 【Props】
//   - taskText:     課題テキスト
//   - score:        現在の選択スコア（null = 未選択）
//   - onChange:     スコア変更時のコールバック
//   - disabled:     タップ不可状態（送信中など）
//   - isEvaluated:  既に評価完了済みか（背景色とopacityが変化）
//   - indexBadge:   左上のバッジテキスト（例: "課題 1" / "評価済"）。省略時は非表示
//   - mastery:      ★ Phase11: 免許皆伝ステータス（省略時は中段非表示）
// =====================================================================

'use client';

import { Star } from 'lucide-react';
import type { MasteryStatus } from '@/types';
import {
  MASTERY_REQUIRED_COUNT,
  isNearDiscern,
  shouldShowCombo,
} from '@/lib/mastery';

const SCORE_LABELS_SHORT: Record<number, string> = {
  1: '少し',
  2: '普通',
  3: '概ね良い',
  4: '良い',
  5: '非常に良い',
};

const SCORE_BADGE_COLORS: Record<number, { bg: string; fg: string; border: string }> = {
  1: { bg: 'rgba(254,226,226,0.12)', fg: '#fca5a5', border: 'rgba(252,165,165,0.35)' },
  2: { bg: 'rgba(255,237,213,0.12)', fg: '#fdba74', border: 'rgba(253,186,116,0.35)' },
  3: { bg: 'rgba(254,249,195,0.12)', fg: '#fde047', border: 'rgba(253,224,71,0.35)' },
  4: { bg: 'rgba(220,252,231,0.12)', fg: '#86efac', border: 'rgba(134,239,172,0.4)'  },
  5: { bg: 'rgba(251,191,36,0.18)',  fg: '#fde68a', border: 'rgba(251,191,36,0.55)'  },
};

// ---------------------------------------------------------------------
// ★ Phase11: 履歴ドット用カラーマップ
// ---------------------------------------------------------------------
const DOT_COLORS: Record<number, string> = {
  1: '#f87171',
  2: '#fb923c',
  3: '#fbbf24',
  4: '#86efac',
  5: '#fde68a',
};

export interface TaskEvalCardProps {
  taskText:    string;
  score:       number | null;
  onChange:    (s: number) => void;
  disabled?:   boolean;
  isEvaluated?: boolean;
  indexBadge?: string;
  /** ★ Phase11: 免許皆伝ステータス。省略時は中段を表示しない */
  mastery?:    MasteryStatus | null;
}

export function TaskEvalCard({
  taskText,
  score,
  onChange,
  disabled    = false,
  isEvaluated = false,
  indexBadge,
  mastery,
}: TaskEvalCardProps) {

  const badgeStyle = score != null ? SCORE_BADGE_COLORS[score] : null;

  // 中段の表示要否
  const showMastery = mastery != null && mastery.evalCount > 0;

  return (
    <div
      style={{
        padding:      '10px 12px',
        borderRadius: 12,
        background:   isEvaluated
          ? 'rgba(34,197,94,0.07)'
          : 'rgba(49,46,129,0.35)',
        border: isEvaluated
          ? '1px solid rgba(34,197,94,0.25)'
          : '1px solid rgba(139,92,246,0.2)',
        opacity:    isEvaluated ? 0.72 : 1,
        transition: 'all 0.2s ease',
      }}
    >
      {/* ── 上段: indexBadge（任意） + taskText ── */}
      <div style={{
        display:     'flex',
        alignItems:  'flex-start',
        gap:         8,
        marginBottom: 8,
      }}>
        {indexBadge && (
          <span style={{
            fontSize:    9,
            fontWeight:  800,
            flexShrink:  0,
            color:       isEvaluated ? '#86efac' : '#a78bfa',
            background:  isEvaluated
              ? 'rgba(34,197,94,0.12)'
              : 'rgba(109,40,217,0.2)',
            border: isEvaluated
              ? '1px solid rgba(34,197,94,0.3)'
              : '1px solid rgba(109,40,217,0.35)',
            borderRadius: 5,
            padding:      '2px 6px',
            marginTop:    2,
            letterSpacing: '0.04em',
            whiteSpace:   'nowrap',
          }}>
            {indexBadge}
          </span>
        )}
        <p style={{
          margin:     0,
          fontSize:   13,
          fontWeight: 700,
          color:      isEvaluated ? 'rgba(199,210,254,0.55)' : '#ede9fe',
          lineHeight: 1.4,
          wordBreak:  'break-word',
          flex:       1,
        }}>
          {taskText}
        </p>
      </div>

      {/* ── ★ Phase11 中段: Mastery 表示 ── */}
      {showMastery && mastery && (
        <MasteryRow mastery={mastery} />
      )}

      {/* ── 下段: 星5つ（左） + 評価テキストカプセル（右） ── */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        8,
      }}>
        {/* 星エリア（左寄せ） */}
        <div style={{
          display: 'flex',
          gap:     2,
        }}>
          {[1, 2, 3, 4, 5].map(s => {
            const filled = score !== null && score >= s;
            return (
              <button
                key={s}
                onClick={() => !disabled && onChange(s)}
                disabled={disabled || isEvaluated}
                aria-label={`評価 ${s}`}
                style={{
                  width:          32,
                  height:         32,
                  border:         'none',
                  background:     'transparent',
                  padding:        0,
                  cursor:         (disabled || isEvaluated) ? 'not-allowed' : 'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  transition:     'transform 0.12s ease',
                  transform:      filled ? 'scale(1.05)' : 'scale(1)',
                }}
                onMouseDown={e => { if (!disabled && !isEvaluated) e.currentTarget.style.transform = 'scale(0.85)'; }}
                onMouseUp={e   => { e.currentTarget.style.transform = filled ? 'scale(1.05)' : 'scale(1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = filled ? 'scale(1.05)' : 'scale(1)'; }}
                onTouchStart={e => { if (!disabled && !isEvaluated) e.currentTarget.style.transform = 'scale(0.85)'; }}
                onTouchEnd={e   => { e.currentTarget.style.transform = filled ? 'scale(1.05)' : 'scale(1)'; }}
              >
                <Star
                  size={22}
                  strokeWidth={filled ? 0 : 1.6}
                  fill={filled ? '#fbbf24' : 'none'}
                  color={filled ? '#fbbf24' : 'rgba(167,139,250,0.4)'}
                  style={{
                    filter: filled ? 'drop-shadow(0 0 3px rgba(251,191,36,0.5))' : 'none',
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* 評価テキストカプセル（右寄せ） */}
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {badgeStyle && score != null ? (
            <span style={{
              display:       'inline-block',
              fontSize:      10,
              fontWeight:    700,
              padding:       '3px 9px',
              borderRadius:  999,
              background:    badgeStyle.bg,
              color:         badgeStyle.fg,
              border:        `1px solid ${badgeStyle.border}`,
              letterSpacing: '0.03em',
              whiteSpace:    'nowrap',
            }}>
              {SCORE_LABELS_SHORT[score]}
            </span>
          ) : (
            <span style={{
              fontSize:   10,
              fontWeight: 600,
              color:      'rgba(167,139,250,0.4)',
              whiteSpace: 'nowrap',
            }}>
              未評価
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// ★ Phase11: 中段Masteryロウ
// 状態に応じて 3パターンを切り替える
// =====================================================================

function MasteryRow({ mastery }: { mastery: MasteryStatus }) {
  if (mastery.phase === 'mastered') {
    return <MasteryRowMastered mastery={mastery} />;
  }
  if (mastery.phase === 'discerning') {
    return <MasteryRowDiscerning mastery={mastery} />;
  }
  return <MasteryRowTraining mastery={mastery} />;
}

// ---------------------------------------------------------------------
// 履歴ドット（共通）
// ---------------------------------------------------------------------

function HistoryDots({ scores }: { scores: number[] }) {
  // 直近10件の枠を確保し、未到達分は薄い空丸で表現
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
// 訓練状態の中段
// ---------------------------------------------------------------------

function MasteryRowTraining({ mastery }: { mastery: MasteryStatus }) {
  const showCombo = shouldShowCombo(mastery);
  const isHot     = isNearDiscern(mastery);

  // 安定率バーの色
  const stability = mastery.stability;
  const barColor  =
    stability >= 80 ? '#fbbf24' :
    stability >= 60 ? '#60a5fa' : '#a78bfa';

  // 「見極めが近い」状態の安定率バー脈動
  const barAnim = isHot ? 'masteryHotPulse 1.6s ease-in-out infinite' : 'none';

  // COMBO! テキストの色（通常 → 緑系 / 熱色 → オレンジ・ゴールド）
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
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        marginBottom: 8,
        paddingTop:   4,
        paddingBottom: 4,
        borderTop:    '1px dashed rgba(139,92,246,0.18)',
        borderBottom: '1px dashed rgba(139,92,246,0.18)',
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

        {/* COMBO! テキスト（右寄せ） */}
        <div style={{ marginLeft: 'auto', flexShrink: 0, minWidth: 0 }}>
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
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// 見極め状態の中段（静かな緊張感）
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
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        marginBottom:   8,
        paddingTop:     5,
        paddingBottom:  5,
        borderTop:      '1px solid rgba(251,191,36,0.22)',
        borderBottom:   '1px solid rgba(251,191,36,0.22)',
        background:     'linear-gradient(90deg, rgba(251,191,36,0.04), rgba(251,191,36,0.08), rgba(251,191,36,0.04))',
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
          marginLeft: 'auto',
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
// 免許皆伝バッジ（黒背景＋金文字＋朱印アクセント）
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
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        marginBottom: 8,
        paddingTop:   6,
        paddingBottom: 6,
      }}>
        {/* 皆伝バッジ */}
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
          {/* スキャンライン */}
          <div style={{
            position:       'absolute',
            inset:          0,
            background:     'linear-gradient(105deg, transparent 30%, rgba(251,191,36,0.18) 50%, transparent 70%)',
            backgroundSize: '200% 100%',
            animation:      'masteredScan 3s linear infinite',
            pointerEvents:  'none',
          }} />

          {/* 朱印風アクセント（左の小さな赤丸） */}
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

          {/* テキスト */}
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
        </div>

        {/* 履歴ドット（皆伝後も継続記録の可視化） */}
        <HistoryDots scores={mastery.recentScores} />
      </div>
    </>
  );
}

export default TaskEvalCard;
