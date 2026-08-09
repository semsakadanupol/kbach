// Shared terminal styling for create-kbach's output. Matches
// packages/ui/src/vite-plugin.ts's ANSI convention exactly (same codes, same
// [kbach] tag shape), so create-kbach's console output looks consistent with
// the Vite/Babel plugins' own [kbach] messages instead of being the one
// plain-text corner of the toolchain. Shared between cli.ts and prompts.ts
// rather than each defining its own copy (RULES.md rule 2).
const useColor = !!process.stdout?.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const purple = (s: string) => paint('35', s);
export const yellow = (s: string) => paint('33', s);
export const green = (s: string) => paint('32', s);
export const red = (s: string) => paint('31', s);
export const dim = (s: string) => paint('2', s);
export const bold = (s: string) => paint('1', s);
export const TAG = (): string => bold(purple('[kbach]'));

// One consistent icon per outcome, used instead of plain bullets/comma-lists
// so a scan of the left margin alone tells you what happened — done, left
// alone, declined, or needs attention — without reading every line of text.
export const ICON_OK = green('✓');
export const ICON_SKIP = dim('·');
export const ICON_DECLINE = red('✗');
export const ICON_WARN = yellow('⚠');

/** Dim horizontal divider between major output sections (plan / actions / manual edits). */
export function rule(): void {
  console.log(dim('─'.repeat(50)));
}
