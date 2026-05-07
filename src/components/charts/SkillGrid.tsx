'use client';

// =====================================================================
// SkillGrid.tsx — サイバー八卦陣（Phase 6.7 静謐な灯火リビジョン）
//
// ★ Phase 6.7 の変更点:
//   ① 歪みの徹底抑制：feDisplacementMap の scale を 1/3〜1/5 に
//   ② 完全同系色化：FLAME_MAXED 廃止、部位色そのもので白熱表現
//   ③ ネオングロウを控えめに（SVGオーラを主役に）
//   ④ 火の粉数・速度・彩度を控えめに
//   ⑤ 中心透明・成長連動・瞬きアニメは維持
// =====================================================================

import { memo, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Technique } from '@/types';

// =====================================================================
// 定数
// =====================================================================
const TECH_SCORE_CAP = 1000;
const BP_SCORE_CAP   = 5000;
const OUTER_SLOTS    = 24;
const R_OUTER        = 200;
const R_MID_RATIO    = 0.46;

const TECH_NODE_SIZE = 42;
const BP_NODE_SIZE   = 56;
const CORE_NODE_SIZE = 64;

// =====================================================================
// 炎の階層（Tier）定義
// =====================================================================
type FlameTier = 0 | 1 | 2 | 3 | 4;

function pointsToTier(points: number): FlameTier {
  if (points >= 1000) return 4;
  if (points >= 500)  return 3;
  if (points >= 200)  return 2;
  if (points >= 50)   return 1;
  return 0;
}

const TIER_SCALE: Record<FlameTier, number> = {
  0: 0,
  1: 0.55,
  2: 0.80,
  3: 1.00,
  4: 1.20,
};

const TIER_OPACITY: Record<FlameTier, number> = {
  0: 0,
  1: 0.65,
  2: 0.78,
  3: 0.88,
  4: 0.95,
};

// 火の粉数を控えめに（仕様④）
const TIER_SPARKS: Record<FlameTier, number> = {
  0: 0,
  1: 0,
  2: 0,
  3: 1,
  4: 2,
};

// =====================================================================
// 部位カラーテーマ（完全同系色化）
//   flame.hot:  最も白熱した部位色（高輝度）
//   flame.mid:  ノード本体と同じ彩度の部位色
//   flame.cool: 暗部の部位色
// =====================================================================
interface BpTheme {
  rgb:   string;
  dark:  string;
  text:  string;
  flame: { hot: string; mid: string; cool: string };
}

const BP_THEMES: Record<string, BpTheme> = {
  '面':   {
    rgb: '248,113,113', dark: '#7f1d1d', text: '#fecaca',
    // 深紅 → 鮮烈な赤（白熱）
    flame: { hot: '#fee2e2', mid: '#f87171', cool: '#7f1d1d' },
  },
  '小手': {
    rgb: '253,224,71', dark: '#713f12', text: '#fef9c3',
    // 黄 → 白熱した黄
    flame: { hot: '#fef9c3', mid: '#fde047', cool: '#713f12' },
  },
  '胴':   {
    rgb: '56,189,248', dark: '#0c4a6e', text: '#bae6fd',
    // 藍 → 輝く藍
    flame: { hot: '#e0f2fe', mid: '#38bdf8', cool: '#0c4a6e' },
  },
  '突き': {
    rgb: '167,139,250', dark: '#4c1d95', text: '#ede9fe',
    // 紫 → 白熱した紫
    flame: { hot: '#ede9fe', mid: '#a78bfa', cool: '#4c1d95' },
  },
};

const DEFAULT_THEME: BpTheme = {
  rgb: '99,102,241', dark: '#1e1b4b', text: '#c7d2fe',
  // 中心の藍色（インディゴ）系
  flame: { hot: '#e0e7ff', mid: '#818cf8', cool: '#1e1b4b' },
};

function getBpTheme(bodyPart: string): BpTheme {
  return BP_THEMES[bodyPart] ?? DEFAULT_THEME;
}

// 中心ノード用：DEFAULT_THEME と同じ藍系
const FLAME_CORE: BpTheme['flame'] = DEFAULT_THEME.flame;

// =====================================================================
// 共有フィルタ ID
// =====================================================================
const SHARED_FILTER_IDS: Record<FlameTier, string> = {
  0: '',
  1: 'flame-quiet-tier1',
  2: 'flame-quiet-tier2',
  3: 'flame-quiet-tier3',
  4: 'flame-quiet-tier4',
};

