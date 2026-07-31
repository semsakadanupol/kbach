import * as fs from 'fs';
import * as path from 'path';
import { readProjectInfo, isExpoProject, type PackageManager, type Platform } from './detect';
import { resolveAnswers, confirmPlan, type CliFlags } from './prompts';
import { writeKbachConfig, writeKbachCss, writeBabelConfig, mergeTsconfigJsx, installPackage } from './actions';

// ─── Flag parsing ───────────────────────────────────────────────────────────
// Deliberately hand-rolled — five flags doesn't justify a dependency.

const VALID_PLATFORMS: readonly Platform[] = ['web', 'next', 'native'];
const VALID_SETUPS: readonly ('runtime' | 'static')[] = ['runtime', 'static'];
const VALID_PMS: readonly PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];

// Bad values here used to sail through unchecked: an invalid --platform
// skipped every platform branch downstream (install succeeds, but no
// config/snippets get written and nothing tells the user why), and an
// invalid --pm crashed with a raw TypeError from an undefined lookup. Failing
// fast here with a clear message replaces both with one obvious error.
function invalidFlag(flag: string, value: string, valid: readonly string[]): never {
  console.error(`[kbach] Invalid ${flag}="${value}" — expected one of: ${valid.join(', ')}`);
  process.exit(1);
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { yes: false, install: true };
  for (const arg of argv) {
    if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--no-install') flags.install = false;
    else if (arg.startsWith('--platform=')) {
      const value = arg.slice('--platform='.length);
      if (!VALID_PLATFORMS.includes(value as Platform)) invalidFlag('--platform', value, VALID_PLATFORMS);
      flags.platform = value as Platform;
    } else if (arg.startsWith('--setup=')) {
      const value = arg.slice('--setup='.length);
      if (!VALID_SETUPS.includes(value as 'runtime' | 'static')) invalidFlag('--setup', value, VALID_SETUPS);
      flags.setup = value as 'runtime' | 'static';
    } else if (arg.startsWith('--pm=')) {
      const value = arg.slice('--pm='.length);
      if (!VALID_PMS.includes(value as PackageManager)) invalidFlag('--pm', value, VALID_PMS);
      flags.pm = value as PackageManager;
    }
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

// kbach() alone only generates the CSS file — this import is the step that
// actually switches the app over to Static CSS (auto-disables runtime
// injection). Easy to do the plugin wiring and forget this, which silently
// leaves runtime injection active alongside the generated file.
function printKbachCssImportSnippet(relativeCssPath: string): void {
  const importPath = relativeCssPath.replace(/\\/g, '/');
  log(`  Your entry file (e.g. main.tsx) — import the generated stylesheet:`);
  log(`    import './${importPath.startsWith('src/') ? importPath.slice(4) : importPath}';`);
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

  const projectInfo = readProjectInfo(cwd);
  if (projectInfo.status === 'malformed') {
    log('[kbach] Found package.json in the current directory, but it failed to parse as JSON.');
    log('Fix the syntax error and re-run create-kbach.');
    process.exit(1);
  }
  if (projectInfo.status === 'missing') {
    log('[kbach] No package.json found in the current directory.');
    log('create-kbach adds Kbach to an EXISTING project — it doesn\'t scaffold a new one.');
    log('Create your app first, then re-run this from inside it:');
    log('  npm create vite@latest      (web)');
    log('  npx create-expo-app@latest  (React Native)');
    process.exit(1);
  }
  const info = projectInfo.info;

  const { platform, setup } = await resolveAnswers(info.platform, flags);
  const pm = flags.pm ?? info.packageManager;
  const pkgName = platform === 'native' ? '@kbach/native' : '@kbach/react';

  // Computed once, up front, so the pre-flight summary below and the actual
  // write phase further down agree on exactly the same facts — no re-check
  // that could see a different answer (e.g. a file appearing) between the
  // two, and no need to duplicate mergeTsconfigJsx's own conflict/already-set
  // detection just to preview it.
  const babelConfigPath = path.join(cwd, 'babel.config.js');
  const babelExisted = platform === 'native' && fs.existsSync(babelConfigPath);
  const isExpo = platform === 'native' && isExpoProject(cwd, info.pkg);
  const presetSpecifier = isExpo ? 'babel-preset-expo' : 'module:@react-native/babel-preset';
  const presetPackage = isExpo ? 'babel-preset-expo' : '@react-native/babel-preset';
  const presetInstalled = (() => {
    const deps = {
      ...(info.pkg.dependencies as Record<string, string> | undefined),
      ...(info.pkg.devDependencies as Record<string, string> | undefined),
    };
    return presetPackage in deps;
  })();

  const summary: string[] = [];
  summary.push(
    flags.install
      ? `Install ${pkgName} with ${pm}`
      : `NOT install ${pkgName} (--no-install) — you'll need to install it yourself`,
  );
  summary.push(
    fs.existsSync(path.join(cwd, 'kbach.config.js'))
      ? 'Leave kbach.config.js untouched (already exists)'
      : 'Create kbach.config.js',
  );
  if (platform === 'native') {
    if (babelExisted) {
      summary.push('Leave babel.config.js untouched (already exists) — print a manual merge snippet for it instead');
    } else {
      summary.push(`Create babel.config.js, using the ${isExpo ? 'Expo' : 'bare React Native'} preset (${presetSpecifier})`);
      if (!presetInstalled) {
        summary.push(
          flags.install
            ? `Install ${presetPackage} (that preset isn't in your dependencies yet)`
            : `NOT install ${presetPackage} (--no-install) — the babel.config.js just created needs it before Metro will run`,
        );
      }
    }
  }
  if (platform === 'web' && setup === 'static') {
    const cssDir = fs.existsSync(path.join(cwd, 'src')) ? 'src/kbach.css' : 'kbach.css';
    summary.push(
      fs.existsSync(path.join(cwd, cssDir))
        ? `Leave ${cssDir} untouched (already exists)`
        : `Create ${cssDir} — the stylesheet the Vite plugin writes into`,
    );
  }
  if (platform === 'web' || platform === 'next') {
    summary.push('Add "jsx": "react-jsx" and "jsxImportSource" to tsconfig.json, if not already set (never overwrites a conflicting value)');
  }
  summary.push('Print the remaining manual edits (wiring ThemeProvider, etc.) — nothing beyond the above is changed automatically');

  if (!flags.yes) {
    log();
    await confirmPlan(summary);
  }

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

  if (platform === 'native' && !babelExisted) {
    const babel = writeBabelConfig(cwd, presetSpecifier);
    (babel.result === 'created' ? created : skipped).push(path.relative(cwd, babel.path));

    if (!presetInstalled) {
      if (flags.install) {
        log(`[kbach] Installing ${presetPackage} (referenced by the babel.config.js just created)...`);
        const ok = installPackage(pm, presetPackage, cwd);
        if (!ok) log(`[kbach] Install failed — install ${presetPackage} manually before running Metro, or the preset won't resolve.`);
      } else {
        log(`[kbach] ${presetPackage} isn't installed — install it manually (skipped via --no-install) before running Metro.`);
      }
    }
  }

  let cssRelativePath = '';
  if (platform === 'web' && setup === 'static') {
    const css = writeKbachCss(cwd);
    cssRelativePath = path.relative(cwd, css.path);
    (css.result === 'created' ? created : skipped).push(cssRelativePath);
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
    printKbachCssImportSnippet(cssRelativePath);
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
