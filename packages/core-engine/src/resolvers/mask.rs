//! `mask-*` utilities — the "core" (non-gradient) subset of Tailwind
//! v4.1/v4.3's mask system: `mask-clip`, `mask-composite`, `mask-image`
//! (`mask-none`/arbitrary only), `mask-mode`, `mask-origin`, `mask-position`,
//! `mask-repeat`, `mask-size`, and SVG `mask-type`.
//!
//! The composable gradient masks (`mask-linear-*`, `mask-radial-*` and its
//! shape/size/position modifiers, `mask-conic-*`, and the edge masks
//! `mask-{t,r,b,l,x,y}-{from,to}-*`) are `resolve_gradient` at the bottom of
//! this file, a separate entry point because they need the theme (spacing
//! steps and colors).
//!
//! Every mask-* utility here (other than the two arbitrary-only
//! `mask-position-`/`mask-size-` sub-prefixes, which need their own
//! `VALUE_PREFIXES` entries for the same reason `background.rs`'s
//! `bg-position-`/`bg-size-` do — see `parser.rs`'s own comment) dispatches
//! through ONE bare `"mask"` utility name (from the `"mask-"` catchall
//! prefix), disambiguated by matching on the VALUE string — the same shape
//! `color.rs`'s `"bg"`/`"border"` catchalls already use for their own
//! multi-property ambiguity.
//!
//! Web-only by construction, same as `filters.rs`/`transform.rs` — React
//! Native has no CSS mask concept at all.

use super::color::color_value;
use super::{decl, spacing_px, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

fn clip_or_origin_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "border" => "border-box",
        "padding" => "padding-box",
        "content" => "content-box",
        "fill" => "fill-box",
        "stroke" => "stroke-box",
        "view" => "view-box",
        _ => return None,
    })
}

fn composite_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "add" => "add",
        "subtract" => "subtract",
        "intersect" => "intersect",
        "exclude" => "exclude",
        _ => return None,
    })
}

fn mode_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "alpha" => "alpha",
        "luminance" => "luminance",
        "match" => "match-source",
        _ => return None,
    })
}

fn repeat_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "repeat" => "repeat",
        "no-repeat" => "no-repeat",
        "repeat-x" => "repeat-x",
        "repeat-y" => "repeat-y",
        "repeat-space" => "space",
        "repeat-round" => "round",
        _ => return None,
    })
}

fn size_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "auto" => "auto",
        "cover" => "cover",
        "contain" => "contain",
        _ => return None,
    })
}

/// Same 9-cell keyword table `transform.rs`'s `ORIGIN_KEYWORDS` uses for
/// `transform-origin`/`perspective-origin` — `mask-position` shares the
/// identical named-position vocabulary real Tailwind gives every
/// position-family property.
const POSITION_KEYWORDS: &[(&str, &str)] = &[
    ("top-left", "top left"),
    ("top", "top"),
    ("top-right", "top right"),
    ("left", "left"),
    ("center", "center"),
    ("right", "right"),
    ("bottom-left", "bottom left"),
    ("bottom", "bottom"),
    ("bottom-right", "bottom right"),
];

/// Dispatches every non-arbitrary-sub-prefix `mask-*` value — checked in an
/// order chosen so no value string can be mistaken for a different
/// property's keyword (e.g. `composite_value`/`mode_value`/`repeat_value`/
/// `size_value`'s tables never share a key, and the two `"type-"`-prefixed
/// mask-type values are checked before the bare `mode_value` table so
/// `"type-alpha"` never gets read as `mode_value`'s own `"alpha"`).
fn resolve_mask_value(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    if parsed.is_arbitrary {
        return Some(vec![decl("mask-image", parsed.value.as_deref()?)]);
    }
    let value = parsed.value.as_deref()?;

    if value == "none" {
        return Some(vec![decl("mask-image", "none")]);
    }
    if let Some(rest) = value.strip_prefix("clip-") {
        return clip_or_origin_value(rest).map(|v| vec![decl("mask-clip", v)]);
    }
    if value == "no-clip" {
        return Some(vec![decl("mask-clip", "no-clip")]);
    }
    if let Some(v) = composite_value(value) {
        return Some(vec![decl("mask-composite", v)]);
    }
    if value == "type-alpha" {
        return Some(vec![decl("mask-type", "alpha")]);
    }
    if value == "type-luminance" {
        return Some(vec![decl("mask-type", "luminance")]);
    }
    if let Some(v) = mode_value(value) {
        return Some(vec![decl("mask-mode", v)]);
    }
    if let Some(rest) = value.strip_prefix("origin-") {
        return clip_or_origin_value(rest).map(|v| vec![decl("mask-origin", v)]);
    }
    if let Some(v) = repeat_value(value) {
        return Some(vec![decl("mask-repeat", v)]);
    }
    if let Some(v) = size_value(value) {
        return Some(vec![decl("mask-size", v)]);
    }
    if let Some((_, v)) = POSITION_KEYWORDS.iter().find(|(k, _)| *k == value) {
        return Some(vec![decl("mask-position", v)]);
    }
    None
}