// =====================================================================
// Props
// =====================================================================
interface Props {
  techniques:      Technique[];
  signatureTechId?: string;
}

// =====================================================================
// ハンドル
// =====================================================================
const CENTER_HANDLE: React.CSSProperties = {
  opacity: 0, width: 1, height: 1,
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  border: 'none', background: 'transparent', pointerEvents: 'none',
};

const MinimalHandles = memo(() => (
  <>
    <Handle type="source" position={Position.Top}    id="s" style={CENTER_HANDLE} />
    <Handle type="target" position={Position.Bottom} id="t" style={CENTER_HANDLE} />
  </>
));
MinimalHandles.displayName = 'MinimalHandles';

// =====================================================================
// 共有フィルタ定義（歪み徹底抑制版）
//   行灯（あんどん）のように、ごくわずかに揺らぐ
// =====================================================================
const SharedFlameFilters = memo(() => (
  <svg
    width="0" height="0"
    style={{ position: 'absolute', pointerEvents: 'none' }}
    aria-hidden="true"
  >
    <defs>
      {/* Tier1：ほぼ揺れない */}
      <filter id={SHARED_FILTER_IDS[1]} x="-30%" y="-40%" width="160%" height="180%">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.035" numOctaves="1" seed="3" result="n">
          <animate attributeName="baseFrequency"
            dur="9s" values="0.018 0.035; 0.022 0.045; 0.018 0.035" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      {/* Tier2：かすかな揺らぎ */}
      <filter id={SHARED_FILTER_IDS[2]} x="-35%" y="-50%" width="170%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.04" numOctaves="1" seed="7" result="n">
          <animate attributeName="baseFrequency"
            dur="8s" values="0.02 0.04; 0.024 0.05; 0.02 0.04" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      {/* Tier3：穏やかな揺らぎ */}
      <filter id={SHARED_FILTER_IDS[3]} x="-40%" y="-60%" width="180%" height="220%">
        <feTurbulence type="fractalNoise" baseFrequency="0.022 0.045" numOctaves="1" seed="13" result="n">
          <animate attributeName="baseFrequency"
            dur="7s" values="0.022 0.045; 0.027 0.055; 0.022 0.045" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      {/* Tier4：はっきりとした、しかし穏やかな揺らぎ */}
      <filter id={SHARED_FILTER_IDS[4]} x="-45%" y="-65%" width="190%" height="230%">
        <feTurbulence type="fractalNoise" baseFrequency="0.024 0.05" numOctaves="1" seed="19" result="n">
          <animate attributeName="baseFrequency"
            dur="6s" values="0.024 0.05; 0.03 0.06; 0.024 0.05" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>
));
SharedFlameFilters.displayName = 'SharedFlameFilters';

// =====================================================================
// 火の粉（Spark）コンポーネント（控えめ版）
// =====================================================================
interface SparksProps {
  size:   number;
  count:  number;
  flame:  BpTheme['flame'];
  uid:    string;
  scale:  number;
}

const Sparks = memo(function Sparks({ size, count, flame, uid, scale }: SparksProps) {
  if (count === 0) return null;

  const padX      = size * 0.55 * scale;
  const padTop    = size * 1.0  * scale;
  const padBottom = size * 0.2  * scale;
  const w = size + padX * 2;
  const h = size + padTop + padBottom;

  const cx = w / 2;
  const baseY = size / 2 + padTop;

  const sparkR = Math.max(1.0, size * 0.04 * scale);

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        position: 'absolute',
        top: -padTop,
        left: -padX,
        pointerEvents: 'none',
        zIndex: 1,
        overflow: 'visible',
      }}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => {
        const offsetX  = ((i * 7919) % 100 / 100 - 0.5) * size * 0.4 * scale;
        // 上昇は遅めに
        const riseDur  = 3.5 + ((i * 1597) % 100) / 100 * 1.5;
        const riseDelay = -((i * 991) % 100) / 100 * riseDur;
        const driftX   = (((i * 4271) % 100) / 100 - 0.5) * 8 * scale;
        // 瞬きも遅めに
        const twinkleDur = 0.6 + ((i * 547) % 100) / 100 * 0.5;
        const twinkleDelay = -((i * 313) % 100) / 100 * twinkleDur;

        // 火の粉の色は炎本体と同系色（midカラー基準）
        const color = flame.mid;

        return (
          <g
            key={`${uid}-spark-${i}`}
            className="flame-spark-rise"
            style={{
              transformOrigin: `${cx}px ${baseY}px`,
              animationDuration: `${riseDur}s`,
              animationDelay: `${riseDelay}s`,
              ['--drift-x' as string]: `${driftX}px`,
            }}
          >
            <g
              className="flame-spark-twinkle"
              style={{
                transformOrigin: `${cx + offsetX}px ${baseY}px`,
                animationDuration: `${twinkleDur}s`,
                animationDelay: `${twinkleDelay}s`,
              }}
            >
              <circle
                cx={cx + offsetX}
                cy={baseY}
                r={sparkR}
                fill={color}
                style={{
                  filter: `drop-shadow(0 0 ${sparkR * 1.5}px ${color})`,
                }}
              />
            </g>
          </g>
        );
      })}
    </svg>
  );
});

