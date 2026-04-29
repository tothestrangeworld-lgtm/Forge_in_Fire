'use client';

// =====================================================================
// 百錬自得 - 実績庫ページ（src/app/achievements/page.tsx）
// ★ Phase6 Step2: アチーブメントUI
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Flame,
  Trophy,
  Target,
  Swords,
  Shield,
  Star,
  Zap,
  Crown,
  Medal,
  Award,
  Footprints,
  Milestone,
  ChevronLeft,
  X,
  Lock,
  Unlock,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { fetchAchievements } from '@/lib/api';
import type { Achievement } from '@/types';

// =====================================================================
// iconType → Lucide アイコン マッピング
// =====================================================================
const ICON_MAP: Record<string, LucideIcon> = {
  flame:       Flame,
  trophy:      Trophy,
  target:      Target,
  swords:      Swords,
  shield:      Shield,
  star:        Star,
  zap:         Zap,
  crown:       Crown,
  medal:       Medal,
  award:       Award,
  footprints:  Footprints,
  milestone:   Milestone,
  first_step:  Footprints,
  streak:      Flame,
  legendary:   Crown,
  sparkles:    Sparkles,
};

function getIcon(iconType: string): LucideIcon {
  return ICON_MAP[iconType.toLowerCase()] ?? Award;
}

// =====================================================================
// アイコンタイプ別ネオンカラー
// =====================================================================
const ICON_COLORS: Record<string, { glow: string; fg: string; bg: string }> = {
  flame:      { glow: '#ff6b35', fg: '#ff8c5a', bg: 'rgba(255,107,53,0.12)' },
  streak:     { glow: '#ff6b35', fg: '#ff8c5a', bg: 'rgba(255,107,53,0.12)' },
  first_step: { glow: '#00d4ff', fg: '#33dfff', bg: 'rgba(0,212,255,0.10)' },
  milestone:  { glow: '#b088f9', fg: '#c9a8fc', bg: 'rgba(176,136,249,0.12)' },
  legendary:  { glow: '#ffd700', fg: '#ffe44d', bg: 'rgba(255,215,0,0.12)' },
  trophy:     { glow: '#ffd700', fg: '#ffe44d', bg: 'rgba(255,215,0,0.12)' },
  crown:      { glow: '#ffd700', fg: '#ffe44d', bg: 'rgba(255,215,0,0.12)' },
  default:    { glow: '#00ff88', fg: '#33ffaa', bg: 'rgba(0,255,136,0.10)' },
};

function getColors(iconType: string) {
  return ICON_COLORS[iconType.toLowerCase()] ?? ICON_COLORS.default;
}

