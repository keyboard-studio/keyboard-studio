#!/usr/bin/env node
// audit-emit.js - append one validated JSON line to .escalations/audit-log.jsonl
// (km-triage Phase 7). The audit log is the source of truth for the Phase-2
// idempotency gate and the Pre-filter-A incremental-range lookup, so entries
// are validated at write time instead of documenting workarounds for bad ones.
//
// Enforced invariants:
//   - `ts` is NEVER empty. A missing, empty, or placeholder ts (anything that
//     does not parse as a date) is replaced with the current UTC ISO timestamp
//     and a warning is printed. This mechanically kills the historical
//     empty-ts defect: an empty ts silently matched no PR comments and parked
//     the PR forever after the author replied.
//   - `action_taken` must be one of the known ACTIONS.
//   - `pr` must be an integer for every action except `auth_failed`
//     (a sweep-level failure has no PR).
//
// Usage:
//   node utilities/km-triage-app/audit-emit.js action_taken=skipped pr=42 reason=draft
//   node utilities/km-triage-app/audit-emit.js --json '{"pr":42,...}' action_taken=approve_park
//
// Simple fields go as key=value (same type inference as progress-emit.js:
// true/false -> boolean, integers -> number, [a,b,c] -> string array, else
// string). Nested fields (verdicts array, auto_fix, check_run) go through
// --json (an inline JSON object merged first; key=value pairs override it).
//
// Stdout: the JSON line that was appended. Exit non-zero on validation failure.

'use strict';

const fs = require('fs');
const path = require('path');

const AUDIT_LOG = path.join('.escalations', 'audit-log.jsonl');

const ACTIONS = [
  'approve_park',
  'auto_fix_only',
  'mention_only',
  'fix_and_mention',
  'escalate',
  'auto_fix_attempt_failed',
  'skipped',
  'auth_failed',
  'bypass',
  'isolation_breach_head',
  'isolation_breach_porcelain',
];

function parseValue(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^\[.*\]$/.test(s)) {
    const inner = s.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((x) => x.trim());
  }
  return s;
}

/**
 * Build a validated audit entry from a base object plus key=value overrides.
 * Throws on invalid action_taken or missing pr. Repairs empty/placeholder ts.
 *
 * @param {object} base   parsed --json object (or {})
 * @param {string[]} kvPairs  raw "key=value" strings
 * @param {string} [nowIso]   injectable clock for tests
 * @returns {{ entry: object, warnings: string[] }}
 */
function buildEntry(base, kvPairs, nowIso) {
  const entry = { ...base };
  for (const pair of kvPairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) throw new Error(`argument is not key=value: ${pair}`);
    entry[pair.slice(0, eq)] = parseValue(pair.slice(eq + 1));
  }

  const warnings = [];
  const now = nowIso || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const tsInvalid =
    typeof entry.ts !== 'string' || entry.ts === '' || isNaN(Date.parse(entry.ts));
  if (tsInvalid) {
    if (entry.ts) warnings.push(`ts "${entry.ts}" is not a valid timestamp; replaced with ${now}`);
    entry.ts = now;
  }

  if (!ACTIONS.includes(entry.action_taken)) {
    throw new Error(
      `action_taken "${entry.action_taken}" is not a known action (${ACTIONS.join('|')})`
    );
  }
  if (entry.action_taken !== 'auth_failed' && !Number.isInteger(entry.pr)) {
    throw new Error(`pr must be an integer for action_taken=${entry.action_taken}`);
  }

  return { entry, warnings };
}

function main() {
  const argv = process.argv.slice(2);
  let base = {};
  const kvPairs = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') {
      base = { ...base, ...JSON.parse(argv[i + 1]) };
      i++;
    } else {
      kvPairs.push(argv[i]);
    }
  }

  const { entry, warnings } = buildEntry(base, kvPairs);
  for (const w of warnings) process.stderr.write(`[audit-emit] WARN ${w}\n`);

  fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
  const line = JSON.stringify(entry);
  fs.appendFileSync(AUDIT_LOG, line + '\n');
  process.stdout.write(line + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`[audit-emit] ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { buildEntry, ACTIONS };
