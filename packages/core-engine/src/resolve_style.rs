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
//!
//! All three compose: `dark:sm:bg-blue-8` applies only when BOTH hold.
//!
//! Every other modifier (`hover:`, `group-*`, `has-[...]`, container
//! queries, ...) parses without error but isn't applied on native — no
//! selector/pseudo-state/ancestor system exists here to apply them with.
//! Explicitly deferred, not silently broken.
//!
//! Same-property collisions resolve on a small specificity model that
//! stands in for the CSS cascade native doesn't have (see
//! `token_specificity`): a token with MORE satisfied modifiers wins over
//! one with fewer, regardless of which is written first, so
//! `"bg-blue-6 dark:bg-blue-8"` and `"dark:bg-blue-8 bg-blue-6"` BOTH
//! resolve to blue-8 in dark mode. Two equally-specific tokens
//! (`"bg-blue-6 bg-blue-8"`, or two `dark:` classes) still fall back to
//! last-token-wins by source order. `transform-none` is the one deliberate
//! exception — a reset directive that clears everything above it in source
//! order regardless of specificity.
//!
//! Named leading/tracking keywords and truncation are excluded at the
//! resolver level (see resolve_utility_native's docs) — everything that
//! reaches this module is expected to be RN-representable, modulo the
//! value typing below.

use crate::calc::reduce_constant_math;
use crate::parser::{parse_class, ParsedClass};
use crate::registry::{self, DarkScheme};
use crate::resolvers::{resolve_utility, resolve_utility_native, substitute_mode_aware_color_token};
use crate::theme::ThemeConfig;
use serde_json::{Map, Number, Value};
use std::collections::HashMap;

/// Synthetic modifier `jsxRuntimeCore.ts` substitutes in for each
/// prop-based state modifier (`hover:`/`focus:`/`disabled:`/`aria-*`/
/// `data-*`) that currently HOLDS, one per satisfied modifier — so those
/// still contribute to a token's specificity here (see
/// `token_specificity`), the same way `dark:`/`sm:`/`active:` already do,
/// even though this engine resolves them a completely different way (a
/// live React prop read, before the class string ever reaches this
/// function). `native_modifier_state` treats it as unconditionally
/// satisfied — `jsxRuntimeCore.ts` only ever emits it for a state it has
/// already confirmed holds, and drops the whole token otherwise.
pub const STATE_HOLD_MARKER: &str = "_kbon";

/// Bare classes with no styling meaning of their own — they exist purely as
/// selector-target markers (`group-hover:` matches `.group:hover .child`,
/// `peer-hover:` matches `.peer:hover ~ .sibling`), so no resolver anywhere
/// (web or native) ever produces a declaration for the literal `group`/
/// `peer` token itself. Mirrors @kbach/react's own `unknownClassWarnings.ts`
/// `MARKER_CLASSES` allowlist exactly — same reason: "resolves to zero
/// declarations" is indistinguishable from "not a real utility" by return
/// shape alone, so these two need a manual exception.
const MARKER_UTILITIES: &[&str] = &["group", "peer"];

/// Whether `utility` is a (possibly NAMED) marker — `"group"`/`"peer"`
/// exactly, or `"group/sidebar"`/`"peer/field"` (real Tailwind's named-
/// group/peer syntax — see `registry.rs`'s own doc comment on
/// `split_named_group_suffix` for the modifier half of this feature).
/// `rsplit_once('/')` (not `split_once`) so a name containing its own `/`
/// — vanishingly unlikely, but free to get right — still only strips the
/// LAST one.
fn is_marker_utility(utility: &str) -> bool {
    if MARKER_UTILITIES.contains(&utility) {
        return true;
    }
    match utility.rsplit_once('/') {
        Some((base, name)) => MARKER_UTILITIES.contains(&base) && !name.is_empty(),
        None => false,
    }
}

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
    is_marker_utility(&parsed.utility) || resolve_utility(parsed, theme).is_some()
}

