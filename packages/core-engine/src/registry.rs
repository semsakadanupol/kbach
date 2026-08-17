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

const BASE: ModifierDef = ModifierDef {
    pseudo: None,
    pseudo_element: None,
    ancestor_selector: None,
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
    m.insert("hover", ModifierDef { pseudo: Some(":hover"), order: 10.0, ..BASE });
    m.insert("focus", ModifierDef { pseudo: Some(":focus"), order: 11.0, ..BASE });
    m.insert("focus-visible", ModifierDef { pseudo: Some(":focus-visible"), order: 12.0, ..BASE });
    m.insert("focus-within", ModifierDef { pseudo: Some(":focus-within"), order: 13.0, ..BASE });
    m.insert("active", ModifierDef { pseudo: Some(":active"), order: 14.0, ..BASE });
    m.insert("visited", ModifierDef { pseudo: Some(":visited"), order: 15.0, ..BASE });
    // disabled forces !important — a disabled element's styling shouldn't
    // lose to an unrelated same-specificity rule that happens to load later.
    m.insert("disabled", ModifierDef { pseudo: Some(":disabled"), order: 16.0, forces_important: true, ..BASE });
    m.insert("checked", ModifierDef { pseudo: Some(":checked"), order: 17.0, ..BASE });

    // ── Structural pseudo-classes (tier 5) ──────────────────────────────────
    m.insert("first", ModifierDef { pseudo: Some(":first-child"), order: 5.0, ..BASE });
    m.insert("last", ModifierDef { pseudo: Some(":last-child"), order: 5.1, ..BASE });
    m.insert("only", ModifierDef { pseudo: Some(":only-child"), order: 5.2, ..BASE });
    m.insert("odd", ModifierDef { pseudo: Some(":nth-child(odd)"), order: 5.3, ..BASE });
    m.insert("even", ModifierDef { pseudo: Some(":nth-child(even)"), order: 5.4, ..BASE });

    // ── Native element-state attributes (tier 6) ────────────────────────────
    m.insert("open", ModifierDef { pseudo: Some("[open]"), order: 6.0, ..BASE });
    m.insert("inert", ModifierDef { pseudo: Some("[inert]"), order: 6.1, ..BASE });

    // ── Ancestor/sibling state (tier 20) ────────────────────────────────────
    m.insert("group-hover", ModifierDef { ancestor_selector: Some(".group:hover "), order: 20.0, ..BASE });
    m.insert("group-focus", ModifierDef { ancestor_selector: Some(".group:focus "), order: 21.0, ..BASE });
    m.insert("peer-hover", ModifierDef { ancestor_selector: Some(".peer:hover ~ "), order: 22.0, ..BASE });
    m.insert("peer-focus", ModifierDef { ancestor_selector: Some(".peer:focus ~ "), order: 23.0, ..BASE });
    m.insert("peer-checked", ModifierDef { ancestor_selector: Some(".peer:checked ~ "), order: 24.0, ..BASE });

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
    pub media_query: Option<String>,
    pub dark_scheme: Option<DarkScheme>,
    pub is_responsive: bool,
    /// Container-query condition (without the "@container " prefix) — e.g.
    /// `"(min-width: 400px)"` for `@min-[400px]:`. Wrapped in `@container`
    /// by `css.rs`, the exact same shape `media_query` gets wrapped in
    /// `@media`, just a different at-rule keyword (Phase 25).
    pub container_query: Option<String>,
    /// Mirrors `is_responsive`, but for `@sm:`/`@md:`/`@lg:`/`@xl:`/`@2xl:`
    /// (Phase 25's container-relative responsive variants) — `css.rs` looks
    /// up the SAME `theme.screens` width a plain `sm:` would use, just
    /// wraps the rule in `@container (min-width: ...)` instead of `@media
    /// (min-width: ...)`. Reusing `theme.screens` (rather than a separate
    /// `theme.containers` scale) is a deliberate scope simplification, not
    /// an oversight — real Tailwind lets these scales differ, but doing so
    /// here would mean threading a second theme map through every call site
    /// `is_responsive` already touches, for a rarely-exercised customization.
    pub is_container_responsive: bool,
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
            media_query: def.media_query.map(String::from),
            dark_scheme: def.dark_scheme,
            is_responsive: def.is_responsive,
            container_query: None,
            is_container_responsive: false,
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
pub fn resolve(name: &str) -> Option<ResolvedModifier> {
    get_modifier(name).map(ResolvedModifier::from).or_else(|| resolve_dynamic(name))
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
            media_query: None,
            dark_scheme: None,
            is_responsive: false,
            container_query: None,
            is_container_responsive: false,
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

fn container_query_only(container_query: String, order: f64) -> ResolvedModifier {
    ResolvedModifier { container_query: Some(container_query), order, ..Default::default() }
}

fn container_responsive_only(order: f64) -> ResolvedModifier {
    ResolvedModifier { is_container_responsive: true, order, ..Default::default() }
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
    if let Some(inner) = bracket_content(name, "has-") {
        return Some(pseudo_only(format!(":has({})", unescape(inner)), 18.0));
    }
    if let Some(inner) = bracket_content(name, "not-") {
        return Some(pseudo_only(format!(":not({})", unescape(inner)), 18.1));
    }
    if let Some(rest) = name.strip_prefix("not-") {
        // "not-" wrapping a KNOWN pseudo-class modifier (not-hover,
        // not-disabled, not-first, ...) — negates that modifier's own
        // pseudo. Only meaningful for pseudo-class-shaped modifiers, not
        // ancestor/media ones (real Tailwind doesn't support
        // "not-group-hover"/"not-sm" either), so `def.pseudo` is checked
        // specifically, not just "does this modifier exist at all".
        return get_modifier(rest).and_then(|def| def.pseudo).map(|p| pseudo_only(format!(":not({p})"), 18.1));
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
    if let Some(inner) = bracket_content(name, "max-") {
        return Some(media_only(format!("(max-width: {})", unescape(inner)), 45.0));
    }
    if let Some(rest) = name.strip_prefix("group-") {
        // Generalizes ANY group-<pseudo> combination whose base pseudo
        // modifier already exists (group-active, group-disabled,
        // group-checked, group-focus-visible, ...) — group-hover/
        // group-focus themselves stay hardcoded in the static table above
        // (checked first by `resolve`), unaffected; this only ever fires
        // for combinations NOT already there.
        return get_modifier(rest).and_then(|def| def.pseudo).map(|p| ancestor_only(format!(".group{p} "), 25.0));
    }
    if let Some(rest) = name.strip_prefix("peer-") {
        return get_modifier(rest).and_then(|def| def.pseudo).map(|p| ancestor_only(format!(".peer{p} ~ "), 26.0));
    }
    // Container queries (Phase 25) — an "@"-prefixed modifier wraps in
    // `@container` instead of `@media`. `@min-[...]`/`@max-[...]` are fully
    // self-contained (their condition text needs no theme lookup, same
    // shape as `min-[...]`/`max-[...]` above); `@sm`/`@md`/`@lg`/`@xl`/
    // `@2xl` reuse the SAME 5 fixed names (and the same `theme.screens`
    // values) the plain viewport-responsive tier uses — `css.rs` does the
    // actual width lookup when `is_container_responsive` is set, exactly
    // mirroring how `is_responsive` already works for the viewport case.
    if let Some(inner) = bracket_content(name, "@min-") {
        return Some(container_query_only(format!("(min-width: {})", unescape(inner)), 45.1));
    }
    if let Some(inner) = bracket_content(name, "@max-") {
        return Some(container_query_only(format!("(max-width: {})", unescape(inner)), 45.1));
    }
    if let Some(bare) = name.strip_prefix('@') {
        if matches!(bare, "sm" | "md" | "lg" | "xl" | "2xl") {
            return Some(container_responsive_only(45.2));
        }
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
        assert_eq!(resolve("open").unwrap().pseudo.as_deref(), Some("[open]"));
        assert_eq!(resolve("inert").unwrap().pseudo.as_deref(), Some("[inert]"));
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
        assert_eq!(max.media_query.as_deref(), Some("(max-width: 800px)"));
    }

    #[test]
    fn resolves_arbitrary_container_query_breakpoints() {
        let min = resolve("@min-[400px]").unwrap();
        assert_eq!(min.container_query.as_deref(), Some("(min-width: 400px)"));
        assert!(min.media_query.is_none());
        assert!(!min.is_container_responsive);
        let max = resolve("@max-[900px]").unwrap();
        assert_eq!(max.container_query.as_deref(), Some("(max-width: 900px)"));
    }

    #[test]
    fn resolves_named_container_responsive_breakpoints() {
        for name in ["@sm", "@md", "@lg", "@xl", "@2xl"] {
            let r = resolve(name).unwrap_or_else(|| panic!("{name} should resolve"));
            assert!(r.is_container_responsive, "{name} should be container-responsive");
            assert!(r.container_query.is_none());
        }
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
    fn resolve_returns_none_for_a_genuinely_unknown_modifier() {
        assert!(resolve("not-a-real-modifier-and-not-a-real-pseudo").is_none());
        assert!(resolve("totally-unknown").is_none());
    }
}
