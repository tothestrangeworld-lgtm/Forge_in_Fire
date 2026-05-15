// =====================================================================
// 百錬自得 - 二つ名（Epithet）判定ロジック
// ★ Phase9: 称号システム刷新（3層構造・DBフラグ参照型レア度判定）
// ★ Phase9.1: epithetDescription を返却値に追加（由来のインライントグル表示用）
// ★ Phase9.1 bugfix: localeCompare によるソートを廃止し、SUBCATEGORY_ORDER 固定配列で
//   Python の sort 結果と完全一致するソート順を保証する。
//
// 【3層構造】
//   Layer 1 - 二つ名:       EpithetMaster (styleCombo) の Name / Rarity / Description を取得
//   Layer 2 - 得意部位称号: 面・小手・胴・突きの累計ポイントに応じた称号
//   Layer 3 - レベル称号:   title_master から titleForLevel() で取得
//
// 【設計方針】
//   レア度の判定はコードで行わず、EpithetMaster の Rarity 列（N/R/SR）を
//   そのまま参照する「データ駆動型設計」を採用。
//   TriggerKey の生成は Python の sort と完全一致する SUBCATEGORY_ORDER で行う。
// =====================================================================

import type { Technique, EpithetMasterEntry, TitleMasterEntry } from '@/types';
import { titleForLevel } from '@/types';

// =====================================================================
// ★ Phase9.1 bugfix: SubCategory の固定ソート順
//
// Python の sorted() はコードポイント順（Unicode 順）でソートする。
// JavaScript の localeCompare('ja') はロケール依存のため結果が異なる場合がある。
// 以下の配列は Python: sorted(['二段打ち','出端技','基本','引き技','打ち落とし技',
//   '払い技','抜き技','摺り上げ技','返し技']) の出力と完全一致。
// TriggerValue（カンマ結合キー）の生成時に indexOf でこの順序を参照する。
// =====================================================================
const SUBCATEGORY_ORDER: ReadonlyArray<string> = [
  '二段打ち',
  '出端技',
  '基本',
  '引き技',
  '打ち落とし技',
  '払い技',
  '抜き技',
  '摺り上げ技',
  '返し技',
] as const;

/**
 * SUBCATEGORY_ORDER における indexOf を使ってサブカテゴリ名をソートする。
 * マスタ未登録のカテゴリ（indexOf が -1）は末尾に回す。
 */
