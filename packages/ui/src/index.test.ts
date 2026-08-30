import { describe, it, expect } from 'vitest';
import { clsx } from './index';
import clsxDefault from './index';

describe('clsx', () => {
  it('joins plain strings with a space', () => {
    expect(clsx('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('drops falsy values entirely — no stray extra spaces', () => {
    expect(clsx('px-4', false, null, undefined, 0, '', 'py-2')).toBe('px-4 py-2');
    expect(clsx(false, null, undefined)).toBe('');
  });

  it('keeps a truthy conditional expression, drops a falsy one', () => {
    const isActive = true;
    const isDisabled = false;
    expect(clsx('base', isActive && 'bg-blue-6', isDisabled && 'opacity-50')).toBe('base bg-blue-6');
  });

  it('resolves an object, keeping only truthy keys', () => {
    expect(clsx({ 'opacity-50': true, 'cursor-not-allowed': false, 'font-bold': 1 })).toBe('opacity-50 font-bold');
  });

  it('flattens arrays to any depth', () => {
    expect(clsx(['px-4', 'py-2'])).toBe('px-4 py-2');
    expect(clsx(['px-4', ['py-2', ['bg-blue-6']]])).toBe('px-4 py-2 bg-blue-6');
  });

  it('mixes strings, objects, and arrays in one call', () => {
    expect(clsx('base', ['px-4', { 'bg-blue-6': true }], { 'opacity-50': false })).toBe('base px-4 bg-blue-6');
  });

  it('stringifies numbers and bigints, but drops the number 0', () => {
    expect(clsx(0, 1, 2n)).toBe('1 2');
  });

  it('keeps a literal "0" string, unlike the number 0', () => {
    expect(clsx('0')).toBe('0');
  });

  it('returns an empty string for no arguments or all-falsy arguments', () => {
    expect(clsx()).toBe('');
    expect(clsx(undefined, null, false)).toBe('');
  });

  it('only counts a dictionary key with its OWN property, not an inherited one', () => {
    const proto = { inherited: true };
    const dict = Object.create(proto) as Record<string, boolean>;
    dict.own = true;
    expect(clsx(dict)).toBe('own');
  });

  it('is importable as both a named export and the default export', () => {
    expect(clsxDefault).toBe(clsx);
    expect(clsxDefault('a', 'b')).toBe('a b');
  });
});
