/**
 * Unified modifier registry — single source of truth for ALL modifier behavior.
 *
 * Adding a new modifier requires editing ONLY this file:
 *   1. Add an entry to BUILTIN_MODIFIERS with its CSS and JS behavior.
 *   2. Done — parser, resolver, CSS generator, and JSX runtime all derive
 *      their behavior from this data automatically.
 *
 * Plugin authors can register custom modifiers via registerModifier().
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModifierDef {
  /** CSS pseudo-class or pseudo-element appended to the selector (e.g. ':hover', '::before') */
  pseudo?: string;
  /** Ancestor selector prefix INCLUDING trailing space (e.g. '.group:hover ', '.peer:focus ~ ') */
  ancestorSelector?: string;
  /** Directionality attribute selector prefix INCLUDING trailing space (e.g. '[dir="rtl"] ') */
  dirSelector?: string;
  /** @media query body WITHOUT the '@media ' prefix (e.g. 'print', '(orientation: landscape)') */
  mediaQuery?: string;
  /** Dark/light mode scheme — triggers the configured darkMode strategy in CSS output */
  darkScheme?: 'dark' | 'light';
  /** True for responsive modifiers — wraps in @media (min-width: theme.screens[name]) */
  isResponsive?: boolean;
  /**
   * Forces !important on all declarations in the generated CSS rule.
   * Applied automatically for structural / ancestor / media modifiers that must
   * win over base inline styles.
   */
  forcesImportant?: boolean;
  /**
   * How the JSX runtime routes this modifier:
   *   'interactive'  — managed by InteractiveWrapper (hover, focus, pressed, …)
   *   'mode'         — managed by DarkWrapper (dark, light, not-dark, …)
   *   'responsive'   — managed by DarkWrapper (sm, md, lg, xl, 2xl)
   *   'css-only'     — CSS injection only; matchModifier always returns false
   */
  jsBehavior: 'interactive' | 'mode' | 'responsive' | 'css-only';
  /**
   * Evaluates whether this modifier's condition is met at runtime.
   * Omit for 'css-only' modifiers — they never apply as inline styles.
   */
  jsMatch?: (
    isDark: boolean,
    state: Record<string, boolean | undefined>,
    breakpoints: Set<string>,
  ) => boolean;
}

// ─── Built-in modifiers ───────────────────────────────────────────────────────

