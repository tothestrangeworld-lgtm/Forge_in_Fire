'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { fetchDashboard, updateProfile } from '@/lib/api';

const RANK_OPTIONS = ['無段', '初段', '弐段', '参段', '四段', '五段', '六段', '七段', '八段'] as const;

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [realRank, setRealRank] = useState<(typeof RANK_OPTIONS)[number]>('無段');
  const [motto, setMotto] = useState('');
  const [favoriteTechnique, setFavoriteTechnique] = useState('');

  useEffect(() => {
    fetchDashboard()
      .then(d => {
        const seededRank = (d.status.real_rank && (RANK_OPTIONS as readonly string[]).includes(d.status.real_rank))
          ? (d.status.real_rank as (typeof RANK_OPTIONS)[number])
          : '無段';
        setRealRank(seededRank);
        setMotto(d.status.motto ?? '');
        setFavoriteTechnique(d.status.favorite_technique ?? '');
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
        setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      })
      .finally(() => setLoading(false));
  }, []);

  const mottoLen = useMemo(() => motto.length, [motto]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        real_rank: realRank,
        motto,
        favorite_technique: favoriteTechnique,
      });
      router.push('/');
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-up" style={{ padding: '1.5rem 1rem 0' }}>
      <header style={{ marginBottom: '1rem' }}>
        <span className="section-title">設定</span>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ai)', margin: 0, letterSpacing: '-0.02em' }}>
          剣士録（プロフィール設定）
        </h1>
      </header>

      <div
        className="wa-card"
        style={{
          marginBottom: '0.75rem',
          background: 'linear-gradient(135deg, rgba(13,11,42,0.92), rgba(30,27,75,0.82))',
          border: '1px solid rgba(139,92,246,0.25)',
        }}
      >
        <p style={{ margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 700, color: 'rgba(199,210,254,0.55)' }}>
          稽古の記録に深みを。段位に応じて獲得XPに倍率がかかります。
        </p>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[44, 44, 44].map((h, i) => (
              <div key={i} style={{ height: h, borderRadius: 12, background: 'rgba(255,255,255,0.06)' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* リアル段位 */}
            <div>
              <span className="section-title" style={{ color: 'rgba(199,210,254,0.55)' }}>リアル段位</span>
              <select
                value={realRank}
                onChange={e => setRealRank(e.target.value as (typeof RANK_OPTIONS)[number])}
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '1.5px solid rgba(129,140,248,0.25)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  padding: '10px 12px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                }}
              >
                {RANK_OPTIONS.map(r => (
                  <option key={r} value={r} style={{ color: '#111827' }}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* 座右の銘 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <span className="section-title" style={{ color: 'rgba(199,210,254,0.55)' }}>座右の銘</span>
                <span style={{ fontSize: 11, color: 'rgba(199,210,254,0.35)', fontWeight: 700 }}>
                  {mottoLen}/20
                </span>
              </div>
              <input
                value={motto}
                maxLength={20}
                onChange={e => setMotto(e.target.value)}
                placeholder="例）守破離"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '1.5px solid rgba(129,140,248,0.25)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  padding: '10px 12px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* 得意技 */}
            <div>
              <span className="section-title" style={{ color: 'rgba(199,210,254,0.55)' }}>得意技</span>
              <input
                value={favoriteTechnique}
                onChange={e => setFavoriteTechnique(e.target.value)}
                placeholder="例）出小手 / 面 / 返し胴"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '1.5px solid rgba(129,140,248,0.25)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  padding: '10px 12px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: 12, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, fontSize: '0.85rem', color: '#b91c1c' }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="btn-ai"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            title="保存"
          >
            {saving ? (
              <>
                <Loader2 style={{ width: 16, height: 16, animation: 'spin .8s linear infinite' }} />
                保存中...
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </>
            ) : (
              <>
                <Save style={{ width: 16, height: 16 }} />
                保存してホームへ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

