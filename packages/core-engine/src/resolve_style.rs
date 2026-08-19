//! Resolves a class string into a flat, React-Native-compatible style
//! object (plain JS object via JSON, camelCase keys) — the native
//! counterpart to css.rs's CSS-TEXT output. Covers layout, spacing, border,
//! color, and numeric/arbitrary line-height/letter-spacing utilities (see
//! resolvers::resolve_utility_native), base declarations plus three kinds
//! of modifier, each gated by a value the caller supplies fresh on every
//! call (there's no CSS cascade/media-query engine on native, just a
//! live condition check — see `native_modifier_state` below):
//!   - `dark:` — applied when `color_scheme == "dark"` (the caller's
//!     current `Appearance.getColorScheme()` reading; see nativeBridge.ts).
//!   - `active:` — applied when `pressed == true` (only ever true when the
//!     caller is RN's `Pressable`, the one component that knows this state
//!     at all; see jsx-runtime.tsx).
//!   - `sm:`/`md:`/`lg:`/`xl:`/`2xl:` — applied when `width` (the caller's
//!     current window width) is at least that breakpoint's `theme.screens`
//!     min-width, mirroring real Tailwind's mobile-first "min-width and up"
//!     semantics (same scale css.rs's `is_responsive` handling uses for
//!     the web `@media` output — see registry.rs).
//! All three compose: `dark:sm:bg-blue-8` applies only when BOTH hold.
//! Every other modifier (`hover:`, `group-*`, `has-[...]`, container
//! queries, ...) parses without error but isn't applied on native — no
//! selector/pseudo-state/ancestor system exists here to apply them with.
//! Explicitly deferred, not silently broken.
//!
//! Properties are inserted into the output map in token order, last write
//! wins on a key collision — there's no CSS-cascade/specificity system
//! here. So `"bg-blue-6 dark:bg-blue-8"` correctly resolves to blue-8 in
//! dark mode, but the reverse order would not; callers are expected to
//! write base classes before their `dark:`/`active:`/responsive variant,
//! same as normal Tailwind authoring convention.
//!
//! Named leading/tracking keywords and truncation are excluded at the
//! resolver level (see resolve_utility_native's docs) — everything that
//! reaches this module is expected to be RN-representable, modulo the
//! value typing below.

use crate::calc::reduce_constant_math;
use crate::parser::{parse_class, ParsedClass};
use crate::registry::{self, DarkScheme};
use crate::resolvers::{resolve_utility, resolve_utility_native};
use crate::theme::ThemeConfig;
use serde_json::{Map, Number, Value};

/// Bare classes with no styling meaning of their own — they exist purely as
/// selector-target markers (`group-hover:` matches `.group:hover .child`,
/// `peer-hover:` matches `.peer:hover ~ .sibling`), so no resolver anywhere
/// (web or native) ever produces a declaration for the literal `group`/
/// `peer` token itself. Mirrors @kbach/react's own `unknownClassWarnings.ts`
/// `MARKER_CLASSES` allowlist exactly — same reason: "resolves to zero
/// declarations" is indistinguishable from "not a real utility" by return
/// shape alone, so these two need a manual exception.
const MARKER_UTILITIES: &[&str] = &["group", "peer"];

/// Whether `parsed`'s BASE utility (ignoring modifiers and their current
/// state entirely) is a real Kbach utility on ANY platform — the ground
/// truth for "is this a typo", deliberately using `resolve_utility` (the
/// WEB dispatcher, the fullest vocabulary) rather than
/// `resolve_utility_native`: a real utility this engine just doesn't
/// support on native YET (`grid-cols-3`, `scale-150`, `blur`, ...) is an
/// intentional, documented platform gap (see this module's own top doc
/// comment: "Explicitly deferred, not silently broken") — NOT a typo, and
/// must never warn as one. Only a string that resolves NOWHERE at all is.
fn is_recognized_utility(parsed: &ParsedClass, theme: &ThemeConfig) -> bool {
    MARKER_UTILITIES.contains(&parsed.utility.as_str()) || resolve_utility(parsed, theme).is_some()
}

