/** A plain hex color, or a mode-aware pair auto-expanded into a light/dark class pair by the Rust engine. */
export type ColorEntry = string | { light: string; dark: string };

export type DarkModeStrategy = 'attribute' | 'class' | 'media';

export interface ThemeConfig {
  /** e.g. "blue-6" -> "#2563eb", or "surface" -> { light, dark } */
  colors: Record<string, ColorEntry>;
  /** e.g. "4" -> 16 (px) */
  spacing: Record<string, number>;
  /** e.g. "sm" -> 640 (min-width px) */
  screens: Record<string, number>;
  darkMode: DarkModeStrategy;
}

export const defaultTheme: ThemeConfig = {
  colors: {
    'blue-6': '#2563eb',
    'blue-8': '#1e40af',
    'gray-1': '#f9fafb',
    'gray-9': '#111827',
    surface: { light: '#f9fafb', dark: '#111827' },
  },
  spacing: {
    '1': 4,
    '2': 8,
    '4': 16,
    '6': 24,
    '8': 32,
  },
  screens: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  },
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

/** Memoized JSON serialization of the active theme — passed across the WASM boundary. */
export function getThemeJson(): string {
  return activeThemeJson;
}
