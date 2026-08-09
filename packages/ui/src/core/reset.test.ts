import { describe, it, expect } from 'vitest';
import { BASE_RESET } from './reset';

// Regression coverage for a real bug, confirmed on a real app via a live
// browser: the input/textarea reset rule's `:not([type='checkbox'])
// :not([type='radio'])` clauses each add a class-level specificity point —
// (0,2,1) total, MORE than any single utility class (0,1,0) — so this
// reset's `color: inherit` always won the cascade over a text-* color
// utility applied directly to an <input>/<textarea>, REGARDLESS of source
// order (author rules only override on a specificity tie or higher, and
// this reset was never on a tie). A TextInput's own color utility resolved,
// injected, and landed on the element correctly — and still silently never
// painted. :where() wraps the exclusions so they contribute zero
// specificity, leaving the reset at plain-`input`-selector weight, which
// any utility class safely outranks.
describe('BASE_RESET — input/textarea color reset does not out-specificity utility classes', () => {
  it('wraps the type-exclusion :not() clauses in :where() so they add no specificity', () => {
    expect(BASE_RESET).toContain(
      "input:where(:not([type='checkbox']):not([type='radio'])), textarea",
    );
    // The bare (higher-specificity) form must not be present anywhere.
    expect(BASE_RESET).not.toContain(
      "input:not([type='checkbox']):not([type='radio']), textarea",
    );
  });
});
