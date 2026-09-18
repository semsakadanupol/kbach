const START = '/* kbach:start */';
const END = '/* kbach:end */';

/**
 * Ensures `globals.css` has the `/* kbach:start *\/` / `/* kbach:end *\/`
 * marker pair the PostCSS plugin fills between (packages/react/AGENTS.md
 * §1) — inserting it at the end of the file if missing. Never touches
 * existing content between an already-present pair, on this run or any
 * later one: the plugin owns everything between the markers, and a second
 * `init` run must be a true no-op here, not a chance to clobber whatever
 * the plugin has since generated.
 */
export function ensureKbachCssMarkers(source: string): { changed: boolean; code: string } {
  if (source.includes(START) && source.includes(END)) {
    return { changed: false, code: source };
  }
  const separator = source.length > 0 && !source.endsWith('\n') ? '\n' : '';
  const block = `${separator}${source.length > 0 ? '\n' : ''}${START}\n${END}\n`;
  return { changed: true, code: source + block };
}