export const BUILTIN_MODIFIERS: Readonly<Record<string, ModifierDef>> = {
  // ── Mode ─────────────────────────────────────────────────────────────────
  dark:       { darkScheme: 'dark',  jsBehavior: 'mode', jsMatch: (d)       => d },
  'not-light':{ darkScheme: 'dark',  jsBehavior: 'mode', jsMatch: (d)       => d },
  light:      { darkScheme: 'light', jsBehavior: 'mode', jsMatch: (d)       => !d },
  'not-dark': { darkScheme: 'light', jsBehavior: 'mode', jsMatch: (d)       => !d },

  // ── Interactive — JS state + CSS pseudo ───────────────────────────────────
  hover:          { pseudo: ':hover',            jsBehavior: 'interactive', jsMatch: (_, s) => !!s.hover },
  'not-hover':    { pseudo: ':not(:hover)',       jsBehavior: 'interactive', jsMatch: (_, s) => !s.hover },
  focus:          { pseudo: ':focus',             jsBehavior: 'interactive', jsMatch: (_, s) => !!s.focus },
  'not-focus':    { pseudo: ':not(:focus)',       jsBehavior: 'interactive', jsMatch: (_, s) => !s.focus },
  active:         { pseudo: ':active',            jsBehavior: 'interactive', jsMatch: (_, s) => !!s.active || !!s.pressed },
  'not-active':   { pseudo: ':not(:active)',      jsBehavior: 'interactive', jsMatch: (_, s) => !s.active && !s.pressed },
  pressed:        { pseudo: ':active',            jsBehavior: 'interactive', jsMatch: (_, s) => !!s.pressed || !!s.active },
  'not-pressed':  { pseudo: ':not(:active)',      jsBehavior: 'interactive', jsMatch: (_, s) => !s.pressed && !s.active },
  disabled:       { pseudo: ':disabled',          jsBehavior: 'interactive', jsMatch: (_, s) => !!s.disabled },
  'not-disabled': { pseudo: ':not(:disabled)',    jsBehavior: 'interactive', jsMatch: (_, s) => !s.disabled },
  checked:        { pseudo: ':checked',           jsBehavior: 'interactive', jsMatch: (_, s) => !!s.checked },
  'not-checked':  { pseudo: ':not(:checked)',     jsBehavior: 'interactive', jsMatch: (_, s) => !s.checked },
  visited:        { pseudo: ':visited',           jsBehavior: 'interactive', jsMatch: (_, s) => !!s.visited },
  'not-visited':  { pseudo: ':not(:visited)',     jsBehavior: 'interactive', jsMatch: (_, s) => !s.visited },
  placeholder:    { pseudo: '::placeholder',      jsBehavior: 'interactive', jsMatch: (_, s) => !!s.placeholder },

  // ── CSS-only pseudo-classes (structural) ──────────────────────────────────
  first:           { pseudo: ':first-child',     jsBehavior: 'css-only', forcesImportant: true },
  last:            { pseudo: ':last-child',      jsBehavior: 'css-only', forcesImportant: true },
  odd:             { pseudo: ':nth-child(odd)',  jsBehavior: 'css-only', forcesImportant: true },
  even:            { pseudo: ':nth-child(even)', jsBehavior: 'css-only', forcesImportant: true },
  only:            { pseudo: ':only-child',      jsBehavior: 'css-only', forcesImportant: true },
  'focus-within':  { pseudo: ':focus-within',    jsBehavior: 'css-only', forcesImportant: true },
  'focus-visible': { pseudo: ':focus-visible',   jsBehavior: 'css-only', forcesImportant: true },

  // ── CSS-only pseudo-elements ───────────────────────────────────────────────
  before:         { pseudo: '::before',       jsBehavior: 'css-only' },
  after:          { pseudo: '::after',        jsBehavior: 'css-only' },
  selection:      { pseudo: '::selection',    jsBehavior: 'css-only' },
  'first-letter': { pseudo: '::first-letter', jsBehavior: 'css-only' },
  'first-line':   { pseudo: '::first-line',   jsBehavior: 'css-only' },
  marker:         { pseudo: '::marker',       jsBehavior: 'css-only' },

  // ── Group / peer ancestor selectors (CSS-only) ─────────────────────────────
  'group-hover': { ancestorSelector: '.group:hover ', jsBehavior: 'css-only', forcesImportant: true },
  'group-focus': { ancestorSelector: '.group:focus ', jsBehavior: 'css-only', forcesImportant: true },
  'peer-hover':  { ancestorSelector: '.peer:hover ~ ', jsBehavior: 'css-only', forcesImportant: true },
  'peer-focus':  { ancestorSelector: '.peer:focus ~ ', jsBehavior: 'css-only', forcesImportant: true },

  // ── Responsive — both CSS (@media min-width) and JS (breakpoints set) ──────
  sm:    { isResponsive: true, jsBehavior: 'responsive', jsMatch: (_, __, bp) => bp.has('sm') },
  md:    { isResponsive: true, jsBehavior: 'responsive', jsMatch: (_, __, bp) => bp.has('md') },
  lg:    { isResponsive: true, jsBehavior: 'responsive', jsMatch: (_, __, bp) => bp.has('lg') },
  xl:    { isResponsive: true, jsBehavior: 'responsive', jsMatch: (_, __, bp) => bp.has('xl') },
  '2xl': { isResponsive: true, jsBehavior: 'responsive', jsMatch: (_, __, bp) => bp.has('2xl') },

  // ── Print media (CSS-only) ─────────────────────────────────────────────────
  print: { mediaQuery: 'print', jsBehavior: 'css-only', forcesImportant: true },

  // ── Orientation / accessibility media (CSS-only) ───────────────────────────
  landscape:       { mediaQuery: '(orientation: landscape)',              jsBehavior: 'css-only', forcesImportant: true },
  portrait:        { mediaQuery: '(orientation: portrait)',              jsBehavior: 'css-only', forcesImportant: true },
  'motion-reduce': { mediaQuery: '(prefers-reduced-motion: reduce)',     jsBehavior: 'css-only', forcesImportant: true },
  'motion-safe':   { mediaQuery: '(prefers-reduced-motion: no-preference)', jsBehavior: 'css-only', forcesImportant: true },
  'contrast-more': { mediaQuery: '(prefers-contrast: more)',             jsBehavior: 'css-only', forcesImportant: true },
  'contrast-less': { mediaQuery: '(prefers-contrast: less)',             jsBehavior: 'css-only', forcesImportant: true },

  // ── Directionality (CSS-only) ──────────────────────────────────────────────
  rtl: { dirSelector: '[dir="rtl"] ', jsBehavior: 'css-only', forcesImportant: true },
  ltr: { dirSelector: '[dir="ltr"] ', jsBehavior: 'css-only', forcesImportant: true },
};

