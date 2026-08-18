//! Child-combinator utilities — `divide-x`/`divide-y`/`divide-color-*` style
//! an element's children (`> * + *`), not the element itself, and
//! `space-x`/`space-y` do the same via margins. Structurally distinct from
//! every other resolver: the marker property names below (`__divide-*`,
//! `__space-*`) are translated into real CSS declarations AND trigger the
//! child-combinator selector suffix in `css.rs` — mirroring old-kbach's
//! `__divideX`/`__spaceX` internal marker-key pattern in
//! `old-kbach/src/core/resolver.ts`.
//!
//! `divide-x`/`divide-y` support an explicit width (`divide-x-2`) and a
//! `-reverse` modifier (`divide-x-reverse`) alongside their bare 1px
//! default, via the calc()-based CSS-variable technique `css.rs`'s
//! `declarations_to_css` implements for the `__divide-x-width`/
//! `__divide-x-reverse` markers below — see that function's own doc
//! comment for the full reasoning. `space-x`/`space-y` get the identical
//! `-reverse` treatment via the same mechanism.

use super::color::color_value;
use super::{decl, resolve_length, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

/// Shared by divide-x/divide-y: bare (no value) -> 1px default, "reverse"
/// -> the reverse-variable marker, numeric/arbitrary -> an explicit width
/// via the shared spacing scale.
fn divide_width(theme: &ThemeConfig, parsed: &ParsedClass, width_marker: &str, reverse_marker: &str) -> Option<Vec<Declaration>> {
    if parsed.value.is_none() {
        return Some(vec![decl(width_marker, "1px")]);
    }
    if !parsed.is_arbitrary && parsed.value.as_deref() == Some("reverse") {
        return Some(vec![decl(reverse_marker, "1")]);
    }
    resolve_length(theme, parsed).map(|v| vec![decl(width_marker, &v)])
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "divide-x" => divide_width(theme, parsed, "__divide-x-width", "__divide-x-reverse"),
        "divide-y" => divide_width(theme, parsed, "__divide-y-width", "__divide-y-reverse"),
        // color_value's own arbitrary-passthrough and inline `/N`
        // opacity-suffix handling (`divide-blue-6/50`) covers what this
        // arm used to do manually.
        "divide-color" => color_value(theme, parsed).map(|v| vec![decl("__divide-color", &v)]),
        "space-x" if parsed.value.as_deref() == Some("reverse") && !parsed.is_arbitrary => {
            Some(vec![decl("__space-x-reverse", "1")])
        }
        "space-y" if parsed.value.as_deref() == Some("reverse") && !parsed.is_arbitrary => {
            Some(vec![decl("__space-y-reverse", "1")])
        }
        "space-x" => resolve_length(theme, parsed).map(|v| vec![decl("__space-x", &v)]),
        "space-y" => resolve_length(theme, parsed).map(|v| vec![decl("__space-y", &v)]),
        // A plain `border-style` shorthand — harmless on the axis divide-x/
        // divide-y already zeroed the width of, same reasoning real
        // Tailwind's own identically-shaped generated rule relies on. Same
        // "write the base divide-x/-y class before this one" ordering
        // convention `dark:`/`active:` overrides already document
        // elsewhere in this crate (no dedicated cascade sub-tier here).
        "divide-solid" => Some(vec![decl("__divide-style", "solid")]),
        "divide-dashed" => Some(vec![decl("__divide-style", "dashed")]),
        "divide-dotted" => Some(vec![decl("__divide-style", "dotted")]),
        "divide-double" => Some(vec![decl("__divide-style", "double")]),
        "divide-none" => Some(vec![decl("__divide-style", "none")]),
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
    fn resolves_inline_slash_opacity_on_divide_color() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("divide-color-gray-3/50"), &t),
            Some(vec![decl("__divide-color", "rgba(209,213,219,0.5)")]),
        );
    }

    #[test]
    fn resolves_space_x_and_y_from_spacing_scale() {
        let t = theme();
        assert_eq!(resolve(&parse_class("space-x-4"), &t), Some(vec![decl("__space-x", "16px")]));
        assert_eq!(resolve(&parse_class("space-y-4"), &t), Some(vec![decl("__space-y", "16px")]));
    }

    #[test]
    fn resolves_explicit_divide_width_and_reverse() {
        let t = theme();
        assert_eq!(resolve(&parse_class("divide-x-4"), &t), Some(vec![decl("__divide-x-width", "16px")]));
        assert_eq!(resolve(&parse_class("divide-x-reverse"), &t), Some(vec![decl("__divide-x-reverse", "1")]));
        assert_eq!(resolve(&parse_class("divide-y-reverse"), &t), Some(vec![decl("__divide-y-reverse", "1")]));
    }

    #[test]
    fn resolves_space_x_and_y_reverse() {
        let t = theme();
        assert_eq!(resolve(&parse_class("space-x-reverse"), &t), Some(vec![decl("__space-x-reverse", "1")]));
        assert_eq!(resolve(&parse_class("space-y-reverse"), &t), Some(vec![decl("__space-y-reverse", "1")]));
    }

    #[test]
    fn resolves_divide_style_variants() {
        let t = theme();
        assert_eq!(resolve(&parse_class("divide-dashed"), &t), Some(vec![decl("__divide-style", "dashed")]));
        assert_eq!(resolve(&parse_class("divide-double"), &t), Some(vec![decl("__divide-style", "double")]));
        assert_eq!(resolve(&parse_class("divide-none"), &t), Some(vec![decl("__divide-style", "none")]));
    }
}
