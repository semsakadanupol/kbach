//! Backgrounds & gradients (web-only). React Native's `<View>` supports
//! plain `backgroundColor` only — no `background-position`/`-size`/
//! `-repeat`/`-attachment`/`-clip`/`-origin`, and no gradient support at all
//! without a third-party native module — so nothing in this file has an RN
//! equivalent; excluded entirely from `resolve_utility_native` (see that
//! function's doc comment).
//!
//! `bg-*` keyword utilities (position/size/repeat/attachment/clip/origin/
//! gradient-image) all parse to utility `"bg"` — the same utility name
//! `color::resolve`'s "bg" arm already owns for `background-color`. No
//! change was needed there: `color::resolve`'s "bg" arm returns `None` for
//! any value that isn't a real theme color key (e.g. `"top"`, `"cover"`),
//! so `resolve_utility`'s `.or_else` chain naturally falls through to this
//! module. Kbach's own color families are always `family-shade` (e.g.
//! `blue-6`), never a bare keyword like `top`/`cover`/`auto`, so there's no
//! realistic collision between a theme color name and a background keyword.
//!
//! Gradient composition (`from-*`/`via-*`/`to-*`) mirrors Tailwind's own
//! generated CSS technique exactly (confirmed against real Tailwind v3/v4
//! output, not guessed) rather than the simpler `var(--kb-x,)` trailing-
//! comma composition `transform.rs`/`filters.rs` use — that trick doesn't
//! work here because an *absent* `via-*` must not leave a dangling comma in
//! the `linear-gradient()` stop list. Instead each of the three utilities
//! REBUILDS `--kb-gradient-stops` from scratch: `from-*` writes a 2-stop
//! list, `via-*` overwrites it with a 3-stop list (and resets
//! `--kb-gradient-to` to transparent, since it's no longer the true second
//! stop), `to-*` only updates the shared endpoint color `from-*`'s list
//! already references by variable. A `to-*`/`via-*` used without a `from-*`
//! anywhere on the element leaves `--kb-gradient-stops` undefined, making
//! the `background-image` declaration inert — this is deliberate, matching
//! real Tailwind's identical requirement that `from-*` always starts the
//! chain, not a bug.

use super::color::color_value;
use super::{decl, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

const POSITION: &[(&str, &str)] = &[
    ("top", "top"),
    ("bottom", "bottom"),
    ("left", "left"),
    ("right", "right"),
    ("center", "center"),
    ("left-top", "left top"),
    ("left-bottom", "left bottom"),
    ("right-top", "right top"),
    ("right-bottom", "right bottom"),
    // Tailwind v4's spelling of the same four corners.
    ("top-left", "left top"),
    ("top-right", "right top"),
    ("bottom-left", "left bottom"),
    ("bottom-right", "right bottom"),
];

const REPEAT: &[(&str, &str)] = &[
    ("repeat", "repeat"),
    ("no-repeat", "no-repeat"),
    ("repeat-x", "repeat-x"),
    ("repeat-y", "repeat-y"),
    ("repeat-round", "round"),
    ("repeat-space", "space"),
];

const LINEAR_DIR: &[(&str, &str)] = &[
    ("to-t", "to top"),
    ("to-tr", "to top right"),
    ("to-r", "to right"),
    ("to-br", "to bottom right"),
    ("to-b", "to bottom"),
    ("to-bl", "to bottom left"),
    ("to-l", "to left"),
    ("to-tl", "to top left"),
];

fn named(value: &str, table: &[(&'static str, &'static str)]) -> Option<&'static str> {
    table.iter().find(|(k, _)| *k == value).map(|(_, v)| *v)
}

