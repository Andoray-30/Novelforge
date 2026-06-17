import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeepSynthesisPreviewPanel } from './deep-synthesis-preview';
import type { DeepSynthesisResult, DeepSynthesisAssetType, DeepSynthesisApplyResult } from '@/types';

function buildDeepSynthesisResultFixture(overrides?: Partial<DeepSynthesisResult>): DeepSynthesisResult {
  return {
    status: 'completed',
    task_type: 'deep_synthesis',
    attempt_id: 'att-12345678-abcd',
    preview: {
      summary: '本次综合发现 3 项角色设定冲突并已自动消解',
      proposed_changes: [
        {
          change_id: 'ch-1',
          asset_type: 'character' as DeepSynthesisAssetType,
          asset_id: 'char-001',
          asset_version: 'v2',
          field_path: 'personality.traits',
          current_value: '冷酷无情',
          proposed_value: '外冷内热，对亲近之人温柔',
          confidence: 0.92,
          risk_level: 'low',
          reason: '第三章和第七章均出现热心细节',
          evidence_refs: [
            {
              evidence_id: 'ev-1',
              source_type: 'chapter_extraction',
              asset_type: 'character' as DeepSynthesisAssetType,
              asset_id: 'char-001',
              asset_version: 'v2',
              field_path: 'personality.traits',
              summary: '第三章中张三主动帮助受伤的旅人',
            },
          ],
        },
        {
          change_id: 'ch-2',
          asset_type: 'world_fact' as DeepSynthesisAssetType,
          asset_id: 'world-001',
          asset_version: 'v1',
          field_path: 'description',
          current_value: null,
          proposed_value: '盛产黑曜石的矿业小镇',
          confidence: 0.85,
          risk_level: 'medium',
          reason: '第五章明确提及黑石镇矿脉',
          evidence_refs: [],
        },
      ],
      conflicts_resolved: [],
      new_links: [],
      risk_flags: [],
      confidence_delta: 0.13,
      evidence_refs: [],
      apply_plan: {
        requires_user_confirmation: true,
        apply_mode: 'preview_patch',
        patch_strategy: 'field_level',
        asset_write_policy: 'confirm_before_apply',
      },
      requires_user_confirmation: true,
    },
    budget_summary: {
      budget_tier: 'medium',
      max_model_calls: 10,
      max_estimated_tokens: 50000,
      max_rounds: 2,
      model_calls_used: 4,
      estimated_tokens_used: 18000,
      remaining_model_calls: 6,
      remaining_estimated_tokens: 32000,
      exhausted: false,
    },
    convergence_summary: {
      converged: true,
      reason: 'quality_target reached',
      rounds_completed: 2,
      quality_before: 0.72,
      quality_after: 0.85,
      total_quality_delta: 0.13,
      total_proposed_change_count: 5,
      total_high_confidence_change_count: 3,
      unresolved_conflict_count: 0,
      user_acceptance_rate: 0.8,
      should_continue: false,
    },
    quality_trace: {
      quality_before: 0.72,
      quality_after_preview: 0.85,
      quality_delta: 0.13,
      proposed_change_count: 5,
      high_confidence_change_count: 3,
      unresolved_conflict_count: 0,
    },
    user_feedback: {
      accepted_change_ids: [],
      rejected_change_ids: [],
      user_acceptance_rate: null,
    },
    warnings: [],
    round_summaries: [
      {
        round_index: 0,
        pass_type: 'generation',
        status: 'success',
        proposed_change_count: 5,
        high_confidence_change_count: 3,
        unresolved_conflict_count: 1,
        quality_before: 0.72,
        quality_after: 0.78,
        quality_delta: 0.06,
        model_calls_used: 2,
        estimated_tokens_used: 9000,
        warnings: [],
      },
    ],
    model_route: null,
    ...overrides,
  };
}

const defaultProps = {
  loading: false,
  error: null,
  selectionState: {} as Record<string, 'accepted' | 'rejected' | 'undecided'>,
  onAcceptChange: vi.fn(),
  onRejectChange: vi.fn(),
  onResetChange: vi.fn(),
  onAcceptAll: vi.fn(),
  onRejectAll: vi.fn(),
  onRunPreview: vi.fn(),
  budgetTier: 'medium' as const,
  onBudgetTierChange: vi.fn(),
  scopeType: 'full' as const,
  onScopeTypeChange: vi.fn(),
  applyResult: null,
  applyLoading: false,
  applyError: null,
  onDryRunApply: vi.fn(),
  onConfirmApply: vi.fn(),
  dryRunPassed: false,
  applyCompleted: false,
};

