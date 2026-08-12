//! Turns a parsed class + its resolved declarations into a CSS rule string,
//! consulting the modifier registry for every modifier in the chain instead
//! of special-casing "dark" the way Phase 1 did. Port of old-kbach's
//! `buildClassCSSRules` (`old-kbach/src/core/resolver.ts`).

use crate::parser::ParsedClass;
use crate::registry::{get_modifier, DarkScheme};
use crate::resolvers::Declaration;
use crate::theme::{DarkModeStrategy, ThemeConfig};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct BuiltRule {
    pub rule: String,
    pub order: f64,
}

const CHILD_COMBINATOR_SUFFIX: &str = " > * + *";

/// Escapes every character that isn't alphanumeric/hyphen/underscore with a
/// backslash, and escapes a leading digit as a hex code point (CSS
/// identifiers can't start with an unescaped digit — the "2xl:" breakpoint
/// bug old-kbach's own regression test exists for). General enough to cover
/// every special character a class token can now contain: ":" (modifiers),
/// "!" (important), "[", "]", "#", ".", "(", ")", "%", "/" (arbitrary values).
fn escape_selector(class: &str) -> String {
    let mut out = String::with_capacity(class.len() + 8);
    let mut chars = class.chars().peekable();

    if let Some(&first) = chars.peek() {
        if first.is_ascii_digit() {
            out.push('\\');
            out.push_str(&format!("{:x} ", first as u32));
            chars.next();
        }
    }

    for ch in chars {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('\\');
            out.push(ch);
        }
    }
    out
}

/// Translates `__divide-*`/`__space-*` marker properties (see
/// resolvers/divide.rs) into real CSS declarations, and reports whether the
/// child-combinator selector suffix is needed.
fn declarations_to_css(decls: &[Declaration]) -> (String, bool) {
    let mut parts: Vec<String> = Vec::new();
    let mut needs_child_combinator = false;

    for d in decls {
        match d.property.as_str() {
            "__divide-x-width" => {
                // border-style defaults to "none", which per spec computes
                // border-width's USED value to 0 regardless of what's
                // declared — old-kbach relied on a global preflight reset
                // setting border-style: solid everywhere; this engine has
                // no reset yet, so divide sets its own style explicitly.
                parts.push("border-left-style: solid".to_string());
                parts.push(format!("border-left-width: {}", d.value));
                parts.push("border-right-width: 0px".to_string());
                needs_child_combinator = true;
            }
            "__divide-y-width" => {
                parts.push("border-top-style: solid".to_string());
                parts.push(format!("border-top-width: {}", d.value));
                parts.push("border-bottom-width: 0px".to_string());
                needs_child_combinator = true;
            }
            "__divide-color" => {
                parts.push(format!("border-color: {}", d.value));
                needs_child_combinator = true;
            }
            "__space-x" => {
                parts.push(format!("margin-left: {}", d.value));
                needs_child_combinator = true;
            }
            "__space-y" => {
                parts.push(format!("margin-top: {}", d.value));
                needs_child_combinator = true;
            }
            _ => parts.push(format!("{}: {}", d.property, d.value)),
        }
    }

    (parts.join("; "), needs_child_combinator)
}

fn apply_important(decl_text: &str) -> String {
    decl_text.split("; ").map(|d| format!("{d} !important")).collect::<Vec<_>>().join("; ")
}

fn wrap_dark_scheme(scheme: DarkScheme, strategy: DarkModeStrategy, selector: &str, decls: &str) -> String {
    match (scheme, strategy) {
        (DarkScheme::Dark, DarkModeStrategy::Media) => format!("@media (prefers-color-scheme: dark) {{ {selector} {{ {decls} }} }}"),
        (DarkScheme::Dark, DarkModeStrategy::Class) => format!(".dark {selector} {{ {decls} }}"),
        (DarkScheme::Dark, DarkModeStrategy::Attribute) => format!("[data-theme=\"dark\"] {selector} {{ {decls} }}"),
        (DarkScheme::Light, DarkModeStrategy::Media) => format!("@media (prefers-color-scheme: light) {{ {selector} {{ {decls} }} }}"),
        (DarkScheme::Light, DarkModeStrategy::Class) => format!(".light {selector} {{ {decls} }}"),
        (DarkScheme::Light, DarkModeStrategy::Attribute) => format!("[data-theme=\"light\"] {selector} {{ {decls} }}"),
    }
}

