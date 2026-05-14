'use client';

// =====================================================================
// SkillGrid.tsx — サイバー八卦陣（ホログラフィック・ネオン版）
// ★ Phase11.1: ReactFlow 親コンテナの height を '100%' に変更し fitView を安定化
// ★ Phase13:   ViewMode（landed/received/both）と RGBブレンド発光を導入
// ★ Phase13.1: フラクタル発光（CORE/BodyPart/Technique 全階層で共通ロジック）
// ★ Phase13.2: ホログラフィック・ネオン化
//   - 背景塗りを完全排除し「光る印影」+ 多重 box-shadow による二重オービット表現
//   - 与打=シアン(0,229,255) / 被打=クリムゾン(255,0,85) の光三原色寄り配色
//   - 0pt時は外周完全消灯、データありは漆黒バッファで内周/外周を物理分離
// =====================================================================

import { memo, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  getStraightPath,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Technique, ReceivedStats } from '@/types';

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
// ★ Phase13: 与打/被打 視覚化モード
// =====================================================================
type ViewMode = 'landed' | 'received' | 'both';

/**
 * ★ Phase13: 与打ポイント / 被打ポイントを 0〜255 の発光強度に正規化する。
 * - 与打飽和点: 1000pt（既存 TECH_SCORE_CAP に合わせる）
 * - 被打飽和点: 200pt（被打は1ポイントの重みが大きいため低めに設定）
 */
const GIVEN_SATURATION    = 1000;
const RECEIVED_SATURATION = 200;

// ★ Phase13.1: フラクタル発光のための階層別飽和点
const BP_GIVEN_SATURATION    = 5000;
const BP_RECEIVED_SATURATION = 1000;
const CORE_GIVEN_SATURATION    = 20000;
const CORE_RECEIVED_SATURATION = 4000;

function normalizeIntensity(points: number, saturation: number): number {
  if (!points || points <= 0) return 0;
  const ratio = Math.min(points / saturation, 1);
  // 視認性重視: 微小値でも光るよう、γ補正（0.7）でローエンドを持ち上げる
  return Math.round(255 * Math.pow(ratio, 0.7));
}

// =====================================================================
// ★ Phase13.2: サイバーカラー・チューニング
// 「光の三原色」寄りで濁りにくいベースカラー
//   与打: サイバー・シアン  rgb(0, 229, 255)
//   被打: クリムゾン・レッド rgb(255, 0, 85)
// =====================================================================
const GIVEN_HUE    = { r:   0, g: 229, b: 255 }; // Cyan
const RECEIVED_HUE = { r: 255, g:   0, b:  85 }; // Crimson Red

interface BlendResult {
  rgb:            string;   // "R, G, B"
  intensityRatio: number;   // 0〜1
  hasAnyData:     boolean;
  isHotZone:      boolean;
}

function blendCyberColor(
  givenIntensity:    number,    // 0〜255
  receivedIntensity: number,    // 0〜255
  viewMode:          ViewMode,
  hotZoneThreshold:  number,
): BlendResult {
  const givenN    = viewMode === 'received' ? 0 : givenIntensity    / 255;
  const receivedN = viewMode === 'landed'   ? 0 : receivedIntensity / 255;
  const total     = Math.max(givenN, receivedN);
  const hasAnyData = total > 0;

  // 与打/被打の比率（both モード時は強度比で補間 / 単色モード時はその色のみ）
  const sum = givenN + receivedN;
  const giveRatio = sum > 0 ? givenN / sum : (viewMode === 'received' ? 0 : 1);
  const recvRatio = sum > 0 ? receivedN / sum : (viewMode === 'landed'   ? 0 : 1);

  // 線形補間: 強度の高い方の色寄りに
  const r = Math.round(GIVEN_HUE.r * giveRatio + RECEIVED_HUE.r * recvRatio);
  const g = Math.round(GIVEN_HUE.g * giveRatio + RECEIVED_HUE.g * recvRatio);
  const b = Math.round(GIVEN_HUE.b * giveRatio + RECEIVED_HUE.b * recvRatio);

  const isHotZone =
    viewMode === 'both' &&
    givenIntensity    >= hotZoneThreshold &&
    receivedIntensity >= hotZoneThreshold;

  return {
    rgb:            `${r}, ${g}, ${b}`,
    intensityRatio: total,
    hasAnyData,
    isHotZone,
  };
}

