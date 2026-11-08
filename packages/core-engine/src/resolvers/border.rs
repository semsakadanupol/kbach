use super::color::{color_value, is_length};
use super::{decl, resolve_length, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

/// Named border-radius scale (Tailwind-style sizes, not the theme's numeric
/// spacing scale) — checked before falling back to `resolve_length` in the
/// "rounded" arm below, so both `rounded-lg` (named) and `rounded-4` /
/// `rounded-[10px]` (spacing-scale / arbitrary) resolve correctly.
fn radius_size(key: &str) -> Option<&'static str> {
    Some(match key {
        "none" => "0px",
        // Tailwind v4.3's radius scale (`--radius-*`). `sm` moved from v3's
        // 0.125rem to 0.25rem in v4; v3's value is now `xs`.
        "xs" => "0.125rem",
        "sm" => "0.25rem",
        "md" => "0.375rem",
        "lg" => "0.5rem",
        "xl" => "0.75rem",
        "2xl" => "1rem",
        "3xl" => "1.5rem",
        "4xl" => "2rem",
        "full" => "9999px",
        _ => return None,
    })
}

/// A numeric border width: `border-2` / `border-t-4` / `border-x-8` /
/// `divide-x-2` mean exactly N px in Tailwind, NOT a spacing-scale step.
/// They used to go through `resolve_length` (n * 4px), so `border-2` came
/// out 8px on web and native. That shipped from @kbach/core-engine
/// 1.0.0-beta.2 until this fix; the old test hid it by overriding the
/// theme's spacing so "2" meant 2px. Theme-independent on purpose:
/// customizing spacing must not change border widths.
pub(super) fn border_width_px(parsed: &ParsedClass) -> Option<String> {
    let value = parsed.value.as_deref()?;
    if parsed.negative || parsed.is_arbitrary {
        return None;
    }
    let n: f64 = value.parse().ok()?;
    (n >= 0.0).then(|| format!("{n}px"))
}

/// `t`/`r`/`b`/`l` -> the CSS side each bare `border-t`/`border-r`/
/// `border-b`/`border-l` (1px solid default, mirroring bare `border`'s own
/// default) applies to.
fn border_side_property(side: &str) -> Option<&'static str> {
    Some(match side {
        "t" => "border-top",
        "r" => "border-right",
        "b" => "border-bottom",
        "l" => "border-left",
        _ => return None,
    })
}

/// Resolves a per-side border value (width/style/color, same 3-way
/// ambiguity `border_value` disambiguates for the bare "border-" catchall)
/// for a specific CSS side prefix like "border-top"/"border-left" — used by
/// `border-t-*`/`border-r-*`/`border-b-*`/`border-l-*` (registered
/// `VALUE_PREFIXES` entries distinct from the bare `border-t`/`border-r`/
/// `border-b`/`border-l` literals `border_value` above still handles).
fn border_side_value(theme: &ThemeConfig, parsed: &ParsedClass, side_property: &str) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        // Same regression guard as `border_value` — see its own doc comment.
        if is_length(parsed, value) {
            return Some(vec![decl(&format!("{side_property}-width"), value)]);
        }
        return color_value(theme, parsed).map(|v| vec![decl(&format!("{side_property}-color"), &v)]);
    }
    if value.parse::<f64>().is_ok() {
        return border_width_px(parsed).map(|v| vec![decl(&format!("{side_property}-width"), &v)]);
    }
    if matches!(value, "solid" | "dashed" | "dotted" | "double" | "hidden" | "none") {
        return Some(vec![decl(&format!("{side_property}-style"), value)]);
    }
    // color_value's own opacity-suffix handling (`border-t-blue-6/50`) is
    // what this reuses it for.
    color_value(theme, parsed).map(|v| vec![decl(&format!("{side_property}-color"), &v)])
}

/// Same shape as `border_side_value`, but for the two-sides-at-once
/// `border-x-*`/`border-y-*` shorthands.
fn border_axis_value(theme: &ThemeConfig, parsed: &ParsedClass, side_a: &str, side_b: &str) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        // Same regression guard as `border_value` — see its own doc comment.
        if is_length(parsed, value) {
            return Some(vec![decl(&format!("{side_a}-width"), value), decl(&format!("{side_b}-width"), value)]);
        }
        let color = color_value(theme, parsed)?;
        return Some(vec![decl(&format!("{side_a}-color"), &color), decl(&format!("{side_b}-color"), &color)]);
    }
    if value.parse::<f64>().is_ok() {
        let v = border_width_px(parsed)?;
        return Some(vec![decl(&format!("{side_a}-width"), &v), decl(&format!("{side_b}-width"), &v)]);
    }
    if matches!(value, "solid" | "dashed" | "dotted" | "double" | "hidden" | "none") {
        return Some(vec![decl(&format!("{side_a}-style"), value), decl(&format!("{side_b}-style"), value)]);
    }
    let color = color_value(theme, parsed)?;
    Some(vec![decl(&format!("{side_a}-color"), &color), decl(&format!("{side_b}-color"), &color)])
}