describe('DeepSynthesisPreviewPanel', () => {
  it('renders empty state when no result', () => {
    render(React.createElement(DeepSynthesisPreviewPanel, { result: null, ...defaultProps }));
    expect(screen.getByText(/无可用的深度合成预览数据/)).toBeTruthy();
  });

  it('renders preview.summary from result.preview.summary', () => {
    const result = buildDeepSynthesisResultFixture();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));
    expect(screen.getByText(/本次综合发现 3 项角色设定冲突并已自动消解/)).toBeTruthy();
  });

  it('renders proposed_changes from result.preview.proposed_changes', () => {
    const result = buildDeepSynthesisResultFixture();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));
    expect(screen.getByText('char-001')).toBeTruthy();
    expect(screen.getByText('world-001')).toBeTruthy();
  });

  it('renders field-level current/proposed values', () => {
    const result = buildDeepSynthesisResultFixture();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));
    expect(screen.getByText(/冷酷无情/)).toBeTruthy();
    expect(screen.getByText(/外冷内热，对亲近之人温柔/)).toBeTruthy();
    expect(screen.getByText(/盛产黑曜石的矿业小镇/)).toBeTruthy();
  });

  it('renders evidence summary, not quote/snippet/chapter_title', () => {
    const result = buildDeepSynthesisResultFixture();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));
    expect(screen.getByText(/第三章中张三主动帮助受伤的旅人/)).toBeTruthy();
    const body = document.body.textContent || '';
    expect(body).not.toContain('chapter_title');
    expect(body).not.toContain('quote');
    expect(body).not.toContain('snippet');
  });

  it('accept button calls onAcceptChange with change_id', () => {
    const onAcceptChange = vi.fn();
    const result = buildDeepSynthesisResultFixture();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps, onAcceptChange }));
    const acceptButtons = screen.getAllByText('接受更正');
    fireEvent.click(acceptButtons[0]);
    expect(onAcceptChange).toHaveBeenCalledWith('ch-1');
  });

  it('reject button calls onRejectChange with change_id', () => {
    const onRejectChange = vi.fn();
    const result = buildDeepSynthesisResultFixture();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps, onRejectChange }));
    const rejectButtons = screen.getAllByText('拒绝');
    fireEvent.click(rejectButtons[0]);
    expect(onRejectChange).toHaveBeenCalledWith('ch-1');
  });

  it('handles null convergence_summary and null quality_trace without crash', () => {
    const result = buildDeepSynthesisResultFixture({
      convergence_summary: null,
      quality_trace: null,
    });
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));
    expect(screen.getByText(/提炼演进摘要/)).toBeTruthy();
    expect(screen.getByText('0 轮')).toBeTruthy();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('does not render forbidden field values', () => {
    const result = buildDeepSynthesisResultFixture();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));
    const body = document.body.textContent || '';
    expect(body).not.toContain('chapter_content');
    expect(body).not.toContain('raw_response_text');
    expect(body).not.toContain('raw_response_preview');
    expect(body).not.toContain('chapter_title');
  });

  it('budget selector shows low=1, medium=2, high=3', () => {
    render(React.createElement(DeepSynthesisPreviewPanel, { result: buildDeepSynthesisResultFixture(), ...defaultProps }));
    const body = document.body.textContent || '';
    expect(body).toContain('低预算演进（最多 1 轮）');
    expect(body).toContain('标准预算演进（最多 2 轮）');
    expect(body).toContain('高预算演进（最多 3 轮）');
  });

  it('renders apply safety banner', () => {
    render(React.createElement(DeepSynthesisPreviewPanel, { result: buildDeepSynthesisResultFixture(), ...defaultProps }));
    expect(screen.getByText(/本阶段默认只预检/)).toBeTruthy();
    expect(screen.getByText(/点击确认写入后才会修改资产库/)).toBeTruthy();
  });

  it('dry run button disabled when accepted_count=0', () => {
    const selectionState: Record<string, 'accepted' | 'rejected' | 'undecided'> = {
      'ch-1': 'undecided',
      'ch-2': 'undecided',
    };
    render(React.createElement(DeepSynthesisPreviewPanel, {
      result: buildDeepSynthesisResultFixture(),
      ...defaultProps,
      selectionState,
    }));
    const dryRunButton = screen.getByText('预检应用（Dry Run）');
    expect(dryRunButton.closest('button')?.disabled).toBe(true);
  });

  it('dry run button enabled when at least one accepted', () => {
    const selectionState: Record<string, 'accepted' | 'rejected' | 'undecided'> = {
      'ch-1': 'accepted',
      'ch-2': 'undecided',
    };
    render(React.createElement(DeepSynthesisPreviewPanel, {
      result: buildDeepSynthesisResultFixture(),
      ...defaultProps,
      selectionState,
    }));
    const dryRunButton = screen.getByText('预检应用（Dry Run）');
    expect(dryRunButton.closest('button')?.disabled).toBe(false);
  });

  it('clicking dry run calls onDryRunApply', () => {
    const onDryRunApply = vi.fn();
    const selectionState: Record<string, 'accepted' | 'rejected' | 'undecided'> = {
      'ch-1': 'accepted',
    };
    render(React.createElement(DeepSynthesisPreviewPanel, {
      result: buildDeepSynthesisResultFixture(),
      ...defaultProps,
      selectionState,
      onDryRunApply,
    }));
    const dryRunButton = screen.getByText('预检应用（Dry Run）');
    fireEvent.click(dryRunButton);
    expect(onDryRunApply).toHaveBeenCalledTimes(1);
  });

  it('confirm apply disabled before successful dry_run', () => {
    render(React.createElement(DeepSynthesisPreviewPanel, {
      result: buildDeepSynthesisResultFixture(),
      ...defaultProps,
      dryRunPassed: false,
    }));
    const confirmButton = screen.getByText('确认写入资产库');
    expect(confirmButton.closest('button')?.disabled).toBe(true);
  });

  it('confirm apply enabled after dry_run success without conflicts', () => {
    render(React.createElement(DeepSynthesisPreviewPanel, {
      result: buildDeepSynthesisResultFixture(),
      ...defaultProps,
      dryRunPassed: true,
    }));
    const confirmButton = screen.getByText('确认写入资产库');
    expect(confirmButton.closest('button')?.disabled).toBe(false);
  });

  it('applied result summary displays counts', () => {
    const applyResult: DeepSynthesisApplyResult = {
      status: 'dry_run',
      summary: { accepted_count: 2, rejected_count: 1, undecided_count: 0, applied_count: 0, skipped_count: 1, conflict_count: 0, failed_count: 0, dry_run: true, all_or_nothing: false },
      applied_changes: [],
      skipped_changes: [],
      conflicts: [],
      warnings: [],
      task_type: 'deep_synthesis_apply',
    };
    render(React.createElement(DeepSynthesisPreviewPanel, {
      result: buildDeepSynthesisResultFixture(),
      ...defaultProps,
      applyResult,
    }));
    const body = document.body.textContent || '';
    expect(body).toContain('预检通过');
    expect(body).toContain('已应用');
  });

  it('conflict result displays reason and sanitized expected/actual values', () => {
    const applyResult: DeepSynthesisApplyResult = {
      status: 'partial',
      summary: { accepted_count: 1, rejected_count: 0, undecided_count: 0, applied_count: 0, skipped_count: 0, conflict_count: 1, failed_count: 0, dry_run: false, all_or_nothing: false },
      applied_changes: [],
      skipped_changes: [],
      conflicts: [{
        change_id: 'ch-1',
        asset_type: 'character' as DeepSynthesisAssetType,
        asset_id: 'char-001',
        field_path: 'personality',
        reason: 'version_mismatch',
        expected: 'v1',
        actual: 'v2',
        message: 'Version conflict detected',
      }],
      warnings: [],
      task_type: 'deep_synthesis_apply',
    };
    render(React.createElement(DeepSynthesisPreviewPanel, {
      result: buildDeepSynthesisResultFixture(),
      ...defaultProps,
      applyResult,
    }));
    const body = document.body.textContent || '';
    expect(body).toContain('版本不匹配');
    expect(body).toContain('Version conflict detected');
    expect(body).toContain('char-001');
  });

  it('skipped result displays skip reason', () => {
    const applyResult: DeepSynthesisApplyResult = {
      status: 'dry_run',
      summary: { accepted_count: 1, rejected_count: 0, undecided_count: 0, applied_count: 0, skipped_count: 1, conflict_count: 0, failed_count: 0, dry_run: true, all_or_nothing: false },
      applied_changes: [],
      skipped_changes: [{
        change_id: 'ch-2',
        asset_type: 'world_fact' as DeepSynthesisAssetType,
        asset_id: 'world-001',
        field_path: 'description',
        reason: 'undecided',
        message: 'Change not decided by user',
      }],
      conflicts: [],
      warnings: [],
      task_type: 'deep_synthesis_apply',
    };
    render(React.createElement(DeepSynthesisPreviewPanel, {
      result: buildDeepSynthesisResultFixture(),
      ...defaultProps,
      applyResult,
    }));
    const body = document.body.textContent || '';
    expect(body).toContain('未决定');
    expect(body).toContain('Change not decided by user');
  });

  it('forbidden values do not render in apply result', () => {
    const applyResult: DeepSynthesisApplyResult = {
      status: 'dry_run',
      summary: { accepted_count: 1, rejected_count: 0, undecided_count: 0, applied_count: 0, skipped_count: 0, conflict_count: 0, failed_count: 0, dry_run: true, all_or_nothing: false },
      applied_changes: [{
        change_id: 'ch-1',
        asset_type: 'character' as DeepSynthesisAssetType,
        asset_id: 'char-001',
        asset_version_before: 'v1',
        asset_version_after: 'v2',
        field_path: 'personality',
        previous_value: 'chapter_content secret text',
        applied_value: 'raw_response_text hidden data',
      }],
      skipped_changes: [],
      conflicts: [],
      warnings: [],
      task_type: 'deep_synthesis_apply',
    };
    render(React.createElement(DeepSynthesisPreviewPanel, {
      result: buildDeepSynthesisResultFixture(),
      ...defaultProps,
      applyResult,
    }));
    const body = document.body.textContent || '';
    expect(body).not.toContain('chapter_content');
    expect(body).not.toContain('raw_response_text');
    expect(body).toContain('[REDACTED_FIELD]');
  });
});