// =====================================================================
// ★ Phase13.2: ホログラフィック・ネオン スタイル算出
//
// 背景を完全排除し、白い細線+文字+多重box-shadowで以下を表現:
//   1) 内周コア: 白枠 + 文字に部位色の光（光る印影）
//   2) 部位色のオーラ（inset + outer の二段光）
//   3) 漆黒のバッファリング（物理的な隙間）
//   4) 外周のステータス枠線（与打/被打のブレンド色）
//   5) 外周のネオン拡散光
// =====================================================================

interface OrbitStyleInput {
  givenPoints:        number;
  receivedPoints:     number;
  givenSaturation:    number;
  receivedSaturation: number;
  /** 内周コアの「印影」色（部位の固有色 RGB 文字列） */
  baseRgb:            string;
  viewMode:           ViewMode;
  hotZoneThreshold?:  number;
  /** バッファリング（漆黒の隙間）の太さ。階層により調整 */
  bufferWidth?:       number;
  /** 外周枠線の太さ */
  outerBorderWidth?:  number;
}

interface OrbitStyleOutput {
  background:    string;
  border:        string;
  boxShadow:     string;
  textColor:     string;
  textShadow:    string;
  blendedRgb:    string;
  intensityRatio:number;
  hasAnyData:    boolean;
  isHotZone:     boolean;
}

function computeOrbitStyle({
  givenPoints,
  receivedPoints,
  givenSaturation,
  receivedSaturation,
  baseRgb,
  viewMode,
  hotZoneThreshold = 160,
  bufferWidth      = 4,
  outerBorderWidth = 1.5,
}: OrbitStyleInput): OrbitStyleOutput {
  const givenIntensity    = normalizeIntensity(givenPoints,    givenSaturation);
  const receivedIntensity = normalizeIntensity(receivedPoints, receivedSaturation);

  const blend = blendCyberColor(
    givenIntensity, receivedIntensity, viewMode, hotZoneThreshold,
  );
  const { rgb: blendedRgb, intensityRatio, hasAnyData, isHotZone } = blend;

  // 内周コアの「印影」: 背景は完全排除、白い細線、文字から部位色を放つ
  const background = '#050412';
  const border     = '1px solid rgba(255, 255, 255, 0.8)';
  const textColor  = '#ffffff';
  const textShadow = `0 0 6px rgba(${baseRgb}, 0.8), 0 0 2px rgba(0,0,0,0.9)`;

  let boxShadow: string;

  if (!hasAnyData) {
    // データなし: 部位の印影だけが微かに光る（外周は完全消灯）
    boxShadow = [
      `inset 0 0 6px rgba(${baseRgb}, 0.3)`,
      `0 0 4px rgba(${baseRgb}, 0.4)`,
    ].join(', ');
  } else {
    // 強度に応じたスケーリング
    const baseGlowAlpha    = (0.4 + intensityRatio * 0.4).toFixed(2);
    const innerGlowAlpha   = (0.4 + intensityRatio * 0.3).toFixed(2);
    const outerBorderAlpha = (0.55 + intensityRatio * 0.4).toFixed(2);
    const outerGlowSize    = 8 + intensityRatio * 8;
    const outerGlowSpread  = 3 + intensityRatio * 4;
    const outerGlowAlpha   = (0.35 + intensityRatio * 0.45).toFixed(2);

    const layers = [
      // ① 内側に落ちる部位色の光（印影の立体感）
      `inset 0 0 8px rgba(${baseRgb}, ${innerGlowAlpha})`,
      // ② 外側に放つ部位色のオーラ（細い）
      `0 0 6px 1px rgba(${baseRgb}, ${baseGlowAlpha})`,
      // ③ 物理的な漆黒の隙間（バッファ）
      `0 0 0 ${bufferWidth}px #050412`,
      // ④ 外周オービットのソリッド枠線（ステータス色）
      `0 0 0 ${bufferWidth + outerBorderWidth}px rgba(${blendedRgb}, ${outerBorderAlpha})`,
      // ⑤ 外周オービットの拡散ネオン光
      `0 0 ${outerGlowSize}px ${outerGlowSpread}px rgba(${blendedRgb}, ${outerGlowAlpha})`,
    ];

    // ⑥ 激戦区（HotZone）: 紫の追加リングを最外殻に
    if (isHotZone) {
      layers.push(`0 0 18px 4px rgba(180, 60, 255, 0.55)`);
    }

    boxShadow = layers.join(', ');
  }

  return {
    background, border, boxShadow,
    textColor, textShadow,
    blendedRgb, intensityRatio,
    hasAnyData, isHotZone,
  };
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
  /**
   * ★ Phase13: 被打統計。指定された場合、トグルで赤系発光を有効化できる。
   * 未指定の場合は従来通りの青系（与打のみ）表示にフォールバック。
   */
  receivedStats?:  ReceivedStats;
}

