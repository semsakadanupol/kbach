//! Turns a parsed class + its resolved declarations into a CSS rule string,
//! consulting the modifier registry for every modifier in the chain instead
//! of special-casing "dark" the way Phase 1 did. Port of old-kbach's
//! `buildClassCSSRules` (`old-kbach/src/core/resolver.ts`).

use crate::parser::ParsedClass;
use crate::registry::{self, DarkScheme};
use crate::resolvers::Declaration;
use crate::theme::{DarkModeStrategy, ThemeConfig};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct BuiltRule {
    pub rule: String,
    pub order: f64,
}

const CHILD_COMBINATOR_SUFFIX: &str = " > * + *";

/// Builds a raw `@keyframes name { body }` top-level rule for an
/// `animate-*` utility (see `resolvers::animation_keyframes`) — doesn't go
/// through `build_rule` at all, since a keyframes block has no selector, no
/// modifiers, and no declarations to translate; it's a fundamentally
/// different top-level CSS construct, not a class rule. `order: -1.0` sorts
/// it before every ordinary rule (including the base `order: 0.0` tier) —
/// harmless either way for a name-referenced `@keyframes` block (unlike
/// `background.rs`'s gradient stops, nothing here depends on cascade
/// position), but keeping keyframes blocks together near the top of the
/// generated stylesheet is tidier to read.
pub fn build_keyframes_rule(name: &str, body: &str) -> BuiltRule {
    BuiltRule { rule: format!("@keyframes {name} {{ {body} }}"), order: -1.0 }
}

/// Which CSS selector shape `build_rule` targets — see that function's own
/// doc comment for why a second mode exists at all (short version:
/// react-native-web doesn't forward a `className` prop to the DOM at all,
/// so @kbach/react-native's Expo Web path can't use `Class` mode's
/// `.escaped-class` selectors; it renders a literal class string into a
/// `data-kb` attribute via RN's `dataSet` prop instead — which RNW DOES
/// forward — and needs a matching `[data-kb~="..."]` attribute-selector
/// rule shape to select against it).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SelectorMode {
    /// `.escaped\:class\:text` — real Tailwind's own shape, used by
    /// `@kbach/react` against a literal DOM `className`.
    Class,
    /// `[data-kb~="literal:class:text"]` — used by `@kbach/react-native`'s
    /// Expo Web path against a `data-kb` attribute (see `SelectorMode`'s
    /// own doc comment). CSS attribute-selector VALUES are quoted strings,
    /// not identifiers, so this needs none of `escape_selector`'s
    /// identifier-escaping — only quote/backslash escaping
    /// (`escape_attr_value`) to keep a crafted arbitrary value from
    /// breaking out of the quotes.
    DataAttribute,
}

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

