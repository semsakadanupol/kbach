import type { ThemeConfig } from '../../react/src/theme';
import { parseHexRgb } from '../../react/src/colorVariables';

/**
 * The theme @kbach/browser hands the engine: the resolved theme with every
 * mode-aware color (`surface: { light, dark }`) replaced by a plain
 * `rgb(var(--kb-color-<name>))` reference.
 *
 * Why: for a `{ light, dark }` pair the engine EXPANDS the class
 * (`bg-surface` -> `bg-[#f9fafb] dark:bg-[#111827]`) and generates rules
 * only for the expanded text. `kb()` handles that by handing the expanded
 * string back as the new `className`. A CDN script only sees `class=""`
 * attributes it doesn't own, so it can't rewrite them without fighting the
 * page's own JS (`classList.contains('bg-surface')` would break, and every
 * rewrite would re-trigger its own MutationObserver). With a CSS-variable
 * value, the engine emits `.bg-surface { background-color:
 * rgb(var(--kb-color-surface)) }` against the class AS WRITTEN, and
 * `ensureColorVariablesInjected` (@kbach/react's colorVariables.ts) supplies the
 * light/dark values of that variable for the configured dark-mode strategy.
 *
 * Only for pairs where both sides are parseable hex. That's the same rule
 * `ensureColorVariablesInjected` uses to decide whether a variable exists
 * at all, so a reference is never emitted for a variable that wasn't
 * written. Anything else is left as-is, falling back to the engine's normal
 * expansion.
 *
 * Known limit: an opacity suffix on a mode-aware color (`bg-surface/50`)
 * resolves to the full-opacity color, since the engine can't apply alpha to
 * a `var()` value.
 */
export function toCdnTheme(theme: ThemeConfig): ThemeConfig {
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
