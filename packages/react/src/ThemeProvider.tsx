import { useEffect, useRef, type ReactNode } from 'react';
import { seedDefaultMode, type ThemeMode } from './darkModeStore';

export interface ThemeProviderProps {
  children: ReactNode;
  /**
   * Applied once, on this provider's first mount, but ONLY if the user has
   * no persisted preference already (see `darkModeStore.ts::seedDefaultMode`)
   * — an explicit prior choice always wins over a component's own default.
   */
  defaultMode?: ThemeMode;
}

let mountedProviderCount = 0;
let warnedMultipleProviders = false;

/**
 * Optional — `useTheme()` reads `darkModeStore.ts`'s global store directly
 * and works anywhere without this mounted at all. The only thing this
 * component does is seed that store's initial `defaultMode` once, for apps
 * that want to declare a startup default in JSX rather than calling
 * `setGlobalThemeMode()` imperatively before their first render. It
 * renders `children` as-is — no Context.Provider, since there's no value
 * left to distribute; `useTheme()` never reads from Context.
 *
 * Because the store is global, MULTIPLE mounted providers would each try
 * to seed the exact same store rather than getting their own scoped
 * state — mounting more than one is very likely a mistake, so this warns
 * once in dev.
 */
export function ThemeProvider({ children, defaultMode = 'system' }: ThemeProviderProps) {
  useEffect(() => {
    mountedProviderCount++;
    if (mountedProviderCount > 1 && !warnedMultipleProviders) {
      warnedMultipleProviders = true;
      console.warn(
        '[kbach] Multiple <ThemeProvider> instances are mounted at once. ' +
          'Dark-mode state is one global store useTheme() reads everywhere, not scoped per-provider, so their defaultMode seeds will fight over the same state.',
      );
    }
    return () => {
      mountedProviderCount--;
    };
  }, []);

  // Seed the store's default exactly once per provider instance — a
  // second effect run (e.g. React 18 Strict Mode's mount/unmount/remount
  // in dev) must not re-seed, since by then the user may have already
  // toggled the theme and a re-seed would stomp that back to the default.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    seedDefaultMode(defaultMode);
    // Deliberately NOT reactive to `defaultMode` changing after mount —
    // this is a one-time initial seed, not a controlled prop; a later
    // `defaultMode` change on a live provider shouldn't silently override
    // whatever the user has since chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
