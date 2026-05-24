import { getContentAssetPayload, getContentAssetText } from '@/lib/content-contract';
import type { ContentItem } from '@/types';

export type ChapterSourceType = 'imported' | 'system_split' | 'user_created' | 'ai_generated' | 'unknown';

export interface ChapterDirectoryMetadata {
  displayTitle: string;
  originalTitle: string;
  sourceType: ChapterSourceType;
  sourceLabel: string;
  chapterRole: string;
  roleLabel: string;
  volumeIndex: number;
  chapterIndex: number;
  segmentIndex: number;
  isDecorative: boolean;
  wordCount: number;
  qualityFlags: string[];
  qualityFlagLabels: string[];
  sortKey: [number, number, number, number];
  isSplitSegment: boolean;
  splitLabel: string | null;
  structureLabel: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function parseChineseNumber(token: string): number {
  if (!token) {
    return 0;
  }
  if (/^\d+$/.test(token)) {
    return Number(token);
  }

  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let total = 0;
  let section = 0;
  let number = 0;

  for (const char of token) {
    if (char in digits) {
      number = digits[char];
      continue;
    }
    if (char in units) {
      const unit = units[char];
      if (unit === 10000) {
        total += (section + number) * unit;
        section = 0;
      } else {
        section += (number || 1) * unit;
      }
      number = 0;
    }
  }

  return total + section + number;
}

function inferIndexFromTitle(title: string, pattern: RegExp): number | undefined {
  const match = title.match(pattern);
  if (!match?.[1]) {
    return undefined;
  }
  const parsed = parseChineseNumber(match[1]);
  return parsed > 0 ? parsed : undefined;
}

function inferSegmentIndexFromTitle(title: string): number | undefined {
  const segmentMatch = title.match(/片段\s*0*(\d+)/i);
  if (segmentMatch?.[1]) {
    return Number(segmentMatch[1]);
  }
  const legacyMatch = title.match(/[（(]\s*0*(\d+)\s*[）)]\s*$/);
  return legacyMatch?.[1] ? Number(legacyMatch[1]) : undefined;
}

function stripSegmentSuffix(title: string): string {
  return title
    .replace(/\s*[·-]?\s*片段\s*0*\d+\s*$/i, '')
    .replace(/\s*[（(]\s*0*\d+\s*[）)]\s*$/, '')
    .trim();
}

function estimateWordCount(text: string): number {
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latinCount = (text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) ?? []).length;
  return cjkCount + latinCount;
}

function inferRole(title: string, content: string): string {
  const compactTitle = title.replace(/\s+/g, '').toLowerCase();
  if (/(目录|目次|contents)/i.test(compactTitle)) return '目录';
  if (/(插图|彩图|illustration|image)/i.test(compactTitle)) return '插图';
  if (/(序章|楔子|序幕|前言|prologue)/i.test(compactTitle)) return '序章';
  if (/(终章|尾声|后记|epilogue)/i.test(compactTitle)) return '终章';
  if (/(番外|外传|side story)/i.test(compactTitle)) return '番外';
  if (/(设定|世界观|人物介绍|角色介绍)/i.test(compactTitle)) return '设定';
  if (content.trim().length < 80 && !/[。！？.!?]/.test(content)) return '插图';
  return '正文';
}

function normalizeRole(value: string | undefined, title: string, content: string): string {
  const role = value || inferRole(title, content);
  if (['正文', '序章', '终章', '番外', '插图', '目录', '设定'].includes(role)) {
    return role;
  }
  return role.trim() || '正文';
}

function normalizeSourceType(item: ContentItem, payload: Record<string, unknown>, inferredSegmentIndex?: number): ChapterSourceType {
  const sourceType = asString(payload.source_type);
  const source = asString(payload.source);
  const tags = item.metadata.tags ?? [];

  if (sourceType === 'system_split' || payload.system_split || payload.split_part || inferredSegmentIndex) return 'system_split';
  if (sourceType === 'imported' || source === 'text_processing_import' || tags.includes('imported')) return 'imported';
  if (sourceType === 'user_created' || sourceType === 'manual' || source === 'editor_manual' || tags.includes('editor-manual')) return 'user_created';
  if (sourceType === 'ai_generated' || sourceType === 'ai_draft' || tags.includes('ai-generated') || tags.includes('ai-suggested')) return 'ai_generated';
  return 'unknown';
}

function sourceLabel(sourceType: ChapterSourceType): string {
  switch (sourceType) {
    case 'imported':
      return '导入原文';
    case 'system_split':
      return '系统拆分';
    case 'user_created':
      return '手写章节';
    case 'ai_generated':
      return 'AI 草稿';
    default:
      return '未知来源';
  }
}

function qualityFlagLabel(flag: string): string {
  switch (flag) {
    case 'decorative_or_non_narrative':
      return '非正文';
    case 'short_chapter':
      return '短章节';
    case 'system_split':
      return '拆分片段';
    default:
      return flag.replace(/_/g, ' ');
  }
}

