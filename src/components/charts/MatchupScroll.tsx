// src/components/MatchupScroll.tsx
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
//
// ★ 修正版:
//   - モーダル内をフレックスレイアウト化（ヘッダー固定 / 本文スクロール）
//   - Degree のテキストドット表記を廃止し、色＋Glowで直感表現
//   - 閉じるボタンを sticky（固定）配置に変更
// =====================================================================

interface Props {
  open:            boolean;
  onClose:         () => void;
  matchup:         MatchupMasterEntry | null;
  baseStyle:       string;
  peers:           PeerStyleEntry[];
  techniqueMaster: TechniqueMasterEntry[];
}

// =====================================================================
// Degree によるカラーパレット（サイバー和風）
//   S(得意): 青〜シアン系 / W(苦手): 赤〜マゼンタ系
//   degree が高いほど 色相が鮮やかに / Glow が強く / ボーダー太く
// =====================================================================
type DegreeTheme = {
  primary:    string;   // メインカラー（テキスト・アイコン）
  bg:         string;   // 背景
  bgInner:    string;   // 内側塗り
  border:     string;   // ボーダー色
  borderW:    number;   // ボーダー太さ
  glow:       string;   // box-shadow
  innerGlow:  string;   // inset box-shadow
};

function getDegreeTheme(matchType: string, degree: number): DegreeTheme {
  const isStrong = matchType === 'S';
  const d        = Math.max(1, Math.min(3, degree || 1));

  if (isStrong) {
    // ── 得意（S）: 青〜シアン系 ──
    if (d === 1) {
      return {
        primary:   '#5eead4',
        bg:        'rgba(20,83,75,0.18)',
        bgInner:   'rgba(45,212,191,0.10)',
        border:    'rgba(45,212,191,0.35)',
        borderW:   1,
        glow:      'none',
        innerGlow: 'inset 0 0 12px rgba(45,212,191,0.06)',
      };
    }
    if (d === 2) {
      return {
        primary:   '#34d399',
        bg:        'rgba(16,185,129,0.18)',
        bgInner:   'rgba(52,211,153,0.16)',
        border:    'rgba(52,211,153,0.6)',
        borderW:   1.5,
        glow:      '0 0 18px rgba(52,211,153,0.32), 0 0 36px rgba(16,185,129,0.16)',
        innerGlow: 'inset 0 0 18px rgba(52,211,153,0.10)',
      };
    }
    // d === 3 ── ネオンシアン（最強）
    return {
      primary:   '#22d3ee',
      bg:        'rgba(8,145,178,0.22)',
      bgInner:   'rgba(34,211,238,0.20)',
      border:    'rgba(34,211,238,0.85)',
      borderW:   2.5,
      glow:      '0 0 24px rgba(34,211,238,0.55), 0 0 48px rgba(34,211,238,0.32), 0 0 72px rgba(34,211,238,0.18)',
      innerGlow: 'inset 0 0 28px rgba(34,211,238,0.20)',
    };
  } else {
    // ── 苦手（W）: 赤〜マゼンタ系 ──
    if (d === 1) {
      return {
        primary:   '#fda4af',
        bg:        'rgba(127,29,29,0.20)',
        bgInner:   'rgba(225,29,72,0.10)',
        border:    'rgba(225,29,72,0.35)',
        borderW:   1,
        glow:      'none',
        innerGlow: 'inset 0 0 12px rgba(225,29,72,0.06)',
      };
    }
    if (d === 2) {
      return {
        primary:   '#f87171',
        bg:        'rgba(220,38,38,0.20)',
        bgInner:   'rgba(248,113,113,0.16)',
        border:    'rgba(248,113,113,0.6)',
        borderW:   1.5,
        glow:      '0 0 18px rgba(248,113,113,0.32), 0 0 36px rgba(220,38,38,0.16)',
        innerGlow: 'inset 0 0 18px rgba(248,113,113,0.10)',
      };
    }
    // d === 3 ── 紅蓮マゼンタ（警告）
    return {
      primary:   '#f0abfc',
      bg:        'rgba(134,25,143,0.24)',
      bgInner:   'rgba(232,121,249,0.20)',
      border:    'rgba(240,171,252,0.85)',
      borderW:   2.5,
      glow:      '0 0 24px rgba(240,171,252,0.55), 0 0 48px rgba(217,70,239,0.36), 0 0 72px rgba(192,38,211,0.20)',
      innerGlow: 'inset 0 0 28px rgba(240,171,252,0.20)',
    };
  }
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
  const degree   = Math.max(1, Math.min(3, matchup.degree || 1));
  const theme    = getDegreeTheme(matchup.matchType, degree);

  // peersStyle の中から、得意技（technique_id）の subCategory が targetStyle と一致する剣友を抽出
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

  const relationLabel = isStrong ? '優位' : '不利';
  const RelIcon       = isStrong ? Swords : Shield;

  // モーダル全体の枠カラー（degree 反映）
  const modalBorder    = theme.border;
  const modalBorderW   = theme.borderW;
  const modalShadow    = theme.glow !== 'none'
    ? `${theme.glow}, 0 12px 40px rgba(0,0,0,0.6)`
    : `0 0 18px ${theme.bg}, 0 12px 40px rgba(0,0,0,0.6)`;

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
        @keyframes matchupPulseBorder {
          0%, 100% { box-shadow: ${modalShadow}; }
          50%      { box-shadow: ${modalShadow.replace(/0\.55/g, '0.75').replace(/0\.32/g, '0.45')}; }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 460,
          // ★ モバイル/PC両対応: dvh を優先しつつ vh をフォールバックに
          maxHeight: 'min(85dvh, 85vh)',
          display: 'flex', flexDirection: 'column',
          borderRadius: 18,
          background: 'linear-gradient(180deg, rgba(30,27,75,0.94) 0%, rgba(15,14,42,0.97) 100%)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: `${modalBorderW}px solid ${modalBorder}`,
          boxShadow: modalShadow,
          animation: degree === 3
            ? 'matchupSlideUp 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), matchupPulseBorder 2.4s ease-in-out infinite'
            : 'matchupSlideUp 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
          overflow: 'hidden',
        }}
      >
        {/* ── 固定ヘッダー（タイトル + 閉じるボタン） ── */}
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1.1rem 0.7rem',
          borderBottom: `1px solid ${theme.border}`,
          background: 'linear-gradient(180deg, rgba(30,27,75,0.5), rgba(30,27,75,0))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen style={{ width: 16, height: 16, color: theme.primary }} />
            <span style={{
              fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.18em',
              color: theme.primary, textTransform: 'uppercase',
              textShadow: degree >= 2 ? `0 0 8px ${theme.primary}` : 'none',
            }}>
              剣 風 書
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid rgba(129,140,248,0.25)',
              background: 'rgba(15,14,42,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(199,210,254,0.75)',
              flexShrink: 0,
            }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* ── スクロール領域（本文） ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          padding: '1rem 1.1rem 2rem',
        }}>

          {/* 相性関係 */}
          <div style={{
            padding: '0.85rem 0.9rem',
            borderRadius: 12,
            background: theme.bg,
            border: `${theme.borderW}px solid ${theme.border}`,
            marginBottom: 14,
            boxShadow: theme.innerGlow,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: theme.bgInner,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: degree >= 2 ? `0 0 10px ${theme.bgInner}` : 'none',
              }}>
                <RelIcon
                  style={{
                    width: 17, height: 17, color: theme.primary,
                    filter: degree === 3 ? `drop-shadow(0 0 6px ${theme.primary})` : 'none',
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em',
                  color: theme.primary, marginBottom: 2,
                  textShadow: degree === 3 ? `0 0 6px ${theme.primary}` : 'none',
                }}>
                  {relationLabel}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
                  fontSize: '0.85rem', fontWeight: 700, color: '#fff',
                }}>
                  <span style={{ color: '#a5b4fc' }}>{baseStyle || 'あなた'}</span>
                  <span style={{
                    color: theme.primary, fontSize: '0.95rem',
                    textShadow: degree >= 2 ? `0 0 8px ${theme.primary}` : 'none',
                  }}>
                    {isStrong ? '＞' : '＜'}
                  </span>
                  <span style={{ color: '#fde68a' }}>{matchup.targetStyle}</span>
                </div>
              </div>
            </div>
            <p style={{
              margin: 0, fontSize: '0.72rem',
              color: 'rgba(199,210,254,0.78)', lineHeight: 1.55,
            }}>
              あなたの「{baseStyle || '剣風'}」は「{matchup.targetStyle}」に対して
              <span style={{
                color: theme.primary, fontWeight: 800,
                textShadow: degree === 3 ? `0 0 6px ${theme.primary}` : 'none',
              }}> {isStrong ? '優位' : '不利'} </span>
              な相性です。
            </p>
          </div>

          {/* 理由 */}
          {matchup.reason && (
            <section style={{ marginBottom: 14 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
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
                margin: 0, fontSize: '0.78rem', lineHeight: 1.65,
                color: 'rgba(199,210,254,0.92)',
                padding: '0.75rem 0.9rem',
                borderRadius: 10,
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.18)',
              }}>
                {matchup.reason}
              </p>
            </section>
          )}

          {/* 対策・アドバイス */}
          {matchup.advice && (
            <section style={{ marginBottom: 14 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
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
                margin: 0, fontSize: '0.82rem', lineHeight: 1.65,
                color: '#fde68a', fontWeight: 600,
                padding: '0.8rem 0.95rem',
                borderRadius: 10,
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.28)',
                boxShadow: 'inset 0 0 14px rgba(251,191,36,0.06)',
              }}>
                {matchup.advice}
              </p>
            </section>
          )}

          {/* マッチングされた剣友 */}
          <section style={{ marginBottom: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7,
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
                padding: '0.65rem 0.85rem',
                borderRadius: 10,
                background: 'rgba(99,102,241,0.04)',
                border: '1px dashed rgba(99,102,241,0.22)',
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
                width: '100%', padding: '0.8rem',
                borderRadius: 12,
                border: '1.5px solid rgba(251,191,36,0.55)',
                background: 'linear-gradient(180deg, rgba(251,191,36,0.20), rgba(245,158,11,0.14))',
                color: '#fde68a',
                fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.06em',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: '0 0 16px rgba(251,191,36,0.20)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 0 26px rgba(251,191,36,0.35)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 0 16px rgba(251,191,36,0.20)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Sparkles style={{ width: 14, height: 14 }} />
              この対策を課題に設定する
            </button>
          )}
        </div>
        {/* ── /スクロール領域 ── */}
      </div>
    </div>
  );
}