// =====================================================================
// 静謐な灯火コンポーネント（中心透明・輪郭でほのかに燃える）
// =====================================================================
interface FlameAuraProps {
  size:      number;
  tier:      FlameTier;
  flame:     BpTheme['flame'];
  uid:       string;
  baseScale?: number;
}

const FlameAura = memo(function FlameAura({
  size, tier, flame, uid, baseScale = 1.0,
}: FlameAuraProps) {
  if (tier === 0) return null;

  const tierScale = TIER_SCALE[tier];
  const tierOpacity = TIER_OPACITY[tier];
  const totalScale = tierScale * baseScale;

  const pad = size * 0.5 * totalScale;
  const w = size + pad * 2;
  const h = size + pad * 2;

  const cx = w / 2;
  const cy = h / 2;

  const outerR = size / 2 * (1.0 + tierScale * 0.5);

  const gradId   = `fg-${uid}`;
  const filterId = SHARED_FILTER_IDS[tier];

  // 呼吸はゆったりと
  const breatheDur = 6.5 - tier * 0.4;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        position: 'absolute',
        top: -pad,
        left: -pad,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'visible',
      }}
      aria-hidden="true"
    >
      <defs>
        {/*
          中心は完全透明（テキスト視認性確保）
          輪郭付近で部位カラーがやさしく発色する
          グラデーションのコントラストは控えめに
        */}
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={flame.mid} stopOpacity="0" />
          <stop offset="42%"  stopColor={flame.mid} stopOpacity="0" />
          <stop offset="52%"  stopColor={flame.hot} stopOpacity="0.55" />
          <stop offset="62%"  stopColor={flame.mid} stopOpacity="0.85" />
          <stop offset="78%"  stopColor={flame.mid} stopOpacity="0.55" />
          <stop offset="90%"  stopColor={flame.cool} stopOpacity="0.22" />
          <stop offset="100%" stopColor={flame.cool} stopOpacity="0" />
        </radialGradient>
      </defs>

      <g filter={`url(#${filterId})`} opacity={tierOpacity}>
        <g
          className="flame-quiet-breathe"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animationDuration: `${breatheDur}s`,
          }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={outerR}
            fill={`url(#${gradId})`}
          />
        </g>
      </g>
    </svg>
  );
});

// =====================================================================
// CORE ノード（中心：藍色の静謐な灯火）
// =====================================================================
const CoreNode = memo(function CoreNode(_: NodeProps) {
  const s = CORE_NODE_SIZE;
  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%)',
      border: '2px solid rgba(129,140,248,0.65)',
      boxShadow: [
        '0 0 10px 3px rgba(99,102,241,0.45)',
        '0 0 0 1px rgba(129,140,248,0.35)',
        'inset 0 0 12px rgba(99,102,241,0.25)',
      ].join(', '),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#e0e7ff', fontSize: 15, fontWeight: 800,
      letterSpacing: '0.1em',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none', zIndex: 2,
    }}>
      {/* 中心ノードは固定で最強Tier=4 + 藍系オーラ */}
      <FlameAura size={s} tier={4} flame={FLAME_CORE} uid="core" baseScale={1.0} />
      <Sparks size={s} count={2} flame={FLAME_CORE} uid="core" scale={1.0} />
      <div style={{ position: 'relative', zIndex: 2 }}>
        <MinimalHandles />
        技
      </div>
    </div>
  );
});

// =====================================================================
// BodyPart ノード（控えめネオン芯 + 静謐な灯火）
// =====================================================================
interface BodyPartData {
  label:       string;
  totalPoints: number;
  norm:        number;
  tier:        FlameTier;
}

