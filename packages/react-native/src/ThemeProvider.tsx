import { useEffect, useRef, type ReactNode } from 'react';
import { getGlobalThemeMode, seedDefaultMode, subscribeGlobalDarkMode, type ThemeMode } from './darkModeStore';

/**
 * The exact shape `@react-native-async-storage/async-storage`'s default
 * export already has — pass it directly as `persist`. Any other async
 * key-value store (MMKV, SecureStore, a custom backend, ...) works too, as
 * long as it exposes these two methods with this signature. Kept minimal
 * on purpose: `ThemeProvider` never imports a storage library itself (see
 * `darkModeStore.ts`'s own doc comment on why this package forces no real
 * native dependency on consumers who don't want persistence) — deliberately
 * NOT a `boolean`-only option that reaches for AsyncStorage internally,
 * since Metro resolves every `require()`/`import` target at BUNDLE time
 * regardless of try/catch, so a library-internal "if installed, use it"
 * check can't actually degrade gracefully when the package is absent — an
 * injected adapter sidesteps that entirely.
 */
export interface ThemeStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const PERSIST_STORAGE_KEY = 'kbach-theme'; // same key @kbach/react's web version uses, for parity — no actual collision risk, each platform has its own storage

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export interface ThemeProviderProps {
  children: ReactNode;
  /**
   * Applied once, on this provider's first mount, but ONLY if nothing has
   * made an explicit mode choice yet (see
   * `darkModeStore.ts::seedDefaultMode`) — an explicit prior choice always
   * wins over a component's own default. If `persist` is also set and a
   * persisted mode is found, the persisted mode wins over this fallback.
   */
  defaultMode?: ThemeMode;
  /**
   * Opt-in persistence across app launches — `false` by default (this
   * package never persists on its own; see `darkModeStore.ts`'s doc
   * comment). Pass a storage adapter to enable it:
   * ```tsx
   * import AsyncStorage from '@react-native-async-storage/async-storage';
   * <ThemeProvider persist={AsyncStorage}>...
   * ```
   * The persisted value (if any) is read once on mount and applied via the
   * same "don't clobber a real choice already in flight" guard
   * `seedDefaultMode`/`defaultMode` uses; every later explicit mode change
   * is written back automatically for as long as this provider stays
   * mounted.
   */
  persist?: ThemeStorageAdapter | false;
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
export function ThemeProvider({ children, defaultMode = 'system', persist = false }: ThemeProviderProps) {
  useEffect(() => {
    mountedProviderCount++;
    if (mountedProviderCount > 1 && !warnedMultipleProviders) {
      warnedMultipleProviders = true;
      // Plain text, no ANSI/`%c` — this file runs on real native (RN's
      // on-device LogBox, which renders raw text only) as well as Expo Web,
      // so it can't assume a real browser console the way
      // @kbach/react's own ThemeProvider.tsx can. One short line per fact
      // instead reads cleanly in both places without needing any styling.
      console.warn(
        '[Kbach] Multiple <ThemeProvider> instances are mounted at once.\n' +
          'Dark mode is one global store — useTheme() reads it everywhere, not scoped per provider — so their defaultMode/persist seeds will fight over the same state.\n' +
          'Mount exactly one <ThemeProvider>, as high in the tree as convenient.',
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
  // With `persist` set, the persisted value (if any) is read first and
  // takes priority over `defaultMode` — `seedDefaultMode`'s own "only if
  // no explicit choice yet" guard means neither this nor the persisted
  // read can ever clobber a real toggle that happens to race ahead of the
  // (inherently async) storage read.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (!persist) {
      seedDefaultMode(defaultMode);
      return;
    }
    let cancelled = false;
    persist
      .getItem(PERSIST_STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (isThemeMode(stored)) seedDefaultMode(stored);
        else seedDefaultMode(defaultMode);
      })
      .catch(() => {
        if (!cancelled) seedDefaultMode(defaultMode);
      });
    return () => {
      cancelled = true;
    };
    // Deliberately NOT reactive to `defaultMode`/`persist` changing after
    // mount — this is a one-time initial seed, not a controlled prop; a
    // later change on a live provider shouldn't silently override whatever
    // the user has since chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write every later explicit mode change back to storage, for as long as
  // this provider stays mounted. Deliberately does NOT fire for the initial
  // seed above (`subscribeGlobalDarkMode` only notifies on `notify()`,
  // which the seed path does call — so the just-read value gets written
  // straight back once; harmless, since it's already what's in storage,
  // just a redundant no-op write).
  useEffect(() => {
    if (!persist) return;
    return subscribeGlobalDarkMode(() => {
      persist.setItem(PERSIST_STORAGE_KEY, getGlobalThemeMode()).catch(() => {
        // Storage write failed (quota/permissions/etc) — the in-memory
        // mode is still correct for this session, it just won't survive
        // the next launch. Nothing actionable to do here.
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  return <>{children}</>;
}
