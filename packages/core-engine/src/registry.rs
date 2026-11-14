//! Central table of built-in modifier definitions — every place that needs
//! to know how a modifier turns into CSS (selector shape, media wrapping,
//! cascade order) reads from here instead of re-deriving that knowledge
//! independently. Mirrors `old-kbach/src/core/registry.ts`'s `ModifierDef`
//! pattern. No runtime registration (this engine's built-ins-only scope so
//! far) — a static table is enough.
//!
//! Order values are a fresh, documented numeric tier scheme — not a
//! byte-for-byte port of old-kbach's exact numbers (not available to
//! reference directly here) — but preserving the same qualitative
//! guarantee: base < interactive pseudo-class < ancestor/sibling state <
//! dark mode < other media-query modifiers < responsive (outermost, see
//! css.rs). Tiers are spaced by 10 so new modifiers can be inserted into an
//! existing tier without renumbering everything after it.

use std::collections::HashMap;
use std::sync::LazyLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DarkScheme {
    Dark,
    // No modifier maps to this yet (only "dark" is registered below) — kept
    // as a real variant, not removed, since css.rs's wrap_dark_scheme already
    // handles it symmetrically and a future "light:" modifier is a one-line
    // registry addition away, not a new css.rs code path.
    #[allow(dead_code)]
    Light,
}

#[derive(Debug, Clone, Copy)]
pub struct ModifierDef {
    /// Pseudo-CLASS suffix appended to the base selector, e.g. ":hover" —
    /// combines with an element the selector already matches, never
    /// changes WHAT is being styled. See `pseudo_element` below for the
    /// genuinely different "styles a sub-part of the element" kind.
    pub pseudo: Option<&'static str>,
    /// Pseudo-ELEMENT suffix, e.g. "::before" — kept as its own field
    /// rather than folded into `pseudo` because CSS requires a
    /// pseudo-element to be the LAST component of a compound selector
    /// (`.foo:hover::before` is valid, `.foo::before:hover` mostly isn't),
    /// so `css.rs` needs to place it after every pseudo-CLASS in the chain
    /// regardless of which modifier position it was written in
    /// (`before:hover:` and `hover:before:` must produce the same
    /// selector shape). Only `before`/`after` additionally trigger the
    /// auto-injected `content: var(--kb-content, "")` declaration — see
    /// `css::declarations_to_css`'s own doc comment.
    pub pseudo_element: Option<&'static str>,
    /// Ancestor/sibling selector prefixed before the base selector, e.g. ".group:hover ".
    pub ancestor_selector: Option<&'static str>,
    /// Descendant-combinator suffix appended AFTER the base selector, e.g.
    /// " > *" for the bare `*:` variant — the structural inverse of
    /// `ancestor_selector` (which styles THIS element based on an ancestor's
    /// state; this styles a DESCENDANT based on THIS element carrying the
    /// class at all). Only ever set for `*`/`**` below.
    pub descendant_selector: Option<&'static str>,
    /// Media query condition (without the "@media " prefix).
    pub media_query: Option<&'static str>,
    pub dark_scheme: Option<DarkScheme>,
    pub is_responsive: bool,
    /// Wraps the rule in a parameterless `@starting-style { ... }` block
    /// (Phase 25, real Tailwind v4's enter/exit-transition variant) — only
    /// ever true for the "starting" entry below; every other modifier
    /// leaves this false via `..BASE`.
    pub starting_style: bool,
    /// Cascade-order tier. Higher sorts later (wins same-specificity ties).
    pub order: f64,
    pub forces_important: bool,
}

/// The media query `hover:` and the variants built on it are wrapped in.
const HOVER_MEDIA: &str = "(hover: hover)";

const BASE: ModifierDef = ModifierDef {
    pseudo: None,
    pseudo_element: None,
    ancestor_selector: None,
    descendant_selector: None,
    media_query: None,
    dark_scheme: None,
    is_responsive: false,
    starting_style: false,
    order: 0.0,
    forces_important: false,
};

