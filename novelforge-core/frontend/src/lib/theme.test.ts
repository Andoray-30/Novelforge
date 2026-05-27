import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  getNextThemePreference,
  getStoredThemePreference,
  saveThemePreference,
} from './theme';

describe('theme preference helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-choice');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: light)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      }),
    });
  });

  it('persists explicit theme preferences', () => {
    expect(saveThemePreference('light')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themeChoice).toBe('light');
    expect(getStoredThemePreference()).toBe('light');
  });

  it('resolves system theme without storing invalid values', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(getStoredThemePreference()).toBe('system');
    expect(applyThemePreference('system')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themeChoice).toBe('system');
  });

  it('cycles system, light, dark', () => {
    expect(getNextThemePreference('system')).toBe('light');
    expect(getNextThemePreference('light')).toBe('dark');
    expect(getNextThemePreference('dark')).toBe('system');
  });
});
