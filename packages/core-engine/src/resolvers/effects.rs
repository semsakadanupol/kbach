use super::color::lookup_hex;
use super::{decl, resolve_percent, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

// A byte-exact copy of Tailwind's own published box-shadow scale (same
// offsets/blur/spread/opacity AND same `rgb(0 0 0 / X)` syntax and
// `shadow-none`'s "0 0 #0000" — not just the same numbers reimplemented in
// a different shape) — not a from-scratch approximation. Two layers per
// tier pair a tight, higher-opacity "contact" layer close to the element
// with a soft, wider, lower-opacity "ambient" layer that carries the
// actual sense of elevation (one layer for "sm", small enough that a
// second wouldn't read as distinct). `shadow-none` deliberately isn't the
// `none` keyword: `none` can't be interpolated against a real shadow
// value list, so `transition`-ing a `shadow-lg` element to `shadow-none`
// would just snap instead of animating — "0 0 #0000" is shaped like a
// real (invisible) shadow, so the browser can tween every layer smoothly.
//
/// Every layer's color is `var(--kb-shadow-color, {tier-default})` — the
/// same "default value inside the var() fallback" technique `border.rs`'s
/// ring system already uses — so a same-element `shadow-{color}` class
/// (see `shadow_color_declarations` below, which sets ONLY the variable,
/// never `box-shadow` itself) composes with whichever `shadow-{size}` tier
/// is also present, matching real Tailwind's own two-class requirement.
/// Bare `shadow-lg` alone keeps its exact original appearance, since the
/// unset variable falls back to the tier's own default color. `"none"` has
/// no color to vary at all (`0 0 #0000` isn't a real shadow layer with a
/// color channel), so it's a flat literal with no `var()`.
fn shadow_value(key: &str) -> Option<String> {
    let var = "var(--kb-shadow-color, rgb(0 0 0 / 0.1))";
    let var_light = "var(--kb-shadow-color, rgb(0 0 0 / 0.05))";
    let var_heavy = "var(--kb-shadow-color, rgb(0 0 0 / 0.25))";
    Some(match key {
        "sm" => format!("0 1px 2px 0 {var_light}"),
        "DEFAULT" => format!("0 1px 3px 0 {var}, 0 1px 2px -1px {var}"),
        "md" => format!("0 4px 6px -1px {var}, 0 2px 4px -2px {var}"),
        "lg" => format!("0 10px 15px -3px {var}, 0 4px 6px -4px {var}"),
        "xl" => format!("0 20px 25px -5px {var}, 0 8px 10px -6px {var}"),
        "2xl" => format!("0 25px 50px -12px {var_heavy}"),
        "inner" => format!("inset 0 2px 4px 0 {var_light}"),
        "none" => "0 0 #0000".to_string(),
        _ => return None,
    })
}

/// `shadow-{color}` — sets ONLY `--kb-shadow-color`; see `shadow_value`'s
/// own doc comment for how it composes with a `shadow-{size}` class.
/// Disambiguated from a `shadow-{size}` value the same way every other
/// "prefix means several things" utility in this crate is: `shadow_value`
/// checked first (a real tier name), falling back to this color lookup.
/// Named theme colors only — `resolve`'s "shadow" arm already intercepts
/// EVERY arbitrary `shadow-[...]` value earlier, as a raw `box-shadow`
/// string passthrough (`shadow-[0_4px_6px_red]`, pre-existing behavior);
/// this function is never reached with `parsed.is_arbitrary` set, so an
/// arbitrary shadow color specifically (`shadow-[#112233]`) isn't
/// distinguishable from that and isn't supported — a real color name
/// (`shadow-red-500`) is unambiguous and works.
fn shadow_color_declarations(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    let color = lookup_hex(theme, value)?;
    Some(vec![decl("--kb-shadow-color", color)])
}

/// React Native has no CSS `box-shadow` at all — iOS uses four discrete
/// style keys (`shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`)
/// and Android uses a single `elevation` number (a Material Design
/// abstraction with no independent control over blur/spread/offset): two
/// completely different shadow models, neither expressible as one CSS
/// string. This maps the same named tiers `shadow_value` above uses to a
/// reasonable approximation in BOTH shapes at once (offset/radius/opacity
/// scaled from the real values, `elevation` picked to look right at each
/// tier on Android), so one `shadow-lg` class produces a real shadow on
/// both platforms. No `"inner"` entry: neither platform's native shadow
/// API can express an inset shadow at all — not a values problem, there's
/// simply no native property to set — so it stays unsupported on native,
/// same as `filters`/`grid`/`animate-*` elsewhere in this crate.
struct NativeShadow {
    offset_y: f64,
    radius: f64,
    opacity: f64,
    elevation: f64,
}

fn native_shadow_value(key: &str) -> Option<NativeShadow> {
    Some(match key {
        "sm" => NativeShadow { offset_y: 1.0, radius: 2.0, opacity: 0.05, elevation: 1.0 },
        "DEFAULT" => NativeShadow { offset_y: 1.0, radius: 3.0, opacity: 0.1, elevation: 2.0 },
        "md" => NativeShadow { offset_y: 4.0, radius: 6.0, opacity: 0.1, elevation: 4.0 },
        "lg" => NativeShadow { offset_y: 10.0, radius: 15.0, opacity: 0.1, elevation: 8.0 },
        "xl" => NativeShadow { offset_y: 20.0, radius: 25.0, opacity: 0.1, elevation: 12.0 },
        "2xl" => NativeShadow { offset_y: 25.0, radius: 50.0, opacity: 0.25, elevation: 16.0 },
        "none" => NativeShadow { offset_y: 0.0, radius: 0.0, opacity: 0.0, elevation: 0.0 },
        _ => return None,
    })
}

/// Native counterpart to the `"shadow"`/`"shadow-*"` arm in `resolve`
/// above — wired into `resolve_utility_native` (resolvers/mod.rs), not
/// called from this module's own web-only `resolve`. Emits flat
/// declarations only (including two synthetic `shadow-offset-x`/
/// `shadow-offset-y` keys resolve_style.rs merges into a single nested
/// `shadowOffset: {width, height}` object — the one piece of RN's shadow
/// shape that isn't flat) rather than one shorthand, mirroring the
/// `__`-prefixed divide/space marker technique resolve_style.rs already
/// uses for values that don't fit a flat property/value pair. Arbitrary
/// shadow values (`shadow-[...]`) aren't supported here: an arbitrary
/// value is a raw CSS `box-shadow` string, which has no mechanical
/// translation into RN's discrete shadow keys.
pub(super) fn native_shadow_declarations(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    if parsed.utility != "shadow" || parsed.is_arbitrary {
        return None;
    }
    let key = parsed.value.as_deref().unwrap_or("DEFAULT");
    let s = native_shadow_value(key)?;
    Some(vec![
        decl("shadow-color", "#000000"),
        decl("shadow-offset-x", "0"),
        decl("shadow-offset-y", &s.offset_y.to_string()),
        decl("shadow-opacity", &s.opacity.to_string()),
        decl("shadow-radius", &s.radius.to_string()),
        decl("elevation", &s.elevation.to_string()),
    ])
}

/// Named `text-shadow-*` scale — a simplified single-layer approximation of
/// real Tailwind v4.1's multi-layer scale. `shadow_value` above went
/// multi-layer for `box-shadow` (a much more visually prominent effect,
/// worth the extra declaration complexity); text-shadow's effect is subtle
/// enough at typical font sizes that the single-layer approximation still
/// reads correctly, so it's kept as-is here.
fn text_shadow_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "sm" => "0 1px 1px rgba(0,0,0,0.15)",
        "DEFAULT" => "0 1px 2px rgba(0,0,0,0.2)",
        "lg" => "0 2px 4px rgba(0,0,0,0.25)",
        "none" => "none",
        _ => return None,
    })
}

