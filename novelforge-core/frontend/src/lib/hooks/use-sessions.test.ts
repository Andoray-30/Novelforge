import { describe, expect, it } from 'vitest';
import { isInternalTestSession } from '@/lib/hooks/use-sessions';
import type { Session } from '@/types';

function session(overrides: Partial<Session>): Session {
  return {
    id: overrides.id ?? 'session-1',
    title: overrides.title ?? '正式项目',
    preview: overrides.preview ?? '',
    time: overrides.time ?? '2026-05-26T00:00:00.000Z',
    metadata: overrides.metadata,
  };
}

describe('session cleanup helpers', () => {
  it('hides obvious mock, smoke, and validation sessions from the main workspace list', () => {
    expect(isInternalTestSession(session({ title: 'Mock response conversation' }))).toBe(true);
    expect(isInternalTestSession(session({ title: 'Goal12 核心关系队列序章候选' }))).toBe(true);
    expect(isInternalTestSession(session({ title: '超时空辉夜姬 清洁提取测试' }))).toBe(true);
    expect(isInternalTestSession(session({ metadata: { source: 'smoke-test' } }))).toBe(true);
  });

  it('keeps ordinary user projects visible', () => {
    expect(isInternalTestSession(session({
      id: 'project-real-1',
      title: '银色潮汐 正式创作项目',
      preview: '她推开门，看见雨停在半空。',
      metadata: { source: 'user' },
    }))).toBe(false);
  });
});
