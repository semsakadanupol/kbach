//! Tokenizes a single class-string token (e.g. "dark:hover:!bg-[#6366f1]")
//! into its modifier chain, base utility name, value, and important flag.
//!
//! `VALUE_PREFIXES` is checked in order and the first match wins — entries
//! that share a shorter prefix with another entry (e.g. "gap-x-" vs "gap-",
//! "bg-opacity-" vs "bg-") MUST be listed before their shorter counterpart,
//! or the shorter one would wrongly claim the match first.

/// Utility prefixes (including their trailing "-") that take a value after
/// the dash. Anything not matching one of these is a standalone utility.
const VALUE_PREFIXES: &[&str] = &[
    // Color — opacity variants before their base prefix. "bg-blend-" and
    // "text-shadow-" before their shorter "bg-"/"text-" catchall
    // counterparts, same ordering rule as "bg-opacity-" before "bg-".
    // "bg-position-"/"bg-size-" before the bare "bg-" catchall (same
    // longer-before-shorter rule as "bg-opacity-" before "bg-") — dedicated
    // utilities for ARBITRARY background-position/-size values, mirroring
    // real Tailwind v4's own solution to this exact ambiguity: the named
    // keyword scale (bg-top/bg-center/bg-cover/bg-contain/...) still lives
    // entirely under the "bg-" catchall (background.rs), unaffected; these
    // two are arbitrary-only, so there's no overlapping meaning to
    // disambiguate between the two paths.
    "bg-opacity-", "text-opacity-", "bg-blend-", "text-shadow-", "bg-position-", "bg-size-", "bg-", "text-",
    // Border — per-side/per-axis AND "border-spacing-*" (a completely
    // different property, unrelated to border-width/style/color, but still
    // literally prefixed "border-") all before the bare catchall, same
    // longer-before-shorter rule as "gap-x-" before "gap-". "border-spacing-"
    // specifically MUST be listed here, not just "near table utilities" —
    // the bare "border-" catchall below is a prefix of literally every
    // "border-spacing-*" token too, so it would wrongly claim the match
    // first if "border-spacing-*" were listed any later than this.
    "border-spacing-x-", "border-spacing-y-", "border-spacing-",
    "border-x-", "border-y-", "border-t-", "border-r-", "border-b-", "border-l-", "border-s-", "border-e-", "border-",
    // Interactivity & sizing rest (resolvers::color's caret/accent/fill/
    // stroke arms, resolvers::interactivity, resolvers::scroll).
    // "stroke-width-" before "stroke-" (its shorter counterpart), same
    // ordering rule as every other longer-before-shorter pair in this list.
    "caret-", "accent-", "fill-", "stroke-width-", "stroke-",
    "resize-", "touch-", "will-change-", "appearance-", "scheme-",
    // scroll-margin/scroll-padding (resolvers::scroll) — axis/side variants
    // before their base prefix, same reasoning as "gap-x-" before "gap-".
    // "scroll-auto"/"scroll-smooth" (scroll-behavior) and every "snap-*"
    // token are fixed literals with no value to split off, so they need no
    // prefix entry at all — they fall through to the standalone-utility
    // path below and are matched by their full literal name directly.
    "scroll-mx-", "scroll-my-", "scroll-mt-", "scroll-mr-", "scroll-mb-", "scroll-ml-", "scroll-m-",
    "scroll-px-", "scroll-py-", "scroll-pt-", "scroll-pr-", "scroll-pb-", "scroll-pl-", "scroll-p-",
    // Spacing — axis/side variants before their base prefix.
    "px-", "py-", "pt-", "pr-", "pb-", "pl-", "p-",
    "mx-", "my-", "mt-", "mr-", "mb-", "ml-", "m-",
    "gap-x-", "gap-y-", "gap-",
    "min-w-", "max-w-", "w-",
    "min-h-", "max-h-", "h-",
    "size-", "basis-",
    // Logical sizing (Tailwind v4.2's writing-mode-aware `inline-size`/
    // `block-size` equivalents to `w`/`h`) — same longer-before-shorter
    // ordering as the physical min-w-/max-w-/w- group above.
    "min-inline-", "max-inline-", "inline-",
    "min-block-", "max-block-", "block-",
    // Border-radius — corners (4-char: tl/tr/br/bl) and side-pairs (t/r/b/l)
    // both before the bare catchall, same longer-before-shorter rule.
    "rounded-tl-", "rounded-tr-", "rounded-br-", "rounded-bl-",
    "rounded-t-", "rounded-r-", "rounded-b-", "rounded-l-",
    // Logical corners/sides — "rounded-ss-"/"rounded-se-"/"rounded-ee-"/
    // "rounded-es-" don't actually collide with "rounded-s-"/"rounded-e-"
    // (the two-letter forms' 9th character is a repeated "s"/"e", never
    // the literal "-" the one-letter prefixes require there), so relative
    // order between the two groups doesn't matter — listed corners-first
    // to mirror the physical tl/tr/br/bl group above.
    "rounded-ss-", "rounded-se-", "rounded-ee-", "rounded-es-",
    "rounded-s-", "rounded-e-", "rounded-",
    // Effects. "ring-offset-" before "ring-", "outline-offset-" before
    // "outline-" — same longer-before-shorter rule.
    "ring-offset-", "ring-", "outline-offset-", "outline-", "shadow-", "opacity-",
    "duration-", "delay-", "ease-", "cursor-", "mix-blend-", "animate-",
    // Typography. "font-stretch-"/"font-features-" before the bare "font-"
    // catchall — same longer-before-shorter rule as "bg-opacity-" before
    // "bg-" — plus "tab-" (tab-size; no collision with "table-auto"/
    // "table-fixed" below, which don't share "tab-" as a literal 4-char
    // prefix: the 4th character of "table-" is "l", not "-").
    "leading-", "tracking-", "font-stretch-", "font-features-", "font-", "tab-",
    // Layout: position/inset/z. "inset-x-"/"inset-y-" before bare "inset-".
    "z-", "inset-x-", "inset-y-", "inset-", "top-", "right-", "bottom-", "left-", "start-", "end-",
    // Divide / space-between. "divide-color-" (not a bare "divide-") so
    // "divide-x"/"divide-y" (standalone width utilities, no dash-value) fall
    // through to the standalone-utility path below instead of being wrongly
    // split into utility="divide", value="x"/"y". "divide-x-"/"divide-y-"
    // (WITH a trailing dash — "divide-x-2", "divide-x-reverse") is a
    // genuinely different, deliberately separate prefix from the bare
    // "divide-x"/"divide-y" literals above — no ordering conflict, since a
    // prefix match requires the literal dash this bare form doesn't have.
    "divide-color-", "divide-x-", "divide-y-", "space-x-", "space-y-",
    // Flex — one prefix covers flex-direction (row/col/row-reverse/
    // col-reverse), flex-wrap (wrap/wrap-reverse/nowrap), the `flex`
    // shorthand (1/auto/initial/none/arbitrary), AND the legacy Tailwind v2
    // flex-grow/flex-grow-0/flex-shrink/flex-shrink-0 names — all
    // disambiguated by value in resolvers::layout::resolve_flex. Bare
    // "flex" (no dash) still falls through to the standalone path below,
    // unaffected.
    "flex-", "grow-", "shrink-", "order-",
    // Grid (web-only — see resolvers::grid's module doc for why). "col-span-"/
    // "col-start-"/"col-end-" before "col-" (their shorter counterpart), same
    // reasoning as "gap-x-" before "gap-" above; same for the row- family.
    "grid-cols-", "grid-rows-", "grid-flow-", "auto-cols-", "auto-rows-",
    "col-span-", "col-start-", "col-end-", "col-",
    "row-span-", "row-start-", "row-end-", "row-",
    "place-items-", "place-content-", "place-self-", "justify-items-", "justify-self-",
    // Transforms (web-only — see resolvers::transform's module doc). "scale-x-"/
    // "scale-y-"/"scale-z-" before "scale-" (their shorter counterpart), same
    // reasoning as "gap-x-" before "gap-" above; same for rotate-x/y/z before
    // bare rotate-, and perspective-origin- before perspective- (otherwise
    // "perspective-origin-center" would wrongly parse as
    // utility="perspective" value="origin-center"). No "transform-" prefix
    // needed — "transform-none"/"transform-gpu"/"transform-cpu" are
    // standalone literals (not a dash-value split).
    "scale-x-", "scale-y-", "scale-z-", "scale-",
    "rotate-x-", "rotate-y-", "rotate-z-", "rotate-",
    "translate-x-", "translate-y-", "translate-z-", "skew-x-", "skew-y-",
    "perspective-origin-", "perspective-", "origin-",
    // Filters & backdrop-filters (web-only — see resolvers::filters's module
    // doc). No ordering conflicts within this group or against anything
    // above — none of these share a shorter prefix with each other.
    "blur-", "brightness-", "contrast-", "grayscale-", "hue-rotate-",
    "invert-", "saturate-", "sepia-", "drop-shadow-", "filter-",
    "backdrop-blur-", "backdrop-brightness-", "backdrop-contrast-",
    "backdrop-grayscale-", "backdrop-hue-rotate-", "backdrop-invert-",
    "backdrop-opacity-", "backdrop-saturate-", "backdrop-sepia-", "backdrop-filter-",
    // Typography completeness (resolvers::typography). "decoration-" is
    // three-way ambiguous (thickness/style/color), same shape as "border-".
    "decoration-", "underline-offset-", "indent-", "line-clamp-", "list-image-",
    // "content-" is a NEW prefix that collides with the EXISTING
    // "content-start"/"content-center"/etc (align-content) standalone
    // literals below it in `layout.rs` — both now arrive as utility=
    // "content" + a value, disambiguated by that value in `layout::resolve`
    // (align-content keyword first) falling through to `typography::resolve`
    // (the `content-[...]`/`content-none` pseudo-element property) for
    // anything the align-content table doesn't recognize.
    "content-",
    // Backgrounds & gradients (web-only — see resolvers::background's module
    // doc). No "bg-" sub-prefixes needed here: "bg-top"/"bg-linear-to-r"/
    // etc. all fall out of the existing catchall "bg-" prefix above, with
    // resolvers::background handling anything color.rs's "bg" arm doesn't
    // recognize as a theme color. "from-"/"via-"/"to-" are new standalone
    // prefixes for gradient color stops — no ordering conflict with any
    // entry above ("to-" doesn't collide with "top-"/"text-": neither
    // shares "to-" as a literal 3-char prefix).
    "from-", "via-", "to-",
    // Layout completeness: object-fit/position (one ambiguous "object-"
    // prefix, same "bg-" shape), overscroll (axis before base), columns,
    // break-after/before/inside (genuinely separate prefixes from the
    // existing standalone "break-normal"/"break-words"/"break-all" word-break
    // literals — those never go through VALUE_PREFIXES matching at all, so
    // there's no collision either way), aspect ratio, container's own
    // typography-scale-shaped named breakpoints aren't a thing (bare
    // "container" is a standalone literal).
    "object-", "overscroll-x-", "overscroll-y-", "overscroll-", "overflow-x-", "overflow-y-",
    "columns-", "break-after-", "break-before-", "break-inside-", "aspect-",
    // Effects completeness: mask (resolvers::mask, web-only — no gradient
    // sub-system, see that module's own doc comment for scope). "mask-
    // position-"/"mask-size-" (arbitrary-only, same "bg-position-"/
    // "bg-size-" shape/reasoning as the Backgrounds group above) before the
    // bare "mask-" catchall — every other mask-* utility (clip/composite/
    // mode/origin/repeat/size-keywords/position-keywords/type/none/
    // arbitrary mask-image) dispatches by VALUE under that one bare prefix,
    // the same "bg-"-catchall shape color.rs/background.rs already use.
    "mask-position-", "mask-size-", "mask-",
    // Interactivity completeness: zoom, scrollbar-thumb-/scrollbar-track-
    // (full theme-color lookups, same shape as caret-/accent- in color.rs).
    "zoom-", "scrollbar-thumb-", "scrollbar-track-",
];

