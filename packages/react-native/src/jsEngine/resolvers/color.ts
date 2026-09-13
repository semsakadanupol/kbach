/**
 * Port of `resolvers/color.rs`'s `lookup_hex`/`color_value`/`split_opacity`
 * — native's own color dispatch (resolveUtilityNative.ts's
 * `resolveColorNative`) doesn't reuse `color::resolve`'s CSS-custom-property
 * opacity composition at all (RN can't parse `var()`), but `border.ts`'s
 * `resolve` (used wholesale on native) uses `colorValue` below for
 * `border-<color>`/`ring-<color>`/`ring-offset-<color>`/`outline-<color>`,
 * getting the same inline `/N` opacity-suffix support as `bg`/`text`.
 * `decoration-<color>` isn't part of native's dispatch surface at all (see
 * `resolveUtilityNative.ts`'s own doc comment), so it has no jsEngine port.
 *
 * Mirrors `lookup_hex`'s exact `ColorValue::Plain`-only behavior now that
 * `theme.colors` can also hold `{ light, dark }` entries (for
 * `useColors()` — see `theme.ts`'s own `ColorEntry` doc comment): a
 * mode-aware entry used directly in a utility CLASS name simply doesn't
 * resolve here, same as it wouldn't in the Rust engine either — by the time
 * a class reaches this lookup, `substituteModeAwareColorToken` below has
 * already rewritten any mode-aware color NAME to a plain hex value.
 */
import type { ColorEntry, ThemeConfig } from '../../theme';
import type { ParsedClass } from '../parser';

// Only used within this file — not part of the jsEngine's public surface.
function lookupHex(theme: ThemeConfig, key: string): string | null {
  const entry = theme.colors[key];
  return typeof entry === 'string' ? entry : null;
}

// The only prefixes a mode-aware color name is recognized under — mirrors
// resolvers/color.rs's identical MODE_AWARE_COLOR_PREFIXES constant exactly
// (see that file's own doc comment for why this list is shared/load-bearing
// rather than duplicated ad hoc per call site).
const MODE_AWARE_COLOR_PREFIXES = ['bg-', 'text-', 'border-'] as const;

/**
 * Mirrors `resolvers/color.rs`'s `find_mode_aware_color` — including
 * stripping a trailing `/N` opacity suffix off the color NAME before the
 * `theme.colors` lookup (and returning it alongside the match). Without
 * this, `bg-surface/50` (surface mode-aware) looked up the literal,
 * never-defined key `"surface/50"`, silently failed to match, and the whole
 * class resolved to nothing — a real, reported bug: any mode-aware custom
 * color completely lost inline opacity support.
 */
function findModeAwareColor(base: string, theme: ThemeConfig): { prefix: string; opacity: number | null; light: string; dark: string } | null {
  const important = base.startsWith('!') ? '!' : '';
  const rest = important ? base.slice(1) : base;
  for (const prefix of MODE_AWARE_COLOR_PREFIXES) {
    if (!rest.startsWith(prefix)) continue;
    const [name, opacity] = splitOpacity(rest.slice(prefix.length));
    const entry: ColorEntry | undefined = theme.colors[name];
    if (typeof entry === 'object' && entry !== null) {
      return { prefix: `${important}${prefix}`, opacity, light: entry.light, dark: entry.dark };
    }
  }
  return null;
}

/**
 * Bakes an optional `/N` opacity suffix into `hex` as an `rgba(...)` string
 * — same decomposition `colorValue` already does for an ordinary
 * (non-mode-aware) color's own inline opacity, reused here so a mode-aware
 * color's light/dark sides get IDENTICAL opacity handling. Mirrors
 * `resolvers/color.rs`'s `apply_opacity_to_hex`.
 */
function applyOpacityToHex(hex: string, opacity: number | null): string {
  if (opacity === null) return hex;
  const rgb = hexToRgb(hex);
  if (rgb === null) return hex;
  return `rgba(${rgb.join(',')},${opacity / 100})`;
}

