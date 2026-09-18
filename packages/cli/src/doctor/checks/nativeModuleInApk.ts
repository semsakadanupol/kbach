import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { listZipEntryNames } from '../../zipEntries';
import type { DoctorCheckResult } from '../types';

const APK_CANDIDATES = [
  'android/app/build/outputs/apk/debug/app-debug.apk',
  'android/app/build/outputs/apk/release/app-release.apk',
];

/**
 * The specific "installed/updated kbach after your last native build"
 * failure mode react-native/AGENTS.md documents can't be told apart from
 * "never built at all" just by checking `node_modules` (packageInstalled.ts
 * only proves the JS package is on disk, not that the Android build has
 * ever picked it up) — this check actually opens the last built APK (a
 * zip) and looks for the real prebuilt `.so` react-native/android/src/main/
 * jniLibs ships as (`libkbach_core_engine.so`, confirmed against this
 * repo's own build output), then cross-checks the APK's own mtime against
 * the installed package's, since a present-but-STALE `.so` from a build
 * that predates a later `npm update` is the exact scenario worth flagging.
 */
export function checkNativeModuleInApk(root: string): DoctorCheckResult | null {
  const hasAndroidDir = existsSync(join(root, 'android'));
  if (!hasAndroidDir) return null; // Not a native-Android project — not applicable.

  let apkPath: string | null = null;
  let apkMtime = -Infinity;
  for (const candidate of APK_CANDIDATES) {
    const full = join(root, candidate);
    if (!existsSync(full)) continue;
    const mtime = statSync(full).mtimeMs;
    if (mtime > apkMtime) {
      apkMtime = mtime;
      apkPath = full;
    }
  }

  if (!apkPath) {
    return {
      label: 'Native module present in the last built APK',
      status: 'fail',
      fix: 'No built APK found under android/app/build/outputs/apk/ — run: npx react-native run-android',
    };
  }

  const entries = listZipEntryNames(apkPath);
  if (!entries) {
    return {
      label: 'Native module present in the last built APK',
      status: 'fail',
      fix: `Couldn't read ${apkPath} as a zip (unusual — a ZIP64 APK, or not a real APK) — rebuild to be safe: npx react-native run-android`,
    };
  }

  const hasNativeLib = entries.some((name) => /^lib\/[^/]+\/libkbach_core_engine\.so$/.test(name));
  if (!hasNativeLib) {
    return {
      label: 'Native module present in the last built APK',
      status: 'fail',
      fix: `${apkPath} doesn't contain kbach's native module — run: npx react-native run-android`,
    };
  }

  const pkgJsonPath = join(root, 'node_modules', '@kbach', 'react-native', 'package.json');
  if (existsSync(pkgJsonPath) && statSync(pkgJsonPath).mtimeMs > apkMtime) {
    return {
      label: 'Native module present in the last built APK',
      status: 'fail',
      fix: `@kbach/react-native was installed/updated after ${apkPath} was built — rebuild: npx react-native run-android`,
    };
  }

  return { label: 'Native module present in the last built APK', status: 'pass' };
}
