use super::{decl, fraction_percent, resolve_length, resolve_negatable_length, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

/// Named container-scale sizes (Tailwind's `max-w-*` scale, ported to `w`/
/// `h`/`min-w`/`max-w`/`min-h`/`max-h` alike per this project's own usage —
/// stock Tailwind only applies it to `max-w`) — checked before falling back
/// to `resolve_length`'s numeric spacing scale in each arm below, same
/// precedence pattern as `border.rs`'s `radius_size` before its own
/// `resolve_length` fallback. `sm`-`7xl` match Tailwind's real rem values
/// exactly; `8xl`/`9xl` aren't in Tailwind's default scale at all, extended
/// here following its own established +8rem-per-step pattern (4xl->5xl->
/// 6xl->7xl are each +8rem) since Tailwind stops at 7xl but doesn't define
/// a reason to.
///
/// No collision with the identically-named `sm`/`md`/`lg`/`xl`/`2xl`
/// responsive modifiers (registry.rs) — those live in `parsed.modifiers`
/// (before a `:`), this is `parsed.value` (after a `-`), entirely separate
/// fields the parser already keeps apart.
fn named_size(key: &str) -> Option<&'static str> {
    Some(match key {
        "sm" => "24rem",
        "md" => "28rem",
        "lg" => "32rem",
        "xl" => "36rem",
        "2xl" => "42rem",
        "3xl" => "48rem",
        "4xl" => "56rem",
        "5xl" => "64rem",
        "6xl" => "72rem",
        "7xl" => "80rem",
        "8xl" => "88rem",
        "9xl" => "96rem",
        _ => return None,
    })
}

/// CSS's own sizing keywords — distinct from the theme's spacing-scale
/// numbers/named container sizes, so checked here rather than added to
/// either of those tables.
fn css_size_keyword(key: &str) -> Option<&'static str> {
    Some(match key {
        "min" => "min-content",
        "max" => "max-content",
        "fit" => "fit-content",
        _ => return None,
    })
}

