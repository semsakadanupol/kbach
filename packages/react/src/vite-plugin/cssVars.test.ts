import { describe, it, expect } from 'vitest';
import { buildColorVarMap, buildSpacingVarMap, applyVarMap } from './cssVars';
import type { ThemeConfig } from '../theme';

function theme(): ThemeConfig {
  return {
    colors: { 'indigo-6': '#6366f1' },
    spacing: { '4': 16 },
    screens: {},
    darkMode: 'attribute',
  };
}

describe('buildColorVarMap + applyVarMap', () => {
  it('substitutes a plain hex declaration value with a var()', () => {
    const css = '.border-x { border-color: #6366f1 }';
    const map = buildColorVarMap(theme(), css);
    const { text, declarations } = applyVarMap(css, map);
    expect(text).toBe('.border-x { border-color: var(--color-indigo-6) }');
    expect(declarations.get('--color-indigo-6')).toBe('#6366f1');
  });

  it('substitutes an rgba() opacity-composition triplet with a var()', () => {
    const css = '.bg-indigo-6 { background-color: rgba(99,102,241,var(--bg-opacity, 1)) }';
    const map = buildColorVarMap(theme(), css);
    const { text } = applyVarMap(css, map);
    expect(text).toBe('.bg-indigo-6 { background-color: rgba(var(--color-indigo-6-rgb),var(--bg-opacity, 1)) }');
  });

  it('REGRESSION: leaves a hex-arbitrary-value selector untouched even when it matches a real theme color', () => {
    // old-kbach bug: a naive string replace corrupted the escaped selector
    // "\#6366f1" (from an arbitrary-value class) because it matched the same
    // literal substring the declaration-value substitution was targeting.
    const css = '.bg-\\[\\#6366f1\\] { background-color: #6366f1 }';
    const map = buildColorVarMap(theme(), css);
    const { text } = applyVarMap(css, map);
    expect(text).toContain('.bg-\\[\\#6366f1\\]');
    expect(text).toContain('background-color: var(--color-indigo-6)');
    expect(text).not.toContain('\\var(');
  });

  it('does not extract a color that never appears in the CSS text', () => {
    const css = '.flex { display: flex }';
    const map = buildColorVarMap(theme(), css);
    expect(map.declarations.size).toBe(0);
  });
});

describe('buildSpacingVarMap', () => {
  it('substitutes a spacing-scale px value on a known spacing property', () => {
    const css = '.p-4 { padding: 16px }';
    const map = buildSpacingVarMap(theme(), css);
    const { text } = applyVarMap(css, map);
    expect(text).toBe('.p-4 { padding: var(--spacing-4) }');
  });

  it('does not substitute a coincidentally-matching px value on an unrelated (non-spacing) property', () => {
    const css = '.text-lg { font-size: 16px }'; // 16px coincidentally equals spacing key "4"
    const map = buildSpacingVarMap(theme(), css);
    const { text } = applyVarMap(css, map);
    expect(text).toBe('.text-lg { font-size: 16px }');
  });
});
