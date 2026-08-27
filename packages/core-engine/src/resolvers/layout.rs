use super::{decl, resolve_negatable_size, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

/// Prefixes `value` with "-" when `negative` is set — `z`/`order` are
/// unitless raw passthroughs (never looked up in the spacing scale), so
/// negating them is just string prefixing, unlike `resolve_negatable_length`'s
/// spacing-scale lookup.
fn negate_raw(value: &str, negative: bool) -> String {
    if negative { format!("-{value}") } else { value.to_string() }
}

const OBJECT_FIT: &[(&str, &str)] =
    &[("contain", "contain"), ("cover", "cover"), ("fill", "fill"), ("none", "none"), ("scale-down", "scale-down")];

const OBJECT_POSITION: &[(&str, &str)] = &[
    ("top", "top"),
    ("bottom", "bottom"),
    ("left", "left"),
    ("right", "right"),
    ("center", "center"),
    ("left-top", "left top"),
    ("left-bottom", "left bottom"),
    ("right-top", "right top"),
    ("right-bottom", "right bottom"),
];

/// "object-" is two-way ambiguous, same shape as "bg-": a recognized
/// object-fit keyword takes priority, anything else is checked against the
/// object-position keyword set.
fn resolve_object(value: &str) -> Option<Vec<Declaration>> {
    if let Some(fit) = OBJECT_FIT.iter().find(|(k, _)| *k == value).map(|(_, v)| *v) {
        return Some(vec![decl("object-fit", fit)]);
    }
    OBJECT_POSITION.iter().find(|(k, _)| *k == value).map(|(_, v)| vec![decl("object-position", v)])
}

fn overscroll_value(axis_property: &str, value: &str) -> Option<Vec<Declaration>> {
    let v = match value {
        "auto" => "auto",
        "contain" => "contain",
        "none" => "none",
        _ => return None,
    };
    Some(vec![decl(axis_property, v)])
}

fn overflow_axis_value(axis_property: &str, value: &str) -> Option<Vec<Declaration>> {
    let v = match value {
        "auto" => "auto",
        "hidden" => "hidden",
        "clip" => "clip",
        "visible" => "visible",
        "scroll" => "scroll",
        _ => return None,
    };
    Some(vec![decl(axis_property, v)])
}

const BREAK_AFTER_BEFORE: &[&str] = &["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
const BREAK_INSIDE: &[&str] = &["auto", "avoid", "avoid-page", "avoid-column"];

/// Real Tailwind's named `columns` scale — `sm`-`7xl` match
/// `spacing.rs`'s own `named_size` container scale exactly (same
/// underlying rem values), duplicated here rather than shared across
/// modules for 13 entries; `3xs`/`2xs`/`xs` are unique to this scale.
fn columns_named_size(key: &str) -> Option<&'static str> {
    Some(match key {
        "3xs" => "16rem",
        "2xs" => "18rem",
        "xs" => "20rem",
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
        _ => return None,
    })
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "flex" if parsed.value.is_none() => Some(vec![decl("display", "flex")]),
        "grid" => Some(vec![decl("display", "grid")]),
        // Guarded the same way "flex" above already is — spacing.rs's new
        // logical-sizing "block-*" family (`block-64`, `block-full`, ...)
        // registered "block-" as a VALUE_PREFIXES entry, so "block-full"
        // now arrives here as utility="block" + value="full", not as a
        // standalone "block" literal with no value at all. Without this
        // guard, EVERY "block-*" logical-sizing class would wrongly resolve
        // to plain `display: block` here before spacing.rs ever got a
        // chance to see it (this module runs first in `resolve_utility`'s
        // `.or_else` chain) — the exact bug the "inline" arm right below
        // already had to be fixed for, for the same underlying reason.
        "block" if parsed.value.is_none() => Some(vec![decl("display", "block")]),
        // "inline-block"/"inline-flex"/"inline-grid" now arrive here as
        // utility="inline" + value="block"/"flex"/"grid" (bare "inline" has
        // no value at all), not as their own standalone literal utility
        // names — spacing.rs's own new logical-sizing "inline-*" family
        // (`inline-4`, `inline-full`, ...) registered "inline-" as a
        // VALUE_PREFIXES entry, which unconditionally strips that prefix
        // from every "inline-something" token, this one included. Checked
        // BEFORE `spacing::resolve` in `resolve_utility`'s `.or_else` chain
        // (this module runs first), so any value that ISN'T one of these
        // three display keywords falls through (`_ => None`) to spacing.rs's
        // own "inline" arm, which resolves it as `inline-size` instead.
        "inline" => match parsed.value.as_deref() {
            None => Some(vec![decl("display", "inline")]),
            Some("block") => Some(vec![decl("display", "inline-block")]),
            Some("flex") => Some(vec![decl("display", "inline-flex")]),
            Some("grid") => Some(vec![decl("display", "inline-grid")]),
            _ => None,
        },
        "contents" => Some(vec![decl("display", "contents")]),
        "flow-root" => Some(vec![decl("display", "flow-root")]),
        "hidden" => Some(vec![decl("display", "none")]),
        // Container queries (Phase 25) — marks this element as a query
        // container for its descendants' `@sm:`/`@min-[...]:`-style
        // container-relative variants (registry.rs's dynamic modifier
        // resolution). Named containers (`@container/sidebar`, letting a
        // descendant target that specific ancestor by name via
        // `@sm/sidebar:`) are deliberately NOT supported — that needs the
        // arbitrary-value-shaped utility name `@container/{name}` to also
        // emit `container-name`, and the corresponding variant needs a
        // third dynamic-modifier shape (`@sm/{name}:`) to reference it,
        // meaningful added complexity for a rarely-needed feature; the bare
        // (unnamed, `container-type` only) form covers the common case.
        "@container" => Some(vec![decl("container-type", "inline-size")]),
        "items-center" => Some(vec![decl("align-items", "center")]),
        "items-start" => Some(vec![decl("align-items", "flex-start")]),
        "items-end" => Some(vec![decl("align-items", "flex-end")]),
        "items-baseline" => Some(vec![decl("align-items", "baseline")]),
        "items-stretch" => Some(vec![decl("align-items", "stretch")]),
        "justify-center" => Some(vec![decl("justify-content", "center")]),
        "justify-start" => Some(vec![decl("justify-content", "flex-start")]),
        "justify-end" => Some(vec![decl("justify-content", "flex-end")]),
        "justify-between" => Some(vec![decl("justify-content", "space-between")]),
        "justify-around" => Some(vec![decl("justify-content", "space-around")]),
        "justify-evenly" => Some(vec![decl("justify-content", "space-evenly")]),
        "justify-normal" => Some(vec![decl("justify-content", "normal")]),
        "justify-stretch" => Some(vec![decl("justify-content", "stretch")]),
        // "content-" is a registered VALUE_PREFIXES entry (needed for the
        // pseudo-element `content-[...]`/`content-none` utility — see
        // typography.rs's own "content" arm), so "content-center"/etc
        // arrive here as utility="content" + a value, disambiguated by the
        // align-content keyword table below; anything NOT in that table
        // (arbitrary values, "none") falls through — `resolve_utility`'s
        // dispatch chain tries `typography::resolve` next, which owns the
        // pseudo-element meaning of "content".
        "content" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return None;
            }
            let v = match value {
                "start" => "flex-start",
                "end" => "flex-end",
                "center" => "center",
                "between" => "space-between",
                "around" => "space-around",
                "evenly" => "space-evenly",
                "stretch" => "stretch",
                "normal" => "normal",
                _ => return None,
            };
            Some(vec![decl("align-content", v)])
        }
        "self-auto" => Some(vec![decl("align-self", "auto")]),
        "self-center" => Some(vec![decl("align-self", "center")]),
        "self-start" => Some(vec![decl("align-self", "flex-start")]),
        "self-end" => Some(vec![decl("align-self", "flex-end")]),
        "self-stretch" => Some(vec![decl("align-self", "stretch")]),
        "self-baseline" => Some(vec![decl("align-self", "baseline")]),
        "overflow-hidden" => Some(vec![decl("overflow", "hidden")]),
        "overflow-auto" => Some(vec![decl("overflow", "auto")]),
        "overflow-scroll" => Some(vec![decl("overflow", "scroll")]),
        "overflow-visible" => Some(vec![decl("overflow", "visible")]),
        "overflow-clip" => Some(vec![decl("overflow", "clip")]),
        "overflow-x" => overflow_axis_value("overflow-x", parsed.value.as_deref()?),
        "overflow-y" => overflow_axis_value("overflow-y", parsed.value.as_deref()?),
        "overscroll" => overscroll_value("overscroll-behavior", parsed.value.as_deref()?),
        "overscroll-x" => overscroll_value("overscroll-behavior-x", parsed.value.as_deref()?),
        "overscroll-y" => overscroll_value("overscroll-behavior-y", parsed.value.as_deref()?),
        "static" => Some(vec![decl("position", "static")]),
        "relative" => Some(vec![decl("position", "relative")]),
        "absolute" => Some(vec![decl("position", "absolute")]),
        "fixed" => Some(vec![decl("position", "fixed")]),
        "sticky" => Some(vec![decl("position", "sticky")]),
        // z-index/order are unitless — a raw value passthrough, not a
        // spacing length, so negation (real Tailwind supports both
        // "-z-10" and "-order-1") is just a literal "-" prefix rather than
        // going through resolve_negatable_length's spacing-scale lookup.
        "z" => parsed.value.as_deref().map(|v| vec![decl("z-index", &negate_raw(v, parsed.negative))]),
        "order" => parsed.value.as_deref().map(|v| vec![decl("order", &negate_raw(v, parsed.negative))]),
        // flex-grow/flex-shrink accept any plain number, not just 0/1 — bare
        // (no value) defaults to 1, matching Tailwind's `grow`/`shrink`.
        "grow" => Some(vec![decl("flex-grow", parsed.value.as_deref().unwrap_or("1"))]),
        "shrink" => Some(vec![decl("flex-shrink", parsed.value.as_deref().unwrap_or("1"))]),
        // top/right/bottom/left/inset support real Tailwind's negative-value
        // convention ("-top-4") AND its percentage-fraction scale ("top-1/2",
        // "-inset-1/3") — see resolve_negatable_size's own doc comment.
        "top" => resolve_negatable_size(theme, parsed).map(|v| vec![decl("top", &v)]),
        "right" => resolve_negatable_size(theme, parsed).map(|v| vec![decl("right", &v)]),
        "bottom" => resolve_negatable_size(theme, parsed).map(|v| vec![decl("bottom", &v)]),
        "left" => resolve_negatable_size(theme, parsed).map(|v| vec![decl("left", &v)]),
        "inset" => resolve_negatable_size(theme, parsed).map(|v| vec![decl("inset", &v)]),
        "inset-x" => {
            let v = resolve_negatable_size(theme, parsed)?;
            Some(vec![decl("left", &v), decl("right", &v)])
        }
        "inset-y" => {
            let v = resolve_negatable_size(theme, parsed)?;
            Some(vec![decl("top", &v), decl("bottom", &v)])
        }
        // Logical inset — just a different CSS property NAME (the browser
        // resolves which physical side based on `dir`/`writing-mode`, not
        // this engine), so no direction-tracking logic is needed here.
        "start" => resolve_negatable_size(theme, parsed).map(|v| vec![decl("inset-inline-start", &v)]),
        "end" => resolve_negatable_size(theme, parsed).map(|v| vec![decl("inset-inline-end", &v)]),
        // "aspect-" is a registered VALUE_PREFIXES entry, so "aspect-square"/
        // "aspect-video" arrive here as utility="aspect" + a value, disambiguated
        // the same way every other "prefix-then-keyword" utility is.
        "aspect" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("aspect-ratio", value)]);
            }
            match value {
                "square" => Some(vec![decl("aspect-ratio", "1 / 1")]),
                "video" => Some(vec![decl("aspect-ratio", "16 / 9")]),
                "auto" => Some(vec![decl("aspect-ratio", "auto")]),
                _ => None,
            }
        }
        "box-border" => Some(vec![decl("box-sizing", "border-box")]),
        "box-content" => Some(vec![decl("box-sizing", "content-box")]),
        "float-right" => Some(vec![decl("float", "right")]),
        "float-left" => Some(vec![decl("float", "left")]),
        "float-none" => Some(vec![decl("float", "none")]),
        "float-start" => Some(vec![decl("float", "inline-start")]),
        "float-end" => Some(vec![decl("float", "inline-end")]),
        "clear-left" => Some(vec![decl("clear", "left")]),
        "clear-right" => Some(vec![decl("clear", "right")]),
        "clear-both" => Some(vec![decl("clear", "both")]),
        "clear-none" => Some(vec![decl("clear", "none")]),
        "clear-start" => Some(vec![decl("clear", "inline-start")]),
        "clear-end" => Some(vec![decl("clear", "inline-end")]),
        "isolate" => Some(vec![decl("isolation", "isolate")]),
        "isolation-auto" => Some(vec![decl("isolation", "auto")]),
        "visible" => Some(vec![decl("visibility", "visible")]),
        "invisible" => Some(vec![decl("visibility", "hidden")]),
        "collapse" => Some(vec![decl("visibility", "collapse")]),
        "object" => resolve_object(parsed.value.as_deref()?),
        // The base rule — `width: 100%` plus `theme.container`'s optional
        // `center`/`padding` (real Tailwind's own `theme.container` config;
        // see `ContainerConfig`'s own doc comment for why `padding` is one
        // uniform value here, not real Tailwind's optional per-breakpoint
        // object form). The per-breakpoint `max-width` ladder real
        // Tailwind's `.container` also expands to is a SEPARATE set of
        // top-level rules (`css::container_breakpoint_rules`), injected by
        // `lib.rs`'s token loop alongside this one, the same way
        // `animate-*`'s `@keyframes` block is: this engine's
        // one-token-to-one-rule resolver model has no way to return more
        // than one rule from here. `padding`/`center` are the SAME at every
        // breakpoint under that simplification, so they belong on this
        // base rule only, not repeated into the ladder.
        "container" => {
            let mut decls = vec![decl("width", "100%")];
            if theme.container.center {
                decls.push(decl("margin-left", "auto"));
                decls.push(decl("margin-right", "auto"));
            }
            if let Some(padding) = &theme.container.padding {
                decls.push(decl("padding-left", padding));
                decls.push(decl("padding-right", padding));
            }
            Some(decls)
        }
        "columns" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("columns", value)]);
            }
            if value == "auto" {
                return Some(vec![decl("columns", "auto")]);
            }
            if let Some(size) = columns_named_size(value) {
                return Some(vec![decl("columns", size)]);
            }
            let n: i64 = value.parse().ok()?;
            if n < 1 {
                return None;
            }
            Some(vec![decl("columns", &n.to_string())])
        }
        "break-after" => {
            let value = parsed.value.as_deref()?;
            BREAK_AFTER_BEFORE.contains(&value).then(|| vec![decl("break-after", value)])
        }
        "break-before" => {
            let value = parsed.value.as_deref()?;
            BREAK_AFTER_BEFORE.contains(&value).then(|| vec![decl("break-before", value)])
        }
        "break-inside" => {
            let value = parsed.value.as_deref()?;
            BREAK_INSIDE.contains(&value).then(|| vec![decl("break-inside", value)])
        }
        "box-decoration-slice" => Some(vec![decl("box-decoration-break", "slice")]),
        "box-decoration-clone" => Some(vec![decl("box-decoration-break", "clone")]),
        _ => None,
    }
}