pub fn resolve(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "mask-position" if parsed.is_arbitrary => Some(vec![decl("mask-position", parsed.value.as_deref()?)]),
        "mask-size" if parsed.is_arbitrary => Some(vec![decl("mask-size", parsed.value.as_deref()?)]),
        "mask" => resolve_mask_value(parsed),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;

    #[test]
    fn resolves_mask_none_and_arbitrary_mask_image() {
        assert_eq!(resolve(&parse_class("mask-none")), Some(vec![decl("mask-image", "none")]));
        assert_eq!(
            resolve(&parse_class("mask-[url(/circle.png)]")),
            Some(vec![decl("mask-image", "url(/circle.png)")]),
        );
    }

    #[test]
    fn resolves_mask_clip_and_no_clip() {
        assert_eq!(resolve(&parse_class("mask-clip-border")), Some(vec![decl("mask-clip", "border-box")]));
        assert_eq!(resolve(&parse_class("mask-clip-view")), Some(vec![decl("mask-clip", "view-box")]));
        assert_eq!(resolve(&parse_class("mask-no-clip")), Some(vec![decl("mask-clip", "no-clip")]));
    }

    #[test]
    fn resolves_mask_composite() {
        assert_eq!(resolve(&parse_class("mask-add")), Some(vec![decl("mask-composite", "add")]));
        assert_eq!(resolve(&parse_class("mask-subtract")), Some(vec![decl("mask-composite", "subtract")]));
        assert_eq!(resolve(&parse_class("mask-intersect")), Some(vec![decl("mask-composite", "intersect")]));
        assert_eq!(resolve(&parse_class("mask-exclude")), Some(vec![decl("mask-composite", "exclude")]));
    }

    #[test]
    fn resolves_mask_mode_and_mask_type_without_colliding() {
        assert_eq!(resolve(&parse_class("mask-alpha")), Some(vec![decl("mask-mode", "alpha")]));
        assert_eq!(resolve(&parse_class("mask-luminance")), Some(vec![decl("mask-mode", "luminance")]));
        assert_eq!(resolve(&parse_class("mask-match")), Some(vec![decl("mask-mode", "match-source")]));
        // "type-alpha"/"type-luminance" are a DIFFERENT property (SVG
        // mask-type) from the bare "alpha"/"luminance" mask-mode values
        // above — regression guard against the two tables colliding.
        assert_eq!(resolve(&parse_class("mask-type-alpha")), Some(vec![decl("mask-type", "alpha")]));
        assert_eq!(resolve(&parse_class("mask-type-luminance")), Some(vec![decl("mask-type", "luminance")]));
    }

    #[test]
    fn resolves_mask_origin() {
        assert_eq!(resolve(&parse_class("mask-origin-padding")), Some(vec![decl("mask-origin", "padding-box")]));
        assert_eq!(resolve(&parse_class("mask-origin-fill")), Some(vec![decl("mask-origin", "fill-box")]));
    }

    #[test]
    fn resolves_mask_repeat_variants() {
        assert_eq!(resolve(&parse_class("mask-repeat")), Some(vec![decl("mask-repeat", "repeat")]));
        assert_eq!(resolve(&parse_class("mask-no-repeat")), Some(vec![decl("mask-repeat", "no-repeat")]));
        assert_eq!(resolve(&parse_class("mask-repeat-x")), Some(vec![decl("mask-repeat", "repeat-x")]));
        assert_eq!(resolve(&parse_class("mask-repeat-space")), Some(vec![decl("mask-repeat", "space")]));
        assert_eq!(resolve(&parse_class("mask-repeat-round")), Some(vec![decl("mask-repeat", "round")]));
    }

    #[test]
    fn resolves_mask_size_named_and_arbitrary() {
        assert_eq!(resolve(&parse_class("mask-auto")), Some(vec![decl("mask-size", "auto")]));
        assert_eq!(resolve(&parse_class("mask-cover")), Some(vec![decl("mask-size", "cover")]));
        assert_eq!(resolve(&parse_class("mask-contain")), Some(vec![decl("mask-size", "contain")]));
        assert_eq!(resolve(&parse_class("mask-size-[auto_100px]")), Some(vec![decl("mask-size", "auto 100px")]));
    }

    #[test]
    fn resolves_mask_position_named_and_arbitrary() {
        assert_eq!(resolve(&parse_class("mask-center")), Some(vec![decl("mask-position", "center")]));
        assert_eq!(resolve(&parse_class("mask-top-left")), Some(vec![decl("mask-position", "top left")]));
        assert_eq!(
            resolve(&parse_class("mask-position-[center_top_1rem]")),
            Some(vec![decl("mask-position", "center top 1rem")]),
        );
    }

    #[test]
    fn returns_none_for_the_deferred_gradient_mask_subsystem() {
        // mask-linear-*/mask-t-*/mask-radial-*/mask-conic-* etc. are
        // explicitly out of scope — confirmed unresolved, not silently wrong.
        assert_eq!(resolve(&parse_class("mask-t-from-50%")), None);
        assert_eq!(resolve(&parse_class("mask-radial-from-10%")), None);
        assert_eq!(resolve(&parse_class("mask-circle")), None);
    }

    #[test]
    fn returns_none_for_unknown_mask_utility() {
        assert_eq!(resolve(&parse_class("not-a-mask-utility")), None);
    }
}

