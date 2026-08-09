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
