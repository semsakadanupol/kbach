// Deliberately simpler than @kbach/react's theme.ts — no mode-aware color
// objects (dark: isn't applied yet on native) and no responsive screens map
// (not applied yet either); base styles only. Kept as its own independent
// module rather than importing @kbach/react's ThemeConfig type — a bare RN
// project shouldn't need to install a web-oriented package just for a type.
export interface ThemeConfig {
  /** Plain hex only, this pass — e.g. "blue-6" -> "#2563eb" */
  colors: Record<string, string>;
  spacing: Record<string, number>;
  screens: Record<string, number>;
  darkMode: 'attribute' | 'class' | 'media';
}

export const defaultTheme: ThemeConfig = {
  colors: {
    'blue-6': '#2563eb',
    'blue-8': '#1e40af',
    'gray-1': '#f9fafb',
    'gray-9': '#111827',
  },
  spacing: {
    '1': 4,
    '2': 8,
    '4': 16,
    '6': 24,
    '8': 32,
  },
  screens: {},
  darkMode: 'attribute',
};

let activeTheme: ThemeConfig = defaultTheme;
let activeThemeJson: string = JSON.stringify(defaultTheme);

export function setTheme(theme: ThemeConfig): void {
  activeTheme = theme;
  activeThemeJson = JSON.stringify(theme);
}

export function getTheme(): ThemeConfig {
  return activeTheme;
}

/** Memoized JSON serialization of the active theme — passed across the JNI boundary. */
export function getThemeJson(): string {
  return activeThemeJson;
}
