use super::{decl, resolve_length, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "flex" if parsed.value.is_none() => Some(vec![decl("display", "flex")]),
        "flex-row" => Some(vec![decl("flex-direction", "row")]),
        "flex-col" => Some(vec![decl("flex-direction", "column")]),
        "flex-wrap" => Some(vec![decl("flex-wrap", "wrap")]),
        "flex-nowrap" => Some(vec![decl("flex-wrap", "nowrap")]),
        "grid" => Some(vec![decl("display", "grid")]),
        "block" => Some(vec![decl("display", "block")]),
        "inline-block" => Some(vec![decl("display", "inline-block")]),
        "inline" => Some(vec![decl("display", "inline")]),
        "hidden" => Some(vec![decl("display", "none")]),
        "items-center" => Some(vec![decl("align-items", "center")]),
        "items-start" => Some(vec![decl("align-items", "flex-start")]),
        "items-end" => Some(vec![decl("align-items", "flex-end")]),
        "items-stretch" => Some(vec![decl("align-items", "stretch")]),
        "justify-center" => Some(vec![decl("justify-content", "center")]),
        "justify-start" => Some(vec![decl("justify-content", "flex-start")]),
        "justify-end" => Some(vec![decl("justify-content", "flex-end")]),
        "justify-between" => Some(vec![decl("justify-content", "space-between")]),
        "justify-around" => Some(vec![decl("justify-content", "space-around")]),
        "self-center" => Some(vec![decl("align-self", "center")]),
        "self-start" => Some(vec![decl("align-self", "flex-start")]),
        "self-end" => Some(vec![decl("align-self", "flex-end")]),
        "overflow-hidden" => Some(vec![decl("overflow", "hidden")]),
        "overflow-auto" => Some(vec![decl("overflow", "auto")]),
        "overflow-scroll" => Some(vec![decl("overflow", "scroll")]),
        "overflow-visible" => Some(vec![decl("overflow", "visible")]),
        "static" => Some(vec![decl("position", "static")]),
        "relative" => Some(vec![decl("position", "relative")]),
        "absolute" => Some(vec![decl("position", "absolute")]),
        "fixed" => Some(vec![decl("position", "fixed")]),
        "sticky" => Some(vec![decl("position", "sticky")]),
        // z-index is unitless — a raw value passthrough, not a spacing length.
        "z" => parsed.value.as_deref().map(|v| vec![decl("z-index", v)]),
        "top" => resolve_length(theme, parsed).map(|v| vec![decl("top", &v)]),
        "right" => resolve_length(theme, parsed).map(|v| vec![decl("right", &v)]),
        "bottom" => resolve_length(theme, parsed).map(|v| vec![decl("bottom", &v)]),
        "left" => resolve_length(theme, parsed).map(|v| vec![decl("left", &v)]),
        "inset" => resolve_length(theme, parsed).map(|v| vec![decl("inset", &v)]),
        "aspect-square" => Some(vec![decl("aspect-ratio", "1 / 1")]),
        "aspect-video" => Some(vec![decl("aspect-ratio", "16 / 9")]),
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
    fn resolves_display_utilities() {
        let t = theme();
        assert_eq!(resolve(&parse_class("flex"), &t), Some(vec![decl("display", "flex")]));
        assert_eq!(resolve(&parse_class("hidden"), &t), Some(vec![decl("display", "none")]));
        assert_eq!(resolve(&parse_class("grid"), &t), Some(vec![decl("display", "grid")]));
    }

    #[test]
    fn resolves_inset_from_spacing_scale() {
        let t = theme();
        assert_eq!(resolve(&parse_class("top-4"), &t), Some(vec![decl("top", "16px")]));
    }

    #[test]
    fn resolves_z_index_as_a_raw_unitless_value() {
        let t = theme();
        assert_eq!(resolve(&parse_class("z-50"), &t), Some(vec![decl("z-index", "50")]));
    }

    #[test]
    fn resolves_arbitrary_inset_value() {
        let t = theme();
        assert_eq!(resolve(&parse_class("top-[10vh]"), &t), Some(vec![decl("top", "10vh")]));
    }

    #[test]
    fn returns_none_for_unknown_utility() {
        let t = theme();
        assert_eq!(resolve(&parse_class("not-a-layout-utility"), &t), None);
    }
}
