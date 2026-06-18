import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { DeepSynthesisApplyHistory } from './deep-synthesis-apply-history';
import type { ExtractionApplyHistoryItem } from '@/types';

vi.mock('@/lib/api', () => ({
  extractionAttemptService: {
    listApplyHistory: vi.fn(),
  },
}));

const { extractionAttemptService } = await import('@/lib/api');
const mockList = vi.mocked(extractionAttemptService.listApplyHistory);

function makeItem(overrides: Partial<ExtractionApplyHistoryItem> = {}): ExtractionApplyHistoryItem {
  return {
    id: 'test-id',
    task_type: 'deep_synthesis_apply',
    session_id: 'sess-1',
    created_at: '2026-06-17T12:00:00Z',
    status: 'success',
    latency_ms: 1500,
    parsed_candidate_counts: { applied: 3, skipped: 1, conflicts: 0 },
    user_acceptance_rate: 0.75,
    ...overrides,
  };
}

describe('DeepSynthesisApplyHistory', () => {
  beforeEach(() => {
    mockList.mockReset();
  });

  it('shows empty state when no sessionId', () => {
    render(<DeepSynthesisApplyHistory sessionId={null} />);
    expect(screen.getByText(/请先选择或完成一个项目导入/)).toBeTruthy();
  });

  it('shows loading state initially', () => {
    mockList.mockReturnValue(new Promise(() => {}));
    render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
    expect(screen.getByText(/正在加载应用历史/)).toBeTruthy();
  });

  it('shows empty state when no items', async () => {
    mockList.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 });
    render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
    await waitFor(() => {
      expect(screen.getByText(/暂无深度合成应用记录/)).toBeTruthy();
    });
  });

  it('shows error state on failure', async () => {
    mockList.mockRejectedValue(new Error('Network error'));
    render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  it('renders apply history items', async () => {
    mockList.mockResolvedValue({
      items: [
        makeItem({ id: 'a1', status: 'success', parsed_candidate_counts: { applied: 5, skipped: 2, conflicts: 1 } }),
        makeItem({ id: 'a2', status: 'partial', parsed_candidate_counts: { applied: 3, skipped: 0, conflicts: 2 } }),
      ],
      total: 2,
      limit: 10,
      offset: 0,
    });
    render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
    await waitFor(() => {
      expect(screen.getByText('成功')).toBeTruthy();
      expect(screen.getByText('部分成功')).toBeTruthy();
    });
  });

  it('displays total count', async () => {
    mockList.mockResolvedValue({
      items: [makeItem()],
      total: 25,
      limit: 10,
      offset: 0,
    });
    render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
    await waitFor(() => {
      expect(screen.getByText(/共 25 条记录/)).toBeTruthy();
    });
  });

  it('shows pagination when total exceeds page size', async () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem({ id: `a${i}` }));
    mockList.mockResolvedValue({ items, total: 25, limit: 10, offset: 0 });
    render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
    await waitFor(() => {
      expect(screen.getByText(/第 1 \/ 3 页/)).toBeTruthy();
      expect(screen.getByText('下一页')).toBeTruthy();
    });
  });

  it('refreshes on button click', async () => {
    mockList.mockResolvedValue({ items: [makeItem()], total: 1, limit: 10, offset: 0 });
    render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
    await waitFor(() => {
      expect(screen.getByText('刷新')).toBeTruthy();
    });
    screen.getByText('刷新').click();
    await waitFor(() => {
      expect(mockList).toHaveBeenCalledTimes(2);
    });
  });
});
