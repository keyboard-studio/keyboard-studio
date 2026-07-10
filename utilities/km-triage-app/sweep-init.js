#!/usr/bin/env node
// sweep-init.js — Phase-1 bootstrap for a km-triage sweep.
//
// Extraction of km-triage.md Phase 1's embedded bash: creates the .escalations
// scratch dirs, ensures the audit log exists, and — guarded by a sentinel file
// (.escalations/.labels-created-v2) — creates the four triage labels exactly
// once per repo lifetime. Bump the sentinel suffix here (and in the doc) when a
// label is added so existing installs create the newcomer on their next sweep.
//
// The label `gh label create` calls use plain `gh` (the human PAT) in both bot
// and personal mode — they run once per repo, not per PR.
//
// Usage (require):
//   const { sweepInit } = require('./sweep-init');
//   const info = sweepInit();            // { root, auditLog, sentinel, labelsCreated, labels }
//
// Usage (CLI) — bootstraps, then prints a one-line JSON baseline the caller can
// capture (the worktree-isolation baseline that Phase-6 re-asserts):
//   node sweep-init.js [--root <dir>] [--no-labels] [--no-baseline]
//   -> {"root":"...","labelsCreated":<bool>,"head":"<sha|null>","porcelain":"<...>"}

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SUBDIRS = ['runs', 'diffs', 'worktrees'];
const SENTINEL = '.labels-created-v2';

const LABELS = [
  { name: 'ready-to-merge', color: '0e8a16', description: 'Triage approved - ready to merge by any team member' },
  { name: 'review-needed', color: 'd93f0b', description: 'Triage escalated - awaiting submitter or maintainer response on the PR' },
  { name: 'triage-skip', color: 'cfd3d7', description: 'Do not run triage on this PR' },
  { name: 'needs-rebase', color: 'fbca04', description: 'Triage: branch conflicts with base - rebase needed (auto-clears once mergeable)' },
];

// Default label creator: plain `gh label create`, errors swallowed (the bash
// used `2>/dev/null || true` — a label that already exists is not a failure).
function defaultGhRunner(label) {
  spawnSync('gh', [
    'label', 'create', label.name,
    '--color', label.color,
    '--description', label.description,
  ], { stdio: 'ignore' });
}

/**
 * Bootstrap the .escalations scratch tree and create triage labels once.
 *
 * @param {{root?:string, createLabels?:boolean, ghRunner?:(label:object)=>void}} [opts]
 * @returns {{root:string, auditLog:string, sentinel:string, labelsCreated:boolean, labels:string[]}}
 *   labelsCreated is true only on the first sweep that created the sentinel.
 */
function sweepInit(opts = {}) {
  const root = opts.root || '.escalations';
  const createLabels = opts.createLabels !== false;
  const ghRunner = opts.ghRunner || defaultGhRunner;

  for (const d of SUBDIRS) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }

  const auditLog = path.join(root, 'audit-log.jsonl');
  if (!fs.existsSync(auditLog)) {
    fs.writeFileSync(auditLog, '');
  }

  const sentinel = path.join(root, SENTINEL);
  const labelsCreated = !fs.existsSync(sentinel);
  if (labelsCreated) {
    if (createLabels) {
      for (const label of LABELS) {
        try {
          ghRunner(label);
        } catch (_) { /* best effort */ }
      }
    }
    fs.writeFileSync(sentinel, '');
  }

  return { root, auditLog, sentinel, labelsCreated, labels: LABELS.map((l) => l.name) };
}

// Worktree-isolation baseline (git rev-parse HEAD + porcelain status). Best
// effort: returns nulls when not in a git repo.
function readBaseline() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const porcelain = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' });
  return {
    head: head.status === 0 ? (head.stdout || '').trim() : null,
    porcelain: porcelain.status === 0 ? (porcelain.stdout || '') : '',
  };
}

function main() {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }

  const info = sweepInit({
    root: typeof args.root === 'string' ? args.root : undefined,
    createLabels: !args['no-labels'],
  });

  const baseline = args['no-baseline'] ? { head: null, porcelain: '' } : readBaseline();
  process.stdout.write(JSON.stringify({
    root: info.root,
    labelsCreated: info.labelsCreated,
    ...baseline,
  }) + '\n');
}

if (require.main === module) main();

module.exports = { sweepInit, LABELS, SENTINEL };