/// "border-*" is three-way ambiguous, same shape as "text-*" in color.rs:
/// a number means border-width, a known keyword means border-style,
/// anything else is treated as a color name/arbitrary value.
///
/// "border-collapse"/"border-separate" (table layout, Phase 23) join this
/// same dispatch for the same reason "outline-none" needed its own special
/// case: "border-" is a registered VALUE_PREFIXES catchall, so both parse
/// as utility="border" value="collapse"/"separate", never reaching
/// `interactivity.rs`'s table-utilities arm where the name would otherwise
/// suggest they belong.
fn border_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;

    if !parsed.is_arbitrary {
        if let Some(side) = border_side_property(value) {
            return Some(vec![decl(&format!("{side}-width"), "1px"), decl(&format!("{side}-style"), "solid")]);
        }
        // Bare two-side / logical-side borders, 1px solid like `border-t`.
        // `border-x`/`border-y` use the same physical sides `border-x-2`
        // already does; `border-s`/`border-e` the logical ones `border-s-2`
        // already does.
        let pair = match value {
            "x" => Some(("border-left", "border-right")),
            "y" => Some(("border-top", "border-bottom")),
            _ => None,
        };
        if let Some((a, b)) = pair {
            return Some(vec![
                decl(&format!("{a}-width"), "1px"),
                decl(&format!("{b}-width"), "1px"),
                decl(&format!("{a}-style"), "solid"),
                decl(&format!("{b}-style"), "solid"),
            ]);
        }
        let logical = match value {
            "s" => Some("border-inline-start"),
            "e" => Some("border-inline-end"),
            _ => None,
        };
        if let Some(side) = logical {
            return Some(vec![decl(&format!("{side}-width"), "1px"), decl(&format!("{side}-style"), "solid")]);
        }
        if value == "collapse" {
            return Some(vec![decl("border-collapse", "collapse")]);
        }
        if value == "separate" {
            return Some(vec![decl("border-collapse", "separate")]);
        }
        if value.parse::<f64>().is_ok() {
            return border_width_px(parsed).map(|v| vec![decl("border-width", &v)]);
        }
        if matches!(value, "solid" | "dashed" | "dotted" | "double" | "hidden" | "none") {
            return Some(vec![decl("border-style", value)]);
        }
    } else if is_length(parsed, value) {
        // Regression guard: an arbitrary "border-[3px]" used to be the ONLY
        // shape this branch handled at all, unconditionally — meaning an
        // arbitrary COLOR ("border-[#050505]", or the same thing via a
        // mode-aware theme color substituted in by
        // substitute_mode_aware_color_token, e.g. "border-background")
        // dropped straight into a `border-width` declaration instead of
        // `border-color`, and failed RN's "isn't a valid native value for
        // border-width" validation. Mirrors resolve_text's identical
        // looks_like_length guard for arbitrary "text-[...]".
        return Some(vec![decl("border-width", value)]);
    }

    color_value(theme, parsed).map(|v| vec![decl("border-color", &v)])
}

/// Per-corner/side border-radius property names — "tl"/"tr"/"br"/"bl" are
/// single corners; "t"/"r"/"b"/"l" are side-pairs (two adjacent corners
/// each). Real Tailwind's exact grouping.
fn radius_properties(side: &str) -> Option<&'static [&'static str]> {
    Some(match side {
        "t" => &["border-top-left-radius", "border-top-right-radius"],
        "r" => &["border-top-right-radius", "border-bottom-right-radius"],
        "b" => &["border-bottom-right-radius", "border-bottom-left-radius"],
        "l" => &["border-top-left-radius", "border-bottom-left-radius"],
        "tl" => &["border-top-left-radius"],
        "tr" => &["border-top-right-radius"],
        "br" => &["border-bottom-right-radius"],
        "bl" => &["border-bottom-left-radius"],
        // Logical corners/sides — just different CSS property NAMES (the
        // browser resolves which physical corner each maps to from
        // `dir`/`writing-mode`, not this engine), same "no direction-
        // tracking logic needed" reasoning `layout.rs`'s `start`/`end`
        // inset properties already document. "s"/"e" (start/end SIDE, two
        // logical corners each) mirror the physical "t"/"r"/"b"/"l" pairs
        // above; "ss"/"se"/"ee"/"es" (single logical corners) mirror
        // "tl"/"tr"/"br"/"bl".
        "s" => &["border-start-start-radius", "border-end-start-radius"],
        "e" => &["border-start-end-radius", "border-end-end-radius"],
        "ss" => &["border-start-start-radius"],
        "se" => &["border-start-end-radius"],
        "ee" => &["border-end-end-radius"],
        "es" => &["border-end-start-radius"],
        _ => return None,
    })
}

