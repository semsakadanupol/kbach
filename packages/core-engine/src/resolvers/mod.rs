//! Domain-split resolver — mirrors `old-kbach/src/core/resolvers/*.ts`
//! (RULES.md rule #1: no monolith files). Each submodule owns one styling
//! domain and exposes a `resolve(parsed, theme) -> Option<Vec<Declaration>>`
//! function; `resolve_utility` below dispatches to the first one that
//! recognizes the utility.

mod background;
mod border;
mod color;
mod divide;
mod effects;
mod filters;
mod grid;
mod interactivity;
mod layout;
mod scroll;
mod spacing;
mod transform;
mod typography;

use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

pub use color::expand_mode_aware_color_classes;

/// Looks up the `@keyframes` name + body for an `animate-*` utility's value
/// (e.g. `"spin"` -> `("kb-spin", "from { ... } to { ... }")`) — consulted
/// by `lib.rs::resolve_class_string` to emit the keyframes block as a
/// separate top-level rule alongside the normal `animation: ...` rule
/// `effects::resolve` produces for the same token. `None` for `"none"` (and
/// anything else unrecognized) — there's no keyframes body for "no
/// animation".
pub fn animation_keyframes(parsed: &ParsedClass) -> Option<(&'static str, &'static str)> {
    if parsed.utility != "animate" {
        return None;
    }
    effects::keyframes_for(parsed.value.as_deref()?)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Declaration {
    pub property: String,
    pub value: String,
}

pub(crate) fn decl(property: &str, value: &str) -> Declaration {
    Declaration { property: property.to_string(), value: value.to_string() }
}

/// Resolves a spacing-scale (or arbitrary) length value shared by every
/// utility that draws from the theme's spacing scale — padding/margin/gap
/// sides, width/height bounds, inset/position offsets, space-between.
///
/// `full`/`auto` are hardcoded keywords rather than theme.spacing entries
/// (mirrors `old-kbach/packages/ui/src/core/theme.ts`'s `full: '100%'` and
/// `auto: 'auto'`) — both are valid values on both platforms (RN's Yoga
/// layout accepts `'auto'` for margin/width/height same as CSS, and
/// percentage strings are already confirmed safe by `resolve_style.rs`'s
/// `passes_an_arbitrary_percentage_width_through_as_a_string` test), so it's
/// safe to resolve here in the shared helper rather than needing a
/// web-only/native-only split the way `screen` does (see
/// `layout::resolve_screen_size`). `auto` is what makes `mx-auto`-style
/// centering possible.
/// Looks up a spacing STEP (the bit after `p-`/`gap-`/etc., e.g. `"4"` or
/// `"1.75"`) against `theme.spacing` first — so a theme customization/
/// extension always wins when present — and falls back to Tailwind v4's own
/// spacing FORMULA (`n * 4px`, i.e. `n * 0.25rem`) for any bare numeric step
/// the table doesn't have an explicit entry for. Real Tailwind v4 only
/// lists the "usual stops" (0, 0.5, 1, 1.5, 2, 2.5, ...) in its default
/// theme, but its spacing scale is actually a live `calc(var(--spacing) *
/// n)` — so `p-0.25`, `gap-1.75`, `w-2.25`, and any other quarter-step (or
/// arbitrary decimal) resolve too, not just the named stops. This mirrors
/// that: the table covers the common named entries (and lets a theme
/// override any one of them individually), the formula fills every gap
/// between them.
fn spacing_px(theme: &ThemeConfig, value: &str) -> Option<f64> {
    theme.spacing.get(value).copied().or_else(|| value.parse::<f64>().ok().map(|n| n * 4.0))
}

pub(crate) fn resolve_length(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<String> {
    // Real Tailwind doesn't generate a negative form for padding/gap/width/
    // height/etc. at all — "-p-4" isn't a real Tailwind class — so a
    // leading "-" on a utility that goes through the plain (non-negatable)
    // helper is simply unresolvable, same as any other unknown class,
    // rather than silently being treated as if the "-" weren't there.
    // `resolve_negatable_length` (used by margin/inset/translate) handles
    // `negative` itself instead of ever reaching this check.
    if parsed.negative {
        return None;
    }
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(value.to_string());
    }
    match value {
        "full" => return Some("100%".to_string()),
        "auto" => return Some("auto".to_string()),
        _ => {}
    }
    spacing_px(theme, value).map(|px| format!("{px}px"))
}

/// `resolve_length`, but honoring `parsed.negative` (real Tailwind's
/// leading-"-" convention, e.g. "-mt-4") — used by the specific utilities
/// real Tailwind actually allows negative values on: margin, inset/top/
/// right/bottom/left, and (web-only) translate-x/y. Deliberately narrower
/// than `resolve_length`: negation only applies to the NUMERIC spacing
/// scale, matching real Tailwind exactly — "full"/"auto" and arbitrary
/// values have no negative form there either (an arbitrary negative is
/// written directly, "mt-[-10px]", not "-mt-[10px]"), so this returns
/// `None` for those when `parsed.negative` is set rather than emitting
/// nonsensical CSS like "-auto" or "-100%".
pub(crate) fn resolve_negatable_length(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<String> {
    if !parsed.negative {
        return resolve_length(theme, parsed);
    }
    if parsed.is_arbitrary {
        return None;
    }
    let value = parsed.value.as_deref()?;
    let px = spacing_px(theme, value)?;
    if px == 0.0 {
        return Some("0px".to_string());
    }
    Some(format!("-{px}px"))
}

/// Resolves a 0-100 percentage utility value (opacity, bg-opacity,
/// text-opacity) to a 0-1 decimal string. Arbitrary values are passed
/// through as-is (already whatever decimal/unit the user wrote).
pub(crate) fn resolve_percent(parsed: &ParsedClass) -> Option<String> {
    // Real Tailwind has no negative opacity — same reasoning as
    // `resolve_length`'s identical check.
    if parsed.negative {
        return None;
    }
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(value.to_string());
    }
    let pct: f64 = value.parse().ok()?;
    Some(format!("{}", pct / 100.0))
}

/// Phase 25's arbitrary properties (`[mask-type:luminance]`) — a raw
/// `property: value` pair, entirely bypassing every domain resolver's own
/// utility-name dispatch. Checked FIRST in `resolve_utility` (not folded
/// into the `.or_else` chain below) since `parsed.value` here is the
/// COMBINED `"property:value"` text `parser.rs` packed together, not a
/// value alone the way every other resolver expects — splitting it back
/// apart is this function's only job.
fn resolve_arbitrary_property(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    if parsed.utility != crate::parser::ARBITRARY_PROPERTY_SENTINEL {
        return None;
    }
    let (property, value) = parsed.value.as_deref()?.split_once(':')?;
    Some(vec![decl(property, value)])
}

pub fn resolve_utility(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    resolve_arbitrary_property(parsed)
        .or_else(|| layout::resolve_screen_size(parsed))
        .or_else(|| layout::resolve_flex(parsed, true))
        .or_else(|| layout::resolve(parsed, theme))
        .or_else(|| spacing::resolve(parsed, theme))
        .or_else(|| color::resolve(parsed, theme))
        .or_else(|| border::resolve(parsed, theme))
        .or_else(|| typography::resolve(parsed, theme))
        .or_else(|| effects::resolve(parsed, theme))
        .or_else(|| divide::resolve(parsed, theme))
        .or_else(|| grid::resolve(parsed))
        .or_else(|| transform::resolve(parsed, theme))
        .or_else(|| filters::resolve(parsed))
        .or_else(|| background::resolve(parsed, theme))
        .or_else(|| interactivity::resolve(parsed, theme))
        .or_else(|| scroll::resolve(parsed, theme))
}

/// Native (React Native) dispatcher — layout, spacing, and border resolve
/// as-is (`spacing.rs`/`border.rs` already emit RN-compatible CSS shapes,
/// just with `px`/`rem` units that `resolve_style.rs` strips down to plain
/// numbers). Color is the one domain that's genuinely forked rather than
/// reused: `color::resolve()`'s whole design is CSS custom-property opacity
/// composition (`rgba(r,g,b,var(--bg-opacity, 1))`), which RN cannot parse
/// at all (no var() support) — reusing it would just mean stripping the
/// wrapper back out immediately. `color::color_value` (the underlying
/// named/arbitrary lookup, which also bakes an inline `/N` opacity suffix
/// into a plain `rgba(...)` string — the one shape both dispatchers can
/// use directly) and `typography::text_size`/`text_align` (the same
/// three-way "text-" disambiguation `color::resolve_text` uses) ARE reused.
///
/// `leading`/`tracking` resolve for their numeric scale and arbitrary
/// values only (`resolve_leading_tracking_native`, below) — Tailwind's
/// numeric leading scale is an absolute rem length, not a multiplier, so it
/// converts cleanly. The *named* keywords (`leading-tight`, `tracking-wide`,
/// ...) stay excluded: those are relative to a companion font-size
/// (em/multiplier-based), which needs cross-token lookup this per-token
/// dispatch doesn't do — and they're not actually implemented on web today
/// either (web's `"leading"`/`"tracking"` arms are a raw passthrough with
/// no named-keyword scale), so this isn't a new gap, just an unaddressed one.
///
/// `font`/`uppercase`/`lowercase`/`capitalize`/`underline`/`line-through`/
/// `no-underline` (`resolve_typography_native`, below) already resolve to
/// values that are directly valid RN style values as plain strings — no
/// unit conversion needed, unlike everything else in this dispatcher.
///
/// Still deliberately excluded: `typography::resolve`'s `truncate` (RN has
/// no `text-overflow`/`white-space`; truncation is `numberOfLines` on
/// `<Text>`, a different API). `ring`/`outline` (from `border::resolve`)
/// resolve to CSS-only properties (`box-shadow`, `outline-style`) RN
/// doesn't have — harmless (RN just logs an unknown-style-property
/// warning), not worth special-casing out. `w-screen`/`h-screen`/etc. are
/// also excluded — see `layout::resolve_screen_size`'s doc comment for why
/// `dvw`/`dvh` have no RN equivalent; those tokens simply resolve to
/// nothing on native rather than emitting an invalid style value, same as
/// before this dispatch even existed. `layout::resolve_flex` IS included
/// (unlike `resolve_screen_size`) — called with `web: false` so
/// `flex-auto`/`flex-initial`/`flex-none` get their numeric RN fallback
/// instead of an invalid CSS keyword string. `grid::resolve` is excluded
/// entirely — React Native's Yoga layout engine is flexbox-only with no
/// CSS Grid equivalent at all, so unlike every other web-only exclusion
/// above there's no numeric/string fallback to even consider; grid
/// utilities simply don't exist on native. `transform::resolve` (the web,
/// CSS-custom-property-composition version) is excluded, but
/// `transform::native_resolve` — a distinct, narrower function built for
/// RN's array-based `transform` style, which has no cascade to compose
/// against the way CSS custom properties do — IS included below, covering
/// translate-x/y, scale/scale-x/scale-y, rotate/rotate-x/rotate-y/rotate-z,
/// skew-x/skew-y, transform-none, and backface-visible/backface-hidden; see
/// that function's own doc comment for exactly what stays web-only within
/// the transform family (translate-z/scale-z, perspective/perspective-origin/
/// origin, transform-gpu/transform-cpu). `filters::resolve`
/// is excluded too — RN has no `filter`/`backdrop-filter` concept at all,
/// not even a partial one. `background::resolve` is excluded for the same
/// reason again — RN's `<View>` has plain `backgroundColor` only, no
/// `background-position`/`-size`/`-repeat`/`-attachment`/`-clip`/`-origin`,
/// and no gradient support without a third-party native module.
///
/// `effects::resolve` (the WEB dispatch for this module) is never called
/// wholesale from this dispatcher — every other effects.rs addition from
/// Phase 22 (`text-shadow`/`mix-blend`/`bg-blend`/`animate`) stays
/// excluded, each for its own reason: RN's `textShadow*` is a set of
/// discrete style keys (color/offset/radius), not a single CSS shorthand,
/// so `text-shadow` doesn't translate directly; `mix-blend-mode`/
/// `background-blend-mode` have no RN equivalent at all; `animate-*`'s
/// `animation` shorthand + `@keyframes` are a pure CSS mechanism RN has no
/// concept of (RN animation is imperative, via the `Animated` API).
/// `shadow`/`shadow-*` and `opacity` are the two exceptions, each via its
/// own dedicated native entry point rather than a forward to
/// `effects::resolve` itself: `effects::native_shadow_declarations` (also
/// living in effects.rs, just never called from `effects::resolve`) maps
/// the named shadow tiers to RN's discrete
/// `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` (iOS) +
/// `elevation` (Android) keys instead of a CSS string — see that
/// function's own doc comment. `opacity` needs no translation at all — RN's
/// `opacity` style is already a plain 0-1 number, exactly what
/// `resolve_percent` (this module's own helper, already shared with
/// `effects::resolve`'s web arm) produces — see `resolve_opacity_native`
/// below. `ring-offset-*`'s extension of
/// `border::resolve`'s existing `ring` handling inherits that arm's
/// already-established "resolves to a CSS-only property, harmless"
/// precedent unchanged — same for Phase 23's `border-collapse`/
/// `border-separate` addition to that same arm (RN has no table layout at
/// all, but it's a harmless unknown style warning, not a crash).
///
/// `interactivity::resolve` and `scroll::resolve` (Phase 23) are never
/// wired in either, each for its own reason: `resize`/`touch-action`/
/// `will-change` are pure CSS/DOM mechanisms with no RN concept; `sr-only`
/// relies on `clip`/`position` tricks RN doesn't support (RN's actual
/// equivalent is the `accessibilityElementsHidden`/`importantForAccessibility`
/// props — a different API shape, not a value translation); `scroll-*`/
/// `snap-*` are CSS scroll-container mechanics RN replaces entirely with
/// `ScrollView` props. `color.rs`'s own Phase 23 additions (`caret`/
/// `accent`/`fill`/`stroke`/`stroke-width`) are unreachable on native too —
/// `resolve_color_native` below is a hand-picked "bg"/"text" dispatch, not a
/// forward to `color::resolve`, so anything added to that module needs an
/// explicit new arm here to ever reach native at all (RN has no
/// `caretColor`/`accentColor` style prop, and `fill`/`stroke` are
/// react-native-svg-specific props this generic dispatcher was never wired
/// to know about).
///
/// Phase 25's `[property:value]` arbitrary properties are excluded
/// entirely and deliberately — `resolve_arbitrary_property` is only ever
/// called from `resolve_utility` (the web dispatcher), never forwarded
/// here, since RN's style system takes a fixed JS-object shape with known
/// keys, not arbitrary CSS property names. `@container` (`layout.rs`) is
/// NOT specially excluded, though — `layout::resolve` is already included
/// below wholesale, so `@container` resolves to a `container-type` decl on
/// native same as everywhere else, inheriting the same "CSS-only property,
/// harmless unknown-style warning" precedent `ring`/`outline`/
/// `border-collapse` already established, not worth special-casing out for
/// one more property. Container-query VARIANTS (`@sm:`/`@min-[...]:`) are a
/// separate, `css.rs`-only concern (selector/at-rule construction) with no
/// native equivalent at all — moot here regardless, since native rendering
/// has no per-token selector construction to apply them to in the first
/// place.
pub fn resolve_utility_native(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    layout::resolve_flex(parsed, false)
        .or_else(|| layout::resolve(parsed, theme))
        .or_else(|| spacing::resolve(parsed, theme))
        .or_else(|| border::resolve(parsed, theme))
        .or_else(|| resolve_color_native(parsed, theme))
        .or_else(|| resolve_leading_tracking_native(parsed))
        .or_else(|| resolve_typography_native(parsed, theme))
        .or_else(|| resolve_opacity_native(parsed))
        .or_else(|| effects::native_shadow_declarations(parsed))
        .or_else(|| transform::native_resolve(parsed, theme))
}

/// RN's `opacity` style is a plain 0-1 number — see this function's own
/// caller-side doc note in `resolve_utility_native` above for why this is a
/// dedicated entry point rather than forwarding to `effects::resolve`.
fn resolve_opacity_native(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    if parsed.utility != "opacity" {
        return None;
    }
    resolve_percent(parsed).map(|v| vec![decl("opacity", &v)])
}

/// `font-weight`/`text-transform`/`text-decoration-line`/`font-style` all
/// match RN's style key types directly as plain strings, so this is pure
/// dispatch wiring, no value conversion. `italic`/`not-italic` are the one
/// Phase 20 (typography completeness) addition that genuinely works on
/// native — RN's `Text` fully supports `fontStyle: 'italic' | 'normal'`;
/// everything else that phase added (decoration thickness, underline
/// offset, text-wrap, white-space, word-break, vertical-align, list-style,
/// hyphens, text-indent) is a DOM/CSS-only concept with no RN equivalent at
/// all, so those stay in `typography::resolve` (this dispatcher's web-only
/// counterpart, never called from here).
///
/// `font-<name>` (not a weight keyword) DOES resolve here too, unlike
/// web's `font-family` value — RN's `fontFamily` style prop takes exactly
/// ONE registered font name, not a CSS fallback list, so this takes just
/// the first comma-separated segment of whatever `font_family_value`
/// returns (theme-configured or the hardcoded default) and strips any
/// surrounding quotes. This only produces something USABLE when the theme
/// (or an arbitrary `font-[...]` value) supplies a real, single,
/// app-bundled font name as that first segment — Kbach's own hardcoded
/// default stacks start with a generic CSS-only keyword
/// (`ui-sans-serif`/`ui-serif`/`ui-monospace`) that isn't a real font
/// native can load, so those three still effectively no-op here (RN falls
/// back to its own system default), exactly as they always implicitly did
/// before this existed — this only changes behavior for a THEME-configured
/// custom name (`extend.fontFamily: { sans: 'Inter, sans-serif' }`,
/// `font-[Inter]`).
fn resolve_typography_native(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "font" if parsed.is_arbitrary => {
            let value = parsed.value.as_deref()?;
            Some(vec![decl("font-family", &first_font_name(value))])
        }
        "font" => {
            let value = parsed.value.as_deref()?;
            if let Some(w) = typography::font_weight(value) {
                return Some(vec![decl("font-weight", w)]);
            }
            let family = typography::font_family_value(theme, value)?;
            Some(vec![decl("font-family", &first_font_name(&family))])
        }
        "uppercase" => Some(vec![decl("text-transform", "uppercase")]),
        "lowercase" => Some(vec![decl("text-transform", "lowercase")]),
        "capitalize" => Some(vec![decl("text-transform", "capitalize")]),
        "underline" => Some(vec![decl("text-decoration-line", "underline")]),
        "line-through" => Some(vec![decl("text-decoration-line", "line-through")]),
        "no-underline" => Some(vec![decl("text-decoration-line", "none")]),
        "italic" => Some(vec![decl("font-style", "italic")]),
        "not-italic" => Some(vec![decl("font-style", "normal")]),
        _ => None,
    }
}

