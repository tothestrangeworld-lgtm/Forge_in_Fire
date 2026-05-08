'use client';

// =====================================================================
// SkillGrid.tsx — サイバー八卦陣（引き算の美学 第3弾：帯電一閃リビジョン）
// =====================================================================

import { memo, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BackgroundVariant,
  BaseEdge,
  getStraightPath,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type NodeTypes,
  type EdgeTypes,
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
// 帯電階層
// =====================================================================
type LightningTier = 0 | 1 | 2 | 3 | 4;

function pointsToTier(points: number): LightningTier {
  if (points >= 1000) return 4;
  if (points >= 500)  return 3;
  if (points >= 200)  return 2;
  if (points >= 50)   return 1;
  return 0;
}

function bpTotalPointsToTier(totalPoints: number): LightningTier {
  if (totalPoints >= 5000) return 4;
  if (totalPoints >= 2500) return 3;
  if (totalPoints >= 1000) return 2;
  if (totalPoints >= 250)  return 1;
  return 0;
}

const TIER_OPACITY: Record<LightningTier, number> = {
  0: 0,
  1: 0.7,
  2: 0.85,
  3: 0.95,
  4: 1.0,
};

const TIER_RING_COUNT: Record<LightningTier, number> = {
  0: 0,
  1: 1,
  2: 1,
  3: 1,
  4: 2,
};

// =====================================================================
// 部位カラーテーマ
// =====================================================================
interface BpTheme {
  rgb:    string;
  dark:   string;
  text:   string;
  plasma: { core: string; mid: string; glow: string };
}

const BP_THEMES: Record<string, BpTheme> = {
  '面':   {
    rgb: '248,113,113', dark: '#7f1d1d', text: '#fecaca',
    plasma: { core: '#fff5f5', mid: '#fb7185', glow: '#dc2626' },
  },
  '小手': {
    rgb: '253,224,71', dark: '#713f12', text: '#fef9c3',
    plasma: { core: '#fffbeb', mid: '#fde047', glow: '#eab308' },
  },
  '胴':   {
    rgb: '56,189,248', dark: '#0c4a6e', text: '#bae6fd',
    plasma: { core: '#f0f9ff', mid: '#38bdf8', glow: '#0284c7' },
  },
  '突き': {
    rgb: '167,139,250', dark: '#4c1d95', text: '#ede9fe',
    plasma: { core: '#faf5ff', mid: '#a78bfa', glow: '#7c3aed' },
  },
};

const DEFAULT_THEME: BpTheme = {
  rgb: '99,102,241', dark: '#1e1b4b', text: '#c7d2fe',
  plasma: { core: '#eef2ff', mid: '#818cf8', glow: '#4f46e5' },
};

function getBpTheme(bodyPart: string): BpTheme {
  return BP_THEMES[bodyPart] ?? DEFAULT_THEME;
}

// =====================================================================
// 共有 SVG フィルタ
// =====================================================================
const LIGHTNING_FILTER_IDS: Record<LightningTier, string> = {
  0: '',
  1: 'lightning-filter-tier1',
  2: 'lightning-filter-tier2',
  3: 'lightning-filter-tier3',
  4: 'lightning-filter-tier4',
};

const SharedLightningFilters = memo(() => (
  <svg
    width="0" height="0"
    style={{ position: 'absolute', pointerEvents: 'none' }}
    aria-hidden="true"
  >
    <defs>
      <filter id={LIGHTNING_FILTER_IDS[1]} x="-50%" y="-50%" width="200%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09 0.13" numOctaves="2" seed="3" result="n">
          <animate attributeName="seed"
            dur="3.7s" values="3;13;23;3" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feColorMatrix in="d" type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 4 -1.2" />
      </filter>

      <filter id={LIGHTNING_FILTER_IDS[2]} x="-55%" y="-55%" width="210%" height="210%">
        <feTurbulence type="fractalNoise" baseFrequency="0.1 0.14" numOctaves="2" seed="7" result="n">
          <animate attributeName="seed"
            dur="3.1s" values="7;17;27;7" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feColorMatrix in="d" type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 5 -1.6" />
      </filter>

      <filter id={LIGHTNING_FILTER_IDS[3]} x="-60%" y="-60%" width="220%" height="220%">
        <feTurbulence type="fractalNoise" baseFrequency="0.11 0.16" numOctaves="2" seed="13" result="n">
          <animate attributeName="seed"
            dur="2.9s" values="13;23;33;13" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="11" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feColorMatrix in="d" type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 6 -2" />
      </filter>

      <filter id={LIGHTNING_FILTER_IDS[4]} x="-65%" y="-65%" width="230%" height="230%">
        <feTurbulence type="fractalNoise" baseFrequency="0.12 0.18" numOctaves="2" seed="19" result="n">
          <animate attributeName="seed"
            dur="2.3s" values="19;29;41;19" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feColorMatrix in="d" type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 7 -2.4" />
      </filter>
    </defs>
  </svg>
));
SharedLightningFilters.displayName = 'SharedLightningFilters';

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
// 帯電オーラ（間欠一閃版）
// =====================================================================
interface LightningAuraProps {
  size:       number;
  tier:       LightningTier;
  plasma:     BpTheme['plasma'];
  uid:        string;
}

// 間欠クラック明滅（普段は消灯、一瞬だけ鋭く光る）
const FLICKER_CLASSES = [
  'aura-crack-flash-a',
  'aura-crack-flash-b',
];

// 超高速の素数秒旋回周期
const SPIN_DURS = [0.7, 1.1, 1.3, 1.7, 1.9];

/** 簡易な決定論的ハッシュ（djb2風） */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const LightningAura = memo(function LightningAura({
  size, tier, plasma, uid,
}: LightningAuraProps) {
  if (tier === 0) return null;

  const tierOpacity = TIER_OPACITY[tier];
  const ringCount = TIER_RING_COUNT[tier];

  const strokeMax = 3.5;
  const glowPad = 8;
  const pad = strokeMax + glowPad;
  const w = size + pad * 2;
  const h = size + pad * 2;

  const cx = w / 2;
  const cy = h / 2;

  const ringR = size / 2;
  const filterId = LIGHTNING_FILTER_IDS[tier];

  // uid から決定論的に旋回パラメータを決定
  const baseHash = hashString(uid);

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
      <g filter={`url(#${filterId})`} opacity={tierOpacity}>
        {Array.from({ length: ringCount }).map((_, i) => {
          const isMain = i === 0;
          const stroke = isMain ? plasma.mid : plasma.core;
          const strokeW = isMain ? (1.8 + tier * 0.35) : 1.4;
          // ノード縁に密着させるため内側に食い込む
          const r = ringR - (strokeW * 1.5);
          const flickerClass = FLICKER_CLASSES[i % FLICKER_CLASSES.length];

          // 衛星旋回：2〜3個の弧の断片
          const dashArr = isMain
            ? `10 120 25 180 5 150`
            : `8 140 18 200 4 170`;

          // 旋回パラメータ：素数秒 + 逆回転を半々
          const ringHash = (baseHash + i * 7919) | 0;
          const spinDur = SPIN_DURS[Math.abs(ringHash >> 3) % SPIN_DURS.length];
          const reverse = ((ringHash >> 5) & 1) === 1;
          const spinDelay = -((Math.abs(ringHash >> 9) % 100) / 100) * spinDur;
          const dashOffsetSeed = Math.abs(ringHash >> 11) % 360;

          return (
            <g
              key={`${uid}-ring-${i}`}
              className="aura-spin"
              style={{
                transformOrigin: `${cx}px ${cy}px`,
                animationDuration: `${spinDur}s`,
                animationDelay: `${spinDelay}s`,
                animationDirection: reverse ? 'reverse' : 'normal',
              }}
            >
              <circle
                className={flickerClass}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeW}
                strokeDasharray={dashArr}
                strokeDashoffset={dashOffsetSeed}
                strokeLinecap="round"
                style={{
                  filter: `drop-shadow(0 0 ${2 + tier * 0.6}px ${stroke})`,
                }}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
});

// =====================================================================
// CORE ノード
// =====================================================================
const CoreNode = memo(function CoreNode(_: NodeProps) {
  const s = CORE_NODE_SIZE;
  const plasma = DEFAULT_THEME.plasma;
  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: `radial-gradient(circle, ${plasma.glow} 0%, ${DEFAULT_THEME.dark} 65%, #0a0918 100%)`,
      border: `2px solid ${plasma.core}`,
      boxShadow: [
        `0 0 16px 5px ${plasma.mid}`,
        `0 0 0 1.5px ${plasma.core}`,
        `inset 0 0 14px ${plasma.glow}`,
      ].join(', '),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: plasma.core, fontSize: 15, fontWeight: 800,
      letterSpacing: '0.1em',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none', zIndex: 2,
      textShadow: `0 0 6px ${plasma.core}`,
    }}>
      <LightningAura size={s} tier={4} plasma={plasma} uid="core" />
      <div style={{ position: 'relative', zIndex: 2 }}>
        <MinimalHandles />
        技
      </div>
    </div>
  );
});

// =====================================================================
// BodyPart ノード
// =====================================================================
interface BodyPartData {
  label:       string;
  totalPoints: number;
  norm:        number;
  tier:        LightningTier;
}

const BodyPartNode = memo(function BodyPartNode({ data, id }: NodeProps) {
  const d = data as unknown as BodyPartData;
  const s = BP_NODE_SIZE;
  const isMaxed = d.norm >= 1.0;
  const theme = getBpTheme(d.label);
  const { rgb, dark, text: bpText, plasma } = theme;

  const bg = isMaxed
    ? `radial-gradient(circle, ${plasma.glow} 0%, ${dark} 70%, #050412 100%)`
    : d.norm > 0.5
    ? `radial-gradient(circle, rgba(${rgb},0.45) 0%, ${dark} 70%, #050412 100%)`
    : `radial-gradient(circle, rgba(${rgb},0.18) 0%, ${dark} 70%, #050412 100%)`;

  const borderColor = isMaxed
    ? plasma.core
    : d.norm > 0.5
    ? plasma.mid
    : `rgba(${rgb},0.55)`;

  const glowIntensity = Math.max(0.35, d.norm);
  const neonGlow = isMaxed
    ? [
        `0 0 12px 3px ${plasma.mid}`,
        `0 0 0 1.5px ${plasma.core}`,
        `inset 0 0 10px ${plasma.glow}`,
      ].join(', ')
    : [
        `0 0 ${7 + glowIntensity * 7}px ${1.2 + glowIntensity * 2}px rgba(${rgb},${(0.45 + glowIntensity * 0.3).toFixed(2)})`,
        `0 0 0 1px rgba(${rgb},${(0.45 + glowIntensity * 0.3).toFixed(2)})`,
        `inset 0 0 6px rgba(${rgb},${(0.18 + glowIntensity * 0.18).toFixed(2)})`,
      ].join(', ');

  const textColor = isMaxed ? plasma.core : bpText;
  const ptColor   = isMaxed ? plasma.core : `rgba(${rgb},0.9)`;

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
      <LightningAura size={s} tier={d.tier} plasma={plasma} uid={`bp-${id}`} />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <MinimalHandles />
        <span style={{
          fontSize: 11, fontWeight: 800, lineHeight: 1.2, letterSpacing: '0.04em',
          color: textColor,
          textShadow: `0 0 4px rgba(0,0,0,0.85), 0 0 6px ${plasma.glow}`,
        }}>
          {d.label}
        </span>
        {d.totalPoints > 0 && (
          <span style={{
            fontSize: 8, opacity: 0.95, marginTop: 1, color: ptColor,
            textShadow: '0 0 3px rgba(0,0,0,0.85)',
          }}>
            {d.totalPoints}pt
          </span>
        )}
      </div>
    </div>
  );
});

