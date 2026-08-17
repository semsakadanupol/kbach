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

/// Known CSS length/size unit suffixes — used only to disambiguate an
/// ARBITRARY `text-[...]` value between font-size and color (see
/// `resolve_text`'s doc comment); not a general-purpose CSS value
/// validator, and deliberately not exhaustive of every possible length
/// unit (`cm`/`mm`/`in`/`pt`/`pc`/`ch`/`ex`/`vmin`/`vmax` are real CSS units
/// too, just far rarer in a Tailwind `text-*` value than the ones below).
const LENGTH_UNITS: &[&str] = &["px", "rem", "em", "%", "vh", "vw"];

/// True if `value` looks like a CSS length (a number, optionally with a
/// known unit suffix like "20px"/"1.5rem"/"100%") rather than a color. Used
/// ONLY for arbitrary `text-[...]` disambiguation — a real color never
/// parses as a bare number or number+length-unit, so this is safe without
/// needing full CSS-value-type inference.
fn looks_like_length(value: &str) -> bool {
    let without_unit = LENGTH_UNITS.iter().find_map(|u| value.strip_suffix(u)).unwrap_or(value);
    without_unit.parse::<f64>().is_ok()
}

fn resolve_text(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    // "text-" is genuinely ambiguous (font-size / text-align / text-wrap /
    // text-overflow / bare-"shadow" / color) — size, alignment, wrap, and
    // overflow keywords are checked first since they're small closed sets;
    // anything else falls through to color resolution. Bare "text-shadow"
    // (no dash, meaning no explicit tier) parses as utility="text"
    // value="shadow" via this module's own "text-" catchall prefix —
    // "text-shadow-" (WITH a dash) is a genuinely different, dedicated
    // utility name handled by effects::resolve, unreachable from here.
    if !parsed.is_arbitrary {
        if let Some(value) = parsed.value.as_deref() {
            if let Some(size) = super::typography::text_size(value) {
                return Some(vec![decl("font-size", size)]);
            }
            if let Some(align) = super::typography::text_align(value) {
                return Some(vec![decl("text-align", align)]);
            }
            if let Some(wrap) = super::typography::text_wrap(value) {
                return Some(vec![decl("text-wrap", wrap)]);
            }
            if value == "shadow" {
                return Some(vec![decl("text-shadow", super::effects::text_shadow_default())]);
            }
            if value == "ellipsis" {
                return Some(vec![decl("text-overflow", "ellipsis")]);
            }
            if value == "clip" {
                return Some(vec![decl("text-overflow", "clip")]);
            }
        }
    } else if let Some(value) = parsed.value.as_deref() {
        // Regression guard: an arbitrary "text-[20px]" used to always fall
        // through to color resolution (is_arbitrary skipped every check
        // above unconditionally), silently treating a font-size as a color
        // instead. A real color value never parses as a bare number or a
        // number+known-length-unit, so this check is safe to run ONLY for
        // the arbitrary branch, ahead of the color fallback below.
        if looks_like_length(value) {
            return Some(vec![decl("font-size", value)]);
        }
    }
    color_declarations(theme, parsed, "color", "--text-opacity")
}

