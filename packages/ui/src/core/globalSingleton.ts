/**
 * Returns a value that's the SAME object across every physical copy of core/
 * a bundler might produce for a single running process — not just across
 * dist/index.js / dist/jsx-runtime.js / dist/jsx-dev-runtime.js (the CJS
 * build, which already shares one real dist/core/index.js via
 * externalization — see tsup.config.ts's CORE_EXTERNAL), but ALSO across
 * that CJS build and the separate ESM build (dist/index.mjs etc., which
 * inlines its own copy of core/ — a deliberate, accepted trade-off for
 * Rollup/Vite compatibility, see context.tsx's ThemeContext comment for the
 * full story).
 *
 * Confirmed as a real, live bug (not just theoretical), back when ThemeProvider
 * still had a separate native-specific wrapper at the now-removed
 * '@kbach/ui/native' subpath (see native/index.ts): a React Native app that
 * reached @kbach/ui through more than one physical dist file — e.g.
 * `import { ThemeProvider } from '@kbach/ui/native'` in one file and
 * `import { useIsDark } from '@kbach/ui'` in another, which Metro can resolve
 * to DIFFERENT dist files per call site — got dark:/light: classes silently
 * inert from one instance while useIsDark() read a different,
 * correctly-updating instance (or vice versa), depending on which module
 * each half of the app happened to load through. ThemeProvider now auto-
 * detects native itself (no separate wrapper/import path to diverge on), but
 * the underlying dual-build split (ESM for Rollup/Vite, CJS for Metro) is
 * still real, so darkModeStore/responsiveStore/config/etc. still need this —
 * jsx-runtime.tsx, for instance, still reaches core/ as its own call site.
 * See RULES.md rule 3: this is exactly the "globalThis-singleton hack" it
 * allows when a real fix (one guaranteed physical module) isn't available —
 * which it isn't here, short of giving up either Rollup or Metro compatibility
 * entirely.
 *
 * Keyed on Symbol.for() (the well-known global symbol registry, shared
 * across realms/module copies by spec) rather than a plain string property,
 * so this can never collide with anything else that happens to touch
 * globalThis.
 */
export function getGlobalSingleton<T>(key: string, create: () => T): T {
  const symbolKey = Symbol.for(`__kbach_${key}__`);
  const g = globalThis as unknown as Record<symbol, T | undefined>;
  let value = g[symbolKey];
  if (value === undefined) {
    value = create();
    g[symbolKey] = value;
  }
  return value;
}
