export type ChapterSaveDestination =
  | 'ai_draft'
  | 'formal_body'
  | 'formal_prologue'
  | 'extra'
  | 'alternate_version'
  | 'update_existing';

export type ChapterSaveDestinationOption = {
  value: ChapterSaveDestination;
  label: string;
  description: string;
};

const DESTINATION_LABELS: Record<ChapterSaveDestination, string> = {
  ai_draft: 'AI 草稿',
  formal_body: '正式正文',
  formal_prologue: '正式序章',
  extra: '番外',
  alternate_version: '候选版本',
  update_existing: '更新已有章节',
};

const DESTINATION_DESCRIPTIONS: Record<ChapterSaveDestination, string> = {
  ai_draft: '不会覆盖原文正文，会作为 AI 草稿保存。',
  alternate_version: '会作为另一个候选版本保存，方便对比取舍。',
  formal_prologue: '会进入正式目录，作为项目的正式序章。',
  formal_body: '会进入正式目录，作为普通正文章节。',
  extra: '会作为番外或外传内容保存。',
  update_existing: '会覆盖一个已有章节，必须明确目标章节。',
};

export const CHAPTER_SAVE_DESTINATION_OPTIONS: ChapterSaveDestinationOption[] = [
  { value: 'ai_draft', label: DESTINATION_LABELS.ai_draft, description: DESTINATION_DESCRIPTIONS.ai_draft },
  { value: 'alternate_version', label: DESTINATION_LABELS.alternate_version, description: DESTINATION_DESCRIPTIONS.alternate_version },
  { value: 'formal_prologue', label: DESTINATION_LABELS.formal_prologue, description: DESTINATION_DESCRIPTIONS.formal_prologue },
  { value: 'formal_body', label: DESTINATION_LABELS.formal_body, description: DESTINATION_DESCRIPTIONS.formal_body },
  { value: 'extra', label: DESTINATION_LABELS.extra, description: DESTINATION_DESCRIPTIONS.extra },
  { value: 'update_existing', label: DESTINATION_LABELS.update_existing, description: DESTINATION_DESCRIPTIONS.update_existing },
];

const DESTINATION_FLAGS: Record<ChapterSaveDestination, string[]> = {
  ai_draft: ['ai_draft'],
  formal_body: ['formal_body'],
  formal_prologue: ['formal_prologue'],
  extra: ['extra'],
  alternate_version: ['alternate_version'],
  update_existing: ['ai_update_existing'],
};

const VALID_DESTINATIONS = new Set<ChapterSaveDestination>([
  'ai_draft',
  'formal_body',
  'formal_prologue',
  'extra',
  'alternate_version',
  'update_existing',
]);

export function normalizeChapterSaveDestination(
  value: unknown,
  fallback: ChapterSaveDestination = 'ai_draft',
): ChapterSaveDestination {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return VALID_DESTINATIONS.has(normalized as ChapterSaveDestination)
    ? normalized as ChapterSaveDestination
    : fallback;
}

export function getChapterSaveDestinationLabel(destination: unknown): string {
  return DESTINATION_LABELS[normalizeChapterSaveDestination(destination)];
}

export function getChapterSaveDestinationDescription(destination: unknown): string {
  return DESTINATION_DESCRIPTIONS[normalizeChapterSaveDestination(destination)];
}

export function getChapterSaveDestinationFlags(destination: ChapterSaveDestination): string[] {
  return DESTINATION_FLAGS[destination] ?? DESTINATION_FLAGS.ai_draft;
}

export function estimateChapterWordCount(text: string): number {
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latinCount = (text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) ?? []).length;
  return cjkCount + latinCount;
}

export function inferChapterRoleFromTitle(title: string, destination?: ChapterSaveDestination): string {
  if (destination === 'formal_prologue') {
    return '序章';
  }
  if (destination === 'extra') {
    return '番外';
  }
  if (destination === 'formal_body') {
    return '正文';
  }

  const compactTitle = title.replace(/\s+/g, '').toLowerCase();
  if (/(序章|楔子|序幕|前言|prologue)/i.test(compactTitle)) {
    return '序章';
  }
  if (/(终章|尾声|后记|epilogue)/i.test(compactTitle)) {
    return '终章';
  }
  if (/(番外|外传|side story)/i.test(compactTitle)) {
    return '番外';
  }
  return '正文';
}

export function getDestinationSortOffset(destination: ChapterSaveDestination | null): number {
  switch (destination) {
    case 'formal_prologue':
    case 'formal_body':
    case 'update_existing':
      return 0;
    case 'extra':
      return 800000;
    case 'alternate_version':
      return 900000;
    case 'ai_draft':
      return 950000;
    default:
      return 0;
  }
}
