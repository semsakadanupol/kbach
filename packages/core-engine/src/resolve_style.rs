//! Resolves a class string into a flat, React-Native-compatible style
//! object (plain JS object via JSON, camelCase keys) — the native
//! counterpart to css.rs's CSS-TEXT output. Covers layout, spacing, border,
//! color, and numeric/arbitrary line-height/letter-spacing utilities (see
//! resolvers::resolve_utility_native), base declarations plus the bare
//! `dark:` modifier (applied when `color_scheme == "dark"`, the caller's
//! current `Appearance.getColorScheme()` reading — see nativeBridge.ts) and
//! the bare `active:` modifier (applied when `pressed == true` — only ever
//! true when the caller is RN's `Pressable`, the one component that knows
//! this state at all; see jsx-runtime.tsx). Every other modifier chain
//! (`hover:`, `sm:`, `dark:active:`, ...) parses without error but isn't
//! applied yet. Explicitly deferred, not silently broken.
//!
//! Properties are inserted into the output map in token order, last write
//! wins on a key collision — there's no CSS-cascade/specificity system
//! here. So `"bg-blue-6 dark:bg-blue-8"` correctly resolves to blue-8 in
//! dark mode, but the reverse order would not; callers are expected to
//! write base classes before their `dark:`/`active:` variant, same as
//! normal Tailwind authoring convention.
//!
//! Named leading/tracking keywords and truncation are excluded at the
//! resolver level (see resolve_utility_native's docs) — everything that
//! reaches this module is expected to be RN-representable, modulo the
//! value typing below.

use crate::parser::parse_class;
use crate::resolvers::resolve_utility_native;
use crate::theme::ThemeConfig;
use serde_json::{Map, Number, Value};

/// CSS's kebab-case property names -> RN's camelCase style keys
/// ("background-color" -> "backgroundColor", "flex-direction" -> "flexDirection").
fn kebab_to_camel(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut upper_next = false;
    for ch in s.chars() {
        if ch == '-' {
            upper_next = true;
        } else if upper_next {
            out.extend(ch.to_uppercase());
            upper_next = false;
        } else {
            out.push(ch);
        }
    }
    out
}

/// Kebab-case CSS properties whose values RN expects as unitless JS
/// numbers (density-independent pixels), not strings — the reason this
/// module can't just JSON-stringify every resolved value.
const NUMERIC_LENGTH_PROPS: &[&str] = &[
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "gap", "column-gap", "row-gap",
    "width", "height", "min-width", "max-width", "min-height", "max-height",
    "top", "right", "bottom", "left", "inset",
    "border-radius", "border-width", "font-size", "z-index",
    "line-height", "letter-spacing",
];

/// Converts a resolved CSS value into its RN-correct JSON shape. Properties
/// outside `NUMERIC_LENGTH_PROPS` (colors, `flexDirection`, `borderStyle`,
/// ...) are untouched strings. For numeric-length properties: strips `px`;
/// converts `rem` to px (`× 16`, matching the theme's own rem convention —
/// e.g. `rounded-lg` = `0.5rem` = `8px`); falls back to parsing the raw
/// value (covers `z-index`'s already-unitless `"50"`); and if none of
/// those apply (e.g. an arbitrary `"50%"`), passes the string through as-is
/// — exactly correct, since RN accepts percentage strings for these props.
fn rn_style_value(property: &str, value: &str) -> Value {
    if NUMERIC_LENGTH_PROPS.contains(&property) {
        let px = if let Some(px) = value.strip_suffix("px") {
            px.parse::<f64>().ok()
        } else if let Some(rem) = value.strip_suffix("rem") {
            rem.parse::<f64>().ok().map(|n| n * 16.0)
        } else {
            value.parse::<f64>().ok()
        };
        if let Some(n) = px.and_then(Number::from_f64) {
            return Value::Number(n);
        }
    }
    Value::String(value.to_string())
}

