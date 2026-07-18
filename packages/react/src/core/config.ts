import type { FrameworkConfig, ResolvedConfig, ThemeConfig, ThemeColors, ColorShades, PluginAPI, StyleValue } from './types';
import { defaultTheme } from './theme';
import { clearPluginUtilities, getPluginStandaloneMap } from './utilities';
import { clearCache, injectGlobalStyles, setDefaultFontFamily } from './resolver';
import { registerModifier, clearPluginModifiers, type ModifierDef } from './registry';
import { kbachWarn } from './devWarn';

// ─── Deep merge ───────────────────────────────────────────────────────────────

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const baseVal = base[key];
    const overVal = override[key];
    if (
      baseVal !== null && typeof baseVal === 'object' && !Array.isArray(baseVal) &&
      overVal !== null && typeof overVal === 'object' && !Array.isArray(overVal)
    ) {
      (result as Record<string, unknown>)[key as string] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else if (overVal !== undefined) {
      (result as Record<string, unknown>)[key as string] = overVal;
    }
  }
  return result;
}

// ─── Config singleton (globalThis-backed to survive CJS bundle splits) ────────
//
// tsup creates separate self-contained CJS bundles for dist/index.js and
// dist/jsx-runtime.js. Metro (React Native) loads each by path, giving them
// independent module-level variables. Using globalThis ensures all bundles
// share one config instance.

interface KbachConfigStore {
  resolved: ResolvedConfig | null;
  listeners: Set<ConfigListener>;
  customVariants: Record<string, string>;
  _src?: FrameworkConfig;
}

const CONFIG_KEY = '__kbach_config_store__';

function getConfigStore(): KbachConfigStore {
  const g = globalThis as Record<string, unknown>;
  if (!g[CONFIG_KEY]) {
    g[CONFIG_KEY] = { resolved: null, listeners: new Set<ConfigListener>(), customVariants: {} };
  }
  return g[CONFIG_KEY] as KbachConfigStore;
}

/**
 * Load, merge, and cache the resolved config.
 * Call resetConfig() to force a reload (e.g. in tests or after live update).
 */
export function getConfig(): ResolvedConfig {
  const store = getConfigStore();
  if (store.resolved) return store.resolved;
  store.resolved = buildConfig({});
  return store.resolved;
}

export function resetConfig(): void {
  getConfigStore().resolved = null;
}

// ─── Color reference resolution ───────────────────────────────────────────────
// Allows palette references as values in the colors config:
//   brand: { 1: '#eff6ff', 6: '#6366f1', 11: 'orange-6' }
// 'orange-6' → resolved hex of orange shade 6 from the same colors map.

function resolveOneRef(ref: string, colors: ThemeColors): string | null {
  // Split on the LAST hyphen (not a regex) so hyphenated custom color group
  // names like 'warm-gray-6' split into name='warm-gray', shade='6' — matching
  // the same lookup logic resolveColor() uses in utilities.ts.
  const lastDash = ref.lastIndexOf('-');
  if (lastDash <= 0) return null;
  const name = ref.slice(0, lastDash);
  const shade = ref.slice(lastDash + 1);
  if (!/^\d+$/.test(shade)) return null;
  const entry = colors[name];
  if (!entry || typeof entry !== 'object') return null;
  return (entry as ColorShades)[shade] ?? null;
}

function resolveColorRefs(colors: ThemeColors): ThemeColors {
  // Bug #2 fix: resolve alias chains up to MAX_DEPTH levels deep.
  // e.g. brand.6 → primary-6 → orange-6 → #f97316 all resolve correctly.
  const MAX_DEPTH = 5;

  function resolveChain(raw: string): string {
    let current = raw;
    for (let i = 0; i < MAX_DEPTH; i++) {
      const next = resolveOneRef(current, colors);
      if (!next || next === current) break;
      current = next;
    }
    return current;
  }

  const out: ThemeColors = {};
  for (const [key, val] of Object.entries(colors)) {
    if (typeof val === 'string') {
      out[key] = resolveChain(val);
    } else {
      const shades: ColorShades = {};
      for (const [shade, hex] of Object.entries(val)) {
        shades[shade] = resolveChain(hex);
      }
      out[key] = shades;
    }
  }
  return out;
}

