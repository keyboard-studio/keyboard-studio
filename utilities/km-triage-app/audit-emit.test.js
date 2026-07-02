#!/usr/bin/env node
// audit-emit.test.js — regression tests for audit-entry validation, in
// particular the empty-ts repair (the historical defect that parked PRs
// forever because an empty ts matched no PR comments).
//
// Run:
//   node utilities/km-triage-app/audit-emit.test.js

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEntry, ACTIONS } = require('./audit-emit');

const NOW = '2026-07-02T12:00:00Z';

test('empty ts is repaired to the injected clock', () => {
  const { entry, warnings } = buildEntry({ ts: '' }, ['action_taken=skipped', 'pr=42'], NOW);
  assert.equal(entry.ts, NOW);
  assert.equal(warnings.length, 0); // silent repair only warns for non-empty garbage
});

test('missing ts is injected', () => {
  const { entry } = buildEntry({}, ['action_taken=skipped', 'pr=42'], NOW);
  assert.equal(entry.ts, NOW);
});

test('placeholder ts (literal template text) is replaced with a warning', () => {
  const { entry, warnings } = buildEntry(
    { ts: '<ISO timestamp>' },
    ['action_taken=skipped', 'pr=42'],
    NOW
  );
  assert.equal(entry.ts, NOW);
  assert.equal(warnings.length, 1);
});

test('a valid ts is preserved', () => {
  const { entry } = buildEntry(
    { ts: '2026-06-30T08:15:00Z' },
    ['action_taken=approve_park', 'pr=7'],
    NOW
  );
  assert.equal(entry.ts, '2026-06-30T08:15:00Z');
});

test('unknown action_taken throws', () => {
  assert.throws(() => buildEntry({}, ['action_taken=merged', 'pr=1'], NOW), /not a known action/);
});

test('pr is required for non-auth_failed actions', () => {
  assert.throws(() => buildEntry({}, ['action_taken=skipped'], NOW), /pr must be an integer/);
});

test('auth_failed needs no pr', () => {
  const { entry } = buildEntry({}, ['action_taken=auth_failed', 'reason=bot_token_unavailable'], NOW);
  assert.equal(entry.action_taken, 'auth_failed');
});

test('key=value overrides the --json base', () => {
  const { entry } = buildEntry(
    { pr: 1, action_taken: 'skipped', reason: 'draft' },
    ['reason=merge_conflict'],
    NOW
  );
  assert.equal(entry.reason, 'merge_conflict');
});

test('nested fields from --json survive untouched', () => {
  const verdicts = [{ specialist: 'km-qc', status: 'APPROVE', confidence: 'high', summary: 'ok' }];
  const { entry } = buildEntry(
    { pr: 3, action_taken: 'approve_park', verdicts, check_run: { id: 9, conclusion: 'success' } },
    [],
    NOW
  );
  assert.deepEqual(entry.verdicts, verdicts);
  assert.equal(entry.check_run.conclusion, 'success');
});

test('value type inference: booleans, ints, arrays', () => {
  const { entry } = buildEntry({}, [
    'action_taken=skipped',
    'pr=42',
    'missing_team_label=true',
    'scope_skipped=[km-strategy]',
    'triggering_comment_id=null',
  ], NOW);
  assert.equal(entry.missing_team_label, true);
  assert.deepEqual(entry.scope_skipped, ['km-strategy']);
  assert.equal(entry.triggering_comment_id, null);
});

test('the isolation-breach actions are known actions', () => {
  assert.ok(ACTIONS.includes('isolation_breach_head'));
  assert.ok(ACTIONS.includes('isolation_breach_porcelain'));
});
