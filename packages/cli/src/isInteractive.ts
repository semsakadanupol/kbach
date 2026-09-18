/**
 * @clack/prompts' `select()`/`confirm()` construct a raw-mode TTY
 * WriteStream to draw the interactive UI — on a real terminal this is
 * fine, but with stdin/stdout redirected or otherwise not a TTY (CI, a
 * piped invocation, some non-interactive shells) that construction itself
 * throws `SystemError [ERR_TTY_INIT_FAILED]`, an uncaught crash with a raw
 * Node stack trace, not a clean CLI error. Every interactive-prompt call
 * site must check this first and fall back instead of prompting.
 */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}
