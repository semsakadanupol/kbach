use super::color::lookup_hex;
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
        "sm" => "0.125rem",
        "md" => "0.375rem",
        "lg" => "0.5rem",
        "xl" => "0.75rem",
        "2xl" => "1rem",
        "3xl" => "1.5rem",
        "full" => "9999px",
        _ => return None,
    })
}

/// "border-*" is three-way ambiguous, same shape as "text-*" in color.rs:
/// a number means border-width, a known keyword means border-style,
/// anything else is treated as a color name/arbitrary value.
fn border_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;

    if parsed.is_arbitrary {
        return Some(vec![decl("border-width", value)]);
    }
    if value.parse::<f64>().is_ok() {
        return resolve_length(theme, parsed).map(|v| vec![decl("border-width", &v)]);
    }
    if matches!(value, "solid" | "dashed" | "dotted" | "none") {
        return Some(vec![decl("border-style", value)]);
    }

    lookup_hex(theme, value).map(|hex| vec![decl("border-color", hex)])
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "border" if parsed.value.is_none() => Some(vec![decl("border-width", "1px"), decl("border-style", "solid")]),
        "border" => border_value(theme, parsed),
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
        "ring" if parsed.value.is_none() => Some(vec![decl("box-shadow", "0 0 0 3px rgba(59,130,246,0.5)")]),
        "outline" if parsed.value.is_none() => Some(vec![decl("outline-style", "solid")]),
        // "outline-none" parses as utility="outline", value="none" — "outline-"
        // is a VALUE_PREFIXES entry, so the standalone-name match above never
        // actually fires for it (the same class of bug isSafeArbitraryValue's
        // sibling checks exist to catch — see parser.rs's module docs).
        "outline" if parsed.value.as_deref() == Some("none") => Some(vec![decl("outline", "none")]),
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
    fn resolves_outline_none_despite_the_shared_outline_prefix() {
        let t = theme();
        assert_eq!(resolve(&parse_class("outline-none"), &t), Some(vec![decl("outline", "none")]));
        assert_eq!(resolve(&parse_class("outline"), &t), Some(vec![decl("outline-style", "solid")]));
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
}
