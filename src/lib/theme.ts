type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'lumi-theme-preference';

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(STORAGE_KEY) as ThemePreference) || 'system';
}

export function setThemePreference(preference: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, preference);
  applyTheme(preference);
}

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');

  if (preference === 'dark') {
    root.classList.add('dark');
  } else if (preference === 'light') {
    root.classList.add('light');
  } else {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    }
  }
}

export function initTheme() {
  const preference = getThemePreference();
  applyTheme(preference);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (getThemePreference() === 'system') {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      if (e.matches) {
        root.classList.add('dark');
      }
    }
  });
}
