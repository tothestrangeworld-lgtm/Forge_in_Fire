'use client';

// =====================================================================
// 百錬自得 - 記録画面（src/app/record/page.tsx）
// ★ Phase4: saveLog に task_id を渡す（item_name ではなく）
// ★ Phase6 Step3: saveLog レスポンスの newAchievements をトースト通知で表示
// ★ SWR: PracticeTab → useDashboardSWR / TechniqueTab → useTechniquesSWR に移行
// ★ SWR修正: useDashboardSWR の戻り値が { dashboard, techniques } になったため
//            PracticeTab の data 受け取り方を修正（data: swrData → swrData.dashboard）
// =====================================================================

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  Loader2,
  PlusCircle,
  Flame,
  Trophy,
  Target,
  Swords,
  Shield,
  Star,
  Zap,
  Crown,
  Medal,
  Award,
  Footprints,
  Milestone,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { Achievement, Technique, UserTask } from '@/types';
import {
  saveLog,
  updateTechniqueRating,
  useDashboardSWR,
  useTechniquesSWR,
} from '@/lib/api';

// =====================================================================
// 共通型・定数
// =====================================================================
type Tab       = 'practice' | 'technique';
type ScoreMap  = Record<string, number>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SavedMap  = Record<string, SaveState>;

const SCORE_LABELS: Record<number, string> = {
  1:'悪い', 2:'少し悪い', 3:'普通', 4:'少し良い', 5:'良い',
};
const BADGE_STYLES: Record<number, { bg: string; color: string }> = {
  1:{bg:'#fee2e2',color:'#b91c1c'}, 2:{bg:'#ffedd5',color:'#c2410c'},
  3:{bg:'#fef9c3',color:'#a16207'}, 4:{bg:'#dcfce7',color:'#15803d'},
  5:{bg:'#1e1b4b',color:'#ffffff'},
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// =====================================================================
// アチーブメントトースト用 iconType マッピング
// =====================================================================
const ICON_MAP: Record<string, LucideIcon> = {
  flame:      Flame,
  trophy:     Trophy,
  target:     Target,
  swords:     Swords,
  shield:     Shield,
  star:       Star,
  zap:        Zap,
  crown:      Crown,
  medal:      Medal,
  award:      Award,
  footprints: Footprints,
  milestone:  Milestone,
  first_step: Footprints,
  streak:     Flame,
  legendary:  Crown,
  sparkles:   Sparkles,
};

const GLOW_COLORS: Record<string, { glow: string; fg: string; bg: string; grad: string }> = {
  flame:      { glow:'#ff6b35', fg:'#ff9a6b', bg:'rgba(255,107,53,0.12)', grad:'linear-gradient(135deg,#ff6b3520,#ff9a6b10)' },
  streak:     { glow:'#ff6b35', fg:'#ff9a6b', bg:'rgba(255,107,53,0.12)', grad:'linear-gradient(135deg,#ff6b3520,#ff9a6b10)' },
  first_step: { glow:'#00d4ff', fg:'#55e5ff', bg:'rgba(0,212,255,0.10)', grad:'linear-gradient(135deg,#00d4ff18,#55e5ff0c)' },
  milestone:  { glow:'#b088f9', fg:'#caaafe', bg:'rgba(176,136,249,0.12)', grad:'linear-gradient(135deg,#b088f920,#caaafe10)' },
  legendary:  { glow:'#ffd700', fg:'#ffe566', bg:'rgba(255,215,0,0.12)', grad:'linear-gradient(135deg,#ffd70020,#ffe56610)' },
  trophy:     { glow:'#ffd700', fg:'#ffe566', bg:'rgba(255,215,0,0.12)', grad:'linear-gradient(135deg,#ffd70020,#ffe56610)' },
  crown:      { glow:'#ffd700', fg:'#ffe566', bg:'rgba(255,215,0,0.12)', grad:'linear-gradient(135deg,#ffd70020,#ffe56610)' },
  default:    { glow:'#00ff88', fg:'#55ffaa', bg:'rgba(0,255,136,0.10)', grad:'linear-gradient(135deg,#00ff8818,#55ffaa0c)' },
};

function getGlow(iconType: string) {
  return GLOW_COLORS[iconType.toLowerCase()] ?? GLOW_COLORS.default;
}
function getIcon(iconType: string): LucideIcon {
  return ICON_MAP[iconType.toLowerCase()] ?? Award;
}

// =====================================================================
// AchievementToast コンポーネント
// ★ Phase6 Step3
//
// 【設計】
//   - 複数実績は順番にキューイングして 1つずつ表示（間隔 600ms）
//   - 各トーストは 4秒後に自動 dismiss（フェードアウト込み）
//   - 画面右下（モバイルは画面下中央）に固定表示
// =====================================================================

interface ToastItem {
  id:          string;   // 一意ID（複数枚管理用）
  achievement: Achievement;
  phase:       'enter' | 'show' | 'exit';
}

interface AchievementToastProps {
  achievements: Achievement[];
  onAllDone:    () => void;
}

function AchievementToast({ achievements, onAllDone }: AchievementToastProps) {
  const [items, setItems]    = useState<ToastItem[]>([]);
  const queueRef             = useRef<Achievement[]>([]);
  const timerRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAllDoneRef         = useRef(onAllDone);
  onAllDoneRef.current       = onAllDone;

  // 次をキューから取り出して表示
  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      onAllDoneRef.current();
      return;
    }
    const itemId = `${next.id}_${Date.now()}`;

    // enter フェーズ → show フェーズ → exit フェーズ の順に遷移
    setItems(prev => [...prev, { id: itemId, achievement: next, phase: 'enter' }]);

    // 60ms後に show（enterアニメーション完了待ち）
    setTimeout(() => {
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, phase: 'show' } : it));
    }, 60);

    // 4秒後に exit
    timerRef.current = setTimeout(() => {
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, phase: 'exit' } : it));
      // exitアニメーション(500ms)完了後に削除 → 次へ
      setTimeout(() => {
        setItems(prev => prev.filter(it => it.id !== itemId));
        // 次のトーストを 200ms 後に表示（連続感を出しつつ少しズラす）
        setTimeout(showNext, 200);
      }, 500);
    }, 4000);
  }, []);

  // achievementsが来たらキューに積んで先頭を表示開始
  useEffect(() => {
    if (achievements.length === 0) return;
    queueRef.current = [...achievements];
    showNext();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievements]);

  if (items.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes achToastIn {
          0%   { opacity:0; transform:translateY(28px) scale(0.93); }
          60%  { opacity:1; transform:translateY(-4px) scale(1.02); }
          100% { opacity:1; transform:translateY(0)   scale(1); }
        }
        @keyframes achToastOut {
          0%   { opacity:1; transform:translateY(0)  scale(1); }
          100% { opacity:0; transform:translateY(16px) scale(0.95); }
        }
        @keyframes achIconSpin {
          0%   { transform: rotate(-15deg) scale(0.7); opacity:0; }
          60%  { transform: rotate(8deg)  scale(1.15); opacity:1; }
          100% { transform: rotate(0deg)  scale(1); opacity:1; }
        }
        @keyframes achShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        @keyframes achPulse {
          0%,100% { box-shadow: var(--ach-shadow-a); }
          50%     { box-shadow: var(--ach-shadow-b); }
        }
        @keyframes achParticle {
          0%   { transform:translateY(0) scale(1); opacity:1; }
          100% { transform:translateY(-22px) scale(0.3); opacity:0; }
        }
      `}</style>

      {/* トースト群のコンテナ（画面右下・モバイルは下中央） */}
      <div style={{
        position:   'fixed',
        bottom:     80,   // ボトムナビ分を避ける
        right:      16,
        zIndex:     9998,
        display:    'flex',
        flexDirection: 'column',
        gap:        10,
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
        {items.map(item => (
          <SingleToast key={item.id} item={item} />
        ))}
      </div>
    </>
  );
}

// ── 個別トーストカード ──
function SingleToast({ item }: { item: ToastItem }) {
  const { achievement, phase } = item;
  const IconComp = getIcon(achievement.iconType);
  const colors   = getGlow(achievement.iconType);

  const animStyle: React.CSSProperties =
    phase === 'enter' ? { opacity: 0, transform: 'translateY(28px) scale(0.93)' } :
    phase === 'show'  ? {
      animation: 'achToastIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards',
      '--ach-shadow-a': `0 0 16px ${colors.glow}55, 0 4px 24px rgba(0,0,0,0.5)`,
      '--ach-shadow-b': `0 0 28px ${colors.glow}99, 0 4px 24px rgba(0,0,0,0.5)`,
      animationName: 'achToastIn, achPulse',
      animationDuration: '0.5s, 2s',
      animationDelay: '0s, 0.6s',
      animationTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1), ease-in-out',
      animationFillMode: 'forwards, none',
      animationIterationCount: '1, infinite',
    } as React.CSSProperties :
    { animation: 'achToastOut 0.5s ease forwards' };

  return (
    <div
      style={{
        position:        'relative',
        width:           'min(320px, calc(100vw - 32px))',
        background:      `linear-gradient(135deg, rgba(8,6,20,0.97), rgba(14,8,30,0.97))`,
        border:          `1px solid ${colors.glow}66`,
        borderRadius:    '16px',
        padding:         '14px 16px 14px 14px',
        display:         'flex',
        alignItems:      'center',
        gap:             '14px',
        pointerEvents:   'auto',
        overflow:        'hidden',
        ...animStyle,
      }}
    >
      {/* シマーライン（背景を横切る光沢） */}
      <div style={{
        position:   'absolute',
        inset:      0,
        background: `linear-gradient(105deg, transparent 30%, ${colors.glow}18 50%, transparent 70%)`,
        backgroundSize: '200% 100%',
        animation:  'achShimmer 2.2s linear infinite',
        borderRadius: '16px',
        pointerEvents: 'none',
      }} />

      {/* 上辺グロウライン */}
      <div style={{
        position:   'absolute',
        top:        0,
        left:       '10%',
        right:      '10%',
        height:     '2px',
        background: `linear-gradient(90deg, transparent, ${colors.glow}dd, transparent)`,
        borderRadius: '0 0 4px 4px',
      }} />

      {/* アイコン */}
      <div style={{
        flexShrink:  0,
        width:       48,
        height:      48,
        borderRadius:'50%',
        background:  `radial-gradient(circle at 35% 35%, ${colors.fg}2a, ${colors.bg})`,
        border:      `1.5px solid ${colors.glow}aa`,
        display:     'flex',
        alignItems:  'center',
        justifyContent:'center',
        boxShadow:   `0 0 16px ${colors.glow}66`,
        animation:   phase === 'show' ? 'achIconSpin 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
        zIndex:      1,
      }}>
        <IconComp size={22} color={colors.fg} strokeWidth={1.6} />
      </div>

      {/* テキスト */}
      <div style={{ flex:1, minWidth:0, zIndex:1 }}>
        {/* ラベル */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          gap:            5,
          marginBottom:   3,
        }}>
          <Sparkles size={9} color={colors.fg} strokeWidth={2} />
          <span style={{
            fontSize:       '9px',
            letterSpacing:  '0.18em',
            fontWeight:     700,
            color:          colors.fg,
            textTransform:  'uppercase',
          }}>
            実績解除
          </span>
        </div>

        {/* バッジ名 */}
        <p style={{
          fontSize:      '15px',
          fontWeight:    800,
          color:         '#ffffff',
          margin:        '0 0 3px',
          letterSpacing: '0.05em',
          textShadow:    `0 0 10px ${colors.glow}cc`,
          whiteSpace:    'nowrap',
          overflow:      'hidden',
          textOverflow:  'ellipsis',
        }}>
          {achievement.name}
        </p>

        {/* 説明 */}
        <p style={{
          fontSize:      '11px',
          color:         'rgba(200,195,220,0.8)',
          margin:        0,
          lineHeight:    1.45,
          overflow:      'hidden',
          display:       '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient:'vertical',
        }}>
          {achievement.description}
        </p>
      </div>

      {/* パーティクル（右上） */}
      {phase === 'show' && (
        <div style={{ position:'absolute', top:8, right:12, display:'flex', gap:4, pointerEvents:'none' }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width:  4, height: 4,
              borderRadius: '50%',
              background: colors.glow,
              animation: `achParticle 1.2s ease ${i * 0.18}s infinite`,
              boxShadow: `0 0 4px ${colors.glow}`,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// ルートページ
// =====================================================================
export default function RecordPage() {
  const [tab, setTab] = useState<Tab>('practice');

  return (
    <div className="animate-fade-up" style={{ padding:'1.5rem 1rem 0' }}>

      {/* ヘッダー */}
      <header style={{ marginBottom:'1.25rem' }}>
        <span className="section-title">記録</span>
        <h1 style={{ fontSize:'1.75rem', fontWeight:800, color:'#e0e7ff', margin:0, letterSpacing:'-0.02em' }}>
          今日の稽古
        </h1>
      </header>

      {/* タブ切り替え */}
      <div style={{
        display:'flex', gap:4,
        background:'#eef2ff', borderRadius:16, padding:4,
        marginBottom:'1.25rem',
      }}>
        {([
          { key:'practice',  label:'稽古を記録' },
          { key:'technique', label:'技を記録'   },
        ] as {key:Tab; label:string}[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex:1, fontSize:'0.85rem', fontWeight:700,
              padding:'0.55rem 0', borderRadius:12,
              border:'none', cursor:'pointer', fontFamily:'inherit',
              background: tab === t.key ? '#fff' : 'transparent',
              color:      tab === t.key ? 'var(--ai)' : '#a8a29e',
              boxShadow:  tab === t.key ? '0 1px 4px rgba(99,102,241,.12)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'practice'  && <PracticeTab  />}
      {tab === 'technique' && <TechniqueTab />}
    </div>
  );
}

// =====================================================================
// タブ①：稽古を記録（XP獲得フォーム）
// ★ Phase4: saveLog に task_id を渡す（item_name ではなく）
// ★ Phase6 Step3: saveLog レスポンスの newAchievements をトーストで通知
// ★ SWR: fetchDashboard の手動フェッチを useDashboardSWR に置き換え
// ★ SWR修正: useDashboardSWR が { dashboard, techniques } を返すため
//            data を swrData として受け取り、swrData.dashboard を参照する
// =====================================================================
function PracticeTab() {
  const router = useRouter();

  // ── SWR でダッシュボードを取得 ────────────────────────────────────
  // useDashboardSWR は { dashboard: DashboardData, techniques: Technique[] } を返す
  const { data: swrData, isLoading, error: fetchError } = useDashboardSWR();

  // dashboard を一段ほどいて参照する（旧: data: dashboard と直接受け取っていた）
  const dashboard = swrData?.dashboard ?? null;

  // ── ローカル UI ステート ──────────────────────────────────────────
  const [scores, setScores]                = useState<ScoreMap>({});
  const [date, setDate]                    = useState(todayStr());
  const [submitting, setSubmitting]        = useState(false);
  const [result, setResult]                = useState<{xp:number; title:string}|null>(null);
  const [submitError, setSubmitError]      = useState<string|null>(null);
  // ★ Phase6 Step3: トースト表示用
  const [toastAchievements, setToastAchievements] = useState<Achievement[]>([]);

  // AUTH_REQUIRED は静かに無視（SWR が shouldRetryOnError で止めてくれる）
  const error = fetchError?.message === 'AUTH_REQUIRED' ? null : fetchError;

  const activeTasks: UserTask[] = (dashboard?.tasks ?? []).filter(t => t.status === 'active');
  const allScored   = activeTasks.length > 0 && activeTasks.every(t => scores[t.id]);
  const canSubmit   = activeTasks.length > 0 && allScored && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const res = await saveLog({
        date,
        // ★ Phase4: task_id（UUID）を送信。item_name は廃止。
        items: activeTasks.map(t => ({ task_id: t.id, score: scores[t.id] })),
      });
      setResult({ xp: res.xp_earned, title: res.title });

      // ★ Phase6 Step3: 新規解除実績があればトーストキューに積む
      if (res.newAchievements && res.newAchievements.length > 0) {
        setToastAchievements(res.newAchievements);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
      setSubmitError(e instanceof Error ? e.message : '送信に失敗しました');
    } finally { setSubmitting(false); }
  }

  /* 完了画面 */
  if (result) {
    return (
      <>
        <div className="animate-fade-up" style={{ paddingTop:'2rem', textAlign:'center' }}>
          <div className="animate-pulse-glow" style={{
            width:72, height:72, borderRadius:'50%', background:'var(--ai)',
            display:'flex', alignItems:'center', justifyContent:'center',
            margin:'0 auto 1.5rem',
          }}>
            <CheckCircle style={{ width:36, height:36, color:'#fff' }} />
          </div>
          <h2 style={{ fontSize:'1.5rem', fontWeight:800, color:'#e0e7ff', marginBottom:8 }}>稽古お疲れ様！</h2>
          <p style={{ color:'#a8a29e', marginBottom:'2rem', fontSize:'0.9rem' }}>本日の記録を保存しました</p>
          <div className="wa-card" style={{ display:'inline-block', padding:'1.5rem 3rem', marginBottom:'2rem' }}>
            <p style={{ fontSize:'0.7rem', color:'#a5b4fc', marginBottom:4 }}>獲得XP</p>
            <p style={{ fontSize:'3rem', fontWeight:800, color:'#e0e7ff', lineHeight:1 }}>+{result.xp}</p>
            <p style={{ fontSize:'0.8rem', color:'#a8a29e', marginTop:4 }}>XP</p>
            {result.title && (
              <div style={{ marginTop:16, background:'#fffbeb', borderRadius:12, padding:'8px 16px' }}>
                <p style={{ fontSize:'0.65rem', color:'#92400e' }}>現在の称号</p>
                <p style={{ fontWeight:700, color:'#78350f' }}>{result.title}</p>
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
            <button className="btn-outline" style={{ width:'auto' }} onClick={() => router.push('/')}>ダッシュボード</button>
            <button className="btn-ai" style={{ width:'auto', padding:'0.8rem 1.5rem' }}
              onClick={() => { setResult(null); setScores({}); setToastAchievements([]); }}>
              続けて記録
            </button>
          </div>
        </div>

        {/* ★ Phase6 Step3: 完了画面でもトースト表示 */}
        {toastAchievements.length > 0 && (
          <AchievementToast
            achievements={toastAchievements}
            onAllDone={() => setToastAchievements([])}
          />
        )}
      </>
    );
  }

  /* 入力フォーム */
  return (
    <>
      <div>
        {/* 日付 */}
        <div className="wa-card" style={{ marginBottom:'1rem' }}>
          <span className="section-title">稽古日</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        {/* 評価カード */}
        {isLoading ? (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[1,2,3].map(i => <div key={i} style={{ height:100, borderRadius:16, background:'#eef2ff', animation:'shimmer 1.4s infinite' }} />)}
            <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          </div>
        ) : activeTasks.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem 1rem' }}>
            <p style={{ fontSize:'2rem', marginBottom:8 }}>📋</p>
            <p style={{ color:'#78716c', fontWeight:600 }}>評価項目がありません</p>
            <p style={{ fontSize:'0.75rem', color:'#a8a29e', marginTop:6 }}>
              <a href="/settings/tasks" style={{ color:'#6366f1', fontWeight:700 }}>設定 → 評価項目</a> から課題を登録してください
            </p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {activeTasks.map((task, idx) => {
              const current = scores[task.id];
              const badge   = current ? BADGE_STYLES[current] : null;
              return (
                <div key={task.id} className="wa-card animate-slide-in" style={{ animationDelay:`${idx*60}ms` }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <p style={{ fontWeight:700, color:'#e0e7ff', margin:0, fontSize:'0.95rem' }}>{task.task_text}</p>
                    {badge && current && (
                      <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'0.2rem 0.6rem', borderRadius:999, background:badge.bg, color:badge.color }}>
                        {SCORE_LABELS[current]}
                      </span>
                    )}
                  </div>
                  {/* 星評価ボタン */}
                  <div style={{ display:'flex', gap:6 }}>
                    {[1,2,3,4,5].map(star => (
                      <button
                        key={star}
                        onClick={() => setScores(prev => ({ ...prev, [task.id]: star }))}
                        style={{
                          flex:1, height:40, borderRadius:10,
                          border:`2px solid ${(current ?? 0) >= star ? '#4f46e5' : '#e0e7ff'}`,
                          background: (current ?? 0) >= star ? '#4f46e5' : '#fff',
                          color:      (current ?? 0) >= star ? '#fff' : '#c7d2fe',
                          fontSize:'0.9rem', fontWeight:700, fontFamily:'inherit',
                          cursor:'pointer', transition:'all .12s',
                        }}
                      >
                        {star}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* フェッチエラー表示 */}
            {error && (
              <div style={{ padding:12, background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, fontSize:'0.85rem', color:'#b91c1c' }}>
                {error.message}
              </div>
            )}

            {/* 送信エラー表示 */}
            {submitError && (
              <div style={{ padding:12, background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, fontSize:'0.85rem', color:'#b91c1c' }}>
                {submitError}
              </div>
            )}

            {/* 送信ボタン */}
            <button
              className="btn-ai"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{ marginTop:4, opacity: canSubmit ? 1 : 0.45 }}
            >
              {submitting ? (
                <>
                  <Loader2 style={{ width:18, height:18, animation:'spin .8s linear infinite' }} />
                  記録中...
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </>
              ) : (
                `稽古を記録する（${activeTasks.filter(t => scores[t.id]).length}/${activeTasks.length}）`
              )}
            </button>
          </div>
        )}
      </div>

      {/* ★ Phase6 Step3: アチーブメントトースト */}
      {toastAchievements.length > 0 && (
        <AchievementToast
          achievements={toastAchievements}
          onAllDone={() => setToastAchievements([])}
        />
      )}
    </>
  );
}

// =====================================================================
// タブ②：技を記録（習熟度評価）
// ★ SWR: fetchTechniques の手動フェッチを useTechniquesSWR に置き換え
//        評価保存後のローカル更新は SWR の mutate で対応
// =====================================================================
function TechniqueTab() {
  // ── SWR で技一覧を取得 ────────────────────────────────────────────
  const { data: techniques, isLoading, error: fetchError, mutate } = useTechniquesSWR();

  // ── ローカル UI ステート ──────────────────────────────────────────
  const [ratings, setRatings]       = useState<ScoreMap>({});
  const [saveStates, setSaveStates] = useState<SavedMap>({});

  // AUTH_REQUIRED は静かに無視
  const error = fetchError?.message === 'AUTH_REQUIRED' ? null : fetchError;

  const techList = techniques ?? [];

  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Technique[]>> = {};
    techList.forEach(t => {
      const bp = t.bodyPart   || '未分類';
      const at = t.actionType || '未分類';
      if (!map[bp])     map[bp]     = {};
      if (!map[bp][at]) map[bp][at] = [];
      map[bp][at].push(t);
    });
    return map;
  }, [techList]);

  async function handleSave(t: Technique) {
    const rating = ratings[t.id];
    if (!rating || rating < 1) return;
    setSaveStates(prev => ({ ...prev, [t.id]: 'saving' }));
    try {
      const res = await updateTechniqueRating(t.id, rating);
      // SWR キャッシュをローカル更新（再フェッチなし）
      mutate(
        prev => prev?.map(tech =>
          tech.id === t.id ? { ...tech, points: res.points, lastRating: res.lastRating } : tech
        ),
        { revalidate: false },
      );
      setSaveStates(prev => ({ ...prev, [t.id]: 'saved' }));
      setTimeout(() => {
        setRatings(prev => ({ ...prev, [t.id]: 0 }));
        setSaveStates(prev => ({ ...prev, [t.id]: 'idle' }));
      }, 1800);
    } catch {
      setSaveStates(prev => ({ ...prev, [t.id]: 'error' }));
      setTimeout(() => setSaveStates(prev => ({ ...prev, [t.id]: 'idle' })), 3000);
    }
  }

  if (isLoading) return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {[1,2,3].map(i => <div key={i} style={{ height:90, borderRadius:16, background:'#eef2ff', animation:'shimmer 1.4s infinite' }} />)}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ textAlign:'center', padding:'3rem 1rem' }}>
      <p style={{ fontSize:'2rem', marginBottom:12 }}>⚠️</p>
      <p style={{ fontWeight:700, color:'#e0e7ff' }}>データ取得に失敗しました</p>
      <p style={{ fontSize:'0.75rem', color:'#a8a29e', marginTop:8 }}>{error.message}</p>
    </div>
  );

  if (techList.length === 0) return (
    <div style={{ textAlign:'center', padding:'3rem 1rem' }}>
      <p style={{ fontSize:'2.5rem', marginBottom:12 }}>🗡️</p>
      <p style={{ color:'#78716c', fontWeight:600 }}>技データがありません</p>
      <p style={{ fontSize:'0.75rem', color:'#a8a29e', marginTop:6 }}>technique_master シートにデータを追加してください</p>
    </div>
  );

  return (
    <div>
      {Object.entries(grouped).map(([bodyPart, actionTypes]) => (
        <div key={bodyPart} style={{ marginBottom:'1.25rem' }}>
          {/* BodyPart 区切り */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'0.5rem' }}>
            <div style={{ flex:1, height:1, background:'#e0e7ff' }} />
            <span style={{ fontSize:'0.7rem', fontWeight:800, color:'#6366f1', letterSpacing:'0.1em', whiteSpace:'nowrap' }}>
              {bodyPart}
            </span>
            <div style={{ flex:1, height:1, background:'#e0e7ff' }} />
          </div>

          {Object.entries(actionTypes).map(([actionType, techs]) => (
            <div key={actionType} style={{ marginBottom:'0.75rem' }}>
              <p style={{ fontSize:'0.7rem', fontWeight:700, color:'#a5b4fc', margin:'0 0 6px 2px', letterSpacing:'0.05em' }}>
                {actionType}
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {techs.map(t => (
                  <TechCard
                    key={t.id} technique={t}
                    rating={ratings[t.id] ?? 0}
                    saveState={saveStates[t.id] ?? 'idle'}
                    onRate={star => setRatings(prev => ({...prev,[t.id]:star}))}
                    onSave={() => handleSave(t)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// 技カード
// =====================================================================
interface TechCardProps {
  technique:  Technique;
  rating:     number;
  saveState:  SaveState;
  onRate:     (star: number) => void;
  onSave:     () => void;
}

function TechCard({ technique: t, rating, saveState, onRate, onSave }: TechCardProps) {
  const canRecord = rating >= 1 && saveState !== 'saving';
  const btnBg =
    saveState === 'saved'  ? '#10b981' :
    saveState === 'error'  ? '#ef4444' :
    canRecord              ? '#1e1b4b' : '#e0e7ff';
  const btnLabel =
    saveState === 'saving' ? '記録中…' :
    saveState === 'saved'  ? '記録完了' :
    saveState === 'error'  ? 'エラー'   : '＋記録';

  return (
    <div className="wa-card" style={{ padding:'0.85rem 1rem' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, color:'#e0e7ff', fontSize:'0.9rem', margin:'0 0 2px' }}>{t.name}</p>
          <p style={{ fontSize:'0.65rem', color:'#a8a29e', margin:0 }}>
            累計 <span style={{ fontWeight:700, color:'#6366f1' }}>{t.points.toLocaleString()} pt</span>
            {rating >= 1 && saveState === 'idle' && (
              <span style={{ color:'#10b981', fontWeight:700, marginLeft:4 }}>→ {(t.points+rating).toLocaleString()} pt（+{rating}）</span>
            )}
            {t.lastRating > 0 && (
              <span style={{ marginLeft:8, color:'#cbd5e1' }}>
                前回 {'★'.repeat(t.lastRating)}{'☆'.repeat(5-t.lastRating)}
              </span>
            )}
          </p>
        </div>
        {t.subCategory && (
          <span style={{ fontSize:'0.6rem', fontWeight:700, padding:'2px 8px', borderRadius:999, background:'#eef2ff', color:'#4f46e5', flexShrink:0, marginLeft:8 }}>
            {t.subCategory}
          </span>
        )}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ display:'flex', gap:4, flex:1 }}>
          {[1,2,3,4,5].map(star => (
            <button key={star} onClick={() => onRate(star)}
              disabled={saveState==='saving' || saveState==='saved'}
              style={{
                flex:1, height:34, borderRadius:8,
                border:`2px solid ${rating>=star ? '#4f46e5' : '#e0e7ff'}`,
                background: rating>=star ? '#4f46e5' : '#fff',
                color:      rating>=star ? '#fff' : '#c7d2fe',
                fontSize:'0.8rem', fontWeight:700, fontFamily:'inherit',
                cursor: saveState==='saving'||saveState==='saved' ? 'not-allowed' : 'pointer',
                transition:'all .12s', opacity: saveState==='saved' ? 0.5 : 1,
              }}>{star}</button>
          ))}
        </div>
        <button onClick={onSave} disabled={!canRecord} style={{
          height:34, paddingInline:10, borderRadius:8, border:'none',
          fontFamily:'inherit', fontWeight:700, fontSize:'0.75rem',
          cursor: canRecord ? 'pointer' : 'not-allowed',
          background: btnBg, color: '#fff',
          display:'flex', alignItems:'center', gap:4,
          transition:'all .15s', flexShrink:0, minWidth:68, justifyContent:'center',
        }}>
          {saveState==='saving' && <Loader2 style={{ width:12, height:12, animation:'spin .8s linear infinite' }} />}
          {saveState==='saved'  && <CheckCircle style={{ width:12, height:12 }} />}
          {saveState==='idle' && canRecord && <PlusCircle style={{ width:12, height:12 }} />}
          <span>{btnLabel}</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </button>
      </div>
    </div>
  );
}
