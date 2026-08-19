//! Reduces a CONSTANT-ONLY `calc()`/`clamp()`/`min()`/`max()` arbitrary
//! value down to a single px number, entirely at resolve time — the piece
//! that makes something like `p-[calc(16px+8px)]` or
//! `p-[clamp(1rem,2rem,3rem)]` actually work on native, where there is no
//! CSS engine to evaluate a real `calc()` string at paint time.
//!
//! Deliberately narrow: only px/rem lengths and bare (unitless) numbers are
//! understood. Any percentage, viewport unit (`vw`/`vh`/`dvh`/...), `var()`,
//! or other CSS type this can't reduce to a single build-time constant
//! makes the WHOLE expression unreducible (`None`) — reducing "most of" an
//! expression and guessing at the rest would silently produce a wrong
//! number, which is worse than clearly not resolving at all. Percentage-
//! relative `calc()` (`calc(50%-0.5rem)`) genuinely can't be reduced this
//! way on native — it needs the parent's actual layout size, which doesn't
//! exist until paint time — see `resolve_style.rs`'s own doc comment on
//! `rn_style_value` for how that unreducible case is surfaced instead
//! (dropped + a dev-facing warning, not silently passed through as invalid
//! RN style JSON).

/// Top-level entry point. `raw` is the arbitrary value's content with its
/// enclosing `[...]` already stripped (e.g. `calc(16px+8px)`), same as
/// every other arbitrary-value consumer in this crate receives it.
pub(crate) fn reduce_constant_math(raw: &str) -> Option<f64> {
    let raw = raw.trim();
    if let Some(inner) = strip_call(raw, "calc") {
        return Evaluator::new(inner).parse_expr_to_end();
    }
    if let Some(inner) = strip_call(raw, "clamp") {
        let args = split_top_level_commas(inner);
        let [min, preferred, max] = <[&str; 3]>::try_from(args).ok()?;
        let (min, preferred, max) = (
            Evaluator::new(min).parse_expr_to_end()?,
            Evaluator::new(preferred).parse_expr_to_end()?,
            Evaluator::new(max).parse_expr_to_end()?,
        );
        // Real CSS clamp(MIN, PREFERRED, MAX) semantics: max(MIN, min(PREFERRED, MAX)).
        return Some(min.max(preferred.min(max)));
    }
    if let Some(inner) = strip_call(raw, "min") {
        return split_top_level_commas(inner)
            .into_iter()
            .map(|arg| Evaluator::new(arg).parse_expr_to_end())
            .try_fold(f64::INFINITY, |acc, v| v.map(|v| acc.min(v)));
    }
    if let Some(inner) = strip_call(raw, "max") {
        return split_top_level_commas(inner)
            .into_iter()
            .map(|arg| Evaluator::new(arg).parse_expr_to_end())
            .try_fold(f64::NEG_INFINITY, |acc, v| v.map(|v| acc.max(v)));
    }
    None
}

fn strip_call<'a>(raw: &'a str, name: &str) -> Option<&'a str> {
    let inner = raw.strip_prefix(name)?.trim_start();
    let inner = inner.strip_prefix('(')?;
    inner.strip_suffix(')')
}

/// Splits `s` on top-level commas only — a comma inside a nested `(...)`
/// (e.g. `min(calc(1rem, 2rem), 3rem)`, unusual but syntactically legal)
/// doesn't count as an argument separator.
fn split_top_level_commas(s: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut start = 0usize;
    for (i, ch) in s.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(s[start..i].trim());
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(s[start..].trim());
    parts
}

