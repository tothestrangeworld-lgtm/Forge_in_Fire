'use client';

// =====================================================================
// RadarChart.tsx（Phase13.3: 攻防比較型プログレスバー）
//
// 【設計方針】
//   1項目（部位）に対して「与打（Blue）」と「被打（Red）」の
//   2本のバーを並列表示する。
//
//   - 与打：シアン～インディゴ系のグラデーション
//   - 被打：クリムゾン～オレンジ系のグラデーション
//   - スケールは「両方の最大値」で正規化（同一スケール比較を保証）
//   - 被打データが無い場合は与打のみの片面表示にフォールバック
// =====================================================================

interface RadarDataPoint {
  subject:  string;
  /** 与打スコア（既存互換のため score も受け取る） */
  given?:   number;
  score?:   number;
  /** ★ Phase13.3: 被打スコア */
  received?: number;
  fullMark: number;
}

interface Props {
  data: RadarDataPoint[];
}

// =====================================================================
// カラーテーマ
// =====================================================================

/** 与打（Blue系）のカラー */
function givenColor(ratio: number): { from: string; to: string; glow: string } {
  if (ratio >= 0.85) return { from: '#0891b2', to: '#22d3ee', glow: 'rgba(34,211,238,0.5)' };
  if (ratio >= 0.65) return { from: '#4f46e5', to: '#818cf8', glow: 'rgba(129,140,248,0.45)' };
  if (ratio >= 0.4)  return { from: '#1e40af', to: '#60a5fa', glow: 'rgba(96,165,250,0.35)' };
  return              { from: '#1e1b4b', to: '#4338ca', glow: 'rgba(67,56,202,0.25)' };
}

/** 被打（Red系）のカラー */
function receivedColor(ratio: number): { from: string; to: string; glow: string } {
  if (ratio >= 0.85) return { from: '#9f1239', to: '#fb7185', glow: 'rgba(251,113,133,0.55)' };
  if (ratio >= 0.65) return { from: '#b91c1c', to: '#f87171', glow: 'rgba(248,113,113,0.5)' };
  if (ratio >= 0.4)  return { from: '#7f1d1d', to: '#ef4444', glow: 'rgba(239,68,68,0.4)' };
  return              { from: '#450a0a', to: '#991b1b', glow: 'rgba(153,27,27,0.3)' };
}

// =====================================================================
// 1本のバー
// =====================================================================

interface SingleBarProps {
  label:    string;        // 'GIVEN' | 'RECEIVED'
  labelJa:  string;        // '与打' | '被打'
  score:    number;
  fullMark: number;        // 表示用の絶対上限（pt表示用）
  scaleMax: number;        // バー幅正規化用の最大値（与打/被打の最大）
  variant:  'given' | 'received';
}

