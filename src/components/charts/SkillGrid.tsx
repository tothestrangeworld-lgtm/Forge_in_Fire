'use client';

// =====================================================================
// SkillGrid.tsx — サイバー八卦陣（Phase 5.1 軽量化リビジョン）
//
// ★ クラッシュ対策（Phase 5.1）:
//   【原因】clip-path + filter: drop-shadow() の多重スタックが
//           ズーム時に GPU コンポジットレイヤーを大量生成しメモリ枯渇。
//           さらに filter アニメーションが毎フレーム全ノードを再描画。
//   【対策】
//   - filter: drop-shadow → box-shadow に全置換（GPU 負荷 1/5 以下）
//   - clip-path 六角形 → border-radius: 50% の円形（レイヤー生成ゼロ）
//   - ノードサイズ固定・習熟度は発光（box-shadow 強度）のみで表現
//   - エッジアニメーション（animated: true）廃止
//   - 外周スロット 24 固定・半径をコンパクト化
//   - maxZoom を 2.5 に制限（過剰ズームによるピクセル過多を防止）
// =====================================================================

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
// 定数
// =====================================================================

/** 技スコアの視覚的上限 */
const TECH_SCORE_CAP = 10000;
/** 部位スコア合計の視覚的上限 */
const BP_SCORE_CAP = 50000;
/** 外周スロット数（固定） */
const OUTER_SLOTS = 24;
/** 外周半径（px）*/
const R_OUTER = 200;
/** 部位ノードを配置する中間半径の割合 */
const R_MID_RATIO = 0.46;

// ノードサイズ固定
const TECH_NODE_SIZE = 42;
const BP_NODE_SIZE   = 56;
const CORE_NODE_SIZE = 64;

// =====================================================================
// 系統カラーテーマ（部位別イメージカラー）
// =====================================================================
//   面  : ローズレッド  — 攻めの気魄を象徴する赤
//   小手: コーラルイエロー — 鋭い手先の技を象徴する黄
//   胴  : サイアンブルー — 流れるような体捌きを象徴する青
//   突き: ライトバイオレット — 一点集中の精神を象徴する紫
//   ※ MAXゴールド / シグネチャー深紅 はそれぞれ上書き優先
// =====================================================================
interface BpTheme {
  rgb:   string;  // "R,G,B" → rgba(${rgb}, alpha) として使用
  dark:  string;  // グラデーションの暗い側 (hex)
  text:  string;  // メインテキスト色
}

const BP_THEMES: Record<string, BpTheme> = {
  '面':   { rgb: '248,113,113', dark: '#7f1d1d', text: '#fecaca' },
  '小手':  { rgb: '253,224,71',  dark: '#713f12', text: '#fef9c3' },
  '胴':   { rgb: '56,189,248',  dark: '#0c4a6e', text: '#bae6fd' },
  '突き':  { rgb: '167,139,250', dark: '#4c1d95', text: '#ede9fe' },
};

/** 部位名からテーマを取得（未定義はインディゴ） */
function getBpTheme(bodyPart: string): BpTheme {
  return BP_THEMES[bodyPart] ?? { rgb: '99,102,241', dark: '#1e1b4b', text: '#c7d2fe' };
}

// =====================================================================
// Props
// =====================================================================
interface Props {
  techniques:      Technique[];
  signatureTechId?: string;
}

// =====================================================================
// ハンドル（不可視・最小限）
// =====================================================================
const CENTER_HANDLE: React.CSSProperties = {
  opacity: 0, width: 1, height: 1,
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  border: 'none', background: 'transparent', pointerEvents: 'none',
};

const MinimalHandles = () => (
  <>
    <Handle type="source" position={Position.Top}    id="s" style={CENTER_HANDLE} />
    <Handle type="target" position={Position.Bottom} id="t" style={CENTER_HANDLE} />
  </>
);

