// src/components/charts/MatchupScroll.tsx
'use client';

import { useEffect } from 'react';
import { X, Swords, Shield, Sparkles, UserRound, BookOpen } from 'lucide-react';
import type { MatchupMasterEntry, PeerStyleEntry, TechniqueMasterEntry } from '@/types';
import { resolveTechniqueName } from '@/types';

// =====================================================================
// MatchupScroll（剣風書）★ Phase10
// 相性タグをタップしたときに開くグラスモーフィズム調モーダル。
// - 相性関係（あなたの BaseStyle vs TargetStyle）
// - 理由（reason）/ 対策（advice）
// - マッチングされた剣友リスト（peersStyle から TargetStyle に該当する人を抽出）
// - 「この対策を今日の課題にする」ボタン（モック挙動）
// =====================================================================

interface Props {
  open:            boolean;
  onClose:         () => void;
  matchup:         MatchupMasterEntry | null;
  baseStyle:       string;
  peers:           PeerStyleEntry[];
  techniqueMaster: TechniqueMasterEntry[];
}

export default function MatchupScroll({
  open, onClose, matchup, baseStyle, peers, techniqueMaster,
}: Props) {

  // ESC キー / body スクロールロック
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !matchup) return null;

  const isStrong = matchup.matchType === 'S';

  // peersStyle の中から、得意技（technique_id）の subCategory が targetStyle と一致する剣友を抽出
  // ※ peersStyle.favoriteTechnique は技ID（例: "T001"）。subCategory（払い技 等）と JOIN して照合
  const matchedPeers = peers.filter(p => {
    if (!p.favoriteTechnique) return false;
    const tech = techniqueMaster.find(t => t.id === p.favoriteTechnique);
    if (!tech) return false;
    return (
      tech.subCategory === matchup.targetStyle ||
      tech.bodyPart    === matchup.targetStyle ||
      tech.actionType  === matchup.targetStyle ||
      tech.name        === matchup.targetStyle
    );
  });

  // テーマカラー
  const themeColor    = isStrong ? '#34d399' : '#f87171';
  const themeBg       = isStrong ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)';
  const themeBorder   = isStrong ? 'rgba(52,211,153,0.45)' : 'rgba(248,113,113,0.45)';
  const themeAccent   = isStrong ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)';
  const relationLabel = isStrong ? '優位' : '不利';
  const RelIcon       = isStrong ? Swords : Shield;

  function handleAddTask() {
    alert('課題に追加しました（バックエンドAPI連携は今後のフェーズで実装）');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(8,8,24,0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        animation: 'matchupFadeIn 0.18s ease-out',
      }}
    >
      <style>{`
        @keyframes matchupFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes matchupSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 460,
          maxHeight: '85vh', overflowY: 'auto',
          borderRadius: 18,
          background: 'linear-gradient(180deg, rgba(30,27,75,0.92) 0%, rgba(15,14,42,0.96) 100%)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: `1.5px solid ${themeBorder}`,
          boxShadow: `0 0 32px ${themeAccent}, 0 12px 40px rgba(0,0,0,0.6)`,
          padding: '1.25rem 1.1rem 1.1rem',
          animation: 'matchupSlideUp 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          aria-label="閉じる"
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 30, height: 30, borderRadius: 8,
            border: '1px solid rgba(129,140,248,0.2)',
            background: 'rgba(15,14,42,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'rgba(199,210,254,0.6)',
          }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>

        {/* ヘッダー：剣風書タイトル */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <BookOpen style={{ width: 16, height: 16, color: '#a5b4fc' }} />
          <span style={{
            fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.18em',
            color: '#a5b4fc', textTransform: 'uppercase',
          }}>
            剣 風 書
          </span>
        </div>

        {/* 相性関係 */}
        <div style={{
          padding: '0.85rem 0.9rem',
          borderRadius: 12,
          background: themeBg,
          border: `1px solid ${themeBorder}`,
          marginBottom: 14,
          boxShadow: `inset 0 0 18px ${themeAccent}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: themeAccent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <RelIcon style={{ width: 16, height: 16, color: themeColor }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em',
                color: themeColor, marginBottom: 1,
              }}>
                {relationLabel} ・ DEGREE {matchup.degree}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
                fontSize: '0.85rem', fontWeight: 700, color: '#fff',
              }}>
                <span style={{ color: '#a5b4fc' }}>{baseStyle || 'あなた'}</span>
                <span style={{ color: themeColor, fontSize: '0.95rem' }}>
                  {isStrong ? '＞' : '＜'}
                </span>
                <span style={{ color: '#fde68a' }}>{matchup.targetStyle}</span>
              </div>
            </div>
          </div>
          <p style={{
            margin: 0, fontSize: '0.72rem',
            color: 'rgba(199,210,254,0.75)', lineHeight: 1.5,
          }}>
            あなたの「{baseStyle || '剣風'}」は「{matchup.targetStyle}」に対して
            <span style={{ color: themeColor, fontWeight: 800 }}> {isStrong ? '優位' : '不利'} </span>
            な相性です。
          </p>
        </div>

        {/* 理由 */}
        {matchup.reason && (
          <section style={{ marginBottom: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
            }}>
              <Sparkles style={{ width: 12, height: 12, color: '#a5b4fc' }} />
              <span style={{
                fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.14em',
                color: '#a5b4fc',
              }}>
                理 由
              </span>
            </div>
            <p style={{
              margin: 0, fontSize: '0.78rem', lineHeight: 1.6,
              color: 'rgba(199,210,254,0.92)',
              padding: '0.7rem 0.85rem',
              borderRadius: 10,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.15)',
            }}>
              {matchup.reason}
            </p>
          </section>
        )}

        {/* 対策・アドバイス */}
        {matchup.advice && (
          <section style={{ marginBottom: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
            }}>
              <Swords style={{ width: 12, height: 12, color: '#fbbf24' }} />
              <span style={{
                fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.14em',
                color: '#fbbf24',
              }}>
                対 策
              </span>
            </div>
            <p style={{
              margin: 0, fontSize: '0.82rem', lineHeight: 1.6,
              color: '#fde68a', fontWeight: 600,
              padding: '0.75rem 0.9rem',
              borderRadius: 10,
              background: 'rgba(251,191,36,0.07)',
              border: '1px solid rgba(251,191,36,0.25)',
              boxShadow: 'inset 0 0 14px rgba(251,191,36,0.06)',
            }}>
              {matchup.advice}
            </p>
          </section>
        )}

        {/* マッチングされた剣友 */}
        <section style={{ marginBottom: 14 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
          }}>
            <UserRound style={{ width: 12, height: 12, color: '#a5b4fc' }} />
            <span style={{
              fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.14em',
              color: '#a5b4fc',
            }}>
              この剣風の門下生
            </span>
          </div>

          {matchedPeers.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {matchedPeers.map(p => {
                const techName = resolveTechniqueName(p.favoriteTechnique, techniqueMaster);
                return (
                  <div
                    key={p.userId}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px',
                      borderRadius: 999,
                      background: 'rgba(99,102,241,0.1)',
                      border: '1px solid rgba(129,140,248,0.3)',
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(129,140,248,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.6rem', fontWeight: 800, color: '#c7d2fe',
                    }}>
                      {p.name.slice(0, 1)}
                    </span>
                    <span style={{
                      fontSize: '0.74rem', fontWeight: 700, color: '#c7d2fe',
                    }}>
                      {p.name}
                    </span>
                    {techName && (
                      <span style={{
                        fontSize: '0.58rem', fontWeight: 700, color: 'rgba(167,139,250,0.7)',
                      }}>
                        ／{techName}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{
              margin: 0, fontSize: '0.72rem',
              color: 'rgba(99,102,241,0.45)',
              padding: '0.6rem 0.8rem',
              borderRadius: 10,
              background: 'rgba(99,102,241,0.04)',
              border: '1px dashed rgba(99,102,241,0.2)',
            }}>
              現在、この剣風を得意とする門下生はいません
            </p>
          )}
        </section>

        {/* 「課題に追加」ボタン */}
        {matchup.advice && (
          <button
            onClick={handleAddTask}
            style={{
              width: '100%', padding: '0.75rem',
              borderRadius: 12,
              border: '1.5px solid rgba(251,191,36,0.5)',
              background: 'linear-gradient(180deg, rgba(251,191,36,0.18), rgba(245,158,11,0.12))',
              color: '#fde68a',
              fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.06em',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: '0 0 16px rgba(251,191,36,0.18)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 24px rgba(251,191,36,0.32)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 0 16px rgba(251,191,36,0.18)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Sparkles style={{ width: 14, height: 14 }} />
            この対策を課題に設定する
          </button>
        )}
      </div>
    </div>
  );
}
