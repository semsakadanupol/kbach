import type { FrameworkConfig, ResolvedConfig, ThemeConfig, ThemeColors, ColorShades, ColorValue, PluginAPI, StyleValue } from './types';
import { defaultTheme } from './theme';
import { clearPluginUtilities, getPluginStandaloneMap } from './utilities';
import { clearCache, injectGlobalStyles, setDefaultFontFamily } from './resolver';
import { registerModifier, clearPluginModifiers, type ModifierDef } from './registry';
import { isModeAwareColor, splitColorShadeRef } from './colorValue';
import { hexToRgba } from './resolvers/color';
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

// ─── Config singleton ───────────────────────────────────────────────────────
//
// Used to be backed by globalThis to survive CJS bundle splits: tsup used to
// bundle core/ separately into each of dist/index.js and dist/jsx-runtime.js
// (esbuild doesn't support code-splitting CJS output), so Metro loading each
// by path got independent copies of this module with independent top-level
// state. core/ is now built as its own dist/core/ entry and required
// externally by all client entries (see packages/react/tsup.config.ts), so
// there's only ever one real instance of this module to begin with — a
// plain module-level object is enough.

interface KbachConfigStore {
  resolved: ResolvedConfig | null;
  listeners: Set<ConfigListener>;
  _src?: FrameworkConfig;
}

const configStore: KbachConfigStore = { resolved: null, listeners: new Set<ConfigListener>() };

/**
 * Load, merge, and cache the resolved config.
 * Call resetConfig() to force a reload (e.g. in tests or after live update).
 */
export function getConfig(): ResolvedConfig {
  if (configStore.resolved) return configStore.resolved;
  configStore.resolved = buildConfig({});
  return configStore.resolved;
}

export function resetConfig(): void {
  configStore.resolved = null;
}

// ─── Color reference resolution ───────────────────────────────────────────────
// Allows palette references as values in the colors config:
//   brand: { 1: '#eff6ff', 6: '#6366f1', 11: 'orange-6' }
// 'orange-6' → resolved hex of orange shade 6 from the same colors map.
//
// Also allows an opacity suffix on a bare color NAME (not a family-shade pair):
//   primarySoft: { light: 'primary/30', dark: 'primary/40' }
// 'primary/30' → primary's OWN light side (since this is itself the `light`
// branch being resolved — `side` tracks that), at 30% opacity, as an rgba()
// string. Lets a derived color (a "soft"/muted variant of another color) live
// in kbach.config.js — and therefore in className, useColors(), everywhere a
// real color does — instead of only ever being computable at runtime via
// colors.alpha(), which a plain className string can't call into.

// A plain (non-mode-aware) string color has no side to speak of — `side` is
// only ever non-null while resolving one specific branch of a mode-aware pair.
type Side = 'light' | 'dark' | null;

function resolveColorRefs(colors: ThemeColors): ThemeColors {
  // Bug #2 fix: resolve alias chains up to MAX_DEPTH levels deep.
  // e.g. brand.6 → primary-6 → orange-6 → #f97316 all resolve correctly.
  const MAX_DEPTH = 5;

  function resolveChain(raw: string, side: Side): string {
    let current = raw;
    for (let i = 0; i < MAX_DEPTH; i++) {
      const next = resolveOneRef(current, side);
      if (!next || next === current) break;
      current = next;
    }
    return current;
  }

  // Nested (not module-level) so it can recurse into resolveChain for the
  // opacity case's target color — that target can itself be an alias chain
  // ('primarySoft: { light: "accent/30" }' where accent is itself 'orange-6'),
  // not necessarily already a raw hex.
  function resolveOneRef(ref: string, side: Side): string | null {
    const slashIdx = ref.indexOf('/');
    if (slashIdx > 0) {
      const baseName = ref.slice(0, slashIdx);
      const opacity = Number(ref.slice(slashIdx + 1));
      if (!Number.isFinite(opacity)) return null;

      let baseRef: string | undefined;
      const entry = colors[baseName];
      if (typeof entry === 'string') {
        baseRef = entry;
      } else if (isModeAwareColor(entry)) {
        // A mode-aware target with no side to borrow from (this opacity alias
        // itself isn't inside a light/dark branch) is ambiguous — bail rather
        // than silently guessing a side.
        if (!side) return null;
        baseRef = entry[side];
      } else if (entry && typeof entry === 'object' && '6' in entry) {
        // Bare family reference with no shade (e.g. 'brand/30') — shade 6 is
        // the same "representative middle shade" convention resolveColor()
        // itself uses for a shade-less family reference (bg-brand, no number).
        const v = (entry as ColorShades)['6'];
        baseRef = typeof v === 'string' ? v : undefined;
      }
      if (baseRef === undefined) return null;

      const baseHex = resolveChain(baseRef, side);
      const a = opacity > 1 ? opacity / 100 : opacity;
      return hexToRgba(baseHex, a);
    }

    const split = splitColorShadeRef(ref);
    if (!split) return null;
    const { name, shade } = split;
    if (!/^\d+$/.test(shade)) return null;
    const entry = colors[name];
    // entry itself being a mode-aware pair means `name` has no shades to index
    // into — nothing at colors[name][shade] to chase.
    if (!entry || typeof entry !== 'object' || isModeAwareColor(entry)) return null;
    const target = (entry as ColorShades)[shade];
    // A chain can't continue INTO a mode-aware pair (which side would it pick?)
    // — the chain simply stops here, and resolveChain's caller (resolveValue)
    // handles a mode-aware pair's own light/dark sides as their own chains.
    return typeof target === 'string' ? target : null;
  }

  // A mode-aware pair's light/dark sides are each their own independent alias
  // chain (e.g. `{ light: 'gray-2', dark: 'gray-9' }` — two ordinary string
  // aliases, just packaged together) — each resolved with its OWN side, so an
  // opacity alias partway through (`'primary/30'`) knows which of primary's
  // two sides it's standing in for.
  function resolveValue(val: ColorValue): ColorValue {
    return typeof val === 'string'
      ? resolveChain(val, null)
      : { light: resolveChain(val.light, 'light'), dark: resolveChain(val.dark, 'dark') };
  }

  const out: ThemeColors = {};
  for (const [key, val] of Object.entries(colors)) {
    if (typeof val === 'string' || isModeAwareColor(val)) {
      out[key] = resolveValue(val);
    } else {
      const shades: ColorShades = {};
      for (const [shade, v] of Object.entries(val)) {
        shades[shade] = resolveValue(v);
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
  configStore.listeners.add(listener);
  return () => configStore.listeners.delete(listener);
}

export function updateConfig(userConfig: FrameworkConfig): void {
  // Clear stale CSS (old theme's injected rules, including the global reset
  // tag) BEFORE building the new config — buildConfig()'s last step calls
  // injectGlobalStyles(), which must be the last thing to touch _globalStyleEl
  // for this update. Clearing afterward would immediately remove the reset it
  // just injected, leaving box-sizing/border-box (and every other BASE_RESET
  // rule) missing until something unrelated happens to recreate the tag.
  clearCache();
  configStore.resolved = buildConfig(userConfig);
  configStore._src = userConfig;
  for (const listener of configStore.listeners) {
    listener(configStore.resolved);
  }
}

/**
 * Like updateConfig, but only calls it when the config object reference has
 * actually changed. Used by the Babel-injected IIFE so that:
 *  - multiple files with kbach classes don't re-run the update on every load
 *  - Fast Refresh DOES re-run when kbach.config.js changes (new module → new object)
 */
export function initConfig(userConfig: FrameworkConfig): void {
  if (configStore._src === userConfig) return;
  updateConfig(userConfig);
}