/// Whether a single modifier's condition currently holds, for the three
/// modifier kinds native actually understands — `None` for anything else
/// (hover/group/peer/aria/container/starting/...), which `resolve_style`
/// below treats identically to "doesn't hold" (the whole chain is skipped),
/// same as before this function existed. Reads from the shared
/// `registry::resolve` table rather than re-deriving "is this dark/active/
/// responsive" locally, so a new responsive breakpoint or a future change
/// to what counts as "the active pseudo" never needs updating in two
/// places — see registry.rs's own module doc for the tier scheme this
/// reads from.
fn native_modifier_state(modifier: &str, theme: &ThemeConfig, color_scheme: &str, pressed: bool, width: f64) -> Option<bool> {
    let def = registry::resolve(modifier)?;
    if let Some(DarkScheme::Dark) = def.dark_scheme {
        return Some(color_scheme == "dark");
    }
    if def.pseudo.as_deref() == Some(":active") {
        return Some(pressed);
    }
    if def.is_responsive {
        let min_width = theme.screens.get(modifier)?;
        return Some(width >= *min_width);
    }
    None
}

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
/// numbers, not strings — the reason this module can't just
/// JSON-stringify every resolved value. Mostly density-independent-pixel
/// lengths, plus a few bare-number non-length props (`shadow-opacity`,
/// `elevation`) that need the exact same "parse the plain numeric string"
/// handling `rn_style_value`'s fallback path already provides.
const NUMERIC_LENGTH_PROPS: &[&str] = &[
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "gap", "column-gap", "row-gap",
    "width", "height", "min-width", "max-width", "min-height", "max-height",
    "top", "right", "bottom", "left", "inset",
    "border-radius", "border-width", "font-size", "z-index",
    "line-height", "letter-spacing",
    "flex", "flex-grow", "flex-shrink", "order", "flex-basis",
    "shadow-opacity", "shadow-radius", "elevation",
    // Per-side border width + per-corner radius — added alongside
    // border.rs's per-side/per-corner resolvers; RN's style system wants
    // plain numbers for these exactly like the generic "border-width"/
    // "border-radius" forms above, not "2px"/"0.5rem" strings.
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
    "outline-width", "outline-offset",
];

/// A bare percentage string (`"50%"`, `"-33.3%"`) — real Tailwind fraction
/// utilities (`w-1/2`) and plain arbitrary percentages both produce this
/// shape, and RN genuinely accepts it as-is for every `NUMERIC_LENGTH_PROPS`
/// entry. Distinct from a `calc(...)`/`clamp(...)` string that merely
/// CONTAINS a `%` — those are NOT valid RN values even though they contain
/// the same character, which is exactly why this checks the value is
/// NOTHING BUT a percentage, not just that it contains one.
fn is_plain_percentage(value: &str) -> bool {
    let Some(digits) = value.strip_suffix('%') else { return false };
    let digits = digits.strip_prefix('-').unwrap_or(digits);
    !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit() || c == '.')
}

