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
// 1. ノードデータ型
// =====================================================================
type CoreData     = Record<string, never>;
type CategoryData = { label: string };
type TechData     = { technique: Technique; norm: number };  // norm: 0〜1

// =====================================================================
// 2. カスタムノードコンポーネント
// =====================================================================
const H = { opacity: 0, width: 6, height: 6 } as React.CSSProperties;

function CoreNode(_: NodeProps) {
  return (
    <div style={{
      width: 72, height: 72, borderRadius: '50%',
      background: 'linear-gradient(135deg,#1e1b4b,#312e81)',
      border: '3px solid #818cf8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
      boxShadow: '0 0 28px rgba(99,102,241,0.7)',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
    }}>
      <Handle type="source" position={Position.Top}    style={H} />
      <Handle type="source" position={Position.Right}  style={H} />
      <Handle type="source" position={Position.Bottom} style={H} />
      <Handle type="source" position={Position.Left}   style={H} />
      CORE
    </div>
  );
}

function CategoryNode({ data }: NodeProps) {
  const d = data as unknown as CategoryData;
  return (
    <div style={{
      padding: '7px 16px', borderRadius: 20,
      background: '#1e1b4b', border: '2px solid #818cf8',
      color: '#c7d2fe', fontSize: 12, fontWeight: 800,
      whiteSpace: 'nowrap',
      boxShadow: '0 4px 16px rgba(30,27,75,0.6), 0 0 0 1px rgba(129,140,248,0.2)',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
    }}>
      <Handle type="target" position={Position.Top}    style={H} />
      <Handle type="target" position={Position.Right}  style={H} />
      <Handle type="target" position={Position.Bottom} style={H} />
      <Handle type="target" position={Position.Left}   style={H} />
      <Handle type="source" position={Position.Top}    id="st" style={H} />
      <Handle type="source" position={Position.Right}  id="sr" style={H} />
      <Handle type="source" position={Position.Bottom} id="sb" style={H} />
      <Handle type="source" position={Position.Left}   id="sl" style={H} />
      {d.label}
    </div>
  );
}

