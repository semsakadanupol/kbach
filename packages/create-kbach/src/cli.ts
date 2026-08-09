import * as fs from 'fs';
import * as path from 'path';
import { readProjectInfo, isExpoProject, type PackageManager, type Platform } from './detect';
import { resolveAnswers, printPlan, confirmAction, type CliFlags } from './prompts';
import {
  writeKbachConfig, writeKbachCss, writeBabelConfig,
  checkTsconfigJsxMerge, applyTsconfigJsxMerge,
  installPackage, installExpoPackage, ensureGitignoreEntry,
} from './actions';
import { findThemeProviderWiring, findKbachCssImport, viteConfigHasPlugin, babelConfigHasPreset, checkPeerDependencyCompat } from './verify';

// ─── Color helpers ─────────────────────────────────────────────────────────
// Matches packages/ui/src/vite-plugin.ts's ANSI convention exactly (same
// codes, same [kbach] tag shape), so create-kbach's terminal output looks
// consistent with the Vite/Babel plugins' own [kbach] messages instead of
// being the one plain-text corner of the toolchain.
const useColor = !!process.stdout?.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const purple = (s: string) => paint('35', s);
const yellow = (s: string) => paint('33', s);
const green = (s: string) => paint('32', s);
const bold = (s: string) => paint('1', s);
const TAG = () => bold(purple('[kbach]'));

function log(message = ''): void {
  console.log(message);
}

/** Top-level status line: "[kbach] <message>". */
function logTag(message: string): void {
  console.log(`${TAG()} ${message}`);
}

/** Yellow — install failures, peer-dependency mismatches, declined actions, anything needing attention. */
function logWarn(message: string): void {
  console.log(`${TAG()} ${yellow(message)}`);
}

/** Green checkmark — a Tier 2 step (or the whole run) that's already done, nothing to do. */
function logDone(message: string): void {
  log(`  ${green('✓')} ${message}`);
}

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
  console.error(`${TAG()} ${yellow(`Invalid ${flag}="${value}" — expected one of: ${valid.join(', ')}`)}`);
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

// ─── Tier 2 snippets ─────────────────────────────────────────────────────────
// Printed verbatim, never auto-applied — see RULES.md rule 5 / the Tier 1/2
// design principle. Kept in sync by hand with packages/ui/README.md; if that
// changes, update these too.

function printViteConfigSnippet(): void {
  log('  vite.config.ts — add the Kbach plugin:');
  log('    import { kbach } from \'@kbach/ui/vite\';');
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
  log(`    import { ThemeProvider${includeReset ? ', KbachReset' : ''} } from '@kbach/ui';`);
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
  log('    import { ThemeProvider } from \'@kbach/ui/native\';');
  log('    export default function App() {');
  log('      return <ThemeProvider defaultMode="system"><AppContent /></ThemeProvider>;');
  log('    }');
}

