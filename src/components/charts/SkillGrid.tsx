'use client';

// =====================================================================
// SkillGrid.tsx — サイバー八卦陣（Phase 5 更新）
//
// ★ Phase5 変更点:
//   - 全ノードを六角形（Hexagon / clip-path）に変更
//   - TECH_SCORE_CAP (= 10) による視覚的上限（キャップ）を実装
//   - カンスト（score ≥ 10）ノードに黄金パルス発光エフェクト
//   - 得意技（signatureTechId）に専用オーラ＋シグネチャーバッジ
//   - エッジを animated: true + サイバーグロースタイルに変更
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

/**
 * 技ノードの視覚的上限スコア。
 * このスコア以上はサイズ・エフェクトが最大値に固定（UI破綻を防止）。
 * ポイント自体はスプレッドシートで無限に蓄積できる。
 */
const TECH_SCORE_CAP = 10;

/**
 * 部位ノードの視覚的上限スコア。
 * 部位配下の技スコア合計に対して適用する。
 */
const BP_SCORE_CAP = 50;

// =====================================================================
// 六角形 clip-path（Pointy-top Hexagon）
// =====================================================================
const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

// 八角形（COREノード専用）
const OCT_CLIP =
  'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)';

// =====================================================================
// Props
// =====================================================================
interface Props {
  techniques: Technique[];
  /**
   * 得意技ID（例: "T001"）。
   * 一致するノードをシグネチャームーブとしてハイライト。
   */
  signatureTechId?: string;
}