export function buildConfig(userConfig: FrameworkConfig): ResolvedConfig {
  let theme: ThemeConfig = { ...defaultTheme };

  // 1. Apply theme overrides (replace sections entirely — a shallow merge, not
  // deepMerge, so e.g. specifying one `colors` shade drops the rest of the
  // default palette instead of merging into it. Use `extend` for additive merging.)
  if (userConfig.theme) {
    theme = { ...theme, ...(userConfig.theme as Partial<ThemeConfig>) };
  }

  // 2. Merge extend (additive — keeps defaults).
  // Accepts theme keys either nested under extend.theme or directly under extend:
  //   extend: { theme: { fontFamily: {...} } }   ← nested form
  //   extend: { fontFamily: {...} }               ← shorthand form (both work)
  if (userConfig.extend) {
    const extendConfig = userConfig.extend as { theme?: Partial<ThemeConfig> } & Partial<ThemeConfig>;
    const { theme: nestedTheme, ...directKeys } = extendConfig;
    const extSources: Partial<Record<string, unknown>>[] = [];
    if (nestedTheme) extSources.push(nestedTheme);
    if (Object.keys(directKeys).length) extSources.push(directKeys);

    for (const ext of extSources) {
      for (const [key, value] of Object.entries(ext)) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          if (process.env.NODE_ENV !== 'production') {
            kbachWarn(`extend.${key} should be an object, got ${typeof value} — skipped`);
          }
          continue;
        }
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          (theme as Record<string, unknown>)[key] = deepMerge(
            ((theme as Record<string, unknown>)[key] ?? {}) as Record<string, unknown>,
            value as Record<string, unknown>,
          );
        }
      }
    }
  }

  // 3. Resolve palette references in color values ('orange-6' → '#f47c0c')
  theme = { ...theme, colors: resolveColorRefs(theme.colors) };

  const resolved: ResolvedConfig = {
    darkMode: userConfig.darkMode ?? 'attribute',
    theme,
    plugins: userConfig.plugins ?? [],
  };

  // 3. Reset plugin-added utilities/modifiers/variants, then run plugins fresh
  if (userConfig.plugins !== undefined) {
    clearPluginUtilities();
    clearPluginModifiers();
  }
  const _store = getConfigStore();
  for (const k of Object.keys(_store.customVariants)) delete _store.customVariants[k];
  const pluginAPI = makePluginAPI(resolved.theme);
  for (const plugin of resolved.plugins) {
    plugin(pluginAPI);
  }

  // 4. Propagate the default sans font so flatten() can apply it as a base inline style.
  // 'System' is the RN-only placeholder — skip it so native elements stay untouched.
  const rawSans = theme.fontFamily?.sans;
  const sansFontValue = Array.isArray(rawSans) ? rawSans[0] : rawSans;
  setDefaultFontFamily(sansFontValue && sansFontValue !== 'System' ? sansFontValue : undefined);

  // 5. Inject global CSS derived from the theme (web only, no-op on RN/SSR)
  injectGlobalStyles(resolved.theme);

  return resolved;
}

// ─── Plugin API ───────────────────────────────────────────────────────────────

/**
 * Convert a CSS selector string into a ModifierDef so addVariant() selectors
 * participate in both CSS generation AND JS inline-style evaluation.
 *
 * Heuristics (order matters):
 *   '@media ...'          → mediaQuery modifier (css-only)
 *   '::...' or ':...'    → pseudo modifier (css-only)
 *   '.ancestor ...' etc. → ancestorSelector modifier (css-only)
 */
