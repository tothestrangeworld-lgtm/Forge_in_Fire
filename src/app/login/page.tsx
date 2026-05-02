'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn, Eye, EyeOff } from 'lucide-react';
import { loginUser, fetchUsers } from '@/lib/api';
import { setAuthUser, isLoggedIn } from '@/lib/auth';

interface UserItem { user_id: string; name: string; role: string; }

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers]         = useState<UserItem[]>([]);
  const [selectedId, setSelected] = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSub]      = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn()) { router.replace('/'); return; }

    fetchUsers()
      .then(data => {
        setUsers(data);
        if (data.length > 0) setSelected(data[0].user_id);
      })
      .catch(() => setError('ユーザー情報の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogin() {
    if (!selectedId || !password) {
      setError('ユーザーとパスコードを入力してください');
      return;
    }
    setSub(true); setError(null);
    try {
      const user = await loginUser({ user_id: selectedId, password });
      setAuthUser(user);
      // router.replace だとNext.jsのキャッシュが残りログアウト後に再ログインできないケースがあるため
      // window.location.href でハードナビゲーションを使用する
      window.location.href = '/';
    } catch {
      setError('パスコードが正しくありません');
    } finally {
      setSub(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await handleLogin();
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
          70%  { box-shadow: 0 0 0 10px rgba(99,102,241,0); }
          100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
        }
        .login-card { animation: fadeUp .45s cubic-bezier(.22,1,.36,1) both; }
        .login-logo { animation: fadeUp .4s .05s cubic-bezier(.22,1,.36,1) both; }

        .user-select {
          appearance: none;
          -webkit-appearance: none;
          width: 100%;
          padding: 0.75rem 2.5rem 0.75rem 1rem;
          border-radius: 12px;
          border: 1.5px solid rgba(129,140,248,0.3);
          background-color: #0d0b2a;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236366f1' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.9rem center;
          color: #c7d2fe;
          font-size: 0.9rem;
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
          transition: border-color .15s, box-shadow .15s;
          outline: none;
          touch-action: manipulation;
        }
        .user-select:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.25);
        }
        .user-select option {
          background-color: #0d0b2a;
          color: #c7d2fe;
        }

        .pw-input {
          width: 100%;
          padding: 0.8rem 2.8rem 0.8rem 1rem;
          border-radius: 12px;
          background: rgba(255,255,255,0.05);
          color: #fff;
          font-size: 1rem;
          font-family: inherit;
          box-sizing: border-box;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
          /* iOS PWA でキーボードを確実に起動させるために必要 */
          touch-action: manipulation;
          -webkit-user-select: text;
          user-select: text;
        }
        .pw-input:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.25);
        }

        .login-btn:not(:disabled):hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(99,102,241,0.5) !important;
        }
        .login-btn:not(:disabled):active {
          transform: translateY(0);
        }
        .login-btn:not(:disabled) {
          animation: pulse-ring 2.5s ease-out infinite;
        }
      `}</style>

      {/*
        外側コンテナ:
        - position: relative + overflow: hidden で内側の absolute 装飾を正しくクリップ
        - overflowY: auto + WebkitOverflowScrolling: touch で iOS PWA のタッチ応答を確保
      */}
      <div style={{
        position: 'relative',
        minHeight: '100dvh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: 'linear-gradient(160deg,#07071a 0%,#1e1b4b 60%,#0d0b2a 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
      } as React.CSSProperties}>

        {/*
          グリッドオーバーレイ: fixed → absolute に変更。
          iOS PWA では position:fixed の要素が pointer-events:none でも
          タッチイベントに干渉するケースがあるため absolute で代替する。
        */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
        }} />

        <div style={{ width: '100%', maxWidth: 360, position: 'relative', zIndex: 1 }}>

          {/* ロゴエリア */}
          <div className="login-logo" style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '22%',
              border: '2px solid rgba(129,140,248,0.6)',
              margin: '0 auto 1.1rem',
              boxShadow: '0 0 48px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}>
              <img
                src="/icons/icon-192x192.png?v=3"
                alt="百錬自得アイコン"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <h1 style={{
              fontSize: '2rem', fontWeight: 800, color: '#fff',
              margin: '0 0 4px', letterSpacing: '-0.02em',
            }}>
              百錬自得
            </h1>
            <p style={{
              fontSize: '0.65rem', color: 'rgba(129,140,248,0.45)',
              margin: 0, letterSpacing: '0.22em', fontWeight: 600,
            }}>
              HYAKUREN JITOKU
            </p>
          </div>

          {/* ログインカード */}
          {/*
            backdropFilter を削除。
            iOS では backdropFilter が compositing layer を生成し、
            その内部の input 要素がソフトキーボードを起動できなくなる既知の問題がある。
            代替として background の不透明度を上げて視覚的な差異を最小化する。
          */}
          <div className="login-card" style={{
            background: 'rgba(13,11,42,0.82)',
            border: '1px solid rgba(129,140,248,0.2)',
            borderRadius: 20,
            padding: '2rem 1.75rem',
            boxShadow: '0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#6366f1' }}>
                <Loader2 style={{ width: 28, height: 28, animation: 'spin .8s linear infinite', margin: '0 auto' }} />
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>

                {/* ユーザー選択（プルダウン） */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{
                    display: 'block', marginBottom: 7,
                    fontSize: '0.65rem', fontWeight: 800,
                    color: 'rgba(129,140,248,0.7)',
                    letterSpacing: '0.2em',
                  }}>
                    USER
                  </label>
                  <select
                    className="user-select"
                    value={selectedId}
                    onChange={e => setSelected(e.target.value)}
                  >
                    {users.map(u => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* パスコード */}
                <div style={{ marginBottom: '1.75rem' }}>
                  <label style={{
                    display: 'block', marginBottom: 7,
                    fontSize: '0.65rem', fontWeight: 800,
                    color: 'rgba(129,140,248,0.7)',
                    letterSpacing: '0.2em',
                  }}>
                    PASSCODE
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="pw-input"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      maxLength={8}
                      autoComplete="current-password"
                      style={{
                        border: `1.5px solid ${error ? 'rgba(248,113,113,0.6)' : 'rgba(129,140,248,0.3)'}`,
                        letterSpacing: showPw ? '0.05em' : '0.3em',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      style={{
                        position: 'absolute', right: 10, top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'rgba(99,102,241,0.7)', padding: 4,
                        display: 'flex', alignItems: 'center',
                        touchAction: 'manipulation',
                      }}
                    >
                      {showPw
                        ? <EyeOff style={{ width: 15, height: 15 }} />
                        : <Eye    style={{ width: 15, height: 15 }} />}
                    </button>
                  </div>
                </div>

                {/* エラー */}
                {error && (
                  <div style={{
                    marginBottom: '1.25rem', padding: '0.6rem 0.9rem',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.35)',
                    borderRadius: 10, fontSize: '0.78rem',
                    color: '#fca5a5', textAlign: 'center',
                    letterSpacing: '0.02em',
                  }}>
                    {error}
                  </div>
                )}

                {/* ログインボタン */}
                <button
                  type="submit"
                  className="login-btn"
                  disabled={submitting || !selectedId || !password}
                  style={{
                    width: '100%', padding: '0.9rem',
                    borderRadius: 12, border: 'none',
                    background: submitting || !password
                      ? 'rgba(99,102,241,0.25)'
                      : 'linear-gradient(135deg,#4338ca 0%,#6366f1 100%)',
                    color: password ? '#fff' : 'rgba(199,210,254,0.35)',
                    fontSize: '0.8rem', fontWeight: 800,
                    fontFamily: 'inherit',
                    cursor: submitting || !password ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8,
                    transition: 'all .2s cubic-bezier(.22,1,.36,1)',
                    boxShadow: password ? '0 4px 20px rgba(99,102,241,0.35)' : 'none',
                    letterSpacing: '0.18em',
                    touchAction: 'manipulation',
                  }}
                >
                  {submitting
                    ? <><Loader2 style={{ width: 16, height: 16, animation: 'spin .8s linear infinite' }} />LOADING...</>
                    : <><LogIn   style={{ width: 16, height: 16 }} />LOGIN</>}
                </button>

              </form>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
