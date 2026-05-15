// =====================================================================
// 百錬自得 - UserStatusCard コンポーネント
// ホーム画面・ライバル画面で共通使用するステータスカード。
// 7行レイアウトに統一し、ラベルと値の視覚的区別を明確化する。
//
// レイアウト:
//   1行目: "{二つ名}" [氏名]  [歯車アイコン→/settings/profile] （1.25rem・レア度カラー）
//   2行目: 信条: [motto]              （small・未設定時は非表示）
//   3行目: 部位称号: [xxx] リアル段位: [xxx]（small）
//   4行目: Lv.[XX] [レベル称号] [実績バッジ]（small）
//   5行目: TOTAL XP: [number]         （medium）
//   6行目: [XPプログレスバー]
//   7行目: 次のLv.[XX]まで [残XP] xp  （small・称号名は非表示）
//
// ★ Phase9.5: UserStatus から title が削除されたが、このコンポーネントは
//   もともと status.title を参照せず epithet.levelTitle を使用しているため、
//   コード変更は不要。型互換性の確認のみ。
// ★ Phase11.1: 歯車アイコン（/settings/profile）を右上に追加。
//   実績バッジの絵文字🏆をLucideのTrophyアイコンに変更。
// =====================================================================
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Settings, Trophy } from 'lucide-react';
import type { EpithetResult } from '@/lib/epithet';
import { levelColor, xpForLevel, calcLevelFromXp, calcProgressPercent } from '@/types';

// =====================================================================
// Rarity ヘルパー
// =====================================================================
function rarityTextColor(rarity: 'N' | 'R' | 'SR'): string {
  if (rarity === 'SR') return '#8B2E2E';
  if (rarity === 'R')  return '#2C4F7C';
  return '#A1A1AA';
}

function rarityExtraStyle(rarity: 'N' | 'R' | 'SR'): React.CSSProperties {
  if (rarity !== 'SR') return {};
  return { fontWeight: 800, letterSpacing: '0.18em' };
}

// =====================================================================
// EpithetNameButton — タップで由来トグル
// =====================================================================
interface EpithetNameButtonProps {
  epithet: EpithetResult;
}

