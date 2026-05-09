// src/lib/mastery.ts
// =====================================================================
// 百錬自得 - 免許皆伝（Mastery）判定ロジック ★ Phase11 新規
//
// 【設計方針】
//   - フロントエンド完結型: DashboardData.logs から動的計算
//   - DB変更ゼロ: GAS / Sheets には一切手を入れない
//   - 純粋関数: 同じ入力に対し常に同じ結果を返す（冪等性）
//
// 【計算フロー】
//   1. 対象 task_id の logs を日付昇順で抽出
//   2. 直近10件で安定率（stability）を算出
//   3. 直近5件で「見極め」昇格判定（80%以上 かつ 4回以上が★4-5）
//   4. 見極め状態中は、最新側から「3連続★4-5」かどうかを breakthroughCount で判定
//      ★3以下が混ざったら -1 減算（下限0）
//   5. breakthroughCount >= 3 で免許皆伝
//
// 【ゆらぎ許容ロジック詳細】
//   見極め状態に入った時点を「起点」とし、その時点以降のログを古→新で順に走査。
//   ★4-5 → breakthroughCount += 1（上限3）
//   ★1-3 → breakthroughCount -= 1（下限0）
//   3に到達した時点で mastered とし、それ以降のスコアでは降格しない（一度の皆伝は永続）
//
// 【currentStreak（コンボ）】
//   最新側から遡って★4-5が何回連続しているかを返す。
//   training 状態のコンボ演出に使用。
// =====================================================================

import type { LogEntry, MasteryStatus, MasteryPhase } from '@/types';

// ---------------------------------------------------------------------
// 定数（チューニング対象）
// ---------------------------------------------------------------------

/** 安定率の算出に使う直近件数 */
export const STABILITY_WINDOW = 10;

/** 「見極め」昇格判定に使う直近件数 */
export const DISCERN_WINDOW = 5;

/** 「見極め」昇格に必要な安定率（%） */
export const DISCERN_STABILITY_THRESHOLD = 80;

/** 「見極め」昇格に必要な ★4-5 の最小回数（DISCERN_WINDOW 中） */
export const DISCERN_HIGH_SCORE_MIN = 4;

/** 高評価とみなすスコアの下限 */
export const HIGH_SCORE_THRESHOLD = 4;

/** 免許皆伝に必要な breakthroughCount */
export const MASTERY_REQUIRED_COUNT = 3;

/** 「見極めが近い」演出の安定率レンジ */
export const NEAR_DISCERN_MIN = 70;
export const NEAR_DISCERN_MAX = 79;

/** コンボ表示の最小値 */
export const COMBO_DISPLAY_MIN = 2;

// ---------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------

/**
 * task_id（item_name）に紐づくログを日付昇順で抽出する。
 *
 * Phase4 正規化により、フロントが受け取る LogEntry は
 * task_id ではなく item_name に JOIN 済み。
 * 課題テキストでフィルタするため、task_text を引数に取る。
 */
function filterLogsByTaskText(logs: LogEntry[], taskText: string): LogEntry[] {
  return logs
    .filter(l => l.item_name === taskText)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * スコア配列から安定率（0〜100）を計算する。
 * 件数 0 の場合は 0 を返す。
 */
function calcStability(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / (scores.length * 5)) * 100);
}

/**
 * スコア配列のうち、HIGH_SCORE_THRESHOLD 以上の件数を返す。
 */
function countHighScores(scores: number[]): number {
  return scores.filter(s => s >= HIGH_SCORE_THRESHOLD).length;
}

/**
 * 最新側から遡って★4-5が何回連続しているかを返す。
 * 古→新の配列を渡すこと。
 */
function calcCurrentStreak(scores: number[]): number {
  let streak = 0;
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i] >= HIGH_SCORE_THRESHOLD) streak++;
    else break;
  }
  return streak;
}

/**
 * 見極め昇格の起点インデックス（古→新の配列上）を見つける。
 *
 * 走査は古→新で進め、
 * 「直近 DISCERN_WINDOW 件の安定率が DISCERN_STABILITY_THRESHOLD 以上」
 * かつ
 * 「直近 DISCERN_WINDOW 件のうち ★4-5 が DISCERN_HIGH_SCORE_MIN 件以上」
 * を満たす最初のインデックスを返す。見つからなければ -1。
 *
 * ※「降格条件は維持しない（一度発火した見極めは維持）」要件のため、
 *   一度起点が見つかったら、その後のスコア悪化では降格しない。
 */
