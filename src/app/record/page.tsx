'use client';

// =====================================================================
// 百錬自得 - 記録画面（src/app/record/page.tsx）
// ★ Phase13.2: 技記録のスマート化
//   - PracticeTab / TechniqueTab のタブUIを廃止し、1ページ統合
//   - TechniqueTab / TechCard / YojiToast / 四字熟語ロジックを完全削除
//   - 与打セクション（GivenTechniqueRecordSection）を新設
//     量×質マトリックスを saveLog の givenTechs[] として一括送信
//   - テーブル型UIに刷新（[技] [量] [質/原因] [×] の4列）
//   - 透明Selectハック: 表示は数値のみ・タップ時にフルテキストの選択肢
//   - 絵文字を Lucide Swords / Shield に置換
//   - 1回の保存で xp_history 1行（saveLog 側で集約済み）
// =====================================================================

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import {
  CheckCircle,
  Loader2,
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
import type {
  Achievement,
  UserTask,
  LogEntry,
  ReceivedTechniqueSelection,
  ReceivedReason,
  GivenTechniqueSelection,
  GivenStrikeQuality,
  TechniqueMasterEntry,
} from '@/types';
import {
  titleForLevel,
  calcLevelFromXp,
  GIVEN_QUALITY_LABELS,
  RECEIVED_REASON_FULL_LABELS,
} from '@/types';
import {
  saveLog,
  useDashboardSWR,
} from '@/lib/api';
import { TaskEvalCard } from '@/components/TaskEvalCard';
import { MasteryToast } from '@/components/MasteryToast';
import { calcMasteryStatus, detectNewlyMastered } from '@/lib/mastery';

// =====================================================================
// 共通型・定数
// =====================================================================
type ScoreMap  = Record<string, number>;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// =====================================================================
// ★ Phase13.2: 与打/被打の入力UIテーマ
// =====================================================================

const THEME_GIVEN = {
  border:     '#818cf8',                   // indigo-400
  borderSoft: 'rgba(129,140,248,0.35)',
  fg:         '#a5b4fc',                   // indigo-300
  glow:       'rgba(99,102,241,0.55)',
  bg:         'rgba(30,27,75,0.55)',
  bgInput:    'rgba(30,27,75,0.55)',
  accent:     '#7dd3fc',
};

const THEME_RECEIVED = {
  border:     '#f87171',                   // red-400
  borderSoft: 'rgba(248,113,113,0.35)',
  fg:         '#fca5a5',                   // red-300
  glow:       'rgba(239,68,68,0.55)',
  bg:         'rgba(127,29,29,0.18)',
  bgInput:    'rgba(60,10,10,0.55)',
  accent:     '#fca5a5',
};

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
// =====================================================================

interface ToastItem {
  id:          string;
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

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      onAllDoneRef.current();
      return;
    }
    const itemId = `${next.id}_${Date.now()}`;

    setItems(prev => [...prev, { id: itemId, achievement: next, phase: 'enter' }]);

    setTimeout(() => {
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, phase: 'show' } : it));
    }, 60);

    timerRef.current = setTimeout(() => {
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, phase: 'exit' } : it));
      setTimeout(() => {
        setItems(prev => prev.filter(it => it.id !== itemId));
        setTimeout(showNext, 200);
      }, 500);
    }, 4000);
  }, []);

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

      <div style={{
        position:   'fixed',
        bottom:     80,
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
      <div style={{
        position:   'absolute',
        inset:      0,
        background: `linear-gradient(105deg, transparent 30%, ${colors.glow}18 50%, transparent 70%)`,
        backgroundSize: '200% 100%',
        animation:  'achShimmer 2.2s linear infinite',
        borderRadius: '16px',
        pointerEvents: 'none',
      }} />

      <div style={{
        position:   'absolute',
        top:        0,
        left:       '10%',
        right:      '10%',
        height:     '2px',
        background: `linear-gradient(90deg, transparent, ${colors.glow}dd, transparent)`,
        borderRadius: '0 0 4px 4px',
      }} />

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

      <div style={{ flex:1, minWidth:0, zIndex:1 }}>
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
// メインページ（Phase13.2: タブ廃止・1ページ統合）
// =====================================================================
export default function RecordPage() {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();

  const { data: swrData, isLoading, error: fetchError, mutate: mutateDashboard } = useDashboardSWR();
  const dashboard = swrData?.dashboard ?? null;

  const [scores, setScores]                = useState<ScoreMap>({});
  const [date, setDate]                    = useState(todayStr());
  const [submitting, setSubmitting]        = useState(false);
  const [result, setResult]                = useState<{xp:number; title:string}|null>(null);
  const [submitError, setSubmitError]      = useState<string|null>(null);
  const [toastAchievements, setToastAchievements] = useState<Achievement[]>([]);
  const [masteryToastTexts, setMasteryToastTexts] = useState<string[]>([]);

  // ★ Phase13.2: 与打 / 被打の入力state
  const [givenTechSelections,    setGivenTechSelections]    = useState<GivenTechniqueSelection[]>([]);
  const [receivedTechSelections, setReceivedTechSelections] = useState<ReceivedTechniqueSelection[]>([]);

  const error = fetchError?.message === 'AUTH_REQUIRED' ? null : fetchError;

  const activeTasks: UserTask[] = (dashboard?.tasks ?? []).filter(t => t.status === 'active');
  // ★ Phase13.2: 全課題スコア必須を撤廃。1件以上スコア入力 or 与打 or 被打のいずれかがあれば送信可能
  const hasAnyInput =
    activeTasks.some(t => scores[t.id]) ||
    givenTechSelections.length > 0 ||
    receivedTechSelections.length > 0;
  const canSubmit   = hasAnyInput && !submitting;
  
  const masteryMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof calcMasteryStatus>> = {};
    if (!dashboard?.logs) return map;
    activeTasks.forEach(t => {
      map[t.id] = calcMasteryStatus(dashboard.logs, t.task_text);
    });
    return map;
  }, [dashboard?.logs, activeTasks]);

  // ★ Phase13.2: 技マスターを部位順にソート
  // 優先順位: 面 > 小手 > 胴 > 突き > その他（未分類等）
  const sortedTechMaster = useMemo(() => {
    const BP_ORDER: Record<string, number> = {
      '面':   0,
      '小手': 1,
      '胴':   2,
      '突き': 3,
    };
    const master = dashboard?.techniqueMaster ?? [];
    return [...master].sort((a, b) => {
      const orderA = BP_ORDER[a.bodyPart] ?? 99;
      const orderB = BP_ORDER[b.bodyPart] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      // 同部位内は元のID順を維持（安定ソート）
      return String(a.id).localeCompare(String(b.id));
    });
  }, [dashboard?.techniqueMaster]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true); setSubmitError(null);

    const prevLogs: LogEntry[] = dashboard?.logs ? [...dashboard.logs] : [];
    const submittedTaskTexts = activeTasks.map(t => t.task_text);

    try {
      const validReceived = receivedTechSelections.filter(r =>
        r.techniqueId && r.quantity >= 1 && r.quantity <= 5 && r.reason >= 1 && r.reason <= 5
      );
      const validGiven = givenTechSelections.filter(g =>
        g.techniqueId && g.quantity >= 1 && g.quantity <= 5 && g.quality >= 1 && g.quality <= 5
      );

      const res = await saveLog({
        date,
        items: activeTasks.map(t => ({ task_id: t.id, score: scores[t.id] })),
        ...(validGiven.length > 0    ? { givenTechs:    validGiven }    : {}),
        ...(validReceived.length > 0 ? { receivedTechs: validReceived } : {}),
      });
      setResult({
        xp:    res.xp_earned,
        title: titleForLevel(calcLevelFromXp(res.total_xp), dashboard?.titleMaster),
      });

      if (res.newAchievements && res.newAchievements.length > 0) {
        setToastAchievements(res.newAchievements);
      }

      const refreshed = await mutateDashboard();
      const nextLogs: LogEntry[] = refreshed?.dashboard?.logs ?? [
        ...prevLogs,
        ...activeTasks.map(t => ({
          date,
          item_name: t.task_text,
          score:     scores[t.id],
          xp_earned: 0,
        } as LogEntry)),
      ];

      const newlyMastered = detectNewlyMastered(prevLogs, nextLogs, submittedTaskTexts);
      if (newlyMastered.length > 0) {
        setMasteryToastTexts(newlyMastered);
      }

      void globalMutate(['dashboard']);

    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
      setSubmitError(e instanceof Error ? e.message : '送信に失敗しました');
    } finally { setSubmitting(false); }
  }

  /* ============= 完了画面 ============= */
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
              onClick={() => {
                setResult(null);
                setScores({});
                setToastAchievements([]);
                setMasteryToastTexts([]);
                setGivenTechSelections([]);
                setReceivedTechSelections([]);
              }}>
              続けて記録
            </button>
          </div>
        </div>

        {toastAchievements.length > 0 && (
          <AchievementToast
            achievements={toastAchievements}
            onAllDone={() => setToastAchievements([])}
          />
        )}

        {masteryToastTexts.length > 0 && (
          <MasteryToast
            taskTexts={masteryToastTexts}
            onAllDone={() => setMasteryToastTexts([])}
          />
        )}
      </>
    );
  }

  /* ============= 入力フォーム ============= */
  return (
    <div className="animate-fade-up" style={{ padding:'1.5rem 1rem 0' }}>

      {/* ヘッダー */}
      <header style={{ marginBottom:'1.25rem' }}>
        <span className="section-title">記録</span>
        <h1 style={{ fontSize:'1.75rem', fontWeight:800, color:'#e0e7ff', margin:0, letterSpacing:'-0.02em' }}>
          今日の稽古
        </h1>
      </header>

      {/* 日付 */}
      <div className="wa-card" style={{
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.6rem 0.9rem',
      }}>
        <span className="section-title" style={{ margin: 0 }}>稽古日</span>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{
            background:   'rgba(30,27,75,0.55)',
            border:       '1px solid rgba(99,102,241,0.35)',
            borderRadius: 8,
            color:        '#e0e7ff',
            fontSize:     '0.82rem',
            fontWeight:   700,
            fontFamily:   'inherit',
            padding:      '4px 8px',
            outline:      'none',
            colorScheme:  'dark',
          }}
        />
      </div>

      {/* ============= 評価カード ============= */}
      {isLoading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[1,2,3].map(i => <div key={i} style={{ height:80, borderRadius:12, background:'#eef2ff', animation:'shimmer 1.4s infinite' }} />)}
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        </div>
      ) : activeTasks.length === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem 1rem' }}>
          <p style={{ color:'#78716c', fontWeight:600 }}>評価項目がありません</p>
          <p style={{ fontSize:'0.75rem', color:'#a8a29e', marginTop:6 }}>
            <a href="/settings/tasks" style={{ color:'#6366f1', fontWeight:700 }}>設定 → 評価項目</a> から課題を登録してください
          </p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {activeTasks.map((task, idx) => {
            const current = scores[task.id] ?? null;
            // const mastery = masteryMap[task.id] ?? null;
            return (
              <div
                key={task.id}
                className="animate-slide-in"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <TaskEvalCard
                  taskText={task.task_text}
                  score={current}
                  onChange={(s) => setScores(prev => ({ ...prev, [task.id]: s }))}
                  disabled={submitting}
                />
              </div>
            );
          })}

          {/* ============= ★ Phase13.2: 与打セクション ============= */}
          <GivenTechniqueRecordSection
            techMaster={sortedTechMaster}
            selections={givenTechSelections}
            onChange={setGivenTechSelections}
            disabled={submitting}
          />

          {/* ============= ★ Phase13.2: 被打セクション ============= */}
          <ReceivedTechniqueRecordSection
            techMaster={sortedTechMaster}
            selections={receivedTechSelections}
            onChange={setReceivedTechSelections}
            disabled={submitting}
          />

          {/* フェッチエラー */}
          {error && (
            <div style={{ padding:12, background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, fontSize:'0.85rem', color:'#b91c1c' }}>
              {error.message}
            </div>
          )}

          {/* 送信エラー */}
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
            style={{ marginTop:6, opacity: canSubmit ? 1 : 0.45 }}
          >
            {submitting ? (
              <>
                <Loader2 style={{ width:18, height:18, animation:'spin .8s linear infinite' }} />
                記録中...
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </>
            ) : (
              '稽古を記録'
            )}
          </button>
        </div>
      )}

      {toastAchievements.length > 0 && (
        <AchievementToast
          achievements={toastAchievements}
          onAllDone={() => setToastAchievements([])}
        />
      )}

      {masteryToastTexts.length > 0 && (
        <MasteryToast
          taskTexts={masteryToastTexts}
          onAllDone={() => setMasteryToastTexts([])}
        />
      )}
    </div>
  );
}

