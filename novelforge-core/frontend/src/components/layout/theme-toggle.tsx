'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  applyThemePreference,
  getNextThemePreference,
  getStoredThemePreference,
  isThemePreference,
  saveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

const labels: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};

export function ThemeToggle() {
  const [preference, setPreference] = React.useState<ThemePreference>('system');
  const [resolved, setResolved] = React.useState<ResolvedTheme>('dark');

  React.useEffect(() => {
    const initialChoice = document.documentElement.dataset.themeChoice;
    const stored = isThemePreference(initialChoice) ? initialChoice : getStoredThemePreference();
    setPreference(stored);
    setResolved(applyThemePreference(stored));

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = () => {
      if (getStoredThemePreference() === 'system') {
        setResolved(applyThemePreference('system'));
      }
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const Icon = preference === 'system' ? Monitor : resolved === 'light' ? Sun : Moon;

  return (
    <button
      type="button"
      className="nf-theme-toggle"
      onClick={() => {
        const next = getNextThemePreference(preference);
        setPreference(next);
        setResolved(saveThemePreference(next));
      }}
      title={`主题：${labels[preference]}`}
      aria-label={`切换主题，当前为${labels[preference]}`}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{labels[preference]}</span>
    </button>
  );
}
