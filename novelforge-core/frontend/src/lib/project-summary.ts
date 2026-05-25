import { formatDisplayTitle } from '@/lib/asset-normalization';
import type { Session } from '@/types';

export type ProjectStatus =
  | 'usable_assets'
  | 'novel_container'
  | 'creative_chat'
  | 'empty'
  | 'archived';

export type ProjectAssetStats = {
  novels: number;
  chapters: number;
  characters: number;
  worlds: number;
  timelines: number;
  relationships: number;
};

export type ProjectSummary = {
  id: string;
  title: string;
  displayTitle: string;
  status: ProjectStatus;
  statusLabel: string;
  statsLabel: string;
  hiddenByDefault: boolean;
  sortRank: number;
};

export type WorkspaceHygieneReport = {
  total: number;
  usableAssets: number;
  novelContainers: number;
  creativeChats: number;
  emptyProjects: number;
  archivedProjects: number;
  hiddenByDefault: number;
};

export const EMPTY_PROJECT_STATS: ProjectAssetStats = {
  novels: 0,
  chapters: 0,
  characters: 0,
  worlds: 0,
  timelines: 0,
  relationships: 0,
};

export function hasEffectiveAssets(stats?: ProjectAssetStats): boolean {
  if (!stats) return false;
  return stats.chapters > 0 || stats.characters > 0 || stats.worlds > 0 || stats.timelines > 0 || stats.relationships > 0;
}

export function isNovelContainerOnly(stats?: ProjectAssetStats): boolean {
  return Boolean(stats && stats.novels > 0 && !hasEffectiveAssets(stats));
}

export function buildProjectStatsLabel(stats?: ProjectAssetStats): string {
  if (!stats) return '检查中';

  const parts: string[] = [];
  if (stats.novels > 0) parts.push(`${stats.novels} 本`);
  if (stats.chapters > 0) parts.push(`${stats.chapters} 章`);
  if (stats.characters > 0) parts.push(`${stats.characters} 角色`);
  if (stats.worlds > 0) parts.push(`${stats.worlds} 世界`);
  if (parts.length === 0 && (stats.timelines > 0 || stats.relationships > 0)) {
    if (stats.timelines > 0) parts.push(`${stats.timelines} 事件`);
    if (stats.relationships > 0) parts.push(`${stats.relationships} 关系`);
  }
  return parts.length > 0 ? parts.join(' / ') : '无资产';
}

export function resolveProjectStatus(
  session: Pick<Session, 'title' | 'preview' | 'messageCount' | 'metadata'>,
  stats?: ProjectAssetStats,
): ProjectStatus {
  if (session.metadata?.hidden_by_default === true || session.metadata?.archived === true) return 'archived';
  const source = String(session.metadata?.source || session.metadata?.type || '').toLowerCase();
  const visibleText = `${session.title || ''} ${session.preview || ''}`.toLowerCase();
  if (visibleText.includes('agent trace') || visibleText.includes('mock response')) return 'archived';
  if (source.includes('smoke') || source.includes('test')) return 'archived';
  if (hasEffectiveAssets(stats)) return 'usable_assets';
  if (isNovelContainerOnly(stats)) return 'novel_container';
  if ((session.messageCount ?? 0) > 0 || session.preview.trim().length > 0) return 'creative_chat';
  return 'empty';
}

function getStatusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'usable_assets':
      return '有资产';
    case 'novel_container':
      return '仅小说容器';
    case 'creative_chat':
      return '创作对话';
    case 'archived':
      return '已归档';
    case 'empty':
    default:
      return '空项目';
  }
}

function getSortRank(status: ProjectStatus): number {
  switch (status) {
    case 'usable_assets':
      return 0;
    case 'creative_chat':
      return 1;
    case 'novel_container':
      return 2;
    case 'empty':
      return 3;
    case 'archived':
    default:
      return 4;
  }
}

export function formatProjectOptionTitle(title: string, time: string, id: string, duplicateCount: number): string {
  const safeTitle = formatDisplayTitle(title, '未命名项目');
  if (duplicateCount <= 1 && safeTitle !== '新创作对话' && safeTitle !== '新对话') {
    return safeTitle;
  }

  const date = new Date(time);
  const timeLabel = Number.isNaN(date.getTime())
    ? id.slice(0, 6)
    : `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${safeTitle} · ${timeLabel} · ${id.slice(0, 6)}`;
}

export function buildProjectSummary(
  session: Session,
  stats: ProjectAssetStats | undefined,
  duplicateCount: number,
): ProjectSummary {
  const status = resolveProjectStatus(session, stats);
  const safeTitle = formatDisplayTitle(session.title || '', '未命名项目');
  const displayTitle = formatProjectOptionTitle(safeTitle, session.time, session.id, duplicateCount);
  const statsLabel = buildProjectStatsLabel(stats);
  const hiddenByDefault = status === 'empty' || status === 'novel_container' || status === 'archived';

  return {
    id: session.id,
    title: safeTitle,
    displayTitle,
    status,
    statusLabel: getStatusLabel(status),
    statsLabel,
    hiddenByDefault,
    sortRank: getSortRank(status),
  };
}

export function buildVisibleProjectSummaries(
  sessions: Session[],
  statsBySessionId: Record<string, ProjectAssetStats | undefined>,
  currentSessionId: string | null,
  showHidden = false,
): ProjectSummary[] {
  const titleCounts = sessions.reduce<Record<string, number>>((counts, session) => {
    const title = formatDisplayTitle(session.title || '', '未命名项目');
    counts[title] = (counts[title] || 0) + 1;
    return counts;
  }, {});

  const summaries = sessions.map((session) => {
    const title = formatDisplayTitle(session.title || '', '未命名项目');
    return buildProjectSummary(session, statsBySessionId[session.id], titleCounts[title] || 0);
  });

  const visible = summaries.filter((summary) => showHidden || !summary.hiddenByDefault || summary.id === currentSessionId);

  return visible.sort((a, b) => {
    if (a.id === currentSessionId) return -1;
    if (b.id === currentSessionId) return 1;
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
    const aSession = sessions.find((session) => session.id === a.id);
    const bSession = sessions.find((session) => session.id === b.id);
    return String(bSession?.time || '').localeCompare(String(aSession?.time || ''));
  });
}

export function buildWorkspaceHygieneReport(summaries: ProjectSummary[]): WorkspaceHygieneReport {
  return summaries.reduce<WorkspaceHygieneReport>((report, summary) => {
    report.total += 1;
    if (summary.hiddenByDefault) report.hiddenByDefault += 1;

    switch (summary.status) {
      case 'usable_assets':
        report.usableAssets += 1;
        break;
      case 'novel_container':
        report.novelContainers += 1;
        break;
      case 'creative_chat':
        report.creativeChats += 1;
        break;
      case 'archived':
        report.archivedProjects += 1;
        break;
      case 'empty':
      default:
        report.emptyProjects += 1;
        break;
    }

    return report;
  }, {
    total: 0,
    usableAssets: 0,
    novelContainers: 0,
    creativeChats: 0,
    emptyProjects: 0,
    archivedProjects: 0,
    hiddenByDefault: 0,
  });
}
