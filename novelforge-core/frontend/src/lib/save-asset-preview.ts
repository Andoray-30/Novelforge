import type { SaveAssetRequest } from '@/lib/chat-parser';

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

export function buildSaveAssetPreviewRows(request: Pick<SaveAssetRequest, 'data'>, maxRows = 5): SaveAssetPreviewRow[] {
  const rows: SaveAssetPreviewRow[] = [];
  const used = new Set<string>();

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
    if (used.has(field) || field === 'id' || field === 'contentItemId' || field === 'content_item_id') {
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