function EpithetNameButton({ epithet }: EpithetNameButtonProps) {
  const [open, setOpen] = useState(false);

  const accentColor =
    epithet.epithetRarity === 'SR' ? 'rgba(220,46,46,0.5)'  :
    epithet.epithetRarity === 'R'  ? 'rgba(44,79,124,0.5)'  :
    'rgba(99,102,241,0.3)';
  const accentBg =
    epithet.epithetRarity === 'SR' ? 'rgba(139,46,46,0.08)' :
    epithet.epithetRarity === 'R'  ? 'rgba(44,79,124,0.08)' :
    'rgba(30,27,75,0.92)';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none', border: 'none', padding: 0,
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: '1.25rem', lineHeight: 1.2,
          color: rarityTextColor(epithet.epithetRarity),
          ...rarityExtraStyle(epithet.epithetRarity),
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
        aria-expanded={open}
        title="二つ名の由来を見る"
      >
        &ldquo;{epithet.epithetName}&rdquo;
        <span style={{
          fontSize: '0.5rem', opacity: 0.6,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
          display: 'inline-block', lineHeight: 1,
        }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          zIndex: 50,
          minWidth: 200, maxWidth: 280,
          padding: '10px 14px',
          borderRadius: 12,
          background: accentBg,
          border: `1px solid ${accentColor}`,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px ${accentColor}`,
        }}>
          {/* 小三角 */}
          <div style={{ position: 'absolute', top: -7, left: 16, width: 12, height: 7, overflow: 'hidden' }}>
            <div style={{
              width: 10, height: 10,
              background: accentBg, border: `1px solid ${accentColor}`,
              transform: 'rotate(45deg)', transformOrigin: 'bottom left',
              marginTop: 2, marginLeft: 1,
            }} />
          </div>
          {/* 説明文のみ（【由来】ラベルなし） */}
          <p style={{
            margin: 0,
            fontSize: '0.78rem', fontWeight: 700,
            color: 'rgba(199,210,254,0.92)', lineHeight: 1.6,
            wordBreak: 'break-all',
          }}>
            {epithet.epithetDescription}
          </p>
          <button
            onClick={() => setOpen(false)}
            style={{
              marginTop: 8, display: 'block', width: '100%',
              padding: '4px 0', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.62rem', fontWeight: 700,
              color: 'rgba(129,140,248,0.5)', textAlign: 'right',
            }}
          >
            閉じる ✕
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// ラベル・値ペア用スタイル定数
// =====================================================================
const LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 600,
  color: 'rgba(129,140,248,0.45)',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const VALUE_STYLE: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'rgba(199,210,254,0.88)',
  letterSpacing: '0.03em',
};

// =====================================================================
// UserStatusCard Props
// =====================================================================
export interface UserStatusCardProps {
  /** 表示するユーザー名 */
  userName: string;
  /** 3層称号の計算結果 */
  epithet:  EpithetResult;
  /** total_xp */
  totalXp:  number;
  /** アプリ内レベル（calcLevelFromXp 済みの値） */
  level:    number;
  /** リアル段位（空文字 or "無段" の場合は "無段" 表示） */
  realRank?: string;
  /** 座右の銘（未設定時は行ごと非表示） */
  motto?:   string;
  /** 実績ボタン用: 解除数 / 総数（null の場合はローディング表示） */
  achiev?:  { unlocked: number; total: number } | null;
  /** title_master から引いたレベル称号（epithet.levelTitle と同値でも可） */
  levelTitle?: string;
  /**
   * ★ Phase11.1: 歯車アイコンの表示制御。
   * ホーム画面（自分のカード）では true、ライバル閲覧画面では false。
   * デフォルト: false（後方互換性のため）
   */
  showSettingsLink?: boolean;
}

// =====================================================================
// UserStatusCard 本体
// ★ Phase9.5: このコンポーネントはもともと status.title を使わず
//   epithet.levelTitle（calcEpithet() 内で titleForLevel() で計算済み）を
//   表示しているため、Phase9.5 の変更による修正箇所はゼロ。
//   型定義から UserStatus.title が消えても Props に影響なし。
// ★ Phase11.1: 右上に歯車アイコン（/settings/profile）を追加。
//   実績バッジの絵文字をLucide Trophyアイコンに変更。
// =====================================================================
export function UserStatusCard({
  userName,
  epithet,
  totalXp,
  level,
  realRank,
  motto,
  achiev,
  showSettingsLink = false,
}: UserStatusCardProps) {
  const lvColor     = levelColor(level);
  const progressPct = calcProgressPercent(totalXp);

  // 次レベルまでの残XP
  const nextLevelXp   = level < 99 ? xpForLevel(level + 1) : null;
  const remainingXp   = nextLevelXp !== null ? Math.max(0, nextLevelXp - totalXp) : 0;

  const realRankLabel = realRank && realRank !== '無段' ? realRank : '無段';

  return (
    <div style={{
      borderRadius: 18,
      background: 'linear-gradient(135deg, rgba(15,14,42,0.95) 0%, rgba(30,27,75,0.85) 60%, rgba(49,46,129,0.7) 100%)',
      border: '1px solid rgba(99,102,241,0.28)',
      padding: '18px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
      position: 'relative',
    }}>

      {/* ── ★ Phase11.1: 歯車アイコン（右上固定） ───────────────── */}
      {showSettingsLink && (
        <Link
          href="/settings/profile"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid rgba(99,102,241,0.25)',
            background: 'rgba(15,14,42,0.6)',
            color: 'rgba(99,102,241,0.55)',
            textDecoration: 'none',
            transition: 'border-color 0.2s, color 0.2s',
          }}
          title="プロフィール設定"
          aria-label="プロフィール設定へ"
        >
          <Settings style={{ width: 14, height: 14 }} />
        </Link>
      )}

      {/* ── 1行目: "{二つ名}" [氏名] ────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'baseline',
        gap: 8, flexWrap: 'wrap',
        position: 'relative',
        /* 歯車アイコン分の右余白を確保 */
        paddingRight: showSettingsLink ? 36 : 0,
      }}>
        <EpithetNameButton epithet={epithet} />
        <span style={{
          fontSize: '1.25rem', fontWeight: 800,
          color: 'rgba(199,210,254,0.92)',
          whiteSpace: 'nowrap', lineHeight: 1.2,
        }}>
          {userName}
        </span>
      </div>

      {/* ── 2行目: 信条 (motto) — 未設定時は非表示 ──────────────── */}
      {motto?.trim() && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={LABEL_STYLE}>信条:</span>
          <span style={{
            fontSize: '0.75rem', fontWeight: 800,
            color: 'rgba(199,210,254,0.85)',
            letterSpacing: '0.06em',
            textShadow: '0 0 10px rgba(99,102,241,0.3)',
          }}>
            {motto}
          </span>
        </div>
      )}

      {/* ── 3行目: 部位称号 / リアル段位 ──────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={LABEL_STYLE}>部位称号:</span>
          <span style={{ ...VALUE_STYLE, color: 'rgba(167,139,250,0.85)' }}>
            {epithet.favoritePartTitle}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={LABEL_STYLE}>リアル段位:</span>
          <span style={{
            ...VALUE_STYLE,
            display: 'inline-block',
            padding: '0.1rem 0.4rem', borderRadius: 999,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(129,140,248,0.25)',
            fontSize: '0.65rem',
          }}>
            {realRankLabel}
          </span>
        </div>
      </div>

      {/* ── 4行目: Lv.[XX] [レベル称号] [実績バッジ] ───────────── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        gap: 8, flexWrap: 'wrap',
      }}>

        {/* ── 区切り線 ────────────────────────────────────────────── */}
        <div style={{ height: 1, background: 'rgba(99,102,241,0.15)', margin: '0 -2px', width: '100%' }} />

        {/* Lvバッジ */}
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          fontSize: '0.62rem', fontWeight: 800,
          padding: '0.18rem 0.55rem', borderRadius: 999,
          background: lvColor, color: '#fff',
          boxShadow: `0 0 7px ${lvColor}66`,
          whiteSpace: 'nowrap', flexShrink: 0,
          letterSpacing: '0.04em',
        }}>
          Lv.{level}
        </span>

        {/* レベル称号 — epithet.levelTitle は calcEpithet() 内で titleForLevel() から動的計算済み */}
        <span style={{
          fontSize: '0.78rem', fontWeight: 800,
          background: `linear-gradient(135deg, #e0e7ff, ${lvColor})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
        }}>
          {epithet.levelTitle}
        </span>

        {/* ★ Phase11.1: 実績バッジ — 絵文字🏆 → Lucide Trophy アイコン */}
        {achiev !== undefined && (
          <a
            href="/achievements"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '0.15rem 0.5rem', borderRadius: 999,
              background: 'rgba(79,70,229,0.08)',
              border: '1px solid rgba(99,102,241,0.25)',
              textDecoration: 'none', flexShrink: 0,
            }}
            title="実績一覧を見る"
          >
            <Trophy
              style={{
                width: 11,
                height: 11,
                color: 'rgba(251,191,36,0.75)',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(165,180,252,0.75)' }}>
              {achiev ? `${achiev.unlocked}/${achiev.total}` : '…'}
            </span>
          </a>
        )}
      </div>

      {/* ── 5行目: TOTAL XP ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ ...LABEL_STYLE, fontSize: '0.68rem', letterSpacing: '0.08em' }}>TOTAL XP:</span>
        <span style={{
          fontSize: '1.6rem', fontWeight: 900, lineHeight: 1,
          color: '#e0e7ff',
          textShadow: `0 0 16px ${lvColor}55`,
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {totalXp.toLocaleString()}
        </span>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(129,140,248,0.45)' }}>xp</span>
      </div>

      {/* ── 6行目: プログレスバー ─────────────────────────────────── */}
      <div style={{
        height: 8, borderRadius: 8,
        background: 'rgba(49,46,129,0.4)',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          height: '100%', borderRadius: 8,
          width: `${progressPct}%`,
          background: `linear-gradient(90deg, ${lvColor}cc, #a5b4fc)`,
          boxShadow: `0 0 8px ${lvColor}88`,
          transition: 'width 0.6s ease',
        }} />
      </div>

      {/* ── 7行目: 次のLv.XXまで [残XP] xp（称号名は非表示）───── */}
      {level < 99 && nextLevelXp !== null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={LABEL_STYLE}>次の</span>
          <span style={{ ...LABEL_STYLE, color: 'rgba(165,180,252,0.6)', fontWeight: 700 }}>
            Lv.{level + 1}
          </span>
          <span style={LABEL_STYLE}>まで</span>
          <span style={{
            fontSize: '0.75rem', fontWeight: 800,
            color: '#a5b4fc',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {remainingXp.toLocaleString()}
          </span>
          <span style={LABEL_STYLE}>xp</span>
          {/* プログレス % */}
          <span style={{
            marginLeft: 'auto',
            fontSize: '0.62rem', fontWeight: 700,
            color: 'rgba(99,102,241,0.45)',
          }}>
            {progressPct}%
          </span>
        </div>
      ) : level >= 99 ? (
        <p style={{
          margin: 0, fontSize: '0.75rem', fontWeight: 800,
          color: '#fde68a', textShadow: '0 0 10px rgba(251,191,36,0.5)',
        }}>
          🏆 最高位「剣道の神」に到達！
        </p>
      ) : null}

    </div>
  );
}
