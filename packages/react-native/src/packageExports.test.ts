import { describe, it, expect } from 'vitest';
import packageJson from '../package.json';

/**
 * Guards the exact regression class that broke Expo Router's static
 * rendering (SSR) — see nativeBridge.web.ts's doc comment for the full
 * story. Short version: Expo's Metro config resolves SSR bundles with
 * `unstable_conditionNames: ['node']`, NOT the `"browser"` condition
 * `platform: 'web'` bundling gets — so every subpath that has a `.web.js`
 * build MUST list a `"node"` condition pointing at the exact same files as
 * `"browser"`, or SSR silently falls through to the native
 * (TurboModuleRegistry-based) build instead and crashes deep inside
 * `renderToString` with no visible error anywhere. A real Expo Router app
 * reproduced this by hand; this test exists so the fix can't quietly
 * regress the next time someone edits package.json without knowing why
 * "node" is there.
 */
describe('package.json exports — browser/node condition parity', () => {
  const webSubpaths = ['.', './jsx-runtime', './jsx-dev-runtime'] as const;

  it.each(webSubpaths)('%s has a "node" condition matching its "browser" condition exactly', (subpath) => {
    const entry = (packageJson.exports as Record<string, unknown>)[subpath] as
      | { browser?: { import?: string; require?: string }; node?: { import?: string; require?: string } }
      | undefined;
    expect(entry, `exports["${subpath}"] should exist`).toBeDefined();
    expect(entry?.browser, `exports["${subpath}"].browser should exist`).toBeDefined();
    expect(entry?.node, `exports["${subpath}"].node should exist`).toBeDefined();
    expect(entry?.node).toEqual(entry?.browser);
  });
});

/**
 * Guards a real cross-format resolution bug, confirmed by hand against an
 * actual Metro Android bundle: with a top-level `"import"` condition
 * present alongside `"require"`, Metro resolved DIFFERENT subpaths of this
 * SAME package through DIFFERENT conditions in the SAME bundle — the bare
 * `@kbach/react-native` import went through `"import"` (→ index.mjs) while
 * `@kbach/react-native/jsx-dev-runtime` (React's automatic-JSX-runtime
 * injection) went through `"require"` (→ jsx-dev-runtime.js). Since ESM and
 * CJS are always separate module graphs, that inconsistency gave
 * darkModeStore.ts's module-level state two independent live copies again
 * — dark:-prefixed classes silently stopped reacting to a real
 * `toggleGlobalDarkMode()` call, even though tsup.config.ts already forces
 * every CJS entry to `require()` a SHARED darkModeStore.js instead of
 * inlining its own copy (that fix alone wasn't enough; the two entries
 * have to be resolved through the same FORMAT to begin with).
 *
 * The fix removes the top-level `"import"` condition for these three
 * subpaths entirely (see tsup.config.ts's own doc comment for the full
 * story) — `"browser"`/`"node"` keep their own nested `"import"`, since
 * `dark:` resolves to real CSS + a DOM attribute write on web, not JS-side
 * singleton state, so this specific failure mode doesn't apply there.
 */
describe('package.json exports — no top-level "import" condition for native entries', () => {
  const nativeSubpaths = ['.', './jsx-runtime', './jsx-dev-runtime'] as const;

  it.each(nativeSubpaths)('%s has no top-level "import" key (only "require")', (subpath) => {
    const entry = (packageJson.exports as Record<string, unknown>)[subpath] as Record<string, unknown> | undefined;
    expect(entry, `exports["${subpath}"] should exist`).toBeDefined();
    expect(entry, `exports["${subpath}"] should have a top-level "require"`).toHaveProperty('require');
    expect(entry, `exports["${subpath}"] should NOT have a top-level "import" — see this test's own doc comment`).not.toHaveProperty(
      'import',
    );
  });
});
