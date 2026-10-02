import { describe, it, expect } from 'vitest';
import { suggestCorrection } from './suggestCorrection';
import { BASE_UTILITIES } from './generatedVocabulary';

describe('suggestCorrection', () => {
  it('returns null for an already-known token', () => {
    expect(suggestCorrection('flex')).toBeNull();
  });

  it('suggests a correction for a one-character deletion typo', () => {
    expect(BASE_UTILITIES).toContain('flex');
    expect(suggestCorrection('flexx')).toBe('flex');
  });

  it('suggests a correction for a one-character transposition typo', () => {
    expect(suggestCorrection('felx')).toBe('flex');
  });

  it('returns null when nothing in the vocabulary is a one-edit match', () => {
    expect(suggestCorrection('completely-unrelated-garbage-token')).toBeNull();
  });

  it('does not throw on an empty string', () => {
    expect(() => suggestCorrection('')).not.toThrow();
  });
});
