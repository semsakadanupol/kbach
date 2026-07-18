/**
 * Styled console.warn for browser/runtime code. Uses the `%c` CSS-styling
 * console format (supported by Chrome, Firefox, Safari, and Edge DevTools)
 * so Kbach's own warnings are visually distinct from the surrounding noise —
 * a colored "[kbach]" tag followed by a short, plain message.
 *
 * Kept deliberately terse at call sites: one sentence, no walls of text.
 */
export function kbachWarn(message: string): void {
  console.warn(
    '%c[kbach]%c ' + message,
    'color:#8b5cf6;font-weight:700',
    'color:inherit;font-weight:400',
  );
}
