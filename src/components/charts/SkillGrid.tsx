'use client';

// =====================================================================
// SkillGrid.tsx — サイバー八卦陣（Phase 6.2 立ち昇る炎リビジョン）
//
// ★ Phase 6.2 の変更点:
//   - 炎を「下から立ち昇る」演出に刷新（縦長楕円 × 複数パーティクル）
//   - feTurbulence の歪み強化 + 動きの周期を多重化
//   - 上方向へのフェード + 上昇トランスレーションで立ち昇り感を表現
//   - 得意技ノードは炎エフェクトを削除し、星バッジのみで表現
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
const TECH_SCORE_CAP = 10000;
const BP_SCORE_CAP   = 50000;
const OUTER_SLOTS    = 24;
const R_OUTER        = 200;
const R_MID_RATIO    = 0.46;

const TECH_NODE_SIZE = 42;
const BP_NODE_SIZE   = 56;
const CORE_NODE_SIZE = 64;

const FLAME_MIN_INTENSITY = 0.15;

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
// 共有フィルタ ID
// =====================================================================
const SHARED_FILTER_IDS = {
  low:   'flame-rise-low',
  mid:   'flame-rise-mid',
  high:  'flame-rise-high',
  ultra: 'flame-rise-ultra',
};

function pickFilterId(intensity: number): string {
  if (intensity >= 0.85) return SHARED_FILTER_IDS.ultra;
  if (intensity >= 0.6)  return SHARED_FILTER_IDS.high;
  if (intensity >= 0.35) return SHARED_FILTER_IDS.mid;
  return SHARED_FILTER_IDS.low;
}

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
// 共有フィルタ定義（立ち昇る炎用に歪み強化）
// =====================================================================
const SharedFlameFilters = memo(() => (
  <svg
    width="0" height="0"
    style={{ position: 'absolute', pointerEvents: 'none' }}
    aria-hidden="true"
  >
    <defs>
      {/* 低強度：穏やかな立ち昇り */}
      <filter id={SHARED_FILTER_IDS.low} x="-50%" y="-80%" width="200%" height="260%">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.04" numOctaves="2" seed="3" result="n">
          <animate attributeName="baseFrequency"
            dur="6s" values="0.018 0.04; 0.028 0.07; 0.018 0.04" repeatCount="indefinite" />
          <animate attributeName="seed"
            dur="8s" values="3; 13; 23; 3" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      {/* 中強度 */}
      <filter id={SHARED_FILTER_IDS.mid} x="-60%" y="-90%" width="220%" height="280%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.05" numOctaves="2" seed="7" result="n">
          <animate attributeName="baseFrequency"
            dur="5s" values="0.02 0.05; 0.032 0.085; 0.02 0.05" repeatCount="indefinite" />
          <animate attributeName="seed"
            dur="7s" values="7; 17; 27; 7" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      {/* 高強度：激しく立ち昇る */}
      <filter id={SHARED_FILTER_IDS.high} x="-70%" y="-100%" width="240%" height="300%">
        <feTurbulence type="fractalNoise" baseFrequency="0.022 0.06" numOctaves="2" seed="13" result="n">
          <animate attributeName="baseFrequency"
            dur="4s" values="0.022 0.06; 0.038 0.1; 0.022 0.06" repeatCount="indefinite" />
          <animate attributeName="seed"
            dur="6s" values="13; 23; 33; 13" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="22" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      {/* 最大強度：荒れ狂う炎 */}
      <filter id={SHARED_FILTER_IDS.ultra} x="-80%" y="-110%" width="260%" height="320%">
        <feTurbulence type="fractalNoise" baseFrequency="0.024 0.07" numOctaves="2" seed="19" result="n">
          <animate attributeName="baseFrequency"
            dur="3.5s" values="0.024 0.07; 0.045 0.115; 0.024 0.07" repeatCount="indefinite" />
          <animate attributeName="seed"
            dur="5s" values="19; 29; 39; 19" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="30" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>
));
SharedFlameFilters.displayName = 'SharedFlameFilters';

// =====================================================================
// 立ち昇る炎コンポーネント
// =====================================================================
interface FlameAuraProps {
  size:      number;
  intensity: number;
  flame:     BpTheme['flame'];
  uid:       string;
  scale?:    number;
}

