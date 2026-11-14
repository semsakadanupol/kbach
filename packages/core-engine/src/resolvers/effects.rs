use super::color::{color_value, is_color, split_opacity};
use super::{decl, resolve_percent, Declaration};
use crate::parser::{arbitrary_modifier, Alpha, ParsedClass};
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
/// A `transition-*` utility: the property list plus Tailwind v4's defaults,
/// 150ms and `cubic-bezier(0.4, 0, 0.2, 1)`. Without them (this engine's
/// behavior before), `transition-colors` alone had a 0s duration and
/// animated nothing until a `duration-*` was added. The defaults are read
/// through `--kb-duration`/`--kb-ease`, which `duration-*`/`ease-*` set, so
/// those always win regardless of stylesheet order (Tailwind's own
/// `--tw-duration`/`--tw-ease` technique).
fn transition(properties: &str) -> Vec<Declaration> {
    vec![
        decl("transition-property", properties),
        decl("transition-timing-function", "var(--kb-ease, cubic-bezier(0.4, 0, 0.2, 1))"),
        decl("transition-duration", "var(--kb-duration, 150ms)"),
    ]
}

/// Tailwind v4's single composed `box-shadow`: every shadow-producing
/// utility (`inset-shadow-*`, `inset-ring-*`, `ring-offset-*`, `ring-*`,
/// `shadow-*`) sets only its own layer variable, and the ones that should
/// draw emit this identical value. So `shadow-lg ring-2 inset-shadow-sm` on
/// one element shows all three, whatever order the rules land in. (Before,
/// `shadow-*` and `ring-*` each set `box-shadow` outright and the later one
/// silently erased the other.) An unset layer falls back to an invisible
/// `0 0 #0000`.
pub(super) const BOX_SHADOW_COMPOSE: &str = "var(--kb-inset-shadow, 0 0 #0000), var(--kb-inset-ring-shadow, 0 0 #0000), var(--kb-ring-offset-shadow, 0 0 #0000), var(--kb-ring-shadow, 0 0 #0000), var(--kb-shadow, 0 0 #0000)";

/// The inner-ring layer at a given width, colored by `--kb-inset-ring-color`
/// (default `currentColor`, like rings).
fn inset_ring_shadow(width: &str) -> String {
    format!("inset 0 0 0 {width} var(--kb-inset-ring-color, currentColor)")
}

/// One layer of `BOX_SHADOW_COMPOSE`: set the variable, emit the composition.
fn shadow_layer(variable: &str, value: &str) -> Vec<Declaration> {
    vec![decl(variable, value), decl("box-shadow", BOX_SHADOW_COMPOSE)]
}

/// A shadow layer's default color, black at the scale's own alpha, or at the
/// alpha of an opacity modifier: `shadow-xl/20` is the xl shadow at 20%
/// (Tailwind v4). A color class still replaces it, through `variable`.
pub(super) fn shadow_color(variable: &str, default_alpha: &str, alpha: Option<&Alpha>) -> String {
    let a = alpha.map_or_else(|| default_alpha.to_string(), Alpha::number);
    format!("var({variable}, rgb(0 0 0 / {a}))")
}

/// Tailwind v4's `--inset-shadow-*` scale, recolorable through
/// `--kb-inset-shadow-color` (`inset-shadow-blue-6`).
fn inset_shadow_value(key: &str, alpha: Option<&Alpha>) -> Option<String> {
    let c = shadow_color("--kb-inset-shadow-color", "0.05", alpha);
    Some(match key {
        "2xs" => format!("inset 0 1px {c}"),
        "xs" => format!("inset 0 1px 1px {c}"),
        "sm" => format!("inset 0 2px 4px {c}"),
        "none" => "0 0 #0000".to_string(),
        _ => return None,
    })
}

