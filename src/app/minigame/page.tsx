'use client';

/**
 * =====================================================================
 * 刹那ノ見切 (Setsuna no Mikiri) - 反射神経養成ミニゲーム
 * =====================================================================
 * Phase 16 Step2: GAS連携・XP付与システム実装版
 *
 * 追加機能:
 *  - 初回マウント時に fetchMinigameStatus() で本日プレイ数を確認
 *  - 試合終了時に saveMinigameResult() でスコア保存・XP付与
 *  - ランク判定（S/A/B/C/F）をフロントで算出してサーバーへ送信
 *  - 通信中ローディング・エラーハンドリング
 *  - リザルト画面に獲得XPを表示
 * =====================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap, AlertTriangle, Loader2, Trophy } from 'lucide-react';
import {
  fetchMinigameStatus,
  saveMinigameResult,
  type MinigameRank,
  type MinigameSaveResult,
} from '@/lib/api';

// =====================================================================
// 型定義
// =====================================================================
type HitPart = 'men' | 'kote' | 'do';

type PatternId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

interface Pattern {
  id:           PatternId;
  successName:  string;
  correctPart:  HitPart;
  duration:     number;
  category:     'oji' | 'shikake';
  failLabel:    '被弾' | '見逃し';
  animClass:    string;
  glowPart:     HitPart;
}

type GamePhase =
  | 'loading'      // ★ 初期ステータス取得中
  | 'idle'
  | 'waiting'
  | 'reacting'
  | 'result'
  | 'matchEnd'
  | 'submitting'   // ★ スコア送信中
  | 'locked'
  | 'error';       // ★ 通信エラー

interface RoundResult {
  patternId:    PatternId;
  success:      boolean;
  reactionMs:   number | null;
  successName:  string;
  failLabel:    string;
}

// =====================================================================
// 8パターン定義
// =====================================================================
const PATTERNS: Pattern[] = [
  { id: 'A', successName: '出端小手',     correctPart: 'kote', glowPart: 'kote', duration: 800, category: 'oji',     failLabel: '被弾',   animClass: 'anim-A' },
  { id: 'B', successName: '面返し胴',     correctPart: 'do',   glowPart: 'do',   duration: 380, category: 'oji',     failLabel: '被弾',   animClass: 'anim-B' },
  { id: 'C', successName: '出端面',       correctPart: 'men',  glowPart: 'men',  duration: 500, category: 'oji',     failLabel: '被弾',   animClass: 'anim-C' },
  { id: 'D', successName: '小手返し面',   correctPart: 'men',  glowPart: 'men',  duration: 400, category: 'oji',     failLabel: '被弾',   animClass: 'anim-D' },
  { id: 'E', successName: '小手抜き面',   correctPart: 'men',  glowPart: 'men',  duration: 500, category: 'oji',     failLabel: '被弾',   animClass: 'anim-E' },
  { id: 'F', successName: '合い小手面',   correctPart: 'kote', glowPart: 'kote', duration: 300, category: 'oji',     failLabel: '被弾',   animClass: 'anim-F' },
  { id: 'G', successName: '飛び込み面',   correctPart: 'men',  glowPart: 'men',  duration: 500, category: 'shikake', failLabel: '見逃し', animClass: 'anim-G' },
  { id: 'H', successName: '飛び込み小手', correctPart: 'kote', glowPart: 'kote', duration: 500, category: 'shikake', failLabel: '見逃し', animClass: 'anim-H' },
];

const ROUNDS_PER_MATCH = 3;
const MAX_MATCHES_PER_DAY = 3;

// =====================================================================
// ユーティリティ
// =====================================================================
const randomBetween = (min: number, max: number) =>
  Math.random() * (max - min) + min;

const pickRandomPattern = (): Pattern =>
  PATTERNS[Math.floor(Math.random() * PATTERNS.length)];

const formatTime = (ms: number | null): string => {
  if (ms === null || ms === undefined) return '—';
  return `${(ms / 1000).toFixed(3)}s`;
};

/**
 * ★ Phase16: ランク判定ロジック
 * 成功本数と平均反応速度に基づいてS/A/B/C/Fを返す。
 *
 * S: 全本(3/3)成功 かつ 平均 < 0.30s
 * A: 全本(3/3)成功 かつ 平均 < 0.45s
 * B: 全本(3/3)成功 もしくは 平均 < 0.60s
 * C: 1本以上成功
 * F: 全本失敗（参加賞）
 */
function calcRank(successCount: number, avgMs: number | null): MinigameRank {
  if (successCount === 0 || avgMs === null) return 'F';
  if (successCount === ROUNDS_PER_MATCH) {
    if (avgMs < 300) return 'S';
    if (avgMs < 450) return 'A';
    return 'B';
  }
  if (avgMs < 600) return 'B';
  return 'C';
}

