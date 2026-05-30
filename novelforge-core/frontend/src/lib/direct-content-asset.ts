import type { ContentItem } from '@/types';

type DirectOpenValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateDirectContentAssetSession(
  item: ContentItem,
  currentSessionId: string | null | undefined,
): DirectOpenValidationResult {
  if (!currentSessionId) {
    return { ok: false, message: '请先选择项目后再查看写回资产。' };
  }

  const itemSessionId = item.metadata.session_id;
  if (itemSessionId && itemSessionId !== currentSessionId) {
    return { ok: false, message: '该资产不属于当前项目，请先切换到对应项目后再查看。' };
  }

  return { ok: true };
}
