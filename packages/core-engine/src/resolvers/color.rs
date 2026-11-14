use super::{decl, resolve_percent, Declaration};
use crate::parser::{color_with_opacity, parse_alpha, Alpha, ParsedClass};
use crate::theme::{ColorValue, ThemeConfig};

/// Looks up a named theme color as a plain hex string. Mode-aware colors
/// ({ light, dark }) are only ever resolved BEFORE tokenizing — via
/// `expand_mode_aware_color_classes` on web, or `substitute_mode_aware_color_token`
/// on native (both in this file) — so by the time a class reaches this
/// lookup, a mode-aware name has already been rewritten to a plain hex
/// value, on both engines. Finding one here directly means it was used some
/// other way neither pre-pass covers (e.g. a `ring-`/`decoration-` color, or
/// one with an inline `/N` opacity suffix — see those functions' own doc
/// comments for the exact prefixes/shapes they recognize); treated as
/// unresolvable rather than guessing a mode.
pub(super) fn lookup_hex<'a>(theme: &'a ThemeConfig, key: &str) -> Option<&'a str> {
    // CSS's `inherit` keyword (`text-inherit`, `bg-inherit`, `border-inherit`,
    // …) — like `current`, a value every color utility accepts, but a CSS
    // keyword rather than a palette entry, so it isn't in theme.colors (and
    // native skips it, see `native_hex_color`). A theme color literally
    // named "inherit" still wins.
    if key == "inherit" && !theme.colors.contains_key(key) {
        return Some("inherit");
    }
    match theme.colors.get(key)? {
        ColorValue::Plain(hex) => Some(hex.as_str()),
        ColorValue::ModeAware { .. } => None,
    }
}

/// Splits a trailing `/N` opacity suffix off a color value — Tailwind's
/// inline opacity modifier (`bg-orange-5/50`), a completely different
/// mechanism from the `bg-opacity-*` companion-class utility below (which
/// composes via a CSS variable — see `color_value`'s own doc comment for
/// how the two interact). Only ever splits when the tail after the LAST
/// "/" parses as a plain 0-100 integer — this engine's spacing/sizing
/// utilities also use "/" for FRACTIONS (`w-1/2`), a completely different
/// meaning, but no real color name is ever literally digits, so there's no
/// actual ambiguity between the two uses in practice.
///
/// Every form Tailwind v4 takes (parser.rs `parse_alpha`): `/50`, a decimal
/// `/2.5`, a bracketed `/[0.37]` or `/[37%]`, and a runtime `/(--o)`. Split
/// at the FIRST `/` (a color name has none), so a `/` inside the brackets of
/// `/[calc(1/2)]` stays with the opacity.
pub(super) fn split_opacity(value: &str) -> (&str, Option<Alpha>) {
    if let Some((name, opacity_text)) = value.split_once('/') {
        if let Some(alpha) = parse_alpha(opacity_text) {
            return (name, Some(alpha));
        }
    }
    (value, None)
}

/// Looks up a named color, baking in an inline `/N` opacity suffix (if
/// present) as an `rgba(...)` string — arbitrary values are used as-is
/// (an arbitrary color's opacity, `bg-[#fff]/50`, is already mixed into the
/// value by parser.rs `color_with_opacity`). `color_declarations`
/// (bg-*/text-*, below) reuses this rather than re-splitting on its own: an
/// already-baked `rgba(...)` string simply skips that function's own
/// hex-decomposition path (it doesn't start with "#"), so the two
/// mechanisms compose correctly without conflicting — the only cost is
/// that a slash-opacity color can't ALSO be overridden by a separate
/// `bg-opacity-*` class on the same element, an unlikely combination to
/// write in the first place. `native_hex_color` (resolvers/mod.rs) reuses
/// this too, for the identical native/Expo Go behavior.
pub(super) fn color_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<String> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(value.to_string());
    }
    let (name, opacity) = split_opacity(value);
    let hex = lookup_hex(theme, name)?;
    Some(match opacity {
        // A hex color with a known opacity is a plain `rgba(...)`. Any other
        // color (a CSS-variable color such as the CDN's
        // `rgb(var(--kb-color-card))`, a config color like `red` or
        // `rgb(10 20 30)`, `currentColor`), and any runtime opacity
        // (`/(--o)`), goes through `color-mix`, as Tailwind v4 does.
        // Regression: the opacity suffix was silently dropped (`bg-card/80`
        // rendered fully opaque). `inherit` can't be mixed, so it stays
        // as-is. Native strips this back to the plain color
        // (resolve_style.rs `rn_style_value`).
        Some(alpha) if hex != "inherit" => color_with_opacity(hex, &alpha),
        _ => hex.to_string(),
    })
}

fn hex_to_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    // Byte-slices below assume 1 byte == 1 char; reject non-ASCII up front
    // (e.g. an arbitrary value like `bg-[#café1]`) so a multi-byte codepoint
    // can't land mid-slice and panic on a non-char-boundary index.
    if !hex.is_ascii() {
        return None;
    }
    match hex.len() {
        6 => Some((
            u8::from_str_radix(&hex[0..2], 16).ok()?,
            u8::from_str_radix(&hex[2..4], 16).ok()?,
            u8::from_str_radix(&hex[4..6], 16).ok()?,
        )),
        3 => {
            let expand = |c: char| u8::from_str_radix(&c.to_string().repeat(2), 16).ok();
            let mut chars = hex.chars();
            Some((expand(chars.next()?)?, expand(chars.next()?)?, expand(chars.next()?)?))
        }
        _ => None,
    }
}

