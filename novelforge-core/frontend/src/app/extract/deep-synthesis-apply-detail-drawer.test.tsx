import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DeepSynthesisApplyDetailDrawer } from './deep-synthesis-apply-detail-drawer';
import type { DeepSynthesisApplyHistoryDetail } from '@/types';

function makeDetail(overrides: Partial<DeepSynthesisApplyHistoryDetail> = {}): DeepSynthesisApplyHistoryDetail {
  return {
    detail_available: true,
    idempotency_snapshot_available: true,
    status: 'success',
    summary: {
      applied_count: 3,
      skipped_count: 1,
      conflict_count: 0,
      accepted_count: 3,
      rejected_count: 0,
      dry_run: false,
    },
    applied_changes: [
      {
        change_id: 'c1',
        asset_type: 'character',
        asset_id: 'char-1',
        field_path: 'personality',
        version_before: 'v1',
        version_after: 'v2',
        value_preview_before: 'old personality',
        value_preview_after: 'new personality',
      },
    ],
    skipped_changes: [
      {
        change_id: 'c2',
        reason: 'version_mismatch',
        asset_type: 'character',
        asset_id: 'char-2',
        field_path: 'description',
      },
    ],
    conflicts: [
      {
        change_id: 'c3',
        asset_id: 'char-3',
        field_path: 'background',
        reason: 'current_value_mismatch',
        expected_preview: 'expected bg',
        actual_preview: 'actual bg',
      },
    ],
    warnings: ['Some warning message'],
    ...overrides,
  };
}

describe('DeepSynthesisApplyDetailDrawer', () => {
  it('returns null when not open', () => {
    const { container } = render(
      <DeepSynthesisApplyDetailDrawer open={false} detail={null} onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows loading state', () => {
    render(
      <DeepSynthesisApplyDetailDrawer open={true} detail={null} loading={true} onClose={vi.fn()} />
    );
    expect(screen.getByText(/正在加载应用详情/)).toBeTruthy();
  });

  it('shows error state', () => {
    render(
      <DeepSynthesisApplyDetailDrawer open={true} detail={null} error="网络错误" onClose={vi.fn()} />
    );
    expect(screen.getByText('网络错误')).toBeTruthy();
  });

  it('shows detail unavailable state when detail_available is false', () => {
    const detail = makeDetail({ detail_available: false, unavailable_reason: '快照已净化' });
    render(
      <DeepSynthesisApplyDetailDrawer open={true} detail={detail} onClose={vi.fn()} />
    );
    expect(screen.getByText('详情不可用')).toBeTruthy();
    expect(screen.getByText('快照已净化')).toBeTruthy();
  });

  it('shows detail available with applied changes', () => {
    const detail = makeDetail();
    render(
      <DeepSynthesisApplyDetailDrawer open={true} detail={detail} onClose={vi.fn()} />
    );
    // Status badge
    expect(screen.getByText('成功')).toBeTruthy();
    // Summary counts
    expect(screen.getByText('已写入')).toBeTruthy();
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    // Applied change content
    expect(screen.getByText('personality')).toBeTruthy();
    expect(screen.getByText(/character · char-1/)).toBeTruthy();
    expect(screen.getByText('old personality')).toBeTruthy();
    expect(screen.getByText('new personality')).toBeTruthy();
    // Skipped change
    expect(screen.getByText(/description · version_mismatch/)).toBeTruthy();
    // Conflict
    expect(screen.getByText('background')).toBeTruthy();
    expect(screen.getByText('expected bg')).toBeTruthy();
    expect(screen.getByText('actual bg')).toBeTruthy();
    // Warnings
    expect(screen.getByText('Some warning message')).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <DeepSynthesisApplyDetailDrawer open={true} detail={null} onClose={onClose} />
    );
    const closeButtons = screen.getAllByRole('button', { name: /关闭/ });
    // The second button is the actual close button (not the backdrop)
    fireEvent.click(closeButtons[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <DeepSynthesisApplyDetailDrawer open={true} detail={null} onClose={onClose} />
    );
    const backdrop = screen.getByLabelText('关闭详情抽屉背景');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows "no changes" alert when applied_changes is empty', () => {
    const detail = makeDetail({ applied_changes: [] });
    render(
      <DeepSynthesisApplyDetailDrawer open={true} detail={detail} onClose={vi.fn()} />
    );
    expect(screen.getByText('没有写入变更。')).toBeTruthy();
  });
});
