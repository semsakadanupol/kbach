use super::{decl, resolve_percent, Declaration};
use crate::parser::ParsedClass;
use crate::theme::{ColorValue, ThemeConfig};

/// Looks up a named theme color as a plain hex string. Mode-aware colors
/// ({ light, dark }) are only ever resolved via `expand_mode_aware_color_classes`
/// BEFORE tokenizing — by the time a class reaches this lookup, a mode-aware
/// name has already been expanded into a literal light/dark class pair, so
/// finding one here directly means it was used some other way this engine
/// doesn't support; treated as unresolvable rather than guessing a mode.
pub(super) fn lookup_hex<'a>(theme: &'a ThemeConfig, key: &str) -> Option<&'a str> {
    match theme.colors.get(key)? {
        ColorValue::Plain(hex) => Some(hex.as_str()),
        ColorValue::ModeAware { .. } => None,
    }
}

fn color_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<String> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(value.to_string());
    }
    lookup_hex(theme, value).map(String::from)
}

fn hex_to_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    match hex.len() {
        6 => Some((
            u8::from_str_radix(&hex[0..2], 16).ok()?,
            u8::from_str_radix(&hex[2..4], 16).ok()?,
            u8::from_str_radix(&hex[4..6], 16).ok()?,
        )),
        3 => {
            let expand = |c: char| u8::from_str_radix(&c.to_string().repeat(2), 16).ok();
            let mut chars = hex.chars();
            Some((expand(chars.next()?)?, expand(chars.next()?)?, expand(chars.next()?)?))
        }
        _ => None,
    }
}

/// Emits an opacity-composable color declaration: a hex value decomposes
/// into `rgba(r,g,b,var(--x-opacity, 1))`, so a sibling `bg-opacity-*` class
/// on the same element can set `--bg-opacity` and compose with it. A
/// non-hex value (an arbitrary CSS keyword/function like "red" or
/// "rgb(...)") can't be decomposed into channels, so it's used as-is —
/// still valid CSS, just not opacity-composable.
fn color_declarations(theme: &ThemeConfig, parsed: &ParsedClass, css_property: &str, opacity_var: &str) -> Option<Vec<Declaration>> {
    let value = color_value(theme, parsed)?;
    if let Some(hex) = value.strip_prefix('#') {
        if let Some((r, g, b)) = hex_to_rgb(hex) {
            return Some(vec![decl(css_property, &format!("rgba({r},{g},{b},var({opacity_var}, 1))"))]);
        }
    }
    Some(vec![decl(css_property, &value)])
}

fn resolve_text(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    // "text-" is genuinely three-way ambiguous (font-size / text-align /
    // color) — size and alignment keywords are checked first since they're
    // a small closed set; anything else falls through to color resolution.
    if !parsed.is_arbitrary {
        if let Some(value) = parsed.value.as_deref() {
            if let Some(size) = super::typography::text_size(value) {
                return Some(vec![decl("font-size", size)]);
            }
            if let Some(align) = super::typography::text_align(value) {
                return Some(vec![decl("text-align", align)]);
            }
        }
    }
    color_declarations(theme, parsed, "color", "--text-opacity")
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "bg" => color_declarations(theme, parsed, "background-color", "--bg-opacity"),
        "text" => resolve_text(parsed, theme),
        "bg-opacity" => resolve_percent(parsed).map(|v| vec![decl("--bg-opacity", &v)]),
        "text-opacity" => resolve_percent(parsed).map(|v| vec![decl("--text-opacity", &v)]),
        _ => None,
    }
}

/// Expands a semantic mode-aware color name (a theme color defined as
/// `{ light, dark }`) into a literal light/dark class pair BEFORE
/// tokenizing — e.g. "bg-surface" -> "bg-[#f9fafb] dark:bg-[#111827]" — so
/// every downstream consumer (the resolver, css.rs's dark-mode selector
/// wrapping) only ever sees plain hex values, never a semantic name needing
/// runtime mode awareness. Mirrors `old-kbach/src/core/modeAwareColors.ts`.
pub fn expand_mode_aware_color_classes(class_string: &str, theme: &ThemeConfig) -> String {
    class_string
        .split_whitespace()
        .map(|token| expand_token(token, theme))
        .collect::<Vec<_>>()
        .join(" ")
}