fn resolve_bg_keyword(value: &str, negative: bool) -> Option<Vec<Declaration>> {
    // Only a gradient angle takes a leading `-` (`-bg-linear-45`).
    if negative {
        return resolve_gradient_image(value, true);
    }
    if let Some(pos) = named(value, POSITION) {
        return Some(vec![decl("background-position", pos)]);
    }
    match value {
        "auto" => return Some(vec![decl("background-size", "auto")]),
        "cover" => return Some(vec![decl("background-size", "cover")]),
        "contain" => return Some(vec![decl("background-size", "contain")]),
        "fixed" => return Some(vec![decl("background-attachment", "fixed")]),
        "local" => return Some(vec![decl("background-attachment", "local")]),
        "scroll" => return Some(vec![decl("background-attachment", "scroll")]),
        "clip-border" => return Some(vec![decl("background-clip", "border-box")]),
        "clip-padding" => return Some(vec![decl("background-clip", "padding-box")]),
        "clip-content" => return Some(vec![decl("background-clip", "content-box")]),
        "clip-text" => return Some(vec![decl("background-clip", "text")]),
        "origin-border" => return Some(vec![decl("background-origin", "border-box")]),
        "origin-padding" => return Some(vec![decl("background-origin", "padding-box")]),
        "origin-content" => return Some(vec![decl("background-origin", "content-box")]),
        "none" => return Some(vec![decl("background-image", "none")]),
        _ => {}
    }
    if let Some(rep) = named(value, REPEAT) {
        return Some(vec![decl("background-repeat", rep)]);
    }
    resolve_gradient_image(value, false)
}

/// The `/` of an interpolation modifier (`linear-to-r/oklch`), outside any
/// bracket: (`linear-to-r`, Some(`oklch`)).
fn split_interpolation(value: &str) -> (&str, Option<&str>) {
    let mut depth = 0i32;
    for (i, ch) in value.char_indices() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' => depth -= 1,
            '/' if depth == 0 => return (&value[..i], Some(&value[i + 1..])),
            _ => {}
        }
    }
    (value, None)
}

/// Tailwind v4's gradient interpolation modifiers: a color space
/// (`/oklch`), a hue direction in oklch (`/longer`), or any
/// `[in_hsl_longer_hue]`.
fn interpolation(modifier: &str) -> Option<String> {
    Some(match modifier {
        "srgb" | "hsl" | "oklab" | "oklch" => format!("in {modifier}"),
        "longer" | "shorter" | "increasing" | "decreasing" => format!("in oklch {modifier} hue"),
        _ => crate::parser::arbitrary_modifier(modifier)?,
    })
}

/// The `background-image` for one gradient: `position` is the part before
/// the color stops (`to right`, `45deg`, `from 180deg`), if any. With an
/// interpolation it is declared twice, the plain form first: a browser
/// that can't parse `in oklch` inside a gradient drops the second
/// declaration and keeps the first (Tailwind CSS uses `@supports` for the
/// same fallback).
fn gradient(func: &str, position: Option<&str>, interpolation: Option<&str>) -> Vec<Declaration> {
    let image = |position: Option<String>| match position {
        Some(p) => format!("{func}-gradient({p}, var(--kb-gradient-stops))"),
        None => format!("{func}-gradient(var(--kb-gradient-stops))"),
    };
    let mut decls = vec![decl("background-image", &image(position.map(String::from)))];
    if let Some(space) = interpolation {
        let with_space = match position {
            Some(p) => format!("{p} {space}"),
            None => space.to_string(),
        };
        decls.push(decl("background-image", &image(Some(with_space))));
    }
    decls
}

