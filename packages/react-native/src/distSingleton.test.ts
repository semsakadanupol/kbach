import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression test for a real cross-bundle singleton-duplication bug:
 * esbuild has no code-splitting support for CommonJS output, so this
 * package's CJS build used to give EVERY entry (index.js, jsx-runtime.js,
 * ...) its own separate inlined copy of darkModeStore.ts's (and theme.ts's)
 * module-level state. Since React's automatic JSX runtime resolves
 * '@kbach/react-native/jsx-runtime' as a SEPARATE module specifier from
 * '@kbach/react-native' itself, a real app calling `useTheme().toggle()`
 * (via the index entry) never notified `dark:`-class resolution (via the
 * jsx-runtime entry) — `isDark` updated correctly for anything reading it
 * through the index entry, while every `dark:`-prefixed class silently
 * never did. Fixed in tsup.config.ts by building theme.ts/darkModeStore.ts
 * as their own sibling dist/ entries and marking them `external`, so every
 * other entry requires() the SAME file instead of inlining its own copy.
 *
 * This checks the ACTUAL BUILT dist/ output (not source, unlike every
 * other test in this package) — the bug is a property of the bundler's own
 * output structure, invisible to any test that imports from source. A full
 * runtime behavioral test (actually requiring the built CJS files and
 * toggling dark mode across entries) was attempted first but hits a real
 * environment wall: the pre-built file's own internal `require("react-native")`
 * call bypasses vitest's `vi.mock` (that only intercepts Vite-processed
 * imports, not a plain Node `require()` inside an already-bundled file), so
 * it pulls in the REAL react-native package, which doesn't load under plain
 * Node. A static check of the build's structure is what's actually
 * feasible here, and it targets the exact mechanism the bug lives in
 * (inlined vs. shared module state) directly rather than through a proxy.
 *
 * Run `npm run build` first if dist/ doesn't exist yet — these assertions
 * are skipped (not failed) when it's missing, so a plain `npx vitest run`
 * on a from-clone checkout doesn't error confusingly.
 */

const distDir = join(__dirname, '..', 'dist');
const distExists = existsSync(join(distDir, 'index.js'));

// A handful of identifiers that only ever exist inside darkModeStore.ts's
// or theme.ts's own module-level closures — their presence in a DIFFERENT
// entry's bundle means that entry inlined its own separate copy instead of
// requiring the shared sibling file.
// NOT `seedDefaultMode` — it's a real EXPORTED function (ThemeProvider.tsx
// imports it directly), so it legitimately appears as a property access
// (`import_darkModeStore.seedDefaultMode`) in any entry that re-exports
// ThemeProvider. `hasExplicitChoice`/`resolveIsDark` are both private,
// never-exported module-scope identifiers — the only way either name can
// appear anywhere is a full inlined copy of the module's own source.
const DARK_MODE_STORE_OWN_IDENTIFIERS = ['hasExplicitChoice', 'resolveIsDark'];
const THEME_OWN_IDENTIFIERS = ['activeThemeJson', 'defaultTheme ='];

// Every CJS entry uses theme.ts (at minimum for getThemeJson()), so all six
// must require it. darkModeStore.ts is only used where JS-side dark-mode
// state actually matters — that's every entry EXCEPT jsx-runtime.web.js:
// on web, `dark:` resolves to real CSS via a DOM attribute (see
// darkModeStore.ts's own `applyToDom` doc comment), so the class-resolution
// entry itself has no runtime branching on dark mode to do, and legitimately
// never references darkModeStore at all — nothing to inline OR share there.
const cjsEntries = ['index.js', 'index.web.js', 'jsx-runtime.js', 'jsx-runtime.web.js', 'jsx-dev-runtime.js', 'jsx-dev-runtime.web.js'];
const entriesThatUseDarkModeStore = new Set(cjsEntries.filter((f) => f !== 'jsx-runtime.web.js'));

describe.skipIf(!distExists)('dist/ build output — darkModeStore/theme are shared, not inlined per-entry', () => {
  it('darkModeStore.js and theme.js exist as their own sibling CJS files', () => {
    expect(existsSync(join(distDir, 'darkModeStore.js'))).toBe(true);
    expect(existsSync(join(distDir, 'theme.js'))).toBe(true);
  });

  it.each(cjsEntries)('%s requires the shared theme/darkModeStore files rather than inlining them', (file) => {
    const content = readFileSync(join(distDir, file), 'utf-8');
    expect(content).toMatch(/require\(["']\.\/theme["']\)/);
    if (entriesThatUseDarkModeStore.has(file)) {
      expect(content).toMatch(/require\(["']\.\/darkModeStore["']\)/);
    }
    for (const id of DARK_MODE_STORE_OWN_IDENTIFIERS) {
      expect(content, `${file} should not inline darkModeStore's own "${id}"`).not.toContain(id);
    }
    for (const id of THEME_OWN_IDENTIFIERS) {
      expect(content, `${file} should not inline theme's own "${id}"`).not.toContain(id);
    }
  });
});
