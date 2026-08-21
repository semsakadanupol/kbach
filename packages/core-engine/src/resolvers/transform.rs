//! Transform utilities — web-only by construction, same shape as
//! `resolvers::grid`. React Native DOES have a transform concept
//! (`transform: [{ scale: 1.5 }, { rotate: '45deg' }]`), but it's an
//! array-based format fundamentally incompatible with this module's CSS
//! custom-property composition technique (RN style objects have no
//! cascade, so "each utility sets its own var, the property reads them
//! all" has nothing to compose against) — native transform support would
//! need its own accumulator-based mechanism entirely, deferred rather than
//! half-built here.
//!
//! ## Composition
//!
//! CSS only allows ONE `transform` declaration per element, but Tailwind
//! lets `scale-110 rotate-45 translate-x-4` stack into a single combined
//! transform. Old-kbach's transform resolver (`old-kbach/packages/ui/src/
//! core/resolvers/transform.ts`) actually does NOT do this — each utility
//! sets a whole, unrelated `transform` value, so combining two on one
//! element just has the later one clobber the earlier one. That's a real
//! gap relative to actual Tailwind, not something to carry forward.
//!
//! The fix is the same CSS-custom-property composition technique
//! old-kbach's *filters* resolver already proves out (`filters.ts`'s
//! `FILTER_COMPOSE`): every transform-family utility sets its own `--kb-*`
//! variable containing a complete function call (`"scaleX(1.5)"`,
//! `"rotate(45deg)"`, ...) AND emits the identical `transform:
//! TRANSFORM_COMPOSE_CPU` declaration. `var(--kb-foo,)` — a trailing comma,
//! no fallback — contributes literally zero tokens when `--kb-foo` was
//! never set on that element, so only the transform functions actually
//! present end up in the final value; which specific utilities are on the
//! element doesn't matter to the shared compose string, and multiple
//! utilities setting DIFFERENT `--kb-*` variables on the same element never
//! clobber each other (only same-named custom properties would).
//!
//! `translate-x`/`translate-y` are the one exception to "variable holds a
//! complete function call": they hold BARE operands (`--kb-translate-x:
//! 16px`, falling back to the CSS literal `0` — not empty — wherever
//! they're read, since a 2-argument `translate(x, y)`/`translate3d(x, y,
//! 0)` call can't simply omit an argument the way an independent function
//! slot can vanish) so `transform-gpu`/`transform-cpu` can swap JUST the
//! `translate(...)`-vs-`translate3d(...)` call shape around the SAME pair
//! of values — matching real Tailwind's own technique byte-for-byte
//! (`--tw-translate-x`/`--tw-translate-y`, reset to `0` by its preflight
//! layer this engine doesn't carry, hence the inline `0` fallback here
//! instead). Every translate-x/y-touching utility, and `transform-gpu`/
//! `transform-cpu` themselves, all emit the identical CPU-or-GPU-shaped
//! compose string — so which one actually wins the cascade (and therefore
//! which translate shape renders) comes down to ordinary "last matching
//! rule wins" source order, the same "write classes in the order you want
//! them to apply" convention already used for `divide-style`/`dark:`
//! overrides elsewhere in this engine. `translate-z` stays an independent,
//! always-optional slot (real Tailwind's default scope has no z-axis
//! translate at all — this engine's own 3D extension — so `transform-gpu`
//! doesn't touch it).
//!
//! Bare `scale-*` sets BOTH `--kb-scale-x` and `--kb-scale-y` (matching
//! real Tailwind: `scale-150` scales both axes), so it composes correctly
//! with a later, more specific `scale-x-*`/`scale-y-*` on the same element.
//!
//! `translate-x`/`translate-y`/`translate-z` support real Tailwind's
//! negative-value convention (`-translate-x-4`) via `resolve_negatable_length`
//! — same mechanism `layout.rs`'s `top`/`right`/`bottom`/`left`/`inset` and
//! `spacing.rs`'s margin utilities use. `rotate`/`rotate-x`/`rotate-y`/
//! `rotate-z`/`skew-x`/`skew-y` ALSO support it (`-rotate-45`), via `angle`'s
//! own negation of the parsed numeric degree value — real Tailwind
//! genuinely does register a negative named scale for these. `scale`/
//! `scale-x`/`scale-y`/`scale-z` are the one exception: real Tailwind has
//! no negative named scale factor at all (there's no `-scale-50`); a
//! mirrored/flipped scale is written directly via an arbitrary value
//! instead (`scale-x-[-1]`), which already works today since arbitrary
//! values can contain a literal "-".

use super::{decl, resolve_negatable_length, Declaration};
use crate::parser::ParsedClass;
use crate::theme::ThemeConfig;

