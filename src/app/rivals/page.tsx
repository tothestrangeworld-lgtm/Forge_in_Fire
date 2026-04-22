// src/app/rivals/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, ChevronRight, Swords, Shield } from 'lucide-react';
import { fetchUsers } from '@/lib/api';
import { getCurrentUserId } from '@/lib/auth';

type UserEntry = { user_id: string; name: string; role: string };

export default function RivalsPage() {
  const router = useRouter();
  const [users, setUsers]   = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    fetchUsers()
      .then(all => {
        const myId = getCurrentUserId();
        setUsers(all.filter(u => u.user_id !== myId));
      })
      .catch(err => {
        if (err.message !== 'AUTH_REQUIRED') setError('読み込みに失敗しました');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 80 }}>
      {/* ヘッダー */}
      <div style={{
        padding: '28px 20px 16px',
        background: 'linear-gradient(135deg, #0f0c29 0%, #1e1b4b 60%, #312e81 100%)',
        borderBottom: '1px solid rgba(139,92,246,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Users style={{ width: 22, height: 22, color: '#a78bfa' }} />
          <h1 style={{
            fontSize: 20, fontWeight: 800, letterSpacing: '0.08em',
            color: '#ede9fe', margin: 0,
          }}>
            門下生
          </h1>
        </div>
        <p style={{ fontSize: 12, color: '#7c6fad', margin: 0, letterSpacing: '0.05em' }}>
          切磋琢磨 — 仲間の稽古を覗いてみよう
        </p>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 430, margin: '0 auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '3px solid #312e81',
              borderTopColor: '#a78bfa',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }} />
            <p style={{ color: '#7c6fad', fontSize: 13 }}>読み込み中…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12, padding: '16px 18px', color: '#fca5a5', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {!loading && !error && users.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7c6fad' }}>
            <Swords style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ fontSize: 14 }}>まだ仲間がいません</p>
          </div>
        )}

        {!loading && users.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {users.map((u, i) => (
              <button
                key={u.user_id}
                onClick={() => router.push(`/rivals/${u.user_id}`)}
                style={{
                  width: '100%', textAlign: 'left',
                  background: 'rgba(30,27,75,0.6)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 14,
                  transition: 'background 0.15s, border-color 0.15s',
                  animation: `fadeUp 0.3s ease ${i * 0.06}s both`,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(49,46,129,0.7)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.5)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(30,27,75,0.6)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.2)';
                }}
              >
                {/* アバター */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #4c1d95, #6d28d9)',
                  border: '2px solid rgba(167,139,250,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#ede9fe' }}>
                    {u.name.slice(0, 1)}
                  </span>
                </div>

                {/* ユーザー情報 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 15, fontWeight: 700,
                      color: '#ede9fe', letterSpacing: '0.04em',
                    }}>
                      {u.name}
                    </span>
                    {u.role === 'admin' && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                        background: 'rgba(251,191,36,0.15)',
                        border: '1px solid rgba(251,191,36,0.35)',
                        color: '#fbbf24', borderRadius: 4, padding: '1px 5px',
                      }}>
                        師範
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Shield style={{ width: 11, height: 11, color: '#6d28d9' }} />
                    <span style={{ fontSize: 11, color: '#7c6fad', letterSpacing: '0.03em' }}>
                      {u.user_id}
                    </span>
                  </div>
                </div>

                <ChevronRight style={{ width: 18, height: 18, color: '#6d28d9', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}