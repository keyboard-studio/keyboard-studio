#!/usr/bin/env node
// cache-diff.test.js — regression tests for the exclusion classifier.
// Uses Node's built-in test runner, matching manifest-guard.test.js.
//
// Run:
//   node utilities/km-triage-app/cache-diff.test.js

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyNumstat, KNOWN_GENERATED, OVERSIZED_THRESHOLD } = require('./cache-diff');

test('binary files (numstat "-") are excluded first, before arithmetic', () => {
  const { excluded, excludePathspecs } = classifyNumstat('-\t-\tassets/logo.png\n');
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].path, 'assets/logo.png');
  assert.equal(excluded[0].reason, 'binary');
  assert.deepEqual(excludePathspecs, [':(exclude)assets/logo.png']);
});

test('known-generated files are excluded regardless of size', () => {
  const { excluded } = classifyNumstat('3\t1\tdocs/import-corpus.json\n');
  assert.equal(excluded[0].reason, 'generated');
});

test('KNOWN_GENERATED contains the PR #350 regression file', () => {
  assert.ok(KNOWN_GENERATED.includes('docs/import-corpus.json'));
});

test('oversized diffs are excluded with the line count in the reason', () => {
  const { excluded } = classifyNumstat(`${OVERSIZED_THRESHOLD}\t1\tsrc/big.ts\n`);
  assert.equal(excluded[0].reason, `oversized: ${OVERSIZED_THRESHOLD + 1} lines`);
});

test('files at exactly the threshold are NOT excluded', () => {
  const { excluded } = classifyNumstat(`${OVERSIZED_THRESHOLD}\t0\tsrc/edge.ts\n`);
  assert.equal(excluded.length, 0);
});

test('ordinary small files pass through', () => {
  const { excluded, excludePathspecs } = classifyNumstat('10\t5\tpackages/engine/src/codec/parse.ts\n');
  assert.equal(excluded.length, 0);
  assert.equal(excludePathspecs.length, 0);
});

test('paths containing tabs survive the split', () => {
  const { excluded } = classifyNumstat('-\t-\tweird\tname.bin\n');
  assert.equal(excluded[0].path, 'weird\tname.bin');
});

test('mixed input classifies each line independently', () => {
  const input = [
    '10\t2\tsrc/small.ts',
    '-\t-\timg.png',
    '5000\t0\tgen/huge.json',
    '1\t1\tdocs/import-corpus.md',
  ].join('\n');
  const { excluded } = classifyNumstat(input);
  assert.deepEqual(
    excluded.map((e) => e.path),
    ['img.png', 'gen/huge.json', 'docs/import-corpus.md']
  );
});

test('empty and blank input yields no exclusions', () => {
  assert.equal(classifyNumstat('').excluded.length, 0);
  assert.equal(classifyNumstat('\n\n').excluded.length, 0);
});
