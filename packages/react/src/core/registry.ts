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

import { escapeCSSSelector } from './platform';
import { kbachWarn } from './devWarn';
import { LRUCache } from './cache';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModifierDef {
  /**
   * Cascade priority for CSS rule ORDER — NOT specificity. Two rules that
   * differ only by modifier (e.g. `.hover\:bg-blue-6:hover` and
   * `.focus\:bg-red-6:focus`) have equal CSS specificity, so when both
   * conditions are true at once (hovering AND focused), the winner is
   * whichever rule appears LATER in the stylesheet — CSS's normal same-
   * specificity tiebreak. Without a fixed priority, "later" would depend on
   * encounter order (whichever class the app happens to render/scan first),
   * making the winner effectively random and inconsistent across reloads/
   * builds. `order` fixes that: rules are emitted/injected sorted by this
   * value (ascending — higher wins ties), regardless of source order, so
   * e.g. `disabled:` always beats `hover:` on the same element no matter
   * which one was written first in the className or rendered first in the
   * app. Omit for the default (0). See getModifierOrder() below.
   */
  order?: number;
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
//
// `order` values below encode a fixed cascade priority (see ModifierDef.order's
// doc comment) — roughly "how urgently this state should visually dominate the
// element": structural position < visited link < hover < focus-within < focus <
// focus-visible < active/pressed < checked < disabled, so e.g. a disabled,
// hovered button always renders as disabled, never stuck showing hover styles,
// regardless of which class was written first or rendered first. Responsive/
// dark/media/directionality modifiers sit at the end since they already scope
// via an ancestor selector or @media wrapper (naturally less likely to tie
// with a plain pseudo-class), but still get a fixed slot for determinism when
// two of THEM tie (e.g. print: vs rtl:).

export const BUILTIN_MODIFIERS: Readonly<Record<string, ModifierDef>> = {
  // ── Mode ─────────────────────────────────────────────────────────────────
  dark:       { order: 60, darkScheme: 'dark',  jsBehavior: 'mode', jsMatch: (d)       => d },
  'not-light':{ order: 60, darkScheme: 'dark',  jsBehavior: 'mode', jsMatch: (d)       => d },
  light:      { order: 60, darkScheme: 'light', jsBehavior: 'mode', jsMatch: (d)       => !d },
  'not-dark': { order: 60, darkScheme: 'light', jsBehavior: 'mode', jsMatch: (d)       => !d },

  // ── Interactive — JS state + CSS pseudo ───────────────────────────────────
  hover:          { order: 10, pseudo: ':hover',            jsBehavior: 'interactive', jsMatch: (_, s) => !!s.hover },
  'not-hover':    { order: 10, pseudo: ':not(:hover)',       jsBehavior: 'interactive', jsMatch: (_, s) => !s.hover },
  focus:          { order: 20, pseudo: ':focus',             jsBehavior: 'interactive', jsMatch: (_, s) => !!s.focus },
  'not-focus':    { order: 20, pseudo: ':not(:focus)',       jsBehavior: 'interactive', jsMatch: (_, s) => !s.focus },
  active:         { order: 30, pseudo: ':active',            jsBehavior: 'interactive', jsMatch: (_, s) => !!s.active || !!s.pressed },
  'not-active':   { order: 30, pseudo: ':not(:active)',      jsBehavior: 'interactive', jsMatch: (_, s) => !s.active && !s.pressed },
  pressed:        { order: 30, pseudo: ':active',            jsBehavior: 'interactive', jsMatch: (_, s) => !!s.pressed || !!s.active },
  'not-pressed':  { order: 30, pseudo: ':not(:active)',      jsBehavior: 'interactive', jsMatch: (_, s) => !s.pressed && !s.active },
  disabled:       { order: 40, pseudo: ':disabled',          jsBehavior: 'interactive', jsMatch: (_, s) => !!s.disabled },
  'not-disabled': { order: 40, pseudo: ':not(:disabled)',    jsBehavior: 'interactive', jsMatch: (_, s) => !s.disabled },
  checked:        { order: 35, pseudo: ':checked',           jsBehavior: 'interactive', jsMatch: (_, s) => !!s.checked },
  'not-checked':  { order: 35, pseudo: ':not(:checked)',     jsBehavior: 'interactive', jsMatch: (_, s) => !s.checked },
  visited:        { order: 5,  pseudo: ':visited',           jsBehavior: 'interactive', jsMatch: (_, s) => !!s.visited },
  'not-visited':  { order: 5,  pseudo: ':not(:visited)',     jsBehavior: 'interactive', jsMatch: (_, s) => !s.visited },
  placeholder:    { order: 0,  pseudo: '::placeholder',      jsBehavior: 'interactive', jsMatch: (_, s) => !!s.placeholder },

  // ── CSS-only pseudo-classes (structural) ──────────────────────────────────
  first:           { order: 0,  pseudo: ':first-child',     jsBehavior: 'css-only', forcesImportant: true },
  last:            { order: 0,  pseudo: ':last-child',      jsBehavior: 'css-only', forcesImportant: true },
  odd:             { order: 0,  pseudo: ':nth-child(odd)',  jsBehavior: 'css-only', forcesImportant: true },
  even:            { order: 0,  pseudo: ':nth-child(even)', jsBehavior: 'css-only', forcesImportant: true },
  only:            { order: 0,  pseudo: ':only-child',      jsBehavior: 'css-only', forcesImportant: true },
  'focus-within':  { order: 15, pseudo: ':focus-within',    jsBehavior: 'css-only', forcesImportant: true },
  'focus-visible': { order: 25, pseudo: ':focus-visible',   jsBehavior: 'css-only', forcesImportant: true },

  // ── CSS-only pseudo-elements ───────────────────────────────────────────────
  before:         { order: 0, pseudo: '::before',       jsBehavior: 'css-only' },
  after:          { order: 0, pseudo: '::after',        jsBehavior: 'css-only' },
  selection:      { order: 0, pseudo: '::selection',    jsBehavior: 'css-only' },
  'first-letter': { order: 0, pseudo: '::first-letter', jsBehavior: 'css-only' },
  'first-line':   { order: 0, pseudo: '::first-line',   jsBehavior: 'css-only' },
  marker:         { order: 0, pseudo: '::marker',       jsBehavior: 'css-only' },

  // ── Group / peer ancestor selectors (CSS-only) ─────────────────────────────
  'group-hover': { order: 10, ancestorSelector: '.group:hover ', jsBehavior: 'css-only', forcesImportant: true },
  'group-focus': { order: 20, ancestorSelector: '.group:focus ', jsBehavior: 'css-only', forcesImportant: true },
  'peer-hover':  { order: 10, ancestorSelector: '.peer:hover ~ ', jsBehavior: 'css-only', forcesImportant: true },
  'peer-focus':  { order: 20, ancestorSelector: '.peer:focus ~ ', jsBehavior: 'css-only', forcesImportant: true },

  // ── Responsive — both CSS (@media min-width) and JS (breakpoints set) ──────
  sm:    { order: 50, isResponsive: true, jsBehavior: 'responsive', jsMatch: (_, __, bp) => bp.has('sm') },
  md:    { order: 50, isResponsive: true, jsBehavior: 'responsive', jsMatch: (_, __, bp) => bp.has('md') },
  lg:    { order: 50, isResponsive: true, jsBehavior: 'responsive', jsMatch: (_, __, bp) => bp.has('lg') },
  xl:    { order: 50, isResponsive: true, jsBehavior: 'responsive', jsMatch: (_, __, bp) => bp.has('xl') },
  '2xl': { order: 50, isResponsive: true, jsBehavior: 'responsive', jsMatch: (_, __, bp) => bp.has('2xl') },

  // ── Print media (CSS-only) ─────────────────────────────────────────────────
  print: { order: 70, mediaQuery: 'print', jsBehavior: 'css-only', forcesImportant: true },

  // ── Orientation / accessibility media (CSS-only) ───────────────────────────
  landscape:       { order: 70, mediaQuery: '(orientation: landscape)',              jsBehavior: 'css-only', forcesImportant: true },
  portrait:        { order: 70, mediaQuery: '(orientation: portrait)',              jsBehavior: 'css-only', forcesImportant: true },
  'motion-reduce': { order: 70, mediaQuery: '(prefers-reduced-motion: reduce)',     jsBehavior: 'css-only', forcesImportant: true },
  'motion-safe':   { order: 70, mediaQuery: '(prefers-reduced-motion: no-preference)', jsBehavior: 'css-only', forcesImportant: true },
  'contrast-more': { order: 70, mediaQuery: '(prefers-contrast: more)',             jsBehavior: 'css-only', forcesImportant: true },
  'contrast-less': { order: 70, mediaQuery: '(prefers-contrast: less)',             jsBehavior: 'css-only', forcesImportant: true },

  // ── Directionality (CSS-only) ──────────────────────────────────────────────
  rtl: { order: 80, dirSelector: '[dir="rtl"] ', jsBehavior: 'css-only', forcesImportant: true },
  ltr: { order: 80, dirSelector: '[dir="ltr"] ', jsBehavior: 'css-only', forcesImportant: true },
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
    kbachWarn(`"${name}" is built-in — pick another modifier name`);
    return;
  }
  _pluginModifiers[name] = def;
  _invalidate();
}