// =====================================================================
// スケルトンカード
// =====================================================================
function SkeletonCard() {
  return (
    <div style={{
      background: 'rgba(15,15,30,0.7)',
      border: '1px solid rgba(100,100,160,0.25)',
      borderRadius: '12px',
      padding: '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
      animation: 'skeletonPulse 1.6s ease-in-out infinite',
    }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(100,100,160,0.2)' }} />
      <div style={{ width: '70%', height: 14, borderRadius: 4, background: 'rgba(100,100,160,0.2)' }} />
      <div style={{ width: '50%', height: 10, borderRadius: 4, background: 'rgba(100,100,160,0.15)' }} />
    </div>
  );
}

// =====================================================================
// モーダル
// =====================================================================
interface ModalProps {
  achievement: Achievement;
  onClose: () => void;
}

function AchievementModal({ achievement, onClose }: ModalProps) {
  const isUnlocked = achievement.isUnlocked;
  const IconComp   = getIcon(achievement.iconType);
  const colors     = getColors(achievement.iconType);

  // モーダル外クリックで閉じる
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const formattedDate = achievement.unlockedAt
    ? achievement.unlockedAt.slice(0, 10).replace(/-/g, '/')
    : null;

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        padding: '20px',
        animation: 'fadeIn 0.18s ease',
      }}
    >
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 380,
        background: 'linear-gradient(145deg, rgba(12,12,28,0.98), rgba(20,10,40,0.98))',
        border: isUnlocked
          ? `1px solid ${colors.glow}66`
          : '1px solid rgba(100,100,160,0.3)',
        borderRadius: '16px',
        padding: '36px 28px 28px',
        boxShadow: isUnlocked
          ? `0 0 32px ${colors.glow}40, 0 0 60px ${colors.glow}20, inset 0 0 20px ${colors.bg}`
          : '0 8px 32px rgba(0,0,0,0.6)',
        textAlign: 'center',
        animation: 'slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            border: 'none',
            background: 'rgba(255,255,255,0.07)',
            borderRadius: '50%',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={14} />
        </button>

        {/* アイコン */}
        <div style={{
          width: 80,
          height: 80,
          margin: '0 auto 20px',
          borderRadius: '50%',
          background: isUnlocked ? colors.bg : 'rgba(60,60,80,0.3)',
          border: `2px solid ${isUnlocked ? colors.glow + '88' : 'rgba(80,80,100,0.3)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isUnlocked ? `0 0 20px ${colors.glow}50` : 'none',
          filter: isUnlocked ? 'none' : 'grayscale(1)',
        }}>
          {isUnlocked
            ? <IconComp size={36} color={colors.fg} strokeWidth={1.5} />
            : <Lock size={30} color="rgba(120,120,150,0.7)" strokeWidth={1.5} />
          }
        </div>

        {/* バッジ名 */}
        <p style={{
          fontSize: '10px',
          letterSpacing: '0.2em',
          color: isUnlocked ? colors.fg : 'rgba(120,120,150,0.6)',
          marginBottom: 6,
          textTransform: 'uppercase',
        }}>
          {isUnlocked ? `— ${achievement.iconType.toUpperCase()} —` : '— LOCKED —'}
        </p>
        <h2 style={{
          fontSize: '20px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: isUnlocked ? '#ffffff' : 'rgba(120,120,150,0.5)',
          marginBottom: 16,
          textShadow: isUnlocked ? `0 0 12px ${colors.glow}aa` : 'none',
        }}>
          {isUnlocked ? achievement.name : '？？？'}
        </h2>

        {/* 区切り */}
        <div style={{
          height: 1,
          background: isUnlocked
            ? `linear-gradient(90deg, transparent, ${colors.glow}66, transparent)`
            : 'rgba(100,100,140,0.2)',
          marginBottom: 16,
        }} />

        {/* 説明 */}
        {isUnlocked ? (
          <>
            <p style={{
              fontSize: '14px',
              color: 'rgba(200,200,220,0.85)',
              lineHeight: 1.7,
              marginBottom: 16,
            }}>
              {achievement.description}
            </p>
            {formattedDate && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 14px',
                background: `${colors.bg}`,
                border: `1px solid ${colors.glow}44`,
                borderRadius: 20,
              }}>
                <Unlock size={11} color={colors.fg} />
                <span style={{ fontSize: '11px', color: colors.fg, letterSpacing: '0.05em' }}>
                  {formattedDate} 解除
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <p style={{
              fontSize: '13px',
              color: 'rgba(160,160,180,0.6)',
              marginBottom: 12,
              letterSpacing: '0.1em',
            }}>
              ？？？
            </p>
            <div style={{
              padding: '12px 16px',
              background: 'rgba(255,200,80,0.06)',
              border: '1px solid rgba(255,200,80,0.2)',
              borderRadius: 8,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              textAlign: 'left',
            }}>
              <Zap size={13} color="#ffd060" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{
                fontSize: '12px',
                color: 'rgba(255,210,100,0.85)',
                lineHeight: 1.65,
                margin: 0,
              }}>
                {achievement.hint}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// バッジカード
// =====================================================================
interface BadgeCardProps {
  achievement: Achievement;
  index: number;
  onClick: (a: Achievement) => void;
}

function BadgeCard({ achievement, index, onClick }: BadgeCardProps) {
  const isUnlocked = achievement.isUnlocked;
  const IconComp   = getIcon(achievement.iconType);
  const colors     = getColors(achievement.iconType);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onClick(achievement)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: 'pointer',
        background: isUnlocked
          ? `linear-gradient(145deg, ${colors.bg}, rgba(10,10,24,0.9))`
          : 'rgba(10,10,24,0.7)',
        border: `1px solid ${
          isUnlocked
            ? (hovered ? colors.glow + 'cc' : colors.glow + '55')
            : (hovered ? 'rgba(100,100,140,0.5)' : 'rgba(60,60,80,0.4)')
        }`,
        borderRadius: '14px',
        padding: '24px 14px 18px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        boxShadow: isUnlocked && hovered
          ? `0 0 20px ${colors.glow}44, 0 4px 20px rgba(0,0,0,0.4)`
          : '0 2px 10px rgba(0,0,0,0.3)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        animation: `cardReveal 0.4s ease both`,
        animationDelay: `${index * 0.05}s`,
      }}
    >
      {/* 獲得済み：ネオングロー背景エフェクト */}
      {isUnlocked && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 100,
          height: 100,
          transform: 'translate(-50%, -60%)',
          background: `radial-gradient(circle, ${colors.glow}22 0%, transparent 70%)`,
          pointerEvents: 'none',
          borderRadius: '50%',
        }} />
      )}

      {/* 獲得済みバッジ（右上） */}
      {isUnlocked && (
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: colors.glow,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 6px ${colors.glow}`,
        }}>
          <Sparkles size={9} color="#000" strokeWidth={2.5} />
        </div>
      )}

      {/* アイコン */}
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: isUnlocked
          ? `radial-gradient(circle at 35% 35%, ${colors.fg}33, ${colors.bg})`
          : 'rgba(40,40,60,0.6)',
        border: `1.5px solid ${isUnlocked ? colors.glow + '88' : 'rgba(60,60,80,0.4)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isUnlocked ? `0 0 14px ${colors.glow}55` : 'none',
        filter: isUnlocked ? 'none' : 'grayscale(1) brightness(0.4)',
        transition: 'all 0.2s ease',
        flexShrink: 0,
      }}>
        {isUnlocked
          ? <IconComp size={24} color={colors.fg} strokeWidth={1.5} />
          : <Lock size={20} color="rgba(80,80,100,0.6)" strokeWidth={1.5} />
        }
      </div>

      {/* バッジ名 */}
      <p style={{
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: isUnlocked ? '#e8e8f0' : 'rgba(100,100,120,0.5)',
        textAlign: 'center',
        lineHeight: 1.3,
        margin: 0,
        textShadow: isUnlocked ? `0 0 8px ${colors.glow}88` : 'none',
      }}>
        {isUnlocked ? achievement.name : '？？？'}
      </p>

      {/* ステータスライン */}
      <div style={{
        fontSize: '9px',
        letterSpacing: '0.12em',
        color: isUnlocked ? colors.fg : 'rgba(80,80,100,0.4)',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
      }}>
        {isUnlocked
          ? <><Unlock size={8} /><span>UNLOCKED</span></>
          : <><Lock size={8} /><span>LOCKED</span></>
        }
      </div>
    </div>
  );
}

// =====================================================================
// メインページ
// =====================================================================
export default function AchievementsPage() {
  const router = useRouter();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [selected, setSelected]         = useState<Achievement | null>(null);
  const [filter, setFilter]             = useState<'all' | 'unlocked' | 'locked'>('all');

  useEffect(() => {
    fetchAchievements()
      .then(setAchievements)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const unlockedCount = achievements.filter(a => a.isUnlocked).length;
  const total         = achievements.length;
  const progressPct   = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

  const filtered = achievements.filter(a => {
    if (filter === 'unlocked') return a.isUnlocked;
    if (filter === 'locked')   return !a.isUnlocked;
    return true;
  });

  return (
    <>
      {/* ===== グローバルCSS（keyframes等） ===== */}
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes cardReveal {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scanline {
          0%   { top: -8px; }
          100% { top: 100%; }
        }
        @keyframes progressFill {
          from { width: 0%; }
          to   { width: var(--target-width); }
        }
        @keyframes titleGlow {
          0%, 100% { text-shadow: 0 0 8px #b088f9aa, 0 0 20px #b088f944; }
          50%       { text-shadow: 0 0 14px #b088f9dd, 0 0 32px #b088f966; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        /* スクロールバー非表示 */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(176,136,249,0.3); border-radius: 2px; }
      `}</style>

      <div style={{
        minHeight: '100dvh',
        background: 'linear-gradient(170deg, #06060f 0%, #0c0a1e 40%, #0f0618 100%)',
        color: '#e8e8f0',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* ── 背景装飾：グリッドパターン ── */}
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(176,136,249,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(176,136,249,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* ── 背景装飾：走査線 ── */}
        <div style={{
          position: 'fixed',
          left: 0,
          right: 0,
          height: 8,
          background: 'linear-gradient(180deg, transparent, rgba(176,136,249,0.04), transparent)',
          animation: 'scanline 8s linear infinite',
          pointerEvents: 'none',
          zIndex: 1,
        }} />

        {/* ── メインコンテンツ ── */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 900,
          margin: '0 auto',
          padding: '0 16px 100px',
        }}>

          {/* ヘッダー */}
          <div style={{
            paddingTop: 20,
            paddingBottom: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            {/* 戻るボタン */}
            <button
              onClick={() => router.push('/')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px 6px 8px',
                background: 'rgba(176,136,249,0.08)',
                border: '1px solid rgba(176,136,249,0.25)',
                borderRadius: 20,
                color: 'rgba(200,180,255,0.8)',
                fontSize: '12px',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                width: 'fit-content',
                marginBottom: 20,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(176,136,249,0.15)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(176,136,249,0.5)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(176,136,249,0.08)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(176,136,249,0.25)';
              }}
            >
              <ChevronLeft size={14} />
              道場へ戻る
            </button>

            {/* タイトル */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h1 style={{
                fontSize: 'clamp(22px, 5vw, 30px)',
                fontWeight: 800,
                letterSpacing: '0.12em',
                margin: 0,
                color: '#d0b8ff',
                animation: 'titleGlow 3s ease-in-out infinite',
              }}>
                実績庫
              </h1>
              <span style={{
                fontSize: '11px',
                letterSpacing: '0.2em',
                color: 'rgba(176,136,249,0.5)',
                textTransform: 'uppercase',
              }}>
                ACHIEVEMENT VAULT
              </span>
            </div>
            <p style={{
              fontSize: '12px',
              color: 'rgba(160,150,190,0.6)',
              letterSpacing: '0.08em',
              margin: 0,
            }}>
              稽古の積み重ねが、ここに刻まれる。
            </p>
          </div>

          {/* プログレスバナー */}
          {!loading && !error && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(12,10,28,0.9), rgba(20,12,40,0.9))',
              border: '1px solid rgba(176,136,249,0.2)',
              borderRadius: '14px',
              padding: '18px 20px',
              marginBottom: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 0 20px rgba(176,136,249,0.08)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: '24px', fontWeight: 700, color: '#d0b8ff' }}>
                    {unlockedCount}
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgba(160,140,200,0.6)' }}>
                    / {total} 解除
                  </span>
                </div>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: progressPct >= 80 ? '#ffd700' : progressPct >= 50 ? '#b088f9' : 'rgba(160,140,200,0.6)',
                }}>
                  {progressPct}%
                </span>
              </div>
              {/* プログレスバー */}
              <div style={{
                height: 6,
                background: 'rgba(80,60,120,0.3)',
                borderRadius: 3,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  background: progressPct >= 80
                    ? 'linear-gradient(90deg, #ffd700, #ffaa00)'
                    : 'linear-gradient(90deg, #6a3fa6, #b088f9)',
                  borderRadius: 3,
                  boxShadow: progressPct >= 80
                    ? '0 0 10px rgba(255,215,0,0.5)'
                    : '0 0 8px rgba(176,136,249,0.5)',
                  transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                }} />
              </div>
            </div>
          )}

          {/* フィルタータブ */}
          {!loading && !error && (
            <div style={{
              display: 'flex',
              gap: 8,
              marginBottom: 20,
              flexWrap: 'wrap',
            }}>
              {([
                { key: 'all',      label: `すべて（${total}）` },
                { key: 'unlocked', label: `解除済み（${unlockedCount}）` },
                { key: 'locked',   label: `未解除（${total - unlockedCount}）` },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 20,
                    fontSize: '11px',
                    letterSpacing: '0.06em',
                    fontWeight: filter === key ? 700 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: filter === key
                      ? 'rgba(176,136,249,0.2)'
                      : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${filter === key ? 'rgba(176,136,249,0.6)' : 'rgba(100,80,140,0.25)'}`,
                    color: filter === key ? '#d0b8ff' : 'rgba(160,140,190,0.6)',
                    boxShadow: filter === key ? '0 0 8px rgba(176,136,249,0.2)' : 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* ローディング */}
          {loading && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12,
            }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* ローディング中の文言 */}
          {loading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              paddingTop: 12,
            }}>
              <div style={{
                width: 28,
                height: 28,
                border: '2px solid rgba(176,136,249,0.2)',
                borderTop: '2px solid #b088f9',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{
                fontSize: '11px',
                letterSpacing: '0.18em',
                color: 'rgba(176,136,249,0.5)',
                textTransform: 'uppercase',
              }}>
                実績を読み込んでいます...
              </p>
            </div>
          )}

          {/* エラー */}
          {error && (
            <div style={{
              padding: '24px',
              background: 'rgba(255,60,60,0.06)',
              border: '1px solid rgba(255,60,60,0.25)',
              borderRadius: '12px',
              textAlign: 'center',
            }}>
              <p style={{ color: 'rgba(255,120,120,0.85)', fontSize: '13px', margin: 0 }}>
                データの取得に失敗しました: {error}
              </p>
            </div>
          )}

          {/* バッジグリッド */}
          {!loading && !error && (
            <>
              {filtered.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: 'rgba(120,110,150,0.5)',
                  fontSize: '13px',
                  letterSpacing: '0.08em',
                }}>
                  該当する実績がありません
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: 12,
                }}>
                  {filtered.map((a, i) => (
                    <BadgeCard
                      key={a.id}
                      achievement={a}
                      index={i}
                      onClick={setSelected}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* モーダル */}
      {selected && (
        <AchievementModal
          achievement={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