/// Emits an opacity-composable color declaration: a hex value decomposes
/// into `rgba(r,g,b,var(--x-opacity, 1))`, so a sibling `bg-opacity-*` class
/// on the same element can set `--bg-opacity` and compose with it. A
/// non-hex value (an arbitrary CSS keyword/function like "red" or
/// "rgb(...)") can't be decomposed into channels, so it's used as-is —
/// still valid CSS, just not opacity-composable.
fn color_declarations(theme: &ThemeConfig, parsed: &ParsedClass, css_property: &str, opacity_var: &str) -> Option<Vec<Declaration>> {
    let value = color_value(theme, parsed)?;
    if let Some(hex) = value.strip_prefix('#') {
        if let Some((r, g, b)) = hex_to_rgb(hex) {
            return Some(vec![decl(css_property, &format!("rgba({r},{g},{b},var({opacity_var}, 1))"))]);
        }
    }
    Some(vec![decl(css_property, &value)])
}

/// Known CSS length/size unit suffixes — used only to disambiguate an
/// ARBITRARY `text-[...]` value between font-size and color (see
/// `resolve_text`'s doc comment); not a general-purpose CSS value
/// validator, and deliberately not exhaustive of every possible length
/// unit (`cm`/`mm`/`in`/`pt`/`pc`/`ch`/`ex`/`vmin`/`vmax` are real CSS units
/// too, just far rarer in a Tailwind `text-*` value than the ones below).
const LENGTH_UNITS: &[&str] = &["px", "rem", "em", "%", "vh", "vw"];

/// True if `value` looks like a CSS length (a number, optionally with a
/// known unit suffix like "20px"/"1.5rem"/"100%") rather than a color. Used
/// for arbitrary-value disambiguation wherever a prefix is ambiguous between
/// a length and a color (`text-[...]` below; `border-[...]`/`outline-[...]`
/// in `border.rs`) — a real color never parses as a bare number or
/// number+length-unit, so this is safe without needing full
/// CSS-value-type inference.
pub(super) fn looks_like_length(value: &str) -> bool {
    let without_unit = LENGTH_UNITS.iter().find_map(|u| value.strip_suffix(u)).unwrap_or(value);
    if without_unit.parse::<f64>().is_ok() {
        return true;
    }
    // calc()/clamp()/min()/max() over lengths: `clamp(1rem, 2vw, 3rem)`.
    // A color function never takes these, and a number with a length unit
    // inside one never appears in a color.
    let is_math = ["calc(", "clamp(", "min(", "max("].iter().any(|f| value.starts_with(f));
    is_math && MATH_LENGTH_UNITS.iter().any(|u| contains_number_with_unit(value, u))
}

/// Units that mark a calc()/clamp()/min()/max() as a length.
const MATH_LENGTH_UNITS: &[&str] = &[
    "px", "rem", "em", "%", "vh", "vw", "vmin", "vmax", "dvh", "dvw", "svh", "svw", "lvh", "lvw", "ch", "ex", "lh", "cqw", "cqh", "cqi", "cqb",
];

/// Whether `value` has a digit directly followed by `unit`, and not by
/// more letters: "2vw" in "clamp(1rem,2vw,3rem)".
fn contains_number_with_unit(value: &str, unit: &str) -> bool {
    let bytes = value.as_bytes();
    let mut from = 0;
    while let Some(i) = value[from..].find(unit).map(|i| i + from) {
        let before_is_digit = i > 0 && bytes[i - 1].is_ascii_digit();
        let after_ends = bytes.get(i + unit.len()).is_none_or(|b| !b.is_ascii_alphabetic());
        if before_is_digit && after_ends {
            return true;
        }
        from = i + 1;
    }
    false
}

/// Whether an arbitrary value is a size rather than a color, for the
/// utilities that take either (`text-`, `border-`, `outline-`, `ring-`, `stroke-`, ...).
/// A type hint decides (`text-[length:var(--x)]`, `border-[color:var(--x)]`);
/// without one, the value's shape does.
pub(super) fn is_length(parsed: &ParsedClass, value: &str) -> bool {
    match parsed.type_hint.as_deref() {
        Some("length" | "size" | "line-width" | "percentage" | "number" | "integer" | "absolute-size" | "relative-size") => true,
        Some(_) => false,
        None => looks_like_length(value),
    }
}

/// Whether an arbitrary value is a color, for the utilities whose bracket
/// value is otherwise a whole shadow (`shadow-[…]`, `inset-shadow-[…]`,
/// `drop-shadow-[…]`, `text-shadow-[…]`). A `color:` hint decides
/// (`shadow-(color:--c)`); without one, a hex, a color function or a color
/// keyword is a color. A bare `var()` is not: `shadow-(--s)` is a shadow.
pub(super) fn is_color(parsed: &ParsedClass, value: &str) -> bool {
    const FUNCTIONS: &[&str] = &["rgb(", "rgba(", "hsl(", "hsla(", "hwb(", "lab(", "lch(", "oklab(", "oklch(", "color(", "color-mix("];
    match parsed.type_hint.as_deref() {
        Some("color") => true,
        Some(_) => false,
        None => {
            let keyword = !value.is_empty()
                && value.bytes().all(|b| b.is_ascii_alphabetic())
                && !matches!(value, "none" | "inherit" | "initial" | "unset" | "revert");
            value.starts_with('#') || FUNCTIONS.iter().any(|f| value.starts_with(f)) || keyword
        }
    }
}

