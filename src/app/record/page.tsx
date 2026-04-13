'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';
import type { Setting } from '@/types';
import { fetchSettings, saveLog } from '@/lib/api';

type ScoreMap = Record<string, number>;

// 評価ラベル（1=悪い〜5=良い）
const SCORE_LABELS: Record<number, string> = {
  1: '悪い',
  2: '少し悪い',
  3: '普通',
  4: '少し良い',
  5: '良い',
};

// バッジカラー
const BADGE_STYLES: Record<number, { bg: string; color: string }> = {
  1: { bg: '#fee2e2', color: '#b91c1c' },
  2: { bg: '#ffedd5', color: '#c2410c' },
  3: { bg: '#fef9c3', color: '#a16207' },
  4: { bg: '#dcfce7', color: '#15803d' },
  5: { bg: '#1e1b4b', color: '#ffffff' },
};

export default function RecordPage() {
  const router = useRouter();
  const [settings, setSettings]    = useState<Setting[]>([]);
  const [scores, setScores]        = useState<ScoreMap>({});
  const [date, setDate]            = useState(todayStr());
  const [loading, setLoading]      = useState(true);
  const [submitting, setSubmitting]= useState(false);
  const [result, setResult]        = useState<{ xp: number; title: string } | null>(null);
  const [error, setError]          = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then(s => { setSettings(s.filter(i => i.is_active)); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const activeItems = settings.filter(s => s.is_active);
  const allScored   = activeItems.length > 0 && activeItems.every(s => scores[s.item_name]);

  async function handleSubmit() {
    if (!allScored || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await saveLog({
        date,
        items: activeItems.map(s => ({ item_name: s.item_name, score: scores[s.item_name] })),
      });
      setResult({ xp: res.xp_earned, title: res.title });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  /* ===== 完了画面 ===== */
  if (result) {
    return (
      <div className="animate-fade-up" style={{ padding:'4rem 1.5rem 2rem', textAlign:'center' }}>
        <div
          className="animate-pulse-glow"
          style={{
            width:72, height:72,
            borderRadius:'50%',
            background:'var(--ai)',
            display:'flex', alignItems:'center', justifyContent:'center',
            margin:'0 auto 1.5rem',
          }}
        >
          <CheckCircle style={{ width:36, height:36, color:'#fff' }} />
        </div>
        <h2 style={{ fontSize:'1.5rem', fontWeight:800, color:'var(--ai)', marginBottom:8 }}>稽古お疲れ様！</h2>
        <p style={{ color:'#a8a29e', marginBottom:'2rem', fontSize:'0.9rem' }}>本日の記録を保存しました</p>

        <div className="wa-card" style={{ display:'inline-block', padding:'1.5rem 3rem', marginBottom:'2rem' }}>
          <p style={{ fontSize:'0.7rem', color:'#a5b4fc', marginBottom:4 }}>獲得XP</p>
          <p style={{ fontSize:'3rem', fontWeight:800, color:'var(--ai)', lineHeight:1 }}>+{result.xp}</p>
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
          <button
            className="btn-ai"
            style={{ width:'auto', padding:'0.8rem 1.5rem' }}
            onClick={() => { setResult(null); setScores({}); }}
          >
            続けて記録
          </button>
        </div>
      </div>
    );
  }

  /* ===== 記録フォーム ===== */
  return (
    <div className="animate-fade-up" style={{ padding:'1.5rem 1rem 2rem' }}>

      {/* ヘッダー */}
      <header style={{ marginBottom:'1.5rem' }}>
        <span className="section-title">稽古記録</span>
        <h1 style={{ fontSize:'1.75rem', fontWeight:800, color:'var(--ai)', margin:0, letterSpacing:'-0.02em' }}>
          今日の稽古
        </h1>
      </header>

      {/* 日付 */}
      <div className="wa-card" style={{ marginBottom:'1rem' }}>
        <span className="section-title">稽古日</span>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      {/* 評価フォーム */}
      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height:100, borderRadius:16, background:'#eef2ff', animation:'shimmer 1.4s infinite' }} />
          ))}
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {activeItems.map((item, idx) => {
            const current = scores[item.item_name];
            const badge   = current ? BADGE_STYLES[current] : null;
            return (
              <div
                key={item.item_name}
                className="wa-card animate-slide-in"
                style={{ animationDelay:`${idx * 60}ms` }}
              >
                {/* 項目名 + バッジ */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                  <p style={{ fontWeight:700, color:'var(--ai)', margin:0, fontSize:'0.95rem' }}>
                    {item.item_name}
                  </p>
                  {badge && current && (
                    <span style={{
                      fontSize:'0.7rem', fontWeight:700,
                      padding:'0.2rem 0.6rem',
                      borderRadius:999,
                      background: badge.bg,
                      color: badge.color,
                    }}>
                      {SCORE_LABELS[current]}
                    </span>
                  )}
                </div>

                {/* ★ ← ← ← 横一列に並べる ← ← ← */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',   /* ← 明示的に横 */
                  gap: 8,
                  width: '100%',
                }}>
                  {[1,2,3,4,5].map(n => {
                    const active = current === n;
                    return (
                      <button
                        key={n}
                        onClick={() => setScores(prev => ({ ...prev, [item.item_name]: n }))}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: 42,
                          borderRadius: '50%',
                          border: `2px solid ${active ? 'var(--ai)' : '#c7d2fe'}`,
                          background: active ? 'var(--ai)' : '#fff',
                          color: active ? '#fff' : '#a5b4fc',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transform: active ? 'scale(1.12)' : 'scale(1)',
                          boxShadow: active ? '0 4px 12px rgba(99,102,241,.35)' : 'none',
                          transition: 'all .15s ease',
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>

                {/* ラベル（1〜5の下） */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  marginTop: 6,
                  paddingLeft: 2,
                  paddingRight: 2,
                }}>
                  <span style={{ flex:1, fontSize:8, color:'#ccc', textAlign:'center' }}>悪</span>
                  <span style={{ flex:1 }} />
                  <span style={{ flex:1, fontSize:8, color:'#ccc', textAlign:'center' }}>普通</span>
                  <span style={{ flex:1 }} />
                  <span style={{ flex:1, fontSize:8, color:'#ccc', textAlign:'center' }}>良</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* エラー */}
      {error && (
        <div style={{
          marginTop:16, padding:12,
          background:'#fee2e2', border:'1px solid #fca5a5',
          borderRadius:12, fontSize:'0.85rem', color:'#b91c1c'
        }}>
          {error}
        </div>
      )}

      {/* 進捗テキスト */}
      {!allScored && activeItems.length > 0 && (
        <p style={{ textAlign:'center', fontSize:'0.72rem', color:'#a8a29e', margin:'1rem 0 0.5rem' }}>
          {Object.keys(scores).length} / {activeItems.length} 項目を評価済み
        </p>
      )}

      {/* 送信ボタン */}
      <div style={{ marginTop: 20 }}>
        <button
          className="btn-ai"
          disabled={!allScored || submitting}
          onClick={handleSubmit}
          style={{ width:'100%' }}
        >
          {submitting ? (
            <span style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Loader2 style={{ width:16, height:16, animation:'spin .8s linear infinite' }} />
              保存中...
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </span>
          ) : '稽古を記録する'}
        </button>
      </div>

      {/* 空状態 */}
      {!loading && activeItems.length === 0 && (
        <div style={{ textAlign:'center', marginTop:'4rem' }}>
          <p style={{ fontSize:'2.5rem', marginBottom:'1rem' }}>⚙️</p>
          <p style={{ fontWeight:700, color:'var(--ai)', marginBottom:8 }}>意識項目が設定されていません</p>
          <p style={{ fontSize:'0.75rem', color:'#a8a29e' }}>設定から意識項目を追加してください</p>
        </div>
      )}

    </div>
  );
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
