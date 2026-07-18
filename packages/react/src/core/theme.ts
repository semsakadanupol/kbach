import type { ThemeConfig, ThemeColors } from './types';

// ─── Kbach color palette (1 = lightest, 12 = darkest) ────────────────────────

export const defaultColors: ThemeColors = {
  transparent: 'transparent',
  current: 'currentColor',
  black: '#000000',
  white: '#ffffff',

  slate: {
    1: '#f8fafc', 2: '#f1f5f9', 3: '#e2e8f0', 4: '#cbd5e1',
    5: '#94a3b8', 6: '#64748b', 7: '#475569', 8: '#334155',
    9: '#1e293b', 10: '#0f172a', 11: '#020617', 12: '#01020a',
  },
  gray: {
    1: '#f9fafb', 2: '#f3f4f6', 3: '#e5e7eb', 4: '#d1d5db',
    5: '#9ca3af', 6: '#6b7280', 7: '#4b5563', 8: '#374151',
    9: '#1f2937', 10: '#111827', 11: '#030712', 12: '#020409',
  },
  zinc: {
    1: '#fafafa', 2: '#f4f4f5', 3: '#e4e4e7', 4: '#d4d4d8',
    5: '#a1a1aa', 6: '#71717a', 7: '#52525b', 8: '#3f3f46',
    9: '#27272a', 10: '#18181b', 11: '#09090b', 12: '#050506',
  },
  neutral: {
    1: '#fafafa', 2: '#f5f5f5', 3: '#e5e5e5', 4: '#d4d4d4',
    5: '#a3a3a3', 6: '#737373', 7: '#525252', 8: '#404040',
    9: '#262626', 10: '#171717', 11: '#0a0a0a', 12: '#050505',
  },
  stone: {
    1: '#fafaf9', 2: '#f5f5f4', 3: '#e7e5e4', 4: '#d6d3d1',
    5: '#a8a29e', 6: '#78716c', 7: '#57534e', 8: '#44403c',
    9: '#292524', 10: '#1c1917', 11: '#0c0a09', 12: '#070605',
  },

  red: {
    1: '#fef2f2', 2: '#fee2e2', 3: '#fecaca', 4: '#fca5a5',
    5: '#f87171', 6: '#ef4444', 7: '#dc2626', 8: '#b91c1c',
    9: '#991b1b', 10: '#7f1d1d', 11: '#450a0a', 12: '#280606',
  },
  orange: {
    1: '#fff7ed', 2: '#ffedd5', 3: '#fed7aa', 4: '#fdba74',
    5: '#fb923c', 6: '#f97316', 7: '#ea580c', 8: '#c2410c',
    9: '#9a3412', 10: '#7c2d12', 11: '#431407', 12: '#270c04',
  },
  amber: {
    1: '#fffbeb', 2: '#fef3c7', 3: '#fde68a', 4: '#fcd34d',
    5: '#fbbf24', 6: '#f59e0b', 7: '#d97706', 8: '#b45309',
    9: '#92400e', 10: '#78350f', 11: '#451a03', 12: '#291002',
  },
  yellow: {
    1: '#fefce8', 2: '#fef9c3', 3: '#fef08a', 4: '#fde047',
    5: '#facc15', 6: '#eab308', 7: '#ca8a04', 8: '#a16207',
    9: '#854d0e', 10: '#713f12', 11: '#422006', 12: '#271304',
  },
  lime: {
    1: '#f7fee7', 2: '#ecfccb', 3: '#d9f99d', 4: '#bef264',
    5: '#a3e635', 6: '#84cc16', 7: '#65a30d', 8: '#4d7c0f',
    9: '#3f6212', 10: '#365314', 11: '#1a2e05', 12: '#0f1b03',
  },
  green: {
    1: '#f0fdf4', 2: '#dcfce7', 3: '#bbf7d0', 4: '#86efac',
    5: '#4ade80', 6: '#22c55e', 7: '#16a34a', 8: '#15803d',
    9: '#166534', 10: '#14532d', 11: '#052e16', 12: '#031b0d',
  },
  emerald: {
    1: '#ecfdf5', 2: '#d1fae5', 3: '#a7f3d0', 4: '#6ee7b7',
    5: '#34d399', 6: '#10b981', 7: '#059669', 8: '#047857',
    9: '#065f46', 10: '#064e3b', 11: '#022c22', 12: '#011a14',
  },
  teal: {
    1: '#f0fdfa', 2: '#ccfbf1', 3: '#99f6e4', 4: '#5eead4',
    5: '#2dd4bf', 6: '#14b8a6', 7: '#0d9488', 8: '#0f766e',
    9: '#115e59', 10: '#134e4a', 11: '#042f2e', 12: '#021c1b',
  },
  cyan: {
    1: '#ecfeff', 2: '#cffafe', 3: '#a5f3fc', 4: '#67e8f9',
    5: '#22d3ee', 6: '#06b6d4', 7: '#0891b2', 8: '#0e7490',
    9: '#155e75', 10: '#164e63', 11: '#083344', 12: '#041e28',
  },
  sky: {
    1: '#f0f9ff', 2: '#e0f2fe', 3: '#bae6fd', 4: '#7dd3fc',
    5: '#38bdf8', 6: '#0ea5e9', 7: '#0284c7', 8: '#0369a1',
    9: '#075985', 10: '#0c4a6e', 11: '#082f49', 12: '#041b2b',
  },
  blue: {
    1: '#eff6ff', 2: '#dbeafe', 3: '#bfdbfe', 4: '#93c5fd',
    5: '#60a5fa', 6: '#3b82f6', 7: '#2563eb', 8: '#1d4ed8',
    9: '#1e40af', 10: '#1e3a8a', 11: '#172554', 12: '#0d1633',
  },
  indigo: {
    1: '#eef2ff', 2: '#e0e7ff', 3: '#c7d2fe', 4: '#a5b4fc',
    5: '#818cf8', 6: '#6366f1', 7: '#4f46e5', 8: '#4338ca',
    9: '#3730a3', 10: '#312e81', 11: '#1e1b4b', 12: '#12102d',
  },
  violet: {
    1: '#f5f3ff', 2: '#ede9fe', 3: '#ddd6fe', 4: '#c4b5fd',
    5: '#a78bfa', 6: '#8b5cf6', 7: '#7c3aed', 8: '#6d28d9',
    9: '#5b21b6', 10: '#4c1d95', 11: '#2e1065', 12: '#1c0a3d',
  },
  purple: {
    1: '#faf5ff', 2: '#f3e8ff', 3: '#e9d5ff', 4: '#d8b4fe',
    5: '#c084fc', 6: '#a855f7', 7: '#9333ea', 8: '#7e22ce',
    9: '#6b21a8', 10: '#581c87', 11: '#3b0764', 12: '#23043c',
  },
  fuchsia: {
    1: '#fdf4ff', 2: '#fae8ff', 3: '#f5d0fe', 4: '#f0abfc',
    5: '#e879f9', 6: '#d946ef', 7: '#c026d3', 8: '#a21caf',
    9: '#86198f', 10: '#701a75', 11: '#4a044e', 12: '#2d022f',
  },
  pink: {
    1: '#fdf2f8', 2: '#fce7f3', 3: '#fbcfe8', 4: '#f9a8d4',
    5: '#f472b6', 6: '#ec4899', 7: '#db2777', 8: '#be185d',
    9: '#9d174d', 10: '#831843', 11: '#500724', 12: '#300415',
  },
  rose: {
    1: '#fff1f2', 2: '#ffe4e6', 3: '#fecdd3', 4: '#fda4af',
    5: '#fb7185', 6: '#f43f5e', 7: '#e11d48', 8: '#be123c',
    9: '#9f1239', 10: '#881337', 11: '#4c0519', 12: '#2d030e',
  },
};