/// `bg-linear-to-r`/`bg-linear-45`/`bg-radial`/`bg-conic-180` etc., each
/// with an optional interpolation modifier (`bg-linear-to-r/oklch`), and
/// `-bg-linear-45`/`-bg-conic-180` for a negative angle (the minus used to
/// be dropped). Bracket forms (`bg-linear-[25deg]`) are NOT reached through
/// `parser.rs`'s own arbitrary-value branch — that only fires when the value
/// immediately after the whole matched prefix starts with `[` (i.e.
/// `bg-[...]`, which stays a color per this module's own doc comment),
/// whereas here the `[` appears mid-value after a literal `linear-`/
/// `radial-`/`conic-` prefix — so they go through
/// `parser::arbitrary_modifier` (underscores, the safety check, and the
/// `(--var)` shorthand) here instead.
///
/// A bracket or variable value may be the angle alone (`bg-linear-[25deg]`,
/// with `from-*`/`to-*` supplying the colors) or the whole argument list
/// (`bg-linear-[25deg,red_5%,yellow_60%]`, `bg-linear-(--my-gradient)`). So
/// the color stops are appended through `--kb-gradient-tail`, which
/// `from-*`/`via-*` set to `, <stops>` and which is empty otherwise. (They
/// used to be appended unconditionally, so a complete gradient with no
/// `from-*` was invalid and drew nothing.)
fn resolve_gradient_image(value: &str, negative: bool) -> Option<Vec<Declaration>> {
    // Tailwind v3's `bg-gradient-to-r`, still accepted by v4.
    let legacy;
    let value = match value.strip_prefix("gradient-to-") {
        Some(dir) => {
            legacy = format!("linear-to-{dir}");
            legacy.as_str()
        }
        None => value,
    };
    let (value, modifier) = split_interpolation(value);
    let space = match modifier {
        Some(m) => Some(interpolation(m)?),
        None => None,
    };
    let space = space.as_deref();
    let whole = |func: &str, rest: &str| -> Option<Vec<Declaration>> {
        // No interpolation or minus on a hand-written gradient: it says both itself.
        if space.is_some() || negative {
            return None;
        }
        let raw = crate::parser::arbitrary_modifier(rest)?;
        Some(vec![decl("background-image", &format!("{func}-gradient({raw} var(--kb-gradient-tail,))"))])
    };
    let degrees = |rest: &str| rest.parse::<u32>().ok().map(|n| format!("{}{n}deg", if negative { "-" } else { "" }));

    if let Some(rest) = value.strip_prefix("linear-") {
        if let Some(dir) = named(rest, LINEAR_DIR) {
            return (!negative).then(|| gradient("linear", Some(dir), space));
        }
        if let Some(angle) = degrees(rest) {
            return Some(gradient("linear", Some(&angle), space));
        }
        return whole("linear", rest);
    }

    if value == "radial" {
        return (!negative).then(|| gradient("radial", None, space));
    }
    if let Some(rest) = value.strip_prefix("radial-") {
        return whole("radial", rest);
    }

    if value == "conic" {
        return (!negative).then(|| gradient("conic", None, space));
    }
    if let Some(rest) = value.strip_prefix("conic-") {
        if let Some(angle) = degrees(rest) {
            return Some(gradient("conic", Some(&format!("from {angle}")), space));
        }
        return whole("conic", rest);
    }

    None
}

/// What a bracket/variable gradient (`bg-linear-[…]`, `bg-linear-(--g)`)
/// appends after its own value: the color stops, behind a comma. Set by
/// `from-*`/`via-*` (whoever defines the stops); unset, the gradient is just
/// the value. See `resolve_gradient_image`.
const GRADIENT_TAIL: &str = ", var(--kb-gradient-stops)";

enum Stop {
    Position(String),
    Color(String),
}

/// `from-*`/`via-*`/`to-*` are each two-way ambiguous: a bare number
/// (`from-25`) is a stop *position* percentage, anything else is a theme
/// color key. Arbitrary values disambiguate by a trailing `%`
/// (`from-[25%]` vs `from-[#ff0000]`) — same "leading/trailing shape
/// decides the branch" convention `typography::decoration_value` and
/// `border::border_value` already use for their own ambiguous prefixes.
fn resolve_stop(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Stop> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(if value.ends_with('%') { Stop::Position(value.to_string()) } else { Stop::Color(value.to_string()) });
    }
    if !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit()) {
        return Some(Stop::Position(format!("{value}%")));
    }
    // Tailwind's own spelling, with the `%` written out (`from-10%`,
    // `via-30%`, `to-90%`). The bare-number form above is Kbach's original
    // and keeps working.
    if let Some(n) = value.strip_suffix('%') {
        if !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) {
            return Some(Stop::Position(value.to_string()));
        }
    }
    // is_arbitrary is guaranteed false here (that case already returned
    // above) — color_value's own opacity-suffix handling
    // (`from-blue-6/50`) is what this reuses it for.
    color_value(theme, parsed).map(Stop::Color)
}

fn resolve_from(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    match resolve_stop(theme, parsed)? {
        Stop::Position(p) => Some(vec![decl("--kb-gradient-from-position", &p)]),
        Stop::Color(c) => Some(vec![
            decl("--kb-gradient-from", &format!("{c} var(--kb-gradient-from-position, 0%)")),
            decl("--kb-gradient-to", "rgb(255 255 255 / 0) var(--kb-gradient-to-position, 100%)"),
            decl("--kb-gradient-stops", "var(--kb-gradient-from), var(--kb-gradient-to)"),
            decl("--kb-gradient-tail", GRADIENT_TAIL),
        ]),
    }
}

