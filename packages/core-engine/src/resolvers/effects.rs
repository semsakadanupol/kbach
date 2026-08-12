use super::{decl, resolve_percent, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

fn shadow_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "sm" => "0 1px 2px rgba(0,0,0,0.05)",
        "md" => "0 4px 6px rgba(0,0,0,0.1)",
        "lg" => "0 10px 15px rgba(0,0,0,0.1)",
        "none" => "none",
        _ => return None,
    })
}

fn ease_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "linear" => "linear",
        "in" => "cubic-bezier(0.4, 0, 1, 1)",
        "out" => "cubic-bezier(0, 0, 0.2, 1)",
        "in-out" => "cubic-bezier(0.4, 0, 0.2, 1)",
        _ => return None,
    })
}

pub fn resolve(parsed: &ParsedClass, _theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "shadow" if parsed.value.is_none() => shadow_value("md").map(|v| vec![decl("box-shadow", v)]),
        "shadow" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("box-shadow", value)]);
            }
            shadow_value(value).map(|v| vec![decl("box-shadow", v)])
        }
        "opacity" => resolve_percent(parsed).map(|v| vec![decl("opacity", &v)]),
        "transition" if parsed.value.is_none() => Some(vec![decl("transition-property", "all")]),
        "duration" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("transition-duration", value)]);
            }
            Some(vec![decl("transition-duration", &format!("{value}ms"))])
        }
        "delay" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("transition-delay", value)]);
            }
            Some(vec![decl("transition-delay", &format!("{value}ms"))])
        }
        "ease" => {
            let value = parsed.value.as_deref()?;
            ease_value(value).map(|v| vec![decl("transition-timing-function", v)])
        }
        "cursor" => parsed.value.as_deref().map(|v| vec![decl("cursor", v)]),
        "select-none" => Some(vec![decl("user-select", "none")]),
        "select-text" => Some(vec![decl("user-select", "text")]),
        "select-all" => Some(vec![decl("user-select", "all")]),
        "pointer-events-none" => Some(vec![decl("pointer-events", "none")]),
        "pointer-events-auto" => Some(vec![decl("pointer-events", "auto")]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;

    #[test]
    fn bare_shadow_defaults_to_medium() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("shadow"), &t), Some(vec![decl("box-shadow", shadow_value("md").unwrap())]));
    }

    #[test]
    fn resolves_opacity_percentage_to_decimal() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("opacity-50"), &t), Some(vec![decl("opacity", "0.5")]));
    }

    #[test]
    fn resolves_duration_with_auto_appended_ms() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("duration-300"), &t), Some(vec![decl("transition-duration", "300ms")]));
    }

    #[test]
    fn arbitrary_duration_is_passed_through_without_double_unit() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("duration-[0.3s]"), &t), Some(vec![decl("transition-duration", "0.3s")]));
    }

    #[test]
    fn resolves_cursor_and_select_utilities() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("cursor-pointer"), &t), Some(vec![decl("cursor", "pointer")]));
        assert_eq!(resolve(&parse_class("select-none"), &t), Some(vec![decl("user-select", "none")]));
    }
}
