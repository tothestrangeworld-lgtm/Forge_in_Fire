'use client';

import { useState } from 'react';
import { TrendingUp, Flame, RotateCcw, Loader2, TrendingDown, UserRoundPen } from 'lucide-react';
import type { EpithetMasterEntry, UserTask } from '@/types';
import {
  calcLevelFromXp, calcProgressPercent, calcNextLevel,
  titleForLevel, nextTitleLevel, levelColor, resolveTechniqueName,
} from '@/types';
import { useDashboardSWR, resetStatus } from '@/lib/api';
import { calcEpithet } from '@/lib/epithet';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import dynamic from 'next/dynamic';

const XPTimelineChart = dynamic(() => import('@/components/charts/XPTimelineChart'), { ssr: false });
const SkillGrid       = dynamic(() => import('@/components/charts/SkillGrid'),       { ssr: false, loading: () => <ChartSkeleton h={500} /> });
const PlaystyleCharts = dynamic(() => import('@/components/charts/PlaystyleCharts'), { ssr: false, loading: () => <ChartSkeleton h={180} /> });

// =====================================================================
// スコア分布バー 色定義（サイバー和風テーマ）
// =====================================================================
const SCORE_COLORS: Record<number, string> = {
  5: '#4f46e5',
  4: '#6366f1',
  3: '#818cf8',
  2: '#c7d2fe',
  1: '#e0e7ff',
};

