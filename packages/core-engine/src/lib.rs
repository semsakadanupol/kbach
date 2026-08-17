mod css;
#[cfg(target_os = "android")]
mod jni_bridge;
mod parser;
mod registry;
mod resolve_style;
mod resolvers;
mod theme;

use serde::Serialize;
use std::collections::BTreeMap;
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
        .flat_map(|token| {
            let parsed = parser::parse_class(token);
            let Some(decls) = resolvers::resolve_utility(&parsed, &theme) else {
                return Vec::new();
            };
            let mut out = Vec::new();
            // "animate-*" needs a second, independent top-level rule (its
            // `@keyframes` block) alongside the normal `animation: ...`
            // class rule below — see `css::build_keyframes_rule`'s doc
            // comment for why that can't go through `build_rule` at all.
            if let Some((name, body)) = resolvers::animation_keyframes(&parsed) {
                out.push(css::build_keyframes_rule(name, body));
            }
            if let Some(rule) = css::build_rule(&parsed, &decls, &theme) {
                // "container" needs its per-breakpoint `max-width` ladder
                // too — see `css::container_breakpoint_rules`'s doc comment
                // for why that can't be folded into `build_rule` itself.
                if parsed.utility == "container" {
                    out.extend(css::container_breakpoint_rules(&parsed, &theme, rule.order));
                }
                out.push(rule);
            }
            out
        })
        .collect();

    serde_json::to_string(&GenerateCssResult { class_name, rules }).unwrap_or_else(|_| "{\"className\":\"\",\"rules\":[]}".to_string())
}

#[wasm_bindgen]
pub fn generate_css(class_string: &str, theme_json: &str) -> String {
    resolve_class_string(class_string, theme_json)
}

/// `[data-kb~="..."]`-selector counterpart to `generate_css` — same
/// `{ className, rules }` shape, same resolution logic, only
/// `css::build_rule_for_attribute` instead of `css::build_rule` differs.
/// Exists for @kbach/react-native's Expo Web path: `react-native-web`'s
/// `View`/`Text`/`Pressable` don't forward an arbitrary `className` prop to
/// the DOM at all (confirmed against its `forwardedProps` prop whitelist —
/// `className` isn't in it), but they DO forward `dataSet` (-> real `data-*`
/// attributes), so the caller renders `dataSet={{ kb: className }}` instead
/// and needs matching attribute-selector rules to select against it — see
/// `css::SelectorMode`'s own doc comment for the full reasoning. Never
/// called from the Android JNI bridge or `@kbach/react` (real DOM, `className`
/// works there natively) — Expo Web's own dedicated entry point only.
pub(crate) fn resolve_class_string_for_attribute(class_string: &str, theme_json: &str) -> String {
    let theme: ThemeConfig = match serde_json::from_str(theme_json) {
        Ok(t) => t,
        Err(_) => {
            let fallback = GenerateCssResult { class_name: class_string.to_string(), rules: vec![] };
            return serde_json::to_string(&fallback).unwrap_or_else(|_| "{\"className\":\"\",\"rules\":[]}".to_string());
        }
    };

    let class_name = resolvers::expand_mode_aware_color_classes(class_string, &theme);

    let rules: Vec<css::BuiltRule> = class_name
        .split_whitespace()
        .flat_map(|token| {
            let parsed = parser::parse_class(token);
            let Some(decls) = resolvers::resolve_utility(&parsed, &theme) else {
                return Vec::new();
            };
            let mut out = Vec::new();
            if let Some((name, body)) = resolvers::animation_keyframes(&parsed) {
                out.push(css::build_keyframes_rule(name, body));
            }
            if let Some(rule) = css::build_rule_for_attribute(&parsed, &decls, &theme) {
                if parsed.utility == "container" {
                    out.extend(css::container_breakpoint_rules_for_attribute(&parsed, &theme, rule.order));
                }
                out.push(rule);
            }
            out
        })
        .collect();

    serde_json::to_string(&GenerateCssResult { class_name, rules }).unwrap_or_else(|_| "{\"className\":\"\",\"rules\":[]}".to_string())
}

#[wasm_bindgen]
pub fn generate_css_attr(class_string: &str, theme_json: &str) -> String {
    resolve_class_string_for_attribute(class_string, theme_json)
}

