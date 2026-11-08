import type { ThemeConfig } from '../../react/src/theme';
import { withColorVariables } from '../../react/src/colorVariables';

/**
 * The theme @kbach/browser hands the engine: the resolved theme with every
 * mode-aware color (`surface: { light, dark }`) replaced by a plain
 * `rgb(var(--kb-color-<name>))` reference.
 *
 * A CDN script only sees `class=""` attributes it doesn't own, so it can't
 * swap `bg-surface` for the engine's expanded per-mode classes the way
 * `kb()` callers do: rewriting them would fight the page's own JS
 * (`classList.contains('bg-surface')` would break, and every rewrite would
 * re-trigger its own MutationObserver). The variable form styles the class
 * as written, and `ensureColorVariablesInjected` supplies its light/dark
 * values. The static Vite/PostCSS plugins in @kbach/react need the same
 * thing for the same reason, so the logic lives there as
 * `withColorVariables` (react/src/colorVariables.ts); see its doc comment.
 */
export function toCdnTheme(theme: ThemeConfig): ThemeConfig {
  return withColorVariables(theme);
}