/// Sentinel utility name for Phase 25's arbitrary properties
/// (`[mask-type:luminance]`) — a bracket-only token with NO utility-name
/// prefix at all, meaning "emit this raw `property: value` pair verbatim,"
/// bypassing every resolver's own utility-name dispatch entirely. No real
/// utility name can ever collide with this: every other utility name comes
/// from either a `VALUE_PREFIXES` entry (stripped of its trailing "-", so
/// never containing a literal bracket) or a standalone literal like
/// `"items-center"` (also never bracket-shaped).
pub(crate) const ARBITRARY_PROPERTY_SENTINEL: &str = "[arbitrary-property]";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedClass {
    /// Modifier chain in source order, e.g. ["dark", "hover"] for "dark:hover:bg-blue-6".
    pub modifiers: Vec<String>,
    /// Base utility name, e.g. "bg", "p", "flex", "items-center".
    pub utility: String,
    /// Value after the utility's "-", e.g. "blue-6", "4", or a raw arbitrary
    /// value with its brackets stripped. None for standalone utilities.
    pub value: Option<String>,
    /// True if `value` came from bracket syntax (`bg-[#6366f1]`) rather than
    /// a named theme-scale lookup.
    pub is_arbitrary: bool,
    /// True if the token had a leading "!" (after its modifier chain, e.g.
    /// "hover:!bg-blue-6") — forces `!important` on the declaration.
    pub important: bool,
    /// True if the token had a leading "-" (after its modifier chain and
    /// any "!", e.g. "-mt-4" or "hover:-mt-4") — real Tailwind's own
    /// negative-value convention. Only meaningful to the specific
    /// resolvers that opt into it (margin, inset, translate-x/y, z-index,
    /// order — see `resolvers::resolve_negatable_length`); every other
    /// resolver ignores this field entirely, the same way they already
    /// ignore `important` and just let `css.rs`/`resolve_style.rs` apply it.
    pub negative: bool,
    /// The full original token text, unmodified — needed to reconstruct the
    /// exact CSS class selector (which must match the DOM's className verbatim).
    pub original: String,
}

