//! Child-combinator utilities — `divide-x`/`divide-y`/`divide-color-*` style
//! an element's children (`> * + *`), not the element itself, and
//! `space-x`/`space-y` do the same via margins. Structurally distinct from
//! every other resolver: the marker property names below (`__divide-*`,
//! `__space-*`) are translated into real CSS declarations AND trigger the
//! child-combinator selector suffix in `css.rs` — mirroring old-kbach's
//! `__divideX`/`__spaceX` internal marker-key pattern in
//! `old-kbach/src/core/resolver.ts`.
//!
//! Deliberately narrow for this pass: `divide-x`/`divide-y` are standalone
//! (default 1px width only, no `divide-x-2` explicit-width variant yet).

use super::color::lookup_hex;
use super::{decl, resolve_length, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "divide-x" if parsed.value.is_none() => Some(vec![decl("__divide-x-width", "1px")]),
        "divide-y" if parsed.value.is_none() => Some(vec![decl("__divide-y-width", "1px")]),
        "divide-color" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("__divide-color", value)]);
            }
            lookup_hex(theme, value).map(|hex| vec![decl("__divide-color", hex)])
        }
        "space-x" => resolve_length(theme, parsed).map(|v| vec![decl("__space-x", &v)]),
        "space-y" => resolve_length(theme, parsed).map(|v| vec![decl("__space-y", &v)]),
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
        colors.insert("gray-3".to_string(), ColorValue::Plain("#d1d5db".to_string()));
        let mut spacing = HashMap::new();
        spacing.insert("4".to_string(), 16.0);
        ThemeConfig { colors, spacing, ..Default::default() }
    }

    #[test]
    fn divide_x_and_y_are_standalone_1px_defaults() {
        let t = theme();
        assert_eq!(resolve(&parse_class("divide-x"), &t), Some(vec![decl("__divide-x-width", "1px")]));
        assert_eq!(resolve(&parse_class("divide-y"), &t), Some(vec![decl("__divide-y-width", "1px")]));
    }

    #[test]
    fn resolves_divide_color_from_theme() {
        let t = theme();
        assert_eq!(resolve(&parse_class("divide-color-gray-3"), &t), Some(vec![decl("__divide-color", "#d1d5db")]));
    }

    #[test]
    fn resolves_space_x_and_y_from_spacing_scale() {
        let t = theme();
        assert_eq!(resolve(&parse_class("space-x-4"), &t), Some(vec![decl("__space-x", "16px")]));
        assert_eq!(resolve(&parse_class("space-y-4"), &t), Some(vec![decl("__space-y", "16px")]));
    }
}
