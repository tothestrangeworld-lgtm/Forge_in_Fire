// src/components/MasteryToast.tsx
// =====================================================================
// 百錬自得 - 免許皆伝トースト ★ Phase11 新規
//
// 【演出コンセプト】
//   サイバー和風 × 武道の格式
//   - 黒背景（#0a0a0a → #1a1410）に金文字（#fbbf24）
//   - 朱印風の赤丸アクセント（左上に配置）
//   - スキャンラインのシマー（左→右に光が流れる）
//   - 中央に大きく「免許皆伝」+ 下に課題テキスト
//   - 4秒間表示し、フェードアウト
//
// 【複数到達時の挙動】
//   AchievementToast と同様にキューイングし、1つずつ順番に表示する。
// =====================================================================

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface ToastItem {
  id:       string;
  taskText: string;
  phase:    'enter' | 'show' | 'exit';
}

interface MasteryToastProps {
  /** 新規皆伝到達した課題テキストの配列 */
  taskTexts: string[];
  /** 全トースト表示完了時のコールバック */
  onAllDone: () => void;
}

export function MasteryToast({ taskTexts, onAllDone }: MasteryToastProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const queueRef          = useRef<string[]>([]);
  const timerRef          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAllDoneRef      = useRef(onAllDone);
  onAllDoneRef.current    = onAllDone;

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      onAllDoneRef.current();
      return;
    }
    const itemId = `mastery_${Date.now()}_${Math.random()}`;

    setItems(prev => [...prev, { id: itemId, taskText: next, phase: 'enter' }]);

    setTimeout(() => {
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, phase: 'show' } : it));
    }, 60);

    timerRef.current = setTimeout(() => {
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, phase: 'exit' } : it));
      setTimeout(() => {
        setItems(prev => prev.filter(it => it.id !== itemId));
        setTimeout(showNext, 250);
      }, 600);
    }, 4500);
  }, []);

  useEffect(() => {
    if (taskTexts.length === 0) return;
    queueRef.current = [...taskTexts];
    showNext();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskTexts]);

  if (items.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes masteryToastIn {
          0%   { opacity: 0; transform: translateY(28px) scale(0.92); }
          50%  { opacity: 1; transform: translateY(-6px) scale(1.03); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes masteryToastOut {
          0%   { opacity: 1; transform: translateY(0)    scale(1); }
          100% { opacity: 0; transform: translateY(20px) scale(0.95); }
        }
        @keyframes masteryToastScan {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        @keyframes masteryToastBorderPulse {
          0%, 100% { box-shadow: 0 0 18px rgba(251,191,36,0.4),
                                 0 4px 32px rgba(0,0,0,0.7),
                                 inset 0 0 12px rgba(251,191,36,0.08); }
          50%      { box-shadow: 0 0 32px rgba(251,191,36,0.7),
                                 0 4px 32px rgba(0,0,0,0.7),
                                 inset 0 0 16px rgba(251,191,36,0.15); }
        }
        @keyframes masterySealRotate {
          0%   { transform: scale(0) rotate(-45deg); opacity: 0; }
          70%  { transform: scale(1.15) rotate(8deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg);   opacity: 1; }
        }
        @keyframes masterySparkle {
          0%   { transform: translateY(0) scale(1);    opacity: 1; }
          100% { transform: translateY(-24px) scale(0.3); opacity: 0; }
        }
      `}</style>

      <div style={{
        position:      'fixed',
        bottom:        80,
        right:         16,
        zIndex:        9999,
        display:       'flex',
        flexDirection: 'column',
        gap:           10,
        alignItems:    'flex-end',
        pointerEvents: 'none',
      }}>
        {items.map(item => (
          <SingleMasteryToast key={item.id} item={item} />
        ))}
      </div>
    </>
  );
}

function SingleMasteryToast({ item }: { item: ToastItem }) {
  const { taskText, phase } = item;

  const animStyle: React.CSSProperties =
    phase === 'enter' ? { opacity: 0, transform: 'translateY(28px) scale(0.92)' } :
    phase === 'show'  ? {
      animation:               'masteryToastIn 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards, masteryToastBorderPulse 2.2s ease-in-out 0.6s infinite',
    } :
    { animation: 'masteryToastOut 0.6s ease forwards' };

  return (
    <div
      style={{
        position:      'relative',
        width:         'min(340px, calc(100vw - 32px))',
        background:    'linear-gradient(135deg, #0a0a0a 0%, #1a1410 50%, #0a0a0a 100%)',
        border:        '1.5px solid #fbbf24',
        borderRadius:  6,
        padding:       '16px 18px 16px 16px',
        display:       'flex',
        alignItems:    'center',
        gap:           14,
        pointerEvents: 'auto',
        overflow:      'hidden',
        ...animStyle,
      }}
    >
      {/* スキャンライン */}
      <div style={{
        position:       'absolute',
        inset:          0,
        background:     'linear-gradient(105deg, transparent 30%, rgba(251,191,36,0.18) 50%, transparent 70%)',
        backgroundSize: '200% 100%',
        animation:      'masteryToastScan 2.6s linear infinite',
        borderRadius:   6,
        pointerEvents:  'none',
      }} />

      {/* 上端ハイライトライン（金色） */}
      <div style={{
        position:     'absolute',
        top:          0,
        left:         '8%',
        right:        '8%',
        height:       2,
        background:   'linear-gradient(90deg, transparent, #fbbf24, transparent)',
        borderRadius: '0 0 4px 4px',
        boxShadow:    '0 0 8px #fbbf24',
      }} />

      {/* 下端ハイライトライン（金色・薄め） */}
      <div style={{
        position:     'absolute',
        bottom:       0,
        left:         '12%',
        right:        '12%',
        height:       1,
        background:   'linear-gradient(90deg, transparent, rgba(251,191,36,0.6), transparent)',
        borderRadius: '4px 4px 0 0',
      }} />

      {/* 朱印アイコン（左） */}
      <div style={{
        flexShrink:     0,
        width:          54,
        height:         54,
        borderRadius:   8,
        background:     'radial-gradient(circle at 35% 35%, #dc2626, #7f1d1d 70%, #450a0a)',
        border:         '2px solid #fbbf24',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        boxShadow:      '0 0 16px rgba(220,38,38,0.55), inset 0 0 8px rgba(0,0,0,0.4)',
        position:       'relative',
        zIndex:         1,
        animation:      phase === 'show' ? 'masterySealRotate 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
      }}>
        <span style={{
          fontSize:      18,
          fontWeight:    900,
          color:         '#fef3c7',
          letterSpacing: '0.05em',
          textShadow:    '0 0 4px #000, 0 1px 0 #000',
          fontFamily:    'serif',
          lineHeight:    1,
        }}>
          皆伝
        </span>
      </div>

      {/* テキストエリア */}
      <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
        {/* ラベル */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          6,
          marginBottom: 4,
        }}>
          <span style={{
            width:        4,
            height:       4,
            borderRadius: '50%',
            background:   '#fbbf24',
            boxShadow:    '0 0 4px #fbbf24',
          }} />
          <span style={{
            fontSize:      9,
            letterSpacing: '0.22em',
            fontWeight:    800,
            color:         '#fbbf24',
            textTransform: 'uppercase',
          }}>
            MASTERY UNLOCKED
          </span>
        </div>

        {/* メインタイトル「免許皆伝」 */}
        <p style={{
          fontSize:      18,
          fontWeight:    900,
          color:         '#fde68a',
          margin:        '0 0 5px',
          letterSpacing: '0.32em',
          textShadow:    '0 0 10px rgba(251,191,36,0.7), 0 0 20px rgba(251,191,36,0.3)',
          whiteSpace:    'nowrap',
        }}>
          免 許 皆 伝
        </p>

        {/* 課題テキスト */}
        <p style={{
          fontSize:        11.5,
          color:           'rgba(254,243,199,0.85)',
          margin:          0,
          lineHeight:      1.45,
          overflow:        'hidden',
          display:         '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          fontWeight:      600,
        }}>
          {taskText}
        </p>
      </div>

      {/* 右上スパークル */}
      {phase === 'show' && (
        <div style={{
          position:      'absolute',
          top:           10,
          right:         14,
          display:       'flex',
          gap:           4,
          pointerEvents: 'none',
        }}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                width:        4,
                height:       4,
                borderRadius: '50%',
                background:   '#fbbf24',
                animation:    `masterySparkle 1.5s ease ${i * 0.18}s infinite`,
                boxShadow:    '0 0 4px #fbbf24',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default MasteryToast;