pub static MODIFIERS: LazyLock<HashMap<&'static str, ModifierDef>> = LazyLock::new(|| {
    let mut m = HashMap::new();

    // ── Interactive pseudo-classes (tier 10) ────────────────────────────────
    // Hover applies only where the primary input can hover (Tailwind v4):
    // on a touch screen `:hover` sticks after a tap until the next one.
    m.insert("hover", ModifierDef { pseudo: Some(":hover"), media_query: Some(HOVER_MEDIA), order: 10.0, ..BASE });
    m.insert("focus", ModifierDef { pseudo: Some(":focus"), order: 11.0, ..BASE });
    m.insert("focus-visible", ModifierDef { pseudo: Some(":focus-visible"), order: 12.0, ..BASE });
    m.insert("focus-within", ModifierDef { pseudo: Some(":focus-within"), order: 13.0, ..BASE });
    m.insert("active", ModifierDef { pseudo: Some(":active"), order: 14.0, ..BASE });
    m.insert("visited", ModifierDef { pseudo: Some(":visited"), order: 15.0, ..BASE });
    // disabled forces !important — a disabled element's styling shouldn't
    // lose to an unrelated same-specificity rule that happens to load later.
    m.insert("disabled", ModifierDef { pseudo: Some(":disabled"), order: 16.0, forces_important: true, ..BASE });
    m.insert("checked", ModifierDef { pseudo: Some(":checked"), order: 17.0, ..BASE });
    // ── Form-state/validation pseudo-classes — real Tailwind ships both
    // these NATIVE pseudo-classes and the `aria-*` shortcuts above as
    // genuinely separate variants (":required" vs "[aria-required]"), not
    // aliases of each other, so both need their own registry entry.
    m.insert("enabled", ModifierDef { pseudo: Some(":enabled"), order: 17.011, ..BASE });
    m.insert("read-only", ModifierDef { pseudo: Some(":read-only"), order: 17.012, ..BASE });
    m.insert("required", ModifierDef { pseudo: Some(":required"), order: 17.013, ..BASE });
    m.insert("optional", ModifierDef { pseudo: Some(":optional"), order: 17.014, ..BASE });
    m.insert("valid", ModifierDef { pseudo: Some(":valid"), order: 17.015, ..BASE });
    m.insert("invalid", ModifierDef { pseudo: Some(":invalid"), order: 17.016, ..BASE });
    m.insert("in-range", ModifierDef { pseudo: Some(":in-range"), order: 17.017, ..BASE });
    m.insert("out-of-range", ModifierDef { pseudo: Some(":out-of-range"), order: 17.018, ..BASE });
    m.insert("default", ModifierDef { pseudo: Some(":default"), order: 17.019, ..BASE });
    m.insert("indeterminate", ModifierDef { pseudo: Some(":indeterminate"), order: 17.021, ..BASE });
    m.insert("placeholder-shown", ModifierDef { pseudo: Some(":placeholder-shown"), order: 17.022, ..BASE });
    m.insert("autofill", ModifierDef { pseudo: Some(":autofill"), order: 17.023, ..BASE });
    m.insert("user-valid", ModifierDef { pseudo: Some(":user-valid"), order: 17.024, ..BASE });
    m.insert("user-invalid", ModifierDef { pseudo: Some(":user-invalid"), order: 17.025, ..BASE });
    // ── Other native pseudo-classes with no aria-* counterpart at all.
    m.insert("target", ModifierDef { pseudo: Some(":target"), order: 17.031, ..BASE });
    m.insert("fullscreen", ModifierDef { pseudo: Some(":fullscreen"), order: 17.032, ..BASE });
    m.insert("popover-open", ModifierDef { pseudo: Some(":popover-open"), order: 17.033, ..BASE });

    // ── Structural pseudo-classes (tier 5) ──────────────────────────────────
    m.insert("first", ModifierDef { pseudo: Some(":first-child"), order: 5.0, ..BASE });
    m.insert("first-of-type", ModifierDef { pseudo: Some(":first-of-type"), order: 5.05, ..BASE });
    m.insert("last", ModifierDef { pseudo: Some(":last-child"), order: 5.1, ..BASE });
    m.insert("last-of-type", ModifierDef { pseudo: Some(":last-of-type"), order: 5.15, ..BASE });
    m.insert("only", ModifierDef { pseudo: Some(":only-child"), order: 5.2, ..BASE });
    m.insert("only-of-type", ModifierDef { pseudo: Some(":only-of-type"), order: 5.25, ..BASE });
    m.insert("odd", ModifierDef { pseudo: Some(":nth-child(odd)"), order: 5.3, ..BASE });
    m.insert("even", ModifierDef { pseudo: Some(":nth-child(even)"), order: 5.4, ..BASE });
    m.insert("empty", ModifierDef { pseudo: Some(":empty"), order: 5.45, ..BASE });

    // ── Native element-state attributes (tier 6) ────────────────────────────
    // `open:` also matches an open popover and anything `:open` (Tailwind
    // v4); inside `:is()` a browser that doesn't know `:open` skips just
    // that part. `inert:` reaches the descendants of an inert element,
    // which are inert too.
    m.insert("open", ModifierDef { pseudo: Some(":is([open], :popover-open, :open)"), order: 6.0, ..BASE });
    m.insert("inert", ModifierDef { pseudo: Some(":is([inert], [inert] *)"), order: 6.1, ..BASE });

    // ── Ancestor/sibling state (tier 20) ────────────────────────────────────
    m.insert("group-hover", ModifierDef { ancestor_selector: Some(".group:hover "), media_query: Some(HOVER_MEDIA), order: 20.0, ..BASE });
    m.insert("group-focus", ModifierDef { ancestor_selector: Some(".group:focus "), order: 21.0, ..BASE });
    m.insert("peer-hover", ModifierDef { ancestor_selector: Some(".peer:hover ~ "), media_query: Some(HOVER_MEDIA), order: 22.0, ..BASE });
    m.insert("peer-focus", ModifierDef { ancestor_selector: Some(".peer:focus ~ "), order: 23.0, ..BASE });
    m.insert("peer-checked", ModifierDef { ancestor_selector: Some(".peer:checked ~ "), order: 24.0, ..BASE });

    // ── Direct children / all descendants (tier 19) — the structural
    // inverse of group-*/peer-*: `*:flex` styles this element's DIRECT
    // CHILDREN, not the element carrying the class itself; `**:flex`
    // reaches every descendant, not just direct children. Sorted just
    // before the ancestor tier (20+) since it's selector-shape, not
    // ancestor-state, but after pseudo-elements — same rationale as every
    // other selector-shape-vs-value-shape ordering in this table.
    m.insert("*", ModifierDef { descendant_selector: Some(" > *"), order: 19.0, ..BASE });
    m.insert("**", ModifierDef { descendant_selector: Some(" *"), order: 19.1, ..BASE });

    // ── Static ARIA-state shortcuts (tier 17.1-17.9) ────────────────────────
    // The boolean-shorthand form real Tailwind ships (`aria-expanded:` means
    // `&[aria-expanded="true"]`) — the general parameterized `aria-[...]`
    // form (any attribute/value pair) is handled dynamically below, in
    // `resolve_dynamic`, not here.
    m.insert("aria-checked", ModifierDef { pseudo: Some("[aria-checked=\"true\"]"), order: 17.1, ..BASE });
    m.insert("aria-disabled", ModifierDef { pseudo: Some("[aria-disabled=\"true\"]"), order: 17.2, ..BASE });
    m.insert("aria-expanded", ModifierDef { pseudo: Some("[aria-expanded=\"true\"]"), order: 17.3, ..BASE });
    m.insert("aria-hidden", ModifierDef { pseudo: Some("[aria-hidden=\"true\"]"), order: 17.4, ..BASE });
    m.insert("aria-pressed", ModifierDef { pseudo: Some("[aria-pressed=\"true\"]"), order: 17.5, ..BASE });
    m.insert("aria-readonly", ModifierDef { pseudo: Some("[aria-readonly=\"true\"]"), order: 17.6, ..BASE });
    m.insert("aria-required", ModifierDef { pseudo: Some("[aria-required=\"true\"]"), order: 17.7, ..BASE });
    m.insert("aria-selected", ModifierDef { pseudo: Some("[aria-selected=\"true\"]"), order: 17.8, ..BASE });
    m.insert("aria-busy", ModifierDef { pseudo: Some("[aria-busy=\"true\"]"), order: 17.9, ..BASE });

    // ── Pseudo-elements (tier 18.5) — sorted alongside the other selector-
    // shape modifiers (structural/native-state/interactive pseudo-classes),
    // clearly before ancestor/dark/media tiers, matching the general
    // "selector-shape modifiers resolve before value-shape ones" ordering
    // this table already follows. `before`/`after` additionally get the
    // auto-injected `content` declaration in css.rs; the rest don't need
    // it (an element already renders without one).
    m.insert("before", ModifierDef { pseudo_element: Some("::before"), order: 18.5, ..BASE });
    m.insert("after", ModifierDef { pseudo_element: Some("::after"), order: 18.51, ..BASE });
    m.insert("placeholder", ModifierDef { pseudo_element: Some("::placeholder"), order: 18.52, ..BASE });
    m.insert("selection", ModifierDef { pseudo_element: Some("::selection"), order: 18.53, ..BASE });
    m.insert("marker", ModifierDef { pseudo_element: Some("::marker"), order: 18.54, ..BASE });
    m.insert("first-line", ModifierDef { pseudo_element: Some("::first-line"), order: 18.55, ..BASE });
    m.insert("first-letter", ModifierDef { pseudo_element: Some("::first-letter"), order: 18.56, ..BASE });
    m.insert("file", ModifierDef { pseudo_element: Some("::file-selector-button"), order: 18.57, ..BASE });
    m.insert("backdrop", ModifierDef { pseudo_element: Some("::backdrop"), order: 18.58, ..BASE });
    m.insert("details-content", ModifierDef { pseudo_element: Some("::details-content"), order: 18.59, ..BASE });

    // ── Dark mode (tier 30) ──────────────────────────────────────────────────
    m.insert("dark", ModifierDef { dark_scheme: Some(DarkScheme::Dark), order: 30.0, ..BASE });

    // ── Other media-query modifiers (tier 35) ────────────────────────────────
    m.insert("motion-safe", ModifierDef { media_query: Some("(prefers-reduced-motion: no-preference)"), order: 35.0, ..BASE });
    m.insert("motion-reduce", ModifierDef { media_query: Some("(prefers-reduced-motion: reduce)"), order: 36.0, ..BASE });
    m.insert("print", ModifierDef { media_query: Some("print"), order: 37.0, ..BASE });
    m.insert("portrait", ModifierDef { media_query: Some("(orientation: portrait)"), order: 37.1, ..BASE });
    m.insert("landscape", ModifierDef { media_query: Some("(orientation: landscape)"), order: 37.2, ..BASE });
    m.insert("contrast-more", ModifierDef { media_query: Some("(prefers-contrast: more)"), order: 37.3, ..BASE });
    m.insert("contrast-less", ModifierDef { media_query: Some("(prefers-contrast: less)"), order: 37.4, ..BASE });
    m.insert("pointer-coarse", ModifierDef { media_query: Some("(pointer: coarse)"), order: 37.5, ..BASE });
    m.insert("pointer-fine", ModifierDef { media_query: Some("(pointer: fine)"), order: 37.6, ..BASE });
    m.insert("any-pointer-coarse", ModifierDef { media_query: Some("(any-pointer: coarse)"), order: 37.7, ..BASE });
    m.insert("any-pointer-fine", ModifierDef { media_query: Some("(any-pointer: fine)"), order: 37.8, ..BASE });
    m.insert("pointer-none", ModifierDef { media_query: Some("(pointer: none)"), order: 37.81, ..BASE });
    m.insert("any-pointer-none", ModifierDef { media_query: Some("(any-pointer: none)"), order: 37.82, ..BASE });
    m.insert("forced-colors", ModifierDef { media_query: Some("(forced-colors: active)"), order: 37.9, ..BASE });
    m.insert("inverted-colors", ModifierDef { media_query: Some("(inverted-colors: inverted)"), order: 37.91, ..BASE });
    m.insert("noscript", ModifierDef { media_query: Some("(scripting: none)"), order: 37.92, ..BASE });

    // ── Direction pseudo-classes (tier 17.95) — grouped with the other
    // static pseudo-class shortcuts above rather than the media-query tier:
    // `:dir()` is a real pseudo-CLASS (matches the element's own resolved
    // direction, from `dir`/CSS `direction`), not a viewport media feature.
    m.insert("rtl", ModifierDef { pseudo: Some(":dir(rtl)"), order: 17.95, ..BASE });
    m.insert("ltr", ModifierDef { pseudo: Some(":dir(ltr)"), order: 17.96, ..BASE });

    // ── Responsive breakpoints (tier 40+, outermost — see css.rs) ───────────
    // Actual min-width comes from theme.screens at CSS-build time; the order
    // value here only needs to place "responsive" after every other tier and
    // ascending among themselves, so sm < md < lg < xl < 2xl ties resolve
    // predictably even before a theme's px values are consulted.
    m.insert("sm", ModifierDef { is_responsive: true, order: 40.0, ..BASE });
    m.insert("md", ModifierDef { is_responsive: true, order: 41.0, ..BASE });
    m.insert("lg", ModifierDef { is_responsive: true, order: 42.0, ..BASE });
    m.insert("xl", ModifierDef { is_responsive: true, order: 43.0, ..BASE });
    m.insert("2xl", ModifierDef { is_responsive: true, order: 44.0, ..BASE });

    // ── starting-style (tier 46, real Tailwind v4's enter/exit-transition
    // variant) ────────────────────────────────────────────────────────────
    m.insert("starting", ModifierDef { starting_style: true, order: 46.0, ..BASE });

    m
});

