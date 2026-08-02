import { describe, it, expect, vi } from 'vitest';
import { LRUCache } from './cache';

describe('LRUCache', () => {
  it('stores and retrieves values', () => {
    const cache = new LRUCache<string, number>(10);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.has('a')).toBe(true);
  });

  it('returns undefined for a missing key', () => {
    const cache = new LRUCache<string, number>(10);
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.has('missing')).toBe(false);
  });

  it('deletes and clears entries', () => {
    const cache = new LRUCache<string, number>(10);
    cache.set('a', 1).set('b', 2);
    expect(cache.delete('a')).toBe(true);
    expect(cache.has('a')).toBe(false);
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new LRUCache(0)).toThrow();
    expect(() => new LRUCache(-1)).toThrow();
  });

  describe('eviction', () => {
    it('evicts the least-recently-inserted entry once capacity is exceeded', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // capacity 2 — 'a' is oldest, evicted
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.size).toBe(2);
    });

    it('get() refreshes recency, protecting an entry from eviction', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a'); // 'a' is now most-recently-used; 'b' is now oldest
      cache.set('c', 3);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
    });

    it('re-setting an existing key refreshes recency without evicting anything', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('a', 99); // update, not insert — 'b' is now oldest, size stays 2
      expect(cache.size).toBe(2);
      expect(cache.get('a')).toBe(99);
      cache.set('c', 3);
      expect(cache.has('b')).toBe(false); // 'b' was oldest, evicted
      expect(cache.has('a')).toBe(true);
    });

    it('invokes onEvict exactly once per eviction, with the evicted key and value', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>(2, onEvict);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(onEvict).not.toHaveBeenCalled();
      cache.set('c', 3);
      expect(onEvict).toHaveBeenCalledTimes(1);
      expect(onEvict).toHaveBeenCalledWith('a', 1);
      cache.set('d', 4);
      expect(onEvict).toHaveBeenCalledTimes(2);
      expect(onEvict).toHaveBeenCalledWith('b', 2);
    });

    it('does not call onEvict for delete() or clear() — only capacity-driven eviction', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string, number>(2, onEvict);
      cache.set('a', 1);
      cache.delete('a');
      cache.set('b', 2);
      cache.clear();
      expect(onEvict).not.toHaveBeenCalled();
    });
  });
});