/// Rejects arbitrary values that could smuggle extra CSS declarations or
/// selectors past the generated stylesheet — a value containing `{`, `}`,
/// or `;` could otherwise close the declaration/rule the resolver is
/// building and inject arbitrary CSS. Named theme-scale lookups (spacing,
/// colors) never go through this path, so they're unaffected. `pub(crate)`
/// (not private) — `registry.rs`'s Phase 24 parameterized modifiers
/// (`has-[...]`/`data-[...]`/`aria-[...]`/`not-[...]`/`min-[...]`/
/// `max-[...]`) interpolate their own bracket content directly into a
/// generated CSS selector fragment, the exact same injection surface an
/// arbitrary utility value has, so they reuse this same check rather than
/// duplicating (or worse, skipping) it.
pub(crate) fn is_safe_arbitrary_value(value: &str) -> bool {
    !value.contains('{') && !value.contains('}') && !value.contains(';')
}

/// Rewrites a `calc()`/`min()`/`max()`/`clamp()` arbitrary value so it's
/// valid CSS regardless of how loosely the author wrote its `+`/`-`
/// operators. Real CSS requires whitespace on both sides of a BINARY `+`/
/// `-` (`calc(100% - 10px)`) — without it, `calc(100%-10px)` is genuinely
/// invalid and a real browser drops the whole `calc()` — but a UNARY sign
/// (`calc(-10px + 5%)`, the leading `-`) must stay glued to its number, or
/// inserting a space would silently change what it means. This tells the
/// two apart the same way a real CSS tokenizer does: a `+`/`-` is binary
/// exactly when it immediately follows something that can END a value
/// (a digit, a unit, `%`, or a closing paren) — anything else (the very
/// start, right after `(`/`,`, or right after another operator) makes it
/// unary. `*`/`/` never need surrounding whitespace in real CSS either
/// way, so they're left exactly as written.
///
/// `var(...)` calls are copied through completely untouched (opaque,
/// balanced-paren scan) rather than tokenized as arithmetic — a custom
/// property NAME can itself contain a literal `-` (`var(--sidebar-width)`),
/// which this function must never mistake for a binary operator and space
/// out into `--sidebar - width`, corrupting the identifier. A `calc(...)`
/// nested inside a `var(...)` fallback (`var(--x, calc(1px+2px))`) is the
/// one thing this deliberately does NOT reach into and normalize — a rare
/// enough shape that the existing underscore convention remains the way to
/// write it, same as before this function existed at all.
///
/// A no-op (returns `raw` unchanged, no tokenizing at all) for anything
/// that doesn't start with one of the four function names this applies to
/// — the overwhelmingly common case (a plain arbitrary color, length,
/// keyword, ...) never pays for a scan it doesn't need.
///
/// Scientific notation (`1e-5px`) is a known, deliberately unhandled edge
/// case — the `-` right after `e` would be (wrongly) read as binary and
/// split the exponent apart. Nobody has ever written a Tailwind-family
/// arbitrary value this way in practice, so this stays a documented gap
/// rather than added complexity for it.
fn normalize_math_whitespace(raw: &str) -> String {
    if !(raw.starts_with("calc(") || raw.starts_with("min(") || raw.starts_with("max(") || raw.starts_with("clamp(")) {
        return raw.to_string();
    }

    let chars: Vec<char> = raw.chars().collect();
    let mut out = String::with_capacity(raw.len() + 8);
    let mut i = 0;
    // Whether the character just emitted could END a value — true right
    // after a digit/unit/`%`/`)`, meaning a following `+`/`-` is binary;
    // false at the start, or right after `(`/`,`/another operator, meaning
    // it's unary and stays glued to what follows.
    let mut prev_ends_value = false;

    while i < chars.len() {
        let c = chars[i];

        // `var(` — copy through verbatim up to its matching `)`, untouched,
        // rather than reading its contents as arithmetic at all.
        if c == 'v' && chars[i..].starts_with(&['v', 'a', 'r', '(']) {
            let start = i;
            let mut depth = 0i32;
            while i < chars.len() {
                if chars[i] == '(' {
                    depth += 1;
                } else if chars[i] == ')' {
                    depth -= 1;
                    if depth == 0 {
                        i += 1;
                        break;
                    }
                }
                i += 1;
            }
            out.extend(&chars[start..i]);
            prev_ends_value = true;
            continue;
        }

        match c {
            '+' | '-' => {
                if prev_ends_value {
                    out.push(' ');
                    out.push(c);
                    out.push(' ');
                    i += 1;
                    // Don't double up if the author already wrote spacing
                    // (or underscores, already converted to spaces above).
                    while i < chars.len() && chars[i].is_whitespace() {
                        i += 1;
                    }
                    prev_ends_value = false;
                    continue;
                }
                out.push(c); // unary — glued to the number that follows
                prev_ends_value = false;
            }
            '(' | ',' => {
                out.push(c);
                if c == ',' {
                    out.push(' ');
                }
                prev_ends_value = false;
            }
            ')' => {
                out.push(c);
                prev_ends_value = true;
            }
            _ if c.is_whitespace() => {
                // Dropped — the '+'/'-' arm above is solely responsible for
                // the whitespace THIS function emits; any other whitespace
                // (around `*`/`/`, inside a bare number) means nothing to
                // CSS either way.
            }
            '*' | '/' => {
                out.push(c);
                prev_ends_value = false; // `2*-3`/`2/-3` — the sign stays unary
            }
            _ => {
                // A digit, unit letter, or '%' — anything else that can end a value.
                out.push(c);
                prev_ends_value = true;
            }
        }
        i += 1;
    }
    out
}

