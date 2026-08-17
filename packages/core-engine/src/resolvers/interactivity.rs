//! `resize-*`, `touch-*` (touch-action), `will-change-*`, `sr-only`/
//! `not-sr-only`, and table layout utilities (`border-collapse`/`-separate`,
//! `table-auto`/`-fixed`, `caption-top`/`-bottom`) — the smaller,
//! independent leftovers of Phase 23 that don't share a domain with
//! anything else. `caret`/`accent`/SVG `fill`/`stroke` live in `color.rs`
//! instead (genuinely color-family lookups); `scroll-*`/`snap-*` live in
//! `scroll.rs` (a large enough domain of its own to earn a dedicated file,
//! matching this crate's "no monolith" convention).

use super::{decl, resolve_length, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

fn resize_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "none" => "none",
        "y" => "vertical",
        "x" => "horizontal",
        _ => return None,
    })
}

fn touch_action_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "auto" => "auto",
        "none" => "none",
        "pan-x" => "pan-x",
        "pan-left" => "pan-left",
        "pan-right" => "pan-right",
        "pan-y" => "pan-y",
        "pan-up" => "pan-up",
        "pan-down" => "pan-down",
        "pinch-zoom" => "pinch-zoom",
        "manipulation" => "manipulation",
        _ => return None,
    })
}

fn will_change_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "auto" => "auto",
        "scroll" => "scroll-position",
        "contents" => "contents",
        "transform" => "transform",
        _ => return None,
    })
}

/// The classic visually-hidden-but-screen-reader-visible technique — clips
/// to a 1px box via `clip`/`overflow` rather than `display: none`, which
/// would hide it from assistive tech too. `not-sr-only` reverses every one
/// of these declarations back to a normal in-flow element.
const SR_ONLY: &[(&str, &str)] = &[
    ("position", "absolute"),
    ("width", "1px"),
    ("height", "1px"),
    ("padding", "0"),
    ("margin", "-1px"),
    ("overflow", "hidden"),
    ("clip", "rect(0, 0, 0, 0)"),
    ("white-space", "nowrap"),
    ("border-width", "0"),
];

const NOT_SR_ONLY: &[(&str, &str)] = &[
    ("position", "static"),
    ("width", "auto"),
    ("height", "auto"),
    ("padding", "0"),
    ("margin", "0"),
    ("overflow", "visible"),
    ("clip", "auto"),
    ("white-space", "normal"),
];

fn decls_from(pairs: &[(&str, &str)]) -> Vec<Declaration> {
    pairs.iter().map(|(p, v)| decl(p, v)).collect()
}

