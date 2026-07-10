#!/usr/bin/env node
// manifest-guard.js — canonical path test for the km-triage Phase-6 manifest
// precondition. Returns true for any repo-relative path whose basename is a
// dependency manifest or lockfile: package.json, pnpm-lock.yaml,
// pnpm-workspace.yaml, or package-lock.json (at any directory depth).
//
// Globs covered: **/package.json  **/pnpm-lock.yaml
//                **/pnpm-workspace.yaml  **/package-lock.json
//
// This module is the single source of truth for the four manifest filenames.
// The km-triage Phase-6 precondition prose derives its rule from this list;
// any programmatic check should require() this rather than re-enumerating.
//
// Usage (require):
//   const { isManifestPath } = require('./manifest-guard');
//   if (isManifestPath(filePath)) { /* needs human */ }
//
// Usage (CLI) — the Phase-6 precondition-5 gate:
//   node manifest-guard.js <path> [<path> ...]
//   Prints each manifest path (one per line) and exits 0 if ANY arg is a
//   manifest (reroute the fix list to a human); exits 1 if none match; exits 2
//   on a usage error (no args).

'use strict';

const path = require('path');

const MANIFEST_BASENAMES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'package-lock.json',
]);

/**
 * Returns true iff the given repo-relative path is a dependency manifest or
 * lockfile (matched by basename only, at any depth). Accepts either POSIX
 * (the GitHub diff-API format) or native Windows paths; non-string or empty
 * input returns false.
 *
 * @param {string} filePath  Repo-relative path, e.g. "packages/studio/package.json"
 * @returns {boolean}
 */
function isManifestPath(filePath) {
  if (typeof filePath !== 'string' || !filePath) return false;
  const basename = path.posix.basename(filePath.replace(/\\/g, '/'));
  return MANIFEST_BASENAMES.has(basename);
}

if (require.main === module) {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  if (args.length === 0) {
    process.stderr.write('usage: node manifest-guard.js <path> [<path> ...]\n');
    process.exit(2);
  }
  const matches = args.filter(isManifestPath);
  for (const m of matches) process.stdout.write(m + '\n');
  process.exit(matches.length > 0 ? 0 : 1);
}

module.exports = { isManifestPath };
