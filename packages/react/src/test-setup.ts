// React 18/19's `act()` (used directly from 'react' in ThemeProvider.test.tsx
// — no React Testing Library dependency in this package) needs this flag
// set, or it prints "not configured to
// support act(...)" even though it still runs correctly. React Testing
// Library sets this internally; since this package doesn't use it, it's
// set once here instead.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Vitest global setup — runs once before every test file. Currently exists
// for exactly one reason: Node 22+ ships its OWN experimental global
// `localStorage` getter, unrelated to jsdom's — it shadows/conflicts with
// jsdom's real implementation under this Vitest+jsdom setup, so
// `globalThis.localStorage`/`window.localStorage` (they're the same
// object in this environment: `window === globalThis`) evaluate to
// `undefined` rather than jsdom's working Storage object, even though
// jsdom itself implements one correctly. Confirmed by hand: Node's own
// property IS `configurable: true`, so overriding it with a real (if
// minimal) in-memory implementation here fixes every test file at once,
// rather than requiring each one to work around it individually.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage });
}
