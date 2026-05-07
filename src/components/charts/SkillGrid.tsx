'use client';

// =====================================================================
// SkillGrid.tsx — サイバー八卦陣（Phase 6.4 階調炎リビジョン）
//
// ★ Phase 6.4 の変更点:
//   - 得意技は色を通常と同じにし、★バッジのみで判別
//   - TECH_SCORE_CAP = 1000 / BP_SCORE_CAP = 5000 に変更
//   - 炎の大きさを 5 段階の閾値（Tier）で階層化
//     Tier0: 0-50pt(なし) / Tier1: 50-200 / Tier2: 200-500
//     Tier3: 500-1000 / Tier4: 1000+ (MAX)
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
//   ポイントを「離散的な階層」に変換することで、
//   発火するアニメーションのバリエーションを限定し、
//   GPU/CPU負荷を抑制する。
// =====================================================================
type FlameTier = 0 | 1 | 2 | 3 | 4;

/** ポイント→Tier 変換 */
function pointsToTier(points: number): FlameTier {
  if (points >= 1000) return 4;  // MAX
  if (points >= 500)  return 3;  // 上級
  if (points >= 200)  return 2;  // 中級
  if (points >= 50)   return 1;  // 初級
  return 0;                       // 未習得
}

/** Tier→炎スケール */
const TIER_SCALE: Record<FlameTier, number> = {
  0: 0,      // 描画なし
  1: 0.55,
  2: 0.80,
  3: 1.00,
  4: 1.20,
};

/** Tier→不透明度 */
const TIER_OPACITY: Record<FlameTier, number> = {
  0: 0,
  1: 0.55,
  2: 0.72,
  3: 0.85,
  4: 0.92,
};

// =====================================================================
// 部位カラーテーマ
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
    flame: { hot: '#fff5f5', mid: '#f87171', cool: '#7f1d1d' },
  },
  '小手': {
    rgb: '253,224,71', dark: '#713f12', text: '#fef9c3',
    flame: { hot: '#fffbeb', mid: '#fde047', cool: '#78350f' },
  },
  '胴':   {
    rgb: '56,189,248', dark: '#0c4a6e', text: '#bae6fd',
    flame: { hot: '#f0f9ff', mid: '#38bdf8', cool: '#0c4a6e' },
  },
  '突き': {
    rgb: '167,139,250', dark: '#4c1d95', text: '#ede9fe',
    flame: { hot: '#faf5ff', mid: '#a78bfa', cool: '#4c1d95' },
  },
};

const DEFAULT_THEME: BpTheme = {
  rgb: '99,102,241', dark: '#1e1b4b', text: '#c7d2fe',
  flame: { hot: '#eef2ff', mid: '#818cf8', cool: '#1e1b4b' },
};

function getBpTheme(bodyPart: string): BpTheme {
  return BP_THEMES[bodyPart] ?? DEFAULT_THEME;
}

const FLAME_MAXED: BpTheme['flame'] = { hot: '#fffbeb', mid: '#fbbf24', cool: '#78350f' };