/// The first comma-separated segment of a CSS-shaped font stack, with any
/// surrounding quotes stripped — `resolve_typography_native`'s own doc
/// comment explains why RN's `fontFamily` prop needs exactly this, not the
/// full fallback list.
fn first_font_name(stack: &str) -> String {
    stack.split(',').next().unwrap_or(stack).trim().trim_matches('"').trim_matches('\'').to_string()
}

/// Numeric (`leading-6`) and arbitrary (`leading-[24px]`,
/// `tracking-[0.5px]`) line-height/letter-spacing only — see
/// `resolve_utility_native`'s docs for why named keywords are excluded.
/// No bare-numeric tracking scale exists in Tailwind at all — only named
/// keywords (deferred) and arbitrary values are meaningful for `tracking`.
fn resolve_leading_tracking_native(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    match parsed.utility.as_str() {
        "leading" if parsed.is_arbitrary => Some(vec![decl("line-height", value)]),
        "leading" => typography::line_height_size(value).map(|v| vec![decl("line-height", v)]),
        "tracking" if parsed.is_arbitrary => Some(vec![decl("letter-spacing", value)]),
        _ => None,
    }
}

/// Delegates entirely to `color::color_value` — same arbitrary-passthrough
/// and inline `/N` opacity-suffix handling (`bg-orange-5/50` bakes to an
/// `rgba(...)` string here too, the only representation native's style
/// system can use at all, since it can't parse a CSS `var()`) as the web
/// dispatcher gets, so `bg-orange-5/50` isn't silently unresolvable on
/// native/Expo Go the way it used to be.
fn native_hex_color(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<String> {
    color::color_value(theme, parsed)
}

/// Mirrors `color::resolve_text`'s three-way "text-" disambiguation
/// (size / align / color) so `text-lg`/`text-center` resolve correctly on
/// native instead of being treated as (unresolvable) color names.
fn resolve_text_native(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    if !parsed.is_arbitrary {
        if let Some(value) = parsed.value.as_deref() {
            if let Some(size) = typography::text_size(value) {
                return Some(vec![decl("font-size", size)]);
            }
            if let Some(align) = typography::text_align(value) {
                return Some(vec![decl("text-align", align)]);
            }
        }
    }
    native_hex_color(parsed, theme).map(|hex| vec![decl("color", &hex)])
}

fn resolve_color_native(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "bg" => native_hex_color(parsed, theme).map(|hex| vec![decl("background-color", &hex)]),
        "text" => resolve_text_native(parsed, theme),
        _ => None,
    }
}

