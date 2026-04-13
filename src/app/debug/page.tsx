'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Trash2, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { logger, type LogEntry, type LogLevel } from '@/lib/logger';

const LEVEL_STYLE: Record<LogLevel, { bg: string; color: string; label: string }> = {
  debug: { bg: '#f1f5f9', color: '#64748b', label: 'DEBUG' },
  info:  { bg: '#eff6ff', color: '#1d4ed8', label: 'INFO'  },
  warn:  { bg: '#fffbeb', color: '#d97706', label: 'WARN'  },
  error: { bg: '#fef2f2', color: '#dc2626', label: 'ERROR' },
};

type FilterLevel = LogLevel | 'all';

export default function DebugPage() {
  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [filter, setFilter]   = useState<FilterLevel>('all');
  const [expanded, setExp]    = useState<Set<string>>(new Set());
  const [search, setSearch]   = useState('');
  const [gasUrl]              = useState(process.env.NEXT_PUBLIC_GAS_URL ?? '');

  const reload = useCallback(() => {
    const all = logger.getAll();
    setLogs(all);
  }, []);

  useEffect(() => {
    reload();
    // 5秒ごとに自動更新
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [reload]);

  function handleClear() {
    if (!confirm('ログを全件削除しますか？')) return;
    logger.clear();
    setLogs([]);
  }

  function handleExport() {
    const blob = new Blob([logger.export()], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `hyakuren_logs_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleExpand(id: string) {
    setExp(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filtered = logs.filter(l => {
    if (filter !== 'all' && l.level !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.message.toLowerCase().includes(q)
          || l.category.toLowerCase().includes(q)
          || JSON.stringify(l.detail ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const counts = { all: logs.length, debug: 0, info: 0, warn: 0, error: 0 };
  logs.forEach(l => { counts[l.level]++; });

  return (
    <div style={{ padding:'1rem' }}>

      {/* ヘッダー */}
      <header style={{ marginBottom:'1rem' }}>
        <span className="section-title">デバッグ</span>
        <h1 style={{ fontSize:'1.5rem', fontWeight:800, color:'var(--ai)', margin:'0 0 0.5rem' }}>
          ログビューア
        </h1>
        <p style={{ fontSize:'0.72rem', color:'#a8a29e', margin:0 }}>
          ブラウザのlocalStorageに保存（最大200件）
        </p>
      </header>

      {/* GAS URL チェック */}
      <div className="wa-card" style={{ marginBottom:'1rem', borderLeft:`4px solid ${gasUrl ? '#10b981' : '#ef4444'}` }}>
        <p style={{ fontSize:'0.7rem', fontWeight:700, color: gasUrl ? '#065f46' : '#991b1b', margin:'0 0 4px' }}>
          {gasUrl ? '✓ GAS URL 設定済み' : '✗ GAS URL 未設定'}
        </p>
        <p style={{ fontSize:'0.65rem', color:'#a8a29e', margin:0, wordBreak:'break-all' }}>
          {gasUrl || 'NEXT_PUBLIC_GAS_URL が未設定です'}
        </p>
      </div>

      {/* ツールバー */}
      <div style={{ display:'flex', gap:8, marginBottom:'1rem', flexWrap:'wrap' }}>
        <button
          onClick={reload}
          style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 12px', borderRadius:8, border:'1.5px solid #c7d2fe', background:'#fff', cursor:'pointer', fontSize:'0.8rem', color:'var(--ai)', fontFamily:'inherit', fontWeight:600 }}
        >
          <RefreshCw style={{ width:14, height:14 }} /> 更新
        </button>
        <button
          onClick={handleExport}
          style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 12px', borderRadius:8, border:'1.5px solid #c7d2fe', background:'#fff', cursor:'pointer', fontSize:'0.8rem', color:'var(--ai)', fontFamily:'inherit', fontWeight:600 }}
        >
          <Download style={{ width:14, height:14 }} /> エクスポート
        </button>
        <button
          onClick={handleClear}
          style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 12px', borderRadius:8, border:'1.5px solid #fca5a5', background:'#fff', cursor:'pointer', fontSize:'0.8rem', color:'#dc2626', fontFamily:'inherit', fontWeight:600 }}
        >
          <Trash2 style={{ width:14, height:14 }} /> クリア
        </button>
      </div>

      {/* フィルタタブ */}
      <div style={{ display:'flex', gap:4, marginBottom:'1rem', overflowX:'auto' }}>
        {(['all','error','warn','info','debug'] as FilterLevel[]).map(lv => (
          <button
            key={lv}
            onClick={() => setFilter(lv)}
            style={{
              padding:'5px 10px', borderRadius:999, border:'none',
              fontFamily:'inherit', fontWeight:700, fontSize:'0.7rem',
              cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
              background: filter === lv
                ? (lv === 'all' ? 'var(--ai)' : LEVEL_STYLE[lv as LogLevel].color)
                : '#f1f5f9',
              color: filter === lv ? '#fff' : '#64748b',
            }}
          >
            {lv.toUpperCase()} ({counts[lv as keyof typeof counts]})
          </button>
        ))}
      </div>

      {/* 検索 */}
      <input
        type="text"
        placeholder="メッセージ・カテゴリで検索..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width:'100%', padding:'8px 12px', borderRadius:10,
          border:'1.5px solid #e0e7ff', background:'#fff',
          fontSize:'0.85rem', fontFamily:'inherit', color:'var(--ai)',
          marginBottom:'1rem', boxSizing:'border-box',
        }}
      />

      {/* ログ一覧 */}
      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem 0', color:'#a8a29e', fontSize:'0.85rem' }}>
          {logs.length === 0 ? 'ログはまだありません' : '条件に一致するログがありません'}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {filtered.map(entry => {
            const s    = LEVEL_STYLE[entry.level];
            const open = expanded.has(entry.id);
            const hasDetail = entry.detail !== undefined || entry.durationMs !== undefined || entry.url || entry.status;

            return (
              <div
                key={entry.id}
                style={{
                  borderRadius:10, border:`1px solid ${s.bg === '#f1f5f9' ? '#e2e8f0' : s.bg}`,
                  background:'#fff', overflow:'hidden',
                }}
              >
                {/* メイン行 */}
                <div
                  onClick={() => hasDetail && toggleExpand(entry.id)}
                  style={{
                    display:'flex', alignItems:'flex-start', gap:8,
                    padding:'8px 10px',
                    cursor: hasDetail ? 'pointer' : 'default',
                    background: s.bg,
                  }}
                >
                  {/* レベルバッジ */}
                  <span style={{
                    flexShrink:0, fontSize:'0.6rem', fontWeight:800,
                    padding:'2px 6px', borderRadius:4,
                    background: s.color, color:'#fff',
                    marginTop:1,
                  }}>
                    {s.label}
                  </span>

                  {/* 内容 */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:2 }}>
                      <span style={{ fontSize:'0.65rem', fontWeight:700, color: s.color }}>
                        [{entry.category}]
                      </span>
                      {entry.durationMs !== undefined && (
                        <span style={{ fontSize:'0.6rem', color:'#94a3b8', background:'#f1f5f9', padding:'1px 5px', borderRadius:4 }}>
                          {entry.durationMs}ms
                        </span>
                      )}
                      {entry.status !== undefined && (
                        <span style={{ fontSize:'0.6rem', color: entry.status >= 400 ? '#dc2626' : '#059669', background:'#f1f5f9', padding:'1px 5px', borderRadius:4 }}>
                          HTTP {entry.status}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize:'0.8rem', color:'#1c1917', margin:0, lineHeight:1.4, wordBreak:'break-word' }}>
                      {entry.message}
                    </p>
                    <p style={{ fontSize:'0.6rem', color:'#94a3b8', margin:'3px 0 0' }}>
                      {new Date(entry.ts).toLocaleString('ja-JP')}
                    </p>
                  </div>

                  {hasDetail && (
                    <span style={{ flexShrink:0, color:'#94a3b8' }}>
                      {open
                        ? <ChevronUp style={{ width:14, height:14 }} />
                        : <ChevronDown style={{ width:14, height:14 }} />}
                    </span>
                  )}
                </div>

                {/* 詳細展開 */}
                {open && hasDetail && (
                  <div style={{ padding:'8px 10px', borderTop:'1px solid #f1f5f9' }}>
                    {entry.url && (
                      <p style={{ fontSize:'0.65rem', color:'#64748b', wordBreak:'break-all', margin:'0 0 4px' }}>
                        <b>URL:</b> {entry.url}
                      </p>
                    )}
                    {entry.detail !== undefined && (
                      <pre style={{
                        fontSize:'0.65rem', color:'#334155',
                        background:'#f8fafc', borderRadius:6, padding:8,
                        overflow:'auto', maxHeight:200, margin:0,
                        whiteSpace:'pre-wrap', wordBreak:'break-word',
                      }}>
                        {typeof entry.detail === 'string'
                          ? entry.detail
                          : JSON.stringify(entry.detail, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