/// WASM counterpart to the Android JNI bridge's `resolveStyle` — resolves
/// `class_string` to a flat, RN-`StyleSheet`-shaped JSON style object
/// instead of CSS rule text, for @kbach/react-native's Expo Web /
/// react-native-web fallback path (see packages/react-native/src/webBridge.ts).
/// react-native-web's `View`/`Text` accept an RN-style `style` OBJECT (which
/// react-native-web itself converts to real DOM CSS internally) — the same
/// shape the JNI bridge already produces for real native, NOT the CSS-text
/// shape `generate_css` above produces for plain DOM `@kbach/react`.
/// Delegates to the exact same `resolve_style::resolve_style_json` the JNI
/// bridge calls — zero duplicated resolution logic between the two
/// style-object FFI entry points, only the argument marshaling differs.
#[wasm_bindgen]
pub fn resolve_style_json(class_string: &str, theme_json: &str, color_scheme: &str, pressed: bool, width: f64) -> String {
    resolve_style::resolve_style_json(class_string, theme_json, color_scheme, pressed, width)
}

/// Serializes `theme::DEFAULT_COLORS` (Phase 16) to a flat JSON object —
/// consumed at build time (not runtime; see that const's own doc comment)
/// by `scripts/generate-palette.mjs` via the Node-target build of this
/// same `#[wasm_bindgen]` export, which is what makes this usable without
/// an async init step. `BTreeMap` (alphabetical key order) rather than
/// `DEFAULT_COLORS`'s own family-grouped order — fine for a generated
/// file nobody hand-edits, and deterministic across regenerations either way.
#[wasm_bindgen]
pub fn default_colors_json() -> String {
    let map: BTreeMap<&str, &str> = theme::DEFAULT_COLORS.iter().copied().collect();
    serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string())
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
    fn container_emits_the_base_rule_plus_a_max_width_rule_per_configured_breakpoint() {
        let theme_json = r##"{
            "colors": {},
            "spacing": {},
            "screens": { "sm": 640, "md": 768, "lg": 1024, "xl": 1280, "2xl": 1536 },
            "darkMode": "attribute"
        }"##;
        let result = parse_result(&generate_css("container", theme_json));
        assert_eq!(result.rules.len(), 6);
        let base = result.rules.iter().find(|r| r.rule == ".container { width: 100% }").expect("base rule");
        let joined = result.rules.iter().map(|r| r.rule.as_str()).collect::<Vec<_>>().join("\n");
        // Downstream consumers (e.g. `format.ts`) sort injected rules by
        // `order` before writing them to the stylesheet, so the base rule
        // must sort ahead of every breakpoint rung and the rungs must sort
        // narrowest-to-widest among themselves — otherwise a wider rung's
        // `max-width` could land BEFORE a narrower one and lose the
        // cascade at every viewport width.
        let mut widths_in_order_order: Vec<(f64, &str)> = Vec::new();
        for width in ["640px", "768px", "1024px", "1280px", "1536px"] {
            let expected = format!("@media (min-width: {width}) {{ .container {{ max-width: {width} }} }}");
            assert!(joined.contains(&expected), "{joined}");
            let rule = result.rules.iter().find(|r| r.rule == expected).unwrap();
            assert!(rule.order > base.order, "breakpoint rung for {width} must sort after the base rule");
            widths_in_order_order.push((rule.order, width));
        }
        let mut sorted = widths_in_order_order.clone();
        sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        assert_eq!(widths_in_order_order, sorted, "breakpoint rungs must sort narrowest-to-widest");
    }

    #[test]
    fn emits_both_the_animation_rule_and_its_keyframes_block() {
        let result = parse_result(&generate_css("animate-spin", r#"{"colors":{},"spacing":{}}"#));
        assert_eq!(result.rules.len(), 2);
        let joined = result.rules.iter().map(|r| r.rule.as_str()).collect::<Vec<_>>().join("\n");
        assert!(joined.contains(".animate-spin { animation: kb-spin 1s linear infinite }"));
        assert!(joined.contains("@keyframes kb-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }"));
    }

    #[test]
    fn animate_none_emits_only_the_animation_rule_no_keyframes_block() {
        let result = parse_result(&generate_css("animate-none", r#"{"colors":{},"spacing":{}}"#));
        assert_eq!(result.rules.len(), 1);
        assert!(result.rules[0].rule.contains("animation: none"));
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

    #[test]
    fn generates_a_before_pseudo_element_rule_with_auto_injected_content_end_to_end() {
        // Full pipeline (parse -> resolve -> build_rule), not just css.rs's
        // own unit tests — confirms `before:` genuinely reaches a real
        // element through `generate_css`, the same entry point
        // `@kbach/react`'s runtime CSS injector calls.
        let result = parse_result(&generate_css("before:content-[Hi] before:block", r#"{"colors":{},"spacing":{}}"#));
        let joined = result.rules.iter().map(|r| r.rule.as_str()).collect::<Vec<_>>().join("\n");
        assert!(joined.contains("::before"), "got: {joined}");
        assert!(joined.contains("--kb-content: \"Hi\""), "got: {joined}");
        assert!(joined.contains("content: var(--kb-content, \"\")"), "got: {joined}");
        assert!(joined.contains("display: block"), "got: {joined}");
    }

    #[test]
    fn wasm_resolve_style_json_matches_the_jni_bridges_style_object_shape() {
        let theme_json = r##"{
            "colors": { "blue-6": "#2563eb", "blue-8": "#1e40af" },
            "spacing": { "4": 16 },
            "screens": { "sm": 640 },
            "darkMode": "attribute"
        }"##;

        let light = resolve_style_json("flex bg-blue-6 dark:bg-blue-8 p-4", theme_json, "light", false, 400.0);
        let parsed: serde_json::Value = serde_json::from_str(&light).unwrap();
        assert_eq!(parsed["display"], "flex");
        assert_eq!(parsed["backgroundColor"], "#2563eb");
        assert_eq!(parsed["padding"], 16.0);

        let dark = resolve_style_json("bg-blue-6 dark:bg-blue-8", theme_json, "dark", false, 400.0);
        let parsed: serde_json::Value = serde_json::from_str(&dark).unwrap();
        assert_eq!(parsed["backgroundColor"], "#1e40af");

        // Same width-gated responsive behavior as the JNI path.
        let narrow = resolve_style_json("sm:flex", theme_json, "light", false, 400.0);
        assert_eq!(narrow, "{}");
        let wide = resolve_style_json("sm:flex", theme_json, "light", false, 800.0);
        let parsed: serde_json::Value = serde_json::from_str(&wide).unwrap();
        assert_eq!(parsed["display"], "flex");
    }

    #[test]
    fn generate_css_attr_emits_data_kb_attribute_selectors_instead_of_class_selectors() {
        let theme_json = r##"{
            "colors": { "blue-6": "#2563eb", "blue-8": "#1e40af" },
            "spacing": { "4": 16 },
            "screens": {},
            "darkMode": "attribute"
        }"##;
        let result = parse_result(&generate_css_attr("flex bg-blue-6 hover:bg-blue-8", theme_json));
        assert_eq!(result.class_name, "flex bg-blue-6 hover:bg-blue-8");
        let joined = result.rules.iter().map(|r| r.rule.as_str()).collect::<Vec<_>>().join("\n");

        assert!(joined.contains("[data-kb~=\"flex\"] { display: flex }"));
        assert!(joined.contains("[data-kb~=\"hover:bg-blue-8\"]:hover"));
        // No `.class`-shaped selectors should leak into attribute mode.
        assert!(!joined.contains(".flex {"));
        assert!(!joined.contains(".hover"));
    }

    #[test]
    fn generate_css_attr_returns_original_class_string_and_no_rules_for_unparseable_theme_json() {
        let result = parse_result(&generate_css_attr("flex", "not json"));
        assert_eq!(result.class_name, "flex");
        assert!(result.rules.is_empty());
    }

    #[test]
    fn default_colors_json_returns_valid_json_with_every_entry() {
        let json = default_colors_json();
        let parsed: std::collections::HashMap<String, String> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.len(), theme::DEFAULT_COLORS.len());
        assert_eq!(parsed.get("blue-6").map(String::as_str), Some("#3b82f6"));
        assert_eq!(parsed.get("gray-1").map(String::as_str), Some("#f9fafb"));
        assert_eq!(parsed.get("transparent").map(String::as_str), Some("transparent"));
    }

    #[test]
    fn default_colors_has_no_duplicate_keys() {
        let mut keys: Vec<&str> = theme::DEFAULT_COLORS.iter().map(|(k, _)| *k).collect();
        let before = keys.len();
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), before, "DEFAULT_COLORS has a duplicate key");
    }
}
