'use client';

// =====================================================================
// RadarChart.tsx（Phase13.3.2: デュアル・レーダーチャート）
//
// 【設計方針】
//   面・小手・胴・突き の4軸に対して、
//   「与打（GIVEN）」と「被打（RECEIVED）」の形状を重ね合わせて
//   プレイヤーの「攻防のカタチ」を可視化する。
//
//   - 与打：深い藍色 #1875BF（自分の攻めの広がり）
//   - 被打：暗紅色   #641914（打たれた隙の広がり）
//   - 両者を半透明で重ねることで、攻防の「形状差」が直感的に見える
// =====================================================================

import {
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// =====================================================================
// カラー定数（渋めのサイバー和風）
// =====================================================================
const COLOR_GIVEN    = '#1875BF';   // 深い藍色:  自分の攻め
const COLOR_RECEIVED = '#641914';   // 暗紅色:   打たれた隙

// =====================================================================
// 型定義
// =====================================================================
export interface RadarDataPoint {
  subject:  string;   // 軸ラベル: '面' | '小手' | '胴' | '突き'
  given:    number;   // 与打スコア
  received: number;   // 被打スコア
}

interface Props {
  data: RadarDataPoint[];
}

// =====================================================================
// カスタム Tooltip
// =====================================================================
interface TooltipPayloadItem {
  name:   string;
  value:  number;
  color:  string;
  dataKey: string;
}

interface CustomTooltipProps {
  active?:  boolean;
  payload?: TooltipPayloadItem[];
  label?:   string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div style={{
      background:    'rgba(5, 4, 18, 0.95)',
      border:        '1px solid rgba(24, 117, 191, 0.45)',
      borderRadius:  10,
      padding:       '8px 12px',
      boxShadow:     '0 0 14px rgba(24, 117, 191, 0.25)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      minWidth:      120,
    }}>
      <div style={{
        fontSize:      '0.78rem',
        fontWeight:    800,
        color:         '#fff',
        marginBottom:  6,
        letterSpacing: '0.06em',
        borderBottom:  '1px solid rgba(255,255,255,0.1)',
        paddingBottom: 4,
      }}>
        {label}
      </div>
      {payload.map((item, i) => (
        <div key={i} style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            10,
          fontSize:       '0.7rem',
          padding:        '2px 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display:      'inline-block',
              width:        8,
              height:       8,
              borderRadius: '50%',
              background:   item.color,
              boxShadow:    `0 0 4px ${item.color}`,
            }} />
            <span style={{
              color:      'rgba(199,210,254,0.85)',
              fontWeight: 700,
            }}>
              {item.name}
            </span>
          </div>
          <span style={{
            color:      '#fff',
            fontWeight: 800,
            textShadow: `0 0 4px ${item.color}`,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {Math.round(item.value)}
            <span style={{
              fontSize:   '0.6rem',
              fontWeight: 600,
              color:      'rgba(165,180,252,0.6)',
              marginLeft: 2,
              textShadow: 'none',
            }}>
              pt
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// カスタム軸ラベル（部位名を強調表示）
// =====================================================================
type SvgTextAnchor = 'inherit' | 'end' | 'start' | 'middle';

interface CustomAxisTickProps {
  payload?:    { value: string };
  x?:          number;
  y?:          number;
  textAnchor?: string;
}

function CustomAxisTick({ payload, x, y, textAnchor }: CustomAxisTickProps) {
  if (!payload || x === undefined || y === undefined) return null;

  // recharts から渡される textAnchor を SVG の正規型に narrowing
  const anchor: SvgTextAnchor =
    textAnchor === 'start' || textAnchor === 'end' || textAnchor === 'middle' || textAnchor === 'inherit'
      ? textAnchor
      : 'middle';

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        textAnchor={anchor}
        fill="#a5b4fc"
        fontSize={13}
        fontWeight={800}
        letterSpacing="0.06em"
        style={{
          fontFamily: 'M PLUS Rounded 1c, sans-serif',
          filter:     'drop-shadow(0 0 4px rgba(165, 180, 252, 0.4))',
        }}
      >
        {payload.value}
      </text>
    </g>
  );
}

// =====================================================================
// メインコンポーネント
// =====================================================================
export default function RadarChart({ data }: Props) {
  if (!data?.length) return null;

  // データの有無チェック
  const hasGiven    = data.some(d => d.given    > 0);
  const hasReceived = data.some(d => d.received > 0);

  // 全軸が空ならフォールバック
  if (!hasGiven && !hasReceived) {
    return (
      <p style={{
        textAlign: 'center',
        fontSize:  '0.78rem',
        color:     'rgba(165,180,252,0.4)',
        padding:   '1rem 0',
        margin:    0,
      }}>
        部位別の集計データがありません
      </p>
    );
  }

  // 全データ最大値（スケール統一用）
  const allValues = data.flatMap(d => [d.given, d.received]);
  const maxValue  = Math.max(1, ...allValues);
  // 軸の上限は最大値の少し上に余裕を持たせる
  const axisMax   = Math.ceil(maxValue * 1.1);

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      {/* レーダーチャート本体 */}
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadarChart
            data={data}
            margin={{ top: 18, right: 28, bottom: 12, left: 28 }}
          >
            {/* グリッド：薄い蜘蛛の巣 */}
            <PolarGrid
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1}
              gridType="polygon"
            />

            {/* 軸ラベル：部位名 */}
            <PolarAngleAxis
              dataKey="subject"
              tick={<CustomAxisTick />}
            />

            {/* 半径軸（数値ラベルは非表示にして洗練感を出す） */}
            <PolarRadiusAxis
              angle={90}
              domain={[0, axisMax]}
              tick={false}
              axisLine={false}
            />

            {/* 与打レイヤー */}
            {hasGiven && (
              <Radar
                name="与打"
                dataKey="given"
                stroke={COLOR_GIVEN}
                fill={COLOR_GIVEN}
                fillOpacity={0.35}
                strokeWidth={2}
                isAnimationActive={false}
              />
            )}

            {/* 被打レイヤー */}
            {hasReceived && (
              <Radar
                name="被打"
                dataKey="received"
                stroke={COLOR_RECEIVED}
                fill={COLOR_RECEIVED}
                fillOpacity={0.35}
                strokeWidth={2}
                isAnimationActive={false}
              />
            )}

            <Tooltip content={<CustomTooltip />} />

            <Legend
              iconType="circle"
              iconSize={9}
              wrapperStyle={{
                fontSize:      11,
                paddingTop:    8,
                letterSpacing: '0.06em',
              }}
              formatter={(value) => {
                const isGiven = value === '与打';
                const color   = isGiven ? COLOR_GIVEN : COLOR_RECEIVED;
                return (
                  <span style={{
                    color:      color,
                    fontWeight: 800,
                    textShadow: `0 0 6px ${color}88`,
                    letterSpacing: '0.04em',
                    marginRight: 4,
                  }}>
                    {value}
                  </span>
                );
              }}
            />
          </RechartsRadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
