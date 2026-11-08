//! "Did you mean …?" for a class that resolves to nothing. One place for
//! every binding: the Vite/PostCSS plugin's terminal warning and
//! kbach-vscode's quick fix (through the `suggest_class` WASM export), and
//! the React Native dev warning (resolve_style.rs's `typo_warning`).
//!
//! Two kinds of mistake, tried in this order:
//! 1. A Tailwind CSS shade. Kbach's shades run 1–12, Tailwind's 50–950, and
//!    `bg-blue-500` is the single most common wrong class. Kbach's palette
//!    lines up with Tailwind's at every step (`blue-6` is Tailwind's
//!    `blue-500`, `gray-11` its `gray-950`), so the mapping is exact:
//!    50 → 1, 100 → 2, …, 900 → 10, 950 → 11.
//! 2. A one-character typo (`flexx`, `p-r4`): every single edit of the
//!    class, checked against the real resolver rather than a word list.

use crate::css;
use crate::parser::parse_class;
use crate::resolve_style::edit_distance_1_candidates;
use crate::resolvers::resolve_utility;
use crate::theme::ThemeConfig;

/// Whether `token` (modifiers included) produces a web CSS rule.
pub(crate) fn resolves(token: &str, theme: &ThemeConfig) -> bool {
    let parsed = parse_class(token);
    resolve_utility(&parsed, theme).is_some_and(|decls| css::build_rule(&parsed, &decls, theme).is_some())
}

/// The Kbach shade for a Tailwind CSS shade number, if it is one.
fn kbach_shade(tailwind: &str) -> Option<u32> {
    match tailwind {
        "50" => Some(1),
        "950" => Some(11),
        n => {
            let n: u32 = n.parse().ok()?;
            (n % 100 == 0 && (100..=900).contains(&n)).then_some(n / 100 + 1)
        }
    }
}

/// `bg-blue-500` → `bg-blue-6`, keeping modifiers, `!`, a leading `-` and
/// an opacity suffix (`hover:!bg-blue-500/50` → `hover:!bg-blue-6/50`).
/// Only for a palette family the theme actually has.
fn tailwind_shade(token: &str, theme: &ThemeConfig) -> Option<String> {
    let base_start = token.len() - token.rsplit(':').next().unwrap_or(token).len();
    let (prefix, base) = token.split_at(base_start);
    let (main, opacity) = match base.split_once('/') {
        Some((m, o)) => (m, Some(o)),
        None => (base, None),
    };
    let (rest, shade) = main.rsplit_once('-')?;
    let kbach = kbach_shade(shade)?;
    let family = rest.rsplit('-').next()?;
    if !theme.colors.contains_key(&format!("{family}-1")) {
        return None;
    }
    let mut fixed = format!("{prefix}{rest}-{kbach}");
    if let Some(o) = opacity {
        fixed.push('/');
        fixed.push_str(o);
    }
    Some(fixed)
}

/// A one-edit fix of the class part (modifiers kept). Skips arbitrary
/// values, whose bracket content is user data, and implausible lengths.
fn typo(token: &str, theme: &ThemeConfig) -> Option<String> {
    let base_start = token.len() - token.rsplit(':').next().unwrap_or(token).len();
    let (prefix, base) = token.split_at(base_start);
    if base.contains('[') || base.len() < 3 || base.len() > 40 {
        return None;
    }
    edit_distance_1_candidates(base).into_iter().map(|c| format!("{prefix}{c}")).find(|c| resolves(c, theme))
}

/// The best correction for a `token` that resolves to nothing, or `None`.
/// A suggestion is only ever a class that really resolves.
pub fn suggest_class(token: &str, theme: &ThemeConfig) -> Option<String> {
    if token.is_empty() || resolves(token, theme) {
        return None;
    }
    if let Some(fixed) = tailwind_shade(token, theme).filter(|f| resolves(f, theme)) {
        return Some(fixed);
    }
    typo(token, theme)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn theme() -> ThemeConfig {
        let json = format!(
            r#"{{"colors":{},"spacing":{{}},"screens":{{"sm":640,"md":768,"lg":1024,"xl":1280,"2xl":1536}},"darkMode":"class"}}"#,
            crate::default_colors_json()
        );
        serde_json::from_str(&json).unwrap()
    }

    #[test]
    fn tailwind_shades_map_to_kbach_shades() {
        let t = theme();
        assert_eq!(suggest_class("bg-blue-500", &t).as_deref(), Some("bg-blue-6"));
        assert_eq!(suggest_class("text-gray-50", &t).as_deref(), Some("text-gray-1"));
        assert_eq!(suggest_class("text-gray-950", &t).as_deref(), Some("text-gray-11"));
        assert_eq!(suggest_class("border-slate-200", &t).as_deref(), Some("border-slate-3"));
        assert_eq!(suggest_class("from-amber-400", &t).as_deref(), Some("from-amber-5"));
        assert_eq!(suggest_class("ring-offset-sky-900", &t).as_deref(), Some("ring-offset-sky-10"));
    }

    #[test]
    fn modifiers_important_and_opacity_are_kept() {
        let t = theme();
        assert_eq!(suggest_class("hover:bg-blue-600", &t).as_deref(), Some("hover:bg-blue-7"));
        assert_eq!(suggest_class("dark:md:text-red-400", &t).as_deref(), Some("dark:md:text-red-5"));
        assert_eq!(suggest_class("bg-black/50", &t), None); // resolves already
        assert_eq!(suggest_class("bg-blue-500/50", &t).as_deref(), Some("bg-blue-6/50"));
        assert_eq!(suggest_class("!bg-blue-500", &t).as_deref(), Some("!bg-blue-6"));
    }

    #[test]
    fn typos_get_a_one_edit_fix() {
        let t = theme();
        assert_eq!(suggest_class("flexx", &t).as_deref(), Some("flex"));
        assert_eq!(suggest_class("bg-blu-6", &t).as_deref(), Some("bg-blue-6"));
        assert_eq!(suggest_class("hover:itms-center", &t).as_deref(), Some("hover:items-center"));
    }

    #[test]
    fn no_suggestion_when_nothing_fits() {
        let t = theme();
        assert_eq!(suggest_class("flex", &t), None); // not unknown
        assert_eq!(suggest_class("bg-notacolor-500", &t), None);
        assert_eq!(suggest_class("completely-made-up-thing", &t), None);
        assert_eq!(suggest_class("bg-[#zzz]", &t), None);
        assert_eq!(suggest_class("bg-blue-450", &t), None); // not a Tailwind step
    }
}