function SingleBar({ label, labelJa, score, fullMark, scaleMax, variant }: SingleBarProps) {
  const ratio  = scaleMax > 0 ? score / scaleMax : 0;
  const pctOfFullmark = fullMark > 0 ? Math.round((score / fullMark) * 100) : 0;
  const colors = variant === 'given' ? givenColor(ratio) : receivedColor(ratio);
  const barPct = Math.min(100, Math.max(0, Math.round(ratio * 100)));

  const isEmpty = score <= 0;

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:            6,
      opacity:        isEmpty ? 0.45 : 1,
    }}>
      {/* 左ラベル: 与打/被打 */}
      <span style={{
        flexShrink:    0,
        width:         34,
        fontSize:      '0.55rem',
        fontWeight:    800,
        color:         variant === 'given' ? '#a5b4fc' : '#fca5a5',
        letterSpacing: '0.1em',
        textAlign:     'left',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>

      {/* バートラック */}
      <div style={{
        flex:         1,
        minWidth:     0,
        height:       7,
        background:   'rgba(99,102,241,0.08)',
        borderRadius: 999,
        overflow:     'hidden',
        position:     'relative',
        border:       '1px solid rgba(255,255,255,0.04)',
      }}>
        {!isEmpty && (
          <div style={{
            width:        `${barPct}%`,
            height:       '100%',
            background:   `linear-gradient(90deg, ${colors.from}, ${colors.to})`,
            borderRadius: 999,
            boxShadow:    `0 0 6px ${colors.glow}`,
            transition:   'width .6s cubic-bezier(.4,0,.2,1)',
            position:     'relative',
          }}>
            {/* バー先端のグロー点 */}
            {barPct > 6 && (
              <div style={{
                position:    'absolute',
                right:        0,
                top:          '50%',
                transform:    'translateY(-50%)',
                width:        5,
                height:       5,
                borderRadius: '50%',
                background:   colors.to,
                boxShadow:    `0 0 6px ${colors.glow}, 0 0 10px ${colors.glow}`,
              }} />
            )}
          </div>
        )}
      </div>

      {/* 右側スコア */}
      <span style={{
        flexShrink: 0,
        minWidth:   42,
        textAlign:  'right',
        fontSize:   '0.68rem',
        fontWeight: 800,
        color:      isEmpty
          ? 'rgba(165,180,252,0.35)'
          : (variant === 'given' ? colors.to : colors.to),
        letterSpacing: '0.02em',
      }}>
        {Math.round(score)}
        <span style={{
          fontSize: '0.55rem',
          fontWeight: 600,
          color: 'rgba(165,180,252,0.45)',
          marginLeft: 2,
        }}>
          pt
        </span>
      </span>

      {/* 視覚的な日本語ラベル（補足） */}
      <span style={{
        flexShrink: 0,
        width: 22,
        fontSize: '0.55rem',
        color: 'rgba(165,180,252,0.35)',
        fontWeight: 600,
        textAlign: 'right',
      }}>
        {labelJa}
      </span>
    </div>
  );
}

// =====================================================================
// メインコンポーネント
// =====================================================================

