'use client';

import { useMemo, useState } from 'react';
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
// Props
// =====================================================================
interface Props {
  techniques:          Technique[];
  /**
   * 得意技ID（例: "T001"）。
   * 一致するノードを黄金色に発光させる「シグネチャームーブ・ハイライト」。
   * ★ NEW: DashboardData.status.favorite_technique を渡す。
   */
  signatureTechId?: string;
}

// =====================================================================
// ハンドル（不可視・全方向）
// =====================================================================
const CENTER_HANDLE: React.CSSProperties = {
  opacity:    0,
  width:      2,
  height:     2,
  top:        '50%',
  left:       '50%',
  transform:  'translate(-50%, -50%)',
  border:     'none',
  background: 'transparent',
};

const AllHandles = () => (
  <>
    <Handle type="source" position={Position.Top}    id="s-t" style={CENTER_HANDLE} />
    <Handle type="source" position={Position.Right}  id="s-r" style={CENTER_HANDLE} />
    <Handle type="source" position={Position.Bottom} id="s-b" style={CENTER_HANDLE} />
    <Handle type="source" position={Position.Left}   id="s-l" style={CENTER_HANDLE} />
    <Handle type="target" position={Position.Top}    id="t-t" style={CENTER_HANDLE} />
    <Handle type="target" position={Position.Right}  id="t-r" style={CENTER_HANDLE} />
    <Handle type="target" position={Position.Bottom} id="t-b" style={CENTER_HANDLE} />
    <Handle type="target" position={Position.Left}   id="t-l" style={CENTER_HANDLE} />
  </>
);

// =====================================================================
// カスタムノード① CORE（中心）
// =====================================================================
function CoreNode(_: NodeProps) {
  return (
    <div style={{
      width: 76, height: 76, borderRadius: '50%',
      background: 'linear-gradient(135deg, #0a0918, #1e1b4b)',
      border: '2.5px solid rgba(129,140,248,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#e0e7ff', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em',
      boxShadow: '0 0 24px rgba(99,102,241,0.8), 0 0 48px rgba(99,102,241,0.3)',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
    }}>
      <AllHandles />
      技
    </div>
  );
}

// =====================================================================
// カスタムノード② BodyPart（第1階層）
// =====================================================================
interface BodyPartData { label: string; totalPoints: number; norm: number; }

