import * as p from '@clack/prompts';
import { detectCandidates, FRAMEWORK_PACKAGE } from '../detect';
import { checkPackageInstalled } from './checks/packageInstalled';
import { checkViteConfigWiring } from './checks/viteWiring';
import { checkKbachCssGenerated } from './checks/kbachCssGenerated';
import { checkConfigSyntax } from './checks/configSyntax';
import { checkBabelPluginWiring } from './checks/babelWiring';
import { checkPostcssConfigWiring, checkGlobalsCssMarkers } from './checks/postcssWiring';
import { checkNativeModuleInApk } from './checks/nativeModuleInApk';
import { checkDuplicateInstances } from './checks/duplicateInstances';
import { kbachTag, green, red, gray } from '../style';
import type { DoctorCheckResult } from './types';

export interface DoctorFlags {
  cwd: string;
}

/** Read-only — never edits anything (unlike `init`). A framework this build doesn't
 * recognize just skips the framework-specific checks rather than failing them, since
 * "unknown" and "broken" are different findings. */
export async function runDoctor(flags: DoctorFlags): Promise<number> {
  p.intro(kbachTag() + ' doctor');

  const candidates = detectCandidates(flags.cwd);
  const framework = candidates[0]?.framework ?? null;
  const pkg = framework ? FRAMEWORK_PACKAGE[framework] : null;

  const results: DoctorCheckResult[] = [];

  if (pkg) {
    results.push(checkPackageInstalled(flags.cwd, pkg));
  }

  if (framework === 'vite') {
    results.push(checkViteConfigWiring(flags.cwd));
    results.push(checkKbachCssGenerated(flags.cwd));
  } else if (framework === 'expo' || framework === 'react-native-cli') {
    results.push(checkBabelPluginWiring(flags.cwd));
    if (framework === 'react-native-cli') {
      const apkResult = checkNativeModuleInApk(flags.cwd);
      if (apkResult) results.push(apkResult);
    }
    results.push(...checkDuplicateInstances(flags.cwd));
  } else if (framework === 'next') {
    results.push(checkPostcssConfigWiring(flags.cwd));
    results.push(checkGlobalsCssMarkers(flags.cwd));
  }

  const configResult = checkConfigSyntax(flags.cwd);
  if (configResult) results.push(configResult);

  if (results.length === 0) {
    p.log.warn('No supported framework detected — nothing to check.');
    p.outro('0 checks run.');
    return 1;
  }

  for (const r of results) {
    if (r.status === 'pass') {
      p.log.success(`${r.label}${r.detail ? gray(` (${r.detail})`) : ''}`);
    } else {
      p.log.error(r.label);
      if (r.fix) p.log.message(gray(`   → ${r.fix}`));
    }
  }

  const failed = results.filter((r) => r.status === 'fail').length;
  p.outro(failed === 0 ? green('All checks passed.') : red(`${failed} issue${failed === 1 ? '' : 's'} found.`));
  return failed === 0 ? 0 : 1;
}