/// Whether an arbitrary `bg-[...]` value is an image: an `image:`/`url:` hint,
/// or a url()/image-set()/*-gradient() value.
fn is_image(parsed: &ParsedClass, value: &str) -> bool {
    match parsed.type_hint.as_deref() {
        Some("image" | "url") => true,
        Some(_) => false,
        None => value.starts_with("url(") || value.starts_with("image-set(") || value.contains("gradient("),
    }
}

fn resolve_text(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    // "text-" is genuinely ambiguous (font-size / text-align / text-wrap /
    // text-overflow / bare-"shadow" / color) — size, alignment, wrap, and
    // overflow keywords are checked first since they're small closed sets;
    // anything else falls through to color resolution. Bare "text-shadow"
    // (no dash, meaning no explicit tier) parses as utility="text"
    // value="shadow" via this module's own "text-" catchall prefix —
    // "text-shadow-" (WITH a dash) is a genuinely different, dedicated
    // utility name handled by effects::resolve, unreachable from here.
    if !parsed.is_arbitrary {
        if let Some(value) = parsed.value.as_deref() {
            if let Some(size) = super::typography::text_size(value) {
                // Tailwind v4: each size carries its own default line-height.
                let mut decls = vec![decl("font-size", size)];
                if let Some(lh) = super::typography::text_size_line_height(value) {
                    decls.push(decl("line-height", &format!("var(--kb-leading, {lh})")));
                }
                return Some(decls);
            }
            // `text-sm/6`: the size with its own line-height. Set straight,
            // as Tailwind CSS does (no --kb-leading: the class says both).
            if let Some((size, leading)) = super::typography::split_size_leading(value) {
                let lh = super::typography::size_leading_web(leading)?;
                return Some(vec![decl("font-size", size), decl("line-height", &lh)]);
            }
            if let Some(align) = super::typography::text_align(value) {
                return Some(vec![decl("text-align", align)]);
            }
            if let Some(wrap) = super::typography::text_wrap(value) {
                return Some(vec![decl("text-wrap", wrap)]);
            }
            if value == "shadow" {
                return Some(vec![decl("text-shadow", &super::effects::text_shadow_default())]);
            }
            if value == "ellipsis" {
                return Some(vec![decl("text-overflow", "ellipsis")]);
            }
            if value == "clip" {
                return Some(vec![decl("text-overflow", "clip")]);
            }
        }
    } else if let Some(value) = parsed.value.as_deref() {
        // Regression guard: an arbitrary "text-[20px]" used to always fall
        // through to color resolution (is_arbitrary skipped every check
        // above unconditionally), silently treating a font-size as a color
        // instead. A real color value never parses as a bare number or a
        // number+known-length-unit, so this check is safe to run ONLY for
        // the arbitrary branch, ahead of the color fallback below.
        if is_length(parsed, value) {
            // `text-[14px]/[20px]`: the size with its line-height.
            let mut decls = vec![decl("font-size", value)];
            if let Some(leading) = parsed.modifier.as_deref() {
                decls.push(decl("line-height", &super::typography::size_leading_web(leading)?));
            }
            return Some(decls);
        }
        if parsed.modifier.is_some() {
            return None;
        }
    }
    color_declarations(theme, parsed, "color", "--text-opacity")
}

