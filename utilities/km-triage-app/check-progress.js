#!/usr/bin/env node
// check-progress.js - manage the km-triage/review check_run lifecycle for one PR.
//
// On first call for a (sweep, pr) pair this POSTs a fresh check_run and saves
// the returned id in a per-sweep sidecar at
//   .escalations/runs/<sweep_id>-checks.json
// Subsequent calls PATCH the same check_run, so the GitHub PR page shows the
// summary refresh in place as the triage moves through phases.
//
// Usage:
//   node utilities/km-triage-app/check-progress.js \
//     --pr <N> --head <SHA> --status in_progress|completed \
//     [--conclusion success|action_required|...] \
//     [--title "one-line"] \
//     [--summary-file <path-to-markdown-body>]
//
// Required env:
//   KM_TRIAGE_SWEEP_ID - identifies the per-sweep sidecar; defaults to a fresh
//                        timestamp if absent (which means each invocation gets
//                        its own sidecar, i.e. PATCH-recovery is lost; the
//                        triage-windows.ps1 wrapper sets this for you).
//
// The helper shells out to utilities/km-triage-app/bot-gh.js so the call is
// attributed to km-triage[bot] (the App has checks: write permission).
//
// Stdout: the check_run id (numeric). Stderr: human-readable error trace.
// Exit code: 0 on success, non-zero on any API or sidecar failure.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = 'keyboard-studio/keyboard-studio';
const CHECK_NAME = 'km-triage/review';

function parseArgs() {
  const args = { _: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function die(msg, code = 1) {
  process.stderr.write(`[check-progress] ${msg}\n`);
  process.exit(code);
}

function sidecarPath(sweepId) {
  return path.join('.escalations', 'runs', `${sweepId}-checks.json`);
}

function readSidecar(sweepId) {
  const p = sidecarPath(sweepId);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    process.stderr.write(`[check-progress] sidecar parse failed, treating as empty: ${err.message}\n`);
    return {};
  }
}

function writeSidecar(sweepId, data) {
  const p = sidecarPath(sweepId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function loadSummary(args) {
  if (args['summary-file']) {
    return fs.readFileSync(args['summary-file'], 'utf8');
  }
  return undefined;
}

function buildPayload(args, mode) {
  const payload = { name: CHECK_NAME };
  if (mode === 'create') {
    if (!args.head) die('--head <SHA> is required when creating a check_run');
    payload.head_sha = args.head;
  }
  if (args.status) payload.status = args.status;
  if (args.status === 'completed' && !args.conclusion) {
    die('--conclusion is required when --status is completed');
  }
  if (args.conclusion) payload.conclusion = args.conclusion;

  const output = {};
  if (args.title) output.title = args.title;
  const summary = loadSummary(args);
  if (summary !== undefined) output.summary = summary;
  if (Object.keys(output).length > 0) {
    if (!output.title) output.title = `${CHECK_NAME} progress`;
    if (output.summary === undefined) output.summary = '(no summary)';
    payload.output = output;
  }
  return payload;
}

function callBotGh(method, urlPath, payload) {
  const tmpDir = path.join('.escalations', 'runs');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `.check-progress-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(payload));

  const botGh = path.join(__dirname, 'bot-gh.js');
  const ghArgs = ['api', '--method', method, urlPath, '--input', tmpFile, '--jq', '.id'];
  const result = spawnSync(process.execPath, [botGh, ...ghArgs], { encoding: 'utf8' });

  try { fs.unlinkSync(tmpFile); } catch (_) { /* best effort */ }

  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    process.stderr.write(result.stdout || '');
    die(`bot-gh.js api ${method} ${urlPath} exited ${result.status}`, result.status || 1);
  }
  return (result.stdout || '').trim();
}

function main() {
  const args = parseArgs();
  if (!args.pr) die('--pr <N> is required');
  if (!args.status) die('--status in_progress|completed is required');

  const sweepId = process.env.KM_TRIAGE_SWEEP_ID
    || new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
  const prKey = String(args.pr);
  const sidecar = readSidecar(sweepId);
  const existingId = sidecar[prKey] && sidecar[prKey].check_id;

  if (existingId) {
    const payload = buildPayload(args, 'patch');
    const id = callBotGh('PATCH', `/repos/${REPO}/check-runs/${existingId}`, payload);
    sidecar[prKey].last_status = args.status;
    sidecar[prKey].last_update_ts = new Date().toISOString();
    writeSidecar(sweepId, sidecar);
    process.stdout.write(id + '\n');
    return;
  }

  const payload = buildPayload(args, 'create');
  const id = callBotGh('POST', `/repos/${REPO}/check-runs`, payload);
  sidecar[prKey] = {
    check_id: Number(id),
    head_sha: args.head,
    created_at: new Date().toISOString(),
    last_status: args.status,
  };
  writeSidecar(sweepId, sidecar);
  process.stdout.write(id + '\n');
}

main();
