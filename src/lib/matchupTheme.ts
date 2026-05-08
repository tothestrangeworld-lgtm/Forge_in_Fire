// src/lib/matchupTheme.ts
// =====================================================================
// Phase10: 剣風相性タグの Degree カラーパレット（共通定義）
//
// MatchupScroll.tsx と PlaystyleCharts.tsx の両方から参照する。
// 配色を変更する場合はこのファイルだけを編集すれば全箇所に反映される。
//
// 配色思想:
//   S(得意): 青〜シアン系（青緑 → エメラルド → ネオンシアン）
//   W(苦手): 赤紫 → 警告アンバー → 真紅ネオン（危機感の段階表現）
//
// ★ Phase10.4 修正:
//   - Degree 3 の glow / glowHover を抑制
//   - 主張しすぎていた強発光を控えめに調整（拡散半径とアルファ値を低減）
// =====================================================================

export type DegreeTheme = {
    primary:    string;   // メインカラー（テキスト・アイコン）
    textBright: string;   // 強調テキスト（TargetStyle名）
    bg:         string;   // 背景
    bgInner:    string;   // 内側塗り
    border:     string;   // ボーダー色
    borderW:    number;   // ボーダー太さ
    glow:       string;   // box-shadow（外側発光）
    innerGlow:  string;   // inset box-shadow（内側発光）
  };
  
  /**
   * matchType と degree から、対応するカラーセットを返す。
   *
   * @param matchType 'S' (得意) | 'W' (苦手)
   * @param degree    1〜3（強度）
   */
  export function getDegreeTheme(matchType: string, degree: number): DegreeTheme {
    const isStrong = matchType === 'S';
    const d        = Math.max(1, Math.min(3, degree || 1));
  
    if (isStrong) {
      // ── 得意（S）: 青〜シアン系 ──
      if (d === 1) {
        return {
          primary:    '#5eead4',
          textBright: '#ccfbf1',
          bg:         'rgba(20,83,75,0.22)',
          bgInner:    'rgba(45,212,191,0.10)',
          border:     'rgba(45,212,191,0.40)',
          borderW:    1,
          glow:       'none',
          innerGlow:  'inset 0 0 8px rgba(45,212,191,0.06)',
        };
      }
      if (d === 2) {
        return {
          primary:    '#34d399',
          textBright: '#d1fae5',
          bg:         'rgba(16,185,129,0.20)',
          bgInner:    'rgba(52,211,153,0.16)',
          border:     'rgba(52,211,153,0.65)',
          borderW:    1.5,
          glow:       '0 0 14px rgba(52,211,153,0.30), 0 0 28px rgba(16,185,129,0.14)',
          innerGlow:  'inset 0 0 14px rgba(52,211,153,0.10)',
        };
      }
      // ★ Phase10.4 抑制: Degree 3 ── ネオンシアン（最強）
      return {
        primary:    '#22d3ee',
        textBright: '#ecfeff',
        bg:         'rgba(8,145,178,0.24)',
        bgInner:    'rgba(34,211,238,0.18)',
        border:     'rgba(34,211,238,0.75)',
        borderW:    1.8,
        glow:       '0 0 12px rgba(34,211,238,0.32), 0 0 24px rgba(34,211,238,0.16)',
        innerGlow:  'inset 0 0 14px rgba(34,211,238,0.10)',
      };
    } else {
      // ── 苦手（W）: 赤紫 → 警告アンバー → 真紅ネオン ──
      if (d === 1) {
        return {
          primary:    '#fda4af',
          textBright: '#fecdd3',
          bg:         'rgba(127,29,29,0.24)',
          bgInner:    'rgba(225,29,72,0.10)',
          border:     'rgba(225,29,72,0.40)',
          borderW:    1,
          glow:       'none',
          innerGlow:  'inset 0 0 8px rgba(225,29,72,0.06)',
        };
      }
      if (d === 2) {
        // 警告アンバー（黄色系）
        return {
          primary:    '#fbbf24',
          textBright: '#fef3c7',
          bg:         'rgba(180,83,9,0.22)',
          bgInner:    'rgba(245,158,11,0.18)',
          border:     'rgba(251,191,36,0.70)',
          borderW:    1.5,
          glow:       '0 0 14px rgba(251,191,36,0.36), 0 0 28px rgba(245,158,11,0.18)',
          innerGlow:  'inset 0 0 14px rgba(251,191,36,0.12)',
        };
      }
      // ★ Phase10.4 抑制: Degree 3 ── 真紅ネオン（最大警戒色）
      return {
        primary:    '#fb7185',
        textBright: '#fecaca',
        bg:         'rgba(159,18,57,0.30)',
        bgInner:    'rgba(244,63,94,0.20)',
        border:     'rgba(251,113,133,0.78)',
        borderW:    1.8,
        glow:       '0 0 14px rgba(251,113,133,0.40), 0 0 28px rgba(244,63,94,0.20)',
        innerGlow:  'inset 0 0 14px rgba(251,113,133,0.12)',
      };
    }
  }
  
  // =====================================================================
  // タグ用の hover カラーパレット
  // PlaystyleCharts.tsx のタグから使用する（マウスオーバー時の演出）。
  //
  // ★ Phase10.4: Degree 3 の glowHover も抑制
  // =====================================================================
  export type HoverStyles = {
    bgHover:   string;
    glowHover: string;
  };
  
  export function getTagHoverStyles(matchType: string, degree: number): HoverStyles {
    const isStrong = matchType === 'S';
    const d        = Math.max(1, Math.min(3, degree || 1));
  
    if (isStrong) {
      if (d === 1) {
        return {
          bgHover:   'rgba(20,83,75,0.34)',
          glowHover: '0 0 10px rgba(45,212,191,0.20)',
        };
      }
      if (d === 2) {
        return {
          bgHover:   'rgba(16,185,129,0.32)',
          glowHover: '0 0 22px rgba(52,211,153,0.45), 0 0 40px rgba(16,185,129,0.22)',
        };
      }
      // ★ Phase10.4 抑制
      return {
        bgHover:   'rgba(8,145,178,0.36)',
        glowHover: '0 0 18px rgba(34,211,238,0.45), 0 0 36px rgba(34,211,238,0.22)',
      };
    } else {
      if (d === 1) {
        return {
          bgHover:   'rgba(127,29,29,0.36)',
          glowHover: '0 0 10px rgba(225,29,72,0.20)',
        };
      }
      if (d === 2) {
        // 警告アンバー
        return {
          bgHover:   'rgba(180,83,9,0.34)',
          glowHover: '0 0 22px rgba(251,191,36,0.50), 0 0 40px rgba(245,158,11,0.26)',
        };
      }
      // ★ Phase10.4 抑制: 真紅ネオン
      return {
        bgHover:   'rgba(159,18,57,0.42)',
        glowHover: '0 0 18px rgba(251,113,133,0.50), 0 0 36px rgba(244,63,94,0.26)',
      };
    }
  }
  