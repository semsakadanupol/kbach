import { describe, it, expect } from 'vitest';
import { parseClass, ARBITRARY_PROPERTY_SENTINEL } from './parser';

/** Mirrors parser.rs's own test suite — see that file for the Rust originals. */
describe('parseClass', () => {
  it('parses a value-bearing utility', () => {
    const p = parseClass('bg-blue-6');
    expect(p.utility).toBe('bg');
    expect(p.value).toBe('blue-6');
    expect(p.modifiers).toEqual([]);
    expect(p.isArbitrary).toBe(false);
    expect(p.important).toBe(false);
    expect(p.original).toBe('bg-blue-6');
  });

  it('parses a dark modifier', () => {
    const p = parseClass('dark:bg-blue-6');
    expect(p.modifiers).toEqual(['dark']);
    expect(p.utility).toBe('bg');
    expect(p.value).toBe('blue-6');
  });

  it('parses a chained modifier', () => {
    const p = parseClass('dark:hover:bg-blue-6');
    expect(p.modifiers).toEqual(['dark', 'hover']);
    expect(p.utility).toBe('bg');
  });

  it('parses a standalone utility with no value', () => {
    const p = parseClass('flex');
    expect(p.utility).toBe('flex');
    expect(p.value).toBeNull();
  });

  it('does not split a standalone multi-word utility', () => {
    const p = parseClass('items-center');
    expect(p.utility).toBe('items-center');
    expect(p.value).toBeNull();
  });

  it('disambiguates gap-x from gap', () => {
    expect(parseClass('gap-x-4').utility).toBe('gap-x');
    expect(parseClass('gap-x-4').value).toBe('4');
    expect(parseClass('gap-4').utility).toBe('gap');
  });

  it('disambiguates bg-opacity from bg', () => {
    expect(parseClass('bg-opacity-50').utility).toBe('bg-opacity');
    expect(parseClass('bg-opacity-50').value).toBe('50');
    expect(parseClass('bg-blue-6').utility).toBe('bg');
  });

  it('disambiguates min-w from w', () => {
    expect(parseClass('min-w-4').utility).toBe('min-w');
    expect(parseClass('w-4').utility).toBe('w');
  });

  it('parses a safe arbitrary value', () => {
    const p = parseClass('bg-[#6366f1]');
    expect(p.utility).toBe('bg');
    expect(p.value).toBe('#6366f1');
    expect(p.isArbitrary).toBe(true);
  });

  it('converts underscores to spaces in multi-part arbitrary values', () => {
    const p = parseClass('shadow-[0_4px_6px_red]');
    expect(p.utility).toBe('shadow');
    expect(p.value).toBe('0 4px 6px red');
    expect(p.isArbitrary).toBe(true);
    expect(p.original).toBe('shadow-[0_4px_6px_red]');
  });

  it('rejects an unsafe arbitrary value containing a brace', () => {
    const p = parseClass('bg-[{evil:1}]');
    expect(p.value).toBeNull();
    expect(p.isArbitrary).toBe(false);
  });

  it('rejects an unsafe arbitrary value containing a semicolon', () => {
    expect(parseClass('p-[1px;evil:1]').value).toBeNull();
  });

  it('parses an important prefix after modifiers', () => {
    const p = parseClass('hover:!bg-blue-6');
    expect(p.modifiers).toEqual(['hover']);
    expect(p.utility).toBe('bg');
    expect(p.value).toBe('blue-6');
    expect(p.important).toBe(true);
    expect(p.original).toBe('hover:!bg-blue-6');
  });

  it('parses an important prefix on a standalone utility', () => {
    const p = parseClass('!flex');
    expect(p.utility).toBe('flex');
    expect(p.important).toBe(true);
  });

  it('does not split a colon nested inside a modifier bracket', () => {
    const p = parseClass('has-[a:hover]:bg-red-6');
    expect(p.modifiers).toEqual(['has-[a:hover]']);
    expect(p.utility).toBe('bg');
    expect(p.value).toBe('red-6');
  });

  it('still splits normally when multiple real modifiers are chained with a bracket modifier', () => {
    const p = parseClass('dark:has-[a:hover]:hover:bg-red-6');
    expect(p.modifiers).toEqual(['dark', 'has-[a:hover]', 'hover']);
    expect(p.utility).toBe('bg');
    expect(p.value).toBe('red-6');
  });

  it('parses a data attribute modifier with an equals sign', () => {
    const p = parseClass('data-[state=open]:block');
    expect(p.modifiers).toEqual(['data-[state=open]']);
    expect(p.utility).toBe('block');
  });

  it('parses an arbitrary property', () => {
    const p = parseClass('[mask-type:luminance]');
    expect(p.utility).toBe(ARBITRARY_PROPERTY_SENTINEL);
    expect(p.value).toBe('mask-type:luminance');
    expect(p.isArbitrary).toBe(true);
    expect(p.modifiers).toEqual([]);
  });

  it('rejects an arbitrary property with no colon or an empty side', () => {
    expect(parseClass('[luminance]').utility).not.toBe(ARBITRARY_PROPERTY_SENTINEL);
    expect(parseClass('[:luminance]').utility).not.toBe(ARBITRARY_PROPERTY_SENTINEL);
    expect(parseClass('[mask-type:]').utility).not.toBe(ARBITRARY_PROPERTY_SENTINEL);
  });

  it('parses a leading negative sign', () => {
    const p = parseClass('-mt-4');
    expect(p.utility).toBe('mt');
    expect(p.value).toBe('4');
    expect(p.negative).toBe(true);
    expect(p.isArbitrary).toBe(false);
    expect(p.original).toBe('-mt-4');
  });

  it('parses a negative sign after modifiers and important', () => {
    const p = parseClass('hover:-mt-4');
    expect(p.modifiers).toEqual(['hover']);
    expect(p.utility).toBe('mt');
    expect(p.negative).toBe(true);

    const important = parseClass('!-mt-4');
    expect(important.utility).toBe('mt');
    expect(important.negative).toBe(true);
    expect(important.important).toBe(true);
  });

  it('a class with no leading dash is not negative', () => {
    expect(parseClass('mt-4').negative).toBe(false);
  });

  it('disambiguates col-span/start/end from bare col', () => {
    expect(parseClass('col-span-2').utility).toBe('col-span');
    expect(parseClass('col-start-3').utility).toBe('col-start');
    expect(parseClass('col-auto').utility).toBe('col');
  });
});
