use super::{decl, resolve_negatable_length, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

/// `pub(super)` — consulted by color.rs's "text-" disambiguation before it
/// falls back to color resolution. Not part of this module's own `resolve`
/// dispatch, since "text" itself is owned by color.rs (see its docs).
/// The line-height Tailwind v4.3 pairs with each `text-*` size
/// (`--text-*--line-height`), as a unitless ratio. Web-only: emitted as
/// `line-height: var(--kb-leading, <ratio>)`, so any `leading-*` class wins
/// regardless of order (it sets `--kb-leading`). Native keeps only the font
/// size, since RN line heights are absolute and a later `text-*` would
/// otherwise override an explicit `leading-*` by source order.
pub(super) fn text_size_line_height(key: &str) -> Option<&'static str> {
    Some(match key {
        "xs" => "calc(1 / 0.75)",
        "sm" => "calc(1.25 / 0.875)",
        "base" => "calc(1.5 / 1)",
        "lg" => "calc(1.75 / 1.125)",
        "xl" => "calc(1.75 / 1.25)",
        "2xl" => "calc(2 / 1.5)",
        "3xl" => "calc(2.25 / 1.875)",
        "4xl" => "calc(2.5 / 2.25)",
        "5xl" | "6xl" | "7xl" | "8xl" | "9xl" => "1",
        _ => return None,
    })
}

pub(super) fn text_size(key: &str) -> Option<&'static str> {
    Some(match key {
        "xs" => "0.75rem",
        "sm" => "0.875rem",
        "base" => "1rem",
        "lg" => "1.125rem",
        "xl" => "1.25rem",
        "2xl" => "1.5rem",
        "3xl" => "1.875rem",
        "4xl" => "2.25rem",
        "5xl" => "3rem",
        "6xl" => "3.75rem",
        "7xl" => "4.5rem",
        "8xl" => "6rem",
        "9xl" => "8rem",
        _ => return None,
    })
}

/// `pub(super)` — consulted by `resolvers::mod`'s native "leading"
/// dispatch AND this module's own web "leading" arm below. Tailwind's real
/// numeric leading scale (absolute rem lengths, *not* multipliers —
/// `leading-6` is literally `1.5rem`), which is why this converts cleanly
/// through the same px/rem-to-number pipeline as spacing/radius/font-size,
/// unlike the named multiplier keywords (tight/normal/loose/...) in
/// `leading_named` below — those resolve fine on web (a plain unitless CSS
/// number that scales with whatever font-size ends up applying) but stay
/// excluded from native, where `lineHeight` is always an absolute number
/// with no unitless-multiplier concept — resolving one needs the OTHER
/// class token's font-size, a cross-token lookup this per-token dispatch
/// doesn't do.
///
/// Tailwind v4's formula, `N * 0.25rem` for any non-negative number
/// (`leading-0`, `leading-0.5`, `leading-12`, …), not v3's fixed 3-10
/// table. Identical output for 3-10, which is all this table used to cover.
pub(super) fn line_height_size(key: &str) -> Option<String> {
    if key == "px" {
        return Some("1px".to_string());
    }
    let n: f64 = key.parse().ok()?;
    (n >= 0.0 && n.is_finite()).then(|| format!("{}rem", n * 0.25))
}

/// Tailwind v4's `text-<size>/<leading>` shorthand (`text-sm/6`,
/// `text-lg/tight`, `text-sm/[20px]`, `text-sm/(--lh)`): the size's
/// font-size and the leading part, unresolved. `None` unless the part
/// before the `/` is a real size, so `text-blue-6/50` (a color with an
/// opacity) never comes here.
pub(super) fn split_size_leading(value: &str) -> Option<(&'static str, &str)> {
    let (size, leading) = value.split_once('/')?;
    Some((text_size(size)?, leading)).filter(|(_, l)| !l.is_empty())
}

/// The line-height for the leading part of `text-sm/6` on the web: the
/// numeric scale (`6` is `1.5rem`), a named multiplier (`tight`), or an
/// arbitrary / variable value.
pub(super) fn size_leading_web(leading: &str) -> Option<String> {
    crate::parser::arbitrary_modifier(leading)
        .or_else(|| line_height_size(leading))
        .or_else(|| leading_named(leading).map(str::to_string))
}

/// The same for native, where a line height is absolute: a named multiplier
/// or a unitless arbitrary number is multiplied out against the size
/// (`text-sm/tight` is 0.875rem x 1.25). A CSS variable has no meaning there.
pub(super) fn size_leading_native(size: &str, leading: &str) -> Option<String> {
    // The size is a named one (rem) or an arbitrary `text-[14px]` (rem or px).
    let rem = |n: f64| -> Option<String> {
        let (number, unit) = size.strip_suffix("rem").map(|v| (v, "rem")).or_else(|| size.strip_suffix("px").map(|v| (v, "px")))?;
        let size: f64 = number.parse().ok()?;
        Some(format!("{}{unit}", size * n))
    };
    if let Some(v) = crate::parser::arbitrary_modifier(leading) {
        if v.starts_with("var(") {
            return None;
        }
        return match v.parse::<f64>() {
            Ok(n) => rem(n),
            Err(_) => Some(v),
        };
    }
    line_height_size(leading).or_else(|| leading_named(leading).and_then(|m| rem(m.parse().ok()?)))
}

