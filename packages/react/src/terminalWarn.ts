/**
 * Shared terminal-output styling for every Kbach warning printed to a
 * Node.js process's stdout — the Vite plugin's dev-server console
 * (`vite-plugin/unknownClassWarnings.ts`) and the PostCSS plugin's build
 * output (`postcss-plugin/index.ts`). Kept in one place so both share the
 * exact same "[Kbach]" branding and color treatment instead of each plugin
 * inventing its own — a terminal warning and a browser warning are
 * different surfaces with genuinely different constraints (a real DOM
 * console understands `%c` CSS styling; a terminal understands ANSI escape
 * codes; neither understands the other's), so this module is Node/terminal
 * only — see `ThemeProvider.tsx`'s own doc comment for the browser-console
 * equivalent, and `@kbach/react-native`'s `nativeBridge.ts` for why ITS
 * warnings use neither (RN's on-device LogBox renders raw text only).
 *
 * Plain ANSI escapes — no chalk/picocolors dependency needed for a handful
 * of colors. No-op when stdout isn't a color-capable TTY (CI logs,
 * redirected output) or `NO_COLOR` is set, so raw escape codes never leak
 * into log files.
 *
 * Styled after Vite's own startup banner (green arrow, bold labels, sparing
 * color) rather than a wall of yellow — yellow foreground text and SGR
 * "dim" are both notoriously low-contrast on light-theme terminals
 * (yellow-on-white is close to unreadable; "dim" scales intensity relative
 * to the terminal's own foreground rather than picking an actual color, so
 * it's unpredictable). `gray` below uses the explicit "bright black" ANSI
 * code instead of dim for de-emphasized text — a specific, requestable
 * color rather than an intensity modifier, so it renders consistently
 * across themes instead of at the terminal's mercy.
 */
const useColor = !!process.stdout?.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const green = (s: string) => paint('32', s);
export const blue = (s: string) => paint('34', s);
export const white = (s: string) => paint('97', s);
export const gray = (s: string) => paint('90', s);
export const bold = (s: string) => paint('1', s);
export const highlight = (s: string) => bold(white(s));

/** `→ [Kbach]` — the shared opener every terminal-facing Kbach warning starts with. */
export function kbachTag(): string {
  return `${green('→')} ${bold(green('[Kbach]'))}`;
}
