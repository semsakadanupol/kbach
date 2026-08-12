use super::{decl, resolve_length, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "p" => resolve_length(theme, parsed).map(|v| vec![decl("padding", &v)]),
        "px" => resolve_length(theme, parsed).map(|v| vec![decl("padding-left", &v), decl("padding-right", &v)]),
        "py" => resolve_length(theme, parsed).map(|v| vec![decl("padding-top", &v), decl("padding-bottom", &v)]),
        "pt" => resolve_length(theme, parsed).map(|v| vec![decl("padding-top", &v)]),
        "pr" => resolve_length(theme, parsed).map(|v| vec![decl("padding-right", &v)]),
        "pb" => resolve_length(theme, parsed).map(|v| vec![decl("padding-bottom", &v)]),
        "pl" => resolve_length(theme, parsed).map(|v| vec![decl("padding-left", &v)]),
        "m" => resolve_length(theme, parsed).map(|v| vec![decl("margin", &v)]),
        "mx" => resolve_length(theme, parsed).map(|v| vec![decl("margin-left", &v), decl("margin-right", &v)]),
        "my" => resolve_length(theme, parsed).map(|v| vec![decl("margin-top", &v), decl("margin-bottom", &v)]),
        "mt" => resolve_length(theme, parsed).map(|v| vec![decl("margin-top", &v)]),
        "mr" => resolve_length(theme, parsed).map(|v| vec![decl("margin-right", &v)]),
        "mb" => resolve_length(theme, parsed).map(|v| vec![decl("margin-bottom", &v)]),
        "ml" => resolve_length(theme, parsed).map(|v| vec![decl("margin-left", &v)]),
        "gap" => resolve_length(theme, parsed).map(|v| vec![decl("gap", &v)]),
        "gap-x" => resolve_length(theme, parsed).map(|v| vec![decl("column-gap", &v)]),
        "gap-y" => resolve_length(theme, parsed).map(|v| vec![decl("row-gap", &v)]),
        "w" => resolve_length(theme, parsed).map(|v| vec![decl("width", &v)]),
        "h" => resolve_length(theme, parsed).map(|v| vec![decl("height", &v)]),
        "min-w" => resolve_length(theme, parsed).map(|v| vec![decl("min-width", &v)]),
        "max-w" => resolve_length(theme, parsed).map(|v| vec![decl("max-width", &v)]),
        "min-h" => resolve_length(theme, parsed).map(|v| vec![decl("min-height", &v)]),
        "max-h" => resolve_length(theme, parsed).map(|v| vec![decl("max-height", &v)]),
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
        spacing.insert("8".to_string(), 32.0);
        ThemeConfig { spacing, ..Default::default() }
    }

    #[test]
    fn resolves_padding_and_margin_shorthands() {
        let t = theme();
        assert_eq!(resolve(&parse_class("p-4"), &t), Some(vec![decl("padding", "16px")]));
        assert_eq!(
            resolve(&parse_class("px-4"), &t),
            Some(vec![decl("padding-left", "16px"), decl("padding-right", "16px")]),
        );
        assert_eq!(resolve(&parse_class("mt-8"), &t), Some(vec![decl("margin-top", "32px")]));
    }

    #[test]
    fn disambiguates_gap_x_gap_y_from_bare_gap() {
        let t = theme();
        assert_eq!(resolve(&parse_class("gap-4"), &t), Some(vec![decl("gap", "16px")]));
        assert_eq!(resolve(&parse_class("gap-x-4"), &t), Some(vec![decl("column-gap", "16px")]));
        assert_eq!(resolve(&parse_class("gap-y-4"), &t), Some(vec![decl("row-gap", "16px")]));
    }

    #[test]
    fn disambiguates_min_max_width_height_from_bare_w_h() {
        let t = theme();
        assert_eq!(resolve(&parse_class("w-4"), &t), Some(vec![decl("width", "16px")]));
        assert_eq!(resolve(&parse_class("min-w-4"), &t), Some(vec![decl("min-width", "16px")]));
        assert_eq!(resolve(&parse_class("max-h-8"), &t), Some(vec![decl("max-height", "32px")]));
    }

    #[test]
    fn resolves_arbitrary_spacing_value() {
        let t = theme();
        assert_eq!(resolve(&parse_class("p-[14px]"), &t), Some(vec![decl("padding", "14px")]));
    }

    #[test]
    fn returns_none_for_a_spacing_key_missing_from_the_theme() {
        let t = theme();
        assert_eq!(resolve(&parse_class("p-99"), &t), None);
    }
}
