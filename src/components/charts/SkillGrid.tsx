'use client';

// =====================================================================
// SkillGrid.tsx — サイバー八卦陣（引き算の美学 第4弾：静寂リビジョン）
// =====================================================================

import { memo, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
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
// 習熟度階層
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
// Props
// =====================================================================
interface Props {
  techniques:      Technique[];
  signatureTechId?: string;
}

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
      技
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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

const TechniqueNode = memo(function TechniqueNode({ data }: NodeProps) {
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
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
// 静的な線（LightningEdge を改称・簡略化）
// =====================================================================
interface StaticEdgeData {
  color:    string;
  width:    number;
  baseOpacity: number;
}

const StaticEdge = memo(function StaticEdge({
  sourceX, sourceY, targetX, targetY, data, id,
}: EdgeProps) {
  const d = (data ?? {}) as Partial<StaticEdgeData>;
  const color  = d.color  ?? 'rgba(99,102,241,0.6)';
  const width  = d.width  ?? 1.5;
  const opacity = d.baseOpacity ?? 0.55;

  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: width,
        opacity: opacity,
      }}
    />
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
  static: StaticEdge,
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
    const hs       = BP_NODE_SIZE / 2;
    const bpId     = `bp-${bi}`;

    const sinSum   = techs.reduce((s, t) => s + Math.sin(techAngles[t.id]), 0);
    const cosSum   = techs.reduce((s, t) => s + Math.cos(techAngles[t.id]), 0);
    const avgAngle = Math.atan2(sinSum, cosSum);

    nodes.push({
      id: bpId, type: 'bodyPartNode',
      position: { x: R_MID * Math.cos(avgAngle) - hs, y: R_MID * Math.sin(avgAngle) - hs },
      data: { label: bp, totalPoints: totalPts, norm: bpNorm } as unknown as Record<string, unknown>,
    });

    const bpTheme = getBpTheme(bp);
    edges.push({
      id: `e-${bpId}-core`,
      source: bpId,
      target: 'core',
      type: 'static',
      data: {
        color:  `rgba(${bpTheme.rgb},${(0.55 + bpNorm * 0.35).toFixed(2)})`,
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
        type: 'static',
        data: {
          color:  `rgba(${techTheme.rgb},${(0.45 + norm * 0.4).toFixed(2)})`,
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
  @keyframes signature-star-pop {
    0%   { transform: translateY(-50%) scale(0) rotate(-180deg); opacity: 0; }
    60%  { transform: translateY(-50%) scale(1.4) rotate(20deg); opacity: 1; }
    100% { transform: translateY(-50%) scale(1.0) rotate(0); opacity: 1; }
  }
  @keyframes signature-star-twinkle {
    0%, 100% { color: #fde047; text-shadow: 0 0 4px rgba(0,0,0,0.7), 0 0 6px rgba(253,224,71,0.6); }
    50% { color: #fffbeb; text-shadow: 0 0 4px rgba(0,0,0,0.7), 0 0 12px rgba(253,224,71,0.95); }
  }
  .signature-star-badge {
    animation: signature-star-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both, signature-star-twinkle 2.4s ease-in-out infinite 0.6s;
  }
  .react-flow__controls-button {
    background: rgba(15,14,42,0.95) !important;
    border-color: rgba(99,102,241,0.25) !important;
    fill: rgba(129,140,248,0.8) !important;
  }
  .react-flow__controls-button:hover { background: rgba(49,46,129,0.8) !important; }
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

      {signatureTech && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '6px 14px', borderRadius: 10,
          background: 'linear-gradient(90deg, rgba(30,27,75,0.55), rgba(30,27,75,0.18))',
          border: '1px solid rgba(253,224,71,0.4)',
        }}>
          <span className="signature-star-badge" style={{ fontSize: 16, color: '#fde047', fontWeight: 900, lineHeight: 1, display: 'inline-block' }}>★</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(253,224,71,0.85)', letterSpacing: '0.1em' }}>得意技</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fef9c3', letterSpacing: '0.05em' }}>{signatureTech.name}</span>
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
          <Background variant="dots" color="rgba(99,102,241,0.12)" gap={28} size={1.2} />
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
      </div>
    </div>
  );
}