// =====================================================================
// ★ Phase13.2: 透明Selectハック（数値表示+フルテキスト選択）
// =====================================================================

interface NumericSelectProps<V extends number> {
  value:    V;
  options:  Record<V, string>;
  onChange: (next: V) => void;
  disabled?: boolean;
  width?:    number;
  textColor: string;
  borderColor: string;
  bgColor:   string;
}

function NumericSelect<V extends number>({
  value, options, onChange, disabled, width = 44, textColor, borderColor, bgColor,
}: NumericSelectProps<V>) {
  return (
    <div style={{
      position:     'relative',
      width,
      height:       28,
      flexShrink:   0,
    }}>
      {/* 背面: 数値のみ表示 */}
      <div style={{
        position:        'absolute',
        inset:           0,
        background:      bgColor,
        border:          `1px solid ${borderColor}`,
        borderRadius:    6,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        color:           textColor,
        fontSize:        '0.85rem',
        fontWeight:      800,
        fontFamily:      'inherit',
        pointerEvents:   'none',
      }}>
        {value}
      </div>

      {/* 前面: 透明な native select */}
      <select
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value) as V)}
        style={{
          position:    'absolute',
          inset:       0,
          width:       '100%',
          height:      '100%',
          opacity:     0,
          cursor:      disabled ? 'not-allowed' : 'pointer',
          fontFamily:  'inherit',
          fontSize:    '16px',  // iOS のズーム回避
          appearance:  'none',
          WebkitAppearance: 'none',
        }}
      >
        {(Object.keys(options) as unknown as V[])
          .map(k => Number(k) as V)
          .sort((a, b) => a - b)
          .map(k => (
            <option key={k} value={k} style={{ background:'#1e1b4b', color:'#fff' }}>
              {k}: {options[k]}
            </option>
          ))}
      </select>
    </div>
  );
}

