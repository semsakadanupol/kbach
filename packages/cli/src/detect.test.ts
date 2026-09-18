import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectCandidates } from './detect';

describe('detectCandidates', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-cli-detect-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writePkg(deps: Record<string, string> = {}, devDeps: Record<string, string> = {}) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: deps, devDependencies: devDeps }));
  }

  it('returns nothing when there is no package.json', () => {
    expect(detectCandidates(dir)).toEqual([]);
  });

  it('detects Expo from the "expo" dependency', () => {
    writePkg({ expo: '~51.0.0' });
    const result = detectCandidates(dir);
    expect(result).toHaveLength(1);
    expect(result[0]!.framework).toBe('expo');
  });

  it('detects React Native CLI from "react-native" without "expo"', () => {
    writePkg({ 'react-native': '^0.87.0' });
    const result = detectCandidates(dir);
    expect(result).toHaveLength(1);
    expect(result[0]!.framework).toBe('react-native-cli');
  });

  it('does not report react-native-cli when expo is also present (expo wins that slot)', () => {
    writePkg({ expo: '~51.0.0', 'react-native': '^0.87.0' });
    const frameworks = detectCandidates(dir).map((c) => c.framework);
    expect(frameworks).toContain('expo');
    expect(frameworks).not.toContain('react-native-cli');
  });

  it('detects Vite only when a vite.config file is actually present', () => {
    writePkg({ react: '^19.0.0' }, { vite: '^5.0.0' });
    expect(detectCandidates(dir)).toEqual([]);
    writeFileSync(join(dir, 'vite.config.ts'), 'export default {};');
    const result = detectCandidates(dir);
    expect(result).toHaveLength(1);
    expect(result[0]!.framework).toBe('vite');
  });

  it('does not detect Vite when react-native is also present', () => {
    writePkg({ react: '^19.0.0', 'react-native': '^0.87.0' }, { vite: '^5.0.0' });
    writeFileSync(join(dir, 'vite.config.ts'), 'export default {};');
    const frameworks = detectCandidates(dir).map((c) => c.framework);
    expect(frameworks).not.toContain('vite');
  });

  it('detects Next.js from the "next" dependency', () => {
    writePkg({ next: '^14.0.0' });
    const result = detectCandidates(dir);
    expect(result).toHaveLength(1);
    expect(result[0]!.framework).toBe('next');
  });

  it('returns every match for an ambiguous monorepo package.json, not just the first', () => {
    writePkg({ next: '^14.0.0', 'react-native': '^0.87.0' });
    const frameworks = detectCandidates(dir).map((c) => c.framework);
    expect(frameworks).toContain('next');
    expect(frameworks).toContain('react-native-cli');
  });
});
