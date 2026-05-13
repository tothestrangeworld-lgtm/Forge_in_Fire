'use client';

// =====================================================================
// 百錬自得 - 記録画面（src/app/record/page.tsx）
// ★ Phase4: saveLog に task_id を渡す（item_name ではなく）
// ★ Phase6 Step3: saveLog レスポンスの newAchievements をトースト通知で表示
// ★ SWR: PracticeTab → useDashboardSWR / TechniqueTab → useTechniquesSWR に移行
// ★ Phase8: TechniqueTab を量×質ステッパーUIに刷新
// ★ Phase9.5: SaveLogResponse から title が削除されたため、
//   titleForLevel(calcLevelFromXp(res.total_xp), dashboard?.titleMaster) で動的導出
// ★ リファクタリング: PracticeTab の課題評価UIを TaskEvalCard 共通コンポーネントに置き換え
// ★ Phase11: 免許皆伝（Mastery）システム
//   - 各 TaskEvalCard に mastery prop を渡す（dashboard.logs から動的計算）
//   - 保存前後でログを比較し、新規皆伝到達タスクを MasteryToast で通知
//   - saveLog 成功後、SWRの mutate でログを即時更新してから差分判定
// =====================================================================

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
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
import type {
  Achievement,
  Technique,
  UserTask,
  LogEntry,
  ReceivedTechniqueSelection,
  ReceivedReason,
  TechniqueMasterEntry,
} from '@/types';
import {
  titleForLevel,
  calcLevelFromXp,
  RECEIVED_REASON_LABELS,
} from '@/types';
import {
  saveLog,
  updateTechniqueRating,
  useDashboardSWR,
  useTechniquesSWR,
} from '@/lib/api';
import { TaskEvalCard } from '@/components/TaskEvalCard';
import { MasteryToast } from '@/components/MasteryToast';
import { calcMasteryStatus, detectNewlyMastered } from '@/lib/mastery';

// =====================================================================
// 共通型・定数
// =====================================================================
type Tab       = 'practice' | 'technique';
type ScoreMap  = Record<string, number>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SavedMap  = Record<string, SaveState>;

/** ★ Phase8: 量×質 の2軸評価ステート */
type RatingEntry = { quantity: number; quality: number };
type RatingMap   = Record<string, RatingEntry>;

