import type { SaveAssetRequest } from '@/lib/chat-parser';
import {
  getChapterSaveDestinationDescription,
  getChapterSaveDestinationLabel,
  normalizeChapterSaveDestination,
} from '@/lib/chapter-save-destinations';

export type SaveAssetPreviewRow = {
  label: string;
  value: string;
};

const FIELD_LABELS: Record<string, string> = {
  name: '名称',
  title: '标题',
  description: '描述',
  summary: '摘要',
  content: '正文',
  source: '来源',
  target: '目标',
  target_name: '目标',
  relationship_type: '关系类型',
  relationship: '关系',
  role: '角色定位',
  personality: '性格',
  background: '背景',
  date: '时间',
  absolute_time: '绝对时间',
  relative_time: '相对时间',
};

const PRIMARY_FIELDS = [
  'name',
  'title',
  'description',
  'summary',
  'content',
  'source',
  'target',
  'target_name',
  'relationship_type',
  'relationship',
  'role',
  'personality',
  'background',
  'date',
  'absolute_time',
  'relative_time',
];

export function buildSaveAssetPreviewRows(
  request: Pick<SaveAssetRequest, 'type' | 'data' | 'save_destination' | 'id' | 'should_replace_existing'>,
  maxRows = 5,
): SaveAssetPreviewRow[] {
  const rows: SaveAssetPreviewRow[] = [];
  const used = new Set<string>();

  if (request.type === 'chapter') {
    const destination = resolvePreviewDestination(request);
    rows.push({
      label: '保存位置',
      value: getChapterSaveDestinationLabel(destination),
    });
    rows.push({
      label: '影响',
      value: getChapterSaveDestinationDescription(destination),
    });
  }

  for (const field of PRIMARY_FIELDS) {
    const row = buildRow(field, request.data[field]);
    if (row) {
      rows.push(row);
      used.add(field);
    }
    if (rows.length >= maxRows) {
      return rows;
    }
  }

  for (const [field, value] of Object.entries(request.data)) {
    if (
      used.has(field)
      || field === 'id'
      || field === 'contentItemId'
      || field === 'content_item_id'
      || field === 'save_destination'
      || field === 'should_replace_existing'
    ) {
      continue;
    }

    const row = buildRow(field, value);
    if (row) {
      rows.push(row);
    }
    if (rows.length >= maxRows) {
      return rows;
    }
  }

  return rows;
}

export function getSaveAssetOperationLabel(request: Pick<SaveAssetRequest, 'id' | 'data'>): string {
  const id = request.id ?? request.data.id ?? request.data.contentItemId ?? request.data.content_item_id;
  return typeof id === 'string' && id.trim().length > 0 ? '更新已有资产' : '新增资产';
}

export function getSaveAssetWarningLabel(
  request: Pick<SaveAssetRequest, 'type' | 'id' | 'data' | 'save_destination' | 'should_replace_existing'>,
): string | null {
  if (request.type !== 'chapter') {
    return null;
  }

  const id = request.id ?? request.data.id ?? request.data.contentItemId ?? request.data.content_item_id;
  const destination = resolvePreviewDestination(request);
  if (destination === 'update_existing' && !(typeof id === 'string' && id.trim().length > 0)) {
    return '无法保存：更新已有章节需要目标章节 id。请改存为草稿/候选版本，或先选择明确的目标章节。';
  }
  if (destination === 'update_existing') {
    return '强警告：这会覆盖已有章节，请确认目标章节无误。';
  }

  return null;
}

export function getSaveAssetBlockingReason(
  request: Pick<SaveAssetRequest, 'type' | 'id' | 'data' | 'save_destination' | 'should_replace_existing'>,
): string | null {
  if (request.type !== 'chapter') {
    return null;
  }

  const destination = resolvePreviewDestination(request);
  if (destination !== 'update_existing') {
    return null;
  }

  const id = request.id ?? request.data.id ?? request.data.contentItemId ?? request.data.content_item_id;
  return typeof id === 'string' && id.trim().length > 0
    ? null
    : '更新已有章节需要目标章节 id。';
}

function buildRow(field: string, value: unknown): SaveAssetPreviewRow | null {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return null;
  }

  return {
    label: FIELD_LABELS[field] ?? field,
    value: normalized,
  };
}

function normalizeValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return clip(trimmed);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeValue(item))
      .filter((item): item is string => Boolean(item));
    return items.length > 0 ? clip(items.join('、')) : null;
  }

  if (value && typeof value === 'object') {
    return clip(JSON.stringify(value));
  }

  return null;
}

function clip(value: string, maxLength = 120): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function resolvePreviewDestination(
  request: Pick<SaveAssetRequest, 'save_destination' | 'data' | 'id' | 'should_replace_existing'>,
) {
  const explicit = request.save_destination ?? request.data.save_destination;
  const hasTarget = typeof request.id === 'string'
    || typeof request.data.id === 'string'
    || typeof request.data.contentItemId === 'string'
    || typeof request.data.content_item_id === 'string';
  const shouldReplace = request.should_replace_existing === true || request.data.should_replace_existing === true;
  return normalizeChapterSaveDestination(explicit, hasTarget || shouldReplace ? 'update_existing' : 'ai_draft');
}
