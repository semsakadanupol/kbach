import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findFirstExisting } from './fsFind';

export type Framework = 'expo' | 'react-native-cli' | 'vite' | 'next';

export interface Detection {
  framework: Framework;
  /** Why this framework was picked — shown in the "Detecting..." step output. */
  reason: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackageJson(root: string): PackageJson | null {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Runs every framework signal against `root`'s package.json and returns
 * every match — NOT just the first, per the spec's own priority-order
 * table: the table is a tie-breaker for the interactive prompt, not a
 * silent "first match wins" rule, since more than one signal present
 * (e.g. a monorepo root with both a `web/` Vite app and a `mobile/` Expo
 * app hoisted into one package.json) must never be silently guessed.
 */
export function detectCandidates(root: string): Detection[] {
  const pkg = readPackageJson(root);
  if (!pkg) return [];
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const candidates: Detection[] = [];

  if (deps.expo) {
    const configFound = findFirstExisting(root, ['app.json', 'app.config.js', 'app.config.ts']);
    candidates.push({
      framework: 'expo',
      reason: configFound ? `"expo" dependency + ${configFound.split(/[\\/]/).pop()}` : '"expo" dependency',
    });
  }

  if (deps['react-native'] && !deps.expo) {
    const hasNativeDirs = existsSync(join(root, 'android')) || existsSync(join(root, 'ios'));
    candidates.push({
      framework: 'react-native-cli',
      reason: hasNativeDirs
        ? '"react-native" dependency + android/ or ios/ found'
        : '"react-native" dependency',
    });
  }

  if (deps.vite && deps.react && !deps['react-native']) {
    const configFound = findFirstExisting(root, ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs']);
    if (configFound) {
      candidates.push({ framework: 'vite', reason: `${configFound.split(/[\\/]/).pop()} found` });
    }
  }

  if (deps.next) {
    candidates.push({ framework: 'next', reason: '"next" dependency' });
  }

  return candidates;
}

export const FRAMEWORK_LABEL: Record<Framework, string> = {
  expo: 'Expo',
  'react-native-cli': 'React Native CLI',
  vite: 'Vite',
  next: 'Next.js',
};

export const FRAMEWORK_PACKAGE: Record<Framework, '@kbach/react' | '@kbach/react-native'> = {
  expo: '@kbach/react-native',
  'react-native-cli': '@kbach/react-native',
  vite: '@kbach/react',
  next: '@kbach/react',
};