// =====================================================================
// ハンドル（不可視・全方向）
// =====================================================================
const CENTER_HANDLE: React.CSSProperties = {
  opacity: 0,
  width: 2,
  height: 2,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  border: 'none',
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
// カスタムノード① CORE（中心・八角形）
// =====================================================================
function CoreNode(_: NodeProps) {
  return (
    <div style={{
      width: 76, height: 76,
      clipPath: OCT_CLIP,
      background: 'linear-gradient(135deg, #0a0918 0%, #1e1b4b 50%, #312e81 100%)',
      border: 'none',
      outline: '2.5px solid rgba(129,140,248,0.8)',
      outlineOffset: -3,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#e0e7ff',
      fontSize: 15,
      fontWeight: 800,
      letterSpacing: '0.1em',
      filter: 'drop-shadow(0 0 14px rgba(99,102,241,0.9)) drop-shadow(0 0 28px rgba(99,102,241,0.4))',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative',
    }}>
      <AllHandles />
      技
    </div>
  );
}

// =====================================================================
// カスタムノード② BodyPart（第1階層・大型六角形）
// =====================================================================
interface BodyPartData {
  label: string;
  totalPoints: number;
  norm: number;
}

function BodyPartNode({ data }: NodeProps) {
  const d = data as unknown as BodyPartData;

  const size        = Math.round(64 + d.norm * 28);  // 64〜92px
  const isMaxed     = d.norm >= 1.0;

  const borderGlow  = isMaxed
    ? 'drop-shadow(0 0 16px rgba(251,191,36,0.9)) drop-shadow(0 0 32px rgba(251,191,36,0.4))'
    : d.norm > 0.5
    ? 'drop-shadow(0 0 12px rgba(129,140,248,0.7)) drop-shadow(0 0 24px rgba(99,102,241,0.3))'
    : 'drop-shadow(0 0 6px rgba(99,102,241,0.3))';

  const bg = isMaxed
    ? 'linear-gradient(135deg, #78350f, #b45309, #d97706)'
    : d.norm > 0.5
    ? 'linear-gradient(135deg, #0f0e2a, #312e81)'
    : 'linear-gradient(135deg, #0a0918, #1e1b4b)';

  return (
    <div style={{
      width: size, height: size,
      clipPath: HEX_CLIP,
      background: bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#e0e7ff',
      textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      filter: borderGlow,
      animation: isMaxed ? 'bp-maxed-pulse 2.2s ease-in-out infinite' : undefined,
      position: 'relative',
    }}>
      <AllHandles />
      <span style={{
        fontSize: Math.max(10, size * 0.175),
        fontWeight: 800,
        lineHeight: 1.2,
        letterSpacing: '0.04em',
        paddingTop: size * 0.06,
      }}>
        {d.label}
      </span>
      {d.totalPoints > 0 && (
        <span style={{
          fontSize: Math.max(7, size * 0.12),
          opacity: 0.75,
          marginTop: 1,
          color: isMaxed ? '#fde68a' : 'inherit',
        }}>
          {d.totalPoints}pt
        </span>
      )}
    </div>
  );
}

// =====================================================================
// カスタムノード③ Technique（第2階層・標準六角形）
// =====================================================================
interface TechData {
  technique:   Technique;
  /** TECH_SCORE_CAP で正規化済み（0〜1.0にクランプ）*/
  norm:        number;
  isSignature: boolean;
  isMaxed:     boolean;  // ★ score >= TECH_SCORE_CAP
}

function TechniqueNode({ data }: NodeProps) {
  const { technique: t, norm, isSignature, isMaxed } = data as unknown as TechData;

  if (!t || !t.id) return null;

  const size = isSignature
    ? Math.round(54 + norm * 24)  // 54〜78px（シグネチャーは一回り大きく）
    : Math.round(42 + norm * 28); // 42〜70px

  let bg: string, filterGlow: string, textColor: string;

  if (isSignature) {
    bg        = 'linear-gradient(135deg, #4c0519, #9f1239, #f43f5e)';
    filterGlow = 'drop-shadow(0 0 12px rgba(244,63,94,1.0)) drop-shadow(0 0 24px rgba(244,63,94,0.65)) drop-shadow(0 0 40px rgba(244,63,94,0.3))';
    textColor = '#fff';
  } else if (isMaxed) {
    bg        = 'linear-gradient(135deg, #78350f, #b45309)';
    filterGlow = 'drop-shadow(0 0 10px rgba(251,191,36,0.7)) drop-shadow(0 0 20px rgba(251,191,36,0.3))';
    textColor = '#fde68a';
  } else if (norm > 0.6) {
    bg        = 'linear-gradient(135deg, #1e1b4b, #4f46e5)';
    filterGlow = 'drop-shadow(0 0 8px rgba(129,140,248,0.6)) drop-shadow(0 0 16px rgba(99,102,241,0.25))';
    textColor = '#e0e7ff';
  } else if (norm > 0.2) {
    bg        = 'linear-gradient(135deg, #0f0e2a, #312e81)';
    filterGlow = 'drop-shadow(0 0 5px rgba(99,102,241,0.4))';
    textColor = '#c7d2fe';
  } else if (norm > 0) {
    bg        = 'linear-gradient(135deg, #0a0918, #1e1b4b)';
    filterGlow = 'drop-shadow(0 0 3px rgba(99,102,241,0.2))';
    textColor = '#a5b4fc';
  } else {
    bg        = '#070613';
    filterGlow = 'none';
    textColor = 'rgba(99,102,241,0.35)';
  }

  // アニメーション決定
  let animation: string | undefined;
  if (isSignature) {
    animation = 'signature-pulse 2.5s ease-in-out infinite';
  } else if (isMaxed) {
    animation = 'maxed-pulse 2.8s ease-in-out infinite';
  }

  return (
    <div style={{
      width: size,
      height: size,
      clipPath: HEX_CLIP,
      background: bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: textColor,
      textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      filter: filterGlow,
      animation,
      position: 'relative',
    }}>
      <AllHandles />
      <span style={{
        fontSize: Math.max(7, size * 0.155),
        fontWeight: isSignature ? 800 : 700,
        lineHeight: 1.2,
        wordBreak: 'break-all',
        maxWidth: size * 0.72,
        paddingTop: size * 0.08,
      }}>
        {t?.name ?? '不明な技'}
      </span>
      {(t?.points ?? 0) > 0 && (
        <span style={{
          fontSize: Math.max(6, size * 0.11),
          opacity: 0.8,
          marginTop: 1,
          color: isSignature ? '#fecdd3' : isMaxed ? '#fde68a' : 'inherit',
        }}>
          {t.points}pt
        </span>
      )}

      {/* ★ シグネチャーバッジ（六角形の頂点に配置） */}
      {isSignature && (
        <span style={{
          position: 'absolute',
          top: -2,
          right: size * 0.18,
          fontSize: 9,
          lineHeight: 1,
          background: 'linear-gradient(135deg, #9f1239, #f43f5e)',
          borderRadius: '50%',
          width: 15,
          height: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 8px rgba(244,63,94,0.9)',
          zIndex: 10,
        }}>
          ★
        </span>
      )}

      {/* ★ カンストバッジ（シグネチャー以外のカンストノード） */}
      {isMaxed && !isSignature && (
        <span style={{
          position: 'absolute',
          top: -2,
          right: size * 0.18,
          fontSize: 8,
          lineHeight: 1,
          background: 'linear-gradient(135deg, #b45309, #fbbf24)',
          borderRadius: '50%',
          width: 13,
          height: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 6px rgba(251,191,36,0.7)',
          zIndex: 10,
        }}>
          MAX
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
function sanitizeTechniques(raw: Technique[]): Technique[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      if (!item || !item.id) return null;
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
    })
    .filter((item): item is Technique => item !== null);
}

// =====================================================================
// グラフ生成ロジック — 放射状等間隔レイアウト（Radial Equal-Spacing Layout）
//
// ★ Phase5 レイアウト刷新:
//   旧: BodyPart を N 等分した方向に放射し、その先に技を扇状に並べる「ツリー形式」
//   新: 全末端ノード（技）を外周円上に等間隔配置し、BodyPart をその中間半径に置く
//       → 特定部位に技が集中しても視覚的密度が均一になる
// =====================================================================

/**
 * 外周円の最小半径（px）。
 * 技が少ない場合でも小さくなりすぎないための下限値。
 */
const MIN_R_OUTER = 320;

/**
 * BodyPart ノードを外周の何割の位置に置くか（0〜1）。
 * 0.5 = コアと外周の中間点。
 */
const R_MID_RATIO = 0.50;

/**
 * 隣接する末端ノード間の最低確保スペース係数。
 * 1.0 = ノードサイズぴったり。1.5 = 1.5倍のスペースを確保。
 */
const SPACING_FACTOR = 1.55;

/**
 * 末端ノードが取りうる最大表示サイズ（px）。
 * ダイナミック半径計算の基準値として使用。
 * isSignature で norm=1 のときが最大: 54 + 24 = 78px
 */
const MAX_TECH_DISPLAY_SIZE = 78;

type TechActionMap = Record<string, string>;

function buildGraph(
  rawTechniques: Technique[],
  signatureTechId?: string,
): { nodes: Node[]; edges: Edge[]; techActionMap: TechActionMap } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const techniques = sanitizeTechniques(rawTechniques);

  // ── 1. BodyPart ごとにグループ化 ──────────────────────────────────
  const byBodyPart: Record<string, Technique[]> = {};
  techniques.forEach(t => {
    const bp = t.bodyPart || '未分類';
    if (!byBodyPart[bp]) byBodyPart[bp] = [];
    byBodyPart[bp].push(t);
  });

  // BodyPart を合計ポイント降順でソート（視覚的に高習熟グループが固まる）
  const bodyParts = Object.keys(byBodyPart).sort((a, b) => {
    const aSum = byBodyPart[a].reduce((s, t) => s + (t.points ?? 0), 0);
    const bSum = byBodyPart[b].reduce((s, t) => s + (t.points ?? 0), 0);
    return bSum - aSum;
  });

  // 各 BodyPart 内の技をポイント降順にソート（同グループ内での並び順を安定化）
  bodyParts.forEach(bp => {
    byBodyPart[bp].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  });

  // ── 2. 全末端ノードを1本のリストに展開 ─────────────────────────────
  const allTechs: Array<{ tech: Technique; bpKey: string }> = [];
  bodyParts.forEach(bp => {
    byBodyPart[bp].forEach(tech => allTechs.push({ tech, bpKey: bp }));
  });
  const totalTechs = allTechs.length;

  // ── 3. 外周半径をダイナミックに計算 ─────────────────────────────────
  // 「全末端ノードを外周に等間隔で並べたとき、隣同士が重ならない最小半径」
  //   周の長さ = 2π × R ≥ totalTechs × MAX_TECH_DISPLAY_SIZE × SPACING_FACTOR
  const minRFromDensity = totalTechs > 1
    ? (totalTechs * MAX_TECH_DISPLAY_SIZE * SPACING_FACTOR) / (2 * Math.PI)
    : MIN_R_OUTER;
  const R_OUTER = Math.max(MIN_R_OUTER, minRFromDensity);
  const R_MID   = R_OUTER * R_MID_RATIO;

  // ── 4. CORE ノード ────────────────────────────────────────────────
  nodes.push({
    id: 'core', type: 'coreNode',
    position: { x: -38, y: -38 },
    data: {},
  });

  // ── 5. 末端ノードの角度を決定し、ノードを配置 ─────────────────────
  //   角度 0 が真上（-π/2）から始まり、時計回りに等間隔で並ぶ
  const techAngles: Record<string, number> = {};

  allTechs.forEach(({ tech }, globalIdx) => {
    const angle = (2 * Math.PI / totalTechs) * globalIdx - Math.PI / 2;
    techAngles[tech.id] = angle;

    const techNorm    = Math.min((tech.points ?? 0) / TECH_SCORE_CAP, 1.0);
    const isSignature = !!signatureTechId && tech.id === signatureTechId;
    const isMaxed     = (tech.points ?? 0) >= TECH_SCORE_CAP;

    const techSize = isSignature
      ? Math.round(54 + techNorm * 24)   // 54〜78px
      : Math.round(42 + techNorm * 28);  // 42〜70px

    const tx = R_OUTER * Math.cos(angle);
    const ty = R_OUTER * Math.sin(angle);

    const techId = `tech-${tech.id}`;
    nodes.push({
      id: techId, type: 'techniqueNode',
      position: { x: tx - techSize / 2, y: ty - techSize / 2 },
      data: {
        technique: tech,
        norm: techNorm,
        isSignature,
        isMaxed,
      } as unknown as Record<string, unknown>,
    });
  });

  // ── 6. BodyPart ノードを中間半径に配置しエッジを生成 ─────────────
  const techActionMap: TechActionMap = {};

  bodyParts.forEach((bp, bi) => {
    const techs    = byBodyPart[bp];
    const totalPts = techs.reduce((s, t) => s + (t.points ?? 0), 0);
    const bpNorm   = Math.min(totalPts / BP_SCORE_CAP, 1.0);
    const bpSize   = Math.round(64 + bpNorm * 28);  // 64〜92px

    // 配下の末端ノード角度の「円形平均（Circular Mean）」を求める。
    // 通常の算術平均では 350°と10°の平均が誤って180°になるが、
    // sin/cos の和の atan2 を使うことで正しく 0° が得られる。
    const childAngles = techs.map(t => techAngles[t.id]);
    const sinSum = childAngles.reduce((s, a) => s + Math.sin(a), 0);
    const cosSum = childAngles.reduce((s, a) => s + Math.cos(a), 0);
    const avgAngle = Math.atan2(sinSum, cosSum);

    const bpX  = R_MID * Math.cos(avgAngle) - bpSize / 2;
    const bpY  = R_MID * Math.sin(avgAngle) - bpSize / 2;
    const bpId = `bp-${bi}`;

    nodes.push({
      id: bpId, type: 'bodyPartNode',
      position: { x: bpX, y: bpY },
      data: { label: bp, totalPoints: totalPts, norm: bpNorm } as unknown as Record<string, unknown>,
    });

    // CORE → BP エッジ
    const bpEdgeColor = bpNorm >= 1.0
      ? '#fbbf24'
      : bpNorm > 0.5 ? '#818cf8' : 'rgba(99,102,241,0.55)';
    const bpEdgeWidth = Math.max(1.5, Math.round(2 + bpNorm * 3.5));

    edges.push({
      id: `e-core-${bpId}`,
      source: 'core',
      target: bpId,
      type: 'straight',
      animated: true,
      style: {
        stroke: bpEdgeColor,
        strokeWidth: bpEdgeWidth,
        opacity: 0.45 + bpNorm * 0.45,
        filter: bpNorm > 0.5 ? `drop-shadow(0 0 4px ${bpEdgeColor})` : undefined,
      },
    });

    // BP → 技 エッジ（+ techActionMap の構築）
    techs.forEach(tech => {
      const techId   = `tech-${tech.id}`;
      const techNorm = Math.min((tech.points ?? 0) / TECH_SCORE_CAP, 1.0);
      const isSignature = !!signatureTechId && tech.id === signatureTechId;
      const isMaxed     = (tech.points ?? 0) >= TECH_SCORE_CAP;

      if (tech?.id) techActionMap[techId] = tech.actionType ?? '';

      const edgeColor = isSignature
        ? '#f43f5e'
        : isMaxed
        ? '#d97706'
        : techNorm > 0.6 ? '#818cf8'
        : techNorm > 0.2 ? '#6366f1'
        : 'rgba(99,102,241,0.3)';

      const edgeWidth = isSignature
        ? Math.max(2, Math.round(2.5 + techNorm * 2.5))
        : Math.max(1, Math.round(1 + techNorm * 2.5));

      const edgeGlow = isSignature || isMaxed
        ? `drop-shadow(0 0 4px ${edgeColor}) drop-shadow(0 0 8px ${edgeColor})`
        : techNorm > 0.6
        ? `drop-shadow(0 0 3px ${edgeColor})`
        : undefined;

      edges.push({
        id: `e-${bpId}-${techId}`,
        source: bpId,
        target: techId,
        type: 'straight',
        animated: true,
        style: {
          stroke: edgeColor,
          strokeWidth: edgeWidth,
          opacity: isSignature ? 0.95 : 0.3 + techNorm * 0.6,
          filter: edgeGlow,
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

function applyFilter(
  nodes:         Node[],
  edges:         Edge[],
  filter:        FilterType,
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
        opacity: match ? 1 : 0.1,
        filter:  match ? 'drop-shadow(0 0 12px rgba(129,140,248,0.95))' : 'none',
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
        opacity: match ? Math.max((e.style?.opacity as number) ?? 0.8, 0.8) : 0.05,
      },
    };
  });

  return { nodes: filteredNodes, edges: filteredEdges };
}

// =====================================================================
// CSS キーフレーム（インライン）
// =====================================================================
const KEYFRAMES = `
  /* ★ シグネチャー（得意技）: 大きく明滅する深紅オーラ */
  @keyframes signature-pulse {
    0%, 100% {
      filter:
        drop-shadow(0 0 10px rgba(244,63,94,1.0))
        drop-shadow(0 0 22px rgba(244,63,94,0.65))
        drop-shadow(0 0 40px rgba(244,63,94,0.3));
    }
    50% {
      filter:
        drop-shadow(0 0 20px rgba(244,63,94,1.0))
        drop-shadow(0 0 40px rgba(244,63,94,0.85))
        drop-shadow(0 0 70px rgba(244,63,94,0.5));
    }
  }

  /* ★ カンスト（score ≥ TECH_SCORE_CAP）: 黄金に明滅 */
  @keyframes maxed-pulse {
    0%, 100% {
      filter:
        drop-shadow(0 0 7px rgba(251,191,36,0.8))
        drop-shadow(0 0 16px rgba(251,191,36,0.35));
    }
    50% {
      filter:
        drop-shadow(0 0 14px rgba(251,191,36,0.95))
        drop-shadow(0 0 30px rgba(251,191,36,0.55));
    }
  }

  /* ★ 部位カンスト */
  @keyframes bp-maxed-pulse {
    0%, 100% {
      filter:
        drop-shadow(0 0 14px rgba(251,191,36,0.85))
        drop-shadow(0 0 28px rgba(251,191,36,0.4));
    }
    50% {
      filter:
        drop-shadow(0 0 24px rgba(251,191,36,1.0))
        drop-shadow(0 0 48px rgba(251,191,36,0.6));
    }
  }

  /* ReactFlow のアニメーションエッジを上書きしてサイバーっぽく */
  .react-flow__edge-path {
    stroke-dasharray: 6 4;
  }
  .react-flow__edge.animated .react-flow__edge-path {
    animation: dashmove 1.4s linear infinite;
  }
  @keyframes dashmove {
    from { stroke-dashoffset: 20; }
    to   { stroke-dashoffset: 0; }
  }

  /* ReactFlow コントロールボタン */
  .react-flow__controls-button {
    background: rgba(15,14,42,0.95) !important;
    border-color: rgba(99,102,241,0.25) !important;
    color: rgba(129,140,248,0.8) !important;
    fill: rgba(129,140,248,0.8) !important;
  }
  .react-flow__controls-button:hover {
    background: rgba(49,46,129,0.8) !important;
  }
`;

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

  const safeTechniques = sanitizeTechniques(techniques);

  if (!safeTechniques.length) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '2rem 1rem',
        color: 'rgba(129,140,248,0.45)',
        fontSize: '0.85rem',
      }}>
        技データがありません
      </div>
    );
  }

  const FILTER_BUTTONS: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'すべて' },
    ...actionTypes.map(t => ({ key: t, label: t })),
  ];

  const signatureTech = signatureTechId
    ? safeTechniques.find(t => t.id === signatureTechId)
    : null;

  // カンスト中の技の数
  const maxedCount = safeTechniques.filter(t => (t.points ?? 0) >= TECH_SCORE_CAP).length;

  return (
    <div style={{ width: '100%' }}>
      <style>{KEYFRAMES}</style>

      {/* ★ シグネチャームーブ表示バナー */}
      {signatureTech && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          padding: '6px 14px',
          borderRadius: 10,
          background: 'linear-gradient(90deg, rgba(76,5,25,0.38), rgba(76,5,25,0.14))',
          border: '1px solid rgba(244,63,94,0.4)',
          boxShadow: '0 0 14px rgba(244,63,94,0.15)',
        }}>
          <span style={{ fontSize: 13 }}>★</span>
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: 'rgba(244,63,94,0.8)',
            letterSpacing: '0.1em',
          }}>
            得意技
          </span>
          <span style={{
            fontSize: '0.82rem',
            fontWeight: 800,
            color: '#fecdd3',
            letterSpacing: '0.05em',
          }}>
            {signatureTech.name}
          </span>
          <span style={{
            marginLeft: 'auto',
            fontSize: '0.68rem',
            color: 'rgba(244,63,94,0.5)',
          }}>
            {signatureTech.points}pt
          </span>
        </div>
      )}

      {/* ★ カンスト技カウンター（1件以上の場合に表示） */}
      {maxedCount > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          padding: '4px 12px',
          borderRadius: 8,
          background: 'rgba(120,53,15,0.15)',
          border: '1px solid rgba(251,191,36,0.2)',
          width: 'fit-content',
        }}>
          <span style={{ fontSize: 11 }}>🏆</span>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color: 'rgba(251,191,36,0.65)',
            letterSpacing: '0.08em',
          }}>
            MAX到達: {maxedCount}技
          </span>
          <span style={{
            fontSize: '0.62rem',
            color: 'rgba(251,191,36,0.38)',
            marginLeft: 2,
          }}>
            ({TECH_SCORE_CAP}pt以上)
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
                padding: '4px 13px',
                borderRadius: 999,
                border: `1.5px solid ${active
                  ? 'rgba(129,140,248,0.75)'
                  : 'rgba(99,102,241,0.22)'}`,
                background: active
                  ? 'rgba(49,46,129,0.75)'
                  : 'rgba(15,14,42,0.65)',
                color: active
                  ? '#c7d2fe'
                  : 'rgba(99,102,241,0.55)',
                fontSize: '0.7rem',
                fontWeight: active ? 700 : 500,
                fontFamily: 'inherit',
                cursor: 'pointer',
                transition: 'all .15s',
                boxShadow: active
                  ? '0 0 10px rgba(99,102,241,0.4)'
                  : 'none',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ★ スキルグリッド本体 */}
      <div style={{
        width: '100%',
        height: 500,
        borderRadius: 16,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #050412 0%, #080717 50%, #0a0918 100%)',
        border: '1px solid rgba(99,102,241,0.15)',
        boxShadow: 'inset 0 0 60px rgba(99,102,241,0.04), inset 0 0 120px rgba(10,9,24,0.5)',
        position: 'relative',
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
          {/* グリッドドット背景 */}
          <Background
            variant={BackgroundVariant.Dots}
            color="rgba(99,102,241,0.14)"
            gap={28}
            size={1.5}
          />
          <Controls
            showInteractive={false}
            style={{
              background: 'rgba(15,14,42,0.9)',
              border: '1px solid rgba(99,102,241,0.22)',
              borderRadius: 8,
            }}
          />
        </ReactFlow>
      </div>

      {/* 凡例 */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginTop: 8,
        flexWrap: 'wrap',
        padding: '0 2px',
      }}>
        {[
          { color: '#f43f5e', label: '得意技' },
          { color: '#fbbf24', label: 'MAX到達' },
          { color: '#818cf8', label: '習熟中' },
          { color: 'rgba(99,102,241,0.4)', label: '練習中' },
        ].map(({ color, label }) => (
          <div key={label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <div style={{
              width: 8,
              height: 8,
              clipPath: HEX_CLIP,
              background: color,
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.62rem',
              color: 'rgba(129,140,248,0.45)',
              fontWeight: 600,
            }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