/// An arbitrary `font-[…]`: a weight or a family? Tailwind CSS v4 decides
/// by the type hint, else by the value: a number (`font-[550]`) or a bare
/// CSS variable (`font-(--weight)`) is a weight; anything else
/// (`font-[Inter]`, `font-(family-name:--font)`) is a family.
pub(super) fn arbitrary_font_is_weight(parsed: &ParsedClass, value: &str) -> bool {
    match parsed.type_hint.as_deref() {
        Some("number" | "integer") => true,
        Some(_) => false,
        None => value.parse::<f64>().is_ok() || (value.starts_with("var(") && value.ends_with(')') && !value.contains(',')),
    }
}

/// Web-only named `line-height` multipliers — see `line_height_size`'s doc
/// comment for why these don't extend to native.
fn leading_named(key: &str) -> Option<&'static str> {
    Some(match key {
        "none" => "1",
        "tight" => "1.25",
        "snug" => "1.375",
        "normal" => "1.5",
        "relaxed" => "1.625",
        "loose" => "2",
        _ => return None,
    })
}

/// Web-only named `letter-spacing` scale, in real `em` units (scales with
/// the element's own font-size) — matches actual Tailwind's values exactly,
/// not old-kbach's fixed-px approximation (`old-kbach/packages/ui/src/core/
/// theme.ts`'s `letterSpacing` bakes in an assumed 16px root font size,
/// which silently drifts wrong on any element with a different font-size;
/// genuine `em` units don't have that problem). Native-excluded — RN's
/// `letterSpacing` is always an absolute number, no relative-unit concept,
/// same cross-token issue as `leading_named`.
fn tracking_named(key: &str) -> Option<&'static str> {
    Some(match key {
        "tighter" => "-0.05em",
        "tight" => "-0.025em",
        "normal" => "0em",
        "wide" => "0.025em",
        "wider" => "0.05em",
        "widest" => "0.1em",
        _ => return None,
    })
}

/// Web-only (consulted by color.rs's "text-" disambiguation, alongside
/// `text_size`/`text_align`) — CSS `text-wrap` has no RN equivalent.
pub(super) fn text_wrap(key: &str) -> Option<&'static str> {
    Some(match key {
        "wrap" => "wrap",
        "nowrap" => "nowrap",
        "balance" => "balance",
        "pretty" => "pretty",
        _ => return None,
    })
}

/// `underline-offset-N`: any whole number of px (Tailwind v4; it used to be
/// 0/1/2/4/8 only), negatable (`-underline-offset-2`), or `auto`.
fn underline_offset_value(parsed: &ParsedClass, key: &str) -> Option<String> {
    if key == "auto" {
        return (!parsed.negative).then(|| "auto".to_string());
    }
    let px = super::border::whole_px(key)?;
    Some(if parsed.negative { super::negate(&px) } else { px })
}

/// `decoration-N`: any whole number of px, `auto` or `from-font`.
fn decoration_thickness(key: &str) -> Option<String> {
    match key {
        "auto" | "from-font" => Some(key.to_string()),
        _ => super::border::whole_px(key),
    }
}
const DECORATION_STYLE: &[&str] = &["solid", "dashed", "dotted", "double", "wavy"];

/// "decoration-*" is three-way ambiguous, same shape as "border-*" in
/// border.rs: a recognized thickness token means `text-decoration-thickness`,
/// a recognized style keyword means `text-decoration-style`, anything else
/// is treated as a color name/arbitrary value for `text-decoration-color`.
fn decoration_value(theme: &ThemeConfig, parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;

    if parsed.is_arbitrary {
        // A leading digit or calc()/etc. reads as a thickness; anything
        // else (a color, most commonly) is a color value.
        if value.chars().next().is_some_and(|c| c.is_ascii_digit()) {
            return Some(vec![decl("text-decoration-thickness", value)]);
        }
        return Some(vec![decl("text-decoration-color", value)]);
    }
    if let Some(thickness) = decoration_thickness(value) {
        return Some(vec![decl("text-decoration-thickness", &thickness)]);
    }
    if DECORATION_STYLE.contains(&value) {
        return Some(vec![decl("text-decoration-style", value)]);
    }
    // is_arbitrary is guaranteed false here (that case already returned
    // above) — color_value's own opacity-suffix handling
    // (`decoration-blue-6/50`) is what this reuses it for.
    super::color::color_value(theme, parsed).map(|v| vec![decl("text-decoration-color", &v)])
}