// =====================================================================
// CORE ノード ★ Phase13.2: ホログラフィック・ネオン
// =====================================================================
interface CoreData {
  totalGiven:    number;
  totalReceived: number;
  viewMode:      ViewMode;
}

const CoreNode = memo(function CoreNode({ data }: NodeProps) {
  const s = CORE_NODE_SIZE;
  const d = (data ?? {}) as unknown as Partial<CoreData>;
  const totalGiven    = d.totalGiven    ?? 0;
  const totalReceived = d.totalReceived ?? 0;
  const viewMode      = d.viewMode      ?? 'both';

  const orbit = computeOrbitStyle({
    givenPoints:        totalGiven,
    receivedPoints:     totalReceived,
    givenSaturation:    CORE_GIVEN_SATURATION,
    receivedSaturation: CORE_RECEIVED_SATURATION,
    baseRgb:            DEFAULT_THEME.rgb,
    viewMode,
    hotZoneThreshold:   140,
    bufferWidth:        5,
    outerBorderWidth:   1.8,
  });

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: orbit.background,
      border:     orbit.border,
      boxShadow:  orbit.boxShadow,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color:      orbit.textColor,
      fontSize: 15, fontWeight: 800,
      letterSpacing: '0.1em',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none', zIndex: 2,
      textShadow: orbit.textShadow,
      transition: 'box-shadow 0.4s ease, border-color 0.4s ease',
    }}>
      <MinimalHandles />
      技

      {orbit.isHotZone && (
        <span style={{
          position: 'absolute', top: -4, right: -4, fontSize: 8, lineHeight: 1,
          background: 'linear-gradient(135deg, #b45cff, #ec4899)',
          borderRadius: 4, padding: '2px 4px',
          color: '#fff', fontWeight: 800,
          boxShadow: '0 0 6px rgba(180,92,255,0.9)',
          animation: 'hotzone-pulse 1.4s ease-in-out infinite',
          zIndex: 3,
        }}>!</span>
      )}
    </div>
  );
});

// =====================================================================
// BodyPart ノード ★ Phase13.2: ホログラフィック・ネオン
// =====================================================================
interface BodyPartData {
  label:         string;
  totalPoints:   number;
  norm:          number;
  totalGiven:    number;
  totalReceived: number;
  viewMode:      ViewMode;
}

const BodyPartNode = memo(function BodyPartNode({ data }: NodeProps) {
  const d = data as unknown as BodyPartData;
  const s = BP_NODE_SIZE;
  const theme = getBpTheme(d.label);
  const { rgb: bpRgb } = theme;

  const orbit = computeOrbitStyle({
    givenPoints:        d.totalGiven,
    receivedPoints:     d.totalReceived,
    givenSaturation:    BP_GIVEN_SATURATION,
    receivedSaturation: BP_RECEIVED_SATURATION,
    baseRgb:            bpRgb,
    viewMode:           d.viewMode,
    hotZoneThreshold:   150,
    bufferWidth:        4,
    outerBorderWidth:   1.5,
  });

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: orbit.background,
      border:     orbit.border,
      boxShadow:  orbit.boxShadow,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color:      orbit.textColor,
      textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none',
      transition: 'box-shadow 0.4s ease, border-color 0.4s ease',
    }}>
      <MinimalHandles />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{
          fontSize: 11, fontWeight: 800, lineHeight: 1.2,
          letterSpacing: '0.04em',
          color: orbit.textColor,
          textShadow: orbit.textShadow,
        }}>
          {d.label}
        </span>

        {d.viewMode === 'landed' && d.totalGiven > 0 && (
          <span style={{
            fontSize: 8, marginTop: 1,
            color: '#7dd3fc',
            textShadow: `0 0 4px rgba(0, 229, 255, 0.6)`,
            letterSpacing: '0.03em',
          }}>
            {d.totalGiven}pt
          </span>
        )}
        {d.viewMode === 'received' && d.totalReceived > 0 && (
          <span style={{
            fontSize: 8, marginTop: 1,
            color: '#fb7185',
            textShadow: `0 0 4px rgba(255, 0, 85, 0.6)`,
            letterSpacing: '0.03em',
          }}>
            被{Math.round(d.totalReceived)}
          </span>
        )}
        {d.viewMode === 'both' && (d.totalGiven > 0 || d.totalReceived > 0) && (
          <span style={{
            fontSize: 8, marginTop: 1,
            letterSpacing: '0.03em',
            textShadow: '0 0 3px rgba(0,0,0,0.85)',
          }}>
            <span style={{ color: '#7dd3fc' }}>{d.totalGiven}</span>
            <span style={{ opacity: 0.5, margin: '0 1px', color: '#fff' }}>/</span>
            <span style={{ color: '#fb7185' }}>{Math.round(d.totalReceived)}</span>
          </span>
        )}
      </div>

      {orbit.isHotZone && (
        <span style={{
          position: 'absolute', top: -3, right: -2, fontSize: 7, lineHeight: 1,
          background: 'linear-gradient(135deg, #b45cff, #ec4899)',
          borderRadius: 3, padding: '1px 3px',
          color: '#fff', fontWeight: 800,
          boxShadow: '0 0 5px rgba(180,92,255,0.9)',
          animation: 'hotzone-pulse 1.4s ease-in-out infinite',
          zIndex: 3,
        }}>!</span>
      )}
    </div>
  );
});