// =====================================================================
// Technique ノード
// =====================================================================
interface TechData {
  technique:   Technique;
  tier:        LightningTier;
  isSignature: boolean;
  isMaxed:     boolean;
}

const TechniqueNode = memo(function TechniqueNode({ data, id }: NodeProps) {
  const { technique: t, tier, isSignature, isMaxed } = data as unknown as TechData;
  if (!t?.id) return null;
  const s = TECH_NODE_SIZE;
  const theme = getBpTheme(t.bodyPart);
  const { rgb, dark, text: bpText, plasma } = theme;

  let bg: string, borderColor: string, textColor: string;
  let neonGlow: string = 'none';

  if (isMaxed) {
    bg = `radial-gradient(circle, ${plasma.glow} 0%, ${dark} 70%, #050412 100%)`;
    borderColor = plasma.core; textColor = plasma.core;
    neonGlow = `0 0 9px 2.5px ${plasma.mid}, 0 0 0 1px ${plasma.core}`;
  } else if (tier >= 3) {
    bg = `radial-gradient(circle, rgba(${rgb},0.4) 0%, ${dark} 70%, #050412 100%)`;
    borderColor = plasma.mid; textColor = bpText;
    neonGlow = `0 0 7px 2px rgba(${rgb},0.5), 0 0 0 1px rgba(${rgb},0.5)`;
  } else if (tier >= 2) {
    bg = `radial-gradient(circle, rgba(${rgb},0.2) 0%, ${dark} 70%, #050412 100%)`;
    borderColor = `rgba(${rgb},0.6)`; textColor = bpText;
    neonGlow = `0 0 5px 1.5px rgba(${rgb},0.35)`;
  } else if (tier >= 1) {
    bg = `linear-gradient(135deg, #06050f, #0d0b1a)`;
    borderColor = `rgba(${rgb},0.32)`; textColor = `rgba(${rgb},0.72)`;
    neonGlow = `0 0 3px 1px rgba(${rgb},0.22)`;
  } else {
    bg = '#06050f';
    borderColor = `rgba(${rgb},0.12)`; textColor = `rgba(${rgb},0.32)`;
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
      <LightningAura size={s} tier={tier} plasma={plasma} uid={`tech-${id}`} />
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
              textShadow: '0 0 4px rgba(0,0,0,0.7), 0 0 6px rgba(253,224,71,0.65)',
            }}
            aria-label="得意技"
          >
            ★
          </span>
        )}

        <span style={{
          fontSize: 8, fontWeight: 700, lineHeight: 1.25,
          wordBreak: 'break-all', maxWidth: s * 0.82, letterSpacing: '0.02em',
          textShadow: '0 0 3px rgba(0,0,0,0.9)',
        }}>
          {t.name}
        </span>
        {(t.points ?? 0) > 0 && (
          <span style={{
            fontSize: 7, opacity: 0.9, marginTop: 1,
            textShadow: '0 0 2px rgba(0,0,0,0.9)',
          }}>{t.points}pt</span>
        )}

        {isMaxed && (
          <span style={{
            position: 'absolute', top: -3, right: -1,
            fontSize: 6, lineHeight: 1,
            background: `linear-gradient(135deg, ${plasma.glow}, ${plasma.core})`,
            borderRadius: 3, padding: '1px 2px', color: '#fff', fontWeight: 800,
            boxShadow: `0 0 4px ${plasma.mid}`,
          }}>MAX</span>
        )}
      </div>
    </div>
  );
});

