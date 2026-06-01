import { describe, expect, it } from 'vitest';
import { buildAssetQualityDiagnostics, looksLikeMojibake } from './asset-quality-diagnostics';
import type { ContentItem } from '@/types';

function item(type: ContentItem['metadata']['type'], id: string, title: string, data: Record<string, unknown> = {}, content = ''): ContentItem {
  return {
    metadata: {
      id,
      title,
      type,
      status: 'draft',
      tags: [],
      created_at: '2026-05-24T00:00:00Z',
      updated_at: '2026-05-24T00:00:00Z',
      version: 1,
      session_id: 's1',
      parent_id: 'novel1',
    },
    content,
    extracted_data: data,
    relations: null,
    stats: null,
  };
}

describe('asset quality diagnostics', () => {
  it('detects mojibake-like asset titles', () => {
    expect(looksLikeMojibake('HTTP 404 閿欒')).toBe(true);
    expect(looksLikeMojibake('猫搂聮猫聣虏')).toBe(true);
    expect(looksLikeMojibake('清晰可读的中文标题')).toBe(false);
  });

  it('builds diagnostics from recovered content assets', () => {
    const result = buildAssetQualityDiagnostics([
      item('character', 'c1', '主角甲', {
        name: '主角甲',
        description: '主角甲有明确动机、孤独感和归属需求，能够支撑后续创作中的情绪选择和行动变化。',
        evidence: ['她在雨夜拒绝回头。', '她说自己仍然想找到答案。'],
      }),
      item('character', 'c2', '閿欒角色', { name: '閿欒角色', description: '' }),
      item('relationship', 'r1', '未闭合关系', { source: '主角甲', target: '不存在的人', description: '短' }),
      item('relationship', 'r2', '规则种子关系', {
        source: '主角甲',
        target: '配角乙',
        description: '由规则 fallback 保留的候选线索，包含足够的上下文摘要，等待后续 AI 判断双方的依赖、误解、冲突与情绪张力。',
        evidence: ['主角甲在危机中提到配角乙的承诺。'],
        source_type: 'diagnostic_seed',
        quality_flags: ['needs_ai_repair'],
      }),
      item('timeline', 't1', '事件标题', { title: '事件标题', description: '事件标题', characters: [] }),
      item('world', 'w1', '世界观', { summary: '只有一段摘要' }),
      item('chapter', 'ch1', '第一章 插图', { is_decorative: true }, '◆◇◆◇◆◇◆◇◆◇◆◇◆◇◆◇'),
    ]);

    expect(result.analysis_status).toBe('low_quality');
    expect(result.analysis_diagnostics.suspected_mojibake_assets?.length).toBe(1);
    expect(result.analysis_diagnostics.diagnostic_seed_assets?.length).toBe(1);
    expect(result.analysis_diagnostics.fallback_quality_boundary?.ready_state_allowed).toBe(false);
    expect(result.analysis_diagnostics.decorative_chapters?.length).toBe(1);
    expect(result.analysis_diagnostics.low_confidence_characters?.length).toBe(1);
    expect(result.analysis_diagnostics.unresolved_relationship_edges?.length).toBe(2);
    expect(result.analysis_diagnostics.weak_relationships?.length).toBe(1);
    expect(result.analysis_diagnostics.timeline_mismatch_events?.length).toBe(1);
    expect(result.analysis_diagnostics.weak_world_facts?.length).toBe(1);
    expect(result.candidate_counts.recovered_assets_total).toBe(7);
    expect(result.candidate_counts.diagnostic_seed_assets).toBe(1);
    expect(result.analysis_quality_issues).toContain('发现 1 个规则 fallback 或诊断种子资产，需要 AI 修复');
  });
});