pub fn get_modifier(name: &str) -> Option<ModifierDef> {
    MODIFIERS.get(name).copied()
}

/// A modifier's effect on the generated rule, mirroring `ModifierDef`'s
/// shape exactly but with OWNED strings — needed for Phase 24's
/// "parameterized" modifiers (`has-[...]`, `data-[...]`, `aria-[...]`,
/// `not-*`, `min-[...]`/`max-[...]`), whose selector/media-query text is
/// COMPUTED from the modifier's own bracket content at parse time, not
/// known ahead of time the way every `MODIFIERS` table entry's `&'static
/// str` fields are.
pub struct ResolvedModifier {
    pub pseudo: Option<String>,
    /// See `ModifierDef::pseudo_element`'s own doc comment. Never populated
    /// by `resolve_dynamic` — real Tailwind has no arbitrary/parameterized
    /// pseudo-element form, only the fixed static set the `MODIFIERS` table
    /// above registers.
    pub pseudo_element: Option<String>,
    pub ancestor_selector: Option<String>,
    /// See `ModifierDef::descendant_selector`'s own doc comment.
    pub descendant_selector: Option<String>,
    pub media_query: Option<String>,
    /// `@supports (...)` feature-query condition (without the "@supports "
    /// prefix) — e.g. `"(display: grid)"` for `supports-[display:_grid]:`.
    /// Wrapped in `@supports` by `css.rs`, the same shape `media_query`
    /// gets wrapped in `@media`, just a different (AND independent, so
    /// nesting order relative to `@media`/`@container` doesn't matter)
    /// at-rule keyword.
    pub supports_query: Option<String>,
    pub dark_scheme: Option<DarkScheme>,
    pub is_responsive: bool,
    /// Container-query condition (without the "@container " prefix) — e.g.
    /// `"(min-width: 400px)"` for `@min-[400px]:`. Wrapped in `@container`
    /// by `css.rs`, the exact same shape `media_query` gets wrapped in
    /// `@media`, just a different at-rule keyword (Phase 25).
    pub container_query: Option<String>,
    pub starting_style: bool,
    pub order: f64,
    pub forces_important: bool,
}

impl From<ModifierDef> for ResolvedModifier {
    fn from(def: ModifierDef) -> Self {
        ResolvedModifier {
            pseudo: def.pseudo.map(String::from),
            pseudo_element: def.pseudo_element.map(String::from),
            ancestor_selector: def.ancestor_selector.map(String::from),
            descendant_selector: def.descendant_selector.map(String::from),
            media_query: def.media_query.map(String::from),
            supports_query: None,
            dark_scheme: def.dark_scheme,
            is_responsive: def.is_responsive,
            container_query: None,
            starting_style: def.starting_style,
            order: def.order,
            forces_important: def.forces_important,
        }
    }
}

/// The single entry point `css.rs` calls for EVERY modifier in a class's
/// chain — tries the static `MODIFIERS` table first (unchanged, zero
/// regression risk for any modifier this engine already resolved), then
/// falls through to `resolve_dynamic` for Phase 24's parameterized forms.
///
/// Named groups/peers (`group-hover/sidebar:opacity-100`, disambiguating
/// which ancestor `group`/`peer` a nested one reacts to — real Tailwind
/// since v3.3) are handled here rather than in every single group-/peer-
/// arm above: `split_named_group_suffix` strips a trailing `/name` off
/// BEFORE any of the normal resolution logic runs, resolves the rest
/// completely normally (recursing back into this same function), then
/// rewrites the resulting `.group`/`.peer` ancestor selector to
/// `.group\/name`/`.peer\/name` afterward. One rewrite step covers every
/// group-/peer- shape uniformly (the static table's `group-hover`/
/// `group-focus`, the generalized `group-<pseudo>`, `group-has-[...]`,
/// and `group-[...]` alike) instead of threading a name parameter through
/// each of their own branches individually.
pub fn resolve(name: &str) -> Option<ResolvedModifier> {
    if let Some((base, group_name)) = split_named_group_suffix(name) {
        let mut resolved = get_modifier(base).map(ResolvedModifier::from).or_else(|| resolve_dynamic(base))?;
        resolved.ancestor_selector = resolved.ancestor_selector.map(|a| rename_group_or_peer_selector(&a, group_name));
        return Some(resolved);
    }
    get_modifier(name).map(ResolvedModifier::from).or_else(|| resolve_dynamic(name))
}

/// Splits `<group-or-peer-modifier>/<name>` into its two halves — e.g.
/// `"group-hover/sidebar"` -> `Some(("group-hover", "sidebar"))`,
/// `"group-has-[.active]/sidebar"` -> `Some(("group-has-[.active]",
/// "sidebar"))`. The `/` is searched for AFTER the last `]` (or from the
/// very start if there's no bracket at all) specifically so a `/`
/// appearing INSIDE a bracket's own arbitrary content is never mistaken
/// for the name separator — real Tailwind's own name always comes last,
/// after any bracket. Gated behind a cheap `contains('/')` plus a
/// `group`/`peer` prefix check first, so every OTHER modifier (the
/// overwhelming majority of calls into `resolve`) pays only that one cheap
/// check, never the rest of this function's work.
fn split_named_group_suffix(name: &str) -> Option<(&str, &str)> {
    if !name.contains('/') || !(name.starts_with("group") || name.starts_with("peer")) {
        return None;
    }
    let search_from = name.rfind(']').map_or(0, |i| i + 1);
    let slash_pos = search_from + name[search_from..].find('/')?;
    let (base, rest) = name.split_at(slash_pos);
    let group_name = &rest[1..];
    if base.is_empty() || group_name.is_empty() {
        return None;
    }
    Some((base, group_name))
}

/// Rewrites an already-resolved `.group...`/`.peer...` ancestor-selector
/// fragment to target a NAMED group/peer instead of the bare class —
/// every group-/peer- family modifier's `ancestor_selector` starts with
/// exactly one of these two literal prefixes, so a plain `strip_prefix` is
/// enough; the `/` is backslash-escaped since it's a literal character
/// inside a CSS class selector otherwise reserved for other meanings.
fn rename_group_or_peer_selector(ancestor: &str, group_name: &str) -> String {
    if ancestor.starts_with(".group") || (ancestor.contains(".group") && !ancestor.starts_with(".peer")) {
        ancestor.replacen(".group", &format!(".group\\/{group_name}"), 1)
    } else {
        ancestor.replacen(".peer", &format!(".peer\\/{group_name}"), 1)
    }
}

/// Underscore -> space, the same multi-part-arbitrary-value convention
/// `parser.rs::parse_class` already uses for utility values
/// (`shadow-[0_4px_6px_red]`) — a literal space inside a class token isn't
/// otherwise writable at all, since whitespace is what separates tokens in
/// the first place. Applied to every parameterized modifier's bracket
/// content below, for the same reason.
fn unescape(raw: &str) -> String {
    raw.replace('_', " ")
}

/// Strips `prefix` then a `[...]` bracket pair, rejecting (returning
/// `None` for) any inner content `parser::is_safe_arbitrary_value` flags —
/// the exact same `{`/`}`/`;` CSS-injection guard an arbitrary utility
/// value gets, applied here because these modifiers interpolate their own
/// bracket content directly into a generated selector/media-query
/// fragment, the identical injection surface.
fn bracket_content<'a>(name: &'a str, prefix: &str) -> Option<&'a str> {
    let rest = name.strip_prefix(prefix)?;
    let inner = rest.strip_prefix('[')?.strip_suffix(']')?;
    if !crate::parser::is_safe_arbitrary_value(inner) {
        return None;
    }
    Some(inner)
}

/// `key=value` (or a bare `key`, a boolean-presence check) -> an attribute
/// selector: `data-[state=open]` -> `[data-state="open"]`,
/// `aria-[expanded]` -> `[aria-expanded]`. Mirrors real Tailwind's own
/// `data-*`/`aria-*` arbitrary-value convention (unquoted value in the
/// class name, auto-quoted in the generated CSS).
fn attr_selector(attr_prefix: &str, inner: &str) -> String {
    let unescaped = unescape(inner);
    match unescaped.split_once('=') {
        Some((key, value)) => format!("[{attr_prefix}-{key}=\"{value}\"]"),
        None => format!("[{attr_prefix}-{unescaped}]"),
    }
}

