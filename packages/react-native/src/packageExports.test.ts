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