export default function RadarChart({ data }: Props) {
  if (!data?.length) return null;

  // 既存呼び出し側で score プロパティを使っている場合の互換: given にフォールバック
  const normalized = data.map(d => ({
    subject:  d.subject,
    given:    d.given    ?? d.score ?? 0,
    received: d.received ?? 0,
    fullMark: d.fullMark,
  }));

  // 与打/被打すべての値の中で最大値（バー幅正規化に使用）
  const scaleMax = Math.max(
    1,
    ...normalized.map(d => d.given),
    ...normalized.map(d => d.received),
  );

  // 被打データの有無
  const hasReceived = normalized.some(d => d.received > 0);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {normalized.map((item, i) => {
        const totalRatio = item.fullMark > 0
          ? (item.given + item.received) / item.fullMark
          : 0;
        const isMostStruck =
          hasReceived &&
          item.received > 0 &&
          item.received === Math.max(...normalized.map(d => d.received));

        return (
          <div
            key={item.subject}
            style={{
              padding:      '8px 10px 9px',
              borderRadius: 10,
              background:   isMostStruck
                ? 'linear-gradient(135deg, rgba(127,29,29,0.18), rgba(20,10,20,0.3))'
                : 'rgba(99,102,241,0.04)',
              border:       isMostStruck
                ? '1px solid rgba(248,113,113,0.4)'
                : '1px solid rgba(99,102,241,0.12)',
              boxShadow:    isMostStruck ? '0 0 10px rgba(239,68,68,0.18)' : 'none',
              animation:    `fade-up .35s cubic-bezier(.4,0,.2,1) ${i * 60}ms both`,
            }}
          >
            {/* 部位ヘッダー行 */}
            <div style={{
              display:        'flex',
              alignItems:     'baseline',
              justifyContent: 'space-between',
              marginBottom:   6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize:      '0.86rem',
                  fontWeight:    800,
                  color:         isMostStruck ? '#fff' : '#c7d2fe',
                  letterSpacing: '0.04em',
                  fontFamily:    'M PLUS Rounded 1c, sans-serif',
                  textShadow:    isMostStruck ? '0 0 6px rgba(239,68,68,0.5)' : 'none',
                }}>
                  {item.subject}
                </span>
                {isMostStruck && (
                  <span style={{
                    fontSize:      '0.5rem',
                    fontWeight:    800,
                    color:         '#fff',
                    background:    'linear-gradient(90deg, #ef4444, #b45cff)',
                    padding:       '2px 6px',
                    borderRadius:  999,
                    letterSpacing: '0.08em',
                    boxShadow:     '0 0 6px rgba(239,68,68,0.5)',
                  }}>
                    要警戒
                  </span>
                )}
              </div>

              {/* 攻防バランス比率 */}
              {hasReceived && item.given + item.received > 0 && (() => {
                const givenRatio = item.given / (item.given + item.received);
                const recvRatio  = item.received / (item.given + item.received);
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: '0.55rem', fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}>
                    <span style={{ color: '#7dd3fc' }}>{Math.round(givenRatio * 100)}</span>
                    <span style={{ color: 'rgba(165,180,252,0.4)' }}>:</span>
                    <span style={{ color: '#fb7185' }}>{Math.round(recvRatio * 100)}</span>
                  </div>
                );
              })()}
            </div>

            {/* 与打バー */}
            <div style={{ marginBottom: hasReceived ? 4 : 0 }}>
              <SingleBar
                label="GIVEN"
                labelJa="与"
                score={item.given}
                fullMark={item.fullMark}
                scaleMax={scaleMax}
                variant="given"
              />
            </div>

            {/* 被打バー（被打データがどこかにある場合のみ表示） */}
            {hasReceived && (
              <SingleBar
                label="RECVD"
                labelJa="被"
                score={item.received}
                fullMark={item.fullMark}
                scaleMax={scaleMax}
                variant="received"
              />
            )}
          </div>
        );
      })}

      {/* 合計サマリー */}
      {normalized.length > 1 && (() => {
        const totalGiven    = normalized.reduce((s, d) => s + d.given, 0);
        const totalReceived = normalized.reduce((s, d) => s + d.received, 0);
        const totalSum      = totalGiven + totalReceived;
        const givenPct = totalSum > 0 ? (totalGiven / totalSum) * 100 : 100;
        const recvPct  = totalSum > 0 ? (totalReceived / totalSum) * 100 : 0;

        return (
          <div style={{
            marginTop:    4,
            padding:      '10px 12px',
            background:   'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(127,29,29,0.10))',
            borderRadius: 10,
            border:       '1px solid rgba(99,102,241,0.18)',
          }}>
            <div style={{
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
              marginBottom:   hasReceived ? 6 : 0,
            }}>
              <span style={{
                fontSize:      '0.6rem',
                fontWeight:    800,
                color:         'rgba(199,210,254,0.7)',
                letterSpacing: '0.14em',
              }}>
                ATTACK / DEFENSE BALANCE
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#7dd3fc' }}>
                  {totalGiven}
                </span>
                {hasReceived && (
                  <>
                    <span style={{ color: 'rgba(165,180,252,0.4)' }}>:</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fb7185' }}>
                      {Math.round(totalReceived)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* スタックバー（与打:被打の比率） */}
            {hasReceived && totalSum > 0 && (
              <div style={{
                position:     'relative',
                height:       8,
                borderRadius: 999,
                overflow:     'hidden',
                background:   'rgba(0,0,0,0.4)',
                border:       '1px solid rgba(255,255,255,0.05)',
                display:      'flex',
              }}>
                <div style={{
                  width:      `${givenPct}%`,
                  height:     '100%',
                  background: 'linear-gradient(90deg, #4f46e5, #22d3ee)',
                  boxShadow:  '0 0 6px rgba(34,211,238,0.4)',
                  transition: 'width .6s cubic-bezier(.4,0,.2,1)',
                }} />
                <div style={{
                  width:      `${recvPct}%`,
                  height:     '100%',
                  background: 'linear-gradient(90deg, #b91c1c, #ef4444)',
                  boxShadow:  '0 0 6px rgba(239,68,68,0.4)',
                  transition: 'width .6s cubic-bezier(.4,0,.2,1)',
                }} />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
