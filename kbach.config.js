/** @type {import('@kbach/react').FrameworkConfig} */
module.exports = {
  // 'attribute' adds data-theme attr on <html>, 'media' uses prefers-color-scheme, 'class' uses .dark class
  darkMode: 'attribute',

  theme: {
    // Override default theme values
    fontFamily: {
      sans: 'System',
      mono: 'Courier New',
    },
  },

  extend: {
    // Extend/add to the default theme without replacing it
    theme: {
      colors: {
        // Custom brand colors
        primary: '#007AFF',
        secondary: '#5856D6',
        success: '#34C759',
        warning: '#FF9500',
        danger: '#FF3B30',
      },
      spacing: {
        // Extra spacing tokens
        128: 512,
        256: 1024,
      },
    },
  },

  // Custom utilities via plugin API
  plugins: [
    // ({ addUtility, theme }) => {
    //   addUtility('btn', {
    //     borderRadius: theme('borderRadius.md'),
    //     paddingHorizontal: theme('spacing.4'),
    //     paddingVertical: theme('spacing.2'),
    //   });
    // },
  ],
};
