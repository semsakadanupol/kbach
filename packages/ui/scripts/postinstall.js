#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

// INIT_CWD is set by npm to the directory where `npm install` was invoked —
// i.e. the user's project root. It is not set during a local `npm pack` / publish run.
const projectRoot = process.env.INIT_CWD;
if (!projectRoot) process.exit(0);

// Safety: never write outside the user's project (e.g. if somehow inside node_modules)
if (projectRoot.includes('node_modules')) process.exit(0);

// Skip when INIT_CWD is this very monorepo's own root — any `npm install`/
// `npm version`/etc. run at the repo root re-triggers this script (since
// @kbach/ui is a workspace dependency of the root package too), which used
// to keep re-creating a KBACH.md at the repo root that isn't needed there
// (this repo's own copy already lives in packages/ui/KBACH.md — the actual
// source this file gets copied FROM). Detected by package name + workspaces
// rather than a path comparison, since this script runs from inside
// node_modules/@kbach/ui in a real consumer install, where a literal path
// match to the monorepo source tree wouldn't exist to compare against.
try {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
  if (rootPkg.name === 'kbach' && Array.isArray(rootPkg.workspaces)) process.exit(0);
} catch {
  // No readable package.json at projectRoot, or it doesn't parse — not our
  // monorepo root either way, fall through to the normal consumer-install path.
}

// Don't overwrite an existing file — user may have customised it.
const dest = path.join(projectRoot, 'KBACH.md');
if (fs.existsSync(dest)) process.exit(0);

// The reference file ships alongside this script inside the npm package.
const src = path.join(__dirname, '..', 'KBACH.md');
if (!fs.existsSync(src)) process.exit(0);

try {
  fs.copyFileSync(src, dest);
  console.log('[kbach] Created KBACH.md in your project — AI reference for all Kbach utilities and modifiers.');
} catch {
  // Never break an install over a doc file.
}
