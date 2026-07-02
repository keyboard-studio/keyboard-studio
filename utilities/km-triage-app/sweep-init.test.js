#!/usr/bin/env node
// sweep-init.test.js — exercises the Phase-1 bootstrap end-to-end in a
// throwaway git repo (no gh calls: --no-labels).
//
// Run:
//   node utilities/km-triage-app/sweep-init.test.js

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'sweep-init.js');
const { LABELS, SENTINEL } = require('./sweep-init');

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-init-test-'));
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  };
  git(['init', '-q']);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init']);
  return dir;
}

function runInit(dir, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, '--no-labels'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('creates the .escalations layout and emits the baseline JSON', () => {
  const dir = makeRepo();
  const res = runInit(dir, { KM_TRIAGE_SWEEP_ID: 'testsweep' });
  assert.equal(res.status, 0, res.stderr);

  for (const sub of ['runs', 'diffs', 'worktrees']) {
    assert.ok(fs.existsSync(path.join(dir, '.escalations', sub)), `missing .escalations/${sub}`);
  }
  assert.ok(fs.existsSync(path.join(dir, '.escalations', 'audit-log.jsonl')));

  const out = JSON.parse(res.stdout);
  assert.match(out.sweepStartHead, /^[0-9a-f]{40}$/);
  assert.equal(typeof out.sweepStartPorcelain, 'string');
  assert.equal(out.baselinePath, path.join('.escalations', 'runs', 'testsweep-baseline.json'));

  const baseline = JSON.parse(fs.readFileSync(path.join(dir, out.baselinePath), 'utf8'));
  assert.equal(baseline.sweepStartHead, out.sweepStartHead);
});

test('porcelain snapshot reflects untracked files', () => {
  const dir = makeRepo();
  fs.writeFileSync(path.join(dir, 'stray.txt'), 'x');
  const res = runInit(dir);
  const out = JSON.parse(res.stdout);
  assert.match(out.sweepStartPorcelain, /\?\? stray\.txt/);
});

test('--no-labels never touches the sentinel (label creation stays pending)', () => {
  const dir = makeRepo();
  runInit(dir);
  assert.ok(!fs.existsSync(path.join(dir, SENTINEL)));
});

test('the label set matches the four triage labels', () => {
  assert.deepEqual(
    LABELS.map((l) => l[0]),
    ['ready-to-merge', 'review-needed', 'triage-skip', 'needs-rebase']
  );
});

test('sentinel filename is the v2 spelling', () => {
  assert.equal(SENTINEL, path.join('.escalations', '.labels-created-v2'));
});