// ---------------------------------------------------------------------------
// Gradient masks (Tailwind v4.1): mask-linear-*, mask-radial-*, mask-conic-*,
// and the edge masks mask-{t,r,b,l,x,y}-{from,to}-*.
//
// Same three-layer design as Tailwind: `mask-image` is always the
// intersection of a linear, a radial and a conic layer, each a fully opaque
// `linear-gradient(#fff, #fff)` until a utility sets it. The edge masks feed
// the linear layer (one gradient per side, intersected). Every variable a
// value reads carries Tailwind's `@property` initial value as its `var()`
// fallback, since this engine emits no `@property` rules: from-color black,
// to-color transparent, from 0%, to 100%, shape ellipse, size
// farthest-corner, position center, angle 0deg.
// ---------------------------------------------------------------------------

const MASK_OPAQUE: &str = "linear-gradient(#fff, #fff)";

fn mask_image() -> String {
    format!("var(--kb-mask-linear, {MASK_OPAQUE}), var(--kb-mask-radial, {MASK_OPAQUE}), var(--kb-mask-conic, {MASK_OPAQUE})")
}

/// `mask-image` + `mask-composite`, then the utility's own variables.
fn with_mask_image(vars: Vec<Declaration>) -> Vec<Declaration> {
    let mut decls = vec![decl("mask-image", &mask_image()), decl("mask-composite", "intersect")];
    decls.extend(vars);
    decls
}

/// The from/to stop pair every gradient layer uses, for variable prefix
/// `--kb-mask-<layer>` (e.g. `--kb-mask-linear`, `--kb-mask-top`).
fn stop_pair(prefix: &str) -> String {
    format!(
        "var({prefix}-from-color, black) var({prefix}-from-position, 0%), var({prefix}-to-color, transparent) var({prefix}-to-position, 100%)"
    )
}

/// What a `from-*`/`to-*` stop value sets: a position (`50%`, a spacing step
/// like `10`, `px`) or a color (`black`, `blue-6`, `blue-6/50`).
enum MaskStop {
    Position(String),
    Color(String),
}

fn mask_stop(theme: &ThemeConfig, parsed: &ParsedClass, raw: &str) -> Option<MaskStop> {
    // Arbitrary stop values aren't supported in this compound form (they'd
    // bypass the parser's arbitrary-value safety check).
    if raw.is_empty() || raw.contains('[') {
        return None;
    }
    if let Some(n) = raw.strip_suffix('%') {
        return n.parse::<f64>().ok().filter(|n| *n >= 0.0).map(|_| MaskStop::Position(raw.to_string()));
    }
    if let Some(px) = spacing_px(theme, raw) {
        return Some(MaskStop::Position(format!("{px}px")));
    }
    let mut as_color = parsed.clone();
    as_color.value = Some(raw.to_string());
    as_color.is_arbitrary = false;
    color_value(theme, &as_color).map(MaskStop::Color)
}

