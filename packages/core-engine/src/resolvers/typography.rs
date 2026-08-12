use super::{decl, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

/// `pub(super)` — consulted by color.rs's "text-" disambiguation before it
/// falls back to color resolution. Not part of this module's own `resolve`
/// dispatch, since "text" itself is owned by color.rs (see its docs).
pub(super) fn text_size(key: &str) -> Option<&'static str> {
    Some(match key {
        "xs" => "0.75rem",
        "sm" => "0.875rem",
        "base" => "1rem",
        "lg" => "1.125rem",
        "xl" => "1.25rem",
        "2xl" => "1.5rem",
        "3xl" => "1.875rem",
        "4xl" => "2.25rem",
        _ => return None,
    })
}

/// `pub(super)` — consulted by `resolvers::mod`'s native "leading"
/// dispatch. Tailwind's real numeric leading scale (absolute rem lengths,
/// *not* multipliers — `leading-6` is literally `1.5rem`), which is why
/// this converts cleanly through the same px/rem-to-number pipeline as
/// spacing/radius/font-size, unlike the named multiplier keywords
/// (tight/normal/loose/...), which are relative to a companion font-size
/// and stay unresolved. Not part of this module's own web `resolve`
/// dispatch — web's `"leading"` arm is a raw passthrough, untouched here.
pub(super) fn line_height_size(key: &str) -> Option<&'static str> {
    Some(match key {
        "3" => "0.75rem",
        "4" => "1rem",
        "5" => "1.25rem",
        "6" => "1.5rem",
        "7" => "1.75rem",
        "8" => "2rem",
        "9" => "2.25rem",
        "10" => "2.5rem",
        _ => return None,
    })
}

pub(super) fn text_align(key: &str) -> Option<&'static str> {
    Some(match key {
        "left" => "left",
        "center" => "center",
        "right" => "right",
        "justify" => "justify",
        _ => return None,
    })
}

/// `pub(super)` — reused by `resolvers::mod`'s native typography dispatch.
pub(super) fn font_weight(key: &str) -> Option<&'static str> {
    Some(match key {
        "thin" => "100",
        "normal" => "400",
        "medium" => "500",
        "semibold" => "600",
        "bold" => "700",
        "extrabold" => "800",
        _ => return None,
    })
}

pub fn resolve(parsed: &ParsedClass, _theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "font" => {
            let value = parsed.value.as_deref()?;
            font_weight(value).map(|v| vec![decl("font-weight", v)])
        }
        "leading" => parsed.value.as_deref().map(|v| vec![decl("line-height", v)]),
        "tracking" => parsed.value.as_deref().map(|v| vec![decl("letter-spacing", v)]),
        "uppercase" => Some(vec![decl("text-transform", "uppercase")]),
        "lowercase" => Some(vec![decl("text-transform", "lowercase")]),
        "capitalize" => Some(vec![decl("text-transform", "capitalize")]),
        "underline" => Some(vec![decl("text-decoration-line", "underline")]),
        "line-through" => Some(vec![decl("text-decoration-line", "line-through")]),
        "no-underline" => Some(vec![decl("text-decoration-line", "none")]),
        "truncate" => Some(vec![
            decl("overflow", "hidden"),
            decl("text-overflow", "ellipsis"),
            decl("white-space", "nowrap"),
        ]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;

    #[test]
    fn resolves_font_weight() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("font-bold"), &t), Some(vec![decl("font-weight", "700")]));
    }

    #[test]
    fn resolves_text_transform_and_decoration() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("uppercase"), &t), Some(vec![decl("text-transform", "uppercase")]));
        assert_eq!(resolve(&parse_class("underline"), &t), Some(vec![decl("text-decoration-line", "underline")]));
    }

    #[test]
    fn resolves_truncate_to_three_declarations() {
        let t = ThemeConfig::default();
        assert_eq!(
            resolve(&parse_class("truncate"), &t),
            Some(vec![decl("overflow", "hidden"), decl("text-overflow", "ellipsis"), decl("white-space", "nowrap")]),
        );
    }

    #[test]
    fn text_size_and_align_lookup_tables_used_by_color_rs() {
        assert_eq!(text_size("lg"), Some("1.125rem"));
        assert_eq!(text_align("center"), Some("center"));
        assert_eq!(text_size("not-a-size"), None);
    }

    #[test]
    fn line_height_size_resolves_the_numeric_scale() {
        assert_eq!(line_height_size("6"), Some("1.5rem"));
        assert_eq!(line_height_size("10"), Some("2.5rem"));
        assert_eq!(line_height_size("tight"), None);
    }
}