fn stroke_width_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "0" => "0",
        "1" => "1",
        "2" => "2",
        _ => return None,
    })
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        // Regression guard: an arbitrary "bg-[url(...)]" used to always be
        // treated as background-color (this arm never checked the value's
        // shape at all) — a background-IMAGE silently became a color
        // instead. `url(...)` is unambiguous (a real color value never
        // starts with it), so it's checked first, ahead of the normal
        // color path; anything else keeps the exact same color resolution
        // as before.
        // Gradients and image-set() too, and the type hints: `bg-[image:...]`,
        // `bg-[length:...]`/`bg-[size:...]` (background-size), `bg-[position:...]`.
        // A gradient used to become background-color.
        "bg" if parsed.is_arbitrary && parsed.value.as_deref().is_some_and(|v| is_image(parsed, v)) => {
            Some(vec![decl("background-image", parsed.value.as_deref()?)])
        }
        "bg" if parsed.is_arbitrary && matches!(parsed.type_hint.as_deref(), Some("length" | "size" | "bg-size" | "percentage")) => {
            Some(vec![decl("background-size", parsed.value.as_deref()?)])
        }
        "bg" if parsed.is_arbitrary && parsed.type_hint.as_deref() == Some("position") => {
            Some(vec![decl("background-position", parsed.value.as_deref()?)])
        }
        "bg" => color_declarations(theme, parsed, "background-color", "--bg-opacity"),
        "text" => resolve_text(parsed, theme),
        "bg-opacity" => resolve_percent(parsed).map(|v| vec![decl("--bg-opacity", &v)]),
        "text-opacity" => resolve_percent(parsed).map(|v| vec![decl("--text-opacity", &v)]),
        // caret-color/accent-color have no matching Tailwind opacity-modifier
        // utility in this engine, so a plain (non-opacity-composed) lookup —
        // same as `border_value`'s own color branch — is the right shape,
        // not `color_declarations`'s rgba-decomposition.
        "caret" => color_value(theme, parsed).map(|v| vec![decl("caret-color", &v)]),
        "accent" if !parsed.is_arbitrary && parsed.value.as_deref() == Some("auto") => Some(vec![decl("accent-color", "auto")]),
        "accent" => color_value(theme, parsed).map(|v| vec![decl("accent-color", &v)]),
        // SVG presentation attributes — grouped here with the rest of this
        // module's color-family utilities rather than a dedicated svg.rs,
        // since both are genuinely just "fill"/"stroke" is-it-a-color
        // lookups with a "none" keyword override, the same shape as every
        // other color arm above.
        "fill" if parsed.value.as_deref() == Some("none") => Some(vec![decl("fill", "none")]),
        "fill" => color_value(theme, parsed).map(|v| vec![decl("fill", &v)]),
        "stroke-width" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("stroke-width", value)]);
            }
            stroke_width_value(value).map(|v| vec![decl("stroke-width", v)])
        }
        "stroke" if parsed.value.as_deref() == Some("none") => Some(vec![decl("stroke", "none")]),
        // `stroke-[2.5]`, `stroke-[3px]`, `stroke-[length:var(--w)]`: a width,
        // not a color (they used to write `stroke: 2.5`).
        "stroke" if parsed.is_arbitrary && parsed.value.as_deref().is_some_and(|v| is_length(parsed, v)) => {
            Some(vec![decl("stroke-width", parsed.value.as_deref()?)])
        }
        // `stroke-2` (Tailwind's spelling): any whole number is a stroke width.
        "stroke" if !parsed.is_arbitrary && parsed.value.as_deref().is_some_and(|v| !v.is_empty() && v.bytes().all(|b| b.is_ascii_digit())) => {
            Some(vec![decl("stroke-width", parsed.value.as_deref()?)])
        }
        "stroke" => color_value(theme, parsed).map(|v| vec![decl("stroke", &v)]),
        // scrollbar-thumb-*/scrollbar-track-* (scrollbar-color) — composed
        // via CSS variables, same "each utility sets its own slot, both
        // re-declare the same shorthand referencing both" technique
        // `interactivity.rs`'s `border-spacing`/`border-spacing-x`/
        // `border-spacing-y` trio already uses, so setting only one side
        // doesn't clobber whichever value (or the `auto` fallback) the
        // other side already has.
        "scrollbar-thumb" => {
            let v = color_value(theme, parsed)?;
            Some(vec![
                decl("--kb-scrollbar-thumb", &v),
                decl("scrollbar-color", "var(--kb-scrollbar-thumb, auto) var(--kb-scrollbar-track, auto)"),
            ])
        }
        "scrollbar-track" => {
            let v = color_value(theme, parsed)?;
            Some(vec![
                decl("--kb-scrollbar-track", &v),
                decl("scrollbar-color", "var(--kb-scrollbar-thumb, auto) var(--kb-scrollbar-track, auto)"),
            ])
        }
        _ => None,
    }
}

/// Expands a semantic mode-aware color name (a theme color defined as
/// `{ light, dark }`) into a literal light/dark class pair BEFORE
/// tokenizing — e.g. "bg-surface" -> "bg-[#f9fafb] dark:bg-[#111827]" — so
/// every downstream consumer (the resolver, css.rs's dark-mode selector
/// wrapping) only ever sees plain hex values, never a semantic name needing
/// runtime mode awareness. Mirrors `old-kbach/src/core/modeAwareColors.ts`.
pub fn expand_mode_aware_color_classes(class_string: &str, theme: &ThemeConfig) -> String {
    class_string
        .split_whitespace()
        .map(|token| expand_token(token, theme))
        .collect::<Vec<_>>()
        .join(" ")
}

fn expand_token(token: &str, theme: &ThemeConfig) -> String {
    let mut segments: Vec<&str> = token.split(':').collect();
    let base = segments.pop().unwrap_or(token);
    let modifier_prefix = if segments.is_empty() { String::new() } else { format!("{}:", segments.join(":")) };

    match expand_base(base, theme) {
        // A token that ALREADY carries an explicit `dark:` modifier on a
        // mode-aware color (e.g. `dark:bg-surface`, usually written out of
        // habit from before the color was made mode-aware) is NOT split
        // into a base+dark pair — that would be redundant on top of an
        // already-explicit choice, and would double up the `dark:` prefix
        // into a broken `dark:dark:...` selector. Substitute the dark side
        // in place instead, leaving every modifier (including the `dark:`
        // itself) exactly as written. Mirrors
        // old-kbach/packages/ui/src/core/modeAwareColors.ts's identical,
        // deliberately-documented guard.
        Some((_, dark)) if segments.contains(&"dark") => format!("{modifier_prefix}{dark}"),
        Some((light, dark)) => format!("{modifier_prefix}{light} {modifier_prefix}dark:{dark}"),
        None => token.to_string(),
    }
}

