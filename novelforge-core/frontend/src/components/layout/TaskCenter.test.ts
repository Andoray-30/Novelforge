import { describe, expect, it } from 'vitest'
import {
  getChapterIndexRecoveryDetails,
  getRepairApplyWrittenAssetHref,
  getRepairApplyWrittenAssets,
  getRepairPreviewBatchDetails,
  getRepairPreviewWritebackDetails,
  getTaskSummary,
} from './task-summary'

describe('TaskCenter summaries', () => {
  it('shows reused chapter index history in repair previews', () => {
    const summary = getTaskSummary({
      type: 'relationship_backfill',
      status: 'COMPLETED',
      result: {
        relationships_count: 1,
        timeline_count: 0,
        candidate_counts: {
          chapter_index_history_reused: 7,
          chapter_index_combined_indices: 8,
        },
        repair_diff: {
          relationships: { new: 1, duplicates: 0, total: 1 },
          timeline: { new: 0, duplicates: 0, total: 0 },
        },
      },
    })

    expect(summary).toContain('复用历史成功章 7 章，合并索引 8 章。')
    expect(summary).toContain('关系新增 1 / 跳过 0')
  })

  it('shows split repair batch count in repair preview summary', () => {
    const summary = getTaskSummary({
      type: 'chapter_index_rerun',
      status: 'COMPLETED',
      result: {
        relationships_count: 0,
        timeline_count: 0,
        candidate_counts: {
          chapter_index_repair_batch_count: 2,
        },
      },
    })

    expect(summary).toContain('按错误类型拆成 2 批修复。')
  })

  it('builds chapter index recovery details from repair previews', () => {
    const details = getChapterIndexRecoveryDetails({
      chapter_indices: [
        { chapter_id: 'chapter-1', chapter_title: '第一章' },
        { chapter_id: 'chapter-2', chapter_title: '第二章' },
      ],
      analysis_diagnostics: {
        chapter_index_run_key: 'chapter_index_run_current',
        chapter_index_history_run_key: 'chapter_index_run_previous',
        chapter_index_history_reused_chapters: ['chapter-1'],
      },
      chapter_index_status: [
        { chapter_id: 'chapter-2', chapter_title: '第二章', status: 'failed', needs_retry: true, error_type: 'gateway_timeout' },
      ],
    })

    expect(details?.reused).toEqual(['第一章'])
    expect(details?.retryable).toEqual(['第二章：网关超时'])
    expect(details?.runKey).toBe('chapter_index_run_current')
    expect(details?.previousRunKey).toBe('chapter_index_run_previous')
  })

  it('builds repair batch details from preview diagnostics', () => {
    const details = getRepairPreviewBatchDetails({
      analysis_diagnostics: {
        repair_strategy_batches: [
          {
            batch_key: 'repair_batch_1_shrink_chunk_and_extend_timeout',
            chapter_ids: ['chapter-1'],
            repair_strategy: {
              actions: ['shrink_chunk_and_extend_timeout'],
              error_types: ['gateway_timeout'],
              chapter_count: 1,
            },
          },
          {
            batch_key: 'repair_batch_2_prefer_json_repair',
            chapter_ids: ['chapter-2', 'chapter-3'],
            repair_strategy: {
              actions: ['prefer_json_repair'],
              error_types: ['json_invalid'],
              chapter_count: 2,
            },
          },
        ],
        model_route_batches: [
          {
            batch_key: 'repair_batch_1_shrink_chunk_and_extend_timeout',
            model_route: {
              selected_model: 'slow-stable-model',
              health_rankings: [
                {
                  model: 'slow-stable-model',
                  score: 28,
                  reason: 'positive_history',
                  successful_attempts: 2,
                  failed_attempts: 0,
                },
              ],
            },
          },
          {
            batch_key: 'repair_batch_2_prefer_json_repair',
            model_route: { selected_model: 'json-repair-model' },
          },
        ],
      },
    })

    expect(details).toHaveLength(2)
    expect(details[0]).toMatchObject({
      chapterCount: 1,
      actionLabel: '缩短分段并延长超时',
      errorTypeLabel: '网关超时',
      modelLabel: 'slow-stable-model',
      healthRankingLabel: '健康分 28 · 历史成功率较高 · 成功 2 · 失败 0',
    })
    expect(details[1]).toMatchObject({
      chapterCount: 2,
      actionLabel: 'JSON 修复优先',
      errorTypeLabel: 'JSON 不合规',
      modelLabel: 'json-repair-model',
    })
  })

  it('builds writeback details for repair previews', () => {
    const details = getRepairPreviewWritebackDetails({
      repair_type: 'all',
      relationships_count: 4,
      timeline_count: 2,
      repair_diff: {
        relationships: { new: 3, duplicates: 1 },
        timeline: { new: 2, duplicates: 0 },
      },
    })

    expect(details).toMatchObject({
      relationshipNew: 3,
      relationshipDuplicates: 1,
      timelineNew: 2,
      timelineDuplicates: 0,
      applyTypes: ['relationships', 'timeline'],
      hasWritableAssets: true,
    })
  })

  it('summarizes written assets after repair apply', () => {
    const result = {
      relationships_count: 1,
      timeline_count: 1,
      written_assets: [
        { id: 'rel-1', type: 'relationship', title: '林墨 -> 周岚' },
        { id: 'time-1', type: 'timeline', title: '并肩前行' },
      ],
    }

    expect(getRepairApplyWrittenAssets(result)).toEqual([
      { id: 'rel-1', type: 'relationship', title: '林墨 -> 周岚' },
      { id: 'time-1', type: 'timeline', title: '并肩前行' },
    ])
    expect(getTaskSummary({ type: 'import_repair_apply', status: 'COMPLETED', result })).toContain('新增修复资产 2 个')
  })

  it('routes written repair assets to their owning library page', () => {
    expect(getRepairApplyWrittenAssetHref({ id: 'rel-1', type: 'relationship', title: '关系' })).toBe('/characters?assetId=rel-1')
    expect(getRepairApplyWrittenAssetHref({ id: 'timeline 1', type: 'timeline', title: '时间线' })).toBe('/world?assetId=timeline%201')
    expect(getRepairApplyWrittenAssetHref({ id: 'unknown', type: 'note', title: '未知' })).toBe('/analytics')
  })
})