function BodyPartNode({ data }: NodeProps) {
  const d = data as unknown as BodyPartData;

  const size        = Math.round(62 + d.norm * 28);
  const borderColor = d.norm > 0.6 ? '#fbbf24' : d.norm > 0.2 ? '#818cf8' : 'rgba(99,102,241,0.5)';
  const glow        = d.norm > 0.6
    ? '0 0 20px rgba(251,191,36,0.65), 0 0 40px rgba(251,191,36,0.25)'
    : d.norm > 0.2
    ? '0 0 16px rgba(129,140,248,0.55), 0 0 32px rgba(99,102,241,0.2)'
    : '0 0 8px rgba(99,102,241,0.2)';
  const bg = d.norm > 0.6
    ? 'linear-gradient(135deg, #78350f, #b45309)'
    : d.norm > 0.2
    ? 'linear-gradient(135deg, #0f0e2a, #312e81)'
    : 'linear-gradient(135deg, #0a0918, #1e1b4b)';

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg,
      border: `2px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: '#e0e7ff', textAlign: 'center', padding: 4,
      boxShadow: glow,
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
    }}>
      <AllHandles />
      <span style={{ fontSize: Math.max(10, size * 0.175), fontWeight: 800, lineHeight: 1.2, letterSpacing: '0.04em' }}>
        {d.label}
      </span>
      {d.totalPoints > 0 && (
        <span style={{ fontSize: Math.max(8, size * 0.13), opacity: 0.7, marginTop: 1 }}>
          {d.totalPoints}pt
        </span>
      )}
    </div>
  );
}

// =====================================================================
// カスタムノード③ Name（第2階層：具体的な技）
// =====================================================================
interface TechData {
  technique:   Technique;
  norm:        number;
  isSignature: boolean;  // ★ NEW: 得意技フラグ
}

function TechniqueNode({ data }: NodeProps) {
  const { technique: t, norm, isSignature } = data as unknown as TechData;

  // technique が undefined の場合は何も描画しない（防御的ガード）
  if (!t || !t.id) return null;

  // ★ シグネチャー（得意技）は特別スタイル
  const size = isSignature
    ? Math.round(54 + norm * 20)           // 一回り大きく
    : Math.round(40 + norm * 26);

  let bg, borderColor, glow, textColor;

  if (isSignature) {
    // 黄金に輝く
    bg          = 'linear-gradient(135deg, #78350f, #d97706, #fbbf24)';
    borderColor = '#fde68a';
    glow        = '0 0 16px rgba(251,191,36,0.9), 0 0 32px rgba(251,191,36,0.5), 0 0 48px rgba(251,191,36,0.2)';
    textColor   = '#fff';
  } else if (norm > 0.75) {
    bg          = 'linear-gradient(135deg, #92400e, #d97706)';
    borderColor = '#fbbf24';
    glow        = '0 0 12px rgba(251,191,36,0.6), 0 0 24px rgba(251,191,36,0.25)';
    textColor   = '#fff';
  } else if (norm > 0.4) {
    bg          = 'linear-gradient(135deg, #1e1b4b, #4f46e5)';
    borderColor = '#818cf8';
    glow        = '0 0 10px rgba(129,140,248,0.5), 0 0 20px rgba(99,102,241,0.2)';
    textColor   = '#e0e7ff';
  } else if (norm > 0) {
    bg          = 'linear-gradient(135deg, #0f0e2a, #312e81)';
    borderColor = 'rgba(99,102,241,0.5)';
    glow        = '0 0 6px rgba(99,102,241,0.3)';
    textColor   = '#c7d2fe';
  } else {
    bg          = '#0a0918';
    borderColor = 'rgba(99,102,241,0.2)';
    glow        = 'none';
    textColor   = 'rgba(99,102,241,0.4)';
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg,
      border: `${isSignature ? 2.5 : 1.5}px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: textColor,
      textAlign: 'center', padding: 3,
      boxShadow: glow,
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      // ★ シグネチャーはアニメーション
      animation: isSignature ? 'signature-pulse 2.5s ease-in-out infinite' : undefined,
    }}>
      <AllHandles />
      <span style={{
        fontSize: Math.max(7, size * 0.145),
        fontWeight: isSignature ? 800 : 700,
        lineHeight: 1.2,
        wordBreak: 'break-all',
        maxWidth: size - 6,
      }}>
        {t?.name ?? '不明な技'}
      </span>
      {(t?.points ?? 0) > 0 && (
        <span style={{ fontSize: Math.max(6, size * 0.11), opacity: 0.75, marginTop: 1 }}>
          {t.points}pt
        </span>
      )}
      {/* ★ シグネチャーバッジ */}
      {isSignature && (
        <span style={{
          position: 'absolute',
          top: -6, right: -4,
          fontSize: 10,
          lineHeight: 1,
          background: 'linear-gradient(135deg, #d97706, #fbbf24)',
          borderRadius: '50%',
          width: 16, height: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 6px rgba(251,191,36,0.8)',
        }}>
          ★
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
// データサニタイズ
// =====================================================================

/**
 * GAS から届く techniques 配列には、スプレッドシートの空行に由来する
 * undefined / null / 不完全なオブジェクトが混在することがある。
 * このヘルパーで無効エントリを除去し、各プロパティにフォールバックを設定する。
 */
function sanitizeTechniques(raw: Technique[]): Technique[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      // undefined / null / id なし → 弾く
      if (!item || !item.id) return null;
      // GAS が snake_case で返す場合に備え unknown 経由でアクセス
      const r = item as unknown as Record<string, unknown>;
      return {
        id:          item.id,
        bodyPart:    item.bodyPart    ?? (r['body_part']     as string) ?? '未分類',
        actionType:  item.actionType  ?? (r['action_type']   as string) ?? '',
        subCategory: item.subCategory ?? (r['sub_category']  as string) ?? '',
        name:        item.name        ?? (r['technique_name'] as string) ?? '不明な技',
        points:      typeof item.points     === 'number' ? item.points     : 0,
        lastRating:  typeof item.lastRating === 'number' ? item.lastRating : 0,
      } satisfies Technique;
    })
    .filter((item): item is Technique => item !== null);
}

// =====================================================================
// グラフ生成ロジック
// =====================================================================
const BODY_PART_R  = 220;
const TECH_R_BASE  = 170;
const TECH_R_EXTRA = 60;
const TECH_SPREAD  = 95;

type TechActionMap = Record<string, string>;