/// Recursive-descent evaluator for a single `calc()`-style arithmetic
/// expression, grammar:
///   expr   := term (('+' | '-') term)*
///   term   := factor (('*' | '/') factor)*
///   factor := NUMBER[UNIT] | '(' expr ')'
/// Every length is normalized to a px-equivalent float as it's parsed
/// (`rem` × 16, `px`/bare as-is) — real CSS calc() has type rules about
/// which units can combine, but since everything reducible here already
/// collapses to the same px basis, plain float arithmetic is exactly
/// equivalent without needing to track units through the tree at all.
struct Evaluator<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Evaluator<'a> {
    fn new(s: &'a str) -> Self {
        Evaluator { bytes: s.as_bytes(), pos: 0 }
    }

    fn parse_expr_to_end(mut self) -> Option<f64> {
        let value = self.expr()?;
        self.skip_ws();
        if self.pos == self.bytes.len() { Some(value) } else { None }
    }

    fn skip_ws(&mut self) {
        while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_whitespace() {
            self.pos += 1;
        }
    }

    fn peek(&mut self) -> Option<u8> {
        self.skip_ws();
        self.bytes.get(self.pos).copied()
    }

    fn expr(&mut self) -> Option<f64> {
        let mut value = self.term()?;
        loop {
            match self.peek() {
                Some(b'+') => {
                    self.pos += 1;
                    value += self.term()?;
                }
                Some(b'-') => {
                    self.pos += 1;
                    value -= self.term()?;
                }
                _ => return Some(value),
            }
        }
    }

    fn term(&mut self) -> Option<f64> {
        let mut value = self.factor()?;
        loop {
            match self.peek() {
                Some(b'*') => {
                    self.pos += 1;
                    value *= self.factor()?;
                }
                Some(b'/') => {
                    self.pos += 1;
                    let divisor = self.factor()?;
                    if divisor == 0.0 {
                        return None;
                    }
                    value /= divisor;
                }
                _ => return Some(value),
            }
        }
    }

    fn factor(&mut self) -> Option<f64> {
        match self.peek()? {
            b'(' => {
                self.pos += 1;
                let value = self.expr()?;
                if self.peek() != Some(b')') {
                    return None;
                }
                self.pos += 1;
                Some(value)
            }
            b'-' => {
                self.pos += 1;
                self.factor().map(|v| -v)
            }
            _ => self.number_with_unit(),
        }
    }

    fn number_with_unit(&mut self) -> Option<f64> {
        self.skip_ws();
        let start = self.pos;
        while self.pos < self.bytes.len() && (self.bytes[self.pos].is_ascii_digit() || self.bytes[self.pos] == b'.') {
            self.pos += 1;
        }
        if self.pos == start {
            return None;
        }
        let n: f64 = std::str::from_utf8(&self.bytes[start..self.pos]).ok()?.parse().ok()?;

        // Optional unit suffix — only px/rem are understood; anything else
        // (%, vw, vh, dvh, ch, cm, ...) or a unit-like suffix at all makes
        // this whole reduction fail, since we can't reduce it correctly.
        let unit_start = self.pos;
        while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_alphabetic() {
            self.pos += 1;
        }
        let unit = std::str::from_utf8(&self.bytes[unit_start..self.pos]).ok()?;
        match unit {
            "" => Some(n),
            "px" => Some(n),
            "rem" => Some(n * 16.0),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reduces_simple_px_addition() {
        assert_eq!(reduce_constant_math("calc(16px+8px)"), Some(24.0));
    }

    #[test]
    fn reduces_with_spaces_around_operators() {
        assert_eq!(reduce_constant_math("calc(16px + 8px)"), Some(24.0));
    }

    #[test]
    fn reduces_rem_to_px_at_the_16x_convention() {
        assert_eq!(reduce_constant_math("calc(1rem+8px)"), Some(24.0));
    }

    #[test]
    fn respects_multiplication_and_division_precedence() {
        assert_eq!(reduce_constant_math("calc(10px+2px*3)"), Some(16.0));
        assert_eq!(reduce_constant_math("calc(20px/2-2px)"), Some(8.0));
    }

    #[test]
    fn reduces_a_bare_unitless_scalar_multiplier() {
        assert_eq!(reduce_constant_math("calc(1rem*2)"), Some(32.0));
    }

    #[test]
    fn handles_nested_parens() {
        assert_eq!(reduce_constant_math("calc((16px+8px)*2)"), Some(48.0));
    }

    #[test]
    fn fails_to_reduce_a_percentage_operand() {
        assert_eq!(reduce_constant_math("calc(50%-0.5rem)"), None);
    }

    #[test]
    fn fails_to_reduce_a_viewport_unit_operand() {
        assert_eq!(reduce_constant_math("calc(10vw+8px)"), None);
    }

    #[test]
    fn fails_to_reduce_a_css_variable_operand() {
        assert_eq!(reduce_constant_math("calc(var(--x)+8px)"), None);
    }

    #[test]
    fn fails_on_division_by_zero() {
        assert_eq!(reduce_constant_math("calc(16px/0)"), None);
    }

    #[test]
    fn reduces_clamp_to_the_clamped_constant() {
        // preferred (2rem = 32px) is within [min, max] -> returns preferred.
        assert_eq!(reduce_constant_math("clamp(1rem,2rem,3rem)"), Some(32.0));
        // preferred (0.5rem = 8px) is below min (1rem = 16px) -> clamps up to min.
        assert_eq!(reduce_constant_math("clamp(1rem,0.5rem,3rem)"), Some(16.0));
        // preferred (5rem = 80px) is above max (3rem = 48px) -> clamps down to max.
        assert_eq!(reduce_constant_math("clamp(1rem,5rem,3rem)"), Some(48.0));
    }

    #[test]
    fn fails_to_reduce_clamp_with_a_percentage_argument() {
        assert_eq!(reduce_constant_math("clamp(1rem,50%,3rem)"), None);
    }

    #[test]
    fn reduces_min_and_max_over_constant_arguments() {
        assert_eq!(reduce_constant_math("min(16px,1rem,2rem)"), Some(16.0));
        assert_eq!(reduce_constant_math("max(16px,1rem,2rem)"), Some(32.0));
    }

    #[test]
    fn reduces_min_max_with_more_than_three_arguments() {
        assert_eq!(reduce_constant_math("min(40px,10px,20px,30px)"), Some(10.0));
    }

    #[test]
    fn returns_none_for_a_plain_non_math_value() {
        assert_eq!(reduce_constant_math("16px"), None);
        assert_eq!(reduce_constant_math("50%"), None);
    }

    #[test]
    fn returns_none_for_malformed_calc_syntax() {
        assert_eq!(reduce_constant_math("calc(16px+)"), None);
        assert_eq!(reduce_constant_math("calc(16px+8px"), None); // unbalanced parens caught by strip_call's suffix check
    }
}
