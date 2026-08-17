//! CSS Grid utilities — web-only by construction (not wired into
//! `resolve_utility_native`, unlike almost every other resolver module).
//! React Native's layout engine (Yoga) is flexbox-only; it has no CSS Grid
//! equivalent at all, so there's no meaningful native mapping to fall back
//! to the way `full`/`auto` did. Mirrors
//! `old-kbach/packages/ui/src/core/resolvers/layout.ts`'s grid entries,
//! which were themselves already gated `web ? ... : null`.
//!
//! Deliberately does NOT fold `display: grid` into `grid-cols-*`/
//! `grid-rows-*` the way old-kbach's `grid-cols` (inconsistently — its own
//! `grid-rows` didn't) did — this project's own established convention
//! (see `resolvers::layout::resolve_flex`'s docs) is that container-level
//! utilities never imply an unrelated `display` change as a side effect;
//! callers write bare `grid` explicitly, same as `flex-row` doesn't imply
//! `display: flex`.

use super::{decl, Declaration};
use crate::parser::ParsedClass;

const AUTO_SIZE_PRESETS: &[(&str, &str)] =
    &[("auto", "auto"), ("min", "min-content"), ("max", "max-content"), ("fr", "minmax(0, 1fr)")];

fn resolve_auto_size(parsed: &ParsedClass, property: &str) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(vec![decl(property, value)]);
    }
    AUTO_SIZE_PRESETS.iter().find(|(k, _)| *k == value).map(|(_, v)| vec![decl(property, v)])
}

/// Shared by col-start/col-end/row-start/row-end: `auto`, an arbitrary
/// value, or a plain unitless grid line number.
fn resolve_placement(parsed: &ParsedClass, property: &str) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if value == "auto" {
        return Some(vec![decl(property, "auto")]);
    }
    if parsed.is_arbitrary {
        return Some(vec![decl(property, value)]);
    }
    value.parse::<i64>().ok().map(|n| vec![decl(property, &n.to_string())])
}

/// Shared by col-span/row-span: `full` (span the entire axis) or a plain
/// span count.
fn resolve_span(parsed: &ParsedClass, property: &str) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if value == "full" {
        return Some(vec![decl(property, "1 / -1")]);
    }
    let n: i64 = value.parse().ok()?;
    Some(vec![decl(property, &format!("span {n} / span {n}"))])
}

/// Shared by bare `col`/`row`: `auto` (including the bare, value-less form)
/// or an arbitrary value. No numeric/named form — matches old-kbach, which
/// only ever returns non-null for these two cases.
fn resolve_shorthand(parsed: &ParsedClass, property: &str) -> Option<Vec<Declaration>> {
    match parsed.value.as_deref() {
        None => Some(vec![decl(property, "auto")]),
        Some("auto") => Some(vec![decl(property, "auto")]),
        Some(value) if parsed.is_arbitrary => Some(vec![decl(property, value)]),
        _ => None,
    }
}

fn named(value: &str, allowed: &[(&'static str, &'static str)]) -> Option<&'static str> {
    allowed.iter().find(|(k, _)| *k == value).map(|(_, v)| *v)
}

const ALIGN_KEYWORDS: &[(&str, &str)] =
    &[("start", "start"), ("end", "end"), ("center", "center"), ("stretch", "stretch"), ("baseline", "baseline")];
const ALIGN_KEYWORDS_WITH_AUTO: &[(&str, &str)] =
    &[("auto", "auto"), ("start", "start"), ("end", "end"), ("center", "center"), ("stretch", "stretch")];
const CONTENT_KEYWORDS: &[(&str, &str)] = &[
    ("start", "start"),
    ("end", "end"),
    ("center", "center"),
    ("stretch", "stretch"),
    ("between", "space-between"),
    ("around", "space-around"),
    ("evenly", "space-evenly"),
    ("baseline", "baseline"),
];

