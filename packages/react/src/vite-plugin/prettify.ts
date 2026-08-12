// Ported from old-kbach/src/vite-plugin.ts's prettifyCSS.
//
// Every rule this plugin ever produces comes out of css.rs as one compact
// line ('.flex { display: flex }') — fine for insertRule()-style injection,
// unreadable as a hand-inspectable file. Reformats into standard
// one-declaration-per-line CSS as a pure post-processing pass.
//
// A hand-rolled character scan rather than a real CSS parser is safe here
// for the same reason it was in old-kbach: parser.rs's arbitrary-value
// safety filter (see packages/core-engine/src/parser.rs) already rejects
// any arbitrary value containing "{", "}", or ";" before it can ever reach
// a resolver, so every such character in this function's input is
// guaranteed to be a real block/declaration boundary, never part of a value.
export function prettifyCSS(css: string): string {
  const out: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of css) {
    if (ch === '{') {
      const selector = current.trim();
      if (selector) out.push(`${'  '.repeat(depth)}${selector} {`);
      depth++;
      current = '';
    } else if (ch === '}') {
      const decl = current.trim();
      if (decl) out.push(`${'  '.repeat(depth)}${decl};`);
      depth = Math.max(0, depth - 1);
      out.push(`${'  '.repeat(depth)}}`);
      current = '';
    } else if (ch === ';') {
      const decl = current.trim();
      if (decl) out.push(`${'  '.repeat(depth)}${decl};`);
      current = '';
    } else {
      current += ch;
    }
  }
  const trailing = current.trim();
  if (trailing) out.push(trailing);

  return out.join('\n');
}