fn resolve_size(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<String> {
    if !parsed.is_arbitrary {
        if let Some(value) = parsed.value.as_deref() {
            if let Some(size) = named_size(value) {
                return Some(size.to_string());
            }
            if let Some(kw) = css_size_keyword(value) {
                return Some(kw.to_string());
            }
            if let Some(pct) = fraction_percent(value) {
                return Some(pct);
            }
        }
    }
    resolve_length(theme, parsed)
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "p" => resolve_length(theme, parsed).map(|v| vec![decl("padding", &v)]),
        "px" => resolve_length(theme, parsed).map(|v| vec![decl("padding-left", &v), decl("padding-right", &v)]),
        "py" => resolve_length(theme, parsed).map(|v| vec![decl("padding-top", &v), decl("padding-bottom", &v)]),
        "pt" => resolve_length(theme, parsed).map(|v| vec![decl("padding-top", &v)]),
        "pr" => resolve_length(theme, parsed).map(|v| vec![decl("padding-right", &v)]),
        "pb" => resolve_length(theme, parsed).map(|v| vec![decl("padding-bottom", &v)]),
        "pl" => resolve_length(theme, parsed).map(|v| vec![decl("padding-left", &v)]),
        // Margin (unlike padding above) supports real Tailwind's negative-
        // value convention ("-mt-4") — see resolve_negatable_length's own
        // doc comment for why it's a separate helper from resolve_length.
        "m" => resolve_negatable_length(theme, parsed).map(|v| vec![decl("margin", &v)]),
        "mx" => resolve_negatable_length(theme, parsed).map(|v| vec![decl("margin-left", &v), decl("margin-right", &v)]),
        "my" => resolve_negatable_length(theme, parsed).map(|v| vec![decl("margin-top", &v), decl("margin-bottom", &v)]),
        "mt" => resolve_negatable_length(theme, parsed).map(|v| vec![decl("margin-top", &v)]),
        "mr" => resolve_negatable_length(theme, parsed).map(|v| vec![decl("margin-right", &v)]),
        "mb" => resolve_negatable_length(theme, parsed).map(|v| vec![decl("margin-bottom", &v)]),
        "ml" => resolve_negatable_length(theme, parsed).map(|v| vec![decl("margin-left", &v)]),
        "gap" => resolve_length(theme, parsed).map(|v| vec![decl("gap", &v)]),
        "gap-x" => resolve_length(theme, parsed).map(|v| vec![decl("column-gap", &v)]),
        "gap-y" => resolve_length(theme, parsed).map(|v| vec![decl("row-gap", &v)]),
        "w" => resolve_size(theme, parsed).map(|v| vec![decl("width", &v)]),
        "h" => resolve_size(theme, parsed).map(|v| vec![decl("height", &v)]),
        "min-w" => resolve_size(theme, parsed).map(|v| vec![decl("min-width", &v)]),
        "max-w" => resolve_size(theme, parsed).map(|v| vec![decl("max-width", &v)]),
        "min-h" => resolve_size(theme, parsed).map(|v| vec![decl("min-height", &v)]),
        "max-h" => resolve_size(theme, parsed).map(|v| vec![decl("max-height", &v)]),
        // Logical sizing (Tailwind v4.2) — writing-mode-aware equivalents of
        // w/h: "inline" tracks the text-flow axis (horizontal in the usual
        // left-to-right/right-to-left modes), "block" tracks the
        // perpendicular one. Reuses the exact same named/fraction/spacing-
        // scale/arbitrary resolution as physical w/h/min-w/max-w/min-h/
        // max-h — real Tailwind's own logical-sizing scale is identical to
        // its physical one, just addressed by a different pair of CSS
        // properties.
        "inline" => resolve_size(theme, parsed).map(|v| vec![decl("inline-size", &v)]),
        "block" => resolve_size(theme, parsed).map(|v| vec![decl("block-size", &v)]),
        "min-inline" => resolve_size(theme, parsed).map(|v| vec![decl("min-inline-size", &v)]),
        "max-inline" => resolve_size(theme, parsed).map(|v| vec![decl("max-inline-size", &v)]),
        "min-block" => resolve_size(theme, parsed).map(|v| vec![decl("min-block-size", &v)]),
        "max-block" => resolve_size(theme, parsed).map(|v| vec![decl("max-block-size", &v)]),
        // Combined width+height shorthand — reuses the exact same named/
        // fraction/spacing-scale/arbitrary resolution as bare "w"/"h".
        "size" => resolve_size(theme, parsed).map(|v| vec![decl("width", &v), decl("height", &v)]),
        // flex-basis shares the same named/fraction/spacing-scale/arbitrary
        // resolution as width — real Tailwind's own basis-* scale is
        // literally the width scale.
        "basis" => resolve_size(theme, parsed).map(|v| vec![decl("flex-basis", &v)]),
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
    fn falls_back_to_the_spacing_formula_for_a_step_missing_from_the_theme_table() {
        // "99" isn't a real Tailwind-named spacing stop and isn't in the
        // theme's table either, but it's still a bare number — real
        // Tailwind v4's spacing scale is a live `n * 0.25rem` formula, not
        // a fixed list, so this resolves via `spacing_px`'s fallback
        // (`resolvers::mod::spacing_px`) rather than failing outright.
        let t = theme();
        assert_eq!(resolve(&parse_class("p-99"), &t), Some(vec![decl("padding", "396px")]));
    }

    #[test]
    fn returns_none_for_a_spacing_value_that_isnt_numeric_or_in_the_theme() {
        let t = theme();
        assert_eq!(resolve(&parse_class("p-banana"), &t), None);
    }

    #[test]
    fn resolves_full_to_100_percent_for_width_and_height() {
        let t = theme();
        assert_eq!(resolve(&parse_class("w-full"), &t), Some(vec![decl("width", "100%")]));
        assert_eq!(resolve(&parse_class("h-full"), &t), Some(vec![decl("height", "100%")]));
        assert_eq!(resolve(&parse_class("min-h-full"), &t), Some(vec![decl("min-height", "100%")]));
    }

    #[test]
    fn resolves_auto_for_margin_and_width_height() {
        let t = theme();
        assert_eq!(resolve(&parse_class("mx-auto"), &t), Some(vec![decl("margin-left", "auto"), decl("margin-right", "auto")]));
        assert_eq!(resolve(&parse_class("w-auto"), &t), Some(vec![decl("width", "auto")]));
        assert_eq!(resolve(&parse_class("h-auto"), &t), Some(vec![decl("height", "auto")]));
    }

    #[test]
    fn resolves_named_container_sizes_for_width_and_height() {
        let t = theme();
        assert_eq!(resolve(&parse_class("w-sm"), &t), Some(vec![decl("width", "24rem")]));
        assert_eq!(resolve(&parse_class("max-w-lg"), &t), Some(vec![decl("max-width", "32rem")]));
        assert_eq!(resolve(&parse_class("h-2xl"), &t), Some(vec![decl("height", "42rem")]));
        assert_eq!(resolve(&parse_class("min-h-7xl"), &t), Some(vec![decl("min-height", "80rem")]));
        assert_eq!(resolve(&parse_class("max-h-9xl"), &t), Some(vec![decl("max-height", "96rem")]));
    }

    #[test]
    fn named_size_does_not_shadow_arbitrary_or_numeric_values() {
        let t = theme();
        // "sm" is also a named size key, but an arbitrary value must always
        // win over the named-size lookup — is_arbitrary is checked first.
        assert_eq!(resolve(&parse_class("w-[3rem]"), &t), Some(vec![decl("width", "3rem")]));
        assert_eq!(resolve(&parse_class("w-4"), &t), Some(vec![decl("width", "16px")]));
    }

    #[test]
    fn resolves_fraction_based_width_and_height_to_a_percentage() {
        let t = theme();
        assert_eq!(resolve(&parse_class("w-1/2"), &t), Some(vec![decl("width", "50%")]));
        assert_eq!(resolve(&parse_class("w-1/3"), &t), Some(vec![decl("width", "33.333333%")]));
        assert_eq!(resolve(&parse_class("h-2/3"), &t), Some(vec![decl("height", "66.666667%")]));
        assert_eq!(resolve(&parse_class("w-3/4"), &t), Some(vec![decl("width", "75%")]));
        assert_eq!(resolve(&parse_class("w-11/12"), &t), Some(vec![decl("width", "91.666667%")]));
    }

    #[test]
    fn resolves_negative_margin_via_the_leading_dash_convention() {
        let t = theme();
        assert_eq!(resolve(&parse_class("-mt-4"), &t), Some(vec![decl("margin-top", "-16px")]));
        assert_eq!(
            resolve(&parse_class("-mx-8"), &t),
            Some(vec![decl("margin-left", "-32px"), decl("margin-right", "-32px")]),
        );
        assert_eq!(resolve(&parse_class("-m-4"), &t), Some(vec![decl("margin", "-16px")]));
    }

    #[test]
    fn negative_margin_of_zero_is_plain_zero_not_negative_zero() {
        let mut t = theme();
        t.spacing.insert("0".to_string(), 0.0);
        assert_eq!(resolve(&parse_class("-mt-0"), &t), Some(vec![decl("margin-top", "0px")]));
    }

    #[test]
    fn negative_margin_has_no_form_for_full_auto_or_arbitrary_values() {
        // Real Tailwind doesn't generate "-m-full"/"-m-auto" at all, and an
        // arbitrary negative is written directly ("mt-[-10px]"), not via
        // this "-" convention — both are unresolvable here, not a bug.
        let t = theme();
        assert_eq!(resolve(&parse_class("-mt-full"), &t), None);
        assert_eq!(resolve(&parse_class("-mt-auto"), &t), None);
        assert_eq!(resolve(&parse_class("-mt-[10px]"), &t), None);
    }

    #[test]
    fn padding_has_no_negative_form_the_leading_dash_is_simply_unresolvable() {
        // Real Tailwind never supports negative padding at all — "-p-4"
        // isn't a real Tailwind class, so this engine doesn't resolve it
        // either (falls through, same as any other unknown class).
        let t = theme();
        assert_eq!(resolve(&parse_class("-p-4"), &t), None);
    }

    #[test]
    fn resolves_css_size_keywords_for_width_and_flex_basis() {
        let t = theme();
        assert_eq!(resolve(&parse_class("w-min"), &t), Some(vec![decl("width", "min-content")]));
        assert_eq!(resolve(&parse_class("max-w-max"), &t), Some(vec![decl("max-width", "max-content")]));
        assert_eq!(resolve(&parse_class("h-fit"), &t), Some(vec![decl("height", "fit-content")]));
    }

    #[test]
    fn resolves_flex_basis_via_the_shared_width_scale() {
        let t = theme();
        assert_eq!(resolve(&parse_class("basis-4"), &t), Some(vec![decl("flex-basis", "16px")]));
        assert_eq!(resolve(&parse_class("basis-1/2"), &t), Some(vec![decl("flex-basis", "50%")]));
        assert_eq!(resolve(&parse_class("basis-full"), &t), Some(vec![decl("flex-basis", "100%")]));
        assert_eq!(resolve(&parse_class("basis-auto"), &t), Some(vec![decl("flex-basis", "auto")]));
    }

    #[test]
    fn resolves_logical_sizing_via_the_shared_width_height_scale() {
        let t = theme();
        assert_eq!(resolve(&parse_class("inline-4"), &t), Some(vec![decl("inline-size", "16px")]));
        assert_eq!(resolve(&parse_class("block-4"), &t), Some(vec![decl("block-size", "16px")]));
        assert_eq!(resolve(&parse_class("min-inline-full"), &t), Some(vec![decl("min-inline-size", "100%")]));
        assert_eq!(resolve(&parse_class("max-inline-lg"), &t), Some(vec![decl("max-inline-size", "32rem")]));
        assert_eq!(resolve(&parse_class("min-block-4"), &t), Some(vec![decl("min-block-size", "16px")]));
        assert_eq!(resolve(&parse_class("max-block-1/2"), &t), Some(vec![decl("max-block-size", "50%")]));
    }

    #[test]
    fn resolves_size_shorthand_to_matching_width_and_height() {
        let t = theme();
        assert_eq!(resolve(&parse_class("size-4"), &t), Some(vec![decl("width", "16px"), decl("height", "16px")]));
        assert_eq!(resolve(&parse_class("size-full"), &t), Some(vec![decl("width", "100%"), decl("height", "100%")]));
        assert_eq!(resolve(&parse_class("size-1/2"), &t), Some(vec![decl("width", "50%"), decl("height", "50%")]));
        assert_eq!(resolve(&parse_class("size-[3rem]"), &t), Some(vec![decl("width", "3rem"), decl("height", "3rem")]));
    }
}
