'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader2, PlusCircle } from 'lucide-react';
import type { DashboardData, Technique, UserTask } from '@/types';
import { fetchDashboard, saveLog, fetchTechniques, updateTechniqueRating } from '@/lib/api';

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
              transition: 'all .2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      {tab === 'practice'  && <PracticeTab />}
      {tab === 'technique' && <TechniqueTab />}

    </div>
  );
}

// =====================================================================
// タブ①：稽古を記録（XP獲得フォーム）
// ★ Phase4: saveLog に task_id を渡す（item_name ではなく）
// =====================================================================
function PracticeTab() {
  const router = useRouter();
  const [dashboard, setDashboard]  = useState<DashboardData | null>(null);
  const [scores, setScores]        = useState<ScoreMap>({});
  const [date, setDate]            = useState(todayStr());
  const [loading, setLoading]      = useState(true);
  const [submitting, setSubmitting]= useState(false);
  const [result, setResult]        = useState<{xp:number; title:string}|null>(null);
  const [error, setError]          = useState<string|null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(d => { setDashboard(d); setLoading(false); })
      .catch(e => {
        if (e.message === 'AUTH_REQUIRED') return;
        setError(e.message); setLoading(false);
      });
  }, []);

  const activeTasks: UserTask[] = (dashboard?.tasks ?? []).filter(t => t.status === 'active');
  const allScored   = activeTasks.length > 0 && activeTasks.every(t => scores[t.id]);
  const canSubmit   = activeTasks.length > 0 && allScored && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      const res = await saveLog({
        date,
        // ★ Phase4: task_id（UUID）を送信。item_name は廃止。
        items: activeTasks.map(t => ({ task_id: t.id, score: scores[t.id] })),
      });
      setResult({ xp: res.xp_earned, title: res.title });
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
      setError(e instanceof Error ? e.message : '送信に失敗しました');
    } finally { setSubmitting(false); }
  }

  /* 完了画面 */
  if (result) {
    return (
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
            onClick={() => { setResult(null); setScores({}); }}>
            続けて記録
          </button>
        </div>
      </div>
    );
  }

  /* 入力フォーム */
  return (
    <div>
      {/* 日付 */}
      <div className="wa-card" style={{ marginBottom:'1rem' }}>
        <span className="section-title">稽古日</span>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      {/* 評価カード */}
      {loading ? (
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

          {/* エラー */}
          {error && (
            <div style={{ padding:12, background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, fontSize:'0.85rem', color:'#b91c1c' }}>
              {error}
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
  );
}

// =====================================================================
// タブ②：技を記録（習熟度評価）
// =====================================================================
function TechniqueTab() {
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string|null>(null);
  const [ratings, setRatings]       = useState<ScoreMap>({});
  const [saveStates, setSaveStates] = useState<SavedMap>({});

  useEffect(() => {
    fetchTechniques()
      .then(data => { setTechniques(data); })
      .catch(e => {
        if (e.message === 'AUTH_REQUIRED') return;
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Technique[]>> = {};
    techniques.forEach(t => {
      const bp = t.bodyPart   || '未分類';
      const at = t.actionType || '未分類';
      if (!map[bp])     map[bp]     = {};
      if (!map[bp][at]) map[bp][at] = [];
      map[bp][at].push(t);
    });
    return map;
  }, [techniques]);

  async function handleSave(t: Technique) {
    const rating = ratings[t.id];
    if (!rating || rating < 1) return;
    setSaveStates(prev => ({ ...prev, [t.id]: 'saving' }));
    try {
      const res = await updateTechniqueRating(t.id, rating);
      setTechniques(prev => prev.map(tech =>
        tech.id === t.id ? { ...tech, points: res.points, lastRating: res.lastRating } : tech
      ));
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

  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {[1,2,3].map(i => <div key={i} style={{ height:90, borderRadius:16, background:'#eef2ff', animation:'shimmer 1.4s infinite' }} />)}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ textAlign:'center', padding:'3rem 1rem' }}>
      <p style={{ fontSize:'2rem', marginBottom:12 }}>⚠️</p>
      <p style={{ fontWeight:700, color:'#e0e7ff' }}>データ取得に失敗しました</p>
      <p style={{ fontSize:'0.75rem', color:'#a8a29e', marginTop:8 }}>{error}</p>
    </div>
  );

  if (techniques.length === 0) return (
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
