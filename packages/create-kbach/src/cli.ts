import * as fs from 'fs';
import * as path from 'path';
import { readProjectInfo, type PackageManager, type Platform } from './detect';
import { resolveAnswers, type CliFlags } from './prompts';
import { writeKbachConfig, writeKbachCss, writeBabelConfig, mergeTsconfigJsx, installPackage } from './actions';

// ─── Flag parsing ───────────────────────────────────────────────────────────
// Deliberately hand-rolled — five flags doesn't justify a dependency.

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { yes: false, install: true };
  for (const arg of argv) {
    if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--no-install') flags.install = false;
    else if (arg.startsWith('--platform=')) flags.platform = arg.slice('--platform='.length) as Platform;
    else if (arg.startsWith('--setup=')) flags.setup = arg.slice('--setup='.length) as 'runtime' | 'static';
    else if (arg.startsWith('--pm=')) flags.pm = arg.slice('--pm='.length) as PackageManager;
  }
  return flags;
}

function log(message = ''): void {
  console.log(message);
}

// ─── Tier 2 snippets ─────────────────────────────────────────────────────────
// Printed verbatim, never auto-applied — see the plan's "design principle"
// for why. Kept in sync by hand with packages/react/README.md and
// packages/native/README.md; if those change, update these too.

function printViteConfigSnippet(): void {
  log('  vite.config.ts — add the Kbach plugin:');
  log('    import { kbach } from \'@kbach/react/vite\';');
  log('    export default defineConfig({ plugins: [kbach(), /* your other plugins */] });');
}

function printWebAppRootSnippet(includeReset: boolean): void {
  log('  Your app root — wrap with ThemeProvider' + (includeReset ? ' + KbachReset' : '') + ':');
  log(`    import { ThemeProvider${includeReset ? ', KbachReset' : ''} } from '@kbach/react';`);
  log('    export default function Root() {');
  log('      return (');
  log('        <ThemeProvider defaultMode="system">');
  if (includeReset) log('          <KbachReset />');
  log('          <App />');
  log('        </ThemeProvider>');
  log('      );');
  log('    }');
}

function printNativeAppRootSnippet(): void {
  log('  Your app root — wrap with ThemeProvider:');
  log('    import { ThemeProvider } from \'@kbach/native\';');
  log('    export default function App() {');
  log('      return <ThemeProvider defaultMode="system"><AppContent /></ThemeProvider>;');
  log('    }');
}

function printBabelMergeSnippet(): void {
  log('  babel.config.js already exists — add these to it by hand:');
  log('    presets: [ /* ...your existing presets, */ \'@kbach/native/babel\' ]');
  log('  Then clear the Metro cache: npx expo start --clear');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cwd = process.cwd();
  const flags = parseFlags(process.argv.slice(2));

  const info = readProjectInfo(cwd);
  if (!info) {
    log('[kbach] No package.json found in the current directory.');
    log('create-kbach adds Kbach to an EXISTING project — it doesn\'t scaffold a new one.');
    log('Create your app first, then re-run this from inside it:');
    log('  npm create vite@latest      (web)');
    log('  npx create-expo-app@latest  (React Native)');
    process.exit(1);
  }

  const { platform, setup } = await resolveAnswers(info.platform, flags);
  const pm = flags.pm ?? info.packageManager;
  const pkgName = platform === 'native' ? '@kbach/native' : '@kbach/react';

  log();
  log(`[kbach] Setting up ${pkgName} (${platform}${setup ? `, ${setup}` : ''}) with ${pm}...`);
  log();

  const created: string[] = [];
  const skipped: string[] = [];

  if (flags.install) {
    log(`[kbach] Installing ${pkgName}...`);
    const ok = installPackage(pm, pkgName, cwd);
    if (!ok) {
      log(`[kbach] Install failed — install ${pkgName} manually and re-run, or continue and add it yourself.`);
    }
  } else {
    log(`[kbach] Skipped install (--no-install) — run: install ${pkgName} with ${pm} yourself.`);
  }

  const cfg = writeKbachConfig(cwd);
  (cfg.result === 'created' ? created : skipped).push(path.relative(cwd, cfg.path));

  let babelExisted = false;
  if (platform === 'native') {
    babelExisted = fs.existsSync(path.join(cwd, 'babel.config.js'));
    if (!babelExisted) {
      const babel = writeBabelConfig(cwd);
      (babel.result === 'created' ? created : skipped).push(path.relative(cwd, babel.path));
    }
  }

  if (platform === 'web' && setup === 'static') {
    const css = writeKbachCss(cwd);
    (css.result === 'created' ? created : skipped).push(path.relative(cwd, css.path));
  }

  let tsconfigNote = '';
  if (platform === 'web' || platform === 'next') {
    const merge = mergeTsconfigJsx(cwd);
    if (merge.status === 'merged' && merge.path) {
      created.push(path.relative(cwd, merge.path) + ' (jsx/jsxImportSource merged in)');
    } else if (merge.status === 'already-set') {
      skipped.push(path.relative(cwd, merge.path!) + ' (jsx/jsxImportSource already set)');
    } else if (merge.status === 'conflict') {
      tsconfigNote = `${path.relative(cwd, merge.path!)} already sets "jsx"/"jsxImportSource" to something else — check it manually.`;
    } else if (merge.status === 'no-file') {
      tsconfigNote = 'No tsconfig.json/tsconfig.app.json found — if this is a TypeScript project, set compilerOptions.jsx="react-jsx" and jsxImportSource="@kbach/react" by hand. JS-only projects need this set via your bundler\'s esbuild/babel JSX options instead.';
    } else if (merge.status === 'no-compiler-options-block' || merge.status === 'unparseable') {
      tsconfigNote = `Couldn't safely auto-edit ${path.relative(cwd, merge.path!)} — add "jsx": "react-jsx" and "jsxImportSource": "@kbach/react" under compilerOptions by hand.`;
    }
  }

  log();
  log('[kbach] Done.');
  if (created.length) {
    log(`  Created/updated: ${created.join(', ')}`);
  }
  if (skipped.length) {
    log(`  Already present (left untouched): ${skipped.join(', ')}`);
  }
  if (tsconfigNote) {
    log(`  Note: ${tsconfigNote}`);
  }

  log();
  log('[kbach] A few things still need a manual edit — see README/kbach-react.md for full detail:');
  log();

  if (platform === 'web' && setup === 'static') {
    printViteConfigSnippet();
    log();
    printWebAppRootSnippet(false);
  } else if (platform === 'web' && setup === 'runtime') {
    printWebAppRootSnippet(true);
  } else if (platform === 'next') {
    printWebAppRootSnippet(true);
    log();
    log('  Static CSS setup doesn\'t apply to Next.js (webpack/Turbopack, not Vite) — Runtime setup only.');
  } else if (platform === 'native') {
    printNativeAppRootSnippet();
    if (babelExisted) {
      log();
      printBabelMergeSnippet();
    }
  }

  log();
  if (setup === 'static') {
    log('  Using a custom kbach.config.js? It needs to be passed to ThemeProvider (and to kbach() too, for Static CSS) — see "Wiring the config in" in the README.');
  } else {
    log('  Using a custom kbach.config.js? Pass it to ThemeProvider — see "Wiring the config in" in the README.');
  }
}

main().catch((err) => {
  console.error('[kbach] Unexpected error:', err);
  process.exit(1);
});