pub fn build_rule(parsed: &ParsedClass, decls: &[Declaration], theme: &ThemeConfig) -> Option<BuiltRule> {
    let (decl_text, needs_child_combinator) = declarations_to_css(decls);
    if decl_text.is_empty() {
        return None;
    }

    let mut pseudo_suffix = String::new();
    let mut ancestor_prefix = String::new();
    let mut media_wrappers: Vec<&str> = Vec::new();
    let mut dark_scheme: Option<DarkScheme> = None;
    let mut needs_important = parsed.important;
    let mut order = 0.0_f64;
    let mut min_width: Option<f64> = None;

    for modifier in &parsed.modifiers {
        let Some(def) = get_modifier(modifier) else { continue };
        if let Some(p) = def.pseudo {
            pseudo_suffix.push_str(p);
        }
        if let Some(a) = def.ancestor_selector {
            ancestor_prefix.push_str(a);
        }
        if let Some(mq) = def.media_query {
            media_wrappers.push(mq);
        }
        if let Some(scheme) = def.dark_scheme {
            dark_scheme = Some(scheme);
        }
        if def.forces_important {
            needs_important = true;
        }
        if def.is_responsive {
            let width = theme.screens.get(modifier).copied().unwrap_or(0.0);
            min_width = Some(min_width.map_or(width, |w: f64| w.max(width)));
        }
        if def.order > order {
            order = def.order;
        }
    }

    let escaped = escape_selector(&parsed.original);
    let child_suffix = if needs_child_combinator { CHILD_COMBINATOR_SUFFIX } else { "" };
    let base_selector = format!(".{escaped}{pseudo_suffix}{child_suffix}");
    let selector = format!("{ancestor_prefix}{base_selector}");

    let decl_text = if needs_important { apply_important(&decl_text) } else { decl_text };

    let mut rule = match dark_scheme {
        Some(scheme) => wrap_dark_scheme(scheme, theme.dark_mode, &selector, &decl_text),
        None => format!("{selector} {{ {decl_text} }}"),
    };

    for mq in &media_wrappers {
        rule = format!("@media {mq} {{ {rule} }}");
    }

    if let Some(width) = min_width {
        rule = format!("@media (min-width: {width}px) {{ {rule} }}");
    }

    Some(BuiltRule { rule, order })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;
    use crate::resolvers::decl;
    use crate::theme::DarkModeStrategy;

    fn theme_with_screens() -> ThemeConfig {
        let mut screens = std::collections::HashMap::new();
        screens.insert("sm".to_string(), 640.0);
        ThemeConfig { screens, ..Default::default() }
    }

    #[test]
    fn builds_a_plain_rule() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("bg-blue-6");
        let decls = vec![decl("background-color", "#2563eb")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".bg-blue-6 { background-color: #2563eb }");
        assert_eq!(rule.order, 0.0);
    }

    #[test]
    fn escapes_a_leading_digit_breakpoint_class() {
        let theme = theme_with_screens();
        let parsed = parse_class("sm:text-lg");
        let decls = vec![decl("font-size", "1.125rem")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert!(rule.rule.contains(".sm\\:text-lg"));
        assert!(rule.rule.starts_with("@media (min-width: 640px)"));
    }

    #[test]
    fn escapes_a_class_with_a_real_leading_digit() {
        let mut screens = std::collections::HashMap::new();
        screens.insert("2xl".to_string(), 1536.0);
        let theme = ThemeConfig { screens, ..Default::default() };
        let parsed = parse_class("2xl:text-lg");
        let decls = vec![decl("font-size", "1.125rem")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert!(rule.rule.contains(".\\32 xl\\:text-lg"));
        assert!(!rule.rule.contains(".2xl\\:text-lg"));
    }

    #[test]
    fn wraps_dark_mode_per_strategy() {
        let parsed = parse_class("dark:bg-blue-8");
        let decls = vec![decl("background-color", "#1e40af")];

        let attribute_theme = ThemeConfig { dark_mode: DarkModeStrategy::Attribute, ..Default::default() };
        let class_theme = ThemeConfig { dark_mode: DarkModeStrategy::Class, ..Default::default() };
        let media_theme = ThemeConfig { dark_mode: DarkModeStrategy::Media, ..Default::default() };

        assert_eq!(
            build_rule(&parsed, &decls, &attribute_theme).unwrap().rule,
            "[data-theme=\"dark\"] .dark\\:bg-blue-8 { background-color: #1e40af }",
        );
        assert_eq!(
            build_rule(&parsed, &decls, &class_theme).unwrap().rule,
            ".dark .dark\\:bg-blue-8 { background-color: #1e40af }",
        );
        assert_eq!(
            build_rule(&parsed, &decls, &media_theme).unwrap().rule,
            "@media (prefers-color-scheme: dark) { .dark\\:bg-blue-8 { background-color: #1e40af } }",
        );
    }

    #[test]
    fn interactive_pseudo_appends_the_pseudo_class_to_the_selector() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("hover:bg-blue-8");
        let decls = vec![decl("background-color", "#1e40af")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".hover\\:bg-blue-8:hover { background-color: #1e40af }");
    }

    #[test]
    fn ancestor_modifier_prefixes_the_selector() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("group-hover:text-blue-6");
        let decls = vec![decl("color", "#2563eb")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".group:hover .group-hover\\:text-blue-6 { color: #2563eb }");
    }

    #[test]
    fn explicit_important_prefix_forces_important_on_every_declaration() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("!bg-blue-6");
        let decls = vec![decl("background-color", "#2563eb")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".\\!bg-blue-6 { background-color: #2563eb !important }");
    }

    #[test]
    fn disabled_modifier_forces_important_even_without_explicit_prefix() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("disabled:opacity-50");
        let decls = vec![decl("opacity", "0.5")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert!(rule.rule.contains("opacity: 0.5 !important"));
    }

    #[test]
    fn divide_x_adds_the_child_combinator_suffix_and_translates_declarations() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("divide-x");
        let decls = vec![decl("__divide-x-width", "1px")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(
            rule.rule,
            ".divide-x > * + * { border-left-style: solid; border-left-width: 1px; border-right-width: 0px }",
        );
    }

    #[test]
    fn escapes_an_arbitrary_value_selector() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("bg-[#6366f1]");
        let decls = vec![decl("background-color", "#6366f1")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".bg-\\[\\#6366f1\\] { background-color: #6366f1 }");
    }

    #[test]
    fn returns_none_for_empty_declarations() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("group");
        let rule = build_rule(&parsed, &[], &theme);
        assert!(rule.is_none());
    }
}
