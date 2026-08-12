//! Central table of built-in modifier definitions — every place that needs
//! to know how a modifier turns into CSS (selector shape, media wrapping,
//! cascade order) reads from here instead of re-deriving that knowledge
//! independently. Mirrors `old-kbach/src/core/registry.ts`'s `ModifierDef`
//! pattern. No runtime registration (this engine's built-ins-only scope so
//! far) — a static table is enough.
//!
//! Order values are a fresh, documented numeric tier scheme — not a
//! byte-for-byte port of old-kbach's exact numbers (not available to
//! reference directly here) — but preserving the same qualitative
//! guarantee: base < interactive pseudo-class < ancestor/sibling state <
//! dark mode < other media-query modifiers < responsive (outermost, see
//! css.rs). Tiers are spaced by 10 so new modifiers can be inserted into an
//! existing tier without renumbering everything after it.

use std::collections::HashMap;
use std::sync::LazyLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DarkScheme {
    Dark,
    // No modifier maps to this yet (only "dark" is registered below) — kept
    // as a real variant, not removed, since css.rs's wrap_dark_scheme already
    // handles it symmetrically and a future "light:" modifier is a one-line
    // registry addition away, not a new css.rs code path.
    #[allow(dead_code)]
    Light,
}

#[derive(Debug, Clone, Copy)]
pub struct ModifierDef {
    /// Pseudo-class/element suffix appended to the base selector, e.g. ":hover".
    pub pseudo: Option<&'static str>,
    /// Ancestor/sibling selector prefixed before the base selector, e.g. ".group:hover ".
    pub ancestor_selector: Option<&'static str>,
    /// Media query condition (without the "@media " prefix).
    pub media_query: Option<&'static str>,
    pub dark_scheme: Option<DarkScheme>,
    pub is_responsive: bool,
    /// Cascade-order tier. Higher sorts later (wins same-specificity ties).
    pub order: f64,
    pub forces_important: bool,
}

const BASE: ModifierDef = ModifierDef {
    pseudo: None,
    ancestor_selector: None,
    media_query: None,
    dark_scheme: None,
    is_responsive: false,
    order: 0.0,
    forces_important: false,
};

pub static MODIFIERS: LazyLock<HashMap<&'static str, ModifierDef>> = LazyLock::new(|| {
    let mut m = HashMap::new();

    // ── Interactive pseudo-classes (tier 10) ────────────────────────────────
    m.insert("hover", ModifierDef { pseudo: Some(":hover"), order: 10.0, ..BASE });
    m.insert("focus", ModifierDef { pseudo: Some(":focus"), order: 11.0, ..BASE });
    m.insert("focus-visible", ModifierDef { pseudo: Some(":focus-visible"), order: 12.0, ..BASE });
    m.insert("focus-within", ModifierDef { pseudo: Some(":focus-within"), order: 13.0, ..BASE });
    m.insert("active", ModifierDef { pseudo: Some(":active"), order: 14.0, ..BASE });
    m.insert("visited", ModifierDef { pseudo: Some(":visited"), order: 15.0, ..BASE });
    // disabled forces !important — a disabled element's styling shouldn't
    // lose to an unrelated same-specificity rule that happens to load later.
    m.insert("disabled", ModifierDef { pseudo: Some(":disabled"), order: 16.0, forces_important: true, ..BASE });
    m.insert("checked", ModifierDef { pseudo: Some(":checked"), order: 17.0, ..BASE });

    // ── Ancestor/sibling state (tier 20) ────────────────────────────────────
    m.insert("group-hover", ModifierDef { ancestor_selector: Some(".group:hover "), order: 20.0, ..BASE });
    m.insert("group-focus", ModifierDef { ancestor_selector: Some(".group:focus "), order: 21.0, ..BASE });
    m.insert("peer-hover", ModifierDef { ancestor_selector: Some(".peer:hover ~ "), order: 22.0, ..BASE });
    m.insert("peer-focus", ModifierDef { ancestor_selector: Some(".peer:focus ~ "), order: 23.0, ..BASE });
    m.insert("peer-checked", ModifierDef { ancestor_selector: Some(".peer:checked ~ "), order: 24.0, ..BASE });

    // ── Dark mode (tier 30) ──────────────────────────────────────────────────
    m.insert("dark", ModifierDef { dark_scheme: Some(DarkScheme::Dark), order: 30.0, ..BASE });

    // ── Other media-query modifiers (tier 35) ────────────────────────────────
    m.insert("motion-safe", ModifierDef { media_query: Some("(prefers-reduced-motion: no-preference)"), order: 35.0, ..BASE });
    m.insert("motion-reduce", ModifierDef { media_query: Some("(prefers-reduced-motion: reduce)"), order: 36.0, ..BASE });
    m.insert("print", ModifierDef { media_query: Some("print"), order: 37.0, ..BASE });

    // ── Responsive breakpoints (tier 40+, outermost — see css.rs) ───────────
    // Actual min-width comes from theme.screens at CSS-build time; the order
    // value here only needs to place "responsive" after every other tier and
    // ascending among themselves, so sm < md < lg < xl < 2xl ties resolve
    // predictably even before a theme's px values are consulted.
    m.insert("sm", ModifierDef { is_responsive: true, order: 40.0, ..BASE });
    m.insert("md", ModifierDef { is_responsive: true, order: 41.0, ..BASE });
    m.insert("lg", ModifierDef { is_responsive: true, order: 42.0, ..BASE });
    m.insert("xl", ModifierDef { is_responsive: true, order: 43.0, ..BASE });
    m.insert("2xl", ModifierDef { is_responsive: true, order: 44.0, ..BASE });

    m
});

pub fn get_modifier(name: &str) -> Option<ModifierDef> {
    MODIFIERS.get(name).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_modifiers_resolve() {
        assert!(get_modifier("hover").is_some());
        assert!(get_modifier("dark").is_some());
        assert!(get_modifier("sm").is_some());
    }

    #[test]
    fn unknown_modifier_returns_none() {
        assert!(get_modifier("not-a-real-modifier").is_none());
    }

    #[test]
    fn interactive_pseudo_classes_sort_before_ancestor_modifiers() {
        let hover = get_modifier("hover").unwrap();
        let group_hover = get_modifier("group-hover").unwrap();
        assert!(hover.order < group_hover.order);
    }

    #[test]
    fn ancestor_modifiers_sort_before_dark_mode() {
        let group_hover = get_modifier("group-hover").unwrap();
        let dark = get_modifier("dark").unwrap();
        assert!(group_hover.order < dark.order);
    }

    #[test]
    fn dark_mode_sorts_before_responsive() {
        let dark = get_modifier("dark").unwrap();
        let sm = get_modifier("sm").unwrap();
        assert!(dark.order < sm.order);
    }

    #[test]
    fn responsive_breakpoints_sort_ascending_by_size() {
        let sm = get_modifier("sm").unwrap().order;
        let md = get_modifier("md").unwrap().order;
        let lg = get_modifier("lg").unwrap().order;
        let xl = get_modifier("xl").unwrap().order;
        let xxl = get_modifier("2xl").unwrap().order;
        assert!(sm < md && md < lg && lg < xl && xl < xxl);
    }

    #[test]
    fn disabled_forces_important() {
        assert!(get_modifier("disabled").unwrap().forces_important);
        assert!(!get_modifier("hover").unwrap().forces_important);
    }
}