// =====================================================================
// 発光スタイル生成（box-shadow のみ・filter 不使用）
// =====================================================================
function techGlow(norm: number, isSignature: boolean, isMaxed: boolean, bodyPart: string): string {
  if (isSignature) {
    return [
      `0 0 ${6 + norm * 8}px ${2 + norm * 3}px rgba(244,63,94,0.75)`,
      '0 0 0 2px rgba(244,63,94,0.55)',
    ].join(', ');
  }
  if (isMaxed) {
    return [
      `0 0 ${6 + norm * 8}px ${2 + norm * 3}px rgba(251,191,36,0.70)`,
      '0 0 0 1.5px rgba(251,191,36,0.45)',
    ].join(', ');
  }
  const { rgb } = getBpTheme(bodyPart);
  if (norm > 0.6) return [
    `0 0 ${4 + norm * 7}px ${1 + norm * 3}px rgba(${rgb},0.72)`,
    `0 0 0 1px rgba(${rgb},0.45)`,
  ].join(', ');
  if (norm > 0.2) return `0 0 ${3 + norm * 5}px 1px rgba(${rgb},0.52)`;
  if (norm > 0)   return `0 0 4px 1px rgba(${rgb},0.28)`;
  return 'none';
}

function bpGlow(norm: number, bodyPart: string): string {
  if (norm >= 1.0) return '0 0 14px 5px rgba(251,191,36,0.65), 0 0 0 2px rgba(251,191,36,0.4)';
  const { rgb } = getBpTheme(bodyPart);
  if (norm > 0.5) return [
    `0 0 ${8 + norm * 8}px ${2 + norm * 2}px rgba(${rgb},0.60)`,
    `0 0 0 1px rgba(${rgb},0.35)`,
  ].join(', ');
  return `0 0 6px 1px rgba(${rgb},0.30)`;
}

// =====================================================================
// カスタムノード① CORE
// =====================================================================
function CoreNode(_: NodeProps) {
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
      position: 'relative', userSelect: 'none',
    }}>
      <MinimalHandles />
      技
    </div>
  );
}

// =====================================================================
// カスタムノード② BodyPart
// =====================================================================
interface BodyPartData { label: string; totalPoints: number; norm: number; }

function BodyPartNode({ data }: NodeProps) {
  const d = data as unknown as BodyPartData;
  const s = BP_NODE_SIZE;
  const isMaxed = d.norm >= 1.0;
  const { rgb, dark, text: bpText } = getBpTheme(d.label);

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
      boxShadow: bpGlow(d.norm, d.label),
      animation: isMaxed ? 'bp-maxed-pulse 2.4s ease-in-out infinite' : undefined,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#e0e7ff', textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none',
    }}>
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
  );
}

// =====================================================================
// カスタムノード③ Technique
// =====================================================================
interface TechData { technique: Technique; norm: number; isSignature: boolean; isMaxed: boolean; }