function buildGraph(
  rawTechniques: Technique[],
  signatureTechId?: string,
): { nodes: Node[]; edges: Edge[]; techActionMap: TechActionMap } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 無効エントリを除去してから処理する
  const techniques = sanitizeTechniques(rawTechniques);

  const byBodyPart: Record<string, Technique[]> = {};
  techniques.forEach(t => {
    const bp = t.bodyPart || '未分類';
    if (!byBodyPart[bp]) byBodyPart[bp] = [];
    byBodyPart[bp].push(t);
  });

  const bodyParts  = Object.keys(byBodyPart);
  const N          = bodyParts.length;
  const maxBpPts   = Math.max(...bodyParts.map(bp => byBodyPart[bp].reduce((s, t) => s + (t.points ?? 0), 0)), 1);
  const maxTechPts = Math.max(...techniques.map(t => t.points ?? 0), 1);

  // CORE
  nodes.push({
    id: 'core', type: 'coreNode',
    position: { x: -38, y: -38 },
    data: {},
  });

  // 第1・第2階層
  bodyParts.forEach((bp, bi) => {
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

    const bpEdgeWidth = Math.max(1.5, Math.round(2 + bpNorm * 4));
    const bpEdgeColor = bpNorm > 0.6 ? '#b45309' : 'rgba(99,102,241,0.6)';
    edges.push({
      id: `e-core-${bpId}`, source: 'core', target: bpId,
      type: 'straight',
      style: { stroke: bpEdgeColor, strokeWidth: bpEdgeWidth, opacity: 0.4 + bpNorm * 0.5 },
    });

    const techs    = [...byBodyPart[bp]].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    const total    = techs.length;
    const perpCos  = Math.cos(bpAngle + Math.PI / 2);
    const perpSin  = Math.sin(bpAngle + Math.PI / 2);
    const bpCenterX = bpCos * BODY_PART_R;
    const bpCenterY = bpSin * BODY_PART_R;

    techs.forEach((tech, ti) => {
      const col         = Math.floor(ti / 5);
      const rowIdx      = ti % 5;
      const totalInCol  = Math.min(5, total - col * 5);
      const spreadIdx   = rowIdx - (totalInCol - 1) / 2;
      const radDist     = TECH_R_BASE + col * TECH_R_EXTRA;

      const techNorm      = (tech.points ?? 0) / maxTechPts;
      const isSignature   = !!signatureTechId && tech.id === signatureTechId;
      const techSize      = isSignature
        ? Math.round(54 + techNorm * 20)
        : Math.round(40 + techNorm * 26);

      const tx = bpCenterX + bpCos * radDist + perpCos * spreadIdx * TECH_SPREAD;
      const ty = bpCenterY + bpSin * radDist + perpSin * spreadIdx * TECH_SPREAD;

      const techId = `tech-${tech.id}`;
      nodes.push({
        id: techId, type: 'techniqueNode',
        position: { x: tx - techSize / 2, y: ty - techSize / 2 },
        data: { technique: tech, norm: techNorm, isSignature } as unknown as Record<string, unknown>,
      });

      // ★ シグネチャー技へのエッジは金色に
      const edgeColor = isSignature
        ? '#fbbf24'
        : techNorm > 0.75 ? '#d97706' : techNorm > 0.4 ? '#6366f1' : 'rgba(99,102,241,0.35)';
      const edgeWidth = isSignature
        ? Math.max(2, Math.round(2 + techNorm * 3))
        : Math.max(1, Math.round(1 + techNorm * 3));
      const edgeGlow = isSignature
        ? '0 0 6px rgba(251,191,36,0.7)'
        : undefined;

      edges.push({
        id: `e-${bpId}-${techId}`, source: bpId, target: techId,
        type: 'straight',
        style: {
          stroke: edgeColor,
          strokeWidth: edgeWidth,
          opacity: isSignature ? 0.9 : 0.35 + techNorm * 0.5,
          filter: edgeGlow,
        },
      });
    });
  });

  const techActionMap: TechActionMap = {};
  techniques.forEach(t => {
    if (t?.id) techActionMap[`tech-${t.id}`] = t.actionType ?? '';
  });

  return { nodes, edges, techActionMap };
}

// =====================================================================
// ActionType フィルター
// =====================================================================
type FilterType = 'all' | string;

