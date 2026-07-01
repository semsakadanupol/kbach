// ─── Platform ────────────────────────────────────────────────────────────────

export type Platform = 'web' | 'native';
export type ThemeMode = 'light' | 'dark' | 'system';

// ─── Style primitives ────────────────────────────────────────────────────────

export interface StyleValue {
  [key: string]: string | number | undefined | null | StyleValue | StyleValue[];
}

// ─── Parsed class ────────────────────────────────────────────────────────────

export interface ParsedClass {
  /** The original class string, e.g. "dark:hover:bg-[#fff]" */
  original: string;
  /** Up to 3 modifier prefixes, e.g. ['dark', 'hover'] */
  modifiers: string[];
  /** Whether a leading `-` was present for negative values */
  negative: boolean;
  /** Whether a leading `!` was present — applies !important to all CSS declarations */
  important: boolean;
  /** The utility name, e.g. 'bg', 'p', 'text' */
  utility: string;
  /** The resolved value, e.g. 'white', '#fff', '4' */
  value: string;
  /** Whether the value was specified with bracket notation [value] */
  isArbitrary: boolean;
}

// ─── Resolved style ──────────────────────────────────────────────────────────

export interface ResolvedStyle {
  /** Base styles applied unconditionally */
  base?: StyleValue;
  /** Styles keyed by modifier or modifier combo, e.g. 'dark', 'hover', 'dark:hover' */
  [modifierKey: string]: StyleValue | undefined;
}

// ─── Theme config ────────────────────────────────────────────────────────────

export type ColorShades = Record<string, string>;
export type ThemeColors = Record<string, string | ColorShades>;
export type ThemeSpacing = Record<string, number | string>;

export interface ThemeConfig {
  colors: ThemeColors;
  spacing: ThemeSpacing;
  fontSize: Record<string, number | string>;
  fontFamily: Record<string, string | string[]>;
  fontWeight: Record<string, string | number>;
  borderRadius: Record<string, number | string>;
  borderWidth: Record<string, number>;
  opacity: Record<string, number>;
  lineHeight: Record<string, number | string>;
  letterSpacing: Record<string, number | string>;
  zIndex: Record<string, number | string>;
  flex: Record<string, number | string>;
  shadow: Record<string, StyleValue>;
  screens: Record<string, string | number>;
  [key: string]: unknown;
}

// ─── Framework config (kbach.config.js) ──────────────────────────────────────

/**
 * 'class'     — toggles .dark class on <html>
 * 'media'     — uses prefers-color-scheme media query
 * 'attribute' — uses data-theme="dark" attribute on <html>
 */
export type DarkMode = 'attribute' | 'class' | 'media';

export interface PluginAPI {
  addUtility(name: string, styles: StyleValue): void;
  /**
   * Register a custom variant.
   *
   * Pass a CSS selector string for simple cases — it is automatically
   * converted into a ModifierDef that generates correct CSS rules:
   *   addVariant('hocus', ':hover, :focus')  // pseudo
   *   addVariant('supports-grid', '@media (display: grid)')  // media
   *   addVariant('dark-green', '.dark-green')  // ancestor selector
   *
   * Pass a full ModifierDef object for advanced control (e.g. JS-trackable
   * interactive variants with custom jsMatch logic).
   */
  addVariant(name: string, selectorOrDef: string | import('./registry').ModifierDef): void;
  theme(path: string, defaultValue?: unknown): unknown;
  e(className: string): string;
}

export interface FrameworkConfig {
  darkMode?: DarkMode;
  theme?: Partial<ThemeConfig>;
  /** Additive theme extension — accepts either `extend.theme.X` or `extend.X` directly. */
  extend?: { theme?: Partial<ThemeConfig> } & Partial<ThemeConfig>;
  plugins?: Array<(api: PluginAPI) => void>;
  content?: string[];
}

export interface ResolvedConfig {
  darkMode: DarkMode;
  theme: ThemeConfig;
  plugins: Array<(api: PluginAPI) => void>;
}
