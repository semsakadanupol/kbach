import { readFileSync } from 'node:fs';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SEARCH = 65_557; // EOCD_MIN_SIZE + max 16-bit comment length (65535)

/**
 * Lists every entry NAME in a `.zip`/`.apk`'s central directory — no
 * decompression, so no zip library dependency is needed: existence checks
 * only ever need the directory listing, never an entry's content. Reads
 * the End Of Central Directory record from the tail of the file (scanning
 * backward for its signature, since it can be followed by a variable-
 * length comment) and walks the central directory it points to. Returns
 * null rather than throwing for anything this minimal parser doesn't
 * handle (not a zip at all, or ZIP64 — used by only the largest APKs,
 * verified out of scope here since `doctor` just needs a yes/no answer
 * and a null "can't tell" is a safe, honest result for a check to report
 * as inconclusive rather than a false negative).
 */
export function listZipEntryNames(zipPath: string): string[] | null {
  let buf: Buffer;
  try {
    buf = readFileSync(zipPath);
  } catch {
    return null;
  }

  const searchStart = Math.max(0, buf.length - MAX_COMMENT_SEARCH);
  let eocdOffset = -1;
  for (let i = buf.length - EOCD_MIN_SIZE; i >= searchStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return null;

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  if (centralDirOffset === 0xffffffff || centralDirSize === 0xffffffff) {
    return null; // ZIP64 — not handled.
  }

  const names: string[] = [];
  let pos = centralDirOffset;
  const end = Math.min(buf.length, centralDirOffset + centralDirSize);
  for (let i = 0; i < totalEntries && pos < end; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== CENTRAL_DIR_SIGNATURE) break;
    const nameLength = buf.readUInt16LE(pos + 28);
    const extraLength = buf.readUInt16LE(pos + 30);
    const commentLength = buf.readUInt16LE(pos + 32);
    const nameStart = pos + 46;
    names.push(buf.toString('utf-8', nameStart, nameStart + nameLength));
    pos = nameStart + nameLength + extraLength + commentLength;
  }

  return names;
}
