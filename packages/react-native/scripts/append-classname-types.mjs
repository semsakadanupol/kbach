#!/usr/bin/env node
// Appends rnClassNameTypes.ts's ambient `declare module 'react-native'`
// augmentation (the `className?: string` type fix — see that file's own
// doc comment) onto the end of dist/index.d.ts and dist/index.web.d.ts.
//
// Why this can't just be a plain `import './rnClassNameTypes'` inside
// index.ts/index.web.ts instead (tried first): tsup's dts rollup
// (rollup-plugin-dts) tree-shakes a side-effect-only import that exports no
// types rollup-plugin-dts can trace a reference to — confirmed by hand that
// this is not even consistent: the augmentation survived in one build and
// silently vanished from a clean rebuild of the exact same source, with no
// error either way. A published package either has this fix or it doesn't;
// "sometimes, depending on stale dist/ leftovers" isn't acceptable, so this
// appends the text directly as a deterministic post-build step instead of
// trusting the bundler to preserve it.
//
// Usage: node scripts/append-classname-types.mjs (run after tsup, from
// this package's own "build" script)

import { readFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(thisDir, '..');

const augmentation = readFileSync(join(pkgRoot, 'src/rnClassNameTypes.ts'), 'utf-8');

for (const target of ['dist/index.d.ts', 'dist/index.web.d.ts']) {
  const path = join(pkgRoot, target);
  if (!existsSync(path)) {
    console.error(`append-classname-types.mjs: ${target} doesn't exist — did tsup's dts build run first?`);
    process.exit(1);
  }
  appendFileSync(path, `\n${augmentation}`);
  console.log(`Appended className type augmentation to ${target}`);
}