// The only prefixes a mode-aware color name is recognized under, on either
// engine — shared by `find_mode_aware_color` so web's expansion and native's
// substitution (below) can never drift on which utilities support this.
const MODE_AWARE_COLOR_PREFIXES: [&str; 3] = ["bg-", "text-", "border-"];

/// Finds a `bg-`/`text-`/`border-` (optionally `!`-important-prefixed) class
/// base that names a mode-aware theme color, returning the prefix (with the
/// `!` preserved) plus both hex sides — shared by `expand_base` (web, needs
/// both) and `substitute_mode_aware_color_token` (native, picks one) so
/// neither can drift from the other on which prefixes/markers are
/// recognized.
/// `value`'s own trailing `/N` opacity suffix (if any — see `split_opacity`)
/// is stripped BEFORE the `theme.colors` lookup and returned alongside the
/// match, rather than left for the caller to notice is missing: without
/// this, `bg-surface/50` (surface mode-aware) looked up the literal,
/// never-defined key `"surface/50"`, silently failed to match here, fell
/// through to `lookup_hex` (which explicitly rejects a `ModeAware` entry,
/// expecting it to have already been substituted away by this exact
/// function), and the whole class resolved to nothing at all — confirmed as
/// a real, reported bug: any mode-aware custom color completely lost inline
/// opacity support, native and web alike, with no warning explaining why.
fn find_mode_aware_color<'a>(base: &'a str, theme: &'a ThemeConfig) -> Option<(String, Option<Alpha>, &'a str, &'a str)> {
    let (important, rest) = match base.strip_prefix('!') {
        Some(r) => ("!", r),
        None => ("", base),
    };
    for prefix in MODE_AWARE_COLOR_PREFIXES {
        let Some(after_prefix) = rest.strip_prefix(prefix) else { continue };
        let (name, opacity) = split_opacity(after_prefix);
        if let Some(ColorValue::ModeAware { light, dark }) = theme.colors.get(name) {
            return Some((format!("{important}{prefix}"), opacity, light.as_str(), dark.as_str()));
        }
    }
    None
}

/// Bakes an optional `/N` opacity suffix into `hex` as an `rgba(...)`
/// string — same decomposition `color_value` already does for an ordinary
/// (non-mode-aware) color's own inline opacity, reused here so a mode-aware
/// color's light/dark sides get IDENTICAL opacity handling. Returns `hex`
/// unchanged when there's no opacity, or when `hex` isn't a `#`-prefixed
/// value `hex_to_rgb` can decompose (same tolerant fallback `color_value`
/// uses). The result goes back into a class token (`bg-[…]`), so the spaces
/// of a `color-mix(...)` (a runtime opacity, `bg-surface/(--o)`) are written
/// as underscores, the arbitrary-value spelling.
fn apply_opacity_to_hex(hex: &str, opacity: Option<&Alpha>) -> String {
    match opacity {
        Some(alpha) if hex.strip_prefix('#').and_then(hex_to_rgb).is_some() => color_with_opacity(hex, alpha).replace(' ', "_"),
        _ => hex.to_string(),
    }
}

fn expand_base(base: &str, theme: &ThemeConfig) -> Option<(String, String)> {
    let (prefix, opacity, light, dark) = find_mode_aware_color(base, theme)?;
    Some((
        format!("{prefix}[{}]", apply_opacity_to_hex(light, opacity.as_ref())),
        format!("{prefix}[{}]", apply_opacity_to_hex(dark, opacity.as_ref())),
    ))
}

