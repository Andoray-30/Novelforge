import { describe, expect, it } from 'vitest'
import { getChapterIndexRecoveryDetails, getTaskSummary } from './task-summary'

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
})
