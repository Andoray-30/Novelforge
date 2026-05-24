import type { ContentType } from '@/types';

export type FocusedAsset = {
  key: string;
  id?: string;
  type: ContentType | string;
  title: string;
  summary: string;
  source: 'project_asset' | 'artifact';
};

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function clipFocusedAssetSummary(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '暂无摘要';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function buildFocusedAssetFromArtifact(artifact: {
  type: string;
  title: string;
  data: Record<string, unknown>;
  contentItemId?: string;
}): FocusedAsset {
  const summarySeed = [
    readString(artifact.data.summary),
    readString(artifact.data.description),
    readString(artifact.data.background),
    readString(artifact.data.content),
    JSON.stringify(artifact.data),
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? '';

  return {
    key: artifact.contentItemId ?? `artifact:${artifact.type}:${artifact.title}`,
    id: artifact.contentItemId,
    type: artifact.type,
    title: artifact.title,
    summary: clipFocusedAssetSummary(summarySeed),
    source: artifact.contentItemId ? 'project_asset' : 'artifact',
  };
}