function TechniqueNode({ data }: NodeProps) {
  const { technique: t, norm, isSignature, isMaxed } = data as unknown as TechData;
  if (!t?.id) return null;
  const s = TECH_NODE_SIZE;
  const { rgb, dark, text: bpText } = getBpTheme(t.bodyPart);

  let bg: string, borderColor: string, textColor: string;
  if (isSignature) {
    bg = 'linear-gradient(135deg, #4c0519, #9f1239, #e11d48)';
    borderColor = 'rgba(244,63,94,0.75)'; textColor = '#fff';
  } else if (isMaxed) {
    bg = 'linear-gradient(135deg, #78350f, #b45309)';
    borderColor = 'rgba(251,191,36,0.65)'; textColor = '#fde68a';
  } else if (norm > 0.6) {
    // 高習熟：系統色でしっかり発色
    bg = `linear-gradient(135deg, ${dark}, rgba(${rgb},0.38))`;
    borderColor = `rgba(${rgb},0.68)`; textColor = bpText;
  } else if (norm > 0.2) {
    // 中習熟：系統色を暗く抑えめに
    bg = `linear-gradient(135deg, #070514, ${dark})`;
    borderColor = `rgba(${rgb},0.42)`; textColor = bpText;
  } else if (norm > 0) {
    // 低習熟：かすかに系統色が滲む
    bg = `linear-gradient(135deg, #06050f, #0d0b1a)`;
    borderColor = `rgba(${rgb},0.22)`; textColor = `rgba(${rgb},0.55)`;
  } else {
    // 未練習：ほぼ消灯
    bg = '#06050f';
    borderColor = `rgba(${rgb},0.10)`; textColor = `rgba(${rgb},0.25)`;
  }

  const animation = isSignature
    ? 'signature-pulse 2.6s ease-in-out infinite'
    : isMaxed ? 'maxed-pulse 2.9s ease-in-out infinite' : undefined;

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: bg, border: `1.5px solid ${borderColor}`,
      boxShadow: techGlow(norm, isSignature, isMaxed, t.bodyPart),
      animation,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: textColor, textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none',
    }}>
      <MinimalHandles />
      <span style={{ fontSize: 8, fontWeight: 700, lineHeight: 1.25, wordBreak: 'break-all', maxWidth: s * 0.82, letterSpacing: '0.02em' }}>
        {t.name}
      </span>
      {(t.points ?? 0) > 0 && (
        <span style={{ fontSize: 7, opacity: 0.75, marginTop: 1 }}>{t.points}pt</span>
      )}
      {isSignature && (
        <span style={{
          position: 'absolute', top: -3, right: -1,
          fontSize: 8, lineHeight: 1,
          background: 'linear-gradient(135deg, #9f1239, #f43f5e)',
          borderRadius: '50%', width: 13, height: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 5px rgba(244,63,94,0.8)', color: '#fff', fontWeight: 800,
        }}>★</span>
      )}
      {isMaxed && !isSignature && (
        <span style={{
          position: 'absolute', top: -3, right: -1,
          fontSize: 6, lineHeight: 1,
          background: 'linear-gradient(135deg, #b45309, #fbbf24)',
          borderRadius: 3, padding: '1px 2px', color: '#fff', fontWeight: 800,
          boxShadow: '0 0 4px rgba(251,191,36,0.7)',
        }}>MAX</span>
      )}
    </div>
  );
}

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
// グラフ生成（放射状等間隔・固定24スロット）
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

  // 1. BodyPart ごとにグループ化（合計ポイント降順）
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

  // 2. 全技を最大 OUTER_SLOTS 件に制限して展開
  const allTechs: Array<{ tech: Technique; bpKey: string }> = [];
  outer: for (const bp of bodyParts) {
    for (const tech of byBodyPart[bp]) {
      if (allTechs.length >= OUTER_SLOTS) break outer;
      allTechs.push({ tech, bpKey: bp });
    }
  }

  const R_MID = R_OUTER * R_MID_RATIO;

  // 3. CORE ノード
  const half = CORE_NODE_SIZE / 2;
  nodes.push({ id: 'core', type: 'coreNode', position: { x: -half, y: -half }, data: {} });

  // 4. 技ノードを外周固定スロット上に配置
  const techAngles: Record<string, number> = {};
  allTechs.forEach(({ tech }, i) => {
    const angle = (2 * Math.PI / OUTER_SLOTS) * i - Math.PI / 2;
    techAngles[tech.id] = angle;

    const norm        = Math.min((tech.points ?? 0) / TECH_SCORE_CAP, 1.0);
    const isSignature = !!signatureTechId && tech.id === signatureTechId;
    const isMaxed     = (tech.points ?? 0) >= TECH_SCORE_CAP;
    const hs          = TECH_NODE_SIZE / 2;
    const techId      = `tech-${tech.id}`;

    techActionMap[techId] = tech.actionType ?? '';
    nodes.push({
      id: techId, type: 'techniqueNode',
      position: { x: R_OUTER * Math.cos(angle) - hs, y: R_OUTER * Math.sin(angle) - hs },
      data: { technique: tech, norm, isSignature, isMaxed } as unknown as Record<string, unknown>,
    });
  });

  // 5. 部位ノード（円形平均・R_MID）とエッジ
  bodyParts.forEach((bp, bi) => {
    const techs = byBodyPart[bp].filter(t => techAngles[t.id] !== undefined);
    if (techs.length === 0) return;

    const totalPts = techs.reduce((s, t) => s + (t.points ?? 0), 0);
    const bpNorm   = Math.min(totalPts / BP_SCORE_CAP, 1.0);
    const hs       = BP_NODE_SIZE / 2;
    const bpId     = `bp-${bi}`;

    // 円形平均で部位の代表角度を算出
    const sinSum   = techs.reduce((s, t) => s + Math.sin(techAngles[t.id]), 0);
    const cosSum   = techs.reduce((s, t) => s + Math.cos(techAngles[t.id]), 0);
    const avgAngle = Math.atan2(sinSum, cosSum);

    nodes.push({
      id: bpId, type: 'bodyPartNode',
      position: { x: R_MID * Math.cos(avgAngle) - hs, y: R_MID * Math.sin(avgAngle) - hs },
      data: { label: bp, totalPoints: totalPts, norm: bpNorm } as unknown as Record<string, unknown>,
    });

    // CORE → BP（部位の系統色でほんのり光る）
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

    // BP → 技（系統色 + 習熟度・シグネチャー上書き）
    techs.forEach(tech => {
      const techId      = `tech-${tech.id}`;
      const norm        = Math.min((tech.points ?? 0) / TECH_SCORE_CAP, 1.0);
      const isSignature = !!signatureTechId && tech.id === signatureTechId;
      const isMaxed     = (tech.points ?? 0) >= TECH_SCORE_CAP;
      const { rgb }     = getBpTheme(tech.bodyPart);
      const edgeColor   = isSignature
        ? '#f43f5e'
        : isMaxed
        ? '#d97706'
        : `rgba(${rgb},${(0.35 + norm * 0.55).toFixed(2)})`;

      edges.push({
        id: `e-${bpId}-${techId}`, source: bpId, target: techId, type: 'straight',
        style: {
          stroke:      edgeColor,
          strokeWidth: Math.max(1, Math.round(1 + norm * 2)),
          opacity:     isSignature ? 0.85 : 0.28 + norm * 0.55,
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
// CSS キーフレーム（box-shadow のみ・filter アニメーション不使用）
// =====================================================================
const KEYFRAMES = `
  @keyframes signature-pulse {
    0%,100% { box-shadow: 0 0 8px 3px rgba(244,63,94,0.65), 0 0 0 2px rgba(244,63,94,0.45); }
    50%      { box-shadow: 0 0 18px 7px rgba(244,63,94,0.85), 0 0 0 2px rgba(244,63,94,0.65); }
  }
  @keyframes maxed-pulse {
    0%,100% { box-shadow: 0 0 7px 2px rgba(251,191,36,0.60), 0 0 0 1.5px rgba(251,191,36,0.40); }
    50%      { box-shadow: 0 0 16px 5px rgba(251,191,36,0.80), 0 0 0 2px rgba(251,191,36,0.55); }
  }
  @keyframes bp-maxed-pulse {
    0%,100% { box-shadow: 0 0 10px 3px rgba(251,191,36,0.55), 0 0 0 2px rgba(251,191,36,0.35); }
    50%      { box-shadow: 0 0 20px 7px rgba(251,191,36,0.75), 0 0 0 2px rgba(251,191,36,0.55); }
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

  const safeTechniques = sanitizeTechniques(techniques);

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

      {/* 得意技バナー */}
      {signatureTech && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '6px 14px', borderRadius: 10,
          background: 'linear-gradient(90deg, rgba(76,5,25,0.38), rgba(76,5,25,0.14))',
          border: '1px solid rgba(244,63,94,0.4)', boxShadow: '0 0 12px rgba(244,63,94,0.12)',
        }}>
          <span style={{ fontSize: 12 }}>★</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(244,63,94,0.8)', letterSpacing: '0.1em' }}>得意技</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fecdd3', letterSpacing: '0.05em' }}>{signatureTech.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'rgba(244,63,94,0.5)' }}>{signatureTech.points}pt</span>
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
          fitView fitViewOptions={{ padding: 0.18, maxZoom: 0.9 }}
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
        {/* 系統カラー */}
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
        {/* セパレーター */}
        <div style={{ width: 1, background: 'rgba(99,102,241,0.2)', margin: '0 2px' }} />
        {/* 状態カラー */}
        {[
          { color: '#f43f5e', label: '得意技' },
          { color: '#fbbf24', label: 'MAX' },
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
