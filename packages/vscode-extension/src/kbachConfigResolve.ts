import type { ColorEntry, ContainerConfig, EngineTheme } from './defaultTheme';

/**
 * A `kbach.config.js`-style theme customization — a LOCAL copy of
 * `@kbach/react`'s own `KbachConfig` type (packages/react/src/config.ts),
 * not an import: that package's compiled entry point bundles its React-
 * dependent code (hooks, `ThemeProvider`) into the same chunk as
 * `resolveKbachConfig`, with no standalone subpath export that avoids
 * pulling in a real `react` resolution — wrong for a package that, like
 * every other dependency this extension touches, deliberately stays
 * self-contained (see AGENTS.md's WASM-vendoring section for the same
 * reasoning applied to `@kbach/core-engine`). The type is duplicated
 * (zero runtime cost); the MERGE ALGORITHM below is a faithful port of
 * that package's own `resolveKbachConfig`/`resolveColors`/
 * `resolveColorEntry`/`applyOpacityToHex` — same behavior, kept in sync
 * deliberately, not reinvented.
 */
export interface KbachConfig {
  darkMode?: 'attribute' | 'class' | 'media';
  theme?: Partial<Pick<EngineTheme, 'colors' | 'spacing' | 'screens' | 'fontFamily'>>;
  extend?: {
    colors?: { [colorName: string]: ColorEntry | string | Record<string, string> | undefined; dark?: Record<string, string> };
    spacing?: Record<string, number>;
    screens?: Record<string, number>;
    fontFamily?: Record<string, string>;
    container?: ContainerConfig;
  };
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyOpacityToHex(hex: string, opacityText: string): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return hex;
  const a = Number(opacityText) / 100;
  const clamped = Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1;
  return `rgba(${rgb.join(',')},${clamped})`;
}

function resolveColorEntry(value: ColorEntry | string, lookup: (name: string) => ColorEntry | undefined): ColorEntry {
  if (typeof value !== 'string') return value;
  const slash = value.indexOf('/');
  const name = slash === -1 ? value : value.slice(0, slash);
  const opacity = slash === -1 ? undefined : value.slice(slash + 1);
  const base = lookup(name);
  if (base === undefined) return value;
  if (opacity === undefined) return base;
  return typeof base === 'string'
    ? applyOpacityToHex(base, opacity)
    : { light: applyOpacityToHex(base.light, opacity), dark: applyOpacityToHex(base.dark, opacity) };
}

function resolveColors(
  extend: { [colorName: string]: ColorEntry | string | Record<string, string> | undefined; dark?: Record<string, string> },
  existing: Record<string, ColorEntry>,
): Record<string, ColorEntry> {
  const { dark: darkExtend, ...lightExtend } = extend;

  const resolved: Record<string, ColorEntry> = {};
  const lookup = (name: string) => resolved[name] ?? existing[name];
  for (const [name, value] of Object.entries(lightExtend)) {
    if (typeof value === 'object' && value !== null && !('light' in value) && !('dark' in value)) continue;
    resolved[name] = resolveColorEntry(value as ColorEntry | string, lookup);
  }

  if (darkExtend) {
    const resolvedDark: Record<string, string> = {};
    const lookupDark = (name: string): string | undefined => {
      const found = resolvedDark[name] ?? existing[name];
      return typeof found === 'string' ? found : undefined;
    };
    for (const [name, value] of Object.entries(darkExtend)) {
      const entry = resolveColorEntry(value, lookupDark);
      resolvedDark[name] = typeof entry === 'string' ? entry : entry.dark;
    }
    for (const [name, darkValue] of Object.entries(resolvedDark)) {
      const lightEntry = resolved[name];
      if (lightEntry === undefined || typeof lightEntry !== 'string') continue;
      resolved[name] = { light: lightEntry, dark: darkValue };
    }
  }

  return resolved;
}

/**
 * Merges a `KbachConfig` into `base` (this extension's `DEFAULT_THEME`) —
 * a pure function, no side effects. Faithful port of `@kbach/react`'s own
 * `resolveKbachConfig` — see this file's own top comment for why it's a
 * port rather than an import.
 */
export function resolveKbachConfig(config: KbachConfig, base: EngineTheme): EngineTheme {
  let theme: EngineTheme = { ...base, ...config.theme };

  if (config.extend?.colors) {
    theme = { ...theme, colors: { ...theme.colors, ...resolveColors(config.extend.colors, theme.colors) } };
  }
  if (config.extend?.spacing) {
    theme = { ...theme, spacing: { ...theme.spacing, ...config.extend.spacing } };
  }
  if (config.extend?.screens) {
    theme = { ...theme, screens: { ...theme.screens, ...config.extend.screens } };
  }
  if (config.extend?.fontFamily) {
    theme = { ...theme, fontFamily: { ...theme.fontFamily, ...config.extend.fontFamily } };
  }
  if (config.extend?.container) {
    theme = { ...theme, container: { ...theme.container, ...config.extend.container } };
  }
  if (config.darkMode) {
    theme = { ...theme, darkMode: config.darkMode };
  }

  return theme;
}