/// Shared by bare "rounded" and every per-side/corner variant — named size
/// (checked first) or the spacing-scale/arbitrary fallback, identical
/// resolution `resolve()`'s own bare "rounded" arm already uses.
fn resolve_radius_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<String> {
    if !parsed.is_arbitrary {
        if let Some(value) = parsed.value.as_deref() {
            if let Some(size) = radius_size(value) {
                return Some(size.to_string());
            }
        }
    }
    resolve_length(theme, parsed)
}

/// Unlike bare "rounded" (which defaults to "0.25rem" with no value at all,
/// e.g. plain `rounded`), a per-side/corner utility name like "rounded-t"
/// only ever reaches this function WITH a value already — "rounded-t-" is
/// a registered `VALUE_PREFIXES` entry requiring a trailing dash, so a
/// bare "rounded-t" token (no suffix) parses as utility="rounded" value="t"
/// instead (falling through to `radius_size`, which has no "t" key, same
/// as real Tailwind not accepting a bare "rounded-t" either) — never as
/// utility="rounded-t" with `value: None`.
fn resolve_radius_side(theme: &ThemeConfig, parsed: &ParsedClass, side: &str) -> Option<Vec<Declaration>> {
    let properties = radius_properties(side)?;
    let value = resolve_radius_value(theme, parsed)?;
    Some(properties.iter().map(|p| decl(p, &value)).collect())
}

/// Real Tailwind's outline-width scale — identical set of pixel values to
/// `ring_width` below, but kept as its own function rather than reused
/// directly: the two scales happen to share the same numbers today, not
/// because they're the same concept (outline-width has no "3px" default the
/// way bare `ring` does, for instance), so a future divergence in either
/// scale shouldn't accidentally ripple into the other.
///
/// Any whole number of px (`outline-3`, `outline-offset-6`), as in Tailwind
/// v4 — not just v3's fixed 0/1/2/4/8.
fn outline_width_value(key: &str) -> Option<String> {
    whole_px(key)
}

/// A non-negative whole number `N` -> `"Npx"`; shared by the ring and
/// outline width scales (Tailwind v4 takes any integer for both).
pub(super) fn whole_px(key: &str) -> Option<String> {
    if key.is_empty() || !key.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    key.parse::<u32>().ok().map(|n| format!("{n}px"))
}

const OUTLINE_STYLES: &[&str] = &["solid", "dashed", "dotted", "double"];

/// What every outline width (and bare `outline`) uses as its style, so a
/// width alone draws a solid outline and an `outline-dashed`/etc. sets the
/// variable to change it (see the "outline" arms in `resolve`).
const OUTLINE_STYLE_VAR: &str = "var(--kb-outline-style, solid)";

/// "outline-*" is three-way ambiguous, same shape as "border-*": a
/// recognized width means `outline-width`, a recognized style keyword means
/// `outline-style`, anything else is a color. Bare `outline`/`outline-none`
/// are handled as their own special cases in `resolve()` (see that match
/// arm's own comment for why), so this is never reached for those two.
fn outline_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        // Same regression guard as `border_value` above — an arbitrary
        // color ("outline-[#050505]", or a mode-aware theme color
        // substituted in the same way) must not fall into `outline-width`
        // just because it's arbitrary.
        if is_length(parsed, value) {
            return Some(vec![decl("outline-width", value)]);
        }
        return color_value(theme, parsed).map(|v| vec![decl("outline-color", &v)]);
    }
    if let Some(w) = outline_width_value(value) {
        return Some(vec![decl("outline-style", OUTLINE_STYLE_VAR), decl("outline-width", &w)]);
    }
    if OUTLINE_STYLES.contains(&value) {
        return Some(vec![decl("--kb-outline-style", value), decl("outline-style", value)]);
    }
    color_value(theme, parsed).map(|v| vec![decl("outline-color", &v)])
}