fn shadow_value(key: &str, alpha: Option<&Alpha>) -> Option<String> {
    let var = &shadow_color("--kb-shadow-color", "0.1", alpha);
    let var_light = &shadow_color("--kb-shadow-color", "0.05", alpha);
    let var_heavy = &shadow_color("--kb-shadow-color", "0.25", alpha);
    Some(match key {
        // Tailwind v4.3's shadow scale. v4 renamed v3's `shadow-sm` to
        // `xs`, and its `sm` is the two-layer shadow bare `shadow` also is.
        "2xs" => format!("0 1px {var_light}"),
        "xs" => format!("0 1px 2px 0 {var_light}"),
        "sm" => format!("0 1px 3px 0 {var}, 0 1px 2px -1px {var}"),
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
/// Named theme colors only — `resolve`'s "shadow" arm handles every
/// arbitrary `shadow-[...]` value earlier: a color (`shadow-[#112233]`,
/// `color::is_color`) sets the same variable, anything else is a whole
/// `box-shadow` (`shadow-[0_4px_6px_red]`).
fn shadow_color_declarations(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    // color_value's own opacity-suffix handling (`shadow-blue-6/50`) is
    // what this reuses it for — safe to call unconditionally despite its
    // own is_arbitrary check, since (per this function's own doc comment)
    // it's never reached with is_arbitrary set in the first place.
    let color = color_value(theme, parsed)?;
    Some(vec![decl("--kb-shadow-color", &color)])
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
        // Tailwind v4.3's scale (see `shadow_value`): `sm` is now the
        // default shadow, v3's `sm` is `xs`.
        "2xs" => NativeShadow { offset_y: 1.0, radius: 0.0, opacity: 0.05, elevation: 1.0 },
        "xs" => NativeShadow { offset_y: 1.0, radius: 2.0, opacity: 0.05, elevation: 1.0 },
        "sm" => NativeShadow { offset_y: 1.0, radius: 3.0, opacity: 0.1, elevation: 2.0 },
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
///
/// The sized steps are Tailwind v4.3's `--text-shadow-*` scale (2xs-lg,
/// multi-layer from sm up). Bare `text-shadow` (no size) isn't a Tailwind
/// class at all; it's kept as a Kbach extra so existing pages don't lose it.
fn text_shadow_value(key: &str, alpha: Option<&Alpha>) -> Option<String> {
    // Every layer reads --kb-text-shadow-color (Tailwind v4), so
    // `text-shadow-lg text-shadow-blue-6` is a blue lg shadow. An opacity
    // modifier (`text-shadow-lg/30`) sets the default color's alpha.
    let c = |default: &str| shadow_color("--kb-text-shadow-color", default, alpha);
    let (a, b) = (c("0.075"), c("0.1"));
    Some(match key {
        "2xs" => format!("0px 1px 0px {}", c("0.15")),
        "xs" => format!("0px 1px 1px {}", c("0.2")),
        "sm" => format!("0px 1px 0px {a}, 0px 1px 1px {a}, 0px 2px 2px {a}"),
        "md" => format!("0px 1px 1px {b}, 0px 1px 2px {b}, 0px 2px 4px {b}"),
        "lg" => format!("0px 1px 2px {b}, 0px 3px 2px {b}, 0px 4px 8px {b}"),
        "DEFAULT" => format!("0 1px 2px {}", c("0.2")),
        "none" => "none".to_string(),
        _ => return None,
    })
}

/// Bare `text-shadow` (no explicit tier) — consulted by `color::resolve_text`
/// for its special-cased "shadow" value, since "text-" is already the
/// registered catchall prefix bare `text-shadow` falls under.
pub(super) fn text_shadow_default() -> String {
    text_shadow_value("DEFAULT", None).expect("\"DEFAULT\" is a real text_shadow_value key")
}

/// "text-shadow-" is two-way ambiguous, same shape as `resolve_bg_keyword`'s
/// gradient dispatch: a known named-size keyword takes priority, anything
/// else (named theme color or arbitrary) is the shadow's color.
fn text_shadow_dash_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if !parsed.is_arbitrary {
        // `text-shadow-lg`, `text-shadow-lg/30`
        let (key, alpha) = split_opacity(value);
        if let Some(v) = text_shadow_value(key, alpha.as_ref()) {
            return Some(vec![decl("text-shadow", &v)]);
        }
        // `text-shadow-<color>` / `text-shadow-initial` only set the color
        // the sizes read (Tailwind v4); on their own they draw nothing.
        if value == "initial" {
            return Some(vec![decl("--kb-text-shadow-color", "initial")]);
        }
        return color_value(theme, parsed).map(|c| vec![decl("--kb-text-shadow-color", &c)]);
    }
    // `text-shadow-[#333]`, `text-shadow-(color:--c)`: the color, like a
    // named one. Anything else is a whole text-shadow.
    if is_color(parsed, value) {
        return Some(vec![decl("--kb-text-shadow-color", value)]);
    }
    Some(vec![decl("text-shadow", value)])
}

const BLEND_MODES: &[&str] = &[
    "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light",
    "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "plus-lighter", "plus-darker",
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
        "shadow" if parsed.value.is_none() => shadow_value("DEFAULT", None).map(|v| shadow_layer("--kb-shadow", &v)),
        "shadow" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                // `shadow-[#333]`, `shadow-[color:red]`, `shadow-(color:--c)`
                // color the shadow, as a named `shadow-<color>` does. They
                // used to be written into `box-shadow` as if a whole shadow.
                if is_color(parsed, value) {
                    return Some(vec![decl("--kb-shadow-color", value)]);
                }
                return Some(shadow_layer("--kb-shadow", value));
            }
            if value == "initial" {
                return Some(vec![decl("--kb-shadow-color", "initial")]);
            }
            // "shadow-*" is two-way ambiguous, same shape as "border-*": a
            // recognized tier name means a shadow layer, anything else is a
            // `shadow-{color}` (see `shadow_color_declarations`'s own doc
            // comment for how the two compose).
            // `shadow-xl/20`: the tier, its default color at 20% (Tailwind v4).
            let (key, alpha) = split_opacity(value);
            shadow_value(key, alpha.as_ref())
                .map(|v| shadow_layer("--kb-shadow", &v))
                .or_else(|| shadow_color_declarations(theme, parsed))
        }
        // Inner shadows and inner rings (Tailwind v4), the first two layers
        // of BOX_SHADOW_COMPOSE. Web-only: the native dispatcher only calls
        // `native_shadow_declarations`.
        "inset-shadow" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                if is_color(parsed, value) {
                    return Some(vec![decl("--kb-inset-shadow-color", value)]);
                }
                return Some(shadow_layer("--kb-inset-shadow", value));
            }
            if value == "initial" {
                return Some(vec![decl("--kb-inset-shadow-color", "initial")]);
            }
            let (key, alpha) = split_opacity(value);
            inset_shadow_value(key, alpha.as_ref())
                .map(|v| shadow_layer("--kb-inset-shadow", &v))
                .or_else(|| color_value(theme, parsed).map(|c| vec![decl("--kb-inset-shadow-color", &c)]))
        }
        // Bare `inset-ring` parses as utility "inset" + value "ring" (the
        // "inset-" prefix): layout.rs's inset arm can't read "ring" as a
        // length and passes it on to here.
        "inset" if !parsed.is_arbitrary && parsed.value.as_deref() == Some("ring") => {
            Some(shadow_layer("--kb-inset-ring-shadow", &inset_ring_shadow("1px")))
        }
        "inset-ring" => {
            let value = parsed.value.as_deref()?;
            if !parsed.is_arbitrary {
                if let Some(w) = super::border::whole_px(value) {
                    return Some(shadow_layer("--kb-inset-ring-shadow", &inset_ring_shadow(&w)));
                }
            }
            color_value(theme, parsed).map(|c| vec![decl("--kb-inset-ring-color", &c)])
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
        // Bare `transition`: Tailwind v4.3's explicit property list (the
        // usual visual properties, NOT layout ones like width/height; use
        // `transition-all` for those). Gradient stops use this engine's
        // --kb-gradient-* names.
        "transition" if parsed.value.is_none() => Some(transition(
            "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --kb-gradient-from, --kb-gradient-via, --kb-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events",
        )),
        "transition-all" => Some(transition("all")),
        // Real Tailwind's named transition-property scale — "transition-"
        // isn't a VALUE_PREFIXES entry (same reasoning "transition-none"
        // below already documents), so these are standalone literal
        // utility names, not utility="transition" + a value.
        "transition-colors" => Some(transition(
            "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --kb-gradient-from, --kb-gradient-via, --kb-gradient-to",
        )),
        // `transition-[width]`, `transition-[opacity,transform]`: any property
        // list. "transition-" isn't a value prefix, so the bracket arrives as
        // part of the utility name and never went through the parser's
        // arbitrary-value safety check; only property-name characters pass.
        u if u.starts_with("transition-[") && u.ends_with(']') => {
            let list = &u["transition-[".len()..u.len() - 1];
            let safe = !list.is_empty() && list.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b',' | b'_'));
            safe.then(|| transition(&list.replace('_', " ").replace(',', ", ")))
        }
        // `transition-(--props)`: the property list from a variable.
        u if u.starts_with("transition-(") => arbitrary_modifier(&u["transition-".len()..]).map(|v| transition(&v)),
        "transition-opacity" => Some(transition("opacity")),
        "transition-shadow" => Some(transition("box-shadow")),
        "transition-transform" => Some(transition("transform")),
        // "transition-" isn't a VALUE_PREFIXES entry, so "transition-none"
        // parses as its own standalone utility name (like "hidden"/"static"),
        // not utility="transition" + value="none" — matched as a literal
        // here rather than folded into the arm above. The standard pairing
        // with `motion-reduce:` (respecting prefers-reduced-motion).
        "transition-none" => Some(vec![decl("transition-property", "none")]),
        // transition-behavior — same standalone-literal shape as
        // "transition-none" above, a completely different property despite
        // the shared "transition-" spelling.
        "transition-normal" => Some(vec![decl("transition-behavior", "normal")]),
        "transition-discrete" => Some(vec![decl("transition-behavior", "allow-discrete")]),
        // `duration-*`/`ease-*` also set `--kb-duration`/`--kb-ease`, which
        // every `transition-*` reads (see `transition()`): the result is the
        // same whichever of the two classes lands later in the stylesheet.
        // A number of milliseconds (`duration-150`) or an arbitrary value;
        // anything else used to become e.g. `bananams`.
        // `duration-initial`: drop back to the transition's default duration
        // (`--kb-duration: initial` makes every `transition-*` take its own fallback).
        "duration" if !parsed.is_arbitrary && parsed.value.as_deref() == Some("initial") => {
            Some(vec![decl("--kb-duration", "initial")])
        }
        "duration" => {
            let value = parsed.value.as_deref()?;
            if !parsed.is_arbitrary && !crate::resolvers::layout::is_whole_number(value) {
                return None;
            }
            let ms = if parsed.is_arbitrary { value.to_string() } else { format!("{value}ms") };
            Some(vec![decl("--kb-duration", &ms), decl("transition-duration", &ms)])
        }
        "delay" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("transition-delay", value)]);
            }
            if !crate::resolvers::layout::is_whole_number(value) {
                return None;
            }
            Some(vec![decl("transition-delay", &format!("{value}ms"))])
        }
        // `ease-initial`: drop back to the transition's default easing.
        "ease" if !parsed.is_arbitrary && parsed.value.as_deref() == Some("initial") => {
            Some(vec![decl("--kb-ease", "initial")])
        }
        "ease" => {
            let value = parsed.value.as_deref()?;
            let timing = if parsed.is_arbitrary { value } else { ease_value(value)? };
            Some(vec![decl("--kb-ease", timing), decl("transition-timing-function", timing)])
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
    fn shadows_rings_and_inset_layers_share_one_composed_box_shadow() {
        let t = ThemeConfig::default();
        // every drawing layer emits the identical composition, so any
        // combination on one element shows every layer, in any order
        for class in ["shadow-lg", "inset-shadow-sm", "inset-ring-2", "inset-ring"] {
            let decls = resolve(&parse_class(class), &t).unwrap();
            assert!(decls.contains(&decl("box-shadow", BOX_SHADOW_COMPOSE)), "{class}");
        }
        assert_eq!(
            resolve(&parse_class("inset-shadow-sm"), &t),
            Some(shadow_layer("--kb-inset-shadow", "inset 0 2px 4px var(--kb-inset-shadow-color, rgb(0 0 0 / 0.05))")),
        );
        assert_eq!(
            resolve(&parse_class("inset-ring-2"), &t),
            Some(shadow_layer("--kb-inset-ring-shadow", "inset 0 0 0 2px var(--kb-inset-ring-color, currentColor)")),
        );
        assert_eq!(
            resolve(&parse_class("inset-ring"), &t),
            Some(shadow_layer("--kb-inset-ring-shadow", "inset 0 0 0 1px var(--kb-inset-ring-color, currentColor)")),
        );
        assert_eq!(resolve(&parse_class("shadow-initial"), &t), Some(vec![decl("--kb-shadow-color", "initial")]));
        assert_eq!(resolve(&parse_class("inset-shadow-none"), &t), Some(shadow_layer("--kb-inset-shadow", "0 0 #0000")));
    }

    #[test]
    fn bare_shadow_resolves_to_the_default_tier() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("shadow"), &t), Some(shadow_layer("--kb-shadow", &shadow_value("DEFAULT", None).unwrap())));
    }

    #[test]
    fn resolves_the_full_named_shadow_scale() {
        let t = ThemeConfig::default();
        for key in ["sm", "md", "lg", "xl", "2xl", "inner", "none"] {
            let class = format!("shadow-{key}");
            assert_eq!(
                resolve(&parse_class(&class), &t),
                Some(shadow_layer("--kb-shadow", &shadow_value(key, None).unwrap())),
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
        let lg = shadow_value("lg", None).unwrap();
        assert!(lg.contains("var(--kb-shadow-color, rgb(0 0 0 / 0.1))"), "got: {lg}");
    }

    #[test]
    fn resolves_shadow_color_from_the_theme() {
        let mut t = ThemeConfig::default();
        t.colors.insert("red-5".to_string(), crate::theme::ColorValue::Plain("#ef4444".to_string()));
        assert_eq!(resolve(&parse_class("shadow-red-5"), &t), Some(vec![decl("--kb-shadow-color", "#ef4444")]));
        assert_eq!(resolve(&parse_class("shadow-not-a-color"), &t), None);
        // An arbitrary color is a color too (it used to be written into
        // `box-shadow` as if it were a whole shadow); a whole shadow still is one.
        assert_eq!(resolve(&parse_class("shadow-[#112233]"), &t), Some(vec![decl("--kb-shadow-color", "#112233")]));
        assert_eq!(
            resolve(&parse_class("shadow-[0_1px_2px_#112233]"), &t),
            Some(shadow_layer("--kb-shadow", "0 1px 2px #112233")),
        );
    }

    #[test]
    fn resolves_inline_slash_opacity_on_shadow_color() {
        let mut t = ThemeConfig::default();
        t.colors.insert("red-5".to_string(), crate::theme::ColorValue::Plain("#ef4444".to_string()));
        assert_eq!(
            resolve(&parse_class("shadow-red-5/50"), &t),
            Some(vec![decl("--kb-shadow-color", "rgba(239,68,68,0.5)")]),
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
        assert_eq!(resolve(&parse_class("transition-opacity"), &t), Some(transition("opacity")));
        assert_eq!(resolve(&parse_class("transition-shadow"), &t), Some(transition("box-shadow")));
        assert_eq!(resolve(&parse_class("transition-transform"), &t), Some(transition("transform")));
        assert_eq!(resolve(&parse_class("transition-all"), &t), Some(transition("all")));
    }

    #[test]
    fn resolves_transition_behavior() {
        let t = ThemeConfig::default();
        assert_eq!(resolve(&parse_class("transition-normal"), &t), Some(vec![decl("transition-behavior", "normal")]));
        assert_eq!(
            resolve(&parse_class("transition-discrete"), &t),
            Some(vec![decl("transition-behavior", "allow-discrete")]),
        );
    }

    #[test]
    fn resolves_arbitrary_ease_and_animate_values() {
        let t = ThemeConfig::default();
        assert_eq!(
            resolve(&parse_class("ease-[cubic-bezier(0.1,0.2,0.3,0.4)]"), &t),
            Some(vec![decl("--kb-ease", "cubic-bezier(0.1,0.2,0.3,0.4)"), decl("transition-timing-function", "cubic-bezier(0.1,0.2,0.3,0.4)")]),
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
        // Tailwind v4.3: bare `transition` is an explicit property list, not `all`.
        let bare = resolve(&parse_class("transition"), &t).unwrap();
        assert!(bare[0].value.starts_with("color, background-color, border-color, outline-color"));
        assert!(bare[0].value.contains("--kb-gradient-from") && bare[0].value.ends_with("pointer-events"));
        assert!(!bare[0].value.contains("all"));
        assert_eq!(resolve(&parse_class("transition-all"), &t), Some(transition("all")));
    }

    #[test]
    fn resolves_duration_with_auto_appended_ms() {
        let t = ThemeConfig::default();
        assert_eq!(
            resolve(&parse_class("duration-300"), &t),
            Some(vec![decl("--kb-duration", "300ms"), decl("transition-duration", "300ms")]),
        );
    }

    #[test]
    fn arbitrary_duration_is_passed_through_without_double_unit() {
        let t = ThemeConfig::default();
        assert_eq!(
            resolve(&parse_class("duration-[0.3s]"), &t),
            Some(vec![decl("--kb-duration", "0.3s"), decl("transition-duration", "0.3s")]),
        );
    }

    #[test]
    fn every_transition_utility_gets_tailwinds_default_timing_unless_overridden() {
        // Regression: transition-colors etc. used to emit only
        // transition-property, so a 0s duration meant nothing animated.
        let t = ThemeConfig::default();
        for class in ["transition", "transition-all", "transition-colors", "transition-opacity", "transition-shadow", "transition-transform"] {
            let decls = resolve(&parse_class(class), &t).unwrap();
            assert!(decls.contains(&decl("transition-duration", "var(--kb-duration, 150ms)")), "{class}");
            assert!(decls.contains(&decl("transition-timing-function", "var(--kb-ease, cubic-bezier(0.4, 0, 0.2, 1))")), "{class}");
        }
        // transition-none stays a pure reset
        assert_eq!(resolve(&parse_class("transition-none"), &t), Some(vec![decl("transition-property", "none")]));
        // ease-* sets the variable the defaults read
        assert_eq!(
            resolve(&parse_class("ease-in-out"), &t),
            Some(vec![decl("--kb-ease", "cubic-bezier(0.4, 0, 0.2, 1)"), decl("transition-timing-function", "cubic-bezier(0.4, 0, 0.2, 1)")]),
        );
    }

    #[test]
    fn resolves_tailwind_v4_extra_small_shadows() {
        let t = ThemeConfig::default();
        assert_eq!(
            resolve(&parse_class("shadow-2xs"), &t).unwrap()[0].value,
            "0 1px var(--kb-shadow-color, rgb(0 0 0 / 0.05))",
        );
        assert!(resolve(&parse_class("shadow-xs"), &t).is_some());
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
        assert_eq!(resolve(&parse_class("text-shadow-sm"), &t), Some(vec![decl("text-shadow", &text_shadow_value("sm", None).unwrap())]));
        assert_eq!(resolve(&parse_class("text-shadow-none"), &t), Some(vec![decl("text-shadow", "none")]));
        // Tailwind v4: a color only sets the variable the sizes read
        assert_eq!(resolve(&parse_class("text-shadow-blue-6"), &t), Some(vec![decl("--kb-text-shadow-color", "#2563eb")]));
        assert_eq!(resolve(&parse_class("text-shadow-initial"), &t), Some(vec![decl("--kb-text-shadow-color", "initial")]));
        assert_eq!(resolve(&parse_class("text-shadow-[0_0_2px_red]"), &t), Some(vec![decl("text-shadow", "0 0 2px red")]));
    }

    #[test]
    fn resolves_inline_slash_opacity_on_text_shadow_color() {
        let t = theme_with_color();
        assert_eq!(
            // Tailwind v4: the color (with its opacity) only sets the variable
            resolve(&parse_class("text-shadow-blue-6/50"), &t),
            Some(vec![decl("--kb-text-shadow-color", "rgba(37,99,235,0.5)")]),
        );
    }

    #[test]
    fn resolves_bare_text_shadow_via_the_shared_default_helper() {
        assert_eq!(text_shadow_default(), text_shadow_value("DEFAULT", None).unwrap());
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
