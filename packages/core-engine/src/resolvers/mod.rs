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
mod mask;
mod scroll;
mod spacing;
mod transform;
mod typography;

use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

pub use color::{expand_mode_aware_color_classes, substitute_mode_aware_color_token};

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
///
/// `"px"` is Tailwind's one named non-formula step: exactly 1px (`p-px`,
/// `-mt-px`, `h-px`, `gap-px`, `inset-px`, `translate-x-px`, …), on every
/// utility that goes through this helper. A theme can still override it.
pub(super) fn spacing_px(theme: &ThemeConfig, value: &str) -> Option<f64> {
    theme
        .spacing
        .get(value)
        .copied()
        .or_else(|| if value == "px" { Some(1.0) } else { value.parse::<f64>().ok().map(|n| n * 4.0) })
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
/// right/bottom/left, and (web-only) translate-x/y.
///
/// An arbitrary value also honors the leading dash (`-mt-[10px]` resolves
/// the exact same as `mt-[-10px]`) — this is a deliberate Kbach extension
/// beyond real Tailwind, which only supports the sign written inside the
/// brackets. Wrapped as `calc(<value> * -1)` rather than a plain string
/// negation (`"-" + value`) since an arbitrary value isn't always a bare
/// number-plus-unit — it can be `calc(...)`, `var(...)`, or any other CSS
/// expression, and prefixing those with a literal "-" produces invalid CSS
/// (`-var(--x)` doesn't mean anything); `calc(value * -1)` is valid and
/// correctly negates any of those shapes uniformly, at the cost of slightly
/// more verbose output than a plain sign flip for the common simple case.
/// "full"/"auto" (on the NAMED scale, not arbitrary) still have no negative
/// form — returns `None` for those when `parsed.negative` is set rather
/// than emitting nonsensical CSS like "-auto" or "-100%".
pub(crate) fn resolve_negatable_length(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<String> {
    if !parsed.negative {
        return resolve_length(theme, parsed);
    }
    if parsed.is_arbitrary {
        let value = parsed.value.as_deref()?;
        return Some(format!("calc({value} * -1)"));
    }
    let value = parsed.value.as_deref()?;
    let px = spacing_px(theme, value)?;
    if px == 0.0 {
        return Some("0px".to_string());
    }
    Some(format!("-{px}px"))
}

/// `w-1/2`/`h-2/3`/`top-1/2`-style fractions -> a percentage. Shared by
/// `spacing.rs`'s `resolve_size` (width/height-family) and `layout.rs`'s
/// `resolve_negatable_size` (inset-family, below) — real Tailwind's own
/// `top`/`right`/`bottom`/`left`/`inset` scale is the same fraction scale as
/// `width`/`height`'s, just also negatable. No parser changes needed: "/"
/// isn't a bracket character, so `top-1/2` already parses as a plain
/// (non-arbitrary) value — `is_safe_arbitrary_value` is never consulted, and
/// `css.rs::escape_selector` already backslash-escapes "/" like any other
/// special character.
pub(crate) fn fraction_percent(value: &str) -> Option<String> {
    let (num_str, den_str) = value.split_once('/')?;
    let num: f64 = num_str.parse().ok()?;
    let den: f64 = den_str.parse().ok()?;
    if den == 0.0 {
        return None;
    }
    let pct = num / den * 100.0;
    let formatted = format!("{pct:.6}");
    let trimmed = formatted.trim_end_matches('0').trim_end_matches('.');
    Some(format!("{trimmed}%"))
}

/// `resolve_negatable_length`, but ALSO checking `fraction_percent` first —
/// used by `top`/`right`/`bottom`/`left`/`inset`/`inset-x`/`inset-y`, the one
/// negatable family that (unlike margin, `resolve_negatable_length`'s other
/// caller) real Tailwind also gives a percentage-fraction scale: `top-1/2`,
/// `-inset-1/3`, etc. — the exact "half-way, negatable" pattern
/// `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` centering
/// relies on. A bare `value.parse::<f64>()` in `spacing_px` can't parse
/// `"1/2"` at all (the `/` makes it an invalid float), so without this check
/// these utilities silently failed to resolve — a real gap, not a documented
/// exclusion. Checked before falling back to `resolve_negatable_length`'s
/// ordinary spacing-scale/formula/`full`/`auto` resolution, same precedence
/// pattern `resolve_size`'s own named/fraction checks already use.
pub(crate) fn resolve_negatable_size(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<String> {
    if !parsed.is_arbitrary {
        if let Some(value) = parsed.value.as_deref() {
            // `-top-full`, `-inset-full`, `-translate-x-full`: -100%. Only this
            // inset/translate family has it in Tailwind (there's no `-mt-full`).
            if parsed.negative && value == "full" {
                return Some("-100%".to_string());
            }
            if let Some(pct) = fraction_percent(value) {
                return Some(if parsed.negative { format!("-{pct}") } else { pct });
            }
        }
    }
    resolve_negatable_length(theme, parsed)
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
        // Web-only: logical (writing-direction-aware) padding/margin. Kept
        // out of `spacing::resolve` so the native dispatcher, which shares
        // that function, never hands RN a `padding-inline-start`.
        .or_else(|| spacing::resolve_logical(parsed, theme))
        .or_else(|| color::resolve(parsed, theme))
        .or_else(|| border::resolve(parsed, theme))
        // Web-only: block-axis logical borders (`border-bs`, `border-be-2`).
        .or_else(|| border::resolve_web_only(parsed, theme))
        .or_else(|| typography::resolve(parsed, theme))
        .or_else(|| effects::resolve(parsed, theme))
        .or_else(|| divide::resolve(parsed, theme))
        .or_else(|| grid::resolve(parsed))
        .or_else(|| transform::resolve(parsed, theme))
        .or_else(|| filters::resolve(parsed))
        .or_else(|| filters::resolve_drop_shadow_color(parsed, theme))
        .or_else(|| background::resolve(parsed, theme))
        .or_else(|| interactivity::resolve(parsed, theme))
        .or_else(|| scroll::resolve(parsed, theme))
        .or_else(|| mask::resolve(parsed))
        .or_else(|| mask::resolve_gradient(parsed, theme))
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
        // Rings are web-only: they're a composed CSS `box-shadow` built from
        // `var()`s, which React Native can't parse (it used to receive that
        // raw string as `boxShadow`).
        .or_else(|| if matches!(parsed.utility.as_str(), "ring" | "ring-offset") { None } else { border::resolve(parsed, theme) })
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
        "leading" => typography::line_height_size(value).map(|v| vec![decl("line-height", &v)]),
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
    // `inherit` is a CSS cascade keyword; RN styles don't inherit, so it has
    // no native value (`color::lookup_hex`'s doc comment). Unresolved here
    // rather than handed to RN as an invalid color string.
    color::color_value(theme, parsed).filter(|v| v != "inherit")
}

/// Mirrors `color::resolve_text`'s "text-" disambiguation (size / align /
/// color) so `text-lg`/`text-center` resolve correctly on native instead
/// of being treated as (unresolvable) color names.
///
/// Bug, confirmed live (not hypothetical): this native dispatcher never
/// got the SAME arbitrary-value fix `color::resolve_text`'s own doc
/// comment describes as already applied there — an arbitrary `text-[10px]`
/// has `is_arbitrary == true`, which skipped the size/align block
/// entirely (that block only ever ran for the NON-arbitrary named-keyword
/// case) and fell straight through to `native_hex_color`, i.e. treated
/// "10px" as a color value. `color::color_value` correctly rejects that as
/// not a real color and returns `None`, so the whole declaration silently
/// dropped — `text-[10px]` produced nothing at all on native/Expo Go,
/// while the identical class worked fine on web (whose dispatcher already
/// had this exact check). Same `looks_like_length` check as the web
/// version, checked ahead of the color fallback for the arbitrary case
/// only — a real color value never parses as a bare number or
/// number+known-length-unit, so this is safe without risking a genuine
/// arbitrary color (`text-[#ff0000]`, `text-[red]`) being misread as a
/// length.
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
    } else if let Some(value) = parsed.value.as_deref() {
        if color::is_length(parsed, value) {
            return Some(vec![decl("font-size", value)]);
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
    fn resolves_an_arbitrary_text_size_as_font_size_not_color() {
        // Regression test for a real, confirmed bug: resolve_text_native
        // never got the arbitrary-value length/color disambiguation
        // color::resolve_text's own doc comment describes as already fixed
        // on web — text-[10px] has is_arbitrary == true, which skipped the
        // size/align block entirely (non-arbitrary only) and fell straight
        // through to native_hex_color, silently dropping the whole
        // declaration ("10px" isn't a real color). Reported live as
        // "text-[10px] not work" in @kbach/react-native specifically —
        // confirmed this exact class resolved fine on web the whole time.
        let t = theme();
        assert_eq!(resolve_utility_native(&parse_class("text-[10px]"), &t), Some(vec![decl("font-size", "10px")]));
        assert_eq!(resolve_utility_native(&parse_class("text-[1.5rem]"), &t), Some(vec![decl("font-size", "1.5rem")]));
        // A real arbitrary color must still resolve as a color, not get
        // misread as a length just because this fix now checks arbitrary
        // values more closely than before.
        assert_eq!(
            resolve_utility_native(&parse_class("text-[#ff0000]"), &t),
            Some(vec![decl("color", "#ff0000")]),
        );
        assert_eq!(resolve_utility_native(&parse_class("text-[red]"), &t), Some(vec![decl("color", "red")]));
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
        // Rings are web-only. They used to "resolve" on native as a CSS
        // custom property plus a var()-built box-shadow string, which React
        // Native received as bogus `KbRingWidth`/`boxShadow` keys.
        assert_eq!(resolve_utility_native(&parse_class("ring"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("ring-2"), &t), None);
        assert_eq!(resolve_utility_native(&parse_class("ring-offset-4"), &t), None);
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

/// Regression tests for the Tailwind v4 gaps closed in one pass (found by
/// diffing Tailwind 4.3's own `getClassList()` against this engine). Each
/// checks the web output against Tailwind's, and native wherever the class
/// reaches React Native: either the same meaning, or deliberately nothing.
#[cfg(test)]
mod tailwind_v4_gap_tests {
    use super::*;
    use crate::parser::parse_class;
    use crate::resolve_style::resolve_style;
    use serde_json::{json, Value};

    fn web(class: &str) -> Option<Vec<Declaration>> {
        resolve_utility(&parse_class(class), &ThemeConfig::default())
    }
    fn web_has(class: &str, property: &str, value: &str) -> bool {
        web(class).is_some_and(|d| d.contains(&decl(property, value)))
    }
    fn native(class: &str) -> serde_json::Map<String, Value> {
        resolve_style(class, &ThemeConfig::default(), "light", false, 400.0)
    }

    #[test]
    fn numbered_border_and_divide_widths_are_exact_pixels_not_spacing_steps() {
        // Regression: these were n * 4px (border-2 = 8px) on web and native.
        assert_eq!(web("border-2"), Some(vec![decl("border-width", "2px")]));
        assert!(web_has("border-t-4", "border-top-width", "4px"));
        assert!(web_has("border-x-8", "border-left-width", "8px"));
        assert!(web_has("border-s-2", "border-inline-start-width", "2px"));
        assert!(web_has("border-0", "border-width", "0px"));
        assert!(web_has("divide-x-2", "__divide-x-width", "2px"));
        assert_eq!(native("border-2").get("borderWidth"), Some(&json!(2.0)));
        assert_eq!(native("border-x-2").get("borderLeftWidth"), Some(&json!(2.0)));
        // A theme's spacing customization must not move border widths.
        let mut t = ThemeConfig::default();
        t.spacing.insert("2".to_string(), 99.0);
        assert_eq!(resolve_utility(&parse_class("border-2"), &t), Some(vec![decl("border-width", "2px")]));
    }

    #[test]
    fn px_is_one_pixel_on_every_spacing_scale_utility() {
        assert_eq!(web("p-px"), Some(vec![decl("padding", "1px")]));
        assert!(web_has("h-px", "height", "1px"));
        assert!(web_has("w-px", "width", "1px"));
        assert!(web_has("gap-px", "gap", "1px"));
        assert!(web_has("-mt-px", "margin-top", "-1px"));
        assert!(web_has("inset-px", "inset", "1px"));
        assert!(web_has("translate-x-px", "--kb-translate-x", "1px"));
        assert_eq!(native("p-px").get("padding"), Some(&json!(1.0)));
        assert_eq!(native("-mt-px").get("marginTop"), Some(&json!(-1.0)));
    }

    #[test]
    fn bare_axis_and_logical_borders_are_one_pixel_solid() {
        assert!(web_has("border-x", "border-left-width", "1px") && web_has("border-x", "border-right-style", "solid"));
        assert!(web_has("border-y", "border-top-width", "1px") && web_has("border-y", "border-bottom-width", "1px"));
        assert!(web_has("border-s", "border-inline-start-width", "1px"));
        assert!(web_has("border-e", "border-inline-end-width", "1px"));
    }

    #[test]
    fn two_axis_translate_and_skew_including_negatives() {
        assert!(web_has("-translate-4", "--kb-translate-x", "-16px") && web_has("-translate-4", "--kb-translate-y", "-16px"));
        assert!(web_has("translate-1/2", "--kb-translate-y", "50%"));
        assert!(web_has("-skew-3", "--kb-skew-x", "skewX(-3deg)") && web_has("-skew-3", "--kb-skew-y", "skewY(-3deg)"));
        assert_eq!(native("translate-4").get("transform"), Some(&json!([{ "translateX": 16.0 }, { "translateY": 16.0 }])));
        assert_eq!(native("-skew-3").get("transform"), Some(&json!([{ "skewX": "-3deg" }, { "skewY": "-3deg" }])));
        // per-axis forms are unaffected by the new bare prefixes
        assert!(web_has("translate-x-4", "--kb-translate-x", "16px"));
        assert!(web_has("skew-y-2", "--kb-skew-y", "skewY(2deg)"));
    }

    #[test]
    fn transform_rotate_none_and_scale_none() {
        assert!(web("transform").is_some_and(|d| d.iter().any(|x| x.property == "transform")));
        assert!(web_has("rotate-none", "--kb-rotate", "rotate(0deg)"));
        assert!(web_has("scale-none", "--kb-scale-x", "scaleX(1)") && web_has("scale-none", "--kb-scale-y", "scaleY(1)"));
        assert_eq!(native("rotate-45 rotate-none").get("transform"), Some(&json!([{ "rotate": "0deg" }])));
        assert_eq!(native("scale-150 scale-none").get("transform"), Some(&json!([{ "scaleX": 1.0 }, { "scaleY": 1.0 }])));
    }

    #[test]
    fn negative_space_between_scroll_margin_and_indent() {
        assert!(web_has("-space-x-2", "__space-x", "-8px"));
        assert!(web_has("-space-y-4", "__space-y", "-16px"));
        assert_eq!(web("-scroll-mt-4"), Some(vec![decl("scroll-margin-top", "-16px")]));
        assert!(web_has("-scroll-mx-2", "scroll-margin-left", "-8px"));
        assert_eq!(web("-indent-4"), Some(vec![decl("text-indent", "-16px")]));
        // padding-like utilities still have no negative form
        assert_eq!(web("-scroll-pt-4"), None);
        assert_eq!(web("-p-4"), None);
    }

    #[test]
    fn numbered_flex_and_formula_leading() {
        assert_eq!(web("flex-2"), Some(vec![decl("flex", "2")]));
        assert_eq!(native("flex-3").get("flex"), Some(&json!(3.0)));
        assert!(web_has("leading-6", "line-height", "1.5rem"));
        assert!(web_has("leading-12", "line-height", "3rem"));
        assert!(web_has("leading-0.5", "line-height", "0.125rem"));
        assert_eq!(native("leading-12").get("lineHeight"), Some(&json!(48.0)));
    }

    #[test]
    fn gradient_stop_positions_accept_tailwinds_percent_spelling() {
        assert_eq!(web("from-10%"), Some(vec![decl("--kb-gradient-from-position", "10%")]));
        assert_eq!(web("via-30%"), Some(vec![decl("--kb-gradient-via-position", "30%")]));
        assert_eq!(web("to-90%"), Some(vec![decl("--kb-gradient-to-position", "90%")]));
        // Kbach's original spelling still works
        assert_eq!(web("from-10"), Some(vec![decl("--kb-gradient-from-position", "10%")]));
    }

    #[test]
    fn table_and_list_item_displays_are_web_only() {
        for (class, display) in [
            ("table", "table"),
            ("table-cell", "table-cell"),
            ("table-row", "table-row"),
            ("table-header-group", "table-header-group"),
            ("inline-table", "inline-table"),
            ("list-item", "list-item"),
        ] {
            assert_eq!(web(class), Some(vec![decl("display", display)]), "{class}");
            assert!(native(class).get("display").is_none(), "{class} must not reach React Native");
        }
        // the existing table utilities are untouched
        assert_eq!(web("table-fixed"), Some(vec![decl("table-layout", "fixed")]));
        assert_eq!(web("inline-flex"), Some(vec![decl("display", "inline-flex")]));
    }

    #[test]
    fn logical_padding_and_margin_are_web_only() {
        assert_eq!(web("ps-4"), Some(vec![decl("padding-inline-start", "16px")]));
        assert_eq!(web("pe-2"), Some(vec![decl("padding-inline-end", "8px")]));
        assert_eq!(web("-ms-1"), Some(vec![decl("margin-inline-start", "-4px")]));
        assert_eq!(web("me-px"), Some(vec![decl("margin-inline-end", "1px")]));
        for class in ["ps-4", "pe-2", "ms-1", "me-1"] {
            assert!(native(class).keys().all(|k| k == "__kbachWarnings" || !k.to_lowercase().contains("inline")), "{class}");
        }
    }

    #[test]
    fn viewport_units_lh_and_max_w_keywords_are_web_only() {
        assert_eq!(web("h-dvh"), Some(vec![decl("height", "100dvh")]));
        assert_eq!(web("min-h-svh"), Some(vec![decl("min-height", "100svh")]));
        assert_eq!(web("w-lvw"), Some(vec![decl("width", "100lvw")]));
        assert_eq!(web("size-dvh"), Some(vec![decl("width", "100dvh"), decl("height", "100dvh")]));
        assert_eq!(web("h-lh"), Some(vec![decl("height", "1lh")]));
        assert_eq!(web("max-w-none"), Some(vec![decl("max-width", "none")]));
        assert_eq!(web("max-w-prose"), Some(vec![decl("max-width", "65ch")]));
        // unchanged
        assert_eq!(web("w-screen"), Some(vec![decl("width", "100dvw")]));
        assert_eq!(web("h-screen"), Some(vec![decl("height", "100dvh")]));
        assert!(native("h-dvh").get("height").is_none());
        assert!(native("max-w-none").get("maxWidth").is_none());
    }

    #[test]
    fn tailwind_v4_extra_small_and_4xl_steps() {
        assert_eq!(web("w-3xs"), Some(vec![decl("width", "16rem")]));
        assert_eq!(web("max-w-2xs"), Some(vec![decl("max-width", "18rem")]));
        assert_eq!(web("max-w-xs"), Some(vec![decl("max-width", "20rem")]));
        assert_eq!(web("rounded-xs"), Some(vec![decl("border-radius", "0.125rem")]));
        assert_eq!(web("rounded-4xl"), Some(vec![decl("border-radius", "2rem")]));
        assert!(web_has("blur-xs", "--kb-blur", "blur(4px)"));
        assert!(web_has("backdrop-blur-xs", "--kb-backdrop-blur", "blur(4px)"));
    }

    /// Tailwind v4.3 values for scales v4 renamed or changed from v3.
    #[test]
    fn v4_3_values_for_the_scales_v4_changed() {
        assert_eq!(web("rounded-sm"), Some(vec![decl("border-radius", "0.25rem")]));
        assert!(web_has("blur-sm", "--kb-blur", "blur(8px)"));
        assert!(web_has("backdrop-blur-sm", "--kb-backdrop-blur", "blur(8px)"));
        assert_eq!(
            web("shadow-sm").unwrap()[0].value,
            "0 1px 3px 0 var(--kb-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--kb-shadow-color, rgb(0 0 0 / 0.1))",
        );
        assert!(web_has("drop-shadow-md", "--kb-drop-shadow", "drop-shadow(0 3px 3px var(--kb-drop-shadow-color, rgb(0 0 0 / 0.12)))"));
        assert!(web_has("drop-shadow-xs", "--kb-drop-shadow", "drop-shadow(0 1px 1px var(--kb-drop-shadow-color, rgb(0 0 0 / 0.05)))"));
        assert!(web_has("text-shadow-md", "text-shadow", "0px 1px 1px var(--kb-text-shadow-color, rgb(0 0 0 / 0.1)), 0px 1px 2px var(--kb-text-shadow-color, rgb(0 0 0 / 0.1)), 0px 2px 4px var(--kb-text-shadow-color, rgb(0 0 0 / 0.1))"));
        assert!(web_has("text-shadow-2xs", "text-shadow", "0px 1px 0px var(--kb-text-shadow-color, rgb(0 0 0 / 0.15))"));
        assert!(web_has("ring", "--kb-ring-width", "1px"));
        // any whole number, as in v4 (v3 only had 0/1/2/4/8)
        assert!(web_has("ring-3", "--kb-ring-width", "3px"));
        assert!(web_has("ring-offset-6", "--kb-ring-offset-width", "6px"));
        assert!(web_has("outline-3", "outline-width", "3px"));
        assert_eq!(web("outline-offset-6"), Some(vec![decl("outline-offset", "6px")]));
        // text sizes carry a default line-height that leading-* overrides
        assert!(web_has("text-sm", "line-height", "var(--kb-leading, calc(1.25 / 0.875))"));
        assert!(web_has("leading-8", "--kb-leading", "2rem"));
        // native: v4 sm shadow; no CSS variables or rings ever reach RN
        assert_eq!(native("shadow-sm").get("shadowRadius"), Some(&json!(3.0)));
        assert!(native("outline-2 outline-dashed ring leading-8 text-sm").keys().all(|k| !k.starts_with("Kb") && k != "boxShadow"));
        assert_eq!(native("outline-none").get("outlineStyle"), Some(&json!("none")));
        assert!(native("outline-none").get("outline").is_none());
        // no var() value ever reaches RN; the width alone still applies
        assert_eq!(native("outline-2"), serde_json::from_value::<serde_json::Map<String, Value>>(json!({ "outlineWidth": 2.0 })).unwrap());
        assert_eq!(native("outline-2 outline-dashed").get("outlineStyle"), Some(&json!("dashed")));
        assert!(native("outline-hidden").get("outline").is_none());
        // plain colors are untouched by the var() filter
        // (arbitrary hex: ThemeConfig::default() has an empty palette)
        assert_eq!(native("bg-[#3b82f6]").get("backgroundColor"), Some(&json!("#3b82f6")));
        assert_eq!(native("border-[#3b82f6]").get("borderColor"), Some(&json!("#3b82f6")));
        // native text size stays font-size only (RN line heights are absolute)
        assert_eq!(native("text-sm").get("lineHeight"), None);
        assert_eq!(native("leading-8 text-sm").get("lineHeight"), Some(&json!(32.0)));
    }

    #[test]
    fn inherit_color_keyword_on_web_but_not_native() {
        assert!(web_has("text-inherit", "color", "inherit"));
        assert!(web_has("bg-inherit", "background-color", "inherit"));
        assert!(web_has("border-inherit", "border-color", "inherit"));
        assert!(native("bg-inherit").get("backgroundColor").is_none());
        assert!(native("text-inherit").get("color").is_none());
    }
}

/// The rest of Tailwind v4.3's class list: v4.2 logical utilities, safe
/// alignment, flex fractions, colored drop shadows, and the small leftovers.
/// Web output checked against Tailwind's; web-only ones must give RN nothing.
#[cfg(test)]
mod tailwind_v4_remaining_tests {
    use super::*;
    use crate::parser::parse_class;
    use crate::resolve_style::resolve_style;
    use crate::theme::ColorValue;

    fn theme() -> ThemeConfig {
        let mut t = ThemeConfig::default();
        t.colors.insert("blue-6".to_string(), ColorValue::Plain("#2563eb".to_string()));
        t
    }
    fn web(class: &str) -> Option<Vec<Declaration>> {
        resolve_utility(&parse_class(class), &theme())
    }
    fn one(class: &str, property: &str, value: &str) {
        assert_eq!(web(class), Some(vec![decl(property, value)]), "{class}");
    }
    fn native_is_empty(class: &str) {
        let style = resolve_style(class, &theme(), "light", false, 400.0);
        assert!(style.keys().all(|k| k == "__kbachWarnings"), "{class} must not reach React Native, got {style:?}");
    }

    #[test]
    fn block_axis_logical_spacing_insets_and_scroll() {
        one("pbs-4", "padding-block-start", "16px");
        one("pbe-2", "padding-block-end", "8px");
        one("mbs-4", "margin-block-start", "16px");
        one("-mbe-2", "margin-block-end", "-8px");
        one("inset-s-4", "inset-inline-start", "16px");
        one("-inset-e-2", "inset-inline-end", "-8px");
        one("inset-bs-1/2", "inset-block-start", "50%");
        one("inset-be-full", "inset-block-end", "100%");
        one("scroll-ms-4", "scroll-margin-inline-start", "16px");
        one("-scroll-mbs-2", "scroll-margin-block-start", "-8px");
        one("scroll-pbe-4", "scroll-padding-block-end", "16px");
        one("scroll-ps-1", "scroll-padding-inline-start", "4px");
        for class in ["pbs-4", "mbs-4", "inset-s-4", "inset-bs-2", "scroll-ms-4"] {
            native_is_empty(class);
        }
    }

    #[test]
    fn block_axis_logical_borders() {
        assert_eq!(
            web("border-bs"),
            Some(vec![decl("border-block-start-width", "1px"), decl("border-block-start-style", "solid")]),
        );
        one("border-be-2", "border-block-end-width", "2px");
        one("border-bs-blue-6", "border-block-start-color", "#2563eb");
        native_is_empty("border-bs-2");
        native_is_empty("border-be");
    }

    #[test]
    fn logical_viewport_sizes() {
        one("block-dvh", "block-size", "100dvh");
        one("inline-svw", "inline-size", "100svw");
        one("max-inline-none", "max-inline-size", "none");
        one("min-block-lh", "min-block-size", "1lh");
        one("max-h-none", "max-height", "none");
        // display utilities that share these names are untouched
        one("block", "display", "block");
        one("inline-flex", "display", "inline-flex");
    }

    #[test]
    fn negative_full_only_for_inset_and_translate() {
        one("-top-full", "top", "-100%");
        assert_eq!(web("-inset-x-full"), Some(vec![decl("left", "-100%"), decl("right", "-100%")]));
        assert!(web("-translate-x-full").unwrap().contains(&decl("--kb-translate-x", "-100%")));
        // margins have no `full` step in Tailwind, negative or not
        assert_eq!(web("-mt-full"), None);
    }

    #[test]
    fn safe_and_baseline_alignment_are_web_only() {
        one("items-center-safe", "align-items", "safe center");
        one("items-baseline-last", "align-items", "last baseline");
        one("self-end-safe", "align-self", "safe flex-end");
        one("justify-center-safe", "justify-content", "safe center");
        one("justify-baseline", "justify-content", "baseline");
        one("content-baseline", "align-content", "baseline");
        one("content-end-safe", "align-content", "safe flex-end");
        one("justify-items-normal", "justify-items", "normal");
        one("place-items-center-safe", "place-items", "safe center");
        one("justify-self-end-safe", "justify-self", "safe end");
        native_is_empty("items-center-safe");
        // the plain keywords still reach native
        one("items-center", "align-items", "center");
    }

    #[test]
    fn object_position_and_container_type_never_reach_native() {
        // Not React Native styles; used to leak through as objectPosition/containerType.
        for class in ["object-top", "object-top-left", "@container", "@container-normal"] {
            native_is_empty(class);
            assert!(web(class).is_some(), "{class} still works on web");
        }
    }

    #[test]
    fn flex_fractions_are_web_only() {
        one("flex-1/2", "flex", "calc(1/2 * 100%)");
        native_is_empty("flex-1/3");
    }

    #[test]
    fn colored_drop_shadows_recolor_the_size() {
        assert_eq!(
            web("drop-shadow-blue-6"),
            Some(vec![
                decl("--kb-drop-shadow-color", "#2563eb"),
                decl("--kb-drop-shadow", "var(--kb-drop-shadow-size,)"),
                decl("filter", "var(--kb-blur,) var(--kb-brightness,) var(--kb-contrast,) var(--kb-grayscale,) var(--kb-hue-rotate,) var(--kb-invert,) var(--kb-saturate,) var(--kb-sepia,) var(--kb-drop-shadow,)"),
            ]),
        );
        assert!(web("drop-shadow-lg").unwrap().contains(&decl("--kb-drop-shadow-size", "drop-shadow(0 4px 4px var(--kb-drop-shadow-color, rgb(0 0 0 / 0.15)))")));
    }

    #[test]
    fn divide_and_placeholder_colors() {
        one("divide-blue-6", "__divide-color", "#2563eb");
        // the divide-x/y/style utilities that share the name prefix still work
        one("divide-double", "__divide-style", "double");
        assert!(web("divide-x").is_some() && web("divide-y-2").is_some());
        // placeholder-<color> is placeholder:text-<color>, selector kept as written
        let p = parse_class("placeholder-blue-6");
        assert_eq!(p.modifiers, vec!["placeholder".to_string()]);
        assert_eq!(p.utility, "text");
        assert_eq!(p.original, "placeholder-blue-6");
        let p = parse_class("focus:placeholder-blue-6");
        assert_eq!(p.modifiers, vec!["focus".to_string(), "placeholder".to_string()]);
        // the existing placeholder: modifier is untouched
        assert_eq!(parse_class("placeholder:text-blue-6").utility, "text");
    }

    #[test]
    fn small_leftovers() {
        assert_eq!(
            web("contain-size"),
            Some(vec![
                decl("--kb-contain-size", "size"),
                decl("contain", "var(--kb-contain-size,) var(--kb-contain-layout,) var(--kb-contain-paint,) var(--kb-contain-style,)"),
            ]),
        );
        one("contain-strict", "contain", "strict");
        one("wrap-anywhere", "overflow-wrap", "anywhere");
        one("wrap-break-word", "overflow-wrap", "break-word");
        one("scheme-only-dark", "color-scheme", "only dark");
        one("grid-cols-subgrid", "grid-template-columns", "subgrid");
        one("grid-rows-subgrid", "grid-template-rows", "subgrid");
        one("transform-border", "transform-box", "border-box");
        assert!(web("translate-none").unwrap().contains(&decl("--kb-translate-x", "0")));
        assert!(web("scale-3d").is_some() && web("translate-3d").is_some());
        one("stroke-2", "stroke-width", "2");
        one("accent-auto", "accent-color", "auto");
        one("ease-initial", "--kb-ease", "initial");
        one("via-none", "--kb-gradient-stops", "var(--kb-gradient-from), var(--kb-gradient-to)");
        one("mix-blend-plus-darker", "mix-blend-mode", "plus-darker");
        one("@container-normal", "container-type", "normal");
        one("object-top-left", "object-position", "left top");
        one("bg-bottom-right", "background-position", "right bottom");
        assert!(web("leading-px").unwrap().contains(&decl("line-height", "1px")));
        // stroke colors still resolve
        one("stroke-blue-6", "stroke", "#2563eb");
    }
}

/// Opacity suffixes on colors that aren't hex (regression: `bg-card/80` on
/// the CDN, and any `kbach.config.js` color like `red`, rendered opaque).
#[cfg(test)]
mod non_hex_opacity_tests {
    use super::*;
    use crate::parser::parse_class;
    use crate::resolve_style::resolve_style;
    use crate::theme::ColorValue;
    use serde_json::json;

    fn theme() -> ThemeConfig {
        let mut t = ThemeConfig::default();
        for (k, v) in [("card", "rgb(var(--kb-color-card))"), ("named", "red"), ("fn", "rgb(10 20 30)"), ("brand", "#ff6b35"), ("current", "currentColor")] {
            t.colors.insert(k.to_string(), ColorValue::Plain(v.to_string()));
        }
        t
    }
    fn web(class: &str) -> Vec<Declaration> {
        resolve_utility(&parse_class(class), &theme()).unwrap_or_else(|| panic!("{class}"))
    }

    #[test]
    fn non_hex_colors_get_their_opacity_through_color_mix_on_every_color_utility() {
        let mix = |c: &str, p: u8| format!("color-mix(in srgb, {c} {p}%, transparent)");
        assert!(web("bg-card/80").contains(&decl("background-color", &mix("rgb(var(--kb-color-card))", 80))));
        assert!(web("text-card/50").contains(&decl("color", &mix("rgb(var(--kb-color-card))", 50))));
        assert!(web("border-card/30").contains(&decl("border-color", &mix("rgb(var(--kb-color-card))", 30))));
        assert!(web("ring-card/50").contains(&decl("--kb-ring-color", &mix("rgb(var(--kb-color-card))", 50))));
        assert!(web("bg-named/50").contains(&decl("background-color", &mix("red", 50))));
        assert!(web("bg-fn/50").contains(&decl("background-color", &mix("rgb(10 20 30)", 50))));
        assert!(web("bg-current/50").contains(&decl("background-color", &mix("currentColor", 50))));
        // hex keeps its rgba, no-suffix stays plain, inherit can't be mixed
        assert!(web("bg-brand/80").contains(&decl("background-color", "rgba(255,107,53,0.8)")));
        assert!(web("bg-card").contains(&decl("background-color", "rgb(var(--kb-color-card))")));
        assert!(web("bg-inherit/50").contains(&decl("background-color", "inherit")));
    }

    #[test]
    fn native_keeps_the_plain_color_since_rn_has_no_color_mix() {
        let n = |c: &str| resolve_style(c, &theme(), "light", false, 400.0);
        assert_eq!(n("bg-named/50").get("backgroundColor"), Some(&json!("red")));
        assert_eq!(n("border-fn/50").get("borderColor"), Some(&json!("rgb(10 20 30)")));
        assert_eq!(n("bg-brand/80").get("backgroundColor"), Some(&json!("rgba(255,107,53,0.8)")));
    }
}
