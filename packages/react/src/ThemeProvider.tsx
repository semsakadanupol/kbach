import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  isWeb,
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

// ─── Storage key ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'kbach-theme';

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

  // ── Responsive width ───────────────────────────────────────────────────────
  // Web: track window.innerWidth in state so children re-render on resize.
  // Native: windowWidthProp comes from NativeThemeProvider via useWindowDimensions().
  const [webWidth, setWebWidth] = useState<number>(() =>
    isWeb && typeof window !== 'undefined' ? window.innerWidth : 0,
  );
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
  // Web: detect via matchMedia.
  // Native: caller passes colorScheme from useColorScheme() (done automatically
  // when using ThemeProvider from @kbach/native via NativeThemeProvider).
  const [webScheme, setWebScheme] = useState<'light' | 'dark'>(() => {
    if (isWeb && typeof window !== 'undefined') {
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const systemScheme: 'light' | 'dark' = isWeb
    ? webScheme
    : (colorScheme === 'dark' ? 'dark' : 'light');

  // ── User mode ──────────────────────────────────────────────────────────────
  const [mode, _setMode] = useState<ThemeMode>(() => {
    if (!disablePersistence) {
      const persisted = loadPersistedMode();
      if (persisted) return persisted;
    }
    return defaultMode;
  });

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
  useEffect(() => {
    applyWebTheme(resolvedMode, resolvedConfig.darkMode);
    setGlobalDarkMode(isDark);
  }, [isDark, resolvedMode, resolvedConfig.darkMode]);

  // ── Web: matchMedia change listener ────────────────────────────────────────
  const setWebSchemeRef = useRef(setWebScheme);
  setWebSchemeRef.current = setWebScheme;

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => {
      setWebSchemeRef.current(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
