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
    // 既にログイン済みならホームへ
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
      router.replace('/');
    } catch {
      setError('パスコードが正しくありません');
    } finally {
      setSub(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleLogin();
  }

  const selectedUser = users.find(u => u.user_id === selectedId);

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg,#07071a 0%,#1e1b4b 60%,#0d0b2a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* タイトルロゴ */}
        <div style={{ textAlign:'center', marginBottom:'2.5rem' }}>
          <div style={{
            width:72, height:72, borderRadius:'50%',
            background:'linear-gradient(135deg,#312e81,#4f46e5)',
            border:'2px solid #818cf8',
            display:'flex', alignItems:'center', justifyContent:'center',
            margin:'0 auto 1rem',
            boxShadow:'0 0 40px rgba(99,102,241,0.5)',
            fontSize:'2rem',
          }}>
            ⚔️
          </div>
          <h1 style={{ fontSize:'2rem', fontWeight:800, color:'#fff', margin:'0 0 4px', letterSpacing:'-0.02em' }}>
            百錬自得
          </h1>
          <p style={{ fontSize:'0.75rem', color:'rgba(199,210,254,0.5)', margin:0, letterSpacing:'0.1em' }}>
            HYAKUREN JITOKU
          </p>
        </div>

        {/* ログインカード */}
        <div style={{
          background:'rgba(255,255,255,0.04)',
          border:'1px solid rgba(129,140,248,0.25)',
          borderRadius:20,
          padding:'1.75rem',
          backdropFilter:'blur(12px)',
          boxShadow:'0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <h2 style={{ fontSize:'1.1rem', fontWeight:700, color:'#c7d2fe', margin:'0 0 1.5rem', textAlign:'center', letterSpacing:'0.05em' }}>
            道場へ入門
          </h2>

          {loading ? (
            <div style={{ textAlign:'center', padding:'2rem 0', color:'#6366f1' }}>
              <Loader2 style={{ width:28, height:28, animation:'spin .8s linear infinite', margin:'0 auto' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : (
            <>
              {/* ユーザー選択 */}
              <div style={{ marginBottom:'1rem' }}>
                <label style={{ fontSize:'0.7rem', fontWeight:700, color:'#a5b4fc', letterSpacing:'0.1em', display:'block', marginBottom:6 }}>
                  門弟を選べ
                </label>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {users.map(u => (
                    <button
                      key={u.user_id}
                      onClick={() => setSelected(u.user_id)}
                      style={{
                        padding:'0.75rem 1rem',
                        borderRadius:12,
                        border:`2px solid ${selectedId === u.user_id ? '#6366f1' : 'rgba(129,140,248,0.2)'}`,
                        background: selectedId === u.user_id
                          ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                        color: selectedId === u.user_id ? '#c7d2fe' : '#94a3b8',
                        fontFamily:'inherit', fontWeight: selectedId === u.user_id ? 700 : 500,
                        fontSize:'0.9rem', cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        transition:'all .15s',
                        boxShadow: selectedId === u.user_id ? '0 0 12px rgba(99,102,241,0.3)' : 'none',
                      }}
                    >
                      <span>{u.name}</span>
                      <span style={{ fontSize:'0.65rem', color: selectedId === u.user_id ? '#818cf8' : '#475569' }}>
                        {u.role === 'admin' ? '師範' : '門弟'} · {u.user_id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* パスコード入力 */}
              <div style={{ marginBottom:'1.5rem' }}>
                <label style={{ fontSize:'0.7rem', fontWeight:700, color:'#a5b4fc', letterSpacing:'0.1em', display:'block', marginBottom:6 }}>
                  印（パスコード）
                </label>
                <div style={{ position:'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="パスコードを入力"
                    maxLength={8}
                    style={{
                      width:'100%', padding:'0.8rem 2.8rem 0.8rem 1rem',
                      borderRadius:12,
                      border:`1.5px solid ${error ? '#f87171' : 'rgba(129,140,248,0.3)'}`,
                      background:'rgba(255,255,255,0.05)',
                      color:'#fff', fontSize:'1rem',
                      fontFamily:'inherit', boxSizing:'border-box',
                      outline:'none',
                      letterSpacing: showPw ? '0.05em' : '0.3em',
                    }}
                    autoComplete="off"
                  />
                  <button
                    onClick={() => setShowPw(v => !v)}
                    style={{
                      position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                      background:'none', border:'none', cursor:'pointer',
                      color:'#6366f1', padding:4,
                    }}
                  >
                    {showPw
                      ? <EyeOff style={{ width:16, height:16 }} />
                      : <Eye    style={{ width:16, height:16 }} />}
                  </button>
                </div>
              </div>

              {/* エラー */}
              {error && (
                <div style={{
                  marginBottom:'1rem', padding:'0.6rem 0.9rem',
                  background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.4)',
                  borderRadius:10, fontSize:'0.8rem', color:'#fca5a5', textAlign:'center',
                }}>
                  {error}
                </div>
              )}

              {/* ログインボタン */}
              <button
                onClick={handleLogin}
                disabled={submitting || !selectedId || !password}
                style={{
                  width:'100%', padding:'0.9rem',
                  borderRadius:12, border:'none',
                  background: submitting || !password
                    ? 'rgba(99,102,241,0.3)'
                    : 'linear-gradient(135deg,#4338ca,#6366f1)',
                  color: password ? '#fff' : 'rgba(199,210,254,0.4)',
                  fontSize:'0.95rem', fontWeight:800, fontFamily:'inherit',
                  cursor: submitting || !password ? 'not-allowed' : 'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  transition:'all .15s',
                  boxShadow: password ? '0 4px 20px rgba(99,102,241,0.4)' : 'none',
                  letterSpacing:'0.05em',
                }}
              >
                {submitting
                  ? <><Loader2 style={{ width:18, height:18, animation:'spin .8s linear infinite' }} />入門中...</>
                  : <><LogIn   style={{ width:18, height:18 }} />道場に入る</>}
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </button>
            </>
          )}
        </div>

        {/* 選択ユーザー表示 */}
        {selectedUser && !loading && (
          <p style={{ textAlign:'center', marginTop:'1rem', fontSize:'0.7rem', color:'rgba(199,210,254,0.3)' }}>
            {selectedUser.name} として入門します
          </p>
        )}

      </div>
    </div>
  );
}
