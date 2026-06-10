// src/components/TaskEvalCard.tsx
// =====================================================================
// 百錬自得 - 課題評価カード（共通コンポーネント）
// 【Phase-ex2】評価入力カードの極限シンプル化
//   - Mastery表示UIの完全削除
//   - 選択スコアに応じた星のカラー動的化（1:赤, 2:オレンジ, 3:黄, 4:緑, 5:サイバーブルー）
// 【5W1H+EVAL】
//   - taskDetails を受け取り、課題詳細をポップアップ（モーダル）で確認
//   - タイトル横のゴールドアイコン / タイトル自体のタップでモーダルを起動
//   - WHEN / WHERE / WHY / HOW / EVAL をソリッドに整理表示
// =====================================================================

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Star, FileText, X, Clock, MapPin, AlertTriangle, Footprints } from 'lucide-react';
import type { TaskDetails, TaskWhyType } from '@/types';
import { TASK_WHY_LABELS } from '@/types';


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

// 和風ゴールド（アクセントカラー）
const GOLD = '#fbbf24';

export interface TaskEvalCardProps {
  taskText:    string;
  score:       number | null;
  onChange:    (s: number) => void;
  disabled?:   boolean;
  isEvaluated?: boolean;
  indexBadge?: string;
  /**
   * ★ 5W1H+EVAL: 構造化詳細データ。
   * 存在する場合のみ詳細確認アイコン（FileText）とモーダルを表示する。
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

  // ★ ポップアップ（モーダル）開閉状態
  const [detailOpen, setDetailOpen] = useState(false);

  // 詳細データが何かしら入力されているか（5W1H or EVAL のいずれか）
  const hasDetails =
    !!taskDetails &&
    (
      (typeof taskDetails.when  === 'string' && taskDetails.when.trim()  !== '') ||
      (typeof taskDetails.where === 'string' && taskDetails.where.trim() !== '') ||
      (typeof taskDetails.how   === 'string' && taskDetails.how.trim()   !== '') ||
      (typeof taskDetails.whyType === 'string' && taskDetails.whyType.trim() !== '') ||
      (typeof taskDetails.whyText === 'string' && taskDetails.whyText.trim() !== '') ||
      (
        !!taskDetails.evalCriteria &&
        [5, 3, 1].some(n => {
          const v = taskDetails.evalCriteria[n as 5 | 3 | 1];
          return typeof v === 'string' && v.trim() !== '';
        })
      )
    );

  function openDetail() {
    if (hasDetails) setDetailOpen(true);
  }

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
      {/* ── 上段: indexBadge（任意） + taskText + 詳細アイコン ── */}
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

        <p
          onClick={openDetail}
          style={{
            margin:     0,
            fontSize:   13,
            fontWeight: 700,
            color:      isEvaluated ? 'rgba(199,210,254,0.55)' : '#ede9fe',
            lineHeight: 1.4,
            wordBreak:  'break-word',
            flex:       1,
            cursor:     hasDetails ? 'pointer' : 'default',
          }}
        >
          {taskText}
        </p>

        {/* ★ 詳細確認トリガー（ゴールドアイコン） */}
        {hasDetails && (
          <button
            type="button"
            onClick={openDetail}
            aria-label="課題詳細を表示"
            title="TASK DETAIL"
            style={{
              flexShrink:     0,
              width:          26,
              height:         26,
              borderRadius:   7,
              background:     'rgba(251,191,36,0.1)',
              border:         '1px solid rgba(251,191,36,0.4)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         'pointer',
              padding:        0,
              marginTop:      -1,
              transition:     'all 0.15s ease',
            }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.9)'; }}
            onMouseUp={e   => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <FileText size={16} color={GOLD} strokeWidth={1.8} />
          </button>
        )}
      </div>

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

      {/* ── 課題詳細モーダル ── */}
      {detailOpen && taskDetails && (
        <TaskDetailModal
          taskText={taskText}
          details={taskDetails}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}

// =====================================================================
// TaskDetailModal: 課題詳細ポップアップ（モーダルオーバレイ）
// =====================================================================

interface TaskDetailModalProps {
  taskText: string;
  details:  TaskDetails;
  onClose:  () => void;
}

// 5W1H 行ラベルのメタ
const FIELD_META = {
  when:  { en: 'WHEN',  ja: '機', Icon: Clock },
  where: { en: 'WHERE', ja: '間合い',     Icon: MapPin },
  why:   { en: 'WHY',   ja: '理由', Icon: AlertTriangle },
  how:   { en: 'HOW',   ja: '如何',     Icon: Footprints },
} as const;

function TaskDetailModal({ taskText, details, onClose }: TaskDetailModalProps) {

  // ★ Portal マウント判定（SSR/初回レンダリング時は document が無いため）
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // モーダル表示中は背面スクロールを抑止
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Why の表示テキストを解決
  const whyTypeLabel = details.whyType
    ? (TASK_WHY_LABELS[details.whyType as TaskWhyType] ?? details.whyType)
    : '';
  const whyDisplay =
    details.whyType === 'custom'
      ? (details.whyText?.trim() || '（記述なし）')
      : (whyTypeLabel || '（未設定）');

  // 各フィールドの値（空はプレースホルダ）
  const whenVal  = (typeof details.when  === 'string' && details.when.trim())  ? details.when  : '未設定';
  const whereVal = (typeof details.where === 'string' && details.where.trim()) ? details.where : '未設定';
  const howVal   = (typeof details.how   === 'string' && details.how.trim())   ? details.how   : '未設定';

  // ★ Portal がマウントされるまでは何も描画しない
  if (!mounted) return null;

  const modalContent = (
    <>
      <style>{`
        @keyframes taskDetailBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes taskDetailPanelIn {
          0%   { opacity: 0; transform: translateY(18px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>

      {/* バックドロップ（漆黒・サイバーインディゴ） */}
      <div
        onClick={onClose}
        style={{
          position:       'fixed',
          inset:          0,
          zIndex:         99999,
          background:     'radial-gradient(circle at 50% 30%, rgba(30,27,75,0.82), rgba(8,6,20,0.92))',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '20px',
          animation:      'taskDetailBackdropIn 0.2s ease forwards',
        }}
      >

        {/* パネル本体（黄金ボーダー） */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position:     'relative',
            width:        'min(420px, calc(100vw - 40px))',
            maxHeight:    'calc(100dvh - 80px)',
            overflowY:    'auto',
            background:   'linear-gradient(160deg, rgba(13,11,42,0.98), rgba(20,16,48,0.98))',
            border:       `1.5px solid ${GOLD}`,
            borderRadius: 18,
            boxShadow:    `0 0 28px rgba(251,191,36,0.25), 0 12px 48px rgba(0,0,0,0.6)`,
            padding:      '18px 18px 16px',
            animation:    'taskDetailPanelIn 0.32s cubic-bezier(0.34,1.56,0.64,1) forwards',
          }}
        >
          {/* 上端ゴールドライン */}
          <div style={{
            position:   'absolute',
            top:        0,
            left:       '12%',
            right:      '12%',
            height:     2,
            background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
            borderRadius: '0 0 4px 4px',
          }} />

          {/* ヘッダー */}
          <div style={{
            display:      'flex',
            alignItems:   'flex-start',
            gap:          10,
            marginBottom: 16,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display:       'flex',
                alignItems:    'center',
                gap:           7,
                marginBottom:  6,
              }}>
                <FileText size={15} color={GOLD} strokeWidth={1.8} />
                <span style={{
                  fontSize:      '0.66rem',
                  fontWeight:    800,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color:         GOLD,
                }}>
                  TASK DETAIL
                </span>
                <span style={{
                  fontSize:      '0.6rem',
                  fontWeight:    600,
                  letterSpacing: '0.06em',
                  color:         'rgba(199,210,254,0.45)',
                }}>
                  課題詳細
                </span>
              </div>
              <p style={{
                margin:     0,
                fontSize:   '0.98rem',
                fontWeight: 800,
                color:      '#ede9fe',
                lineHeight: 1.4,
                wordBreak:  'break-word',
              }}>
                {taskText}
              </p>
            </div>

            {/* 閉じるボタン（右上 X） */}
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              style={{
                flexShrink:     0,
                width:          30,
                height:         30,
                borderRadius:   8,
                background:     'rgba(251,191,36,0.08)',
                border:         `1px solid ${GOLD}66`,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                cursor:         'pointer',
                padding:        0,
              }}
            >
              <X size={16} color={GOLD} strokeWidth={2} />
            </button>
          </div>

          {/* ── 5W1H セクション ── */}
          <div style={{
            display:       'flex',
            flexDirection: 'column',
            gap:           10,
            marginBottom:  16,
          }}>
            <DetailRow
              en={FIELD_META.when.en}
              ja={FIELD_META.when.ja}
              Icon={FIELD_META.when.Icon}
              value={whenVal}
            />
            <DetailRow
              en={FIELD_META.where.en}
              ja={FIELD_META.where.ja}
              Icon={FIELD_META.where.Icon}
              value={whereVal}
            />
            <DetailRow
              en={FIELD_META.why.en}
              ja={FIELD_META.why.ja}
              Icon={FIELD_META.why.Icon}
              value={whyDisplay}
            />
            <DetailRow
              en={FIELD_META.how.en}
              ja={FIELD_META.how.ja}
              Icon={FIELD_META.how.Icon}
              value={howVal}
              multiline
            />
          </div>

          {/* ── EVAL セクション ── */}
          <div style={{
            paddingTop:  14,
            borderTop:   '1px solid rgba(251,191,36,0.18)',
          }}>
            <div style={{
              display:      'flex',
              alignItems:   'center',
              gap:          7,
              marginBottom: 10,
            }}>
              <Star size={13} color={GOLD} fill={GOLD} strokeWidth={0} />
              <span style={{
                fontSize:      '0.64rem',
                fontWeight:    800,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color:         GOLD,
              }}>
                EVAL CRITERIA
              </span>
              <span style={{
                fontSize:      '0.6rem',
                fontWeight:    600,
                letterSpacing: '0.04em',
                color:         'rgba(199,210,254,0.45)',
              }}>
                評価基準
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[5, 3, 1].map(n => {
                const meta = EVAL_ROW_META[n];
                const text = details.evalCriteria?.[n as 5 | 3 | 1] ?? '';
                const filled = typeof text === 'string' && text.trim() !== '';
                return (
                  <div
                    key={n}
                    style={{
                      display:      'flex',
                      alignItems:   'flex-start',
                      gap:          9,
                      padding:      '8px 10px',
                      borderRadius: 9,
                      background:   `${meta.color}0d`,
                      border:       `1px solid ${meta.color}33`,
                      opacity:      filled ? 1 : 0.45,
                    }}
                  >
                    {/* ★N ラベル */}
                    <div style={{
                      flexShrink:     0,
                      display:        'flex',
                      alignItems:     'center',
                      gap:            4,
                      padding:        '3px 8px',
                      borderRadius:   7,
                      background:     `${meta.color}1f`,
                      border:         `1px solid ${meta.color}66`,
                      minWidth:       60,
                      justifyContent: 'center',
                    }}>
                      <Star size={11} fill={meta.color} color={meta.color} strokeWidth={0} />
                      <span style={{
                        fontSize:   '0.76rem',
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
                      fontSize:   '0.76rem',
                      lineHeight: 1.5,
                      color:      filled ? 'rgba(226,232,240,0.9)' : 'rgba(199,210,254,0.4)',
                      wordBreak:  'break-word',
                      flex:       1,
                      paddingTop: 2,
                    }}>
                      {filled ? text : '基準未設定'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 下部 CLOSE ボタン ── */}
          <button
            type="button"
            onClick={onClose}
            style={{
              marginTop:     18,
              width:         '100%',
              padding:       '11px 16px',
              borderRadius:  11,
              background:    `linear-gradient(135deg, rgba(120,80,0,0.35), rgba(251,191,36,0.18))`,
              border:        `1px solid ${GOLD}88`,
              color:         '#fde68a',
              fontSize:      '0.8rem',
              fontWeight:    800,
              letterSpacing: '0.1em',
              cursor:        'pointer',
              fontFamily:    'inherit',
              display:       'flex',
              alignItems:    'center',
              justifyContent:'center',
              gap:           8,
            }}
          >
            <X size={15} strokeWidth={2.2} />
            CLOSE（閉じる）
          </button>
        </div>
      </div>
    </>
  );

  // ★ document.body 直下へ Portal でレンダリングし、
  //   親カード（animate-slide-in 等の transform）によるスタッキングコンテキストを
  //   完全回避して確実に最前面へ表示する
  return createPortal(modalContent, document.body);
}

// =====================================================================
// DetailRow: 5W1H 各項目の表示行
// =====================================================================

interface DetailRowProps {
  en:        string;
  ja:        string;
  Icon:      typeof Clock;
  value:     string;
  multiline?: boolean;
}

function DetailRow({ en, ja, Icon, value, multiline }: DetailRowProps) {
  const isUnset = value === '未設定' || value === '（未設定）' || value === '（記述なし）';
  return (
    <div style={{
      display:      'flex',
      alignItems:   multiline ? 'flex-start' : 'center',
      gap:          10,
      padding:      '9px 11px',
      borderRadius: 10,
      background:   'rgba(49,46,129,0.3)',
      border:       '1px solid rgba(129,140,248,0.18)',
    }}>
      {/* ラベル列 */}
      <div style={{
        flexShrink:    0,
        width:         72,
        display:       'flex',
        flexDirection: 'column',
        gap:           2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon size={12} color="#a5b4fc" strokeWidth={2} />
          <span style={{
            fontSize:      '0.6rem',
            fontWeight:    800,
            letterSpacing: '0.1em',
            color:         '#a5b4fc',
          }}>
            {en}
          </span>
        </div>
        <span style={{
          fontSize:   '0.58rem',
          fontWeight: 600,
          color:      'rgba(199,210,254,0.45)',
          paddingLeft: 17,
        }}>
          {ja}
        </span>
      </div>

      {/* 値 */}
      <p style={{
        margin:     0,
        flex:       1,
        fontSize:   '0.78rem',
        fontWeight: 700,
        lineHeight: 1.5,
        color:      isUnset ? 'rgba(199,210,254,0.4)' : '#e0e7ff',
        wordBreak:  'break-word',
        whiteSpace: multiline ? 'pre-wrap' : 'normal',
      }}>
        {value}
      </p>
    </div>
  );
}

export default TaskEvalCard;