/// Escapes `"` and `\` only — everything else is valid verbatim inside a
/// quoted CSS attribute-selector value (unlike `escape_selector`'s
/// identifier escaping, this isn't a bare identifier). `is_safe_arbitrary_value`
/// already rejects `{`/`}`/`;` in arbitrary values before this ever runs, but
/// a `"` isn't on that list (it's meaningless in the contexts that check
/// guards against), so it's handled here instead — otherwise a crafted
/// arbitrary value like `bg-["]` could close the attribute-selector's quotes
/// early and inject arbitrary selector/rule text.
fn escape_attr_value(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        if ch == '"' || ch == '\\' {
            out.push('\\');
        }
        out.push(ch);
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
            // calc()-based reverse technique, byte-for-byte matching real
            // Tailwind's own generated CSS shape: the width/margin value is
            // split between both sides via `var(--kb-*-reverse, 0)` and its
            // `calc(1 - ...)` complement, so a same-element `divide-x-reverse`/
            // `space-x-reverse` rule (which ONLY sets the variable, see
            // `__divide-x-reverse`/`__space-x-reverse` below) flips which
            // side gets the real value with no cross-token coordination
            // needed at resolve time — border-style defaults to "none",
            // which per spec computes border-width's USED value to 0
            // regardless of what's declared, so both sides get an explicit
            // solid style (old-kbach relied on a global preflight reset for
            // this; this engine has none yet). Assumes `d.value` is a plain
            // CSS length (the only thing divide-x/space-x's own resolvers
            // ever produce) — "auto"/percentage values aren't valid inside
            // `calc()` and would break, but neither this engine's `resolve_length`-derived
            // scale nor real Tailwind's own divide/space scale realistically
            // produces those for this utility.
            "__divide-x-width" => {
                parts.push("border-left-style: solid".to_string());
                parts.push("border-right-style: solid".to_string());
                parts.push(format!("border-right-width: calc({} * var(--kb-divide-x-reverse, 0))", d.value));
                parts.push(format!("border-left-width: calc({} * calc(1 - var(--kb-divide-x-reverse, 0)))", d.value));
                needs_child_combinator = true;
            }
            "__divide-y-width" => {
                parts.push("border-top-style: solid".to_string());
                parts.push("border-bottom-style: solid".to_string());
                parts.push(format!("border-bottom-width: calc({} * var(--kb-divide-y-reverse, 0))", d.value));
                parts.push(format!("border-top-width: calc({} * calc(1 - var(--kb-divide-y-reverse, 0)))", d.value));
                needs_child_combinator = true;
            }
            "__divide-x-reverse" => {
                parts.push(format!("--kb-divide-x-reverse: {}", d.value));
                needs_child_combinator = true;
            }
            "__divide-y-reverse" => {
                parts.push(format!("--kb-divide-y-reverse: {}", d.value));
                needs_child_combinator = true;
            }
            "__divide-color" => {
                parts.push(format!("border-color: {}", d.value));
                needs_child_combinator = true;
            }
            "__divide-style" => {
                parts.push(format!("border-style: {}", d.value));
                needs_child_combinator = true;
            }
            "__space-x" => {
                parts.push(format!("margin-right: calc({} * var(--kb-space-x-reverse, 0))", d.value));
                parts.push(format!("margin-left: calc({} * calc(1 - var(--kb-space-x-reverse, 0)))", d.value));
                needs_child_combinator = true;
            }
            "__space-y" => {
                parts.push(format!("margin-bottom: calc({} * var(--kb-space-y-reverse, 0))", d.value));
                parts.push(format!("margin-top: calc({} * calc(1 - var(--kb-space-y-reverse, 0)))", d.value));
                needs_child_combinator = true;
            }
            "__space-x-reverse" => {
                parts.push(format!("--kb-space-x-reverse: {}", d.value));
                needs_child_combinator = true;
            }
            "__space-y-reverse" => {
                parts.push(format!("--kb-space-y-reverse: {}", d.value));
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
    build_rule_with_mode(parsed, decls, theme, SelectorMode::Class)
}

/// `SelectorMode::DataAttribute` counterpart to `build_rule` — see that
/// mode's own doc comment. Used by `lib.rs`'s `generate_css_attr`, the
/// dedicated WASM export for @kbach/react-native's Expo Web path; never
/// called from the Android JNI bridge (native has no DOM/CSS at all).
pub fn build_rule_for_attribute(parsed: &ParsedClass, decls: &[Declaration], theme: &ThemeConfig) -> Option<BuiltRule> {
    build_rule_with_mode(parsed, decls, theme, SelectorMode::DataAttribute)
}

fn build_rule_with_mode(parsed: &ParsedClass, decls: &[Declaration], theme: &ThemeConfig, mode: SelectorMode) -> Option<BuiltRule> {
    let (mut decl_text, needs_child_combinator) = declarations_to_css(decls);
    if decl_text.is_empty() {
        return None;
    }

    let mut pseudo_suffix = String::new();
    let mut pseudo_element_suffix = String::new();
    // `content-[...]`/`content-none` (typography.rs) only ever sets
    // `--kb-content`, never `content` directly — this engine has no
    // preflight/reset file to carry a global `*, ::before, ::after { --kb-content:
    // ''; content: var(--kb-content); }` rule the way real Tailwind's does,
    // so each individual `before:`/`after:` RULE auto-injects
    // `content: var(--kb-content, "")` itself instead, right below. Since
    // this is a real CSS custom property, it composes correctly across
    // SEPARATE rules targeting the same pseudo-element box regardless of
    // which one sets `--kb-content` and which one merely reads it (e.g.
    // `before:content-['Hi']` and `before:block` are two independent
    // rules on two different selectors; both auto-inject the same
    // `content: var(--kb-content, "")` reader, and the one rule that ALSO
    // sets `--kb-content` makes it visible to both, no matter which sorts
    // first in the stylesheet).
    let mut needs_content_var = false;
    let mut ancestor_prefix = String::new();
    let mut descendant_suffix = String::new();
    let mut media_wrappers: Vec<String> = Vec::new();
    let mut container_wrappers: Vec<String> = Vec::new();
    let mut supports_wrappers: Vec<String> = Vec::new();
    let mut dark_scheme: Option<DarkScheme> = None;
    let mut needs_important = parsed.important;
    let mut order = 0.0_f64;
    let mut min_width: Option<f64> = None;
    let mut container_min_width: Option<f64> = None;
    let mut needs_starting_style = false;

    for modifier in &parsed.modifiers {
        let Some(def) = registry::resolve(modifier) else { continue };
        if let Some(p) = def.pseudo {
            pseudo_suffix.push_str(&p);
        }
        if let Some(pe) = def.pseudo_element {
            pseudo_element_suffix.push_str(&pe);
            if pe == "::before" || pe == "::after" {
                needs_content_var = true;
            }
        }
        if let Some(a) = def.ancestor_selector {
            ancestor_prefix.push_str(&a);
        }
        if let Some(d) = def.descendant_selector {
            descendant_suffix.push_str(&d);
        }
        if let Some(mq) = def.media_query {
            media_wrappers.push(mq);
        }
        if let Some(cq) = def.container_query {
            container_wrappers.push(cq);
        }
        if let Some(sq) = def.supports_query {
            supports_wrappers.push(sq);
        }
        if let Some(scheme) = def.dark_scheme {
            dark_scheme = Some(scheme);
        }
        if def.forces_important {
            needs_important = true;
        }
        if def.starting_style {
            needs_starting_style = true;
        }
        if def.is_responsive {
            let width = theme.screens.get(modifier).copied().unwrap_or(0.0);
            min_width = Some(min_width.map_or(width, |w: f64| w.max(width)));
        }
        if def.is_container_responsive {
            // `modifier` is the raw "@sm"/"@md"/... text; `theme.screens` is
            // keyed by the bare name ("sm"/"md"/...) the plain viewport-
            // responsive tier already uses — see `ResolvedModifier::
            // is_container_responsive`'s doc comment for why this
            // deliberately reuses that same scale.
            let bare = modifier.trim_start_matches('@');
            let width = theme.screens.get(bare).copied().unwrap_or(0.0);
            container_min_width = Some(container_min_width.map_or(width, |w: f64| w.max(width)));
        }
        if def.order > order {
            order = def.order;
        }
    }

    // Gradient color-stop sub-tier: `from-*`/`via-*`/`to-*` (background.rs)
    // each write to the shared `--kb-gradient-to`/`--kb-gradient-stops`
    // custom properties, so whichever of the two rules that BOTH touch
    // `--kb-gradient-to` sorts LAST in the actual injected stylesheet wins —
    // and Tailwind's own composition technique (ported in background.rs's
    // doc comment) depends on `to-*` always winning over `via-*`, and
    // `via-*` always winning over a bare `from-*`. Kbach injects rules
    // incrementally as classes are first encountered across the whole page
    // (see `kb.ts`'s `findInsertionIndex`), not in one AOT pass over every
    // utility like Tailwind's compiler — so relying on source/DOM order to
    // keep `to-*` after `via-*` breaks the moment `via-*` is first needed by
    // a LATER-rendered element than one already using `to-*` alone. A tiny
    // fixed sub-tier offset within the base (order 0.0) band — added to
    // whatever modifier tier already applies, so `hover:to-*` still sorts
    // after `hover:via-*` — makes the relative order deterministic
    // game-wide, independent of first-use order. `0.1`/`0.2` are safely
    // smaller than the `1.0` minimum gap between any two modifier tiers in
    // `registry.rs`, so this can never cross into a neighboring tier.
    order += match parsed.utility.as_str() {
        "via" => 0.1,
        "to" => 0.2,
        _ => 0.0,
    };

    if needs_content_var {
        decl_text = format!("{decl_text}; content: var(--kb-content, \"\")");
    }

    // Pseudo-CLASS suffix, THEN pseudo-ELEMENT suffix — CSS requires a
    // pseudo-element to be the last component of a compound selector
    // (`:hover::before` is valid, `::before:hover` mostly isn't), so this
    // fixed order applies regardless of which order the modifiers were
    // actually WRITTEN in (`before:hover:` and `hover:before:` produce the
    // identical selector shape).
    // `descendant_suffix` (from `*:`/`**:`) takes priority over
    // `child_suffix` (divide-x/divide-y/space-x/space-y's own automatic
    // " > * + *") when a class combines both, e.g. `*:divide-x-2` —
    // without this guard the two would concatenate into a garbled,
    // unintended selector like ".foo > * + * > *". `*:`/`**:` is an
    // explicit modifier the caller chose to write; the divide/space
    // combinator is an implicit side effect of the utility value, so the
    // explicit choice wins rather than the two silently combining.
    let child_suffix = if needs_child_combinator && descendant_suffix.is_empty() { CHILD_COMBINATOR_SUFFIX } else { "" };
    let base_selector = match mode {
        SelectorMode::Class => {
            let escaped = escape_selector(&parsed.original);
            format!(".{escaped}{pseudo_suffix}{pseudo_element_suffix}{child_suffix}{descendant_suffix}")
        }
        SelectorMode::DataAttribute => {
            let attr_value = escape_attr_value(&parsed.original);
            format!("[data-kb~=\"{attr_value}\"]{pseudo_suffix}{pseudo_element_suffix}{child_suffix}{descendant_suffix}")
        }
    };
    let selector = format!("{ancestor_prefix}{base_selector}");

    let decl_text = if needs_important { apply_important(&decl_text) } else { decl_text };

    let mut rule = match dark_scheme {
        Some(scheme) => wrap_dark_scheme(scheme, theme.dark_mode, &selector, &decl_text),
        None => format!("{selector} {{ {decl_text} }}"),
    };

    // Wrapped innermost-first: `@starting-style` right around the base
    // rule, then `@container`, then `@supports`, then `@media` outermost —
    // an arbitrary but fixed nesting order. At-rules like these are
    // independent AND'd conditions with no interaction between them, so any
    // consistent nesting order produces equivalent, valid CSS; this one
    // just happens to match the order these blocks are computed in above.
    if needs_starting_style {
        rule = format!("@starting-style {{ {rule} }}");
    }

    for cq in &container_wrappers {
        rule = format!("@container {cq} {{ {rule} }}");
    }
    if let Some(width) = container_min_width {
        rule = format!("@container (min-width: {width}px) {{ {rule} }}");
    }

    for sq in &supports_wrappers {
        rule = format!("@supports {sq} {{ {rule} }}");
    }

    for mq in &media_wrappers {
        rule = format!("@media {mq} {{ {rule} }}");
    }

    if let Some(width) = min_width {
        rule = format!("@media (min-width: {width}px) {{ {rule} }}");
    }

    Some(BuiltRule { rule, order })
}

/// The `sm`/`md`/`lg`/`xl`/`2xl` breakpoint names real Tailwind's own
/// `.container` component reads its `max-width` ladder from, in ascending
/// order — the SAME 5 names (and the SAME `theme.screens` scale) a plain
/// `sm:` modifier already resolves against, not a separate hardcoded
/// scale, so a breakpoint a caller's theme doesn't define simply doesn't
/// get a rung.
const CONTAINER_BREAKPOINTS: [&str; 5] = ["sm", "md", "lg", "xl", "2xl"];

/// `container`'s per-breakpoint `max-width` ladder — the piece
/// `resolvers::layout`'s `"container"` arm deliberately leaves out (see its
/// own doc comment) because it's a "one token, many rules" utility, the
/// same shape `animate-*`'s `@keyframes` block needed `build_keyframes_rule`
/// for. Reuses `build_rule_with_mode` for each rung — same `parsed` token,
/// so any modifiers already on it (e.g. a hypothetical `dark:container`)
/// still apply — with a synthetic single-declaration `max-width` list
/// standing in for the normal resolver output, then wraps the result in
/// `@media (min-width: ...)`.
///
/// Every one of these `@media (min-width: ...)` conditions stays true
/// simultaneously at wide viewports (unlike ordinary non-overlapping
/// breakpoint modifier RANGES), so a wider rung must always land LATER in
/// the stylesheet for its `max-width` to win the cascade — `order` climbs a
/// tiny amount per rung, relative to the base `width: 100%` rule's own
/// order, to guarantee that regardless of caller-side sort stability.
fn container_breakpoint_rules_with_mode(parsed: &ParsedClass, theme: &ThemeConfig, base_order: f64, mode: SelectorMode) -> Vec<BuiltRule> {
    let mut rules = Vec::new();
    for (i, name) in CONTAINER_BREAKPOINTS.iter().enumerate() {
        let Some(&width) = theme.screens.get(*name) else { continue };
        let decls = vec![Declaration { property: "max-width".to_string(), value: format!("{width}px") }];
        if let Some(built) = build_rule_with_mode(parsed, &decls, theme, mode) {
            let rule = format!("@media (min-width: {width}px) {{ {} }}", built.rule);
            rules.push(BuiltRule { rule, order: base_order + (i as f64 + 1.0) * 0.0001 });
        }
    }
    rules
}

/// `Class`-mode entry point for `container_breakpoint_rules_with_mode` — see
/// `build_rule`/`build_rule_for_attribute`'s own split for why two thin
/// public wrappers exist around one shared private mode-aware function.
pub fn container_breakpoint_rules(parsed: &ParsedClass, theme: &ThemeConfig, base_order: f64) -> Vec<BuiltRule> {
    container_breakpoint_rules_with_mode(parsed, theme, base_order, SelectorMode::Class)
}

/// `DataAttribute`-mode counterpart to `container_breakpoint_rules`, for
/// `lib.rs::resolve_class_string_for_attribute` (Expo Web).
pub fn container_breakpoint_rules_for_attribute(parsed: &ParsedClass, theme: &ThemeConfig, base_order: f64) -> Vec<BuiltRule> {
    container_breakpoint_rules_with_mode(parsed, theme, base_order, SelectorMode::DataAttribute)
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
    fn orders_gradient_stop_utilities_from_before_via_before_to() {
        // Regression test: from-*/via-*/to-* rules are injected incrementally
        // as they're first encountered anywhere on the page (see kb.ts), not
        // emitted in one fixed-category pass like Tailwind's AOT compiler —
        // so without a deterministic sub-tier order, a page where `to-*` is
        // first needed by an earlier element than `via-*` would leave
        // `via-*`'s `--kb-gradient-to` reset sorted AFTER `to-*`'s real
        // color, silently breaking every 3-stop gradient on the page.
        let theme = ThemeConfig::default();
        let from = build_rule(&parse_class("from-blue-6"), &[decl("--kb-gradient-from", "x")], &theme).unwrap();
        let via = build_rule(&parse_class("via-blue-6"), &[decl("--kb-gradient-to", "x")], &theme).unwrap();
        let to = build_rule(&parse_class("to-blue-6"), &[decl("--kb-gradient-to", "x")], &theme).unwrap();
        assert!(from.order < via.order);
        assert!(via.order < to.order);
        // The sub-tier offset must stay well inside the base (order 0.0)
        // band, clear of the next modifier tier (hover, order 10.0).
        assert!(to.order < 1.0);
    }

    #[test]
    fn gradient_stop_sub_tier_stacks_correctly_under_a_modifier() {
        // "hover:to-*" must still sort after "hover:via-*" — the sub-tier
        // offset is additive on top of whatever modifier tier already
        // applies, not a replacement of it.
        let theme = ThemeConfig::default();
        let via = build_rule(&parse_class("hover:via-blue-6"), &[decl("--kb-gradient-to", "x")], &theme).unwrap();
        let to = build_rule(&parse_class("hover:to-blue-6"), &[decl("--kb-gradient-to", "x")], &theme).unwrap();
        let dark = build_rule(&parse_class("dark:bg-blue-6"), &[decl("background-color", "x")], &theme).unwrap();
        assert!(via.order < to.order);
        assert!(to.order < dark.order);
    }

    #[test]
    fn direct_children_variant_targets_a_child_combinator() {
        let theme = ThemeConfig::default();
        let rule = build_rule(&parse_class("*:flex"), &[decl("display", "flex")], &theme).unwrap();
        assert_eq!(rule.rule, ".\\*\\:flex > * { display: flex }");
    }

    #[test]
    fn direct_children_variant_takes_priority_over_divides_own_child_combinator() {
        // Regression: divide-x/divide-y/space-x/space-y's own automatic
        // " > * + *" combinator (needs_child_combinator) and "*:"/"**:"'s
        // own " > *"/" *" suffix (descendant_suffix) used to both apply
        // unguarded — "*:divide-x" produced a garbled selector like
        // ".foo > * + * > *" instead of either shape alone. The explicit
        // "*:" modifier should win, not silently concatenate.
        let theme = ThemeConfig::default();
        let rule = build_rule(&parse_class("*:divide-x"), &[decl("__divide-x-width", "1px")], &theme).unwrap();
        assert!(rule.rule.starts_with(".\\*\\:divide-x > * {"), "got: {}", rule.rule);
        assert!(!rule.rule.contains("> * + * >"), "got: {}", rule.rule);

        // Plain (non-"*:") divide-x is unaffected — still gets its own
        // child-combinator suffix as before.
        let plain = build_rule(&parse_class("divide-x"), &[decl("__divide-x-width", "1px")], &theme).unwrap();
        assert!(plain.rule.starts_with(".divide-x > * + * {"), "got: {}", plain.rule);
    }

    #[test]
    fn all_descendants_variant_targets_a_plain_descendant_combinator() {
        let theme = ThemeConfig::default();
        let rule = build_rule(&parse_class("**:flex"), &[decl("display", "flex")], &theme).unwrap();
        assert_eq!(rule.rule, ".\\*\\*\\:flex * { display: flex }");
    }

    #[test]
    fn supports_variant_wraps_the_rule_in_an_at_supports_block() {
        let theme = ThemeConfig::default();
        let rule = build_rule(&parse_class("supports-[display:grid]:flex"), &[decl("display", "flex")], &theme).unwrap();
        assert_eq!(rule.rule, "@supports (display:grid) { .supports-\\[display\\:grid\\]\\:flex { display: flex } }");
    }

    #[test]
    fn in_star_variant_matches_any_ancestor_in_that_state_via_where() {
        let theme = ThemeConfig::default();
        let rule = build_rule(&parse_class("in-hover:opacity-100"), &[decl("opacity", "1")], &theme).unwrap();
        assert_eq!(rule.rule, ":where(:hover) .in-hover\\:opacity-100 { opacity: 1 }");
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
    fn builds_a_has_variant_rule_with_its_bracket_selector_escaped_in_the_class_name() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("has-[a:hover]:bg-red-6");
        let decls = vec![decl("background-color", "#ef4444")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(
            rule.rule,
            ".has-\\[a\\:hover\\]\\:bg-red-6:has(a:hover) { background-color: #ef4444 }",
        );
    }

    #[test]
    fn builds_a_data_attribute_variant_rule() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("data-[state=open]:block");
        let decls = vec![decl("display", "block")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".data-\\[state\\=open\\]\\:block[data-state=\"open\"] { display: block }");
    }

    #[test]
    fn builds_a_generalized_group_variant_rule_not_in_the_static_table() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("group-active:bg-red-6");
        let decls = vec![decl("background-color", "#ef4444")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".group:active .group-active\\:bg-red-6 { background-color: #ef4444 }");
    }

    #[test]
    fn builds_a_not_variant_rule_wrapping_a_known_pseudo_modifier() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("not-hover:bg-red-6");
        let decls = vec![decl("background-color", "#ef4444")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".not-hover\\:bg-red-6:not(:hover) { background-color: #ef4444 }");
    }

    #[test]
    fn builds_an_arbitrary_min_width_breakpoint_rule() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("min-[600px]:flex");
        let decls = vec![decl("display", "flex")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, "@media (min-width: 600px) { .min-\\[600px\\]\\:flex { display: flex } }");
    }

    #[test]
    fn builds_an_arbitrary_container_query_rule() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("@min-[400px]:flex");
        let decls = vec![decl("display", "flex")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, "@container (min-width: 400px) { .\\@min-\\[400px\\]\\:flex { display: flex } }");
    }

    #[test]
    fn builds_a_named_container_responsive_rule_reusing_theme_screens() {
        let mut screens = std::collections::HashMap::new();
        screens.insert("sm".to_string(), 640.0);
        let theme = ThemeConfig { screens, ..Default::default() };
        let parsed = parse_class("@sm:flex");
        let decls = vec![decl("display", "flex")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, "@container (min-width: 640px) { .\\@sm\\:flex { display: flex } }");
    }

    #[test]
    fn builds_the_container_breakpoint_ladder_only_for_configured_screens() {
        let mut screens = std::collections::HashMap::new();
        screens.insert("sm".to_string(), 640.0);
        screens.insert("lg".to_string(), 1024.0);
        let theme = ThemeConfig { screens, ..Default::default() };
        let parsed = parse_class("container");
        let rules = container_breakpoint_rules(&parsed, &theme, 0.0);
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].rule, "@media (min-width: 640px) { .container { max-width: 640px } }");
        assert_eq!(rules[1].rule, "@media (min-width: 1024px) { .container { max-width: 1024px } }");
        assert!(rules[0].order < rules[1].order);
    }

    #[test]
    fn container_breakpoint_ladder_respects_modifiers_on_the_token() {
        let mut screens = std::collections::HashMap::new();
        screens.insert("sm".to_string(), 640.0);
        let theme = ThemeConfig { screens, ..Default::default() };
        let parsed = parse_class("dark:container");
        let rules = container_breakpoint_rules(&parsed, &theme, 0.0);
        assert_eq!(rules.len(), 1);
        assert!(rules[0].rule.contains("max-width: 640px"), "{}", rules[0].rule);
        assert!(rules[0].rule.contains("dark"), "{}", rules[0].rule);
    }

    #[test]
    fn builds_a_starting_style_wrapped_rule() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("starting:opacity-0");
        let decls = vec![decl("opacity", "0")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, "@starting-style { .starting\\:opacity-0 { opacity: 0 } }");
    }

    #[test]
    fn builds_an_arbitrary_property_rule() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("[mask-type:luminance]");
        let decls = vec![decl("mask-type", "luminance")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".\\[mask-type\\:luminance\\] { mask-type: luminance }");
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
            ".divide-x > * + * { border-left-style: solid; border-right-style: solid; \
border-right-width: calc(1px * var(--kb-divide-x-reverse, 0)); \
border-left-width: calc(1px * calc(1 - var(--kb-divide-x-reverse, 0))) }",
        );
    }

    #[test]
    fn divide_x_reverse_only_sets_the_reverse_variable() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("divide-x-reverse");
        let decls = vec![decl("__divide-x-reverse", "1")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".divide-x-reverse > * + * { --kb-divide-x-reverse: 1 }");
    }

    #[test]
    fn builds_a_before_rule_with_the_pseudo_element_suffix_and_auto_injected_content() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("before:block");
        let decls = vec![decl("display", "block")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".before\\:block::before { display: block; content: var(--kb-content, \"\") }");
    }

    #[test]
    fn builds_an_after_rule_with_the_pseudo_element_suffix_and_auto_injected_content() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("after:block");
        let decls = vec![decl("display", "block")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".after\\:block::after { display: block; content: var(--kb-content, \"\") }");
    }

    #[test]
    fn a_before_content_utility_rule_also_gets_the_auto_injected_content_reader() {
        // Confirms the composition mechanism itself, not just that both
        // resolve independently: the content-setting rule ALSO emits the
        // `content: var(--kb-content, "")` reader, so it renders correctly
        // even when used completely alone (no separate `before:block`
        // needed on the same element). `decls` here mirrors exactly what
        // `typography::content_value` produces for "before:content-[Hi]"
        // (an unquoted arbitrary value gets auto-quoted — see that
        // function's own tests for the quoting logic itself).
        let theme = ThemeConfig::default();
        let parsed = parse_class("before:content-[Hi]");
        let decls = vec![decl("--kb-content", "\"Hi\"")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(
            rule.rule,
            ".before\\:content-\\[Hi\\]::before { --kb-content: \"Hi\"; content: var(--kb-content, \"\") }",
        );
    }

    #[test]
    fn non_content_pseudo_elements_do_not_get_the_auto_injected_content_reader() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("placeholder:text-blue-6");
        let decls = vec![decl("color", "#2563eb")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".placeholder\\:text-blue-6::placeholder { color: #2563eb }");
    }

    #[test]
    fn a_pseudo_class_and_pseudo_element_combine_with_the_element_last() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("hover:before:block");
        let decls = vec![decl("display", "block")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        // The pseudo-CLASS (:hover) comes before the pseudo-ELEMENT
        // (::before), matching CSS's own required ordering, regardless of
        // which order the modifiers were written in.
        assert!(rule.rule.starts_with(".hover\\:before\\:block:hover::before"), "got: {}", rule.rule);
    }

    #[test]
    fn attribute_mode_also_supports_pseudo_elements() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("before:block");
        let decls = vec![decl("display", "block")];
        let rule = build_rule_for_attribute(&parsed, &decls, &theme).unwrap();
        assert_eq!(
            rule.rule,
            "[data-kb~=\"before:block\"]::before { display: block; content: var(--kb-content, \"\") }",
        );
    }

    #[test]
    fn builds_a_negative_value_class_selector_with_no_extra_escaping_needed() {
        // A leading "-" followed by a letter is already valid, unescaped
        // CSS identifier syntax — no change needed to escape_selector for
        // the negative-value convention to produce a correct selector.
        let theme = ThemeConfig::default();
        let parsed = parse_class("-mt-4");
        let decls = vec![decl("margin-top", "-16px")];
        let rule = build_rule(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, ".-mt-4 { margin-top: -16px }");

        let attr_rule = build_rule_for_attribute(&parsed, &decls, &theme).unwrap();
        assert_eq!(attr_rule.rule, "[data-kb~=\"-mt-4\"] { margin-top: -16px }");
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
    fn builds_a_keyframes_rule_ordered_before_the_base_tier() {
        let rule = build_keyframes_rule("kb-spin", "from { transform: rotate(0deg) } to { transform: rotate(360deg) }");
        assert_eq!(rule.rule, "@keyframes kb-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }");
        assert!(rule.order < 0.0);
    }

    #[test]
    fn returns_none_for_empty_declarations() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("group");
        let rule = build_rule(&parsed, &[], &theme);
        assert!(rule.is_none());
    }

    #[test]
    fn attribute_mode_builds_a_data_kb_attribute_selector_instead_of_a_class_selector() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("bg-blue-6");
        let decls = vec![decl("background-color", "#2563eb")];
        let rule = build_rule_for_attribute(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, "[data-kb~=\"bg-blue-6\"] { background-color: #2563eb }");
        assert_eq!(rule.order, 0.0);
    }

    #[test]
    fn attribute_mode_appends_the_pseudo_class_after_the_attribute_selector() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("hover:bg-blue-8");
        let decls = vec![decl("background-color", "#1e40af")];
        let rule = build_rule_for_attribute(&parsed, &decls, &theme).unwrap();
        assert_eq!(rule.rule, "[data-kb~=\"hover:bg-blue-8\"]:hover { background-color: #1e40af }");
    }

    #[test]
    fn attribute_mode_needs_no_identifier_escaping_for_special_characters() {
        // Unlike Class mode, a leading digit / brackets / colons need no
        // escaping at all inside a quoted attribute-selector value.
        let mut screens = std::collections::HashMap::new();
        screens.insert("2xl".to_string(), 1536.0);
        let theme = ThemeConfig { screens, ..Default::default() };
        let parsed = parse_class("2xl:bg-[#6366f1]");
        let decls = vec![decl("background-color", "#6366f1")];
        let rule = build_rule_for_attribute(&parsed, &decls, &theme).unwrap();
        assert!(rule.rule.contains("[data-kb~=\"2xl:bg-[#6366f1]\"]"));
    }

    #[test]
    fn attribute_mode_escapes_a_quote_in_an_arbitrary_value_to_prevent_selector_injection() {
        let theme = ThemeConfig::default();
        let parsed = parse_class("bg-[\"evil]");
        let decls = vec![decl("background-color", "x")];
        let rule = build_rule_for_attribute(&parsed, &decls, &theme).unwrap();
        assert!(rule.rule.contains("\\\""), "quote must be backslash-escaped, got: {}", rule.rule);
        assert!(!rule.rule.contains("\"]evil"), "unescaped quote would break out of the attribute value");
    }

    #[test]
    fn attribute_mode_prefixes_ancestor_selectors_and_wraps_dark_mode_the_same_as_class_mode() {
        let theme = ThemeConfig { dark_mode: DarkModeStrategy::Attribute, ..Default::default() };
        let group = build_rule_for_attribute(&parse_class("group-hover:text-blue-6"), &[decl("color", "#2563eb")], &theme).unwrap();
        assert_eq!(group.rule, ".group:hover [data-kb~=\"group-hover:text-blue-6\"] { color: #2563eb }");

        let dark = build_rule_for_attribute(&parse_class("dark:bg-blue-8"), &[decl("background-color", "#1e40af")], &theme).unwrap();
        assert_eq!(dark.rule, "[data-theme=\"dark\"] [data-kb~=\"dark:bg-blue-8\"] { background-color: #1e40af }");
    }
}
