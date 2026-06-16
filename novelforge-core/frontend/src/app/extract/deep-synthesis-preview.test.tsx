import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeepSynthesisPreviewPanel } from './deep-synthesis-preview';
import type { DeepSynthesisResult, DeepSynthesisAssetType } from '@/types';

function makeMockResult(overrides?: Partial<DeepSynthesisResult>): DeepSynthesisResult {
  return {
    attempt_id: 'att-12345678-abcd',
    session_id: 'ses-test',
    task_type: 'deep_synthesis',
    status: 'completed',
    budget_summary: {
      budget_tier: 'medium',
      max_rounds: 2,
      max_parallel_queries: 4,
    },
    convergence_summary: {
      converged: true,
      reason: 'quality_target reached',
      rounds_completed: 2,
      quality_before: 0.72,
      quality_after: 0.85,
      should_continue: false,
    },
    quality_trace: {
      quality_before: 0.72,
      quality_after_preview: 0.85,
      quality_delta: 0.13,
    },
    preview: {
      summary: '本次综合发现 3 项角色设定冲突并已自动消解',
      proposed_changes: [
        {
          change_id: 'ch-1',
          asset_type: 'character',
          asset_id: 'char-001',
          asset_name: '张三',
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
          asset_type: 'world_fact',
          asset_id: 'world-001',
          asset_name: '黑石镇',
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
        description: '应用 2 项变更',
        change_count: 2,
        auto_applyable_count: 1,
        requires_confirmation_count: 1,
      },
      requires_user_confirmation: true,
    },
    round_summaries: [
      {
        round_number: 1,
        pass_type: 'generation',
        status: 'completed',
        query_count: 3,
        success_count: 3,
        failed_count: 0,
        novel_ideas_discovered: 2,
        conflicts_resolved: 1,
        quality_delta_percent: 0.08,
      },
    ],
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
};

describe('DeepSynthesisPreviewPanel', () => {
  it('renders preview.summary', () => {
    const result = makeMockResult();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));

    expect(screen.getByText(/本次综合发现 3 项角色设定冲突并已自动消解/)).toBeTruthy();
  });

  it('renders proposed_changes with asset names and field paths', () => {
    const result = makeMockResult();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));

    expect(screen.getByText('张三')).toBeTruthy();
    expect(screen.getByText('黑石镇')).toBeTruthy();
  });

  it('fires onAcceptChange when accept button is clicked', () => {
    const onAcceptChange = vi.fn();
    const result = makeMockResult();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps, onAcceptChange }));

    const acceptButtons = screen.getAllByText('接受更正');
    fireEvent.click(acceptButtons[0]);
    expect(onAcceptChange).toHaveBeenCalledWith('ch-1');
  });

  it('fires onRejectChange when reject button is clicked', () => {
    const onRejectChange = vi.fn();
    const result = makeMockResult();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps, onRejectChange }));

    const rejectButtons = screen.getAllByText('拒绝');
    fireEvent.click(rejectButtons[0]);
    expect(onRejectChange).toHaveBeenCalledWith('ch-1');
  });

  it('does not render forbidden fields (chapter_content, raw_response_text)', () => {
    const result = makeMockResult();
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));

    const body = document.body.textContent || '';
    expect(body).not.toContain('chapter_content');
    expect(body).not.toContain('raw_response_text');
    expect(body).not.toContain('raw_response_preview');
  });

  it('handles null convergence_summary without crashing', () => {
    const result = makeMockResult({ convergence_summary: null });
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));

    expect(screen.getByText(/提炼演进摘要/)).toBeTruthy();
    expect(screen.getByText('0 轮')).toBeTruthy();
  });

  it('handles null quality_trace without crashing', () => {
    const result = makeMockResult({ quality_trace: null });
    render(React.createElement(DeepSynthesisPreviewPanel, { result, ...defaultProps }));

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
