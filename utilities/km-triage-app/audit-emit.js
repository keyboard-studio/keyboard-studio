#!/usr/bin/env node
// audit-emit.js — append one JSON line to .escalations/audit-log.jsonl (the
// km-triage Phase-7 audit log), guaranteeing a non-empty, real `ts`.
//
// `ts` is the re-review boundary: Phase 2's review-needed gate looks for human
// comments with created_at AFTER this ts. A historical Phase-7 defect wrote
// `"ts":""`, which makes that lookup match no comments and parks the PR forever
// even after the author replies. This helper closes that hole: an empty /
// missing / placeholder / unparseable ts is repaired to the current ISO time
// (default), or rejected up front with --strict.
//
// Usage (require):
//   const { emitAudit } = require('./audit-emit');
//   const { entry, repaired } = emitAudit({ pr: 345, action_taken: 'approve_park' });
//
// Usage (CLI) — the base entry comes from a JSON object (--json-file or stdin);
// flat key=value args merge on top (value inference like progress-emit.js):
//   node audit-emit.js pr=345 action_taken=approve_park
//   node audit-emit.js --json-file entry.json
//   printf '{"pr":345,...}\n' | node audit-emit.js
//   node audit-emit.js --strict < entry.json        # error instead of repairing ts
//   node audit-emit.js --log <path> ...             # override the audit-log path
// The written JSON line is echoed to stdout; a repair note goes to stderr.

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_LOG = path.join('.escalations', 'audit-log.jsonl');
const TS_PLACEHOLDER = '<ISO timestamp>';

function isValidTs(v) {
  return typeof v === 'string'
    && v.trim() !== ''
    && v !== TS_PLACEHOLDER
    && Number.isFinite(Date.parse(v));
}

/**
 * Ensure entry.ts is a real ISO timestamp, repairing it in place if not.
 *
 * @param {object} entry
 * @param {() => string} [now]  Clock, injectable for tests.
 * @returns {{entry:object, repaired:boolean, original?:*}}
 */
function normalizeTs(entry, now = () => new Date().toISOString()) {
  if (isValidTs(entry.ts)) return { entry, repaired: false };
  const original = entry.ts;
  entry.ts = now();
  return { entry, repaired: true, original };
}

/**
 * Append one audit entry as a JSON line, enforcing the ts invariant.
 *
 * @param {object} entry
 * @param {{logPath?:string, now?:() => string, strict?:boolean}} [opts]
 *   strict: throw on empty/invalid ts instead of repairing.
 * @returns {{entry:object, repaired:boolean, original?:*}}
 */
function emitAudit(entry, opts = {}) {
  const logPath = opts.logPath || DEFAULT_LOG;
  if (opts.strict && !isValidTs(entry.ts)) {
    throw new Error(`empty/invalid ts (${JSON.stringify(entry.ts)}); refusing to write audit entry`);
  }
  const result = normalizeTs(entry, opts.now);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  return result;
}

function parseValue(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith('{') || s.startsWith('[')) {
    try { return JSON.parse(s); } catch (_) { /* fall through to simple array */ }
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner ? inner.split(',').map((v) => v.trim()).filter(Boolean) : [];
  }
  return s;
}

function die(msg, code = 1) {
  process.stderr.write(`[audit-emit] ${msg}\n`);
  process.exit(code);
}

function main() {
  const argv = process.argv.slice(2);
  const flags = {};
  const kv = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if ((key === 'log' || key === 'json-file') && next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a.includes('=')) {
      kv.push(a);
    }
  }

  let entry = {};
  if (flags['json-file']) {
    entry = JSON.parse(fs.readFileSync(flags['json-file'], 'utf8'));
  } else if (!process.stdin.isTTY) {
    try {
      const raw = fs.readFileSync(0, 'utf8').trim();
      if (raw) entry = JSON.parse(raw);
    } catch (_) { /* empty stdin or parse error -> start from {} */ }
  }

  for (const arg of kv) {
    const eq = arg.indexOf('=');
    if (eq > 0) {
      entry[arg.slice(0, eq)] = parseValue(arg.slice(eq + 1));
    }
  }

  let result;
  try {
    result = emitAudit(entry, {
      logPath: typeof flags.log === 'string' ? flags.log : undefined,
      strict: !!flags.strict,
    });
  } catch (err) {
    die(err.message);
  }

  if (result.repaired) {
    process.stderr.write(`[audit-emit] repaired empty/invalid ts (was ${JSON.stringify(result.original)}) -> ${result.entry.ts}\n`);
  }
  process.stdout.write(JSON.stringify(result.entry) + '\n');
}

if (require.main === module) main();

module.exports = { emitAudit, normalizeTs, isValidTs, TS_PLACEHOLDER };
