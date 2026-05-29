import { describe, expect, it } from 'vitest'
import { getTaskSummary } from './task-summary'

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
})
