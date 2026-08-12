mod css;
#[cfg(target_os = "android")]
mod jni_bridge;
mod parser;
mod registry;
mod resolve_style;
mod resolvers;
mod theme;

use serde::Serialize;
use theme::ThemeConfig;
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerateCssResult {
    /// The mode-aware-expanded class string — e.g. "bg-surface" becomes
    /// "bg-[#f9fafb] dark:bg-[#111827]". The CALLER must use THIS as the
    /// element's className, not the original input: the CSS rules below
    /// are generated against the expanded token text, so an element
    /// carrying the un-expanded className would never match its own
    /// mode-aware-color selectors.
    class_name: String,
    rules: Vec<css::BuiltRule>,
}

/// Resolves every class in `class_string` against `theme_json` and returns
/// a JSON object `{ className, rules: [{ rule, order }] }` — one call per
/// full class string rather than per-token, batching the FFI boundary
/// crossing instead of paying it once per class. `order` lets the
/// TypeScript side binary-search-insert each rule at the right CSSOM index
/// (cascade-order-safe injection — see `packages/react/src/kb.ts`) instead
/// of a plain append, which would let same-specificity rules land in
/// whatever order the app happened to render/resolve them in.
///
/// Shared by every platform entry point — the WASM export below AND the
/// Android JNI bridge (`jni_bridge.rs`) both call this; neither duplicates
/// the resolution logic, only the string-marshaling for their own FFI shape.
///
/// `theme_json` is a JSON-serialized `ThemeConfig`. An unparseable theme
/// yields the original class string with no rules, rather than panicking
/// across the FFI boundary.
pub(crate) fn resolve_class_string(class_string: &str, theme_json: &str) -> String {
    let theme: ThemeConfig = match serde_json::from_str(theme_json) {
        Ok(t) => t,
        Err(_) => {
            let fallback = GenerateCssResult { class_name: class_string.to_string(), rules: vec![] };
            return serde_json::to_string(&fallback).unwrap_or_else(|_| "{\"className\":\"\",\"rules\":[]}".to_string());
        }
    };

    // Mode-aware color names (theme colors defined as { light, dark }) are
    // expanded into a literal light/dark class pair before tokenizing, so
    // every downstream step — including the className returned to the
    // caller — only ever deals with plain values.
    let class_name = resolvers::expand_mode_aware_color_classes(class_string, &theme);

    let rules: Vec<css::BuiltRule> = class_name
        .split_whitespace()
        .filter_map(|token| {
            let parsed = parser::parse_class(token);
            let decls = resolvers::resolve_utility(&parsed, &theme)?;
            css::build_rule(&parsed, &decls, &theme)
        })
        .collect();

    serde_json::to_string(&GenerateCssResult { class_name, rules }).unwrap_or_else(|_| "{\"className\":\"\",\"rules\":[]}".to_string())
}

#[wasm_bindgen]
pub fn generate_css(class_string: &str, theme_json: &str) -> String {
    resolve_class_string(class_string, theme_json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct RuleIn {
        rule: String,
        #[allow(dead_code)]
        order: f64,
    }

    #[derive(Deserialize)]
    struct ResultIn {
        #[serde(rename = "className")]
        class_name: String,
        rules: Vec<RuleIn>,
    }

    fn parse_result(json: &str) -> ResultIn {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn generates_css_for_a_full_class_string() {
        let theme_json = r##"{
            "colors": { "blue-6": "#2563eb", "blue-8": "#1e40af" },
            "spacing": { "4": 16 },
            "screens": {},
            "darkMode": "attribute"
        }"##;
        let result = parse_result(&generate_css("flex items-center bg-blue-6 p-4 dark:bg-blue-8", theme_json));
        assert_eq!(result.class_name, "flex items-center bg-blue-6 p-4 dark:bg-blue-8");
        let joined = result.rules.iter().map(|r| r.rule.as_str()).collect::<Vec<_>>().join("\n");

        assert!(joined.contains(".flex { display: flex }"));
        assert!(joined.contains(".items-center { align-items: center }"));
        assert!(joined.contains(".bg-blue-6 { background-color: rgba(37,99,235,var(--bg-opacity, 1))"));
        assert!(joined.contains(".p-4 { padding: 16px }"));
        assert!(joined.contains("[data-theme=\"dark\"] .dark\\:bg-blue-8"));
    }

    #[test]
    fn skips_unknown_classes_without_panicking() {
        let result = parse_result(&generate_css("totally-unknown-class", r#"{"colors":{},"spacing":{}}"#));
        assert!(result.rules.is_empty());
    }

    #[test]
    fn returns_original_class_string_and_no_rules_for_unparseable_theme_json() {
        let result = parse_result(&generate_css("flex", "not json"));
        assert_eq!(result.class_name, "flex");
        assert!(result.rules.is_empty());
    }

    #[test]
    fn expands_mode_aware_colors_into_light_and_dark_rules_and_returns_the_expanded_class_name() {
        let theme_json = r##"{
            "colors": { "surface": { "light": "#f9fafb", "dark": "#111827" } },
            "spacing": {},
            "screens": {},
            "darkMode": "attribute"
        }"##;
        let result = parse_result(&generate_css("bg-surface", theme_json));

        // The returned className must be the EXPANDED text — the whole point
        // of this test (and the bug it locks in): a caller using the
        // original "bg-surface" as its DOM className would never match
        // either of the rules below.
        assert_eq!(result.class_name, "bg-[#f9fafb] dark:bg-[#111827]");

        let joined = result.rules.iter().map(|r| r.rule.as_str()).collect::<Vec<_>>().join("\n");
        assert!(joined.contains("#f9fafb"));
        assert!(joined.contains("[data-theme=\"dark\"]"));
        assert!(joined.contains("#111827"));
    }

    #[test]
    fn responsive_class_uses_the_theme_screens_min_width() {
        let theme_json = r#"{"colors":{},"spacing":{},"screens":{"sm":640},"darkMode":"attribute"}"#;
        let result = parse_result(&generate_css("sm:flex", theme_json));
        assert_eq!(result.rules.len(), 1);
        assert!(result.rules[0].rule.starts_with("@media (min-width: 640px)"));
    }
}
