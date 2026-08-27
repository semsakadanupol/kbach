/** @type {import('@kbach/react').KbachConfig} */
export default {
  // 'attribute' (writes data-theme to <html>) rather than the package's
  // default 'media' — this sandbox dogfoods useTheme()'s manual toggle
  // (see App.tsx's theme-provider-toggle/toggle-btn), which only has a
  // visible effect under 'class'/'attribute'; 'media' ignores DOM state
  // entirely and only ever follows the OS preference.
  darkMode: 'attribute',
};
