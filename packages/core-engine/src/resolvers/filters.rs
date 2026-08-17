//! CSS `filter`/`backdrop-filter` utilities — web-only by construction
//! (React Native has no filter/backdrop-filter concept at all; unlike
//! `resolvers::grid`, there isn't even a partial native story to gate). Uses
//! the exact CSS-custom-property composition technique
//! `old-kbach/packages/ui/src/core/resolvers/filters.ts`'s `FILTER_COMPOSE`/
//! `BACKDROP_FILTER_COMPOSE` already prove out — the same pattern
//! `resolvers::transform` ports for the `transform` property. Each
//! filter-family utility sets its own `--kb-*` variable containing a
//! complete function call and emits the identical composed `filter`/
//! `backdrop-filter` declaration; `var(--kb-foo,)` contributes zero tokens
//! when unset, so only the filters actually present on an element end up in
//! the final value, and multiple utilities never clobber each other.
//!
//! Every filter utility here has both a bare form (`blur`, `grayscale`,
//! `invert`, `sepia` — value is `None`) and a dash-value form (`blur-sm`,
//! `grayscale-0`, ...) — unlike most of this engine's other resolvers,
//! which only take a dash-value. `binary_toggle` and `blur_size` both
//! branch on `Option<&str>` for exactly this reason.
//!
//! No negative-value support for `hue-rotate` (`-hue-rotate-30`) — same
//! parser limitation every other angle/offset utility already carries.

use super::{decl, Declaration};
use crate::parser::ParsedClass;

const FILTER_COMPOSE: &str = "var(--kb-blur,) var(--kb-brightness,) var(--kb-contrast,) var(--kb-grayscale,) var(--kb-hue-rotate,) var(--kb-invert,) var(--kb-saturate,) var(--kb-sepia,) var(--kb-drop-shadow,)";
const BACKDROP_FILTER_COMPOSE: &str = "var(--kb-backdrop-blur,) var(--kb-backdrop-brightness,) var(--kb-backdrop-contrast,) var(--kb-backdrop-grayscale,) var(--kb-backdrop-hue-rotate,) var(--kb-backdrop-invert,) var(--kb-backdrop-opacity,) var(--kb-backdrop-saturate,) var(--kb-backdrop-sepia,)";

fn composed(var_name: &str, var_value: String, compose: &str) -> Vec<Declaration> {
    let property = if compose == FILTER_COMPOSE { "filter" } else { "backdrop-filter" };
    vec![decl(var_name, &var_value), decl(property, compose)]
}

fn blur_size(key: &str) -> Option<&'static str> {
    Some(match key {
        "" => "8px",
        "sm" => "4px",
        "md" => "12px",
        "lg" => "16px",
        "xl" => "24px",
        "2xl" => "40px",
        "3xl" => "64px",
        _ => return None,
    })
}

/// Shared by `blur`/`backdrop-blur`: bare -> default size, named -> preset,
/// `none` -> clears the variable (contributes nothing to the compose
/// string), arbitrary -> raw passthrough.
fn resolve_blur(parsed: &ParsedClass, var_name: &str, compose: &str) -> Option<Vec<Declaration>> {
    if parsed.is_arbitrary {
        let value = parsed.value.as_deref()?;
        return Some(composed(var_name, format!("blur({value})"), compose));
    }
    let value = parsed.value.as_deref().unwrap_or("");
    if value == "none" {
        return Some(composed(var_name, String::new(), compose));
    }
    blur_size(value).map(|size| composed(var_name, format!("blur({size})"), compose))
}

/// Shared by brightness/contrast/saturate/backdrop-opacity: non-arbitrary
/// value/100 (`brightness-150` -> 1.5), arbitrary raw.
fn resolve_percent_fn(parsed: &ParsedClass, fn_name: &str, var_name: &str, compose: &str) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(composed(var_name, format!("{fn_name}({value})"), compose));
    }
    let n: f64 = value.parse().ok()?;
    Some(composed(var_name, format!("{fn_name}({})", n / 100.0), compose))
}

/// Shared by grayscale/invert/sepia (+ backdrop variants): bare or any
/// non-"0" value -> full effect, `-0` -> disabled, arbitrary -> raw.
fn resolve_binary_toggle(parsed: &ParsedClass, fn_name: &str, var_name: &str, compose: &str) -> Vec<Declaration> {
    let call = if parsed.is_arbitrary {
        format!("{fn_name}({})", parsed.value.as_deref().unwrap_or(""))
    } else if parsed.value.as_deref() == Some("0") {
        format!("{fn_name}(0)")
    } else {
        format!("{fn_name}(100%)")
    };
    composed(var_name, call, compose)
}

