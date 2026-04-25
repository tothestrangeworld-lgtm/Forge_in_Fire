'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import type { TechniqueMasterEntry } from '@/types';
import { fetchDashboard, updateProfile } from '@/lib/api';

// =====================================================================
// プロフィール設定画面
// ★ Phase4 / 改修2:
//   - favorite_technique をテキスト入力 → ドロップダウン選択（技ID）に変更
//   - techniqueMaster（getDashboard レスポンス）を利用
// =====================================================================

const RANK_OPTIONS = ['無段', '初段', '弐段', '参段', '四段', '五段', '六段', '七段', '八段'] as const;
type RankOption = (typeof RANK_OPTIONS)[number];

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // フォーム値
  const [realRank, setRealRank]                 = useState<RankOption>('無段');
  const [motto, setMotto]                       = useState('');
  const [favTechId, setFavTechId]               = useState('');   // 技ID（例: "T001"）
  const [techniqueMaster, setTechniqueMaster]   = useState<TechniqueMasterEntry[]>([]);

  useEffect(() => {
    fetchDashboard()
      .then(d => {
        // リアル段位
        const seededRank =
          d.status.real_rank && (RANK_OPTIONS as readonly string[]).includes(d.status.real_rank)
            ? (d.status.real_rank as RankOption)
            : '無段';
        setRealRank(seededRank);

        // 座右の銘
        setMotto(d.status.motto ?? '');

        // 得意技ID
        setFavTechId(d.status.favorite_technique ?? '');

        // technique_master
        setTechniqueMaster(d.techniqueMaster ?? []);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
        setError(e instanceof Error ? e.message : '読み込みに失敗しました');
      })
      .finally(() => setLoading(false));
  }, []);

  const mottoLen = useMemo(() => motto.length, [motto]);

  // technique_master を actionType > subCategory > name の順でグループ化
  const groupedTechs = useMemo(() => {
    const map: Record<string, TechniqueMasterEntry[]> = {};
    techniqueMaster.forEach(t => {
      const group = t.actionType || '未分類';
      if (!map[group]) map[group] = [];
      map[group].push(t);
    });
    return map;
  }, [techniqueMaster]);

  // 現在選択中の技名
  const selectedTechName = useMemo(() => {
    if (!favTechId) return '';
    const found = techniqueMaster.find(t => t.id === favTechId);
    return found ? found.name : favTechId;
  }, [favTechId, techniqueMaster]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        real_rank:          realRank === '無段' ? '' : realRank,
        motto,
        favorite_technique: favTechId,
      });
      router.push('/');
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  // 共通セレクトスタイル
  const selectStyle: React.CSSProperties = {
    width: '100%',
    borderRadius: 12,
    border: '1.5px solid rgba(129,140,248,0.25)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e0e7ff',
    padding: '10px 12px',
    outline: 'none',
    fontFamily: 'inherit',
    fontSize: '0.85rem',
    colorScheme: 'dark',
  };

  const inputStyle: React.CSSProperties = {
    ...selectStyle,
  };

  return (
    <div className="animate-fade-up" style={{ padding: '1.5rem 1rem 0' }}>

      {/* ヘッダー */}
      <header style={{ marginBottom: '1rem' }}>
        <span className="section-title">設定</span>
        <h1 style={{
          fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #e0e7ff, #a78bfa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          剣士録（プロフィール設定）
        </h1>
      </header>

      <div
        className="hud-card"
        style={{ marginBottom: '0.75rem' }}
      >
        <p style={{ margin: '0 0 14px', fontSize: '0.8rem', fontWeight: 700, color: 'rgba(129,140,248,0.5)', lineHeight: 1.5 }}>
          段位に応じて獲得XPに倍率がかかります。得意技は技盤で黄金色にハイライト表示されます。
        </p>

        {loading ? (
          /* スケルトン */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[44, 44, 80].map((h, i) => (
              <div key={i} style={{ height: h, borderRadius: 12, background: 'rgba(99,102,241,0.06)' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── リアル段位 ── */}
            <div>
              <span className="section-title">リアル段位</span>
              <select
                value={realRank}
                onChange={e => setRealRank(e.target.value as RankOption)}
                style={selectStyle}
              >
                {RANK_OPTIONS.map(r => (
                  <option key={r} value={r} style={{ background: '#0f0e2a', color: '#e0e7ff' }}>
                    {r}
                  </option>
                ))}
              </select>
              {/* 倍率プレビュー */}
              <p style={{ margin: '4px 0 0', fontSize: '0.68rem', color: 'rgba(129,140,248,0.45)', paddingLeft: 4 }}>
                {(() => {
                  const MULTI: Record<string, number> = {
                    '初段':1.2, '弐段':1.5, '参段':1.8, '四段':2.2, '五段':2.7, '六段':3.4, '七段':4.2, '八段':5.0,
                  };
                  const m = MULTI[realRank] ?? 1.0;
                  return `XP倍率: ×${m.toFixed(1)}`;
                })()}
              </p>
            </div>

            {/* ── 座右の銘 ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span className="section-title">座右の銘</span>
                <span style={{ fontSize: 11, color: 'rgba(99,102,241,0.35)', fontWeight: 700 }}>
                  {mottoLen}/20
                </span>
              </div>
              <input
                value={motto}
                maxLength={20}
                onChange={e => setMotto(e.target.value)}
                placeholder="例）守破離"
                style={inputStyle}
              />
            </div>

            {/* ── 得意技（ドロップダウン）★ UPDATED ── */}
            <div>
              <span className="section-title">得意技</span>

              {techniqueMaster.length === 0 ? (
                /* マスタがない場合はテキスト入力にフォールバック */
                <input
                  value={favTechId}
                  onChange={e => setFavTechId(e.target.value)}
                  placeholder="technique_master データがありません"
                  style={inputStyle}
                />
              ) : (
                <select
                  value={favTechId}
                  onChange={e => setFavTechId(e.target.value)}
                  style={selectStyle}
                >
                  <option value="" style={{ background: '#0f0e2a', color: 'rgba(99,102,241,0.4)' }}>
                    ── 選択してください ──
                  </option>
                  {Object.entries(groupedTechs).map(([actionType, techs]) => (
                    <optgroup
                      key={actionType}
                      label={actionType}
                      style={{ background: '#0f0e2a', color: 'rgba(129,140,248,0.7)' }}
                    >
                      {techs.map(t => (
                        <option
                          key={t.id}
                          value={t.id}
                          style={{ background: '#0f0e2a', color: '#e0e7ff' }}
                        >
                          {t.name}
                          {t.subCategory ? `（${t.subCategory}）` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}

              {/* 選択中の技プレビュー */}
              {favTechId && selectedTechName && (
                <div style={{
                  marginTop: 8,
                  padding: '7px 12px',
                  borderRadius: 10,
                  background: 'rgba(120,53,15,0.2)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 13, filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.7))' }}>★</span>
                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(251,191,36,0.6)', letterSpacing: '0.08em' }}>
                      シグネチャームーブ
                    </span>
                    <br />
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fde68a' }}>
                      {selectedTechName}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(251,191,36,0.4)', marginLeft: 6 }}>
                      {favTechId}
                    </span>
                  </div>
                </div>
              )}

              <p style={{ margin: '5px 0 0', fontSize: '0.65rem', color: 'rgba(99,102,241,0.35)', paddingLeft: 4 }}>
                スキルグリッドで黄金色に発光表示されます
              </p>
            </div>

          </div>
        )}

        {/* エラー */}
        {error && (
          <div style={{
            marginTop: 12, padding: 12,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 12,
            fontSize: '0.85rem', color: '#f87171',
          }}>
            {error}
          </div>
        )}

        {/* 保存ボタン */}
        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="btn-ai"
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
