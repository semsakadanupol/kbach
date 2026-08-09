/**
 * Bounded LRU cache using Map's insertion-order iteration.
 * Map.keys().next() gives the oldest entry for O(1) eviction.
 * Safe upper bound prevents unbounded growth (no memory leak).
 */
export class LRUCache<K, V> {
  private readonly capacity: number;
  private readonly cache: Map<K, V>;
  private readonly onEvict?: (key: K, value: V) => void;

  constructor(capacity = 10_000, onEvict?: (key: K, value: V) => void) {
    this.capacity = capacity;
    if (capacity <= 0) throw new Error('LRUCache: capacity must be a positive integer');
    this.cache = new Map();
    this.onEvict = onEvict;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    // Refresh insertion order = "recently used"
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): this {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Evict least-recently-used (first key in Map)
      const oldestKey = this.cache.keys().next().value as K;
      const oldestValue = this.cache.get(oldestKey) as V;
      this.cache.delete(oldestKey);
      this.onEvict?.(oldestKey, oldestValue);
    }
    this.cache.set(key, value);
    return this;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
