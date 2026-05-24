import { storage } from '@/lib/utils';

export const PROJECT_PREFERENCES_STORAGE_KEY = 'novelforge-project-preferences';
export const PROJECT_PREFERENCES_CHANGED_EVENT = 'novelforge:preferences-changed';

export interface ProjectPreferences {
  auto_save: boolean;
  show_task_center: boolean;
  default_export_format: 'json' | 'txt';
  chapter_target_words: number;
}

type StoredProjectPreferences = Record<string, ProjectPreferences>;

export const DEFAULT_PROJECT_PREFERENCES: ProjectPreferences = {
  auto_save: true,
  show_task_center: true,
  default_export_format: 'json',
  chapter_target_words: 1500,
};

function getPreferenceScopeKey(sessionId?: string | null): string {
  return sessionId || 'global';
}

export function loadStoredProjectPreferences(): StoredProjectPreferences {
  return storage.get<StoredProjectPreferences>(PROJECT_PREFERENCES_STORAGE_KEY, {});
}

export function loadProjectPreferences(sessionId?: string | null): ProjectPreferences {
  const allPreferences = loadStoredProjectPreferences();
  return allPreferences[getPreferenceScopeKey(sessionId)] || DEFAULT_PROJECT_PREFERENCES;
}

export function saveProjectPreferences(sessionId: string | null | undefined, preferences: ProjectPreferences): void {
  const scopeKey = getPreferenceScopeKey(sessionId);
  const allPreferences = loadStoredProjectPreferences();

  storage.set(PROJECT_PREFERENCES_STORAGE_KEY, {
    ...allPreferences,
    [scopeKey]: preferences,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PROJECT_PREFERENCES_CHANGED_EVENT, {
        detail: {
          scopeKey,
          preferences,
        },
      })
    );
  }
}
