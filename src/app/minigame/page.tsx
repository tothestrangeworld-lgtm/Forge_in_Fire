'use client';

/**
 * =====================================================================
 * 刹那ノ見切 (Setsuna no Mikiri) - Phase 17.0 反応時間リファクタ版
 * =====================================================================
 * 改善点:
 *  - Phase16.1: viewState による画面分割（menu/playing/records）
 *  - Phase16.1: ステートマシン拡張（waiting → okori → strike → result）
 *  - Phase16.1 追記2: okori 予備動作アニメ・配色をインディゴ×和風ゴールドに
 *  - Phase16.1 追記3: reactionMs を okoriStartRef からの通算時間に統一
 *  - Phase16.1 追記4: pre_okori フェーズ追加（READY消去後 0.4〜1.4s の無の間）
 *  - Phase17.0: 反応時間の計測起点を「okoriフェーズ開始の瞬間」に統一
 *  - Phase17.0: ランク判定を純粋な反応時間(ms)の絶対値ベースに再定義
 *               S:0-150 / A:151-250 / B:251-400 / C:401-600 / F:600+
 *  - Phase17.0: 待機中タップ（waiting/pre_okori）を「フライング」として即失敗化
 * =====================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Loader2, Trophy, BookOpen, Swords, Terminal } from 'lucide-react';
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

type ViewState = 'menu' | 'playing' | 'records';

/**
 * ★ Phase16.1 追記4: pre_okori フェーズを追加
 *   - waiting:   READY表示中（1.5〜3.0s）
 *   - pre_okori: READY消去後の「無の間」（0.4〜1.4s）← 新規
 *   - okori:     起こり（0.4〜1.0s）★ ここで計測スタート
 *   - strike:    打突（pattern.strikeDuration）
 */
type GamePhase =
  | 'loading'
  | 'idle'
  | 'waiting'
  | 'pre_okori'    // ★ Phase16.1 追記4: 静寂タイム
  | 'okori'
  | 'strike'
  | 'result'
  | 'matchEnd'
  | 'submitting'
  | 'locked'
  | 'error';

interface Pattern {
  id:           PatternId;
  successName:  string;
  correctPart:  HitPart;
  strikeDuration: number;
  category:     'oji' | 'shikake';
  failLabel:    'HIT' | 'MISS' | 'EARLY';
  animClass:    string;
  glowPart:     HitPart;
}

type HitTiming = 'okori' | 'strike' | 'late' | 'wrongPart' | 'tooEarly' | 'timeout';

interface RoundResult {
  patternId:    PatternId;
  success:      boolean;
  reactionMs:   number | null;
  successName:  string;
  failLabel:    string;
  timing:       HitTiming;
  cutinText:    string;
  rank:         'S' | 'A' | 'B' | 'C' | 'F';
}

