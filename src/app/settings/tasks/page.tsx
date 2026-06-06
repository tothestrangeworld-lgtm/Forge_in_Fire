'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Save,
  ArrowLeft,
  ChevronDown,
  Clock,
  MapPin,
  AlertTriangle,
  Footprints,
  ClipboardList,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import type {
  TaskDiff,
  UserTask,
  TaskDetails,
  TaskWhen,
  TaskWhere,
  TaskWhyType,
} from '@/types';
import {
  createEmptyTaskDetails,
  TASK_WHEN_OPTIONS,
  TASK_WHERE_OPTIONS,
  TASK_WHY_LABELS,
} from '@/types';
import { useDashboardSWR, updateTasks } from '@/lib/api';

const INPUT_COUNT = 5 as const;

// =====================================================================
// 編集スロットの内部状態型
// =====================================================================
interface TaskSlot {
  /** 既存タスクのID（新規は undefined） */
  id?:      string;
  /** タイトル */
  title:    string;
  /** 構造化詳細（5W1H + EVAL） */
  details:  TaskDetails;
}

function buildEmptySlot(): TaskSlot {
  return { id: undefined, title: '', details: createEmptyTaskDetails() };
}

// =====================================================================
// 共通スタイル
// =====================================================================
const SELECT_STYLE: React.CSSProperties = {
  width:            '100%',
  background:       'rgba(30,27,75,0.55)',
  border:           '1px solid rgba(129,140,248,0.28)',
  color:            '#e0e7ff',
  borderRadius:     9,
  padding:          '8px 10px',
  fontSize:         '0.8rem',
  fontWeight:       700,
  fontFamily:       'inherit',
  outline:          'none',
  appearance:       'none',
  WebkitAppearance: 'none',
  colorScheme:      'dark',
};

const TEXTAREA_STYLE: React.CSSProperties = {
  width:        '100%',
  background:   'rgba(255,255,255,0.05)',
  border:       '1px solid rgba(129,140,248,0.22)',
  color:        '#fff',
  borderRadius: 9,
  padding:      '8px 10px',
  fontSize:     '0.8rem',
  fontFamily:   'inherit',
  outline:      'none',
  resize:       'vertical',
  minHeight:    44,
  boxSizing:    'border-box',
  lineHeight:   1.5,
};

const FIELD_LABEL_STYLE: React.CSSProperties = {
  display:       'flex',
  alignItems:    'center',
  gap:           6,
  marginBottom:  5,
  fontSize:      '0.62rem',
  fontWeight:    700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color:         'rgba(165,180,252,0.85)',
};

// 評価基準行のメタ（★N）
const EVAL_META: Record<number, { label: string; color: string; placeholder: string }> = {
  5: { label: '会心', color: '#22d3ee', placeholder: '例）攻めて崩し、起こりを完璧に捉えられた状態' },
  3: { label: '及第', color: '#fbbf24', placeholder: '例）狙い通りに基本の打突ができた状態' },
  1: { label: '課題', color: '#f87171', placeholder: '例）居着いて反応できず打たれた状態' },
};