const TRANSFORM_COMPOSE_CPU: &str = "translate(var(--kb-translate-x,0),var(--kb-translate-y,0)) var(--kb-translate-z,) var(--kb-rotate,) var(--kb-rotate-x,) var(--kb-rotate-y,) var(--kb-rotate-z,) var(--kb-skew-x,) var(--kb-skew-y,) var(--kb-scale-x,) var(--kb-scale-y,) var(--kb-scale-z,)";
const TRANSFORM_COMPOSE_GPU: &str = "translate3d(var(--kb-translate-x,0),var(--kb-translate-y,0),0) var(--kb-translate-z,) var(--kb-rotate,) var(--kb-rotate-x,) var(--kb-rotate-y,) var(--kb-rotate-z,) var(--kb-skew-x,) var(--kb-skew-y,) var(--kb-scale-x,) var(--kb-scale-y,) var(--kb-scale-z,)";

fn composed(var_decls: Vec<Declaration>) -> Vec<Declaration> {
    let mut decls = var_decls;
    decls.push(decl("transform", TRANSFORM_COMPOSE_CPU));
    decls
}

/// Non-arbitrary: `scale-150` -> value="150" -> 150/100 = 1.5.
/// Arbitrary: `scale-[1.75]` -> value="1.75" -> used as the factor directly.
fn scale_factor(parsed: &ParsedClass) -> Option<f64> {
    let value = parsed.value.as_deref()?;
    let n: f64 = value.parse().ok()?;
    Some(if parsed.is_arbitrary { n } else { n / 100.0 })
}

/// Non-arbitrary: `rotate-45` -> "45deg", negative-aware (`-rotate-45` ->
/// "-45deg" — real Tailwind DOES register a negative named scale for
/// rotate/skew, unlike scale, which has none). Arbitrary: `rotate-[0.5turn]`
/// -> used as-is, preserving whatever unit (deg/rad/turn/grad) was written
/// — negation for an arbitrary angle is already expressible directly in the
/// value itself (`rotate-[-0.5turn]`), so `parsed.negative` is ignored for
/// that branch (mirrors `resolve_negatable_length`'s identical "arbitrary
/// values have their own way to be negative" reasoning).
fn angle(parsed: &ParsedClass) -> Option<String> {
    let value = parsed.value.as_deref()?;
    if parsed.is_arbitrary {
        return Some(value.to_string());
    }
    let n: f64 = value.parse().ok()?;
    let n = if parsed.negative { -n } else { n };
    Some(format!("{n}deg"))
}

/// Real Tailwind's named `perspective` scale.
fn perspective_value(key: &str) -> Option<&'static str> {
    Some(match key {
        "dramatic" => "100px",
        "near" => "300px",
        "normal" => "500px",
        "midrange" => "800px",
        "distant" => "1200px",
        "none" => "none",
        _ => return None,
    })
}

const ORIGIN_KEYWORDS: &[(&str, &str)] = &[
    ("center", "center"),
    ("top", "top"),
    ("top-right", "top right"),
    ("right", "right"),
    ("bottom-right", "bottom right"),
    ("bottom", "bottom"),
    ("bottom-left", "bottom left"),
    ("left", "left"),
    ("top-left", "top left"),
];

