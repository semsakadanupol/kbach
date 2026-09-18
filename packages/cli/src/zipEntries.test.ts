import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listZipEntryNames } from './zipEntries';

/**
 * Hand-built minimal zip (method 0 / "stored", zero-length entries, dummy
 * CRCs) — sufficient for listZipEntryNames, which only ever reads entry
 * NAMES out of the central directory and never validates or decompresses
 * content, so a real zip tool isn't needed to produce a valid fixture.
 */
function buildMinimalZip(names: string[]): Buffer {
  const parts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const name of names) {
    const nameBuf = Buffer.from(name, 'utf-8');
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(0, 18);
    local.writeUInt32LE(0, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    parts.push(local);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(0, 20);
    central.writeUInt32LE(0, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const localSection = Buffer.concat(parts);
  const centralSection = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(localSection.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localSection, centralSection, eocd]);
}

describe('listZipEntryNames', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-cli-zip-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists every entry name in a real (hand-built but structurally valid) zip', () => {
    const zipPath = join(dir, 'test.zip');
    writeFileSync(zipPath, buildMinimalZip(['lib/arm64-v8a/libkbach_core_engine.so', 'lib/x86_64/libkbach_core_engine.so', 'AndroidManifest.xml']));
    const names = listZipEntryNames(zipPath);
    expect(names).toEqual(['lib/arm64-v8a/libkbach_core_engine.so', 'lib/x86_64/libkbach_core_engine.so', 'AndroidManifest.xml']);
  });

  it('returns an empty array for a zip with no entries', () => {
    const zipPath = join(dir, 'empty.zip');
    writeFileSync(zipPath, buildMinimalZip([]));
    expect(listZipEntryNames(zipPath)).toEqual([]);
  });

  it('returns null for a non-existent file', () => {
    expect(listZipEntryNames(join(dir, 'nope.zip'))).toBeNull();
  });

  it('returns null for a file that is not a zip at all', () => {
    const path = join(dir, 'not-a-zip.txt');
    writeFileSync(path, 'just some plain text, definitely not a zip file');
    expect(listZipEntryNames(path)).toBeNull();
  });
});