fn resolve_hue_rotate(parsed: &ParsedClass, var_name: &str, compose: &str) -> Option<Vec<Declaration>> {
    let value = parsed.value.as_deref()?;
    let deg = if parsed.is_arbitrary { value.to_string() } else { format!("{}deg", value.parse::<f64>().ok()?) };
    Some(composed(var_name, format!("hue-rotate({deg})"), compose))
}

fn drop_shadow_preset(key: &str) -> Option<&'static str> {
    Some(match key {
        "" => "drop-shadow(0 1px 2px rgba(0,0,0,0.1)) drop-shadow(0 1px 1px rgba(0,0,0,0.06))",
        "sm" => "drop-shadow(0 1px 1px rgba(0,0,0,0.05))",
        "md" => "drop-shadow(0 4px 3px rgba(0,0,0,0.07)) drop-shadow(0 2px 2px rgba(0,0,0,0.06))",
        "lg" => "drop-shadow(0 10px 8px rgba(0,0,0,0.04)) drop-shadow(0 4px 3px rgba(0,0,0,0.1))",
        "xl" => "drop-shadow(0 20px 13px rgba(0,0,0,0.03)) drop-shadow(0 8px 5px rgba(0,0,0,0.08))",
        "2xl" => "drop-shadow(0 25px 25px rgba(0,0,0,0.15))",
        "none" => "drop-shadow(0 0 #0000)",
        _ => return None,
    })
}