// =====================================================================
// メインページ
// =====================================================================
export default function DashboardPage() {
  const [resetting, setReset]     = useState(false);
  const [showReset, setShowReset] = useState(false);
  const user = getAuthUser();

  // ── SWR でダッシュボード + 技データを取得 ──────────────────────────
  const { data: swrData, error: swrError, isLoading, mutate } = useDashboardSWR();

  const data       = swrData?.dashboard ?? null;
  const techniques = swrData?.techniques ?? [];

  // AUTH_REQUIRED はリダイレクト任せにし、それ以外をエラー表示
  const error = swrError instanceof Error && swrError.message !== 'AUTH_REQUIRED'
    ? swrError.message
    : null;

  if (isLoading) return <DashboardSkeleton />;
  if (error)     return <ErrorState message={error} />;
  if (!data)     return null;

  // ── データ展開 ──
  const { status, logs, decay, xpHistory, tasks } = data;
  const tm            = data.titleMaster;
  const em            = data.epithetMaster ?? [] as EpithetMasterEntry[];
  const techMaster    = data.techniqueMaster ?? [];
  const level         = calcLevelFromXp(status.total_xp);
  const title         = titleForLevel(level, tm);
  const nextLv        = calcNextLevel(status.total_xp, tm);
  const progressPct   = calcProgressPercent(status.total_xp);
  const nextTitle     = nextTitleLevel(level, tm);
  const color         = levelColor(level);
  const epithet       = calcEpithet(techniques, em);
  const realRankLabel = status.real_rank ? status.real_rank : '無段';

  // 得意技名（techniqueMaster から解決）
  const favTechName = resolveTechniqueName(status.favorite_technique, techMaster);

  // 統計
  const today = new Date(); today.setHours(0,0,0,0);
  const dow    = today.getDay();
  const monday = new Date(today); monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const thisWeek = new Set(
    logs.filter(l => {
      const d = new Date(l.date); d.setHours(0,0,0,0);
      return d >= monday && d <= sunday && d <= today;
    }).map(l => l.date)
  ).size;
  const streak        = calcStreak(logs.map(l => l.date));
  const totalSessions = new Set(logs.map(l => l.date)).size;
  const avgScore      = logs.length > 0
    ? (logs.reduce((a, b) => a + b.score, 0) / logs.length).toFixed(1) : '—';

  // 課題
  const activeTasks: UserTask[] = (tasks ?? []).filter(t => t.status === 'active');

  // ── 稽古スコアバランス（分布）計算 ──────────────────────────────────
  // 直近50回のログから、課題ごとに評価1〜5の出現数・合計ポイントを集計
  const scoreDistData = activeTasks.map(t => {
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalPts  = 0;
    let totalCount = 0;
    logs.slice(-50).forEach(l => {
      if (l.item_name === t.task_text) {
        const s = l.score as number;
        if (s >= 1 && s <= 5) dist[s] = (dist[s] ?? 0) + 1;
        totalPts += s;
        totalCount++;
      }
    });
    return { taskText: t.task_text, dist, totalPts, totalCount };
  });
  const hasScoreData = scoreDistData.some(d => d.totalCount > 0);

  // 減衰
  const isDecaying   = (decay?.days_absent ?? 0) > 3;
  const decayPerDay  = decay?.today_penalty ?? 0;
  const appliedToday = decay?.applied ?? 0;

  async function handleReset() {
    if (!confirm('レベルとXPをリセットします。稽古ログは残ります。よろしいですか？')) return;
    setReset(true);
    try {
      await resetStatus();
      // SWR キャッシュを破棄して最新データを再取得
      await mutate();
    } finally {
      setReset(false);
      setShowReset(false);
    }
  }

  return (
    <div className="animate-fade-up" style={{ padding: '1.5rem 1rem 0' }}>

      {/* ── ヘッダー ───────────────────────── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div>
          <span className="section-title">稽古記録アプリ</span>
          <h1 className="kanji-title" style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
            百錬自得
          </h1>
        </div>
        <button
          onClick={() => setShowReset(v => !v)}
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: '1.5px solid rgba(99,102,241,0.2)',
            background: 'rgba(15,14,42,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'rgba(99,102,241,0.5)', flexShrink: 0,
          }}
          title="リセット設定"
        >
          <RotateCcw style={{ width: 14, height: 14 }} />
        </button>
      </header>

      {/* リセットパネル */}
      {showReset && (
        <div className="hud-card animate-fade-up" style={{
          marginBottom: '0.75rem',
          border: '1px solid rgba(239,68,68,0.3)',
        }}>
          <p style={{ fontWeight: 700, color: '#f87171', fontSize: '0.85rem', margin: '0 0 6px' }}>⚠️ レベルリセット</p>
          <p style={{ fontSize: '0.75rem', color: 'rgba(129,140,248,0.5)', margin: '0 0 12px' }}>
            XP・レベル・称号を初期値に戻します。稽古ログは削除されません。
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowReset(false)}
              style={{
                flex: 1, padding: '8px', borderRadius: 8,
                border: '1px solid rgba(99,102,241,0.2)',
                background: 'rgba(15,14,42,0.6)',
                cursor: 'pointer', fontSize: '0.8rem',
                fontFamily: 'inherit', fontWeight: 600,
                color: 'rgba(129,140,248,0.6)',
              }}
            >
              キャンセル
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              style={{
                flex: 1, padding: '8px', borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.4)',
                background: 'rgba(239,68,68,0.15)',
                color: '#f87171',
                cursor: 'pointer', fontSize: '0.8rem',
                fontFamily: 'inherit', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {resetting
                ? <Loader2 style={{ width: 14, height: 14, animation: 'spin .8s linear infinite' }} />
                : 'リセットする'}
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </button>
          </div>
        </div>
      )}

      {/* 減衰警告 */}
      {isDecaying && (
        <div className="animate-fade-up" style={{
          marginBottom: '0.75rem', borderRadius: 14,
          background: decayPerDay >= 100
            ? 'rgba(239,68,68,0.08)'
            : 'rgba(251,191,36,0.07)',
          border: `1.5px solid ${decayPerDay >= 100 ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.25)'}`,
          padding: '0.75rem 1rem',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: decayPerDay >= 100 ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <TrendingDown style={{ width: 18, height: 18, color: decayPerDay >= 100 ? '#f87171' : '#fbbf24' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: decayPerDay >= 100 ? '#f87171' : '#fbbf24', margin: '0 0 2px' }}>
              {decay?.days_absent}日間稽古していません
            </p>
            <p style={{ fontSize: '0.68rem', color: decayPerDay >= 100 ? 'rgba(248,113,113,0.7)' : 'rgba(251,191,36,0.6)', margin: 0 }}>
              現在 <span style={{ fontWeight: 700 }}>-{decayPerDay} XP/日</span> ペースで減少中
              {appliedToday > 0 && ` （本日 -${appliedToday} XP 適用済み）`}
            </p>
          </div>
        </div>
      )}

      {/* ── XP + 称号カード ───────────────────────── */}
      <div className="hud-card hud-frame animate-fade-up delay-100" style={{ marginBottom: '0.75rem' }}>
        {/* 名前 + 段位 + 編集ボタン */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: '0.65rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'rgba(199,210,254,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name ?? '剣士'}
            </span>
            <span style={{
              fontSize: '0.62rem', fontWeight: 800,
              padding: '0.15rem 0.5rem', borderRadius: 999,
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(129,140,248,0.3)',
              color: 'rgba(167,139,250,0.8)',
              whiteSpace: 'nowrap',
            }}>
              リアル: {realRankLabel}
            </span>
          </div>
          <a
            href="/settings/profile"
            style={{
              width: 34, height: 34, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(129,140,248,0.25)',
              color: 'rgba(167,139,250,0.8)',
              textDecoration: 'none', flexShrink: 0,
              transition: 'all .15s',
            }}
            title="プロフィールを編集"
          >
            <UserRoundPen style={{ width: 16, height: 16 }} />
          </a>
        </div>

        {/* 二つ名 + 称号 */}
        <div style={{ marginBottom: '0.85rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(167,139,250,0.8)', letterSpacing: '0.06em', display: 'block', lineHeight: 1.3 }}>
            {epithet.name}
          </span>
          <span style={{
            fontSize: '1.75rem', fontWeight: 800, display: 'block', lineHeight: 1.2,
            background: `linear-gradient(135deg, #fff, ${color})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {title}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'rgba(129,140,248,0.35)', display: 'block', marginTop: 2 }}>
            {epithet.description}
          </span>
        </div>

        {/* 座右の銘 */}
        {status.motto?.trim() && (
          <p style={{
            margin: '-0.25rem 0 0.9rem',
            color: 'rgba(199,210,254,0.85)',
            fontWeight: 800, fontSize: '0.9rem',
            letterSpacing: '0.06em',
            textShadow: '0 0 12px rgba(99,102,241,0.4)',
          }}>
            「{status.motto}」
          </p>
        )}

        {/* 得意技バッジ */}
        {favTechName && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 999, marginBottom: '0.75rem',
            background: 'rgba(120,53,15,0.2)',
            border: '1px solid rgba(251,191,36,0.3)',
            boxShadow: '0 0 8px rgba(251,191,36,0.1)',
          }}>
            <span style={{ fontSize: 12, filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.8))' }}>★</span>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(251,191,36,0.7)', letterSpacing: '0.06em' }}>
              得意技
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fde68a' }}>
              {favTechName}
            </span>
          </div>
        )}

        {/* XP表示 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <div>
            <span className="section-title" style={{ color: 'rgba(129,140,248,0.5)' }}>TOTAL XP</span>
            <p className="hud-counter-value" style={{ fontSize: '2rem', margin: 0, lineHeight: 1 }}>
              {status.total_xp.toLocaleString()}
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'rgba(129,140,248,0.4)', marginLeft: 4 }}>xp</span>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              display: 'inline-block', fontSize: '0.68rem', fontWeight: 700,
              padding: '0.2rem 0.65rem', borderRadius: 999,
              background: color, color: '#fff',
              boxShadow: `0 0 8px ${color}66`,
            }}>
              {title}
            </span>
            <p style={{ fontSize: '0.65rem', color: 'rgba(129,140,248,0.35)', marginTop: 3 }}>Lv.{level}</p>
          </div>
        </div>

        {/* XPバー */}
        {nextLv && (
          <>
            <div className="xp-bar-track">
              <div className="xp-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <p style={{ fontSize: '0.65rem', color: 'rgba(129,140,248,0.4)', margin: 0 }}>
                次のLv.{level+1}まで{' '}
                <span style={{ fontWeight: 700, color: '#a5b4fc' }}>
                  {(nextLv.xp - status.total_xp).toLocaleString()} xp
                </span>
              </p>
              {nextTitle && (
                <p style={{ fontSize: '0.65rem', color: 'rgba(99,102,241,0.3)', margin: 0 }}>
                  「{nextTitle.title}」→ Lv.{nextTitle.level}
                </p>
              )}
            </div>
          </>
        )}
        {!nextLv && (
          <p style={{ fontSize: '0.75rem', color: '#fde68a', fontWeight: 700, marginTop: 6,
            textShadow: '0 0 10px rgba(251,191,36,0.5)' }}>
            🏆 最高位「剣道の神」に到達！
          </p>
        )}
      </div>

      {/* ── HUDカウンター群 ───────────────────── */}
      <div className="hud-card hud-scanline animate-fade-up delay-100" style={{ marginBottom: '0.75rem' }}>
        <span className="section-title">STATS</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {[
            { value: String(streak),        unit: '日',  label: 'STREAK',    variant: streak >= 7 ? 'gold' : '' },
            { value: String(thisWeek),      unit: '回',  label: 'THIS WEEK', variant: 'cyan' },
            { value: String(totalSessions), unit: '回',  label: 'TOTAL',     variant: '' },
            { value: String(avgScore),      unit: '',    label: 'AVG SCORE', variant: '' },
          ].map(({ value, unit, label, variant }) => (
            <div key={label} style={{
              padding: '10px 4px',
              textAlign: 'center',
              borderRight: '1px solid rgba(99,102,241,0.1)',
            }}>
              <div className={`hud-counter-value ${variant}`} style={{ fontSize: '1.4rem' }}>
                {value}
                {unit && <span style={{ fontSize: '0.65rem', marginLeft: 1, opacity: 0.7 }}>{unit}</span>}
              </div>
              <div className="hud-counter-label">{label}</div>
            </div>
          ))}
        </div>

        {/* 減衰ペナルティ表示 */}
        {isDecaying && (
          <div style={{
            marginTop: 10,
            padding: '6px 10px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <TrendingDown style={{ width: 12, height: 12, color: '#f87171', flexShrink: 0 }} />
            <span style={{ fontSize: '0.68rem', color: 'rgba(248,113,113,0.7)', fontWeight: 700 }}>
              現在 -{decayPerDay} XP/日 ペナルティ中
            </span>
          </div>
        )}
      </div>

      {/* ── 現在の評価項目 ───────────────────────── */}
      <div className="hud-card animate-fade-up delay-100" style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div>
            <span className="section-title">現在の評価項目</span>
            <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(99,102,241,0.35)' }}>
              稽古記録で毎日1〜5評価する課題。
            </p>
          </div>
          <a
            href="/settings/tasks"
            style={{
              padding: '0.45rem 0.7rem', fontSize: '0.72rem', borderRadius: 10,
              border: '1px solid rgba(129,140,248,0.3)',
              color: 'rgba(167,139,250,0.7)',
              background: 'rgba(99,102,241,0.08)',
              textDecoration: 'none', flexShrink: 0,
              fontWeight: 700, fontFamily: 'inherit',
            }}
            title="評価項目を編集"
          >
            課題を編集する
          </a>
        </div>

        {activeTasks.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeTasks.map(t => (
              <li key={t.id} style={{ color: 'rgba(199,210,254,0.85)', fontWeight: 700, lineHeight: 1.35, fontSize: '0.9rem' }}>
                {t.task_text}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(99,102,241,0.4)', fontWeight: 700 }}>
            有効な評価項目がありません
          </p>
        )}
      </div>

      {/* ── スキルグリッド ── */}
      <div className="animate-fade-up delay-200" style={{ marginBottom: '0.75rem' }}>
        <span className="section-title">スキルグリッド</span>
        {techniques.length > 0 ? (
          <SkillGrid
            techniques={techniques}
            signatureTechId={status.favorite_technique ?? undefined}
          />
        ) : (
          <div style={{
            padding: '2rem 1rem', textAlign: 'center',
            border: '1px solid rgba(99,102,241,0.1)', borderRadius: 16,
            background: 'rgba(99,102,241,0.03)',
          }}>
            <p style={{ fontSize: '0.85rem', color: 'rgba(99,102,241,0.4)', margin: 0 }}>
              技データがありません。technique_master シートにデータを追加してください。
            </p>
          </div>
        )}
        <p style={{ fontSize: '0.62rem', color: 'rgba(99,102,241,0.35)', marginTop: 5, textAlign: 'right' }}>
          ピンチ/スクロールで拡大・縮小
        </p>
      </div>

      {/* ── XP推移 ───────────────────────────────── */}
      <div className="hud-card animate-fade-up delay-200" style={{ marginBottom: '0.75rem' }}>
        <span className="section-title">XP推移</span>
        <XPTimelineChart xpHistory={xpHistory} compact={true} />
      </div>

      {/* ── 課題別 評価スコア分布（積み上げバー）───── */}
      <div className="hud-card animate-fade-up delay-300" style={{ marginBottom: '0.75rem' }}>
        <span className="section-title">課題別 評価スコア分布（直近50回）</span>

        {/* 凡例 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {([5, 4, 3, 2, 1] as const).map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{
                width: 8, height: 8, borderRadius: 2,
                background: SCORE_COLORS[n], flexShrink: 0,
              }} />
              <span style={{ fontSize: '0.6rem', color: 'rgba(199,210,254,0.5)', fontWeight: 600 }}>
                {n}
              </span>
            </div>
          ))}
        </div>

        {hasScoreData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scoreDistData.map(({ taskText, dist, totalPts, totalCount }) => (
              <div
                key={taskText}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                }}
              >
                {/* 課題名 (約30%) */}
                <div style={{
                  flex: '0 0 30%',
                  minWidth: 0,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: 'rgba(199,210,254,0.85)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {taskText}
                </div>

                {/* 積み上げバー (約55%) */}
                <div style={{
                  flex: '0 0 55%',
                  minWidth: 0,
                  height: 12,
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: 'rgba(99,102,241,0.1)',
                  display: 'flex',
                  flexDirection: 'row',
                }}>
                  {totalCount > 0
                    ? ([5, 4, 3, 2, 1] as const).map(score => {
                        const pct = (dist[score] / totalCount) * 100;
                        if (pct <= 0) return null;
                        return (
                          <div
                            key={score}
                            title={`評価${score}: ${dist[score]}回`}
                            style={{
                              width: `${pct}%`,
                              background: SCORE_COLORS[score],
                              flexShrink: 0,
                              transition: 'width 0.4s ease',
                            }}
                          />
                        );
                      })
                    : (
                      // データなし：薄いプレースホルダー
                      <div style={{
                        width: '100%',
                        background: 'rgba(99,102,241,0.08)',
                        borderRadius: 6,
                      }} />
                    )
                  }
                </div>

                {/* 合計ポイント (約15%) */}
                <div style={{
                  flex: '0 0 15%',
                  textAlign: 'right',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: totalCount > 0 ? '#a5b4fc' : 'rgba(99,102,241,0.25)',
                  whiteSpace: 'nowrap',
                }}>
                  {totalCount > 0 ? `${totalPts} pt` : '—'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'rgba(99,102,241,0.4)', padding: '1.5rem 0', margin: 0 }}>
            評価項目を設定して稽古を記録すると、ここにスコア分布が表示されます
          </p>
        )}
      </div>

      {/* ── プレイスタイル分析 ───────────────────── */}
      {techniques.length > 0 && (
        <div className="hud-card animate-fade-up delay-300" style={{ marginBottom: '1rem' }}>
          <span className="section-title">プレイスタイル分析</span>
          <PlaystyleCharts techniques={techniques} />
        </div>
      )}

    </div>
  );
}

// =====================================================================
// ユーティリティ
// =====================================================================
function calcStreak(dates: string[]): number {
  const unique = [...new Set(dates)].sort().reverse();
  if (!unique.length) return 0;
  const today = new Date(); today.setHours(0,0,0,0);
  let streak = 0;
  for (let i = 0; i < unique.length; i++) {
    const d        = new Date(unique[i]); d.setHours(0,0,0,0);
    const expected = new Date(today);     expected.setDate(today.getDate() - i);
    if (d.getTime() === expected.getTime()) streak++;
    else break;
  }
  return streak;
}

// =====================================================================
// ローディング・エラー・スケルトン
// =====================================================================
function ChartSkeleton({ h }: { h: number }) {
  return (
    <div style={{
      height: h, borderRadius: 16,
      background: 'rgba(99,102,241,0.06)',
      border: '1px solid rgba(99,102,241,0.08)',
    }} />
  );
}

function DashboardSkeleton() {
  return (
    <div style={{ padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {[28, 160, 80, 540, 200, 300].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: 16,
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.08)',
          animation: `pulse 1.8s ${i * 0.1}s ease-in-out infinite`,
        }} />
      ))}
      <style>{`
        @keyframes pulse {
          0%,100%{ opacity:0.6; }
          50%    { opacity:1;   }
        }
      `}</style>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ padding: '5rem 2rem', textAlign: 'center' }}>
      <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</p>
      <p style={{ fontWeight: 700, color: '#c7d2fe', marginBottom: 8 }}>データ取得に失敗しました</p>
      <p style={{ fontSize: '0.75rem', color: 'rgba(99,102,241,0.4)' }}>{message}</p>
      <a href="/debug" style={{ display: 'inline-block', marginTop: 16, fontSize: '0.75rem', color: '#818cf8', fontWeight: 700 }}>
        🔍 ログを確認する
      </a>
    </div>
  );
}