#[cfg(test)]
mod native_dispatcher_tests {
    use super::*;
    use crate::parser::parse_class;
    use crate::theme::ColorValue;
    use std::collections::HashMap;

    fn theme() -> ThemeConfig {
        let mut colors = HashMap::new();
        colors.insert("blue-6".to_string(), ColorValue::Plain("#2563eb".to_string()));
        ThemeConfig { colors, ..Default::default() }
    }

    #[test]
    fn resolve_length_falls_back_to_the_spacing_formula_for_ungtabled_quarter_steps() {
        let mut t = theme();
        // No explicit "0.25"/"0.75"/"1.25"/"1.75" entries in the table —
        // only "4" is present, to prove the fallback doesn't depend on
        // there being a nearby named entry.
        t.spacing.insert("4".to_string(), 16.0);
        assert_eq!(resolve_length(&t, &parse_class("p-0.25")), Some("1px".to_string()));
        assert_eq!(resolve_length(&t, &parse_class("p-0.75")), Some("3px".to_string()));
        assert_eq!(resolve_length(&t, &parse_class("p-1.25")), Some("5px".to_string()));
        assert_eq!(resolve_length(&t, &parse_class("p-1.75")), Some("7px".to_string()));
        assert_eq!(resolve_length(&t, &parse_class("p-13")), Some("52px".to_string()));
        // The table still wins when a step IS present, even if the formula
        // would've produced a different number — theme overrides always
        // take priority over the formula fallback.
        assert_eq!(resolve_length(&t, &parse_class("p-4")), Some("16px".to_string()));
    }

