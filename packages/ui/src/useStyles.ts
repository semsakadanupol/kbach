import { useMemo } from 'react';
import { resolve, flatten, getActiveBreakpoints, type StyleValue } from './core';
import { useTheme } from './context';
import { useGlobalWidth } from './useGlobalWidth';

// ─── Interaction state ────────────────────────────────────────────────────────

export interface InteractionState {
  hover?: boolean;
  focus?: boolean;
  /** Maps to 'pressed' and 'active' modifiers */
  pressed?: boolean;
  active?: boolean;
  disabled?: boolean;
  checked?: boolean;
  visited?: boolean;
  placeholder?: boolean;
}

// ─── useStyles ────────────────────────────────────────────────────────────────

/**
 * Resolve a utility class string to a style object for the current theme + state.
 *
 * ```tsx
 * // Basic usage
 * const styles = useStyles('bg-white dark:bg-gray-900 p-4');
 *
 * // With interaction state
 * const [pressed, setPressed] = useState(false);
 * const styles = useStyles('bg-blue-500 pressed:bg-blue-700', { pressed });
 *
 * // Multiple class strings (merged left-to-right)
 * const styles = useStyles(['bg-white p-4', 'dark:bg-gray-900 rounded-xl']);
 * ```
 */
export function useStyles(
  classString: string | string[],
  state: InteractionState = {},
): StyleValue {
  const { isDark, config } = useTheme();
  const width = useGlobalWidth();

  const normalised = Array.isArray(classString) ? classString.join(' ') : classString;

  return useMemo(() => {
    const resolved = resolve(normalised, config.theme, config.darkMode);
    // Bug #7 fix: getActiveBreakpoints moved inside useMemo so the Set is only
    // allocated when width (or another dep) actually changes, not every render.
    const breakpoints = getActiveBreakpoints(width);
    return flatten(resolved, isDark, state, breakpoints);
    // width drives breakpoints; state members listed explicitly so React detects changes.
  }, [normalised, isDark, config.theme, config.darkMode, width, state.hover, state.focus, state.pressed, state.active, state.disabled, state.checked, state.visited, state.placeholder]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ─── useResolvedStyle (raw bucket access) ────────────────────────────────────

/**
 * Returns the full ResolvedStyle bucket map (base, dark, hover, …).
 * Useful when you need to apply styles selectively or pass them to Animated.
 */
export function useResolvedStyle(classString: string | string[]) {
  const { config } = useTheme();
  const normalised = Array.isArray(classString) ? classString.join(' ') : classString;

  return useMemo(
    () => resolve(normalised, config.theme, config.darkMode),
    [normalised, config],
  );
}