const BodyPartNode = memo(function BodyPartNode({ data, id }: NodeProps) {
  const d = data as unknown as BodyPartData;
  const s = BP_NODE_SIZE;
  const isMaxed = d.norm >= 1.0;
  const theme = getBpTheme(d.label);
  const { rgb, dark, text: bpText } = theme;

  // MAX時も部位の同系色（白熱版）を使用
  const flame = theme.flame;

  const bg = isMaxed
    ? `linear-gradient(135deg, ${dark}, rgba(${rgb},0.5))`
    : d.norm > 0.5
    ? `linear-gradient(135deg, ${dark}, rgba(${rgb},0.35))`
    : `linear-gradient(135deg, #0a0814, ${dark})`;

  const borderColor = isMaxed
    ? `rgba(${rgb},0.85)`
    : d.norm > 0.5
    ? `rgba(${rgb},0.65)`
    : `rgba(${rgb},0.4)`;

  // ネオン発光：控えめに（SVG灯火を主役にする）
  const glowIntensity = Math.max(0.25, d.norm);
  const neonGlow = [
    `0 0 ${5 + glowIntensity * 6}px ${1 + glowIntensity * 1.5}px rgba(${rgb},${(0.28 + glowIntensity * 0.22).toFixed(2)})`,
    `0 0 0 1px rgba(${rgb},${(0.3 + glowIntensity * 0.2).toFixed(2)})`,
    `inset 0 0 6px rgba(${rgb},${(0.15 + glowIntensity * 0.15).toFixed(2)})`,
  ].join(', ');

  const textColor = isMaxed ? `rgba(${rgb},1)` : bpText;
  const ptColor   = `rgba(${rgb},0.85)`;

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: bg, border: `1.5px solid ${borderColor}`,
      boxShadow: neonGlow,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#e0e7ff', textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none',
    }}>
      <FlameAura size={s} tier={d.tier} flame={flame} uid={`bp-${id}`} baseScale={1.0} />
      <Sparks size={s} count={TIER_SPARKS[d.tier]} flame={flame} uid={`bp-${id}`} scale={1.0} />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <MinimalHandles />
        <span style={{
          fontSize: 11, fontWeight: 800, lineHeight: 1.2, letterSpacing: '0.04em',
          color: textColor,
          textShadow: '0 0 4px rgba(0,0,0,0.75)',
        }}>
          {d.label}
        </span>
        {d.totalPoints > 0 && (
          <span style={{
            fontSize: 8, opacity: 0.85, marginTop: 1, color: ptColor,
            textShadow: '0 0 3px rgba(0,0,0,0.75)',
          }}>
            {d.totalPoints}pt
          </span>
        )}
      </div>
    </div>
  );
});

// =====================================================================
// Technique ノード（部位同系色の灯火）
// =====================================================================
interface TechData {
  technique:   Technique;
  tier:        FlameTier;
  isSignature: boolean;
  isMaxed:     boolean;
}