const FlameAura = memo(function FlameAura({
  size, intensity, flame, uid, scale = 1.0,
}: FlameAuraProps) {
  if (intensity < FLAME_MIN_INTENSITY) return null;

  // 縦長キャンバス（炎は上方向に伸びる）
  const padX = size * 0.7 * scale;
  const padTop    = size * 1.4 * scale; // 上方向に大きく確保
  const padBottom = size * 0.4 * scale;
  const w = size + padX * 2;
  const h = size + padTop + padBottom;

  // 炎の中心位置
  const cx = w / 2;
  const baseY = size / 2 + padTop; // 炎の根元（ノード中心）

  // 炎の縦横サイズ（縦長）
  const flameWidth  = size * (0.55 + intensity * 0.3) * scale;
  const flameHeight = size * (1.0 + intensity * 1.4) * scale;

  const gradId    = `fg-${uid}`;
  const innerId   = `fg-inner-${uid}`;
  const filterId  = pickFilterId(intensity);
  const opacity   = Math.min(0.5 + intensity * 0.45, 0.92);

  // パーティクル数（強度に応じて）
  const particles = intensity >= 0.6 ? 3 : intensity >= 0.3 ? 2 : 1;

  // 立ち昇りアニメーション周期
  const riseDur    = 2.0 + (1 - intensity) * 1.5;
  const breatheDur = 2.4 + (1 - intensity) * 1.2;

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
        {/* 外側の炎グラデ：根元が熱く、上にいくほど冷えて消える */}
        <radialGradient id={gradId} cx="50%" cy="85%" r="65%" fx="50%" fy="90%">
          <stop offset="0%"   stopColor={flame.hot}  stopOpacity="0.95" />
          <stop offset="30%"  stopColor={flame.mid}  stopOpacity="0.75" />
          <stop offset="65%"  stopColor={flame.cool} stopOpacity="0.35" />
          <stop offset="100%" stopColor={flame.cool} stopOpacity="0" />
        </radialGradient>

        {/* 内側の白熱コア */}
        <radialGradient id={innerId} cx="50%" cy="80%" r="50%">
          <stop offset="0%"   stopColor={flame.hot} stopOpacity="0.9" />
          <stop offset="50%"  stopColor={flame.mid} stopOpacity="0.5" />
          <stop offset="100%" stopColor={flame.mid} stopOpacity="0" />
        </radialGradient>
      </defs>

      <g filter={`url(#${filterId})`} opacity={opacity}>
        {/* 外側の大きな炎 */}
        <g
          className="flame-rise-outer"
          style={{
            transformOrigin: `${cx}px ${baseY}px`,
            animationDuration: `${breatheDur}s`,
          }}
        >
          <ellipse
            cx={cx}
            cy={baseY - flameHeight * 0.35}
            rx={flameWidth}
            ry={flameHeight * 0.7}
            fill={`url(#${gradId})`}
          />
        </g>

        {/* 立ち昇るパーティクル群 */}
        {Array.from({ length: particles }).map((_, i) => {
          const offsetX = (i - (particles - 1) / 2) * (flameWidth * 0.45);
          const delay   = (i * riseDur) / particles;
          const pSize   = flameWidth * (0.45 + i * 0.05);

          return (
            <g
              key={i}
              className="flame-rise-particle"
              style={{
                transformOrigin: `${cx + offsetX}px ${baseY}px`,
                animationDuration: `${riseDur}s`,
                animationDelay: `-${delay}s`,
              }}
            >
              <ellipse
                cx={cx + offsetX}
                cy={baseY}
                rx={pSize}
                ry={pSize * 1.6}
                fill={`url(#${innerId})`}
              />
            </g>
          );
        })}

        {/* 中心の白熱コア */}
        <g
          className="flame-core-flicker"
          style={{
            transformOrigin: `${cx}px ${baseY}px`,
            animationDuration: `${breatheDur * 0.6}s`,
          }}
        >
          <ellipse
            cx={cx}
            cy={baseY - flameHeight * 0.15}
            rx={flameWidth * 0.45}
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
      <FlameAura size={s} intensity={0.7} flame={DEFAULT_THEME.flame} uid="core" scale={0.9} />
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
interface BodyPartData { label: string; totalPoints: number; norm: number; }

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

  const flameIntensity = Math.max(0.45, Math.min(d.norm + 0.2, 1.0));

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: bg, border: `1.5px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#e0e7ff', textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none',
    }}>
      <FlameAura size={s} intensity={flameIntensity} flame={flame} uid={`bp-${id}`} scale={1.0} />
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
interface TechData { technique: Technique; norm: number; isSignature: boolean; isMaxed: boolean; }

const TechniqueNode = memo(function TechniqueNode({ data, id }: NodeProps) {
  const { technique: t, norm, isSignature, isMaxed } = data as unknown as TechData;
  if (!t?.id) return null;
  const s = TECH_NODE_SIZE;
  const theme = getBpTheme(t.bodyPart);
  const { rgb, dark, text: bpText } = theme;

  // 得意技は炎なし、それ以外は通常の炎
  const flame = isMaxed ? FLAME_MAXED : theme.flame;

  let bg: string, borderColor: string, textColor: string;
  if (isSignature) {
    bg = 'linear-gradient(135deg, #4c0519, #9f1239, #e11d48)';
    borderColor = 'rgba(244,63,94,0.75)'; textColor = '#fff';
  } else if (isMaxed) {
    bg = 'linear-gradient(135deg, #78350f, #b45309)';
    borderColor = 'rgba(251,191,36,0.65)'; textColor = '#fde68a';
  } else if (norm > 0.6) {
    bg = `linear-gradient(135deg, ${dark}, rgba(${rgb},0.38))`;
    borderColor = `rgba(${rgb},0.68)`; textColor = bpText;
  } else if (norm > 0.2) {
    bg = `linear-gradient(135deg, #070514, ${dark})`;
    borderColor = `rgba(${rgb},0.42)`; textColor = bpText;
  } else if (norm > 0) {
    bg = `linear-gradient(135deg, #06050f, #0d0b1a)`;
    borderColor = `rgba(${rgb},0.22)`; textColor = `rgba(${rgb},0.55)`;
  } else {
    bg = '#06050f';
    borderColor = `rgba(${rgb},0.10)`; textColor = `rgba(${rgb},0.25)`;
  }

  const flameIntensity = isMaxed ? 0.95 : norm;
  // 得意技は炎を出さない
  const showFlame = !isSignature && flameIntensity >= FLAME_MIN_INTENSITY;

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: bg, border: `1.5px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: textColor, textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none',
    }}>
      {showFlame && (
        <FlameAura size={s} intensity={flameIntensity} flame={flame} uid={`tech-${id}`} scale={1.0} />
      )}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <MinimalHandles />

        {/* 得意技：星バッジ */}
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

  bodyParts.forEach((bp, bi) => {
    const techs = byBodyPart[bp].filter(t => techAngles[t.id] !== undefined);
    if (techs.length === 0) return;

    const totalPts = techs.reduce((s, t) => s + (t.points ?? 0), 0);
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
// CSS キーフレーム
// =====================================================================
const KEYFRAMES = `
  /* 外側の炎：ゆらぎながら呼吸 */
  @keyframes flame-rise-outer {
    0%, 100% {
      transform: translateY(0) scale(0.95, 0.92);
      opacity: 0.85;
    }
    25% {
      transform: translateY(-3px) scale(1.05, 1.08);
      opacity: 1;
    }
    50% {
      transform: translateY(-1px) scale(0.98, 1.05);
      opacity: 0.9;
    }
    75% {
      transform: translateY(-4px) scale(1.03, 1.1);
      opacity: 1;
    }
  }
  .flame-rise-outer {
    animation-name: flame-rise-outer;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: transform, opacity;
  }

  /* パーティクル：下から上へ立ち昇る */
  @keyframes flame-rise-particle {
    0% {
      transform: translateY(10%) scale(0.6, 0.5);
      opacity: 0;
    }
    20% {
      opacity: 0.9;
    }
    60% {
      transform: translateY(-50%) scale(0.85, 1.1);
      opacity: 0.7;
    }
    100% {
      transform: translateY(-95%) scale(0.3, 1.3);
      opacity: 0;
    }
  }
  .flame-rise-particle {
    animation-name: flame-rise-particle;
    animation-timing-function: ease-out;
    animation-iteration-count: infinite;
    will-change: transform, opacity;
  }

  /* 中心コア：素早く瞬く */
  @keyframes flame-core-flicker {
    0%, 100% {
      transform: scale(0.9, 0.95);
      opacity: 0.85;
    }
    33% {
      transform: scale(1.1, 1.15);
      opacity: 1;
    }
    66% {
      transform: scale(0.95, 1.05);
      opacity: 0.9;
    }
  }
  .flame-core-flicker {
    animation-name: flame-core-flicker;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: transform, opacity;
  }

  /* 得意技の星バッジ */
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
      signature-star-twinkle 2s ease-in-out infinite 0.6s;
  }

  /* OS設定でアニメ抑制 */
  @media (prefers-reduced-motion: reduce) {
    .flame-rise-outer,
    .flame-rise-particle,
    .flame-core-flicker,
    .signature-star-badge {
      animation: none !important;
    }
    svg animate { display: none; }
  }

  /* React Flow コントロール */
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
          background: 'linear-gradient(90deg, rgba(76,5,25,0.38), rgba(76,5,25,0.14))',
          border: '1px solid rgba(244,63,94,0.4)',
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
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(244,63,94,0.8)', letterSpacing: '0.1em' }}>得意技</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fecdd3', letterSpacing: '0.05em' }}>
            {signatureTech.name}
          </span>
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