function findDiscernStartIndex(scores: number[]): number {
  for (let i = DISCERN_WINDOW - 1; i < scores.length; i++) {
    const window = scores.slice(i - DISCERN_WINDOW + 1, i + 1);
    const stability = calcStability(window);
    const highCount = countHighScores(window);
    if (
      stability >= DISCERN_STABILITY_THRESHOLD &&
      highCount >= DISCERN_HIGH_SCORE_MIN
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * 見極め起点以降のスコア配列から breakthroughCount を計算する。
 *
 * ★4-5: count = min(MASTERY_REQUIRED_COUNT, count + 1)
 * ★1-3: count = max(0, count - 1)
 *
 * count が MASTERY_REQUIRED_COUNT に到達した時点で mastered フラグを立て、
 * それ以降のスコアでは更新しない（永続）。
 */
function calcBreakthroughProgress(scoresAfterDiscern: number[]): {
  breakthroughCount: number;
  isMastered:        boolean;
} {
  let count = 0;
  let mastered = false;

  for (const s of scoresAfterDiscern) {
    if (mastered) break;

    if (s >= HIGH_SCORE_THRESHOLD) {
      count = Math.min(MASTERY_REQUIRED_COUNT, count + 1);
      if (count >= MASTERY_REQUIRED_COUNT) {
        mastered = true;
      }
    } else {
      count = Math.max(0, count - 1);
    }
  }

  return {
    breakthroughCount: mastered ? MASTERY_REQUIRED_COUNT : count,
    isMastered:        mastered,
  };
}

// ---------------------------------------------------------------------
// メインAPI
// ---------------------------------------------------------------------

/**
 * 指定タスクの免許皆伝ステータスを計算する。
 *
 * @param logs     全ログ（DashboardData.logs）
 * @param taskText 対象タスクのテキスト（item_name でマッチング）
 * @returns        MasteryStatus
 */
export function calcMasteryStatus(
  logs:     LogEntry[],
  taskText: string,
): MasteryStatus {
  const taskLogs = filterLogsByTaskText(logs, taskText);
  const allScores = taskLogs.map(l => l.score);

  // 直近10件
  const recentScores = allScores.slice(-STABILITY_WINDOW);
  const stability    = calcStability(recentScores);
  const currentStreak = calcCurrentStreak(allScores);

  // 評価が0件の場合は完全に training 状態
  if (allScores.length === 0) {
    return {
      stability:         0,
      recentScores:      [],
      phase:             'training',
      breakthroughCount: 0,
      isMastered:        false,
      evalCount:         0,
      currentStreak:     0,
    };
  }

  // 見極め起点を探す
  const discernStartIdx = findDiscernStartIndex(allScores);

  // 起点が見つからない → training
  if (discernStartIdx < 0) {
    return {
      stability,
      recentScores,
      phase:             'training',
      breakthroughCount: 0,
      isMastered:        false,
      evalCount:         allScores.length,
      currentStreak,
    };
  }

  // 見極め起点以降のスコアで breakthroughCount を計算
  const scoresAfterDiscern = allScores.slice(discernStartIdx + 1);
  const { breakthroughCount, isMastered } = calcBreakthroughProgress(scoresAfterDiscern);

  const phase: MasteryPhase = isMastered ? 'mastered' : 'discerning';

  return {
    stability,
    recentScores,
    phase,
    breakthroughCount,
    isMastered,
    evalCount:     allScores.length,
    currentStreak,
  };
}

// ---------------------------------------------------------------------
// 新規皆伝検出（saveLog 前後の差分判定）
// ---------------------------------------------------------------------

/**
 * saveLog 前後のログを比較し、新規に皆伝に到達した課題テキストを返す。
 *
 * @param prevLogs    保存前のログ
 * @param nextLogs    保存後のログ
 * @param activeTaskTexts チェック対象のタスクテキスト一覧
 * @returns           新規皆伝到達タスクのテキスト配列
 */
export function detectNewlyMastered(
  prevLogs:         LogEntry[],
  nextLogs:         LogEntry[],
  activeTaskTexts:  string[],
): string[] {
  const newlyMastered: string[] = [];

  for (const taskText of activeTaskTexts) {
    const prevStatus = calcMasteryStatus(prevLogs, taskText);
    const nextStatus = calcMasteryStatus(nextLogs, taskText);
    if (!prevStatus.isMastered && nextStatus.isMastered) {
      newlyMastered.push(taskText);
    }
  }

  return newlyMastered;
}

// ---------------------------------------------------------------------
// 演出判定ヘルパー
// ---------------------------------------------------------------------

/**
 * 「見極めが近い」状態かを判定する。
 * 安定率が 70〜79% かつ currentStreak >= 2 の場合 true。
 * UI側で COMBO! テキストを熱色（オレンジ/ゴールド）に変える判定に使用。
 */
export function isNearDiscern(status: MasteryStatus): boolean {
  return (
    status.phase === 'training' &&
    status.stability >= NEAR_DISCERN_MIN &&
    status.stability <= NEAR_DISCERN_MAX &&
    status.currentStreak >= COMBO_DISPLAY_MIN
  );
}

/**
 * COMBO 表示が必要かを判定する。
 * training 状態かつ currentStreak >= 2 の場合 true。
 */
export function shouldShowCombo(status: MasteryStatus): boolean {
  return status.phase === 'training' && status.currentStreak >= COMBO_DISPLAY_MIN;
}