// =====================================================================
// 雷光エッジ（一閃版：1〜2粒の独立エネルギー塊）
// =====================================================================
interface LightningEdgeData {
  color:    string;
  bright:   string;
  width:    number;
  baseOpacity: number;
  [key: string]: unknown;
}

// 超高速の素数秒パルス周期
const EDGE_PULSE_DURS = [1.3, 1.7, 2.3, 3.1, 3.7];
const EDGE_PULSE_CLASSES = ['edge-pulse-a', 'edge-pulse-b', 'edge-pulse-c'];
// 非対称なdashArrayパターン（1〜2粒の鋭い一閃）
const EDGE_DASH_PATTERNS = [
  '2 120 6 250 3 180',
  '3 200 4 320',
  '2 180 8 260 2 220',
  '5 280 2 340',
];

const LightningEdge = memo(function LightningEdge({
  sourceX, sourceY, targetX, targetY, data, id,
}: EdgeProps) {
  const d = (data ?? {}) as Partial<LightningEdgeData>;
  const color  = d.color  ?? 'rgba(99,102,241,0.6)';
  const bright = d.bright ?? '#c7d2fe';
  const width  = d.width  ?? 1.5;
  const baseOpacity = d.baseOpacity ?? 0.55;

  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  const { className, duration, delay, dashArray } = useMemo(() => {
    const h = hashString(id);
    const cls = EDGE_PULSE_CLASSES[h % EDGE_PULSE_CLASSES.length];
    const dur = EDGE_PULSE_DURS[(h >> 3) % EDGE_PULSE_DURS.length];
    const dly = -(((h >> 7) % 100) / 100) * dur;
    const da  = EDGE_DASH_PATTERNS[(h >> 11) % EDGE_DASH_PATTERNS.length];
    return { className: cls, duration: dur, delay: dly, dashArray: da };
  }, [id]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: width * 0.6,
          opacity: baseOpacity * 0.3,
        }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke={bright}
        strokeWidth={width * 1.1}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        opacity={0}
        className={className}
        style={{
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          filter: `url(#lightning-filter-tier2) drop-shadow(0 0 4px ${bright})`,
        }}
      />
    </>
  );
});

