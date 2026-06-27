#!/usr/bin/env node
// manifest-guard.test.js — regression tests for isManifestPath.
// Uses Node's built-in test runner (node:test + node:assert), matching the
// CommonJS, zero-dependency style of the km-triage-app sibling files.
//
// Run:
//   node utilities/km-triage-app/manifest-guard.test.js

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isManifestPath } = require('./manifest-guard');

// --- true cases (all four manifest basenames at various depths) ---

test('package.json at nested path is a manifest', () => {
  assert.equal(isManifestPath('packages/studio/package.json'), true);
});

test('pnpm-lock.yaml at nested path is a manifest', () => {
  assert.equal(isManifestPath('some/deep/dir/pnpm-lock.yaml'), true);
});

test('pnpm-workspace.yaml at nested path is a manifest', () => {
  assert.equal(isManifestPath('another/level/pnpm-workspace.yaml'), true);
});

test('package-lock.json at nested path is a manifest', () => {
  assert.equal(isManifestPath('node_modules/foo/package-lock.json'), true);
});

test('package.json at repo root is a manifest', () => {
  assert.equal(isManifestPath('package.json'), true);
});

test('a Windows-separator path to a manifest is a manifest', () => {
  assert.equal(isManifestPath('packages\\studio\\package.json'), true);
});

// --- false cases ---

test('a TypeScript source file is not a manifest', () => {
  assert.equal(isManifestPath('packages/studio/src/foo.ts'), false);
});

test('a file with package.json as a directory component but different basename is not a manifest', () => {
  assert.equal(isManifestPath('package.json.bak'), false);
});

test('an unrelated YAML file is not a manifest', () => {
  assert.equal(isManifestPath('packages/engine/src/recognizer/rules/generated/foo.yaml'), false);
});

test('empty string is not a manifest', () => {
  assert.equal(isManifestPath(''), false);
});

test('non-string input is not a manifest', () => {
  assert.equal(isManifestPath(null), false);
  assert.equal(isManifestPath(undefined), false);
});