pub(super) fn text_align(key: &str) -> Option<&'static str> {
    Some(match key {
        "left" => "left",
        "center" => "center",
        "right" => "right",
        "justify" => "justify",
        // Logical alignment — just a different CSS keyword (the browser
        // resolves the physical side from `dir`/`writing-mode`, not this
        // engine), same "no direction-tracking logic needed" reasoning
        // `layout::resolve`'s `start`/`end` inset properties document.
        "start" => "start",
        "end" => "end",
        _ => return None,
    })
}

/// `pub(super)` — reused by `resolvers::mod`'s native typography dispatch.
pub(super) fn font_weight(key: &str) -> Option<&'static str> {
    Some(match key {
        "thin" => "100",
        "extralight" => "200",
        "light" => "300",
        "normal" => "400",
        "medium" => "500",
        "semibold" => "600",
        "bold" => "700",
        "extrabold" => "800",
        "black" => "900",
        _ => return None,
    })
}

/// `theme.font_family` (a caller-configurable map — see `theme.rs`'s own
/// doc comment) always wins when it has an entry for `key`, so a
/// `kbach.config.js`-style `extend.fontFamily` can both ADD a new name
/// (`display`) and OVERRIDE one of the three usual ones (`sans`) the exact
/// same way. Falls back to real Tailwind's own default stacks — the same
/// three fonts every fresh Tailwind project ships, byte-for-byte (not
/// abbreviated) — only when the theme doesn't define that name at all,
/// which is also what keeps a minimal/old cached theme JSON that omits
/// `fontFamily` entirely still resolving `font-sans`/`font-serif`/
/// `font-mono` correctly (see `theme.rs`'s own doc comment on this field).
pub(super) fn font_family_value(theme: &ThemeConfig, key: &str) -> Option<String> {
    if let Some(v) = theme.font_family.get(key) {
        return Some(v.clone());
    }
    Some(match key {
        "sans" => "ui-sans-serif, system-ui, sans-serif, \"Apple Color Emoji\", \"Segoe UI Emoji\", \"Segoe UI Symbol\", \"Noto Color Emoji\"",
        "serif" => "ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif",
        "mono" => "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
        _ => return None,
    }.to_string())
}

/// Real Tailwind's named `font-stretch` keyword scale — matches the CSS
/// spec's own named percentages exactly (`condensed` == 75%, etc.), though
/// this table only needs the keyword side: the numeric side is handled
/// separately in `resolve`'s own "font-stretch" arm (a bare `<percentage>`
/// value like `font-stretch-50%` is valid CSS as-is, no lookup needed).
fn font_stretch_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "ultra-condensed" => "ultra-condensed",
        "extra-condensed" => "extra-condensed",
        "condensed" => "condensed",
        "semi-condensed" => "semi-condensed",
        "normal" => "normal",
        "semi-expanded" => "semi-expanded",
        "expanded" => "expanded",
        "extra-expanded" => "extra-expanded",
        "ultra-expanded" => "ultra-expanded",
        _ => return None,
    })
}

/// CSS function calls a `content-[...]` value might legitimately be,
/// passed through verbatim rather than quoted as a literal string.
const CONTENT_FUNCTION_PREFIXES: &[&str] = &["attr(", "counter(", "counters(", "var("];

/// `content-[...]`/`content-none` — the pseudo-element `content` property,
/// meaningful only under a `before:`/`after:` modifier (see
/// `css::declarations_to_css`'s own doc comment for how the two connect:
/// this always sets `--kb-content`, never `content` directly, and
/// `before:`/`after:` rules auto-inject `content: var(--kb-content, "")`
/// so the two compose regardless of which utility/modifier combination
/// produced either declaration). "content-" is a registered
/// VALUE_PREFIXES entry shared with `layout.rs`'s align-content utilities
/// (see that module's own "content" arm for the disambiguation) — this
/// arm is only ever reached for a value the align-content keyword table
/// didn't recognize (arbitrary values, "none").
///
/// It also sets `content` itself, reading the variable back, as Tailwind
/// CSS does: without it, `content-[…]` outside `before:`/`after:` (an
/// element with its own `::before` rule in a stylesheet, an `<img>`
/// replacement) set a variable nothing read.
fn content_value(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    let css_value = if !parsed.is_arbitrary {
        if value != "none" {
            return None;
        }
        "none".to_string()
    } else {
        let already_quoted_or_function =
            value.starts_with('"') || value.starts_with('\'') || CONTENT_FUNCTION_PREFIXES.iter().any(|p| value.starts_with(p));
        if already_quoted_or_function { value.to_string() } else { format!("\"{value}\"") }
    };
    Some(vec![decl("--kb-content", &css_value), decl("content", "var(--kb-content)")])
}