// =====================================================================
// 種別登録
// =====================================================================
const NODE_TYPES: NodeTypes = {
  coreNode: CoreNode,
  bodyPartNode: BodyPartNode,
  techniqueNode: TechniqueNode,
};

const EDGE_TYPES: EdgeTypes = {
  lightning: LightningEdge,
};

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

    const bpTheme = getBpTheme(bp);

    edges.push({
      id: `e-${bpId}-core`,
      source: bpId,
      target: 'core',
      type: 'lightning',
      data: {
        color:  `rgba(${bpTheme.rgb},${(0.55 + bpNorm * 0.35).toFixed(2)})`,
        bright: bpTheme.plasma.core,
        width:  Math.max(1.5, 1.8 + bpNorm * 1.5),
        baseOpacity: 0.55 + bpNorm * 0.35,
      } as unknown as Record<string, unknown>,
    });

    techs.forEach(tech => {
      const techId      = `tech-${tech.id}`;
      const norm        = Math.min((tech.points ?? 0) / TECH_SCORE_CAP, 1.0);
      const techTheme   = getBpTheme(tech.bodyPart);

      edges.push({
        id: `e-${techId}-${bpId}`,
        source: techId,
        target: bpId,
        type: 'lightning',
        data: {
          color:  `rgba(${techTheme.rgb},${(0.45 + norm * 0.4).toFixed(2)})`,
          bright: techTheme.plasma.mid,
          width:  Math.max(1, 1.2 + norm * 1.2),
          baseOpacity: 0.4 + norm * 0.4,
        } as unknown as Record<string, unknown>,
      });
    });
  });

  return { nodes, edges, techActionMap };
}

