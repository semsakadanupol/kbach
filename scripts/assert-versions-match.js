#!/usr/bin/env node
'use strict';

// @kbach/react and @kbach/native are supposed to stay version-locked (every
// publish:* script bumps both together, even when only one is actually
// published to npm — see the root package.json comment in KBACH.md/README).
// That guarantee only holds if every publish attempt starts from a clean,
// matching state. A publish that fails or is interrupted after the version
// bump but before (or during) `npm publish` leaves the two package.json files
// desynced with no automatic signal — the next publish:* run would silently
// bump further from that inconsistent base. Refuse to proceed instead.

const reactPkg = require('../packages/react/package.json');
const nativePkg = require('../packages/native/package.json');

if (reactPkg.version !== nativePkg.version) {
  console.error(
    `[kbach] @kbach/react is at ${reactPkg.version} but @kbach/native is at ${nativePkg.version}. ` +
    'These must stay version-locked. This usually means a previous publish:* run bumped both ' +
    'packages but only completed (or only ran) for one of them. Manually align both ' +
    '"version" fields in packages/react/package.json and packages/native/package.json ' +
    '(and confirm what actually landed on npm) before publishing again.',
  );
  process.exit(1);
}