fn expand_token(token: &str, theme: &ThemeConfig) -> String {
    let mut segments: Vec<&str> = token.split(':').collect();
    let base = segments.pop().unwrap_or(token);
    let modifier_prefix = if segments.is_empty() { String::new() } else { format!("{}:", segments.join(":")) };

    match expand_base(base, theme) {
        Some((light, dark)) => format!("{modifier_prefix}{light} {modifier_prefix}dark:{dark}"),
        None => token.to_string(),
    }
}

fn expand_base(base: &str, theme: &ThemeConfig) -> Option<(String, String)> {
    let (important, rest) = match base.strip_prefix('!') {
        Some(r) => ("!", r),
        None => ("", base),
    };
    for prefix in ["bg-", "text-", "border-"] {
        let Some(value) = rest.strip_prefix(prefix) else { continue };
        if let Some(ColorValue::ModeAware { light, dark }) = theme.colors.get(value) {
            return Some((format!("{important}{prefix}[{light}]"), format!("{important}{prefix}[{dark}]")));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;
    use std::collections::HashMap;

    fn theme_with_colors() -> ThemeConfig {
        let mut colors = HashMap::new();
        colors.insert("blue-6".to_string(), ColorValue::Plain("#2563eb".to_string()));
        colors.insert(
            "surface".to_string(),
            ColorValue::ModeAware { light: "#f9fafb".to_string(), dark: "#111827".to_string() },
        );
        ThemeConfig { colors, ..Default::default() }
    }

    #[test]
    fn resolves_bg_color_as_an_opacity_composable_rgba() {
        let theme = theme_with_colors();
        let decls = resolve(&parse_class("bg-blue-6"), &theme).unwrap();
        assert_eq!(decls, vec![decl("background-color", "rgba(37,99,235,var(--bg-opacity, 1))")]);
    }

    #[test]
    fn resolves_bg_opacity_to_a_custom_property() {
        let theme = theme_with_colors();
        let decls = resolve(&parse_class("bg-opacity-50"), &theme).unwrap();
        assert_eq!(decls, vec![decl("--bg-opacity", "0.5")]);
    }

    #[test]
    fn resolves_text_size_before_falling_back_to_color() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("text-lg"), &theme), Some(vec![decl("font-size", "1.125rem")]));
        assert_eq!(resolve(&parse_class("text-center"), &theme), Some(vec![decl("text-align", "center")]));
        assert_eq!(
            resolve(&parse_class("text-blue-6"), &theme),
            Some(vec![decl("color", "rgba(37,99,235,var(--text-opacity, 1))")]),
        );
    }

    #[test]
    fn non_hex_arbitrary_color_is_used_as_is_without_opacity_composition() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("bg-[red]"), &theme), Some(vec![decl("background-color", "red")]));
    }

    #[test]
    fn expands_a_mode_aware_color_into_a_light_dark_pair() {
        let theme = theme_with_colors();
        let expanded = expand_mode_aware_color_classes("bg-surface p-4", &theme);
        assert_eq!(expanded, "bg-[#f9fafb] dark:bg-[#111827] p-4");
    }

    #[test]
    fn expands_a_mode_aware_color_with_an_existing_modifier_prefix() {
        let theme = theme_with_colors();
        let expanded = expand_mode_aware_color_classes("hover:bg-surface", &theme);
        assert_eq!(expanded, "hover:bg-[#f9fafb] hover:dark:bg-[#111827]");
    }

    #[test]
    fn leaves_a_plain_color_class_unexpanded() {
        let theme = theme_with_colors();
        assert_eq!(expand_mode_aware_color_classes("bg-blue-6", &theme), "bg-blue-6");
    }
}
