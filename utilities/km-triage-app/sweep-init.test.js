#!/usr/bin/env node
// sweep-init.test.js — regression tests for sweepInit's bootstrap + sentinel.
// Node built-in runner, CommonJS, zero-dependency. Uses a throwaway temp root
// so no real .escalations dir or `gh` call is touched.
//
// Run:
//   node utilities/km-triage-app/sweep-init.test.js

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sweepInit, LABELS, SENTINEL } = require('./sweep-init');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-init-')) + '/.escalations';
}

test('first run creates dirs, audit log, and sentinel; creates every label once', () => {
  const root = tmpRoot();
  const created = [];
  const info = sweepInit({ root, ghRunner: (label) => created.push(label.name) });

  for (const d of ['runs', 'diffs', 'worktrees']) {
    assert.ok(fs.existsSync(path.join(root, d)), `${d} dir created`);
  }
  assert.ok(fs.existsSync(path.join(root, 'audit-log.jsonl')), 'audit log created');
  assert.ok(fs.existsSync(path.join(root, SENTINEL)), 'sentinel created');
  assert.equal(info.labelsCreated, true);
  assert.deepEqual(created, LABELS.map((l) => l.name));
});

test('second run is a no-op for labels (sentinel already present)', () => {
  const root = tmpRoot();
  sweepInit({ root, ghRunner: () => {} });

  const created = [];
  const info = sweepInit({ root, ghRunner: (label) => created.push(label.name) });
  assert.equal(info.labelsCreated, false);
  assert.deepEqual(created, [], 'no label creation on the second sweep');
});

test('an existing audit log is not truncated', () => {
  const root = tmpRoot();
  fs.mkdirSync(root, { recursive: true });
  const auditLog = path.join(root, 'audit-log.jsonl');
  fs.writeFileSync(auditLog, '{"pr":1}\n');

  sweepInit({ root, ghRunner: () => {} });
  assert.equal(fs.readFileSync(auditLog, 'utf8'), '{"pr":1}\n', 'prior audit content preserved');
});

test('createLabels:false skips gh calls but still marks bootstrap done', () => {
  const root = tmpRoot();
  const created = [];
  const info = sweepInit({ root, createLabels: false, ghRunner: (l) => created.push(l.name) });
  assert.equal(info.labelsCreated, true);
  assert.deepEqual(created, []);
  assert.ok(fs.existsSync(path.join(root, SENTINEL)));
});