fn stroke_width_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "0" => "0",
        "1" => "1",
        "2" => "2",
        _ => return None,
    })
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        // Regression guard: an arbitrary "bg-[url(...)]" used to always be
        // treated as background-color (this arm never checked the value's
        // shape at all) — a background-IMAGE silently became a color
        // instead. `url(...)` is unambiguous (a real color value never
        // starts with it), so it's checked first, ahead of the normal
        // color path; anything else keeps the exact same color resolution
        // as before.
        "bg" if parsed.is_arbitrary && parsed.value.as_deref().is_some_and(|v| v.starts_with("url(")) => {
            Some(vec![decl("background-image", parsed.value.as_deref()?)])
        }
        "bg" => color_declarations(theme, parsed, "background-color", "--bg-opacity"),
        "text" => resolve_text(parsed, theme),
        "bg-opacity" => resolve_percent(parsed).map(|v| vec![decl("--bg-opacity", &v)]),
        "text-opacity" => resolve_percent(parsed).map(|v| vec![decl("--text-opacity", &v)]),
        // caret-color/accent-color have no matching Tailwind opacity-modifier
        // utility in this engine, so a plain (non-opacity-composed) lookup —
        // same as `border_value`'s own color branch — is the right shape,
        // not `color_declarations`'s rgba-decomposition.
        "caret" => color_value(theme, parsed).map(|v| vec![decl("caret-color", &v)]),
        "accent" => color_value(theme, parsed).map(|v| vec![decl("accent-color", &v)]),
        // SVG presentation attributes — grouped here with the rest of this
        // module's color-family utilities rather than a dedicated svg.rs,
        // since both are genuinely just "fill"/"stroke" is-it-a-color
        // lookups with a "none" keyword override, the same shape as every
        // other color arm above.
        "fill" if parsed.value.as_deref() == Some("none") => Some(vec![decl("fill", "none")]),
        "fill" => color_value(theme, parsed).map(|v| vec![decl("fill", &v)]),
        "stroke-width" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("stroke-width", value)]);
            }
            stroke_width_value(value).map(|v| vec![decl("stroke-width", v)])
        }
        "stroke" if parsed.value.as_deref() == Some("none") => Some(vec![decl("stroke", "none")]),
        "stroke" => color_value(theme, parsed).map(|v| vec![decl("stroke", &v)]),
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
        // A token that ALREADY carries an explicit `dark:` modifier on a
        // mode-aware color (e.g. `dark:bg-surface`, usually written out of
        // habit from before the color was made mode-aware) is NOT split
        // into a base+dark pair — that would be redundant on top of an
        // already-explicit choice, and would double up the `dark:` prefix
        // into a broken `dark:dark:...` selector. Substitute the dark side
        // in place instead, leaving every modifier (including the `dark:`
        // itself) exactly as written. Mirrors
        // old-kbach/packages/ui/src/core/modeAwareColors.ts's identical,
        // deliberately-documented guard.
        Some((_, dark)) if segments.contains(&"dark") => format!("{modifier_prefix}{dark}"),
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
    fn resolves_text_wrap_before_falling_back_to_color() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("text-balance"), &theme), Some(vec![decl("text-wrap", "balance")]));
        assert_eq!(resolve(&parse_class("text-nowrap"), &theme), Some(vec![decl("text-wrap", "nowrap")]));
    }

    #[test]
    fn resolves_an_arbitrary_font_size_instead_of_misreading_it_as_a_color() {
        // Regression: arbitrary "text-*" values used to skip the size/
        // align/wrap checks unconditionally and fall straight into color
        // resolution — an arbitrary font-size silently became a color.
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("text-[20px]"), &theme), Some(vec![decl("font-size", "20px")]));
        assert_eq!(resolve(&parse_class("text-[1.5rem]"), &theme), Some(vec![decl("font-size", "1.5rem")]));
        assert_eq!(resolve(&parse_class("text-[100%]"), &theme), Some(vec![decl("font-size", "100%")]));
        // A real arbitrary color must still resolve as a color, unaffected.
        assert_eq!(resolve(&parse_class("text-[#ff0000]"), &theme), Some(vec![decl("color", "rgba(255,0,0,var(--text-opacity, 1))")]));
        assert_eq!(resolve(&parse_class("text-[red]"), &theme), Some(vec![decl("color", "red")]));
    }

    #[test]
    fn resolves_text_ellipsis_clip_and_logical_alignment() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("text-ellipsis"), &theme), Some(vec![decl("text-overflow", "ellipsis")]));
        assert_eq!(resolve(&parse_class("text-clip"), &theme), Some(vec![decl("text-overflow", "clip")]));
        assert_eq!(resolve(&parse_class("text-start"), &theme), Some(vec![decl("text-align", "start")]));
        assert_eq!(resolve(&parse_class("text-end"), &theme), Some(vec![decl("text-align", "end")]));
    }

    #[test]
    fn non_hex_arbitrary_color_is_used_as_is_without_opacity_composition() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("bg-[red]"), &theme), Some(vec![decl("background-color", "red")]));
    }

    #[test]
    fn resolves_an_arbitrary_background_image_instead_of_misreading_it_as_a_color() {
        // Regression: arbitrary "bg-[url(...)]" used to always be treated
        // as background-color — a background-IMAGE silently became a color.
        let theme = theme_with_colors();
        assert_eq!(
            resolve(&parse_class("bg-[url(/hero.png)]"), &theme),
            Some(vec![decl("background-image", "url(/hero.png)")]),
        );
        // A real arbitrary color must still resolve as a color, unaffected.
        assert_eq!(resolve(&parse_class("bg-[#112233]"), &theme).unwrap()[0].property, "background-color");
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

    #[test]
    fn substitutes_the_dark_side_in_place_for_a_token_that_already_has_an_explicit_dark_modifier() {
        let theme = theme_with_colors();
        // Regression test — this used to expand to a broken, doubled
        // "dark:bg-[#f9fafb] dark:dark:bg-[#111827]" (light value under a
        // dark-mode selector, plus an invalid dark:dark: prefix). An explicit
        // dark: on an already mode-aware color substitutes the dark side in
        // place instead, matching old-kbach's identical guard.
        let expanded = expand_mode_aware_color_classes("dark:bg-surface", &theme);
        assert_eq!(expanded, "dark:bg-[#111827]");
    }

    #[test]
    fn substitutes_the_dark_side_with_other_modifiers_still_stacked() {
        let theme = theme_with_colors();
        let expanded = expand_mode_aware_color_classes("hover:dark:bg-surface", &theme);
        assert_eq!(expanded, "hover:dark:bg-[#111827]");
    }

    #[test]
    fn resolves_caret_and_accent_color_without_opacity_composition() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("caret-blue-6"), &theme), Some(vec![decl("caret-color", "#2563eb")]));
        assert_eq!(resolve(&parse_class("accent-blue-6"), &theme), Some(vec![decl("accent-color", "#2563eb")]));
        assert_eq!(resolve(&parse_class("caret-[#f00]"), &theme), Some(vec![decl("caret-color", "#f00")]));
    }

    #[test]
    fn resolves_svg_fill_stroke_and_stroke_width() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("fill-blue-6"), &theme), Some(vec![decl("fill", "#2563eb")]));
        assert_eq!(resolve(&parse_class("fill-none"), &theme), Some(vec![decl("fill", "none")]));
        assert_eq!(resolve(&parse_class("stroke-blue-6"), &theme), Some(vec![decl("stroke", "#2563eb")]));
        assert_eq!(resolve(&parse_class("stroke-none"), &theme), Some(vec![decl("stroke", "none")]));
        assert_eq!(resolve(&parse_class("stroke-width-2"), &theme), Some(vec![decl("stroke-width", "2")]));
        assert_eq!(resolve(&parse_class("stroke-width-[1.5]"), &theme), Some(vec![decl("stroke-width", "1.5")]));
    }
}