function TechniqueNode({ data }: NodeProps) {
  const { technique: t, norm } = data as unknown as TechData;

  // Points に応じてサイズ・色・輝きを変化
  const size = Math.round(42 + norm * 30);  // 42 〜 72 px
  const bg =
    norm > 0.75 ? 'linear-gradient(135deg,#b45309,#f59e0b)' :
    norm > 0.4  ? 'linear-gradient(135deg,#3730a3,#6366f1)' :
    norm > 0    ? 'linear-gradient(135deg,#1e1b4b,#4f46e5)' :
                  '#1a1a2e';
  const borderColor =
    norm > 0.75 ? '#f59e0b' :
    norm > 0.4  ? '#6366f1' : '#312e81';
  const glow =
    norm > 0.75 ? '0 0 18px rgba(245,158,11,0.7)' :
    norm > 0.4  ? '0 0 12px rgba(99,102,241,0.5)' : 'none';
  const textColor = norm > 0 ? '#fff' : '#4a4870';

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, border: `2px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: textColor, textAlign: 'center',
      boxShadow: glow,
      padding: 4,
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      cursor: 'default',
    }}>
      <Handle type="target" position={Position.Top}    style={H} />
      <Handle type="target" position={Position.Right}  style={H} />
      <Handle type="target" position={Position.Bottom} style={H} />
      <Handle type="target" position={Position.Left}   style={H} />
      <span style={{ fontSize: Math.max(7, size * 0.13), fontWeight: 700, lineHeight: 1.25, wordBreak: 'break-all', maxWidth: size - 8 }}>
        {t.name}
      </span>
      {t.points > 0 && (
        <span style={{ fontSize: Math.max(6, size * 0.11), opacity: 0.75, marginTop: 1 }}>
          {t.points}pt
        </span>
      )}
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  coreNode:      CoreNode,
  categoryNode:  CategoryNode,
  techniqueNode: TechniqueNode,
};

// =====================================================================
// 3. ノード・エッジ配置アルゴリズム
// =====================================================================
const CAT_R        = 200;   // COREからカテゴリノードまでの距離
const TECH_R_START = 380;   // カテゴリノードからの技ノード基準距離
const TECH_SPREAD  = 110;   // 技ノードの横方向スペース

function buildGraph(techniques: Technique[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // SubCategory でグループ化（なければ actionType → bodyPart → '未分類'）
  const byCat: Record<string, Technique[]> = {};
  techniques.forEach(t => {
    const cat = t.subCategory || t.actionType || t.bodyPart || '未分類';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(t);
  });

  const cats    = Object.keys(byCat);
  const N       = cats.length;
  const maxPts  = Math.max(...techniques.map(t => t.points), 1);

  // CORE ノード（中心）
  nodes.push({ id: 'core', type: 'coreNode', position: { x: -36, y: -36 }, data: {} });

  cats.forEach((cat, ci) => {
    // カテゴリを12時方向から時計回りに配置
    const angle  = (ci / N) * 2 * Math.PI - Math.PI / 2;
    const cos    = Math.cos(angle);
    const sin    = Math.sin(angle);

    // ───── カテゴリノード ─────
    const catId = `cat-${ci}`;
    nodes.push({
      id: catId, type: 'categoryNode',
      position: { x: cos * CAT_R - 45, y: sin * CAT_R - 18 },
      data: { label: cat } as unknown as Record<string, unknown>,
    });
    edges.push({
      id: `e-core-${catId}`, source: 'core', target: catId,
      type: 'straight',
      style: { stroke: '#4f46e5', strokeWidth: 2, opacity: 0.6 },
    });

    // ───── 技ノード ─────
    const techs  = [...byCat[cat]].sort((a, b) => b.points - a.points);
    const total  = techs.length;

    // 垂直方向（放射方向に直交）の単位ベクトル
    const pCos   = Math.cos(angle + Math.PI / 2);
    const pSin   = Math.sin(angle + Math.PI / 2);

    techs.forEach((tech, ti) => {
      // 中央揃えで横に並べる
      const spreadIdx  = ti - (total - 1) / 2;
      // 技が多い場合は奥方向にも広げる（5個ごとに1段）
      const depthOffset = Math.floor(ti / 5) * 120;
      const radDist     = TECH_R_START + depthOffset;

      const tx   = cos  * radDist + pCos * spreadIdx * TECH_SPREAD;
      const ty   = sin  * radDist + pSin * spreadIdx * TECH_SPREAD;
      const norm = tech.points / maxPts;
      const sz   = Math.round(42 + norm * 30);

      const techId = `tech-${tech.id}`;
      nodes.push({
        id: techId, type: 'techniqueNode',
        position: { x: tx - sz / 2, y: ty - sz / 2 },
        data: { technique: tech, norm } as unknown as Record<string, unknown>,
      });

      const strokeColor =
        norm > 0.75 ? '#f59e0b' :
        norm > 0.4  ? '#6366f1' : '#312e81';
      const strokeWidth = Math.max(1, Math.round(1 + norm * 4));

      edges.push({
        id: `e-${catId}-${techId}`,
        source: catId, target: techId,
        type: 'straight',
        style: { stroke: strokeColor, strokeWidth, opacity: 0.55 + norm * 0.45 },
      });
    });
  });

  return { nodes, edges };
}

// =====================================================================
// 4. メインコンポーネント
// =====================================================================
export default function SkillGrid({ techniques }: Props) {
  const { nodes, edges } = useMemo(() => buildGraph(techniques), [techniques]);

  if (!techniques.length) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#a8a29e', fontSize: '0.85rem' }}>
        技を評価するとスキルグリッドが表示されます
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', height: 480,
      borderRadius: 16, overflow: 'hidden',
      background: '#080718',
      /* react-flow のデフォルト白背景を上書き */
    }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        minZoom={0.2}
        maxZoom={3}
        colorMode="dark"
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="#1e1b4b"
          gap={28}
          size={1.5}
        />
        <Controls
          showInteractive={false}
          style={{ background: '#1e1b4b', border: '1px solid #312e81' }}
        />
      </ReactFlow>
    </div>
  );
}