// =====================================================================
// 共有フィルタ ID（Tier別）
// =====================================================================
const SHARED_FILTER_IDS: Record<FlameTier, string> = {
  0: '',
  1: 'flame-soft-tier1',
  2: 'flame-soft-tier2',
  3: 'flame-soft-tier3',
  4: 'flame-soft-tier4',
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
// 共有フィルタ定義（Tier別に控えめな揺らぎ）
// =====================================================================
const SharedFlameFilters = memo(() => (
  <svg
    width="0" height="0"
    style={{ position: 'absolute', pointerEvents: 'none' }}
    aria-hidden="true"
  >
    <defs>
      {/* Tier1：ほのかな揺らぎ */}
      <filter id={SHARED_FILTER_IDS[1]} x="-30%" y="-40%" width="160%" height="180%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.04" numOctaves="1" seed="3" result="n">
          <animate attributeName="baseFrequency"
            dur="7s" values="0.02 0.04; 0.025 0.05; 0.02 0.04" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      {/* Tier2：穏やかなメラメラ */}
      <filter id={SHARED_FILTER_IDS[2]} x="-35%" y="-50%" width="170%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.022 0.045" numOctaves="1" seed="7" result="n">
          <animate attributeName="baseFrequency"
            dur="6s" values="0.022 0.045; 0.028 0.058; 0.022 0.045" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      {/* Tier3：はっきりとしたメラメラ */}
      <filter id={SHARED_FILTER_IDS[3]} x="-40%" y="-60%" width="180%" height="220%">
        <feTurbulence type="fractalNoise" baseFrequency="0.024 0.05" numOctaves="1" seed="13" result="n">
          <animate attributeName="baseFrequency"
            dur="5s" values="0.024 0.05; 0.032 0.065; 0.024 0.05" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="10" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      {/* Tier4：力強くも上品なメラメラ */}
      <filter id={SHARED_FILTER_IDS[4]} x="-45%" y="-65%" width="190%" height="230%">
        <feTurbulence type="fractalNoise" baseFrequency="0.026 0.055" numOctaves="1" seed="19" result="n">
          <animate attributeName="baseFrequency"
            dur="4.5s" values="0.026 0.055; 0.036 0.072; 0.026 0.055" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>
));
SharedFlameFilters.displayName = 'SharedFlameFilters';

// =====================================================================
// 静謐な炎コンポーネント（Tier駆動）
// =====================================================================
interface FlameAuraProps {
  size:      number;
  tier:      FlameTier;
  flame:     BpTheme['flame'];
  uid:       string;
  /** 部位ノード等で、追加で炎全体を拡縮したい場合 */
  baseScale?: number;
}

const FlameAura = memo(function FlameAura({
  size, tier, flame, uid, baseScale = 1.0,
}: FlameAuraProps) {
  if (tier === 0) return null;

  const tierScale = TIER_SCALE[tier];
  const tierOpacity = TIER_OPACITY[tier];
  const totalScale = tierScale * baseScale;

  // ノードに寄り添う控えめなキャンバス
  const padX      = size * 0.45 * totalScale;
  const padTop    = size * 0.6  * totalScale;
  const padBottom = size * 0.3  * totalScale;
  const w = size + padX * 2;
  const h = size + padTop + padBottom;

  const cx = w / 2;
  const baseY = size / 2 + padTop;

  // Tierに応じたサイズ
  const flameWidth  = size * (0.5 + tierScale * 0.35);
  const flameHeight = size * (0.6 + tierScale * 0.7);

  const gradId   = `fg-${uid}`;
  const innerId  = `fg-inner-${uid}`;
  const filterId = SHARED_FILTER_IDS[tier];

  // Tierに応じたアニメ周期（強いほど少し速い）
  const breatheDur = 5.0 - tier * 0.4;
  const flickerDur = 3.0 - tier * 0.2;

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
        zIndex: 0,
        overflow: 'visible',
      }}
      aria-hidden="true"
    >
      <defs>
        {/* 外側の炎 */}
        <radialGradient id={gradId} cx="50%" cy="75%" r="60%" fx="50%" fy="80%">
          <stop offset="0%"   stopColor={flame.hot}  stopOpacity="0.85" />
          <stop offset="35%"  stopColor={flame.mid}  stopOpacity="0.6" />
          <stop offset="75%"  stopColor={flame.cool} stopOpacity="0.2" />
          <stop offset="100%" stopColor={flame.cool} stopOpacity="0" />
        </radialGradient>

        {/* 内側の灯心 */}
        <radialGradient id={innerId} cx="50%" cy="70%" r="45%">
          <stop offset="0%"   stopColor={flame.hot} stopOpacity="0.75" />
          <stop offset="60%"  stopColor={flame.mid} stopOpacity="0.35" />
          <stop offset="100%" stopColor={flame.mid} stopOpacity="0" />
        </radialGradient>
      </defs>

      <g filter={`url(#${filterId})`} opacity={tierOpacity}>
        <g
          className="flame-soft-breathe"
          style={{
            transformOrigin: `${cx}px ${baseY}px`,
            animationDuration: `${breatheDur}s`,
          }}
        >
          <ellipse
            cx={cx}
            cy={baseY - flameHeight * 0.2}
            rx={flameWidth}
            ry={flameHeight * 0.65}
            fill={`url(#${gradId})`}
          />
        </g>

        <g
          className="flame-soft-flicker"
          style={{
            transformOrigin: `${cx}px ${baseY}px`,
            animationDuration: `${flickerDur}s`,
          }}
        >
          <ellipse
            cx={cx}
            cy={baseY - flameHeight * 0.1}
            rx={flameWidth * 0.5}
            ry={flameHeight * 0.4}
            fill={`url(#${innerId})`}
          />
        </g>
      </g>
    </svg>
  );
});

