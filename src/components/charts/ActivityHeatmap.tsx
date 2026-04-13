'use client';

import { useMemo, useState } from 'react';
import type { LogEntry } from '@/types';

interface Props { logs: LogEntry[]; }

function getColor(days: number, isFuture: boolean): string {
  if (isFuture && days === 0) return '#f5f3ff';
  if (days === 0) return '#eef2ff';
  if (days <= 1)  return '#c7d2fe';
  if (days <= 3)  return '#818cf8';
  if (days <= 5)  return '#4f46e5';
  return '#1e1b4b';
}

function getTextColor(days: number, isFuture: boolean): string {
  if (isFuture && days === 0) return 'transparent';
  if (days >= 4) return '#fff';
  return '#6366f1';
}

const MONTH_LABELS = ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月'];
const WEEK_LABELS  = ['1w','2w','3w','4w','5w'];

interface WeekCell {
  days:          number;
  practiceDates: string[];
  isFuture:      boolean;
  exists:        boolean; // その月にその週が存在するか
}

export default function ActivityHeatmap({ logs }: Props) {
  const [tooltip, setTooltip] = useState<{ text: string; row: number; col: number } | null>(null);

  // grid[monthIndex][weekIndex] = WeekCell
  const grid = useMemo(() => {
    const practiceDaySet = new Set(
      logs.map(l => (l.date ?? '').slice(0, 10)).filter(Boolean)
    );

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now   = new Date();
    const fiscalYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

    // 12ヶ月分（4月〜翌3月）× 最大5週
    const grid: WeekCell[][] = Array.from({ length: 12 }, () =>
      Array.from({ length: 5 }, () => ({
        days: 0, practiceDates: [], isFuture: false, exists: false,
      }))
    );

    // 4月1日〜翌3月31日を1日ずつ走査
    for (let mi = 0; mi < 12; mi++) {
      const month     = (3 + mi) % 12 + 1;          // 4,5,...,12,1,2,3
      const year      = month >= 4 ? fiscalYear : fiscalYear + 1;
      const daysInMonth = new Date(year, month, 0).getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        // その日が月の何週目か（1始まり）
        const weekIndex = Math.floor((day - 1) / 7); // 0〜4
        if (weekIndex >= 5) continue;

        const y  = date.getFullYear();
        const m  = String(date.getMonth() + 1).padStart(2, '0');
        const d  = String(date.getDate()).padStart(2, '0');
        const ds = `${y}-${m}-${d}`;

        const cell = grid[mi][weekIndex];
        cell.exists   = true;
        cell.isFuture = date > today;

        if (practiceDaySet.has(ds)) {
          cell.days++;
          cell.practiceDates.push(ds);
        }
      }
    }

    return grid;
  }, [logs]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'separate', borderSpacing: 3,
        tableLayout: 'fixed',
      }}>
        <thead>
          <tr>
            {/* 月ラベル列 */}
            <th style={{ width: 36, fontSize: 9, color: '#a5b4fc', fontWeight: 700, textAlign: 'right', paddingRight: 4 }} />
            {WEEK_LABELS.map(w => (
              <th key={w} style={{
                fontSize: 9, color: '#a5b4fc', fontWeight: 700,
                textAlign: 'center', paddingBottom: 4,
              }}>
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MONTH_LABELS.map((monthLabel, mi) => (
            <tr key={mi}>
              {/* 月ラベル */}
              <td style={{
                fontSize: 10, color: '#6366f1', fontWeight: 700,
                textAlign: 'right', paddingRight: 5,
                whiteSpace: 'nowrap',
              }}>
                {monthLabel}
              </td>

              {/* 週セル（最大5列） */}
              {grid[mi].map((cell, wi) => (
                <td
                  key={wi}
                  onMouseEnter={() => {
                    if (!cell.exists) return;
                    const text = cell.days === 0
                      ? `${monthLabel} ${wi+1}w：稽古なし`
                      : `${monthLabel} ${wi+1}w：${cell.days}日（${cell.practiceDates.map(d => d.slice(5)).join(', ')}）`;
                    setTooltip({ text, row: mi, col: wi });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    height: 22,
                    borderRadius: 4,
                    backgroundColor: cell.exists ? getColor(cell.days, cell.isFuture) : 'transparent',
                    opacity: cell.isFuture && cell.days === 0 ? 0.45 : 1,
                    cursor: cell.exists && cell.days > 0 ? 'pointer' : 'default',
                    position: 'relative',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                  }}
                >
                  {/* 稽古日数を小さく表示（1以上のみ） */}
                  {cell.exists && cell.days > 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: getTextColor(cell.days, cell.isFuture),
                      lineHeight: 1,
                    }}>
                      {cell.days}
                    </span>
                  )}

                  {/* ツールチップ */}
                  {tooltip?.row === mi && tooltip?.col === wi && (
                    <div style={{
                      position: 'absolute',
                      bottom: '110%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#1e1b4b', color: '#fff',
                      fontSize: 10, fontWeight: 600,
                      padding: '5px 10px', borderRadius: 8,
                      whiteSpace: 'nowrap', zIndex: 20,
                      boxShadow: '0 4px 12px rgba(30,27,75,.3)',
                      pointerEvents: 'none',
                    }}>
                      {tooltip.text}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* 凡例 */}
      <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:10, justifyContent:'flex-end' }}>
        <span style={{ fontSize:9, color:'#a5b4fc' }}>0日</span>
        {[0,1,3,5,7].map(d => (
          <div key={d} style={{
            width:14, height:14, borderRadius:3,
            backgroundColor: getColor(d, false), flexShrink:0,
          }} />
        ))}
        <span style={{ fontSize:9, color:'#a5b4fc' }}>7日</span>
      </div>
    </div>
  );
}
