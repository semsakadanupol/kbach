mod calc;
mod css;
#[cfg(target_os = "android")]
mod jni_bridge;
mod parser;
mod registry;
mod resolve_style;
mod resolvers;
mod suggest;
mod theme;

use serde::Serialize;
use std::collections::BTreeMap;
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
    let theme = match theme::parse_theme_cached(theme_json) {
        Some(t) => t,
        None => {
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
    let theme = match theme::parse_theme_cached(theme_json) {
        Some(t) => t,
        None => {
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

/// "Did you mean …?" for a class that resolves to nothing: a Tailwind CSS
/// shade mapped to Kbach's (`bg-blue-500` → `bg-blue-6`), else a one-edit
/// typo fix. Empty string when there's no suggestion, or the class already
/// resolves. See suggest.rs. Used by the Vite/PostCSS plugin's
/// unknown-class warning and kbach-vscode's quick fix.
#[wasm_bindgen]
pub fn suggest_class(token: &str, theme_json: &str) -> String {
    theme::parse_theme_cached(theme_json).and_then(|t| suggest::suggest_class(token, &t)).unwrap_or_default()
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

/// Modifiers the static registry doesn't list. Regression: they used to be
/// skipped, so the rule applied unconditionally (a typo like
/// `hovr:bg-blue-6` painted always; `nth-3:`/`max-md:`/`3xl:`/`@md/main:`
/// ignored their condition).
#[cfg(test)]
mod modifier_resolution_tests {
    use super::*;

    const THEME: &str = r##"{"colors":{"blue-6":"#2563eb"},"spacing":{},"screens":{"sm":640,"md":768,"lg":1024,"xl":1280,"2xl":1536,"3xl":1920},"fontFamily":{},"darkMode":"class","container":{}}"##;

    fn rules(class: &str) -> Vec<String> {
        let v: serde_json::Value = serde_json::from_str(&generate_css(class, THEME)).unwrap();
        v["rules"].as_array().unwrap().iter().map(|r| r["rule"].as_str().unwrap().to_string()).collect()
    }
    fn only_rule(class: &str) -> String {
        let r = rules(class);
        assert_eq!(r.len(), 1, "{class}: {r:?}");
        r[0].clone()
    }

    #[test]
    fn an_unknown_modifier_produces_no_rule_instead_of_applying_always() {
        for class in ["hovr:bg-blue-6", "madeup:p-4", "foo:bar:flex", "max-nope:p-4", "@md/:p-4"] {
            assert!(rules(class).is_empty(), "{class} must produce nothing, got {:?}", rules(class));
        }
        // real modifiers are unaffected
        assert!(only_rule("hover:bg-blue-6").contains(":hover"));
    }

    #[test]
    fn numeric_nth_modifiers() {
        assert!(only_rule("nth-3:p-4").contains(":nth-child(3)"));
        assert!(only_rule("nth-last-2:p-4").contains(":nth-last-child(2)"));
        assert!(only_rule("nth-of-type-4:p-4").contains(":nth-of-type(4)"));
        assert!(only_rule("nth-last-of-type-1:p-4").contains(":nth-last-of-type(1)"));
        assert!(only_rule("nth-[2n+1]:p-4").contains(":nth-child(2n+1)"));
    }

    #[test]
    fn max_breakpoints_and_ranges() {
        assert!(only_rule("max-md:p-4").starts_with("@media (width < 768px)"));
        let range = only_rule("md:max-xl:p-4");
        assert!(range.contains("@media (min-width: 768px)") && range.contains("@media (width < 1280px)"), "{range}");
        // strictly below, like max-md: it never overlaps min-[600px]
        assert!(only_rule("max-[600px]:p-4").starts_with("@media (width < 600px)"));
    }

    #[test]
    fn custom_config_breakpoints() {
        // `extend.screens: { '3xl': 1920 }` — the documented config shape
        assert!(only_rule("3xl:p-4").starts_with("@media (min-width: 1920px)"));
        assert!(only_rule("max-3xl:p-4").starts_with("@media (width < 1920px)"));
    }

    #[test]
    fn named_container_queries() {
        // the container scale (@md is 28rem), not the screens (md is 768px)
        assert!(only_rule("@md/main:p-4").starts_with("@container main (min-width: 28rem)"));
        assert!(only_rule("@max-md/main:p-4").starts_with("@container main (width < 28rem)"));
        assert!(only_rule("@min-md/main:p-4").starts_with("@container main (min-width: 28rem)"));
        assert!(only_rule("@[400px]/main:p-4").starts_with("@container main (min-width: 400px)"));
        assert!(only_rule("@max-[400px]/main:p-4").starts_with("@container main (width < 400px)"));
        // the bracket goes into the at-rule, so it gets the arbitrary-value check
        assert!(rules("@min-[1px){}body{color:red]/main:p-4").is_empty());
        assert!(only_rule("@min-[400px]/card:p-4").starts_with("@container card (min-width: 400px)"));
        assert!(only_rule("@md:p-4").starts_with("@container (min-width: 28rem)"));
        assert!(only_rule("@3xs:p-4").starts_with("@container (min-width: 16rem)"));
        assert!(only_rule("@max-sm:p-4").starts_with("@container (width < 24rem)"));
        assert!(only_rule("@min-sm:p-4").starts_with("@container (min-width: 24rem)"));
        assert!(only_rule("@[400px]:p-4").starts_with("@container (min-width: 400px)"));
        let named = only_rule("@container/main");
        assert!(named.contains("container-type: inline-size") && named.contains("container-name: main"), "{named}");
    }

    /// Regression: these passed any value straight through, so `z-banana`
    /// wrote `z-index: banana` (and never counted as an unknown class), and
    /// the real Tailwind keywords `order-first`/`-last`/`-none` wrote
    /// `order: first`, which isn't CSS.
    #[test]
    fn number_utilities_accept_only_numbers_and_their_keywords() {
        for class in ["z-banana", "order-banana", "grow-banana", "shrink-banana", "duration-banana", "delay-fast", "z-1.5"] {
            assert!(rules(class).is_empty(), "{class} must produce nothing, got {:?}", rules(class));
        }
        assert!(only_rule("z-50").contains("z-index: 50"));
        assert!(only_rule("z-auto").contains("z-index: auto"));
        assert!(only_rule("-z-10").contains("z-index: -10"));
        assert!(only_rule("z-[60]").contains("z-index: 60"));
        assert!(only_rule("order-first").contains("order: -9999"));
        assert!(only_rule("order-last").contains("order: 9999"));
        assert!(only_rule("order-none").contains("order: 0"));
        assert!(only_rule("-order-2").contains("order: -2"));
        assert!(only_rule("grow").contains("flex-grow: 1"));
        assert!(only_rule("grow-2").contains("flex-grow: 2"));
        assert!(only_rule("shrink-0").contains("flex-shrink: 0"));
        assert!(only_rule("duration-150").contains("transition-duration: 150ms"));
        assert!(only_rule("duration-[2s]").contains("transition-duration: 2s"));
        assert!(only_rule("delay-75").contains("transition-delay: 75ms"));
    }

    /// Regression: an arbitrary value went to whichever property the
    /// utility tried first, and type hints stayed inside the value, so
    /// `bg-[linear-gradient(…)]` became background-color, `text-[clamp(…)]`
    /// a color, `stroke-[2.5]` the stroke color, and `text-[color:var(--x)]`
    /// wrote `color: color:var(--x)`.
    #[test]
    fn arbitrary_values_go_to_the_right_property() {
        let has = |class: &str, decl: &str| {
            let r = only_rule(class);
            assert!(r.contains(decl), "{class}: expected `{decl}` in {r}");
        };
        has("bg-[linear-gradient(red,blue)]", "background-image: linear-gradient(red,blue)");
        has("bg-[radial-gradient(circle,red,blue)]", "background-image: radial-gradient(circle,red,blue)");
        has("bg-[image:var(--x)]", "background-image: var(--x)");
        has("bg-[color:var(--x)]", "background-color: var(--x)");
        has("bg-[length:200px_100px]", "background-size: 200px 100px");
        has("bg-[position:center_top]", "background-position: center top");
        has("text-[clamp(1rem,2vw,3rem)]", "font-size: clamp(1rem, 2vw, 3rem)");
        has("text-[length:var(--x)]", "font-size: var(--x)");
        has("text-[color:var(--x)]", "color: var(--x)");
        has("stroke-[2.5]", "stroke-width: 2.5");
        has("stroke-[color:var(--x)]", "stroke: var(--x)");
        has("border-[length:var(--x)]", "border-width: var(--x)");
        has("border-[color:var(--x)]", "border-color: var(--x)");
        has("ring-[3px]", "--kb-ring-width: 3px");
        has("-rotate-[30deg]", "rotate(-30deg)");
        has("-rotate-[-30deg]", "rotate(30deg)");
        has("-rotate-[var(--a)]", "rotate(calc(var(--a) * -1))");
        has("-skew-x-[5deg]", "skewX(-5deg)");
        // unchanged
        has("text-[22px]", "font-size: 22px");
        has("bg-[url(/a.png)]", "background-image: url(/a.png)");
        has("content-['a:b']", "--kb-content: 'a:b'");
        has("w-[calc(100%/3)]", "width: calc(100%/3)");
    }

    /// `transition-[…]`: a bracketed property list. Produced nothing before.
    #[test]
    fn transition_with_a_property_list() {
        let r = only_rule("transition-[width]");
        assert!(r.contains("transition-property: width") && r.contains("var(--kb-duration, 150ms)"), "{r}");
        assert!(only_rule("transition-[opacity,transform]").contains("transition-property: opacity, transform"));
        for class in ["transition-[width;color:red]", "transition-[]", "transition-[a{b}]"] {
            assert!(rules(class).is_empty(), "{class} must produce nothing, got {:?}", rules(class));
        }
    }

    /// Tailwind CSS v4 forms that used to produce nothing.
    #[test]
    fn tailwind_v4_syntax() {
        let has = |class: &str, decl: &str| {
            let r = only_rule(class);
            assert!(r.contains(decl), "{class}: expected `{decl}` in {r}");
        };
        has("p-4!", "padding: 16px !important");
        has("hover:bg-blue-6!", "!important");
        has("p-(--gap)", "padding: var(--gap)");
        has("text-(length:--size)", "font-size: var(--size)");
        has("text-(color:--ink)", "color: var(--ink)");
        has("bg-(--brand)/50", "color-mix(in srgb, var(--brand) 50%, transparent)");
        has("bg-[#c7a25d]/40", "rgba(199,162,93,0.4)");
        has("bg-[#fff]/50", "rgba(255,255,255,0.5)");
        has("text-[rgb(0_0_0)]/25", "color-mix(in srgb, rgb(0 0 0) 25%, transparent)");
        for class in ["w-[10px]/50", "bg-[url(/a.png)]/50", "p-(gap)", "bg-(--a b)"] {
            assert!(rules(class).is_empty(), "{class} must produce nothing, got {:?}", rules(class));
        }
    }

    #[test]
    fn native_evaluates_custom_and_max_breakpoints() {
        let t: crate::theme::ThemeConfig = serde_json::from_str(THEME).unwrap();
        let at = |class: &str, width: f64| crate::resolve_style::resolve_style(class, &t, "light", false, width);
        assert!(at("max-md:p-4", 500.0).contains_key("padding"));
        assert!(!at("max-md:p-4", 800.0).contains_key("padding"));
        assert!(at("3xl:p-4", 2000.0).contains_key("padding"));
        assert!(!at("3xl:p-4", 1500.0).contains_key("padding"));
        assert!(!at("hovr:p-4", 800.0).contains_key("padding"));
        assert!(!at("@container/main", 800.0).contains_key("containerName"));
    }
}

/// Gaps found while writing the docs site (2026-11-11): each of these used
/// to produce no CSS at all, or the wrong property.
#[cfg(test)]
mod docs_gap_tests {
    use super::*;

    const THEME: &str = r##"{"colors":{"blue-6":"#2563eb"},"spacing":{},"screens":{"sm":640,"md":768},"fontFamily":{},"darkMode":"class","container":{}}"##;

    fn rule(class: &str) -> String {
        let v: serde_json::Value = serde_json::from_str(&generate_css(class, THEME)).unwrap();
        let r: Vec<String> = v["rules"].as_array().unwrap().iter().map(|r| r["rule"].as_str().unwrap().to_string()).collect();
        assert_eq!(r.len(), 1, "{class}: {r:?}");
        r[0].clone()
    }
    fn none(class: &str) {
        let v: serde_json::Value = serde_json::from_str(&generate_css(class, THEME)).unwrap();
        assert!(v["rules"].as_array().unwrap().is_empty(), "{class} must produce nothing, got {v}");
    }
    fn native(class: &str) -> std::collections::HashMap<String, serde_json::Value> {
        let t: crate::theme::ThemeConfig = serde_json::from_str(THEME).unwrap();
        crate::resolve_style::resolve_style(class, &t, "light", false, 400.0).into_iter().collect()
    }

    #[test]
    fn text_size_with_a_line_height() {
        let r = rule("text-sm/6");
        assert!(r.contains("font-size: 0.875rem") && r.contains("line-height: 1.5rem") && !r.contains("--kb-leading"), "{r}");
        assert!(rule("text-lg/tight").contains("line-height: 1.25"));
        assert!(rule("text-sm/[20px]").contains("line-height: 20px"));
        assert!(rule("text-sm/[calc(1em+2px)]").contains("line-height: calc(1em + 2px)"));
        assert!(rule("text-sm/(--lh)").contains("line-height: var(--lh)"));
        // a color's opacity is still a color, and nonsense after the slash is nothing
        assert!(rule("text-blue-6/50").contains("color"));
        none("text-sm/banana");
        none("text-sm/");
        none("text-sm/[a;b]");
    }

    #[test]
    fn text_size_with_a_line_height_on_native() {
        let s = native("text-sm/6");
        assert!(s.contains_key("fontSize") && s.contains_key("lineHeight"), "{s:?}");
        let tight = native("text-sm/tight");
        assert_eq!(tight.get("lineHeight"), native("text-sm/[1.25]").get("lineHeight"), "a multiplier is multiplied out by the size");
        assert!(!native("text-sm/(--lh)").contains_key("lineHeight"));
    }

    #[test]
    fn arbitrary_font_is_a_weight_when_it_is_a_number() {
        assert!(rule("font-[550]").contains("font-weight: 550"));
        assert!(rule("font-(--w)").contains("font-weight: var(--w)"));
        assert!(rule("font-[number:var(--w)]").contains("font-weight: var(--w)"));
        assert!(rule("font-[Inter]").contains("font-family: Inter"));
        assert!(rule("font-[Inter,_sans-serif]").contains("font-family: Inter, sans-serif"));
        assert!(rule("font-(family-name:--f)").contains("font-family: var(--f)"));
        assert!(rule("font-[generic-name:serif]").contains("font-family: serif"));
        assert_eq!(native("font-[600]").get("fontWeight").map(|v| v.to_string()), Some("\"600\"".to_string()));
        assert!(!native("font-[550]").contains_key("fontWeight"), "React Native takes only the hundreds");
    }

    #[test]
    fn arbitrary_object_position() {
        assert!(rule("object-[25%_75%]").contains("object-position: 25% 75%"));
        assert!(rule("object-(--pos)").contains("object-position: var(--pos)"));
        assert!(rule("object-left-top").contains("object-position: left top"));
        assert!(rule("object-cover").contains("object-fit: cover"));
    }

    #[test]
    fn duration_initial() {
        let r = rule("duration-initial");
        assert!(r.contains("--kb-duration: initial") && !r.contains("transition-duration"), "{r}");
        assert!(rule("duration-150").contains("transition-duration: 150ms"));
        none("duration-banana");
    }

    #[test]
    fn vertical_align_keywords_and_any_value() {
        for (class, v) in [("align-middle", "middle"), ("align-text-top", "text-top"), ("align-super", "super"), ("align-[4px]", "4px"), ("align-(--a)", "var(--a)")] {
            assert!(rule(class).contains(&format!("vertical-align: {v}")), "{class}");
        }
        none("align-banana");
    }
}

/// Variants that produced no CSS before 1.0.0-beta.19.
#[cfg(test)]
mod variant_gap_tests {
    use super::*;

    const THEME: &str = r##"{"colors":{"blue-6":"#2563eb"},"spacing":{},"screens":{"sm":640,"md":768},"fontFamily":{},"darkMode":"class","container":{}}"##;

    fn rule(class: &str) -> String {
        let v: serde_json::Value = serde_json::from_str(&generate_css(class, THEME)).unwrap();
        let r: Vec<String> = v["rules"].as_array().unwrap().iter().map(|r| r["rule"].as_str().unwrap().to_string()).collect();
        assert_eq!(r.len(), 1, "{class}: {r:?}");
        r[0].clone()
    }
    fn none(class: &str) {
        let v: serde_json::Value = serde_json::from_str(&generate_css(class, THEME)).unwrap();
        assert!(v["rules"].as_array().unwrap().is_empty(), "{class} must produce nothing, got {v}");
    }

    #[test]
    fn min_breakpoint_is_the_breakpoint_spelled_out() {
        assert_eq!(rule("min-md:p-4").replace("min-md\\:", "md\\:"), rule("md:p-4"));
        none("min-nope:p-4");
        let t: crate::theme::ThemeConfig = serde_json::from_str(THEME).unwrap();
        assert!(crate::resolve_style::resolve_style("min-md:p-4", &t, "light", false, 800.0).contains_key("padding"));
        assert!(!crate::resolve_style::resolve_style("min-md:p-4", &t, "light", false, 700.0).contains_key("padding"));
    }

    #[test]
    fn bare_data_attribute_variants() {
        assert!(rule("data-open:p-4").contains(":p-4[data-open] {"));
        assert!(rule("data-[state=open]:p-4").contains("[data-state=\"open\"]"), "the bracket form still works");
        assert!(rule("not-data-open:p-4").contains(":not([data-open])"));
        none("data-:p-4");
    }

    #[test]
    fn group_and_peer_take_any_condition_on_themselves() {
        assert!(rule("group-data-[state=open]:p-4").starts_with(".group[data-state=\"open\"] "));
        assert!(rule("group-data-open:p-4").starts_with(".group[data-open] "));
        assert!(rule("group-aria-[sort=ascending]:p-4").starts_with(".group[aria-sort=\"ascending\"] "));
        assert!(rule("group-aria-expanded:p-4").starts_with(".group[aria-expanded=\"true\"] "));
        assert!(rule("peer-data-open:p-4").starts_with(".peer[data-open] ~ "));
        assert!(rule("group-has-checked:p-4").starts_with(".group:has(*:checked) "));
        assert!(rule("group-nth-2:p-4").starts_with(".group:nth-child(2) "));
        assert!(rule("group-data-open/menu:p-4").starts_with(".group\\/menu[data-open] "));
        assert!(rule("in-data-open:p-4").starts_with(":where([data-open]) "));
        // still nothing for things that aren't a condition on the element itself
        none("group-dark:p-4");
        none("group-md:p-4");
        none("group-before:p-4");
    }

    #[test]
    fn has_takes_a_variant_name() {
        assert!(rule("has-checked:p-4").contains(":has(*:checked)"));
        assert!(rule("has-focus-visible:p-4").contains(":has(*:focus-visible)"));
        assert!(rule("has-[img]:p-4").contains(":has(img)"), "the bracket form still works");
        none("has-nope:p-4");
    }

    #[test]
    fn color_scheme_and_scripting_media_variants() {
        assert!(rule("forced-colors:p-4").starts_with("@media (forced-colors: active)"));
        assert!(rule("inverted-colors:p-4").starts_with("@media (inverted-colors: inverted)"));
        assert!(rule("noscript:p-4").starts_with("@media (scripting: none)"));
        assert!(rule("not-forced-colors:p-4").starts_with("@media not (forced-colors: active)"));
        assert!(rule("not-print:p-4").starts_with("@media not print"));
        // not-dark / not-<breakpoint> produced nothing before 1.0.0-beta.19
        // (THEME's strategy is `class`)
        assert_eq!(rule("not-dark:p-4"), ".not-dark\\:p-4:not(.dark *) { padding: 16px }");
        assert!(rule("not-md:p-4").starts_with("@media not (min-width: 768px)"));
        assert!(rule("not-max-md:p-4").starts_with("@media not (width < 768px)"));
        none("not-nope:p-4");
    }
}

/// What a comparison against Tailwind CSS 4.3.5's own output found on
/// 2026-11-14: forms that produced nothing, and forms that produced the
/// wrong CSS. Fixed in 1.0.0-beta.19.
#[cfg(test)]
mod tailwind_4_3_gap_tests {
    use super::*;

    const THEME: &str = r##"{"colors":{"blue-6":"#2563eb","white":"#ffffff"},"spacing":{},"screens":{"sm":640,"md":768},"fontFamily":{},"darkMode":"media","container":{}}"##;

    fn rules(class: &str) -> Vec<String> {
        let v: serde_json::Value = serde_json::from_str(&generate_css(class, THEME)).unwrap();
        v["rules"].as_array().unwrap().iter().map(|r| r["rule"].as_str().unwrap().to_string()).collect()
    }
    fn rule(class: &str) -> String {
        let r = rules(class);
        assert_eq!(r.len(), 1, "{class}: {r:?}");
        r[0].clone()
    }
    fn none(class: &str) {
        assert!(rules(class).is_empty(), "{class} must produce nothing");
    }
    /// The declarations of a class with no variant.
    fn decls(class: &str) -> String {
        let r = rule(class);
        r[r.find('{').unwrap() + 2..r.len() - 2].to_string()
    }

    #[test]
    fn numeric_filters_use_their_number() {
        assert!(decls("grayscale-50").starts_with("--kb-grayscale: grayscale(50%)"));
        assert!(decls("invert-20").starts_with("--kb-invert: invert(20%)"));
        assert!(decls("sepia-50").starts_with("--kb-sepia: sepia(50%)"));
        assert!(decls("backdrop-grayscale-50").starts_with("--kb-backdrop-grayscale: grayscale(50%)"));
        assert!(decls("backdrop-invert-20").starts_with("--kb-backdrop-invert: invert(20%)"));
        assert!(decls("backdrop-sepia-50").starts_with("--kb-backdrop-sepia: sepia(50%)"));
        assert!(decls("grayscale").starts_with("--kb-grayscale: grayscale(100%)"));
        assert!(decls("grayscale-0").starts_with("--kb-grayscale: grayscale(0)"));
        none("grayscale-banana");
        // bare `filter` / `backdrop-filter` turn the composed value on
        assert!(decls("filter").starts_with("filter: var(--kb-blur,)"));
        assert!(decls("backdrop-filter").starts_with("backdrop-filter: var(--kb-backdrop-blur,)"));
    }

    #[test]
    fn a_leading_minus_is_applied() {
        assert_eq!(decls("-col-start-2"), "grid-column-start: -2");
        assert_eq!(decls("-col-end-1"), "grid-column-end: -1");
        assert_eq!(decls("-row-start-3"), "grid-row-start: -3");
        assert_eq!(decls("-row-end-1"), "grid-row-end: -1");
        assert_eq!(decls("-col-start-[2]"), "grid-column-start: -2");
        assert_eq!(decls("-outline-offset-2"), "outline-offset: -2px");
        assert_eq!(decls("-outline-offset-[3px]"), "outline-offset: -3px");
        assert_eq!(decls("-underline-offset-2"), "text-underline-offset: -2px");
        assert_eq!(decls("-underline-offset-(--o)"), "text-underline-offset: calc(var(--o) * -1)");
        assert_eq!(decls("-tracking-wide"), "letter-spacing: -0.025em");
        assert_eq!(decls("-tracking-tight"), "letter-spacing: 0.025em");
        assert_eq!(decls("-tracking-[0.1em]"), "letter-spacing: -0.1em");
        assert_eq!(decls("-bg-linear-45"), "background-image: linear-gradient(-45deg, var(--kb-gradient-stops))");
        assert_eq!(decls("-bg-conic-180"), "background-image: conic-gradient(from -180deg, var(--kb-gradient-stops))");
        assert!(decls("-scale-x-100").starts_with("--kb-scale-x: scaleX(-1)"));
        none("-col-start-auto");
        none("-bg-linear-to-r");
        none("-bg-cover");
    }

    #[test]
    fn opacity_modifier_forms() {
        assert_eq!(decls("bg-[#ff0000]/[0.37]"), "background-color: rgba(255,0,0,0.37)");
        assert_eq!(decls("bg-[#ff0000]/[37%]"), "background-color: rgba(255,0,0,0.37)");
        assert_eq!(decls("bg-[#ff0000]/2.5"), "background-color: rgba(255,0,0,0.025)");
        assert_eq!(decls("bg-[#ff0000]/(--o)"), "background-color: color-mix(in srgb, #ff0000 var(--o), transparent)");
        assert_eq!(decls("bg-blue-6/[0.37]"), "background-color: rgba(37,99,235,0.37)");
        assert_eq!(decls("bg-blue-6/[37%]"), "background-color: rgba(37,99,235,0.37)");
        assert_eq!(decls("bg-white/2.5"), "background-color: rgba(255,255,255,0.025)");
        assert_eq!(decls("bg-blue-6/(--o)"), "background-color: color-mix(in srgb, #2563eb var(--o), transparent)");
        assert_eq!(decls("bg-blue-6/57"), "background-color: rgba(37,99,235,0.57)");
        assert_eq!(decls("text-(--c)/50"), "color: color-mix(in srgb, var(--c) 50%, transparent)");
        // not an opacity
        none("bg-blue-6/[20px]");
        none("bg-blue-6/150");
        none("w-[10px]/50");
        // a slash inside the brackets is not a modifier
        assert_eq!(decls("w-[calc(100%/3)]"), "width: calc(100%/3)");
    }

    #[test]
    fn arbitrary_text_size_with_a_line_height() {
        assert_eq!(decls("text-[14px]/[20px]"), "font-size: 14px; line-height: 20px");
        assert_eq!(decls("text-[14px]/6"), "font-size: 14px; line-height: 1.5rem");
        assert_eq!(decls("text-[14px]/(--lh)"), "font-size: 14px; line-height: var(--lh)");
        none("text-[14px]/banana");
    }

    #[test]
    fn arbitrary_shadow_colors_set_the_color() {
        assert_eq!(decls("shadow-[#333]"), "--kb-shadow-color: #333");
        assert_eq!(decls("shadow-[color:red]"), "--kb-shadow-color: red");
        assert_eq!(decls("shadow-(color:--c)"), "--kb-shadow-color: var(--c)");
        assert_eq!(decls("shadow-[#333]/50"), "--kb-shadow-color: rgba(51,51,51,0.5)");
        assert_eq!(decls("inset-shadow-[#333]"), "--kb-inset-shadow-color: #333");
        assert_eq!(decls("text-shadow-[#333]"), "--kb-text-shadow-color: #333");
        assert!(decls("drop-shadow-[#333]").starts_with("--kb-drop-shadow-color: #333; --kb-drop-shadow: var(--kb-drop-shadow-size,)"));
        // a whole shadow, and a bare variable, are still the shadow itself
        assert!(decls("shadow-[0_4px_6px_red]").starts_with("--kb-shadow: 0 4px 6px red;"));
        assert!(decls("shadow-(--s)").starts_with("--kb-shadow: var(--s);"));
        assert_eq!(decls("text-shadow-(--t)"), "text-shadow: var(--t)");
    }

    #[test]
    fn shadow_sizes_take_an_opacity() {
        assert!(decls("shadow-xl/20").starts_with("--kb-shadow: 0 20px 25px -5px var(--kb-shadow-color, rgb(0 0 0 / 0.2)), 0 8px 10px -6px var(--kb-shadow-color, rgb(0 0 0 / 0.2));"));
        assert!(decls("inset-shadow-sm/50").starts_with("--kb-inset-shadow: inset 0 2px 4px var(--kb-inset-shadow-color, rgb(0 0 0 / 0.5));"));
        assert!(decls("drop-shadow-xl/50").contains("drop-shadow(0 9px 7px var(--kb-drop-shadow-color, rgb(0 0 0 / 0.5)))"));
        assert_eq!(decls("text-shadow-lg/30"), "text-shadow: 0px 1px 2px var(--kb-text-shadow-color, rgb(0 0 0 / 0.3)), 0px 3px 2px var(--kb-text-shadow-color, rgb(0 0 0 / 0.3)), 0px 4px 8px var(--kb-text-shadow-color, rgb(0 0 0 / 0.3))");
        // unchanged without one
        assert!(decls("shadow-xl").contains("rgb(0 0 0 / 0.1)"));
        // a color with an opacity is still a color
        assert_eq!(decls("shadow-blue-6/50"), "--kb-shadow-color: rgba(37,99,235,0.5)");
        none("shadow-xl/banana");
    }

    #[test]
    fn group_and_peer_conditions_with_an_ampersand() {
        assert_eq!(rule("group-[&_p]:flex"), ".group p .group-\\[\\&_p\\]\\:flex { display: flex }");
        assert_eq!(rule("group-[.foo_&]:flex"), ".foo .group .group-\\[\\.foo_\\&\\]\\:flex { display: flex }");
        assert_eq!(rule("peer-[&:nth-of-type(3)]:flex"), ".peer:nth-of-type(3) ~ .peer-\\[\\&\\:nth-of-type\\(3\\)\\]\\:flex { display: flex }");
        assert!(rule("group-[&_p]/item:flex").starts_with(".group\\/item p "));
        // without one, the condition is on the group itself (unchanged)
        assert!(rule("group-[.is-open]:flex").starts_with(".group.is-open "));
    }

    #[test]
    fn content_sets_the_property_too() {
        assert_eq!(decls("content-none"), "--kb-content: none; content: var(--kb-content)");
        assert_eq!(decls("content-[attr(data-x)]"), "--kb-content: attr(data-x); content: var(--kb-content)");
    }

    #[test]
    fn size_containers() {
        assert_eq!(decls("@container-size"), "container-type: size");
        assert_eq!(decls("@container-size/main"), "container-type: size; container-name: main");
        assert_eq!(decls("@container-normal/main"), "container-type: normal; container-name: main");
        assert_eq!(decls("@container-[size]"), "container-type: size");
        assert_eq!(decls("@container-[inline-size]/main"), "container-type: inline-size; container-name: main");
        assert_eq!(decls("@container"), "container-type: inline-size");
        assert_eq!(decls("@container/main"), "container-type: inline-size; container-name: main");
        none("@container-banana");
        none("@container/");
    }

    #[test]
    fn variants_that_produced_nothing() {
        assert!(rule("pointer-none:flex").starts_with("@media (pointer: none)"));
        assert!(rule("any-pointer-none:flex").starts_with("@media (any-pointer: none)"));
        assert!(rule("not-pointer-none:flex").starts_with("@media not (pointer: none)"));
        assert!(rule("not-sm:flex").starts_with("@media not (min-width: 640px)"));
        assert!(rule("not-dark:flex").starts_with("@media not (prefers-color-scheme: dark)"));
        assert!(rule("not-max-[900px]:flex").starts_with("@media not (width < 900px)"));
        assert!(rule("not-@md:flex").starts_with("@container not (min-width: 28rem)"));
        assert!(rule("not-@md/main:flex").starts_with("@container main not (min-width: 28rem)"));
        assert!(rule("supports-grid:flex").starts_with("@supports (grid: var(--kb))"));
        assert!(rule("supports-(--x):flex").starts_with("@supports var(--x)"));
        assert!(rule("supports-[display:grid]:flex").starts_with("@supports (display:grid)"));
        assert!(rule("supports-[not_(display:grid)]:flex").starts_with("@supports not (display:grid)"));
        assert!(rule("supports-[selector(:has(a))]:flex").starts_with("@supports selector(:has(a))"));
        assert!(rule("not-supports-[display:grid]:flex").starts_with("@supports not (display:grid)"));
        assert!(rule("[@media(min-width:900px)]:flex").starts_with("@media (min-width:900px)"));
        assert!(rule("[@media_print]:flex").starts_with("@media print"));
        assert!(rule("[@supports(display:grid)]:flex").starts_with("@supports (display:grid)"));
        assert!(rule("[@container(min-width:300px)]:flex").starts_with("@container (min-width:300px)"));
        none("[@media]:flex");
        none("[@media(x){}body{color:red]:flex");
    }

    #[test]
    fn hover_only_where_the_device_can_hover() {
        assert_eq!(rule("hover:flex"), "@media (hover: hover) { .hover\\:flex:hover { display: flex } }");
        for class in ["group-hover:flex", "peer-hover:flex", "in-hover:flex", "has-hover:flex", "group-hover/item:flex"] {
            assert!(rule(class).starts_with("@media (hover: hover) {"), "{class}");
        }
        // the opposite needs no media query
        assert_eq!(rule("not-hover:flex"), ".not-hover\\:flex:not(:hover) { display: flex }");
        assert!(!rule("focus:flex").contains("@media"));
        assert!(!rule("group-focus:flex").contains("@media"));
    }

    #[test]
    fn open_and_inert() {
        assert_eq!(rule("open:flex"), ".open\\:flex:is([open], :popover-open, :open) { display: flex }");
        assert_eq!(rule("inert:flex"), ".inert\\:flex:is([inert], [inert] *) { display: flex }");
        assert_eq!(rule("group-open:flex"), ".group:is([open], :popover-open, :open) .group-open\\:flex { display: flex }");
    }

    #[test]
    fn gradient_interpolation_and_whole_gradients() {
        // the plain form first: a browser without gradient interpolation keeps it
        assert_eq!(
            decls("bg-linear-to-r/oklch"),
            "background-image: linear-gradient(to right, var(--kb-gradient-stops)); background-image: linear-gradient(to right in oklch, var(--kb-gradient-stops))",
        );
        assert!(decls("bg-linear-to-r/longer").ends_with("linear-gradient(to right in oklch longer hue, var(--kb-gradient-stops))"));
        assert!(decls("bg-linear-to-r/[in_hsl_longer_hue]").ends_with("linear-gradient(to right in hsl longer hue, var(--kb-gradient-stops))"));
        assert!(decls("bg-linear-45/srgb").ends_with("linear-gradient(45deg in srgb, var(--kb-gradient-stops))"));
        assert!(decls("bg-radial/oklch").ends_with("radial-gradient(in oklch, var(--kb-gradient-stops))"));
        assert!(decls("bg-conic/decreasing").ends_with("conic-gradient(in oklch decreasing hue, var(--kb-gradient-stops))"));
        assert!(decls("bg-conic-180/oklch").ends_with("conic-gradient(from 180deg in oklch, var(--kb-gradient-stops))"));
        none("bg-linear-to-r/banana");
        // Tailwind v3's name
        assert_eq!(decls("bg-gradient-to-r"), decls("bg-linear-to-r"));
        // a variable, or a whole gradient in brackets: the stops follow only
        // when from-*/via-* set them
        assert_eq!(decls("bg-linear-(--g)"), "background-image: linear-gradient(var(--g) var(--kb-gradient-tail,))");
        assert_eq!(decls("bg-radial-(--r)"), "background-image: radial-gradient(var(--r) var(--kb-gradient-tail,))");
        assert_eq!(
            decls("bg-linear-[25deg,red_5%,yellow_60%]"),
            "background-image: linear-gradient(25deg,red 5%,yellow 60% var(--kb-gradient-tail,))",
        );
        assert!(decls("from-blue-6").ends_with("--kb-gradient-tail: , var(--kb-gradient-stops)"));
        none("bg-linear-[25deg]/oklch");
    }

    #[test]
    fn bare_values_outside_the_old_scales() {
        assert_eq!(decls("grid-cols-13"), "grid-template-columns: repeat(13, minmax(0, 1fr))");
        assert_eq!(decls("grid-cols-15"), "grid-template-columns: repeat(15, minmax(0, 1fr))");
        none("grid-cols-0");
        assert_eq!(decls("aspect-3/2"), "aspect-ratio: 3 / 2");
        assert_eq!(decls("aspect-16/9"), "aspect-ratio: 16 / 9");
        none("aspect-3/x");
        assert_eq!(decls("decoration-3"), "text-decoration-thickness: 3px");
        assert_eq!(decls("underline-offset-3"), "text-underline-offset: 3px");
        assert_eq!(decls("max-w-screen-md"), "max-width: 768px");
        none("max-w-screen-nope");
        none("w-screen-md");
    }

    #[test]
    fn bracket_and_variable_values_on_more_utilities() {
        assert!(decls("transition-(--t)").starts_with("transition-property: var(--t);"));
        assert!(decls("scale-(--s)").starts_with("--kb-scale-x: scaleX(var(--s)); --kb-scale-y: scaleY(var(--s));"));
        assert_eq!(decls("transform-[rotateX(10deg)]"), "transform: rotateX(10deg)");
        assert_eq!(decls("transform-(--t)"), "transform: var(--t)");
        assert_eq!(decls("list-[upper-roman]"), "list-style-type: upper-roman");
        assert_eq!(decls("list-(--l)"), "list-style-type: var(--l)");
        assert_eq!(decls("contain-[layout_paint]"), "contain: layout paint");
        assert_eq!(decls("contain-(--c)"), "contain: var(--c)");
        assert!(decls("mask-radial-[100%_100%]").ends_with("--kb-mask-radial-size: 100% 100%"));
        assert!(decls("mask-y-to-(--m)").contains("--kb-mask-top-to-position: var(--m)"));
        assert!(decls("mask-t-from-[10px]").ends_with("--kb-mask-top-from-position: 10px"));
        assert!(decls("mask-t-from-[color:red]").ends_with("--kb-mask-top-from-color: red"));
        assert!(decls("mask-linear-[70deg]").ends_with("--kb-mask-linear-position: 70deg"));
        none("transform-[x;y]");
        none("list-[a{b]");
    }

    #[test]
    fn theme_functions_in_arbitrary_values() {
        assert_eq!(decls("w-[--spacing(4)]"), "width: 16px");
        assert_eq!(decls("m-[calc(--spacing(4)-1px)]"), "margin: calc(16px - 1px)");
        assert_eq!(decls("w-[--spacing(var(--n))]"), "width: calc(4px*var(--n))");
        assert_eq!(decls("bg-[--alpha(var(--c)/50%)]"), "background-color: color-mix(in srgb, var(--c) 50%, transparent)");
        assert_eq!(decls("[margin:--spacing(2)]"), "margin: 8px");
    }

    #[test]
    fn max_ranges_are_strictly_below() {
        assert!(rule("max-[900px]:flex").starts_with("@media (width < 900px)"));
        assert!(rule("@max-md:flex").starts_with("@container (width < 28rem)"));
        assert!(rule("@max-[400px]:flex").starts_with("@container (width < 400px)"));
    }
}
