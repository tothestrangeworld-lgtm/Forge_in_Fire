'use client';

/**
 * =====================================================================
 * 刹那ノ見切 (Setsuna no Mikiri) - Phase 16.1 ブラッシュアップ版
 * =====================================================================
 * 改善点:
 *  1. viewState 'menu' | 'playing' | 'records' で画面分割
 *  2. ステートマシン拡張: waiting → okori → strike → result
 *     - okori: 0.4〜1.0秒の微細な起こりフェーズ。色がじわじわ赤化
 *     - 出端(okori中)で反応 = Sランク（出端を捉えた大成功）
 *     - 打突(strike直後)  = A〜Cランク
 *     - お手付き(waiting中タップ) = 失敗
 *  3. 技名カットイン + 斬撃フラッシュ + 画面シェイク（Juice MAX）
 * =====================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap, AlertTriangle, Loader2, Trophy, BookOpen, Swords } from 'lucide-react';
import {
  fetchMinigameStatus,
  saveMinigameResult,
  type MinigameRank,
  type MinigameSaveResult,
  type MinigameStatus,
} from '@/lib/api';

// =====================================================================
// 型定義
// =====================================================================
type HitPart = 'men' | 'kote' | 'do';
type PatternId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

/** 画面ビュー（Phase16.1） */
type ViewState = 'menu' | 'playing' | 'records';

/** ゲームのステートマシン（Phase16.1で okori 追加） */
type GamePhase =
  | 'loading'
  | 'idle'
  | 'waiting'      // 1〜3秒の溜め
  | 'okori'        // ★ Phase16.1: 0.4〜1.0秒の起こり（じわじわ赤化）
  | 'strike'       // 打突（完全に赤）
  | 'result'
  | 'matchEnd'
  | 'submitting'
  | 'locked'
  | 'error';

interface Pattern {
  id:           PatternId;
  successName:  string;
  correctPart:  HitPart;
  strikeDuration: number; // strike フェーズの持続時間（=反応猶予）
  category:     'oji' | 'shikake';
  failLabel:    '被弾' | '見逃し' | 'お手付き';
  animClass:    string;
  glowPart:     HitPart;
}

/** 1本の判定結果 */
type HitTiming = 'okori' | 'strike' | 'late' | 'wrongPart' | 'tooEarly' | 'timeout';

interface RoundResult {
  patternId:    PatternId;
  success:      boolean;
  reactionMs:   number | null;
  successName:  string;
  failLabel:    string;
  timing:       HitTiming;
  cutinText:    string;   // ★ カットイン用の技名
  rank:         'S' | 'A' | 'B' | 'C' | 'F'; // この本のランク
}

