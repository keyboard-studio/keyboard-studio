#!/usr/bin/env node
// sweep-init.js - km-triage Phase-1 bootstrap in one call.
//
// Does three things the triage doc previously spelled out as embedded bash:
//   1. Creates the .escalations/ scratch layout (runs/, diffs/, worktrees/)
//      and ensures audit-log.jsonl exists. (.escalations/ is gitignored.)
//   2. Sentinel-guarded triage-label creation: the `gh label create` set runs
//      once per repo lifetime, guarded by .escalations/.labels-created-v2.
//      Bump SENTINEL's suffix whenever a label is added so existing installs
//      create the newcomer on their next sweep (then go quiet again).
//   3. Snapshots the worktree-isolation baseline (HEAD SHA + porcelain
//      status) that the Phase-6 auto-fix post-condition re-asserts.
//
// Usage:
//   node utilities/km-triage-app/sweep-init.js [--no-labels]
//
// Stdout: one JSON object:
//   { sweepStartHead, sweepStartPorcelain, labelsCreated, baselinePath }
// The same object is written to .escalations/runs/<sweep_id>-baseline.json
// so later phases can re-read the baseline without shell-state threading.
//
// --no-labels skips the gh calls entirely (tests / offline runs).
// Label creation is best-effort: a gh failure prints a warning but does not
// abort the sweep (labels usually already exist).

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ESCALATIONS = '.escalations';
const SENTINEL = path.join(ESCALATIONS, '.labels-created-v2');

// The triage label set - single source of truth for names/colors/descriptions.
const LABELS = [
  ['ready-to-merge', '0e8a16', 'Triage approved - ready to merge by any team member'],
  ['review-needed', 'd93f0b', 'Triage escalated - awaiting submitter or maintainer response on the PR'],
  ['triage-skip', 'cfd3d7', 'Do not run triage on this PR'],
  ['needs-rebase', 'fbca04', 'Triage: branch conflicts with base - rebase needed (auto-clears once mergeable)'],
];

function git(args) {
  const res = spawnSync('git', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${res.status}: ${res.stderr}`);
  }
  return res.stdout;
}

function main() {
  const noLabels = process.argv.includes('--no-labels');

  for (const dir of ['runs', 'diffs', 'worktrees']) {
    fs.mkdirSync(path.join(ESCALATIONS, dir), { recursive: true });
  }
  const auditLog = path.join(ESCALATIONS, 'audit-log.jsonl');
  if (!fs.existsSync(auditLog)) fs.writeFileSync(auditLog, '');

  let labelsCreated = false;
  if (!noLabels && !fs.existsSync(SENTINEL)) {
    for (const [name, color, description] of LABELS) {
      const res = spawnSync(
        'gh',
        ['label', 'create', name, '--color', color, '--description', description],
        { encoding: 'utf8' }
      );
      // Best-effort: "already exists" and transient failures are non-fatal.
      if (res.error) {
        process.stderr.write(`[sweep-init] gh label create ${name} failed: ${res.error.message}\n`);
      }
    }
    fs.writeFileSync(SENTINEL, '');
    labelsCreated = true;
  }

  const sweepStartHead = git(['rev-parse', 'HEAD']).trim();
  const sweepStartPorcelain = git(['status', '--porcelain=v1', '--untracked-files=all']);

  const sweepId = process.env.KM_TRIAGE_SWEEP_ID || new Date().toISOString().replace(/[:.]/g, '-');
  const baselinePath = path.join(ESCALATIONS, 'runs', `${sweepId}-baseline.json`);
  const result = { sweepStartHead, sweepStartPorcelain, labelsCreated, baselinePath };
  fs.writeFileSync(baselinePath, JSON.stringify(result, null, 2));

  process.stdout.write(JSON.stringify(result) + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`[sweep-init] ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { LABELS, SENTINEL };