// =====================================================================
// ★ Phase13.2: 与打/被打 共通シェル
// =====================================================================

interface SymmetrySectionProps {
  theme:    typeof THEME_GIVEN;
  titleEn:  string;
  titleJa:  string;
  Icon:     LucideIcon;
  warning?: boolean;
  children: React.ReactNode;
}

function SymmetrySection({
  theme, titleEn, titleJa, Icon, warning, children,
}: SymmetrySectionProps) {
  return (
    <div
      style={{
        position:     'relative',
        marginTop:    14,
        padding:      '12px 12px 14px',
        borderRadius: 12,
        border:       `1px solid ${theme.border}`,
        background:   `linear-gradient(135deg, rgba(8,6,20,0.55), rgba(20,10,30,0.55))`,
        boxShadow:    warning
          ? `0 0 0 1px ${theme.borderSoft}, 0 0 18px ${theme.glow}33 inset`
          : `0 0 0 1px ${theme.borderSoft}`,
        overflow:     'hidden',
      }}
    >
      {/* 上端のシマー */}
      <div style={{
        position:   'absolute',
        top:        0,
        left:       '8%',
        right:      '8%',
        height:     1.5,
        background: `linear-gradient(90deg, transparent, ${theme.border}, transparent)`,
      }} />

      {/* ヘッダ */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        marginBottom: 10,
      }}>
        <div style={{
          width:          28,
          height:         28,
          borderRadius:   8,
          background:     theme.bg,
          border:         `1px solid ${theme.borderSoft}`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
        }}>
          <Icon size={14} color={theme.fg} strokeWidth={1.8} />
        </div>
        <div style={{ flex:1, minWidth: 0 }}>
          <div style={{
            fontSize:      '0.55rem',
            fontWeight:    700,
            color:         theme.fg,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            lineHeight:    1.1,
          }}>
            {titleEn}
          </div>
          <div style={{
            fontSize:      '0.88rem',
            fontWeight:    800,
            color:         '#fff',
            letterSpacing: '0.02em',
            lineHeight:    1.3,
            textShadow:    warning ? `0 0 8px ${theme.glow}` : 'none',
          }}>
            {titleJa}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

// =====================================================================
// ★ Phase13.2: 与打セクション
// =====================================================================

interface GivenTechSectionProps {
  techMaster: TechniqueMasterEntry[];
  selections: GivenTechniqueSelection[];
  onChange:   (next: GivenTechniqueSelection[]) => void;
  disabled?:  boolean;
}

function GivenTechniqueRecordSection({
  techMaster, selections, onChange, disabled,
}: GivenTechSectionProps) {
  const theme = THEME_GIVEN;

  function addRow() {
    if (techMaster.length === 0) return;
    onChange([...selections, { techniqueId: techMaster[0].id, quantity: 3, quality: 3 }]);
  }
  function removeRow(idx: number) {
    onChange(selections.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<GivenTechniqueSelection>) {
    onChange(selections.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  return (
    <SymmetrySection
      theme={theme}
      titleEn="GIVEN STRIKES"
      titleJa="与打"
      Icon={Swords}
    >
      <TechTable
        theme={theme}
        headers={['技', '量', '質']}
        emptyText="記録なし"
        hasRows={selections.length > 0}
      >
        {selections.map((sel, idx) => (
          <TechRow
            key={idx}
            theme={theme}
            techMaster={techMaster}
            techniqueId={sel.techniqueId}
            onTechChange={v => updateRow(idx, { techniqueId: v })}
            quantity={sel.quantity}
            onQuantityChange={v => updateRow(idx, { quantity: v })}
            thirdValue={sel.quality}
            thirdLabels={GIVEN_QUALITY_LABELS}
            onThirdChange={v => updateRow(idx, { quality: v as GivenStrikeQuality })}
            onRemove={() => removeRow(idx)}
            disabled={disabled}
          />
        ))}
      </TechTable>

      <button
        type="button"
        disabled={disabled || techMaster.length === 0}
        onClick={addRow}
        style={{
          marginTop:    10,
          width:        '100%',
          padding:      '8px 12px',
          background:   'transparent',
          border:       `1px dashed ${theme.border}`,
          borderRadius: 8,
          color:        theme.fg,
          fontSize:     '0.78rem',
          fontWeight:   700,
          cursor:       disabled ? 'not-allowed' : 'pointer',
          fontFamily:   'inherit',
          letterSpacing:'0.05em',
          opacity:      disabled ? 0.5 : 1,
        }}
      >
        ＋ ADD
      </button>
    </SymmetrySection>
  );
}

// =====================================================================
// ★ Phase13.2: 被打セクション
// =====================================================================

interface ReceivedTechSectionProps {
  techMaster: TechniqueMasterEntry[];
  selections: ReceivedTechniqueSelection[];
  onChange:   (next: ReceivedTechniqueSelection[]) => void;
  disabled?:  boolean;
}

function ReceivedTechniqueRecordSection({
  techMaster, selections, onChange, disabled,
}: ReceivedTechSectionProps) {
  const theme = THEME_RECEIVED;

  function addRow() {
    if (techMaster.length === 0) return;
    onChange([
      ...selections,
      { techniqueId: techMaster[0].id, quantity: 1, reason: 1 },
    ]);
  }
  function removeRow(idx: number) {
    onChange(selections.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<ReceivedTechniqueSelection>) {
    onChange(selections.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  return (
    <SymmetrySection
      theme={theme}
      titleEn="RECEIVED STRIKES"
      titleJa="被打"
      Icon={Shield}
      warning
    >
      <TechTable
        theme={theme}
        headers={['技', '量', '原因']}
        emptyText="記録なし"
        hasRows={selections.length > 0}
      >
        {selections.map((sel, idx) => (
          <TechRow
            key={idx}
            theme={theme}
            techMaster={techMaster}
            techniqueId={sel.techniqueId}
            onTechChange={v => updateRow(idx, { techniqueId: v })}
            quantity={sel.quantity}
            onQuantityChange={v => updateRow(idx, { quantity: v })}
            thirdValue={sel.reason}
            thirdLabels={RECEIVED_REASON_FULL_LABELS}
            onThirdChange={v => updateRow(idx, { reason: v as ReceivedReason })}
            onRemove={() => removeRow(idx)}
            disabled={disabled}
          />
        ))}
      </TechTable>

      <button
        type="button"
        disabled={disabled || techMaster.length === 0}
        onClick={addRow}
        style={{
          marginTop:    10,
          width:        '100%',
          padding:      '8px 12px',
          background:   'transparent',
          border:       `1px dashed ${theme.border}`,
          borderRadius: 8,
          color:        theme.fg,
          fontSize:     '0.78rem',
          fontWeight:   700,
          cursor:       disabled ? 'not-allowed' : 'pointer',
          fontFamily:   'inherit',
          letterSpacing:'0.05em',
          opacity:      disabled ? 0.5 : 1,
        }}
      >
        ＋ ADD
      </button>
    </SymmetrySection>
  );
}

// =====================================================================
// ★ Phase13.2: テーブル共通レイアウト
// =====================================================================

interface TechTableProps {
  theme:    typeof THEME_GIVEN;
  headers:  [string, string, string];
  emptyText: string;
  hasRows:  boolean;
  children: React.ReactNode;
}

// Grid columns: [技] 1fr / [量] 44px / [質/原因] 50px / [×] 26px
const GRID_COLUMNS = '1fr 44px 50px 26px';

function TechTable({ theme, headers, emptyText, hasRows, children }: TechTableProps) {
  return (
    <>
      {/* ヘッダー行 */}
      <div style={{
        display:        'grid',
        gridTemplateColumns: GRID_COLUMNS,
        gap:            6,
        padding:        '0 4px 6px',
        fontSize:       '0.55rem',
        fontWeight:     700,
        color:          theme.fg,
        letterSpacing:  '0.12em',
        textTransform:  'uppercase',
        opacity:        0.75,
      }}>
        <span>{headers[0]}</span>
        <span style={{ textAlign:'center' }}>{headers[1]}</span>
        <span style={{ textAlign:'center' }}>{headers[2]}</span>
        <span></span>
      </div>

      {!hasRows ? (
        <p style={{
          fontSize: '0.75rem',
          color:    theme.fg,
          textAlign:'center',
          padding:  '14px 0',
          opacity:  0.7,
          margin:   0,
        }}>
          {emptyText}
        </p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap: 6 }}>
          {children}
        </div>
      )}
    </>
  );
}

interface TechRowProps {
  theme:           typeof THEME_GIVEN;
  techMaster:      TechniqueMasterEntry[];
  techniqueId:     string;
  onTechChange:    (next: string) => void;
  quantity:        number;
  onQuantityChange:(next: number) => void;
  thirdValue:      number;
  thirdLabels:     Record<number, string>;
  onThirdChange:   (next: number) => void;
  onRemove:        () => void;
  disabled?:       boolean;
}

function TechRow({
  theme, techMaster,
  techniqueId, onTechChange,
  quantity, onQuantityChange,
  thirdValue, thirdLabels, onThirdChange,
  onRemove, disabled,
}: TechRowProps) {

  // 量の選択肢: 1〜5（フルテキストはシンプル）
  const QUANTITY_LABELS: Record<number, string> = {
    1: '少ない',
    2: 'やや少ない',
    3: '標準的',
    4: 'やや多い',
    5: '多い',
  };
  return (
    <div
      style={{
        display:        'grid',
        gridTemplateColumns: GRID_COLUMNS,
        gap:            6,
        alignItems:     'center',
        padding:        '5px 4px',
        background:     theme.bg,
        border:         `1px solid ${theme.borderSoft}`,
        borderRadius:   8,
      }}
    >
      {/* 技プルダウン */}
      <select
        value={techniqueId}
        disabled={disabled}
        onChange={e => onTechChange(e.target.value)}
        style={{
          minWidth:     0,
          background:   theme.bgInput,
          border:       `1px solid ${theme.borderSoft}`,
          color:        '#e0e7ff',
          borderRadius: 6,
          padding:      '5px 4px',
          fontSize:     '0.78rem',
          fontWeight:   700,
          fontFamily:   'inherit',
          outline:      'none',
          appearance:   'none',
          WebkitAppearance: 'none',
          height:       28,
        }}
      >
        {techMaster.map(m => (
          <option key={m.id} value={m.id} style={{ background:'#1e1b4b', color:'#e0e7ff' }}>
            {m.bodyPart ? `[${m.bodyPart}] ` : ''}{m.name}
          </option>
        ))}
      </select>

      {/* 量（透明Selectハック） */}
      <NumericSelect
        value={quantity}
        options={QUANTITY_LABELS}
        onChange={onQuantityChange}
        disabled={disabled}
        width={44}
        textColor={theme.accent}
        borderColor={theme.borderSoft}
        bgColor={theme.bgInput}
      />

      {/* 質 or 原因（透明Selectハック） */}
      <NumericSelect
        value={thirdValue}
        options={thirdLabels}
        onChange={onThirdChange}
        disabled={disabled}
        width={50}
        textColor={theme.accent}
        borderColor={theme.borderSoft}
        bgColor={theme.bgInput}
      />

      {/* ×ボタン */}
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        style={{
          width:      26,
          height:     26,
          borderRadius: 6,
          border:     `1px solid ${theme.borderSoft}`,
          background: 'transparent',
          color:      theme.fg,
          fontSize:   '0.85rem',
          fontWeight: 700,
          cursor:     disabled ? 'not-allowed' : 'pointer',
          display:    'flex',
          alignItems: 'center',
          justifyContent:'center',
          fontFamily: 'inherit',
          padding:    0,
        }}
        aria-label="削除"
      >
        ×
      </button>
    </div>
  );
}