impl Default for ResolvedModifier {
    fn default() -> Self {
        ResolvedModifier {
            pseudo: None,
            pseudo_element: None,
            ancestor_selector: None,
            descendant_selector: None,
            media_query: None,
            supports_query: None,
            dark_scheme: None,
            is_responsive: false,
            container_query: None,
            starting_style: false,
            order: 0.0,
            forces_important: false,
        }
    }
}

fn pseudo_only(pseudo: String, order: f64) -> ResolvedModifier {
    ResolvedModifier { pseudo: Some(pseudo), order, ..Default::default() }
}

fn ancestor_only(ancestor_selector: String, order: f64) -> ResolvedModifier {
    ResolvedModifier { ancestor_selector: Some(ancestor_selector), order, ..Default::default() }
}

fn media_only(media_query: String, order: f64) -> ResolvedModifier {
    ResolvedModifier { media_query: Some(media_query), order, ..Default::default() }
}

fn supports_query_only(supports_query: String, order: f64) -> ResolvedModifier {
    ResolvedModifier { supports_query: Some(supports_query), order, ..Default::default() }
}

fn container_query_only(container_query: String, order: f64) -> ResolvedModifier {
    ResolvedModifier { container_query: Some(container_query), order, ..Default::default() }
}

/// Tailwind CSS v4's container sizes, for `@sm:` … `@7xl:` and `@max-sm:` …:
/// their own scale (`@sm` is 24rem), not the screen breakpoints (`sm` is 40rem).
const CONTAINER_SIZES: [(&str, &str); 13] = [
    ("3xs", "16rem"), ("2xs", "18rem"), ("xs", "20rem"), ("sm", "24rem"), ("md", "28rem"),
    ("lg", "32rem"), ("xl", "36rem"), ("2xl", "42rem"), ("3xl", "48rem"), ("4xl", "56rem"),
    ("5xl", "64rem"), ("6xl", "72rem"), ("7xl", "80rem"),
];

/// `"sm"` -> `Some((3, "24rem"))`: a container size and its rank in the scale.
pub(crate) fn container_size(name: &str) -> Option<(usize, &'static str)> {
    CONTAINER_SIZES.iter().position(|(n, _)| *n == name).map(|i| (i, CONTAINER_SIZES[i].1))
}

/// A container query's condition and cascade tier, from what follows the
/// `@`: `sm` … `7xl` and `min-sm` (the container scale, at least that
/// wide), `max-md` (strictly narrower), and the same with any length:
/// `[400px]`, `min-[400px]`, `max-[400px]`. Shared with css.rs's named
/// form (`@md/main:`). Ordered by size: the larger min-width later (it wins
/// when both hold), the larger max-width earlier.
///
/// `max-` is `width < …`, not `max-width`: `@md:` and `@max-md:` never both
/// hold, as with the screen breakpoints (they used to overlap at exactly
/// the boundary).
pub(crate) fn container_condition(query: &str) -> Option<(String, f64)> {
    let bracket = |q: &str| -> Option<String> {
        let inner = q.strip_prefix('[')?.strip_suffix(']')?;
        (!inner.is_empty() && crate::parser::is_safe_arbitrary_value(inner)).then(|| unescape(inner))
    };
    if let Some((rank, size)) = container_size(query).or_else(|| query.strip_prefix("min-").and_then(container_size)) {
        return Some((format!("(min-width: {size})"), 45.2 + rank as f64 * 0.001));
    }
    if let Some((rank, size)) = query.strip_prefix("max-").and_then(container_size) {
        return Some((format!("(width < {size})"), 45.15 - rank as f64 * 0.001));
    }
    if let Some(v) = bracket(query).or_else(|| query.strip_prefix("min-").and_then(bracket)) {
        return Some((format!("(min-width: {v})"), 45.1));
    }
    query.strip_prefix("max-").and_then(bracket).map(|v| (format!("(width < {v})"), 45.1))
}

/// `(hover: hover)` when the wrapped variant is `hover` (`group-hover`,
/// `peer-hover`, `in-hover`, `has-hover`), as for `hover:` itself.
fn hover_media(wrapped: &str) -> Option<String> {
    (wrapped == "hover").then(|| HOVER_MEDIA.to_string())
}

