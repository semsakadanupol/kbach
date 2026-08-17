//! `scroll-auto`/`scroll-smooth` (`scroll-behavior`), `scroll-m*`/`scroll-p*`
//! (`scroll-margin-*`/`scroll-padding-*`, reusing the shared spacing-scale
//! `resolve_length` helper), and the `snap-*` family (`scroll-snap-type`/
//! `-align`/`-stop`). A large enough, cohesive-enough domain to earn its
//! own file rather than folding into `interactivity.rs` — this crate's
//! established "no monolith" convention (see `resolvers/mod.rs`'s own doc
//! comment).
//!
//! `snap-x`/`snap-y`/`snap-both` compose with `snap-mandatory`/
//! `snap-proximity` via the same safe `var(--kb-x, fallback)` pattern
//! `border.rs`'s ring system uses — never the riskier "rebuild a shared
//! variable from scratch" pattern `background.rs`'s gradient stops need
//! (see that module's own doc comment for why that one needed a dedicated
//! cascade-order fix in `css.rs`). Each `snap-*` utility only ever sets its
//! own independent variable, so there's no cross-rule ordering dependency
//! here at all.

use super::{decl, resolve_length, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

fn snap_axis(axis: &str) -> Vec<Declaration> {
    vec![decl("scroll-snap-type", &format!("{axis} var(--kb-snap-strictness, proximity)"))]
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "scroll-auto" => Some(vec![decl("scroll-behavior", "auto")]),
        "scroll-smooth" => Some(vec![decl("scroll-behavior", "smooth")]),
        "scroll-m" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-margin", &v)]),
        "scroll-mx" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-margin-left", &v), decl("scroll-margin-right", &v)]),
        "scroll-my" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-margin-top", &v), decl("scroll-margin-bottom", &v)]),
        "scroll-mt" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-margin-top", &v)]),
        "scroll-mr" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-margin-right", &v)]),
        "scroll-mb" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-margin-bottom", &v)]),
        "scroll-ml" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-margin-left", &v)]),
        "scroll-p" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-padding", &v)]),
        "scroll-px" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-padding-left", &v), decl("scroll-padding-right", &v)]),
        "scroll-py" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-padding-top", &v), decl("scroll-padding-bottom", &v)]),
        "scroll-pt" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-padding-top", &v)]),
        "scroll-pr" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-padding-right", &v)]),
        "scroll-pb" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-padding-bottom", &v)]),
        "scroll-pl" => resolve_length(theme, parsed).map(|v| vec![decl("scroll-padding-left", &v)]),
        "snap-start" => Some(vec![decl("scroll-snap-align", "start")]),
        "snap-end" => Some(vec![decl("scroll-snap-align", "end")]),
        "snap-center" => Some(vec![decl("scroll-snap-align", "center")]),
        "snap-align-none" => Some(vec![decl("scroll-snap-align", "none")]),
        "snap-normal" => Some(vec![decl("scroll-snap-stop", "normal")]),
        "snap-always" => Some(vec![decl("scroll-snap-stop", "always")]),
        "snap-none" => Some(vec![decl("scroll-snap-type", "none")]),
        "snap-x" => Some(snap_axis("x")),
        "snap-y" => Some(snap_axis("y")),
        "snap-both" => Some(snap_axis("both")),
        "snap-mandatory" => Some(vec![decl("--kb-snap-strictness", "mandatory")]),
        "snap-proximity" => Some(vec![decl("--kb-snap-strictness", "proximity")]),
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
    fn resolves_scroll_behavior() {
        let t = theme();
        assert_eq!(resolve(&parse_class("scroll-auto"), &t), Some(vec![decl("scroll-behavior", "auto")]));
        assert_eq!(resolve(&parse_class("scroll-smooth"), &t), Some(vec![decl("scroll-behavior", "smooth")]));
    }

    #[test]
    fn resolves_scroll_margin_and_padding_via_the_shared_spacing_scale() {
        let t = theme();
        assert_eq!(resolve(&parse_class("scroll-m-4"), &t), Some(vec![decl("scroll-margin", "16px")]));
        assert_eq!(
            resolve(&parse_class("scroll-mx-4"), &t),
            Some(vec![decl("scroll-margin-left", "16px"), decl("scroll-margin-right", "16px")]),
        );
        assert_eq!(resolve(&parse_class("scroll-pt-4"), &t), Some(vec![decl("scroll-padding-top", "16px")]));
        assert_eq!(resolve(&parse_class("scroll-p-[2rem]"), &t), Some(vec![decl("scroll-padding", "2rem")]));
    }

    #[test]
    fn resolves_scroll_snap_align_and_stop() {
        let t = theme();
        assert_eq!(resolve(&parse_class("snap-start"), &t), Some(vec![decl("scroll-snap-align", "start")]));
        assert_eq!(resolve(&parse_class("snap-align-none"), &t), Some(vec![decl("scroll-snap-align", "none")]));
        assert_eq!(resolve(&parse_class("snap-always"), &t), Some(vec![decl("scroll-snap-stop", "always")]));
    }

    #[test]
    fn resolves_scroll_snap_type_axis_composed_with_strictness() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("snap-x"), &t),
            Some(vec![decl("scroll-snap-type", "x var(--kb-snap-strictness, proximity)")]),
        );
        assert_eq!(resolve(&parse_class("snap-mandatory"), &t), Some(vec![decl("--kb-snap-strictness", "mandatory")]));
        assert_eq!(resolve(&parse_class("snap-none"), &t), Some(vec![decl("scroll-snap-type", "none")]));
    }
}
