#!/usr/bin/env node
// progress-emit.js - append a JSONL progress event to .escalations/progress.jsonl
// so observers (tools/triage-watch.mjs, ad-hoc tail consumers) can see what the
// triage agent is doing without waiting for the audit log at end-of-PR.
//
// Usage:
//   node utilities/km-triage-app/progress-emit.js phase=<name> [key=value ...]
//
// Auto-injects:
//   ts        - current ISO 8601 UTC timestamp
//   sweep_id  - from $KM_TRIAGE_SWEEP_ID, else a fresh per-process timestamp
//
// Value type inference per arg:
//   "true"/"false"  -> Boolean
//   pure integer    -> Number
//   "[a,b,c]"       -> Array of trimmed strings
//   anything else   -> String  (use quoting to preserve spaces from the shell)
//
// Appends exactly one JSON object per invocation. Creates the parent dir if
// needed. Failures are best-effort: a write error prints a short note to
// stderr but never throws (a broken observability hook must not break triage).

const fs = require('fs');
const path = require('path');

const PROGRESS_LOG = path.join('.escalations', 'progress.jsonl');

function parseValue(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return s;
}

function fallbackSweepId() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
}

const event = {
  ts: new Date().toISOString(),
  sweep_id: process.env.KM_TRIAGE_SWEEP_ID || fallbackSweepId(),
};

for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=');
  if (eq === -1) continue;
  const key = arg.slice(0, eq);
  const val = arg.slice(eq + 1);
  if (!key) continue;
  event[key] = parseValue(val);
}

// ---------------------------------------------------------------------------
// Known event shapes (all fields are optional extras on top of ts + sweep_id)
//
// mention event (MENTION_ONLY / FIX_AND_MENTION actions):
//   phase=mention  pr=<N>  comment_url=<url>  directed_by=<email|login>
//   channel=desktop|web
//
// escalate event (ESCALATE action -- posted after PR comment and label steps):
//   phase=escalate  pr=<N>  comment_url=<url>  directed_by=<email|login>
//   channel=desktop|web
//
// bypass event (Pre-filter D fired -- process title prefix or triage-bypass label):
//   phase=bypass  pr=<N>
//   trigger=process_title_prefix|triage_bypass_label
//   label_applied_by=<login or null>
//   title_prefix=<matched prefix string or null>
//
// All other fields are free-form key=value pairs inferred by parseValue above.
// ---------------------------------------------------------------------------

try {
  fs.mkdirSync(path.dirname(PROGRESS_LOG), { recursive: true });
  fs.appendFileSync(PROGRESS_LOG, JSON.stringify(event) + '\n');
} catch (err) {
  process.stderr.write(`[progress-emit] write failed: ${err.message}\n`);
}