/// Converts a resolved CSS value into its RN-correct JSON shape. Returns
/// `(None, ...)` when the declaration should be DROPPED entirely — a value
/// RN's style system genuinely cannot represent (rather than silently
/// shipping an invalid string into the style object, which RN would either
/// warn about unpredictably or just ignore) — paired with a warning message
/// for the caller to surface in dev mode (see `resolve_style_json`'s own
/// doc comment for where that warning actually reaches the developer).
///
/// For `NUMERIC_LENGTH_PROPS`, tries in order: strip `px`; convert `rem` to
/// px (`× 16`, matching the theme's own rem convention — e.g. `rounded-lg`
/// = `0.5rem` = `8px`); parse the raw value (covers `z-index`'s
/// already-unitless `"50"`); a bare percentage string (RN accepts these
/// as-is); a CONSTANT-ONLY `calc()`/`clamp()`/`min()`/`max()` expression
/// reducible to a single px number at resolve time (see `calc.rs` — e.g.
/// `calc(16px+8px)` becomes `24`, but `calc(50%-0.5rem)` can't reduce this
/// way since a percentage needs the parent's actual layout size, which
/// doesn't exist until paint time on native). Anything past all of those
/// (an unreduced percentage-relative/viewport-relative `calc()`, a raw
/// `var(...)`, an unrecognized CSS unit, ...) is dropped with a warning.
///
/// Properties outside `NUMERIC_LENGTH_PROPS` (colors, `flexDirection`,
/// `borderStyle`, ...) are always passed through as untouched strings —
/// never dropped, since this validation is specifically about RN's numeric
/// style fields, the one place a free-text CSS value can't just work as-is.
fn rn_style_value(property: &str, value: &str) -> (Option<Value>, Option<String>) {
    if !NUMERIC_LENGTH_PROPS.contains(&property) {
        return (Some(Value::String(value.to_string())), None);
    }

    let px = if let Some(px) = value.strip_suffix("px") {
        px.parse::<f64>().ok()
    } else if let Some(rem) = value.strip_suffix("rem") {
        rem.parse::<f64>().ok().map(|n| n * 16.0)
    } else {
        value.parse::<f64>().ok()
    };
    if let Some(n) = px.and_then(Number::from_f64) {
        return (Some(Value::Number(n)), None);
    }

    if is_plain_percentage(value) {
        return (Some(Value::String(value.to_string())), None);
    }

    if let Some(n) = reduce_constant_math(value).and_then(Number::from_f64) {
        return (Some(Value::Number(n)), None);
    }

    let warning = format!(
        "Kbach: \"{value}\" is not a valid native value for \"{property}\" — dropped. \
         calc()/clamp()/min()/max() only resolve on native when every operand is a \
         constant px/rem length (no %, vw, vh, var(), or other viewport/CSS-variable \
         units — those need real layout/DOM, which doesn't exist on native at paint \
         time). Use a plain px/rem calc, a fraction utility (e.g. w-1/2), or resolve \
         this value in JS instead."
    );
    (None, Some(warning))
}

/// FFI-facing entry point — parses `theme_json`, resolves, and serializes
/// the result back to a JSON string. Native-only (unlike lib.rs's
/// `resolve_class_string`, which is shared by the web/WASM and Android/JNI
/// paths) since the web target has no use for a style-object shape at all.
/// An unparseable theme yields an empty object rather than panicking
/// across the FFI boundary.
///
/// When any declaration was dropped for being an invalid native value (see
/// `rn_style_value`'s own doc comment), this embeds them under a
/// `"__kbachWarnings"` key in the SAME returned object rather than adding a
/// second FFI call/return shape — nativeBridge.ts reads and strips that key
/// (dev-mode only) before handing the object to RN as `style`. The key is
/// omitted entirely when there are no warnings, so the JSON shape for every
/// already-passing call site is byte-for-byte unchanged.
pub fn resolve_style_json(class_string: &str, theme_json: &str, color_scheme: &str, pressed: bool, width: f64) -> String {
    let theme: ThemeConfig = match serde_json::from_str(theme_json) {
        Ok(t) => t,
        Err(_) => return "{}".to_string(),
    };
    let (mut style, warnings) = resolve_style_with_warnings(class_string, &theme, color_scheme, pressed, width);
    if !warnings.is_empty() {
        style.insert("__kbachWarnings".to_string(), Value::Array(warnings.into_iter().map(Value::String).collect()));
    }
    serde_json::to_string(&style).unwrap_or_else(|_| "{}".to_string())
}