// ─── Default theme ────────────────────────────────────────────────────────────

export const defaultTheme: ThemeConfig = {
  colors: defaultColors,

  // 1 unit = 4px
  spacing: {
    px: 1,
    0: 0,
    '0.5': 2,
    1: 4,
    '1.5': 6,
    2: 8,
    '2.5': 10,
    3: 12,
    '3.5': 14,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    9: 36,
    10: 40,
    11: 44,
    12: 48,
    14: 56,
    16: 64,
    20: 80,
    24: 96,
    28: 112,
    32: 128,
    36: 144,
    40: 160,
    44: 176,
    48: 192,
    52: 208,
    56: 224,
    60: 240,
    64: 256,
    72: 288,
    80: 320,
    96: 384,
    auto: 'auto',
    full: '100%',
    '1/2': '50%',
    '1/3': '33.333333%',
    '2/3': '66.666667%',
    '1/4': '25%',
    '3/4': '75%',
    // Dynamic viewport unit — see the comment on the 'screen' standalone utilities
    // in utilities.ts for why dvh beats vh on mobile. Used by h-screen (w-screen
    // has its own standalone entry so it never reaches this spacing lookup).
    screen: '100dvh',
    min: 'min-content',
    max: 'max-content',
    fit: 'fit-content',
  },

  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
    '6xl': 60,
    '7xl': 72,
    '8xl': 96,
    '9xl': 128,
  },

  fontFamily: {
    sans: 'System',
    mono: 'Courier New',
    serif: 'Georgia',
  },

  fontWeight: {
    thin: '100',
    extralight: '200',
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    black: '900',
  },

  borderRadius: {
    none: 0,
    sm: 2,
    DEFAULT: 4,
    md: 6,
    lg: 8,
    xl: 12,
    '2xl': 16,
    '3xl': 24,
    full: 9999,
  },

  borderWidth: {
    DEFAULT: 1,
    0: 0,
    2: 2,
    4: 4,
    8: 8,
  },

  opacity: {
    0: 0,
    5: 0.05,
    10: 0.1,
    15: 0.15,
    20: 0.2,
    25: 0.25,
    30: 0.3,
    40: 0.4,
    50: 0.5,
    60: 0.6,
    70: 0.7,
    75: 0.75,
    80: 0.8,
    90: 0.9,
    95: 0.95,
    100: 1,
  },

  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
    // Pixel values stored as strings; styleValueToCSS passes them through, toNativeValue strips the unit
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    7: '28px',
    8: '32px',
    9: '36px',
    10: '40px',
  },

  letterSpacing: {
    tighter: -0.8,
    tight: -0.4,
    normal: 0,
    wide: 0.4,
    wider: 0.8,
    widest: 1.6,
  },

  zIndex: {
    auto: 'auto',
    0: 0,
    10: 10,
    20: 20,
    30: 30,
    40: 40,
    50: 50,
  },

  flex: {
    1: 1,
    auto: 'auto',     // CSS: flex: auto = 1 1 auto; native: mapped to 1 in resolver
    initial: 'initial', // CSS: flex: initial = 0 1 auto; native: mapped to 1
    none: 'none',     // CSS: flex: none = 0 0 auto; native: mapped to 0
  },

  shadow: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    DEFAULT: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 15,
      elevation: 4,
    },
    xl: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 6,
    },
    '2xl': {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 24 },
      shadowOpacity: 0.25,
      shadowRadius: 48,
      elevation: 8,
    },
    none: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  },

  screens: {
    sm: 576,   // small tablets / large phones (landscape)
    md: 768,   // tablets (iPad and up)
    lg: 1024,  // large tablets (iPad Pro)
    xl: 1280,  // desktop
    '2xl': 1536,
  },
};
