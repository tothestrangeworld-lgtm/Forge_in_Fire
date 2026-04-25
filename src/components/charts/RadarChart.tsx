'use client';

// =====================================================================
// RadarChart.tsx（改修2）
//
// 【設計方針】
//   レーダーチャートを廃止。
//   ユーザーが課題への「積み重ね（努力量）」を直感的に把握できるよう、
//   横型プログレスバー形式に変更。
//   Recharts に依存しないため SSR 問題もなし。
// =====================================================================

interface RadarDataPoint {
  subject:  string;
  score:    number;
  fullMark: number;
}

interface Props {
  data: RadarDataPoint[];
}

// スコア → グラデーションカラー
function barColor(score: number, fullMark: number): { from: string; to: string; glow: string } {
  const ratio = score / fullMark;
  if (ratio >= 0.85) return { from: '#d97706', to: '#fbbf24', glow: 'rgba(251,191,36,0.5)' };
  if (ratio >= 0.65) return { from: '#4f46e5', to: '#818cf8', glow: 'rgba(129,140,248,0.45)' };
  if (ratio >= 0.4)  return { from: '#1e40af', to: '#60a5fa', glow: 'rgba(96,165,250,0.35)' };
  return              { from: '#1e1b4b', to: '#4338ca', glow: 'rgba(67,56,202,0.25)' };
}

// スコア数値をラベル用テキストに変換
function scoreLabel(score: number, fullMark: number): string {
  const stars = Math.round((score / fullMark) * 5);
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}

export default function RadarChart({ data }: Props) {
  if (!data?.length) return null;

  const maxScore = Math.max(...data.map(d => d.score), 1);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((item, i) => {
        const ratio  = item.score / item.fullMark;
        const pct    = Math.round(ratio * 100);
        const colors = barColor(item.score, item.fullMark);
        // バーの幅はスコア / 全体最大スコアで正規化（最高値が100%になる）
        const barPct = Math.round((item.score / maxScore) * 100);

        return (
          <div
            key={item.subject}
            style={{
              animation: `fade-up .35s cubic-bezier(.4,0,.2,1) ${i * 60}ms both`,
            }}
          >
            {/* ラベル行 */}
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 5,
            }}>
              <span style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: ratio >= 0.65 ? '#c7d2fe' : 'rgba(129,140,248,0.7)',
                letterSpacing: '0.02em',
                fontFamily: 'M PLUS Rounded 1c, sans-serif',
              }}>
                {item.subject}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: '0.68rem',
                  color: colors.to,
                  letterSpacing: '0.04em',
                  filter: `drop-shadow(0 0 4px ${colors.glow})`,
                }}>
                  {scoreLabel(item.score, item.fullMark)}
                </span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: colors.to,
                  minWidth: 32,
                  textAlign: 'right',
                }}>
                  {pct}%
                </span>
              </div>
            </div>

            {/* バートラック */}
            <div style={{
              height: 9,
              background: 'rgba(99,102,241,0.08)',
              borderRadius: 999,
              overflow: 'hidden',
              position: 'relative',
            }}>
              {/* バー本体 */}
              <div style={{
                width: `${barPct}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${colors.from}, ${colors.to})`,
                borderRadius: 999,
                boxShadow: `0 0 8px ${colors.glow}`,
                transition: 'width .6s cubic-bezier(.4,0,.2,1)',
                position: 'relative',
              }}>
                {/* バー先端のグロー点 */}
                {barPct > 5 && (
                  <div style={{
                    position: 'absolute',
                    right: 0, top: '50%',
                    transform: 'translateY(-50%)',
                    width: 5, height: 5,
                    borderRadius: '50%',
                    background: colors.to,
                    boxShadow: `0 0 6px ${colors.glow}, 0 0 12px ${colors.glow}`,
                  }} />
                )}
              </div>
            </div>

            {/* スコア数値（絶対値表示） */}
            <div style={{
              marginTop: 3,
              fontSize: '0.62rem',
              color: 'rgba(99,102,241,0.4)',
              textAlign: 'right',
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}>
              {item.score.toLocaleString()} / {item.fullMark.toLocaleString()} pt
            </div>
          </div>
        );
      })}

      {/* 合計スコア */}
      {data.length > 1 && (() => {
        const totalScore   = data.reduce((s, d) => s + d.score, 0);
        const totalFullMark = data.reduce((s, d) => s + d.fullMark, 0);
        const totalRatio   = totalScore / totalFullMark;
        const totalColors  = barColor(totalScore, totalFullMark);

        return (
          <div style={{
            marginTop: 4,
            padding: '8px 12px',
            background: 'rgba(99,102,241,0.07)',
            borderRadius: 10,
            border: '1px solid rgba(99,102,241,0.15)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(129,140,248,0.6)', letterSpacing: '0.08em' }}>
              TOTAL
            </span>
            <span style={{
              fontSize: '1rem', fontWeight: 800,
              color: totalColors.to,
              filter: `drop-shadow(0 0 5px ${totalColors.glow})`,
            }}>
              {Math.round(totalRatio * 100)}%
            </span>
          </div>
        );
      })()}
    </div>
  );
}