/// Same resolution `resolve_style` does, plus the list of dev-facing
/// warnings generated along the way (see `rn_style_value`) — a separate
/// function rather than changing `resolve_style`'s own return type so its
/// many existing call sites/tests (which only ever care about the style
/// object) don't all need updating for a concern most of them never hit.
pub fn resolve_style_with_warnings(
    class_string: &str,
    theme: &ThemeConfig,
    color_scheme: &str,
    pressed: bool,
    width: f64,
) -> (Map<String, Value>, Vec<String>) {
    let mut style = Map::new();
    let mut warnings = Vec::new();

    for token in class_string.split_whitespace() {
        let parsed = parse_class(token);

        // Checked BEFORE the modifier-gate below, and independent of it —
        // a typo behind a currently-inactive modifier (`dark:flexx-center`
        // in light mode) is still a typo; skipping this check whenever
        // modifiers don't currently hold would only catch it half the time,
        // by accident, depending on runtime dark-mode/breakpoint state.
        if !is_recognized_utility(&parsed, theme) {
            warnings.push(format!(
                "Kbach: \"{token}\" doesn't match any known Kbach utility — typo? (skipped)"
            ));
        }

        let all_modifiers_hold = parsed
            .modifiers
            .iter()
            .all(|m| native_modifier_state(m, theme, color_scheme, pressed, width) == Some(true));
        if !all_modifiers_hold {
            continue;
        }
        let Some(decls) = resolve_utility_native(&parsed, theme) else { continue };
        for d in decls {
            if d.property.starts_with("__") {
                // divide/space markers — no RN child-combinator equivalent, out of scope.
                continue;
            }
            // RN's `shadowOffset` is the one shadow property that isn't a
            // flat key — it's `{width, height}`. effects.rs's
            // native_shadow_declarations emits it as two synthetic flat
            // properties instead (same shape as every other declaration),
            // so this is the one place that reassembles them into the
            // nested object RN actually expects.
            if d.property == "shadow-offset-x" || d.property == "shadow-offset-y" {
                let axis = if d.property == "shadow-offset-x" { "width" } else { "height" };
                let n = d.value.parse::<f64>().ok().and_then(Number::from_f64);
                if let Some(n) = n {
                    let entry = style.entry("shadowOffset".to_string()).or_insert_with(|| Value::Object(Map::new()));
                    if let Value::Object(obj) = entry {
                        obj.insert(axis.to_string(), Value::Number(n));
                    }
                }
                continue;
            }
            let (value, warning) = rn_style_value(&d.property, &d.value);
            if let Some(warning) = warning {
                warnings.push(warning);
            }
            if let Some(value) = value {
                style.insert(kebab_to_camel(&d.property), value);
            }
        }
    }

    (style, warnings)
}

