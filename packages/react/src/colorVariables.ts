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

  const lightDecls: string[] = [];
  const darkDecls: string[] = [];
  for (const [name, value] of Object.entries(theme.colors)) {
    if (typeof value === 'string') continue;
    const light = parseHexRgb(value.light);
    const dark = parseHexRgb(value.dark);
    if (!light || !dark) continue;
    lightDecls.push(`--kb-color-${name}: ${light.join(',')};`);
    darkDecls.push(`--kb-color-${name}: ${dark.join(',')};`);
  }

  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (lightDecls.length === 0) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.insertBefore(el, document.head.firstChild);
  }
  el.textContent = `:root { ${lightDecls.join(' ')} }\n${wrapDarkDecls(theme.darkMode, darkDecls.join(' '))}`;
}

/** Exported for tests only. */
export function _resetForTests(): void {
  injectedForTheme = null;
  document.getElementById(STYLE_ID)?.remove();
}