// =====================================================================
// 8パターン定義
// =====================================================================
const PATTERNS: Pattern[] = [
  { id: 'A', successName: '出端小手',     correctPart: 'kote', glowPart: 'kote', strikeDuration: 800, category: 'oji',     failLabel: '被弾',   animClass: 'anim-A' },
  { id: 'B', successName: '面返し胴',     correctPart: 'do',   glowPart: 'do',   strikeDuration: 380, category: 'oji',     failLabel: '被弾',   animClass: 'anim-B' },
  { id: 'C', successName: '出端面',       correctPart: 'men',  glowPart: 'men',  strikeDuration: 500, category: 'oji',     failLabel: '被弾',   animClass: 'anim-C' },
  { id: 'D', successName: '小手返し面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 400, category: 'oji',     failLabel: '被弾',   animClass: 'anim-D' },
  { id: 'E', successName: '小手抜き面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 500, category: 'oji',     failLabel: '被弾',   animClass: 'anim-E' },
  { id: 'F', successName: '合い小手面',   correctPart: 'kote', glowPart: 'kote', strikeDuration: 300, category: 'oji',     failLabel: '被弾',   animClass: 'anim-F' },
  { id: 'G', successName: '飛び込み面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 500, category: 'shikake', failLabel: '見逃し', animClass: 'anim-G' },
  { id: 'H', successName: '飛び込み小手', correctPart: 'kote', glowPart: 'kote', strikeDuration: 500, category: 'shikake', failLabel: '見逃し', animClass: 'anim-H' },
];

const ROUNDS_PER_MATCH = 3;
const MAX_MATCHES_PER_DAY = 3;

// =====================================================================
// ★ カットイン用：タイミング別の技名プール
// =====================================================================
const CUTIN_S = [
  '出端面！', '出端小手！', '出端突き！',
  '機を制す！', '懸待一致！', '先の先！',
];
const CUTIN_A = [
  '面返し胴！', '小手すりあげ面！', '出鼻を挫く突き！',
  '抜き胴！', '応じ返し！', '間髪入れず！',
];
const CUTIN_BC = [
  '相抜け面！', 'ギリギリ防いで面！',
  '紙一重で見切る！', 'なんとか凌ぐ…', '辛うじて応じる…',
];
const CUTIN_FAIL = [
  '居着いた…', '一足の見切り誤る！', '攻め負け…',
];
const CUTIN_TOO_EARLY = [
  'お手付き！', '気が逸る…', '見の目に過ぎる…',
];

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// =====================================================================
// ユーティリティ
// =====================================================================
const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const pickRandomPattern = (): Pattern => PATTERNS[Math.floor(Math.random() * PATTERNS.length)];

const formatTime = (ms: number | null): string => {
  if (ms === null || ms === undefined) return '—';
  return `${(ms / 1000).toFixed(3)}s`;
};

/**
 * ★ Phase16.1: 試合全体のランク判定（保存時のみ使用）
 * 各本で得たランクを元に総合ランクを決める。
 *  - 3本Sなら総合S
 *  - Sを含み全本成功ならA
 *  - 全本成功ならB
 *  - 1本以上成功ならC
 *  - 全失敗はF
 */
function calcOverallRank(roundResults: RoundResult[]): MinigameRank {
  if (roundResults.length === 0) return 'F';
  const successes = roundResults.filter(r => r.success);
  if (successes.length === 0) return 'F';
  const sCount = roundResults.filter(r => r.rank === 'S').length;
  if (sCount === ROUNDS_PER_MATCH) return 'S';
  if (successes.length === ROUNDS_PER_MATCH && sCount >= 1) return 'A';
  if (successes.length === ROUNDS_PER_MATCH) return 'B';
  return 'C';
}

// =====================================================================
// メインコンポーネント
// =====================================================================
export default function MiniGamePage() {
  // ★ ビュー状態
  const [viewState, setViewState] = useState<ViewState>('menu');

  // ★ ゲーム状態
  const [phase, setPhase]               = useState<GamePhase>('loading');
  const [matchCount, setMatchCount]     = useState(0);
  const [roundIdx, setRoundIdx]         = useState(0);
  const [currentPattern, setCurrentPattern] = useState<Pattern | null>(null);
  const [results, setResults]           = useState<RoundResult[]>([]);
  const [lastResult, setLastResult]     = useState<RoundResult | null>(null);

  // ★ 演出系
  const [flashType, setFlashType]       = useState<'none' | 'success' | 'fail' | 'okori'>('none');
  const [cutinText, setCutinText]       = useState<string>('');
  const [shakeKey, setShakeKey]         = useState<number>(0); // インクリメントでシェイク再発火
  const [slashKey, setSlashKey]         = useState<number>(0); // 斬撃フラッシュ再発火

  // ★ 通信
  const [bestTimeMs, setBestTimeMs]     = useState<number | null>(null);
  const [statusInfo, setStatusInfo]     = useState<MinigameStatus | null>(null);
  const [lastSaveResult, setLastSaveResult] = useState<MinigameSaveResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // ★ Refs
  const okoriStartRef    = useRef<number | null>(null);  // okori開始時刻
  const strikeStartRef   = useRef<number | null>(null);  // strike開始時刻
  const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundIdxRef      = useRef(0);
  const matchCountRef    = useRef(0);
  const isInitializedRef = useRef(false);
  const isSubmittingRef  = useRef(false);

  useEffect(() => { roundIdxRef.current   = roundIdx;   }, [roundIdx]);
  useEffect(() => { matchCountRef.current = matchCount; }, [matchCount]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // ===================================================================
  // 初回マウント: ステータス取得
  // ===================================================================
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    (async () => {
      try {
        const status = await fetchMinigameStatus();
        setStatusInfo(status);
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
  // 1本終了処理
  // ===================================================================
  const finishRound = useCallback((result: RoundResult) => {
    setLastResult(result);
    setResults(prev => [...prev, result]);

    // 演出発火
    setCutinText(result.cutinText);
    setShakeKey(k => k + 1);
    if (result.success) {
      setFlashType('success');
      setSlashKey(k => k + 1);
    } else {
      setFlashType('fail');
    }
    setPhase('result');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setFlashType('none');
      setCutinText('');
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
    }, 1700); // カットインを少し長めに見せる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===================================================================
  // ★ Phase16.1: タイムアウト = 見逃し
  // ===================================================================
  const handleTimeout = useCallback((pattern: Pattern) => {
    finishRound({
      patternId:   pattern.id,
      success:     false,
      reactionMs:  null,
      successName: pattern.successName,
      failLabel:   pattern.failLabel,
      timing:      'timeout',
      cutinText:   pickRandom(CUTIN_FAIL),
      rank:        'F',
    });
  }, [finishRound]);

  // ===================================================================
  // ★ Phase16.1: 次の本のスケジューリング
  //   waiting (1〜3s) → okori (0.4〜1.0s) → strike (pattern.strikeDuration)
  // ===================================================================
  const scheduleNextRound = useCallback(() => {
    const waitMs = randomBetween(1500, 3000);
    if (timerRef.current) clearTimeout(timerRef.current);

    // [1] waiting フェーズ
    timerRef.current = setTimeout(() => {
      const pattern = pickRandomPattern();
      setCurrentPattern(pattern);
      okoriStartRef.current = performance.now();
      setPhase('okori');
      // 起こりに入った瞬間の微細な視覚キュー
      setFlashType('okori');
      setTimeout(() => setFlashType('none'), 120);

      // [2] okori フェーズ（0.4〜1.0秒のランダム）
      const okoriMs = randomBetween(400, 1000);
      timerRef.current = setTimeout(() => {
        strikeStartRef.current = performance.now();
        setPhase('strike');

        // [3] strike フェーズ（パターンごとの猶予）
        timerRef.current = setTimeout(() => {
          handleTimeout(pattern);
        }, pattern.strikeDuration);
      }, okoriMs);
    }, waitMs);
  }, [handleTimeout]);

  // ===================================================================
  // 試合開始
  // ===================================================================
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
    setViewState('playing');
    setPhase('waiting');
    scheduleNextRound();
  }, [scheduleNextRound]);

  // ===================================================================
  // ★ Phase16.1: タップハンドラ（拡張版）
  //  - waiting中タップ → お手付き（即失敗）
  //  - okori 中タップ + 正解部位 → Sランク（出端を捉える）
  //  - strike中タップ + 正解部位 → A/B/Cランク（反応速度で振り分け）
  //  - 部位ミス        → 失敗
  // ===================================================================
  const handleTap = (part: HitPart) => {
    // 待機中（溜め）にタップ → お手付き
    if (phase === 'waiting' && currentPattern === null) {
      // パターン未確定の段階では誤反応のみ
      if (timerRef.current) clearTimeout(timerRef.current);
      const dummyPattern = pickRandomPattern();
      finishRound({
        patternId:   dummyPattern.id,
        success:     false,
        reactionMs:  null,
        successName: dummyPattern.successName,
        failLabel:   'お手付き',
        timing:      'tooEarly',
        cutinText:   pickRandom(CUTIN_TOO_EARLY),
        rank:        'F',
      });
      return;
    }

    if (!currentPattern) return;
    if (phase !== 'okori' && phase !== 'strike') return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const isCorrectPart = part === currentPattern.correctPart;

    // 部位ミス
    if (!isCorrectPart) {
      finishRound({
        patternId:   currentPattern.id,
        success:     false,
        reactionMs:  null,
        successName: currentPattern.successName,
        failLabel:   '誤打',
        timing:      'wrongPart',
        cutinText:   pickRandom(CUTIN_FAIL),
        rank:        'F',
      });
      return;
    }

    // ── 正しい部位タップ ──
    if (phase === 'okori') {
      // Sランク: 出端を捉えた大成功
      const reactionMs = okoriStartRef.current
        ? performance.now() - okoriStartRef.current
        : 0;
      finishRound({
        patternId:   currentPattern.id,
        success:     true,
        reactionMs:  Math.round(reactionMs),
        successName: currentPattern.successName,
        failLabel:   '',
        timing:      'okori',
        cutinText:   pickRandom(CUTIN_S),
        rank:        'S',
      });
      return;
    }

    // strike フェーズ: 反応速度でA/B/Cを判定
    const reactionMs = strikeStartRef.current
      ? performance.now() - strikeStartRef.current
      : 0;

    let rank: 'A' | 'B' | 'C';
    let cutinPool: string[];
    if (reactionMs < 200) {
      rank = 'A';
      cutinPool = CUTIN_A;
    } else if (reactionMs < 400) {
      rank = 'B';
      cutinPool = CUTIN_BC;
    } else {
      rank = 'C';
      cutinPool = CUTIN_BC;
    }

    finishRound({
      patternId:   currentPattern.id,
      success:     true,
      reactionMs:  Math.round(reactionMs),
      successName: currentPattern.successName,
      failLabel:   '',
      timing:      'strike',
      cutinText:   pickRandom(cutinPool),
      rank,
    });
  };

  // 平均反応速度（成功本のみ）
  const averageReaction = useMemo(() => {
    const successes = results.filter(r => r.success && r.reactionMs !== null);
    if (successes.length === 0) return null;
    const sum = successes.reduce((acc, r) => acc + (r.reactionMs ?? 0), 0);
    return sum / successes.length;
  }, [results]);

  const successCount = results.filter(r => r.success).length;
  const overallRank  = useMemo<MinigameRank>(() => calcOverallRank(results), [results]);

  // ===================================================================
  // matchEnd: スコア送信
  // ===================================================================
  useEffect(() => {
    if (phase !== 'matchEnd') return;
    if (results.length !== ROUNDS_PER_MATCH) return;
    if (lastSaveResult !== null) return;
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setPhase('submitting');

    (async () => {
      try {
        const avgMs = averageReaction !== null ? Math.round(averageReaction) : 0;
        const rank  = calcOverallRank(results);
        const res   = await saveMinigameResult({ averageTime: avgMs, rank });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ===================================================================
  // 戻るボタン: メニューへ
  // ===================================================================
  const handleBackToMenu = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setViewState('menu');
    setPhase('idle');
    setResults([]);
    setLastResult(null);
    setLastSaveResult(null);
    setCurrentPattern(null);
    setRoundIdx(0);
    roundIdxRef.current = 0;
    setFlashType('none');
    setCutinText('');
  }, []);

  // ===================================================================
  // ★ Phase16.1: ヒットボックス強調状態の算出
  //   - okori中: 正解部位のみ「じわじわ赤化」
  //   - strike中: 正解部位が完全に赤
  // ===================================================================
  const glowState = useMemo<{ part: HitPart | null; intensity: 'okori' | 'strike' | null }>(() => {
    if (!currentPattern) return { part: null, intensity: null };
    if (phase === 'okori')  return { part: currentPattern.glowPart, intensity: 'okori' };
    if (phase === 'strike') return { part: currentPattern.glowPart, intensity: 'strike' };
    return { part: null, intensity: null };
  }, [phase, currentPattern]);

  return (
    <div className="mikiri-root" key={shakeKey} data-shake={shakeKey > 0 ? 'on' : 'off'}>
      <div className="mikiri-bg" aria-hidden="true">
        <div className="mikiri-grid" />
        <div className="mikiri-scan" />
      </div>

      <header className="mikiri-header">
        {viewState === 'playing' || viewState === 'records' ? (
          <button onClick={handleBackToMenu} className="mikiri-back" aria-label="メニューへ" type="button">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <Link href="/" className="mikiri-back" aria-label="戻る">
            <ArrowLeft size={20} />
          </Link>
        )}
        <h1 className="mikiri-title">
          <span className="mikiri-title-main">刹那ノ見切</span>
          <span className="mikiri-title-sub">SETSUNA NO MIKIRI</span>
        </h1>
        <div className="mikiri-counter">
          <span>{matchCount}</span>/<span>{MAX_MATCHES_PER_DAY}</span>
        </div>
      </header>

      <main className="mikiri-stage">
        {/* ===== 演出レイヤ ===== */}
        {flashType === 'success' && <div className="flash-success" aria-hidden="true" />}
        {flashType === 'fail'    && <div className="flash-fail"    aria-hidden="true" />}
        {flashType === 'okori'   && <div className="flash-okori"   aria-hidden="true" />}
        {slashKey > 0 && phase === 'result' && lastResult?.success && (
          <div className="slash-fx" key={`slash-${slashKey}`} aria-hidden="true" />
        )}

        {/* ===== カットイン ===== */}
        {cutinText && phase === 'result' && (
          <div className={`cutin cutin-${lastResult?.rank ?? 'F'}`} key={`cut-${shakeKey}`}>
            <span className="cutin-text">{cutinText}</span>
          </div>
        )}

        {/* ===== 剣士SVG（playing時のみ表示） ===== */}
        {viewState === 'playing' && (
          <div
            className={`kenshi-wrap ${currentPattern && phase === 'strike' ? currentPattern.animClass : ''} ${
              phase === 'strike' || phase === 'okori' ? 'is-active' : ''
            }`}
          >
            <KenshiSVG
              glowPart={glowState.part}
              intensity={glowState.intensity}
              active={phase === 'okori' || phase === 'strike'}
              onTap={handleTap}
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* loading / error                                               */}
        {/* ============================================================ */}
        {phase === 'loading' && (
          <div className="overlay">
            <div className="loading-box">
              <Loader2 size={32} className="loading-spin" />
              <p>状態を取得中…</p>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="overlay">
            <div className="locked-box">
              <AlertTriangle size={32} />
              <h2>通信エラー</h2>
              <p>{errorMessage || 'サーバーとの通信に失敗しました。'}</p>
              <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()} type="button">
                再読み込み
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ★ メニュー画面                                                */}
        {/* ============================================================ */}
        {viewState === 'menu' && phase !== 'loading' && phase !== 'error' && (
          <div className="overlay">
            <div className="menu-box">
              <h2 className="menu-title">道場の入口</h2>
              <p className="menu-desc">構えよ。刹那の見切を磨け。</p>

              {phase === 'locked' ? (
                <div className="menu-locked">
                  <AlertTriangle size={20} />
                  <span>本日の仮想稽古は終了</span>
                </div>
              ) : (
                <button
                  className="btn-primary btn-menu"
                  onClick={startMatch}
                  type="button"
                  disabled={matchCount >= MAX_MATCHES_PER_DAY}
                >
                  <Swords size={18} /> 試合開始
                </button>
              )}

              <button
                className="btn-secondary btn-menu"
                onClick={() => setViewState('records')}
                type="button"
              >
                <BookOpen size={18} /> 過去の記録
              </button>

              <p className="menu-info">
                本日 {matchCount} / {MAX_MATCHES_PER_DAY} 試合
              </p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ★ 記録画面                                                    */}
        {/* ============================================================ */}
        {viewState === 'records' && (
          <div className="overlay">
            <div className="records-box">
              <h2 className="records-title">修練の記録</h2>

              <div className="records-stat">
                <span className="records-label">自己ベスト</span>
                <span className="records-value">
                  <Trophy size={16} /> {bestTimeMs !== null ? formatTime(bestTimeMs) : '未記録'}
                </span>
              </div>

              <div className="records-stat">
                <span className="records-label">本日のプレイ</span>
                <span className="records-value">
                  {matchCount} / {MAX_MATCHES_PER_DAY} 試合
                </span>
              </div>

              <div className="records-stat">
                <span className="records-label">残り試合</span>
                <span className="records-value">
                  {Math.max(0, MAX_MATCHES_PER_DAY - matchCount)} 試合
                </span>
              </div>

              {statusInfo?.locked && (
                <p className="records-locked">
                  <AlertTriangle size={14} /> 本日の上限に到達しました
                </p>
              )}

              <div className="records-divider" />

              <div className="records-tips">
                <h3 className="records-tips-title">『ランク』の理合</h3>
                <p><strong className="rank-tag rank-S-tag">S</strong> 起こりを察知して反応 — 出端を捉えた一本</p>
                <p><strong className="rank-tag rank-A-tag">A</strong> 打突瞬時に反応（&lt;0.2s）— 鋭き応じ</p>
                <p><strong className="rank-tag rank-B-tag">B</strong> 通常反応（&lt;0.4s）</p>
                <p><strong className="rank-tag rank-C-tag">C</strong> 辛うじて反応</p>
                <p><strong className="rank-tag rank-F-tag">F</strong> 見逃し / お手付き</p>
              </div>

              <button className="btn-secondary btn-menu" onClick={handleBackToMenu} type="button">
                <ArrowLeft size={16} /> 戻る
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ★ プレイ画面 - waiting/okori/strike                            */}
        {/* ============================================================ */}
        {viewState === 'playing' && phase === 'waiting' && (
          <div className="overlay overlay--passive">
            <p className="overlay-msg">…構え…</p>
            <p className="overlay-round">{roundIdx + 1} / {ROUNDS_PER_MATCH} 本目</p>
          </div>
        )}

        {viewState === 'playing' && phase === 'okori' && (
          <div className="overlay overlay--passive overlay--okori">
            <p className="overlay-okori-msg">気配──</p>
          </div>
        )}

        {/* strike中はオーバーレイなし（剣士UIに集中） */}

        {/* result中もオーバーレイは出さず、カットインのみ */}

        {/* スコア送信中 */}
        {phase === 'submitting' && (
          <div className="overlay">
            <div className="loading-box">
              <Loader2 size={32} className="loading-spin" />
              <p>結果を記録中…</p>
            </div>
          </div>
        )}

        {/* matchEnd */}
        {phase === 'matchEnd' && viewState === 'playing' && (
          <div className="overlay">
            <div className="result-summary">
              <h2>試合終了</h2>

              <div className={`rank-display rank-${overallRank}`}>
                <span className="rank-label">RANK</span>
                <span className="rank-value">{overallRank}</span>
              </div>

              <p className="summary-line">成功: <strong>{successCount}</strong> / {ROUNDS_PER_MATCH}</p>
              <p className="summary-line">平均反応速度: <strong>{formatTime(averageReaction)}</strong></p>

              {lastSaveResult && (
                <p className="summary-line summary-xp">
                  獲得XP: <strong className="xp-value">+{lastSaveResult.earnedXp}</strong>
                </p>
              )}
              {!lastSaveResult && errorMessage && (
                <p className="summary-error">※ スコアの保存に失敗（{errorMessage}）</p>
              )}

              <div className="summary-rounds">
                {results.map((r, i) => (
                  <div key={i} className={`summary-round ${r.success ? 'ok' : 'ng'}`}>
                    <span>{i + 1}</span>
                    <span>{r.success ? r.cutinText.replace('！', '') : r.failLabel}</span>
                    <span className={`summary-rank rank-${r.rank}-tag`}>{r.rank}</span>
                    <span>{formatTime(r.reactionMs)}</span>
                  </div>
                ))}
              </div>

              {matchCount < MAX_MATCHES_PER_DAY ? (
                <>
                  <button className="btn-primary" onClick={startMatch} type="button">
                    <Swords size={16} /> 次の試合へ ({matchCount}/{MAX_MATCHES_PER_DAY})
                  </button>
                  <button className="btn-secondary" onClick={handleBackToMenu} type="button" style={{ marginTop: 8 }}>
                    メニューへ戻る
                  </button>
                </>
              ) : (
                <>
                  <p className="locked-msg">
                    <AlertTriangle size={16} /> 本日の試合上限に到達
                  </p>
                  <button className="btn-secondary" onClick={handleBackToMenu} type="button" style={{ marginTop: 8 }}>
                    メニューへ戻る
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* locked（メニュー外でロック検知時） */}
        {phase === 'locked' && viewState === 'playing' && (
          <div className="overlay">
            <div className="locked-box">
              <AlertTriangle size={32} />
              <h2>本日の仮想稽古終了</h2>
              <p>1日3試合まで</p>
              {bestTimeMs !== null && (
                <p className="locked-best">
                  <Trophy size={14} /> 自己ベスト: {formatTime(bestTimeMs)}
                </p>
              )}
              <button className="btn-secondary" onClick={handleBackToMenu} type="button" style={{ marginTop: 14 }}>
                メニューへ戻る
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ===== styled-jsx ===== */}
      <style jsx>{`
        .mikiri-root {
          position: fixed; inset: 0;
          background: #050810; color: #e0f2ff;
          overflow: hidden; font-family: 'Noto Sans JP', sans-serif;
          display: flex; flex-direction: column;
        }
        .mikiri-root[data-shake='on'] {
          animation: rootShake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
        }
        @keyframes rootShake {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-4px, 2px); }
          20% { transform: translate(4px, -3px); }
          30% { transform: translate(-3px, 3px); }
          40% { transform: translate(3px, -2px); }
          50% { transform: translate(-2px, 2px); }
          60% { transform: translate(2px, -1px); }
          70% { transform: translate(-1px, 1px); }
          80% { transform: translate(1px, 0); }
          90% { transform: translate(-1px, 0); }
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
          color: #7ed9ff; padding: 6px; border-radius: 6px;
          background: transparent; border: none;
          cursor: pointer; transition: background 0.2s;
          display: inline-flex; align-items: center;
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

        /* ===== 8パターンアニメ（strike時のみ発火） ===== */
        :global(.anim-A .sword) { transform-origin: 50% 100%; animation: swordMenSlow 0.8s cubic-bezier(0.55, 0, 1, 0.45) forwards; }
        :global(.anim-A) { animation: bodyMenAdvanceSlow 0.8s cubic-bezier(0.6, 0, 1, 0.5) forwards; }
        @keyframes swordMenSlow { 0% { transform: translateY(0) scale(1); } 50% { transform: translateY(-22px) scale(1.05); } 100% { transform: translateY(18px) scale(1.35); } }
        @keyframes bodyMenAdvanceSlow { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1.10); } }

        :global(.anim-B .sword) { transform-origin: 50% 100%; animation: swordMenFast 0.38s cubic-bezier(0.7, 0, 1, 0.4) forwards; }
        :global(.anim-B) { animation: bodyMenAdvanceFast 0.38s cubic-bezier(0.7, 0, 1, 0.4) forwards; }
        @keyframes swordMenFast { 0% { transform: translateY(0) scale(1); } 45% { transform: translateY(-30px) scale(1.10); } 100% { transform: translateY(28px) scale(1.50); } }
        @keyframes bodyMenAdvanceFast { 0% { transform: scale(1); } 45% { transform: scale(1.04); } 100% { transform: scale(1.18); } }

        :global(.anim-C) { animation: zoomIn 0.5s cubic-bezier(0.55, 0, 1, 0.45) forwards; }
        @keyframes zoomIn { 0% { transform: scale(1); } 100% { transform: scale(1.18); } }

        :global(.anim-D .sword) { transform-origin: 50% 100%; animation: swordKoteD 0.4s cubic-bezier(0.6, 0, 1, 0.45) forwards; }
        @keyframes swordKoteD { 0% { transform: translate(0, 0) rotate(0deg) scale(1); } 100% { transform: translate(38px, 22px) rotate(18deg) scale(0.95); } }

        :global(.anim-E) { animation: sinkZoom 0.5s cubic-bezier(0.6, 0, 1, 0.45) forwards; }
        :global(.anim-E .sword) { transform-origin: 50% 100%; animation: swordKoteE 0.5s cubic-bezier(0.6, 0, 1, 0.45) forwards; }
        @keyframes sinkZoom { 0% { transform: scale(1) translateY(0); } 100% { transform: scale(1.12) translateY(8px); } }
        @keyframes swordKoteE { 0% { transform: translate(0, 0) rotate(0deg) scale(1); } 100% { transform: translate(28px, 18px) rotate(14deg) scale(0.96); } }

        :global(.anim-F .sword) { transform-origin: 50% 100%; animation: swordKoteF 0.3s cubic-bezier(0.7, 0, 1, 0.4) forwards; }
        @keyframes swordKoteF { 0% { transform: translate(0, 0) rotate(0deg) scale(1); } 45% { transform: translate(8px, -6px) rotate(-4deg) scale(1.02); } 100% { transform: translate(32px, 20px) rotate(20deg) scale(0.94); } }

        :global(.anim-G) { animation: shrinkFreeze 0.5s cubic-bezier(0.6, 0, 1, 0.5) forwards; }
        @keyframes shrinkFreeze { 0% { transform: scale(1); } 50% { transform: scale(0.95) translateY(4px); } 100% { transform: scale(0.95) translateY(4px); } }

        :global(.anim-H .sword) { transform-origin: 50% 100%; animation: swordHandsUp 0.5s cubic-bezier(0.55, 0, 1, 0.5) forwards; }
        :global(.anim-H) { animation: bodyLeanBack 0.5s cubic-bezier(0.55, 0, 1, 0.5) forwards; }
        @keyframes swordHandsUp { 0% { transform: translate(0, 0) rotate(0deg) scale(1); } 60% { transform: translate(-12px, -20px) rotate(-6deg) scale(1.02); } 100% { transform: translate(-15px, -25px) rotate(-8deg) scale(1.04); } }
        @keyframes bodyLeanBack { 0% { transform: scale(1) translate(0, 0); } 60% { transform: scale(0.99) translate(-2px, -3px); } 100% { transform: scale(0.98) translate(-3px, -4px); } }

        /* ===== オーバーレイ ===== */
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
        .overlay--okori {
          background: radial-gradient(ellipse at center, rgba(80, 0, 0, 0.15) 0%, transparent 70%);
        }
        .overlay-msg {
          font-size: 18px; letter-spacing: 0.4em; color: #7ed9ff; margin: 0;
          text-shadow: 0 0 8px rgba(0, 200, 255, 0.5);
        }
        .overlay-round {
          font-family: 'Courier New', monospace;
          font-size: 12px; color: #5fa3c7; margin: 0;
        }
        .overlay-okori-msg {
          font-size: 22px; letter-spacing: 0.5em;
          color: #ffaa88; margin: 0; font-weight: 700;
          text-shadow: 0 0 12px rgba(255, 100, 80, 0.6);
          animation: okoriPulse 0.8s ease-in-out infinite;
        }
        @keyframes okoriPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.05); }
        }

        /* ===== ローディング・ベスト ===== */
        .loading-box {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          color: #7ed9ff;
          background: rgba(5, 15, 30, 0.85);
          border: 1px solid rgba(0, 200, 255, 0.4);
          border-radius: 6px; padding: 28px 36px;
          box-shadow: 0 0 30px rgba(0, 200, 255, 0.3);
        }
        .loading-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* ===== ボタン ===== */
        .btn-primary, .btn-secondary {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 14px 32px;
          border-radius: 4px; font-size: 16px; font-weight: 700;
          letter-spacing: 0.3em; cursor: pointer;
          transition: transform 0.1s, box-shadow 0.2s;
        }
        .btn-primary {
          background: linear-gradient(135deg, #00b4ff, #0066cc);
          color: #fff; border: 1px solid #7ed9ff;
          box-shadow: 0 0 20px rgba(0, 200, 255, 0.5);
        }
        .btn-primary:hover { transform: scale(1.04); box-shadow: 0 0 30px rgba(0, 200, 255, 0.8); }
        .btn-primary:active { transform: scale(0.98); }
        .btn-primary:disabled {
          background: #333; border-color: #555; box-shadow: none; cursor: not-allowed;
          opacity: 0.5;
        }
        .btn-secondary {
          background: rgba(0, 60, 100, 0.4); color: #7ed9ff;
          border: 1px solid rgba(126, 217, 255, 0.5);
        }
        .btn-secondary:hover { background: rgba(0, 100, 160, 0.6); border-color: #7ed9ff; }
        .btn-secondary:active { transform: scale(0.98); }
        .btn-menu { width: 220px; max-width: 70vw; padding: 12px 24px; font-size: 14px; }

        /* ===== メニュー画面 ===== */
        .menu-box {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          background: rgba(5, 15, 30, 0.85);
          border: 1px solid rgba(0, 200, 255, 0.4);
          border-radius: 6px; padding: 28px 32px;
          box-shadow: 0 0 30px rgba(0, 200, 255, 0.3);
          min-width: 280px;
        }
        .menu-title {
          margin: 0 0 4px; font-size: 18px;
          letter-spacing: 0.4em; color: #fff;
          text-shadow: 0 0 12px rgba(0, 200, 255, 0.6);
        }
        .menu-desc {
          margin: 0 0 12px; font-size: 12px;
          letter-spacing: 0.2em; color: #7ed9ff;
        }
        .menu-info {
          margin: 8px 0 0; font-size: 11px;
          font-family: 'Courier New', monospace; color: #5fa3c7;
        }
        .menu-locked {
          display: inline-flex; align-items: center; gap: 8px;
          color: #ffb04a; font-size: 14px;
          padding: 10px 16px;
          background: rgba(255, 176, 74, 0.08);
          border: 1px solid rgba(255, 176, 74, 0.4);
          border-radius: 4px;
        }

        /* ===== 記録画面 ===== */
        .records-box {
          background: rgba(5, 15, 30, 0.88);
          border: 1px solid rgba(0, 200, 255, 0.4);
          border-radius: 6px; padding: 24px 28px;
          box-shadow: 0 0 30px rgba(0, 200, 255, 0.3);
          min-width: 300px; max-width: 92vw;
        }
        .records-title {
          margin: 0 0 16px; font-size: 16px; text-align: center;
          letter-spacing: 0.4em; color: #fff;
          text-shadow: 0 0 12px rgba(0, 200, 255, 0.6);
        }
        .records-stat {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 0;
          border-bottom: 1px dashed rgba(126, 217, 255, 0.2);
        }
        .records-label { font-size: 12px; color: #7ed9ff; letter-spacing: 0.1em; }
        .records-value {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'Courier New', monospace;
          font-size: 16px; color: #fff; font-weight: 700;
        }
        .records-locked {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin: 12px 0 0; padding: 8px;
          color: #ffb04a; font-size: 12px;
          background: rgba(255, 176, 74, 0.08);
          border: 1px solid rgba(255, 176, 74, 0.3);
          border-radius: 4px;
        }
        .records-divider {
          margin: 16px 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(126, 217, 255, 0.3), transparent);
        }
        .records-tips { margin-bottom: 16px; }
        .records-tips-title {
          margin: 0 0 8px; font-size: 12px;
          letter-spacing: 0.3em; color: #ffd866;
          text-align: center;
        }
        .records-tips p {
          margin: 6px 0; font-size: 12px; color: #b0d8ee; line-height: 1.5;
        }
        .rank-tag {
          display: inline-block; min-width: 24px; padding: 2px 6px;
          border-radius: 3px; font-family: 'Courier New', monospace;
          font-weight: 900; text-align: center; margin-right: 8px;
        }
        .rank-S-tag { background: #ffd866; color: #1a1a1a; box-shadow: 0 0 8px #ffd866; }
        .rank-A-tag { background: #00dcff; color: #1a1a1a; }
        .rank-B-tag { background: #7ed9ff; color: #1a1a1a; }
        .rank-C-tag { background: #5fa3c7; color: #fff; }
        .rank-F-tag { background: #ff8080; color: #fff; }

        /* ===== カットイン ===== */
        .cutin {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          z-index: 10; pointer-events: none;
        }
        .cutin-text {
          font-size: clamp(40px, 11vw, 80px);
          font-weight: 900;
          font-family: 'Noto Sans JP', sans-serif;
          letter-spacing: 0.05em;
          padding: 0 12px;
          animation: cutinAppear 1.5s cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
          transform-origin: center center;
        }
        .cutin-S .cutin-text {
          color: #ffd866;
          text-shadow:
            0 0 24px #ffd866,
            0 0 48px #ff8040,
            4px 4px 0 #1a1a1a,
            -2px -2px 0 #1a1a1a,
            2px -2px 0 #1a1a1a,
            -2px 2px 0 #1a1a1a;
        }
        .cutin-A .cutin-text {
          color: #00dcff;
          text-shadow:
            0 0 24px #00dcff, 0 0 48px #0080ff,
            4px 4px 0 #1a1a1a, -2px -2px 0 #1a1a1a, 2px -2px 0 #1a1a1a, -2px 2px 0 #1a1a1a;
        }
        .cutin-B .cutin-text, .cutin-C .cutin-text {
          color: #7ed9ff;
          text-shadow:
            0 0 16px #7ed9ff,
            3px 3px 0 #1a1a1a, -2px -2px 0 #1a1a1a, 2px -2px 0 #1a1a1a, -2px 2px 0 #1a1a1a;
        }
        .cutin-F .cutin-text {
          color: #ff5050;
          text-shadow:
            0 0 16px #ff0040,
            3px 3px 0 #1a1a1a, -2px -2px 0 #1a1a1a, 2px -2px 0 #1a1a1a, -2px 2px 0 #1a1a1a;
        }
        @keyframes cutinAppear {
          0%   { transform: scale(0.2) rotate(-8deg); opacity: 0; letter-spacing: 0.5em; }
          15%  { transform: scale(1.4) rotate(-4deg); opacity: 1; letter-spacing: 0.05em; }
          30%  { transform: scale(1.0) rotate(-2deg); }
          70%  { transform: scale(1.0) rotate(-2deg); opacity: 1; }
          100% { transform: scale(1.1) rotate(-2deg); opacity: 0; }
        }

        /* ===== 斬撃エフェクト ===== */
        .slash-fx {
          position: absolute; inset: -20%;
          z-index: 8; pointer-events: none;
          background: linear-gradient(
            115deg,
            transparent 30%,
            rgba(255, 255, 255, 0) 38%,
            rgba(255, 255, 255, 0.95) 49%,
            rgba(126, 217, 255, 0.9) 50%,
            rgba(255, 255, 255, 0.95) 51%,
            rgba(255, 255, 255, 0) 62%,
            transparent 70%
          );
          background-size: 300% 300%;
          background-position: 100% 0%;
          animation: slashSweep 0.5s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
        }
        @keyframes slashSweep {
          0%   { background-position: 120% -20%; opacity: 0; }
          10%  { opacity: 1; }
          100% { background-position: -20% 120%; opacity: 0; }
        }

        /* ===== フラッシュ各種 ===== */
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
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        .flash-okori {
          position: absolute; inset: 0;
          background: radial-gradient(circle at center, rgba(255, 80, 80, 0.18) 0%, transparent 60%);
          animation: flashOkori 0.18s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashOkori {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }

        /* ===== 試合終了サマリー ===== */
        .result-summary {
          background: rgba(5, 15, 30, 0.85);
          border: 1px solid rgba(0, 200, 255, 0.4);
          border-radius: 6px; padding: 24px 28px;
          min-width: 280px; max-width: 92vw;
          box-shadow: 0 0 30px rgba(0, 200, 255, 0.3);
        }
        .result-summary h2 {
          margin: 0 0 16px; text-align: center;
          font-size: 18px; letter-spacing: 0.3em; color: #fff;
        }

        .rank-display {
          display: flex; align-items: baseline; justify-content: center; gap: 12px;
          margin: 0 0 16px; padding: 12px;
          border-radius: 6px;
          animation: rankPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes rankPop {
          0% { transform: scale(0.3); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .rank-label {
          font-family: 'Courier New', monospace;
          font-size: 11px; letter-spacing: 0.4em;
          color: #7ed9ff; opacity: 0.8;
        }
        .rank-value {
          font-size: 56px; font-weight: 900;
          font-family: 'Courier New', monospace; line-height: 1;
        }
        .rank-S { background: linear-gradient(135deg, rgba(255, 216, 102, 0.2), rgba(255, 100, 50, 0.2)); border: 1px solid #ffd866; }
        .rank-S .rank-value { color: #ffd866; text-shadow: 0 0 24px #ffd866, 0 0 48px #ff8040; }
        .rank-A { background: linear-gradient(135deg, rgba(0, 220, 255, 0.2), rgba(100, 100, 255, 0.2)); border: 1px solid #00dcff; }
        .rank-A .rank-value { color: #00dcff; text-shadow: 0 0 20px #00dcff; }
        .rank-B { background: rgba(126, 217, 255, 0.1); border: 1px solid #7ed9ff; }
        .rank-B .rank-value { color: #7ed9ff; text-shadow: 0 0 16px #7ed9ff; }
        .rank-C { background: rgba(160, 232, 255, 0.05); border: 1px solid #5fa3c7; }
        .rank-C .rank-value { color: #5fa3c7; }
        .rank-F { background: rgba(255, 100, 100, 0.08); border: 1px solid #ff8080; }
        .rank-F .rank-value { color: #ff8080; }

        .summary-line { margin: 4px 0; font-size: 14px; color: #b0d8ee; }
        .summary-line strong {
          color: #fff; font-size: 18px;
          font-family: 'Courier New', monospace; margin: 0 4px;
        }
        .summary-xp {
          margin-top: 10px; padding: 8px 12px;
          background: rgba(255, 216, 102, 0.08);
          border-left: 3px solid #ffd866;
          border-radius: 2px;
        }
        .summary-xp .xp-value {
          color: #ffd866 !important; font-size: 22px !important;
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
          display: grid; grid-template-columns: 24px 1fr 32px 70px; gap: 8px;
          font-size: 13px; padding: 4px 0;
          font-family: 'Courier New', monospace;
          align-items: center;
        }
        .summary-round.ok { color: #7ed9ff; }
        .summary-round.ng { color: #ff8080; }
        .summary-round span:last-child { text-align: right; }
        .summary-rank {
          font-size: 11px !important; padding: 2px 4px !important;
          border-radius: 3px; font-weight: 900; text-align: center;
        }

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
      `}</style>
    </div>
  );
}

// =====================================================================
// 仮想剣士 SVG ★ Phase16.1: intensity prop で okori/strike を区別
// =====================================================================
interface KenshiSVGProps {
  glowPart:  HitPart | null;
  intensity: 'okori' | 'strike' | null;
  active:    boolean;
  onTap:     (part: HitPart) => void;
}

function KenshiSVG({ glowPart, intensity, active, onTap }: KenshiSVGProps) {
  const handleClick = (part: HitPart) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (active) onTap(part);
  };

  /**
   * ★ Phase16.1: intensity に応じた色決定ロジック
   *  - null:    通常の青系
   *  - okori:   薄赤（じわじわ赤化を CSS transition で表現）
   *  - strike:  完全に赤
   */
  const getColors = (part: HitPart) => {
    const isTarget = glowPart === part;
    if (!isTarget || intensity === null) {
      return {
        stroke: '#00c8ff',
        fill: 'rgba(0, 80, 120, 0.10)',
        filter: 'url(#neonGlow)',
      };
    }
    if (intensity === 'okori') {
      // okori: 薄赤（移行中の中間色）
      return {
        stroke: '#ff8866',
        fill: 'rgba(180, 60, 40, 0.18)',
        filter: 'url(#redGlow)',
      };
    }
    // strike: 完全赤
    return {
      stroke: '#ff2a3a',
      fill: 'rgba(180, 20, 30, 0.32)',
      filter: 'url(#redGlow)',
    };
  };

  /**
   * ★ Phase16.1: transition を okori 中はゆっくり(0.6s)、strike瞬間は速く(0.1s)
   * これで「じわじわ赤くなって、ある瞬間にカッと真っ赤」が実現できる
   */
  const colorTransition = intensity === 'strike'
    ? 'fill 0.1s ease-out, stroke 0.1s ease-out'
    : 'fill 0.6s ease-in, stroke 0.6s ease-in';

  const hitStyle = (active: boolean): React.CSSProperties => ({
    cursor: active ? 'pointer' : 'default',
    pointerEvents: active ? 'all' : 'none',
    transition: colorTransition,
  });

  const menColors  = getColors('men');
  const koteColors = getColors('kote');
  const doColors   = getColors('do');

  return (
    <svg viewBox="0 0 300 500" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
      <defs>
        <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="thinGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="tipGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        <symbol id="bracket-tl" viewBox="0 0 20 20"><path d="M 0 8 L 0 0 L 8 0" stroke="currentColor" strokeWidth="1" fill="none" /></symbol>
        <symbol id="bracket-tr" viewBox="0 0 20 20"><path d="M 12 0 L 20 0 L 20 8" stroke="currentColor" strokeWidth="1" fill="none" /></symbol>
        <symbol id="bracket-bl" viewBox="0 0 20 20"><path d="M 0 12 L 0 20 L 8 20" stroke="currentColor" strokeWidth="1" fill="none" /></symbol>
        <symbol id="bracket-br" viewBox="0 0 20 20"><path d="M 12 20 L 20 20 L 20 12" stroke="currentColor" strokeWidth="1" fill="none" /></symbol>
      </defs>

      {/* 背景HUD */}
      <g pointerEvents="none">
        <g stroke="#1e5a7a" strokeWidth="0.4" fill="none" opacity="0.55">
          <line x1="150" y1="20" x2="150" y2="490" strokeDasharray="2 4" />
          <line x1="20" y1="100" x2="280" y2="100" strokeDasharray="1 3" />
          <line x1="20" y1="280" x2="280" y2="280" strokeDasharray="1 3" />
          <line x1="20" y1="340" x2="280" y2="340" strokeDasharray="1 3" />
          <line x1="20" y1="460" x2="150" y2="86" strokeDasharray="1 6" opacity="0.35" />
          <line x1="280" y1="460" x2="150" y2="86" strokeDasharray="1 6" opacity="0.35" />
        </g>
        <g color="#3a8fb8" opacity="0.7">
          <use href="#bracket-tl" x="20" y="30" width="22" height="22" />
          <use href="#bracket-tr" x="258" y="30" width="22" height="22" />
          <use href="#bracket-bl" x="20" y="448" width="22" height="22" />
          <use href="#bracket-br" x="258" y="448" width="22" height="22" />
        </g>
        <g fill="#3a8fb8" fontFamily="Courier New, monospace" fontSize="7" opacity="0.6">
          <text x="26" y="44">TGT-LOCK</text>
          <text x="232" y="44">v.16.1</text>
          <text x="26" y="464">HIT-ZONE</text>
          <text x="240" y="464">ACTIVE</text>
        </g>
      </g>

      {/* 面 */}
      <g className="hit-men" onClick={handleClick('men')} onTouchStart={handleClick('men')}>
        <polygon
          points="150,72 188,90 192,140 175,180 125,180 108,140 112,90"
          stroke={menColors.stroke}
          strokeWidth="2"
          fill={menColors.fill}
          filter={menColors.filter}
          style={hitStyle(active)}
        />
        <g pointerEvents="none">
          <g stroke={menColors.stroke} strokeWidth="1.2" filter="url(#thinGlow)" style={{ transition: colorTransition }}>
            <line x1="120" y1="108" x2="180" y2="108" />
            <line x1="116" y1="125" x2="184" y2="125" />
            <line x1="120" y1="142" x2="180" y2="142" opacity="0.85" />
            <line x1="128" y1="158" x2="172" y2="158" opacity="0.6" />
          </g>
          <text x="196" y="92" fill="#3a8fb8" fontFamily="Courier New, monospace" fontSize="6" opacity="0.85">[MEN]</text>
        </g>
      </g>

      {/* 小手 */}
      <g className="hit-kote" onClick={handleClick('kote')} onTouchStart={handleClick('kote')}>
        <polygon
          points="55,330 130,310 142,365 130,395 70,400 38,378 32,355"
          stroke={koteColors.stroke}
          strokeWidth="2.2"
          fill={koteColors.fill}
          filter={koteColors.filter}
          style={hitStyle(active)}
        />
        <g pointerEvents="none">
          <g stroke={koteColors.stroke} strokeWidth="0.6" opacity="0.7" fill="none" style={{ transition: colorTransition }}>
            <line x1="60" y1="345" x2="125" y2="328" />
            <line x1="58" y1="370" x2="130" y2="365" />
            <polygon points="75,348 115,335 120,360 80,372" />
          </g>
          <text x="44" y="420" fill="#3a8fb8" fontFamily="Courier New, monospace" fontSize="7" opacity="0.85">[KOTE]</text>
        </g>
      </g>

      {/* 胴 */}
      <g className="hit-do" onClick={handleClick('do')} onTouchStart={handleClick('do')}>
        <polygon
          points="100,255 200,255 215,290 208,335 150,348 92,335 85,290"
          stroke={doColors.stroke}
          strokeWidth="2"
          fill={doColors.fill}
          filter={doColors.filter}
          style={hitStyle(active)}
        />
        <g pointerEvents="none">
          <g stroke={doColors.stroke} strokeWidth="0.5" fill="none" opacity="0.65" style={{ transition: colorTransition }}>
            <line x1="100" y1="275" x2="200" y2="275" />
            <line x1="92" y1="305" x2="208" y2="305" />
            <line x1="125" y1="260" x2="125" y2="345" strokeDasharray="2 2" />
            <line x1="175" y1="260" x2="175" y2="345" strokeDasharray="2 2" />
            <path d="M 130 268 L 150 295 L 170 268" strokeWidth="0.7" />
          </g>
          <text x="218" y="335" fill="#3a8fb8" fontFamily="Courier New, monospace" fontSize="6" opacity="0.85">[DO]</text>
        </g>
      </g>

      {/* 竹刀 */}
      <g className="sword" filter="url(#neonGlow)" pointerEvents="none">
        <polygon points="143,92 157,92 152.5,322 147.5,322" stroke="#a0e8ff" strokeWidth="1.3" fill="rgba(160, 232, 255, 0.30)" strokeLinejoin="miter" />
        <line x1="150" y1="92" x2="150" y2="322" stroke="#e0f2ff" strokeWidth="0.5" opacity="0.85" />
        <polygon points="146,92 149,92 151,322 150,322" fill="rgba(224, 242, 255, 0.4)" opacity="0.7" />
        <polygon points="145,318 155,318 158,322 155,326 145,326 142,322" stroke="#00c8ff" strokeWidth="1.1" fill="rgba(0,200,255,0.30)" />
        <polygon points="148,326 152,326 151,388 149,388" stroke="#7ed9ff" strokeWidth="1" fill="rgba(126, 217, 255, 0.28)" />
        <g stroke="#a0e8ff" strokeWidth="0.4" opacity="0.55">
          <line x1="148.5" y1="345" x2="151.5" y2="345" />
          <line x1="148.7" y1="360" x2="151.3" y2="360" />
          <line x1="148.9" y1="375" x2="151.1" y2="375" />
        </g>
        <polygon points="149,388 151,388 150.5,394 149.5,394" stroke="#7ed9ff" strokeWidth="0.8" fill="rgba(0,200,255,0.30)" />
        <polygon points="150,72 162,94 138,94" fill="#e0f2ff" stroke="#7ed9ff" strokeWidth="0.9" filter="url(#tipGlow)" />
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