// ─── Plugin modifier registry ──────────────────────────────────────────────────

const _pluginModifiers: Record<string, ModifierDef> = {};

// Derived-set caches — invalidated whenever the plugin map changes.
let _allNames: Set<string> | null = null;
let _interactiveNames: Set<string> | null = null;
let _modeNames: Set<string> | null = null;
let _responsiveNames: Set<string> | null = null;

function _invalidate(): void {
  _allNames = null;
  _interactiveNames = null;
  _modeNames = null;
  _responsiveNames = null;
}

export function registerModifier(name: string, def: ModifierDef): void {
  if (process.env.NODE_ENV !== 'production' && name in BUILTIN_MODIFIERS) {
    console.warn(`[kbach] registerModifier: "${name}" is a built-in modifier and cannot be overridden. Use a different name.`);
    return;
  }
  _pluginModifiers[name] = def;
  _invalidate();
}

export function clearPluginModifiers(): void {
  for (const k of Object.keys(_pluginModifiers)) delete _pluginModifiers[k];
  _invalidate();
}

export function getModifier(name: string): ModifierDef | undefined {
  return BUILTIN_MODIFIERS[name] ?? _pluginModifiers[name];
}

export function isKnownModifier(name: string): boolean {
  return name in BUILTIN_MODIFIERS || name in _pluginModifiers;
}

// ─── Derived sets (lazy, recomputed after plugin changes) ─────────────────────

function _allEntries(): [string, ModifierDef][] {
  return [...Object.entries(BUILTIN_MODIFIERS), ...Object.entries(_pluginModifiers)];
}

/** All known modifier names (built-in + plugin). */
export function getAllModifierNames(): Set<string> {
  if (!_allNames) _allNames = new Set(_allEntries().map(([k]) => k));
  return _allNames;
}

/** Modifier names routed to InteractiveWrapper. */
export function getInteractiveModifiers(): Set<string> {
  if (!_interactiveNames) {
    _interactiveNames = new Set(_allEntries().filter(([, d]) => d.jsBehavior === 'interactive').map(([k]) => k));
  }
  return _interactiveNames;
}

/** Modifier names routed to DarkWrapper for mode switching. */
export function getModeModifiers(): Set<string> {
  if (!_modeNames) {
    _modeNames = new Set(_allEntries().filter(([, d]) => d.jsBehavior === 'mode').map(([k]) => k));
  }
  return _modeNames;
}

/** Modifier names routed to DarkWrapper for responsive handling. */
export function getResponsiveModifiers(): Set<string> {
  if (!_responsiveNames) {
    _responsiveNames = new Set(_allEntries().filter(([, d]) => d.jsBehavior === 'responsive').map(([k]) => k));
  }
  return _responsiveNames;
}

/**
 * Evaluates whether a modifier matches the current runtime state.
 * CSS-only modifiers always return false — they have no JS representation.
 */
export function matchModifier(
  name: string,
  isDark: boolean,
  state: Record<string, boolean | undefined>,
  breakpoints: Set<string>,
): boolean {
  return getModifier(name)?.jsMatch?.(isDark, state, breakpoints) ?? false;
}
