// Content generators for the files this CLI creates. Kept byte-for-byte
// consistent with what packages/react/README.md documents as the manual
// setup steps, so there's no drift between what a developer would
// copy-paste by hand and what this CLI generates.

export function kbachConfigTemplate(): string {
  return `// kbach.config.js
// Full reference: https://github.com/semsakadanupol/kbach (or your installed kbach-react.md / kbach-native.md)
module.exports = {
  darkMode: 'attribute', // 'attribute' | 'class' | 'media'

  theme: {
    // colors: { brand: { 1: '#eff6ff', 6: '#3b82f6', 10: '#1e3a5f' } }, // replaces the section
  },

  extend: {
    // colors: { brand: { 6: '#6366f1' } }, // adds to defaults
    // spacing: { 18: 72 },
    // fontFamily: { sans: 'Inter, sans-serif' },
  },

  plugins: [
    // ({ addUtility, addVariant, theme }) => {
    //   addUtility('border-brand', { borderColor: theme('colors.brand.6'), borderWidth: 2 });
    // },
  ],
};
`;
}

/** The empty stylesheet Static CSS setup writes into between build runs. */
export function kbachCssTemplate(): string {
  return `/* kbach:start */
/* kbach:end */
`;
}

export const KBACH_CSS_START_MARKER = '/* kbach:start */';
export const KBACH_CSS_END_MARKER = '/* kbach:end */';

/**
 * Native babel.config.js — only ever written when no such file already exists.
 * `preset` is 'babel-preset-expo' for an Expo project or '@react-native/babel-preset'
 * for bare React Native — see detect.ts's isExpoProject().
 */
export function babelConfigTemplate(preset: string): string {
  return `module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      '${preset}',
      '@kbach/react/babel',
    ],
  };
};
`;
}