fn outline_offset_value(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(vec![decl("outline-offset", value)]);
    }
    outline_width_value(value).map(|v| vec![decl("outline-offset", &v)])
}

/// The `box-shadow` declaration EVERY `ring-*`/`ring-offset-*` utility
/// emits identically — each utility only ever sets its OWN independent
/// `--kb-ring-*` variable, never rewriting a shared derived variable the
/// way `background.rs`'s gradient stops do. That "each rule rebuilds a
/// shared variable from scratch" technique depends on a deterministic
/// cross-rule cascade order (`css.rs` needed a dedicated sub-tier fix for
/// gradients specifically because of it — see that module's own doc
/// comment) — genuinely unnecessary here, since `calc()` and `var()` with
/// fallbacks let every ring utility compose independently with NO
/// dependency on which rule sorts last. Mirrors real Tailwind's own
/// generated `box-shadow` shape (offset-shadow, then ring-shadow, then any
/// plain `shadow-*`), simplified to two layers since this engine's
/// `shadow-*` scale doesn't itself compose via a `--kb-shadow` variable.
// Rings are two layers of effects.rs's BOX_SHADOW_COMPOSE, built from their
// own variables so every ring utility composes in any order:
// `ring-N` sets the width and the ring layer (and draws), `ring-offset-N`
// sets the offset width and the offset layer, and `ring-inset`/the color
// utilities only set their variable. Default ring color is `currentColor`
// (Tailwind v4; v3 used a translucent blue-500).
const RING_SHADOW: &str = "var(--kb-ring-inset,) 0 0 0 calc(var(--kb-ring-width, 0px) + var(--kb-ring-offset-width, 0px)) var(--kb-ring-color, currentColor)";
const RING_OFFSET_SHADOW: &str = "var(--kb-ring-inset,) 0 0 0 var(--kb-ring-offset-width, 0px) var(--kb-ring-offset-color, #fff)";

fn ring_with_width(width: &str) -> Vec<Declaration> {
    vec![
        decl("--kb-ring-width", width),
        decl("--kb-ring-shadow", RING_SHADOW),
        decl("box-shadow", super::effects::BOX_SHADOW_COMPOSE),
    ]
}

/// Any whole number of px (`ring-3`, `ring-offset-6`), as in Tailwind v4.
fn ring_width(key: &str) -> Option<String> {
    whole_px(key)
}

fn ring_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if value == "inset" {
        return Some(vec![decl("--kb-ring-inset", "inset")]);
    }
    if !parsed.is_arbitrary {
        if let Some(w) = ring_width(value) {
            return Some(ring_with_width(&w));
        }
    } else if is_length(parsed, value) {
        // `ring-[3px]`: a width, not a color (it used to set the ring color to 3px).
        return Some(ring_with_width(value));
    }
    let color = color_value(theme, parsed)?;
    Some(vec![decl("--kb-ring-color", &color)])
}

