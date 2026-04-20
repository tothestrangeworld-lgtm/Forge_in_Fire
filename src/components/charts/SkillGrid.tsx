'use client';

import { useMemo } from 'react';
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

interface Props { techniques: Technique[]; }

// =====================================================================
// ハンドル（不可視・全方向）
// =====================================================================
const H = { opacity: 0, width: 6, height: 6 } as React.CSSProperties;

const AllHandles = () => (
  <>
    <Handle type="source" position={Position.Top}    style={H} />
    <Handle type="source" position={Position.Right}  style={H} />
    <Handle type="source" position={Position.Bottom} style={H} />
    <Handle type="source" position={Position.Left}   style={H} />
    <Handle type="target" position={Position.Top}    style={H} />
    <Handle type="target" position={Position.Right}  style={H} />
    <Handle type="target" position={Position.Bottom} style={H} />
    <Handle type="target" position={Position.Left}   style={H} />
  </>
);

// =====================================================================
// カスタムノード① CORE（中心）
// =====================================================================
function CoreNode(_: NodeProps) {
  return (
    <div style={{
      width: 76, height: 76, borderRadius: '50%',
      background: 'linear-gradient(135deg,#1e1b4b,#312e81)',
      border: '3px solid #818cf8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em',
      boxShadow: '0 0 32px rgba(99,102,241,0.8)',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      flexShrink: 0,
    }}>
      <AllHandles />
      CORE
    </div>
  );
}

// =====================================================================
// カスタムノード② BodyPart（第1階層）
// =====================================================================
interface BodyPartData { label: string; totalPoints: number; norm: number; }

function BodyPartNode({ data }: NodeProps) {
  const d = data as unknown as BodyPartData;

  // ポイントに応じてサイズ・グロー
  const size        = Math.round(62 + d.norm * 28);  // 62〜90 px
  const borderColor = d.norm > 0.6 ? '#f59e0b' : d.norm > 0.2 ? '#818cf8' : '#4f46e5';
  const glow        = d.norm > 0.6
    ? '0 0 22px rgba(245,158,11,0.7)'
    : d.norm > 0.2 ? '0 0 16px rgba(129,140,248,0.6)' : '0 0 8px rgba(99,102,241,0.3)';
  const bg = d.norm > 0.6
    ? 'linear-gradient(135deg,#92400e,#d97706)'
    : 'linear-gradient(135deg,#1e1b4b,#4338ca)';

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, border: `2.5px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: '#fff', textAlign: 'center', padding: 4,
      boxShadow: glow,
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
    }}>
      <AllHandles />
      <span style={{ fontSize: Math.max(10, size * 0.175), fontWeight: 800, lineHeight: 1.2 }}>
        {d.label}
      </span>
      {d.totalPoints > 0 && (
        <span style={{ fontSize: Math.max(8, size * 0.13), opacity: 0.8, marginTop: 1 }}>
          {d.totalPoints}pt
        </span>
      )}
    </div>
  );
}

// =====================================================================
// カスタムノード③ Name（第2階層：具体的な技）
// =====================================================================
interface TechData { technique: Technique; norm: number; }

function TechniqueNode({ data }: NodeProps) {
  const { technique: t, norm } = data as unknown as TechData;

  const size = Math.round(40 + norm * 26);  // 40〜66 px
  const bg =
    norm > 0.75 ? 'linear-gradient(135deg,#b45309,#f59e0b)' :
    norm > 0.4  ? 'linear-gradient(135deg,#3730a3,#6366f1)' :
    norm > 0    ? 'linear-gradient(135deg,#1e1b4b,#4f46e5)' : '#111128';
  const borderColor = norm > 0.75 ? '#f59e0b' : norm > 0.4 ? '#6366f1' : '#312e81';
  const glow =
    norm > 0.75 ? '0 0 14px rgba(245,158,11,0.65)' :
    norm > 0.4  ? '0 0 10px rgba(99,102,241,0.5)' : 'none';

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, border: `2px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: norm > 0 ? '#fff' : '#4a4870',
      textAlign: 'center', padding: 3,
      boxShadow: glow,
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
    }}>
      <AllHandles />
      <span style={{ fontSize: Math.max(7, size * 0.14), fontWeight: 700, lineHeight: 1.2, wordBreak: 'break-all', maxWidth: size - 6 }}>
        {t.name}
      </span>
      {t.points > 0 && (
        <span style={{ fontSize: Math.max(6, size * 0.11), opacity: 0.7, marginTop: 1 }}>
          {t.points}pt
        </span>
      )}
    </div>
  );
}

// =====================================================================
// ノード種別登録
// =====================================================================
const NODE_TYPES: NodeTypes = {
  coreNode:      CoreNode,
  bodyPartNode:  BodyPartNode,
  techniqueNode: TechniqueNode,
};

// =====================================================================
// グラフ生成ロジック
// =====================================================================
const BODY_PART_R  = 220;  // COREから第1階層への距離
const TECH_R_BASE  = 170;  // 第1階層から第2階層への基本距離
const TECH_R_EXTRA = 60;   // 技が多いほど奥に伸ばす追加距離/列
const TECH_SPREAD  = 95;   // 技の横間隔