// =====================================================================
// CORE ノード
// =====================================================================
const CoreNode = memo(function CoreNode(_: NodeProps) {
  const s = CORE_NODE_SIZE;
  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%)',
      border: '2px solid rgba(129,140,248,0.7)',
      boxShadow: '0 0 12px 4px rgba(99,102,241,0.55), 0 0 0 1px rgba(129,140,248,0.3), inset 0 0 12px rgba(99,102,241,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#e0e7ff', fontSize: 15, fontWeight: 800,
      letterSpacing: '0.1em',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none', zIndex: 2,
    }}>
      <FlameAura size={s} tier={3} flame={DEFAULT_THEME.flame} uid="core" baseScale={0.85} />
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
  tier:        FlameTier;
}

const BodyPartNode = memo(function BodyPartNode({ data, id }: NodeProps) {
  const d = data as unknown as BodyPartData;
  const s = BP_NODE_SIZE;
  const isMaxed = d.norm >= 1.0;
  const theme = getBpTheme(d.label);
  const { rgb, dark, text: bpText } = theme;

  const flame = isMaxed ? FLAME_MAXED : theme.flame;

  const bg = isMaxed
    ? 'linear-gradient(135deg, #78350f, #b45309, #d97706)'
    : d.norm > 0.5
    ? `linear-gradient(135deg, ${dark}, rgba(${rgb},0.35))`
    : `linear-gradient(135deg, #0a0814, ${dark})`;

  const borderColor = isMaxed
    ? 'rgba(251,191,36,0.7)'
    : d.norm > 0.5
    ? `rgba(${rgb},0.65)`
    : `rgba(${rgb},0.35)`;

  const textColor = isMaxed ? '#fde68a' : bpText;
  const ptColor   = isMaxed ? '#fde68a' : `rgba(${rgb},0.75)`;

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: bg, border: `1.5px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#e0e7ff', textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none',
    }}>
      <FlameAura size={s} tier={d.tier} flame={flame} uid={`bp-${id}`} baseScale={1.0} />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <MinimalHandles />
        <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2, letterSpacing: '0.04em', color: textColor }}>
          {d.label}
        </span>
        {d.totalPoints > 0 && (
          <span style={{ fontSize: 8, opacity: 0.75, marginTop: 1, color: ptColor }}>
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

  const flame = isMaxed ? FLAME_MAXED : theme.flame;

  // 得意技は色を通常技と同じに（★マークだけで識別）
  let bg: string, borderColor: string, textColor: string;
  if (isMaxed) {
    bg = 'linear-gradient(135deg, #78350f, #b45309)';
    borderColor = 'rgba(251,191,36,0.65)'; textColor = '#fde68a';
  } else if (tier >= 3) {
    bg = `linear-gradient(135deg, ${dark}, rgba(${rgb},0.38))`;
    borderColor = `rgba(${rgb},0.68)`; textColor = bpText;
  } else if (tier >= 2) {
    bg = `linear-gradient(135deg, #070514, ${dark})`;
    borderColor = `rgba(${rgb},0.42)`; textColor = bpText;
  } else if (tier >= 1) {
    bg = `linear-gradient(135deg, #06050f, #0d0b1a)`;
    borderColor = `rgba(${rgb},0.22)`; textColor = `rgba(${rgb},0.55)`;
  } else {
    bg = '#06050f';
    borderColor = `rgba(${rgb},0.10)`; textColor = `rgba(${rgb},0.25)`;
  }

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: bg, border: `1.5px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: textColor, textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none',
    }}>
      <FlameAura size={s} tier={tier} flame={flame} uid={`tech-${id}`} baseScale={1.0} />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <MinimalHandles />

        {/* 得意技：星バッジ（色は通常と同じ・★だけで識別） */}
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
        }}>
          {t.name}
        </span>
        {(t.points ?? 0) > 0 && (
          <span style={{ fontSize: 7, opacity: 0.75, marginTop: 1 }}>{t.points}pt</span>
        )}

        {isMaxed && (
          <span style={{
            position: 'absolute', top: -3, right: -1,
            fontSize: 6, lineHeight: 1,
            background: 'linear-gradient(135deg, #b45309, #fbbf24)',
            borderRadius: 3, padding: '1px 2px', color: '#fff', fontWeight: 800,
            boxShadow: '0 0 4px rgba(251,191,36,0.7)',
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
  const bodyParts = Object.keys(byBodyPart).sort(
    (a, b) => byBodyPart[b].reduce((s, t) => s + (t.points ?? 0), 0)
            - byBodyPart[a].reduce((s, t) => s + (t.points ?? 0), 0)
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

    const totalPts = techs.reduce((s, t) => s + (t.points ?? 0), 0);
    const bpNorm   = Math.min(totalPts / BP_SCORE_CAP, 1.0);
    const hs       = BP_NODE_SIZE / 2;
    const bpId     = `bp-${bi}`;

    // 部位ノードの炎Tierも閾値設計：BP_SCORE_CAP=5000 を 5段階に
    let bpTier: FlameTier;
    if (totalPts >= 5000)      bpTier = 4;
    else if (totalPts >= 2500) bpTier = 3;
    else if (totalPts >= 1000) bpTier = 2;
    else if (totalPts >= 250)  bpTier = 1;
    else                        bpTier = 0;

    const sinSum   = techs.reduce((s, t) => s + Math.sin(techAngles[t.id]), 0);
    const cosSum   = techs.reduce((s, t) => s + Math.cos(techAngles[t.id]), 0);
    const avgAngle = Math.atan2(sinSum, cosSum);

    nodes.push({
      id: bpId, type: 'bodyPartNode',
      position: { x: R_MID * Math.cos(avgAngle) - hs, y: R_MID * Math.sin(avgAngle) - hs },
      data: { label: bp, totalPoints: totalPts, norm: bpNorm, tier: bpTier } as unknown as Record<string, unknown>,
    });

    const { rgb: bpRgb } = getBpTheme(bp);
    const bpEdgeColor = bpNorm >= 1.0
      ? '#fbbf24'
      : `rgba(${bpRgb},${(0.5 + bpNorm * 0.4).toFixed(2)})`;
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
      const isMaxed     = (tech.points ?? 0) >= TECH_SCORE_CAP;
      const { rgb }     = getBpTheme(tech.bodyPart);
      const edgeColor   = isMaxed
        ? '#d97706'
        : `rgba(${rgb},${(0.35 + norm * 0.55).toFixed(2)})`;

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
  @keyframes flame-soft-breathe {
    0%, 100% { transform: scale(0.96, 0.97); opacity: 0.88; }
    50%      { transform: scale(1.03, 1.04); opacity: 1; }
  }
  .flame-soft-breathe {
    animation-name: flame-soft-breathe;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: transform, opacity;
  }

  @keyframes flame-soft-flicker {
    0%, 100% { transform: scale(0.94, 0.96); opacity: 0.85; }
    33%      { transform: scale(1.05, 1.03); opacity: 1; }
    66%      { transform: scale(0.98, 1.02); opacity: 0.9; }
  }
  .flame-soft-flicker {
    animation-name: flame-soft-flicker;
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
    .flame-soft-breathe,
    .flame-soft-flicker,
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
      <SharedFlameFilters />

      {/* 得意技バナー */}
      {signatureTech && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '6px 14px', borderRadius: 10,
          background: 'linear-gradient(90deg, rgba(120,53,15,0.32), rgba(120,53,15,0.12))',
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

      {/* MAXカウンター */}
      {maxedCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
          padding: '4px 12px', borderRadius: 8,
          background: 'rgba(120,53,15,0.15)', border: '1px solid rgba(251,191,36,0.2)', width: 'fit-content',
        }}>
          <span style={{ fontSize: 11 }}>🏆</span>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(251,191,36,0.65)', letterSpacing: '0.08em' }}>MAX到達: {maxedCount}技</span>
          <span style={{ fontSize: '0.62rem', color: 'rgba(251,191,36,0.38)', marginLeft: 2 }}>({TECH_SCORE_CAP}pt以上)</span>
        </div>
      )}

      {/* フィルターボタン */}
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

      {/* スキルグリッド本体 */}
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

      {/* 凡例 */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', flexShrink: 0, boxShadow: `0 0 5px 1px #fbbf24` }} />
          <span style={{ fontSize: '0.62rem', color: 'rgba(199,210,254,0.55)', fontWeight: 600 }}>MAX</span>
        </div>
      </div>
    </div>
  );
}