// Only this module's own tests call this now — every production call site
// (resolve_style_json, in turn used by both the WASM and JNI FFI exports)
// goes straight through resolve_style_with_warnings for the warnings it
// needs. Kept anyway (not deleted, not test-only-cfg-gated) purely for
// dozens of existing tests' readability — `resolve_style(...)` reads better
// than `resolve_style_with_warnings(...).0` when a test has nothing to do
// with warnings at all. `#[allow(dead_code)]` because a release (non-test)
// build genuinely never calls it, which would otherwise warn.
#[allow(dead_code)]
pub fn resolve_style(class_string: &str, theme: &ThemeConfig, color_scheme: &str, pressed: bool, width: f64) -> Map<String, Value> {
    resolve_style_with_warnings(class_string, theme, color_scheme, pressed, width).0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theme::ColorValue;
    use std::collections::HashMap;

    // Arbitrary width used by every test that isn't specifically exercising
    // responsive gating — no test theme() below sets `screens`, so no
    // breakpoint modifier can resolve regardless of what this is.
    const W: f64 = 400.0;

    fn theme() -> ThemeConfig {
        let mut colors = HashMap::new();
        colors.insert("blue-6".to_string(), ColorValue::Plain("#2563eb".to_string()));
        ThemeConfig { colors, ..Default::default() }
    }

    #[test]
    fn resolves_layout_and_color_utilities_to_a_flat_camelcase_style_object() {
        let style = resolve_style("flex items-center bg-blue-6", &theme(), "light", false, W);
        assert_eq!(style.get("display").unwrap(), "flex");
        assert_eq!(style.get("alignItems").unwrap(), "center");
        assert_eq!(style.get("backgroundColor").unwrap(), "#2563eb");
    }

    #[test]
    fn converts_multi_word_kebab_properties_to_camelcase() {
        let style = resolve_style("flex-row", &theme(), "light", false, W);
        assert_eq!(style.get("flexDirection").unwrap(), "row");
    }

    #[test]
    fn resolves_font_weight_text_transform_and_decoration_as_strings() {
        let style = resolve_style("font-bold uppercase underline", &theme(), "light", false, W);
        assert_eq!(style.get("fontWeight").unwrap(), "700");
        assert_eq!(style.get("textTransform").unwrap(), "uppercase");
        assert_eq!(style.get("textDecorationLine").unwrap(), "underline");
    }

    #[test]
    fn skips_unknown_modifier_chains_regardless_of_state() {
        // hover: isn't one of the three native understands at all; a chain
        // that mixes it with a known, currently-true modifier (dark:hover:)
        // still doesn't apply — EVERY modifier in the chain must resolve
        // AND hold, not just one of them.
        let style = resolve_style("hover:flex dark:hover:flex", &theme(), "dark", true, W);
        assert!(style.is_empty());
    }

    #[test]
    fn combines_dark_and_active_modifiers_requiring_both_to_hold() {
        let resolves = |scheme: &str, pressed: bool| resolve_style("dark:active:flex", &theme(), scheme, pressed, W);
        assert!(resolves("light", false).is_empty());
        assert!(resolves("dark", false).is_empty());
        assert!(resolves("light", true).is_empty());
        assert_eq!(resolves("dark", true).get("display").unwrap(), "flex");
    }

    #[test]
    fn applies_dark_modifier_only_when_scheme_is_dark() {
        let mut t = theme();
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let light = resolve_style("dark:bg-blue-8", &t, "light", false, W);
        assert!(light.is_empty());

        let dark = resolve_style("dark:bg-blue-8", &t, "dark", false, W);
        assert_eq!(dark.get("backgroundColor").unwrap(), "#1e40af");
    }

    #[test]
    fn applies_active_modifier_only_when_pressed() {
        let mut t = theme();
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let resting = resolve_style("active:bg-blue-8", &t, "light", false, W);
        assert!(resting.is_empty());

        let pressed = resolve_style("active:bg-blue-8", &t, "light", true, W);
        assert_eq!(pressed.get("backgroundColor").unwrap(), "#1e40af");
    }

    #[test]
    fn applies_a_responsive_modifier_only_once_the_width_reaches_its_breakpoint() {
        let mut t = theme();
        t.screens.insert("sm".to_string(), 640.0);
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let narrow = resolve_style("bg-blue-6 sm:bg-blue-8", &t, "light", false, 400.0);
        assert_eq!(narrow.get("backgroundColor").unwrap(), "#2563eb");

        // Real Tailwind's min-width semantics: AT the breakpoint counts as
        // reached, not just strictly past it.
        let at_breakpoint = resolve_style("bg-blue-6 sm:bg-blue-8", &t, "light", false, 640.0);
        assert_eq!(at_breakpoint.get("backgroundColor").unwrap(), "#1e40af");

        let wide = resolve_style("bg-blue-6 sm:bg-blue-8", &t, "light", false, 800.0);
        assert_eq!(wide.get("backgroundColor").unwrap(), "#1e40af");
    }

    #[test]
    fn a_screen_name_with_no_matching_theme_entry_never_resolves() {
        // theme() has no `screens` entries at all — "sm" isn't a modifier
        // native fails to recognize (registry.rs still knows it), it's a
        // recognized-but-unconfigured breakpoint, and both cases skip the
        // same way.
        let style = resolve_style("sm:flex", &theme(), "light", false, 10_000.0);
        assert!(style.is_empty());
    }

    #[test]
    fn combines_dark_and_responsive_modifiers_requiring_both_to_hold() {
        let mut t = theme();
        t.screens.insert("md".to_string(), 768.0);
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let resolves = |scheme: &str, width: f64| resolve_style("dark:md:bg-blue-8", &t, scheme, false, width);
        assert!(resolves("light", 900.0).is_empty());
        assert!(resolves("dark", 500.0).is_empty());
        assert_eq!(resolves("dark", 900.0).get("backgroundColor").unwrap(), "#1e40af");
    }

    #[test]
    fn dark_variant_overrides_a_preceding_base_declaration_on_the_same_property() {
        let mut t = theme();
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let dark = resolve_style("bg-blue-6 dark:bg-blue-8", &t, "dark", false, W);
        assert_eq!(dark.get("backgroundColor").unwrap(), "#1e40af");

        let light = resolve_style("bg-blue-6 dark:bg-blue-8", &t, "light", false, W);
        assert_eq!(light.get("backgroundColor").unwrap(), "#2563eb");
    }

    #[test]
    fn active_variant_overrides_a_preceding_base_declaration_on_the_same_property() {
        let mut t = theme();
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let pressed = resolve_style("bg-blue-6 active:bg-blue-8", &t, "light", true, W);
        assert_eq!(pressed.get("backgroundColor").unwrap(), "#1e40af");

        let resting = resolve_style("bg-blue-6 active:bg-blue-8", &t, "light", false, W);
        assert_eq!(resting.get("backgroundColor").unwrap(), "#2563eb");
    }

    #[test]
    fn resolves_spacing_radius_and_font_size_as_numbers_not_strings() {
        let mut t = theme();
        t.spacing.insert("4".to_string(), 16.0);
        let style = resolve_style("p-4 rounded-lg text-lg", &t, "light", false, W);
        assert_eq!(style.get("padding").unwrap(), &Value::Number(Number::from_f64(16.0).unwrap()));
        assert_eq!(style.get("borderRadius").unwrap(), &Value::Number(Number::from_f64(8.0).unwrap()));
        assert_eq!(style.get("fontSize").unwrap(), &Value::Number(Number::from_f64(18.0).unwrap()));
    }

    #[test]
    fn resolves_per_side_border_width_per_corner_radius_and_flex_basis_as_numbers_not_strings() {
        let mut t = theme();
        t.spacing.insert("2".to_string(), 2.0);
        t.spacing.insert("4".to_string(), 16.0);
        let style = resolve_style("border-t-2 rounded-tl-lg basis-4", &t, "light", false, W);
        assert_eq!(style.get("borderTopWidth").unwrap(), &Value::Number(Number::from_f64(2.0).unwrap()));
        assert_eq!(style.get("borderTopLeftRadius").unwrap(), &Value::Number(Number::from_f64(8.0).unwrap()));
        assert_eq!(style.get("flexBasis").unwrap(), &Value::Number(Number::from_f64(16.0).unwrap()));
    }

    #[test]
    fn passes_an_arbitrary_percentage_width_through_as_a_string() {
        let style = resolve_style("w-[50%]", &theme(), "light", false, W);
        assert_eq!(style.get("width").unwrap(), "50%");
    }

    #[test]
    fn resolves_z_index_as_a_number() {
        let style = resolve_style("z-50", &theme(), "light", false, W);
        assert_eq!(style.get("zIndex").unwrap(), &Value::Number(Number::from_f64(50.0).unwrap()));
    }

    #[test]
    fn resolves_flex_family_as_numbers_with_platform_correct_flex_shorthand() {
        let style = resolve_style("flex-1 flex-auto grow shrink-0 order-3", &theme(), "light", false, W);
        assert_eq!(style.get("flexGrow").unwrap(), &Value::Number(Number::from_f64(1.0).unwrap()));
        assert_eq!(style.get("flexShrink").unwrap(), &Value::Number(Number::from_f64(0.0).unwrap()));
        assert_eq!(style.get("order").unwrap(), &Value::Number(Number::from_f64(3.0).unwrap()));
        // flex-1 then flex-auto both target the same "flex" property — last
        // write wins (documented resolve_style.rs behavior), and flex-auto
        // resolves to its native numeric fallback (1), not the CSS keyword.
        assert_eq!(style.get("flex").unwrap(), &Value::Number(Number::from_f64(1.0).unwrap()));
    }

    #[test]
    fn does_not_resolve_named_leading_tracking_keywords_or_truncate() {
        let style = resolve_style("leading-tight tracking-wide truncate", &theme(), "light", false, W);
        assert!(style.is_empty());
    }

    #[test]
    fn resolves_numeric_line_height_and_arbitrary_letter_spacing_as_numbers() {
        let style = resolve_style("leading-6 tracking-[0.5px]", &theme(), "light", false, W);
        assert_eq!(style.get("lineHeight").unwrap(), &Value::Number(Number::from_f64(24.0).unwrap()));
        assert_eq!(style.get("letterSpacing").unwrap(), &Value::Number(Number::from_f64(0.5).unwrap()));
    }

    #[test]
    fn resolves_an_arbitrary_color_value() {
        let style = resolve_style("bg-[#16a34a]", &theme(), "light", false, W);
        assert_eq!(style.get("backgroundColor").unwrap(), "#16a34a");
    }

    #[test]
    fn resolve_style_json_round_trips_through_a_json_string() {
        let json = resolve_style_json(
            "flex bg-blue-6",
            r##"{"colors":{"blue-6":"#2563eb"},"spacing":{},"screens":{},"darkMode":"attribute"}"##,
            "light",
            false,
            W,
        );
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["display"], "flex");
        assert_eq!(parsed["backgroundColor"], "#2563eb");
    }

    #[test]
    fn resolve_style_json_returns_an_empty_object_for_unparseable_theme_json() {
        assert_eq!(resolve_style_json("flex", "not json", "light", false, W), "{}");
    }

    #[test]
    fn merges_multiple_tokens_into_one_flat_object() {
        let style = resolve_style("flex flex-row items-center justify-center bg-blue-6", &theme(), "light", false, W);
        assert_eq!(style.len(), 5);
    }

    #[test]
    fn resolves_shadow_into_discrete_rn_properties_with_a_nested_shadow_offset() {
        let style = resolve_style("shadow-lg", &theme(), "light", false, W);
        assert_eq!(style.get("shadowColor").unwrap(), "#000000");
        assert_eq!(style.get("shadowOpacity").unwrap(), &Value::Number(Number::from_f64(0.1).unwrap()));
        assert_eq!(style.get("shadowRadius").unwrap(), &Value::Number(Number::from_f64(15.0).unwrap()));
        assert_eq!(style.get("elevation").unwrap(), &Value::Number(Number::from_f64(8.0).unwrap()));
        assert_eq!(
            style.get("shadowOffset").unwrap(),
            &serde_json::json!({ "width": 0.0, "height": 10.0 }),
        );
        // No flat shadowOffsetX/shadowOffsetY leaked through — only the
        // merged nested object should exist.
        assert!(style.get("shadowOffsetX").is_none());
        assert!(style.get("shadowOffsetY").is_none());
    }

    #[test]
    fn shadow_inner_does_not_resolve_on_native() {
        let style = resolve_style("shadow-inner", &theme(), "light", false, W);
        assert!(style.is_empty());
    }

    #[test]
    fn resolves_a_constant_only_arbitrary_calc_to_a_plain_number() {
        let style = resolve_style("p-[calc(16px+8px)]", &theme(), "light", false, W);
        assert_eq!(style.get("padding").unwrap(), &Value::Number(Number::from_f64(24.0).unwrap()));
    }

    #[test]
    fn resolves_a_constant_only_arbitrary_clamp_to_its_clamped_number() {
        let style = resolve_style("w-[clamp(1rem,2rem,3rem)]", &theme(), "light", false, W);
        assert_eq!(style.get("width").unwrap(), &Value::Number(Number::from_f64(32.0).unwrap()));
    }

    #[test]
    fn drops_an_unreducible_percentage_relative_calc_and_returns_a_warning() {
        let (style, warnings) = resolve_style_with_warnings("w-[calc(50%-0.5rem)]", &theme(), "light", false, W);
        assert!(style.get("width").is_none(), "an invalid native value must not be emitted at all");
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("calc(50%-0.5rem)"));
        assert!(warnings[0].contains("width"));
    }

    #[test]
    fn resolve_style_without_warnings_still_drops_the_same_invalid_value() {
        // The plain resolve_style() wrapper discards warnings but must still
        // drop the declaration the same way resolve_style_with_warnings does
        // — it's a thin wrapper, not a second code path.
        let style = resolve_style("w-[calc(50%-0.5rem)]", &theme(), "light", false, W);
        assert!(style.get("width").is_none());
    }

    #[test]
    fn resolve_style_json_embeds_warnings_under_a_dunder_key_only_when_present() {
        let theme_json = r##"{"colors":{},"spacing":{},"screens":{},"darkMode":"attribute"}"##;

        let clean = resolve_style_json("flex", theme_json, "light", false, W);
        let clean: serde_json::Value = serde_json::from_str(&clean).unwrap();
        assert!(clean.get("__kbachWarnings").is_none(), "a fully-valid resolution must not carry the warnings key at all");

        let with_warning = resolve_style_json("w-[calc(50%-0.5rem)]", theme_json, "light", false, W);
        let with_warning: serde_json::Value = serde_json::from_str(&with_warning).unwrap();
        let warnings = with_warning["__kbachWarnings"].as_array().unwrap();
        assert_eq!(warnings.len(), 1);
        assert!(with_warning.get("width").is_none());
    }

    #[test]
    fn a_plain_percentage_still_passes_through_without_any_warning() {
        // is_plain_percentage must not be confused with the calc()-contains-a-percent case.
        let (style, warnings) = resolve_style_with_warnings("w-1/2", &theme(), "light", false, W);
        assert_eq!(style.get("width").unwrap(), "50%");
        assert!(warnings.is_empty());
    }

    #[test]
    fn warns_on_a_genuinely_unknown_utility() {
        let (style, warnings) = resolve_style_with_warnings("flexx-center", &theme(), "light", false, W);
        assert!(style.is_empty());
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("flexx-center"));
        assert!(warnings[0].contains("typo"));
    }

    #[test]
    fn does_not_warn_for_group_or_peer_marker_classes() {
        let (_, warnings) = resolve_style_with_warnings("group peer", &theme(), "light", false, W);
        assert!(warnings.is_empty());
    }

    #[test]
    fn does_not_warn_for_a_real_utility_thats_only_unsupported_on_native() {
        // grid-cols-3/scale-150/blur are real Kbach utilities (real Tailwind
        // ones too) that this engine simply doesn't resolve on native yet —
        // an intentional platform gap, not a typo. Mirrors
        // resolveUtilityNative's own existing "resolves nothing" tests.
        let (style, warnings) = resolve_style_with_warnings("grid-cols-3 scale-150 blur", &theme(), "light", false, W);
        assert!(style.is_empty());
        assert!(warnings.is_empty(), "expected no warnings, got: {warnings:?}");
    }

    #[test]
    fn warns_on_a_typo_even_behind_a_currently_inactive_modifier() {
        // dark: isn't active (scheme is "light"), so this token is skipped
        // for APPLICATION either way — but it's still a typo, and must
        // still warn regardless of runtime dark-mode state.
        let (style, warnings) = resolve_style_with_warnings("dark:flexx-center", &theme(), "light", false, W);
        assert!(style.is_empty());
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("dark:flexx-center"));
    }

    #[test]
    fn does_not_warn_for_a_real_utility_behind_an_unsupported_modifier() {
        // hover: isn't one of the three modifiers native understands, but
        // bg-blue-6 itself is completely real — not a typo.
        let (style, warnings) = resolve_style_with_warnings("hover:bg-blue-6", &theme(), "light", false, W);
        assert!(style.is_empty());
        assert!(warnings.is_empty());
    }

    #[test]
    fn typo_warning_rides_along_in_resolve_style_json_the_same_way_calc_warnings_do() {
        let theme_json = r##"{"colors":{},"spacing":{},"screens":{},"darkMode":"attribute"}"##;
        let json = resolve_style_json("flexx-center", theme_json, "light", false, W);
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        let warnings = parsed["__kbachWarnings"].as_array().unwrap();
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].as_str().unwrap().contains("flexx-center"));
    }
}