function _selectorToModifierDef(selector: string): ModifierDef {
  const s = selector.trim();
  if (s.startsWith('@media ')) {
    return { mediaQuery: s.slice(7), jsBehavior: 'css-only', forcesImportant: true };
  }
  // Simple pseudo-class/element: starts with : or :: but no spaces, &, or functional pseudo parens
  if (s.startsWith('::') || (s.startsWith(':') && !s.includes(' ') && !s.includes('&') && !s.includes('('))) {
    return { pseudo: s, jsBehavior: 'css-only', forcesImportant: true };
  }
  // Treat everything else as an ancestor selector (includes '.group-*', '[data-*]', etc.)
  return { ancestorSelector: s.endsWith(' ') ? s : `${s} `, jsBehavior: 'css-only', forcesImportant: true };
}

function makePluginAPI(theme: ThemeConfig): PluginAPI {
  const standalone = getPluginStandaloneMap();

  return {
    addUtility(name, styles: StyleValue) {
      standalone[name] = styles;
    },

    addVariant(name, selectorOrDef: string | ModifierDef) {
      // Accept either a raw CSS selector string (backward compat) or a full ModifierDef.
      const def: ModifierDef = typeof selectorOrDef === 'string'
        ? _selectorToModifierDef(selectorOrDef)
        : selectorOrDef;
      const selector = typeof selectorOrDef === 'string' ? selectorOrDef
        : selectorOrDef.pseudo ?? selectorOrDef.mediaQuery ?? selectorOrDef.ancestorSelector ?? null;
      // Only store in customVariants when we have an actual CSS selector (not a JS-only variant)
      if (selector !== null && selector !== name) customVariants[name] = selector;
      registerModifier(name, def);
    },

    theme(path: string, defaultValue?: unknown) {
      const parts = path.replace(/\[([^\]]+)\]/g, '.$1').split('.');
      let current: unknown = theme;
      for (const part of parts) {
        if (current === null || typeof current !== 'object') return defaultValue;
        current = (current as Record<string, unknown>)[part];
      }
      return current ?? defaultValue;
    },

    e(className: string) {
      return className.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&');
    },
  };
}

// ─── Live config update ───────────────────────────────────────────────────────

type ConfigListener = (config: ResolvedConfig) => void;

export function onConfigChange(listener: ConfigListener): () => void {
  const store = getConfigStore();
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function updateConfig(userConfig: FrameworkConfig): void {
  const store = getConfigStore();
  store.resolved = buildConfig(userConfig);
  store._src = userConfig;
  clearCache();
  for (const listener of store.listeners) {
    listener(store.resolved);
  }
}

/**
 * Like updateConfig, but only calls it when the config object reference has
 * actually changed. Used by the Babel-injected IIFE so that:
 *  - multiple files with kbach classes don't re-run the update on every load
 *  - Fast Refresh DOES re-run when kbach.config.js changes (new module → new object)
 */
export function initConfig(userConfig: FrameworkConfig): void {
  if (getConfigStore()._src === userConfig) return;
  updateConfig(userConfig);
}

/**
 * Custom variants registered via plugins (modifier name → CSS selector template).
 * Reads from globalThis store so it's consistent across CJS bundle boundaries.
 */
export const customVariants: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  {
    get(_t, p: string | symbol) {
      return typeof p === 'string' ? getConfigStore().customVariants[p] : undefined;
    },
    set(_t, p: string | symbol, v: string) {
      if (typeof p === 'string') getConfigStore().customVariants[p] = v;
      return true;
    },
    ownKeys() { return Object.keys(getConfigStore().customVariants); },
    getOwnPropertyDescriptor(_t, p: string | symbol) {
      if (typeof p !== 'string') return undefined;
      const v = getConfigStore().customVariants[p];
      return v !== undefined ? { value: v, writable: true, enumerable: true, configurable: true } : undefined;
    },
  },
);
