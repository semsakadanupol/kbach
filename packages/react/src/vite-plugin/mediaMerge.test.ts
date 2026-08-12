import { describe, it, expect } from 'vitest';
import { mergeResponsiveMediaBlocks } from './mediaMerge';

describe('mergeResponsiveMediaBlocks', () => {
  it('merges multiple rules at the same breakpoint into a single @media wrapper', () => {
    const rules = [
      '@media (min-width: 640px) { .sm\\:text-lg { font-size: 1.125rem } }',
      '@media (min-width: 640px) { .sm\\:flex { display: flex } }',
    ];
    const result = mergeResponsiveMediaBlocks(rules);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(
      '@media (min-width: 640px) { .sm\\:text-lg { font-size: 1.125rem } .sm\\:flex { display: flex } }',
    );
  });

  it('keeps different breakpoints in their own separate @media blocks', () => {
    const rules = [
      '@media (min-width: 640px) { .sm\\:flex { display: flex } }',
      '@media (min-width: 768px) { .md\\:flex { display: flex } }',
    ];
    const result = mergeResponsiveMediaBlocks(rules);
    expect(result).toHaveLength(2);
  });

  it('orders merged blocks ascending by min-width regardless of scan order', () => {
    const rules = [
      '@media (min-width: 1024px) { .lg\\:flex { display: flex } }',
      '@media (min-width: 640px) { .sm\\:flex { display: flex } }',
      '@media (min-width: 768px) { .md\\:flex { display: flex } }',
    ];
    const result = mergeResponsiveMediaBlocks(rules);
    expect(result[0]).toContain('640px');
    expect(result[1]).toContain('768px');
    expect(result[2]).toContain('1024px');
  });

  it('leaves non-min-width @media rules (e.g. prefers-color-scheme) untouched', () => {
    const rules = ['@media (prefers-color-scheme: dark) { .dark\\:bg-blue-8 { background-color: #1e40af } }'];
    const result = mergeResponsiveMediaBlocks(rules);
    expect(result).toEqual(rules);
  });

  it('leaves plain (non-media) rules untouched', () => {
    const rules = ['.flex { display: flex }'];
    expect(mergeResponsiveMediaBlocks(rules)).toEqual(rules);
  });
});
