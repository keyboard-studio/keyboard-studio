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
  if (typeof filePath !== 'string' || filePath === '') return false;
  // Normalise backslashes, then take the POSIX basename so the result is the
  // same regardless of which OS the triage host runs on.
  const basename = path.posix.basename(filePath.replace(/\\/g, '/'));
  return MANIFEST_BASENAMES.has(basename);
}

module.exports = { isManifestPath };