const TechniqueNode = memo(function TechniqueNode({ data, id }: NodeProps) {
  const { technique: t, tier, isSignature, isMaxed } = data as unknown as TechData;
  if (!t?.id) return null;
  const s = TECH_NODE_SIZE;
  const theme = getBpTheme(t.bodyPart);
  const { rgb, dark, text: bpText } = theme;

  // MAX時も部位同系色で白熱
  const flame = theme.flame;

  let bg: string, borderColor: string, textColor: string;
  let neonGlow: string = 'none';

  if (isMaxed) {
    bg = `linear-gradient(135deg, ${dark}, rgba(${rgb},0.5))`;
    borderColor = `rgba(${rgb},0.85)`; textColor = bpText;
    neonGlow = `0 0 7px 2px rgba(${rgb},0.45), 0 0 0 1px rgba(${rgb},0.45)`;
  } else if (tier >= 3) {
    bg = `linear-gradient(135deg, ${dark}, rgba(${rgb},0.4))`;
    borderColor = `rgba(${rgb},0.7)`; textColor = bpText;
    neonGlow = `0 0 6px 1.5px rgba(${rgb},0.35), 0 0 0 1px rgba(${rgb},0.35)`;
  } else if (tier >= 2) {
    bg = `linear-gradient(135deg, #070514, ${dark})`;
    borderColor = `rgba(${rgb},0.5)`; textColor = bpText;
    neonGlow = `0 0 4px 1px rgba(${rgb},0.25)`;
  } else if (tier >= 1) {
    bg = `linear-gradient(135deg, #06050f, #0d0b1a)`;
    borderColor = `rgba(${rgb},0.28)`; textColor = `rgba(${rgb},0.7)`;
    neonGlow = `0 0 3px 1px rgba(${rgb},0.18)`;
  } else {
    bg = '#06050f';
    borderColor = `rgba(${rgb},0.12)`; textColor = `rgba(${rgb},0.3)`;
  }

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: bg, border: `1.5px solid ${borderColor}`,
      boxShadow: neonGlow,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: textColor, textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none',
    }}>
      <FlameAura size={s} tier={tier} flame={flame} uid={`tech-${id}`} baseScale={1.0} />
      <Sparks size={s} count={TIER_SPARKS[tier]} flame={flame} uid={`tech-${id}`} scale={1.0} />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <MinimalHandles />

        {isSignature && (
          <span
            className="signature-star-badge"
            style={{
              position: 'absolute',
              left: -s * 0.34,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 15,
              lineHeight: 1,
              color: '#fde047',
              fontWeight: 900,
              zIndex: 3,
              pointerEvents: 'none',
              textShadow: '0 0 4px rgba(0,0,0,0.7), 0 0 6px rgba(253,224,71,0.6)',
            }}
            aria-label="得意技"
          >
            ★
          </span>
        )}

        <span style={{
          fontSize: 8, fontWeight: 700, lineHeight: 1.25,
          wordBreak: 'break-all', maxWidth: s * 0.82, letterSpacing: '0.02em',
          textShadow: '0 0 3px rgba(0,0,0,0.85)',
        }}>
          {t.name}
        </span>
        {(t.points ?? 0) > 0 && (
          <span style={{
            fontSize: 7, opacity: 0.85, marginTop: 1,
            textShadow: '0 0 2px rgba(0,0,0,0.85)',
          }}>{t.points}pt</span>
        )}

        {isMaxed && (
          <span style={{
            position: 'absolute', top: -3, right: -1,
            fontSize: 6, lineHeight: 1,
            background: `linear-gradient(135deg, ${dark}, rgba(${rgb},1))`,
            borderRadius: 3, padding: '1px 2px', color: '#fff', fontWeight: 800,
            boxShadow: `0 0 4px rgba(${rgb},0.7)`,
          }}>MAX</span>
        )}
      </div>
    </div>
  );
});

// =====================================================================
// ノード種別登録
// =====================================================================
const NODE_TYPES: NodeTypes = { coreNode: CoreNode, bodyPartNode: BodyPartNode, techniqueNode: TechniqueNode };

// =====================================================================
// データサニタイズ
// =====================================================================
function sanitizeTechniques(raw: Technique[]): Technique[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (!item?.id) return null;
    const r = item as unknown as Record<string, unknown>;
    return {
      id:          item.id,
      bodyPart:    item.bodyPart    ?? (r['body_part']      as string) ?? '未分類',
      actionType:  item.actionType  ?? (r['action_type']    as string) ?? '',
      subCategory: item.subCategory ?? (r['sub_category']   as string) ?? '',
      name:        item.name        ?? (r['technique_name'] as string) ?? '不明な技',
      points:      typeof item.points     === 'number' ? item.points     : 0,
      lastRating:  typeof item.lastRating === 'number' ? item.lastRating : 0,
    } satisfies Technique;
  }).filter((item): item is Technique => item !== null);
}

// =====================================================================
// 部位合計ポイント→Tier 変換
// =====================================================================
function bpTotalPointsToTier(totalPoints: number): FlameTier {
  if (totalPoints >= 5000) return 4;
  if (totalPoints >= 2500) return 3;
  if (totalPoints >= 1000) return 2;
  if (totalPoints >= 250)  return 1;
  return 0;
}

// =====================================================================
// グラフ生成
// =====================================================================
type TechActionMap = Record<string, string>;

