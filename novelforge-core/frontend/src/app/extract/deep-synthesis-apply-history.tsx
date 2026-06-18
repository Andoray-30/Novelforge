'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { extractionAttemptService } from '@/lib/api';
import type { DeepSynthesisApplyHistoryDetail, ExtractionApplyHistoryItem } from '@/types';
import { extractApplyHistoryCounts, formatApplyHistoryStatus } from './deep-synthesis-utils';
import { DeepSynthesisApplyDetailDrawer } from './deep-synthesis-apply-detail-drawer';

const PAGE_SIZE = 10;

interface DeepSynthesisApplyHistoryProps {
  sessionId: string | null;
  parentId?: string | null;
  refreshKey?: number;
}

export function DeepSynthesisApplyHistory({ sessionId, parentId, refreshKey }: DeepSynthesisApplyHistoryProps) {
  const [items, setItems] = useState<ExtractionApplyHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeepSynthesisApplyHistoryDetail | null>(null);

  const loadHistory = useCallback(async (pageOffset: number) => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await extractionAttemptService.listApplyHistory({
        sessionId,
        parentId: parentId ?? undefined,
        taskType: 'deep_synthesis_apply',
        limit: PAGE_SIZE,
        offset: pageOffset,
      });
      setItems(response.items ?? []);
      setTotal(response.total ?? 0);
      setOffset(pageOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载应用历史失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [sessionId, parentId]);

  useEffect(() => {
    void loadHistory(0);
  }, [loadHistory]);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      void loadHistory(0);
    }
  }, [refreshKey, loadHistory]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const openDetail = useCallback(async (attemptId: string) => {
    if (!sessionId) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const nextDetail = await extractionAttemptService.getApplyHistoryDetail({ sessionId, attemptId });
      setDetail(nextDetail);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : '加载应用详情失败');
    } finally {
      setDetailLoading(false);
    }
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="nf-panel nf-panel-pad">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-[var(--nf-accent)]" />
          <div>
            <div className="nf-kicker">Apply History</div>
            <h3 className="mt-1 text-lg font-extrabold text-[var(--nf-text)]">深度合成应用历史</h3>
          </div>
        </div>
        <div className="nf-alert mt-4">请先选择或完成一个项目导入后再查看历史记录。</div>
      </div>
    );
  }

  return (
    <div className="nf-panel nf-panel-pad">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-[var(--nf-accent)]" />
          <div>
            <div className="nf-kicker">Apply History</div>
            <h3 className="mt-1 text-lg font-extrabold text-[var(--nf-text)]">深度合成应用历史</h3>
            <p className="mt-1 text-xs text-[var(--nf-text-subtle)]">
              共 {total} 条记录
            </p>
          </div>
        </div>
        <button
          type="button"
          className="nf-button nf-button--secondary text-xs"
          disabled={loading}
          onClick={() => void loadHistory(offset)}
        >
          <RefreshCw className={['h-4 w-4', loading ? 'animate-spin' : ''].join(' ')} />
          刷新
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="mt-5 flex items-center justify-center gap-2 py-8 text-sm text-[var(--nf-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载应用历史...
        </div>
      ) : error ? (
        <div className="nf-alert nf-alert--danger mt-5 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="nf-alert mt-5">暂无深度合成应用记录。完成一次深度合成写入后，结果会在这里显示。</div>
      ) : (
        <>
          <div className="mt-5 grid gap-3">
            {items.map((item) => {
              const statusInfo = formatApplyHistoryStatus(item.status);
              const counts = extractApplyHistoryCounts(item);
              const timestamp = item.created_at
                ? new Date(item.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '—';
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[var(--nf-border)] bg-[var(--nf-surface)] p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            'inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-bold',
                            statusInfo.tone === 'success'
                              ? 'border-[color-mix(in_srgb,var(--nf-success)_30%,transparent)] text-[var(--nf-success)]'
                              : statusInfo.tone === 'warning'
                                ? 'border-[color-mix(in_srgb,var(--nf-warning)_30%,transparent)] text-[var(--nf-warning)]'
                                : statusInfo.tone === 'danger'
                                  ? 'border-[color-mix(in_srgb,var(--nf-danger)_30%,transparent)] text-[var(--nf-danger)]'
                                  : 'border-[var(--nf-border)] text-[var(--nf-text-muted)]',
                          ].join(' ')}
                        >
                          {statusInfo.label}
                        </span>
                        {counts.dryRun ? (
                          <span className="inline-flex min-h-7 items-center rounded-full border border-[var(--nf-border)] px-2.5 text-xs text-[var(--nf-text-subtle)]">
                            预检
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-[var(--nf-text-subtle)]">
                        {timestamp}
                        {item.latency_ms != null ? ` · ${item.latency_ms}ms` : ''}
                        {item.task_type ? ` · ${item.task_type}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="nf-button nf-button--secondary text-xs"
                      onClick={() => void openDetail(item.id)}
                    >
                      <Eye className="h-4 w-4" />
                      查看详情
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ['已写入', counts.applied],
                      ['已跳过', counts.skipped],
                      ['冲突', counts.conflicts],
                      ['接受率', counts.acceptanceRate],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-xl border border-[var(--nf-border)] bg-[var(--nf-panel-soft)] px-3 py-2"
                      >
                        <p className="text-xs text-[var(--nf-text-subtle)]">{label}</p>
                        <p className="mt-1 text-sm font-bold text-[var(--nf-text)]">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                  {item.convergence_reason ? (
                    <p className="mt-2 text-xs text-[var(--nf-text-muted)]">
                      收敛原因：{item.convergence_reason}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-[var(--nf-text-subtle)]">
                第 {currentPage} / {totalPages} 页
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="nf-button nf-button--secondary text-xs"
                  disabled={loading || offset === 0}
                  onClick={() => void loadHistory(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </button>
                <button
                  type="button"
                  className="nf-button nf-button--secondary text-xs"
                  disabled={loading || offset + PAGE_SIZE >= total}
                  onClick={() => void loadHistory(offset + PAGE_SIZE)}
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
      <DeepSynthesisApplyDetailDrawer
        open={detailOpen}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