function buildGraph(techniques: Technique[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // BodyPart ごとに技をグループ化
  const byBodyPart: Record<string, Technique[]> = {};
  techniques.forEach(t => {
    const bp = t.bodyPart || '未分類';
    if (!byBodyPart[bp]) byBodyPart[bp] = [];
    byBodyPart[bp].push(t);
  });

  const bodyParts  = Object.keys(byBodyPart);
  const N          = bodyParts.length;
  const maxBpPts   = Math.max(
    ...bodyParts.map(bp => byBodyPart[bp].reduce((s, t) => s + t.points, 0)), 1
  );
  const maxTechPts = Math.max(...techniques.map(t => t.points), 1);

  // ── CORE ──────────────────────────────────────────────
  nodes.push({
    id: 'core', type: 'coreNode',
    position: { x: -38, y: -38 },
    data: {},
  });

  // ── 第1階層・第2階層 ────────────────────────────────
  bodyParts.forEach((bp, bi) => {
    // BodyPart を12時方向から等間隔に配置
    const bpAngle = (bi / N) * 2 * Math.PI - Math.PI / 2;
    const bpCos   = Math.cos(bpAngle);
    const bpSin   = Math.sin(bpAngle);

    const totalPts = byBodyPart[bp].reduce((s, t) => s + t.points, 0);
    const bpNorm   = totalPts / maxBpPts;
    const bpSize   = Math.round(62 + bpNorm * 28);
    const bpX      = bpCos * BODY_PART_R - bpSize / 2;
    const bpY      = bpSin * BODY_PART_R - bpSize / 2;
    const bpId     = `bp-${bi}`;

    nodes.push({
      id: bpId, type: 'bodyPartNode',
      position: { x: bpX, y: bpY },
      data: { label: bp, totalPoints: totalPts, norm: bpNorm } as unknown as Record<string, unknown>,
    });

    // CORE → BodyPart エッジ
    const bpEdgeWidth = Math.max(2, Math.round(2 + bpNorm * 4));
    const bpEdgeColor = bpNorm > 0.6 ? '#d97706' : '#4f46e5';
    edges.push({
      id: `e-core-${bpId}`, source: 'core', target: bpId,
      type: 'straight',
      style: { stroke: bpEdgeColor, strokeWidth: bpEdgeWidth, opacity: 0.55 + bpNorm * 0.45 },
    });

    // ── 第2階層（技ノード）───────────────────────────
    const techs = [...byBodyPart[bp]].sort((a, b) => b.points - a.points);
    const total = techs.length;

    // BodyPart の放射方向に直交する単位ベクトル（横方向）
    const perpCos = Math.cos(bpAngle + Math.PI / 2);
    const perpSin = Math.sin(bpAngle + Math.PI / 2);

    // BodyPart の中心座標（ノードの基準点）
    const bpCenterX = bpCos * BODY_PART_R;
    const bpCenterY = bpSin * BODY_PART_R;

    techs.forEach((tech, ti) => {
      // 奥行き：5個ごとに1列追加
      const col         = Math.floor(ti / 5);
      const rowIdx      = ti % 5;
      const totalInCol  = Math.min(5, total - col * 5);
      const spreadIdx   = rowIdx - (totalInCol - 1) / 2;  // 中央揃え
      const radDist     = TECH_R_BASE + col * TECH_R_EXTRA;

      const techNorm = tech.points / maxTechPts;
      const techSize = Math.round(40 + techNorm * 26);

      const tx = bpCenterX + bpCos * radDist + perpCos * spreadIdx * TECH_SPREAD;
      const ty = bpCenterY + bpSin * radDist + perpSin * spreadIdx * TECH_SPREAD;

      const techId = `tech-${tech.id}`;
      nodes.push({
        id: techId, type: 'techniqueNode',
        position: { x: tx - techSize / 2, y: ty - techSize / 2 },
        data: { technique: tech, norm: techNorm } as unknown as Record<string, unknown>,
      });

      // BodyPart → 技 エッジ
      const edgeColor = techNorm > 0.75 ? '#f59e0b' : techNorm > 0.4 ? '#6366f1' : '#312e81';
      const edgeWidth = Math.max(1, Math.round(1 + techNorm * 3.5));
      edges.push({
        id: `e-${bpId}-${techId}`, source: bpId, target: techId,
        type: 'straight',
        style: { stroke: edgeColor, strokeWidth: edgeWidth, opacity: 0.45 + techNorm * 0.55 },
      });
    });
  });

  return { nodes, edges };
}

// =====================================================================
// メインコンポーネント
// =====================================================================
export default function SkillGrid({ techniques }: Props) {
  const { nodes, edges } = useMemo(() => buildGraph(techniques), [techniques]);

  if (!techniques.length) {
    return (
      <div style={{ textAlign:'center', padding:'2rem 1rem', color:'#a8a29e', fontSize:'0.85rem' }}>
        技データがありません
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', height: 500,
      borderRadius: 16, overflow: 'hidden',
      background: '#07071a',
    }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.0 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        minZoom={0.15}
        maxZoom={3}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} color="#1a1a3a" gap={28} size={1.5} />
        <Controls showInteractive={false} style={{ background:'#1e1b4b', border:'1px solid #312e81' }} />
      </ReactFlow>
    </div>
  );
}
