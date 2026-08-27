module.exports = {
  plugins: {
    // No `config`/`theme` option — the plugin auto-discovers
    // kbach.config.js at this project's root on its own, the same file
    // app/theme-toggle.tsx's applyKbachConfig() call imports, so there's
    // one value for both sides to agree on instead of the same literal
    // hand-copied into two places.
    '@kbach/react/postcss': {},
  },
};