/// The `flex-` utility family — flex-direction (`row`/`col`/`row-reverse`/
/// `col-reverse`), flex-wrap (`wrap`/`wrap-reverse`/`nowrap`), the `flex`
/// shorthand (`1`/`auto`/`initial`/`none`/arbitrary numeric), and the
/// legacy Tailwind v2 `flex-grow`/`flex-grow-0`/`flex-shrink`/
/// `flex-shrink-0` names all share Tailwind's "flex-" prefix — now a
/// registered `VALUE_PREFIXES` entry (needed so `flex-[2]` arbitrary values
/// parse at all), so they arrive here as utility="flex" + a value and get
/// disambiguated by that value, the same way `resolve_text_native`
/// disambiguates "text-" into size/align/color.
///
/// `auto`/`initial`/`none` are CSS-only string values for the `flex`
/// shorthand — RN's `flex` style only accepts a plain number — so `web`
/// selects between the literal CSS keyword and old-kbach's numeric
/// fallback (`auto`/`initial` -> 1, `none` -> 0). Everything else here
/// (direction, wrap, `flex-1`, arbitrary, grow/shrink) is identical on both
/// platforms.
pub fn resolve_flex(parsed: &ParsedClass, web: bool) -> Option<Vec<Declaration>> {
    if parsed.utility != "flex" {
        return None;
    }
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(vec![decl("flex", value)]);
    }
    match value {
        "row" => Some(vec![decl("flex-direction", "row")]),
        "col" => Some(vec![decl("flex-direction", "column")]),
        "row-reverse" => Some(vec![decl("flex-direction", "row-reverse")]),
        "col-reverse" => Some(vec![decl("flex-direction", "column-reverse")]),
        "wrap" => Some(vec![decl("flex-wrap", "wrap")]),
        "wrap-reverse" => Some(vec![decl("flex-wrap", "wrap-reverse")]),
        "nowrap" => Some(vec![decl("flex-wrap", "nowrap")]),
        "1" => Some(vec![decl("flex", "1")]),
        "auto" => Some(vec![decl("flex", if web { "auto" } else { "1" })]),
        "initial" => Some(vec![decl("flex", if web { "initial" } else { "1" })]),
        "none" => Some(vec![decl("flex", if web { "none" } else { "0" })]),
        "grow" => Some(vec![decl("flex-grow", "1")]),
        "grow-0" => Some(vec![decl("flex-grow", "0")]),
        "shrink" => Some(vec![decl("flex-shrink", "1")]),
        "shrink-0" => Some(vec![decl("flex-shrink", "0")]),
        _ => None,
    }
}

