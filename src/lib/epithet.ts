// =====================================================================
// 百錬自得 - 二つ名（Epithet）判定ロジック
// ★ Phase9: 称号システム刷新（3層構造・DBフラグ参照型レア度判定）
// ★ Phase9.1: epithetDescription を返却値に追加（由来のインライントグル表示用）
//
// 【3層構造】
//   Layer 1 - 二つ名:       EpithetMaster (styleCombo) の Name / Rarity / Description を取得
//   Layer 2 - 得意部位称号: 面・小手・胴・突きの累計ポイントに応じた称号
//   Layer 3 - レベル称号:   title_master から titleForLevel() で取得
//
// 【設計方針】
//   レア度の判定はコードで行わず、EpithetMaster の Rarity 列（N/R/SR）を
//   そのまま参照する「データ駆動型設計」を採用。
//   Description も同様にマスタから取得し、UIのトグル表示（由来説明）に使用する。
// =====================================================================

import type { Technique, EpithetMasterEntry, TitleMasterEntry } from '@/types';
import { titleForLevel } from '@/types';

// =====================================================================
// EpithetResult 型
// =====================================================================
export interface EpithetResult {
  /** 二つ名テキスト（例: "暴君"）。UI表示時はダブルクォーテーションで囲む */
  epithetName:       string;
  /**
   * マスタから取得したレア度フラグ。
   * UIの文字色判定に使用:
   *   N  → #2B2B2B（墨黒）
   *   R  → #2C4F7C（藍鉄色）
   *   SR → #8B2E2E（深紅）+ fontWeight:800 + letterSpacing:0.18em
   */
  epithetRarity:     'N' | 'R' | 'SR';
  /**
   * ★ Phase9.1: 二つ名の由来説明文。
   * EpithetMaster の Description 列から取得。
   * 未登録・一致なし・空文字列の場合のフォールバック: "まだ見ぬ剣の道を歩む者"
   * UI上でタップ時のインライントグル表示（由来説明）に使用する。
   */
  epithetDescription: string;
  /**
   * 得意打突部位称号（例: "小手一閃"）
   * 面・小手・胴・突きの累計ポイント最大部位 + しきい値サフィックス
   */
  favoritePartTitle: string;
  /** レベル称号（title_master から取得。例: "初段"）*/
  levelTitle:        string;
}

// =====================================================================
// 部位定義
// =====================================================================
const BODY_PARTS = ['面', '小手', '胴', '突き'] as const;
type BodyPart = typeof BODY_PARTS[number];

/**
 * 部位ポイント → 称号サフィックス のしきい値テーブル（降順）
 * 要件:
 *   10000pt〜 → "の神髄"
 *    5000pt〜 → "免許皆伝"
 *    2000pt〜 → "一閃"
 *     500pt〜 → "の練達"
 *     100pt〜 → "修練者"
 *       0pt〜 → "の嗜み"
 */
const PART_TITLE_THRESHOLDS: ReadonlyArray<{ readonly min: number; readonly suffix: string }> = [
  { min: 10000, suffix: 'の神髄'   },
  { min:  5000, suffix: '免許皆伝' },
  { min:  2000, suffix: '一閃'     },
  { min:   500, suffix: 'の練達'   },
  { min:   100, suffix: '修練者'   },
  { min:     0, suffix: 'の嗜み'   },
] as const;

/** 部位の累計ポイントに対応する称号サフィックスを返す */
function resolvePartSuffix(totalPts: number): string {
  for (const { min, suffix } of PART_TITLE_THRESHOLDS) {
    if (totalPts >= min) return suffix;
  }
  return 'の嗜み';
}

// =====================================================================
// 定数
// =====================================================================
const DEFAULT_EPITHET_DESCRIPTION = 'まだ見ぬ剣の道を歩む者';

// =====================================================================
// calcEpithet
// =====================================================================

