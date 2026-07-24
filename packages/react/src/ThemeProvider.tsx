import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSyncExternalStore } from './useSyncExternalStoreShim';
import {
  isWeb,
  isNative,
  getConfig,
  buildConfig,
  updateConfig,
  onConfigChange,
  setGlobalDarkMode,
  syncGlobalDarkMode,
  syncGlobalWidth,
  syncGlobalScreens,
  setGlobalWidth,
  type ThemeMode,
  type FrameworkConfig,
  type ResolvedConfig,
} from './core';
import { ThemeContext, type ThemeContextValue } from './context';
import { kbachWarn } from './core/devWarn';

// useLayoutEffect warns "does nothing on the server" during Node.js SSR
// (isWeb false, isNative false there — see core/platform.ts). Real browsers
// and React Native both support it safely, so only SSR needs the useEffect
// fallback.
const useIsomorphicLayoutEffect = isWeb || isNative ? useLayoutEffect : useEffect;

// ─── Storage key ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'kbach-theme';

// ─── Multi-provider dev warning ────────────────────────────────────────────
// isDark/width/screens live in a single process-wide store (see darkModeStore.ts
// for why: it solves React's "same-props bailout" stale-style problem, which a
// per-tree React Context store could not). That means two mounted
// ThemeProviders — nested per-section themes, Storybook, concurrent test
// renders — write over the same store: whichever committed most recently wins
// for every consumer, not the nearest ancestor. There's no supported way to
// scope the store per-tree without losing the bailout fix, so this only warns
// once so the failure mode isn't silent.
let _mountedProviderCount = 0;
let _warnedMultipleProviders = false;

// ─── Persist helpers ──────────────────────────────────────────────────────────
function loadPersistedMode(): ThemeMode | null {
  try {
    if (isWeb) return localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return null;
  } catch {
    return null;
  }
}

function persistMode(mode: ThemeMode): void {
  try {
    if (isWeb) localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* ignore */ }
}