function sortBySubcategoryOrder(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ia = SUBCATEGORY_ORDER.indexOf(a);
    const ib = SUBCATEGORY_ORDER.indexOf(b);
    // 両方未登録なら文字列比較（フォールバック）
    if (ia === -1 && ib === -1) return a < b ? -1 : a > b ? 1 : 0;
    // 片方だけ未登録なら未登録側を末尾に
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// =====================================================================
// EpithetResult 型
// =====================================================================
export interface EpithetResult {
  /** 二つ名テキスト（例: "暴君"）。UI表示時はダブルクォーテーションで囲む */
  epithetName:       string;
  /**
   * マスタから取得したレア度フラグ。
   * UIの文字色判定に使用:
   *   N  → #A1A1AA（明るいグレー）
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

    // ★ DEBUG: 一時的な可視化用フィールド（リリース前に削除予定）
    _debug?: EpithetDebugInfo;
}

/**
 * ★ DEBUG: 二つ名判定プロセスの可視化情報
 * 開発環境でのデバッグ確認用。本番ビルド時は UI 側の表示制御で非表示化。
 */
export interface EpithetDebugInfo {
  /** subCategory 別の累計ポイント（全件）。降順ソート済み */
  subTotalsSorted:   Array<{ name: string; pts: number }>;
  /** 上位3件（ポイント降順抽出後・SUBCATEGORY_ORDER 適用前） */
  top3Raw:           string[];
  /** 上位3件を SUBCATEGORY_ORDER でソートしたもの */
  top3Sorted:        string[];
  /** 最終的に EpithetMaster と照合した triggerKey */
  triggerKey:        string;
  /** マスタヒットの可否 */
  matched:           boolean;
  /** マスタの styleCombo エントリ件数（参照可能件数） */
  masterStyleCount:  number;
  /** マスタにある triggerValue の例（最大5件、検索ヒントになる） */
  masterTriggerSamples: string[];
  /** SubCategory のうち SUBCATEGORY_ORDER に未登録のもの（タイポチェック用） */
  unknownSubcategories: string[];
}

// =====================================================================
// 部位定義
// =====================================================================
const BODY_PARTS = ['面', '小手', '胴', '突き'] as const;
type BodyPart = typeof BODY_PARTS[number];

/**
 * 部位ポイント → 称号サフィックス のしきい値テーブル（降順）
 */
const PART_TITLE_THRESHOLDS: ReadonlyArray<{ readonly min: number; readonly suffix: string }> = [
  { min: 10000, suffix: 'の神髄'   },
  { min:  5000, suffix: '免許皆伝' },
  { min:  2000, suffix: '一閃'     },
  { min:   500, suffix: 'の練達'   },
  { min:   100, suffix: '修練者'   },
  { min:     0, suffix: 'の嗜み'   },
] as const;

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
 *    2. 降順ソート（同点時は SUBCATEGORY_ORDER の indexOf 順）で上位3件を抽出
 *    3. 上位3件を SUBCATEGORY_ORDER の順序でソートしカンマ結合 → triggerKey
 *       ※ Python の sorted() と完全一致させるため localeCompare は使用しない
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

  // ★ DEBUG: subTotals を [{name, pts}] に整形して降順ソート
  const subTotalsSorted = Object.entries(subTotals)
    .map(([name, pts]) => ({ name, pts }))
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const ia = SUBCATEGORY_ORDER.indexOf(a.name);
      const ib = SUBCATEGORY_ORDER.indexOf(b.name);
      if (ia === -1 && ib === -1) return a.name < b.name ? -1 : 1;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

  // 上位3つを抽出
  const top3: string[] = subTotalsSorted.slice(0, 3).map(e => e.name);

  // ★ Phase9.1 bugfix:
  // 検索キー = 上位3つを SUBCATEGORY_ORDER 順でソートしてカンマ結合
  const top3Sorted: string[] = sortBySubcategoryOrder(top3);
  const triggerKey: string   = top3Sorted.join(',');

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

  // =====================================================================
  // ★ DEBUG: 判定プロセスの構造化ログ出力
  // =====================================================================
  const masterStyleCombo = epithetMaster.filter(
    e => e.category.toLowerCase() === 'stylecombo'
  );
  const unknownSubcategories = Object.keys(subTotals)
    .filter(name => SUBCATEGORY_ORDER.indexOf(name) === -1);

  const debugInfo: EpithetDebugInfo = {
    subTotalsSorted,
    top3Raw:                top3,
    top3Sorted,
    triggerKey,
    matched:                !!entry,
    masterStyleCount:       masterStyleCombo.length,
    masterTriggerSamples:   masterStyleCombo.slice(0, 5).map(e => e.triggerValue),
    unknownSubcategories,
  };

  // ブラウザコンソールにグループ表示
  if (typeof window !== 'undefined' && console.groupCollapsed) {
    console.groupCollapsed(
      `%c[Epithet Debug] ${entry ? '✅ MATCHED' : '❌ UNMATCHED'} → "${epithetName}" (${epithetRarity})`,
      `color: ${entry ? '#22c55e' : '#ef4444'}; font-weight: bold; font-size: 12px;`
    );
    console.log('📊 SubCategory 累計ポイント（降順）:');
    console.table(subTotalsSorted);
    console.log('🥉 上位3件（抽出順）:', top3);
    console.log('🔀 上位3件（SUBCATEGORY_ORDER 適用後）:', top3Sorted);
    console.log('🔑 生成された triggerKey:', `"${triggerKey}"`);
    console.log('🎯 マスタヒット:', entry ? entry : '(未マッチ)');
    if (!entry && masterStyleCombo.length > 0) {
      console.warn(
        '⚠️ マスタの triggerValue サンプル（最大5件）:',
        masterStyleCombo.slice(0, 5).map(e => `"${e.triggerValue}"`)
      );
    }
    if (unknownSubcategories.length > 0) {
      console.warn(
        '⚠️ SUBCATEGORY_ORDER に未登録のカテゴリ（タイポの可能性）:',
        unknownSubcategories
      );
    }
    console.groupEnd();
  }

  return {
    epithetName,
    epithetRarity,
    epithetDescription,
    favoritePartTitle,
    levelTitle,
    _debug: debugInfo,   // ★ DEBUG: 一時的に返却値に含める
  };
}
