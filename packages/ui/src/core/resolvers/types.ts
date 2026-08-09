import type { ParsedClass, StyleValue, ThemeConfig } from '../types';

/**
 * A dynamic utility resolver: takes a parsed class token and the active theme,
 * returns the StyleValue it maps to, or null when the value isn't recognised.
 * Shared by every file under core/resolvers/ so they all plug into the same
 * RESOLVERS map in utilities.ts without needing their own copy of this type.
 */
export type Resolver = (parsed: ParsedClass, theme: ThemeConfig) => StyleValue | null;