/// The `@supports` condition of `supports-…:` — a declaration in brackets
/// (`supports-[display:grid]` -> `(display:grid)`), a whole condition
/// (`supports-[not_(display:grid)]`, `supports-[selector(:has(a))]`), a
/// variable (`supports-(--x)`), or a bare property (`supports-grid` ->
/// `(grid: var(--kb))`: is the property known at all).
fn supports_condition(rest: &str) -> Option<String> {
    if let Some(value) = crate::parser::arbitrary_modifier(rest) {
        // A condition already: optional identifier, then a parenthesis.
        let after_ident = value.trim_start_matches(|c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_').trim_start();
        return Some(if after_ident.starts_with('(') { value } else { format!("({value})") });
    }
    let property = !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    property.then(|| format!("({rest}: var(--kb))"))
}

/// A variant that is only a condition on the element itself — `hover`,
/// `checked`, `data-open`, `aria-[sort=asc]`, `nth-3`, `has-checked`,
/// `not-first` — as its selector text, for the variants that wrap another
/// one (`group-*`, `peer-*`, `in-*`, `not-*`, `has-*`). `None` for anything
/// with an ancestor, an at-rule, a pseudo-element or a theme lookup.
fn self_condition(name: &str) -> Option<String> {
    if let Some(def) = get_modifier(name) {
        return def.pseudo.map(String::from);
    }
    let r = resolve_dynamic(name)?;
    let only_selector = r.ancestor_selector.is_none()
        && r.descendant_selector.is_none()
        && r.pseudo_element.is_none()
        && r.media_query.is_none()
        && r.container_query.is_none()
        && r.supports_query.is_none()
        && r.dark_scheme.is_none()
        && !r.is_responsive
        && !r.starting_style;
    if only_selector {
        r.pseudo
    } else {
        None
    }
}

/// `data-open` -> `[data-open]`: Tailwind CSS v4's bare data-attribute
/// variant (the attribute is present). Plain names only.
fn data_attribute(rest: &str) -> Option<String> {
    let plain = !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    plain.then(|| format!("[data-{rest}]"))
}

/// Real Tailwind's `[&...]:` escape hatch — a raw CSS selector fragment as
/// a modifier, for anything the specific parameterized forms below
/// (`has-[...]`/`data-[...]`/`aria-[...]`/`nth-[...]`/`supports-[...]`/...)
/// don't already have a name for. `&` marks where the base selector itself
/// belongs: everything AFTER it is appended directly onto the selector
/// (`[&:hover]` -> `:hover`, `[&>*]` -> `>*`, `[&::marker]` -> `::marker`,
/// `[&.is-open]` -> `.is-open`); everything BEFORE it becomes an ancestor
/// prefix instead (`[.dark_&]` -> `.dark ` prepended — same mechanism
/// `group-hover:`'s `.group:hover ` prefix already uses). Both at once
/// works too: `[.dark_&.is-open]` -> ancestor prefix `.dark ` AND suffix
/// `.is-open` on the very same variant.
///
/// Requires EXACTLY one `&`. Zero means this isn't a real arbitrary
/// variant at all (a bare `[...]` with no name and no `&` resolves
/// nowhere, same as before this function existed); more than one makes
/// the resulting selector shape ambiguous enough that it's simplest to
/// leave unsupported rather than guess at which occurrence is "the" one.
fn resolve_arbitrary_variant(inner: &str) -> Option<ResolvedModifier> {
    let spaced = unescape(inner);
    // `[@media(min-width:900px)]:`, `[@supports(display:grid)]:`,
    // `[@container(min-width:300px)]:` — a whole at-rule condition.
    for (keyword, order) in [("@media", 45.6), ("@supports", 45.5), ("@container", 45.3)] {
        if let Some(condition) = spaced.strip_prefix(keyword) {
            let condition = condition.trim().to_string();
            if condition.is_empty() {
                return None;
            }
            return Some(match keyword {
                "@media" => media_only(condition, order),
                "@supports" => supports_query_only(condition, order),
                _ => container_query_only(condition, order),
            });
        }
    }
    if spaced.matches('&').count() != 1 {
        return None;
    }
    let amp_pos = spaced.find('&')?;
    let before = &spaced[..amp_pos];
    let after = &spaced[amp_pos + 1..];
    if before.is_empty() && after.is_empty() {
        return None; // "[&]" alone — no actual selector change, not a real variant
    }

    Some(ResolvedModifier {
        ancestor_selector: (!before.is_empty()).then(|| before.to_string()),
        pseudo: (!after.is_empty()).then(|| after.to_string()),
        // Sits just after the other bracket-parameterized modifiers above
        // (has-/not-/data-/aria- at 18.0-18.3, group-has-/peer-has- at
        // 24.5-24.6) — this is the most general of the bunch, so it
        // resolves last among them; a suffix-only variant (no ancestor
        // prefix) keeps the plain-pseudo neighborhood's order, an
        // ancestor-prefixed one keeps the ancestor neighborhood's.
        order: if before.is_empty() { 18.4 } else { 24.7 },
        ..Default::default()
    })
}

/// Phase 24's parameterized modifiers — see this module's own top-level doc
/// comment for the full list and reasoning. Order of the `if let` chain
/// below matters only where one prefix is a literal substring of another
/// (`has-` vs `group-has-`/`peer-has-`, `group-`/`peer-` vs their
/// `-has-` cousins) — `str::strip_prefix` requires an exact prefix match
/// from the very start of the string, so e.g. `"group-has-[...]"` never
/// matches `bracket_content(name, "group-")` at all (it doesn't start with
/// "group-["), meaning the two never actually compete; listed in this
/// order for readability, not because it's load-bearing.
fn resolve_dynamic(name: &str) -> Option<ResolvedModifier> {
    // "nth-last-" before "nth-" (its shorter counterpart) — same
    // longer-before-shorter rule `bracket_content`'s own callers already
    // follow everywhere else; both wrap the real `:nth-child()`/
    // `:nth-last-child()` pseudo-class formula syntax verbatim
    // (`nth-[3n+1]:` -> `:nth-child(3n+1)`), a superset of the static
    // `odd:`/`even:` shortcuts already in the table above.
    // "nth-last-of-type-"/"nth-of-type-" before their shorter "nth-last-"/
    // "nth-" counterparts, same longer-before-shorter rule as everywhere
    // else in this chain — "nth-of-type-[3n+1]" must not be wrongly claimed
    // by the "nth-" arm as if it were "nth-[of-type-3n+1]".
    // Plain-number forms (`nth-3:`, `nth-last-2:`, `nth-of-type-4:`), the
    // Tailwind v4 shorthand for the bracket forms below. Longest prefix first.
    for (prefix, pseudo, order) in [
        ("nth-last-of-type-", "nth-last-of-type", 5.51),
        ("nth-of-type-", "nth-of-type", 5.51),
        ("nth-last-", "nth-last-child", 5.5),
        ("nth-", "nth-child", 5.5),
    ] {
        if let Some(n) = name.strip_prefix(prefix) {
            if !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) {
                return Some(pseudo_only(format!(":{pseudo}({n})"), order));
            }
        }
    }
    if let Some(inner) = bracket_content(name, "nth-last-of-type-") {
        return Some(pseudo_only(format!(":nth-last-of-type({})", unescape(inner)), 5.51));
    }
    if let Some(inner) = bracket_content(name, "nth-of-type-") {
        return Some(pseudo_only(format!(":nth-of-type({})", unescape(inner)), 5.51));
    }
    if let Some(inner) = bracket_content(name, "nth-last-") {
        return Some(pseudo_only(format!(":nth-last-child({})", unescape(inner)), 5.5));
    }
    if let Some(inner) = bracket_content(name, "nth-") {
        return Some(pseudo_only(format!(":nth-child({})", unescape(inner)), 5.5));
    }
    if let Some(inner) = bracket_content(name, "group-has-") {
        return Some(ancestor_only(format!(".group:has({}) ", unescape(inner)), 24.5));
    }
    if let Some(inner) = bracket_content(name, "peer-has-") {
        return Some(ancestor_only(format!(".peer:has({}) ~ ", unescape(inner)), 24.6));
    }
    // `group-[...]`/`peer-[...]` — the arbitrary-condition counterpart to
    // `group-<known-pseudo>`/`peer-<known-pseudo>` below (order 25.0/26.0,
    // matched here for the same reason: this is the SAME ".group<condition> "/
    // ".peer<condition> ~ " mechanism, just with the condition written out
    // directly instead of looked up from a known modifier name) — real
    // Tailwind's `group-[.is-published]:block`/`peer-[.is-invalid]:block`,
    // for any ancestor condition that isn't a plain pseudo-class Kbach
    // already has a name for (an attribute selector, a compound class, a
    // `:not(...)`, ...). Deliberately NOT wrapped in `:has(...)` the way
    // `group-has-`/`peer-has-` are — this condition applies to the group/
    // peer element ITSELF, not something it contains.
    // With an `&` the condition says where the group itself goes:
    // `group-[&_p]:` is `.group p `, `group-[.foo_&]:` is `.foo .group `.
    // (The `&` used to be left in the selector as written.)
    if let Some(inner) = bracket_content(name, "group-") {
        let condition = unescape(inner);
        let selector = if condition.contains('&') { condition.replace('&', ".group") } else { format!(".group{condition}") };
        return Some(ancestor_only(format!("{selector} "), 25.0));
    }
    if let Some(inner) = bracket_content(name, "peer-") {
        let condition = unescape(inner);
        let selector = if condition.contains('&') { condition.replace('&', ".peer") } else { format!(".peer{condition}") };
        return Some(ancestor_only(format!("{selector} ~ "), 26.0));
    }
    if let Some(inner) = bracket_content(name, "has-") {
        return Some(pseudo_only(format!(":has({})", unescape(inner)), 18.0));
    }
    if let Some(inner) = bracket_content(name, "not-") {
        return Some(pseudo_only(format!(":not({})", unescape(inner)), 18.1));
    }
    if let Some(rest) = name.strip_prefix("not-") {
        // "not-" wrapping a condition on the element itself (not-hover,
        // not-first, not-data-open, not-aria-[sort=asc], ...) negates its
        // selector; wrapping a plain media variant (not-print,
        // not-forced-colors) negates the query: `@media not (...)`.
        // Not ancestor ones: Tailwind CSS has no "not-group-hover" either.
        if let Some(p) = self_condition(rest) {
            return Some(pseudo_only(format!(":not({p})"), 18.1));
        }
        // Any variant that is only an at-rule condition, dynamic ones too:
        // `not-max-[900px]:`, `not-@md:`, `not-supports-[display:grid]:`.
        let inner = resolve(rest)?;
        let only_at_rule = inner.pseudo.is_none()
            && inner.pseudo_element.is_none()
            && inner.ancestor_selector.is_none()
            && inner.descendant_selector.is_none()
            && inner.dark_scheme.is_none()
            && !inner.is_responsive
            && !inner.starting_style;
        if !only_at_rule {
            return None;
        }
        let order = inner.order + 0.001;
        return match (inner.media_query, inner.container_query, inner.supports_query) {
            (Some(mq), None, None) => Some(media_only(format!("not {mq}"), order)),
            (None, Some(cq), None) => Some(container_query_only(format!("not {cq}"), order)),
            (None, None, Some(sq)) => Some(supports_query_only(format!("not {sq}"), order)),
            _ => None,
        };
    }
    // `has-checked` -> `:has(*:checked)`: Tailwind CSS v4's has-<variant>,
    // the shorthand for `has-[:checked]` (the bracket form is matched above).
    // (Neither returns on a miss: `data-[...]` is matched further down.)
    if let Some(rest) = name.strip_prefix("has-") {
        if let Some(p) = self_condition(rest) {
            return Some(ResolvedModifier { media_query: hover_media(rest), ..pseudo_only(format!(":has(*{p})"), 18.0) });
        }
    }
    if let Some(a) = name.strip_prefix("data-").and_then(data_attribute) {
        return Some(pseudo_only(a, 18.2));
    }
    if let Some(inner) = bracket_content(name, "data-") {
        return Some(pseudo_only(attr_selector("data", inner), 18.2));
    }
    if let Some(inner) = bracket_content(name, "aria-") {
        return Some(pseudo_only(attr_selector("aria", inner), 18.3));
    }
    if let Some(inner) = bracket_content(name, "min-") {
        return Some(media_only(format!("(min-width: {})", unescape(inner)), 45.0));
    }
    // Strictly below, like `max-md:`: `max-[900px]:` and `min-[900px]:`
    // never both hold. (It was `max-width`, which includes 900px itself.)
    if let Some(inner) = bracket_content(name, "max-") {
        return Some(media_only(format!("(width < {})", unescape(inner)), 45.0));
    }
    // `@supports (...)` feature query (`css.rs` wraps `supports_query` in
    // `@supports`, independent of and freely nestable with `@media`/
    // `@container`). See `supports_condition` for the forms.
    if let Some(condition) = name.strip_prefix("supports-").and_then(supports_condition) {
        return Some(supports_query_only(condition, 45.5));
    }
    if let Some(rest) = name.strip_prefix("group-") {
        // Generalizes ANY group-<pseudo> combination whose base pseudo
        // modifier already exists (group-active, group-disabled,
        // group-checked, group-focus-visible, ...) — group-hover/
        // group-focus themselves stay hardcoded in the static table above
        // (checked first by `resolve`), unaffected; this only ever fires
        // for combinations NOT already there.
        // Any condition on the group itself, not only a pseudo-class:
        // group-data-open, group-data-[state=open], group-aria-[…],
        // group-has-checked, group-nth-2, group-not-first, …
        return self_condition(rest).map(|p| ResolvedModifier { media_query: hover_media(rest), ..ancestor_only(format!(".group{p} "), 25.0) });
    }
    if let Some(rest) = name.strip_prefix("peer-") {
        return self_condition(rest).map(|p| ResolvedModifier { media_query: hover_media(rest), ..ancestor_only(format!(".peer{p} ~ "), 26.0) });
    }
    // `in-*` (real Tailwind v4's context-aware ancestor variant) —
    // functionally `group-*` without needing a `.group` class on the
    // ancestor: `:where(<pseudo>) ` matches ANY ancestor in that state,
    // not just one specifically marked `.group`. `:where(...)` (rather than
    // a bare `<pseudo> `) is deliberate — it keeps this variant's
    // specificity at zero, matching real Tailwind's own `in-*` output,
    // so an `in-hover:` rule never out-specifies an unrelated same-property
    // rule just because of how this ancestor match happened to be spelled.
    // Same substring-collision non-issue as `group-`/`peer-` above: any
    // "in-<name>" that's ALSO a real static modifier (e.g. a hypothetical
    // "in-range" — already registered above) resolves via the static table
    // first, since `resolve()` tries that before ever calling this function.
    // `in-[...]` — the arbitrary-condition counterpart to `in-<known-pseudo>`
    // just below, same reasoning as `group-[...]`/`peer-[...]` above: for
    // any ancestor condition that isn't a plain pseudo-class already
    // registered by name. Checked BEFORE the bare `strip_prefix` form
    // below, not just alongside it — that block unconditionally `return`s
    // the moment "in-" matches at all (even when its own `get_modifier`
    // lookup finds nothing), so a bracket form checked AFTER it would be
    // dead code for every "in-[...]" input, never actually reached.
    if let Some(inner) = bracket_content(name, "in-") {
        return Some(ancestor_only(format!(":where({}) ", unescape(inner)), 27.0));
    }
    if let Some(rest) = name.strip_prefix("in-") {
        return self_condition(rest).map(|p| ResolvedModifier { media_query: hover_media(rest), ..ancestor_only(format!(":where({p}) "), 27.0) });
    }
    // Container queries (Phase 25) — an "@"-prefixed modifier wraps in
    // `@container` instead of `@media`. `@min-[...]`/`@max-[...]` are fully
    // self-contained (their condition text needs no theme lookup, same
    // shape as `min-[...]`/`max-[...]` above); `@sm`, `@max-md`, … use
    // Tailwind CSS v4's container scale (`CONTAINER_SIZES`). Before
    // 1.0.0-beta.19 they used the screen widths (`@sm` was 640px, not 24rem).
    if let Some((condition, order)) = name.strip_prefix('@').and_then(container_condition) {
        return Some(container_query_only(condition, order));
    }
    // The generic `[&...]:` fallback — deliberately checked LAST: every
    // named prefix above (`has-`, `data-`, `nth-`, ...) requires real text
    // before its own `[`, so none of them could ever also match a BARE
    // bracket starting at position 0 — there's no actual competition to
    // order against, this just reads clearest as the final catch-all.
    if let Some(inner) = bracket_content(name, "") {
        return resolve_arbitrary_variant(inner);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_modifiers_resolve() {
        assert!(get_modifier("hover").is_some());
        assert!(get_modifier("dark").is_some());
        assert!(get_modifier("sm").is_some());
    }

    #[test]
    fn unknown_modifier_returns_none() {
        assert!(get_modifier("not-a-real-modifier").is_none());
    }

    #[test]
    fn interactive_pseudo_classes_sort_before_ancestor_modifiers() {
        let hover = get_modifier("hover").unwrap();
        let group_hover = get_modifier("group-hover").unwrap();
        assert!(hover.order < group_hover.order);
    }

    #[test]
    fn ancestor_modifiers_sort_before_dark_mode() {
        let group_hover = get_modifier("group-hover").unwrap();
        let dark = get_modifier("dark").unwrap();
        assert!(group_hover.order < dark.order);
    }

    #[test]
    fn dark_mode_sorts_before_responsive() {
        let dark = get_modifier("dark").unwrap();
        let sm = get_modifier("sm").unwrap();
        assert!(dark.order < sm.order);
    }

    #[test]
    fn responsive_breakpoints_sort_ascending_by_size() {
        let sm = get_modifier("sm").unwrap().order;
        let md = get_modifier("md").unwrap().order;
        let lg = get_modifier("lg").unwrap().order;
        let xl = get_modifier("xl").unwrap().order;
        let xxl = get_modifier("2xl").unwrap().order;
        assert!(sm < md && md < lg && lg < xl && xl < xxl);
    }

    #[test]
    fn disabled_forces_important() {
        assert!(get_modifier("disabled").unwrap().forces_important);
        assert!(!get_modifier("hover").unwrap().forces_important);
    }

    #[test]
    fn resolves_structural_and_native_state_pseudo_classes() {
        assert_eq!(resolve("first").unwrap().pseudo.as_deref(), Some(":first-child"));
        assert_eq!(resolve("only").unwrap().pseudo.as_deref(), Some(":only-child"));
        assert_eq!(resolve("odd").unwrap().pseudo.as_deref(), Some(":nth-child(odd)"));
        assert_eq!(resolve("open").unwrap().pseudo.as_deref(), Some(":is([open], :popover-open, :open)"));
        assert_eq!(resolve("inert").unwrap().pseudo.as_deref(), Some(":is([inert], [inert] *)"));
    }

    #[test]
    fn resolves_static_aria_state_shortcuts() {
        assert_eq!(resolve("aria-expanded").unwrap().pseudo.as_deref(), Some("[aria-expanded=\"true\"]"));
        assert_eq!(resolve("aria-selected").unwrap().pseudo.as_deref(), Some("[aria-selected=\"true\"]"));
    }

    #[test]
    fn resolves_has_variant_via_the_dynamic_path() {
        let r = resolve("has-[a:hover]").unwrap();
        assert_eq!(r.pseudo.as_deref(), Some(":has(a:hover)"));
        assert_eq!(r.ancestor_selector, None);
    }

    #[test]
    fn resolves_group_has_and_peer_has_variants() {
        let group = resolve("group-has-[.active]").unwrap();
        assert_eq!(group.ancestor_selector.as_deref(), Some(".group:has(.active) "));
        let peer = resolve("peer-has-[:checked]").unwrap();
        assert_eq!(peer.ancestor_selector.as_deref(), Some(".peer:has(:checked) ~ "));
    }

    #[test]
    fn resolves_data_and_aria_arbitrary_attribute_variants() {
        let data = resolve("data-[state=open]").unwrap();
        assert_eq!(data.pseudo.as_deref(), Some("[data-state=\"open\"]"));
        let aria = resolve("aria-[expanded=true]").unwrap();
        assert_eq!(aria.pseudo.as_deref(), Some("[aria-expanded=\"true\"]"));
        // Bare key (no "=") -> a boolean-presence attribute selector.
        let bool_data = resolve("data-[disabled]").unwrap();
        assert_eq!(bool_data.pseudo.as_deref(), Some("[data-disabled]"));
    }

    #[test]
    fn resolves_not_wrapping_a_bracket_or_a_known_pseudo_modifier() {
        let arbitrary = resolve("not-[.foo]").unwrap();
        assert_eq!(arbitrary.pseudo.as_deref(), Some(":not(.foo)"));
        let wrapped = resolve("not-hover").unwrap();
        assert_eq!(wrapped.pseudo.as_deref(), Some(":not(:hover)"));
        let wrapped_first = resolve("not-first").unwrap();
        assert_eq!(wrapped_first.pseudo.as_deref(), Some(":not(:first-child)"));
        // "not-" wrapping an ANCESTOR modifier (no pseudo of its own) is
        // unresolvable — real Tailwind doesn't support "not-group-hover" either.
        assert!(resolve("not-group-hover").is_none());
    }

    #[test]
    fn resolves_arbitrary_min_and_max_width_breakpoints() {
        let min = resolve("min-[600px]").unwrap();
        assert_eq!(min.media_query.as_deref(), Some("(min-width: 600px)"));
        assert!(!min.is_responsive);
        let max = resolve("max-[800px]").unwrap();
        assert_eq!(max.media_query.as_deref(), Some("(width < 800px)"));
    }

    #[test]
    fn resolves_arbitrary_container_query_breakpoints() {
        let min = resolve("@min-[400px]").unwrap();
        assert_eq!(min.container_query.as_deref(), Some("(min-width: 400px)"));
        assert!(min.media_query.is_none());
        let max = resolve("@max-[900px]").unwrap();
        assert_eq!(max.container_query.as_deref(), Some("(width < 900px)"));
    }

    #[test]
    fn resolves_named_container_sizes_from_the_container_scale() {
        for (name, size) in [("@3xs", "16rem"), ("@sm", "24rem"), ("@md", "28rem"), ("@2xl", "42rem"), ("@7xl", "80rem")] {
            let r = resolve(name).unwrap_or_else(|| panic!("{name} should resolve"));
            assert_eq!(r.container_query, Some(format!("(min-width: {size})")), "{name}");
            assert!(r.media_query.is_none());
        }
        assert_eq!(resolve("@max-md").unwrap().container_query.as_deref(), Some("(width < 28rem)"));
        assert_eq!(resolve("@min-md").unwrap().container_query.as_deref(), Some("(min-width: 28rem)"));
        assert_eq!(resolve("@[400px]").unwrap().container_query.as_deref(), Some("(min-width: 400px)"));
        assert!(resolve("@sm").unwrap().order < resolve("@lg").unwrap().order);
        assert!(resolve("@max-sm").unwrap().order > resolve("@max-lg").unwrap().order);
        assert!(resolve("@8xl").is_none());
        // A bare "@" name that ISN'T one of the five known breakpoints is
        // unresolvable — not every "@word" is a container variant.
        assert!(resolve("@notabreakpoint").is_none());
    }

    #[test]
    fn resolves_starting_style() {
        let r = resolve("starting").unwrap();
        assert!(r.starting_style);
    }

    #[test]
    fn generalizes_group_and_peer_beyond_the_hardcoded_hover_focus_entries() {
        // "group-active"/"peer-disabled" are NOT in the static MODIFIERS
        // table at all — only resolvable via the dynamic group-<pseudo>/
        // peer-<pseudo> generalization.
        assert!(get_modifier("group-active").is_none());
        let group_active = resolve("group-active").unwrap();
        assert_eq!(group_active.ancestor_selector.as_deref(), Some(".group:active "));
        let peer_disabled = resolve("peer-disabled").unwrap();
        assert_eq!(peer_disabled.ancestor_selector.as_deref(), Some(".peer:disabled ~ "));
    }

    #[test]
    fn the_five_hardcoded_group_and_peer_entries_still_resolve_via_the_static_table_unchanged() {
        // Regression: the dynamic group-/peer- generalization must never
        // shadow these — resolve() tries the static table first.
        assert_eq!(resolve("group-hover").unwrap().ancestor_selector.as_deref(), Some(".group:hover "));
        assert_eq!(resolve("peer-checked").unwrap().ancestor_selector.as_deref(), Some(".peer:checked ~ "));
    }

    #[test]
    fn rejects_unsafe_bracket_content_in_parameterized_modifiers() {
        assert!(resolve("has-[{evil:1}]").is_none());
        assert!(resolve("data-[x;evil]").is_none());
    }

    #[test]
    fn resolves_pseudo_element_modifiers() {
        assert_eq!(resolve("before").unwrap().pseudo_element.as_deref(), Some("::before"));
        assert_eq!(resolve("after").unwrap().pseudo_element.as_deref(), Some("::after"));
        assert_eq!(resolve("placeholder").unwrap().pseudo_element.as_deref(), Some("::placeholder"));
        assert_eq!(resolve("selection").unwrap().pseudo_element.as_deref(), Some("::selection"));
        assert_eq!(resolve("marker").unwrap().pseudo_element.as_deref(), Some("::marker"));
        assert_eq!(resolve("first-line").unwrap().pseudo_element.as_deref(), Some("::first-line"));
        assert_eq!(resolve("first-letter").unwrap().pseudo_element.as_deref(), Some("::first-letter"));
        assert_eq!(resolve("file").unwrap().pseudo_element.as_deref(), Some("::file-selector-button"));
        assert_eq!(resolve("backdrop").unwrap().pseudo_element.as_deref(), Some("::backdrop"));
        // Pseudo-elements don't set the plain pseudo-CLASS field.
        assert_eq!(resolve("before").unwrap().pseudo, None);
    }

    #[test]
    fn resolves_direction_pseudo_classes() {
        assert_eq!(resolve("rtl").unwrap().pseudo.as_deref(), Some(":dir(rtl)"));
        assert_eq!(resolve("ltr").unwrap().pseudo.as_deref(), Some(":dir(ltr)"));
    }

    #[test]
    fn resolves_orientation_and_contrast_media_modifiers() {
        assert_eq!(resolve("portrait").unwrap().media_query.as_deref(), Some("(orientation: portrait)"));
        assert_eq!(resolve("landscape").unwrap().media_query.as_deref(), Some("(orientation: landscape)"));
        assert_eq!(resolve("contrast-more").unwrap().media_query.as_deref(), Some("(prefers-contrast: more)"));
        assert_eq!(resolve("contrast-less").unwrap().media_query.as_deref(), Some("(prefers-contrast: less)"));
    }

    #[test]
    fn resolves_arbitrary_nth_child_variants() {
        let nth = resolve("nth-[3n+1]").unwrap();
        assert_eq!(nth.pseudo.as_deref(), Some(":nth-child(3n+1)"));
        let nth_last = resolve("nth-last-[2]").unwrap();
        assert_eq!(nth_last.pseudo.as_deref(), Some(":nth-last-child(2)"));
    }

    #[test]
    fn resolves_of_type_structural_pseudo_classes_and_empty() {
        assert_eq!(resolve("first-of-type").unwrap().pseudo.as_deref(), Some(":first-of-type"));
        assert_eq!(resolve("last-of-type").unwrap().pseudo.as_deref(), Some(":last-of-type"));
        assert_eq!(resolve("only-of-type").unwrap().pseudo.as_deref(), Some(":only-of-type"));
        assert_eq!(resolve("empty").unwrap().pseudo.as_deref(), Some(":empty"));
    }

    #[test]
    fn resolves_form_state_and_validation_pseudo_classes() {
        assert_eq!(resolve("enabled").unwrap().pseudo.as_deref(), Some(":enabled"));
        assert_eq!(resolve("read-only").unwrap().pseudo.as_deref(), Some(":read-only"));
        assert_eq!(resolve("required").unwrap().pseudo.as_deref(), Some(":required"));
        assert_eq!(resolve("optional").unwrap().pseudo.as_deref(), Some(":optional"));
        assert_eq!(resolve("valid").unwrap().pseudo.as_deref(), Some(":valid"));
        assert_eq!(resolve("invalid").unwrap().pseudo.as_deref(), Some(":invalid"));
        assert_eq!(resolve("in-range").unwrap().pseudo.as_deref(), Some(":in-range"));
        assert_eq!(resolve("out-of-range").unwrap().pseudo.as_deref(), Some(":out-of-range"));
        assert_eq!(resolve("default").unwrap().pseudo.as_deref(), Some(":default"));
        assert_eq!(resolve("indeterminate").unwrap().pseudo.as_deref(), Some(":indeterminate"));
        assert_eq!(resolve("placeholder-shown").unwrap().pseudo.as_deref(), Some(":placeholder-shown"));
        assert_eq!(resolve("autofill").unwrap().pseudo.as_deref(), Some(":autofill"));
        assert_eq!(resolve("user-valid").unwrap().pseudo.as_deref(), Some(":user-valid"));
        assert_eq!(resolve("user-invalid").unwrap().pseudo.as_deref(), Some(":user-invalid"));
    }

    #[test]
    fn resolves_target_fullscreen_and_popover_open() {
        assert_eq!(resolve("target").unwrap().pseudo.as_deref(), Some(":target"));
        assert_eq!(resolve("fullscreen").unwrap().pseudo.as_deref(), Some(":fullscreen"));
        assert_eq!(resolve("popover-open").unwrap().pseudo.as_deref(), Some(":popover-open"));
    }

    #[test]
    fn resolves_details_content_pseudo_element() {
        assert_eq!(resolve("details-content").unwrap().pseudo_element.as_deref(), Some("::details-content"));
    }

    #[test]
    fn resolves_pointer_media_modifiers() {
        assert_eq!(resolve("pointer-coarse").unwrap().media_query.as_deref(), Some("(pointer: coarse)"));
        assert_eq!(resolve("pointer-fine").unwrap().media_query.as_deref(), Some("(pointer: fine)"));
        assert_eq!(resolve("any-pointer-coarse").unwrap().media_query.as_deref(), Some("(any-pointer: coarse)"));
        assert_eq!(resolve("any-pointer-fine").unwrap().media_query.as_deref(), Some("(any-pointer: fine)"));
    }

    #[test]
    fn resolves_arbitrary_nth_of_type_variants_distinct_from_nth_child() {
        let nth = resolve("nth-of-type-[3n+1]").unwrap();
        assert_eq!(nth.pseudo.as_deref(), Some(":nth-of-type(3n+1)"));
        let nth_last = resolve("nth-last-of-type-[2]").unwrap();
        assert_eq!(nth_last.pseudo.as_deref(), Some(":nth-last-of-type(2)"));
        // Still resolves the shorter "nth-"/"nth-last-" (child) forms unchanged.
        assert_eq!(resolve("nth-[3n+1]").unwrap().pseudo.as_deref(), Some(":nth-child(3n+1)"));
    }

    #[test]
    fn resolves_direct_children_and_all_descendants() {
        assert_eq!(resolve("*").unwrap().descendant_selector.as_deref(), Some(" > *"));
        assert_eq!(resolve("**").unwrap().descendant_selector.as_deref(), Some(" *"));
    }

    #[test]
    fn resolves_arbitrary_supports_feature_queries() {
        let r = resolve("supports-[display:grid]").unwrap();
        assert_eq!(r.supports_query.as_deref(), Some("(display:grid)"));
        assert!(r.media_query.is_none());
    }

    #[test]
    fn resolves_in_star_as_a_zero_specificity_ancestor_match() {
        let r = resolve("in-hover").unwrap();
        assert_eq!(r.ancestor_selector.as_deref(), Some(":where(:hover) "));
        // Doesn't require a specific static pseudo-only modifier that has
        // no pseudo at all (e.g. an ancestor-only one) to resolve.
        assert!(resolve("in-group-hover").is_none());
    }

    #[test]
    fn resolve_returns_none_for_a_genuinely_unknown_modifier() {
        assert!(resolve("not-a-real-modifier-and-not-a-real-pseudo").is_none());
        assert!(resolve("totally-unknown").is_none());
    }

    #[test]
    fn resolves_a_named_group_hover_from_the_static_table() {
        let r = resolve("group-hover/sidebar").unwrap();
        assert_eq!(r.ancestor_selector.as_deref(), Some(".group\\/sidebar:hover "));
    }

    #[test]
    fn resolves_a_named_peer_focus_from_the_static_table() {
        let r = resolve("peer-focus/field").unwrap();
        assert_eq!(r.ancestor_selector.as_deref(), Some(".peer\\/field:focus ~ "));
    }

    #[test]
    fn resolves_a_named_group_with_a_generalized_pseudo() {
        // group-checked isn't one of the two hardcoded static entries
        // (group-hover/group-focus) - goes through the dynamic
        // strip_prefix("group-") + get_modifier path instead, and still
        // gets renamed correctly.
        let r = resolve("group-checked/item").unwrap();
        assert_eq!(r.ancestor_selector.as_deref(), Some(".group\\/item:checked "));
    }

    #[test]
    fn resolves_a_named_group_has_variant() {
        let r = resolve("group-has-[.active]/sidebar").unwrap();
        assert_eq!(r.ancestor_selector.as_deref(), Some(".group\\/sidebar:has(.active) "));
    }

    #[test]
    fn resolves_a_named_arbitrary_group_condition() {
        let r = resolve("group-[.is-published]/sidebar").unwrap();
        assert_eq!(r.ancestor_selector.as_deref(), Some(".group\\/sidebar.is-published "));
    }

    #[test]
    fn the_slash_inside_a_bracket_is_never_mistaken_for_the_name_separator() {
        // The "/" inside "a[href='/x']" must stay part of the has-[...]
        // condition itself - only a "/" AFTER the bracket names the group.
        let r = resolve("group-has-[a[href='/x']]/sidebar").unwrap();
        assert_eq!(r.ancestor_selector.as_deref(), Some(".group\\/sidebar:has(a[href='/x']) "));
    }

    #[test]
    fn a_slash_with_no_group_or_peer_prefix_is_left_alone() {
        // Not a group/peer-family modifier at all - never attempts the
        // named-group split, resolves (or fails to) completely normally.
        assert!(resolve("hover/sidebar").is_none());
    }

    #[test]
    fn returns_none_when_the_base_before_the_slash_is_not_a_real_group_or_peer_modifier() {
        assert!(resolve("group/sidebar").is_none()); // "group" alone is a UTILITY, not a modifier
        assert!(resolve("group-not-real/sidebar").is_none());
    }

    #[test]
    fn returns_none_for_an_empty_name_on_either_side_of_the_slash() {
        assert!(resolve("group-hover/").is_none());
        assert!(resolve("/sidebar").is_none());
    }

    #[test]
    fn resolves_an_arbitrary_variant_pseudo_class_suffix() {
        let r = resolve("[&:hover]").unwrap();
        assert_eq!(r.pseudo.as_deref(), Some(":hover"));
        assert_eq!(r.ancestor_selector, None);
    }

    #[test]
    fn resolves_an_arbitrary_variant_pseudo_element_suffix() {
        let r = resolve("[&::marker]").unwrap();
        assert_eq!(r.pseudo.as_deref(), Some("::marker"));
    }

    #[test]
    fn resolves_an_arbitrary_variant_child_combinator_suffix() {
        let r = resolve("[&>*]").unwrap();
        assert_eq!(r.pseudo.as_deref(), Some(">*"));
    }

    #[test]
    fn resolves_an_arbitrary_variant_descendant_combinator_suffix_with_underscore_spacing() {
        let r = resolve("[&_p]").unwrap();
        assert_eq!(r.pseudo.as_deref(), Some(" p"));
    }

    #[test]
    fn resolves_an_arbitrary_variant_compound_class_suffix() {
        let r = resolve("[&.is-open]").unwrap();
        assert_eq!(r.pseudo.as_deref(), Some(".is-open"));
    }

    #[test]
    fn resolves_an_arbitrary_variant_ancestor_prefix() {
        // "&" at the very end -> everything before it becomes an ancestor
        // prefix, same mechanism group-hover's ".group:hover " uses.
        let r = resolve("[.dark_&]").unwrap();
        assert_eq!(r.ancestor_selector.as_deref(), Some(".dark "));
        assert_eq!(r.pseudo, None);
    }

    #[test]
    fn resolves_an_arbitrary_variant_with_both_an_ancestor_prefix_and_a_suffix() {
        let r = resolve("[.dark_&.is-open]").unwrap();
        assert_eq!(r.ancestor_selector.as_deref(), Some(".dark "));
        assert_eq!(r.pseudo.as_deref(), Some(".is-open"));
    }

    #[test]
    fn returns_none_for_an_arbitrary_variant_with_no_ampersand_at_all() {
        // A bare bracket with no "&" isn't a real arbitrary variant (and
        // isn't any other known bracket-parameterized form either).
        assert!(resolve("[.foo]").is_none());
    }

    #[test]
    fn returns_none_for_an_arbitrary_variant_with_more_than_one_ampersand() {
        assert!(resolve("[&_&]").is_none());
    }

    #[test]
    fn returns_none_for_an_arbitrary_variant_that_is_just_a_bare_ampersand() {
        assert!(resolve("[&]").is_none());
    }

    #[test]
    fn resolves_arbitrary_group_and_peer_conditions_not_wrapped_in_has() {
        let group = resolve("group-[.is-published]").unwrap();
        assert_eq!(group.ancestor_selector.as_deref(), Some(".group.is-published "));
        let peer = resolve("peer-[.is-invalid]").unwrap();
        assert_eq!(peer.ancestor_selector.as_deref(), Some(".peer.is-invalid ~ "));
    }

    #[test]
    fn arbitrary_group_and_peer_conditions_still_coexist_with_their_has_counterparts() {
        // "group-has-[...]" must keep resolving via ITS OWN arm, not get
        // wrongly claimed by the newer, more general "group-[...]" one —
        // bracket_content's exact-prefix-match already guarantees this
        // (see this function's own doc comment), this just proves it.
        let group_has = resolve("group-has-[.active]").unwrap();
        assert_eq!(group_has.ancestor_selector.as_deref(), Some(".group:has(.active) "));
    }

    #[test]
    fn resolves_an_arbitrary_in_condition_zero_specificity_ancestor_match() {
        let r = resolve("in-[.is-open]").unwrap();
        assert_eq!(r.ancestor_selector.as_deref(), Some(":where(.is-open) "));
    }

    #[test]
    fn does_not_shadow_any_named_bracket_prefixed_modifier() {
        // Every named form above requires real text before its own "[", so
        // none of them could ever ALSO look like a bare "[&...]" — sanity
        // check that adding the generic fallback didn't change any of these.
        assert_eq!(resolve("has-[a:hover]").unwrap().pseudo.as_deref(), Some(":has(a:hover)"));
        assert_eq!(resolve("data-[state=open]").unwrap().pseudo.as_deref(), Some("[data-state=\"open\"]"));
    }
}