function buildGraph(
  rawTechniques: Technique[],
  signatureTechId?: string,
): { nodes: Node[]; edges: Edge[]; techActionMap: TechActionMap } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const techActionMap: TechActionMap = {};

  const techniques = sanitizeTechniques(rawTechniques);

  const byBodyPart: Record<string, Technique[]> = {};
  techniques.forEach(t => {
    const bp = t.bodyPart || '未分類';
    if (!byBodyPart[bp]) byBodyPart[bp] = [];
    byBodyPart[bp].push(t);
  });

  // 各部位の合計ポイント
  const bpTotalPoints: Record<string, number> = {};
  Object.keys(byBodyPart).forEach(bp => {
    bpTotalPoints[bp] = byBodyPart[bp].reduce(
      (sum, t) => sum + (typeof t.points === 'number' ? t.points : 0),
      0
    );
  });

  const bodyParts = Object.keys(byBodyPart).sort(
    (a, b) => bpTotalPoints[b] - bpTotalPoints[a]
  );
  bodyParts.forEach(bp => byBodyPart[bp].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)));

  const allTechs: Array<{ tech: Technique; bpKey: string }> = [];
  outer: for (const bp of bodyParts) {
    for (const tech of byBodyPart[bp]) {
      if (allTechs.length >= OUTER_SLOTS) break outer;
      allTechs.push({ tech, bpKey: bp });
    }
  }

  const R_MID = R_OUTER * R_MID_RATIO;

  const half = CORE_NODE_SIZE / 2;
  nodes.push({ id: 'core', type: 'coreNode', position: { x: -half, y: -half }, data: {} });

  const techAngles: Record<string, number> = {};
  allTechs.forEach(({ tech }, i) => {
    const angle = (2 * Math.PI / OUTER_SLOTS) * i - Math.PI / 2;
    techAngles[tech.id] = angle;

    const isSignature = !!signatureTechId && tech.id === signatureTechId;
    const isMaxed     = (tech.points ?? 0) >= TECH_SCORE_CAP;
    const tier        = pointsToTier(tech.points ?? 0);
    const hs          = TECH_NODE_SIZE / 2;
    const techId      = `tech-${tech.id}`;

    techActionMap[techId] = tech.actionType ?? '';
    nodes.push({
      id: techId, type: 'techniqueNode',
      position: { x: R_OUTER * Math.cos(angle) - hs, y: R_OUTER * Math.sin(angle) - hs },
      data: { technique: tech, tier, isSignature, isMaxed } as unknown as Record<string, unknown>,
    });
  });

  bodyParts.forEach((bp, bi) => {
    const techs = byBodyPart[bp].filter(t => techAngles[t.id] !== undefined);
    if (techs.length === 0) return;

    const totalPts = bpTotalPoints[bp];
    const bpNorm   = Math.min(totalPts / BP_SCORE_CAP, 1.0);
    const bpTier   = bpTotalPointsToTier(totalPts);
    const hs       = BP_NODE_SIZE / 2;
    const bpId     = `bp-${bi}`;

    const sinSum   = techs.reduce((s, t) => s + Math.sin(techAngles[t.id]), 0);
    const cosSum   = techs.reduce((s, t) => s + Math.cos(techAngles[t.id]), 0);
    const avgAngle = Math.atan2(sinSum, cosSum);

    nodes.push({
      id: bpId, type: 'bodyPartNode',
      position: { x: R_MID * Math.cos(avgAngle) - hs, y: R_MID * Math.sin(avgAngle) - hs },
      data: { label: bp, totalPoints: totalPts, norm: bpNorm, tier: bpTier } as unknown as Record<string, unknown>,
    });

    const { rgb: bpRgb } = getBpTheme(bp);
    // エッジも部位同系色（オレンジ/ゴールドではなく）
    const bpEdgeColor = `rgba(${bpRgb},${(0.4 + bpNorm * 0.45).toFixed(2)})`;
    edges.push({
      id: `e-core-${bpId}`, source: 'core', target: bpId, type: 'straight',
      style: {
        stroke:      bpEdgeColor,
        strokeWidth: Math.max(1, Math.round(1.5 + bpNorm * 2.5)),
        opacity:     0.4 + bpNorm * 0.45,
      },
    });

    techs.forEach(tech => {
      const techId      = `tech-${tech.id}`;
      const norm        = Math.min((tech.points ?? 0) / TECH_SCORE_CAP, 1.0);
      const { rgb }     = getBpTheme(tech.bodyPart);
      const edgeColor   = `rgba(${rgb},${(0.35 + norm * 0.55).toFixed(2)})`;

      edges.push({
        id: `e-${bpId}-${techId}`, source: bpId, target: techId, type: 'straight',
        style: {
          stroke:      edgeColor,
          strokeWidth: Math.max(1, Math.round(1 + norm * 2)),
          opacity:     0.28 + norm * 0.55,
        },
      });
    });
  });

  return { nodes, edges, techActionMap };
}

// =====================================================================
// ActionType フィルター
// =====================================================================
type FilterType = 'all' | string;

function applyFilter(nodes: Node[], edges: Edge[], filter: FilterType, techActionMap: TechActionMap): { nodes: Node[]; edges: Edge[] } {
  if (filter === 'all') return { nodes, edges };
  return {
    nodes: nodes.map(n => {
      if (n.type === 'coreNode' || n.type === 'bodyPartNode') return n;
      return { ...n, style: { ...(n.style ?? {}), opacity: (techActionMap[n.id] ?? '') === filter ? 1 : 0.1 } };
    }),
    edges: edges.map(e => {
      if (e.id.startsWith('e-core-')) return e;
      const match = (techActionMap[e.target] ?? '') === filter;
      return { ...e, style: { ...(e.style ?? {}), opacity: match ? Math.max((e.style?.opacity as number) ?? 0.7, 0.7) : 0.04 } };
    }),
  };
}

