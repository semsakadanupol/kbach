import type { DarkModeStrategy, ThemeConfig } from './theme';

/**
 * Parses a `#rgb`/`#rrggbb` hex string into `[r, g, b]` (0–255 each), or
 * `null` if `hex` isn't that shape — `useColors.ts` and this module both
 * need it (once for deciding whether a mode-aware color can use the CSS-
 * variable path at all, once for the actual root-variable values), kept
 * here as the one shared implementation rather than duplicated.
 */
export function parseHexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function wrapDarkDecls(strategy: DarkModeStrategy, decls: string): string {
  // Mirrors darkModeStore.ts's applyToDom/css.rs's wrap_dark_scheme — same
  // three strategies, same selector shapes, kept in sync deliberately.
  switch (strategy) {
    case 'class':
      return `.dark { ${decls} }`;
    case 'media':
      return `@media (prefers-color-scheme: dark) { :root { ${decls} } }`;
    case 'attribute':
    default:
      return `[data-theme="dark"] { ${decls} }`;
  }
}

/** Each mode-aware hex color's channels for light and dark, as `--kb-color-<name>` declarations. */
function modeAwareDecls(theme: ThemeConfig): { light: string[]; dark: string[] } {
  const light: string[] = [];
  const dark: string[] = [];
  for (const [name, value] of Object.entries(theme.colors)) {
    if (typeof value === 'string') continue;
    const l = parseHexRgb(value.light);
    const d = parseHexRgb(value.dark);
    if (!l || !d) continue;
    light.push(`--kb-color-${name}: ${l.join(',')};`);
    dark.push(`--kb-color-${name}: ${d.join(',')};`);
  }
  return { light, dark };
}

/**
 * The CSS that defines every mode-aware color's `--kb-color-<name>`
 * variable: the light values on `:root`, the dark ones under the theme's
 * dark-mode selector. Empty when the theme has no mode-aware hex colors.
 * Written into kbach.css by the static plugins, and injected at runtime by
 * `ensureColorVariablesInjected`, so both define the variables the same way.
 */
export function colorVariablesCss(theme: ThemeConfig): string {
  const { light, dark } = modeAwareDecls(theme);
  if (light.length === 0) return '';
  return `:root { ${light.join(' ')} }\n${wrapDarkDecls(theme.darkMode, dark.join(' '))}`;
}

/**
 * The theme to hand the engine when the class names on the page can't be
 * rewritten: every mode-aware color (`surface: { light, dark }`) with hex
 * on both sides becomes a plain `rgb(var(--kb-color-<name>))` reference.
 *
 * Why: for a `{ light, dark }` pair the engine EXPANDS the class
 * (`bg-surface` -> `bg-[#f9fafb] dark:bg-[#111827]`) and generates rules
 * only for the expanded text. `kb()` copes by returning the expanded string
 * as the new `className`, but a class written in source (static kbach.css)
 * or in a page's own HTML (@kbach/browser) stays `bg-surface`, so it would
 * get no rule at all. With a variable as the value, the engine emits
 * `.bg-surface { background-color: rgb(var(--kb-color-surface)) }` for the
 * class as written, and `colorVariablesCss` supplies the light and dark
 * values of that variable.
 *
 * Only for pairs where both sides parse as hex, the same rule
 * `colorVariablesCss` uses, so a reference is never emitted for a variable
 * that isn't defined. Anything else is left as it is and falls back to the
 * engine's normal expansion. Opacity suffixes (`bg-surface/50`) work: the
 * engine applies them to non-hex colors through `color-mix()`
 * (core-engine 1.0.0-beta.17+).
 */
export function withColorVariables(theme: ThemeConfig): ThemeConfig {
  let changed = false;
  const colors: ThemeConfig['colors'] = {};
  for (const [name, value] of Object.entries(theme.colors)) {
    if (typeof value !== 'string' && parseHexRgb(value.light) && parseHexRgb(value.dark)) {
      colors[name] = `rgb(var(--kb-color-${name}))`;
      changed = true;
    } else {
      colors[name] = value;
    }
  }
  return changed ? { ...theme, colors } : theme;
}

const STYLE_ID = 'kbach-colors';

// Tracks the exact theme object last injected for — a plain reference
// check, not a deep comparison: `setTheme()` always replaces the whole
// object (see theme.ts), so a new call means a new object, and repeated
// calls with the SAME object (the common case — every useColors() render)
// are free no-ops rather than re-parsing/re-writing the DOM every time.
let injectedForTheme: ThemeConfig | null = null;

/**
 * Injects a `:root { --kb-color-name: r,g,b; }` / dark-selector-wrapped
 * pair of rules — ONE variable per MODE-AWARE color in `theme.colors`
 * (plain colors need no variable at all; they're just used literally).
 * This is what lets `useColors()` hand out a `rgb(var(--kb-color-name))`
 * reference for a mode-aware color instead of a color collapsed to a fixed
 * hex at hook-call time — the browser's own cascade (this rule pair) keeps
 * it correct across light/dark with zero re-render, the same way the
 * generated CSS's own `dark:` utility rules already do for regular
 * classes. Stored as comma-separated R,G,B channel numbers, not a hex
 * string, so both plain use (`rgb(var(--x))`) and opacity-blended use
 * (`rgba(var(--x), 0.5)`, see useColors.ts's `alpha()`) read the exact
 * same variable.
 *
 * A mode-aware color whose light/dark values aren't parseable hex (rare —
 * every color in this engine's own generated palette is hex, but a
 * theme.extend.colors override technically isn't required to be) simply
 * gets no variable; useColors.ts falls back to resolving it directly
 * against the live `isDark` state instead, same as it always did.
 */
export function ensureColorVariablesInjected(theme: ThemeConfig): void {
  if (typeof document === 'undefined') return;
  if (injectedForTheme === theme) return;
  injectedForTheme = theme;

  const css = colorVariablesCss(theme);
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.insertBefore(el, document.head.firstChild);
  }
  el.textContent = css;
}

/** Exported for tests only. */
export function _resetForTests(): void {
  injectedForTheme = null;
  document.getElementById(STYLE_ID)?.remove();
}
