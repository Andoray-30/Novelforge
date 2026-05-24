import { describe, expect, it } from 'vitest';
import {
  buildProjectSummary,
  buildProjectStatsLabel,
  buildVisibleProjectSummaries,
  buildWorkspaceHygieneReport,
  resolveProjectStatus,
  type ProjectAssetStats,
} from './project-summary';
import type { Session } from '@/types';

const emptyStats: ProjectAssetStats = {
  novels: 0,
  chapters: 0,
  characters: 0,
  worlds: 0,
  timelines: 0,
  relationships: 0,
};

function session(id: string, title: string, preview = '', time = '2026-05-24T00:00:00.000Z'): Session {
  return { id, title, preview, time };
}

describe('project-summary', () => {
  it('labels effective assets separately from novel-only containers', () => {
    expect(resolveProjectStatus(session('a', 'A'), { ...emptyStats, novels: 1, chapters: 8 })).toBe('usable_assets');
    expect(resolveProjectStatus(session('b', 'B'), { ...emptyStats, novels: 1 })).toBe('novel_container');
    expect(resolveProjectStatus(session('c', 'C', 'hello'), emptyStats)).toBe('creative_chat');
    expect(resolveProjectStatus({ ...session('m', 'M'), messageCount: 2 }, emptyStats)).toBe('creative_chat');
    expect(resolveProjectStatus(session('d', 'D'), emptyStats)).toBe('empty');
  });

  it('archives smoke or explicitly hidden projects before applying asset labels', () => {
    expect(resolveProjectStatus({ ...session('s', 'Smoke'), metadata: { source: 'smoke' } }, { ...emptyStats, chapters: 8 })).toBe('archived');
    expect(resolveProjectStatus({ ...session('h', 'Hidden'), metadata: { hidden_by_default: true } }, emptyStats)).toBe('archived');
  });

  it('formats asset counts for project selectors', () => {
    expect(buildProjectStatsLabel({ ...emptyStats, novels: 1, chapters: 8, characters: 13, worlds: 1 })).toBe(
      '1 本 / 8 章 / 13 角色 / 1 世界',
    );
    expect(buildProjectStatsLabel({ ...emptyStats, novels: 1 })).toBe('1 本');
    expect(buildProjectStatsLabel(emptyStats)).toBe('无资产');
  });

  it('hides empty and container-only projects by default while keeping the current one visible', () => {
    const sessions = [
      session('container', '超时空辉夜姬 提取项目', '', '2026-05-24T10:00:00.000Z'),
      session('usable', '超时空辉夜姬', '', '2026-05-24T09:00:00.000Z'),
      session('chat', 'AI创作对话', '写一个序章', '2026-05-24T08:00:00.000Z'),
      session('empty', '新创作对话', '', '2026-05-24T07:00:00.000Z'),
    ];

    const summaries = buildVisibleProjectSummaries(
      sessions,
      {
        container: { ...emptyStats, novels: 1 },
        usable: { ...emptyStats, novels: 1, chapters: 8, characters: 13 },
        chat: emptyStats,
        empty: emptyStats,
      },
      'container',
    );

    expect(summaries.map((item) => item.id)).toEqual(['container', 'usable', 'chat']);
    expect(summaries.find((item) => item.id === 'empty')).toBeUndefined();
    expect(summaries[0].statusLabel).toBe('仅小说容器');
  });

  it('can show hidden projects for maintenance views', () => {
    const summaries = buildVisibleProjectSummaries(
      [session('empty', '新创作对话')],
      { empty: emptyStats },
      null,
      true,
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].status).toBe('empty');
  });

  it('builds a read-only workspace hygiene report from summaries', () => {
    const summaries = [
      buildProjectSummary(session('usable', 'U'), { ...emptyStats, chapters: 1 }, 1),
      buildProjectSummary(session('container', 'C'), { ...emptyStats, novels: 1 }, 1),
      buildProjectSummary(session('chat', 'Chat', 'hello'), emptyStats, 1),
      buildProjectSummary(session('empty', 'E'), emptyStats, 1),
      buildProjectSummary({ ...session('smoke', 'S'), metadata: { source: 'smoke' } }, { ...emptyStats, chapters: 1 }, 1),
    ];

    expect(buildWorkspaceHygieneReport(summaries)).toEqual({
      total: 5,
      usableAssets: 1,
      novelContainers: 1,
      creativeChats: 1,
      emptyProjects: 1,
      archivedProjects: 1,
      hiddenByDefault: 3,
    });
  });
});
