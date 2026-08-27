//! `mask-*` utilities — the "core" (non-gradient) subset of Tailwind
//! v4.1/v4.3's mask system: `mask-clip`, `mask-composite`, `mask-image`
//! (`mask-none`/arbitrary only), `mask-mode`, `mask-origin`, `mask-position`,
//! `mask-repeat`, `mask-size`, and SVG `mask-type`.
//!
//! Deliberately does NOT implement the composable gradient-mask sub-system
//! (`mask-linear-*`, `mask-t-*`/`mask-r-*`/`mask-b-*`/`mask-l-*`,
//! `mask-x-*`/`mask-y-*`, `mask-radial-*` + its shape/size/position
//! modifiers, `mask-conic-*`) — that's a genuinely separate, much larger
//! feature (100+ class variants, its own multi-slot CSS-variable-
//! composition architecture, comparable in scope to `background.rs`'s own
//! gradient-stop system) deferred rather than half-built here. A class using
//! one of those tokens simply doesn't resolve — same "explicitly deferred,
//! not silently wrong" category as the native-only gaps `transform.rs`/
//! `grid.rs` already document.
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

use super::{decl, Declaration};
use crate::parser::ParsedClass;

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