/// `w-screen`/`h-screen`/`min-w-screen`/`max-w-screen`/`min-h-screen`/
/// `max-h-screen` — dynamic viewport units (`dvw`/`dvh`) instead of static
/// `vw`/`vh`: on mobile browsers, `vh`/`vw` are pinned to the *largest*
/// viewport size (address bar hidden), so a plain `100vh` overflows behind
/// the address bar once it's shown. `dvh`/`dvw` track the actual visible
/// viewport as browser chrome shows/hides — desktop is unaffected since
/// there's no dynamic chrome to account for. Mirrors
/// `old-kbach/packages/ui/src/core/resolvers/layout.ts`'s `-screen` entries.
///
/// Web-only by construction — called directly from `resolve_utility`, not
/// from the shared `layout::resolve` above (which both dispatchers use) —
/// because `dvw`/`dvh` are CSS viewport units with no React Native
/// equivalent; a raw `"100dvh"` string reaching `resolve_style.rs` would
/// fail RN's numeric/percentage style validation. A native app wanting true
/// screen dimensions needs `useWindowDimensions`/`Dimensions.get('window')`
/// at the JS layer, a fundamentally different (runtime, not static-class)
/// mechanism outside this resolver's scope.
pub fn resolve_screen_size(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    if parsed.is_arbitrary || parsed.value.as_deref() != Some("screen") {
        return None;
    }
    match parsed.utility.as_str() {
        "w" => Some(vec![decl("width", "100dvw")]),
        "h" => Some(vec![decl("height", "100dvh")]),
        "min-w" => Some(vec![decl("min-width", "100dvw")]),
        "max-w" => Some(vec![decl("max-width", "100dvw")]),
        "min-h" => Some(vec![decl("min-height", "100dvh")]),
        "max-h" => Some(vec![decl("max-height", "100dvh")]),
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
    fn resolves_display_utilities() {
        let t = theme();
        assert_eq!(resolve(&parse_class("flex"), &t), Some(vec![decl("display", "flex")]));
        assert_eq!(resolve(&parse_class("hidden"), &t), Some(vec![decl("display", "none")]));
        assert_eq!(resolve(&parse_class("grid"), &t), Some(vec![decl("display", "grid")]));
    }

    #[test]
    fn resolves_container_query_marker() {
        let t = theme();
        assert_eq!(resolve(&parse_class("@container"), &t), Some(vec![decl("container-type", "inline-size")]));
    }

    #[test]
    fn resolves_inset_from_spacing_scale() {
        let t = theme();
        assert_eq!(resolve(&parse_class("top-4"), &t), Some(vec![decl("top", "16px")]));
    }

    #[test]
    fn resolves_inset_percentage_fractions_positive_and_negative() {
        let t = theme();
        assert_eq!(resolve(&parse_class("top-1/2"), &t), Some(vec![decl("top", "50%")]));
        assert_eq!(resolve(&parse_class("left-1/2"), &t), Some(vec![decl("left", "50%")]));
        assert_eq!(resolve(&parse_class("right-1/3"), &t), Some(vec![decl("right", "33.333333%")]));
        assert_eq!(resolve(&parse_class("bottom-1/2"), &t), Some(vec![decl("bottom", "50%")]));
        assert_eq!(resolve(&parse_class("inset-1/2"), &t), Some(vec![decl("inset", "50%")]));
        assert_eq!(resolve(&parse_class("-top-1/2"), &t), Some(vec![decl("top", "-50%")]));
        assert_eq!(resolve(&parse_class("start-1/2"), &t), Some(vec![decl("inset-inline-start", "50%")]));
        assert_eq!(resolve(&parse_class("end-1/2"), &t), Some(vec![decl("inset-inline-end", "50%")]));
    }

    #[test]
    fn resolves_z_index_as_a_raw_unitless_value() {
        let t = theme();
        assert_eq!(resolve(&parse_class("z-50"), &t), Some(vec![decl("z-index", "50")]));
    }

    #[test]
    fn resolves_arbitrary_inset_value() {
        let t = theme();
        assert_eq!(resolve(&parse_class("top-[10vh]"), &t), Some(vec![decl("top", "10vh")]));
    }

    #[test]
    fn resolves_negative_inset_via_the_leading_dash_convention() {
        let t = theme();
        assert_eq!(resolve(&parse_class("-top-4"), &t), Some(vec![decl("top", "-16px")]));
        assert_eq!(resolve(&parse_class("-inset-4"), &t), Some(vec![decl("inset", "-16px")]));
    }

    #[test]
    fn resolves_negative_z_index_and_order_as_a_literal_dash_prefix() {
        let t = theme();
        assert_eq!(resolve(&parse_class("-z-10"), &t), Some(vec![decl("z-index", "-10")]));
        assert_eq!(resolve(&parse_class("-order-1"), &t), Some(vec![decl("order", "-1")]));
    }

    #[test]
    fn resolves_aspect_ratio_named_auto_and_arbitrary() {
        let t = theme();
        assert_eq!(resolve(&parse_class("aspect-square"), &t), Some(vec![decl("aspect-ratio", "1 / 1")]));
        assert_eq!(resolve(&parse_class("aspect-video"), &t), Some(vec![decl("aspect-ratio", "16 / 9")]));
        assert_eq!(resolve(&parse_class("aspect-auto"), &t), Some(vec![decl("aspect-ratio", "auto")]));
        assert_eq!(resolve(&parse_class("aspect-[4/3]"), &t), Some(vec![decl("aspect-ratio", "4/3")]));
    }

    #[test]
    fn resolves_box_sizing_float_clear_isolation_and_visibility() {
        let t = theme();
        assert_eq!(resolve(&parse_class("box-border"), &t), Some(vec![decl("box-sizing", "border-box")]));
        assert_eq!(resolve(&parse_class("box-content"), &t), Some(vec![decl("box-sizing", "content-box")]));
        assert_eq!(resolve(&parse_class("float-left"), &t), Some(vec![decl("float", "left")]));
        assert_eq!(resolve(&parse_class("float-start"), &t), Some(vec![decl("float", "inline-start")]));
        assert_eq!(resolve(&parse_class("clear-both"), &t), Some(vec![decl("clear", "both")]));
        assert_eq!(resolve(&parse_class("isolate"), &t), Some(vec![decl("isolation", "isolate")]));
        assert_eq!(resolve(&parse_class("invisible"), &t), Some(vec![decl("visibility", "hidden")]));
        assert_eq!(resolve(&parse_class("collapse"), &t), Some(vec![decl("visibility", "collapse")]));
    }

    #[test]
    fn resolves_object_fit_before_falling_back_to_object_position() {
        let t = theme();
        assert_eq!(resolve(&parse_class("object-cover"), &t), Some(vec![decl("object-fit", "cover")]));
        assert_eq!(resolve(&parse_class("object-scale-down"), &t), Some(vec![decl("object-fit", "scale-down")]));
        assert_eq!(resolve(&parse_class("object-top"), &t), Some(vec![decl("object-position", "top")]));
        assert_eq!(resolve(&parse_class("object-left-bottom"), &t), Some(vec![decl("object-position", "left bottom")]));
    }

    #[test]
    fn resolves_overflow_axis_variants_and_clip() {
        let t = theme();
        assert_eq!(resolve(&parse_class("overflow-clip"), &t), Some(vec![decl("overflow", "clip")]));
        assert_eq!(resolve(&parse_class("overflow-x-auto"), &t), Some(vec![decl("overflow-x", "auto")]));
        assert_eq!(resolve(&parse_class("overflow-y-hidden"), &t), Some(vec![decl("overflow-y", "hidden")]));
    }

    #[test]
    fn resolves_overscroll_behavior_bare_and_per_axis() {
        let t = theme();
        assert_eq!(resolve(&parse_class("overscroll-contain"), &t), Some(vec![decl("overscroll-behavior", "contain")]));
        assert_eq!(resolve(&parse_class("overscroll-x-none"), &t), Some(vec![decl("overscroll-behavior-x", "none")]));
        assert_eq!(resolve(&parse_class("overscroll-y-auto"), &t), Some(vec![decl("overscroll-behavior-y", "auto")]));
    }

    #[test]
    fn resolves_inset_x_y_and_logical_start_end() {
        let t = theme();
        assert_eq!(resolve(&parse_class("inset-x-4"), &t), Some(vec![decl("left", "16px"), decl("right", "16px")]));
        assert_eq!(resolve(&parse_class("inset-y-4"), &t), Some(vec![decl("top", "16px"), decl("bottom", "16px")]));
        assert_eq!(resolve(&parse_class("start-4"), &t), Some(vec![decl("inset-inline-start", "16px")]));
        assert_eq!(resolve(&parse_class("end-4"), &t), Some(vec![decl("inset-inline-end", "16px")]));
        assert_eq!(resolve(&parse_class("-start-4"), &t), Some(vec![decl("inset-inline-start", "-16px")]));
    }

    #[test]
    fn resolves_container_columns_and_break_utilities() {
        let t = theme();
        assert_eq!(resolve(&parse_class("container"), &t), Some(vec![decl("width", "100%")]));
        assert_eq!(resolve(&parse_class("columns-3"), &t), Some(vec![decl("columns", "3")]));
        assert_eq!(resolve(&parse_class("columns-auto"), &t), Some(vec![decl("columns", "auto")]));
        assert_eq!(resolve(&parse_class("columns-3xs"), &t), Some(vec![decl("columns", "16rem")]));
        assert_eq!(resolve(&parse_class("columns-md"), &t), Some(vec![decl("columns", "28rem")]));
        assert_eq!(resolve(&parse_class("break-after-column"), &t), Some(vec![decl("break-after", "column")]));
        assert_eq!(resolve(&parse_class("break-inside-avoid"), &t), Some(vec![decl("break-inside", "avoid")]));
        // "page" is a valid break-after/-before value but NOT a valid
        // break-inside value (a narrower allowed set) — confirms the two
        // tables aren't accidentally shared.
        assert_eq!(resolve(&parse_class("break-inside-page"), &t), None);
        assert_eq!(resolve(&parse_class("box-decoration-clone"), &t), Some(vec![decl("box-decoration-break", "clone")]));
    }

    #[test]
    fn container_honors_theme_container_center_and_padding() {
        use crate::theme::ContainerConfig;

        let mut centered = theme();
        centered.container = ContainerConfig { center: true, padding: None };
        assert_eq!(
            resolve(&parse_class("container"), &centered),
            Some(vec![decl("width", "100%"), decl("margin-left", "auto"), decl("margin-right", "auto")]),
        );

        let mut padded = theme();
        padded.container = ContainerConfig { center: false, padding: Some("2rem".to_string()) };
        assert_eq!(
            resolve(&parse_class("container"), &padded),
            Some(vec![decl("width", "100%"), decl("padding-left", "2rem"), decl("padding-right", "2rem")]),
        );

        let mut both = theme();
        both.container = ContainerConfig { center: true, padding: Some("2rem".to_string()) };
        assert_eq!(
            resolve(&parse_class("container"), &both),
            Some(vec![
                decl("width", "100%"),
                decl("margin-left", "auto"),
                decl("margin-right", "auto"),
                decl("padding-left", "2rem"),
                decl("padding-right", "2rem"),
            ]),
        );
    }

    #[test]
    fn resolves_justify_normal_and_stretch() {
        let t = theme();
        assert_eq!(resolve(&parse_class("justify-normal"), &t), Some(vec![decl("justify-content", "normal")]));
        assert_eq!(resolve(&parse_class("justify-stretch"), &t), Some(vec![decl("justify-content", "stretch")]));
    }

    #[test]
    fn content_center_still_resolves_align_content_despite_the_shared_content_prefix() {
        // "content-" is now a registered VALUE_PREFIXES entry (needed for
        // typography.rs's content-[...]/content-none pseudo-element
        // property), so this confirms the align-content keywords still
        // resolve correctly through the SAME "content" utility name.
        let t = theme();
        assert_eq!(resolve(&parse_class("content-center"), &t), Some(vec![decl("align-content", "center")]));
        assert_eq!(resolve(&parse_class("content-normal"), &t), Some(vec![decl("align-content", "normal")]));
        // "none" and arbitrary values are typography.rs's concern (the
        // pseudo-element content property), not an align-content keyword —
        // this arm must return None for those so the dispatch chain falls
        // through instead of silently swallowing them.
        assert_eq!(resolve(&parse_class("content-none"), &t), None);
        assert_eq!(resolve(&parse_class("content-[Hi]"), &t), None);
    }

    #[test]
    fn returns_none_for_unknown_utility() {
        let t = theme();
        assert_eq!(resolve(&parse_class("not-a-layout-utility"), &t), None);
    }

    #[test]
    fn resolves_screen_sizing_to_dynamic_viewport_units() {
        assert_eq!(resolve_screen_size(&parse_class("w-screen")), Some(vec![decl("width", "100dvw")]));
        assert_eq!(resolve_screen_size(&parse_class("h-screen")), Some(vec![decl("height", "100dvh")]));
        assert_eq!(resolve_screen_size(&parse_class("min-w-screen")), Some(vec![decl("min-width", "100dvw")]));
        assert_eq!(resolve_screen_size(&parse_class("max-w-screen")), Some(vec![decl("max-width", "100dvw")]));
        assert_eq!(resolve_screen_size(&parse_class("min-h-screen")), Some(vec![decl("min-height", "100dvh")]));
        assert_eq!(resolve_screen_size(&parse_class("max-h-screen")), Some(vec![decl("max-height", "100dvh")]));
    }

    #[test]
    fn does_not_resolve_screen_size_for_arbitrary_or_non_screen_values() {
        assert_eq!(resolve_screen_size(&parse_class("w-4")), None);
        assert_eq!(resolve_screen_size(&parse_class("w-[100vh]")), None);
        assert_eq!(resolve_screen_size(&parse_class("not-a-layout-utility")), None);
    }

    #[test]
    fn resolves_grow_shrink_and_order() {
        let t = theme();
        assert_eq!(resolve(&parse_class("grow"), &t), Some(vec![decl("flex-grow", "1")]));
        assert_eq!(resolve(&parse_class("grow-0"), &t), Some(vec![decl("flex-grow", "0")]));
        assert_eq!(resolve(&parse_class("shrink"), &t), Some(vec![decl("flex-shrink", "1")]));
        assert_eq!(resolve(&parse_class("shrink-0"), &t), Some(vec![decl("flex-shrink", "0")]));
        assert_eq!(resolve(&parse_class("grow-[2]"), &t), Some(vec![decl("flex-grow", "2")]));
        assert_eq!(resolve(&parse_class("order-3"), &t), Some(vec![decl("order", "3")]));
    }

    #[test]
    fn resolves_new_alignment_and_display_keywords() {
        let t = theme();
        assert_eq!(resolve(&parse_class("items-baseline"), &t), Some(vec![decl("align-items", "baseline")]));
        assert_eq!(resolve(&parse_class("justify-evenly"), &t), Some(vec![decl("justify-content", "space-evenly")]));
        assert_eq!(resolve(&parse_class("content-between"), &t), Some(vec![decl("align-content", "space-between")]));
        assert_eq!(resolve(&parse_class("self-auto"), &t), Some(vec![decl("align-self", "auto")]));
        assert_eq!(resolve(&parse_class("self-stretch"), &t), Some(vec![decl("align-self", "stretch")]));
        assert_eq!(resolve(&parse_class("inline-flex"), &t), Some(vec![decl("display", "inline-flex")]));
        assert_eq!(resolve(&parse_class("contents"), &t), Some(vec![decl("display", "contents")]));
    }

    #[test]
    fn resolves_flex_direction_and_wrap_via_the_flex_prefix() {
        assert_eq!(resolve_flex(&parse_class("flex-row"), true), Some(vec![decl("flex-direction", "row")]));
        assert_eq!(resolve_flex(&parse_class("flex-col"), true), Some(vec![decl("flex-direction", "column")]));
        assert_eq!(
            resolve_flex(&parse_class("flex-row-reverse"), true),
            Some(vec![decl("flex-direction", "row-reverse")]),
        );
        assert_eq!(resolve_flex(&parse_class("flex-wrap"), true), Some(vec![decl("flex-wrap", "wrap")]));
        assert_eq!(
            resolve_flex(&parse_class("flex-wrap-reverse"), true),
            Some(vec![decl("flex-wrap", "wrap-reverse")]),
        );
        assert_eq!(resolve_flex(&parse_class("flex-nowrap"), true), Some(vec![decl("flex-wrap", "nowrap")]));
    }

    #[test]
    fn resolves_the_flex_shorthand_with_platform_specific_keyword_values() {
        assert_eq!(resolve_flex(&parse_class("flex-1"), true), Some(vec![decl("flex", "1")]));
        assert_eq!(resolve_flex(&parse_class("flex-1"), false), Some(vec![decl("flex", "1")]));

        assert_eq!(resolve_flex(&parse_class("flex-auto"), true), Some(vec![decl("flex", "auto")]));
        assert_eq!(resolve_flex(&parse_class("flex-auto"), false), Some(vec![decl("flex", "1")]));

        assert_eq!(resolve_flex(&parse_class("flex-initial"), true), Some(vec![decl("flex", "initial")]));
        assert_eq!(resolve_flex(&parse_class("flex-initial"), false), Some(vec![decl("flex", "1")]));

        assert_eq!(resolve_flex(&parse_class("flex-none"), true), Some(vec![decl("flex", "none")]));
        assert_eq!(resolve_flex(&parse_class("flex-none"), false), Some(vec![decl("flex", "0")]));

        assert_eq!(resolve_flex(&parse_class("flex-[2]"), true), Some(vec![decl("flex", "2")]));
    }

    #[test]
    fn resolves_legacy_flex_grow_shrink_aliases_via_the_flex_prefix() {
        assert_eq!(resolve_flex(&parse_class("flex-grow"), true), Some(vec![decl("flex-grow", "1")]));
        assert_eq!(resolve_flex(&parse_class("flex-grow-0"), true), Some(vec![decl("flex-grow", "0")]));
        assert_eq!(resolve_flex(&parse_class("flex-shrink"), true), Some(vec![decl("flex-shrink", "1")]));
        assert_eq!(resolve_flex(&parse_class("flex-shrink-0"), true), Some(vec![decl("flex-shrink", "0")]));
    }

    #[test]
    fn flex_prefix_utility_no_longer_leaks_into_the_shared_resolve_match() {
        // "flex-row" etc. now parse as utility="flex", so they must NOT be
        // reachable through the plain `resolve()` used above — only through
        // `resolve_flex`, which both dispatchers call first.
        let t = theme();
        assert_eq!(resolve(&parse_class("flex-row"), &t), None);
    }
}