/// FFI-facing entry point — parses `theme_json`, resolves, and serializes
/// the result back to a JSON string. Native-only (unlike lib.rs's
/// `resolve_class_string`, which is shared by the web/WASM and Android/JNI
/// paths) since the web target has no use for a style-object shape at all.
/// An unparseable theme yields an empty object rather than panicking
/// across the FFI boundary.
pub fn resolve_style_json(class_string: &str, theme_json: &str, color_scheme: &str, pressed: bool) -> String {
    let theme: ThemeConfig = match serde_json::from_str(theme_json) {
        Ok(t) => t,
        Err(_) => return "{}".to_string(),
    };
    let style = resolve_style(class_string, &theme, color_scheme, pressed);
    serde_json::to_string(&style).unwrap_or_else(|_| "{}".to_string())
}

pub fn resolve_style(class_string: &str, theme: &ThemeConfig, color_scheme: &str, pressed: bool) -> Map<String, Value> {
    let mut style = Map::new();

    for token in class_string.split_whitespace() {
        let parsed = parse_class(token);
        match parsed.modifiers.as_slice() {
            [] => {}
            [m] if m == "dark" => {
                if color_scheme != "dark" {
                    continue;
                }
            }
            [m] if m == "active" => {
                if !pressed {
                    continue;
                }
            }
            _ => continue,
        }
        let Some(decls) = resolve_utility_native(&parsed, theme) else { continue };
        for d in decls {
            if d.property.starts_with("__") {
                // divide/space markers — no RN child-combinator equivalent, out of scope.
                continue;
            }
            let value = rn_style_value(&d.property, &d.value);
            style.insert(kebab_to_camel(&d.property), value);
        }
    }

    style
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theme::ColorValue;
    use std::collections::HashMap;

    fn theme() -> ThemeConfig {
        let mut colors = HashMap::new();
        colors.insert("blue-6".to_string(), ColorValue::Plain("#2563eb".to_string()));
        ThemeConfig { colors, ..Default::default() }
    }

    #[test]
    fn resolves_layout_and_color_utilities_to_a_flat_camelcase_style_object() {
        let style = resolve_style("flex items-center bg-blue-6", &theme(), "light", false);
        assert_eq!(style.get("display").unwrap(), "flex");
        assert_eq!(style.get("alignItems").unwrap(), "center");
        assert_eq!(style.get("backgroundColor").unwrap(), "#2563eb");
    }

    #[test]
    fn converts_multi_word_kebab_properties_to_camelcase() {
        let style = resolve_style("flex-row", &theme(), "light", false);
        assert_eq!(style.get("flexDirection").unwrap(), "row");
    }

    #[test]
    fn resolves_font_weight_text_transform_and_decoration_as_strings() {
        let style = resolve_style("font-bold uppercase underline", &theme(), "light", false);
        assert_eq!(style.get("fontWeight").unwrap(), "700");
        assert_eq!(style.get("textTransform").unwrap(), "uppercase");
        assert_eq!(style.get("textDecorationLine").unwrap(), "underline");
    }

    #[test]
    fn skips_non_dark_non_active_modifier_chains_regardless_of_state() {
        let style = resolve_style("hover:flex sm:flex dark:hover:flex dark:active:flex", &theme(), "dark", true);
        assert!(style.is_empty());
    }

    #[test]
    fn applies_dark_modifier_only_when_scheme_is_dark() {
        let mut t = theme();
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let light = resolve_style("dark:bg-blue-8", &t, "light", false);
        assert!(light.is_empty());

        let dark = resolve_style("dark:bg-blue-8", &t, "dark", false);
        assert_eq!(dark.get("backgroundColor").unwrap(), "#1e40af");
    }

    #[test]
    fn applies_active_modifier_only_when_pressed() {
        let mut t = theme();
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let resting = resolve_style("active:bg-blue-8", &t, "light", false);
        assert!(resting.is_empty());

        let pressed = resolve_style("active:bg-blue-8", &t, "light", true);
        assert_eq!(pressed.get("backgroundColor").unwrap(), "#1e40af");
    }

    #[test]
    fn dark_variant_overrides_a_preceding_base_declaration_on_the_same_property() {
        let mut t = theme();
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let dark = resolve_style("bg-blue-6 dark:bg-blue-8", &t, "dark", false);
        assert_eq!(dark.get("backgroundColor").unwrap(), "#1e40af");

        let light = resolve_style("bg-blue-6 dark:bg-blue-8", &t, "light", false);
        assert_eq!(light.get("backgroundColor").unwrap(), "#2563eb");
    }

    #[test]
    fn active_variant_overrides_a_preceding_base_declaration_on_the_same_property() {
        let mut t = theme();
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let pressed = resolve_style("bg-blue-6 active:bg-blue-8", &t, "light", true);
        assert_eq!(pressed.get("backgroundColor").unwrap(), "#1e40af");

        let resting = resolve_style("bg-blue-6 active:bg-blue-8", &t, "light", false);
        assert_eq!(resting.get("backgroundColor").unwrap(), "#2563eb");
    }

    #[test]
    fn resolves_spacing_radius_and_font_size_as_numbers_not_strings() {
        let mut t = theme();
        t.spacing.insert("4".to_string(), 16.0);
        let style = resolve_style("p-4 rounded-lg text-lg", &t, "light", false);
        assert_eq!(style.get("padding").unwrap(), &Value::Number(Number::from_f64(16.0).unwrap()));
        assert_eq!(style.get("borderRadius").unwrap(), &Value::Number(Number::from_f64(8.0).unwrap()));
        assert_eq!(style.get("fontSize").unwrap(), &Value::Number(Number::from_f64(18.0).unwrap()));
    }

    #[test]
    fn passes_an_arbitrary_percentage_width_through_as_a_string() {
        let style = resolve_style("w-[50%]", &theme(), "light", false);
        assert_eq!(style.get("width").unwrap(), "50%");
    }

    #[test]
    fn resolves_z_index_as_a_number() {
        let style = resolve_style("z-50", &theme(), "light", false);
        assert_eq!(style.get("zIndex").unwrap(), &Value::Number(Number::from_f64(50.0).unwrap()));
    }

    #[test]
    fn does_not_resolve_named_leading_tracking_keywords_or_truncate() {
        let style = resolve_style("leading-tight tracking-wide truncate", &theme(), "light", false);
        assert!(style.is_empty());
    }

    #[test]
    fn resolves_numeric_line_height_and_arbitrary_letter_spacing_as_numbers() {
        let style = resolve_style("leading-6 tracking-[0.5px]", &theme(), "light", false);
        assert_eq!(style.get("lineHeight").unwrap(), &Value::Number(Number::from_f64(24.0).unwrap()));
        assert_eq!(style.get("letterSpacing").unwrap(), &Value::Number(Number::from_f64(0.5).unwrap()));
    }

    #[test]
    fn resolves_an_arbitrary_color_value() {
        let style = resolve_style("bg-[#16a34a]", &theme(), "light", false);
        assert_eq!(style.get("backgroundColor").unwrap(), "#16a34a");
    }

    #[test]
    fn resolve_style_json_round_trips_through_a_json_string() {
        let json = resolve_style_json(
            "flex bg-blue-6",
            r##"{"colors":{"blue-6":"#2563eb"},"spacing":{},"screens":{},"darkMode":"attribute"}"##,
            "light",
            false,
        );
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["display"], "flex");
        assert_eq!(parsed["backgroundColor"], "#2563eb");
    }

    #[test]
    fn resolve_style_json_returns_an_empty_object_for_unparseable_theme_json() {
        assert_eq!(resolve_style_json("flex", "not json", "light", false), "{}");
    }

    #[test]
    fn merges_multiple_tokens_into_one_flat_object() {
        let style = resolve_style("flex flex-row items-center justify-center bg-blue-6", &theme(), "light", false);
        assert_eq!(style.len(), 5);
    }
}
