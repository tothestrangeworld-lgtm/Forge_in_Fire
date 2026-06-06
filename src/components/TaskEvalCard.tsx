// src/components/TaskEvalCard.tsx
// =====================================================================
// 百錬自得 - 課題評価カード（共通コンポーネント）
// 【Phase-ex2】評価入力カードの極限シンプル化
//   - Mastery表示UIの完全削除
//   - 選択スコアに応じた星のカラー動的化（1:赤, 2:オレンジ, 3:黄, 4:緑, 5:サイバーブルー）
// 【5W1H+EVAL】
//   - taskDetails を受け取り、評価基準（EVAL）確認アコーディオンを追加
//   - 評価者が迷わずスコアを付けられるよう ★5/★3/★1 の基準を提示
// =====================================================================

'use client';

import { useState } from 'react';
import { Star, ClipboardList, ChevronDown } from 'lucide-react';
import type { TaskDetails } from '@/types';

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
  5: { bg: 'rgba(34,211,238,0.12)',  fg: '#67e8f9', border: 'rgba(34,211,238,0.4)'   }, // ← ★5のバッジをサイバーブルーに変更
};

const STAR_COLORS: Record<number, string> = {
  1: '#f87171',
  2: '#fb923c',
  3: '#fbbf24',
  4: '#86efac',
  5: '#22d3ee', // ← ★5の星の色を輝くサイバーブルーに変更
};

// =====================================================================
// 評価基準（EVAL）行: ★N + 基準テキスト
// =====================================================================
const EVAL_ROW_META: Record<number, { label: string; color: string }> = {
  5: { label: '会心', color: '#22d3ee' },
  3: { label: '及第', color: '#fbbf24' },
  1: { label: '課題', color: '#f87171' },
};

export interface TaskEvalCardProps {
  taskText:    string;
  score:       number | null;
  onChange:    (s: number) => void;
  disabled?:   boolean;
  isEvaluated?: boolean;
  indexBadge?: string;
  /**
   * ★ 5W1H+EVAL: 構造化詳細データ。
   * 存在する場合のみ「評価基準 (EVAL)」確認アコーディオンを表示する。
   */
  taskDetails?: TaskDetails;
}

export function TaskEvalCard({
  taskText,
  score,
  onChange,
  disabled    = false,
  isEvaluated = false,
  indexBadge,
  taskDetails,
}: TaskEvalCardProps) {

  const badgeStyle = score != null ? SCORE_BADGE_COLORS[score] : null;
  const starColor = score != null ? STAR_COLORS[score] : '#fbbf24';

  const [evalOpen, setEvalOpen] = useState(false);

  // 評価基準のいずれかにテキストが入っているか
  const hasEvalCriteria =
    !!taskDetails &&
    !!taskDetails.evalCriteria &&
    [5, 3, 1].some(n => {
      const v = taskDetails.evalCriteria[n as 5 | 3 | 1];
      return typeof v === 'string' && v.trim() !== '';
    });

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
        marginBottom: 12,
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

      {/* ── 評価基準 (EVAL) アコーディオン ── */}
      {hasEvalCriteria && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setEvalOpen(o => !o)}
            style={{
              width:          '100%',
              display:        'flex',
              alignItems:     'center',
              gap:            7,
              padding:        '6px 10px',
              background:     'rgba(30,27,75,0.45)',
              border:         '1px solid rgba(129,140,248,0.22)',
              borderRadius:   9,
              cursor:         'pointer',
              fontFamily:     'inherit',
              transition:     'all 0.15s ease',
            }}
          >
            <ClipboardList size={13} color="#a5b4fc" strokeWidth={1.8} />
            <span style={{
              fontSize:      '0.62rem',
              fontWeight:    700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color:         '#a5b4fc',
            }}>
              評価基準
            </span>
            <span style={{
              fontSize:      '0.62rem',
              fontWeight:    600,
              color:         'rgba(199,210,254,0.45)',
              letterSpacing: '0.04em',
            }}>
              EVAL CRITERIA
            </span>
            <ChevronDown
              size={15}
              color="#a5b4fc"
              strokeWidth={2}
              style={{
                marginLeft: 'auto',
                transform:  evalOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>

          {evalOpen && (
            <div
              className="animate-fade-up"
              style={{
                marginTop:    7,
                display:      'flex',
                flexDirection:'column',
                gap:          6,
                padding:      '10px',
                background:   'rgba(13,11,42,0.55)',
                border:       '1px solid rgba(129,140,248,0.18)',
                borderRadius: 9,
              }}
            >
              {[5, 3, 1].map(n => {
                const meta = EVAL_ROW_META[n];
                const text = taskDetails?.evalCriteria?.[n as 5 | 3 | 1] ?? '';
                const filled = typeof text === 'string' && text.trim() !== '';
                return (
                  <div
                    key={n}
                    style={{
                      display:     'flex',
                      alignItems:  'flex-start',
                      gap:         8,
                      opacity:     filled ? 1 : 0.4,
                    }}
                  >
                    {/* ★N ラベル */}
                    <div style={{
                      flexShrink:     0,
                      display:        'flex',
                      alignItems:     'center',
                      gap:            3,
                      padding:        '2px 7px',
                      borderRadius:   6,
                      background:     `${meta.color}1a`,
                      border:         `1px solid ${meta.color}55`,
                      minWidth:       54,
                      justifyContent: 'center',
                    }}>
                      <Star size={10} fill={meta.color} color={meta.color} strokeWidth={0} />
                      <span style={{
                        fontSize:   '0.7rem',
                        fontWeight: 800,
                        color:      meta.color,
                        lineHeight: 1,
                      }}>
                        {n}
                      </span>
                    </div>
                    {/* 基準テキスト */}
                    <p style={{
                      margin:     0,
                      fontSize:   '0.72rem',
                      lineHeight: 1.5,
                      color:      filled ? 'rgba(226,232,240,0.88)' : 'rgba(199,210,254,0.4)',
                      wordBreak:  'break-word',
                      flex:       1,
                      paddingTop: 1,
                    }}>
                      {filled ? text : '基準未設定'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
                  fill={filled ? starColor : 'none'}
                  color={filled ? starColor : 'rgba(167,139,250,0.4)'}
                  style={{
                    filter: filled ? `drop-shadow(0 0 3px ${starColor}66)` : 'none',
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

export default TaskEvalCard;
