import { resolve, flatten, getConfig, isWeb, type StyleValue, type ResolvedStyle } from './core';

// ─── kb() ─────────────────────────────────────────────────────────────────────

/**
 * Resolve a utility class string outside of a React component.
 *
 * On **native** — returns a StyleValue (style object) for the given mode.
 * On **web** — injects CSS and returns the original class string (use as className).
 *
 * ```ts
 * // Inside a component use useStyles() instead.
 * // kb() is useful for StyleSheet.create() calls and static values.
 *
 * const styles = StyleSheet.create({
 *   container: kb('flex-1 bg-white p-4') as any,
 * });
 *
 * // Web: use as className
 * <div className={kb('bg-white dark:bg-gray-900 p-4') as string} />
 * ```
 *
 * @param classString   Space-separated utility classes
 * @param isDark        Whether dark mode is active (default: false)
 */
export function kb(classString: string, isDark = false): StyleValue | string {
  const config = getConfig();
  const resolved: ResolvedStyle = resolve(classString, config.theme, config.darkMode);

  if (isWeb) {
    // CSS was injected as a side effect of resolve(). Return the class string.
    return classString;
  }

  return flatten(resolved, isDark);
}

// ─── cx() — class name composer ──────────────────────────────────────────────

/**
 * Conditionally join class names. Falsy values are ignored.
 *
 * ```ts
 * cx('bg-white p-4', isActive && 'border-2 border-blue-500', undefined)
 * // → 'bg-white p-4 border-2 border-blue-500'
 * ```
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
