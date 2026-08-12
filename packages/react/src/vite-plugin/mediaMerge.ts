// Ported from old-kbach/src/vite-plugin.ts's mergeResponsiveMediaBlocks.
//
// css.rs wraps every responsive class's rule in its OWN
// `@media (min-width: Npx) { ... }` — correct for the runtime <style>-sheet
// injection path (each rule inserted independently), but for the static
// file it means a project with many classes at the same breakpoint gets the
// identical @media wrapper repeated once per class instead of grouped into
// one block. This merges same-width rules together; everything else
// (including the OTHER @media shape css.rs emits — `@media
// (prefers-color-scheme: dark)` for the `media` dark-mode strategy) passes
// through untouched, since the regex is anchored specifically to the
// min-width pattern.
const RESPONSIVE_MEDIA_RE = /^@media \(min-width: (\d+)px\) \{ (.+) \}$/;

export function mergeResponsiveMediaBlocks(rules: string[]): string[] {
  const byWidth = new Map<number, string[]>();
  const widthOrder: number[] = [];
  const unwrapped: string[] = [];

  for (const rule of rules) {
    const m = RESPONSIVE_MEDIA_RE.exec(rule);
    if (!m) {
      unwrapped.push(rule);
      continue;
    }
    const width = Number(m[1]);
    if (!byWidth.has(width)) {
      byWidth.set(width, []);
      widthOrder.push(width);
    }
    byWidth.get(width)!.push(m[2]!);
  }

  // Ascending min-width — mobile-first, matches how these breakpoints are
  // meant to cascade and reads predictably regardless of scan order.
  widthOrder.sort((a, b) => a - b);
  const merged = widthOrder.map((w) => `@media (min-width: ${w}px) { ${byWidth.get(w)!.join(' ')} }`);
  return [...unwrapped, ...merged];
}