/// Bare `text-shadow` (no explicit tier) — consulted by `color::resolve_text`
/// for its special-cased "shadow" value, since "text-" is already the
/// registered catchall prefix bare `text-shadow` falls under.
pub(super) fn text_shadow_default() -> &'static str {
    text_shadow_value("DEFAULT").expect("\"DEFAULT\" is a real text_shadow_value key")
}

/// "text-shadow-" is two-way ambiguous, same shape as `resolve_bg_keyword`'s
/// gradient dispatch: a known named-size keyword takes priority, anything
/// else (named theme color or arbitrary) is the shadow's color.
fn text_shadow_dash_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if !parsed.is_arbitrary {
        if let Some(v) = text_shadow_value(value) {
            return Some(vec![decl("text-shadow", v)]);
        }
        return lookup_hex(theme, value).map(|hex| vec![decl("text-shadow", &format!("0 1px 2px {hex}"))]);
    }
    Some(vec![decl("text-shadow", value)])
}

const BLEND_MODES: &[&str] = &[
    "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light",
    "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "plus-lighter",
];

fn blend_mode_value(key: &str) -> Option<&'static str> {
    BLEND_MODES.iter().find(|&&m| m == key).copied()
}

/// `spin`/`ping`/`pulse`/`bounce`'s `animation` shorthand declaration —
/// paired with `keyframes_for` below, which supplies the matching
/// `@keyframes` body `css.rs`/`lib.rs` emit as a separate top-level rule.
/// Real Tailwind's exact well-known timing values, not approximated.
fn animation_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "spin" => "kb-spin 1s linear infinite",
        "ping" => "kb-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite",
        "pulse" => "kb-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "bounce" => "kb-bounce 1s infinite",
        "none" => "none",
        _ => return None,
    })
}