pub fn resolve(parsed: &ParsedClass, theme: &ThemeConfig) -> Option<Vec<Declaration>> {
    match parsed.utility.as_str() {
        "transform-none" => Some(vec![decl("transform", "none")]),
        // Byte-for-byte real Tailwind's own technique: swap the WHOLE
        // compose chain's translate call between `translate()` (CPU) and
        // `translate3d(x, y, 0)` (GPU, promoting the element onto its own
        // compositor layer) — see this module's own doc comment for why
        // `translate-x`/`translate-y` hold bare operands specifically to
        // make this possible, and why the winning shape is just whichever
        // of these two classes sorts last among the transform family on
        // the same element.
        "transform-gpu" => Some(vec![decl("transform", TRANSFORM_COMPOSE_GPU)]),
        "transform-cpu" => Some(vec![decl("transform", TRANSFORM_COMPOSE_CPU)]),
        "backface-visible" => Some(vec![decl("backface-visibility", "visible")]),
        "backface-hidden" => Some(vec![decl("backface-visibility", "hidden")]),
        "perspective-origin" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("perspective-origin", value)]);
            }
            ORIGIN_KEYWORDS.iter().find(|(k, _)| *k == value).map(|(_, v)| vec![decl("perspective-origin", v)])
        }
        // A plain CSS `perspective` property on the 3D-transformed
        // element's PARENT — real Tailwind's own named scale (in pixels);
        // arbitrary values pass through as-is.
        "perspective" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("perspective", value)]);
            }
            perspective_value(value).map(|v| vec![decl("perspective", v)])
        }
        "rotate-x" => {
            let deg = angle(parsed)?;
            Some(composed(vec![decl("--kb-rotate-x", &format!("rotateX({deg})"))]))
        }
        "rotate-y" => {
            let deg = angle(parsed)?;
            Some(composed(vec![decl("--kb-rotate-y", &format!("rotateY({deg})"))]))
        }
        "rotate-z" => {
            let deg = angle(parsed)?;
            Some(composed(vec![decl("--kb-rotate-z", &format!("rotateZ({deg})"))]))
        }
        "translate-z" => {
            let v = resolve_negatable_length(theme, parsed)?;
            Some(composed(vec![decl("--kb-translate-z", &format!("translateZ({v})"))]))
        }
        "scale-z" => {
            let n = scale_factor(parsed)?;
            Some(composed(vec![decl("--kb-scale-z", &format!("scaleZ({n})"))]))
        }
        "scale" => {
            let n = scale_factor(parsed)?;
            Some(composed(vec![decl("--kb-scale-x", &format!("scaleX({n})")), decl("--kb-scale-y", &format!("scaleY({n})"))]))
        }
        "scale-x" => {
            let n = scale_factor(parsed)?;
            Some(composed(vec![decl("--kb-scale-x", &format!("scaleX({n})"))]))
        }
        "scale-y" => {
            let n = scale_factor(parsed)?;
            Some(composed(vec![decl("--kb-scale-y", &format!("scaleY({n})"))]))
        }
        "rotate" => {
            let deg = angle(parsed)?;
            Some(composed(vec![decl("--kb-rotate", &format!("rotate({deg})"))]))
        }
        "skew-x" => {
            let deg = angle(parsed)?;
            Some(composed(vec![decl("--kb-skew-x", &format!("skewX({deg})"))]))
        }
        "skew-y" => {
            let deg = angle(parsed)?;
            Some(composed(vec![decl("--kb-skew-y", &format!("skewY({deg})"))]))
        }
        "translate-x" => {
            let v = resolve_negatable_length(theme, parsed)?;
            Some(composed(vec![decl("--kb-translate-x", &v)]))
        }
        "translate-y" => {
            let v = resolve_negatable_length(theme, parsed)?;
            Some(composed(vec![decl("--kb-translate-y", &v)]))
        }
        "origin" => {
            let value = parsed.value.as_deref()?;
            if parsed.is_arbitrary {
                return Some(vec![decl("transform-origin", value)]);
            }
            ORIGIN_KEYWORDS.iter().find(|(k, _)| *k == value).map(|(_, v)| vec![decl("transform-origin", v)])
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_class;

    fn theme() -> ThemeConfig {
        let mut spacing = std::collections::HashMap::new();
        spacing.insert("4".to_string(), 16.0);
        ThemeConfig { spacing, ..Default::default() }
    }

    #[test]
    fn resolves_scale_both_axes_and_per_axis() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("scale-150"), &t),
            Some(vec![
                decl("--kb-scale-x", "scaleX(1.5)"),
                decl("--kb-scale-y", "scaleY(1.5)"),
                decl("transform", TRANSFORM_COMPOSE_CPU),
            ]),
        );
        assert_eq!(
            resolve(&parse_class("scale-x-75"), &t),
            Some(vec![decl("--kb-scale-x", "scaleX(0.75)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
        assert_eq!(
            resolve(&parse_class("scale-[1.75]"), &t),
            Some(vec![
                decl("--kb-scale-x", "scaleX(1.75)"),
                decl("--kb-scale-y", "scaleY(1.75)"),
                decl("transform", TRANSFORM_COMPOSE_CPU),
            ]),
        );
    }

    #[test]
    fn resolves_rotate_and_skew() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("rotate-45"), &t),
            Some(vec![decl("--kb-rotate", "rotate(45deg)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
        assert_eq!(
            resolve(&parse_class("rotate-[0.5turn]"), &t),
            Some(vec![decl("--kb-rotate", "rotate(0.5turn)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
        assert_eq!(
            resolve(&parse_class("skew-x-12"), &t),
            Some(vec![decl("--kb-skew-x", "skewX(12deg)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
    }

    #[test]
    fn resolves_translate_via_the_shared_spacing_scale() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("translate-x-4"), &t),
            Some(vec![decl("--kb-translate-x", "16px"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
        assert_eq!(
            resolve(&parse_class("translate-y-full"), &t),
            Some(vec![decl("--kb-translate-y", "100%"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
        assert_eq!(
            resolve(&parse_class("translate-x-[10px]"), &t),
            Some(vec![decl("--kb-translate-x", "10px"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
    }

    #[test]
    fn resolves_negative_rotate_and_skew_via_the_leading_dash_convention() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("-rotate-45"), &t),
            Some(vec![decl("--kb-rotate", "rotate(-45deg)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
        assert_eq!(
            resolve(&parse_class("-skew-x-12"), &t),
            Some(vec![decl("--kb-skew-x", "skewX(-12deg)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
        // Arbitrary angles already express negation directly in the value —
        // parsed.negative is ignored for that branch.
        assert_eq!(
            resolve(&parse_class("rotate-[-45deg]"), &t),
            Some(vec![decl("--kb-rotate", "rotate(-45deg)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
    }

    #[test]
    fn resolves_negative_translate_via_the_leading_dash_convention() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("-translate-x-4"), &t),
            Some(vec![decl("--kb-translate-x", "-16px"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
    }

    #[test]
    fn resolves_3d_rotate_translate_and_scale() {
        let t = theme();
        assert_eq!(
            resolve(&parse_class("rotate-x-45"), &t),
            Some(vec![decl("--kb-rotate-x", "rotateX(45deg)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
        assert_eq!(
            resolve(&parse_class("rotate-y-45"), &t),
            Some(vec![decl("--kb-rotate-y", "rotateY(45deg)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
        assert_eq!(
            resolve(&parse_class("translate-z-4"), &t),
            Some(vec![decl("--kb-translate-z", "translateZ(16px)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
        assert_eq!(
            resolve(&parse_class("scale-z-150"), &t),
            Some(vec![decl("--kb-scale-z", "scaleZ(1.5)"), decl("transform", TRANSFORM_COMPOSE_CPU)]),
        );
    }

    #[test]
    fn resolves_backface_visibility_and_gpu_cpu_hints() {
        let t = theme();
        assert_eq!(resolve(&parse_class("backface-hidden"), &t), Some(vec![decl("backface-visibility", "hidden")]));
        assert_eq!(resolve(&parse_class("backface-visible"), &t), Some(vec![decl("backface-visibility", "visible")]));
        assert_eq!(resolve(&parse_class("transform-gpu"), &t), Some(vec![decl("transform", TRANSFORM_COMPOSE_GPU)]));
        assert_eq!(resolve(&parse_class("transform-cpu"), &t), Some(vec![decl("transform", TRANSFORM_COMPOSE_CPU)]));
    }

    #[test]
    fn transform_gpu_swaps_translate_for_translate3d_around_the_same_bare_operand_variables() {
        // Real Tailwind's own technique: `translate-x-4 transform-gpu`
        // still reads the SAME `--kb-translate-x`/`--kb-translate-y`
        // variables `translate-x`/`translate-y` set — `transform-gpu`
        // only changes which call SHAPE wraps them (and, since every
        // transform-family utility emits this identical compose string,
        // ONLY the operand variables — never the call shape a specific
        // OTHER utility rule happened to bake in — actually persist across
        // the whole class list).
        assert!(TRANSFORM_COMPOSE_CPU.starts_with("translate(var(--kb-translate-x,0),var(--kb-translate-y,0))"));
        assert!(TRANSFORM_COMPOSE_GPU.starts_with("translate3d(var(--kb-translate-x,0),var(--kb-translate-y,0),0)"));
        // Beyond the translate call shape, both variants reference the
        // exact same remaining slots in the exact same order.
        let cpu_rest = TRANSFORM_COMPOSE_CPU.split_once(' ').unwrap().1;
        let gpu_rest = TRANSFORM_COMPOSE_GPU.split_once(' ').unwrap().1;
        assert_eq!(cpu_rest, gpu_rest);
    }

    #[test]
    fn resolves_perspective_and_perspective_origin() {
        let t = theme();
        assert_eq!(resolve(&parse_class("perspective-normal"), &t), Some(vec![decl("perspective", "500px")]));
        assert_eq!(resolve(&parse_class("perspective-none"), &t), Some(vec![decl("perspective", "none")]));
        assert_eq!(resolve(&parse_class("perspective-[1000px]"), &t), Some(vec![decl("perspective", "1000px")]));
        assert_eq!(resolve(&parse_class("perspective-origin-top-left"), &t), Some(vec![decl("perspective-origin", "top left")]));
    }

    #[test]
    fn resolves_transform_origin_named_and_arbitrary() {
        let t = theme();
        assert_eq!(resolve(&parse_class("origin-top-left"), &t), Some(vec![decl("transform-origin", "top left")]));
        assert_eq!(resolve(&parse_class("origin-[10px_20px]"), &t), Some(vec![decl("transform-origin", "10px 20px")]));
    }

    #[test]
    fn resolves_transform_none() {
        let t = theme();
        assert_eq!(resolve(&parse_class("transform-none"), &t), Some(vec![decl("transform", "none")]));
    }

    #[test]
    fn returns_none_for_unknown_transform_utility() {
        let t = theme();
        assert_eq!(resolve(&parse_class("not-a-transform-utility"), &t), None);
    }
}