// =====================================================================
// フィルター
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
      if (e.target === 'core') return e;
      const match = (techActionMap[e.source] ?? '') === filter;
      return { ...e, style: { ...(e.style ?? {}), opacity: match ? 1 : 0.08 } };
    }),
  };
}

// =====================================================================
// CSS キーフレーム
// =====================================================================
const KEYFRAMES = `
  /* ===== Edge：3種類の不規則リズム（超高速・長い待機＋鋭い一閃） ===== */
  @keyframes edge-pulse-a {
    0%        { stroke-dashoffset: 80; opacity: 0; }
    80%       { opacity: 0; }
    82%       { opacity: 1; }
    84%       { opacity: 0.15; }
    86%       { opacity: 0.95; }
    88%       { opacity: 0.3; }
    90%       { opacity: 0; }
    100%      { stroke-dashoffset: 0; opacity: 0; }
  }
  .edge-pulse-a {
    animation-name: edge-pulse-a;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
    will-change: stroke-dashoffset, opacity;
  }

  @keyframes edge-pulse-b {
    0%        { stroke-dashoffset: 80; opacity: 0; }
    88%       { opacity: 0; }
    90%       { opacity: 1; }
    92%       { opacity: 0.4; }
    94%       { opacity: 0; }
    100%      { stroke-dashoffset: 0; opacity: 0; }
  }
  .edge-pulse-b {
    animation-name: edge-pulse-b;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
    will-change: stroke-dashoffset, opacity;
  }

  @keyframes edge-pulse-c {
    0%        { stroke-dashoffset: 80; opacity: 0; }
    70%       { opacity: 0; }
    72%       { opacity: 0.6; }
    74%       { opacity: 0.05; }
    76%       { opacity: 0; }
    90%       { opacity: 0; }
    92%       { opacity: 1; }
    94%       { opacity: 0.5; }
    96%       { opacity: 0; }
    100%      { stroke-dashoffset: 0; opacity: 0; }
  }
  .edge-pulse-c {
    animation-name: edge-pulse-c;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
    will-change: stroke-dashoffset, opacity;
  }

  /* ===== Aura：衛星旋回（自転） ===== */
  @keyframes aura-spin {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .aura-spin {
    animation-name: aura-spin;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
    transform-origin: center;
    transform-box: fill-box;
    will-change: transform;
  }

  /* ===== Aura：間欠クラック明滅（普段は消灯、一瞬だけ鋭く光る） ===== */
  @keyframes aura-crack-flash-a {
    0%, 88%   { opacity: 0; }
    90%       { opacity: 1; }
    92%       { opacity: 0.1; }
    94%       { opacity: 0.85; }
    97%       { opacity: 0; }
    100%      { opacity: 0; }
  }
  .aura-crack-flash-a {
    animation: aura-crack-flash-a 4.3s linear infinite;
    will-change: opacity;
  }

  @keyframes aura-crack-flash-b {
    0%, 91%   { opacity: 0; }
    93%       { opacity: 0.95; }
    95%       { opacity: 0.05; }
    97%       { opacity: 0.8; }
    100%      { opacity: 0; }
  }
  .aura-crack-flash-b {
    animation: aura-crack-flash-b 6.7s linear infinite;
    animation-delay: -1.9s;
    will-change: opacity;
  }

  /* ===== 得意技バッジ ===== */
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
    .edge-pulse-a,
    .edge-pulse-b,
    .edge-pulse-c,
    .aura-spin,
    .aura-crack-flash-a,
    .aura-crack-flash-b,
    .signature-star-badge {
      animation: none !important;
    }
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
      <SharedLightningFilters />

      {signatureTech && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '6px 14px', borderRadius: 10,
          background: 'linear-gradient(90deg, rgba(30,27,75,0.55), rgba(30,27,75,0.18))',
          border: '1px solid rgba(253,224,71,0.4)',
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
          background: 'rgba(30,27,75,0.35)', border: '1px solid rgba(129,140,248,0.3)', width: 'fit-content',
        }}>
          <span style={{ fontSize: 11 }}>⚡</span>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(199,210,254,0.8)', letterSpacing: '0.08em' }}>MAX到達: {maxedCount}技</span>
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
          nodes={nodes} edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
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