/// Native's counterpart to `expand_mode_aware_color_classes` — used by
/// `resolve_style_with_warnings` (the shared native/JNI + JS-fallback
/// runtime entry point), never by the web/CSS-generation path. Web must
/// emit a stylesheet valid for BOTH light and dark up front, at build time,
/// with no "current mode" to consult, hence the light/dark class PAIR
/// `expand_mode_aware_color_classes` produces. Native resolves fresh on
/// every call with a known, single active `color_scheme` already in hand
/// (see that parameter on `resolve_style_with_warnings`), so there's never
/// a reason to compute the side that isn't active — this substitutes the
/// ONE matching hex directly in place instead.
///
/// An explicit `dark:` (or any other) modifier already written on the token
/// is left exactly as-is, including on a mode-aware color (`dark:bg-surface`)
/// — this only ever swaps which hex the color NAME resolves to, never which
/// modifiers gate the token; `native_modifier_state` still decides
/// separately whether the token applies at all. That means a token like
/// `dark:bg-surface` in light mode still substitutes (to `dark:bg-[<light
/// hex>]`, matching `color_scheme`) even though the `dark:` modifier will
/// go on to filter the whole token out regardless — harmless, since the
/// substituted hex is never actually used in that case.
///
/// Before this existed, a plain `bg-surface` (or any mode-aware color used
/// directly in a class name) silently resolved to nothing at all on
/// native/Expo Go — `lookup_hex`'s `ColorValue::Plain`-only match returned
/// `None` for a `ModeAware` entry with no substitute ever attempted, so the
/// whole declaration was dropped with no warning. Confirmed as a real,
/// reported regression: a `kbach.config.js` using the grouped `dark: {}`
/// block (see `@kbach/react-native`'s `config.ts`) turns a color into
/// exactly this `ModeAware` shape, and a plain `bg-<name>` class — the only
/// way most apps ever use a color — is the natural, expected way to consume
/// it; it should never have needed a separate `useColors()` call just
/// because the color happened to be mode-aware.
pub fn substitute_mode_aware_color_token(token: &str, theme: &ThemeConfig, color_scheme: &str) -> String {
    let mut segments: Vec<&str> = token.split(':').collect();
    let base = segments.pop().unwrap_or(token);
    let modifier_prefix = if segments.is_empty() { String::new() } else { format!("{}:", segments.join(":")) };

    match find_mode_aware_color(base, theme) {
        Some((prefix, opacity, light, dark)) => {
            let hex = if color_scheme == "dark" { dark } else { light };
            format!("{modifier_prefix}{prefix}[{}]", apply_opacity_to_hex(hex, opacity.as_ref()))
        }
        None => token.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;
    use std::collections::HashMap;

    fn theme_with_colors() -> ThemeConfig {
        let mut colors = HashMap::new();
        colors.insert("blue-6".to_string(), ColorValue::Plain("#2563eb".to_string()));
        colors.insert(
            "surface".to_string(),
            ColorValue::ModeAware { light: "#f9fafb".to_string(), dark: "#111827".to_string() },
        );
        ThemeConfig { colors, ..Default::default() }
    }

    #[test]
    fn resolves_bg_color_as_an_opacity_composable_rgba() {
        let theme = theme_with_colors();
        let decls = resolve(&parse_class("bg-blue-6"), &theme).unwrap();
        assert_eq!(decls, vec![decl("background-color", "rgba(37,99,235,var(--bg-opacity, 1))")]);
    }

    #[test]
    fn resolves_bg_opacity_to_a_custom_property() {
        let theme = theme_with_colors();
        let decls = resolve(&parse_class("bg-opacity-50"), &theme).unwrap();
        assert_eq!(decls, vec![decl("--bg-opacity", "0.5")]);
    }

    #[test]
    fn resolves_inline_slash_opacity_on_bg_to_a_baked_rgba() {
        let theme = theme_with_colors();
        let decls = resolve(&parse_class("bg-blue-6/50"), &theme).unwrap();
        // No var(--bg-opacity, ...) wrapper — a slash-opacity value is
        // already a complete rgba() string by the time color_declarations
        // sees it, so its own hex-decomposition path never triggers.
        assert_eq!(decls, vec![decl("background-color", "rgba(37,99,235,0.5)")]);
    }

    #[test]
    fn resolves_inline_slash_opacity_on_text_the_same_way() {
        let theme = theme_with_colors();
        let decls = resolve(&parse_class("text-blue-6/25"), &theme).unwrap();
        assert_eq!(decls, vec![decl("color", "rgba(37,99,235,0.25)")]);
    }

    #[test]
    fn resolves_inline_slash_opacity_on_fill_stroke_caret_accent() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("fill-blue-6/50"), &theme), Some(vec![decl("fill", "rgba(37,99,235,0.5)")]));
        assert_eq!(resolve(&parse_class("stroke-blue-6/50"), &theme), Some(vec![decl("stroke", "rgba(37,99,235,0.5)")]));
        assert_eq!(resolve(&parse_class("caret-blue-6/50"), &theme), Some(vec![decl("caret-color", "rgba(37,99,235,0.5)")]));
        assert_eq!(resolve(&parse_class("accent-blue-6/50"), &theme), Some(vec![decl("accent-color", "rgba(37,99,235,0.5)")]));
    }

    #[test]
    fn hex_to_rgb_rejects_non_ascii_instead_of_panicking() {
        // "café1" is 6 bytes but 5 chars — byte-slicing this without an
        // ASCII check panics on a non-char-boundary index.
        assert_eq!(hex_to_rgb("café1"), None);
        assert_eq!(hex_to_rgb("é"), None);
    }

    #[test]
    fn resolves_arbitrary_bg_color_with_non_ascii_hex_without_panicking() {
        let theme = theme_with_colors();
        let decls = resolve(&parse_class("bg-[#café1]"), &theme).unwrap();
        // Not a valid hex value, so it's passed through as-is rather than
        // decomposed into an rgba() — the important assertion is that this
        // doesn't panic.
        assert_eq!(decls, vec![decl("background-color", "#café1")]);
    }

    #[test]
    fn slash_opacity_at_0_and_100_produces_valid_rgba_bounds() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("bg-blue-6/0"), &theme), Some(vec![decl("background-color", "rgba(37,99,235,0)")]));
        assert_eq!(resolve(&parse_class("bg-blue-6/100"), &theme), Some(vec![decl("background-color", "rgba(37,99,235,1)")]));
    }

    #[test]
    fn an_opacity_suffix_over_100_or_non_numeric_is_not_treated_as_opacity() {
        let theme = theme_with_colors();
        // "6/150" isn't a valid theme color name either way, so this stays
        // unresolvable — proves the >100 guard actually rejects the split
        // rather than silently clamping.
        assert_eq!(resolve(&parse_class("bg-blue-6/150"), &theme), None);
    }

    #[test]
    fn slash_opacity_on_a_non_hex_theme_color_uses_color_mix() {
        let mut colors = HashMap::new();
        colors.insert("brand".to_string(), ColorValue::Plain("red".to_string()));
        let theme = ThemeConfig { colors, ..Default::default() };
        // "red" can't be decomposed into rgb channels, so the opacity goes
        // through color-mix (Tailwind v4's approach). This used to drop the
        // opacity silently and return plain "red".
        assert_eq!(
            color_value(&theme, &parse_class("bg-brand/50")),
            Some("color-mix(in srgb, red 50%, transparent)".to_string()),
        );
    }

    #[test]
    fn resolves_text_size_before_falling_back_to_color() {
        let theme = theme_with_colors();
        // Tailwind v4: each size carries its default line-height, overridable by leading-*.
        assert_eq!(
            resolve(&parse_class("text-lg"), &theme),
            Some(vec![decl("font-size", "1.125rem"), decl("line-height", "var(--kb-leading, calc(1.75 / 1.125))")]),
        );
        assert_eq!(
            resolve(&parse_class("text-6xl"), &theme),
            Some(vec![decl("font-size", "3.75rem"), decl("line-height", "var(--kb-leading, 1)")]),
        );
        assert_eq!(resolve(&parse_class("text-center"), &theme), Some(vec![decl("text-align", "center")]));
        assert_eq!(
            resolve(&parse_class("text-blue-6"), &theme),
            Some(vec![decl("color", "rgba(37,99,235,var(--text-opacity, 1))")]),
        );
    }

    #[test]
    fn resolves_text_wrap_before_falling_back_to_color() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("text-balance"), &theme), Some(vec![decl("text-wrap", "balance")]));
        assert_eq!(resolve(&parse_class("text-nowrap"), &theme), Some(vec![decl("text-wrap", "nowrap")]));
    }

    #[test]
    fn resolves_an_arbitrary_font_size_instead_of_misreading_it_as_a_color() {
        // Regression: arbitrary "text-*" values used to skip the size/
        // align/wrap checks unconditionally and fall straight into color
        // resolution — an arbitrary font-size silently became a color.
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("text-[20px]"), &theme), Some(vec![decl("font-size", "20px")]));
        assert_eq!(resolve(&parse_class("text-[1.5rem]"), &theme), Some(vec![decl("font-size", "1.5rem")]));
        assert_eq!(resolve(&parse_class("text-[100%]"), &theme), Some(vec![decl("font-size", "100%")]));
        // A real arbitrary color must still resolve as a color, unaffected.
        assert_eq!(resolve(&parse_class("text-[#ff0000]"), &theme), Some(vec![decl("color", "rgba(255,0,0,var(--text-opacity, 1))")]));
        assert_eq!(resolve(&parse_class("text-[red]"), &theme), Some(vec![decl("color", "red")]));
    }

    #[test]
    fn resolves_text_ellipsis_clip_and_logical_alignment() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("text-ellipsis"), &theme), Some(vec![decl("text-overflow", "ellipsis")]));
        assert_eq!(resolve(&parse_class("text-clip"), &theme), Some(vec![decl("text-overflow", "clip")]));
        assert_eq!(resolve(&parse_class("text-start"), &theme), Some(vec![decl("text-align", "start")]));
        assert_eq!(resolve(&parse_class("text-end"), &theme), Some(vec![decl("text-align", "end")]));
    }

    #[test]
    fn non_hex_arbitrary_color_is_used_as_is_without_opacity_composition() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("bg-[red]"), &theme), Some(vec![decl("background-color", "red")]));
    }

    #[test]
    fn resolves_an_arbitrary_background_image_instead_of_misreading_it_as_a_color() {
        // Regression: arbitrary "bg-[url(...)]" used to always be treated
        // as background-color — a background-IMAGE silently became a color.
        let theme = theme_with_colors();
        assert_eq!(
            resolve(&parse_class("bg-[url(/hero.png)]"), &theme),
            Some(vec![decl("background-image", "url(/hero.png)")]),
        );
        // A real arbitrary color must still resolve as a color, unaffected.
        assert_eq!(resolve(&parse_class("bg-[#112233]"), &theme).unwrap()[0].property, "background-color");
    }

    #[test]
    fn expands_a_mode_aware_color_into_a_light_dark_pair() {
        let theme = theme_with_colors();
        let expanded = expand_mode_aware_color_classes("bg-surface p-4", &theme);
        assert_eq!(expanded, "bg-[#f9fafb] dark:bg-[#111827] p-4");
    }

    #[test]
    fn expands_a_mode_aware_color_with_an_existing_modifier_prefix() {
        let theme = theme_with_colors();
        let expanded = expand_mode_aware_color_classes("hover:bg-surface", &theme);
        assert_eq!(expanded, "hover:bg-[#f9fafb] hover:dark:bg-[#111827]");
    }

    #[test]
    fn expands_a_mode_aware_color_with_an_inline_opacity_suffix() {
        // Regression: the opacity suffix wasn't stripped before the
        // mode-aware theme-color lookup, so `bg-surface/50` never matched
        // at all and passed through unexpanded, unstyled.
        let theme = theme_with_colors();
        let expanded = expand_mode_aware_color_classes("bg-surface/50 p-4", &theme);
        assert_eq!(expanded, "bg-[rgba(249,250,251,0.5)] dark:bg-[rgba(17,24,39,0.5)] p-4");
    }

    #[test]
    fn leaves_a_plain_color_class_unexpanded() {
        let theme = theme_with_colors();
        assert_eq!(expand_mode_aware_color_classes("bg-blue-6", &theme), "bg-blue-6");
    }

    #[test]
    fn substitutes_the_dark_side_in_place_for_a_token_that_already_has_an_explicit_dark_modifier() {
        let theme = theme_with_colors();
        // Regression test — this used to expand to a broken, doubled
        // "dark:bg-[#f9fafb] dark:dark:bg-[#111827]" (light value under a
        // dark-mode selector, plus an invalid dark:dark: prefix). An explicit
        // dark: on an already mode-aware color substitutes the dark side in
        // place instead, matching old-kbach's identical guard.
        let expanded = expand_mode_aware_color_classes("dark:bg-surface", &theme);
        assert_eq!(expanded, "dark:bg-[#111827]");
    }

    #[test]
    fn substitutes_the_dark_side_with_other_modifiers_still_stacked() {
        let theme = theme_with_colors();
        let expanded = expand_mode_aware_color_classes("hover:dark:bg-surface", &theme);
        assert_eq!(expanded, "hover:dark:bg-[#111827]");
    }

    #[test]
    fn native_substitution_picks_the_light_hex_in_light_mode() {
        let theme = theme_with_colors();
        assert_eq!(substitute_mode_aware_color_token("bg-surface", &theme, "light"), "bg-[#f9fafb]");
    }

    #[test]
    fn native_substitution_picks_the_dark_hex_in_dark_mode() {
        let theme = theme_with_colors();
        assert_eq!(substitute_mode_aware_color_token("bg-surface", &theme, "dark"), "bg-[#111827]");
    }

    #[test]
    fn native_substitution_preserves_a_stacked_modifier_prefix() {
        let theme = theme_with_colors();
        assert_eq!(substitute_mode_aware_color_token("hover:dark:text-surface", &theme, "dark"), "hover:dark:text-[#111827]");
    }

    #[test]
    fn native_substitution_preserves_an_important_marker() {
        let theme = theme_with_colors();
        assert_eq!(substitute_mode_aware_color_token("!bg-surface", &theme, "dark"), "!bg-[#111827]");
    }

    #[test]
    fn native_substitution_leaves_a_plain_color_class_unchanged() {
        let theme = theme_with_colors();
        assert_eq!(substitute_mode_aware_color_token("bg-blue-6", &theme, "dark"), "bg-blue-6");
    }

    #[test]
    fn native_substitution_leaves_a_non_color_class_unchanged() {
        let theme = theme_with_colors();
        assert_eq!(substitute_mode_aware_color_token("flex-1", &theme, "dark"), "flex-1");
    }

    #[test]
    fn native_substitution_still_swaps_an_explicit_dark_modifier_to_match_the_current_scheme() {
        // An explicit `dark:bg-surface` in LIGHT mode still substitutes to
        // the light hex (matching `color_scheme`, not the `dark:` written on
        // the token) — harmless, since `native_modifier_state` filters this
        // whole token out in light mode regardless; see this function's own
        // doc comment.
        let theme = theme_with_colors();
        assert_eq!(substitute_mode_aware_color_token("dark:bg-surface", &theme, "light"), "dark:bg-[#f9fafb]");
    }

    #[test]
    fn resolves_caret_and_accent_color_without_opacity_composition() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("caret-blue-6"), &theme), Some(vec![decl("caret-color", "#2563eb")]));
        assert_eq!(resolve(&parse_class("accent-blue-6"), &theme), Some(vec![decl("accent-color", "#2563eb")]));
        assert_eq!(resolve(&parse_class("caret-[#f00]"), &theme), Some(vec![decl("caret-color", "#f00")]));
    }

    #[test]
    fn resolves_scrollbar_thumb_and_track_as_composed_scrollbar_color() {
        let theme = theme_with_colors();
        assert_eq!(
            resolve(&parse_class("scrollbar-thumb-blue-6"), &theme),
            Some(vec![
                decl("--kb-scrollbar-thumb", "#2563eb"),
                decl("scrollbar-color", "var(--kb-scrollbar-thumb, auto) var(--kb-scrollbar-track, auto)"),
            ]),
        );
        assert_eq!(
            resolve(&parse_class("scrollbar-track-[#f3f4f6]"), &theme),
            Some(vec![
                decl("--kb-scrollbar-track", "#f3f4f6"),
                decl("scrollbar-color", "var(--kb-scrollbar-thumb, auto) var(--kb-scrollbar-track, auto)"),
            ]),
        );
    }

    #[test]
    fn resolves_svg_fill_stroke_and_stroke_width() {
        let theme = theme_with_colors();
        assert_eq!(resolve(&parse_class("fill-blue-6"), &theme), Some(vec![decl("fill", "#2563eb")]));
        assert_eq!(resolve(&parse_class("fill-none"), &theme), Some(vec![decl("fill", "none")]));
        assert_eq!(resolve(&parse_class("stroke-blue-6"), &theme), Some(vec![decl("stroke", "#2563eb")]));
        assert_eq!(resolve(&parse_class("stroke-none"), &theme), Some(vec![decl("stroke", "none")]));
        assert_eq!(resolve(&parse_class("stroke-width-2"), &theme), Some(vec![decl("stroke-width", "2")]));
        assert_eq!(resolve(&parse_class("stroke-width-[1.5]"), &theme), Some(vec![decl("stroke-width", "1.5")]));
    }
}
