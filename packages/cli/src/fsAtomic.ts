import { writeFileSync, renameSync, unlinkSync } from 'node:fs';

/**
 * Writes `content` to `path` via a temp-file-then-rename so a crash or
 * interrupt mid-write can never leave `path` half-written — `rename` on
 * the same filesystem is atomic on every platform this CLI runs on
 * (POSIX and NTFS both guarantee it for a same-volume rename).
 */
export function writeFileAtomic(path: string, content: string): void {
  const tmp = `${path}.kbach-tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, content, 'utf-8');
  try {
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* best effort cleanup */ }
    throw err;
  }
}
