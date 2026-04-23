'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import type { UserTask } from '@/types';
import { fetchDashboard, updateTasks } from '@/lib/api';

const INPUT_COUNT = 5 as const;

export default function TaskSettingsPage() {
  const router = useRouter();
  const [values, setValues] = useState<string[]>(Array.from({ length: INPUT_COUNT }, () => ''));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(d => {
        const active = (d.tasks ?? []).filter((t: UserTask) => t.status === 'active').map(t => t.task_text);
        const seeded = Array.from({ length: INPUT_COUNT }, (_, i) => active[i] ?? '');
        setValues(seeded);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
        setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      })
      .finally(() => setLoading(false));
  }, []);

  const nonEmptyCount = useMemo(
    () => values.map(v => v.trim()).filter(Boolean).length,
    [values],
  );

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateTasks(values);
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
          評価項目の設定
        </h1>
      </header>

      <div className="wa-card" style={{
        marginBottom: '0.75rem',
        background: 'linear-gradient(135deg, rgba(13,11,42,0.92), rgba(30,27,75,0.82))',
        border: '1px solid rgba(139,92,246,0.25)',
      }}>
        <p style={{ margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 700, color: 'rgba(199,210,254,0.55)' }}>
          稽古記録（/record）で毎日 1〜5 評価する項目です（最大 {INPUT_COUNT} 件）。
        </p>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: INPUT_COUNT }).map((_, i) => (
              <div key={i} style={{ height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {values.map((v, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 10,
                  background: 'rgba(129,140,248,0.12)',
                  border: '1px solid rgba(129,140,248,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(199,210,254,0.55)',
                  fontWeight: 900,
                  flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <input
                  value={v}
                  onChange={e => setValues(prev => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                  placeholder="例）打突後の残心"
                  style={{
                    flex: 1,
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
            ))}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: 12, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, fontSize: '0.85rem', color: '#b91c1c' }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(199,210,254,0.4)' }}>
            現在の入力: <span style={{ fontWeight: 900, color: 'rgba(226,232,240,0.9)' }}>{nonEmptyCount}</span> / {INPUT_COUNT}
          </p>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="btn-ai"
            style={{ width: 'auto', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 8 }}
            title="まとめて保存"
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
                まとめて保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

