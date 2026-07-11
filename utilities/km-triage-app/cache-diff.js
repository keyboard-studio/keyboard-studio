#!/usr/bin/env node
// cache-diff.js — compute the reviewable diff + file list for a km-triage PR,
// excluding large generated / binary / oversized files so their bodies do not
// corrupt line-number offsets in specialist findings.
//
// This is the extraction of Pre-filter A's embedded bash (km-triage.md's
// compute_exclusions + KNOWN_GENERATED / OVERSIZED_THRESHOLD). Regression
// intent (PR #350): a committed generated file must not push a real source
// line (e.g. scan.ts:195) to a bogus offset (13617) in the unified diff.
//
// Exclusion criteria, applied to `git diff --numstat <refspec>`:
//   - binary   — numstat emits "-\t-\t<path>"; arithmetic on "-" is 0, which
//                would silently pass the size gate, so catch it first.
//   - generated — path is in KNOWN_GENERATED.
//   - oversized — added+deleted > OVERSIZED_THRESHOLD.
// Excluded paths become `:(exclude)<path>` pathspecs on the cached diff. The
// file LIST is never filtered (specialists must still see the file changed).
//
// Usage (require):
//   const { classifyExclusions } = require('./cache-diff');
//   const { excludePathspecs, excludedLog } = classifyExclusions(numstatText);
//
// Usage (CLI) — writes the cached diff and file list, prints the exclusion log:
//   node cache-diff.js --range full        --pr <NUM> --base <BASE_OID> --head <HEAD_OID> \
//     --diff-out <path> --files-out <path>
//   node cache-diff.js --range incremental --base <LAST_AUDITED_SHA> --head <CURRENT_HEAD_SHA> \
//     --diff-out <path> --files-out <path>
//
// full        → three-dot range (BASE...HEAD); file list from `gh pr view --json files`.
// incremental → two-dot range (BASE..HEAD);  file list from `git diff --name-status`.

'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

// -- Configurable known-generated set --
// Add committed generated outputs here whenever a new large artifact is introduced.
const KNOWN_GENERATED = [
  'docs/import-corpus.json',
  'docs/import-corpus.md',
];

// -- Per-file size threshold (changed lines = added + deleted from --numstat) --
// Any file whose diff exceeds this threshold is excluded even if not known.
const OVERSIZED_THRESHOLD = 2000;

// git diff can emit a large unified diff; give spawnSync room before it excludes.
const MAX_BUFFER = 512 * 1024 * 1024;

/**
 * Classify `git diff --numstat` output into exclusion pathspecs.
 *
 * @param {string} numstatText  Raw stdout of `git diff --numstat <refspec>`.
 * @param {{knownGenerated?: string[], oversizedThreshold?: number}} [opts]
 * @returns {{excludePathspecs: string[], excludedLog: string[]}}
 *   excludePathspecs: `:(exclude)<path>` entries for `git diff -- . <...>`.
 *   excludedLog:      `<path> (<reason>)` entries for the stdout audit line.
 */
function classifyExclusions(numstatText, opts = {}) {
  const knownGenerated = opts.knownGenerated || KNOWN_GENERATED;
  const threshold = opts.oversizedThreshold ?? OVERSIZED_THRESHOLD;
  const excludePathspecs = [];
  const excludedLog = [];

  for (const line of String(numstatText).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;
    const [added, deleted, ...pathParts] = parts;
    const filePath = pathParts.join('\t');

    let reason = '';
    if (added === '-' || deleted === '-') {
      reason = 'binary';
    } else if (knownGenerated.includes(filePath)) {
      reason = 'generated';
    } else {
      const total = Number(added) + Number(deleted);
      if (total > threshold) reason = `oversized: ${total} lines`;
    }

    if (reason) {
      excludePathspecs.push(`:(exclude)${filePath}`);
      excludedLog.push(`${filePath} (${reason})`);
    }
  }

  return { excludePathspecs, excludedLog };
}

function git(args, opts = {}) {
  return spawnSync('git', args, { encoding: 'utf8', maxBuffer: MAX_BUFFER, ...opts });
}

/**
 * Compute exclusions for a range, then write the cached diff (excluding the
 * flagged paths) and the full file list to disk. Returns the exclusion result.
 *
 * @param {{range:'full'|'incremental', pr?:string|number, base:string,
 *          head:string, diffOut:string, filesOut:string}} o
 * @returns {{excludePathspecs:string[], excludedLog:string[]}}
 */
function computeCachedDiff(o) {
  const threeDot = o.range === 'full';
  const range = `${o.base}${threeDot ? '...' : '..'}${o.head}`;

  if (threeDot) {
    git(['fetch', '--quiet', 'origin', o.base, o.head]);
  }

  const numstat = git(['diff', '--numstat', range]);
  const excl = classifyExclusions(numstat.stdout || '');

  const diff = git(['diff', range, '--', '.', ...excl.excludePathspecs]);
  fs.writeFileSync(o.diffOut, diff.stdout || '');

  if (threeDot) {
    const files = spawnSync('gh', ['pr', 'view', String(o.pr), '--json', 'files'], {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });
    fs.writeFileSync(o.filesOut, files.stdout || '');
  } else {
    fs.writeFileSync(o.filesOut, git(['diff', '--name-status', range]).stdout || '');
  }

  return excl;
}

function parseArgs(argv) {
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
  return args;
}

function die(msg) {
  process.stderr.write(`[cache-diff] ${msg}\n`);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.range !== 'full' && args.range !== 'incremental') {
    die('--range full|incremental is required');
  }
  if (!args.base) die('--base <SHA> is required');
  if (!args.head) die('--head <SHA> is required');
  if (!args['diff-out']) die('--diff-out <path> is required');
  if (!args['files-out']) die('--files-out <path> is required');
  if (args.range === 'full' && !args.pr) die('--pr <NUM> is required for --range full');

  const { excludedLog } = computeCachedDiff({
    range: args.range,
    pr: args.pr,
    base: args.base,
    head: args.head,
    diffOut: args['diff-out'],
    filesOut: args['files-out'],
  });

  if (excludedLog.length > 0) {
    process.stdout.write(
      `[km-triage] Pre-filter A excluded ${excludedLog.length} file(s) from cached diff: ` +
      `${excludedLog.join(', ')}. Files remain in ${args['files-out']}; spot-check via git show.\n`
    );
  }
}

if (require.main === module) main();

module.exports = { classifyExclusions, computeCachedDiff, KNOWN_GENERATED, OVERSIZED_THRESHOLD };
