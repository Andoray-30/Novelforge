'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, FileDiff, Loader2, X } from 'lucide-react';
import type { DeepSynthesisApplyHistoryDetail } from '@/types';
import { formatApplyHistoryStatus, sanitizeDeepSynthesisDisplayValue } from './deep-synthesis-utils';

interface DeepSynthesisApplyDetailDrawerProps {
  open: boolean;
  detail: DeepSynthesisApplyHistoryDetail | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
}

function numberValue(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '—';
}

function PreviewPair({ before, after }: { before?: string | null; after?: string | null }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <div className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] p-3">
        <p className="text-xs font-bold text-[var(--nf-text-subtle)]">写入前</p>
        <p className="mt-1 text-sm text-[var(--nf-text)]">{sanitizeDeepSynthesisDisplayValue(before)}</p>
      </div>
      <div className="rounded-xl border border-[color-mix(in_srgb,var(--nf-success)_25%,var(--nf-border))] bg-[var(--nf-panel-soft)] p-3">
        <p className="text-xs font-bold text-[var(--nf-success)]">写入后</p>
        <p className="mt-1 text-sm text-[var(--nf-text)]">{sanitizeDeepSynthesisDisplayValue(after)}</p>
      </div>
    </div>
  );
}

export function DeepSynthesisApplyDetailDrawer({ open, detail, loading = false, error, onClose }: DeepSynthesisApplyDetailDrawerProps) {
  if (!open) return null;

  const statusInfo = formatApplyHistoryStatus(detail?.status);
  const summary = detail?.summary;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="深度合成应用详情">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭详情抽屉背景" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-[var(--nf-border)] bg-[var(--nf-surface)] shadow-2xl">
        <header className="border-b border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="nf-kicker">Apply Detail</div>
              <h3 className="mt-1 text-xl font-extrabold text-[var(--nf-text)]">应用详情</h3>
              <p className="mt-1 text-xs text-[var(--nf-text-subtle)]">仅展示审计摘要和安全截断后的字段预览。</p>
            </div>
            <button type="button" className="nf-button nf-button--secondary text-xs" onClick={onClose}>
              <X className="h-4 w-4" />
              关闭
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--nf-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载应用详情...
            </div>
          ) : error ? (
            <div className="nf-alert nf-alert--danger flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : !detail ? (
            <div className="nf-alert">尚未选择应用记录。</div>
          ) : !detail.detail_available ? (
            <div className="nf-alert flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-bold text-[var(--nf-text)]">详情不可用</p>
                <p className="mt-1 text-sm text-[var(--nf-text-muted)]">{detail.unavailable_reason || '该记录没有可展示的幂等快照。'}</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              <section className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-h-7 items-center rounded-full border border-[var(--nf-border)] px-2.5 text-xs font-bold text-[var(--nf-text-muted)]">
                    {statusInfo.label}
                  </span>
                  {summary?.dry_run ? (
                    <span className="inline-flex min-h-7 items-center rounded-full border border-[var(--nf-border)] px-2.5 text-xs text-[var(--nf-text-subtle)]">预检</span>
                  ) : null}
                  {detail.idempotency_snapshot_available ? (
                    <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--nf-success)_30%,transparent)] px-2.5 text-xs text-[var(--nf-success)]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      幂等快照可用
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ['已写入', numberValue(summary?.applied_count)],
                    ['已跳过', numberValue(summary?.skipped_count)],
                    ['冲突', numberValue(summary?.conflict_count)],
                    ['已接受', numberValue(summary?.accepted_count)],
                    ['已拒绝', numberValue(summary?.rejected_count)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-surface)] px-3 py-2">
                      <p className="text-xs text-[var(--nf-text-subtle)]">{label}</p>
                      <p className="mt-1 text-sm font-bold text-[var(--nf-text)]">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="flex items-center gap-2 text-sm font-extrabold text-[var(--nf-text)]">
                  <FileDiff className="h-4 w-4 text-[var(--nf-accent)]" />
                  写入变更
                </h4>
                <div className="mt-3 grid gap-3">
                  {(detail.applied_changes ?? []).length === 0 ? (
                    <div className="nf-alert">没有写入变更。</div>
                  ) : detail.applied_changes?.map((change, index) => (
                    <article key={change.change_id || index} className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4">
                      <p className="text-sm font-bold text-[var(--nf-text)]">{change.field_path || '未知字段'}</p>
                      <p className="mt-1 text-xs text-[var(--nf-text-subtle)]">
                        {change.asset_type || 'asset'} · {change.asset_id || 'unknown'} · {change.version_before || '—'} → {change.version_after || '—'}
                      </p>
                      <PreviewPair before={change.value_preview_before} after={change.value_preview_after} />
                    </article>
                  ))}
                </div>
              </section>

              {(detail.skipped_changes ?? []).length > 0 ? (
                <section>
                  <h4 className="text-sm font-extrabold text-[var(--nf-text)]">跳过项</h4>
                  <div className="mt-3 grid gap-2">
                    {detail.skipped_changes?.map((change, index) => (
                      <div key={change.change_id || index} className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-2 text-sm text-[var(--nf-text)]">
                        {change.field_path || '未知字段'} · {change.reason || '未知原因'}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {(detail.conflicts ?? []).length > 0 ? (
                <section>
                  <h4 className="text-sm font-extrabold text-[var(--nf-danger)]">冲突项</h4>
                  <div className="mt-3 grid gap-3">
                    {detail.conflicts?.map((conflict, index) => (
                      <article key={conflict.change_id || index} className="rounded-2xl border border-[color-mix(in_srgb,var(--nf-danger)_30%,var(--nf-border))] bg-[var(--nf-panel-soft)] p-4">
                        <p className="text-sm font-bold text-[var(--nf-text)]">{conflict.field_path || '未知字段'}</p>
                        <p className="mt-1 text-xs text-[var(--nf-text-subtle)]">{conflict.asset_id || 'unknown'} · {conflict.reason || '未知原因'}</p>
                        <PreviewPair before={conflict.expected_preview} after={conflict.actual_preview} />
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {(detail.warnings ?? []).length > 0 ? (
                <section className="nf-alert">
                  <p className="font-bold text-[var(--nf-text)]">警告</p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-[var(--nf-text-muted)]">
                    {detail.warnings?.map((warning, index) => <li key={index}>{warning}</li>)}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
