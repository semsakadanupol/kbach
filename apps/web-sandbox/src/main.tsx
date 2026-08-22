import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyKbachConfig, initKbach, kb, setTheme, getTheme, disableRuntimeCSS } from '@kbach/react';
import App from './App';
import './kbach.css';

// Must match vite.config.ts's kbach({ config: {...} }) exactly — that
// option only drives build-time CSS generation, it never reaches this
// runtime module. Without this, useTheme()'s own toggle (dogfooded in
// App.tsx) would silently no-op: it reads THIS module's active theme,
// which otherwise defaults to 'media' (no DOM write for a manual toggle).
applyKbachConfig({ darkMode: 'attribute' });

// The static kbach.css (written by @kbach/react/vite, see vite.config.ts)
// already provides these rules — disable runtime injection so nothing
// duplicates them. Must come before any kb()/className resolution.
disableRuntimeCSS();

// Sandbox-only test hook (not part of the published API) — lets the
// Playwright verification script exercise setTheme()/kb() directly for
// scenarios (dark-mode strategy switching) that don't map to a UI toggle.
declare global {
  interface Window {
    __kbachTest?: { kb: typeof kb; setTheme: typeof setTheme; getTheme: typeof getTheme };
  }
}
window.__kbachTest = { kb, setTheme, getTheme };

// Rust/WASM core engine must finish loading before the first kb() call —
// see @kbach/react's wasmLoader.ts for why this can't be synchronous the
// way old-kbach's resolver was.
initKbach().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
