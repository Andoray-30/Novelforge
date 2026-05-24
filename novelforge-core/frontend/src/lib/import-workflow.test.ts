import { describe, expect, it } from 'vitest';
import {
  buildNovelImportCompletionNotification,
  resolveNovelImportCompletionAction,
} from './import-workflow';

describe('resolveNovelImportCompletionAction', () => {
  it('switches to the imported project and focuses the novel root when import finishes elsewhere', () => {
    const action = resolveNovelImportCompletionAction(
      {
        taskId: 'task-1',
        taskType: 'novel_import',
        sessionId: 'import-session',
        status: 'COMPLETED',
        result: {
          session_id: 'import-session',
          parent_id: 'novel-root',
          book_title: '测试小说',
          chapters_count: 8,
          characters_count: 13,
          relationships_count: 12,
          timeline_count: 20,
          world_count: 1,
          analysis_status: 'completed',
        },
      },
      'current-session',
    );

    expect(action?.targetSessionId).toBe('import-session');
    expect(action?.focusedNovelId).toBe('novel-root');
    expect(action?.shouldSwitchSession).toBe(true);
    expect(action?.shouldFocusNovel).toBe(true);
    expect(action?.notification).toContain('测试小说');
    expect(action?.notification).toContain('13 角色');
  });

  it('keeps the current project when the completed import belongs to it', () => {
    const action = resolveNovelImportCompletionAction(
      {
        taskId: 'task-2',
        taskType: 'novel_import',
        sessionId: 'same-session',
        status: 'COMPLETED',
        result: {
          parent_id: 'novel-root',
          chapters_count: 2,
          analysis_status: 'low_quality',
        },
      },
      'same-session',
    );

    expect(action?.shouldSwitchSession).toBe(false);
    expect(action?.focusedNovelId).toBe('novel-root');
    expect(action?.notification).toContain('low_quality');
  });

  it('ignores unrelated task types', () => {
    const action = resolveNovelImportCompletionAction(
      {
        taskId: 'task-3',
        taskType: 'relationship_repair',
        sessionId: 'session-1',
        status: 'COMPLETED',
      },
      'session-1',
    );

    expect(action).toBeNull();
  });
});

describe('buildNovelImportCompletionNotification', () => {
  it('summarizes counts without requiring the current UI shell', () => {
    const message = buildNovelImportCompletionNotification({
      book_title: '长篇样本',
      chapters_count: 8,
      characters_count: 9,
      world_count: 1,
      analysis_status: 'completed',
    });

    expect(message).toContain('长篇样本');
    expect(message).toContain('8 章');
    expect(message).toContain('9 角色');
    expect(message).toContain('1 世界观');
  });
});
