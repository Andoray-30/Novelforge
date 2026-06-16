import {
  DeepSynthesisBudgetTier,
  DeepSynthesisScopeType,
  RiskLevel,
  ProposedChange,
  DeepSynthesisAssetType,
  DeepSynthesisResult
} from '@/types';

export function formatDeepSynthesisBudgetTier(tier: DeepSynthesisBudgetTier | string): string {
  switch (tier) {
    case 'low':
      return '低预算（1 轮）';
    case 'medium':
      return '标准预算（2 轮）';
    case 'high':
      return '高预算（3 轮）';
    default:
      return tier || '未知';
  }
}

export function formatDeepSynthesisScopeType(scope: DeepSynthesisScopeType | string): string {
  switch (scope) {
    case 'character':
      return '角色';
    case 'relationship':
      return '关系';
    case 'event':
      return '事件';
    case 'world_fact':
      return '世界观';
    case 'full':
      return '全量';
    default:
      return scope || '未知';
  }
}

export function formatRiskLevel(level: RiskLevel | string): string {
  switch (level) {
    case 'low':
      return '低风险';
    case 'medium':
      return '中风险';
    case 'high':
      return '高风险';
    default:
      return level || '未知';
  }
}

export function formatConvergenceReason(reason: string | null | undefined): string {
  if (!reason) return '无收敛状态说明';
  const r = reason.toLowerCase();
  if (r.includes('max_rounds')) return '达到最大迭代轮次限制';
  if (r.includes('quality_target') || r.includes('converged') || r.includes('stable')) return '资产质量趋于稳定（已收敛）';
  if (r.includes('no_actionable') || r.includes('no_assets') || r.includes('empty')) return '无可消解或提升的资产项';
  if (r.includes('error') || r.includes('fail')) return '执行中遇到错误，提前终止';
  if (r.includes('user_stop') || r.includes('cancel')) return '用户手动终止';
  return reason;
}

export function formatPassType(pass_type: string | null | undefined): string {
  if (!pass_type) return '常规步骤';
  switch (pass_type) {
    case 'generation':
      return '生成';
    case 'validation':
      return '验证';
    case 'conflict_resolution':
      return '冲突消解';
    default:
      return pass_type;
  }
}

export function formatRoundStatus(status: string | null | undefined): string {
  if (!status) return '未知';
  switch (status) {
    case 'completed':
      return '成功';
    case 'skipped':
      return '跳过';
    case 'stopped':
      return '已停止';
    case 'failed':
      return '失败';
    default:
      return status;
  }
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const pct = value * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export function formatQualityDelta(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '0';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}

export function groupProposedChangesByAssetType(changes: ProposedChange[] | null | undefined): Record<DeepSynthesisAssetType, ProposedChange[]> {
  const result: Record<DeepSynthesisAssetType, ProposedChange[]> = {
    character: [],
    relationship: [],
    event: [],
    world_fact: []
  };
  if (!changes || !Array.isArray(changes)) return result;
  for (const change of changes) {
    const type = change.asset_type;
    if (result[type]) {
      result[type].push(change);
    }
  }
  return result;
}

export function buildDeepSynthesisSelectionState(preview: DeepSynthesisResult | null | undefined): Record<string, 'accepted' | 'rejected' | 'undecided'> {
  const state: Record<string, 'accepted' | 'rejected' | 'undecided'> = {};
  if (!preview || !preview.preview || !Array.isArray(preview.preview.proposed_changes)) return state;
  for (const change of preview.preview.proposed_changes) {
    state[change.change_id] = 'undecided';
  }
  return state;
}

export function deriveAcceptedRejectedIds(selectionState: Record<string, 'accepted' | 'rejected' | 'undecided'>): { accepted_change_ids: string[]; rejected_change_ids: string[] } {
  const accepted_change_ids: string[] = [];
  const rejected_change_ids: string[] = [];
  for (const [id, decision] of Object.entries(selectionState)) {
    if (decision === 'accepted') {
      accepted_change_ids.push(id);
    } else if (decision === 'rejected') {
      rejected_change_ids.push(id);
    }
  }
  return { accepted_change_ids, rejected_change_ids };
}

export function sanitizeDeepSynthesisDisplayValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  
  const forbiddenPatterns = [
    /chapter_content/i,
    /raw_response_text/i,
    /raw_response_preview/i,
    /provider_error_body/i,
    /full_text/i,
    /original_text/i
  ];
  
  let cleaned = String(value);
  for (const pattern of forbiddenPatterns) {
    cleaned = cleaned.replace(pattern, '[REDACTED_FIELD]');
  }
  
  if (cleaned.length > 200) {
    return cleaned.slice(0, 200) + '...';
  }
  return cleaned;
}