/// `font-variant-numeric` has FIVE independent slots real Tailwind composes
/// together (ordinal, slashed-zero, figure, spacing, fraction) — writing
/// `ordinal tabular-nums` means BOTH classes' keywords end up in the same
/// `font-variant-numeric` value, not last-one-wins. Same `--kb-*`
/// CSS-variable composition technique `transform.rs`'s `TRANSFORM_COMPOSE`
/// and `filters.rs`'s equivalent already use: each utility below writes to
/// its own slot's variable and re-declares the full `font-variant-numeric`
/// shorthand referencing all five (via `var(--kb-fvn-x,)`'s empty
/// fallback, so a slot no earlier rule set just drops out rather than
/// literally reading as the text "initial"), so any combination of these
/// classes on one element composes correctly regardless of which one
/// happens to be declared last in the stylesheet.
const FVN_COMPOSE: &str =
    "var(--kb-fvn-ordinal,) var(--kb-fvn-slashed-zero,) var(--kb-fvn-figure,) var(--kb-fvn-spacing,) var(--kb-fvn-fraction,)";

fn fvn_composed(var_decl: Declaration) -> Vec<Declaration> {
    vec![var_decl, decl("font-variant-numeric", FVN_COMPOSE)]
}

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        // "font-" is two-way ambiguous: a recognized weight keyword means
        // `font-weight`, a recognized family keyword means `font-family`.
        // An arbitrary value is a weight when it's a number or a bare
        // variable (`font-[550]`, `font-(--w)`), else a family
        // (`font-[Inter]`) — see `arbitrary_font_is_weight`. `font-[550]`
        // used to come out as `font-family: 550`.
        "font" if parsed.is_arbitrary => {
            let value = parsed.value.as_deref()?;
            let property = if arbitrary_font_is_weight(parsed, value) { "font-weight" } else { "font-family" };
            Some(vec![decl(property, value)])
        }
        "font" => {
            let value = parsed.value.as_deref()?;
            font_weight(value)
                .map(|v| vec![decl("font-weight", v)])
                .or_else(|| font_family_value(theme, value).map(|v| vec![decl("font-family", &v)]))
        }
        "antialiased" => Some(vec![decl("-webkit-font-smoothing", "antialiased"), decl("-moz-osx-font-smoothing", "grayscale")]),
        "subpixel-antialiased" => {
            Some(vec![decl("-webkit-font-smoothing", "auto"), decl("-moz-osx-font-smoothing", "auto")])
        }
        // `normal-nums` is a hard reset in real Tailwind too (`font-variant-
        // numeric: normal`), not a sixth composed slot.
        "normal-nums" => Some(vec![decl("font-variant-numeric", "normal")]),
        "ordinal" => Some(fvn_composed(decl("--kb-fvn-ordinal", "ordinal"))),
        "slashed-zero" => Some(fvn_composed(decl("--kb-fvn-slashed-zero", "slashed-zero"))),
        "lining-nums" => Some(fvn_composed(decl("--kb-fvn-figure", "lining-nums"))),
        "oldstyle-nums" => Some(fvn_composed(decl("--kb-fvn-figure", "oldstyle-nums"))),
        "proportional-nums" => Some(fvn_composed(decl("--kb-fvn-spacing", "proportional-nums"))),
        "tabular-nums" => Some(fvn_composed(decl("--kb-fvn-spacing", "tabular-nums"))),
        "diagonal-fractions" => Some(fvn_composed(decl("--kb-fvn-fraction", "diagonal-fractions"))),
        "stacked-fractions" => Some(fvn_composed(decl("--kb-fvn-fraction", "stacked-fractions"))),
        "line-clamp" => {
            let value = parsed.value.as_deref()?;
            if value == "none" {
                return Some(vec![
                    decl("overflow", "visible"),
                    decl("display", "block"),
                    decl("-webkit-box-orient", "horizontal"),
                    decl("-webkit-line-clamp", "unset"),
                ]);
            }
            if parsed.is_arbitrary {
                return Some(vec![
                    decl("overflow", "hidden"),
                    decl("display", "-webkit-box"),
                    decl("-webkit-box-orient", "vertical"),
                    decl("-webkit-line-clamp", value),
                ]);
            }
            let n: i64 = value.parse().ok()?;
            if n < 1 {
                return None;
            }
            Some(vec![
                decl("overflow", "hidden"),
                decl("display", "-webkit-box"),
                decl("-webkit-box-orient", "vertical"),
                decl("-webkit-line-clamp", &n.to_string()),
            ])
        }
        "list-image" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("list-style-image", value)]);
            }
            (value == "none").then(|| vec![decl("list-style-image", "none")])
        }
        "overline" => Some(vec![decl("text-decoration-line", "overline")]),
        "normal-case" => Some(vec![decl("text-transform", "none")]),
        "content" => content_value(parsed),
        "leading" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("--kb-leading", value), decl("line-height", value)]);
            }
            // Also sets --kb-leading, which every `text-*` size's default
            // line-height reads, so `leading-*` wins whichever rule is later.
            line_height_size(value)
                .or_else(|| leading_named(value).map(str::to_string))
                .map(|v| vec![decl("--kb-leading", &v), decl("line-height", &v)])
        }
        // Negatable (`-tracking-wide`, `-tracking-[0.1em]`); the minus used
        // to be dropped.
        "tracking" => {
            let value = parsed.value.as_deref()?;
            let v = if parsed.is_arbitrary { value } else { tracking_named(value)? };
            let v = if parsed.negative { super::negate(v) } else { v.to_string() };
            Some(vec![decl("letter-spacing", &v)])
        }
        "uppercase" => Some(vec![decl("text-transform", "uppercase")]),
        "lowercase" => Some(vec![decl("text-transform", "lowercase")]),
        "capitalize" => Some(vec![decl("text-transform", "capitalize")]),
        "underline" => Some(vec![decl("text-decoration-line", "underline")]),
        "line-through" => Some(vec![decl("text-decoration-line", "line-through")]),
        "no-underline" => Some(vec![decl("text-decoration-line", "none")]),
        "truncate" => Some(vec![
            decl("overflow", "hidden"),
            decl("text-overflow", "ellipsis"),
            decl("white-space", "nowrap"),
        ]),

        "italic" => Some(vec![decl("font-style", "italic")]),
        "not-italic" => Some(vec![decl("font-style", "normal")]),

        // Named keywords, a bare `<percentage>` (`font-stretch-50%` — valid
        // CSS as-is, no lookup table needed), or arbitrary.
        "font-stretch" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("font-stretch", value)]);
            }
            if let Some(v) = font_stretch_value(value) {
                return Some(vec![decl("font-stretch", v)]);
            }
            let digits = value.strip_suffix('%')?;
            digits.parse::<f64>().ok().map(|_| vec![decl("font-stretch", value)])
        }
        // Arbitrary-only (`font-features-['smcp']`/`font-features-['smcp','onum']`)
        // — real Tailwind has no named `font-feature-settings` preset scale.
        "font-features" if parsed.is_arbitrary => {
            Some(vec![decl("font-feature-settings", parsed.value.as_deref()?)])
        }
        // Numeric scale (`tab-2`/`tab-8`, a bare integer) or arbitrary.
        "tab" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("tab-size", value)]);
            }
            value.parse::<f64>().ok().map(|_| vec![decl("tab-size", value)])
        }

        "decoration" => decoration_value(theme, parsed),
        "underline-offset" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                let v = if parsed.negative { super::negate(value) } else { value.to_string() };
                return Some(vec![decl("text-underline-offset", &v)]);
            }
            underline_offset_value(parsed, value).map(|v| vec![decl("text-underline-offset", &v)])
        }
        // Negatable (`-indent-4`, a hanging indent), like margin.
        "indent" => resolve_negatable_length(theme, parsed).map(|v| vec![decl("text-indent", &v)]),

        // overflow-wrap (Tailwind v4).
        "wrap-normal" => Some(vec![decl("overflow-wrap", "normal")]),
        "wrap-break-word" => Some(vec![decl("overflow-wrap", "break-word")]),
        "wrap-anywhere" => Some(vec![decl("overflow-wrap", "anywhere")]),
        "whitespace-normal" => Some(vec![decl("white-space", "normal")]),
        "whitespace-nowrap" => Some(vec![decl("white-space", "nowrap")]),
        "whitespace-pre" => Some(vec![decl("white-space", "pre")]),
        "whitespace-pre-wrap" => Some(vec![decl("white-space", "pre-wrap")]),
        "whitespace-pre-line" => Some(vec![decl("white-space", "pre-line")]),
        "whitespace-break-spaces" => Some(vec![decl("white-space", "break-spaces")]),

        "break-normal" => Some(vec![decl("overflow-wrap", "normal"), decl("word-break", "normal")]),
        "break-words" => Some(vec![decl("overflow-wrap", "break-word")]),
        "break-all" => Some(vec![decl("word-break", "break-all")]),
        "break-keep" => Some(vec![decl("word-break", "keep-all")]),

        // vertical-align: the keywords, or any value (`align-[4px]`, `align-(--x)`).
        "align" => {
            let value = parsed.value.as_deref()?;
            let known = matches!(value, "baseline" | "top" | "middle" | "bottom" | "text-top" | "text-bottom" | "sub" | "super");
            (parsed.is_arbitrary || known).then(|| vec![decl("vertical-align", value)])
        }

        // `list-[upper-roman]`, `list-(--marker)`: any list-style-type.
        // "list-" isn't a value prefix (it would swallow `list-item`,
        // `list-inside`, …), so the bracket is part of the utility name.
        u if u.starts_with("list-[") || u.starts_with("list-(") => {
            crate::parser::arbitrary_modifier(&u["list-".len()..]).map(|v| vec![decl("list-style-type", &v)])
        }
        "list-none" => Some(vec![decl("list-style-type", "none")]),
        "list-disc" => Some(vec![decl("list-style-type", "disc")]),
        "list-decimal" => Some(vec![decl("list-style-type", "decimal")]),
        "list-square" => Some(vec![decl("list-style-type", "square")]),
        "list-inside" => Some(vec![decl("list-style-position", "inside")]),
        "list-outside" => Some(vec![decl("list-style-position", "outside")]),

        "hyphens-none" => Some(vec![decl("hyphens", "none")]),
        "hyphens-manual" => Some(vec![decl("hyphens", "manual")]),
        "hyphens-auto" => Some(vec![decl("hyphens", "auto")]),

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
        let mut spacing = HashMap::new();
        spacing.insert("4".to_string(), 16.0);
        ThemeConfig { colors, spacing, ..Default::default() }
    }

    #[test]
    fn resolves_font_weight() {
        let t = theme();
        assert_eq!(resolve(&parse_class("font-bold"), &t), Some(vec![decl("font-weight", "700")]));
    }

    #[test]
    fn resolves_text_transform_and_decoration() {
        let t = theme();
        assert_eq!(resolve(&parse_class("uppercase"), &t), Some(vec![decl("text-transform", "uppercase")]));
        assert_eq!(resolve(&parse_class("underline"), &t), Some(vec![decl("text-decoration-line", "underline")]));
    }

    #[test]
    fn resolves_truncate_to_three_declarations() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("truncate"), &t),
            Some(vec![decl("overflow", "hidden"), decl("text-overflow", "ellipsis"), decl("white-space", "nowrap")]),
        );
    }

    #[test]
    fn text_size_and_align_lookup_tables_used_by_color_rs() {
        assert_eq!(text_size("lg"), Some("1.125rem"));
        assert_eq!(text_align("center"), Some("center"));
        assert_eq!(text_size("not-a-size"), None);
    }

    #[test]
    fn line_height_size_resolves_the_numeric_scale() {
        assert_eq!(line_height_size("6").as_deref(), Some("1.5rem"));
        assert_eq!(line_height_size("10").as_deref(), Some("2.5rem"));
        assert_eq!(line_height_size("tight"), None);
    }

    #[test]
    fn resolves_leading_numeric_named_and_arbitrary_on_web() {
        let t = theme();
        // every leading-* also sets --kb-leading, which text-* sizes read
        let lh = |v: &str| Some(vec![decl("--kb-leading", v), decl("line-height", v)]);
        assert_eq!(resolve(&parse_class("leading-6"), &t), lh("1.5rem"));
        assert_eq!(resolve(&parse_class("leading-tight"), &t), lh("1.25"));
        assert_eq!(resolve(&parse_class("leading-none"), &t), lh("1"));
        assert_eq!(resolve(&parse_class("leading-[3rem]"), &t), lh("3rem"));
    }

    #[test]
    fn resolves_tracking_named_and_arbitrary_on_web() {
        let t = theme();
        assert_eq!(resolve(&parse_class("tracking-wide"), &t), Some(vec![decl("letter-spacing", "0.025em")]));
        assert_eq!(resolve(&parse_class("tracking-tighter"), &t), Some(vec![decl("letter-spacing", "-0.05em")]));
        assert_eq!(resolve(&parse_class("tracking-[0.5px]"), &t), Some(vec![decl("letter-spacing", "0.5px")]));
    }

    #[test]
    fn resolves_italic_and_not_italic() {
        let t = theme();
        assert_eq!(resolve(&parse_class("italic"), &t), Some(vec![decl("font-style", "italic")]));
        assert_eq!(resolve(&parse_class("not-italic"), &t), Some(vec![decl("font-style", "normal")]));
    }

    #[test]
    fn resolves_decoration_thickness_style_and_color() {
        let t = theme();
        assert_eq!(resolve(&parse_class("decoration-2"), &t), Some(vec![decl("text-decoration-thickness", "2px")]));
        assert_eq!(resolve(&parse_class("decoration-auto"), &t), Some(vec![decl("text-decoration-thickness", "auto")]));
        assert_eq!(resolve(&parse_class("decoration-wavy"), &t), Some(vec![decl("text-decoration-style", "wavy")]));
        assert_eq!(resolve(&parse_class("decoration-blue-6"), &t), Some(vec![decl("text-decoration-color", "#2563eb")]));
        assert_eq!(resolve(&parse_class("decoration-[3px]"), &t), Some(vec![decl("text-decoration-thickness", "3px")]));
        assert_eq!(resolve(&parse_class("decoration-[red]"), &t), Some(vec![decl("text-decoration-color", "red")]));
    }

    #[test]
    fn resolves_inline_slash_opacity_on_decoration_color() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("decoration-blue-6/50"), &t),
            Some(vec![decl("text-decoration-color", "rgba(37,99,235,0.5)")]),
        );
    }

    #[test]
    fn resolves_underline_offset_named_and_arbitrary() {
        let t = theme();
        assert_eq!(resolve(&parse_class("underline-offset-4"), &t), Some(vec![decl("text-underline-offset", "4px")]));
        assert_eq!(resolve(&parse_class("underline-offset-auto"), &t), Some(vec![decl("text-underline-offset", "auto")]));
        assert_eq!(resolve(&parse_class("underline-offset-[3px]"), &t), Some(vec![decl("text-underline-offset", "3px")]));
    }

    #[test]
    fn resolves_indent_via_the_shared_spacing_scale() {
        let t = theme();
        assert_eq!(resolve(&parse_class("indent-4"), &t), Some(vec![decl("text-indent", "16px")]));
        assert_eq!(resolve(&parse_class("indent-[2rem]"), &t), Some(vec![decl("text-indent", "2rem")]));
    }

    #[test]
    fn resolves_whitespace_break_align_list_and_hyphens() {
        let t = theme();
        assert_eq!(resolve(&parse_class("whitespace-nowrap"), &t), Some(vec![decl("white-space", "nowrap")]));
        assert_eq!(
            resolve(&parse_class("break-normal"), &t),
            Some(vec![decl("overflow-wrap", "normal"), decl("word-break", "normal")]),
        );
        assert_eq!(resolve(&parse_class("break-words"), &t), Some(vec![decl("overflow-wrap", "break-word")]));
        assert_eq!(resolve(&parse_class("align-middle"), &t), Some(vec![decl("vertical-align", "middle")]));
        assert_eq!(resolve(&parse_class("list-disc"), &t), Some(vec![decl("list-style-type", "disc")]));
        assert_eq!(resolve(&parse_class("list-inside"), &t), Some(vec![decl("list-style-position", "inside")]));
        assert_eq!(resolve(&parse_class("hyphens-auto"), &t), Some(vec![decl("hyphens", "auto")]));
    }

    #[test]
    fn resolves_font_family_and_the_expanded_weight_scale() {
        let t = theme();
        assert_eq!(resolve(&parse_class("font-extralight"), &t), Some(vec![decl("font-weight", "200")]));
        assert_eq!(resolve(&parse_class("font-light"), &t), Some(vec![decl("font-weight", "300")]));
        assert_eq!(resolve(&parse_class("font-black"), &t), Some(vec![decl("font-weight", "900")]));
        let sans = resolve(&parse_class("font-sans"), &t).unwrap();
        assert_eq!(sans[0].property, "font-family");
        assert!(sans[0].value.contains("ui-sans-serif"));
        assert_eq!(resolve(&parse_class("font-[Inter]"), &t), Some(vec![decl("font-family", "Inter")]));
    }

    #[test]
    fn theme_font_family_adds_a_new_named_stack() {
        let mut t = theme();
        t.font_family.insert("display".to_string(), "\"Cal Sans\", sans-serif".to_string());
        assert_eq!(
            resolve(&parse_class("font-display"), &t),
            Some(vec![decl("font-family", "\"Cal Sans\", sans-serif")]),
        );
    }

    #[test]
    fn theme_font_family_overrides_one_of_the_three_default_names() {
        let mut t = theme();
        t.font_family.insert("sans".to_string(), "Inter, sans-serif".to_string());
        assert_eq!(resolve(&parse_class("font-sans"), &t), Some(vec![decl("font-family", "Inter, sans-serif")]));
        // "mono" wasn't overridden — still falls back to the hardcoded default.
        let mono = resolve(&parse_class("font-mono"), &t).unwrap();
        assert!(mono[0].value.contains("ui-monospace"));
    }

    #[test]
    fn resolves_antialiasing_and_font_variant_numeric() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("antialiased"), &t),
            Some(vec![decl("-webkit-font-smoothing", "antialiased"), decl("-moz-osx-font-smoothing", "grayscale")]),
        );
        assert_eq!(
            resolve(&parse_class("tabular-nums"), &t),
            Some(vec![decl("--kb-fvn-spacing", "tabular-nums"), decl("font-variant-numeric", FVN_COMPOSE)]),
        );
        assert_eq!(
            resolve(&parse_class("ordinal"), &t),
            Some(vec![decl("--kb-fvn-ordinal", "ordinal"), decl("font-variant-numeric", FVN_COMPOSE)]),
        );
        assert_eq!(resolve(&parse_class("normal-nums"), &t), Some(vec![decl("font-variant-numeric", "normal")]));
    }

    #[test]
    fn font_variant_numeric_slots_compose_across_independently_resolved_classes() {
        let t = theme();
        let ordinal = resolve(&parse_class("ordinal"), &t).unwrap();
        let tabular = resolve(&parse_class("tabular-nums"), &t).unwrap();
        // Both classes' rules declare the SAME `font-variant-numeric`
        // shorthand text — the point of the `var(--kb-fvn-x,)` composition
        // technique is that it doesn't matter which rule's declaration
        // "wins" in the cascade, since they're identical and each one's
        // own `--kb-fvn-*` custom property is still visible to the other
        // via inheritance regardless of source order.
        assert_eq!(ordinal[1], decl("font-variant-numeric", FVN_COMPOSE));
        assert_eq!(tabular[1], decl("font-variant-numeric", FVN_COMPOSE));
        assert_ne!(ordinal[0], tabular[0]);
    }

    #[test]
    fn resolves_line_clamp_numeric_none_and_arbitrary() {
        let t = theme();
        let clamp3 = resolve(&parse_class("line-clamp-3"), &t).unwrap();
        assert!(clamp3.contains(&decl("-webkit-line-clamp", "3")));
        assert!(clamp3.contains(&decl("display", "-webkit-box")));
        let none = resolve(&parse_class("line-clamp-none"), &t).unwrap();
        assert!(none.contains(&decl("-webkit-line-clamp", "unset")));
        assert!(none.contains(&decl("display", "block")));
        assert_eq!(resolve(&parse_class("line-clamp-0"), &t), None);
    }

    #[test]
    fn resolves_list_image_and_square() {
        let t = theme();
        assert_eq!(resolve(&parse_class("list-square"), &t), Some(vec![decl("list-style-type", "square")]));
        assert_eq!(resolve(&parse_class("list-image-none"), &t), Some(vec![decl("list-style-image", "none")]));
        assert_eq!(
            resolve(&parse_class("list-image-[url(/check.png)]"), &t),
            Some(vec![decl("list-style-image", "url(/check.png)")]),
        );
    }

    #[test]
    fn resolves_overline_normal_case_break_keep_and_break_spaces() {
        let t = theme();
        assert_eq!(resolve(&parse_class("overline"), &t), Some(vec![decl("text-decoration-line", "overline")]));
        assert_eq!(resolve(&parse_class("normal-case"), &t), Some(vec![decl("text-transform", "none")]));
        assert_eq!(resolve(&parse_class("break-keep"), &t), Some(vec![decl("word-break", "keep-all")]));
        assert_eq!(resolve(&parse_class("whitespace-break-spaces"), &t), Some(vec![decl("white-space", "break-spaces")]));
    }

    #[test]
    fn text_size_scale_extends_to_9xl() {
        assert_eq!(text_size("5xl"), Some("3rem"));
        assert_eq!(text_size("9xl"), Some("8rem"));
    }

    #[test]
    fn text_align_includes_logical_start_and_end() {
        assert_eq!(text_align("start"), Some("start"));
        assert_eq!(text_align("end"), Some("end"));
    }

    #[test]
    fn resolves_content_none_and_arbitrary_values() {
        let t = theme();
        // the variable, and `content` reading it back
        let content = |v: &str| Some(vec![decl("--kb-content", v), decl("content", "var(--kb-content)")]);
        assert_eq!(resolve(&parse_class("content-none"), &t), content("none"));
        // Unquoted arbitrary text gets auto-quoted...
        assert_eq!(resolve(&parse_class("content-[Hi]"), &t), content("\"Hi\""));
        assert_eq!(resolve(&parse_class("content-[Hello_World]"), &t), content("\"Hello World\""));
        // ...but a value that's already quoted, or a CSS function call, passes through as-is.
        assert_eq!(resolve(&parse_class("content-['Hi']"), &t), content("'Hi'"));
        assert_eq!(resolve(&parse_class("content-[attr(data-content)]"), &t), content("attr(data-content)"));
    }

    #[test]
    fn this_module_defers_align_content_keywords_to_layout_rs() {
        // "content-" is a registered VALUE_PREFIXES entry shared with
        // layout.rs's align-content utilities (content-center, etc.) — this
        // module's own "content" arm only recognizes "none" and arbitrary
        // values, correctly returning None for an align-content keyword so
        // `resolve_utility`'s dispatch chain (which tries layout::resolve
        // FIRST) is what actually resolves "content-center", not this file.
        let t = theme();
        assert_eq!(resolve(&parse_class("content-center"), &t), None);
    }

    #[test]
    fn resolves_font_stretch_named_percentage_and_arbitrary() {
        let t = theme();
        assert_eq!(resolve(&parse_class("font-stretch-condensed"), &t), Some(vec![decl("font-stretch", "condensed")]));
        assert_eq!(
            resolve(&parse_class("font-stretch-ultra-expanded"), &t),
            Some(vec![decl("font-stretch", "ultra-expanded")]),
        );
        assert_eq!(resolve(&parse_class("font-stretch-50%"), &t), Some(vec![decl("font-stretch", "50%")]));
        assert_eq!(resolve(&parse_class("font-stretch-[80%]"), &t), Some(vec![decl("font-stretch", "80%")]));
        assert_eq!(resolve(&parse_class("font-stretch-not-a-value"), &t), None);
    }

    #[test]
    fn resolves_font_features_arbitrary_only() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("font-features-['smcp']"), &t),
            Some(vec![decl("font-feature-settings", "'smcp'")]),
        );
    }

    #[test]
    fn resolves_tab_size_numeric_and_arbitrary() {
        let t = theme();
        assert_eq!(resolve(&parse_class("tab-2"), &t), Some(vec![decl("tab-size", "2")]));
        assert_eq!(resolve(&parse_class("tab-8"), &t), Some(vec![decl("tab-size", "8")]));
        assert_eq!(resolve(&parse_class("tab-[12px]"), &t), Some(vec![decl("tab-size", "12px")]));
        assert_eq!(resolve(&parse_class("tab-banana"), &t), None);
    }

    #[test]
    fn resolves_text_wrap_keywords() {
        assert_eq!(text_wrap("balance"), Some("balance"));
        assert_eq!(text_wrap("pretty"), Some("pretty"));
        assert_eq!(text_wrap("not-a-wrap-value"), None);
    }
}