// =====================================================================
// メインコンポーネント
// =====================================================================
export default function MiniGamePage() {
  const [phase, setPhase]               = useState<GamePhase>('loading');
  const [matchCount, setMatchCount]     = useState(0);
  const [roundIdx, setRoundIdx]         = useState(0);
  const [currentPattern, setCurrentPattern] = useState<Pattern | null>(null);
  const [results, setResults]           = useState<RoundResult[]>([]);
  const [lastResult, setLastResult]     = useState<RoundResult | null>(null);
  const [flashType, setFlashType]       = useState<'none' | 'success' | 'fail'>('none');

  // ★ Phase16: 通信関連 state
  const [bestTimeMs, setBestTimeMs]     = useState<number | null>(null);
  const [lastSaveResult, setLastSaveResult] = useState<MinigameSaveResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const startTimeRef = useRef<number | null>(null);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stale Closure 対策
  const roundIdxRef    = useRef(0);
  const matchCountRef  = useRef(0);
  useEffect(() => { roundIdxRef.current   = roundIdx;   }, [roundIdx]);
  useEffect(() => { matchCountRef.current = matchCount; }, [matchCount]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ===================================================================
  // ★ Phase16: 初回マウント時に GAS からステータス取得
  // ===================================================================
  // 変更後
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    (async () => {
      try {
        const status = await fetchMinigameStatus();
        setMatchCount(status.todayPlayed);
        matchCountRef.current = status.todayPlayed;
        setBestTimeMs(status.bestTimeMs);
        if (status.locked) {
          setPhase('locked');
        } else {
          setPhase('idle');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        setPhase('error');
      }
    })();
  }, []);

  // ===================================================================
  // 1本終了処理（バグ修正版を維持）
  // ===================================================================
  const finishRound = useCallback((result: RoundResult) => {
    setLastResult(result);
    setResults(prev => [...prev, result]);
    setFlashType(result.success ? 'success' : 'fail');
    setPhase('result');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setFlashType('none');
      setCurrentPattern(null);

      const nextIdx = roundIdxRef.current + 1;

      if (nextIdx >= ROUNDS_PER_MATCH) {
        setPhase('matchEnd');
      } else {
        setRoundIdx(nextIdx);
        roundIdxRef.current = nextIdx;
        setPhase('waiting');
        scheduleNextRound();
      }
    }, 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTimeout = useCallback((pattern: Pattern) => {
    finishRound({
      patternId:   pattern.id,
      success:     false,
      reactionMs:  null,
      successName: pattern.successName,
      failLabel:   pattern.failLabel,
    });
  }, [finishRound]);

  const scheduleNextRound = useCallback(() => {
    const wait = randomBetween(1500, 3500);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const pattern = pickRandomPattern();
      setCurrentPattern(pattern);
      startTimeRef.current = performance.now();
      setPhase('reacting');

      timerRef.current = setTimeout(() => {
        handleTimeout(pattern);
      }, pattern.duration);
    }, wait);
  }, [handleTimeout]);

  const startMatch = useCallback(() => {
    if (matchCountRef.current >= MAX_MATCHES_PER_DAY) {
      setPhase('locked');
      return;
    }
    setRoundIdx(0);
    roundIdxRef.current = 0;
    setResults([]);
    setLastResult(null);
    setLastSaveResult(null);
    setPhase('waiting');
    scheduleNextRound();
  }, [scheduleNextRound]);

  const handleTap = (part: HitPart) => {
    if (phase !== 'reacting' || !currentPattern || startTimeRef.current === null) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const reactionMs = performance.now() - startTimeRef.current;
    const success    = part === currentPattern.correctPart;

    finishRound({
      patternId:   currentPattern.id,
      success,
      reactionMs:  success ? reactionMs : null,
      successName: currentPattern.successName,
      failLabel:   currentPattern.failLabel,
    });
  };

  // 平均反応速度・成功本数
  const averageReaction = useMemo(() => {
    const successes = results.filter(r => r.success && r.reactionMs !== null);
    if (successes.length === 0) return null;
    const sum = successes.reduce((acc, r) => acc + (r.reactionMs ?? 0), 0);
    return sum / successes.length;
  }, [results]);

  const successCount = results.filter(r => r.success).length;

  // 試合終了時のランク（リザルト画面用）
  const currentRank = useMemo<MinigameRank>(() => {
    return calcRank(successCount, averageReaction);
  }, [successCount, averageReaction]);

  // ===================================================================
  // ★ Phase16: matchEnd フェーズ突入時に GAS へスコア送信
  // ===================================================================
// ★ 修正: 二重送信防止フラグを useRef で管理し、クリーンアップで state 更新を阻害しない
const isSubmittingRef = useRef(false);