// =====================================================================
// Technique ノード ★ Phase13.2: ホログラフィック・ネオン
// =====================================================================
interface TechData {
  technique:         Technique;
  tier:              LightningTier;
  isSignature:       boolean;
  isMaxed:           boolean;
  givenIntensity:    number;
  receivedIntensity: number;
  viewMode:          ViewMode;
}

const TechniqueNode = memo(function TechniqueNode({ data }: NodeProps) {
  const {
    technique: t,
    isSignature,
    isMaxed,
    givenIntensity,
    receivedIntensity,
    viewMode,
  } = data as unknown as TechData;
  if (!t?.id) return null;

  const s = TECH_NODE_SIZE;
  const theme = getBpTheme(t.bodyPart);
  const { rgb: bpRgb, plasma } = theme;

  // 末端ノードは givenIntensity / receivedIntensity（既に0〜255）を直接渡す
  // ため、saturation=255 で恒等変換させる
  const orbit = computeOrbitStyle({
    givenPoints:        givenIntensity,
    receivedPoints:     receivedIntensity,
    givenSaturation:    255,
    receivedSaturation: 255,
    baseRgb:            bpRgb,
    viewMode,
    hotZoneThreshold:   160,
    bufferWidth:        3,
    outerBorderWidth:   1.3,
  });

  // MAX到達時の特別演出（プラズマ風 outerリング上書き）
  let background      = orbit.background;
  let border          = orbit.border;
  let boxShadow       = orbit.boxShadow;
  let textColor       = orbit.textColor;
  let textShadowFinal = orbit.textShadow;

  if (orbit.hasAnyData && isMaxed && viewMode !== 'received') {
    border          = `1px solid ${plasma.core}`;
    textColor       = plasma.core;
    textShadowFinal = `0 0 8px ${plasma.mid}, 0 0 3px rgba(0,0,0,0.9)`;

    boxShadow = [
      `inset 0 0 10px ${plasma.glow}`,
      `0 0 8px 1px ${plasma.mid}`,
      `0 0 0 3px #050412`,
      `0 0 0 4.3px rgba(${orbit.blendedRgb}, 0.85)`,
      `0 0 14px 6px rgba(${orbit.blendedRgb}, 0.5)`,
    ].join(', ');
  }

  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background, border, boxShadow,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: textColor, textAlign: 'center',
      fontFamily: 'M PLUS Rounded 1c, sans-serif',
      position: 'relative', userSelect: 'none',
      transition: 'box-shadow 0.4s ease, border-color 0.4s ease',
    }}>
      <MinimalHandles />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {isSignature && (
          <span className="signature-star-badge" style={{
            position: 'absolute', left: -s * 0.34, top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 15, lineHeight: 1, color: '#fde047', fontWeight: 900,
            zIndex: 3, pointerEvents: 'none',
            textShadow: '0 0 4px rgba(0,0,0,0.7), 0 0 6px rgba(253,224,71,0.65)',
          }}>★</span>
        )}
        <span style={{
          fontSize: 8, fontWeight: 700, lineHeight: 1.25,
          wordBreak: 'break-all', maxWidth: s * 0.82,
          letterSpacing: '0.02em',
          textShadow: textShadowFinal,
        }}>{t.name}</span>

        {orbit.hasAnyData && viewMode === 'landed' && (t.points ?? 0) > 0 && (
          <span style={{
            fontSize: 7, marginTop: 1,
            color: '#7dd3fc',
            textShadow: `0 0 3px rgba(0,229,255,0.6)`,
          }}>
            {t.points}pt
          </span>
        )}
        {orbit.hasAnyData && viewMode === 'received' && receivedIntensity > 0 && (
          <span style={{
            fontSize: 7, marginTop: 1,
            color: '#fb7185',
            textShadow: `0 0 3px rgba(255,0,85,0.6)`,
          }}>
            被{Math.round(receivedIntensity / 255 * RECEIVED_SATURATION)}
          </span>
        )}
        {orbit.hasAnyData && viewMode === 'both' && (
          <span style={{ fontSize: 7, marginTop: 1, textShadow: '0 0 2px rgba(0,0,0,0.9)' }}>
            <span style={{ color: '#7dd3fc' }}>{t.points ?? 0}</span>
            <span style={{ opacity: 0.5, margin: '0 1px', color: '#fff' }}>/</span>
            <span style={{ color: '#fb7185' }}>{Math.round(receivedIntensity / 255 * RECEIVED_SATURATION)}</span>
          </span>
        )}

        {isMaxed && viewMode !== 'received' && (
          <span style={{
            position: 'absolute', top: -3, right: -1, fontSize: 6, lineHeight: 1,
            background: `linear-gradient(135deg, ${plasma.glow}, ${plasma.core})`,
            borderRadius: 3, padding: '1px 2px', color: '#fff', fontWeight: 800,
            boxShadow: `0 0 4px ${plasma.mid}`,
            zIndex: 3,
          }}>MAX</span>
        )}

        {orbit.isHotZone && (
          <span style={{
            position: 'absolute', top: -3, left: -1, fontSize: 7, lineHeight: 1,
            background: 'linear-gradient(135deg, #b45cff, #ec4899)',
            borderRadius: 3, padding: '1px 3px',
            color: '#fff', fontWeight: 800,
            boxShadow: '0 0 5px rgba(180,92,255,0.9)',
            animation: 'hotzone-pulse 1.4s ease-in-out infinite',
            zIndex: 3,
          }}>!</span>
        )}
      </div>
    </div>
  );
});