fn ring_offset_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if !parsed.is_arbitrary {
        if let Some(w) = ring_width(value) {
            // No `box-shadow` of its own (Tailwind v4): an offset alone draws
            // nothing; the ring that uses it emits the composition. (Before,
            // `ring-offset-2` alone drew a visible 2px ring.)
            return Some(vec![decl("--kb-ring-offset-width", &w), decl("--kb-ring-offset-shadow", RING_OFFSET_SHADOW)]);
        }
    }
    let color = color_value(theme, parsed)?;
    Some(vec![decl("--kb-ring-offset-color", &color)])
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "border" if parsed.value.is_none() => Some(vec![decl("border-width", "1px"), decl("border-style", "solid")]),
        "border" => border_value(theme, parsed),
        // Per-side/per-axis width+style+color — "border-t-"/"border-r-"/etc.
        // are registered VALUE_PREFIXES entries distinct from the bare
        // "border-t"/"border-r"/etc. literals `border_value` above still
        // handles (see that arm's own doc comment).
        "border-t" => border_side_value(theme, parsed, "border-top"),
        "border-r" => border_side_value(theme, parsed, "border-right"),
        "border-b" => border_side_value(theme, parsed, "border-bottom"),
        "border-l" => border_side_value(theme, parsed, "border-left"),
        // Logical sides — same "just a different property name, the
        // browser resolves the physical side" reasoning as the radius
        // corners above.
        "border-s" => border_side_value(theme, parsed, "border-inline-start"),
        "border-e" => border_side_value(theme, parsed, "border-inline-end"),
        "border-x" => border_axis_value(theme, parsed, "border-left", "border-right"),
        "border-y" => border_axis_value(theme, parsed, "border-top", "border-bottom"),
        "rounded" if parsed.value.is_none() => Some(vec![decl("border-radius", "0.25rem")]),
        "rounded" => {
            let value = parsed.value.as_deref()?;
            if !parsed.is_arbitrary {
                if let Some(size) = radius_size(value) {
                    return Some(vec![decl("border-radius", size)]);
                }
            }
            resolve_length(theme, parsed).map(|v| vec![decl("border-radius", &v)])
        }
        "rounded-t" | "rounded-r" | "rounded-b" | "rounded-l" | "rounded-tl" | "rounded-tr" | "rounded-br" | "rounded-bl"
        | "rounded-s" | "rounded-e" | "rounded-ss" | "rounded-se" | "rounded-ee" | "rounded-es" => {
            resolve_radius_side(theme, parsed, &parsed.utility["rounded-".len()..])
        }
        // Bare `ring` is 1px in Tailwind v4 (v3: 3px; v3's look is `ring-3`).
        "ring" if parsed.value.is_none() => Some(ring_with_width("1px")),
        "ring" => ring_value(theme, parsed),
        "ring-offset" => ring_offset_value(theme, parsed),
        // Outlines work like Tailwind v4: every width/bare utility sets
        // `outline-style: var(--kb-outline-style, solid)` (so `outline-2`
        // alone is visible), and the style utilities set the variable too,
        // so `outline-2 outline-dashed` is dashed whichever rule lands later.
        "outline" if parsed.value.is_none() => {
            Some(vec![decl("outline-style", OUTLINE_STYLE_VAR), decl("outline-width", "1px")])
        }
        // An outline that is invisible normally but still shows in
        // forced-colors (high-contrast) mode, where `transparent` becomes a
        // real color: Tailwind v4's `outline-hidden` behavior. (`outline-none`
        // removes the outline outright.)
        "outline" if !parsed.is_arbitrary && parsed.value.as_deref() == Some("hidden") => Some(vec![
            decl("--kb-outline-style", "none"),
            decl("outline", "2px solid transparent"),
            decl("outline-offset", "2px"),
        ]),
        // "outline-none" parses as utility="outline", value="none" — "outline-"
        // is a VALUE_PREFIXES entry, so the standalone-name match above never
        // actually fires for it (the same class of bug isSafeArbitraryValue's
        // sibling checks exist to catch — see parser.rs's module docs).
        // Tailwind v4: `outline-style: none` (v3 used `outline: none`, which
        // is also not a valid React Native style).
        "outline" if parsed.value.as_deref() == Some("none") => {
            Some(vec![decl("--kb-outline-style", "none"), decl("outline-style", "none")])
        }
        "outline" => outline_value(theme, parsed),
        "outline-offset" => outline_offset_value(parsed),
        _ => None,
    }
}

