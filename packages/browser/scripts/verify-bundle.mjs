#!/usr/bin/env node
// Smoke-tests the BUILT bundle (dist/kbach.js + its .wasm), not the
// source: loads it into jsdom exactly like a <script src> would, with the
// real WASM engine, and checks that existing, added and changed classes all
// get styled. The unit tests (src/*.test.ts) cover the logic; this
// catches what only the bundle can break (IIFE wrapping, the bundled
// wasm-bindgen glue, the wasm URL lookup). Last step of the "build" script,
// so a broken bundle fails the build.
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const cdnDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const bundle = readFileSync(join(cdnDir, 'kbach.js'), 'utf-8');
const wasm = readFileSync(join(cdnDir, 'kbach_core_engine_bg.wasm'));

const dom = new JSDOM(
  '<!doctype html><html><head></head><body><div id="a" class="p-4 bg-blue-6 my-own-class">x</div></body></html>',
  { runScripts: 'outside-only', url: 'https://cdn.example/npm/@kbach/browser/dist/' },
);
const { window } = dom;
const requested = [];
window.Response = Response;
window.fetch = async (url) => {
  requested.push(String(url));
  return new Response(wasm, { headers: { 'Content-Type': 'application/wasm' } });
};
window.kbachConfig = { darkMode: 'class', extend: { colors: { brand: '#ff6b35', panel: { light: '#ffffff', dark: '#000000' } } } };

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const css = () =>
  Array.from(window.document.querySelectorAll('style'))
    .map((el) => Array.from(el.sheet?.cssRules ?? []).map((r) => r.cssText).join('\n') || el.textContent)
    .join('\n');
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

window.eval(bundle);
check(typeof window.Kbach === 'object', 'window.Kbach was not defined');
await window.Kbach.ready;

check(requested.length === 1 && requested[0].endsWith('kbach_core_engine_bg.wasm'), `unexpected wasm request(s): ${JSON.stringify(requested)}`);
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
check(window.document.getElementById('a').getAttribute('class') === 'bg-panel', 'the page\'s class attribute was rewritten');

window.Kbach.toggle();
const htmlClass = window.document.documentElement.className;
window.Kbach.toggle();
check(htmlClass.includes('dark') !== window.document.documentElement.className.includes('dark'), 'Kbach.toggle() did not flip the .dark class on <html>');

if (failures.length > 0) {
  console.error(`verify-bundle: FAILED\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('verify-bundle: dist/kbach.js OK (existing, added and changed classes styled; mode-aware colors via CSS variables)');
window.close();
