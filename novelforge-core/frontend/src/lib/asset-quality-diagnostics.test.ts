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
    expect(looksLikeMojibake('è¶æ¶ç©º')).toBe(true);
    expect(looksLikeMojibake('超时空辉夜姬')).toBe(false);
  });

  it('builds diagnostics from recovered content assets', () => {
    const result = buildAssetQualityDiagnostics([
      item('character', 'c1', '辉夜', {
        name: '辉夜',
        description: '主角，有清晰动机，围绕归属、孤独和重逢展开，具备可直接支撑写作的情绪抓手。',
        evidence: ['发光的竹子', '月球来客'],
      }),
      item('character', 'c2', 'è§è²', { name: 'è§è²', description: '' }),
      item('relationship', 'r1', '未知关系', { source: '辉夜', target: '不存在的人', description: '短' }),
      item('timeline', 't1', '标题', { title: '标题', description: '标题', characters: [] }),
      item('world', 'w1', '世界观', { summary: '只有一段摘要' }),
      item('chapter', 'ch1', '第一卷 插图', { is_decorative: true }, '◆◇◆◇◆◇◆◇'),
    ]);

    expect(result.analysis_status).toBe('low_quality');
    expect(result.analysis_diagnostics.suspected_mojibake_assets?.length).toBe(1);
    expect(result.analysis_diagnostics.decorative_chapters?.length).toBe(1);
    expect(result.analysis_diagnostics.low_confidence_characters?.length).toBe(1);
    expect(result.analysis_diagnostics.unresolved_relationship_edges?.length).toBe(1);
    expect(result.analysis_diagnostics.weak_relationships?.length).toBe(1);
    expect(result.analysis_diagnostics.timeline_mismatch_events?.length).toBe(1);
    expect(result.analysis_diagnostics.weak_world_facts?.length).toBe(1);
    expect(result.candidate_counts.recovered_assets_total).toBe(6);
  });
});