fn scheme_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "normal" => "normal",
        "dark" => "dark",
        "light" => "light",
        "light-dark" => "light dark",
        _ => return None,
    })
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        // "appearance-" is a registered VALUE_PREFIXES entry (needed so an
        // arbitrary value would parse at all, even though this scale has no
        // arbitrary form today), so "appearance-none"/"appearance-auto"
        // arrive here as utility="appearance" + a value, not as their own
        // standalone literal utility names.
        "appearance" => match parsed.value.as_deref()? {
            "none" => Some(vec![decl("appearance", "none")]),
            "auto" => Some(vec![decl("appearance", "auto")]),
            _ => None,
        },
        "scheme" => scheme_value(parsed.value.as_deref()?).map(|v| vec![decl("color-scheme", v)]),
        "select-auto" => Some(vec![decl("user-select", "auto")]),
        // Composed via CSS variables (same `var(--kb-x, fallback)` technique
        // `scroll.rs`'s `snap-*`/`border.rs`'s `ring-*` use) rather than
        // writing the `border-spacing` shorthand directly — that shorthand
        // takes BOTH axes at once, so a plain direct write would let
        // whichever of `border-spacing-x-*`/`border-spacing-y-*` sorts last
        // in the stylesheet silently clobber the other axis's contribution
        // instead of composing with it.
        "border-spacing" => {
            let v = resolve_length(theme, parsed)?;
            Some(vec![
                decl("--kb-border-spacing-x", &v),
                decl("--kb-border-spacing-y", &v),
                decl("border-spacing", "var(--kb-border-spacing-x, 0) var(--kb-border-spacing-y, 0)"),
            ])
        }
        "border-spacing-x" => {
            let v = resolve_length(theme, parsed)?;
            Some(vec![
                decl("--kb-border-spacing-x", &v),
                decl("border-spacing", "var(--kb-border-spacing-x, 0) var(--kb-border-spacing-y, 0)"),
            ])
        }
        "border-spacing-y" => {
            let v = resolve_length(theme, parsed)?;
            Some(vec![
                decl("--kb-border-spacing-y", &v),
                decl("border-spacing", "var(--kb-border-spacing-x, 0) var(--kb-border-spacing-y, 0)"),
            ])
        }
        "resize" if parsed.value.is_none() => Some(vec![decl("resize", "both")]),
        "resize" => {
            let value = parsed.value.as_deref()?;
            resize_value(value).map(|v| vec![decl("resize", v)])
        }
        "touch" => {
            let value = parsed.value.as_deref()?;
            touch_action_value(value).map(|v| vec![decl("touch-action", v)])
        }
        "will-change" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("will-change", value)]);
            }
            will_change_value(value).map(|v| vec![decl("will-change", v)])
        }
        "sr-only" => Some(decls_from(SR_ONLY)),
        "not-sr-only" => Some(decls_from(NOT_SR_ONLY)),
        // "border-collapse"/"border-separate" are NOT handled here despite
        // the name — "border-" is already a registered VALUE_PREFIXES
        // catchall (color.rs's border-width/style/color dispatch), so both
        // parse as utility="border" value="collapse"/"separate", the exact
        // same collision class `border.rs`'s own "outline-none" comment
        // documents. Handled in `border::resolve` instead, unreachable from
        // here — kept as a doc note, not a dead match arm, so a future
        // reader searching for "border-collapse" finds an explanation
        // instead of silence.
        "table-auto" => Some(vec![decl("table-layout", "auto")]),
        "table-fixed" => Some(vec![decl("table-layout", "fixed")]),
        "caption-top" => Some(vec![decl("caption-side", "top")]),
        "caption-bottom" => Some(vec![decl("caption-side", "bottom")]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;

    fn theme() -> ThemeConfig {
        let mut spacing = std::collections::HashMap::new();
        spacing.insert("4".to_string(), 16.0);
        ThemeConfig { spacing, ..Default::default() }
    }

    #[test]
    fn resolves_resize_variants() {
        let t = theme();
        assert_eq!(resolve(&parse_class("resize"), &t), Some(vec![decl("resize", "both")]));
        assert_eq!(resolve(&parse_class("resize-none"), &t), Some(vec![decl("resize", "none")]));
        assert_eq!(resolve(&parse_class("resize-y"), &t), Some(vec![decl("resize", "vertical")]));
        assert_eq!(resolve(&parse_class("resize-x"), &t), Some(vec![decl("resize", "horizontal")]));
    }

    #[test]
    fn resolves_touch_action_variants() {
        let t = theme();
        assert_eq!(resolve(&parse_class("touch-none"), &t), Some(vec![decl("touch-action", "none")]));
        assert_eq!(resolve(&parse_class("touch-pan-x"), &t), Some(vec![decl("touch-action", "pan-x")]));
        assert_eq!(resolve(&parse_class("touch-manipulation"), &t), Some(vec![decl("touch-action", "manipulation")]));
    }

    #[test]
    fn resolves_will_change_named_and_arbitrary() {
        let t = theme();
        assert_eq!(resolve(&parse_class("will-change-transform"), &t), Some(vec![decl("will-change", "transform")]));
        assert_eq!(resolve(&parse_class("will-change-scroll"), &t), Some(vec![decl("will-change", "scroll-position")]));
        assert_eq!(resolve(&parse_class("will-change-[top,left]"), &t), Some(vec![decl("will-change", "top,left")]));
    }

    #[test]
    fn resolves_sr_only_and_not_sr_only() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("sr-only"), &t),
            Some(vec![
                decl("position", "absolute"),
                decl("width", "1px"),
                decl("height", "1px"),
                decl("padding", "0"),
                decl("margin", "-1px"),
                decl("overflow", "hidden"),
                decl("clip", "rect(0, 0, 0, 0)"),
                decl("white-space", "nowrap"),
                decl("border-width", "0"),
            ]),
        );
        assert_eq!(resolve(&parse_class("not-sr-only"), &t).unwrap()[0], decl("position", "static"));
    }

    #[test]
    fn resolves_table_layout_utilities() {
        let t = theme();
        // "border-collapse"/"border-separate" are covered by border.rs's own
        // tests, not here — see this file's doc note on why.
        assert_eq!(resolve(&parse_class("table-fixed"), &t), Some(vec![decl("table-layout", "fixed")]));
        assert_eq!(resolve(&parse_class("caption-bottom"), &t), Some(vec![decl("caption-side", "bottom")]));
    }

    #[test]
    fn resolves_appearance_and_color_scheme() {
        let t = theme();
        assert_eq!(resolve(&parse_class("appearance-none"), &t), Some(vec![decl("appearance", "none")]));
        assert_eq!(resolve(&parse_class("appearance-auto"), &t), Some(vec![decl("appearance", "auto")]));
        assert_eq!(resolve(&parse_class("scheme-dark"), &t), Some(vec![decl("color-scheme", "dark")]));
        assert_eq!(resolve(&parse_class("scheme-light-dark"), &t), Some(vec![decl("color-scheme", "light dark")]));
    }

    #[test]
    fn resolves_select_auto() {
        let t = theme();
        assert_eq!(resolve(&parse_class("select-auto"), &t), Some(vec![decl("user-select", "auto")]));
    }

    #[test]
    fn resolves_border_spacing_composed_via_css_variables() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("border-spacing-4"), &t),
            Some(vec![
                decl("--kb-border-spacing-x", "16px"),
                decl("--kb-border-spacing-y", "16px"),
                decl("border-spacing", "var(--kb-border-spacing-x, 0) var(--kb-border-spacing-y, 0)"),
            ]),
        );
        assert_eq!(
            resolve(&parse_class("border-spacing-x-4"), &t),
            Some(vec![
                decl("--kb-border-spacing-x", "16px"),
                decl("border-spacing", "var(--kb-border-spacing-x, 0) var(--kb-border-spacing-y, 0)"),
            ]),
        );
    }

    #[test]
    fn returns_none_for_unknown_utility() {
        let t = theme();
        assert_eq!(resolve(&parse_class("resize-not-a-value"), &t), None);
        assert_eq!(resolve(&parse_class("touch-not-a-value"), &t), None);
    }
}