pub fn resolve(parsed: &ParsedClass) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "filter" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("filter", value)]);
            }
            if value == "none" {
                return Some(vec![decl("filter", "none")]);
            }
            None
        }
        "backdrop-filter" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("backdrop-filter", value)]);
            }
            if value == "none" {
                return Some(vec![decl("backdrop-filter", "none")]);
            }
            None
        }

        "blur" => resolve_blur(parsed, "--kb-blur", FILTER_COMPOSE),
        "backdrop-blur" => resolve_blur(parsed, "--kb-backdrop-blur", BACKDROP_FILTER_COMPOSE),

        "brightness" => resolve_percent_fn(parsed, "brightness", "--kb-brightness", FILTER_COMPOSE),
        "backdrop-brightness" => resolve_percent_fn(parsed, "brightness", "--kb-backdrop-brightness", BACKDROP_FILTER_COMPOSE),
        "contrast" => resolve_percent_fn(parsed, "contrast", "--kb-contrast", FILTER_COMPOSE),
        "backdrop-contrast" => resolve_percent_fn(parsed, "contrast", "--kb-backdrop-contrast", BACKDROP_FILTER_COMPOSE),
        "saturate" => resolve_percent_fn(parsed, "saturate", "--kb-saturate", FILTER_COMPOSE),
        "backdrop-saturate" => resolve_percent_fn(parsed, "saturate", "--kb-backdrop-saturate", BACKDROP_FILTER_COMPOSE),
        "backdrop-opacity" => resolve_percent_fn(parsed, "opacity", "--kb-backdrop-opacity", BACKDROP_FILTER_COMPOSE),

        "grayscale" => Some(resolve_binary_toggle(parsed, "grayscale", "--kb-grayscale", FILTER_COMPOSE)),
        "backdrop-grayscale" => Some(resolve_binary_toggle(parsed, "grayscale", "--kb-backdrop-grayscale", BACKDROP_FILTER_COMPOSE)),
        "invert" => Some(resolve_binary_toggle(parsed, "invert", "--kb-invert", FILTER_COMPOSE)),
        "backdrop-invert" => Some(resolve_binary_toggle(parsed, "invert", "--kb-backdrop-invert", BACKDROP_FILTER_COMPOSE)),
        "sepia" => Some(resolve_binary_toggle(parsed, "sepia", "--kb-sepia", FILTER_COMPOSE)),
        "backdrop-sepia" => Some(resolve_binary_toggle(parsed, "sepia", "--kb-backdrop-sepia", BACKDROP_FILTER_COMPOSE)),

        "hue-rotate" => resolve_hue_rotate(parsed, "--kb-hue-rotate", FILTER_COMPOSE),
        "backdrop-hue-rotate" => resolve_hue_rotate(parsed, "--kb-backdrop-hue-rotate", BACKDROP_FILTER_COMPOSE),

        "drop-shadow" => {
            if parsed.is_arbitrary {
                let value = parsed.value.as_deref()?;
                return Some(composed("--kb-drop-shadow", format!("drop-shadow({value})"), FILTER_COMPOSE));
            }
            let value = parsed.value.as_deref().unwrap_or("");
            drop_shadow_preset(value).map(|v| composed("--kb-drop-shadow", v.to_string(), FILTER_COMPOSE))
        }

        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;

    #[test]
    fn resolves_bare_and_named_blur() {
        assert_eq!(
            resolve(&parse_class("blur")),
            Some(vec![decl("--kb-blur", "blur(8px)"), decl("filter", FILTER_COMPOSE)]),
        );
        assert_eq!(
            resolve(&parse_class("blur-lg")),
            Some(vec![decl("--kb-blur", "blur(16px)"), decl("filter", FILTER_COMPOSE)]),
        );
        assert_eq!(resolve(&parse_class("blur-none")), Some(vec![decl("--kb-blur", ""), decl("filter", FILTER_COMPOSE)]));
        assert_eq!(
            resolve(&parse_class("blur-[10px]")),
            Some(vec![decl("--kb-blur", "blur(10px)"), decl("filter", FILTER_COMPOSE)]),
        );
    }

    #[test]
    fn resolves_percent_based_filters() {
        assert_eq!(
            resolve(&parse_class("brightness-150")),
            Some(vec![decl("--kb-brightness", "brightness(1.5)"), decl("filter", FILTER_COMPOSE)]),
        );
        assert_eq!(
            resolve(&parse_class("contrast-[1.75]")),
            Some(vec![decl("--kb-contrast", "contrast(1.75)"), decl("filter", FILTER_COMPOSE)]),
        );
    }

    #[test]
    fn resolves_binary_toggle_filters_bare_and_zeroed() {
        assert_eq!(
            resolve(&parse_class("grayscale")),
            Some(vec![decl("--kb-grayscale", "grayscale(100%)"), decl("filter", FILTER_COMPOSE)]),
        );
        assert_eq!(
            resolve(&parse_class("grayscale-0")),
            Some(vec![decl("--kb-grayscale", "grayscale(0)"), decl("filter", FILTER_COMPOSE)]),
        );
        assert_eq!(
            resolve(&parse_class("invert")),
            Some(vec![decl("--kb-invert", "invert(100%)"), decl("filter", FILTER_COMPOSE)]),
        );
        assert_eq!(
            resolve(&parse_class("sepia")),
            Some(vec![decl("--kb-sepia", "sepia(100%)"), decl("filter", FILTER_COMPOSE)]),
        );
    }

    #[test]
    fn resolves_hue_rotate() {
        assert_eq!(
            resolve(&parse_class("hue-rotate-30")),
            Some(vec![decl("--kb-hue-rotate", "hue-rotate(30deg)"), decl("filter", FILTER_COMPOSE)]),
        );
        assert_eq!(
            resolve(&parse_class("hue-rotate-[0.5turn]")),
            Some(vec![decl("--kb-hue-rotate", "hue-rotate(0.5turn)"), decl("filter", FILTER_COMPOSE)]),
        );
    }

    #[test]
    fn resolves_drop_shadow_presets_and_arbitrary() {
        assert_eq!(
            resolve(&parse_class("drop-shadow-none")),
            Some(vec![decl("--kb-drop-shadow", "drop-shadow(0 0 #0000)"), decl("filter", FILTER_COMPOSE)]),
        );
        assert_eq!(
            resolve(&parse_class("drop-shadow-[0_4px_3px_red]")),
            Some(vec![decl("--kb-drop-shadow", "drop-shadow(0 4px 3px red)"), decl("filter", FILTER_COMPOSE)]),
        );
    }

    #[test]
    fn resolves_backdrop_variants_including_opacity() {
        assert_eq!(
            resolve(&parse_class("backdrop-blur-sm")),
            Some(vec![decl("--kb-backdrop-blur", "blur(4px)"), decl("backdrop-filter", BACKDROP_FILTER_COMPOSE)]),
        );
        assert_eq!(
            resolve(&parse_class("backdrop-opacity-50")),
            Some(vec![decl("--kb-backdrop-opacity", "opacity(0.5)"), decl("backdrop-filter", BACKDROP_FILTER_COMPOSE)]),
        );
        assert_eq!(
            resolve(&parse_class("backdrop-grayscale")),
            Some(vec![decl("--kb-backdrop-grayscale", "grayscale(100%)"), decl("backdrop-filter", BACKDROP_FILTER_COMPOSE)]),
        );
    }

    #[test]
    fn resolves_filter_and_backdrop_filter_overrides() {
        assert_eq!(resolve(&parse_class("filter-none")), Some(vec![decl("filter", "none")]));
        assert_eq!(resolve(&parse_class("filter-[blur(4px)_grayscale(1)]")), Some(vec![decl("filter", "blur(4px) grayscale(1)")]));
        assert_eq!(resolve(&parse_class("backdrop-filter-none")), Some(vec![decl("backdrop-filter", "none")]));
    }

    #[test]
    fn returns_none_for_unknown_filter_utility() {
        assert_eq!(resolve(&parse_class("not-a-filter-utility")), None);
    }
}
