/**
 * Forked from packages/react/src/terminalWarn.ts rather than imported —
 * this package runs against arbitrary target projects (including pure RN
 * ones that never depend on @kbach/react at all), so it can't take that
 * package as a runtime dependency just for ~40 lines of ANSI helpers. Kept
 * in sync by hand: same "→ [Kbach]" tag, same TTY/NO_COLOR gating, same
 * palette choices (see that file's doc comment for why gray uses "bright
 * black" instead of SGR "dim").
 */
const useColor = !!process.stdout?.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const green = (s: string) => paint('32', s);
export const red = (s: string) => paint('31', s);
export const yellow = (s: string) => paint('33', s);
export const blue = (s: string) => paint('34', s);
export const gray = (s: string) => paint('90', s);
export const bold = (s: string) => paint('1', s);

/** `→ [Kbach]` — the shared opener every top-level message starts with. */
export function kbachTag(): string {
  return `${green('→')} ${bold(green('[Kbach]'))}`;
}
