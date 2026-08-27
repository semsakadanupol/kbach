import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initKbach, kb, setTheme, getTheme, disableRuntimeCSS } from '@kbach/react';
import App from './App';
import './kbach.css';

// No applyKbachConfig() call — kbach.css itself embeds the darkMode
// strategy it was built with (see vite-plugin/format.ts's --kb-dark-mode),
// and darkModeStore.ts auto-detects it from the DOM on its own. Dogfoods
// this being genuinely optional, not just documented as such.

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
