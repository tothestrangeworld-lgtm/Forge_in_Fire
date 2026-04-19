'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, CheckCircle, PlusCircle } from 'lucide-react';
import type { Technique } from '@/types';
import { fetchTechniques, updateTechniqueRating } from '@/lib/api';

const TechniqueRadarChart = dynamic(
  () => import('@/components/charts/TechniqueRadarChart'),
  { ssr: false, loading: () => <ChartLoading /> }
);

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type RatingMap  = Record<string, number>;    // id → 今回選んだ星（0=未選択）
type SavedMap   = Record<string, SaveState>; // id → 保存状態

export default function TechniquesPage() {
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [ratings, setRatings]       = useState<RatingMap>({});   // 今回の選択（未選択=0）
  const [saveStates, setSaveStates] = useState<SavedMap>({});

  useEffect(() => {
    fetchTechniques()
      .then(data => { setTechniques(data); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // BodyPart → ActionType → Technique[] にグループ化
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

      // ローカルの Points を加算・LastRating を上書き更新
      setTechniques(prev =>
        prev.map(tech =>
          tech.id === t.id
            ? { ...tech, points: res.points, lastRating: res.lastRating }
            : tech
        )
      );

      setSaveStates(prev => ({ ...prev, [t.id]: 'saved' }));

      // 記録完了後に星の選択をクリア（次回の稽古に備える）
      setTimeout(() => {
        setRatings(prev => ({ ...prev, [t.id]: 0 }));
        setSaveStates(prev => ({ ...prev, [t.id]: 'idle' }));
      }, 1800);

    } catch {
      setSaveStates(prev => ({ ...prev, [t.id]: 'error' }));
      setTimeout(() => setSaveStates(prev => ({ ...prev, [t.id]: 'idle' })), 3000);
    }
  }

  if (loading) return <PageSkeleton />;

  if (error) {
    return (
      <div style={{ padding:'5rem 2rem', textAlign:'center' }}>
        <p style={{ fontSize:'2rem', marginBottom:12 }}>⚠️</p>
        <p style={{ fontWeight:700, color:'#1e1b4b', marginBottom:8 }}>データ取得に失敗しました</p>
        <p style={{ fontSize:'0.75rem', color:'#a8a29e' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up" style={{ padding:'1.5rem 1rem 0' }}>

      {/* ヘッダー */}
      <header style={{ marginBottom:'1.25rem' }}>
        <span className="section-title">技の習熟度</span>
        <h1 style={{ fontSize:'1.75rem', fontWeight:800, color:'var(--ai)', margin:0, letterSpacing:'-0.02em' }}>
          技の記録
        </h1>
      </header>

      {/* レーダーチャート */}
      <div className="wa-card animate-fade-up delay-100" style={{ marginBottom:'1rem' }}>
        <span className="section-title">部位別ポイント</span>
        <TechniqueRadarChart techniques={techniques} />
      </div>

      {/* 技リスト */}
      {Object.entries(grouped).map(([bodyPart, actionTypes]) => (
        <div key={bodyPart} style={{ marginBottom:'1.25rem' }} className="animate-fade-up delay-200">

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
                  <TechniqueCard
                    key={t.id}
                    technique={t}
                    rating={ratings[t.id] ?? 0}
                    saveState={saveStates[t.id] ?? 'idle'}
                    onRate={star => setRatings(prev => ({ ...prev, [t.id]: star }))}
                    onSave={() => handleSave(t)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {techniques.length === 0 && (
        <div style={{ textAlign:'center', padding:'3rem 1rem' }}>
          <p style={{ fontSize:'2.5rem', marginBottom:12 }}>🗡️</p>
          <p style={{ color:'#78716c', fontWeight:600 }}>技データがありません</p>
          <p style={{ fontSize:'0.75rem', color:'#a8a29e', marginTop:6 }}>
            TechniqueMastery シートにデータを追加してください
          </p>
        </div>
      )}

    </div>
  );
}

// ===== 技カード =====
interface TechniqueCardProps {
  technique:  Technique;
  rating:     number;      // 0 = 未選択
  saveState:  SaveState;
  onRate:     (star: number) => void;
  onSave:     () => void;
}

function TechniqueCard({ technique: t, rating, saveState, onRate, onSave }: TechniqueCardProps) {
  // 星がひとつでも選ばれていれば記録可能
  const canRecord = rating >= 1 && saveState !== 'saving';

  const btnBg =
    saveState === 'saved'  ? '#10b981' :
    saveState === 'error'  ? '#ef4444' :
    canRecord              ? '#1e1b4b' : '#e0e7ff';

  const btnColor = canRecord || saveState === 'saved' || saveState === 'error'
    ? '#fff' : '#a5b4fc';

  const btnLabel =
    saveState === 'saving' ? '記録中…' :
    saveState === 'saved'  ? '記録完了' :
    saveState === 'error'  ? 'エラー'   : '＋記録';

  return (
    <div className="wa-card" style={{ padding:'0.85rem 1rem' }}>

      {/* 技名 + ポイント */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, color:'var(--ai)', fontSize:'0.9rem', margin:'0 0 2px' }}>
            {t.name}
          </p>
          <p style={{ fontSize:'0.65rem', color:'#a8a29e', margin:0 }}>
            累計{' '}
            <span style={{ fontWeight:700, color:'#6366f1' }}>
              {t.points.toLocaleString()} pt
            </span>
            {/* 今回選んだ星があれば加算後のプレビュー */}
            {rating >= 1 && saveState === 'idle' && (
              <span style={{ color:'#10b981', fontWeight:700, marginLeft:4 }}>
                → {(t.points + rating).toLocaleString()} pt（+{rating}）
              </span>
            )}
            {t.lastRating > 0 && (
              <span style={{ marginLeft:8, color:'#cbd5e1' }}>
                前回 {'★'.repeat(t.lastRating)}{'☆'.repeat(5 - t.lastRating)}
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

      {/* 星ボタン + 記録ボタン */}
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>

        {/* 1〜5 の星ボタン */}
        <div style={{ display:'flex', gap:4, flex:1 }}>
          {[1,2,3,4,5].map(star => (
            <button
              key={star}
              onClick={() => onRate(star)}
              disabled={saveState === 'saving' || saveState === 'saved'}
              style={{
                flex:1, height:34, borderRadius:8,
                border: `2px solid ${rating >= star ? '#4f46e5' : '#e0e7ff'}`,
                background: rating >= star ? '#4f46e5' : '#fff',
                color:      rating >= star ? '#fff'    : '#c7d2fe',
                fontSize:'0.8rem', fontWeight:700, fontFamily:'inherit',
                cursor: saveState === 'saving' || saveState === 'saved' ? 'not-allowed' : 'pointer',
                transition:'all .12s',
                opacity: saveState === 'saved' ? 0.5 : 1,
              }}
            >
              {star}
            </button>
          ))}
        </div>

        {/* 記録ボタン */}
        <button
          onClick={onSave}
          disabled={!canRecord}
          style={{
            height:34, paddingInline:10, borderRadius:8,
            border:'none', fontFamily:'inherit', fontWeight:700, fontSize:'0.75rem',
            cursor: canRecord ? 'pointer' : 'not-allowed',
            background: btnBg,
            color:      btnColor,
            display:'flex', alignItems:'center', gap:4,
            transition:'all .15s', flexShrink:0,
            minWidth:68,
            justifyContent:'center',
          }}
        >
          {saveState === 'saving' && (
            <Loader2 style={{ width:12, height:12, animation:'spin .8s linear infinite' }} />
          )}
          {saveState === 'saved' && <CheckCircle style={{ width:12, height:12 }} />}
          {saveState === 'idle' && canRecord && <PlusCircle style={{ width:12, height:12 }} />}
          <span>{btnLabel}</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </button>

      </div>
    </div>
  );
}

// ===== ローディング =====

function ChartLoading() {
  return (
    <div style={{ height:240, borderRadius:12, background:'linear-gradient(90deg,#eef2ff,#e0e7ff,#eef2ff)', backgroundSize:'200%', animation:'shimmer 1.4s infinite' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div style={{ padding:'1.5rem 1rem', display:'flex', flexDirection:'column', gap:12 }}>
      {[28,260,80,80,80].map((h,i) => (
        <div key={i} style={{ height:h, borderRadius:16, background:'linear-gradient(90deg,#eef2ff,#e0e7ff,#eef2ff)', backgroundSize:'200%', animation:`shimmer 1.4s ${i*0.1}s infinite` }} />
      ))}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}
