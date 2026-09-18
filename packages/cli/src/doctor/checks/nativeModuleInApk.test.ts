import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkNativeModuleInApk } from './nativeModuleInApk';

// Reuses zipEntries.test.ts's approach — a hand-built, structurally-valid
// zip is enough here too, since the check under test never decompresses
// anything, only lists names and compares mtimes.
function buildMinimalZip(names: string[]): Buffer {
  const parts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const nameBuf = Buffer.from(name, 'utf-8');
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    parts.push(local);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centralParts.push(central);

    offset += local.length;
  }
  const localSection = Buffer.concat(parts);
  const centralSection = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(localSection.length, 16);
  return Buffer.concat([localSection, centralSection, eocd]);
}

describe('checkNativeModuleInApk', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kbach-cli-apk-test-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns null (not applicable) when there is no android/ directory at all', () => {
    expect(checkNativeModuleInApk(root)).toBeNull();
  });

  it('fails with a build fix when android/ exists but no APK was ever built', () => {
    mkdirSync(join(root, 'android'), { recursive: true });
    const result = checkNativeModuleInApk(root);
    expect(result?.status).toBe('fail');
    expect(result?.fix).toContain('run-android');
  });

  it('fails when the APK exists but does not contain the native .so', () => {
    const apkDir = join(root, 'android/app/build/outputs/apk/debug');
    mkdirSync(apkDir, { recursive: true });
    writeFileSync(join(apkDir, 'app-debug.apk'), buildMinimalZip(['AndroidManifest.xml', 'classes.dex']));
    const result = checkNativeModuleInApk(root);
    expect(result?.status).toBe('fail');
    expect(result?.fix).toContain("doesn't contain kbach's native module");
  });

  it('passes when the APK contains the native .so and no newer package install exists', () => {
    const apkDir = join(root, 'android/app/build/outputs/apk/debug');
    mkdirSync(apkDir, { recursive: true });
    writeFileSync(join(apkDir, 'app-debug.apk'), buildMinimalZip(['lib/arm64-v8a/libkbach_core_engine.so', 'classes.dex']));
    expect(checkNativeModuleInApk(root)).toEqual({ label: 'Native module present in the last built APK', status: 'pass' });
  });

  it('fails when @kbach/react-native was installed/updated after the APK was built', () => {
    const apkDir = join(root, 'android/app/build/outputs/apk/debug');
    mkdirSync(apkDir, { recursive: true });
    const apkPath = join(apkDir, 'app-debug.apk');
    writeFileSync(apkPath, buildMinimalZip(['lib/arm64-v8a/libkbach_core_engine.so']));

    const pkgDir = join(root, 'node_modules/@kbach/react-native');
    mkdirSync(pkgDir, { recursive: true });
    const pkgJsonPath = join(pkgDir, 'package.json');
    writeFileSync(pkgJsonPath, '{}');

    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    utimesSync(apkPath, past, past);
    utimesSync(pkgJsonPath, future, future);

    const result = checkNativeModuleInApk(root);
    expect(result?.status).toBe('fail');
    expect(result?.fix).toContain('installed/updated after');
  });
});
