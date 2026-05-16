'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Users, ChevronRight, Swords, Shield, Star } from 'lucide-react';
import { useRivalsSWR } from '@/lib/api';
import type { Rival } from '@/types'; // 型をインポート

type SortKey = 'ID' | 'LEVEL' | 'MASTERY:面' | 'MASTERY:小手' | 'MASTERY:胴' | 'MASTERY:突き';

export default function RivalsPage() {
  const router = useRouter();
  const { data: rivals = [], error: swrError, isLoading: loading } = useRivalsSWR() as { data: Rival[] | undefined, error: any, isLoading: boolean };
  const [sortKey, setSortKey] = useState<SortKey>('ID');

  const sortedRivals = useMemo(() => {
    return [...rivals].sort((a, b) => {
      if (sortKey === 'ID') return a.user_id.localeCompare(b.user_id);
      if (sortKey === 'LEVEL') return (b.level ?? 0) - (a.level ?? 0);
      const part = sortKey.split(':')[1];
      // アクセス時にインデックスアクセスを許可させるため、型をキャストする
      const pA = (a.masteryStats as Record<string, number>)[part] ?? 0;
      const pB = (b.masteryStats as Record<string, number>)[part] ?? 0;
      return pB - pA;
    });
  }, [rivals, sortKey]);

  const error = swrError && swrError.message !== 'AUTH_REQUIRED' ? '読み込みに失敗しました' : '';

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 80 }}>
      <div style={{ padding: '28px 20px 16px', background: 'linear-gradient(135deg, #0f0c29 0%, #1e1b4b 60%, #312e81 100%)', borderBottom: '1px solid rgba(139,92,246,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Users style={{ width: 22, height: 22, color: '#a78bfa' }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#ede9fe', margin: 0 }}>門下生</h1>
        </div>
        
        {/* ソートプルダウン */}
        <select 
          value={sortKey} 
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          style={{
            width: '100%', background: 'rgba(15,14,42,0.8)', color: '#a78bfa',
            padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.4)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}
        >
          {['ID', 'LEVEL', 'MASTERY:面', 'MASTERY:小手', 'MASTERY:胴', 'MASTERY:突き'].map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 430, margin: '0 auto' }}>
        {loading && <div style={{ textAlign: 'center', color: '#7c6fad' }}>読み込み中…</div>}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedRivals.map((u) => {
            const isMasterySort = sortKey.startsWith('MASTERY:');
            const part = sortKey.split(':')[1];
            const val = isMasterySort ? (u.masteryStats?.[part] ?? 0) : null;

            return (
              <button key={u.user_id} onClick={() => router.push(`/rivals/${u.user_id}`)} style={{
                width: '100%', textAlign: 'left', background: 'rgba(30,27,75,0.6)',
                border: `1px solid ${isMasterySort && val! > 0 ? '#1875BF' : 'rgba(139,92,246,0.2)'}`,
                borderRadius: 14, padding: '14px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #4c1d95, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ede9fe', fontWeight: 700 }}>
                  {u.name.slice(0, 1)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#ede9fe' }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: '#a78bfa' }}>Lv.{u.level}</div>
                </div>
                {isMasterySort && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#818cf8' }}>{sortKey}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1875BF', textShadow: '0 0 8px #1875BF' }}>{val} pt</div>
                  </div>
                )}
                <ChevronRight style={{ width: 18, height: 18, color: '#6d28d9' }} />
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