function applyFilter(
  nodes:        Node[],
  edges:        Edge[],
  filter:       FilterType,
  techActionMap: TechActionMap,
): { nodes: Node[]; edges: Edge[] } {
  if (filter === 'all') return { nodes, edges };

  const filteredNodes = nodes.map(n => {
    if (n.type === 'coreNode' || n.type === 'bodyPartNode') return n;
    const actionType = techActionMap[n.id] ?? '';
    const match      = actionType === filter;
    return {
      ...n,
      style: {
        ...(n.style ?? {}),
        opacity: match ? 1 : 0.12,
        filter:  match ? 'drop-shadow(0 0 10px rgba(129,140,248,0.9))' : 'none',
      },
    };
  });

  const filteredEdges = edges.map(e => {
    if (e.id.startsWith('e-core-')) return e;
    const actionType = techActionMap[e.target] ?? '';
    const match      = actionType === filter;
    return {
      ...e,
      style: {
        ...(e.style ?? {}),
        opacity: match ? Math.max((e.style?.opacity as number) ?? 0.8, 0.8) : 0.06,
      },
    };
  });

  return { nodes: filteredNodes, edges: filteredEdges };
}

// =====================================================================
// メインコンポーネント
// =====================================================================
export default function SkillGrid({ techniques, signatureTechId }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');

  const { nodes: rawNodes, edges: rawEdges, techActionMap } =
    useMemo(() => buildGraph(techniques, signatureTechId), [techniques, signatureTechId]);

  const actionTypes = useMemo(() => {
    const safe  = sanitizeTechniques(techniques);
    const types = [...new Set(safe.map(t => t.actionType).filter(Boolean))];
    return types;
  }, [techniques]);

  const { nodes, edges } = useMemo(
    () => applyFilter(rawNodes, rawEdges, filter, techActionMap),
    [rawNodes, rawEdges, filter, techActionMap],
  );

  if (!sanitizeTechniques(techniques).length) {
    return (
      <div style={{
        textAlign: 'center', padding: '2rem 1rem',
        color: 'rgba(129,140,248,0.45)', fontSize: '0.85rem',
      }}>
        技データがありません
      </div>
    );
  }

  const FILTER_BUTTONS: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'すべて' },
    ...actionTypes.map(t => ({ key: t, label: t })),
  ];

  // ★ 得意技が存在する場合、技名を取得して表示
  const signatureTech = signatureTechId
    ? sanitizeTechniques(techniques).find(t => t.id === signatureTechId)
    : null;

  return (
    <div style={{ width: '100%' }}>

      {/* ★ シグネチャームーブ表示 */}
      {signatureTech && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 10,
          padding: '6px 12px',
          borderRadius: 10,
          background: 'rgba(120,53,15,0.25)',
          border: '1px solid rgba(251,191,36,0.3)',
          boxShadow: '0 0 12px rgba(251,191,36,0.1)',
        }}>
          <span style={{ fontSize: 14 }}>★</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(251,191,36,0.8)', letterSpacing: '0.08em' }}>
            得意技
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fde68a' }}>
            {signatureTech.name}
          </span>
        </div>
      )}

      {/* フィルタートグルボタン */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {FILTER_BUTTONS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: '4px 14px',
                borderRadius: 999,
                border: `1.5px solid ${active ? 'rgba(129,140,248,0.7)' : 'rgba(99,102,241,0.2)'}`,
                background: active ? 'rgba(49,46,129,0.7)' : 'rgba(15,14,42,0.6)',
                color: active ? '#c7d2fe' : 'rgba(99,102,241,0.6)',
                fontSize: '0.72rem',
                fontWeight: active ? 700 : 500,
                fontFamily: 'inherit',
                cursor: 'pointer',
                transition: 'all .15s',
                boxShadow: active ? '0 0 10px rgba(99,102,241,0.4)' : 'none',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* スフィア盤 */}
      <div style={{
        width: '100%', height: 500,
        borderRadius: 16, overflow: 'hidden',
        background: 'linear-gradient(135deg, #050412, #0a0918)',
        border: '1px solid rgba(99,102,241,0.15)',
        boxShadow: 'inset 0 0 40px rgba(99,102,241,0.05)',
      }}>
        {/* ★ シグネチャーパルスアニメーション用キーフレーム */}
        <style>{`
          @keyframes signature-pulse {
            0%,100% { filter: drop-shadow(0 0 6px rgba(251,191,36,0.9)) drop-shadow(0 0 12px rgba(251,191,36,0.5)); }
            50%      { filter: drop-shadow(0 0 14px rgba(251,191,36,1.0)) drop-shadow(0 0 28px rgba(251,191,36,0.7)); }
          }
        `}</style>
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
          <Background
            variant={BackgroundVariant.Dots}
            color="rgba(99,102,241,0.15)"
            gap={28}
            size={1.5}
          />
          <Controls
            showInteractive={false}
            style={{
              background: 'rgba(15,14,42,0.9)',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 8,
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