export function clearPluginModifiers(): void {
  for (const k of Object.keys(_pluginModifiers)) delete _pluginModifiers[k];
  _invalidate();
}

// ─── Named group/peer variants ─────────────────────────────────────────────────
//
// `group-hover:x` always matches the nearest `.group` ancestor, which breaks
// as soon as groups nest — the inner element reacts to BOTH ancestors. Tailwind's
// fix is a name suffix: `group/card` marks the ancestor, `group-hover/card:x`
// only matches that specific one. Since names are open-ended (infinite possible
// values), they can't be pre-registered in BUILTIN_MODIFIERS like every other
// modifier — this constructs a ModifierDef for them on demand instead, and
// memoizes each one so repeated classes (the common case) don't reallocate.
// LRU-bounded like every other cache in core/ — an app that generates dynamic
// group/peer names (ids, indices, …) must not grow this without limit.
const NAMED_GROUP_PEER_RE = /^(group|peer)-(hover|focus)\/(.+)$/;
const _namedModifierCache = new LRUCache<string, ModifierDef>(10_000);

function getNamedGroupPeerModifier(name: string): ModifierDef | undefined {
  const cached = _namedModifierCache.get(name);
  if (cached) return cached;

  const m = NAMED_GROUP_PEER_RE.exec(name);
  if (!m) return undefined;
  const [, kind, trigger, groupName] = m as unknown as [string, 'group' | 'peer', 'hover' | 'focus', string];

  const escapedName = escapeCSSSelector(groupName);
  const pseudo = trigger === 'hover' ? ':hover' : ':focus';
  const combinator = kind === 'group' ? ' ' : ' ~ ';
  const def: ModifierDef = {
    // Matches the plain group-hover/group-focus/peer-hover/peer-focus order below.
    order: trigger === 'hover' ? 10 : 20,
    ancestorSelector: `.${kind}\\/${escapedName}${pseudo}${combinator}`,
    jsBehavior: 'css-only',
    forcesImportant: true,
  };
  _namedModifierCache.set(name, def);
  return def;
}

export function getModifier(name: string): ModifierDef | undefined {
  return BUILTIN_MODIFIERS[name] ?? _pluginModifiers[name] ?? getNamedGroupPeerModifier(name);
}

export function isKnownModifier(name: string): boolean {
  return name in BUILTIN_MODIFIERS || name in _pluginModifiers || NAMED_GROUP_PEER_RE.test(name);
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
 * Cascade-order priority for a bucket key ('base', 'hover', 'sm:dark:focus', …)
 * — see ModifierDef.order's doc comment for why this exists. 'base' (no
 * modifiers) always sorts first. A compound modifier chain takes the MAX
 * order among its parts, so stacking a higher-priority modifier anywhere in
 * the chain (e.g. 'hover:disabled' alongside a plain 'hover') always wins
 * the tie — order reflects "how urgent/dominant this state is", and a chain
 * is exactly as urgent as its most urgent part. An unknown modifier name
 * (already-stripped by the parser, so unreachable in practice) contributes 0.
 */
export function getModifierOrder(bucketKey: string): number {
  if (bucketKey === 'base') return -1;
  let max = 0;
  for (const mod of bucketKey.split(':')) {
    const order = getModifier(mod)?.order ?? 0;
    if (order > max) max = order;
  }
  return max;
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