/// The `@keyframes` name + body for `animate-*`'s `animation-name`. Prefixed
/// `kb-` (matching `--kb-*` custom-property naming elsewhere in this crate)
/// so Kbach's keyframes can never collide with a consuming app's own
/// same-named `@keyframes` block. Returns `None` for `animate-none` (and
/// anything else `animation_value` didn't recognize) — there's no keyframes
/// body to emit for "no animation".
pub(super) fn keyframes_for(key: &str) -> Option<(&'static str, &'static str)> {
    Some(match key {
        "spin" => ("kb-spin", "from { transform: rotate(0deg) } to { transform: rotate(360deg) }"),
        "ping" => ("kb-ping", "75%, 100% { transform: scale(2); opacity: 0 }"),
        "pulse" => ("kb-pulse", "50% { opacity: 0.5 }"),
        "bounce" => (
            "kb-bounce",
            "0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8,0,1,1) } 50% { transform: none; animation-timing-function: cubic-bezier(0,0,0.2,1) }",
        ),
        _ => return None,
    })
}

fn ease_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "linear" => "linear",
        "in" => "cubic-bezier(0.4, 0, 1, 1)",
        "out" => "cubic-bezier(0, 0, 0.2, 1)",
        "in-out" => "cubic-bezier(0.4, 0, 0.2, 1)",
        _ => return None,
    })
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "shadow" if parsed.value.is_none() => shadow_value("DEFAULT").map(|v| vec![decl("box-shadow", &v)]),
        "shadow" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("box-shadow", value)]);
            }
            // "shadow-*" is two-way ambiguous, same shape as "border-*": a
            // recognized tier name means `box-shadow`, anything else is a
            // `shadow-{color}` (see `shadow_color_declarations`'s own doc
            // comment for how the two compose).
            shadow_value(value)
                .map(|v| vec![decl("box-shadow", &v)])
                .or_else(|| shadow_color_declarations(theme, parsed))
        }
        "text-shadow" => text_shadow_dash_value(theme, parsed),
        "mix-blend" => {
            let value = parsed.value.as_deref()?;
            blend_mode_value(value).map(|v| vec![decl("mix-blend-mode", v)])
        }
        "bg-blend" => {
            let value = parsed.value.as_deref()?;
            blend_mode_value(value).map(|v| vec![decl("background-blend-mode", v)])
        }
        "animate" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("animation", value)]);
            }
            animation_value(value).map(|v| vec![decl("animation", v)])
        }
        "opacity" => resolve_percent(parsed).map(|v| vec![decl("opacity", &v)]),
        "transition" if parsed.value.is_none() => Some(vec![decl("transition-property", "all")]),
        // Real Tailwind's named transition-property scale — "transition-"
        // isn't a VALUE_PREFIXES entry (same reasoning "transition-none"
        // below already documents), so these are standalone literal
        // utility names, not utility="transition" + a value.
        "transition-colors" => Some(vec![decl("transition-property", "color, background-color, border-color, text-decoration-color, fill, stroke")]),
        "transition-opacity" => Some(vec![decl("transition-property", "opacity")]),
        "transition-shadow" => Some(vec![decl("transition-property", "box-shadow")]),
        "transition-transform" => Some(vec![decl("transition-property", "transform")]),
        // "transition-" isn't a VALUE_PREFIXES entry, so "transition-none"
        // parses as its own standalone utility name (like "hidden"/"static"),
        // not utility="transition" + value="none" — matched as a literal
        // here rather than folded into the arm above. The standard pairing
        // with `motion-reduce:` (respecting prefers-reduced-motion).
        "transition-none" => Some(vec![decl("transition-property", "none")]),
        "duration" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("transition-duration", value)]);
            }
            Some(vec![decl("transition-duration", &format!("{value}ms"))])
        }
        "delay" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("transition-delay", value)]);
            }
            Some(vec![decl("transition-delay", &format!("{value}ms"))])
        }
        "ease" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("transition-timing-function", value)]);
            }
            ease_value(value).map(|v| vec![decl("transition-timing-function", v)])
        }
        "cursor" => parsed.value.as_deref().map(|v| vec![decl("cursor", v)]),
        "select-none" => Some(vec![decl("user-select", "none")]),
        "select-text" => Some(vec![decl("user-select", "text")]),
        "select-all" => Some(vec![decl("user-select", "all")]),
        "pointer-events-none" => Some(vec![decl("pointer-events", "none")]),
        "pointer-events-auto" => Some(vec![decl("pointer-events", "auto")]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;

    #[test]
    fn bare_shadow_resolves_to_the_default_tier() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("shadow"), &t), Some(vec![decl("box-shadow", &shadow_value("DEFAULT").unwrap())]));
    }

    #[test]
    fn resolves_the_full_named_shadow_scale() {
        let t = ThemeConfig::default();
        for key in ["sm", "md", "lg", "xl", "2xl", "inner", "none"] {
            let class = format!("shadow-{key}");
            assert_eq!(
                resolve(&parse_class(&class), &t),
                Some(vec![decl("box-shadow", &shadow_value(key).unwrap())]),
                "shadow-{key} should resolve",
            );
        }
    }

    #[test]
    fn bare_shadow_box_shadow_value_composes_with_a_shadow_color_via_a_css_variable() {
        // Confirms the actual mechanism, not just that both resolve
        // independently: shadow-lg's own box-shadow references
        // --kb-shadow-color with the tier's original color as the
        // var() fallback, so pairing it with shadow-red-500 on the same
        // element recolors it without shadow-lg needing to know about
        // shadow-red-500 at resolve time at all.
        let lg = shadow_value("lg").unwrap();
        assert!(lg.contains("var(--kb-shadow-color, rgb(0 0 0 / 0.1))"), "got: {lg}");
    }

    #[test]
    fn resolves_shadow_color_from_the_theme() {
        let mut t = ThemeConfig::default();
        t.colors.insert("red-5".to_string(), crate::theme::ColorValue::Plain("#ef4444".to_string()));
        assert_eq!(resolve(&parse_class("shadow-red-5"), &t), Some(vec![decl("--kb-shadow-color", "#ef4444")]));
        assert_eq!(resolve(&parse_class("shadow-not-a-color"), &t), None);
        // Arbitrary "shadow-[...]" stays the pre-existing raw box-shadow
        // passthrough, not a color override — see shadow_color_declarations's
        // own doc comment for why the two can't be disambiguated.
        assert_eq!(
            resolve(&parse_class("shadow-[#112233]"), &t),
            Some(vec![decl("box-shadow", "#112233")]),
        );
    }

    #[test]
    fn native_shadow_resolves_bare_shadow_to_the_default_tier() {
        let decls = native_shadow_declarations(&parse_class("shadow")).unwrap();
        assert_eq!(decls, vec![
            decl("shadow-color", "#000000"),
            decl("shadow-offset-x", "0"),
            decl("shadow-offset-y", "1"),
            decl("shadow-opacity", "0.1"),
            decl("shadow-radius", "3"),
            decl("elevation", "2"),
        ]);
    }

    #[test]
    fn native_shadow_resolves_every_named_tier_except_inner() {
        for key in ["sm", "md", "lg", "xl", "2xl", "none"] {
            let class = format!("shadow-{key}");
            assert!(
                native_shadow_declarations(&parse_class(&class)).is_some(),
                "shadow-{key} should resolve on native",
            );
        }
    }

    #[test]
    fn native_shadow_does_not_resolve_shadow_inner() {
        // Neither iOS's discrete shadow props nor Android's `elevation` can
        // express an inset shadow at all — no native property to set, not
        // a values-mapping gap.
        assert_eq!(native_shadow_declarations(&parse_class("shadow-inner")), None);
    }

    #[test]
    fn native_shadow_does_not_resolve_arbitrary_shadow_values() {
        assert_eq!(native_shadow_declarations(&parse_class("shadow-[0_4px_6px_red]")), None);
    }

    #[test]
    fn native_shadow_none_zeroes_out_every_property() {
        let decls = native_shadow_declarations(&parse_class("shadow-none")).unwrap();
        assert_eq!(decls, vec![
            decl("shadow-color", "#000000"),
            decl("shadow-offset-x", "0"),
            decl("shadow-offset-y", "0"),
            decl("shadow-opacity", "0"),
            decl("shadow-radius", "0"),
            decl("elevation", "0"),
        ]);
    }

    #[test]
    fn resolves_opacity_percentage_to_decimal() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("opacity-50"), &t), Some(vec![decl("opacity", "0.5")]));
    }

    #[test]
    fn resolves_named_transition_property_scale() {
        let t = ThemeConfig::default();
        assert!(resolve(&parse_class("transition-colors"), &t).unwrap()[0].value.contains("background-color"));
        assert_eq!(resolve(&parse_class("transition-opacity"), &t), Some(vec![decl("transition-property", "opacity")]));
        assert_eq!(resolve(&parse_class("transition-shadow"), &t), Some(vec![decl("transition-property", "box-shadow")]));
        assert_eq!(resolve(&parse_class("transition-transform"), &t), Some(vec![decl("transition-property", "transform")]));
    }

    #[test]
    fn resolves_arbitrary_ease_and_animate_values() {
        let t = ThemeConfig::default();
        assert_eq!(
            resolve(&parse_class("ease-[cubic-bezier(0.1,0.2,0.3,0.4)]"), &t),
            Some(vec![decl("transition-timing-function", "cubic-bezier(0.1,0.2,0.3,0.4)")]),
        );
        assert_eq!(
            resolve(&parse_class("animate-[wiggle_1s_ease-in-out_infinite]"), &t),
            Some(vec![decl("animation", "wiggle 1s ease-in-out infinite")]),
        );
    }

    #[test]
    fn resolves_transition_none_as_its_own_standalone_utility() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("transition-none"), &t), Some(vec![decl("transition-property", "none")]));
        assert_eq!(resolve(&parse_class("transition"), &t), Some(vec![decl("transition-property", "all")]));
    }

    #[test]
    fn resolves_duration_with_auto_appended_ms() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("duration-300"), &t), Some(vec![decl("transition-duration", "300ms")]));
    }

    #[test]
    fn arbitrary_duration_is_passed_through_without_double_unit() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("duration-[0.3s]"), &t), Some(vec![decl("transition-duration", "0.3s")]));
    }

    #[test]
    fn resolves_cursor_and_select_utilities() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("cursor-pointer"), &t), Some(vec![decl("cursor", "pointer")]));
        assert_eq!(resolve(&parse_class("select-none"), &t), Some(vec![decl("user-select", "none")]));
    }

    fn theme_with_color() -> ThemeConfig {
        let mut colors = std::collections::HashMap::new();
        colors.insert("blue-6".to_string(), crate::theme::ColorValue::Plain("#2563eb".to_string()));
        ThemeConfig { colors, ..Default::default() }
    }

    #[test]
    fn resolves_text_shadow_named_size_color_and_arbitrary() {
        let t = theme_with_color();
        assert_eq!(resolve(&parse_class("text-shadow-sm"), &t), Some(vec![decl("text-shadow", text_shadow_value("sm").unwrap())]));
        assert_eq!(resolve(&parse_class("text-shadow-none"), &t), Some(vec![decl("text-shadow", "none")]));
        assert_eq!(resolve(&parse_class("text-shadow-blue-6"), &t), Some(vec![decl("text-shadow", "0 1px 2px #2563eb")]));
        assert_eq!(resolve(&parse_class("text-shadow-[0_0_2px_red]"), &t), Some(vec![decl("text-shadow", "0 0 2px red")]));
    }

    #[test]
    fn resolves_bare_text_shadow_via_the_shared_default_helper() {
        assert_eq!(text_shadow_default(), text_shadow_value("DEFAULT").unwrap());
    }

    #[test]
    fn resolves_mix_blend_and_background_blend_modes() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("mix-blend-multiply"), &t), Some(vec![decl("mix-blend-mode", "multiply")]));
        assert_eq!(resolve(&parse_class("bg-blend-screen"), &t), Some(vec![decl("background-blend-mode", "screen")]));
        assert_eq!(resolve(&parse_class("mix-blend-not-a-mode"), &t), None);
    }

    #[test]
    fn resolves_animation_utilities_and_their_keyframes() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("animate-spin"), &t), Some(vec![decl("animation", "kb-spin 1s linear infinite")]));
        assert_eq!(resolve(&parse_class("animate-none"), &t), Some(vec![decl("animation", "none")]));
        assert_eq!(resolve(&parse_class("animate-not-a-name"), &t), None);

        assert_eq!(keyframes_for("spin"), Some(("kb-spin", "from { transform: rotate(0deg) } to { transform: rotate(360deg) }")));
        assert_eq!(keyframes_for("ping"), Some(("kb-ping", "75%, 100% { transform: scale(2); opacity: 0 }")));
        assert_eq!(keyframes_for("pulse"), Some(("kb-pulse", "50% { opacity: 0.5 }")));
        assert!(keyframes_for("bounce").is_some());
        assert_eq!(keyframes_for("none"), None);
    }
}
