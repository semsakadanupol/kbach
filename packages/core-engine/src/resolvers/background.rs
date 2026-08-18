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

/// Same three-character safety check as `parser::is_safe_arbitrary_value`,
/// duplicated rather than exported: `bg-linear-[25deg]`/`bg-radial-[...]`/
/// `bg-conic-[...]`'s bracket content isn't reached through the parser's own
/// arbitrary-value branch (see `resolve_gradient_image`'s doc note), so it
/// never passes through that check on its way here.
fn is_safe_arbitrary(raw: &str) -> bool {
    !raw.contains('{') && !raw.contains('}') && !raw.contains(';')
}

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

fn resolve_bg_keyword(value: &str) -> Option<Vec<Declaration>> {
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
    resolve_gradient_image(value)
}

/// `bg-linear-to-r`/`bg-linear-45`/`bg-radial`/`bg-conic-180` etc. Bracket
/// forms (`bg-linear-[25deg]`) are NOT reached through `parser.rs`'s own
/// arbitrary-value branch — that only fires when the value immediately
/// after the whole matched prefix starts with `[` (i.e. `bg-[...]`, which
/// stays a color per this module's own doc comment), whereas here the `[`
/// appears mid-value after a literal `linear-`/`radial-`/`conic-` prefix —
/// so the underscore-to-space conversion and safety check are done by hand
/// here instead.
fn resolve_gradient_image(value: &str) -> Option<Vec<Declaration>> {
    fn arbitrary_arg(rest: &str) -> Option<String> {
        let raw = rest.strip_prefix('[')?.strip_suffix(']')?;
        if !is_safe_arbitrary(raw) {
            return None;
        }
        Some(raw.replace('_', " "))
    }

    if let Some(rest) = value.strip_prefix("linear-") {
        if let Some(dir) = named(rest, LINEAR_DIR) {
            return Some(vec![decl("background-image", &format!("linear-gradient({dir}, var(--kb-gradient-stops))"))]);
        }
        if let Ok(angle) = rest.parse::<i32>() {
            return Some(vec![decl("background-image", &format!("linear-gradient({angle}deg, var(--kb-gradient-stops))"))]);
        }
        let raw = arbitrary_arg(rest)?;
        return Some(vec![decl("background-image", &format!("linear-gradient({raw}, var(--kb-gradient-stops))"))]);
    }

    if value == "radial" {
        return Some(vec![decl("background-image", "radial-gradient(var(--kb-gradient-stops))")]);
    }
    if let Some(rest) = value.strip_prefix("radial-") {
        let raw = arbitrary_arg(rest)?;
        return Some(vec![decl("background-image", &format!("radial-gradient({raw}, var(--kb-gradient-stops))"))]);
    }

    if value == "conic" {
        return Some(vec![decl("background-image", "conic-gradient(var(--kb-gradient-stops))")]);
    }
    if let Some(rest) = value.strip_prefix("conic-") {
        if let Ok(angle) = rest.parse::<i32>() {
            return Some(vec![decl(
                "background-image",
                &format!("conic-gradient(from {angle}deg, var(--kb-gradient-stops))"),
            )]);
        }
        let raw = arbitrary_arg(rest)?;
        return Some(vec![decl("background-image", &format!("conic-gradient({raw}, var(--kb-gradient-stops))"))]);
    }

    None
}

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
        ]),
    }
}

fn resolve_via(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    match resolve_stop(theme, parsed)? {
        Stop::Position(p) => Some(vec![decl("--kb-gradient-via-position", &p)]),
        Stop::Color(c) => Some(vec![
            decl("--kb-gradient-to", "rgb(255 255 255 / 0) var(--kb-gradient-to-position, 100%)"),
            decl(
                "--kb-gradient-stops",
                &format!("var(--kb-gradient-from), {c} var(--kb-gradient-via-position, 50%), var(--kb-gradient-to)"),
            ),
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
        "bg" if !parsed.is_arbitrary => resolve_bg_keyword(parsed.value.as_deref()?),
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
            Some(vec![decl("background-image", "linear-gradient(25deg, var(--kb-gradient-stops))")]),
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
            Some(vec![decl("background-image", "radial-gradient(circle at top, var(--kb-gradient-stops))")]),
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