useEffect(() => {
  if (phase !== 'matchEnd') return;
  if (results.length !== ROUNDS_PER_MATCH) return;
  if (lastSaveResult !== null) return;
  if (isSubmittingRef.current) return; // ★ Ref で二重実行を完全防止

  isSubmittingRef.current = true;
  setPhase('submitting');

  (async () => {
    try {
      const avgMs = averageReaction !== null ? Math.round(averageReaction) : 0;
      const rank  = calcRank(successCount, averageReaction);
      const res   = await saveMinigameResult({
        averageTime: avgMs,
        rank,
      });
      // ★ mounted チェックを廃止。常に state を更新する
      setLastSaveResult(res);
      setMatchCount(res.todayPlayed);
      matchCountRef.current = res.todayPlayed;
      if (avgMs > 0 && (bestTimeMs === null || avgMs < bestTimeMs)) {
        setBestTimeMs(avgMs);
      }
      setPhase('matchEnd');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setPhase('matchEnd');
    } finally {
      isSubmittingRef.current = false;
    }
  })();

  // ★ クリーンアップ削除（mounted フラグ廃止）
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [phase]);

  return (
    <div className="mikiri-root">
      <div className="mikiri-bg" aria-hidden="true">
        <div className="mikiri-grid" />
        <div className="mikiri-scan" />
      </div>

      <header className="mikiri-header">
        <Link href="/" className="mikiri-back" aria-label="戻る">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="mikiri-title">
          <span className="mikiri-title-main">刹那ノ見切</span>
          <span className="mikiri-title-sub">SETSUNA NO MIKIRI</span>
        </h1>
        <div className="mikiri-counter">
          <span>{matchCount}</span>/<span>{MAX_MATCHES_PER_DAY}</span>
        </div>
      </header>

      <main className="mikiri-stage">
        {flashType === 'success' && <div className="flash-success" aria-hidden="true" />}
        {flashType === 'fail'    && <div className="flash-fail"    aria-hidden="true" />}

        <div
          className={`kenshi-wrap ${currentPattern ? currentPattern.animClass : ''} ${
            phase === 'reacting' ? 'is-active' : ''
          }`}
        >
          <KenshiSVG
            glowPart={currentPattern?.glowPart ?? null}
            active={phase === 'reacting'}
            onTap={handleTap}
          />
        </div>

        {/* ★ ローディング（初期取得中） */}
        {phase === 'loading' && (
          <div className="overlay">
            <div className="loading-box">
              <Loader2 size={32} className="loading-spin" />
              <p>状態を取得中…</p>
            </div>
          </div>
        )}

        {/* ★ エラー */}
        {phase === 'error' && (
          <div className="overlay">
            <div className="locked-box">
              <AlertTriangle size={32} />
              <h2>通信エラー</h2>
              <p>{errorMessage || 'サーバーとの通信に失敗しました。'}</p>
              <button
                className="btn-start"
                style={{ marginTop: 16 }}
                onClick={() => window.location.reload()}
                type="button"
              >
                再読み込み
              </button>
            </div>
          </div>
        )}

        {phase === 'idle' && (
          <div className="overlay">
            {bestTimeMs !== null && (
              <div className="best-time">
                <Trophy size={14} />
                <span>自己ベスト: {formatTime(bestTimeMs)}</span>
              </div>
            )}
            <button className="btn-start" onClick={startMatch} type="button">
              <Zap size={20} /> 試合開始
            </button>
            <p className="overlay-round" style={{ marginTop: 8 }}>
              本日 {matchCount} / {MAX_MATCHES_PER_DAY} 試合
            </p>
          </div>
        )}

        {phase === 'waiting' && (
          <div className="overlay overlay--passive">
            <p className="overlay-msg">…構え…</p>
            <p className="overlay-round">{roundIdx + 1} / {ROUNDS_PER_MATCH} 本目</p>
          </div>
        )}

        {phase === 'result' && lastResult && (
          <div className="overlay overlay--passive">
            {lastResult.success ? (
              <div className="result-success">
                <p className="result-tech">{lastResult.successName}</p>
                <p className="result-time">{formatTime(lastResult.reactionMs)}</p>
              </div>
            ) : (
              <div className="result-fail">
                <p className="result-fail-label">{lastResult.failLabel}</p>
                <p className="result-fail-sub">想定: {lastResult.successName}</p>
              </div>
            )}
          </div>
        )}

        {/* ★ スコア送信中 */}
        {phase === 'submitting' && (
          <div className="overlay">
            <div className="loading-box">
              <Loader2 size={32} className="loading-spin" />
              <p>結果を記録中…</p>
            </div>
          </div>
        )}

        {phase === 'matchEnd' && (
          <div className="overlay">
            <div className="result-summary">
              <h2>試合終了</h2>

              {/* ★ ランク表示 */}
              <div className={`rank-display rank-${currentRank}`}>
                <span className="rank-label">RANK</span>
                <span className="rank-value">{currentRank}</span>
              </div>

              <p className="summary-line">
                成功: <strong>{successCount}</strong> / {ROUNDS_PER_MATCH}
              </p>
              <p className="summary-line">
                平均反応速度: <strong>{formatTime(averageReaction)}</strong>
              </p>

              {/* ★ 獲得XP表示 */}
              {lastSaveResult && (
                <p className="summary-line summary-xp">
                  獲得XP: <strong className="xp-value">+{lastSaveResult.earnedXp}</strong>
                </p>
              )}
              {!lastSaveResult && errorMessage && (
                <p className="summary-error">
                  ※ スコアの保存に失敗しました（{errorMessage}）
                </p>
              )}

              <div className="summary-rounds">
                {results.map((r, i) => (
                  <div key={i} className={`summary-round ${r.success ? 'ok' : 'ng'}`}>
                    <span>{i + 1}</span>
                    <span>{r.success ? r.successName : r.failLabel}</span>
                    <span>{formatTime(r.reactionMs)}</span>
                  </div>
                ))}
              </div>

              {matchCount < MAX_MATCHES_PER_DAY ? (
                <button className="btn-start" onClick={startMatch} type="button">
                  次の試合へ ({matchCount}/{MAX_MATCHES_PER_DAY})
                </button>
              ) : (
                <p className="locked-msg">
                  <AlertTriangle size={16} /> 本日の試合上限に到達しました
                </p>
              )}
            </div>
          </div>
        )}

        {phase === 'locked' && (
          <div className="overlay">
            <div className="locked-box">
              <AlertTriangle size={32} />
              <h2>本日の仮想稽古、終了</h2>
              <p>1日3試合まで挑戦可能です。明日また鍛錬されよ。</p>
              {bestTimeMs !== null && (
                <p className="locked-best">
                  <Trophy size={14} /> 自己ベスト: {formatTime(bestTimeMs)}
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .mikiri-root {
          position: fixed; inset: 0;
          background: #050810; color: #e0f2ff;
          overflow: hidden; font-family: 'Noto Sans JP', sans-serif;
          display: flex; flex-direction: column;
        }

        .mikiri-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
        .mikiri-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(0, 200, 255, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 200, 255, 0.08) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);
        }
        .mikiri-scan {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, transparent 0%, rgba(0, 200, 255, 0.04) 50%, transparent 100%);
          background-size: 100% 8px;
          animation: scanMove 6s linear infinite;
          opacity: 0.5;
        }
        @keyframes scanMove {
          from { background-position: 0 0; }
          to   { background-position: 0 100%; }
        }

        .mikiri-header {
          position: relative; z-index: 2;
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px 8px;
          border-bottom: 1px solid rgba(0, 200, 255, 0.2);
          backdrop-filter: blur(6px);
        }
        .mikiri-back {
          color: #7ed9ff; padding: 6px; border-radius: 6px; transition: background 0.2s;
        }
        .mikiri-back:hover { background: rgba(0, 200, 255, 0.1); }
        .mikiri-title { text-align: center; line-height: 1; margin: 0; }
        .mikiri-title-main {
          display: block; font-size: 18px; font-weight: 700;
          letter-spacing: 0.4em; color: #e0f2ff;
          text-shadow: 0 0 12px rgba(0, 200, 255, 0.6);
        }
        .mikiri-title-sub {
          display: block; font-size: 9px; letter-spacing: 0.3em;
          color: #5fa3c7; margin-top: 4px;
        }
        .mikiri-counter {
          font-family: 'Courier New', monospace; font-size: 14px;
          color: #7ed9ff; background: rgba(0, 200, 255, 0.08);
          border: 1px solid rgba(0, 200, 255, 0.3);
          border-radius: 4px; padding: 4px 10px;
        }
        .mikiri-counter span:first-child { color: #fff; font-weight: 700; }

        .mikiri-stage {
          position: relative; z-index: 1; flex: 1;
          display: flex; align-items: center; justify-content: center;
        }
        .kenshi-wrap {
          position: relative;
          width: min(80vw, 360px);
          aspect-ratio: 3 / 5;
          transform-origin: center center;
          filter: drop-shadow(0 0 10px rgba(0, 200, 255, 0.4));
        }

        /* ============================================================ */
        /* 8パターンアニメ（無変更）                                    */
        /* ============================================================ */
        :global(.anim-A .sword) {
          transform-origin: 50% 100%;
          animation: swordMenSlow 0.8s cubic-bezier(0.55, 0, 1, 0.45) forwards;
        }
        :global(.anim-A) {
          animation: bodyMenAdvanceSlow 0.8s cubic-bezier(0.6, 0, 1, 0.5) forwards;
        }
        @keyframes swordMenSlow {
          0%   { transform: translateY(0)     scale(1); }
          50%  { transform: translateY(-22px) scale(1.05); }
          100% { transform: translateY(18px)  scale(1.35); }
        }
        @keyframes bodyMenAdvanceSlow {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.02); }
          100% { transform: scale(1.10); }
        }

        :global(.anim-B .sword) {
          transform-origin: 50% 100%;
          animation: swordMenFast 0.38s cubic-bezier(0.7, 0, 1, 0.4) forwards;
        }
        :global(.anim-B) {
          animation: bodyMenAdvanceFast 0.38s cubic-bezier(0.7, 0, 1, 0.4) forwards;
        }
        @keyframes swordMenFast {
          0%   { transform: translateY(0)     scale(1); }
          45%  { transform: translateY(-30px) scale(1.10); }
          100% { transform: translateY(28px)  scale(1.50); }
        }
        @keyframes bodyMenAdvanceFast {
          0%   { transform: scale(1); }
          45%  { transform: scale(1.04); }
          100% { transform: scale(1.18); }
        }

        :global(.anim-C) {
          animation: zoomIn 0.5s cubic-bezier(0.55, 0, 1, 0.45) forwards;
        }
        @keyframes zoomIn {
          0%   { transform: scale(1); }
          100% { transform: scale(1.18); }
        }

        :global(.anim-D .sword) {
          transform-origin: 50% 100%;
          animation: swordKoteD 0.4s cubic-bezier(0.6, 0, 1, 0.45) forwards;
        }
        @keyframes swordKoteD {
          0%   { transform: translate(0, 0)       rotate(0deg)  scale(1); }
          100% { transform: translate(38px, 22px) rotate(18deg) scale(0.95); }
        }

        :global(.anim-E) {
          animation: sinkZoom 0.5s cubic-bezier(0.6, 0, 1, 0.45) forwards;
        }
        :global(.anim-E .sword) {
          transform-origin: 50% 100%;
          animation: swordKoteE 0.5s cubic-bezier(0.6, 0, 1, 0.45) forwards;
        }
        @keyframes sinkZoom {
          0%   { transform: scale(1)    translateY(0); }
          100% { transform: scale(1.12) translateY(8px); }
        }
        @keyframes swordKoteE {
          0%   { transform: translate(0, 0)       rotate(0deg)  scale(1); }
          100% { transform: translate(28px, 18px) rotate(14deg) scale(0.96); }
        }

        :global(.anim-F .sword) {
          transform-origin: 50% 100%;
          animation: swordKoteF 0.3s cubic-bezier(0.7, 0, 1, 0.4) forwards;
        }
        @keyframes swordKoteF {
          0%   { transform: translate(0, 0)        rotate(0deg)   scale(1); }
          45%  { transform: translate(8px, -6px)   rotate(-4deg)  scale(1.02); }
          100% { transform: translate(32px, 20px)  rotate(20deg)  scale(0.94); }
        }

        :global(.anim-G) {
          animation: shrinkFreeze 0.5s cubic-bezier(0.6, 0, 1, 0.5) forwards;
        }
        @keyframes shrinkFreeze {
          0%   { transform: scale(1); }
          50%  { transform: scale(0.95) translateY(4px); }
          100% { transform: scale(0.95) translateY(4px); }
        }

        :global(.anim-H .sword) {
          transform-origin: 50% 100%;
          animation: swordHandsUp 0.5s cubic-bezier(0.55, 0, 1, 0.5) forwards;
        }
        :global(.anim-H) {
          animation: bodyLeanBack 0.5s cubic-bezier(0.55, 0, 1, 0.5) forwards;
        }
        @keyframes swordHandsUp {
          0%   { transform: translate(0, 0)        rotate(0deg)  scale(1); }
          60%  { transform: translate(-12px, -20px) rotate(-6deg) scale(1.02); }
          100% { transform: translate(-15px, -25px) rotate(-8deg) scale(1.04); }
        }
        @keyframes bodyLeanBack {
          0%   { transform: scale(1)    translate(0, 0); }
          60%  { transform: scale(0.99) translate(-2px, -3px); }
          100% { transform: scale(0.98) translate(-3px, -4px); }
        }

        /* === オーバーレイ === */
        .overlay {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          flex-direction: column; gap: 10px; z-index: 5;
          background: radial-gradient(ellipse at center, rgba(5,8,16,0.55) 0%, rgba(5,8,16,0.85) 100%);
          backdrop-filter: blur(2px);
        }
        .overlay--passive {
          background: transparent; backdrop-filter: none; pointer-events: none;
        }
        .overlay-msg {
          font-size: 18px; letter-spacing: 0.4em; color: #7ed9ff; margin: 0;
          text-shadow: 0 0 8px rgba(0, 200, 255, 0.5);
        }
        .overlay-round {
          font-family: 'Courier New', monospace;
          font-size: 12px; color: #5fa3c7; margin: 0;
        }

        /* ★ ローディング */
        .loading-box {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          color: #7ed9ff;
          background: rgba(5, 15, 30, 0.85);
          border: 1px solid rgba(0, 200, 255, 0.4);
          border-radius: 6px; padding: 28px 36px;
          box-shadow: 0 0 30px rgba(0, 200, 255, 0.3);
        }
        .loading-spin { animation: spin 1s linear infinite; }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* ★ ベストタイム */
        .best-time {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'Courier New', monospace;
          font-size: 12px; color: #ffd866;
          background: rgba(255, 216, 102, 0.1);
          border: 1px solid rgba(255, 216, 102, 0.4);
          border-radius: 4px; padding: 6px 12px;
          margin-bottom: 12px;
        }

        .btn-start {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 32px;
          background: linear-gradient(135deg, #00b4ff, #0066cc);
          color: #fff; border: 1px solid #7ed9ff;
          border-radius: 4px; font-size: 16px; font-weight: 700;
          letter-spacing: 0.3em; cursor: pointer;
          box-shadow: 0 0 20px rgba(0, 200, 255, 0.5);
          transition: transform 0.1s, box-shadow 0.2s;
        }
        .btn-start:hover {
          transform: scale(1.04);
          box-shadow: 0 0 30px rgba(0, 200, 255, 0.8);
        }
        .btn-start:active { transform: scale(0.98); }

        .result-success { text-align: center; animation: popIn 0.3s ease-out; }
        .result-tech {
          font-size: 26px; font-weight: 700; color: #fff; margin: 0 0 6px;
          letter-spacing: 0.2em;
          text-shadow: 0 0 20px #00d4ff, 0 0 40px #00d4ff;
        }
        .result-time {
          font-family: 'Courier New', monospace;
          font-size: 32px; color: #7ed9ff; margin: 0; font-weight: 700;
        }
        .result-fail { text-align: center; animation: popIn 0.3s ease-out; }
        .result-fail-label {
          font-size: 32px; font-weight: 800; color: #ff5050; margin: 0;
          letter-spacing: 0.3em; text-shadow: 0 0 16px #ff0040;
        }
        .result-fail-sub { font-size: 12px; color: #ff8080; margin: 6px 0 0; }
        @keyframes popIn {
          0%   { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }

        .result-summary {
          background: rgba(5, 15, 30, 0.85);
          border: 1px solid rgba(0, 200, 255, 0.4);
          border-radius: 6px; padding: 24px 28px;
          min-width: 280px; max-width: 90vw;
          box-shadow: 0 0 30px rgba(0, 200, 255, 0.3);
        }
        .result-summary h2 {
          margin: 0 0 16px; text-align: center;
          font-size: 18px; letter-spacing: 0.3em; color: #fff;
        }

        /* ★ ランク表示 */
        .rank-display {
          display: flex; align-items: baseline; justify-content: center; gap: 12px;
          margin: 0 0 16px; padding: 12px;
          border-radius: 6px;
          animation: rankPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes rankPop {
          0%   { transform: scale(0.3); opacity: 0; }
          70%  { transform: scale(1.1); }
          100% { transform: scale(1);   opacity: 1; }
        }
        .rank-label {
          font-family: 'Courier New', monospace;
          font-size: 11px; letter-spacing: 0.4em;
          color: #7ed9ff; opacity: 0.8;
        }
        .rank-value {
          font-size: 56px; font-weight: 900;
          font-family: 'Courier New', monospace;
          line-height: 1;
        }
        .rank-S {
          background: linear-gradient(135deg, rgba(255, 216, 102, 0.2), rgba(255, 100, 50, 0.2));
          border: 1px solid #ffd866;
        }
        .rank-S .rank-value {
          color: #ffd866;
          text-shadow: 0 0 24px #ffd866, 0 0 48px #ff8040;
        }
        .rank-A {
          background: linear-gradient(135deg, rgba(0, 220, 255, 0.2), rgba(100, 100, 255, 0.2));
          border: 1px solid #00dcff;
        }
        .rank-A .rank-value {
          color: #00dcff;
          text-shadow: 0 0 20px #00dcff;
        }
        .rank-B {
          background: rgba(126, 217, 255, 0.1);
          border: 1px solid #7ed9ff;
        }
        .rank-B .rank-value {
          color: #7ed9ff;
          text-shadow: 0 0 16px #7ed9ff;
        }
        .rank-C {
          background: rgba(160, 232, 255, 0.05);
          border: 1px solid #5fa3c7;
        }
        .rank-C .rank-value {
          color: #5fa3c7;
        }
        .rank-F {
          background: rgba(255, 100, 100, 0.08);
          border: 1px solid #ff8080;
        }
        .rank-F .rank-value {
          color: #ff8080;
        }

        .summary-line { margin: 4px 0; font-size: 14px; color: #b0d8ee; }
        .summary-line strong {
          color: #fff; font-size: 18px;
          font-family: 'Courier New', monospace; margin: 0 4px;
        }
        .summary-xp {
          margin-top: 10px;
          padding: 8px 12px;
          background: rgba(255, 216, 102, 0.08);
          border-left: 3px solid #ffd866;
          border-radius: 2px;
        }
        .summary-xp .xp-value {
          color: #ffd866 !important;
          font-size: 22px !important;
          text-shadow: 0 0 10px rgba(255, 216, 102, 0.6);
        }
        .summary-error {
          font-size: 11px; color: #ff8080; margin: 8px 0 0;
          padding: 6px 8px;
          background: rgba(255, 100, 100, 0.08);
          border-left: 2px solid #ff8080;
        }

        .summary-rounds {
          margin: 14px 0;
          border-top: 1px solid rgba(0, 200, 255, 0.2);
          border-bottom: 1px solid rgba(0, 200, 255, 0.2);
          padding: 10px 0;
        }
        .summary-round {
          display: grid; grid-template-columns: 24px 1fr 70px; gap: 8px;
          font-size: 13px; padding: 4px 0;
          font-family: 'Courier New', monospace;
        }
        .summary-round.ok { color: #7ed9ff; }
        .summary-round.ng { color: #ff8080; }
        .summary-round span:last-child { text-align: right; }

        .locked-msg {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          color: #ffb04a; font-size: 13px; margin: 8px 0 0;
        }
        .locked-box {
          text-align: center;
          background: rgba(30, 10, 10, 0.85);
          border: 1px solid rgba(255, 100, 80, 0.4);
          border-radius: 6px; padding: 28px 32px;
          color: #ffb0a0; max-width: 90vw;
        }
        .locked-box h2 { margin: 12px 0 8px; }
        .locked-box p  { margin: 0; font-size: 13px; line-height: 1.6; }
        .locked-best {
          display: inline-flex; align-items: center; gap: 6px;
          margin-top: 14px !important;
          font-family: 'Courier New', monospace;
          font-size: 12px; color: #ffd866;
          background: rgba(255, 216, 102, 0.1);
          border: 1px solid rgba(255, 216, 102, 0.4);
          border-radius: 4px; padding: 6px 12px;
        }

        .flash-success {
          position: absolute; inset: 0;
          background: radial-gradient(circle, rgba(0, 220, 255, 0.6) 0%, transparent 70%);
          animation: flashBlue 0.4s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashBlue { 0% { opacity: 1; } 100% { opacity: 0; } }
        .flash-fail {
          position: absolute; inset: 0;
          background: rgba(255, 0, 40, 0.35);
          animation: flashRed 0.5s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashRed {
          0%   { opacity: 1; transform: translateX(0); }
          20%  { transform: translateX(-8px); }
          40%  { transform: translateX(8px); }
          60%  { transform: translateX(-6px); }
          80%  { transform: translateX(6px); }
          100% { opacity: 0; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// 仮想剣士 SVG（無変更）
// =====================================================================
interface KenshiSVGProps {
  glowPart: HitPart | null;
  active:   boolean;
  onTap:    (part: HitPart) => void;
}

function KenshiSVG({ glowPart, active, onTap }: KenshiSVGProps) {
  const handleClick = (part: HitPart) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (active) onTap(part);
  };

  const colorTransition =
    'fill 0.75s cubic-bezier(0.7, 0, 1, 1), stroke 0.75s cubic-bezier(0.7, 0, 1, 1)';

  const hitStyle = (active: boolean): React.CSSProperties => ({
    cursor: active ? 'pointer' : 'default',
    pointerEvents: active ? 'all' : 'none',
    transition: colorTransition,
  });

  return (
    <svg
      viewBox="0 0 300 500"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="thinGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="tipGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <symbol id="bracket-tl" viewBox="0 0 20 20">
          <path d="M 0 8 L 0 0 L 8 0" stroke="currentColor" strokeWidth="1" fill="none" />
        </symbol>
        <symbol id="bracket-tr" viewBox="0 0 20 20">
          <path d="M 12 0 L 20 0 L 20 8" stroke="currentColor" strokeWidth="1" fill="none" />
        </symbol>
        <symbol id="bracket-bl" viewBox="0 0 20 20">
          <path d="M 0 12 L 0 20 L 8 20" stroke="currentColor" strokeWidth="1" fill="none" />
        </symbol>
        <symbol id="bracket-br" viewBox="0 0 20 20">
          <path d="M 12 20 L 20 20 L 20 12" stroke="currentColor" strokeWidth="1" fill="none" />
        </symbol>
      </defs>

      <g pointerEvents="none">
        <g stroke="#1e5a7a" strokeWidth="0.4" fill="none" opacity="0.55">
          <line x1="150" y1="20" x2="150" y2="490" strokeDasharray="2 4" />
          <line x1="20" y1="100"  x2="280" y2="100" strokeDasharray="1 3" />
          <line x1="20" y1="280"  x2="280" y2="280" strokeDasharray="1 3" />
          <line x1="20" y1="340"  x2="280" y2="340" strokeDasharray="1 3" />
          <line x1="20"  y1="460" x2="150" y2="86" strokeDasharray="1 6" opacity="0.35" />
          <line x1="280" y1="460" x2="150" y2="86" strokeDasharray="1 6" opacity="0.35" />
        </g>

        <g color="#3a8fb8" opacity="0.7">
          <use href="#bracket-tl" x="20"  y="30"  width="22" height="22" />
          <use href="#bracket-tr" x="258" y="30"  width="22" height="22" />
          <use href="#bracket-bl" x="20"  y="448" width="22" height="22" />
          <use href="#bracket-br" x="258" y="448" width="22" height="22" />
        </g>

        <g fill="#3a8fb8" fontFamily="Courier New, monospace" fontSize="7" opacity="0.6">
          <text x="26"  y="44">TGT-LOCK</text>
          <text x="232" y="44">v.16</text>
          <text x="26"  y="464">HIT-ZONE</text>
          <text x="240" y="464">ACTIVE</text>
        </g>

        <g stroke="#3a8fb8" strokeWidth="0.5" fill="none" opacity="0.5">
          <line x1="20" y1="200" x2="28" y2="200" />
          <line x1="20" y1="250" x2="32" y2="250" />
          <line x1="20" y1="300" x2="28" y2="300" />
          <line x1="20" y1="350" x2="32" y2="350" />
          <line x1="272" y1="200" x2="280" y2="200" />
          <line x1="268" y1="250" x2="280" y2="250" />
          <line x1="272" y1="300" x2="280" y2="300" />
          <line x1="268" y1="350" x2="280" y2="350" />
        </g>
      </g>

      {/* 面 */}
      <g
        className="hit-men"
        onClick={handleClick('men')}
        onTouchStart={handleClick('men')}
      >
        <polygon
          points="150,72 188,90 192,140 175,180 125,180 108,140 112,90"
          stroke={glowPart === 'men' ? '#ff2a3a' : '#00c8ff'}
          strokeWidth="2"
          fill={glowPart === 'men' ? 'rgba(180, 20, 30, 0.32)' : 'rgba(0, 80, 120, 0.10)'}
          filter={glowPart === 'men' ? 'url(#redGlow)' : 'url(#neonGlow)'}
          style={hitStyle(active)}
        />
        <g pointerEvents="none">
          <polygon
            points="150,80 180,95 183,135 168,170 132,170 117,135 120,95"
            stroke={glowPart === 'men' ? '#ff8090' : '#5fa3c7'}
            strokeWidth="0.5"
            fill="none"
            opacity="0.6"
            style={{ transition: colorTransition }}
          />
          <g
            stroke={glowPart === 'men' ? '#ff5060' : '#7ed9ff'}
            strokeWidth="1.2"
            filter={glowPart === 'men' ? 'url(#redGlow)' : 'url(#thinGlow)'}
            style={{ transition: colorTransition }}
          >
            <line x1="120" y1="108" x2="180" y2="108" />
            <line x1="116" y1="125" x2="184" y2="125" />
            <line x1="120" y1="142" x2="180" y2="142" opacity="0.85" />
            <line x1="128" y1="158" x2="172" y2="158" opacity="0.6" />
          </g>
          <g
            stroke={glowPart === 'men' ? '#ff5060' : '#5fa3c7'}
            strokeWidth="0.6"
            opacity="0.7"
            style={{ transition: colorTransition }}
          >
            <line x1="150" y1="100" x2="150" y2="165" />
            <line x1="135" y1="105" x2="135" y2="160" />
            <line x1="165" y1="105" x2="165" y2="160" />
          </g>
          <g
            stroke={glowPart === 'men' ? '#ff2a3a' : '#7ed9ff'}
            strokeWidth="0.8"
            fill="none"
            filter={glowPart === 'men' ? 'url(#redGlow)' : undefined}
            style={{ transition: colorTransition }}
          >
            <circle cx="150" cy="125" r="6" opacity={glowPart === 'men' ? 0.9 : 0.5} />
            <line x1="142" y1="125" x2="148" y2="125" />
            <line x1="152" y1="125" x2="158" y2="125" />
            <line x1="150" y1="117" x2="150" y2="120" />
            <line x1="150" y1="130" x2="150" y2="133" />
          </g>
          <polygon
            points="150,72 156,82 150,86 144,82"
            fill={glowPart === 'men' ? '#ff2a3a' : 'transparent'}
            stroke={glowPart === 'men' ? '#ffb0b8' : '#7ed9ff'}
            strokeWidth="1"
            opacity={glowPart === 'men' ? 1 : 0.5}
            filter={glowPart === 'men' ? 'url(#redGlow)' : undefined}
            style={{ transition: colorTransition }}
          />
          <text
            x="196" y="92"
            fill={glowPart === 'men' ? '#ff8090' : '#3a8fb8'}
            fontFamily="Courier New, monospace"
            fontSize="6"
            opacity="0.85"
            style={{ transition: colorTransition }}
          >
            [MEN]
          </text>
        </g>
      </g>

      {/* 小手（左手前のみ） */}
      <g
        className="hit-kote"
        onClick={handleClick('kote')}
        onTouchStart={handleClick('kote')}
      >
        <polygon
          points="55,330 130,310 142,365 130,395 70,400 38,378 32,355"
          stroke={glowPart === 'kote' ? '#ff2a3a' : '#00c8ff'}
          strokeWidth="2.2"
          fill={glowPart === 'kote' ? 'rgba(180, 20, 30, 0.32)' : 'rgba(0, 80, 120, 0.12)'}
          filter={glowPart === 'kote' ? 'url(#redGlow)' : 'url(#neonGlow)'}
          style={hitStyle(active)}
        />
        <g pointerEvents="none">
          <g
            stroke={glowPart === 'kote' ? '#ff8090' : '#5fa3c7'}
            strokeWidth="0.6"
            opacity="0.7"
            fill="none"
            style={{ transition: colorTransition }}
          >
            <line x1="60" y1="345" x2="125" y2="328" />
            <line x1="58" y1="370" x2="130" y2="365" />
            <polygon points="75,348 115,335 120,360 80,372" />
          </g>
          <g
            fill={glowPart === 'kote' ? '#ff8090' : '#7ed9ff'}
            opacity="0.7"
            style={{ transition: colorTransition }}
          >
            <circle cx="68"  cy="348" r="1.2" />
            <circle cx="118" cy="335" r="1.2" />
            <circle cx="72"  cy="385" r="1.2" />
            <circle cx="125" cy="378" r="1.2" />
          </g>
          <text
            x="44" y="420"
            fill={glowPart === 'kote' ? '#ff8090' : '#3a8fb8'}
            fontFamily="Courier New, monospace"
            fontSize="7"
            opacity="0.85"
            style={{ transition: colorTransition }}
          >
            [KOTE]
          </text>
        </g>
      </g>

      {/* 胴 */}
      <g
        className="hit-do"
        onClick={handleClick('do')}
        onTouchStart={handleClick('do')}
      >
        <polygon
          points="100,255 200,255 215,290 208,335 150,348 92,335 85,290"
          stroke={glowPart === 'do' ? '#ff2a3a' : '#00c8ff'}
          strokeWidth="2"
          fill={glowPart === 'do' ? 'rgba(180, 20, 30, 0.30)' : 'rgba(0, 80, 120, 0.10)'}
          filter={glowPart === 'do' ? 'url(#redGlow)' : 'url(#neonGlow)'}
          style={hitStyle(active)}
        />
        <g pointerEvents="none">
          <g
            stroke={glowPart === 'do' ? '#ff5060' : '#5fa3c7'}
            strokeWidth="0.5"
            fill="none"
            opacity="0.65"
            style={{ transition: colorTransition }}
          >
            <line x1="100" y1="275" x2="200" y2="275" />
            <line x1="92"  y1="305" x2="208" y2="305" />
            <line x1="125" y1="260" x2="125" y2="345" strokeDasharray="2 2" />
            <line x1="175" y1="260" x2="175" y2="345" strokeDasharray="2 2" />
            <path d="M 130 268 L 150 295 L 170 268" strokeWidth="0.7" />
          </g>
          <g
            stroke={glowPart === 'do' ? '#ff2a3a' : '#7ed9ff'}
            strokeWidth="0.7"
            fill="none"
            filter={glowPart === 'do' ? 'url(#redGlow)' : undefined}
            style={{ transition: colorTransition }}
          >
            <rect
              x="142" y="312" width="16" height="16"
              opacity={glowPart === 'do' ? 0.95 : 0.5}
            />
            <line x1="146" y1="320" x2="154" y2="320" />
            <line x1="150" y1="316" x2="150" y2="324" />
          </g>
          <text
            x="218" y="335"
            fill={glowPart === 'do' ? '#ff8090' : '#3a8fb8'}
            fontFamily="Courier New, monospace"
            fontSize="6"
            opacity="0.85"
            style={{ transition: colorTransition }}
          >
            [DO]
          </text>
        </g>
      </g>

      {/* 竹刀 */}
      <g className="sword" filter="url(#neonGlow)" pointerEvents="none">
        <polygon
          points="143,92 157,92 152.5,322 147.5,322"
          stroke="#a0e8ff"
          strokeWidth="1.3"
          fill="rgba(160, 232, 255, 0.30)"
          strokeLinejoin="miter"
        />
        <line
          x1="150" y1="92" x2="150" y2="322"
          stroke="#e0f2ff"
          strokeWidth="0.5"
          opacity="0.85"
        />
        <polygon
          points="146,92 149,92 151,322 150,322"
          fill="rgba(224, 242, 255, 0.4)"
          opacity="0.7"
        />

        <polygon
          points="145,318 155,318 158,322 155,326 145,326 142,322"
          stroke="#00c8ff"
          strokeWidth="1.1"
          fill="rgba(0,200,255,0.30)"
        />

        <polygon
          points="148,326 152,326 151,388 149,388"
          stroke="#7ed9ff"
          strokeWidth="1"
          fill="rgba(126, 217, 255, 0.28)"
        />

        <g stroke="#a0e8ff" strokeWidth="0.4" opacity="0.55">
          <line x1="148.5" y1="345" x2="151.5" y2="345" />
          <line x1="148.7" y1="360" x2="151.3" y2="360" />
          <line x1="148.9" y1="375" x2="151.1" y2="375" />
        </g>

        <polygon
          points="149,388 151,388 150.5,394 149.5,394"
          stroke="#7ed9ff"
          strokeWidth="0.8"
          fill="rgba(0,200,255,0.30)"
        />

        <polygon
          points="150,72 162,94 138,94"
          fill="#e0f2ff"
          stroke="#7ed9ff"
          strokeWidth="0.9"
          filter="url(#tipGlow)"
        />

        <circle cx="150" cy="86" r="5" fill="#ffffff" opacity="0.95" filter="url(#tipGlow)" />
        <circle cx="150" cy="86" r="2.5" fill="#ffffff" />

        <circle cx="150" cy="86" r="11" stroke="#7ed9ff" strokeWidth="0.5" fill="none" strokeDasharray="2 2" opacity="0.65" />
        <circle cx="150" cy="86" r="17" stroke="#3a8fb8" strokeWidth="0.4" fill="none" opacity="0.5" />
        <circle cx="150" cy="86" r="24" stroke="#3a8fb8" strokeWidth="0.3" fill="none" opacity="0.35" strokeDasharray="3 4" />
      </g>

      <g pointerEvents="none" stroke="#3a8fb8" strokeWidth="0.5" fill="none" opacity="0.5" filter="url(#thinGlow)">
        <circle cx="150" cy="250" r="3" />
        <line x1="140" y1="250" x2="146" y2="250" />
        <line x1="154" y1="250" x2="160" y2="250" />
        <line x1="150" y1="240" x2="150" y2="246" />
        <line x1="150" y1="254" x2="150" y2="260" />
      </g>
    </svg>
  );
}
