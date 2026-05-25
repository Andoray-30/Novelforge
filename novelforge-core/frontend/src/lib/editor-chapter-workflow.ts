import { buildContentCreateRequest, getContentAssetPayload, getContentAssetText } from '@/lib/content-contract';
import {
  buildPromotedAIChapterPayload,
  buildPromotedAIChapterTags,
  resolveChapterDirectoryMetadata,
  type PromotableChapterDestination,
} from '@/lib/chapter-metadata';
import type { ContentCreateRequest, ContentItem, ContentStatus } from '@/types';

export type EditorChapterFilter =
  | 'all'
  | 'imported'
  | 'ai_draft'
  | 'alternate_version'
  | 'formal_body'
  | 'formal_prologue'
  | 'extra'
  | 'archived';

export type EditorChapterAction = 'continue' | 'rewrite' | 'polish';

export type PreviousSnapshotSummary = {
  oldTitle: string | null;
  oldUpdatedAt: string | null;
  oldContent: string;
  oldExtractedData: Record<string, unknown> | null;
};

export type EditorChapterWorkflowState = {
  id: string;
  title: string;
  sourceLabel: string;
  saveDestinationLabel: string;
  chapterRoleLabel: string;
  wordCount: number;
  isAIGenerated: boolean;
  isCandidate: boolean;
  isArchived: boolean;
  hasPreviousSnapshot: boolean;
  previousSnapshot: PreviousSnapshotSummary | null;
};

export const EDITOR_CHAPTER_FILTERS: Array<{ value: EditorChapterFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'imported', label: '导入原文' },
  { value: 'ai_draft', label: 'AI 草稿' },
  { value: 'alternate_version', label: '候选版本' },
  { value: 'formal_body', label: '正式正文' },
  { value: 'formal_prologue', label: '正式序章' },
  { value: 'extra', label: '番外' },
  { value: 'archived', label: '已归档' },
];

const DESTINATION_LABELS: Record<string, string> = {
  ai_draft: 'AI 草稿',
  alternate_version: '候选版本',
  formal_body: '正式正文',
  formal_prologue: '正式序章',
  extra: '番外',
  update_existing: '覆盖已有章节',
};