/// `--kb-mask-<layer>-<from|to>-<position|color>: <value>`.
fn stop_var(prefix: &str, end: &str, stop: MaskStop) -> Declaration {
    match stop {
        MaskStop::Position(p) => decl(&format!("{prefix}-{end}-position"), &p),
        MaskStop::Color(c) => decl(&format!("{prefix}-{end}-color"), &c),
    }
}

/// `mask-t-from-50%`, `mask-x-to-blue-6`, … — one linear-gradient per side.
fn edge_mask(theme: &ThemeConfig, parsed: &ParsedClass, sides: &[&str], end: &str, raw: &str) -> Option<Vec<Declaration>> {
    let mut vars = vec![decl(
        "--kb-mask-linear",
        &format!(
            "var(--kb-mask-left, {MASK_OPAQUE}), var(--kb-mask-right, {MASK_OPAQUE}), var(--kb-mask-bottom, {MASK_OPAQUE}), var(--kb-mask-top, {MASK_OPAQUE})"
        ),
    )];
    for side in sides {
        let prefix = format!("--kb-mask-{side}");
        vars.push(decl(&prefix, &format!("linear-gradient(to {side}, {})", stop_pair(&prefix))));
        vars.push(stop_var(&prefix, end, mask_stop(theme, parsed, raw)?));
    }
    Some(with_mask_image(vars))
}

/// `calc(1deg * N)` for a whole-number angle, negated by a leading `-`.
fn mask_angle(parsed: &ParsedClass, raw: &str) -> Option<String> {
    if raw.is_empty() || !raw.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some(format!("calc(1deg * {}{raw})", if parsed.negative { "-" } else { "" }))
}

const RADIAL_SIZES: &[&str] = &["closest-side", "closest-corner", "farthest-side", "farthest-corner"];

/// Every gradient-mask value (`parsed.value` after the `mask-` prefix).
/// Web-only, like the rest of this module.
pub fn resolve_gradient(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    if parsed.utility != "mask" || parsed.is_arbitrary {
        return None;
    }
    let value = parsed.value.as_deref()?;

    if value == "circle" || value == "ellipse" {
        return Some(vec![decl("--kb-mask-radial-shape", value)]);
    }
    if let Some(rest) = value.strip_prefix("radial-at-") {
        let (_, pos) = POSITION_KEYWORDS.iter().find(|(k, _)| *k == rest)?;
        return Some(vec![decl("--kb-mask-radial-position", pos)]);
    }
    if let Some(size) = value.strip_prefix("radial-") {
        if RADIAL_SIZES.contains(&size) {
            return Some(vec![decl("--kb-mask-radial-size", size)]);
        }
    }

    // Edge masks: <side>-<from|to>-<stop>
    for (key, sides) in [
        ("t", &["top"][..]),
        ("r", &["right"][..]),
        ("b", &["bottom"][..]),
        ("l", &["left"][..]),
        ("x", &["right", "left"][..]),
        ("y", &["top", "bottom"][..]),
    ] {
        for end in ["from", "to"] {
            if let Some(raw) = value.strip_prefix(&format!("{key}-{end}-")) {
                return edge_mask(theme, parsed, sides, end, raw);
            }
        }
    }

    // Layer gradients: linear-*, radial-*, conic-*
    for layer in ["linear", "radial", "conic"] {
        let Some(rest) = value.strip_prefix(&format!("{layer}-")) else { continue };
        let prefix = format!("--kb-mask-{layer}");
        for end in ["from", "to"] {
            if let Some(raw) = rest.strip_prefix(&format!("{end}-")) {
                let stops = match layer {
                    "linear" => format!("var(--kb-mask-linear-position, 0deg), {}", stop_pair(&prefix)),
                    "radial" => format!(
                        "var(--kb-mask-radial-shape, ellipse) var(--kb-mask-radial-size, farthest-corner) at var(--kb-mask-radial-position, center), {}",
                        stop_pair(&prefix)
                    ),
                    _ => format!("from var(--kb-mask-conic-position, 0deg), {}", stop_pair(&prefix)),
                };
                let func = if layer == "conic" { "conic" } else { layer };
                return Some(with_mask_image(vec![
                    decl(&format!("{prefix}-stops"), &stops),
                    decl(&prefix, &format!("{func}-gradient(var({prefix}-stops))")),
                    stop_var(&prefix, end, mask_stop(theme, parsed, raw)?),
                ]));
            }
        }
        // `mask-linear-45` / `-mask-conic-90`: the layer's angle.
        if layer != "radial" {
            let angle = mask_angle(parsed, rest)?;
            return Some(with_mask_image(vec![
                decl(&prefix, &format!("{layer}-gradient(var({prefix}-stops, var({prefix}-position, 0deg)))")),
                decl(&format!("{prefix}-position"), &angle),
            ]));
        }
    }
    None
}

