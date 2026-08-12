//! Domain-split resolver — mirrors `old-kbach/src/core/resolvers/*.ts`
//! (RULES.md rule #1: no monolith files). Each submodule owns one styling
//! domain and exposes a `resolve(parsed, theme) -> Option<Vec<Declaration>>`
//! function; `resolve_utility` below dispatches to the first one that
//! recognizes the utility.

mod border;
mod color;
mod divide;
mod effects;
mod layout;
mod spacing;
mod typography;

use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

pub use color::expand_mode_aware_color_classes;

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
pub(crate) fn resolve_length(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<String> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(value.to_string());
    }
    theme.spacing.get(value).map(|px| format!("{px}px"))
}

/// Resolves a 0-100 percentage utility value (opacity, bg-opacity,
/// text-opacity) to a 0-1 decimal string. Arbitrary values are passed
/// through as-is (already whatever decimal/unit the user wrote).
pub(crate) fn resolve_percent(parsed: &ParsedClass) -> Option<String> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(value.to_string());
    }
    let pct: f64 = value.parse().ok()?;
    Some(format!("{}", pct / 100.0))
}

pub fn resolve_utility(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    layout::resolve(parsed, theme)
        .or_else(|| spacing::resolve(parsed, theme))
        .or_else(|| color::resolve(parsed, theme))
        .or_else(|| border::resolve(parsed, theme))
        .or_else(|| typography::resolve(parsed, theme))
        .or_else(|| effects::resolve(parsed, theme))
        .or_else(|| divide::resolve(parsed, theme))
}

/// Native (React Native) dispatcher — layout, spacing, and border resolve
/// as-is (`spacing.rs`/`border.rs` already emit RN-compatible CSS shapes,
/// just with `px`/`rem` units that `resolve_style.rs` strips down to plain
/// numbers). Color is the one domain that's genuinely forked rather than
/// reused: `color::resolve()`'s whole design is CSS custom-property opacity
/// composition (`rgba(r,g,b,var(--bg-opacity, 1))`), which RN cannot parse
/// at all (no var() support) — reusing it would just mean stripping the
/// wrapper back out immediately. `color::lookup_hex` (the underlying
/// plain-hex lookup) and `typography::text_size`/`text_align` (the same
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
/// warning), not worth special-casing out.
pub fn resolve_utility_native(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    layout::resolve(parsed, theme)
        .or_else(|| spacing::resolve(parsed, theme))
        .or_else(|| border::resolve(parsed, theme))
        .or_else(|| resolve_color_native(parsed, theme))
        .or_else(|| resolve_leading_tracking_native(parsed))
        .or_else(|| resolve_typography_native(parsed))
}

/// `font-weight`/`text-transform`/`text-decoration-line` — all three match
/// RN's style key types directly as plain strings, so this is pure
/// dispatch wiring, no value conversion.
fn resolve_typography_native(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "font" => {
            let value = parsed.value.as_deref()?;
            typography::font_weight(value).map(|v| vec![decl("font-weight", v)])
        }
        "uppercase" => Some(vec![decl("text-transform", "uppercase")]),
        "lowercase" => Some(vec![decl("text-transform", "lowercase")]),
        "capitalize" => Some(vec![decl("text-transform", "capitalize")]),
        "underline" => Some(vec![decl("text-decoration-line", "underline")]),
        "line-through" => Some(vec![decl("text-decoration-line", "line-through")]),
        "no-underline" => Some(vec![decl("text-decoration-line", "none")]),
        _ => None,
    }
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

fn native_hex_color(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<String> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        Some(value.to_string())
    } else {
        color::lookup_hex(theme, value).map(String::from)
    }
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
}
