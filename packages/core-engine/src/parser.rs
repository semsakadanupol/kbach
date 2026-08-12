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
    // Color — opacity variants before their base prefix.
    "bg-opacity-", "text-opacity-", "bg-", "text-", "border-",
    // Spacing — axis/side variants before their base prefix.
    "px-", "py-", "pt-", "pr-", "pb-", "pl-", "p-",
    "mx-", "my-", "mt-", "mr-", "mb-", "ml-", "m-",
    "gap-x-", "gap-y-", "gap-",
    "min-w-", "max-w-", "w-",
    "min-h-", "max-h-", "h-",
    // Border / effects
    "rounded-", "ring-", "outline-", "shadow-", "opacity-",
    "duration-", "delay-", "ease-", "cursor-",
    // Typography
    "leading-", "tracking-", "font-",
    // Layout: position/inset/z
    "z-", "inset-", "top-", "right-", "bottom-", "left-",
    // Divide / space-between. "divide-color-" (not a bare "divide-") so
    // "divide-x"/"divide-y" (standalone width utilities, no dash-value) fall
    // through to the standalone-utility path below instead of being wrongly
    // split into utility="divide", value="x"/"y".
    "divide-color-", "space-x-", "space-y-",
];

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
    /// The full original token text, unmodified — needed to reconstruct the
    /// exact CSS class selector (which must match the DOM's className verbatim).
    pub original: String,
}

/// Rejects arbitrary values that could smuggle extra CSS declarations or
/// selectors past the generated stylesheet — a value containing `{`, `}`,
/// or `;` could otherwise close the declaration/rule the resolver is
/// building and inject arbitrary CSS. Named theme-scale lookups (spacing,
/// colors) never go through this path, so they're unaffected.
fn is_safe_arbitrary_value(value: &str) -> bool {
    !value.contains('{') && !value.contains('}') && !value.contains(';')
}

pub fn parse_class(token: &str) -> ParsedClass {
    let mut parts: Vec<&str> = token.split(':').collect();
    let mut base = parts.pop().unwrap_or(token);
    let modifiers = parts.into_iter().map(String::from).collect();

    let important = base.starts_with('!');
    if important {
        base = &base[1..];
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
            return ParsedClass {
                modifiers,
                utility: prefix[..prefix.len() - 1].to_string(),
                value: Some(raw.to_string()),
                is_arbitrary: true,
                important,
                original: token.to_string(),
            };
        }

        return ParsedClass {
            modifiers,
            utility: prefix[..prefix.len() - 1].to_string(),
            value: Some(value.to_string()),
            is_arbitrary: false,
            important,
            original: token.to_string(),
        };
    }

    ParsedClass {
        modifiers,
        utility: base.to_string(),
        value: None,
        is_arbitrary: false,
        important,
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
}