// ─── System color scheme (useSyncExternalStore) ───────────────────────────────
//
// Reading matchMedia synchronously in a useState lazy initializer would return
// the real system scheme on the client's first (hydration) render while SSR
// always has no matchMedia — mismatching any output useTheme()/useIsDark()
// consumers render from it. useSyncExternalStore is the React-blessed fix:
// hydrating roots get getServerSnapshot() first and reconcile after, while
// plain client-side rendering (no SSR) reads the real value immediately with
// no extra flash — subscribe/getSnapshot must stay referentially stable across
// renders, so these are module-level functions rather than closures.
function subscribeSystemScheme(callback: () => void): () => void {
  if (!isWeb || typeof window === 'undefined') return () => {};
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => {};
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSystemScheme(): 'light' | 'dark' {
  if (!isWeb || typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

function getSystemSchemeServerSnapshot(): 'light' | 'dark' {
  return 'light';
}

// ─── Web DOM helpers ──────────────────────────────────────────────────────────
function applyWebTheme(resolvedMode: 'light' | 'dark', strategy: ResolvedConfig['darkMode']): void {
  if (!isWeb) return;
  const root = document.documentElement;
  if (strategy === 'attribute') {
    root.setAttribute('data-theme', resolvedMode);
  } else if (strategy === 'class') {
    root.classList.toggle('dark', resolvedMode === 'dark');
    root.classList.toggle('light', resolvedMode === 'light');
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface ThemeProviderProps {
  children: ReactNode;
  /** Initial mode. Falls back to persisted value, then 'system'. */
  defaultMode?: ThemeMode;
  /**
   * System color scheme for native `defaultMode="system"`.
   *
   * Pass the value of `useColorScheme()` from `react-native`. When importing
   * `ThemeProvider` from `@kbach/native` this is handled automatically.
   *
   * @example
   * ```tsx
   * import { useColorScheme } from 'react-native';
   * const colorScheme = useColorScheme();
   * <ThemeProvider defaultMode="system" colorScheme={colorScheme}>…</ThemeProvider>
   * ```
   */
  colorScheme?: 'light' | 'dark' | null;
  /**
   * Current window/screen width in pixels for responsive breakpoints.
   * On web this is read from `window.innerWidth` automatically.
   * When importing `ThemeProvider` from `@kbach/native` this is provided
   * automatically from `useWindowDimensions()`.
   */
  windowWidth?: number;
  /** Override the config (useful for per-tree config). Defaults to global getConfig(). */
  config?: FrameworkConfig;
  /** Disable persistence to localStorage */
  disablePersistence?: boolean;
}

export function ThemeProvider({
  children,
  defaultMode = 'system',
  colorScheme,
  windowWidth: windowWidthProp,
  config: configOverride,
  disablePersistence = false,
}: ThemeProviderProps): React.JSX.Element {
  // ── Config ─────────────────────────────────────────────────────────────────
  const [resolvedConfig, setResolvedConfig] = useState<ResolvedConfig>(() =>
    configOverride ? buildConfig(configOverride) : getConfig(),
  );

  // Dev-only: warn (once) if more than one ThemeProvider is ever mounted at the
  // same time — see the _mountedProviderCount comment above for why this can't
  // just be silently made to work correctly.
  useEffect(() => {
    _mountedProviderCount++;
    if (
      process.env.NODE_ENV !== 'production' &&
      _mountedProviderCount > 1 &&
      !_warnedMultipleProviders
    ) {
      _warnedMultipleProviders = true;
      kbachWarn(
        'Multiple <ThemeProvider> instances are mounted at once. Dark mode and ' +
        'responsive width are shared through one global store, so whichever ' +
        'provider rendered most recently wins for every consumer — nested or ' +
        'per-section theming is not isolated between providers.',
      );
    }
    return () => {
      _mountedProviderCount--;
    };
  }, []);

  // ── Responsive width ───────────────────────────────────────────────────────
  // Web: track window.innerWidth in state so children re-render on resize.
  // Native: windowWidthProp comes from NativeThemeProvider via useWindowDimensions().
  //
  // Initial value MUST be 0 (not window.innerWidth) even though this only runs
  // on web — reading window.innerWidth here would return the real width on the
  // client's first (hydration) render while SSR always rendered 0, mismatching
  // any sm:/md:/lg: responsive classes rendered synchronously from this value
  // below. The real width is instead picked up once in the resize effect below,
  // which — being an effect — only ever runs post-hydration on the client.
  const [webWidth, setWebWidth] = useState<number>(0);
  const effectiveWidth = windowWidthProp ?? (isWeb ? webWidth : 0);

  // Convert string screens ('640px') to numbers before syncing — the raw theme
  // value can be in either format but the store always expects numbers.
  const numericScreens = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(resolvedConfig.theme.screens ?? {})) {
      out[k] = typeof v === 'number' ? v : parseInt(String(v), 10);
    }
    return out;
  }, [resolvedConfig.theme.screens]);

  // Sync to globalThis store synchronously during render so children read the
  // correct value on their first render pass (before any effects fire).
  // Use ref guards so we don't write on every render when nothing changed.
  const _prevWidthRef = useRef(-1);
  if (_prevWidthRef.current !== effectiveWidth) {
    _prevWidthRef.current = effectiveWidth;
    syncGlobalWidth(effectiveWidth);
  }
  const _prevScreensRef = useRef<Record<string, number> | null>(null);
  if (_prevScreensRef.current !== numericScreens) {
    _prevScreensRef.current = numericScreens;
    syncGlobalScreens(numericScreens);
  }

  // Fire width listeners so components subscribed via useSyncExternalStore
  // re-render when effectiveWidth changes (orientation change on native,
  // or initial commit).  syncGlobalWidth above handles the render-time read;
  // setGlobalWidth handles post-commit notifications.
  useEffect(() => {
    setGlobalWidth(effectiveWidth);
  }, [effectiveWidth]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    // Pick up the real width once now that we're safely past hydration.
    setWebWidth(window.innerWidth);
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = window.innerWidth;
        setWebWidth(w);
        setGlobalWidth(w);
      });
    };
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      cancelAnimationFrame(raf);
    };
  }, []);

  // ── System scheme ──────────────────────────────────────────────────────────
  // Web: detect via matchMedia (SSR-safe — see subscribeSystemScheme above).
  // Native: caller passes colorScheme from useColorScheme() (done automatically
  // when using ThemeProvider from @kbach/native via NativeThemeProvider).
  const webScheme = useSyncExternalStore(
    subscribeSystemScheme,
    getSystemScheme,
    getSystemSchemeServerSnapshot,
  );

  const systemScheme: 'light' | 'dark' = isWeb
    ? webScheme
    : (colorScheme === 'dark' ? 'dark' : 'light');

  // ── User mode ──────────────────────────────────────────────────────────────
  // Initial state MUST ignore localStorage on first render, for the same
  // hydration-mismatch reason as webWidth/webScheme above: SSR never has a
  // persisted value, so reading it here would only diverge on the client's
  // hydration pass. The persisted value (if any) is applied once in an effect
  // below, which only runs post-hydration.
  const [mode, _setMode] = useState<ThemeMode>(defaultMode);

  useEffect(() => {
    if (disablePersistence) return;
    const persisted = loadPersistedMode();
    if (persisted) _setMode(persisted);
    // Intentionally run once on mount only — a live prop change to
    // defaultMode/disablePersistence shouldn't override user interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab sync: the `storage` event fires in every OTHER tab/window sharing
  // the same localStorage origin when one of them writes STORAGE_KEY (persistMode
  // above) — it never fires in the tab that made the write. Without this, toggling
  // the theme in one tab leaves every other open tab showing the stale mode until
  // it's reloaded.
  useEffect(() => {
    if (disablePersistence || !isWeb || typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      if (e.newValue === 'light' || e.newValue === 'dark' || e.newValue === 'system') {
        _setMode(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [disablePersistence]);

  const setMode = useCallback((next: ThemeMode) => {
    _setMode(next);
    if (!disablePersistence) persistMode(next);
  }, [disablePersistence]);

  const toggle = useCallback(() => {
    setMode(mode === 'dark' || (mode === 'system' && systemScheme === 'dark') ? 'light' : 'dark');
  }, [mode, systemScheme, setMode]);

  // ── Resolved mode ──────────────────────────────────────────────────────────
  const resolvedMode: 'light' | 'dark' = mode === 'system' ? systemScheme : mode;
  const isDark = resolvedMode === 'dark';

  // Synchronously write to the global store so the JSX runtime reads the
  // correct isDark value during the same render pass as ThemeProvider.
  syncGlobalDarkMode(isDark);

  // ── Apply to DOM and notify global store subscribers ───────────────────────
  // useLayoutEffect (not useEffect): this is what fires setGlobalDarkMode(),
  // which notifies DarkWrapper/InteractiveWrapper's useSyncExternalStore
  // subscribers and triggers THEIR re-render — a separate render pass from
  // ThemeProvider's own (React Context propagates synchronously within
  // ThemeProvider's render, so useTheme() consumers already had the new value;
  // className/kb-styled dark:/light: elements only update once this fires).
  // useEffect callbacks run after the browser/native paint, so with useEffect
  // here every className-styled dark: element visibly lagged one frame behind
  // anything reading isDark via useTheme(). useLayoutEffect runs synchronously
  // right after commit, before that frame is presented, closing the gap.
  useIsomorphicLayoutEffect(() => {
    applyWebTheme(resolvedMode, resolvedConfig.darkMode);
    setGlobalDarkMode(isDark);
  }, [isDark, resolvedMode, resolvedConfig.darkMode]);

  // ── Keep resolvedConfig in sync when configOverride prop changes ───────────
  // Also push to the global store so the JSX runtime (dynamic classes) and any
  // code calling getConfig() outside of React context sees the correct theme.
  useEffect(() => {
    if (!configOverride) return;
    updateConfig(configOverride); // syncs global store, fires listeners for other providers
    setResolvedConfig(getConfig()); // update local state (not subscribed to onConfigChange)
  }, [configOverride]);

  // ── Listen for global config changes (only when not using a per-tree override) ──
  useEffect(() => {
    if (configOverride) return;
    let mounted = true;
    const unsub = onConfigChange((config) => {
      if (mounted) setResolvedConfig(config);
    });
    return () => { mounted = false; unsub(); };
  }, [configOverride]);

  // ── Context value ──────────────────────────────────────────────────────────
  const contextValue = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedMode, isDark, setMode, toggle, config: resolvedConfig }),
    [mode, resolvedMode, isDark, setMode, toggle, resolvedConfig],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}