// =====================================================================
// 静的な線（StaticEdge）
// =====================================================================
interface StaticEdgeData {
  color:    string;
  width:    number;
}

const StaticEdge = memo(function StaticEdge({
  sourceX, sourceY, targetX, targetY, data, id, style
}: EdgeProps) {
  const d = (data ?? {}) as Partial<StaticEdgeData>;
  const color  = d.color  ?? 'rgba(99,102,241,0.6)';

  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        ...style,
        stroke: color,
        strokeWidth: 1.5,
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
  signatureTechId: string | undefined,
  receivedStats: ReceivedStats | undefined,
  viewMode: ViewMode,
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

  // ★ Phase13: 被打統計を技ID引きできるマップに変換
  const receivedPointsByTech: Record<string, number> = {};
  if (receivedStats?.byTechnique) {
    receivedStats.byTechnique.forEach(entry => {
      receivedPointsByTech[entry.techniqueId] = entry.receivedPoints;
    });
  }

  // ★ Phase13.1: 階層別累計の事前集計
  const coreTotalGiven    = techniques.reduce((s, t) => s + (t.points ?? 0), 0);
  const coreTotalReceived = Object.values(receivedPointsByTech).reduce((s, p) => s + (p || 0), 0);

  const bpTotalReceived: Record<string, number> = {};
  if (receivedStats?.byTechnique) {
    receivedStats.byTechnique.forEach(entry => {
      const bp = entry.bodyPart || '未分類';
      bpTotalReceived[bp] = (bpTotalReceived[bp] ?? 0) + (entry.receivedPoints || 0);
    });
  }

  // CORE ノード（フラクタル発光対応）
  nodes.push({
    id: 'core',
    type: 'coreNode',
    position: { x: -half, y: -half },
    data: {
      totalGiven:    coreTotalGiven,
      totalReceived: coreTotalReceived,
      viewMode,
    } as unknown as Record<string, unknown>,
  });

  const techAngles: Record<string, number> = {};
  allTechs.forEach(({ tech }, i) => {
    const angle = (2 * Math.PI / OUTER_SLOTS) * i - Math.PI / 2;
    techAngles[tech.id] = angle;

    const isSignature = !!signatureTechId && tech.id === signatureTechId;
    const isMaxed     = (tech.points ?? 0) >= TECH_SCORE_CAP;
    const tier        = pointsToTier(tech.points ?? 0);
    const hs          = TECH_NODE_SIZE / 2;
    const techId      = `tech-${tech.id}`;

    const givenIntensity    = normalizeIntensity(tech.points ?? 0,         GIVEN_SATURATION);
    const receivedIntensity = normalizeIntensity(receivedPointsByTech[tech.id] ?? 0, RECEIVED_SATURATION);

    techActionMap[techId] = tech.actionType ?? '';
    nodes.push({
      id: techId, type: 'techniqueNode',
      position: { x: R_OUTER * Math.cos(angle) - hs, y: R_OUTER * Math.sin(angle) - hs },
      data: {
        technique: tech, tier, isSignature, isMaxed,
        givenIntensity, receivedIntensity, viewMode,
      } as unknown as Record<string, unknown>,
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
      data: {
        label:         bp,
        totalPoints:   totalPts,
        norm:          bpNorm,
        totalGiven:    totalPts,
        totalReceived: bpTotalReceived[bp] ?? 0,
        viewMode,
      } as unknown as Record<string, unknown>,
    });

    const bpTheme = getBpTheme(bp);
    const bpIsMaxed = totalPts >= BP_SCORE_CAP;

    // ★ Phase13.1: 部位 → コアのエッジも、部位のブレンド強度を反映
    const bpReceived = bpTotalReceived[bp] ?? 0;
    const bpOrbitForEdge = computeOrbitStyle({
      givenPoints:        totalPts,
      receivedPoints:     bpReceived,
      givenSaturation:    BP_GIVEN_SATURATION,
      receivedSaturation: BP_RECEIVED_SATURATION,
      baseRgb:            bpTheme.rgb,
      viewMode,
    });

    const edgeColorToCore = bpIsMaxed
      ? bpTheme.plasma.core
      : bpOrbitForEdge.hasAnyData
        ? `rgba(${bpOrbitForEdge.blendedRgb},0.7)`
        : (bpNorm > 0.5 ? bpTheme.plasma.mid : `rgba(${bpTheme.rgb},0.55)`);

    edges.push({
      id: `e-${bpId}-core`,
      source: bpId,
      target: 'core',
      type: 'static',
      data: { color: edgeColorToCore },
    });

    techs.forEach(tech => {
      const techId      = `tech-${tech.id}`;
      const tier        = pointsToTier(tech.points ?? 0);
      const techTheme   = getBpTheme(tech.bodyPart);
      const techIsMaxed = (tech.points ?? 0) >= TECH_SCORE_CAP;

      let edgeColorToBp = '';
      if (techIsMaxed) edgeColorToBp = techTheme.plasma.core;
      else if (tier >= 3) edgeColorToBp = techTheme.plasma.mid;
      else if (tier >= 2) edgeColorToBp = `rgba(${techTheme.rgb},0.6)`;
      else if (tier >= 1) edgeColorToBp = `rgba(${techTheme.rgb},0.32)`;
      else edgeColorToBp = `rgba(${techTheme.rgb},0.12)`;

      edges.push({
        id: `e-${techId}-${bpId}`,
        source: techId,
        target: bpId,
        type: 'static',
        data: { color: edgeColorToBp },
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

  /* ★ Phase13: 激戦区（Hot Zone）警告アニメ */
  @keyframes hotzone-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.65; transform: scale(0.92); }
  }

  /* ★ Phase13: ViewMode トグル */
  @keyframes viewmode-active-pulse {
    0%, 100% { box-shadow: 0 0 8px var(--vm-glow), inset 0 0 4px var(--vm-glow); }
    50%      { box-shadow: 0 0 14px var(--vm-glow), inset 0 0 6px var(--vm-glow); }
  }
`;

// =====================================================================
// メインコンポーネント
// =====================================================================
export default function SkillGrid({ techniques, signatureTechId, receivedStats }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('both');

  const { nodes: rawNodes, edges: rawEdges, techActionMap } =
    useMemo(
      () => buildGraph(techniques, signatureTechId, receivedStats, viewMode),
      [techniques, signatureTechId, receivedStats, viewMode],
    );

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
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
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

      {/* ★ Phase13: ViewMode トグル（与打 / 被打 / 攻防） */}
      {receivedStats && (
        <div style={{
          display:      'flex',
          gap:          0,
          marginBottom: 10,
          padding:      4,
          borderRadius: 12,
          border:       '1px solid rgba(99,102,241,0.25)',
          background:   'linear-gradient(90deg, rgba(8,6,20,0.85), rgba(20,10,40,0.85))',
          position:     'relative',
          overflow:     'hidden',
        }}>
          <div style={{
            position:   'absolute',
            top:        0,
            left:       '8%',
            right:      '8%',
            height:     1,
            background: 'linear-gradient(90deg, transparent, rgba(167,139,250,0.6), transparent)',
            pointerEvents: 'none',
          }} />

          {([
            { key: 'landed',   label: '与打',   subEn: 'LANDED',   glow: '0,229,255',   fg: '#7dd3fc' },
            { key: 'both',     label: '攻防',   subEn: 'BOTH',     glow: '167,139,250', fg: '#c4b5fd' },
            { key: 'received', label: '被打',   subEn: 'RECEIVED', glow: '255,0,85',    fg: '#fb7185' },
          ] as { key: ViewMode; label: string; subEn: string; glow: string; fg: string }[]).map(opt => {
            const active = viewMode === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setViewMode(opt.key)}
                style={{
                  flex:           1,
                  position:       'relative',
                  padding:        '8px 6px 6px',
                  borderRadius:   8,
                  border:         active
                    ? `1px solid rgba(${opt.glow},0.85)`
                    : '1px solid transparent',
                  background:     active
                    ? `linear-gradient(135deg, rgba(${opt.glow},0.18), rgba(${opt.glow},0.05))`
                    : 'transparent',
                  color:          active ? opt.fg : 'rgba(199,210,254,0.4)',
                  fontFamily:     'inherit',
                  cursor:         'pointer',
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            2,
                  transition:     'color 0.2s, background 0.2s, border-color 0.2s',
                  ['--vm-glow' as string]: `rgba(${opt.glow},0.55)`,
                  animation:      active ? 'viewmode-active-pulse 2.4s ease-in-out infinite' : 'none',
                } as React.CSSProperties}
              >
                <span style={{
                  fontSize:      '0.5rem',
                  fontWeight:    700,
                  letterSpacing: '0.18em',
                  opacity:       active ? 0.9 : 0.5,
                  lineHeight:    1,
                }}>
                  {opt.subEn}
                </span>
                <span style={{
                  fontSize:      '0.85rem',
                  fontWeight:    800,
                  letterSpacing: '0.08em',
                  lineHeight:    1.1,
                  textShadow:    active ? `0 0 8px rgba(${opt.glow},0.7)` : 'none',
                }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{
        width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden',
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
      </div>

      {/* ★ Phase13: viewMode 凡例 */}
      {receivedStats && (
        <div style={{
          marginTop:    6,
          padding:      '6px 10px',
          borderRadius: 8,
          background:   'rgba(8,6,20,0.5)',
          border:       '1px solid rgba(99,102,241,0.15)',
          fontSize:     '0.62rem',
          color:        'rgba(199,210,254,0.55)',
          lineHeight:   1.5,
          letterSpacing:'0.04em',
        }}>
          {viewMode === 'landed' && (
            <>
              <span style={{ color:'#7dd3fc', fontWeight:700 }}>● 与打モード</span>
              ：シアンの濃淡が与打ポイントの強さ。鍛えてきた技ほど明るく光る。
            </>
          )}
          {viewMode === 'received' && (
            <>
              <span style={{ color:'#fb7185', fontWeight:700 }}>● 被打モード</span>
              ：クリムゾンの濃淡が被打ポイントの強さ。明るく光る技ほど対策が急務。
            </>
          )}
          {viewMode === 'both' && (
            <>
              <span style={{ color:'#c4b5fd', fontWeight:700 }}>● 攻防モード</span>
              ：シアン=与打 / クリムゾン=被打 / <span style={{ color:'#e9d5ff', fontWeight:700 }}>紫リング=激戦区</span>。
              紫に光る技は「鍛えていても打たれている」要警戒ゾーン。
            </>
          )}
        </div>
      )}
    </div>
  );
}