/**
 * Technique[] と EpithetMaster[] からユーザーの3層称号を算出して返す。
 *
 * @param techniques    getTechniques() で取得した user_techniques × technique_master JOIN結果
 * @param epithetMaster getDashboard() で取得した EpithetMaster 全件
 * @param level         ユーザーの現在レベル（calcLevelFromXp() で算出済みの値を渡す）
 * @param titleMaster   getDashboard() で取得した title_master（未指定時はハードコードマップを使用）
 *
 * 【算出ロジック詳細】
 *
 * ① 二つ名 + レア度 + 説明文（styleCombo マスタ参照）
 *    1. techniques から subCategory ごとの累計ポイントを集計
 *    2. 降順ソート（同点時は localeCompare('ja') 五十音昇順）で上位3件を抽出
 *    3. 上位3件のサブカテゴリ名を五十音順でカンマ結合 → triggerKey
 *    4. epithetMaster の category === 'styleCombo' かつ triggerValue === triggerKey で検索
 *    5. マスタの Name / Rarity / Description をそのまま返す
 *    6. 未登録: epithetName="未知なる", epithetRarity="N", epithetDescription=フォールバック
 *
 * ② 得意部位称号（favoritePartTitle）
 *    1. 面・小手・胴・突き ごとに所属する技の累計ポイントを合算
 *    2. 合計最大の部位を特定（同点時は BODY_PARTS の定義順で先勝ち）
 *    3. 部位名 + resolvePartSuffix(合計ポイント) を結合
 *
 * ③ レベル称号（levelTitle）
 *    titleForLevel(level, titleMaster) で取得
 */
export function calcEpithet(
  techniques:    Technique[],
  epithetMaster: EpithetMasterEntry[],
  level:         number,
  titleMaster?:  TitleMasterEntry[],
): EpithetResult {

  // ──────────────────────────────────────────────────────────────────
  // Layer 3: レベル称号
  // ──────────────────────────────────────────────────────────────────
  const levelTitle = titleForLevel(level, titleMaster);

  // ──────────────────────────────────────────────────────────────────
  // Layer 2: 得意部位称号
  // ──────────────────────────────────────────────────────────────────
  const partTotals: Record<string, number> = {};
  for (const bp of BODY_PARTS) partTotals[bp] = 0;

  techniques.forEach(t => {
    const bp = t.bodyPart as BodyPart;
    if (Object.prototype.hasOwnProperty.call(partTotals, bp)) {
      partTotals[bp] += t.points;
    }
  });

  let favPart: string = BODY_PARTS[0];
  let favPts:  number = -1;
  for (const bp of BODY_PARTS) {
    const pts = partTotals[bp] ?? 0;
    if (pts > favPts) { favPts = pts; favPart = bp; }
  }

  const favoritePartTitle = favPart + resolvePartSuffix(Math.max(0, favPts));

  // ──────────────────────────────────────────────────────────────────
  // Layer 1: 二つ名 + レア度 + 説明文（EpithetMaster / styleCombo）
  // ──────────────────────────────────────────────────────────────────

  // SubCategory ごとの累計ポイントを集計
  const subTotals: Record<string, number> = {};
  techniques.forEach(t => {
    if (!t.subCategory) return;
    subTotals[t.subCategory] = (subTotals[t.subCategory] ?? 0) + t.points;
  });

  // 上位3つを抽出（降順・同点時は五十音昇順）
  const top3: string[] = Object.entries(subTotals)
    .sort(([nameA, ptsA], [nameB, ptsB]) => {
      if (ptsB !== ptsA) return ptsB - ptsA;
      return nameA.localeCompare(nameB, 'ja');
    })
    .slice(0, 3)
    .map(([name]) => name);

  // 検索キー: 上位3つを五十音昇順でカンマ結合
  const triggerKey: string = [...top3]
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .join(',');

  // EpithetMaster から検索（category は case-insensitive）
  const entry = epithetMaster.find(
    e =>
      e.category.toLowerCase() === 'stylecombo' &&
      e.triggerValue === triggerKey,
  );

  const epithetName:        string = entry?.name ?? '未知なる';
  const epithetDescription: string =
    (entry?.description?.trim())
      ? entry.description.trim()
      : DEFAULT_EPITHET_DESCRIPTION;

  const rawRarity = entry?.rarity;
  const epithetRarity: 'N' | 'R' | 'SR' =
    rawRarity === 'SR' ? 'SR' :
    rawRarity === 'R'  ? 'R'  :
    'N';

  return {
    epithetName,
    epithetRarity,
    epithetDescription,
    favoritePartTitle,
    levelTitle,
  };
}