/**
 * Native's counterpart to the web engine's class-string-level mode-aware
 * expansion (`expand_mode_aware_color_classes` in resolvers/color.rs, used
 * by @kbach/react's/the web build's CSS-generation path only) — this
 * jsEngine has no such pre-pass at all today, so a plain `bg-surface` (where
 * `surface` is a `{ light, dark }` theme color, e.g. from a `kbach.config.js`
 * grouped `dark: {}` block — see `config.ts`'s own doc comment) used to
 * resolve to NOTHING here, dropped silently with no warning. Mirrors
 * `resolve_style.rs`'s `substitute_mode_aware_color_token` exactly: rewrites
 * the color NAME to the single hex matching the CURRENT `colorScheme`
 * directly in place, since (unlike web's static, build-time CSS, which must
 * cover both states in one stylesheet) this engine already knows which mode
 * is active at resolve time — no light/dark PAIR needed, and no reason to
 * ever compute the side that isn't active. An explicit `dark:` (or any
 * other) modifier already on the token is left exactly as-is; only the
 * color name itself is substituted — `nativeModifierState`
 * (resolveStyle.ts) still separately decides whether the token applies at
 * all.
 */
export function substituteModeAwareColorToken(token: string, theme: ThemeConfig, colorScheme: string): string {
  const segments = token.split(':');
  const base = segments.pop() ?? token;
  const modifierPrefix = segments.length > 0 ? `${segments.join(':')}:` : '';

  const found = findModeAwareColor(base, theme);
  if (found === null) return token;
  const hex = colorScheme === 'dark' ? found.dark : found.light;
  return `${modifierPrefix}${found.prefix}[${applyOpacityToHex(hex, found.opacity)}]`;
}

/**
 * Cheap, `colorScheme`-INDEPENDENT check: does any token in `classString`
 * name a mode-aware theme color via a plain `bg-`/`text-`/`border-` class,
 * with no `dark:` (or any other) modifier anywhere in the string? Despite
 * living in this jsEngine directory (mirroring `findModeAwareColor` above,
 * which IS Expo-Go-fallback-only), this particular function is imported
 * directly by jsxRuntimeCore.ts and used for EVERY native entry point (real
 * native module, WASM, and this JS fallback alike) — see that file's own
 * `usesModeAwareColor` doc comment for why: without this signal,
 * jsxRuntimeCore.ts can only detect "needs to react to a theme toggle"
 * syntactically (a literal `dark:` in the class string), and a mode-aware
 * color referenced by its plain name looks identical to an ordinary
 * always-the-same-color class until you already know the theme — which this
 * answers directly, without needing a resolve call through any engine at
 * all.
 */
export function classStringUsesModeAwareColor(classString: string, theme: ThemeConfig): boolean {
  return classString.split(/\s+/).some((rawToken) => {
    if (!rawToken) return false;
    const segments = rawToken.split(':');
    const base = segments.pop() ?? rawToken;
    return findModeAwareColor(base, theme) !== null;
  });
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Splits a trailing `/N` opacity suffix off a color value — Tailwind's
 * inline opacity modifier (`bg-orange-5/50`), a completely different
 * mechanism from the `bg-opacity-*` companion-class utility (which
 * doesn't resolve on native at all — see resolveUtilityNative.ts). Only
 * ever splits when the tail after the LAST "/" parses as a plain 0-100
 * integer — this engine's spacing/sizing utilities also use "/" for
 * FRACTIONS (`w-1/2`), a completely different meaning, but no real color
 * name is ever literally digits, so there's no actual ambiguity between
 * the two uses in practice. Mirrors `resolvers/color.rs`'s `split_opacity`.
 */
function splitOpacity(value: string): [string, number | null] {
  const slash = value.lastIndexOf('/');
  if (slash === -1) return [value, null];
  const opacityText = value.slice(slash + 1);
  const n = Number(opacityText);
  if (opacityText !== '' && Number.isInteger(n) && n >= 0 && n <= 100) {
    return [value.slice(0, slash), n];
  }
  return [value, null];
}

/**
 * Looks up a named color, baking in an inline `/N` opacity suffix (if
 * present) as an `rgba(...)` string — arbitrary values are used as-is.
 * `nativeHexColor` (resolveUtilityNative.ts) uses this for `bg`/`text`, the
 * only representation native's style system can use at all for a
 * slash-opacity color, since it can't parse a CSS `var()`. Mirrors
 * `resolvers/color.rs`'s `color_value` exactly.
 */
export function colorValue(theme: ThemeConfig, parsed: ParsedClass): string | null {
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.isArbitrary) return value;
  const [name, opacity] = splitOpacity(value);
  const hex = lookupHex(theme, name);
  if (hex === null) return null;
  if (opacity === null) return hex;
  const rgb = hexToRgb(hex);
  if (rgb === null) return hex;
  return `rgba(${rgb.join(',')},${opacity / 100})`;
}
