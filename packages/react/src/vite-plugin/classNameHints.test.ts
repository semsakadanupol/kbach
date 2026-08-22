import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildClassTokens, buildClassNameHintsDts } from './classNameHints';
import type { ThemeConfig } from '../theme';

const thisDir = dirname(fileURLToPath(import.meta.url));

function theme(): ThemeConfig {
  return {
    colors: { 'blue-6': '#2563eb', surface: { light: '#f9fafb', dark: '#111827' } },
    spacing: { '4': 16, '6': 24 },
    screens: {},
    darkMode: 'attribute',
  };
}

describe('buildClassTokens', () => {
  it('includes structural (theme-independent) utility names', () => {
    const tokens = buildClassTokens(theme());
    expect(tokens).toContain('flex');
    expect(tokens).toContain('items-center');
    expect(tokens).toContain('rounded-lg');
    expect(tokens).toContain('font-bold');
  });

  it('includes bare modifier prefixes', () => {
    const tokens = buildClassTokens(theme());
    expect(tokens).toContain('hover:');
    expect(tokens).toContain('dark:');
    expect(tokens).toContain('sm:');
  });

  it('crosses every theme color with bg-/text-/border-/divide- prefixes', () => {
    const tokens = buildClassTokens(theme());
    for (const prefix of ['bg-', 'text-', 'border-', 'divide-']) {
      expect(tokens).toContain(`${prefix}blue-6`);
      expect(tokens).toContain(`${prefix}surface`);
    }
  });

  it('crosses every theme spacing key with padding/margin/gap/size/inset prefixes', () => {
    const tokens = buildClassTokens(theme());
    for (const key of ['4', '6']) {
      expect(tokens).toContain(`p-${key}`);
      expect(tokens).toContain(`mt-${key}`);
      expect(tokens).toContain(`gap-x-${key}`);
      expect(tokens).toContain(`w-${key}`);
      expect(tokens).toContain(`top-${key}`);
      expect(tokens).toContain(`space-x-${key}`);
    }
  });

  it('does not include a color/spacing key that is not actually in the theme', () => {
    const tokens = buildClassTokens(theme());
    expect(tokens).not.toContain('bg-blue-8');
    expect(tokens).not.toContain('p-8');
  });
});

describe('buildClassNameHintsDts', () => {
  it('renders each token as a string literal in the KbachClassToken union', () => {
    const dts = buildClassNameHintsDts(['flex', 'bg-blue-6']);
    expect(dts).toContain("| 'flex'");
    expect(dts).toContain("| 'bg-blue-6'");
  });

  it('includes the (string & {}) escape hatch so arbitrary classes still type-check', () => {
    const dts = buildClassNameHintsDts(['flex']);
    expect(dts).toContain('(string & {})');
  });

  it('includes the last-token-after-a-space branch', () => {
    const dts = buildClassNameHintsDts(['flex']);
    expect(dts).toContain('`${string} ${KbachClassToken}`');
  });

  it('augments className on both HTMLAttributes and SVGAttributes', () => {
    const dts = buildClassNameHintsDts(['flex']);
    expect(dts).toContain('interface HTMLAttributes<T>');
    expect(dts).toContain('interface SVGAttributes<T>');
    expect(dts).toContain("declare module 'react'");
  });

  // The real proof, not just string matching: does the generated .d.ts
  // actually compile against a genuine HTMLAttributes/SVGAttributes usage?
  // Placed as a SIBLING of packages/react/src (not a bare OS temp dir, and
  // deliberately NOT inside src/ itself) so `react` still resolves via this
  // package's own node_modules (the same node_modules-resolution walk-up
  // works identically one level up) — same manual check (declaration-
  // merging into HTMLAttributes<T>) already proven to compile during
  // Phase 15 planning, now automated. Must stay OUTSIDE src/: tsup's own
  // DTS bundler globs everything under src/, so this directory's transient
  // existence during the test raced with a concurrent `build` run once
  // turbo scheduled `test`/`build` for this package at the same time,
  // intermittently failing the build with a stray "file not found" once
  // this test's own `finally` cleanup deleted it mid-bundle.
  it('compiles against real @types/react HTMLAttributes/SVGAttributes usage', () => {
    const dir = join(thisDir, '..', '..', '__hints_compile_check__');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    try {
      writeFileSync(join(dir, 'hints.d.ts'), buildClassNameHintsDts(['flex', 'items-center']));
      writeFileSync(
        join(dir, 'usage.ts'),
        [
          "import type { HTMLAttributes, SVGAttributes } from 'react';",
          'function useDiv(props: HTMLAttributes<HTMLDivElement>) {',
          "  props.className = 'flex';",
          "  props.className = 'anything not in the list';",
          '}',
          'function useSvg(props: SVGAttributes<SVGElement>) {',
          "  props.className = 'items-center';",
          '}',
        ].join('\n'),
      );

      expect(() =>
        execFileSync(
          'npx',
          [
            'tsc', '--noEmit', '--skipLibCheck', '--esModuleInterop',
            '--moduleResolution', 'bundler', '--ignoreConfig',
            join(dir, 'hints.d.ts'), join(dir, 'usage.ts'),
          ],
          { cwd: join(thisDir, '..', '..'), stdio: 'pipe', shell: true },
        ),
      ).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