/** ★ Phase8: 四字熟語フィードバックトースト用 */
interface YojiToastInfo {
  techName:     string;
  feedback:     string;
  earnedPoints: number;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// =====================================================================
// ★ Phase13: 被打入力UI 用の定数・型
// =====================================================================

/** 与打（積極的に磨きたい技）入力の1件 */
type GivenTechSelection = {
  techniqueId: string;
  quantity:    number;     // 1〜5
};

/** 被打原因コード → 表示ラベル（プルダウン用） */
const REASON_OPTION_LABELS: Record<ReceivedReason, string> = {
  1: '攻め負け (隙あり)',
  2: '単調 (読まれた)',
  3: '居着き (反応遅れ)',
  4: '体勢崩れ (姿勢の乱れ)',
  5: '⚠️ 手元上がり (致命的)',
};

/** 被打UI用のサイバー赤テーマ */
const SHIM_RED = {
  border:   '#f87171',          // red-400
  borderSoft: 'rgba(248,113,113,0.35)',
  fg:       '#fca5a5',          // red-300
  glow:     'rgba(239,68,68,0.55)',     // red-500
  bg:       'rgba(127,29,29,0.18)',     // red-900 透過
  bgInput:  'rgba(60,10,10,0.55)',
};

/** 与打UI用のサイバー青/紫テーマ（既存のAIカラー寄せ） */
const SHIM_BLUE = {
  border:     '#818cf8',                 // indigo-400
  borderSoft: 'rgba(129,140,248,0.35)',
  fg:         '#a5b4fc',                 // indigo-300
  glow:       'rgba(99,102,241,0.55)',
  bg:         'rgba(30,27,75,0.55)',
  bgInput:    'rgba(30,27,75,0.55)',
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
// ★ Phase8: 四字熟語フィードバックトースト
// =====================================================================

interface YojiToastProps {
  info:    YojiToastInfo;
  visible: boolean;
}

function YojiToast({ info, visible }: YojiToastProps) {
  return (
    <>
      <style>{`
        @keyframes yojiIn  { 0%{opacity:0;transform:translateX(-24px) scale(0.94)} 60%{opacity:1;transform:translateX(4px) scale(1.02)} 100%{opacity:1;transform:translateX(0) scale(1)} }
        @keyframes yojiOut { 0%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(-20px)} }
        @keyframes yojiShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes yojiGlow { 0%,100%{opacity:.5} 50%{opacity:1} }
      `}</style>
      <div style={{
        position:  'fixed',
        bottom:    80,
        left:      16,
        zIndex:    9997,
        animation: visible ? 'yojiIn .45s cubic-bezier(0.34,1.56,0.64,1) forwards'
                           : 'yojiOut .35s ease forwards',
        pointerEvents: 'none',
      }}>
        <div style={{
          position:     'relative',
          background:   'linear-gradient(135deg, rgba(8,6,20,0.97), rgba(20,10,40,0.97))',
          border:       '1px solid #7c3aed88',
          borderRadius: 14,
          padding:      '10px 16px 10px 14px',
          display:      'flex',
          alignItems:   'center',
          gap:          12,
          minWidth:     200,
          maxWidth:     280,
          overflow:     'hidden',
        }}>
          <div style={{
            position:       'absolute',
            inset:          0,
            background:     'linear-gradient(105deg,transparent 30%,#7c3aed22 50%,transparent 70%)',
            backgroundSize: '200% 100%',
            animation:      'yojiShimmer 2s linear infinite',
            borderRadius:   14,
          }} />
          <div style={{
            position:   'absolute',
            top:        0, left:'15%', right:'15%', height: 1.5,
            background: 'linear-gradient(90deg,transparent,#a78bfa,transparent)',
            animation:  'yojiGlow 2s ease-in-out infinite',
          }} />

          <div style={{
            flexShrink:     0,
            width:          38,
            height:         38,
            borderRadius:   10,
            background:     'radial-gradient(circle at 35% 35%,#7c3aed33,#3b0764aa)',
            border:         '1px solid #7c3aed77',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            boxShadow:      '0 0 12px #7c3aed55',
            zIndex:         1,
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>⚔️</span>
          </div>

          <div style={{ zIndex: 1, minWidth: 0 }}>
            <div style={{
              fontSize:      9,
              letterSpacing: '0.18em',
              fontWeight:    700,
              color:         '#a78bfa',
              textTransform: 'uppercase',
              marginBottom:  2,
            }}>
              技の稽古
            </div>
            <div style={{
              fontSize:      16,
              fontWeight:    800,
              color:         '#fff',
              letterSpacing: '0.12em',
              lineHeight:    1.1,
              textShadow:    '0 0 10px #a78bfacc',
              whiteSpace:    'nowrap',
            }}>
              {info.feedback}
            </div>
            <div style={{
              fontSize:   11,
              color:      '#c4b5fd',
              marginTop:  3,
              whiteSpace: 'nowrap',
            }}>
              {info.techName} &nbsp;
              <span style={{ color:'#10b981', fontWeight:700 }}>+{info.earnedPoints} pt</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


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
// ★ リファクタリング: TaskEvalCard 共通コンポーネントを使用
// ★ Phase11: TaskEvalCard に mastery prop を渡し、保存後に皆伝判定 → トースト表示
// =====================================================================
function PracticeTab() {
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
  // ★ Phase11: 皆伝トースト用のタスクテキスト配列
  const [masteryToastTexts, setMasteryToastTexts] = useState<string[]>([]);

  // ★ Phase13: 与打 / 被打の入力state
  const [givenTechSelections,    setGivenTechSelections]    = useState<GivenTechSelection[]>([]);
  const [receivedTechSelections, setReceivedTechSelections] = useState<ReceivedTechniqueSelection[]>([]);

  const error = fetchError?.message === 'AUTH_REQUIRED' ? null : fetchError;

  const activeTasks: UserTask[] = (dashboard?.tasks ?? []).filter(t => t.status === 'active');
  const allScored   = activeTasks.length > 0 && activeTasks.every(t => scores[t.id]);
  const canSubmit   = activeTasks.length > 0 && allScored && !submitting;

  // ★ Phase11: 各タスクのMasteryStatusを事前計算（再レンダ最適化のためuseMemo）
  const masteryMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof calcMasteryStatus>> = {};
    if (!dashboard?.logs) return map;
    activeTasks.forEach(t => {
      map[t.id] = calcMasteryStatus(dashboard.logs, t.task_text);
    });
    return map;
  }, [dashboard?.logs, activeTasks]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true); setSubmitError(null);

    // ★ Phase11: 保存前のログをスナップショット
    const prevLogs: LogEntry[] = dashboard?.logs ? [...dashboard.logs] : [];

    // 保存対象タスク（テキスト一覧を保持）
    const submittedTaskTexts = activeTasks.map(t => t.task_text);

    try {
      // ★ Phase13: 被打記録を含めて送信
      //   - receivedTechs は空配列でも問題ないが、送信ペイロードを軽量化するため
      //     1件以上ある時のみフィールドを付与する
      const validReceived = receivedTechSelections.filter(r =>
        r.techniqueId && r.quantity >= 1 && r.quantity <= 5 && r.reason >= 1 && r.reason <= 5
      );

      const res = await saveLog({
        date,
        items: activeTasks.map(t => ({ task_id: t.id, score: scores[t.id] })),
        ...(validReceived.length > 0 ? { receivedTechs: validReceived } : {}),
      });
      setResult({
        xp:    res.xp_earned,
        title: titleForLevel(calcLevelFromXp(res.total_xp), dashboard?.titleMaster),
      });

      if (res.newAchievements && res.newAchievements.length > 0) {
        setToastAchievements(res.newAchievements);
      }

      // ★ Phase11: ログを最新化してから新規皆伝判定
      // saveLog レスポンスに logs は含まれないため、optimistic に prev に新規ログを追加
      // 正確な judgement のため、サーバーから最新を取り直す
      const refreshed = await mutateDashboard();
      const nextLogs: LogEntry[] = refreshed?.dashboard?.logs ?? [
        ...prevLogs,
        // フォールバック: SWR再取得が失敗した場合は楽観的に追加
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

      // ホーム画面側のキャッシュも更新
      void globalMutate(['dashboard']);

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
              onClick={() => {
                setResult(null);
                setScores({});
                setToastAchievements([]);
                setMasteryToastTexts([]);
                // ★ Phase13: 与打 / 被打入力もリセット
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

  /* 入力フォーム */
  return (
    <>
      <div>
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

        {/* 評価カード */}
        {isLoading ? (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[1,2,3].map(i => <div key={i} style={{ height:80, borderRadius:12, background:'#eef2ff', animation:'shimmer 1.4s infinite' }} />)}
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
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {activeTasks.map((task, idx) => {
              const current = scores[task.id] ?? null;
              const mastery = masteryMap[task.id] ?? null;
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
//                    mastery={mastery} 
                  />
                </div>
              );
            })}
            {/* ===================================================== */}
            {/* ★ Phase13: 与打セクション（積極的に磨きたい技） */}
            {/* ===================================================== */}
            <TechniqueRecordSection
              kind="given"
              techMaster={dashboard?.techniqueMaster ?? []}
              selections={givenTechSelections}
              onChange={setGivenTechSelections}
              disabled={submitting}
            />

            {/* ===================================================== */}
            {/* ★ Phase13: 被打セクション（地稽古で打たれた技と原因） */}
            {/* ===================================================== */}
            <ReceivedTechniqueRecordSection
              techMaster={dashboard?.techniqueMaster ?? []}
              selections={receivedTechSelections}
              onChange={setReceivedTechSelections}
              disabled={submitting}
            />


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
              style={{ marginTop:6, opacity: canSubmit ? 1 : 0.45 }}
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

// =====================================================================
// タブ②：技を記録（習熟度評価）
// =====================================================================
function TechniqueTab() {
  const { data: techniques, isLoading, error: fetchError, mutate } = useTechniquesSWR();
  const { mutate: globalMutate } = useSWRConfig();

  const [ratings,    setRatings]    = useState<RatingMap>({});
  const [saveStates, setSaveStates] = useState<SavedMap>({});
  const [yojiToast,  setYojiToast]  = useState<YojiToastInfo | null>(null);
  const [yojiVisible, setYojiVisible] = useState(false);
  const yojiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const error   = fetchError?.message === 'AUTH_REQUIRED' ? null : fetchError;
  const techList = techniques ?? [];

  const getRating = (id: string): RatingEntry => ratings[id] ?? { quantity: 3, quality: 3 };

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

  function handleRate(id: string, axis: 'quantity' | 'quality', val: number) {
    const clamped = Math.min(5, Math.max(1, val));
    setRatings(prev => ({ ...prev, [id]: { ...getRating(id), [axis]: clamped } }));
  }

  async function handleSave(t: Technique) {
    const { quantity, quality } = getRating(t.id);
    setSaveStates(prev => ({ ...prev, [t.id]: 'saving' }));
    try {
      const res = await updateTechniqueRating(t.id, quantity, quality);

      mutate(
        prev => prev?.map(tech =>
          tech.id === t.id
            ? {
                ...tech,
                points:       res.points,
                lastRating:   quality,
                lastQuantity: quantity,
                lastQuality:  quality,
                lastFeedback: res.feedback,
              }
            : tech,
        ),
        { revalidate: false },
      );

      void globalMutate(['dashboard']);

      if (yojiTimerRef.current) clearTimeout(yojiTimerRef.current);
      setYojiToast({ techName: t.name, feedback: res.feedback, earnedPoints: res.earnedPoints });
      setYojiVisible(true);
      yojiTimerRef.current = setTimeout(() => {
        setYojiVisible(false);
        setTimeout(() => setYojiToast(null), 400);
      }, 3000);

      setSaveStates(prev => ({ ...prev, [t.id]: 'saved' }));
      setTimeout(() => {
        setSaveStates(prev => ({ ...prev, [t.id]: 'idle' }));
      }, 1800);
    } catch {
      setSaveStates(prev => ({ ...prev, [t.id]: 'error' }));
      setTimeout(() => setSaveStates(prev => ({ ...prev, [t.id]: 'idle' })), 3000);
    }
  }

  if (isLoading) return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {[1,2,3].map(i => <div key={i} style={{ height:110, borderRadius:16, background:'#eef2ff', animation:'shimmer 1.4s infinite' }} />)}
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
    <>
      <div>
        {Object.entries(grouped).map(([bodyPart, actionTypes]) => (
          <div key={bodyPart} style={{ marginBottom:'1.25rem' }}>
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
                      key={t.id}
                      technique={t}
                      rating={getRating(t.id)}
                      saveState={saveStates[t.id] ?? 'idle'}
                      onRate={(axis, val) => handleRate(t.id, axis, val)}
                      onSave={() => handleSave(t)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {yojiToast && <YojiToast info={yojiToast} visible={yojiVisible} />}
    </>
  );
}

// =====================================================================
// 技カード
// =====================================================================
interface TechCardProps {
  technique: Technique;
  rating:    RatingEntry;
  saveState: SaveState;
  onRate:    (axis: 'quantity' | 'quality', val: number) => void;
  onSave:    () => void;
}

const selectStyle: React.CSSProperties = {
  background:   'rgba(30, 27, 75, 0.55)',
  border:       '1px solid rgba(99,102,241,0.35)',
  color:        '#e0e7ff',
  borderRadius: 8,
  padding:      '4px 2px 4px 6px',
  fontSize:     '0.82rem',
  fontWeight:   700,
  fontFamily:   'inherit',
  cursor:       'pointer',
  outline:      'none',
  width:        56,
  appearance:   'none',
  WebkitAppearance: 'none',
  textAlign:    'center',
};

function TechCard({ technique: t, rating, saveState, onRate, onSave }: TechCardProps) {
  const { quantity, quality } = rating;
  const isBusy = saveState === 'saving' || saveState === 'saved';

  const btnBg =
    saveState === 'saved'  ? '#10b981' :
    saveState === 'error'  ? '#ef4444' :
    saveState === 'saving' ? '#6366f1' : '#1e1b4b';
  const btnLabel =
    saveState === 'saving' ? '記録中…' :
    saveState === 'saved'  ? '完了!'  :
    saveState === 'error'  ? 'エラー'  : '＋記録';

  return (
    <div className="wa-card" style={{ padding:'0.7rem 0.85rem' }}>

      <div style={{
        display:     'flex',
        alignItems:  'center',
        gap:         6,
        marginBottom: 7,
        minWidth:    0,
      }}>
        <span style={{
          fontWeight:   700,
          color:        '#e0e7ff',
          fontSize:     '0.88rem',
          whiteSpace:   'nowrap',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          flexShrink:   1,
          minWidth:     0,
        }}>
          {t.name}
        </span>

        <span style={{
          fontSize:   '0.72rem',
          color:      '#a5b4fc',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {t.points.toLocaleString()} pt
          {t.lastFeedback && (
            <span style={{ color:'#7c3aed', fontWeight:700, marginLeft:3 }}>
              [{t.lastFeedback}]
            </span>
          )}
        </span>

        {t.subCategory && (
          <span style={{
            marginLeft:   'auto',
            flexShrink:   0,
            fontSize:     '0.58rem',
            fontWeight:   700,
            padding:      '2px 7px',
            borderRadius: 999,
            background:   '#eef2ff',
            color:        '#4f46e5',
            whiteSpace:   'nowrap',
          }}>
            {t.subCategory}
          </span>
        )}
      </div>

      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        5,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
          <span style={{ fontSize:'0.58rem', color:'#a5b4fc', fontWeight:700, whiteSpace:'nowrap' }}>量</span>
          <select
            value={quantity}
            disabled={isBusy}
            onChange={e => onRate('quantity', Number(e.target.value))}
            style={{ ...selectStyle, opacity: isBusy ? 0.5 : 1 }}
          >
            {[1,2,3,4,5].map(v => (
              <option key={v} value={v} style={{ background:'#1e1b4b', color:'#e0e7ff' }}>{v}</option>
            ))}
          </select>
        </div>

        <span style={{ fontSize:'0.72rem', color:'#a8a29e', fontWeight:700, flexShrink:0 }}>×</span>

        <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
          <span style={{ fontSize:'0.58rem', color:'#a5b4fc', fontWeight:700, whiteSpace:'nowrap' }}>質</span>
          <select
            value={quality}
            disabled={isBusy}
            onChange={e => onRate('quality', Number(e.target.value))}
            style={{ ...selectStyle, opacity: isBusy ? 0.5 : 1 }}
          >
            {[1,2,3,4,5].map(v => (
              <option key={v} value={v} style={{ background:'#1e1b4b', color:'#e0e7ff' }}>{v}</option>
            ))}
          </select>
        </div>

        <button
          onClick={onSave}
          disabled={isBusy}
          style={{
            marginLeft:     'auto',
            height:         34,
            paddingInline:  11,
            borderRadius:   9,
            border:         'none',
            fontFamily:     'inherit',
            fontWeight:     700,
            fontSize:       '0.72rem',
            cursor:         isBusy ? 'not-allowed' : 'pointer',
            background:     btnBg,
            color:          '#fff',
            display:        'flex',
            alignItems:     'center',
            gap:            3,
            transition:     'all .15s',
            flexShrink:     0,
            whiteSpace:     'nowrap',
            justifyContent: 'center',
          }}
        >
          {saveState === 'saving' && (
            <Loader2 style={{ width:11, height:11, animation:'spin .8s linear infinite' }} />
          )}
          {saveState === 'saved' && (
            <CheckCircle style={{ width:11, height:11 }} />
          )}
          {(saveState === 'idle' || saveState === 'error') && (
            <PlusCircle style={{ width:11, height:11 }} />
          )}
          <span>{btnLabel}</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// ★ Phase13: 与打セクション（GivenTechniqueRecord）
// 既存の TechniqueTab とは独立し、saveLog 送信ペイロードに同梱するための入力UI
// =====================================================================

interface GivenTechSectionProps {
  kind:       'given';
  techMaster: TechniqueMasterEntry[];
  selections: GivenTechSelection[];
  onChange:   (next: GivenTechSelection[]) => void;
  disabled?:  boolean;
}

function TechniqueRecordSection({
  techMaster,
  selections,
  onChange,
  disabled,
}: GivenTechSectionProps) {
  const theme = SHIM_BLUE;

  function addRow() {
    if (techMaster.length === 0) return;
    onChange([...selections, { techniqueId: techMaster[0].id, quantity: 3 }]);
  }
  function removeRow(idx: number) {
    onChange(selections.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<GivenTechSelection>) {
    onChange(selections.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  return (
    <SymmetrySection
      theme={theme}
      titleEn="GIVEN STRIKES"
      titleJa="与打：磨きたい技"
      caption="今日重点的に振った技を記録（任意）"
      icon="⚔️"
    >
      {selections.length === 0 ? (
        <p style={{
          fontSize: '0.75rem',
          color:    theme.fg,
          textAlign:'center',
          padding:  '14px 0',
          opacity:  0.7,
        }}>
          記録なし
        </p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
          {selections.map((sel, idx) => (
            <div
              key={idx}
              style={{
                display:        'flex',
                alignItems:     'center',
                gap:            6,
                padding:        '6px 8px',
                background:     theme.bg,
                border:         `1px solid ${theme.borderSoft}`,
                borderRadius:   8,
              }}
            >
              {/* 技プルダウン */}
              <select
                value={sel.techniqueId}
                disabled={disabled}
                onChange={e => updateRow(idx, { techniqueId: e.target.value })}
                style={{
                  flex:         1,
                  minWidth:     0,
                  background:   theme.bgInput,
                  border:       `1px solid ${theme.borderSoft}`,
                  color:        '#e0e7ff',
                  borderRadius: 6,
                  padding:      '5px 6px',
                  fontSize:     '0.78rem',
                  fontWeight:   700,
                  fontFamily:   'inherit',
                  outline:      'none',
                  appearance:   'none',
                  WebkitAppearance: 'none',
                }}
              >
                {techMaster.map(m => (
                  <option key={m.id} value={m.id} style={{ background:'#1e1b4b', color:'#e0e7ff' }}>
                    {m.bodyPart ? `[${m.bodyPart}] ` : ''}{m.name}
                  </option>
                ))}
              </select>

              {/* 量 */}
              <span style={{ fontSize:'0.55rem', color: theme.fg, fontWeight:700 }}>量</span>
              <select
                value={sel.quantity}
                disabled={disabled}
                onChange={e => updateRow(idx, { quantity: Number(e.target.value) })}
                style={{
                  background:   theme.bgInput,
                  border:       `1px solid ${theme.borderSoft}`,
                  color:        '#e0e7ff',
                  borderRadius: 6,
                  padding:      '5px 4px',
                  fontSize:     '0.78rem',
                  fontWeight:   700,
                  fontFamily:   'inherit',
                  outline:      'none',
                  width:        46,
                  appearance:   'none',
                  WebkitAppearance: 'none',
                  textAlign:    'center',
                }}
              >
                {[1,2,3,4,5].map(v => (
                  <option key={v} value={v} style={{ background:'#1e1b4b', color:'#e0e7ff' }}>{v}</option>
                ))}
              </select>

              {/* 削除ボタン */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeRow(idx)}
                style={{
                  flexShrink: 0,
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
                }}
                aria-label="削除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 追加ボタン */}
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
        ＋ 与打を追加
      </button>
    </SymmetrySection>
  );
}

// =====================================================================
// ★ Phase13: 被打セクション（ReceivedTechniqueRecord）
// =====================================================================

interface ReceivedTechSectionProps {
  techMaster: TechniqueMasterEntry[];
  selections: ReceivedTechniqueSelection[];
  onChange:   (next: ReceivedTechniqueSelection[]) => void;
  disabled?:  boolean;
}

function ReceivedTechniqueRecordSection({
  techMaster,
  selections,
  onChange,
  disabled,
}: ReceivedTechSectionProps) {
  const theme = SHIM_RED;

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
      titleJa="被打：打たれた技"
      caption="正直に記録すると +5XP × 量 のボーナス"
      icon="🛡️"
      warning
    >
      {selections.length === 0 ? (
        <p style={{
          fontSize: '0.75rem',
          color:    theme.fg,
          textAlign:'center',
          padding:  '14px 0',
          opacity:  0.7,
        }}>
          記録なし
        </p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
          {selections.map((sel, idx) => (
            <div
              key={idx}
              style={{
                display:        'flex',
                flexDirection:  'column',
                gap:            6,
                padding:        '8px 9px',
                background:     theme.bg,
                border:         `1px solid ${theme.borderSoft}`,
                borderRadius:   8,
                position:       'relative',
              }}
            >
              {/* 1行目: 技 + 量 + 削除 */}
              <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                <select
                  value={sel.techniqueId}
                  disabled={disabled}
                  onChange={e => updateRow(idx, { techniqueId: e.target.value })}
                  style={{
                    flex:         1,
                    minWidth:     0,
                    background:   theme.bgInput,
                    border:       `1px solid ${theme.borderSoft}`,
                    color:        '#fee2e2',
                    borderRadius: 6,
                    padding:      '5px 6px',
                    fontSize:     '0.78rem',
                    fontWeight:   700,
                    fontFamily:   'inherit',
                    outline:      'none',
                    appearance:   'none',
                    WebkitAppearance: 'none',
                  }}
                >
                  {techMaster.map(m => (
                    <option key={m.id} value={m.id} style={{ background:'#1e1b4b', color:'#fee2e2' }}>
                      {m.bodyPart ? `[${m.bodyPart}] ` : ''}{m.name}
                    </option>
                  ))}
                </select>

                <span style={{ fontSize:'0.55rem', color: theme.fg, fontWeight:700 }}>量</span>
                <select
                  value={sel.quantity}
                  disabled={disabled}
                  onChange={e => updateRow(idx, { quantity: Number(e.target.value) })}
                  style={{
                    background:   theme.bgInput,
                    border:       `1px solid ${theme.borderSoft}`,
                    color:        '#fee2e2',
                    borderRadius: 6,
                    padding:      '5px 4px',
                    fontSize:     '0.78rem',
                    fontWeight:   700,
                    fontFamily:   'inherit',
                    outline:      'none',
                    width:        46,
                    appearance:   'none',
                    WebkitAppearance: 'none',
                    textAlign:    'center',
                  }}
                >
                  {[1,2,3,4,5].map(v => (
                    <option key={v} value={v} style={{ background:'#1e1b4b', color:'#fee2e2' }}>{v}</option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeRow(idx)}
                  style={{
                    flexShrink: 0,
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
                  }}
                  aria-label="削除"
                >
                  ×
                </button>
              </div>

              {/* 2行目: 原因（Reason） */}
              <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                <span style={{
                  fontSize:      '0.6rem',
                  color:         theme.fg,
                  fontWeight:    700,
                  letterSpacing: '0.08em',
                  flexShrink:    0,
                }}>
                  原因
                </span>
                <select
                  value={sel.reason}
                  disabled={disabled}
                  onChange={e =>
                    updateRow(idx, { reason: Number(e.target.value) as ReceivedReason })
                  }
                  style={{
                    flex:         1,
                    background:   theme.bgInput,
                    border:       `1px solid ${theme.borderSoft}`,
                    color:        '#fee2e2',
                    borderRadius: 6,
                    padding:      '5px 6px',
                    fontSize:     '0.76rem',
                    fontWeight:   700,
                    fontFamily:   'inherit',
                    outline:      'none',
                    appearance:   'none',
                    WebkitAppearance: 'none',
                  }}
                >
                  {([1,2,3,4,5] as ReceivedReason[]).map(v => (
                    <option key={v} value={v} style={{ background:'#1e1b4b', color:'#fee2e2' }}>
                      {v}: {REASON_OPTION_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

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
        ＋ 被打を追加
      </button>

      {/* 受打件数バッジ */}
      {selections.length > 0 && (
        <p style={{
          marginTop:     8,
          fontSize:      '0.7rem',
          color:         theme.fg,
          textAlign:     'center',
          fontWeight:    700,
          letterSpacing: '0.05em',
        }}>
          {selections.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)} 本記録中
          <span style={{ color:'#10b981', marginLeft: 6 }}>
            +{selections.reduce((sum, s) => sum + 5 * (Number(s.quantity) || 0), 0)} XP 予定
          </span>
        </p>
      )}
    </SymmetrySection>
  );
}

// =====================================================================
// ★ Phase13: 与打/被打の共通シェル（シンメトリー構造）
// =====================================================================

interface SymmetrySectionProps {
  theme:    typeof SHIM_RED;
  titleEn:  string;
  titleJa:  string;
  caption:  string;
  icon:     string;
  warning?: boolean;
  children: React.ReactNode;
}

function SymmetrySection({
  theme, titleEn, titleJa, caption, icon, warning, children,
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
      {/* 上端のシマー線 */}
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
          fontSize:       14,
          flexShrink:     0,
        }}>
          {icon}
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

      <p style={{
        fontSize:    '0.7rem',
        color:       theme.fg,
        margin:      '0 0 10px',
        opacity:     0.85,
        lineHeight:  1.4,
      }}>
        {caption}
      </p>

      {children}
    </div>
  );
}