function printBabelMergeSnippet(): void {
  log('  babel.config.js already exists — add these to it by hand:');
  log('    presets: [ /* ...your existing presets, */ \'@kbach/ui/babel\' ]');
  log('  Then clear the Metro cache: npx expo start --clear');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cwd = process.cwd();
  const flags = parseFlags(process.argv.slice(2));

  const projectInfo = readProjectInfo(cwd);
  if (projectInfo.status === 'malformed') {
    logTag('Found package.json in the current directory, but it failed to parse as JSON.');
    log('Fix the syntax error and re-run create-kbach.');
    process.exit(1);
  }
  if (projectInfo.status === 'missing') {
    logTag('No package.json found in the current directory.');
    log('create-kbach adds Kbach to an EXISTING project — it doesn\'t scaffold a new one.');
    log('Create your app first, then re-run this from inside it:');
    log('  npm create vite@latest      (web)');
    log('  npx create-expo-app@latest  (React Native)');
    process.exit(1);
  }
  const info = projectInfo.info;

  const { platform, setup } = await resolveAnswers(info.platform, flags);
  const pm = flags.pm ?? info.packageManager;
  // @kbach/ui works across every platform now — React Native/Expo support
  // (ThemeProvider, the Babel preset) lives at its './native' and './babel'
  // subpaths, so there's no longer a separate package to pick between.
  const pkgName = '@kbach/ui';

  // Computed once, up front, so the pre-flight summary below and the actual
  // action phase further down agree on exactly the same facts — no re-check
  // that could see a different answer (e.g. a file appearing) between the two.
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

  // Read-only checks for setup that's already been done by hand (or a
  // previous create-kbach run) — never edits these files, only decides
  // whether the Tier 2 snippet / permission prompt for each is still needed.
  // See verify.ts.
  const themeProviderWiredIn = findThemeProviderWiring(cwd);
  const cssImportedIn = platform === 'web' && setup === 'static' ? findKbachCssImport(cwd) : null;
  const viteAlreadyHasPlugin = platform === 'web' && setup === 'static' && viteConfigHasPlugin(cwd);
  const babelAlreadyHasPreset = babelExisted && babelConfigHasPreset(cwd);
  const tsconfigCheck = (platform === 'web' || platform === 'next') ? checkTsconfigJsxMerge(cwd) : null;

  const peerWarnings = flags.install ? checkPeerDependencyCompat(info.pkg) : [];

  const summary: string[] = [];
  summary.push(
    flags.install
      ? `Install ${pkgName} with ${pm}`
      : `NOT install ${pkgName} (--no-install) — you'll need to install it yourself`,
  );
  for (const warning of peerWarnings) {
    summary.push(`Warning: ${warning} — installing anyway, but expect issues until it's updated`);
  }
  summary.push(
    fs.existsSync(path.join(cwd, 'kbach.config.js'))
      ? 'Leave kbach.config.js untouched (already exists)'
      : 'Create kbach.config.js (will ask first)',
  );
  if (platform === 'native') {
    if (babelExisted) {
      summary.push(
        babelAlreadyHasPreset
          ? 'Leave babel.config.js untouched — already has the Kbach preset'
          : 'Leave babel.config.js untouched (already exists) — print a manual merge snippet for it instead',
      );
    } else {
      summary.push(`Create babel.config.js, using the ${isExpo ? 'Expo' : 'bare React Native'} preset (${presetSpecifier}) (will ask first)`);
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
        : `Create ${cssDir} — the stylesheet the Vite plugin writes into (will ask first)`,
    );
  }
  if (tsconfigCheck?.status === 'mergeable') {
    summary.push(`Merge "jsx": "react-jsx" and jsxImportSource into ${path.relative(cwd, tsconfigCheck.path)} (will ask first)`);
  } else if (platform === 'web' || platform === 'next') {
    summary.push('Add "jsx": "react-jsx" and "jsxImportSource" to tsconfig.json, if not already set (never overwrites a conflicting value)');
  }
  summary.push('Add kbach-types.d.ts to .gitignore, if this is a git repo and it isn\'t listed already — the Vite/Babel plugin auto-generates that file from kbach.config.js\'s custom colors, so it doesn\'t belong in version control');
  if (themeProviderWiredIn) summary.push(`ThemeProvider already wired in ${themeProviderWiredIn} — skipping that snippet`);
  if (viteAlreadyHasPlugin) summary.push('vite.config.* already has the Kbach plugin — skipping that snippet');
  if (cssImportedIn) summary.push(`kbach.css already imported in ${cssImportedIn} — skipping that snippet`);
  summary.push('Ask individually before creating or changing each file above — declining one doesn\'t block the others');

  if (!flags.yes) {
    log();
    printPlan(summary);
  }

  log();
  logTag(`Setting up ${pkgName} (${platform}${setup ? `, ${setup}` : ''}) with ${pm}...`);
  log();

  const created: string[] = [];
  const skipped: string[] = [];
  const declined: string[] = [];

  if (flags.install) {
    logTag(`Installing ${pkgName}...`);
    const ok = installPackage(pm, pkgName, cwd);
    if (!ok) logWarn(`Install failed — install ${pkgName} manually and re-run, or continue and add it yourself.`);
  } else {
    logTag(`Skipped install (--no-install) — run: install ${pkgName} with ${pm} yourself.`);
  }

  if (fs.existsSync(path.join(cwd, 'kbach.config.js'))) {
    skipped.push('kbach.config.js');
  } else if (await confirmAction('Create kbach.config.js (Kbach\'s theme config)?', flags)) {
    const cfg = writeKbachConfig(cwd);
    created.push(path.relative(cwd, cfg.path));
  } else {
    declined.push('kbach.config.js');
  }

  if (platform === 'native' && !babelExisted) {
    if (await confirmAction(`Create babel.config.js, using the ${isExpo ? 'Expo' : 'bare React Native'} preset?`, flags)) {
      const babel = writeBabelConfig(cwd, presetSpecifier);
      created.push(path.relative(cwd, babel.path));

      if (!presetInstalled) {
        if (flags.install) {
          logTag(`Installing ${presetPackage} (referenced by the babel.config.js just created)...`);
          // Expo projects: `expo install` resolves the version matching the
          // project's installed Expo SDK, instead of grabbing latest — see
          // installExpoPackage's own comment for why that matters here.
          const ok = isExpo
            ? installExpoPackage(presetPackage, cwd, pm)
            : installPackage(pm, presetPackage, cwd);
          if (!ok) logWarn(`Install failed — install ${presetPackage} manually before running Metro, or the preset won't resolve.`);
        } else {
          logTag(`${presetPackage} isn't installed — install it manually (skipped via --no-install) before running Metro.`);
        }
      }
    } else {
      declined.push('babel.config.js');
    }
  }

  let cssRelativePath = '';
  if (platform === 'web' && setup === 'static') {
    const cssDir = fs.existsSync(path.join(cwd, 'src')) ? 'src/kbach.css' : 'kbach.css';
    const cssPath = path.join(cwd, cssDir);
    if (fs.existsSync(cssPath)) {
      cssRelativePath = path.relative(cwd, cssPath);
      skipped.push(cssRelativePath);
    } else if (await confirmAction(`Create ${cssDir} (the stylesheet the Vite plugin writes into)?`, flags)) {
      const css = writeKbachCss(cwd);
      cssRelativePath = path.relative(cwd, css.path);
      created.push(cssRelativePath);
    } else {
      declined.push(cssDir);
    }
  }

  let tsconfigNote = '';
  if (tsconfigCheck) {
    if (tsconfigCheck.status === 'mergeable') {
      const relPath = path.relative(cwd, tsconfigCheck.path);
      if (await confirmAction(`Merge "jsx": "react-jsx" and jsxImportSource into ${relPath}?`, flags)) {
        applyTsconfigJsxMerge(tsconfigCheck);
        created.push(`${relPath} (jsx/jsxImportSource merged in)`);
      } else {
        declined.push(relPath);
      }
    } else if (tsconfigCheck.status === 'already-set') {
      skipped.push(`${path.relative(cwd, tsconfigCheck.path)} (jsx/jsxImportSource already set)`);
    } else if (tsconfigCheck.status === 'conflict') {
      tsconfigNote = `${path.relative(cwd, tsconfigCheck.path)} already sets "jsx"/"jsxImportSource" to something else — check it manually.`;
    } else if (tsconfigCheck.status === 'no-file') {
      tsconfigNote = 'No tsconfig.json/tsconfig.app.json found — if this is a TypeScript project, set compilerOptions.jsx="react-jsx" and jsxImportSource="@kbach/ui" by hand. JS-only projects need this set via your bundler\'s esbuild/babel JSX options instead.';
    } else if (tsconfigCheck.status === 'no-compiler-options-block' || tsconfigCheck.status === 'unparseable') {
      tsconfigNote = `Couldn't safely auto-edit ${path.relative(cwd, tsconfigCheck.path)} — add "jsx": "react-jsx" and "jsxImportSource": "@kbach/ui" under compilerOptions by hand.`;
    }
  }

  const gitignoreResult = ensureGitignoreEntry(cwd, 'kbach-types.d.ts');
  if (gitignoreResult === 'added' || gitignoreResult === 'created') {
    created.push('.gitignore (added kbach-types.d.ts)');
  } else if (gitignoreResult === 'already-present') {
    skipped.push('.gitignore (kbach-types.d.ts already listed)');
  }
  // 'no-git-repo': nothing to report — not a git project, nothing was skipped or created.

  log();
  logTag('Done.');
  if (created.length) log(`  Created/updated: ${bold(created.join(', '))}`);
  if (skipped.length) log(`  Already present (left untouched): ${skipped.join(', ')}`);
  if (declined.length) logWarn(`Declined, left for you to do by hand: ${declined.join(', ')}`);
  if (tsconfigNote) logWarn(tsconfigNote);

  // Each snippet below only prints when verify.ts's read-only checks didn't
  // already find it done — never auto-applied either way (RULES.md rule 5:
  // create-kbach creates new files or merges structured data, never
  // regex/text-surgeries an arbitrary existing source file). `remaining`
  // tracks whether anything actually got printed, so the header below can
  // say "all done" instead of introducing an empty list.
  let remaining = 0;
  const printOrConfirm = (alreadyDone: boolean, doneMessage: string, print: () => void) => {
    if (alreadyDone) {
      logDone(doneMessage);
      return;
    }
    remaining++;
    print();
  };

  log();
  logTag('Manual edits — see README/kbach-ui.md for full detail:');
  log();

  if (platform === 'web' && setup === 'static') {
    printOrConfirm(viteAlreadyHasPlugin, 'vite.config.* already has the Kbach plugin', printViteConfigSnippet);
    log();
    printOrConfirm(!!cssImportedIn, `kbach.css already imported in ${cssImportedIn}`, () => printKbachCssImportSnippet(cssRelativePath));
    log();
    printOrConfirm(!!themeProviderWiredIn, `ThemeProvider already wired in ${themeProviderWiredIn}`, () => printWebAppRootSnippet(false));
  } else if (platform === 'web' && setup === 'runtime') {
    printOrConfirm(!!themeProviderWiredIn, `ThemeProvider already wired in ${themeProviderWiredIn}`, () => printWebAppRootSnippet(true));
  } else if (platform === 'next') {
    printOrConfirm(!!themeProviderWiredIn, `ThemeProvider already wired in ${themeProviderWiredIn}`, () => printWebAppRootSnippet(true));
    log();
    log('  Static CSS setup doesn\'t apply to Next.js (webpack/Turbopack, not Vite) — Runtime setup only.');
  } else if (platform === 'native') {
    printOrConfirm(!!themeProviderWiredIn, `ThemeProvider already wired in ${themeProviderWiredIn}`, printNativeAppRootSnippet);
    if (babelExisted) {
      log();
      printOrConfirm(babelAlreadyHasPreset, 'babel.config.js already has the Kbach preset', printBabelMergeSnippet);
    }
  }

  if (remaining === 0) {
    logDone('Everything above already looks wired up — nothing left to do by hand.');
  }

  log();
  if (setup === 'static') {
    log('  Using a custom kbach.config.js? It needs to be passed to ThemeProvider (and to kbach() too, for Static CSS) — see "Wiring the config in" in the README.');
  } else {
    log('  Using a custom kbach.config.js? Pass it to ThemeProvider — see "Wiring the config in" in the README.');
  }
}

main().catch((err) => {
  console.error(`${TAG()} Unexpected error:`, err);
  process.exit(1);
});
