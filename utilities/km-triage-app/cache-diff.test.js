#!/usr/bin/env node
// cache-diff.test.js — regression tests for classifyExclusions.
// Node built-in runner (node:test + node:assert), CommonJS, zero-dependency —
// matching the km-triage-app sibling files.
//
// Run:
//   node utilities/km-triage-app/cache-diff.test.js

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyExclusions, KNOWN_GENERATED, OVERSIZED_THRESHOLD } = require('./cache-diff');

test('a normal source file is not excluded', () => {
  const { excludePathspecs, excludedLog } = classifyExclusions('10\t5\tpackages/engine/src/scan.ts\n');
  assert.deepEqual(excludePathspecs, []);
  assert.deepEqual(excludedLog, []);
});

test('a known-generated file is excluded as generated', () => {
  const { excludePathspecs, excludedLog } = classifyExclusions('5\t3\tdocs/import-corpus.json\n');
  assert.deepEqual(excludePathspecs, [':(exclude)docs/import-corpus.json']);
  assert.deepEqual(excludedLog, ['docs/import-corpus.json (generated)']);
});

test('a binary file (numstat "-\\t-") is excluded as binary, before the size gate', () => {
  // Arithmetic on "-" is 0, which would silently pass OVERSIZED_THRESHOLD.
  const { excludePathspecs, excludedLog } = classifyExclusions('-\t-\tassets/logo.png\n');
  assert.deepEqual(excludePathspecs, [':(exclude)assets/logo.png']);
  assert.deepEqual(excludedLog, ['assets/logo.png (binary)']);
});

test('an oversized file is excluded with its line total', () => {
  const total = OVERSIZED_THRESHOLD + 1; // strictly greater
  const { excludePathspecs, excludedLog } = classifyExclusions(`${total}\t0\tbig.ts\n`);
  assert.deepEqual(excludePathspecs, [':(exclude)big.ts']);
  assert.deepEqual(excludedLog, [`big.ts (oversized: ${total} lines)`]);
});

test('a file exactly at the threshold is NOT excluded (strictly greater)', () => {
  const half = OVERSIZED_THRESHOLD / 2;
  const { excludePathspecs } = classifyExclusions(`${half}\t${half}\tedge.ts\n`);
  assert.deepEqual(excludePathspecs, []);
});

test('mixed numstat: only generated + oversized + binary are excluded', () => {
  const numstat = [
    '10\t2\tsrc/a.ts',
    '3\t1\tdocs/import-corpus.md',
    '5000\t0\tsrc/huge.ts',
    '-\t-\timg.png',
    '', // blank line tolerated
  ].join('\n');
  const { excludePathspecs, excludedLog } = classifyExclusions(numstat);
  assert.deepEqual(excludePathspecs, [
    ':(exclude)docs/import-corpus.md',
    ':(exclude)src/huge.ts',
    ':(exclude)img.png',
  ]);
  assert.deepEqual(excludedLog, [
    'docs/import-corpus.md (generated)',
    'src/huge.ts (oversized: 5000 lines)',
    'img.png (binary)',
  ]);
});

test('empty numstat yields no exclusions', () => {
  const { excludePathspecs, excludedLog } = classifyExclusions('');
  assert.deepEqual(excludePathspecs, []);
  assert.deepEqual(excludedLog, []);
});

test('opts override the known-generated set and threshold', () => {
  const { excludedLog } = classifyExclusions('50\t0\tgen/out.txt\n', {
    knownGenerated: ['gen/out.txt'],
    oversizedThreshold: 10,
  });
  assert.deepEqual(excludedLog, ['gen/out.txt (generated)']);
});

test('KNOWN_GENERATED includes the corpus artifacts (PR #350 regression set)', () => {
  assert.ok(KNOWN_GENERATED.includes('docs/import-corpus.json'));
  assert.ok(KNOWN_GENERATED.includes('docs/import-corpus.md'));
});