pub fn resolve(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "grid-cols" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("grid-template-columns", value)]);
            }
            if value == "none" {
                return Some(vec![decl("grid-template-columns", "none")]);
            }
            let n: i64 = value.parse().ok()?;
            if !(1..=12).contains(&n) {
                return None;
            }
            Some(vec![decl("grid-template-columns", &format!("repeat({n}, minmax(0, 1fr))"))])
        }
        "grid-rows" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("grid-template-rows", value)]);
            }
            if value == "none" {
                return Some(vec![decl("grid-template-rows", "none")]);
            }
            let n: i64 = value.parse().ok()?;
            if n < 1 {
                return None;
            }
            Some(vec![decl("grid-template-rows", &format!("repeat({n}, minmax(0, 1fr))"))])
        }
        "grid-flow" => {
            let flow = match parsed.value.as_deref()? {
                "row" => "row",
                "col" => "column",
                "dense" => "dense",
                "row-dense" => "row dense",
                "col-dense" => "column dense",
                _ => return None,
            };
            Some(vec![decl("grid-auto-flow", flow)])
        }
        "auto-cols" => resolve_auto_size(parsed, "grid-auto-columns"),
        "auto-rows" => resolve_auto_size(parsed, "grid-auto-rows"),
        "col-span" => resolve_span(parsed, "grid-column"),
        "col-start" => resolve_placement(parsed, "grid-column-start"),
        "col-end" => resolve_placement(parsed, "grid-column-end"),
        "col" => resolve_shorthand(parsed, "grid-column"),
        "row-span" => resolve_span(parsed, "grid-row"),
        "row-start" => resolve_placement(parsed, "grid-row-start"),
        "row-end" => resolve_placement(parsed, "grid-row-end"),
        "row" => resolve_shorthand(parsed, "grid-row"),
        "place-items" => named(parsed.value.as_deref()?, ALIGN_KEYWORDS).map(|v| vec![decl("place-items", v)]),
        "place-content" => named(parsed.value.as_deref()?, CONTENT_KEYWORDS).map(|v| vec![decl("place-content", v)]),
        "place-self" => named(parsed.value.as_deref()?, ALIGN_KEYWORDS_WITH_AUTO).map(|v| vec![decl("place-self", v)]),
        "justify-items" => named(parsed.value.as_deref()?, ALIGN_KEYWORDS).map(|v| vec![decl("justify-items", v)]),
        "justify-self" => named(parsed.value.as_deref()?, ALIGN_KEYWORDS_WITH_AUTO).map(|v| vec![decl("justify-self", v)]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;

    #[test]
    fn resolves_grid_template_columns_and_rows() {
        assert_eq!(
            resolve(&parse_class("grid-cols-3")),
            Some(vec![decl("grid-template-columns", "repeat(3, minmax(0, 1fr))")]),
        );
        assert_eq!(resolve(&parse_class("grid-cols-none")), Some(vec![decl("grid-template-columns", "none")]));
        assert_eq!(
            resolve(&parse_class("grid-cols-[200px_1fr]")),
            Some(vec![decl("grid-template-columns", "200px 1fr")]),
        );
        assert_eq!(resolve(&parse_class("grid-cols-13")), None);
        assert_eq!(
            resolve(&parse_class("grid-rows-4")),
            Some(vec![decl("grid-template-rows", "repeat(4, minmax(0, 1fr))")]),
        );
    }

    #[test]
    fn resolves_grid_flow() {
        assert_eq!(resolve(&parse_class("grid-flow-col")), Some(vec![decl("grid-auto-flow", "column")]));
        assert_eq!(resolve(&parse_class("grid-flow-row-dense")), Some(vec![decl("grid-auto-flow", "row dense")]));
    }

    #[test]
    fn resolves_auto_cols_and_rows() {
        assert_eq!(resolve(&parse_class("auto-cols-fr")), Some(vec![decl("grid-auto-columns", "minmax(0, 1fr)")]));
        assert_eq!(resolve(&parse_class("auto-rows-max")), Some(vec![decl("grid-auto-rows", "max-content")]));
        assert_eq!(resolve(&parse_class("auto-cols-[3rem]")), Some(vec![decl("grid-auto-columns", "3rem")]));
    }

    #[test]
    fn resolves_col_and_row_span_start_end() {
        assert_eq!(resolve(&parse_class("col-span-2")), Some(vec![decl("grid-column", "span 2 / span 2")]));
        assert_eq!(resolve(&parse_class("col-span-full")), Some(vec![decl("grid-column", "1 / -1")]));
        assert_eq!(resolve(&parse_class("col-start-3")), Some(vec![decl("grid-column-start", "3")]));
        assert_eq!(resolve(&parse_class("col-end-auto")), Some(vec![decl("grid-column-end", "auto")]));
        assert_eq!(resolve(&parse_class("row-span-3")), Some(vec![decl("grid-row", "span 3 / span 3")]));
        assert_eq!(resolve(&parse_class("row-start-[2]")), Some(vec![decl("grid-row-start", "2")]));
    }

    #[test]
    fn resolves_bare_col_and_row_shorthand() {
        assert_eq!(resolve(&parse_class("col")), Some(vec![decl("grid-column", "auto")]));
        assert_eq!(resolve(&parse_class("col-auto")), Some(vec![decl("grid-column", "auto")]));
        assert_eq!(resolve(&parse_class("col-[span_2]")), Some(vec![decl("grid-column", "span 2")]));
        assert_eq!(resolve(&parse_class("row")), Some(vec![decl("grid-row", "auto")]));
    }

    #[test]
    fn resolves_place_and_justify_alignment() {
        assert_eq!(resolve(&parse_class("place-items-center")), Some(vec![decl("place-items", "center")]));
        assert_eq!(resolve(&parse_class("place-content-between")), Some(vec![decl("place-content", "space-between")]));
        assert_eq!(resolve(&parse_class("place-self-auto")), Some(vec![decl("place-self", "auto")]));
        assert_eq!(resolve(&parse_class("justify-items-stretch")), Some(vec![decl("justify-items", "stretch")]));
        assert_eq!(resolve(&parse_class("justify-self-end")), Some(vec![decl("justify-self", "end")]));
    }

    #[test]
    fn returns_none_for_unknown_grid_utility() {
        assert_eq!(resolve(&parse_class("not-a-grid-utility")), None);
    }
}