    #[test]
    fn resolve_negatable_length_honors_the_spacing_formula_too() {
        let t = theme();
        assert_eq!(resolve_negatable_length(&t, &parse_class("-mt-1.25")), Some("-5px".to_string()));
        assert_eq!(resolve_negatable_length(&t, &parse_class("mt-2.75")), Some("11px".to_string()));
    }

    #[test]
    fn resolves_layout_utilities() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("flex"), &t), Some(vec![decl("display", "flex")]));
    }

    #[test]
    fn resolves_a_plain_hex_color_without_opacity_composition() {
        let t = theme();
        assert_eq!(
            resolve_utility_native(&parse_class("bg-blue-6"), &t),
            Some(vec![decl("background-color", "#2563eb")]),
        );
    }

    #[test]
    fn resolves_an_arbitrary_color_value() {
        let t = theme();
        assert_eq!(
            resolve_utility_native(&parse_class("bg-[#16a34a]"), &t),
            Some(vec![decl("background-color", "#16a34a")]),
        );
    }

    #[test]
    fn resolves_inline_slash_opacity_on_native_to_a_baked_rgba() {
        // Previously unresolvable entirely on native/Expo Go — "blue-6/50"
        // isn't a real theme.colors key, and native_hex_color had no
        // opacity-suffix handling of its own at all. Now delegates to
        // color::color_value, the exact same helper the web dispatcher
        // uses, so this composes to a literal rgba() string — the only
        // representation native's style system can use, since it can't
        // parse a CSS var().
        let t = theme();
        assert_eq!(
            resolve_utility_native(&parse_class("bg-blue-6/50"), &t),
            Some(vec![decl("background-color", "rgba(37,99,235,0.5)")]),
        );
        assert_eq!(
            resolve_utility_native(&parse_class("text-blue-6/25"), &t),
            Some(vec![decl("color", "rgba(37,99,235,0.25)")]),
        );
    }

    #[test]
    fn resolves_negative_margin_and_inset_on_native_too() {
        // spacing.rs/layout.rs are shared between the web and native
        // dispatchers, so the negative-value convention added there
        // reaches native for free — confirmed here so a future change to
        // either dispatcher's own wiring can't silently drop it for native.
        let mut t = theme();
        t.spacing.insert("4".to_string(), 16.0);
        assert_eq!(resolve_utility_native(&parse_class("-mt-4"), &t), Some(vec![decl("margin-top", "-16px")]));
        assert_eq!(resolve_utility_native(&parse_class("-inset-4"), &t), Some(vec![decl("inset", "-16px")]));
    }

    #[test]
    fn resolves_spacing_and_border_radius_utilities() {
        let mut t = theme();
        t.spacing.insert("4".to_string(), 16.0);
        assert_eq!(resolve_utility_native(&parse_class("p-4"), &t), Some(vec![decl("padding", "16px")]));
        assert_eq!(resolve_utility_native(&parse_class("rounded-lg"), &t), Some(vec![decl("border-radius", "0.5rem")]));
    }

    #[test]
    fn resolves_text_size_and_align_before_falling_back_to_color() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("text-lg"), &t), Some(vec![decl("font-size", "1.125rem")]));
        assert_eq!(resolve_utility_native(&parse_class("text-center"), &t), Some(vec![decl("text-align", "center")]));
        assert_eq!(
            resolve_utility_native(&parse_class("text-blue-6"), &t),
            Some(vec![decl("color", "#2563eb")]),
        );
    }

    #[test]
    fn resolves_numeric_and_arbitrary_line_height_and_letter_spacing() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("leading-6"), &t), Some(vec![decl("line-height", "1.5rem")]));
        assert_eq!(resolve_utility_native(&parse_class("leading-[24px]"), &t), Some(vec![decl("line-height", "24px")]));
        assert_eq!(
            resolve_utility_native(&parse_class("tracking-[0.5px]"), &t),
            Some(vec![decl("letter-spacing", "0.5px")]),
        );
    }

    #[test]
    fn does_not_resolve_named_leading_tracking_keywords_or_truncate() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("leading-tight"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("tracking-wide"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("truncate"), &t), None);
    }

    #[test]
    fn resolves_full_but_not_screen_sizing_on_native() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("w-full"), &t), Some(vec![decl("width", "100%")]));
        assert_eq!(resolve_utility_native(&parse_class("h-full"), &t), Some(vec![decl("height", "100%")]));
        assert_eq!(resolve_utility_native(&parse_class("w-screen"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("h-screen"), &t), None);
    }

    #[test]
    fn does_not_resolve_grid_utilities_on_native() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("grid-cols-3"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("col-span-2"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("place-items-center"), &t), None);
    }

    #[test]
    fn resolves_the_native_transform_subset_as_bare_op_markers() {
        let t = theme();
        assert_eq!(
            resolve_utility_native(&parse_class("scale-150"), &t),
            Some(vec![decl("transform-op-scale-x", "1.5"), decl("transform-op-scale-y", "1.5")]),
        );
        assert_eq!(resolve_utility_native(&parse_class("rotate-45"), &t), Some(vec![decl("transform-op-rotate", "45deg")]));
        assert_eq!(resolve_utility_native(&parse_class("translate-x-4"), &t), Some(vec![decl("transform-op-translate-x", "16px")]));
    }

    #[test]
    fn does_not_resolve_the_web_only_transform_family_members_on_native() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("translate-z-4"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("scale-z-150"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("perspective-normal"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("origin-top-left"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("transform-gpu"), &t), None);
    }

    #[test]
    fn does_not_resolve_filter_utilities_on_native() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("blur"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("grayscale"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("backdrop-blur-sm"), &t), None);
    }

    #[test]
    fn resolves_flex_family_on_native_with_numeric_keyword_fallback() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("flex-1"), &t), Some(vec![decl("flex", "1")]));
        assert_eq!(resolve_utility_native(&parse_class("flex-auto"), &t), Some(vec![decl("flex", "1")]));
        assert_eq!(resolve_utility_native(&parse_class("flex-none"), &t), Some(vec![decl("flex", "0")]));
        assert_eq!(resolve_utility_native(&parse_class("flex-row"), &t), Some(vec![decl("flex-direction", "row")]));
        assert_eq!(resolve_utility_native(&parse_class("grow"), &t), Some(vec![decl("flex-grow", "1")]));
        assert_eq!(resolve_utility_native(&parse_class("shrink-0"), &t), Some(vec![decl("flex-shrink", "0")]));
        assert_eq!(resolve_utility_native(&parse_class("order-2"), &t), Some(vec![decl("order", "2")]));
    }

    #[test]
    fn resolves_font_weight_text_transform_and_text_decoration() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("font-bold"), &t), Some(vec![decl("font-weight", "700")]));
        assert_eq!(resolve_utility_native(&parse_class("uppercase"), &t), Some(vec![decl("text-transform", "uppercase")]));
        assert_eq!(resolve_utility_native(&parse_class("lowercase"), &t), Some(vec![decl("text-transform", "lowercase")]));
        assert_eq!(resolve_utility_native(&parse_class("capitalize"), &t), Some(vec![decl("text-transform", "capitalize")]));
        assert_eq!(resolve_utility_native(&parse_class("underline"), &t), Some(vec![decl("text-decoration-line", "underline")]));
        assert_eq!(resolve_utility_native(&parse_class("line-through"), &t), Some(vec![decl("text-decoration-line", "line-through")]));
        assert_eq!(resolve_utility_native(&parse_class("no-underline"), &t), Some(vec![decl("text-decoration-line", "none")]));
    }

    #[test]
    fn resolves_font_family_to_a_single_stripped_name_on_native() {
        let mut t = theme();
        t.font_family.insert("sans".to_string(), "Inter, sans-serif".to_string());
        t.font_family.insert("display".to_string(), "\"Cal Sans\", sans-serif".to_string());
        assert_eq!(resolve_utility_native(&parse_class("font-sans"), &t), Some(vec![decl("font-family", "Inter")]));
        assert_eq!(resolve_utility_native(&parse_class("font-display"), &t), Some(vec![decl("font-family", "Cal Sans")]));
        assert_eq!(resolve_utility_native(&parse_class("font-[Georgia]"), &t), Some(vec![decl("font-family", "Georgia")]));
        // font-weight still takes priority over any theme-configured family
        // name — same ambiguity order as the web dispatcher.
        assert_eq!(resolve_utility_native(&parse_class("font-bold"), &t), Some(vec![decl("font-weight", "700")]));
    }

    #[test]
    fn resolves_italic_but_not_dom_only_typography_completeness_utilities_on_native() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("italic"), &t), Some(vec![decl("font-style", "italic")]));
        assert_eq!(resolve_utility_native(&parse_class("not-italic"), &t), Some(vec![decl("font-style", "normal")]));
        assert_eq!(resolve_utility_native(&parse_class("decoration-2"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("underline-offset-4"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("whitespace-nowrap"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("indent-4"), &t), None);
    }

    #[test]
    fn does_not_resolve_background_and_gradient_utilities_on_native() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("bg-top"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("bg-cover"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("bg-linear-to-r"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("from-blue-6"), &t), None);
        // "bg-blue-6" is a real theme color, so it MUST still resolve on
        // native via color::resolve — confirms background.rs's exclusion
        // doesn't accidentally shadow the ordinary bg-color path.
        assert_eq!(
            resolve_utility_native(&parse_class("bg-blue-6"), &t),
            Some(vec![decl("background-color", "#2563eb")]),
        );
    }

    #[test]
    fn does_not_resolve_effects_completeness_utilities_on_native() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("text-shadow-sm"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("mix-blend-multiply"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("bg-blend-multiply"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("animate-spin"), &t), None);
        // "ring-offset-4" DOES still resolve on native, inheriting the
        // pre-existing "ring resolves to a harmless CSS-only property"
        // precedent — confirms the new ring-offset arm didn't accidentally
        // narrow border::resolve's native reach.
        let ring_offset_result = resolve_utility_native(&parse_class("ring-offset-4"), &t);
        assert!(ring_offset_result.is_some());
        assert_eq!(ring_offset_result.unwrap()[0], decl("--kb-ring-offset-width", "4px"));
    }

    #[test]
    fn resolves_opacity_on_native_to_a_decimal() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("opacity-50"), &t), Some(vec![decl("opacity", "0.5")]));
        assert_eq!(resolve_utility_native(&parse_class("opacity-[0.42]"), &t), Some(vec![decl("opacity", "0.42")]));
    }

    #[test]
    fn resolves_shadow_to_discrete_native_shadow_properties_but_not_shadow_inner() {
        let t = theme();
        // Full dispatcher, not just effects::native_shadow_declarations
        // directly — confirms the wiring in resolve_utility_native itself,
        // not just the function's own standalone behavior (see
        // effects.rs's own tests for the exact per-tier values).
        let lg = resolve_utility_native(&parse_class("shadow-lg"), &t);
        assert!(lg.is_some());
        assert!(lg.unwrap().iter().any(|d| d.property == "elevation" && d.value == "8"));
        assert_eq!(resolve_utility_native(&parse_class("shadow-inner"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("shadow-[0_4px_6px_red]"), &t), None);
    }

    #[test]
    fn does_not_resolve_interactivity_and_sizing_rest_utilities_on_native() {
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("resize-none"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("touch-pan-x"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("will-change-transform"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("sr-only"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("scroll-smooth"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("snap-x"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("caret-blue-6"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("accent-blue-6"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("fill-blue-6"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("stroke-blue-6"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("stroke-width-2"), &t), None);
        // "border-collapse" DOES still resolve on native, inheriting the
        // same pre-existing "harmless CSS-only property" precedent as ring.
        assert_eq!(
            resolve_utility_native(&parse_class("border-collapse"), &t),
            Some(vec![decl("border-collapse", "collapse")]),
        );
        // "size-4" (spacing.rs) DOES still resolve on native — it's a plain
        // width+height pair, no different from bare "w-4"/"h-4".
        let mut t_with_spacing = theme();
        t_with_spacing.spacing.insert("4".to_string(), 16.0);
        assert_eq!(
            resolve_utility_native(&parse_class("size-4"), &t_with_spacing),
            Some(vec![decl("width", "16px"), decl("height", "16px")]),
        );
    }

    #[test]
    fn does_not_resolve_arbitrary_properties_on_native_but_does_resolve_container_type() {
        let t = theme();
        // Arbitrary properties are web-only — RN has no arbitrary-CSS-property concept.
        assert_eq!(resolve_utility_native(&parse_class("[mask-type:luminance]"), &t), None);
        // "@container" itself DOES still resolve on native, inheriting the
        // same "harmless CSS-only property" precedent as ring/border-collapse.
        assert_eq!(
            resolve_utility_native(&parse_class("@container"), &t),
            Some(vec![decl("container-type", "inline-size")]),
        );
    }
}