// =====================================================================
// CSS キーフレーム
// =====================================================================
const KEYFRAMES = `
  /* 静謐な灯火：ゆったりとした呼吸 */
  @keyframes flame-quiet-breathe {
    0%, 100% { transform: scale(0.97); opacity: 0.92; }
    50%      { transform: scale(1.03); opacity: 1; }
  }
  .flame-quiet-breathe {
    animation-name: flame-quiet-breathe;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: transform, opacity;
  }

  /* 火の粉：ゆっくり立ち昇る */
  @keyframes flame-spark-rise {
    0% {
      transform: translate(0, 5%);
      opacity: 0;
    }
    20% {
      transform: translate(calc(var(--drift-x) * 0.2), -15%);
      opacity: 0.85;
    }
    70% {
      transform: translate(calc(var(--drift-x) * 0.7), -65%);
      opacity: 0.55;
    }
    100% {
      transform: translate(var(--drift-x), -110%);
      opacity: 0;
    }
  }
  .flame-spark-rise {
    animation-name: flame-spark-rise;
    animation-timing-function: ease-out;
    animation-iteration-count: infinite;
    will-change: transform, opacity;
  }

  /* 火の粉：穏やかな瞬き（彩度抑制） */
  @keyframes spark-twinkle {
    0%   { transform: scale(0.7); opacity: 0.55; }
    35%  { transform: scale(1.15); opacity: 0.95; }
    65%  { transform: scale(0.85); opacity: 0.7; }
    100% { transform: scale(1.0); opacity: 0.85; }
  }
  .flame-spark-twinkle {
    animation-name: spark-twinkle;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: transform, opacity;
  }

  @keyframes signature-star-pop {
    0%   { transform: translateY(-50%) scale(0) rotate(-180deg); opacity: 0; }
    60%  { transform: translateY(-50%) scale(1.4) rotate(20deg); opacity: 1; }
    100% { transform: translateY(-50%) scale(1.0) rotate(0); opacity: 1; }
  }
  @keyframes signature-star-twinkle {
    0%, 100% {
      color: #fde047;
      text-shadow: 0 0 4px rgba(0,0,0,0.7), 0 0 6px rgba(253,224,71,0.6);
    }
    50% {
      color: #fffbeb;
      text-shadow: 0 0 4px rgba(0,0,0,0.7), 0 0 12px rgba(253,224,71,0.95), 0 0 16px rgba(251,191,36,0.7);
    }
  }
  .signature-star-badge {
    animation:
      signature-star-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both,
      signature-star-twinkle 2.4s ease-in-out infinite 0.6s;
  }

  @media (prefers-reduced-motion: reduce) {
    .flame-quiet-breathe,
    .flame-spark-rise,
    .flame-spark-twinkle,
    .signature-star-badge {
      animation: none !important;
    }
    .flame-spark-rise { opacity: 0 !important; }
    svg animate { display: none; }
  }

  .react-flow__controls-button {
    background: rgba(15,14,42,0.95) !important;
    border-color: rgba(99,102,241,0.25) !important;
    fill: rgba(129,140,248,0.8) !important;
  }
  .react-flow__controls-button:hover { background: rgba(49,46,129,0.8) !important; }
  .react-flow__edge.selected .react-flow__edge-path,
  .react-flow__edge:focus .react-flow__edge-path { stroke-width: inherit !important; }
`;