// =====================================================================
// 8パターン定義
// =====================================================================
const PATTERNS: Pattern[] = [
  { id: 'A', successName: '出端小手',     correctPart: 'kote', glowPart: 'kote', strikeDuration: 800, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-A' },
  { id: 'B', successName: '面返し胴',     correctPart: 'do',   glowPart: 'do',   strikeDuration: 380, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-B' },
  { id: 'C', successName: '出端面',       correctPart: 'men',  glowPart: 'men',  strikeDuration: 500, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-C' },
  { id: 'D', successName: '小手返し面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 400, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-D' },
  { id: 'E', successName: '小手抜き面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 500, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-E' },
  { id: 'F', successName: '合い小手面',   correctPart: 'kote', glowPart: 'kote', strikeDuration: 300, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-F' },
  { id: 'G', successName: '飛び込み面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 500, category: 'shikake', failLabel: 'MISS', animClass: 'anim-G' },
  { id: 'H', successName: '飛び込み小手', correctPart: 'kote', glowPart: 'kote', strikeDuration: 500, category: 'shikake', failLabel: 'MISS', animClass: 'anim-H' },
];

const ROUNDS_PER_MATCH = 3;
const MAX_MATCHES_PER_DAY = 3;

// =====================================================================
// ★ Phase17.0: ランク判定の閾値（okori開始からの純粋な反応時間 ms）
//   S: 0   〜 150
//   A: 151 〜 250
//   B: 251 〜 400
//   C: 401 〜 600
//   F: 601 〜（被弾） / フライング / 部位ミス / タイムアウト
// =====================================================================
const RANK_THRESHOLD = {
  S: 150,
  A: 250,
  B: 400,
  C: 600,
} as const;

/**
 * ★ Phase17.0: 純粋な反応時間(ms)からランクを判定するヘルパー
 */
function judgeRankByReaction(reactionMs: number): 'S' | 'A' | 'B' | 'C' | 'F' {
  if (reactionMs <= RANK_THRESHOLD.S) return 'S';
  if (reactionMs <= RANK_THRESHOLD.A) return 'A';
  if (reactionMs <= RANK_THRESHOLD.B) return 'B';
  if (reactionMs <= RANK_THRESHOLD.C) return 'C';
  return 'F';
}

// =====================================================================
// ★ カットイン用：タイミング別のテキストプール
// =====================================================================
const CUTIN_S = [
  'IPPON!',
  '喪神無想',
  '天誅!',
  'ZERO FRAME!',
  '会心の一撃!',
];
const CUTIN_A = [
  'COUNTER HIT!',
  'PARRY & SLASH!',
  '一本!',
  'そこだ!',
  'くらえ!',
  'CLEAN PARRY!',
];
const CUTIN_BC = [
  'NARROW BLOCK!',
  '危機一髪！',
  'BARELY DODGED...',
  'JUST IN TIME...',
  'ギリギリ...',
];
const CUTIN_FAIL = [
  '失敗...',
  'MISREAD!',
  '無惨...',
];
const CUTIN_TOO_EARLY = [
  '不覚…！',
  'TOO HASTY!',
  '慌てるべからず!',
];

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// =====================================================================
// ★ Phase17.0: ランクに応じたカットインプールを返すヘルパー
// =====================================================================
function pickCutinByRank(rank: 'S' | 'A' | 'B' | 'C'): string {
  switch (rank) {
    case 'S': return pickRandom(CUTIN_S);
    case 'A': return pickRandom(CUTIN_A);
    case 'B':
    case 'C':
    default:  return pickRandom(CUTIN_BC);
  }
}

// =====================================================================
// ユーティリティ
// =====================================================================
const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const pickRandomPattern = (): Pattern => PATTERNS[Math.floor(Math.random() * PATTERNS.length)];

const formatTime = (ms: number | null): string => {
  if (ms === null || ms === undefined) return '---.---';
  return `${(ms / 1000).toFixed(3)}s`;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

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
  const [viewState, setViewState] = useState<ViewState>('menu');

  const [phase, setPhase]               = useState<GamePhase>('loading');
  const [matchCount, setMatchCount]     = useState(0);
  const [roundIdx, setRoundIdx]         = useState(0);
  const [currentPattern, setCurrentPattern] = useState<Pattern | null>(null);
  const [results, setResults]           = useState<RoundResult[]>([]);
  const [lastResult, setLastResult]     = useState<RoundResult | null>(null);

  const [flashType, setFlashType]       = useState<'none' | 'success' | 'fail' | 'okori'>('none');
  const [cutinText, setCutinText]       = useState<string>('');
  const [shakeKey, setShakeKey]         = useState<number>(0);
  const [slashKey, setSlashKey]         = useState<number>(0);

  const [bestTimeMs, setBestTimeMs]     = useState<number | null>(null);
  const [statusInfo, setStatusInfo]     = useState<MinigameStatus | null>(null);
  const [lastSaveResult, setLastSaveResult] = useState<MinigameSaveResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const okoriStartRef    = useRef<number | null>(null);
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
        if (status.locked) setPhase('locked');
        else setPhase('idle');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        setPhase('error');
      }
    })();
  }, []);

  const finishRound = useCallback((result: RoundResult) => {
    setLastResult(result);
    setResults(prev => [...prev, result]);
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
    }, 1700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // ★ Phase16.1 追記4: pre_okori フェーズを挿入した4段階タイマー
  //   waiting (READY表示, 1.5〜3.0s)
  //   → pre_okori (無の間, 0.4〜1.4s)  ← READY消去後、画面静寂
  //   → okori    (起こり, 0.4〜1.0s)   ← ★ Phase17.0: ここを計測の0秒とする
  //   → strike   (打突, pattern.strikeDuration)
  // ===================================================================
  const scheduleNextRound = useCallback(() => {
    const waitMs = randomBetween(1000, 2000);
    if (timerRef.current) clearTimeout(timerRef.current);

    // [1] waiting フェーズ（READY表示）
    timerRef.current = setTimeout(() => {
      // ★ READYを消してから無の間に入る
      setPhase('pre_okori');

      // [2] pre_okori フェーズ（無の間 0.4〜1.4s）
      const preOkoriMs = randomBetween(1500, 3000);
      timerRef.current = setTimeout(() => {
        const pattern = pickRandomPattern();
        setCurrentPattern(pattern);
        // ★ Phase17.0: okoriフェーズに入った瞬間を反応時間の0秒として記録
        okoriStartRef.current = performance.now();
        setPhase('okori');
        // 起こりに入った瞬間の微細な視覚キュー
        setFlashType('okori');
        setTimeout(() => setFlashType('none'), 120);

        // [3] okori フェーズ（0.4〜1.0秒のランダム）
        const okoriMs = randomBetween(400, 1000);
        timerRef.current = setTimeout(() => {
          setPhase('strike');

          // [4] strike フェーズ（パターンごとの猶予）
          timerRef.current = setTimeout(() => {
            handleTimeout(pattern);
          }, pattern.strikeDuration);
        }, okoriMs);
      }, preOkoriMs);
    }, waitMs);
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
    setViewState('playing');
    setPhase('waiting');
    scheduleNextRound();
  }, [scheduleNextRound]);

// ===================================================================
  // ★ Phase17.1: タップハンドラ（okori計測起点バグ修正版）
  //   - waiting / pre_okori 中のタップ → フライング（即Fランク・タイム無効）
  //   - okori / strike 中の正しい部位タップ
  //       → okori開始（okoriStartRef）からの純粋な経過時間(ms)で
  //         S/A/B/C/F をフラット判定
  //   - 部位ミス → Fランク・タイム無効
  //   - okori開始から600ms超（rank==='F'）→ 反応が遅すぎた被弾扱い
  // ===================================================================
  const handleTap = (part: HitPart) => {
    // ── フライング（お手付き）判定 ──
    // ★ 敵がまだ動き出していない無の間（waiting / pre_okori）のタップのみ即フライング失敗
    //   okori 以降は有効打突として受け付けるため、ここには含めない
    if (phase === 'waiting' || phase === 'pre_okori') {
      if (timerRef.current) clearTimeout(timerRef.current);
      const dummyPattern = currentPattern ?? pickRandomPattern();
      finishRound({
        patternId:   dummyPattern.id,
        success:     false,
        reactionMs:  null,            // フライングはタイム無効
        successName: dummyPattern.successName,
        failLabel:   'EARLY',
        timing:      'tooEarly',
        cutinText:   pickRandom(CUTIN_TOO_EARLY),
        rank:        'F',
      });
      return;
    }

    if (!currentPattern) return;
    // ★ 起こり（okori）と打突（strike）の両フェーズでタップを有効打突として受け付ける
    if (phase !== 'okori' && phase !== 'strike') return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const isCorrectPart = part === currentPattern.correctPart;

    // ── 部位ミス → 失敗（タイム無効） ──
    if (!isCorrectPart) {
      finishRound({
        patternId:   currentPattern.id,
        success:     false,
        reactionMs:  null,
        successName: currentPattern.successName,
        failLabel:   'MISS',
        timing:      'wrongPart',
        cutinText:   pickRandom(CUTIN_FAIL),
        rank:        'F',
      });
      return;
    }

    // ── 正しい部位タップ ──
    // ★ 敵が動き始めた瞬間（okoriStartRef）からの純粋な経過時間をミリ秒で計測
    const reactionMs = okoriStartRef.current !== null
      ? performance.now() - okoriStartRef.current
      : 0;
    const reactionMsRounded = Math.round(reactionMs);

    // ★ 反応時間の絶対値（0ms〜）だけでランクをフラット判定
    const rank = judgeRankByReaction(reactionMsRounded);

    // ── Fランク（600ms超）= 反応が遅すぎて被弾扱い ──
    if (rank === 'F') {
      finishRound({
        patternId:   currentPattern.id,
        success:     false,
        reactionMs:  reactionMsRounded, // 遅延タイムは記録（参考表示）
        successName: currentPattern.successName,
        failLabel:   currentPattern.failLabel,
        timing:      'strike',
        cutinText:   pickRandom(CUTIN_FAIL),
        rank:        'F',
      });
      return;
    }

    // ── 成功（S / A / B / C） ──
    finishRound({
      patternId:   currentPattern.id,
      success:     true,
      reactionMs:  reactionMsRounded,
      successName: currentPattern.successName,
      failLabel:   '',
      timing:      'strike',
      cutinText:   pickCutinByRank(rank),
      rank,
    });
  };

  const averageReaction = useMemo(() => {
    const successes = results.filter(r => r.success && r.reactionMs !== null);
    if (successes.length === 0) return null;
    const sum = successes.reduce((acc, r) => acc + (r.reactionMs ?? 0), 0);
    return sum / successes.length;
  }, [results]);

  const successCount = results.filter(r => r.success).length;
  const overallRank  = useMemo<MinigameRank>(() => calcOverallRank(results), [results]);

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

  const glowState = useMemo<{ part: HitPart | null; intensity: 'okori' | 'strike' | null }>(() => {
    if (!currentPattern) return { part: null, intensity: null };
    if (phase === 'okori')  return { part: currentPattern.glowPart, intensity: 'okori' };
    if (phase === 'strike') return { part: currentPattern.glowPart, intensity: 'strike' };
    return { part: null, intensity: null };
  }, [phase, currentPattern]);

  const remainingQuota = Math.max(0, MAX_MATCHES_PER_DAY - matchCount);

  return (
    <div className="mikiri-root" key={shakeKey} data-shake={shakeKey > 0 ? 'on' : 'off'}>
      <div className="mikiri-bg" aria-hidden="true">
        <div className="mikiri-grid" />
        <div className="mikiri-scan" />
      </div>

      <header className="mikiri-header">
        {viewState === 'playing' || viewState === 'records' ? (
          <button onClick={handleBackToMenu} className="mikiri-back" aria-label="back" type="button">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <Link href="/" className="mikiri-back" aria-label="back">
            <ArrowLeft size={20} />
          </Link>
        )}
        <h1 className="mikiri-title">
          <span className="mikiri-title-main">SETSUNA-NO-MIKIRI</span>
          <span className="mikiri-title-sub">_刹那ノ見切_</span>
        </h1>
        <div className="mikiri-counter" aria-label="match counter">
          <span className="counter-num">{pad2(matchCount)}</span>
          <span className="counter-sep">/</span>
          <span className="counter-max">{pad2(MAX_MATCHES_PER_DAY)}</span>
        </div>
      </header>

      <main className="mikiri-stage">
        {flashType === 'success' && <div className="flash-success" aria-hidden="true" />}
        {flashType === 'fail'    && <div className="flash-fail"    aria-hidden="true" />}
        {flashType === 'okori'   && <div className="flash-okori"   aria-hidden="true" />}
        {slashKey > 0 && phase === 'result' && lastResult?.success && (
          <div className="slash-fx" key={`slash-${slashKey}`} aria-hidden="true" />
        )}

        {cutinText && phase === 'result' && (
          <div className={`cutin cutin-${lastResult?.rank ?? 'F'}`} key={`cut-${shakeKey}`}>
            <span className="cutin-text">{cutinText}</span>
          </div>
        )}

        {viewState === 'playing' && (
          <div
            className={[
              'kenshi-wrap',
              currentPattern && phase === 'strike' ? currentPattern.animClass : '',
              phase === 'okori'  ? 'anim-okori is-active' : '',
              phase === 'strike' ? 'is-active' : '',
            ].filter(Boolean).join(' ')}
          >
            <KenshiSVG
              glowPart={glowState.part}
              intensity={glowState.intensity}
              active={phase === 'okori' || phase === 'strike'}
              onTap={handleTap}
            />
          </div>
        )}

        {/* ============ loading / error ============ */}
        {phase === 'loading' && (
          <div className="overlay">
            <div className="console-box">
              <div className="console-prompt">
                <Terminal size={14} />
                <span>SYS_INIT</span>
              </div>
              <div className="loading-row">
                <Loader2 size={20} className="animate-spin" />
                <span className="loading-text">FETCHING_STATUS<span className="dots">...</span></span>
              </div>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="overlay">
            <div className="console-box console-box--error">
              <div className="console-prompt console-prompt--error">
                <AlertTriangle size={14} />
                <span>FATAL_ERROR</span>
              </div>
              <p className="console-msg">{errorMessage || 'CONNECTION_FAILED'}</p>
              <button className="cyber-btn cyber-btn--danger" onClick={() => window.location.reload()} type="button">
                <span className="cyber-btn-bracket">[</span>
                <span className="cyber-btn-label">RELOAD_SYSTEM</span>
                <span className="cyber-btn-bracket">]</span>
              </button>
            </div>
          </div>
        )}

        {/* ============ メニュー画面 ============ */}
        {viewState === 'menu' && phase !== 'loading' && phase !== 'error' && (
          <div className="overlay">
            <div className="console-box console-box--menu">
              <div className="kanji-watermark" aria-hidden="true">見切</div>

              <div className="console-prompt">
                <Terminal size={14} />
                <span>MAIN_MENU</span>
                <span className="prompt-blink">_</span>
              </div>

              <div className="menu-header">
                <h2 className="menu-title-en">SETSUNA</h2>
                <h2 className="menu-title-en menu-title-en--accent">NO_MIKIRI</h2>
                <p className="menu-title-jp">─ 刹那ノ見切 ─</p>
              </div>

              <div className="menu-sep" />

              {phase === 'locked' ? (
                <div className="menu-locked">
                  <AlertTriangle size={16} />
                  <span>QUOTA_EXHAUSTED // 24H_COOLDOWN</span>
                </div>
              ) : (
                <button
                  className="cyber-btn cyber-btn--primary"
                  onClick={startMatch}
                  type="button"
                  disabled={matchCount >= MAX_MATCHES_PER_DAY}
                >
                  <span className="cyber-btn-icon"><Swords size={16} /></span>
                  <span className="cyber-btn-bracket">[</span>
                  <span className="cyber-btn-label">ENGAGE_MATCH</span>
                  <span className="cyber-btn-bracket">]</span>
                </button>
              )}

              <button
                className="cyber-btn cyber-btn--secondary"
                onClick={() => setViewState('records')}
                type="button"
              >
                <span className="cyber-btn-icon"><BookOpen size={16} /></span>
                <span className="cyber-btn-bracket">[</span>
                <span className="cyber-btn-label">PERSONAL_DATA</span>
                <span className="cyber-btn-bracket">]</span>
              </button>

              <div className="menu-stat-line">
                <span className="stat-key">REMAINING_QUOTA</span>
                <span className="stat-sep">:</span>
                <span className="stat-val">{pad2(remainingQuota)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ============ 記録画面 ============ */}
        {viewState === 'records' && (
          <div className="overlay">
            <div className="console-box console-box--records">
              <div className="kanji-watermark" aria-hidden="true">記録</div>

              <div className="console-prompt">
                <Terminal size={14} />
                <span>PERSONAL_DATA</span>
                <span className="prompt-blink">_</span>
              </div>

              <div className="menu-header menu-header--records">
                <h2 className="menu-title-en">PERSONAL</h2>
                <h2 className="menu-title-en menu-title-en--accent">DATA_LOG</h2>
                <p className="menu-title-jp">─ 修練の記録 ─</p>
              </div>

              <div className="menu-sep" />

              <div className="data-row">
                <span className="data-key">{'>'} BEST_REACTION</span>
                <span className="data-val">
                  <Trophy size={14} />
                  {bestTimeMs !== null ? formatTime(bestTimeMs) : '---.---'}
                </span>
              </div>

              <div className="data-row">
                <span className="data-key">{'>'} TODAY_MATCHES</span>
                <span className="data-val">{pad2(matchCount)} / {pad2(MAX_MATCHES_PER_DAY)}</span>
              </div>

              <div className="data-row">
                <span className="data-key">{'>'} REMAINING_QUOTA</span>
                <span className="data-val">{pad2(remainingQuota)}</span>
              </div>

              {statusInfo?.locked && (
                <div className="locked-bar">
                  <AlertTriangle size={14} />
                  <span>QUOTA_EXHAUSTED // 24H_COOLDOWN</span>
                </div>
              )}

              <div className="menu-sep" />

              <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button">
                <span className="cyber-btn-icon"><ArrowLeft size={16} /></span>
                <span className="cyber-btn-bracket">[</span>
                <span className="cyber-btn-label">RETURN_TO_MENU</span>
                <span className="cyber-btn-bracket">]</span>
              </button>
            </div>
          </div>
        )}

        {/* ============ プレイ画面 ============ */}
        {viewState === 'playing' && phase === 'waiting' && (
          <div className="overlay overlay--passive">
            <p className="overlay-msg">{'>>'} READY {'<<'}</p>
            <p className="overlay-round">ROUND {pad2(roundIdx + 1)} / {pad2(ROUNDS_PER_MATCH)}</p>
          </div>
        )}

        {/* ★ Phase16.1 追記4: pre_okori（無の間）は意図的に何も表示しない */}
        {/* 画面静寂を演出するため、剣士のシルエットのみ静かに佇む */}

        {viewState === 'playing' && phase === 'okori' && (
          <div className="overlay overlay--passive overlay--okori">
            <p className="overlay-okori-msg">─!─</p>
          </div>
        )}

        {phase === 'submitting' && (
          <div className="overlay">
            <div className="console-box">
              <div className="console-prompt">
                <Terminal size={14} />
                <span>UPLOADING</span>
              </div>
              <div className="loading-row">
                <Loader2 size={20} className="animate-spin" />
                <span className="loading-text">SAVING_RESULT<span className="dots">...</span></span>
              </div>
            </div>
          </div>
        )}

        {phase === 'matchEnd' && viewState === 'playing' && (
          <div className="overlay">
            <div className="console-box console-box--result">
              <div className="kanji-watermark" aria-hidden="true">結果</div>

              <div className="console-prompt">
                <Terminal size={14} />
                <span>MATCH_RESULT</span>
              </div>

              <h2 className="result-title">MATCH_END</h2>

              <div className={`rank-display rank-${overallRank}`}>
                <span className="rank-label">FINAL_RANK</span>
                <span className="rank-value">{overallRank}</span>
              </div>

              <div className="data-row">
                <span className="data-key">{'>'} SUCCESS</span>
                <span className="data-val">{successCount} / {ROUNDS_PER_MATCH}</span>
              </div>
              <div className="data-row">
                <span className="data-key">{'>'} AVG_REACTION</span>
                <span className="data-val">{formatTime(averageReaction)}</span>
              </div>

              {lastSaveResult && (
                <div className="data-row data-row--xp">
                  <span className="data-key">{'>'} XP_EARNED</span>
                  <span className="data-val xp-val">+{lastSaveResult.earnedXp}</span>
                </div>
              )}
              {!lastSaveResult && errorMessage && (
                <p className="summary-error">// SAVE_FAILED: {errorMessage}</p>
              )}

              <div className="summary-rounds">
                {results.map((r, i) => (
                  <div key={i} className={`summary-round ${r.success ? 'ok' : 'ng'}`}>
                    <span>#{i + 1}</span>
                    <span className="round-name">{r.success ? r.cutinText.replace('!', '').replace('...', '') : r.failLabel}</span>
                    <span className={`summary-rank rank-${r.rank}-tag`}>{r.rank}</span>
                    <span>{formatTime(r.reactionMs)}</span>
                  </div>
                ))}
              </div>

              {matchCount < MAX_MATCHES_PER_DAY ? (
                <>
                  <button className="cyber-btn cyber-btn--primary" onClick={startMatch} type="button">
                    <span className="cyber-btn-icon"><Swords size={16} /></span>
                    <span className="cyber-btn-bracket">[</span>
                    <span className="cyber-btn-label">NEXT_MATCH ({pad2(matchCount)}/{pad2(MAX_MATCHES_PER_DAY)})</span>
                    <span className="cyber-btn-bracket">]</span>
                  </button>
                  <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button">
                    <span className="cyber-btn-bracket">[</span>
                    <span className="cyber-btn-label">RETURN_TO_MENU</span>
                    <span className="cyber-btn-bracket">]</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="locked-bar">
                    <AlertTriangle size={14} />
                    <span>QUOTA_EXHAUSTED</span>
                  </div>
                  <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button">
                    <span className="cyber-btn-bracket">[</span>
                    <span className="cyber-btn-label">RETURN_TO_MENU</span>
                    <span className="cyber-btn-bracket">]</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {phase === 'locked' && viewState === 'playing' && (
          <div className="overlay">
            <div className="console-box console-box--error">
              <div className="console-prompt console-prompt--error">
                <AlertTriangle size={14} />
                <span>QUOTA_EXHAUSTED</span>
              </div>
              <h2 className="result-title">DAILY_LIMIT</h2>
              <p className="console-msg">MAX_3_MATCHES_PER_DAY // 24H_COOLDOWN</p>
              {bestTimeMs !== null && (
                <div className="data-row" style={{ marginTop: 12 }}>
                  <span className="data-key">{'>'} BEST_REACTION</span>
                  <span className="data-val"><Trophy size={14} /> {formatTime(bestTimeMs)}</span>
                </div>
              )}
              <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button" style={{ marginTop: 14 }}>
                <span className="cyber-btn-bracket">[</span>
                <span className="cyber-btn-label">RETURN_TO_MENU</span>
                <span className="cyber-btn-bracket">]</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================
          ★ styled-jsx: 配色をインディゴ×和風ゴールドに統合
          基調色:
            #0f0c29 (深い夜空)
            #1e1b4b (インディゴ・アプリ基調)
            #2d2862 (やや明るいインディゴ)
            #d4af37 (和風ゴールド・アクセント)
            #fbbf24 (明るい金・ハイライト)
            #e8e4ff (淡い藤色・テキスト)
            #b8b3e8 (落ち着いた藤色・サブテキスト)
      =================================================================== */}
      <style jsx>{`
        .mikiri-root {
          position: fixed; inset: 0;
          background: #0f0c29;
          color: #e8e4ff;
          overflow: hidden;
          font-family: 'JetBrains Mono', 'Courier New', 'Noto Sans JP', monospace;
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
            linear-gradient(rgba(212, 175, 55, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(212, 175, 55, 0.04) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);
        }
        .mikiri-scan {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, transparent 0%, rgba(212, 175, 55, 0.03) 50%, transparent 100%);
          background-size: 100% 8px;
          animation: scanMove 6s linear infinite;
          opacity: 0.6;
        }
        @keyframes scanMove {
          from { background-position: 0 0; }
          to   { background-position: 0 100%; }
        }

        /* ===== ヘッダー ===== */
        .mikiri-header {
          position: relative; z-index: 2;
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px 10px;
          border-bottom: 1px solid rgba(212, 175, 55, 0.22);
          backdrop-filter: blur(6px);
          background: rgba(15, 12, 41, 0.55);
        }
        .mikiri-back {
          color: #d4af37; padding: 6px;
          background: transparent; border: 1px solid rgba(212, 175, 55, 0.25);
          cursor: pointer; transition: all 0.2s;
          display: inline-flex; align-items: center;
          border-radius: 0;
        }
        .mikiri-back:hover {
          background: rgba(212, 175, 55, 0.1);
          border-color: #d4af37;
          box-shadow: 0 0 12px rgba(212, 175, 55, 0.4);
        }
        .mikiri-title { text-align: center; line-height: 1; margin: 0; }
        .mikiri-title-main {
          display: block;
          font-size: 13px; font-weight: 300;
          letter-spacing: 0.32em;
          color: #e8e4ff;
          text-shadow: 0 0 12px rgba(212, 175, 55, 0.5);
          font-family: 'JetBrains Mono', 'Courier New', monospace;
        }
        .mikiri-title-sub {
          display: block; font-size: 9px;
          letter-spacing: 0.4em;
          color: #b8b3e8; margin-top: 5px;
          opacity: 0.75;
        }
        .mikiri-counter {
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          font-size: 13px;
          color: #d4af37;
          background: rgba(212, 175, 55, 0.06);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 0;
          padding: 4px 12px;
          letter-spacing: 0.1em;
        }
        .counter-num { color: #fbbf24; font-weight: 600; }
        .counter-sep { color: #6b6498; margin: 0 3px; }
        .counter-max { color: #b8b3e8; }

        .mikiri-stage {
          position: relative; z-index: 1; flex: 1;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .kenshi-wrap {
          position: relative;
          width: min(80vw, 360px);
          aspect-ratio: 3 / 5;
          transform-origin: center center;
          filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0.35));
        }

        /* =====================================================================
           ★ Phase16.1 追記2: okori 予備動作アニメ
        ===================================================================== */
        :global(.kenshi-wrap.anim-okori) {
          animation: kenshiOkori 0.7s cubic-bezier(0.55, 0, 0.6, 0.7) forwards;
        }
        @keyframes kenshiOkori {
          0% {
            transform: translateY(0) scale(1);
            filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0.35));
          }
          40% {
            transform: translateY(1.5px) scale(1.005);
            filter: drop-shadow(0 0 14px rgba(255, 140, 100, 0.4));
          }
          100% {
            transform: translateY(3px) scale(1.015);
            filter: drop-shadow(0 0 18px rgba(255, 100, 80, 0.55));
          }
        }
        :global(.kenshi-wrap.anim-okori .sword) {
          animation: swordOkori 0.7s cubic-bezier(0.55, 0, 0.6, 0.7) forwards;
        }
        @keyframes swordOkori {
          0% {
            transform: translateY(0) scale(1);
          }
          100% {
            transform: translateY(-2px) scale(1.02);
          }
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
          background: radial-gradient(ellipse at center, rgba(15, 12, 41, 0.55) 0%, rgba(15, 12, 41, 0.85) 100%);
          backdrop-filter: blur(3px);
          padding: 16px;
        }
        .overlay--passive {
          background: transparent; backdrop-filter: none; pointer-events: none;
        }
        .overlay--okori {
          background: radial-gradient(ellipse at center, rgba(120, 30, 30, 0.18) 0%, transparent 70%);
        }
        .overlay-msg {
          font-size: 16px; letter-spacing: 0.3em; color: #d4af37; margin: 0;
          text-shadow: 0 0 8px rgba(212, 175, 55, 0.5);
          font-family: 'JetBrains Mono', monospace;
        }
        .overlay-round {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px; color: #b8b3e8; margin: 0;
          letter-spacing: 0.2em;
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

        /* =====================================================================
           ★ サイバーコンソールボックス（インディゴガラス）
        ====================================================================== */
        .console-box {
          position: relative;
          background:
            linear-gradient(135deg, rgba(30, 27, 75, 0.78) 0%, rgba(15, 12, 41, 0.88) 100%);
          border: 1px solid rgba(212, 175, 55, 0.28);
          padding: 24px 26px;
          width: min(92vw, 420px);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow:
            0 0 40px rgba(212, 175, 55, 0.12),
            0 0 80px rgba(30, 27, 75, 0.4),
            inset 0 0 60px rgba(45, 40, 98, 0.2),
            inset 0 1px 0 rgba(232, 228, 255, 0.06);
          overflow: hidden;
        }
        .console-box::before,
        .console-box::after {
          content: '';
          position: absolute;
          width: 14px; height: 14px;
          border: 1px solid #d4af37;
          opacity: 0.85;
        }
        .console-box::before {
          top: -1px; left: -1px;
          border-right: none; border-bottom: none;
        }
        .console-box::after {
          bottom: -1px; right: -1px;
          border-left: none; border-top: none;
        }

        .console-box--menu, .console-box--records, .console-box--result {
          min-width: 300px;
        }
        .console-box--error {
          border-color: rgba(220, 110, 110, 0.45);
          box-shadow:
            0 0 40px rgba(220, 80, 80, 0.18),
            inset 0 0 60px rgba(120, 30, 30, 0.08);
        }
        .console-box--error::before, .console-box--error::after {
          border-color: #e89090;
        }

        .kanji-watermark {
          position: absolute;
          right: -10px;
          bottom: -30px;
          font-size: 140px;
          font-weight: 900;
          color: rgba(212, 175, 55, 0.06);
          letter-spacing: -0.05em;
          line-height: 0.85;
          font-family: 'Noto Sans JP', serif;
          pointer-events: none;
          user-select: none;
          writing-mode: vertical-rl;
        }

        .console-prompt {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #d4af37;
          letter-spacing: 0.2em;
          padding: 3px 8px;
          background: rgba(212, 175, 55, 0.08);
          border-left: 2px solid #d4af37;
          margin-bottom: 14px;
          text-transform: uppercase;
        }
        .console-prompt--error {
          color: #e89090;
          background: rgba(220, 110, 110, 0.08);
          border-left-color: #e89090;
        }
        .prompt-blink {
          color: #d4af37;
          animation: cursorBlink 1s step-end infinite;
        }
        @keyframes cursorBlink {
          50% { opacity: 0; }
        }

        /* ===== タイポグラフィ ===== */
        .menu-header {
          margin: 4px 0 18px;
          position: relative; z-index: 1;
        }
        .menu-header--records { margin-bottom: 14px; }
        .menu-title-en {
          display: block;
          margin: 0;
          font-size: clamp(28px, 7vw, 38px);
          font-weight: 200;
          letter-spacing: 0.08em;
          color: #e8e4ff;
          line-height: 1;
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          text-shadow: 0 0 16px rgba(212, 175, 55, 0.2);
        }
        .menu-title-en--accent {
          color: #fbbf24;
          text-shadow:
            0 0 16px rgba(251, 191, 36, 0.5),
            0 0 32px rgba(212, 175, 55, 0.3);
          margin-top: 2px;
          font-weight: 400;
        }
        .menu-title-jp {
          margin: 8px 0 0;
          font-size: 11px;
          letter-spacing: 0.6em;
          color: #b8b3e8;
          opacity: 0.75;
          font-family: 'Noto Sans JP', sans-serif;
        }

        .menu-sep {
          height: 1px;
          background: linear-gradient(90deg,
            transparent,
            rgba(212, 175, 55, 0.45) 20%,
            rgba(212, 175, 55, 0.45) 80%,
            transparent);
          margin: 14px 0 16px;
          position: relative; z-index: 1;
        }

        .menu-stat-line {
          margin-top: 16px;
          padding: 8px 10px;
          background: rgba(45, 40, 98, 0.5);
          border-left: 2px solid #b8b3e8;
          display: flex; align-items: center; gap: 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.15em;
          position: relative; z-index: 1;
        }
        .stat-key { color: #b8b3e8; }
        .stat-sep { color: #6b6498; }
        .stat-val { color: #fbbf24; font-weight: 600; }

        .menu-locked {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          color: #ffb04a;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.15em;
          padding: 12px;
          background: rgba(255, 176, 74, 0.07);
          border: 1px solid rgba(255, 176, 74, 0.3);
          border-left: 3px solid #ffb04a;
          margin: 4px 0;
          position: relative; z-index: 1;
        }

        /* ===== データ行 ===== */
        .data-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 10px;
          margin: 4px 0;
          background: rgba(45, 40, 98, 0.4);
          border-left: 2px solid rgba(212, 175, 55, 0.45);
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.1em;
          position: relative; z-index: 1;
          transition: all 0.2s;
        }
        .data-row:hover {
          background: rgba(60, 53, 130, 0.5);
          border-left-color: #d4af37;
        }
        .data-key {
          color: #d4af37;
        }
        .data-val {
          display: inline-flex; align-items: center; gap: 6px;
          color: #fff; font-weight: 600;
        }
        .data-row--xp {
          background: rgba(251, 191, 36, 0.08);
          border-left-color: #fbbf24;
          margin-top: 10px;
        }
        .data-row--xp .data-key { color: #fbbf24; }
        .xp-val {
          color: #fbbf24 !important;
          font-size: 18px !important;
          text-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
        }

        .locked-bar {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin: 12px 0 0; padding: 8px 12px;
          color: #ffb04a;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; letter-spacing: 0.2em;
          background: rgba(255, 176, 74, 0.07);
          border: 1px solid rgba(255, 176, 74, 0.3);
          border-left: 3px solid #ffb04a;
        }

        /* =====================================================================
           ★ サイバーボタン（インディゴ×ゴールド版）
        ====================================================================== */
        .cyber-btn {
          position: relative;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%;
          padding: 14px 18px;
          background: rgba(45, 40, 98, 0.55);
          color: #d4af37;
          border: 1px solid rgba(212, 175, 55, 0.35);
          border-radius: 0;
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.18em;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.4, 1);
          margin-top: 8px;
          overflow: hidden;
          text-transform: uppercase;
          z-index: 1;
        }

        .cyber-btn::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 0;
          background: linear-gradient(180deg, #fbbf24, #d4af37);
          transition: width 0.25s cubic-bezier(0.2, 0.8, 0.4, 1);
          z-index: -1;
          box-shadow: 0 0 20px rgba(212, 175, 55, 0.6);
        }

        .cyber-btn::after {
          content: '';
          position: absolute;
          right: 0; top: 0; bottom: 0;
          width: 1px;
          background: rgba(212, 175, 55, 0.4);
          transition: all 0.25s;
        }

        .cyber-btn:hover {
          color: #fff;
          border-color: #fbbf24;
          background: rgba(60, 53, 130, 0.55);
          padding-left: 28px;
          box-shadow:
            0 0 20px rgba(212, 175, 55, 0.3),
            inset 0 0 20px rgba(212, 175, 55, 0.06);
        }
        .cyber-btn:hover::before {
          width: 6px;
        }
        .cyber-btn:hover::after {
          width: 3px;
          background: #fbbf24;
          box-shadow: 0 0 12px #fbbf24;
        }
        .cyber-btn:active {
          transform: translateX(2px);
        }
        .cyber-btn:disabled {
          background: rgba(40, 40, 50, 0.4);
          color: #555;
          border-color: rgba(80, 80, 90, 0.4);
          cursor: not-allowed;
          opacity: 0.45;
        }
        .cyber-btn:disabled:hover {
          padding-left: 18px;
          box-shadow: none;
        }
        .cyber-btn:disabled::before { width: 0; }

        .cyber-btn--primary {
          background: linear-gradient(135deg, rgba(45, 40, 98, 0.7), rgba(60, 53, 130, 0.65));
          color: #fbbf24;
          border-color: rgba(251, 191, 36, 0.5);
          box-shadow: 0 0 16px rgba(212, 175, 55, 0.15);
        }
        .cyber-btn--primary::before {
          background: linear-gradient(180deg, #fbbf24, #d4af37);
        }
        .cyber-btn--primary:hover {
          color: #fff;
          background: linear-gradient(135deg, rgba(60, 53, 130, 0.75), rgba(75, 65, 160, 0.7));
          border-color: #fbbf24;
        }

        .cyber-btn--secondary {
          background: rgba(30, 27, 75, 0.5);
          color: #b8b3e8;
          border-color: rgba(184, 179, 232, 0.35);
        }
        .cyber-btn--secondary::before {
          background: linear-gradient(180deg, #b8b3e8, #8a82c8);
        }
        .cyber-btn--secondary:hover {
          color: #fff;
          border-color: #b8b3e8;
        }

        .cyber-btn--danger {
          color: #e89090;
          border-color: rgba(220, 110, 110, 0.45);
        }
        .cyber-btn--danger::before {
          background: linear-gradient(180deg, #ff7070, #d04040);
        }
        .cyber-btn--danger:hover {
          color: #fff;
          border-color: #e89090;
          background: rgba(120, 35, 35, 0.45);
        }

        .cyber-btn-bracket {
          color: rgba(212, 175, 55, 0.5);
          font-weight: 300;
        }
        .cyber-btn--primary .cyber-btn-bracket {
          color: rgba(251, 191, 36, 0.65);
        }
        .cyber-btn--secondary .cyber-btn-bracket {
          color: rgba(184, 179, 232, 0.5);
        }
        .cyber-btn--danger .cyber-btn-bracket {
          color: rgba(232, 144, 144, 0.65);
        }
        .cyber-btn-label {
          flex-shrink: 0;
        }
        .cyber-btn-icon {
          display: inline-flex; align-items: center;
          margin-right: 4px;
        }

        /* ===== ローディング ===== */
        .loading-row {
          display: flex; align-items: center; gap: 12px;
          color: #d4af37;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.2em;
          padding: 8px 0;
        }
        .loading-text { color: #fbbf24; }
        .dots {
          display: inline-block;
          animation: dotsBlink 1.4s steps(4, end) infinite;
          width: 1.5em; text-align: left;
        }
        @keyframes dotsBlink {
          0%, 20%   { content: ''; }
          40%       { content: '.'; }
          60%       { content: '..'; }
          80%, 100% { content: '...'; }
        }

        .console-msg {
          color: #b8b3e8;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.1em;
          margin: 8px 0 14px;
          line-height: 1.6;
        }

        /* ===== カットイン ===== */
        .cutin {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          z-index: 10; pointer-events: none;
        }
        .cutin-text {
          font-size: clamp(40px, 11vw, 80px);
          font-weight: 900;
          font-family: 'JetBrains Mono', 'Noto Sans JP', sans-serif;
          letter-spacing: 0.05em;
          padding: 0 12px;
          animation: cutinAppear 1.5s cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
          transform-origin: center center;
        }
        .cutin-S .cutin-text {
          color: #fbbf24;
          text-shadow:
            0 0 24px #fbbf24, 0 0 48px #d4af37,
            4px 4px 0 #1e1b4b, -2px -2px 0 #1e1b4b, 2px -2px 0 #1e1b4b, -2px 2px 0 #1e1b4b;
        }
        .cutin-A .cutin-text {
          color: #d4af37;
          text-shadow:
            0 0 24px #d4af37, 0 0 48px #a37e1f,
            4px 4px 0 #1e1b4b, -2px -2px 0 #1e1b4b, 2px -2px 0 #1e1b4b, -2px 2px 0 #1e1b4b;
        }
        .cutin-B .cutin-text, .cutin-C .cutin-text {
          color: #e8e4ff;
          text-shadow:
            0 0 16px #b8b3e8,
            3px 3px 0 #1e1b4b, -2px -2px 0 #1e1b4b, 2px -2px 0 #1e1b4b, -2px 2px 0 #1e1b4b;
        }
        .cutin-F .cutin-text {
          color: #ff7070;
          text-shadow:
            0 0 16px #d04040,
            3px 3px 0 #1e1b4b, -2px -2px 0 #1e1b4b, 2px -2px 0 #1e1b4b, -2px 2px 0 #1e1b4b;
        }
        @keyframes cutinAppear {
          0%   { transform: scale(0.2) rotate(-8deg); opacity: 0; letter-spacing: 0.5em; }
          15%  { transform: scale(1.4) rotate(-4deg); opacity: 1; letter-spacing: 0.05em; }
          30%  { transform: scale(1.0) rotate(-2deg); }
          70%  { transform: scale(1.0) rotate(-2deg); opacity: 1; }
          100% { transform: scale(1.1) rotate(-2deg); opacity: 0; }
        }

        /* ===== 斬撃エフェクト（金色） ===== */
        .slash-fx {
          position: absolute; inset: -20%;
          z-index: 8; pointer-events: none;
          background: linear-gradient(115deg,
            transparent 30%,
            rgba(255, 255, 255, 0) 38%,
            rgba(255, 248, 220, 0.95) 49%,
            rgba(251, 191, 36, 0.9) 50%,
            rgba(255, 248, 220, 0.95) 51%,
            rgba(255, 255, 255, 0) 62%,
            transparent 70%);
          background-size: 300% 300%;
          background-position: 100% 0%;
          animation: slashSweep 0.5s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
        }
        @keyframes slashSweep {
          0%   { background-position: 120% -20%; opacity: 0; }
          10%  { opacity: 1; }
          100% { background-position: -20% 120%; opacity: 0; }
        }

        /* ===== フラッシュ ===== */
        .flash-success {
          position: absolute; inset: 0;
          background: radial-gradient(circle, rgba(251, 191, 36, 0.5) 0%, transparent 70%);
          animation: flashGold 0.4s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashGold { 0% { opacity: 1; } 100% { opacity: 0; } }
        .flash-fail {
          position: absolute; inset: 0;
          background: rgba(220, 60, 60, 0.32);
          animation: flashRed 0.5s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashRed {
          0%   { opacity: 1; } 100% { opacity: 0; }
        }
        .flash-okori {
          position: absolute; inset: 0;
          background: radial-gradient(circle at center, rgba(255, 100, 80, 0.18) 0%, transparent 60%);
          animation: flashOkori 0.18s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashOkori {
          0%   { opacity: 1; } 100% { opacity: 0; }
        }

        /* ===== 試合終了サマリー ===== */
        .result-title {
          margin: 0 0 14px;
          font-size: 22px;
          letter-spacing: 0.32em;
          color: #fff;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 300;
          text-align: center;
          text-shadow: 0 0 16px rgba(212, 175, 55, 0.5);
          position: relative; z-index: 1;
        }

        .rank-display {
          display: flex; align-items: baseline; justify-content: center; gap: 14px;
          margin: 10px 0 16px;
          padding: 14px 12px;
          border: 1px solid;
          animation: rankPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative; z-index: 1;
        }
        @keyframes rankPop {
          0% { transform: scale(0.3); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .rank-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; letter-spacing: 0.4em;
          color: #d4af37; opacity: 0.8;
        }
        .rank-value {
          font-size: 56px; font-weight: 900;
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          line-height: 1;
        }
        .rank-S {
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.18), rgba(212, 175, 55, 0.12));
          border-color: #fbbf24;
        }
        .rank-S .rank-value {
          color: #fbbf24;
          text-shadow: 0 0 24px #fbbf24, 0 0 48px #d4af37;
        }
        .rank-A {
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(184, 179, 232, 0.12));
          border-color: #d4af37;
        }
        .rank-A .rank-value {
          color: #d4af37;
          text-shadow: 0 0 20px #d4af37;
        }
        .rank-B {
          background: rgba(184, 179, 232, 0.08);
          border-color: #b8b3e8;
        }
        .rank-B .rank-value {
          color: #e8e4ff;
          text-shadow: 0 0 16px #b8b3e8;
        }
        .rank-C {
          background: rgba(184, 179, 232, 0.04);
          border-color: #6b6498;
        }
        .rank-C .rank-value { color: #b8b3e8; }
        .rank-F {
          background: rgba(220, 80, 80, 0.06);
          border-color: #e89090;
        }
        .rank-F .rank-value { color: #ff7070; }

        .summary-error {
          font-size: 10px; color: #e89090;
          margin: 8px 0 0;
          padding: 6px 8px;
          background: rgba(220, 80, 80, 0.08);
          border-left: 2px solid #e89090;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.05em;
        }

        .summary-rounds {
          margin: 14px 0;
          border-top: 1px solid rgba(212, 175, 55, 0.22);
          border-bottom: 1px solid rgba(212, 175, 55, 0.22);
          padding: 8px 0;
          position: relative; z-index: 1;
        }
        .summary-round {
          display: grid;
          grid-template-columns: 30px 1fr 32px 70px;
          gap: 8px;
          font-size: 11px;
          padding: 5px 4px;
          font-family: 'JetBrains Mono', monospace;
          align-items: center;
          letter-spacing: 0.05em;
        }
        .summary-round.ok { color: #d4af37; }
        .summary-round.ng { color: #e89090; }
        .summary-round span:last-child { text-align: right; }
        .round-name {
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.05em;
          font-size: 11px;
        }
        .summary-rank {
          font-size: 10px !important; padding: 2px 4px !important;
          font-weight: 900; text-align: center;
          font-family: 'JetBrains Mono', monospace;
        }

        .rank-S-tag { background: #fbbf24; color: #1e1b4b; box-shadow: 0 0 8px #fbbf24; }
        .rank-A-tag { background: #d4af37; color: #1e1b4b; }
        .rank-B-tag { background: #b8b3e8; color: #1e1b4b; }
        .rank-C-tag { background: #6b6498; color: #fff; }
        .rank-F-tag { background: #e89090; color: #1e1b4b; }
      `}</style>
    </div>
  );
}

// =====================================================================
// 仮想剣士 SVG（無変更）
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

  const getColors = (part: HitPart) => {
    const isTarget = glowPart === part;
    if (!isTarget || intensity === null) {
      return {
        stroke: '#d4af37',
        fill: 'rgba(60, 50, 100, 0.18)',
        filter: 'url(#goldGlow)',
      };
    }
    if (intensity === 'okori') {
      return {
        stroke: '#ff8866',
        fill: 'rgba(180, 60, 40, 0.18)',
        filter: 'url(#redGlow)',
      };
    }
    return {
      stroke: '#ff3030',
      fill: 'rgba(200, 30, 30, 0.32)',
      filter: 'url(#redGlow)',
    };
  };

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
        <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
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

      <g pointerEvents="none">
        <g stroke="#6b6498" strokeWidth="0.4" fill="none" opacity="0.55">
          <line x1="150" y1="20" x2="150" y2="490" strokeDasharray="2 4" />
          <line x1="20" y1="100" x2="280" y2="100" strokeDasharray="1 3" />
          <line x1="20" y1="280" x2="280" y2="280" strokeDasharray="1 3" />
          <line x1="20" y1="340" x2="280" y2="340" strokeDasharray="1 3" />
          <line x1="20" y1="460" x2="150" y2="86" strokeDasharray="1 6" opacity="0.35" />
          <line x1="280" y1="460" x2="150" y2="86" strokeDasharray="1 6" opacity="0.35" />
        </g>
        <g color="#d4af37" opacity="0.65">
          <use href="#bracket-tl" x="20" y="30" width="22" height="22" />
          <use href="#bracket-tr" x="258" y="30" width="22" height="22" />
          <use href="#bracket-bl" x="20" y="448" width="22" height="22" />
          <use href="#bracket-br" x="258" y="448" width="22" height="22" />
        </g>
        <g fill="#a37e1f" fontFamily="JetBrains Mono, Courier New, monospace" fontSize="7" opacity="0.7">
          <text x="26" y="44">TGT-LOCK</text>
          <text x="232" y="44">v.17.0</text>
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
          <text x="196" y="92" fill="#a37e1f" fontFamily="JetBrains Mono, Courier New, monospace" fontSize="6" opacity="0.85">[MEN]</text>
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
          <text x="44" y="420" fill="#a37e1f" fontFamily="JetBrains Mono, Courier New, monospace" fontSize="7" opacity="0.85">[KOTE]</text>
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
          <text x="218" y="335" fill="#a37e1f" fontFamily="JetBrains Mono, Courier New, monospace" fontSize="6" opacity="0.85">[DO]</text>
        </g>
      </g>

      {/* 竹刀（金色グロウ） */}
      <g className="sword" filter="url(#goldGlow)" pointerEvents="none">
        <polygon points="143,92 157,92 152.5,322 147.5,322" stroke="#fbbf24" strokeWidth="1.3" fill="rgba(251, 191, 36, 0.20)" strokeLinejoin="miter" />
        <line x1="150" y1="92" x2="150" y2="322" stroke="#fff8dc" strokeWidth="0.5" opacity="0.85" />
        <polygon points="146,92 149,92 151,322 150,322" fill="rgba(255, 248, 220, 0.4)" opacity="0.7" />
        <polygon points="145,318 155,318 158,322 155,326 145,326 142,322" stroke="#d4af37" strokeWidth="1.1" fill="rgba(212, 175, 55, 0.30)" />
        <polygon points="148,326 152,326 151,388 149,388" stroke="#d4af37" strokeWidth="1" fill="rgba(212, 175, 55, 0.22)" />
        <g stroke="#fbbf24" strokeWidth="0.4" opacity="0.55">
          <line x1="148.5" y1="345" x2="151.5" y2="345" />
          <line x1="148.7" y1="360" x2="151.3" y2="360" />
          <line x1="148.9" y1="375" x2="151.1" y2="375" />
        </g>
        <polygon points="149,388 151,388 150.5,394 149.5,394" stroke="#d4af37" strokeWidth="0.8" fill="rgba(212, 175, 55, 0.30)" />
        <polygon points="150,72 162,94 138,94" fill="#fff8dc" stroke="#fbbf24" strokeWidth="0.9" filter="url(#tipGlow)" />
        <circle cx="150" cy="86" r="5" fill="#ffffff" opacity="0.95" filter="url(#tipGlow)" />
        <circle cx="150" cy="86" r="2.5" fill="#ffffff" />
        <circle cx="150" cy="86" r="11" stroke="#fbbf24" strokeWidth="0.5" fill="none" strokeDasharray="2 2" opacity="0.65" />
        <circle cx="150" cy="86" r="17" stroke="#a37e1f" strokeWidth="0.4" fill="none" opacity="0.5" />
        <circle cx="150" cy="86" r="24" stroke="#a37e1f" strokeWidth="0.3" fill="none" opacity="0.35" strokeDasharray="3 4" />
      </g>

      <g pointerEvents="none" stroke="#6b6498" strokeWidth="0.5" fill="none" opacity="0.5" filter="url(#thinGlow)">
        <circle cx="150" cy="250" r="3" />
        <line x1="140" y1="250" x2="146" y2="250" />
        <line x1="154" y1="250" x2="160" y2="250" />
        <line x1="150" y1="240" x2="150" y2="246" />
        <line x1="150" y1="254" x2="150" y2="260" />
      </g>
    </svg>
  );
}
