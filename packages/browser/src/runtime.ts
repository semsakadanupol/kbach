import { initKbachFrom } from '../../react/src/wasmLoader';
import { kb } from '../../react/src/kb';
import { setTheme } from '../../react/src/theme';
import { resolveKbachConfig, type KbachConfig } from '../../react/src/config';
import { ensureColorVariablesInjected } from '../../react/src/colorVariables';
import { resyncDomWithActiveTheme, setGlobalThemeMode, toggleGlobalDarkMode, type ThemeMode } from '../../react/src/darkModeStore';
import { toCdnTheme } from './cdnTheme';

/** What @kbach/browser exposes as `window.Kbach`. */
export interface KbachCdnApi {
  /** Resolves once the engine is loaded and the page's existing classes have been styled. */
  ready: Promise<void>;
  /** Replaces the active config (same shape as `kbach.config.js`) and re-styles the whole page. */
  config(config: KbachConfig): void;
  /** Re-scans the whole page. Rarely needed: added elements and `class` changes are picked up automatically. */
  refresh(): void;
  /** `'light' | 'dark' | 'system'`, persisted. Visible only with `darkMode: 'class'` or `'attribute'` (under the default `'media'`, the OS setting decides). */
  setMode(mode: ThemeMode): void;
  /** Flips light/dark. Same caveat as `setMode`. */
  toggle(): void;
}

export interface StartKbachCdnOptions {
  document: Document;
  /** Where to fetch `kbach_core_engine_bg.wasm` from. */
  wasmUrl: string | URL;
  config?: KbachConfig;
}

function classTokens(el: Element): string[] {
  // getAttribute, not el.className: on SVG elements className is an
  // SVGAnimatedString, not a string.
  const value = el.getAttribute('class');
  return value ? value.split(/\s+/).filter(Boolean) : [];
}

/**
 * @kbach/browser's whole behavior, as a function of the document it runs
 * against (index.ts is the thin entry that calls it with the real page).
 * Tests call it directly, with the real engine mocked in at
 * @kbach/react's `wasmLoader`.
 *
 * Every class token is resolved at most once per active config: `seen`
 * tracks tokens already sent to `kb()`, and new ones go in a single batched
 * `kb()` call per scan. Non-Kbach classes (the page's own CSS) pass through
 * the engine harmlessly, since an unknown token yields no rules.
 */
export function startKbachCdn({ document, wasmUrl, config }: StartKbachCdnOptions): KbachCdnApi {
  const seen = new Set<string>();
  let engineReady = false;

  const styleTokens = (elements: Iterable<Element>): void => {
    if (!engineReady) return; // the post-init full scan covers everything before this
    const fresh: string[] = [];
    for (const el of elements) {
      for (const token of classTokens(el)) {
        if (!seen.has(token)) {
          seen.add(token);
          fresh.push(token);
        }
      }
    }
    if (fresh.length > 0) kb(fresh.join(' '));
  };

  const subtree = (root: Element): Element[] => [root, ...Array.from(root.querySelectorAll('[class]'))];
  const scanAll = () => styleTokens(subtree(document.documentElement));

  const applyConfig = (next: KbachConfig | undefined): void => {
    const resolved = resolveKbachConfig(next ?? {});
    setTheme(toCdnTheme(resolved));
    ensureColorVariablesInjected(resolved);
    resyncDomWithActiveTheme();
  };

  // Before the engine loads, so the dark-mode attribute/class and the color
  // variables are on <html> from the start.
  applyConfig(config);

  const observer = new document.defaultView!.MutationObserver((records) => {
    const touched: Element[] = [];
    for (const record of records) {
      if (record.type === 'attributes') {
        touched.push(record.target as Element);
      } else {
        for (const node of Array.from(record.addedNodes)) {
          if (node.nodeType === 1) touched.push(...subtree(node as Element));
        }
      }
    }
    styleTokens(touched);
  });

  const ready = initKbachFrom(wasmUrl).then(() => {
    engineReady = true;
    scanAll();
    // Started only after the full scan, and on <html> so a script placed in
    // <head> still sees every element the parser adds to <body> afterwards.
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  return {
    ready,
    config(next) {
      applyConfig(next);
      // A new theme means every token has to be resolved again. kb()'s own
      // cache already invalidates on a theme change; `seen` is ours.
      seen.clear();
      scanAll();
    },
    refresh: scanAll,
    setMode: setGlobalThemeMode,
    toggle: toggleGlobalDarkMode,
  };
}