/// Block-axis logical borders (Tailwind v4.2): `border-bs`/`border-be`
/// (1px solid) and `border-bs-2`/`border-be-blue-6`/… WEB-ONLY: called from
/// `resolve_utility` only, so React Native is never handed a
/// `border-block-start-width`.
pub fn resolve_web_only(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "border" if !parsed.is_arbitrary => {
            let side = match parsed.value.as_deref()? {
                "bs" => "border-block-start",
                "be" => "border-block-end",
                _ => return None,
            };
            Some(vec![decl(&format!("{side}-width"), "1px"), decl(&format!("{side}-style"), "solid")])
        }
        "border-bs" => border_side_value(theme, parsed, "border-block-start"),
        "border-be" => border_side_value(theme, parsed, "border-block-end"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
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
    fn bare_border_defaults_to_a_1px_solid_border() {
        let t = theme();
        assert_eq!(resolve(&parse_class("border"), &t), Some(vec![decl("border-width", "1px"), decl("border-style", "solid")]));
    }

    #[test]
    fn resolves_bare_per_side_borders() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("border-b"), &t),
            Some(vec![decl("border-bottom-width", "1px"), decl("border-bottom-style", "solid")]),
        );
        assert_eq!(
            resolve(&parse_class("border-t"), &t),
            Some(vec![decl("border-top-width", "1px"), decl("border-top-style", "solid")]),
        );
        assert_eq!(
            resolve(&parse_class("border-l"), &t),
            Some(vec![decl("border-left-width", "1px"), decl("border-left-style", "solid")]),
        );
        assert_eq!(
            resolve(&parse_class("border-r"), &t),
            Some(vec![decl("border-right-width", "1px"), decl("border-right-style", "solid")]),
        );
    }

    #[test]
    fn resolves_outline_none_despite_the_shared_outline_prefix() {
        let t = theme();
        // Tailwind v4: outline-none is outline-style: none; bare outline is 1px.
        assert_eq!(
            resolve(&parse_class("outline-none"), &t),
            Some(vec![decl("--kb-outline-style", "none"), decl("outline-style", "none")]),
        );
        assert_eq!(
            resolve(&parse_class("outline"), &t),
            Some(vec![decl("outline-style", OUTLINE_STYLE_VAR), decl("outline-width", "1px")]),
        );
        // outline-hidden: invisible, but still shown in forced-colors mode
        assert_eq!(
            resolve(&parse_class("outline-hidden"), &t),
            Some(vec![
                decl("--kb-outline-style", "none"),
                decl("outline", "2px solid transparent"),
                decl("outline-offset", "2px"),
            ]),
        );
    }

    #[test]
    fn numeric_border_value_resolves_to_width() {
        let mut t = theme();
        t.spacing.insert("2".to_string(), 2.0);
        assert_eq!(resolve(&parse_class("border-2"), &t), Some(vec![decl("border-width", "2px")]));
    }

    #[test]
    fn named_radius_size_resolves_correctly() {
        // Regression: "rounded-lg" previously fell through to the numeric
        // spacing-scale lookup (resolve_length), which has no "lg" key, so
        // it silently resolved to nothing — caught by Phase 6's new
        // unknown-class warning system, not by any test until now.
        let t = theme();
        assert_eq!(resolve(&parse_class("rounded-lg"), &t), Some(vec![decl("border-radius", "0.5rem")]));
        assert_eq!(resolve(&parse_class("rounded-full"), &t), Some(vec![decl("border-radius", "9999px")]));
        assert_eq!(resolve(&parse_class("rounded-none"), &t), Some(vec![decl("border-radius", "0px")]));
    }

    #[test]
    fn numeric_and_arbitrary_radius_values_still_use_the_spacing_scale_fallback() {
        let mut t = theme();
        t.spacing.insert("4".to_string(), 16.0);
        assert_eq!(resolve(&parse_class("rounded-4"), &t), Some(vec![decl("border-radius", "16px")]));
        assert_eq!(resolve(&parse_class("rounded-[10px]"), &t), Some(vec![decl("border-radius", "10px")]));
    }

    #[test]
    fn keyword_border_value_resolves_to_style() {
        let t = theme();
        assert_eq!(resolve(&parse_class("border-dashed"), &t), Some(vec![decl("border-style", "dashed")]));
    }

    #[test]
    fn named_color_border_value_resolves_to_color() {
        let t = theme();
        assert_eq!(resolve(&parse_class("border-blue-6"), &t), Some(vec![decl("border-color", "#2563eb")]));
    }

    #[test]
    fn an_arbitrary_hex_border_value_resolves_to_color_not_width() {
        // Regression: `border-[...]` used to treat EVERY arbitrary value as
        // border-width unconditionally, regardless of whether it looked
        // like a length at all — "border-[#050505]" (or the same thing via
        // a mode-aware theme color substituted in by
        // substitute_mode_aware_color_token before this ever runs, e.g.
        // `border-background`) silently produced `border-width: #050505`,
        // which then failed RN's native-value validation ("isn't a valid
        // native value for border-width — dropped"). Mirrors resolve_text's
        // identical `looks_like_length` guard for arbitrary `text-[...]`.
        let t = theme();
        assert_eq!(resolve(&parse_class("border-[#050505]"), &t), Some(vec![decl("border-color", "#050505")]));
        assert_eq!(resolve(&parse_class("border-t-[#050505]"), &t), Some(vec![decl("border-top-color", "#050505")]));
        assert_eq!(
            resolve(&parse_class("border-x-[#050505]"), &t),
            Some(vec![decl("border-left-color", "#050505"), decl("border-right-color", "#050505")])
        );
        assert_eq!(resolve(&parse_class("outline-[#050505]"), &t), Some(vec![decl("outline-color", "#050505")]));

        // An arbitrary LENGTH still resolves to width, unaffected.
        assert_eq!(resolve(&parse_class("border-[3px]"), &t), Some(vec![decl("border-width", "3px")]));
        assert_eq!(resolve(&parse_class("outline-[3px]"), &t), Some(vec![decl("outline-width", "3px")]));
    }

    #[test]
    fn bare_ring_defaults_to_tailwind_v4s_1px_width() {
        // Tailwind v4: bare `ring` is 1px (v3 was 3px), default color currentColor.
        let t = theme();
        assert_eq!(
            resolve(&parse_class("ring"), &t),
            Some(ring_with_width("1px")),
        );
        assert!(RING_SHADOW.ends_with("var(--kb-ring-color, currentColor)"));
    }

    #[test]
    fn resolves_ring_width_inset_and_color() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("ring-2"), &t),
            Some(ring_with_width("2px")),
        );
        // modifier-only utilities set just their variable
        assert_eq!(resolve(&parse_class("ring-inset"), &t), Some(vec![decl("--kb-ring-inset", "inset")]));
        assert_eq!(resolve(&parse_class("ring-blue-6"), &t), Some(vec![decl("--kb-ring-color", "#2563eb")]));
        assert_eq!(resolve(&parse_class("ring-[#f00]"), &t), Some(vec![decl("--kb-ring-color", "#f00")]));
    }

    #[test]
    fn resolves_ring_offset_width_and_color() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("ring-offset-4"), &t),
            Some(vec![decl("--kb-ring-offset-width", "4px"), decl("--kb-ring-offset-shadow", RING_OFFSET_SHADOW)]),
        );
        assert_eq!(resolve(&parse_class("ring-offset-blue-6"), &t), Some(vec![decl("--kb-ring-offset-color", "#2563eb")]));
    }

    #[test]
    fn resolves_border_collapse_and_separate_despite_the_shared_border_prefix() {
        let t = theme();
        assert_eq!(resolve(&parse_class("border-collapse"), &t), Some(vec![decl("border-collapse", "collapse")]));
        assert_eq!(resolve(&parse_class("border-separate"), &t), Some(vec![decl("border-collapse", "separate")]));
    }

    #[test]
    fn resolves_per_side_border_width_style_and_color() {
        let mut t = theme();
        t.spacing.insert("2".to_string(), 2.0);
        assert_eq!(resolve(&parse_class("border-t-2"), &t), Some(vec![decl("border-top-width", "2px")]));
        assert_eq!(resolve(&parse_class("border-r-dashed"), &t), Some(vec![decl("border-right-style", "dashed")]));
        assert_eq!(resolve(&parse_class("border-b-blue-6"), &t), Some(vec![decl("border-bottom-color", "#2563eb")]));
        assert_eq!(resolve(&parse_class("border-l-[3px]"), &t), Some(vec![decl("border-left-width", "3px")]));
    }

    #[test]
    fn resolves_logical_border_sides() {
        let mut t = theme();
        t.spacing.insert("2".to_string(), 2.0);
        assert_eq!(resolve(&parse_class("border-s-2"), &t), Some(vec![decl("border-inline-start-width", "2px")]));
        assert_eq!(resolve(&parse_class("border-e-blue-6"), &t), Some(vec![decl("border-inline-end-color", "#2563eb")]));
    }

    #[test]
    fn resolves_border_x_and_y_axis_shorthands() {
        // No spacing override: border-x-2 is 2px from the default theme.
        // (This test used to insert spacing "2" -> 2px, which is exactly what
        // hid the n * 4px border-width bug.)
        let t = theme();
        assert_eq!(
            resolve(&parse_class("border-x-2"), &t),
            Some(vec![decl("border-left-width", "2px"), decl("border-right-width", "2px")]),
        );
        assert_eq!(
            resolve(&parse_class("border-y-blue-6"), &t),
            Some(vec![decl("border-top-color", "#2563eb"), decl("border-bottom-color", "#2563eb")]),
        );
    }

    #[test]
    fn resolves_double_and_hidden_border_styles() {
        let t = theme();
        assert_eq!(resolve(&parse_class("border-double"), &t), Some(vec![decl("border-style", "double")]));
        assert_eq!(resolve(&parse_class("border-hidden"), &t), Some(vec![decl("border-style", "hidden")]));
    }

    #[test]
    fn resolves_per_corner_and_per_side_radius() {
        let t = theme();
        assert_eq!(resolve(&parse_class("rounded-tl-lg"), &t), Some(vec![decl("border-top-left-radius", "0.5rem")]));
        assert_eq!(
            resolve(&parse_class("rounded-t-full"), &t),
            Some(vec![decl("border-top-left-radius", "9999px"), decl("border-top-right-radius", "9999px")]),
        );
        assert_eq!(
            resolve(&parse_class("rounded-r-none"), &t),
            Some(vec![decl("border-top-right-radius", "0px"), decl("border-bottom-right-radius", "0px")]),
        );
        assert_eq!(resolve(&parse_class("rounded-bl-[6px]"), &t), Some(vec![decl("border-bottom-left-radius", "6px")]));
        // A bare "rounded-t" (no suffix) isn't valid Tailwind either —
        // parses as utility="rounded" value="t", no "t" key in radius_size.
        assert_eq!(resolve(&parse_class("rounded-t"), &t), None);
    }

    #[test]
    fn resolves_logical_per_side_and_per_corner_radius() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("rounded-s-lg"), &t),
            Some(vec![decl("border-start-start-radius", "0.5rem"), decl("border-end-start-radius", "0.5rem")]),
        );
        assert_eq!(
            resolve(&parse_class("rounded-e-full"), &t),
            Some(vec![decl("border-start-end-radius", "9999px"), decl("border-end-end-radius", "9999px")]),
        );
        assert_eq!(resolve(&parse_class("rounded-ss-none"), &t), Some(vec![decl("border-start-start-radius", "0px")]));
        assert_eq!(resolve(&parse_class("rounded-se-lg"), &t), Some(vec![decl("border-start-end-radius", "0.5rem")]));
        assert_eq!(resolve(&parse_class("rounded-ee-lg"), &t), Some(vec![decl("border-end-end-radius", "0.5rem")]));
        assert_eq!(resolve(&parse_class("rounded-es-lg"), &t), Some(vec![decl("border-end-start-radius", "0.5rem")]));
    }

    #[test]
    fn resolves_outline_width_style_color_and_offset() {
        let t = theme();
        // A width alone draws a visible (solid) outline, like Tailwind v4;
        // a style utility changes it through the same variable.
        assert_eq!(
            resolve(&parse_class("outline-2"), &t),
            Some(vec![decl("outline-style", OUTLINE_STYLE_VAR), decl("outline-width", "2px")]),
        );
        assert_eq!(
            resolve(&parse_class("outline-dashed"), &t),
            Some(vec![decl("--kb-outline-style", "dashed"), decl("outline-style", "dashed")]),
        );
        assert_eq!(resolve(&parse_class("outline-blue-6"), &t), Some(vec![decl("outline-color", "#2563eb")]));
        assert_eq!(resolve(&parse_class("outline-offset-4"), &t), Some(vec![decl("outline-offset", "4px")]));
        assert_eq!(resolve(&parse_class("outline-offset-[3px]"), &t), Some(vec![decl("outline-offset", "3px")]));
        // Bare/none: Tailwind v4 values (see resolves_outline_none_despite_the_shared_outline_prefix).
        assert_eq!(
            resolve(&parse_class("outline"), &t),
            Some(vec![decl("outline-style", OUTLINE_STYLE_VAR), decl("outline-width", "1px")]),
        );
        assert_eq!(
            resolve(&parse_class("outline-none"), &t),
            Some(vec![decl("--kb-outline-style", "none"), decl("outline-style", "none")]),
        );
    }

    #[test]
    fn returns_none_for_an_unresolvable_ring_color() {
        let t = theme();
        assert_eq!(resolve(&parse_class("ring-not-a-color"), &t), None);
        assert_eq!(resolve(&parse_class("ring-offset-not-a-color"), &t), None);
    }

    #[test]
    fn resolves_inline_slash_opacity_on_every_border_family_color() {
        let t = theme();
        assert_eq!(resolve(&parse_class("border-blue-6/50"), &t), Some(vec![decl("border-color", "rgba(37,99,235,0.5)")]));
        assert_eq!(
            resolve(&parse_class("border-t-blue-6/50"), &t),
            Some(vec![decl("border-top-color", "rgba(37,99,235,0.5)")]),
        );
        assert_eq!(
            resolve(&parse_class("border-x-blue-6/50"), &t),
            Some(vec![
                decl("border-left-color", "rgba(37,99,235,0.5)"),
                decl("border-right-color", "rgba(37,99,235,0.5)"),
            ]),
        );
        assert_eq!(
            resolve(&parse_class("outline-blue-6/50"), &t),
            Some(vec![decl("outline-color", "rgba(37,99,235,0.5)")]),
        );
        assert_eq!(
            resolve(&parse_class("ring-blue-6/50"), &t),
            Some(vec![decl("--kb-ring-color", "rgba(37,99,235,0.5)")]),
        );
        assert_eq!(
            resolve(&parse_class("ring-offset-blue-6/50"), &t),
            Some(vec![decl("--kb-ring-offset-color", "rgba(37,99,235,0.5)")]),
        );
    }
}
