const CHARACTER_LIBRARY_REFRESH_TASK_TYPES = new Set([
  'novel_import',
  'extraction',
  'character_generation',
  'relationship_extraction',
  'import_repair_apply',
]);

const WORLD_LIBRARY_REFRESH_TASK_TYPES = new Set([
  'novel_import',
  'extraction',
  'world_building',
  'timeline_generation',
  'import_repair_apply',
]);

export function shouldRefreshCharacterLibrary(taskType: string): boolean {
  return CHARACTER_LIBRARY_REFRESH_TASK_TYPES.has(taskType);
}

export function shouldRefreshWorldLibrary(taskType: string): boolean {
  return WORLD_LIBRARY_REFRESH_TASK_TYPES.has(taskType);
}
