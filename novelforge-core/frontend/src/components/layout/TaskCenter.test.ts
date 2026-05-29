import { describe, expect, it } from 'vitest'
import { getChapterIndexRecoveryDetails, getRepairApplyWrittenAssets, getRepairPreviewWritebackDetails, getTaskSummary } from './task-summary'

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
    expect(details?.retryable).toEqual(['第二章：gateway_timeout'])
    expect(details?.runKey).toBe('chapter_index_run_current')
    expect(details?.previousRunKey).toBe('chapter_index_run_previous')
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
})
