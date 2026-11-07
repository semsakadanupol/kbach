#!/usr/bin/env node
// Smoke-tests the BUILT bundle (dist/kbach.js + its .wasm), not the source:
// loads it into jsdom through a real <script src> tag, so
// document.currentScript and the .wasm URL lookup run exactly as in a
// browser. Runs the real WASM engine and checks that existing, added and
// changed classes all get styled.
//
// Runs twice: once from the README's short CDN URL
// (https://cdn.jsdelivr.net/npm/@kbach/browser) and once self-hosted
// (/vendor/kbach.js). The fake fetch() serves the .wasm ONLY at the exact
// URL each case should request, so a wrong lookup fails here instead of in
// a user's browser. 1.0.0-beta.0 shipped with exactly that bug, because an
// earlier version of this script used window.eval (no currentScript) and
// never exercised the lookup.
//
// The unit tests (src/*.test.ts) cover the logic; this catches what only
// the bundle can break: IIFE wrapping, the bundled wasm-bindgen glue, the
// build-time version define, and the script-tag integration. Last step of
// the "build" script, so a broken bundle fails the build.
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import jsdom from 'jsdom';

const { JSDOM, requestInterceptor } = jsdom;

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
const bundle = readFileSync(join(pkgDir, 'dist', 'kbach.js'));
const wasm = readFileSync(join(pkgDir, 'dist', 'kbach_core_engine_bg.wasm'));

const cases = [
  {
    name: 'short CDN URL',
    scriptSrc: 'https://cdn.jsdelivr.net/npm/@kbach/browser',
    expectedWasm: `https://cdn.jsdelivr.net/npm/@kbach/browser@${version}/dist/kbach_core_engine_bg.wasm`,
  },
  {
    name: 'self-hosted',
    scriptSrc: '/vendor/kbach.js',
    expectedWasm: 'http://127.0.0.1:5500/vendor/kbach_core_engine_bg.wasm',
  },
];

// Serves the built bundle for the <script src> URL, and refuses every other
// subresource so the check never touches the network.
const serveBundleAt = (scriptUrl) =>
  requestInterceptor((request) =>
    request.url === scriptUrl
      ? new Response(bundle, { headers: { 'Content-Type': 'text/javascript' } })
      : new Response('Not found', { status: 404 }),
  );

const failures = [];

async function run({ name, scriptSrc, expectedWasm }) {
  const check = (ok, message) => {
    if (!ok) failures.push(`[${name}] ${message}`);
  };
  const pageUrl = 'http://127.0.0.1:5500/apps/web-cdn/index.html';
  const requested = [];
  const dom = new JSDOM(
    `<!doctype html><html><head><script src="${scriptSrc}"></script></head>` +
      '<body><div id="a" class="p-4 bg-blue-6 my-own-class">x</div></body></html>',
    {
      url: pageUrl,
      runScripts: 'dangerously',
      resources: { interceptors: [serveBundleAt(new URL(scriptSrc, pageUrl).href)] },
      beforeParse(window) {
        window.Response = Response;
        window.fetch = async (url) => {
          requested.push(String(url));
          return String(url) === expectedWasm
            ? new Response(wasm, { headers: { 'Content-Type': 'application/wasm' } })
            : new Response('Not found', { status: 404 });
        };
        window.kbachConfig = {
          darkMode: 'class',
          extend: { colors: { brand: '#ff6b35', panel: { light: '#ffffff', dark: '#000000' } } },
        };
      },
    },
  );
  const { window } = dom;
  const css = () =>
    Array.from(window.document.querySelectorAll('style'))
      .map((el) => Array.from(el.sheet?.cssRules ?? []).map((r) => r.cssText).join('\n') || el.textContent)
      .join('\n');
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  await new Promise((resolve) => window.addEventListener('load', resolve));
  check(typeof window.Kbach === 'object', 'window.Kbach was not defined (the script did not run)');
  if (!window.Kbach) return;
  try {
    await window.Kbach.ready;
  } catch (err) {
    check(false, `Kbach.ready rejected: ${err?.message ?? err}`);
  }

  check(
    requested.length === 1 && requested[0] === expectedWasm,
    `wasm requested from ${JSON.stringify(requested)}, expected ${expectedWasm}`,
  );
  check(/\.p-4\s*\{[^}]*padding:\s*16px/.test(css()), 'existing class p-4 was not styled');
  check(css().includes('.bg-blue-6'), 'existing class bg-blue-6 was not styled');
  check(window.document.getElementById('kbach-reset') !== null, 'reset stylesheet was not injected');

  const added = window.document.createElement('span');
  added.className = 'bg-brand mt-2';
  window.document.body.appendChild(added);
  await settle();
  check(css().includes('.bg-brand'), 'class on an added element (bg-brand, from window.kbachConfig) was not styled');

  window.document.getElementById('a').setAttribute('class', 'bg-panel');
  await settle();
  check(/\.bg-panel\s*\{[^}]*var\(--kb-color-panel\)/.test(css()), 'mode-aware class bg-panel was not styled via its CSS variable');
  check(/\.dark\s*\{[^}]*--kb-color-panel:\s*0,\s*0,\s*0/.test(css()), 'dark value of --kb-color-panel missing for darkMode: class');
  check(window.document.getElementById('a').getAttribute('class') === 'bg-panel', "the page's class attribute was rewritten");

  const before = window.document.documentElement.classList.contains('dark');
  window.Kbach.toggle();
  check(window.document.documentElement.classList.contains('dark') !== before, 'Kbach.toggle() did not flip the .dark class on <html>');
  window.close();
}

for (const c of cases) await run(c);

if (failures.length > 0) {
  console.error(`verify-bundle: FAILED\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log(`verify-bundle: dist/kbach.js OK (${cases.map((c) => c.name).join(', ')}: wasm URL, existing/added/changed classes, mode-aware colors, toggle)`);