export function resolveChapterDirectoryMetadata(item: ContentItem, fallbackIndex = 1): ChapterDirectoryMetadata {
  const payload = getContentAssetPayload(item);
  const content = getContentAssetText(item, payload);
  const displayTitle = asString(payload.display_title)
    ?? asString(payload.chapter_title)
    ?? asString(payload.title)
    ?? item.metadata.title
    ?? `第 ${fallbackIndex} 章`;
  const inferredSegmentIndex = inferSegmentIndexFromTitle(displayTitle);
  const originalTitle = asString(payload.original_title) ?? (inferredSegmentIndex ? stripSegmentSuffix(displayTitle) : displayTitle);
  const volumeIndex = Math.max(
    1,
    asNumber(payload.volume_index)
      ?? inferIndexFromTitle(originalTitle, /第\s*([一二三四五六七八九十百千万\d]+)\s*[卷部册篇]/)
      ?? 1,
  );
  const splitOriginalChapterIndex = inferredSegmentIndex
    ? inferIndexFromTitle(originalTitle, /第\s*([一二三四五六七八九十百千万\d]+)\s*[章节回]/)
    : undefined;
  const chapterIndex = Math.max(
    1,
    splitOriginalChapterIndex
      ?? asNumber(payload.chapter_index)
      ?? inferIndexFromTitle(displayTitle, /第\s*([一二三四五六七八九十百千万\d]+)\s*[章节回]/)
      ?? fallbackIndex,
  );
  const splitData = asRecord(payload.system_split);
  const segmentIndex = Math.max(
    0,
    asNumber(payload.segment_index)
      ?? asNumber(payload.split_part)
      ?? asNumber(splitData.split_part)
      ?? inferredSegmentIndex
      ?? 0,
  );
  const sourceType = normalizeSourceType(item, payload, inferredSegmentIndex);
  const chapterRole = normalizeRole(asString(payload.chapter_role), originalTitle, content);
  const wordCount = Math.max(0, Math.round(asNumber(payload.word_count) ?? estimateWordCount(content)));
  const rawQualityFlags = asStringArray(payload.quality_flags);
  const inferredDecorative = chapterRole === '插图'
    || chapterRole === '目录'
    || rawQualityFlags.includes('decorative_or_non_narrative');
  const isDecorative = asBoolean(payload.is_decorative) ?? inferredDecorative;
  const qualityFlags = Array.from(new Set([
    ...rawQualityFlags,
    ...(isDecorative ? ['decorative_or_non_narrative'] : []),
  ]));
  const isSplitSegment = sourceType === 'system_split' || segmentIndex > 0;
  const splitTotal = asNumber(splitData.split_total) ?? asNumber(payload.split_total);
  const splitLabel = isSplitSegment
    ? splitTotal && segmentIndex > 0
      ? `片段 ${segmentIndex}/${splitTotal}`
      : segmentIndex > 0
        ? `片段 ${segmentIndex}`
        : '拆分片段'
    : null;

  return {
    displayTitle,
    originalTitle,
    sourceType,
    sourceLabel: sourceLabel(sourceType),
    chapterRole,
    roleLabel: chapterRole,
    volumeIndex,
    chapterIndex,
    segmentIndex,
    isDecorative,
    wordCount,
    qualityFlags,
    qualityFlagLabels: qualityFlags.map(qualityFlagLabel),
    sortKey: [volumeIndex, chapterIndex, segmentIndex, fallbackIndex],
    isSplitSegment,
    splitLabel,
    structureLabel: `第 ${volumeIndex} 卷 · 第 ${chapterIndex} 章${splitLabel ? ` · ${splitLabel}` : ''}`,
  };
}

export function sortChaptersByDirectory(items: ContentItem[]): ContentItem[] {
  return [...items]
    .map((item, index) => ({
      item,
      metadata: resolveChapterDirectoryMetadata(item, index + 1),
    }))
    .sort((left, right) => {
      for (let i = 0; i < left.metadata.sortKey.length; i += 1) {
        const diff = left.metadata.sortKey[i] - right.metadata.sortKey[i];
        if (diff !== 0) {
          return diff;
        }
      }
      return left.item.metadata.created_at.localeCompare(right.item.metadata.created_at);
    })
    .map(({ item }) => item);
}

export function getNextManualChapterIndex(items: ContentItem[]): number {
  return items.reduce((maxIndex, item, index) => {
    const metadata = resolveChapterDirectoryMetadata(item, index + 1);
    return Math.max(maxIndex, metadata.chapterIndex);
  }, 0) + 1;
}

export function buildManualChapterPayload(params: {
  title: string;
  chapterIndex: number;
  content?: string;
  volumeIndex?: number;
}): Record<string, unknown> {
  const content = params.content ?? '';
  const wordCount = estimateWordCount(content);
  return {
    title: params.title,
    chapter_title: params.title,
    display_title: params.title,
    original_title: params.title,
    content,
    source: 'editor_manual',
    source_type: 'user_created',
    chapter_role: '正文',
    volume_index: params.volumeIndex ?? 1,
    chapter_index: params.chapterIndex,
    segment_index: 0,
    is_decorative: false,
    word_count: wordCount,
    quality_flags: wordCount > 0 && wordCount < 80 ? ['short_chapter'] : [],
  };
}

export function buildUpdatedChapterPayload(params: {
  item: ContentItem;
  title: string;
  content: string;
}): Record<string, unknown> {
  const payload = getContentAssetPayload(params.item);
  const current = resolveChapterDirectoryMetadata(params.item);
  const wordCount = estimateWordCount(params.content);
  const nextFlags = Array.from(new Set([
    ...current.qualityFlags.filter((flag) => flag !== 'short_chapter'),
    ...(wordCount > 0 && wordCount < 80 ? ['short_chapter'] : []),
  ]));

  return {
    ...payload,
    title: params.title,
    chapter_title: params.title,
    display_title: params.title,
    original_title: asString(payload.original_title) ?? current.originalTitle,
    content: params.content,
    source_type: current.sourceType,
    chapter_role: current.chapterRole,
    volume_index: current.volumeIndex,
    chapter_index: current.chapterIndex,
    segment_index: current.segmentIndex,
    is_decorative: current.isDecorative,
    word_count: wordCount,
    quality_flags: nextFlags,
  };
}