export default function TaskSettingsPage() {
  const router = useRouter();

  const { data: swrData, error: swrError, isLoading: loading, mutate: mutateDashboard } = useDashboardSWR();

  /** 各スロットの構造化状態 */
  const [slots, setSlots] = useState<TaskSlot[]>(
    Array.from({ length: INPUT_COUNT }, () => buildEmptySlot()),
  );

  /** アコーディオン開閉状態（スロットindex） */
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // 既存の active タスク（最大 INPUT_COUNT 件）を派生
  const originalTasks: UserTask[] = useMemo(() => {
    const tasks = swrData?.dashboard?.tasks ?? [];
    return tasks
      .filter((t: UserTask) => t.status === 'active')
      .slice(0, INPUT_COUNT);
  }, [swrData?.dashboard?.tasks]);

  // 初回ロード時のみ seed（編集中の上書き防止）
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && !loading) {
      const init: TaskSlot[] = Array.from({ length: INPUT_COUNT }, (_, i) => {
        const t = originalTasks[i];
        if (!t) return buildEmptySlot();
        return {
          id:      t.id,
          title:   t.task_text ?? '',
          // 既存に details が無い場合は空の構造化データで補完（フェイルセーフ）
          details: t.details ?? createEmptyTaskDetails(),
        };
      });
      setSlots(init);
      setSeeded(true);
    }
  }, [originalTasks, loading, seeded]);

  // SWRエラーをローカルerror stateと統合
  useEffect(() => {
    if (swrError instanceof Error && swrError.message !== 'AUTH_REQUIRED') {
      setError(swrError.message);
    }
  }, [swrError]);

  const nonEmptyCount = useMemo(
    () => slots.map(s => s.title.trim()).filter(Boolean).length,
    [slots],
  );

  // スロット更新ヘルパー
  function updateSlot(idx: number, patch: Partial<TaskSlot>) {
    setSlots(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function updateDetails(idx: number, patch: Partial<TaskDetails>) {
    setSlots(prev => prev.map((s, i) =>
      i === idx ? { ...s, details: { ...s.details, ...patch } } : s,
    ));
  }
  function updateEval(idx: number, key: 5 | 3 | 1, value: string) {
    setSlots(prev => prev.map((s, i) =>
      i === idx
        ? { ...s, details: { ...s.details, evalCriteria: { ...s.details.evalCriteria, [key]: value } } }
        : s,
    ));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const taskDiffs: TaskDiff[] = [];

      for (let i = 0; i < INPUT_COUNT; i++) {
        const slot     = slots[i];
        const title    = slot.title.trim();
        const original = originalTasks[i]; // UserTask | undefined

        if (!title) {
          // 空欄: 送らない → GAS が archived に変更
          continue;
        }

        // タイトル・詳細のいずれかが変化していれば「変更」とみなす。
        // 既存IDがあり、かつ original が存在する場合は ID を維持して更新。
        if (original && slot.id === original.id) {
          taskDiffs.push({ id: original.id, text: title, details: slot.details });
        } else {
          // 新規（id を送らない → GAS が新 UUID を発行）
          taskDiffs.push({ text: title, details: slot.details });
        }
      }

      await updateTasks(taskDiffs);
      
      // SWRのキャッシュを強制破棄し、再フェッチを待機
      await mutateDashboard();
      
      // Next.js App Routerのクライアントキャッシュを強制破棄
      router.refresh();
      
      // ホームへ遷移
      router.push('/');
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'AUTH_REQUIRED') return;
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-up" style={{ padding: '1.5rem 1rem 0' }}>
      <header style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(129,140,248,0.2)',
          color: '#a5b4fc', textDecoration: 'none', flexShrink: 0,
        }} title="ホームへ戻る">
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </Link>
        <div>
          <span className="section-title" style={{ display: 'block' }}>SETTINGS</span>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ai)', margin: 0, letterSpacing: '-0.02em' }}>
            評価項目の設定
          </h1>
        </div>
      </header>

      <div className="wa-card" style={{
        marginBottom: '0.75rem',
        background: 'linear-gradient(135deg, rgba(13,11,42,0.92), rgba(30,27,75,0.82))',
        border: '1px solid rgba(139,92,246,0.25)',
      }}>
        <p style={{ margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 700, color: 'rgba(199,210,254,0.55)' }}>
          稽古で錬磨する課題（最大 {INPUT_COUNT} 件）。タイトルに加え、5W1H と評価基準を定義できます。
        </p>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: INPUT_COUNT }).map((_, i) => (
              <div key={i} style={{ height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.06)' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {slots.map((slot, i) => {
              const original    = originalTasks[i];
              const trimmed     = slot.title.trim();
              const isChanged   = trimmed !== '' && original && (
                trimmed !== original.task_text ||
                JSON.stringify(slot.details) !== JSON.stringify(original.details ?? createEmptyTaskDetails())
              );
              const isNew       = trimmed !== '' && !original;
              const willArchive = !trimmed && !!original;
              const isOpen      = openIdx === i;

              return (
                <div
                  key={i}
                  style={{
                    borderRadius: 14,
                    border: `1.5px solid ${
                      isChanged || isNew  ? 'rgba(251,191,36,0.45)' :
                      willArchive         ? 'rgba(239,68,68,0.4)'  :
                                            'rgba(129,140,248,0.22)'
                    }`,
                    background: 'rgba(13,11,42,0.4)',
                    overflow: 'hidden',
                    transition: 'border-color 0.2s ease',
                  }}
                >
                  {/* ── タイトル行 ── */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 10px' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 10,
                      background: 'rgba(129,140,248,0.12)',
                      border: '1px solid rgba(129,140,248,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'rgba(199,210,254,0.55)',
                      fontWeight: 900,
                      flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        value={slot.title}
                        onChange={e => updateSlot(i, { title: e.target.value })}
                        placeholder="例）打突後の残心"
                        style={{
                          width: '100%',
                          borderRadius: 10,
                          border: '1.5px solid rgba(129,140,248,0.25)',
                          background: 'rgba(255,255,255,0.06)',
                          color: '#fff',
                          padding: '9px 12px',
                          outline: 'none',
                          fontFamily: 'inherit',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          boxSizing: 'border-box',
                        }}
                      />
                      {(isChanged || isNew) && (
                        <span style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.05em',
                          color: 'rgba(251,191,36,0.85)',
                        }}>
                          {isNew ? 'NEW' : 'EDIT'}
                        </span>
                      )}
                      {willArchive && (
                        <span style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.05em',
                          color: 'rgba(239,68,68,0.7)',
                        }}>
                          ARCHIVE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── アコーディオン開閉トグル ── */}
                  <button
                    type="button"
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '7px 12px',
                      background: isOpen ? 'rgba(129,140,248,0.1)' : 'transparent',
                      border: 'none',
                      borderTop: '1px solid rgba(129,140,248,0.12)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <ClipboardList size={13} color="#a5b4fc" strokeWidth={1.8} />
                    <span style={{
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#a5b4fc',
                    }}>
                      詳細設定
                    </span>
                    <span style={{
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      color: 'rgba(199,210,254,0.4)',
                    }}>
                      5W1H + EVAL
                    </span>
                    <ChevronDown
                      size={15}
                      color="#a5b4fc"
                      strokeWidth={2}
                      style={{
                        marginLeft: 'auto',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </button>

                  {/* ── アコーディオン本体 ── */}
                  {isOpen && (
                    <div
                      className="animate-fade-up"
                      style={{
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        background: 'rgba(8,6,20,0.4)',
                        borderTop: '1px solid rgba(129,140,248,0.12)',
                      }}
                    >
                      {/* When */}
                      <div>
                        <div style={FIELD_LABEL_STYLE}>
                          <Clock size={12} strokeWidth={2} color="#a5b4fc" />
                          いつ（打突の好機）
                        </div>
                        <select
                          value={slot.details.when}
                          onChange={e => updateDetails(i, { when: e.target.value as TaskWhen })}
                          style={SELECT_STYLE}
                        >
                          {TASK_WHEN_OPTIONS.map(opt => (
                            <option key={opt} value={opt} style={{ background: '#1e1b4b', color: '#fff' }}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Where */}
                      <div>
                        <div style={FIELD_LABEL_STYLE}>
                          <MapPin size={12} strokeWidth={2} color="#a5b4fc" />
                          どこで（間合い）
                        </div>
                        <select
                          value={slot.details.where}
                          onChange={e => updateDetails(i, { where: e.target.value as TaskWhere })}
                          style={SELECT_STYLE}
                        >
                          {TASK_WHERE_OPTIONS.map(opt => (
                            <option key={opt} value={opt} style={{ background: '#1e1b4b', color: '#fff' }}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Why */}
                      <div>
                        <div style={FIELD_LABEL_STYLE}>
                          <AlertTriangle size={12} strokeWidth={2} color="#a5b4fc" />
                          なぜ（克服したい弱点）
                        </div>
                        <select
                          value={slot.details.whyType}
                          onChange={e => updateDetails(i, { whyType: e.target.value as TaskWhyType })}
                          style={SELECT_STYLE}
                        >
                          {(Object.keys(TASK_WHY_LABELS) as TaskWhyType[]).map(key => (
                            <option key={key} value={key} style={{ background: '#1e1b4b', color: '#fff' }}>
                              {TASK_WHY_LABELS[key]}
                            </option>
                          ))}
                        </select>

                        {/* whyText（custom時のみ） */}
                        {slot.details.whyType === 'custom' && (
                          <textarea
                            value={slot.details.whyText}
                            onChange={e => updateDetails(i, { whyText: e.target.value })}
                            placeholder="克服したい弱点を自由に記述"
                            style={{ ...TEXTAREA_STYLE, marginTop: 8, minHeight: 56 }}
                          />
                        )}
                      </div>

                      {/* How */}
                      <div>
                        <div style={FIELD_LABEL_STYLE}>
                          <Footprints size={12} strokeWidth={2} color="#a5b4fc" />
                          どのように（攻略法・行動計画）
                        </div>
                        <textarea
                          value={slot.details.how}
                          onChange={e => updateDetails(i, { how: e.target.value })}
                          placeholder="例）相手の竹刀を表から押さえ、起こりを捉えて面を打つ"
                          style={{ ...TEXTAREA_STYLE, minHeight: 64 }}
                        />
                      </div>

                      {/* EVAL */}
                      <div>
                        <div style={FIELD_LABEL_STYLE}>
                          <Star size={12} strokeWidth={2} color="#fbbf24" fill="#fbbf24" />
                          評価基準（EVAL CRITERIA）
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {([5, 3, 1] as const).map(n => {
                            const meta = EVAL_META[n];
                            return (
                              <div key={n} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <div style={{
                                  flexShrink: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  padding: '7px 8px',
                                  borderRadius: 8,
                                  background: `${meta.color}1a`,
                                  border: `1px solid ${meta.color}55`,
                                  minWidth: 58,
                                  justifyContent: 'center',
                                }}>
                                  <Star size={11} fill={meta.color} color={meta.color} strokeWidth={0} />
                                  <span style={{
                                    fontSize: '0.78rem',
                                    fontWeight: 800,
                                    color: meta.color,
                                    lineHeight: 1,
                                  }}>
                                    {n}
                                  </span>
                                </div>
                                <textarea
                                  value={slot.details.evalCriteria[n]}
                                  onChange={e => updateEval(i, n, e.target.value)}
                                  placeholder={meta.placeholder}
                                  style={{ ...TEXTAREA_STYLE, minHeight: 48, flex: 1 }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: 12, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, fontSize: '0.85rem', color: '#b91c1c' }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(199,210,254,0.4)' }}>
            現在の入力: <span style={{ fontWeight: 900, color: 'rgba(226,232,240,0.9)' }}>{nonEmptyCount}</span> / {INPUT_COUNT}
          </p>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="btn-ai"
            style={{ width: 'auto', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 8 }}
            title="まとめて保存"
          >
            {saving ? (
              <>
                <Loader2 style={{ width: 16, height: 16, animation: 'spin .8s linear infinite' }} />
                保存中...
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </>
            ) : (
              <>
                <Save style={{ width: 16, height: 16 }} />
                まとめて保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
