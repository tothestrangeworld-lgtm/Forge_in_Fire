// =====================================================================
// 百錬自得 - 二つ名（Epithet）判定ロジック
// =====================================================================

import type { Technique, EpithetMasterEntry } from '@/types';

export interface EpithetResult {
  name:        string;   // 修飾語（例: '怒涛の'）
  description: string;   // 説明文
  suffix:      string;   // 固定後置語「剣士」など（常に付ける）
  fullTitle:   string;   // 表示用フルテキスト（name + suffix）
}

const DEFAULT_SUFFIX = '剣士';

/**
 * Technique[] と EpithetMaster[] から二つ名を判定して返す
 *
 * 優先順位:
 *  ① 合計ポイントが 0                 → category='status'  triggerValue='初期'
 *  ② ActionType の一方が 7割以上       → category='actionType' triggerValue=その値
 *  ③ 最もポイントの高い SubCategory    → category='subCategory' triggerValue=その値
 *  ④ 上記いずれにも偏りがない          → category='balance' triggerValue='バランス'
 */
export function calcEpithet(
  techniques:    Technique[],
  epithetMaster: EpithetMasterEntry[],
): EpithetResult {

  /** マスタから category + triggerValue で1件検索するヘルパー */
  function find(category: string, triggerValue: string): EpithetMasterEntry | undefined {
    return epithetMaster.find(
      e => e.category === category && e.triggerValue === triggerValue,
    );
  }

  /** EpithetMasterEntry → EpithetResult に変換 */
  function toResult(entry: EpithetMasterEntry): EpithetResult {
    return {
      name:        entry.name,
      description: entry.description,
      suffix:      DEFAULT_SUFFIX,
      fullTitle:   entry.name + DEFAULT_SUFFIX,
    };
  }

  /** フォールバック（マスタに一致なし） */
  function fallback(name: string, description: string): EpithetResult {
    return { name, description, suffix: DEFAULT_SUFFIX, fullTitle: name + DEFAULT_SUFFIX };
  }

  // ── ① 全ポイント 0 ──────────────────────────────────────
  const totalPts = techniques.reduce((s, t) => s + t.points, 0);
  if (totalPts === 0) {
    return toResult(find('status', '初期') ?? { id:'', category:'status', triggerValue:'初期',
      name:'見習い', description:'まだ技の記録がありません' });
  }

  // ── ② ActionType の偏り（7割以上） ──────────────────────
  const actionTotals: Record<string, number> = {};
  techniques.forEach(t => {
    if (!t.actionType) return;
    actionTotals[t.actionType] = (actionTotals[t.actionType] ?? 0) + t.points;
  });
  const actionTotal = Object.values(actionTotals).reduce((s, v) => s + v, 0);
  if (actionTotal > 0) {
    for (const [actionType, pts] of Object.entries(actionTotals)) {
      if (pts / actionTotal >= 0.7) {
        const entry = find('actionType', actionType);
        if (entry) return toResult(entry);
        // マスタに未登録でも偏りがあれば汎用表示
        return fallback(`${actionType}の`, `${actionType}のポイントが70%以上を占めます`);
      }
    }
  }

  // ── ③ 最もポイントの高い SubCategory ────────────────────
  const subTotals: Record<string, number> = {};
  techniques.forEach(t => {
    if (!t.subCategory) return;
    subTotals[t.subCategory] = (subTotals[t.subCategory] ?? 0) + t.points;
  });
  const topSub = Object.entries(subTotals).sort((a, b) => b[1] - a[1])[0];
  if (topSub) {
    const [topSubName] = topSub;
    const entry = find('subCategory', topSubName);
    if (entry) return toResult(entry);
  }

  // ── ④ バランス型（いずれにも偏りなし） ──────────────────
  return toResult(
    find('balance', 'バランス') ??
    { id:'', category:'balance', triggerValue:'バランス',
      name:'万能の', description:'どの技にも偏りのない剣士です' }
  );
}
