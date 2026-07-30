import type { ParsedClass, StyleValue, ThemeConfig } from './types';
import { getEffectiveIsWeb } from './platform';

// Every RESOLVERS/standalone entry lives in its own domain module under
// ./resolvers/ — see that directory for the actual utility implementations.
// This file's only job is to merge them into one map and expose the same
// public surface (resolveUtility, isKnownUtility, getBuiltinUtilityPrefixes,
// getBuiltinStandaloneNames, resolveColor, resolveSpacing, resolveSizing,
// parseHexRgb, plugin registration) that resolver.ts, parser.ts, config.ts,
// core/index.ts, and vite-plugin.ts already import — so splitting the
// implementation up requires zero changes anywhere else.
import { colorResolvers, resolveColor, parseHexRgb } from './resolvers/color';
import { spacingResolvers, resolveSpacing, resolveSizing } from './resolvers/spacing';
import { borderResolvers } from './resolvers/border';
import { layoutResolvers, getStandalone } from './resolvers/layout';
import { typographyResolvers } from './resolvers/typography';
import { filterResolvers } from './resolvers/filters';
import { transformResolvers } from './resolvers/transform';
import { effectResolvers } from './resolvers/effects';
import { miscResolvers } from './resolvers/misc';
import type { Resolver } from './resolvers/types';

export { resolveColor, resolveSpacing, resolveSizing, parseHexRgb };

// ─── Merged built-in resolver map ──────────────────────────────────────────────

const RESOLVERS: Record<string, Resolver> = {
  ...colorResolvers,
  ...spacingResolvers,
  ...borderResolvers,
  ...layoutResolvers,
  ...typographyResolvers,
  ...filterResolvers,
  ...transformResolvers,
  ...effectResolvers,
  ...miscResolvers,
};

// ─── Public resolver ─────────────────────────────────────────────────────────

// group/{name} and peer/{name} are the named-group marker classes (see
// registry.ts's getNamedGroupPeerModifier for the group-hover/{name}: side).
// The parser has no dash to split on here, so the whole "group/card" string
// lands in parsed.utility with no dedicated resolver entry — without this
// check they'd log a false "Unknown utility" warning below.
const NAMED_GROUP_PEER_MARKER_RE = /^(group|peer)\/.+$/;

export function resolveUtility(parsed: ParsedClass, theme: ThemeConfig): StyleValue | null {
  if (!parsed.value) {
    if (parsed.utility in PLUGIN_STANDALONE) return PLUGIN_STANDALONE[parsed.utility] ?? null;
    if (parsed.utility in getStandalone()) return getStandalone()[parsed.utility] ?? null;
    if (NAMED_GROUP_PEER_MARKER_RE.test(parsed.utility)) return getEffectiveIsWeb() ? ({} as StyleValue) : null;
  }

  const resolver = PLUGIN_RESOLVERS[parsed.utility] ?? RESOLVERS[parsed.utility];
  if (resolver) return resolver(parsed, theme);

  return null;
}

// ─── Plugin-isolated maps ─────────────────────────────────────────────────────
// Cleared before each buildConfig() run so stale entries don't survive plugin changes.

const PLUGIN_STANDALONE: Record<string, StyleValue | null> = {};
const PLUGIN_RESOLVERS: Record<string, Resolver> = {};

export function clearPluginUtilities(): void {
  for (const key of Object.keys(PLUGIN_STANDALONE)) delete PLUGIN_STANDALONE[key];
  for (const key of Object.keys(PLUGIN_RESOLVERS)) delete PLUGIN_RESOLVERS[key];
  // Invalidate parser-facing caches so new plugin utilities are picked up.
  _sortedPrefixes = null;
  _standaloneNames = null;
}

export function getPluginStandaloneMap(): Record<string, StyleValue | null> {
  return PLUGIN_STANDALONE;
}

export function getPluginResolverMap(): Record<string, Resolver> {
  return PLUGIN_RESOLVERS;
}

/**
 * Returns true if the utility name is known to the framework (built-in or plugin).
 * Used for dev-mode warnings — resolveUtility returning null could mean either
 * "intentionally null on this platform" or "completely unknown utility name".
 * This check covers the second case.
 */
export function isKnownUtility(utility: string): boolean {
  return (
    utility in getStandalone() ||
    utility in RESOLVERS ||
    utility in PLUGIN_STANDALONE ||
    utility in PLUGIN_RESOLVERS ||
    NAMED_GROUP_PEER_MARKER_RE.test(utility)
  );
}

// ─── Parser-facing exports ────────────────────────────────────────────────────
// These let parser.ts derive its prefix/standalone lists directly from the
// resolver maps — adding a new utility to a resolvers/*.ts file or its
// standalone map is now the ONLY edit required.

let _sortedPrefixes: readonly string[] | null = null;
let _standaloneNames: ReadonlySet<string> | null = null;

/**
 * Sorted (longest-first) unique list of all built-in + plugin utility prefixes.
 * Used by parser.ts for greedy prefix matching — replaces the hard-coded
 * UTILITY_PREFIXES array that had to be kept in sync manually.
 */
export function getBuiltinUtilityPrefixes(): readonly string[] {
  if (!_sortedPrefixes) {
    const all = [...new Set([...Object.keys(RESOLVERS), ...Object.keys(PLUGIN_RESOLVERS)])];
    _sortedPrefixes = all.sort((a, b) => b.length - a.length);
  }
  return _sortedPrefixes;
}

/**
 * Set of all built-in + plugin standalone utility names.
 * Used by parser.ts to recognise no-value tokens — replaces the hard-coded
 * STANDALONE_UTILITIES set that had to be kept in sync manually.
 */
export function getBuiltinStandaloneNames(): ReadonlySet<string> {
  if (!_standaloneNames) {
    _standaloneNames = new Set([...Object.keys(getStandalone()), ...Object.keys(PLUGIN_STANDALONE)]);
  }
  return _standaloneNames;
}
