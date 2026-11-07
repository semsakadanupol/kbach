# @kbach/browser

Kbach from a CDN: one `<script>` tag styles a plain HTML page with Kbach's
utility classes, the same vocabulary as [`@kbach/react`](https://www.npmjs.com/package/@kbach/react).
No build step, no bundler, no React.

> Beta — API may still change before 1.0.0.

## Quick start

```html
<!doctype html>
<html>
  <head>
    <script src="https://cdn.jsdelivr.net/npm/@kbach/browser"></script>
  </head>
  <body>
    <div class="flex items-center gap-4 bg-blue-6 text-white p-4 rounded-lg">
      Hello Kbach
    </div>
  </body>
</html>
```

The script loads the Rust/WASM engine (about 7 KB of JS plus 158 KB of
WASM, gzipped), styles every `class` already on the page, and keeps
watching: elements added later and `class` changes are styled
automatically. Pin a version in production
(`https://cdn.jsdelivr.net/npm/@kbach/browser@1.0.0-beta.1`).
`https://unpkg.com/@kbach/browser` works too.

## Config

Same shape as `kbach.config.js`. Set it before the
script tag:

```html
<script>
  window.kbachConfig = {
    darkMode: 'class',
    extend: { colors: { brand: '#ff6b35', surface: { light: '#f9fafb', dark: '#111827' } } },
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@kbach/browser"></script>
```

## Runtime API

`window.Kbach` has:
- `Kbach.ready`: a promise that resolves once the page is styled
- `Kbach.toggle()` / `Kbach.setMode('light' | 'dark' | 'system')`: dark
  mode, persisted (needs `darkMode: 'class'` or `'attribute'`; under the
  default `'media'` the OS decides)
- `Kbach.config({...})`: replace the config and re-style the page
- `Kbach.refresh()`: re-scan the page (rarely needed)

## Self-hosting

Serve `dist/kbach.js` and
`dist/kbach_core_engine_bg.wasm` from the same folder, or point at the
`.wasm` explicitly with `<script src="/kbach.js" data-wasm="/assets/kbach_core_engine_bg.wasm">`.

## Prototypes vs production

`@kbach/browser` resolves classes in the browser, like Tailwind's Play CDN.
That makes it great for prototypes, but the page is unstyled for a moment
while the engine loads. For production apps, use [`@kbach/react`](https://www.npmjs.com/package/@kbach/react)'s
build plugin instead: zero runtime cost and no flash.

## License

MIT
