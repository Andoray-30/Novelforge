import { describe, expect, it } from 'vitest';
import { buildSaveAssetPreviewRows, getSaveAssetOperationLabel, getSaveAssetWarningLabel } from '@/lib/save-asset-preview';

describe('save asset preview', () => {
  it('builds readable preview rows from primary fields', () => {
    const rows = buildSaveAssetPreviewRows({
      type: 'character',
      data: {
        name: '阿岚',
        description: '守灯人，负责维持雾港灯塔。',
        source: '阿岚',
        target: '雾港',
        tags: ['守护者', '灯塔'],
      },
    });

    expect(rows).toEqual([
      { label: '名称', value: '阿岚' },
      { label: '描述', value: '守灯人，负责维持雾港灯塔。' },
      { label: '来源', value: '阿岚' },
      { label: '目标', value: '雾港' },
      { label: 'tags', value: '守护者、灯塔' },
    ]);
  });

  it('clips long preview text', () => {
    const rows = buildSaveAssetPreviewRows({
      type: 'world',
      data: {
        description: '雾'.repeat(150),
      },
    });

    expect(rows[0].value).toHaveLength(123);
    expect(rows[0].value.endsWith('...')).toBe(true);
  });

  it('detects update versus create operations', () => {
    expect(getSaveAssetOperationLabel({ id: 'asset-1', data: {} })).toBe('更新已有资产');
    expect(getSaveAssetOperationLabel({ data: { contentItemId: 'asset-2' } })).toBe('更新已有资产');
    expect(getSaveAssetOperationLabel({ data: {} })).toBe('新增资产');
  });

  it('shows chapter save destinations and replacement warnings', () => {
    expect(buildSaveAssetPreviewRows({
      type: 'chapter',
      save_destination: 'alternate_version',
      data: { content: '候选序章。' },
    })[0]).toEqual({ label: '保存位置', value: '候选版本' });

    expect(buildSaveAssetPreviewRows({
      type: 'chapter',
      data: { content: '旧协议草稿。' },
    })[0]).toEqual({ label: '保存位置', value: 'AI 草稿' });

    expect(getSaveAssetWarningLabel({
      type: 'chapter',
      id: 'chapter-1',
      data: { content: '覆盖版本。' },
    })).toContain('更新已有章节');
  });
});
