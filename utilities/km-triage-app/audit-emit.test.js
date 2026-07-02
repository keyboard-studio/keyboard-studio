#!/usr/bin/env node
// audit-emit.test.js — regression tests for the audit-log ts invariant.
// The key case: an empty/missing ts must be repaired (or rejected in strict
// mode), never written through. Node built-in runner, CommonJS, temp log path.
//
// Run:
//   node utilities/km-triage-app/audit-emit.test.js

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { emitAudit, normalizeTs, isValidTs, TS_PLACEHOLDER } = require('./audit-emit');

function tmpLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'audit-emit-')), 'audit-log.jsonl');
}

const FIXED = '2026-07-02T12:00:00.000Z';
const now = () => FIXED;

// --- isValidTs ---

test('isValidTs accepts a real ISO timestamp', () => {
  assert.equal(isValidTs('2026-07-02T00:00:00Z'), true);
});

test('isValidTs rejects empty, missing, placeholder, and garbage', () => {
  assert.equal(isValidTs(''), false);
  assert.equal(isValidTs(undefined), false);
  assert.equal(isValidTs(TS_PLACEHOLDER), false);
  assert.equal(isValidTs('not-a-date'), false);
});

// --- normalizeTs (repair) ---

test('normalizeTs repairs an empty ts to a real ISO time', () => {
  const { entry, repaired, original } = normalizeTs({ ts: '', pr: 1 }, now);
  assert.equal(repaired, true);
  assert.equal(original, '');
  assert.equal(entry.ts, FIXED);
});

test('normalizeTs repairs a missing ts', () => {
  const { entry, repaired } = normalizeTs({ pr: 1 }, now);
  assert.equal(repaired, true);
  assert.equal(entry.ts, FIXED);
});

test('normalizeTs repairs the literal placeholder', () => {
  const { entry, repaired } = normalizeTs({ ts: TS_PLACEHOLDER, pr: 1 }, now);
  assert.equal(repaired, true);
  assert.equal(entry.ts, FIXED);
});

test('normalizeTs preserves a valid ts', () => {
  const { entry, repaired } = normalizeTs({ ts: '2025-01-01T00:00:00Z', pr: 1 }, now);
  assert.equal(repaired, false);
  assert.equal(entry.ts, '2025-01-01T00:00:00Z');
});

// --- emitAudit (append) ---

test('emitAudit writes exactly one line with a repaired, non-empty ts', () => {
  const logPath = tmpLog();
  const { entry, repaired } = emitAudit(
    { ts: '', pr: 42, action_taken: 'approve_park' },
    { logPath, now },
  );
  assert.equal(repaired, true);
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const written = JSON.parse(lines[0]);
  assert.equal(written.ts, FIXED);
  assert.notEqual(written.ts, '');
  assert.equal(written.pr, 42);
  assert.equal(entry.ts, FIXED);
});

test('emitAudit appends (does not overwrite) across calls', () => {
  const logPath = tmpLog();
  emitAudit({ pr: 1 }, { logPath, now });
  emitAudit({ pr: 2 }, { logPath, now });
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).pr, 2);
});

test('emitAudit --strict throws on an empty ts instead of repairing', () => {
  const logPath = tmpLog();
  assert.throws(
    () => emitAudit({ ts: '', pr: 7 }, { logPath, strict: true }),
    /empty\/invalid ts/,
  );
  assert.equal(fs.existsSync(logPath), false, 'nothing written on strict rejection');
});