/// Splits `token` on ':' the same way `str::split(':')` would, EXCEPT a ':'
/// nested inside a `[...]` bracket never counts as a modifier separator.
/// Needed for Phase 24's parameterized modifiers, whose bracket content can
/// itself be a raw CSS selector containing a colon (`has-[a:hover]`,
/// `group-has-[[data-state=active]]`) — a naive split would wrongly chop
/// that selector in half. Every existing (non-bracket) token still splits
/// byte-for-byte identically to the old naive `token.split(':')`, so this
/// changes nothing for any class this engine already resolved correctly.
fn split_respecting_brackets(token: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth: i32 = 0;
    let mut start = 0usize;
    for (i, ch) in token.char_indices() {
        match ch {
            '[' => depth += 1,
            ']' => depth -= 1,
            ':' if depth <= 0 => {
                parts.push(&token[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&token[start..]);
    parts
}

pub fn parse_class(token: &str) -> ParsedClass {
    let mut parts: Vec<&str> = split_respecting_brackets(token);
    let mut base = parts.pop().unwrap_or(token);
    let modifiers = parts.into_iter().map(String::from).collect();

    let important = base.starts_with('!');
    if important {
        base = &base[1..];
    }

    // Real Tailwind's negative-value convention ("-mt-4", "-inset-2") — a
    // leading "-" on the utility itself, after any "!important" prefix but
    // before the utility-name matching below. No existing utility name or
    // VALUE_PREFIXES entry starts with "-", so stripping it unconditionally
    // here is safe (never shadows a real prefix) — resolvers that don't
    // understand negation (the vast majority) simply ignore the resulting
    // `negative` field, the same way most already ignore `important`.
    let negative = base.starts_with('-');
    if negative {
        base = &base[1..];
    }

    // Arbitrary properties (Phase 25) — a bracket-only token with no
    // preceding utility-name prefix at all (`[mask-type:luminance]`), which
    // is exactly why this check has to run BEFORE the `VALUE_PREFIXES` loop
    // below: no prefix entry could ever match a bracket that starts at
    // position 0, so this path is never in competition with (or shadowed
    // by) any registered prefix.
    if base.len() >= 2 && base.starts_with('[') && base.ends_with(']') {
        let raw = &base[1..base.len() - 1];
        if let Some((property, value)) = raw.split_once(':') {
            if !property.is_empty() && !value.is_empty() && is_safe_arbitrary_value(raw) {
                let value = normalize_math_whitespace(&value.replace('_', " "));
                return ParsedClass {
                    modifiers,
                    utility: ARBITRARY_PROPERTY_SENTINEL.to_string(),
                    value: Some(format!("{property}:{value}")),
                    is_arbitrary: true,
                    important,
                    negative,
                    original: token.to_string(),
                };
            }
        }
    }

    for prefix in VALUE_PREFIXES {
        let Some(value) = base.strip_prefix(prefix) else { continue };
        if value.is_empty() {
            continue;
        }

        if value.len() >= 2 && value.starts_with('[') && value.ends_with(']') {
            let raw = &value[1..value.len() - 1];
            if !is_safe_arbitrary_value(raw) {
                // Unsafe arbitrary value — treat as unresolvable, same as an
                // unknown class, rather than passing it through to CSS output.
                continue;
            }
            // Underscore -> space, the standard Tailwind-family convention for
            // multi-part arbitrary values (`shadow-[0_4px_6px_rgba(0,0,0,.5)]`,
            // `grid-cols-[1fr_2fr]`) — a literal space inside a class token
            // would otherwise be un-writable at all, since `split_whitespace`
            // (see `resolve_style`/`generate_css`'s token loop) would split it
            // into two separate, meaningless tokens before parsing ever sees
            // it. No escape sequence for a literal underscore (`\_`) — nobody
            // has needed one yet, and Tailwind's own is a rarely-used escape
            // hatch for a rarely-used case.
            let raw = raw.replace('_', " ");
            // THEN normalize calc()/min()/max()/clamp() operator spacing —
            // real CSS requires whitespace around a BINARY +/- (to
            // disambiguate from a unit's sign or exponent), which is
            // exactly what the underscore convention above works around by
            // making that whitespace mandatory to type. This makes it
            // optional instead: `calc(100%-10px)`, `calc(100% - 10px)`, and
            // `calc(100%_-_10px)` all normalize to the same valid CSS text.
            // See `normalize_math_whitespace`'s own doc comment for the
            // full reasoning (unary-vs-binary disambiguation, `var(...)`
            // handled as opaque, etc).
            let raw = normalize_math_whitespace(&raw);
            return ParsedClass {
                modifiers,
                utility: prefix[..prefix.len() - 1].to_string(),
                value: Some(raw),
                is_arbitrary: true,
                important,
                negative,
                original: token.to_string(),
            };
        }

        return ParsedClass {
            modifiers,
            utility: prefix[..prefix.len() - 1].to_string(),
            value: Some(value.to_string()),
            is_arbitrary: false,
            important,
            negative,
            original: token.to_string(),
        };
    }

    ParsedClass {
        modifiers,
        utility: base.to_string(),
        value: None,
        is_arbitrary: false,
        important,
        negative,
        original: token.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_value_bearing_utility() {
        let p = parse_class("bg-blue-6");
        assert_eq!(p.utility, "bg");
        assert_eq!(p.value.as_deref(), Some("blue-6"));
        assert!(p.modifiers.is_empty());
        assert!(!p.is_arbitrary);
        assert!(!p.important);
        assert_eq!(p.original, "bg-blue-6");
    }

    #[test]
    fn parses_a_dark_modifier() {
        let p = parse_class("dark:bg-blue-6");
        assert_eq!(p.modifiers, vec!["dark".to_string()]);
        assert_eq!(p.utility, "bg");
        assert_eq!(p.value.as_deref(), Some("blue-6"));
    }

    #[test]
    fn parses_a_chained_modifier() {
        let p = parse_class("dark:hover:bg-blue-6");
        assert_eq!(p.modifiers, vec!["dark".to_string(), "hover".to_string()]);
        assert_eq!(p.utility, "bg");
    }

    #[test]
    fn parses_a_standalone_utility_with_no_value() {
        let p = parse_class("flex");
        assert_eq!(p.utility, "flex");
        assert_eq!(p.value, None);
    }

    #[test]
    fn does_not_split_a_standalone_multi_word_utility() {
        let p = parse_class("items-center");
        assert_eq!(p.utility, "items-center");
        assert_eq!(p.value, None);
    }

    #[test]
    fn disambiguates_gap_x_from_gap() {
        let p = parse_class("gap-x-4");
        assert_eq!(p.utility, "gap-x");
        assert_eq!(p.value.as_deref(), Some("4"));

        let plain = parse_class("gap-4");
        assert_eq!(plain.utility, "gap");
        assert_eq!(plain.value.as_deref(), Some("4"));
    }

    #[test]
    fn parses_a_leading_negative_sign() {
        let p = parse_class("-mt-4");
        assert_eq!(p.utility, "mt");
        assert_eq!(p.value.as_deref(), Some("4"));
        assert!(p.negative);
        assert!(!p.is_arbitrary);
        // The selector-facing original text keeps the "-" — must match the
        // literal className verbatim.
        assert_eq!(p.original, "-mt-4");
    }

    #[test]
    fn parses_a_negative_sign_after_modifiers_and_important() {
        let p = parse_class("hover:-mt-4");
        assert_eq!(p.modifiers, vec!["hover".to_string()]);
        assert_eq!(p.utility, "mt");
        assert!(p.negative);

        let important = parse_class("!-mt-4");
        assert_eq!(important.utility, "mt");
        assert!(important.negative);
        assert!(important.important);
    }

    #[test]
    fn a_class_with_no_leading_dash_is_not_negative() {
        let p = parse_class("mt-4");
        assert!(!p.negative);
    }

    #[test]
    fn disambiguates_col_span_start_end_from_bare_col() {
        let span = parse_class("col-span-2");
        assert_eq!(span.utility, "col-span");
        assert_eq!(span.value.as_deref(), Some("2"));

        let start = parse_class("col-start-3");
        assert_eq!(start.utility, "col-start");

        let plain = parse_class("col-auto");
        assert_eq!(plain.utility, "col");
        assert_eq!(plain.value.as_deref(), Some("auto"));
    }

    #[test]
    fn disambiguates_bg_opacity_from_bg() {
        let p = parse_class("bg-opacity-50");
        assert_eq!(p.utility, "bg-opacity");
        assert_eq!(p.value.as_deref(), Some("50"));

        let plain = parse_class("bg-blue-6");
        assert_eq!(plain.utility, "bg");
    }

    #[test]
    fn disambiguates_min_w_from_w() {
        let p = parse_class("min-w-4");
        assert_eq!(p.utility, "min-w");
        let plain = parse_class("w-4");
        assert_eq!(plain.utility, "w");
    }

    #[test]
    fn parses_a_safe_arbitrary_value() {
        let p = parse_class("bg-[#6366f1]");
        assert_eq!(p.utility, "bg");
        assert_eq!(p.value.as_deref(), Some("#6366f1"));
        assert!(p.is_arbitrary);
    }

    #[test]
    fn converts_underscores_to_spaces_in_multi_part_arbitrary_values() {
        let p = parse_class("shadow-[0_4px_6px_red]");
        assert_eq!(p.utility, "shadow");
        assert_eq!(p.value.as_deref(), Some("0 4px 6px red"));
        assert!(p.is_arbitrary);
        // The selector-facing original text is untouched — underscores stay
        // literal there, matching what's actually in the className attribute.
        assert_eq!(p.original, "shadow-[0_4px_6px_red]");
    }

    #[test]
    fn rejects_an_unsafe_arbitrary_value_containing_a_brace() {
        let p = parse_class("bg-[{evil:1}]");
        // Falls through to an unresolvable standalone utility — the full
        // original text, not a usable utility/value pair.
        assert_eq!(p.value, None);
        assert!(!p.is_arbitrary);
    }

    #[test]
    fn rejects_an_unsafe_arbitrary_value_containing_a_semicolon() {
        let p = parse_class("p-[1px;evil:1]");
        assert_eq!(p.value, None);
    }

    #[test]
    fn parses_an_important_prefix_after_modifiers() {
        let p = parse_class("hover:!bg-blue-6");
        assert_eq!(p.modifiers, vec!["hover".to_string()]);
        assert_eq!(p.utility, "bg");
        assert_eq!(p.value.as_deref(), Some("blue-6"));
        assert!(p.important);
        // Original text is preserved verbatim (including "!") for selector reconstruction.
        assert_eq!(p.original, "hover:!bg-blue-6");
    }

    #[test]
    fn parses_an_important_prefix_on_a_standalone_utility() {
        let p = parse_class("!flex");
        assert_eq!(p.utility, "flex");
        assert!(p.important);
    }

    #[test]
    fn does_not_split_a_colon_nested_inside_a_modifier_bracket() {
        // Regression: Phase 24's parameterized modifiers (has-[...], etc.)
        // can carry a raw CSS selector as their bracket content, which may
        // itself contain a colon (e.g. "has-[a:hover]") — a naive
        // `token.split(':')` would wrongly chop that selector in half.
        let p = parse_class("has-[a:hover]:bg-red-6");
        assert_eq!(p.modifiers, vec!["has-[a:hover]".to_string()]);
        assert_eq!(p.utility, "bg");
        assert_eq!(p.value.as_deref(), Some("red-6"));
    }

    #[test]
    fn still_splits_normally_when_multiple_real_modifiers_are_chained_with_a_bracket_modifier() {
        let p = parse_class("dark:has-[a:hover]:hover:bg-red-6");
        assert_eq!(
            p.modifiers,
            vec!["dark".to_string(), "has-[a:hover]".to_string(), "hover".to_string()],
        );
        assert_eq!(p.utility, "bg");
        assert_eq!(p.value.as_deref(), Some("red-6"));
    }

    #[test]
    fn parses_a_data_attribute_modifier_with_an_equals_sign() {
        let p = parse_class("data-[state=open]:block");
        assert_eq!(p.modifiers, vec!["data-[state=open]".to_string()]);
        assert_eq!(p.utility, "block");
    }

    #[test]
    fn parses_an_arbitrary_property() {
        let p = parse_class("[mask-type:luminance]");
        assert_eq!(p.utility, ARBITRARY_PROPERTY_SENTINEL);
        assert_eq!(p.value.as_deref(), Some("mask-type:luminance"));
        assert!(p.is_arbitrary);
        assert!(p.modifiers.is_empty());
    }

    #[test]
    fn parses_an_arbitrary_property_with_a_modifier_and_underscore_spaces() {
        let p = parse_class("hover:[mask:linear-gradient(to_right,red,blue)]");
        assert_eq!(p.modifiers, vec!["hover".to_string()]);
        assert_eq!(p.utility, ARBITRARY_PROPERTY_SENTINEL);
        assert_eq!(p.value.as_deref(), Some("mask:linear-gradient(to right,red,blue)"));
    }

    #[test]
    fn normalizes_math_whitespace_in_an_arbitrary_property_value_too() {
        let p = parse_class("[margin-top:calc(100%-10px)]");
        assert_eq!(p.value.as_deref(), Some("margin-top:calc(100% - 10px)"));
    }

    #[test]
    fn rejects_an_arbitrary_property_with_no_colon_or_an_empty_side() {
        // No colon at all — not a property:value pair, unresolvable.
        let no_colon = parse_class("[luminance]");
        assert_ne!(no_colon.utility, ARBITRARY_PROPERTY_SENTINEL);
        // Empty property or value on either side of the colon.
        let empty_prop = parse_class("[:luminance]");
        assert_ne!(empty_prop.utility, ARBITRARY_PROPERTY_SENTINEL);
        let empty_value = parse_class("[mask-type:]");
        assert_ne!(empty_value.utility, ARBITRARY_PROPERTY_SENTINEL);
    }

    #[test]
    fn rejects_an_unsafe_arbitrary_property_value() {
        let p = parse_class("[mask-type:luminance;evil:1]");
        assert_ne!(p.utility, ARBITRARY_PROPERTY_SENTINEL);
    }

    #[test]
    fn normalizes_a_binary_minus_with_no_surrounding_whitespace() {
        assert_eq!(normalize_math_whitespace("calc(100%-10px)"), "calc(100% - 10px)");
        assert_eq!(normalize_math_whitespace("calc(100%+10px)"), "calc(100% + 10px)");
    }

    #[test]
    fn leaves_already_correctly_spaced_math_unchanged() {
        assert_eq!(normalize_math_whitespace("calc(100% - 10px)"), "calc(100% - 10px)");
    }

    #[test]
    fn does_not_touch_multiplication_or_division_which_never_need_spacing() {
        assert_eq!(normalize_math_whitespace("calc(100%/2)"), "calc(100%/2)");
        assert_eq!(normalize_math_whitespace("calc(100%*2)"), "calc(100%*2)");
    }

    #[test]
    fn preserves_a_leading_unary_minus_instead_of_spacing_it_out() {
        assert_eq!(normalize_math_whitespace("calc(-10px+5%)"), "calc(-10px + 5%)");
    }

    #[test]
    fn preserves_a_unary_sign_right_after_an_open_paren_or_comma() {
        assert_eq!(normalize_math_whitespace("calc((-10px+5%)*2)"), "calc((-10px + 5%)*2)");
        assert_eq!(normalize_math_whitespace("min(-10px,5px)"), "min(-10px, 5px)");
    }

    #[test]
    fn treats_a_sign_right_after_a_closing_paren_as_binary() {
        assert_eq!(normalize_math_whitespace("calc((100%/2)-10px)"), "calc((100%/2) - 10px)");
    }

    #[test]
    fn treats_a_sign_right_after_multiply_or_divide_as_unary() {
        // "2*-3" means "2 * (-3)" — the sign is NOT a second binary operator.
        assert_eq!(normalize_math_whitespace("calc(10px*-2)"), "calc(10px*-2)");
        assert_eq!(normalize_math_whitespace("calc(10px/-2)"), "calc(10px/-2)");
    }

    #[test]
    fn handles_nested_parens_and_multiple_operators() {
        assert_eq!(
            normalize_math_whitespace("calc((100%/2)-10px+1rem)"),
            "calc((100%/2) - 10px + 1rem)",
        );
    }

    #[test]
    fn copies_var_calls_through_untouched_including_an_internal_hyphen() {
        // The literal "-" inside "--sidebar-width" must NEVER be read as a
        // binary operator and spaced out — that would corrupt the custom
        // property name into invalid CSS.
        assert_eq!(
            normalize_math_whitespace("calc(var(--sidebar-width)-1rem)"),
            "calc(var(--sidebar-width) - 1rem)",
        );
    }

    #[test]
    fn is_a_no_op_for_a_non_math_arbitrary_value() {
        assert_eq!(normalize_math_whitespace("#6366f1"), "#6366f1");
        assert_eq!(normalize_math_whitespace("1fr_2fr"), "1fr_2fr"); // underscore already converted upstream in real use; irrelevant here
    }

    #[test]
    fn end_to_end_via_parse_class_min_max_and_clamp_all_normalize_too() {
        assert_eq!(parse_class("w-[calc(100%-10px)]").value.as_deref(), Some("calc(100% - 10px)"));
        assert_eq!(parse_class("w-[min(100%-10px,20rem)]").value.as_deref(), Some("min(100% - 10px, 20rem)"));
        assert_eq!(parse_class("w-[max(100%-10px,20rem)]").value.as_deref(), Some("max(100% - 10px, 20rem)"));
        assert_eq!(
            parse_class("w-[clamp(10px,100%-10px,20rem)]").value.as_deref(),
            Some("clamp(10px, 100% - 10px, 20rem)"),
        );
    }

    #[test]
    fn end_to_end_the_underscore_convention_still_works_unchanged() {
        // Underscore->space runs BEFORE normalize_math_whitespace, so
        // "100%_-_10px" is already "100% - 10px" by the time it gets there
        // — same output as writing the space (or nothing at all) directly.
        assert_eq!(parse_class("w-[calc(100%_-_10px)]").value.as_deref(), Some("calc(100% - 10px)"));
    }
}
