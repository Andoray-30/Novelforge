import { describe, expect, it } from 'vitest';
import {
  formatDeepSynthesisBudgetTier,
  formatDeepSynthesisScopeType,
  formatRiskLevel,
  formatConvergenceReason,
  formatPassType,
  formatRoundStatus,
  formatPercent,
  formatQualityDelta,
  groupProposedChangesByAssetType,
  buildDeepSynthesisSelectionState,
  deriveAcceptedRejectedIds,
  sanitizeDeepSynthesisDisplayValue,
} from './deep-synthesis-utils';
import type { ProposedChange, DeepSynthesisResult } from '@/types';

describe('Deep Synthesis Utils', () => {
  describe('formatDeepSynthesisBudgetTier', () => {
    it('formats budget tiers to Chinese labels', () => {
      expect(formatDeepSynthesisBudgetTier('low')).toBe('低预算演进（最多 1 轮）');
      expect(formatDeepSynthesisBudgetTier('medium')).toBe('标准预算演进（最多 2 轮）');
      expect(formatDeepSynthesisBudgetTier('high')).toBe('高预算演进（最多 3 轮）');
      expect(formatDeepSynthesisBudgetTier('unknown')).toBe('unknown');
    });
  });

  describe('formatDeepSynthesisScopeType', () => {
    it('formats scope types to Chinese labels', () => {
      expect(formatDeepSynthesisScopeType('character')).toBe('角色');
      expect(formatDeepSynthesisScopeType('relationship')).toBe('关系');
      expect(formatDeepSynthesisScopeType('event')).toBe('事件');
      expect(formatDeepSynthesisScopeType('world_fact')).toBe('世界观');
      expect(formatDeepSynthesisScopeType('full')).toBe('全量');
      expect(formatDeepSynthesisScopeType('custom')).toBe('custom');
    });
  });

  describe('formatRiskLevel', () => {
    it('formats risk levels to Chinese labels', () => {
      expect(formatRiskLevel('low')).toBe('低风险');
      expect(formatRiskLevel('medium')).toBe('中风险');
      expect(formatRiskLevel('high')).toBe('高风险');
      expect(formatRiskLevel('critical')).toBe('critical');
    });
  });

  describe('formatConvergenceReason', () => {
    it('handles various reason keywords', () => {
      expect(formatConvergenceReason('reaches max_rounds limit')).toBe('达到最大迭代轮次限制');
      expect(formatConvergenceReason('quality_target achieved')).toBe('资产质量趋于稳定（已收敛）');
      expect(formatConvergenceReason('no_actionable items')).toBe('无可消解或提升的资产项');
      expect(formatConvergenceReason('an error occurred')).toBe('执行中遇到错误，提前终止');
      expect(formatConvergenceReason('user_stop pressed')).toBe('用户手动终止');
      expect(formatConvergenceReason('stable state')).toBe('资产质量趋于稳定（已收敛）');
      expect(formatConvergenceReason('something else')).toBe('something else');
      expect(formatConvergenceReason(null)).toBe('无收敛状态说明');
    });
  });

  describe('formatPassType', () => {
    it('formats pass types to Chinese labels', () => {
      expect(formatPassType('generation')).toBe('生成');
      expect(formatPassType('validation')).toBe('验证');
      expect(formatPassType('conflict_resolution')).toBe('冲突消解');
      expect(formatPassType('other')).toBe('other');
      expect(formatPassType(null)).toBe('常规步骤');
    });
  });

  describe('formatRoundStatus', () => {
    it('formats round statuses using backend literal values', () => {
      expect(formatRoundStatus('success')).toBe('成功');
      expect(formatRoundStatus('skipped')).toBe('跳过');
      expect(formatRoundStatus('stopped')).toBe('已停止');
      expect(formatRoundStatus('failed')).toBe('失败');
      expect(formatRoundStatus(null)).toBe('未知');
    });
  });

  describe('formatPercent', () => {
    it('handles numeric and null values', () => {
      expect(formatPercent(0.05)).toBe('+5.0%');
      expect(formatPercent(-0.123)).toBe('-12.3%');
      expect(formatPercent(0)).toBe('+0.0%');
      expect(formatPercent(null)).toBe('—');
    });
  });

  describe('formatQualityDelta', () => {
    it('handles quality scores', () => {
      expect(formatQualityDelta(3.5)).toBe('+3.50');
      expect(formatQualityDelta(-1.25)).toBe('-1.25');
      expect(formatQualityDelta(0)).toBe('0');
      expect(formatQualityDelta(null)).toBe('—');
    });
  });

  describe('groupProposedChangesByAssetType', () => {
    it('groups empty list correctly', () => {
      const grouped = groupProposedChangesByAssetType([]);
      expect(grouped.character).toEqual([]);
      expect(grouped.relationship).toEqual([]);
      expect(grouped.event).toEqual([]);
      expect(grouped.world_fact).toEqual([]);
    });

    it('groups changes correctly by asset_type without relying on asset_name', () => {
      const changes: ProposedChange[] = [
        {
          change_id: '1',
          asset_type: 'character',
          asset_id: 'c1',
          asset_version: 'v1',
          field_path: 'personality',
          current_value: '冷酷',
          proposed_value: '外冷内热',
          confidence: 0.9,
          risk_level: 'low',
          reason: '发现热心细节',
          evidence_refs: []
        },
        {
          change_id: '2',
          asset_type: 'world_fact',
          asset_id: 'w1',
          asset_version: 'v1',
          field_path: 'description',
          current_value: null,
          proposed_value: '盛产黑曜石',
          confidence: 0.85,
          risk_level: 'medium',
          reason: '第三章明确提及',
          evidence_refs: []
        }
      ];
      const grouped = groupProposedChangesByAssetType(changes);
      expect(grouped.character).toHaveLength(1);
      expect(grouped.character[0].change_id).toBe('1');
      expect(grouped.world_fact).toHaveLength(1);
      expect(grouped.world_fact[0].change_id).toBe('2');
      expect(grouped.relationship).toHaveLength(0);
      expect(grouped.event).toHaveLength(0);
    });
  });

  describe('buildDeepSynthesisSelectionState', () => {
    it('creates initial selection state with undecided', () => {
      const mockResult = {
        preview: {
          proposed_changes: [
            { change_id: 'c1' },
            { change_id: 'c2' }
          ]
        }
      } as any as DeepSynthesisResult;

      const state = buildDeepSynthesisSelectionState(mockResult);
      expect(state).toEqual({
        c1: 'undecided',
        c2: 'undecided'
      });
    });

    it('returns empty object for invalid inputs', () => {
      expect(buildDeepSynthesisSelectionState(null)).toEqual({});
      expect(buildDeepSynthesisSelectionState({} as any)).toEqual({});
    });
  });

  describe('deriveAcceptedRejectedIds', () => {
    it('splits states correctly', () => {
      const state: Record<string, 'accepted' | 'rejected' | 'undecided'> = {
        '1': 'accepted',
        '2': 'rejected',
        '3': 'undecided',
        '4': 'accepted'
      };
      const result = deriveAcceptedRejectedIds(state);
      expect(result.accepted_change_ids).toEqual(['1', '4']);
      expect(result.rejected_change_ids).toEqual(['2']);
    });
  });

  describe('sanitizeDeepSynthesisDisplayValue', () => {
    it('truncates long strings to 200 characters with ellipsis', () => {
      const longString = 'a'.repeat(250);
      const sanitized = sanitizeDeepSynthesisDisplayValue(longString);
      expect(sanitized).toHaveLength(203);
      expect(sanitized.endsWith('...')).toBe(true);
    });

    it('redacts forbidden fields including chapter_id, chapter_title, quote, snippet', () => {
      const text = 'Here is the chapter_content and raw_response_text and chapter_title and quote and snippet of the novel.';
      const sanitized = sanitizeDeepSynthesisDisplayValue(text);
      expect(sanitized).not.toContain('chapter_content');
      expect(sanitized).not.toContain('raw_response_text');
      expect(sanitized).not.toContain('chapter_title');
      expect(sanitized).toContain('[REDACTED_FIELD]');
    });

    it('returns default placeholder for null/undefined', () => {
      expect(sanitizeDeepSynthesisDisplayValue(null)).toBe('—');
      expect(sanitizeDeepSynthesisDisplayValue(undefined)).toBe('—');
    });
  });
});