/// The one typo-warning message, shared by both call sites below (an
/// inactive-modifier miss and a native-unresolvable miss) rather than two
/// copies of the same format! drifting independently. Rust/JNI-only —
/// deliberately NOT ported to the jsEngine (Expo Go fallback), which has no
/// equivalent warning at all yet (see resolveStyle.ts's own doc comment for
/// why: it would need the full web dispatcher as its "is this a typo"
/// ground truth, which this jsEngine directory doesn't have a port of).
fn typo_warning(token: &str) -> String {
    // Strip any `_kbon:` markers `jsxRuntimeCore.ts` substituted in for a
    // satisfied `hover:`/`focus:`/... so the message names the class the
    // developer actually wrote (`hover:flexx`, not `_kbon:flexx`).
    let display: String = token
        .split(':')
        .filter(|seg| *seg != STATE_HOLD_MARKER)
        .collect::<Vec<_>>()
        .join(":");
    format!("[Kbach] \"{display}\" doesn't match any known Kbach utility — typo? (skipped)")
}

/// Whether a single modifier's condition currently holds, for the modifier
/// kinds native actually understands — `None` for anything else (hover/
/// group/peer/aria/container/starting/...), which `resolve_style` below
/// treats identically to "doesn't hold" (the whole chain is skipped), same
/// as before this function existed. Reads from the shared
/// `registry::resolve` table rather than re-deriving "is this dark/active/
/// responsive" locally, so a new responsive breakpoint or a future change
/// to what counts as "the active pseudo" never needs updating in two
/// places — see registry.rs's own module doc for the tier scheme this
/// reads from.
fn native_modifier_state(modifier: &str, theme: &ThemeConfig, color_scheme: &str, pressed: bool, width: f64) -> Option<bool> {
    // `jsxRuntimeCore.ts`'s stand-in for an already-satisfied prop-based
    // state modifier — see `STATE_HOLD_MARKER`'s own doc comment.
    if modifier == STATE_HOLD_MARKER {
        return Some(true);
    }
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
    // Arbitrary `min-[500px]:`/`max-[30rem]:` — the exact same width
    // comparison the named sm/md/lg/xl/2xl tier above already does, just
    // against a value parsed out of the modifier's own `media_query` text
    // instead of looked up from `theme.screens` by name. `media_query` is
    // always exactly `"(min-width: <value>)"`/`"(max-width: <value>)"` for
    // these two (see registry.rs's own `bracket_content(name, "min-"/"max-")`
    // arms) — reuses `calc::reduce_constant_math` (wrapped in a trivial
    // `calc(...)` — that function only ever recognizes an actual calc/min/
    // max/clamp call, not a bare value on its own) for the same px/rem
    // parsing every OTHER arbitrary length already goes through, rather
    // than writing a second unit parser. A percentage/viewport-unit/other
    // breakpoint value stays unreducible here (`None`) for the same reason
    // it's unreducible everywhere else on native: there's no live layout to
    // resolve it against at the point a modifier's state is decided.
    if let Some(mq) = &def.media_query {
        let (is_min, value) = if let Some(v) = mq.strip_prefix("(min-width:") {
            (true, v.strip_suffix(')')?)
        } else {
            (false, mq.strip_prefix("(max-width:")?.strip_suffix(')')?)
        };
        let px = crate::calc::reduce_constant_math(&format!("calc({})", value.trim()))?;
        return Some(if is_min { width >= px } else { width <= px });
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
    "shadow-opacity", "shadow-radius", "elevation", "opacity",
    // Per-side border width + per-corner radius — added alongside
    // border.rs's per-side/per-corner resolvers; RN's style system wants
    // plain numbers for these exactly like the generic "border-width"/
    // "border-radius" forms above, not "2px"/"0.5rem" strings.
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
    "outline-width", "outline-offset",
    // The transform ops whose RN value is a plain JS number — translate
    // takes a length (px/percentage, same as `top`/`left`/etc. above) and
    // scale takes a bare decimal factor (parsed by the same "raw value"
    // fallback branch below). `transform-op-rotate*`/`transform-op-skew*`
    // stay OUT of this list on purpose, since RN wants those as literal
    // `"45deg"`-shaped strings, not numbers. See `resolve_style_with_warnings`'s
    // own transform-accumulator comment for how these markers get collected
    // into the final array.
    "transform-op-translate-x", "transform-op-translate-y",
    "transform-op-scale-x", "transform-op-scale-y",
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
    // `aspect-ratio` is a CSS ratio (`3 / 4`, `16/9`, `1.5`) on the web
    // side, but RN's New-Architecture prop parser only reliably accepts a
    // plain NUMBER for `aspectRatio` — a ratio STRING silently fails to
    // apply on Fabric, collapsing the element. Reduce it to `a / b` here.
    // `auto` has no numeric form and means "no constraint" anyway, so it's
    // simply dropped (leaving `aspectRatio` unset).
    if property == "aspect-ratio" {
        if value.trim() == "auto" {
            return (None, None);
        }
        let n = match value.split('/').map(str::trim).collect::<Vec<_>>().as_slice() {
            [a] => a.parse::<f64>().ok(),
            [a, b] => match (a.parse::<f64>(), b.parse::<f64>()) {
                (Ok(a), Ok(b)) if b != 0.0 => Some(a / b),
                _ => None,
            },
            _ => None,
        };
        return (n.and_then(Number::from_f64).map(Value::Number), None);
    }

    if !NUMERIC_LENGTH_PROPS.contains(&property) {
        return (Some(Value::String(value.to_string())), None);
    }

    // `auto` is a real RN/Yoga value for the dimensional properties this
    // resolver produces it for — `margin*` (auto margins, i.e. `mx-auto`),
    // `width`/`height`, `inset`/`top`/etc., `flex-basis`. Pass it straight
    // through; RN harmlessly ignores it on a property that doesn't take it.
    // Checked BEFORE the numeric coercion below, which would otherwise fail
    // to parse it and drop the declaration with a (wrong) "not a valid
    // native value" warning.
    if value == "auto" {
        return (Some(Value::String("auto".to_string())), None);
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

    // One short line per fact (headline, reason, fix) rather than a single
    // run-on paragraph — plain text, no ANSI/terminal color codes (this
    // reaches RN's on-device LogBox via nativeBridge.ts's `warnIfDev`,
    // which renders raw text only). Mirror any wording change here in
    // jsEngine/resolveStyle.ts's identical TS warning (the Expo Go
    // fallback path's own copy of this exact message).
    let warning = format!(
        "[Kbach] \"{value}\" isn't a valid native value for \"{property}\" — dropped.\n\
         calc()/min()/max()/clamp() only resolve on native when every operand is a constant px/rem length \
         (no %, vw, vh, var(), or other viewport/CSS-variable units — those need real layout/DOM, which \
         doesn't exist on native at paint time).\n\
         Fix: use a plain px/rem calc, a fraction utility (e.g. w-1/2), or resolve this value in JS instead."
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
    let theme = match crate::theme::parse_theme_cached(theme_json) {
        Some(t) => t,
        None => return "{}".to_string(),
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
/// Marker property name (`transform::native_resolve`'s output) -> the RN
/// transform-op key it accumulates into. Order here is irrelevant (lookup
/// only); `TRANSFORM_OP_ORDER` below is what fixes the final array's shape.
const TRANSFORM_OP_KEYS: &[(&str, &str)] = &[
    ("transform-op-translate-x", "translateX"),
    ("transform-op-translate-y", "translateY"),
    ("transform-op-rotate", "rotate"),
    ("transform-op-rotate-x", "rotateX"),
    ("transform-op-rotate-y", "rotateY"),
    ("transform-op-rotate-z", "rotateZ"),
    ("transform-op-skew-x", "skewX"),
    ("transform-op-skew-y", "skewY"),
    ("transform-op-scale-x", "scaleX"),
    ("transform-op-scale-y", "scaleY"),
];

/// Fixed emission order for the assembled `transform` array — independent
/// of the order the source classes were written in (only WHICH ops are
/// present, and their latest value, depends on that; see the accumulator
/// loop below), same "one canonical function order regardless of class
/// order" property `TRANSFORM_COMPOSE_CPU`/`_GPU` already guarantee on web.
const TRANSFORM_OP_ORDER: &[&str] =
    &["translateX", "translateY", "rotate", "rotateX", "rotateY", "rotateZ", "skewX", "skewY", "scaleX", "scaleY"];

/// A token's specificity — how many satisfied modifiers it carries
/// (`dark:`, `sm:`, `active:`, `min-[…]:`, or a `_kbon` stand-in for a
/// satisfied `hover:`/`focus:`/`aria-*`/`data-*`; every one of them holds
/// by the time this is read, since the caller has already gated on
/// `all_modifiers_hold`). Used to make a same-property collision resolve by
/// "more specific wins" rather than pure source order: `dark:bg-black
/// bg-white` and `bg-white dark:bg-black` both end up black in dark mode.
/// Web gets this for free from `css.rs`'s per-modifier `order` tiers +
/// stylesheet sort; native has no cascade, so it's reconstructed here.
/// Ties (equal count) still fall back to source order — last token wins,
/// exactly as before.
fn token_specificity(parsed: &ParsedClass) -> usize {
    parsed.modifiers.len()
}

pub fn resolve_style_with_warnings(
    class_string: &str,
    theme: &ThemeConfig,
    color_scheme: &str,
    pressed: bool,
    width: f64,
) -> (Map<String, Value>, Vec<String>) {
    let mut style = Map::new();
    let mut warnings = Vec::new();
    // Accumulates `transform-op-*` markers (`transform::native_resolve`)
    // into RN's ordered `transform` array at the end — RN's style system has
    // no cascade for this the way CSS custom properties do, so transform ops
    // need to be collected first and assembled in `TRANSFORM_OP_ORDER` once
    // the whole class string has been processed. Per op, the same
    // specificity rule the rest of `style` follows applies (a `dark:rotate-*`
    // beats a plain `rotate-*` either order), falling back to last-write per
    // op for equal specificity. `transform-op-none` (from `transform-none`)
    // is the exception: it clears the whole accumulator the moment it's
    // seen, regardless of specificity — `"scale-150 transform-none"` ends up
    // with no transform while `"transform-none scale-150"` keeps the scale.
    let mut transform_ops: Map<String, Value> = Map::new();
    // Highest specificity seen so far for each output key (`style` key,
    // `"shadowOffset"`, or a transform op key) — a later token only
    // overwrites a key it's at least as specific as. See
    // `token_specificity`. `unwrap_or(0)` on lookup treats "never written"
    // and "written at specificity 0" the same, which is correct: an
    // unmodified token should always be able to set, then be overwritten
    // by, another unmodified token (plain source order).
    let mut key_specificity: HashMap<String, usize> = HashMap::new();
    let mut transform_specificity: HashMap<&str, usize> = HashMap::new();

    for raw_token in class_string.split_whitespace() {
        // A mode-aware color name (`bg-surface`, where `surface` is a
        // `{ light, dark }` theme color) is rewritten to the ONE hex value
        // matching `color_scheme` here, before parsing — see
        // `substitute_mode_aware_color_token`'s own doc comment for why
        // native does this differently from web's light/dark PAIR
        // expansion. A token naming no mode-aware color passes through
        // unchanged (and unallocated — `Cow` would save the copy in that,
        // the common, case, but every token here is re-derived into a fresh
        // `ParsedClass` immediately after regardless, so the extra
        // allocation is not worth the complexity).
        let token = substitute_mode_aware_color_token(raw_token, theme, color_scheme);
        let parsed = parse_class(&token);

        let all_modifiers_hold = parsed
            .modifiers
            .iter()
            .all(|m| native_modifier_state(m, theme, color_scheme, pressed, width) == Some(true));
        if !all_modifiers_hold {
            // A typo behind a currently-inactive modifier (`dark:flexx-center`
            // in light mode) is still a typo — checked here regardless of
            // modifier state, same as before this branch existed, rather
            // than only catching it half the time depending on runtime
            // dark-mode/breakpoint state.
            if !is_recognized_utility(&parsed, theme) {
                warnings.push(typo_warning(&token));
            }
            continue;
        }

        let spec = token_specificity(&parsed);

        let Some(decls) = resolve_utility_native(&parsed, theme) else {
            // Not resolvable on native — either a genuine typo, or a real
            // utility this native engine just doesn't support yet (e.g.
            // grid-cols-3). `is_recognized_utility` disambiguates via the
            // web dispatcher (the full vocabulary), which is only worth the
            // cost of a second resolution pass once the cheaper native one
            // has already failed — not unconditionally on every token, since
            // a token that resolves successfully here is by construction a
            // recognized utility (`resolve_utility_native` only ever
            // succeeds for a real subset of what `resolve_utility` accepts)
            // and never needs the web dispatcher called again just to
            // confirm what a successful native resolve already proves.
            if !is_recognized_utility(&parsed, theme) {
                warnings.push(typo_warning(&token));
            }
            continue;
        };
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
                // `shadowOffset` is built from two synthetic props into one
                // nested `{width, height}` — treat it as a single key for
                // specificity: a lower-specificity token can't touch EITHER
                // axis once a higher one has set the offset. Equal
                // specificity still merges (one token's x + another's y).
                if spec < *key_specificity.get("shadowOffset").unwrap_or(&0) {
                    continue;
                }
                let axis = if d.property == "shadow-offset-x" { "width" } else { "height" };
                let n = d.value.parse::<f64>().ok().and_then(Number::from_f64);
                if let Some(n) = n {
                    let entry = style.entry("shadowOffset".to_string()).or_insert_with(|| Value::Object(Map::new()));
                    if let Value::Object(obj) = entry {
                        obj.insert(axis.to_string(), Value::Number(n));
                    }
                    key_specificity.insert("shadowOffset".to_string(), spec);
                }
                continue;
            }
            if d.property == "transform-op-none" {
                // A reset directive — clears every accumulated op regardless
                // of the specificity that set them, and resets the ceiling
                // so later ops of any specificity can rebuild. This one
                // stays deliberately source-order-sensitive (like `!important`
                // or `all: unset`, order-dependence is inherent to "undo
                // everything above me").
                transform_ops.clear();
                transform_specificity.clear();
                continue;
            }
            if let Some((_, op_key)) = TRANSFORM_OP_KEYS.iter().find(|(prop, _)| *prop == d.property) {
                if spec < *transform_specificity.get(op_key).unwrap_or(&0) {
                    continue;
                }
                let (value, warning) = rn_style_value(&d.property, &d.value);
                if let Some(warning) = warning {
                    warnings.push(warning);
                }
                if let Some(value) = value {
                    transform_ops.insert(op_key.to_string(), value);
                    transform_specificity.insert(op_key, spec);
                }
                continue;
            }
            let key = kebab_to_camel(&d.property);
            if spec < *key_specificity.get(&key).unwrap_or(&0) {
                continue;
            }
            let (value, warning) = rn_style_value(&d.property, &d.value);
            if let Some(warning) = warning {
                warnings.push(warning);
            }
            if let Some(value) = value {
                key_specificity.insert(key.clone(), spec);
                style.insert(key, value);
            }
        }
    }

    if !transform_ops.is_empty() {
        let ops: Vec<Value> = TRANSFORM_OP_ORDER
            .iter()
            .filter_map(|key| {
                transform_ops.get(*key).map(|value| {
                    let mut op = Map::new();
                    op.insert((*key).to_string(), value.clone());
                    Value::Object(op)
                })
            })
            .collect();
        style.insert("transform".to_string(), Value::Array(ops));
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
    fn a_modifier_variant_beats_a_plain_class_for_the_same_prop_regardless_of_source_order() {
        // Regression: native had no cascade, so `dark:bg-black bg-white`
        // (variant written FIRST) resolved to white in dark mode — pure
        // last-token-wins. Now a more-specific token wins a same-property
        // collision no matter the order, matching web.
        let mut t = theme();
        t.colors.insert("black".to_string(), ColorValue::Plain("#000000".to_string()));
        t.colors.insert("white".to_string(), ColorValue::Plain("#ffffff".to_string()));

        for order in ["dark:bg-black bg-white", "bg-white dark:bg-black"] {
            let dark = resolve_style(order, &t, "dark", false, W);
            assert_eq!(dark.get("backgroundColor").unwrap(), "#000000", "dark, `{order}`");
            let light = resolve_style(order, &t, "light", false, W);
            assert_eq!(light.get("backgroundColor").unwrap(), "#ffffff", "light, `{order}`");
        }
    }

    #[test]
    fn two_equal_specificity_classes_still_resolve_by_source_order() {
        let mut t = theme();
        t.colors.insert("black".to_string(), ColorValue::Plain("#000000".to_string()));
        t.colors.insert("white".to_string(), ColorValue::Plain("#ffffff".to_string()));

        assert_eq!(resolve_style("bg-black bg-white", &t, "light", false, W).get("backgroundColor").unwrap(), "#ffffff");
        assert_eq!(resolve_style("bg-white bg-black", &t, "light", false, W).get("backgroundColor").unwrap(), "#000000");
        assert_eq!(
            resolve_style("dark:bg-black dark:bg-white", &t, "dark", false, W).get("backgroundColor").unwrap(),
            "#ffffff",
        );
    }

    #[test]
    fn the_state_hold_marker_counts_toward_specificity() {
        // `jsxRuntimeCore.ts` emits `_kbon:` for a satisfied hover:/focus:/
        // aria-*/data-* — it must beat a plain class the same way `dark:` does.
        let mut t = theme();
        t.colors.insert("black".to_string(), ColorValue::Plain("#000000".to_string()));
        t.colors.insert("white".to_string(), ColorValue::Plain("#ffffff".to_string()));

        for order in ["_kbon:bg-black bg-white", "bg-white _kbon:bg-black"] {
            let out = resolve_style(order, &t, "light", false, W);
            assert_eq!(out.get("backgroundColor").unwrap(), "#000000", "`{order}`");
        }
    }

    #[test]
    fn a_plain_class_naming_a_mode_aware_color_resolves_to_the_current_schemes_side() {
        // Regression: a color made mode-aware via kbach.config.js's grouped
        // `dark: {}` block (@kbach/react-native's config.ts) used to
        // silently resolve to NOTHING at all here — see
        // `substitute_mode_aware_color_token`'s own doc comment.
        let mut t = theme();
        t.colors.insert(
            "surface".to_string(),
            ColorValue::ModeAware { light: "#f9fafb".to_string(), dark: "#111827".to_string() },
        );

        let light = resolve_style("bg-surface", &t, "light", false, W);
        assert_eq!(light.get("backgroundColor").unwrap(), "#f9fafb");

        let dark = resolve_style("bg-surface", &t, "dark", false, W);
        assert_eq!(dark.get("backgroundColor").unwrap(), "#111827");
    }

    #[test]
    fn an_inline_opacity_suffix_works_on_a_mode_aware_color_too() {
        // Regression: `bg-surface/50` (surface mode-aware) looked up the
        // literal, never-defined key "surface/50" in `find_mode_aware_color`
        // (the opacity suffix wasn't stripped before the theme lookup),
        // silently failed to match, and fell through to `lookup_hex` —
        // which explicitly rejects a `ModeAware` entry — so the whole class
        // resolved to nothing at all, on native and web alike.
        let mut t = theme();
        t.colors.insert(
            "surface".to_string(),
            ColorValue::ModeAware { light: "#f9fafb".to_string(), dark: "#111827".to_string() },
        );

        let light = resolve_style("bg-surface/50", &t, "light", false, W);
        assert_eq!(light.get("backgroundColor").unwrap(), "rgba(249,250,251,0.5)");

        let dark = resolve_style("bg-surface/50", &t, "dark", false, W);
        assert_eq!(dark.get("backgroundColor").unwrap(), "rgba(17,24,39,0.5)");

        // An explicit `dark:` modifier composes with opacity the same way.
        let dark_prefixed = resolve_style("dark:bg-surface/50", &t, "dark", false, W);
        assert_eq!(dark_prefixed.get("backgroundColor").unwrap(), "rgba(17,24,39,0.5)");
    }

    #[test]
    fn aspect_ratio_resolves_to_a_number_not_a_css_ratio_string() {
        let t = theme();
        // Fabric's aspectRatio prop parser wants a number, not "3 / 4".
        assert_eq!(resolve_style("aspect-[3/4]", &t, "light", false, W).get("aspectRatio").unwrap(), 0.75);
        assert_eq!(resolve_style("aspect-square", &t, "light", false, W).get("aspectRatio").unwrap(), 1.0);
        assert_eq!(resolve_style("aspect-[16/10]", &t, "light", false, W).get("aspectRatio").unwrap(), 1.6);
        // `aspect-auto` has no numeric form — dropped, leaving aspectRatio unset.
        assert!(resolve_style("aspect-auto", &t, "light", false, W).get("aspectRatio").is_none());
    }

    #[test]
    fn auto_passes_through_for_margin_width_and_inset_instead_of_being_dropped() {
        let t = theme();
        // `mx-auto` -> real RN auto margins; must NOT warn/drop.
        let mx = resolve_style("mx-auto", &t, "light", false, W);
        assert_eq!(mx.get("marginLeft").unwrap(), "auto");
        assert_eq!(mx.get("marginRight").unwrap(), "auto");
        assert!(!mx.contains_key("__kbachWarnings"));

        assert_eq!(resolve_style("w-auto", &t, "light", false, W).get("width").unwrap(), "auto");
        assert_eq!(resolve_style("mt-auto", &t, "light", false, W).get("marginTop").unwrap(), "auto");

        let (_, warnings) = resolve_style_with_warnings("mx-auto", &t, "light", false, W);
        assert!(warnings.is_empty());
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
    fn applies_an_arbitrary_min_width_breakpoint_the_same_way_named_ones_work() {
        let mut t = theme();
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let narrow = resolve_style("bg-blue-6 min-[500px]:bg-blue-8", &t, "light", false, 400.0);
        assert_eq!(narrow.get("backgroundColor").unwrap(), "#2563eb");

        // Real Tailwind's min-width semantics: AT the breakpoint counts as reached.
        let at_breakpoint = resolve_style("bg-blue-6 min-[500px]:bg-blue-8", &t, "light", false, 500.0);
        assert_eq!(at_breakpoint.get("backgroundColor").unwrap(), "#1e40af");

        let wide = resolve_style("bg-blue-6 min-[500px]:bg-blue-8", &t, "light", false, 800.0);
        assert_eq!(wide.get("backgroundColor").unwrap(), "#1e40af");
    }

    #[test]
    fn applies_an_arbitrary_max_width_breakpoint_the_same_way_named_ones_work() {
        let mut t = theme();
        t.colors.insert("blue-8".to_string(), ColorValue::Plain("#1e40af".to_string()));

        let wide = resolve_style("bg-blue-6 max-[30rem]:bg-blue-8", &t, "light", false, 900.0);
        assert_eq!(wide.get("backgroundColor").unwrap(), "#2563eb");

        // 30rem = 480px — AT the breakpoint still counts as matching (real CSS max-width semantics).
        let at_breakpoint = resolve_style("bg-blue-6 max-[30rem]:bg-blue-8", &t, "light", false, 480.0);
        assert_eq!(at_breakpoint.get("backgroundColor").unwrap(), "#1e40af");

        let narrow = resolve_style("bg-blue-6 max-[30rem]:bg-blue-8", &t, "light", false, 300.0);
        assert_eq!(narrow.get("backgroundColor").unwrap(), "#1e40af");
    }

    #[test]
    fn an_arbitrary_breakpoint_with_an_unreducible_unit_never_resolves_on_native() {
        // Percentages/viewport units have no live layout to resolve against
        // at the point a modifier's state is decided on native (same reason
        // resolve_style_with_warnings's own percentage-relative calc()
        // handling exists at all) — stays unsupported here, same as before
        // this feature existed, rather than silently misresolving.
        let t = theme();
        let r = resolve_style("bg-blue-6 min-[50vw]:bg-blue-8", &t, "light", false, 900.0);
        assert_eq!(r.get("backgroundColor").unwrap(), "#2563eb");
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
    fn assembles_stacked_transform_utilities_into_one_ordered_rn_array() {
        // Written out of canonical order on purpose (scale before rotate
        // before translate) — the assembled array must still come out in
        // TRANSFORM_OP_ORDER, not source order.
        let style = resolve_style("scale-x-75 rotate-45 translate-x-4", &theme(), "light", false, W);
        let transform = style.get("transform").unwrap().as_array().unwrap();
        assert_eq!(
            transform,
            &vec![
                serde_json::json!({ "translateX": 16.0 }),
                serde_json::json!({ "rotate": "45deg" }),
                serde_json::json!({ "scaleX": 0.75 }),
            ],
        );
    }

    #[test]
    fn a_later_utility_overwrites_an_earlier_one_on_the_same_transform_op() {
        let style = resolve_style("scale-x-75 scale-x-50", &theme(), "light", false, W);
        let transform = style.get("transform").unwrap().as_array().unwrap();
        assert_eq!(transform, &vec![serde_json::json!({ "scaleX": 0.5 })]);
    }

    #[test]
    fn transform_none_clears_any_transform_ops_written_before_it_but_not_after() {
        let cleared = resolve_style("scale-150 transform-none", &theme(), "light", false, W);
        assert!(cleared.get("transform").is_none());

        let kept = resolve_style("transform-none scale-150", &theme(), "light", false, W);
        let transform = kept.get("transform").unwrap().as_array().unwrap();
        assert_eq!(
            transform,
            &vec![serde_json::json!({ "scaleX": 1.5 }), serde_json::json!({ "scaleY": 1.5 })],
        );
    }

    #[test]
    fn backface_visibility_resolves_as_a_plain_string_not_a_transform_op() {
        let style = resolve_style("backface-hidden", &theme(), "light", false, W);
        assert_eq!(style.get("backfaceVisibility").unwrap(), "hidden");
        assert!(style.get("transform").is_none());
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
    fn resolves_opacity_to_a_json_number_not_a_string() {
        let style = resolve_style("opacity-50", &theme(), "light", false, W);
        assert_eq!(style.get("opacity").unwrap(), &Value::Number(Number::from_f64(0.5).unwrap()));
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
        // normalize_math_whitespace (parser.rs) inserts the CSS-mandated
        // spacing around the binary "-" before this ever reaches here.
        assert!(warnings[0].contains("calc(50% - 0.5rem)"));
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
    fn does_not_warn_for_named_group_or_peer_marker_classes() {
        let (_, warnings) = resolve_style_with_warnings("group/sidebar peer/field", &theme(), "light", false, W);
        assert!(warnings.is_empty());
    }

    #[test]
    fn still_warns_for_a_genuine_typo_that_merely_starts_with_group_or_peer() {
        let (_, warnings) = resolve_style_with_warnings("groupp/sidebar", &theme(), "light", false, W);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("groupp/sidebar"));
    }

    #[test]
    fn still_warns_for_a_bare_slash_with_no_name() {
        let (_, warnings) = resolve_style_with_warnings("group/", &theme(), "light", false, W);
        assert_eq!(warnings.len(), 1);
    }

    #[test]
    fn does_not_warn_for_a_real_utility_thats_only_unsupported_on_native() {
        // grid-cols-3/translate-z-4/blur are real Kbach utilities (real
        // Tailwind ones too, translate-z aside) that this engine simply
        // doesn't resolve on native yet — an intentional platform gap, not a
        // typo. Mirrors resolveUtilityNative's own existing "resolves
        // nothing" tests. (scale-150/rotate-45/translate-x-4 used to be in
        // this list too, before native transform support — see
        // transform::native_resolve.)
        let (style, warnings) = resolve_style_with_warnings("grid-cols-3 translate-z-4 blur", &theme(), "light", false, W);
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