#[cfg(test)]
mod gradient_tests {
    use super::*;
    use crate::parser::parse_class;
    use crate::theme::ColorValue;

    fn theme() -> ThemeConfig {
        let mut t = ThemeConfig::default();
        t.colors.insert("black".to_string(), ColorValue::Plain("#000".to_string()));
        t.colors.insert("blue-6".to_string(), ColorValue::Plain("#2563eb".to_string()));
        t
    }
    fn get(class: &str) -> Vec<Declaration> {
        resolve_gradient(&parse_class(class), &theme()).unwrap_or_else(|| panic!("{class} should resolve"))
    }
    fn has(class: &str, property: &str, value: &str) -> bool {
        get(class).contains(&decl(property, value))
    }

    #[test]
    fn edge_masks_build_one_gradient_per_side_with_tailwinds_defaults() {
        let d = get("mask-t-from-50%");
        assert_eq!(d[0], decl("mask-image", &mask_image()));
        assert_eq!(d[1], decl("mask-composite", "intersect"));
        assert!(has("mask-t-from-50%", "--kb-mask-top-from-position", "50%"));
        assert!(has(
            "mask-t-from-50%",
            "--kb-mask-top",
            "linear-gradient(to top, var(--kb-mask-top-from-color, black) var(--kb-mask-top-from-position, 0%), var(--kb-mask-top-to-color, transparent) var(--kb-mask-top-to-position, 100%))"
        ));
        // spacing-scale step and color stops
        assert!(has("mask-b-to-20", "--kb-mask-bottom-to-position", "80px"));
        assert!(has("mask-l-from-blue-6", "--kb-mask-left-from-color", "#2563eb"));
        // x / y set both sides
        assert!(has("mask-x-from-10", "--kb-mask-right-from-position", "40px") && has("mask-x-from-10", "--kb-mask-left-from-position", "40px"));
        assert!(has("mask-y-to-0%", "--kb-mask-top-to-position", "0%") && has("mask-y-to-0%", "--kb-mask-bottom-to-position", "0%"));
    }

    #[test]
    fn linear_radial_and_conic_layers() {
        assert!(has("mask-linear-45", "--kb-mask-linear-position", "calc(1deg * 45)"));
        assert!(has("-mask-linear-45", "--kb-mask-linear-position", "calc(1deg * -45)"));
        assert!(has("mask-linear-from-20", "--kb-mask-linear-from-position", "80px"));
        assert!(has("mask-linear-to-black", "--kb-mask-linear-to-color", "#000"));
        assert!(has("mask-radial-from-10%", "--kb-mask-radial", "radial-gradient(var(--kb-mask-radial-stops))"));
        assert!(has("mask-conic-90", "--kb-mask-conic", "conic-gradient(var(--kb-mask-conic-stops, var(--kb-mask-conic-position, 0deg)))"));
        assert!(has("mask-conic-from-10", "--kb-mask-conic-from-position", "40px"));
        assert_eq!(get("mask-radial-at-top-left"), vec![decl("--kb-mask-radial-position", "top left")]);
        assert_eq!(get("mask-radial-closest-side"), vec![decl("--kb-mask-radial-size", "closest-side")]);
        assert_eq!(get("mask-circle"), vec![decl("--kb-mask-radial-shape", "circle")]);
    }

    #[test]
    fn rejects_values_that_are_not_stops() {
        for class in ["mask-t-from-[20px]", "mask-linear-from-notacolor", "mask-linear-abc", "mask-radial-at-nowhere", "mask-q-from-10"] {
            assert_eq!(resolve_gradient(&parse_class(class), &theme()), None, "{class}");
        }
        // the existing non-gradient mask utilities are untouched
        assert_eq!(resolve_gradient(&parse_class("mask-none"), &theme()), None);
    }
}
