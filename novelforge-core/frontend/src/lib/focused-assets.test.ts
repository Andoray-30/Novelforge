import { describe, expect, it } from 'vitest';
import { buildFocusedAssetFromArtifact } from '@/lib/focused-assets';

describe('focused assets', () => {
  it('preserves content item identity for reopened artifacts', () => {
    const asset = buildFocusedAssetFromArtifact({
      type: 'world_setting',
      title: '雾港',
      data: { description: '迷雾中的港口' },
      contentItemId: 'world-1',
    });

    expect(asset).toEqual({
      key: 'world-1',
      id: 'world-1',
      type: 'world_setting',
      title: '雾港',
      summary: '迷雾中的港口',
      source: 'project_asset',
    });
  });

  it('keeps generated artifacts separate until they are saved to a content item', () => {
    const asset = buildFocusedAssetFromArtifact({
      type: 'relationship',
      title: '甲与乙',
      data: { description: '同盟关系' },
    });

    expect(asset.key).toBe('artifact:relationship:甲与乙');
    expect(asset.id).toBeUndefined();
    expect(asset.source).toBe('artifact');
  });
});