// =====================================================================
// メインコンポーネント
// =====================================================================
export default function SkillGrid({ techniques, signatureTechId }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');

  const { nodes: rawNodes, edges: rawEdges, techActionMap } =
    useMemo(() => buildGraph(techniques, signatureTechId), [techniques, signatureTechId]);

  const actionTypes = useMemo(() => {
    const safe = sanitizeTechniques(techniques);
    return [...new Set(safe.map(t => t.actionType).filter(Boolean))];
  }, [techniques]);

  const { nodes, edges } = useMemo(
    () => applyFilter(rawNodes, rawEdges, filter, techActionMap),
    [rawNodes, rawEdges, filter, techActionMap],
  );

  const safeTechniques = useMemo(() => sanitizeTechniques(techniques), [techniques]);

  if (!safeTechniques.length) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'rgba(129,140,248,0.45)', fontSize: '0.85rem' }}>
        技データがありません
      </div>
    );
  }

  const FILTER_BUTTONS: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'すべて' },
    ...actionTypes.map(t => ({ key: t, label: t })),
  ];

  const signatureTech = signatureTechId ? safeTechniques.find(t => t.id === signatureTechId) : null;
  const maxedCount    = safeTechniques.filter(t => (t.points ?? 0) >= TECH_SCORE_CAP).length;

  return (
    <div style={{ width: '100%' }}>
      <style>{KEYFRAMES}</style>
      <SharedFlameFilters />

      {signatureTech && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '6px 14px', borderRadius: 10,
          background: 'linear-gradient(90deg, rgba(30,27,75,0.5), rgba(30,27,75,0.18))',
          border: '1px solid rgba(253,224,71,0.35)',
        }}>
          <span
            className="signature-star-badge"
            style={{
              fontSize: 16,
              color: '#fde047',
              fontWeight: 900,
              lineHeight: 1,
              display: 'inline-block',
            }}
          >★</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(253,224,71,0.85)', letterSpacing: '0.1em' }}>得意技</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fef9c3', letterSpacing: '0.05em' }}>
            {signatureTech.name}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'rgba(253,224,71,0.5)' }}>{signatureTech.points}pt</span>
        </div>
      )}

      {maxedCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
          padding: '4px 12px', borderRadius: 8,
          background: 'rgba(30,27,75,0.3)', border: '1px solid rgba(129,140,248,0.25)', width: 'fit-content',
        }}>
          <span style={{ fontSize: 11 }}>🏆</span>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(199,210,254,0.75)', letterSpacing: '0.08em' }}>MAX到達: {maxedCount}技</span>
          <span style={{ fontSize: '0.62rem', color: 'rgba(199,210,254,0.45)', marginLeft: 2 }}>({TECH_SCORE_CAP}pt以上)</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {FILTER_BUTTONS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '4px 13px', borderRadius: 999,
              border: `1.5px solid ${active ? 'rgba(129,140,248,0.75)' : 'rgba(99,102,241,0.22)'}`,
              background: active ? 'rgba(49,46,129,0.75)' : 'rgba(15,14,42,0.65)',
              color: active ? '#c7d2fe' : 'rgba(99,102,241,0.55)',
              fontSize: '0.7rem', fontWeight: active ? 700 : 500, fontFamily: 'inherit',
              cursor: 'pointer', transition: 'all .15s',
              boxShadow: active ? '0 0 8px rgba(99,102,241,0.35)' : 'none',
            }}>
              {label}
            </button>
          );
        })}
      </div>

      <div style={{
        width: '100%', height: 480, borderRadius: 16, overflow: 'hidden',
        background: 'linear-gradient(135deg, #050412 0%, #080717 50%, #0a0918 100%)',
        border: '1px solid rgba(99,102,241,0.15)', position: 'relative',
      }}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={NODE_TYPES}
          fitView fitViewOptions={{ padding: 0.22, maxZoom: 0.9 }}
          nodesDraggable={false} nodesConnectable={false}
          elementsSelectable={false} zoomOnDoubleClick={false}
          panOnDrag zoomOnScroll zoomOnPinch
          minZoom={0.2} maxZoom={2.5}
          colorMode="dark"
        >
          <Background variant={BackgroundVariant.Dots} color="rgba(99,102,241,0.12)" gap={28} size={1.2} />
          <Controls showInteractive={false} style={{ background: 'rgba(15,14,42,0.9)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 8 }} />
        </ReactFlow>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', padding: '0 2px' }}>
        {[
          { color: 'rgba(248,113,113,0.85)', label: '面' },
          { color: 'rgba(253,224,71,0.85)',  label: '小手' },
          { color: 'rgba(56,189,248,0.85)',  label: '胴' },
          { color: 'rgba(167,139,250,0.85)', label: '突き' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 5px 1px ${color}` }} />
            <span style={{ fontSize: '0.62rem', color: 'rgba(199,210,254,0.55)', fontWeight: 600 }}>{label}</span>
          </div>
        ))}
        <div style={{ width: 1, background: 'rgba(99,102,241,0.2)', margin: '0 2px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#fde047' }}>★</span>
          <span style={{ fontSize: '0.62rem', color: 'rgba(199,210,254,0.55)', fontWeight: 600 }}>得意技</span>
        </div>
      </div>
    </div>
  );
}
