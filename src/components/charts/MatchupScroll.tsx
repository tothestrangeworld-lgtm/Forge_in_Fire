// src/components/MatchupScroll.tsx
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Swords, Shield, Sparkles, UserRound, BookOpen, AlertTriangle } from 'lucide-react';
import type { MatchupMasterEntry, PeerStyleEntry, TechniqueMasterEntry } from '@/types';
import { resolveTechniqueName } from '@/types';
import { getDegreeTheme } from '@/lib/matchupTheme';

// =====================================================================
// MatchupScroll（剣風書）★ Phase10 / 10.4 / Phase-ex4
//
// 相性タグをタップしたときに開くグラスモーフィズム調モーダル。
// - 相性関係（あなたの BaseStyle vs TargetStyle）
// - 理由（reason）/ 対策（advice）
// - マッチングされた剣友リスト
//
// ★ Phase-ex4: 剣友マッチングロジックを「topStyles ベース」に刷新
//   - 第一優先: peer.topStyles に matchup.targetStyle が含まれるか
//   - フェイルセーフ: 旧来の favoriteTechnique → technique_master 検索
//   - 剣友タグの右側表示を resolveTechniqueName から
//     「／ {matchup.targetStyle}」のスタイル名直接表示に変更
//
// ★ Phase10.4 継承:
//   - 「優位 / 不利」ラベル右側に Degree 3段階の ★ 評価
//   - 「この対策を今日の課題にする」ボタンと handleAddTask は削除済み
//
// ★ Phase10.3 継承:
//   - createPortal で document.body 直下にテレポートレンダリング
//   - SSR / Hydration 対策として mounted ステートでクライアント描画を保証
//
// ★ Phase10.2 継承:
//   - スクロール構造: コンテナに直接 maxHeight + overflowY を適用
//   - 閉じるボタンを sticky で右上に常駐
//   - 苦手（W）の配色: D2=警告アンバー / D3=真紅ネオン
// =====================================================================

interface Props {
  open:            boolean;
  onClose:         () => void;
  matchup:         MatchupMasterEntry | null;
  baseStyle:       string;
  peers:           PeerStyleEntry[];
  techniqueMaster: TechniqueMasterEntry[];
}

/**
 * Degree から ★ 評価文字列を生成する。
 * - Degree 1: ★・・
 * - Degree 2: ★★・
 * - Degree 3: ★★★
 */
function buildDegreeStars(degree: number): string {
  const d = Math.max(1, Math.min(3, degree || 1));
  const filled = '★'.repeat(d);
  const empty  = '・'.repeat(3 - d);
  return filled + empty;
}

export default function MatchupScroll({
  open, onClose, matchup, baseStyle, peers, techniqueMaster,
}: Props) {

  // SSR / Hydration 対策
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) return null;
  if (!open || !matchup) return null;

  const isStrong = matchup.matchType === 'S';
  const degree   = Math.max(1, Math.min(3, matchup.degree || 1));
  const theme    = getDegreeTheme(matchup.matchType, degree);
  const stars    = buildDegreeStars(degree);

  // ★ Phase-ex4: マッチングロジック刷新
  //   第一優先 → peer.topStyles に matchup.targetStyle が含まれる剣友
  //   フェイルセーフ → 旧来の favoriteTechnique 経由で technique_master の各列と照合
  const matchedPeers = peers.filter(p => {
    // 第一優先: 修練データから集計された topStyles でマッチ判定
    if (p.topStyles && p.topStyles.length > 0) {
      if (p.topStyles.includes(matchup.targetStyle)) return true;
    }

    // フェイルセーフ: 旧来の favoriteTechnique による技マスタ照合
    if (p.favoriteTechnique) {
      const tech = techniqueMaster.find(t => t.id === p.favoriteTechnique);
      if (tech) {
        if (
          tech.subCategory === matchup.targetStyle ||
          tech.bodyPart    === matchup.targetStyle ||
          tech.actionType  === matchup.targetStyle ||
          tech.name        === matchup.targetStyle
        ) {
          return true;
        }
      }
    }

    return false;
  });

  const relationLabel = isStrong ? '優位' : '不利';
  // 苦手の Degree 3 は警告アイコン、それ以外は剣/盾
  const RelIcon = isStrong
    ? Swords
    : (degree === 3 ? AlertTriangle : Shield);

  const modalShadow = theme.glow !== 'none'
    ? `${theme.glow}, 0 12px 40px rgba(0,0,0,0.6)`
    : `0 0 18px ${theme.bg}, 0 12px 40px rgba(0,0,0,0.6)`;

  const modalContent = (
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
        .matchup-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .matchup-scroll-container::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.03);
          border-radius: 3px;
        }
        .matchup-scroll-container::-webkit-scrollbar-thumb {
          background: ${theme.border};
          border-radius: 3px;
        }
        .matchup-scroll-container::-webkit-scrollbar-thumb:hover {
          background: ${theme.primary};
        }
      `}</style>

      <div
        className="matchup-scroll-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 460,
          maxHeight: '85vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          borderRadius: 18,
          background: 'linear-gradient(180deg, rgba(30,27,75,0.94) 0%, rgba(15,14,42,0.97) 100%)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: `${theme.borderW}px solid ${theme.border}`,
          boxShadow: modalShadow,
          animation: 'matchupSlideUp 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
          padding: '1rem 1.3rem 2rem 1.1rem',
          scrollbarWidth: 'thin',
          scrollbarColor: `${theme.border} rgba(255,255,255,0.03)`,
        }}
      >
        {/* sticky ヘッダー */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12,
          paddingBottom: 8,
          background: 'linear-gradient(180deg, rgba(30,27,75,0.95) 0%, rgba(30,27,75,0.85) 70%, rgba(30,27,75,0))',
          marginLeft: -4, marginRight: -4,
          paddingLeft: 4, paddingRight: 4,
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
              border: '1px solid rgba(129,140,248,0.3)',
              background: 'rgba(15,14,42,0.95)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(199,210,254,0.85)',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

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
              {/* ★ Phase10.4: 優位/不利 + ★評価 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2,
              }}>
                <span style={{
                  fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em',
                  color: theme.primary,
                  textShadow: degree === 3 ? `0 0 6px ${theme.primary}` : 'none',
                }}>
                  {relationLabel}
                </span>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700,
                  letterSpacing: '0.18em',
                  color: theme.primary,
                  opacity: 0.95,
                  textShadow: degree >= 2 ? `0 0 4px ${theme.primary}` : 'none',
                }}>
                  {stars}
                </span>
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
                REASON
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
                ADVICE
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
        <section style={{ marginBottom: 8 }}>
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
              {matchedPeers.map(p => (
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
                  {/* ★ Phase-ex4: マッチング根拠となった TargetStyle を直接表示 */}
                  <span style={{
                    fontSize: '0.58rem', fontWeight: 700, color: 'rgba(167,139,250,0.7)',
                  }}>
                    ／{matchup.targetStyle}
                  </span>
                </div>
              ))}
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

        {/*
          ★ Phase10.4: 「この対策を今日の課題にする」ボタンと handleAddTask は削除済み。
          剣風書から直接課題に設定する機能は今後の検討事項として保留。
        */}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
