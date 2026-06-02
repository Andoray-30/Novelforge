import { describe, expect, it } from 'vitest';
import {
  shouldRefreshCharacterLibrary,
  shouldRefreshWorldLibrary,
} from './task-refresh-scope';

describe('task refresh scope', () => {
  it('refreshes character and relationship library pages after repair writeback', () => {
    expect(shouldRefreshCharacterLibrary('import_repair_apply')).toBe(true);
  });

  it('refreshes world and timeline library pages after repair writeback', () => {
    expect(shouldRefreshWorldLibrary('import_repair_apply')).toBe(true);
  });

  it('keeps preview-only repair tasks from forcing asset library reloads', () => {
    expect(shouldRefreshCharacterLibrary('relationship_backfill')).toBe(false);
    expect(shouldRefreshCharacterLibrary('deep_asset_enrichment')).toBe(false);
    expect(shouldRefreshWorldLibrary('timeline_rebuild')).toBe(false);
    expect(shouldRefreshWorldLibrary('deep_asset_enrichment')).toBe(false);
  });

  it('keeps existing import and extraction refresh behavior', () => {
    expect(shouldRefreshCharacterLibrary('novel_import')).toBe(true);
    expect(shouldRefreshCharacterLibrary('relationship_extraction')).toBe(true);
    expect(shouldRefreshWorldLibrary('novel_import')).toBe(true);
    expect(shouldRefreshWorldLibrary('timeline_generation')).toBe(true);
  });
});