const SOURCE_LABELS: Record<string, string> = {
  imported: '导入原文',
  system_split: '系统拆分',
  user_created: '手写章节',
  ai_generated: 'AI 生成',
  unknown: '未知来源',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function labelForDestination(value: string | null | undefined): string {
  return value ? DESTINATION_LABELS[value] ?? value : '未指定';
}

function labelForSource(value: string | null | undefined): string {
  return value ? SOURCE_LABELS[value] ?? value : '未知来源';
}

function getPayloadTags(item: ContentItem): string[] {
  const payload = getContentAssetPayload(item);
  return uniqueStrings([
    ...(item.metadata.tags ?? []),
    ...asStringArray(payload.tags),
    ...asStringArray(payload.quality_flags),
  ]);
}

function isArchivedChapter(item: ContentItem): boolean {
  const tags = getPayloadTags(item);
  return item.metadata.status === 'archived'
    || tags.includes('archived')
    || asString(getContentAssetPayload(item).workflow_status) === 'archived';
}

function getPreviousSnapshot(item: ContentItem): PreviousSnapshotSummary | null {
  const payload = getContentAssetPayload(item);
  const snapshot = asRecord(payload.previous_snapshot);
  if (!snapshot) {
    return null;
  }

  const oldExtractedData = asRecord(snapshot.old_extracted_data);
  const oldContent =
    asString(snapshot.old_content)
    ?? asString(snapshot.old_body)
    ?? asString(snapshot.content)
    ?? '';

  return {
    oldTitle: asString(snapshot.old_title),
    oldUpdatedAt: asString(snapshot.old_updated_at),
    oldContent,
    oldExtractedData,
  };
}

export function getEditorChapterWorkflowState(item: ContentItem): EditorChapterWorkflowState {
  const metadata = resolveChapterDirectoryMetadata(item);
  const payload = getContentAssetPayload(item);
  const tags = getPayloadTags(item);
  const saveDestination = metadata.saveDestination ?? asString(payload.save_destination);
  const sourceType = metadata.sourceType ?? asString(payload.source_type);
  const isAIGenerated = sourceType === 'ai_generated'
    || asString(payload.source_type) === 'ai_generated'
    || tags.includes('ai-generated')
    || tags.includes('ai-suggested')
    || payload.generated_by_ai === true;
  const isCandidate = isAIGenerated && (
    saveDestination === 'ai_draft'
    || saveDestination === 'alternate_version'
    || tags.includes('ai_draft')
    || tags.includes('alternate_version')
  );
  const previousSnapshot = getPreviousSnapshot(item);

  return {
    id: item.metadata.id,
    title: metadata.displayTitle,
    sourceLabel: labelForSource(sourceType),
    saveDestinationLabel: labelForDestination(saveDestination),
    chapterRoleLabel: metadata.chapterRole || '正文',
    wordCount: metadata.wordCount,
    isAIGenerated,
    isCandidate,
    isArchived: isArchivedChapter(item),
    hasPreviousSnapshot: Boolean(previousSnapshot),
    previousSnapshot,
  };
}

export function filterEditorChapters(items: ContentItem[], filter: EditorChapterFilter): ContentItem[] {
  return items.filter((item) => {
    const state = getEditorChapterWorkflowState(item);
    const metadata = resolveChapterDirectoryMetadata(item);
    const destination = metadata.saveDestination;

    if (filter === 'archived') {
      return state.isArchived;
    }
    if (state.isArchived) {
      return false;
    }
    if (filter === 'all') {
      return true;
    }
    if (filter === 'imported') {
      return metadata.sourceType === 'imported' || metadata.sourceType === 'system_split';
    }
    if (filter === 'ai_draft') {
      return destination === 'ai_draft';
    }
    if (filter === 'alternate_version') {
      return destination === 'alternate_version';
    }
    if (filter === 'formal_body') {
      return destination === 'formal_body';
    }
    if (filter === 'formal_prologue') {
      return destination === 'formal_prologue';
    }
    if (filter === 'extra') {
      return destination === 'extra';
    }
    return true;
  });
}

function buildChapterUpdateRequest(params: {
  item: ContentItem;
  title: string;
  content: string;
  data: Record<string, unknown>;
  tags: string[];
  status?: ContentStatus;
}): ContentCreateRequest {
  return buildContentCreateRequest({
    type: 'chapter',
    title: params.title,
    data: params.data,
    content: params.content,
    status: params.status ?? params.item.metadata.status,
    author: params.item.metadata.author,
    sessionId: params.item.metadata.session_id,
    parentId: params.item.metadata.parent_id,
    childrenIds: params.item.metadata.children_ids,
    tags: params.tags,
    relations: params.item.relations,
  });
}

export function buildEditorChapterPromotionRequest(
  item: ContentItem,
  destination: PromotableChapterDestination,
): ContentCreateRequest {
  const data = buildPromotedAIChapterPayload({ item, destination });
  const title = asString(data.display_title) ?? item.metadata.title;
  const content = getContentAssetText(item, data);
  return buildChapterUpdateRequest({
    item,
    title,
    content,
    data,
    tags: buildPromotedAIChapterTags(item.metadata.tags, destination),
    status: item.metadata.status === 'archived' ? 'draft' : item.metadata.status,
  });
}

export function buildEditorChapterArchiveRequest(item: ContentItem): ContentCreateRequest {
  const payload = getContentAssetPayload(item);
  const metadata = resolveChapterDirectoryMetadata(item);
  const content = getContentAssetText(item, payload);
  const qualityFlags = uniqueStrings([
    ...metadata.qualityFlags,
    ...asStringArray(payload.quality_flags),
    'archived',
  ]);
  const data = {
    ...payload,
    workflow_status: 'archived',
    archived_at: new Date().toISOString(),
    quality_flags: qualityFlags,
  };
  return buildChapterUpdateRequest({
    item,
    title: metadata.displayTitle,
    content,
    data,
    tags: uniqueStrings([...(item.metadata.tags ?? []), 'archived']),
    status: 'archived',
  });
}

export function buildEditorChapterRestoreRequest(item: ContentItem): ContentCreateRequest | null {
  const snapshot = getPreviousSnapshot(item);
  if (!snapshot) {
    return null;
  }

  const currentPayload = getContentAssetPayload(item);
  const currentContent = getContentAssetText(item, currentPayload);
  const nextTitle = snapshot.oldTitle ?? item.metadata.title;
  const nextContent = snapshot.oldContent || currentContent;
  const restoredData: Record<string, unknown> = {
    ...(snapshot.oldExtractedData ?? currentPayload),
    title: nextTitle,
    chapter_title: nextTitle,
    display_title: nextTitle,
    content: nextContent,
    recovery_snapshot: {
      current_title: item.metadata.title,
      current_content: currentContent,
      current_extracted_data: currentPayload,
      current_updated_at: item.metadata.updated_at,
      restored_at: new Date().toISOString(),
    },
  };
  delete restoredData.previous_snapshot;

  return buildChapterUpdateRequest({
    item,
    title: nextTitle,
    content: nextContent,
    data: restoredData,
    tags: item.metadata.tags ?? [],
    status: item.metadata.status,
  });
}

export function resolveEditorChapterSelection(params: {
  items: ContentItem[];
  preferredChapterId?: string | null;
  preferLatestItem?: ContentItem | null;
  currentSelectedId?: string | null;
  requestedChapterId?: string | null;
}): string | null {
  const hasItem = (id: string | null | undefined) => Boolean(id && params.items.some((item) => item.metadata.id === id));
  if (hasItem(params.preferredChapterId)) {
    return params.preferredChapterId ?? null;
  }
  if (params.preferLatestItem && hasItem(params.preferLatestItem.metadata.id)) {
    return params.preferLatestItem.metadata.id;
  }
  if (hasItem(params.currentSelectedId)) {
    return params.currentSelectedId ?? null;
  }
  if (hasItem(params.requestedChapterId)) {
    return params.requestedChapterId ?? null;
  }
  return params.items[0]?.metadata.id ?? null;
}

export function buildEditorChapterChatHandoff(item: ContentItem, action: EditorChapterAction) {
  const payload = getContentAssetPayload(item);
  const metadata = resolveChapterDirectoryMetadata(item);
  const excerpt = getContentAssetText(item, payload).replace(/\s+/g, ' ').trim().slice(0, 600);
  const actionLabel: Record<EditorChapterAction, string> = {
    continue: '继续写这一章',
    rewrite: '改写这一章',
    polish: '润色这一章',
  };
  const prompt: Record<EditorChapterAction, string> = {
    continue: `请基于当前项目资产，承接《${metadata.displayTitle}》继续写下一段。保留已有角色关系、情绪张力和叙事语气。参考片段：${excerpt}`,
    rewrite: `请基于当前项目资产，改写《${metadata.displayTitle}》。保持核心事件不变，但提升人物动机、关系张力和语言质感。参考原文：${excerpt}`,
    polish: `请润色《${metadata.displayTitle}》。不要改变剧情事实，重点提升节奏、画面感、情绪递进和句子美感。参考原文：${excerpt}`,
  };

  return {
    prompt: prompt[action],
    focusedAsset: {
      key: item.metadata.id,
      id: item.metadata.id,
      type: item.metadata.type,
      title: metadata.displayTitle,
      summary: excerpt || `${metadata.displayTitle}（暂无正文摘要）`,
      source: 'project_asset' as const,
    },
    actionLabel: actionLabel[action],
  };
}