fn resolve_via(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    // `via-none`: drop the middle stop again (back to from -> to).
    if !parsed.is_arbitrary && parsed.value.as_deref() == Some("none") {
        return Some(vec![decl("--kb-gradient-stops", "var(--kb-gradient-from), var(--kb-gradient-to)")]);
    }
    match resolve_stop(theme, parsed)? {
        Stop::Position(p) => Some(vec![decl("--kb-gradient-via-position", &p)]),
        Stop::Color(c) => Some(vec![
            decl("--kb-gradient-to", "rgb(255 255 255 / 0) var(--kb-gradient-to-position, 100%)"),
            decl(
                "--kb-gradient-stops",
                &format!("var(--kb-gradient-from), {c} var(--kb-gradient-via-position, 50%), var(--kb-gradient-to)"),
            ),
            decl("--kb-gradient-tail", GRADIENT_TAIL),
        ]),
    }
}

fn resolve_to(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    match resolve_stop(theme, parsed)? {
        Stop::Position(p) => Some(vec![decl("--kb-gradient-to-position", &p)]),
        Stop::Color(c) => Some(vec![decl("--kb-gradient-to", &format!("{c} var(--kb-gradient-to-position, 100%)"))]),
    }
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "bg" if !parsed.is_arbitrary => resolve_bg_keyword(parsed.value.as_deref()?, parsed.negative),
        // Dedicated arbitrary-only utilities for background-position/-size
        // — see this crate's own `VALUE_PREFIXES` doc comment for why
        // these exist separately from the "bg-" catchall's named keyword
        // scale (background-position/-size share no values with a color,
        // but DO share plain-word shapes like "center"/"cover" that would
        // otherwise be ambiguous inside an arbitrary "bg-[...]" value).
        "bg-position" if parsed.is_arbitrary => Some(vec![decl("background-position", parsed.value.as_deref()?)]),
        "bg-size" if parsed.is_arbitrary => Some(vec![decl("background-size", parsed.value.as_deref()?)]),
        "from" => resolve_from(theme, parsed),
        "via" => resolve_via(theme, parsed),
        "to" => resolve_to(theme, parsed),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;
    use crate::theme::ColorValue;
    use std::collections::HashMap;

    fn theme() -> ThemeConfig {
        let mut colors = HashMap::new();
        colors.insert("blue-6".to_string(), ColorValue::Plain("#2563eb".to_string()));
        colors.insert("red-6".to_string(), ColorValue::Plain("#dc2626".to_string()));
        ThemeConfig { colors, ..Default::default() }
    }

    #[test]
    fn resolves_background_position_size_repeat_attachment() {
        let t = theme();
        assert_eq!(resolve(&parse_class("bg-top"), &t), Some(vec![decl("background-position", "top")]));
        assert_eq!(resolve(&parse_class("bg-left-bottom"), &t), Some(vec![decl("background-position", "left bottom")]));
        assert_eq!(resolve(&parse_class("bg-cover"), &t), Some(vec![decl("background-size", "cover")]));
        assert_eq!(resolve(&parse_class("bg-repeat-x"), &t), Some(vec![decl("background-repeat", "repeat-x")]));
        assert_eq!(resolve(&parse_class("bg-no-repeat"), &t), Some(vec![decl("background-repeat", "no-repeat")]));
        assert_eq!(resolve(&parse_class("bg-fixed"), &t), Some(vec![decl("background-attachment", "fixed")]));
    }

    #[test]
    fn resolves_background_clip_and_origin() {
        let t = theme();
        assert_eq!(resolve(&parse_class("bg-clip-text"), &t), Some(vec![decl("background-clip", "text")]));
        assert_eq!(resolve(&parse_class("bg-origin-padding"), &t), Some(vec![decl("background-origin", "padding-box")]));
        assert_eq!(resolve(&parse_class("bg-none"), &t), Some(vec![decl("background-image", "none")]));
    }

    #[test]
    fn resolves_arbitrary_background_position_and_size() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("bg-position-[center_top_1rem]"), &t),
            Some(vec![decl("background-position", "center top 1rem")]),
        );
        assert_eq!(resolve(&parse_class("bg-size-[auto_100px]"), &t), Some(vec![decl("background-size", "auto 100px")]));
        // Non-arbitrary values aren't supported here — the named keyword
        // scale stays entirely under the "bg-" catchall.
        assert_eq!(resolve(&parse_class("bg-position-top"), &t), None);
    }

    #[test]
    fn does_not_shadow_a_real_theme_color_named_bg() {
        // "bg-blue-6" is a valid theme color, so background.rs must never be
        // consulted for it in practice — but confirm this module itself
        // returns None for it too (color.rs is what actually resolves it).
        let t = theme();
        assert_eq!(resolve(&parse_class("bg-blue-6"), &t), None);
    }

    #[test]
    fn resolves_linear_gradient_directions_angle_and_arbitrary() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("bg-linear-to-r"), &t),
            Some(vec![decl("background-image", "linear-gradient(to right, var(--kb-gradient-stops))")]),
        );
        assert_eq!(
            resolve(&parse_class("bg-linear-45"), &t),
            Some(vec![decl("background-image", "linear-gradient(45deg, var(--kb-gradient-stops))")]),
        );
        assert_eq!(
            resolve(&parse_class("bg-linear-[25deg]"), &t),
            Some(vec![decl("background-image", "linear-gradient(25deg var(--kb-gradient-tail,))")]),
        );
    }

    #[test]
    fn resolves_radial_and_conic_gradients() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("bg-radial"), &t),
            Some(vec![decl("background-image", "radial-gradient(var(--kb-gradient-stops))")]),
        );
        assert_eq!(
            resolve(&parse_class("bg-radial-[circle_at_top]"), &t),
            Some(vec![decl("background-image", "radial-gradient(circle at top var(--kb-gradient-tail,))")]),
        );
        assert_eq!(
            resolve(&parse_class("bg-conic"), &t),
            Some(vec![decl("background-image", "conic-gradient(var(--kb-gradient-stops))")]),
        );
        assert_eq!(
            resolve(&parse_class("bg-conic-180"), &t),
            Some(vec![decl("background-image", "conic-gradient(from 180deg, var(--kb-gradient-stops))")]),
        );
    }

    #[test]
    fn resolves_from_via_to_color_stops() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("from-blue-6"), &t),
            Some(vec![
                decl("--kb-gradient-from", "#2563eb var(--kb-gradient-from-position, 0%)"),
                decl("--kb-gradient-to", "rgb(255 255 255 / 0) var(--kb-gradient-to-position, 100%)"),
                decl("--kb-gradient-stops", "var(--kb-gradient-from), var(--kb-gradient-to)"),
                decl("--kb-gradient-tail", ", var(--kb-gradient-stops)"),
            ]),
        );
        assert_eq!(
            resolve(&parse_class("via-red-6"), &t),
            Some(vec![
                decl("--kb-gradient-to", "rgb(255 255 255 / 0) var(--kb-gradient-to-position, 100%)"),
                decl(
                    "--kb-gradient-stops",
                    "var(--kb-gradient-from), #dc2626 var(--kb-gradient-via-position, 50%), var(--kb-gradient-to)",
                ),
                decl("--kb-gradient-tail", ", var(--kb-gradient-stops)"),
            ]),
        );
        assert_eq!(
            resolve(&parse_class("to-blue-6"), &t),
            Some(vec![decl("--kb-gradient-to", "#2563eb var(--kb-gradient-to-position, 100%)")]),
        );
    }

    #[test]
    fn resolves_inline_slash_opacity_on_gradient_stop_colors() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("from-blue-6/50"), &t),
            Some(vec![
                decl("--kb-gradient-from", "rgba(37,99,235,0.5) var(--kb-gradient-from-position, 0%)"),
                decl("--kb-gradient-to", "rgb(255 255 255 / 0) var(--kb-gradient-to-position, 100%)"),
                decl("--kb-gradient-stops", "var(--kb-gradient-from), var(--kb-gradient-to)"),
                decl("--kb-gradient-tail", ", var(--kb-gradient-stops)"),
            ]),
        );
        assert_eq!(
            resolve(&parse_class("to-blue-6/50"), &t),
            Some(vec![decl("--kb-gradient-to", "rgba(37,99,235,0.5) var(--kb-gradient-to-position, 100%)")]),
        );
    }

    #[test]
    fn resolves_from_via_to_position_percentages_named_and_arbitrary() {
        let t = theme();
        assert_eq!(resolve(&parse_class("from-25"), &t), Some(vec![decl("--kb-gradient-from-position", "25%")]));
        assert_eq!(resolve(&parse_class("via-[10%]"), &t), Some(vec![decl("--kb-gradient-via-position", "10%")]));
        assert_eq!(
            resolve(&parse_class("to-[#112233]"), &t),
            Some(vec![decl("--kb-gradient-to", "#112233 var(--kb-gradient-to-position, 100%)")]),
        );
    }

    #[test]
    fn returns_none_for_an_unresolvable_from_color() {
        let t = theme();
        assert_eq!(resolve(&parse_class("from-not-a-color"), &t), None);
    }
}
