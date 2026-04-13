// =====================================================================
// 百錬自得 - クライアントロガー
// localStorage に最大200件保持。debug ページから閲覧・エクスポート可能。
// =====================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id:        string;
  ts:        string;          // ISO8601
  level:     LogLevel;
  category:  string;          // 'api' | 'ui' | 'ai' | 'gas' etc.
  message:   string;
  detail?:   unknown;         // 任意の追加情報
  durationMs?: number;        // API呼び出し時間(ms)
  url?:      string;          // 対象URL
  status?:   number;          // HTTPステータス
}

const STORAGE_KEY = 'hyakuren_logs';
const MAX_ENTRIES = 200;

// ブラウザ環境チェック
const isBrowser = typeof window !== 'undefined';

function load(): LogEntry[] {
  if (!isBrowser) return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch { return []; }
}

function save(entries: LogEntry[]) {
  if (!isBrowser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch { /* quota exceeded etc. */ }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ===== メインAPI =====

export const logger = {
  /** 汎用ログ書き込み */
  log(level: LogLevel, category: string, message: string, extra?: Partial<Omit<LogEntry,'id'|'ts'|'level'|'category'|'message'>>) {
    const entry: LogEntry = {
      id:       uid(),
      ts:       new Date().toISOString(),
      level,
      category,
      message,
      ...extra,
    };
    const entries = load();
    entries.push(entry);
    save(entries);

    // コンソールにも出力（開発時に有益）
    const prefix = `[${entry.level.toUpperCase()}][${entry.category}]`;
    if (level === 'error')      console.error(prefix, message, extra?.detail ?? '');
    else if (level === 'warn')  console.warn (prefix, message, extra?.detail ?? '');
    else if (level === 'debug') console.debug(prefix, message, extra?.detail ?? '');
    else                        console.info (prefix, message, extra?.detail ?? '');

    return entry;
  },

  debug: (cat: string, msg: string, extra?: Partial<LogEntry>) => logger.log('debug', cat, msg, extra),
  info:  (cat: string, msg: string, extra?: Partial<LogEntry>) => logger.log('info',  cat, msg, extra),
  warn:  (cat: string, msg: string, extra?: Partial<LogEntry>) => logger.log('warn',  cat, msg, extra),
  error: (cat: string, msg: string, extra?: Partial<LogEntry>) => logger.log('error', cat, msg, extra),

  /** 全ログ取得（新しい順） */
  getAll(): LogEntry[] {
    return load().reverse();
  },

  /** レベル・カテゴリでフィルタ */
  filter(opts: { level?: LogLevel; category?: string; limit?: number }): LogEntry[] {
    let entries = load().reverse();
    if (opts.level)    entries = entries.filter(e => e.level === opts.level);
    if (opts.category) entries = entries.filter(e => e.category === opts.category);
    return entries.slice(0, opts.limit ?? 100);
  },

  /** 全件クリア */
  clear() {
    if (isBrowser) localStorage.removeItem(STORAGE_KEY);
  },

  /** JSON エクスポート用文字列 */
  export(): string {
    return JSON.stringify(load(), null, 2);
  },

  /** エラー件数（バッジ表示用） */
  errorCount(): number {
    return load().filter(e => e.level === 'error').length;
  },
};

// ===== fetch ラッパー（API計装） =====
// GASへのGET/POSTを自動計測してログに記録する

export async function loggedFetch(
  url: string,
  init: RequestInit | undefined,
  meta: { category: string; action: string }
): Promise<Response> {
  const start = Date.now();
  logger.debug(meta.category, `→ ${meta.action}`, { url });

  try {
    const res = await fetch(url, init);
    const ms  = Date.now() - start;

    if (!res.ok) {
      logger.error(meta.category, `✗ ${meta.action} HTTP ${res.status}`, {
        url, status: res.status, durationMs: ms,
      });
    } else {
      logger.info(meta.category, `✓ ${meta.action} (${ms}ms)`, {
        url, status: res.status, durationMs: ms,
      });
    }
    return res;
  } catch (err) {
    const ms = Date.now() - start;
    logger.error(meta.category, `✗ ${meta.action} NETWORK ERROR`, {
      url, durationMs: ms,
      detail: err instanceof Error
        ? { name: err.name, message: err.message }
        : String(err),
    });
    throw err;
  }
}
