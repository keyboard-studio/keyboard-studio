#!/usr/bin/env node
// cache-diff.js - fetch a PR's review diff ONCE per sweep, excluding files
// whose diff bodies would corrupt specialist line numbers, and cache it to
// disk for the whole review crew (km-triage Phase 4, Pre-filter A).
//
// Regression intent: on a PR like #350 (large committed generated file),
// findings must cite real file line numbers because the generated file body
// is no longer in the cached diff. Excluded files still appear in the file
// list so reviewers can see they changed and fetch them via `git show`.
//
// Usage:
//   Full review (first sweep / post-force-push):
//     node utilities/km-triage-app/cache-diff.js --pr <NUM> --range full
//   Incremental review:
//     node utilities/km-triage-app/cache-diff.js --pr <NUM> \
//       --range <LAST_AUDITED_SHA>..<CURRENT_HEAD_SHA>
//
// Writes:
//   .escalations/diffs/<NUM>-<HEAD_SHORT_SHA>.diff        (unified diff, exclusions applied)
//   .escalations/diffs/<NUM>-<HEAD_SHORT_SHA>.files.json  (FULL file list, no exclusions)
//
// Stdout: one JSON object: { diffPath, filesPath, headSha, range, excluded }
//   where excluded is [{ path, reason }] - always present, [] when nothing
//   was excluded (no silent caps: exclusions are also logged to stderr).
// Exit code: 0 on success, non-zero on any git/gh failure.
//
// Exclusion criteria (classifyNumstat below is the single source of truth):
//   - binary files (git --numstat emits "-\t-\t<path>")
//   - KNOWN_GENERATED paths (committed generated outputs; extend the list
//     whenever a new large artifact is introduced)
//   - oversized diffs (> OVERSIZED_THRESHOLD changed lines)

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Committed generated outputs whose diff bodies never need human/agent review.
const KNOWN_GENERATED = ['docs/import-corpus.json', 'docs/import-corpus.md'];

// Per-file size threshold (changed lines = added + deleted from --numstat).
const OVERSIZED_THRESHOLD = 2000;

const DIFFS_DIR = path.join('.escalations', 'diffs');

/**
 * Classify each file in `git diff --numstat` output as included or excluded.
 *
 * @param {string} numstatText  raw stdout of `git diff --numstat <refspec>`
 * @param {string[]} knownGenerated  repo-relative paths always excluded
 * @param {number} threshold  changed-line count above which a file is excluded
 * @returns {{ excludePathspecs: string[], excluded: {path: string, reason: string}[] }}
 */
function classifyNumstat(numstatText, knownGenerated = KNOWN_GENERATED, threshold = OVERSIZED_THRESHOLD) {
  const excludePathspecs = [];
  const excluded = [];
  for (const line of numstatText.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [added, deleted] = parts;
    const filePath = parts.slice(2).join('\t');
    let reason = '';
    // Binary files: numstat emits "-\t-\t<path>"; arithmetic on "-" would be
    // 0 and silently pass the threshold. Catch them first.
    if (added === '-' || deleted === '-') {
      reason = 'binary';
    } else if (knownGenerated.includes(filePath)) {
      reason = 'generated';
    } else {
      const total = parseInt(added, 10) + parseInt(deleted, 10);
      if (total > threshold) reason = `oversized: ${total} lines`;
    }
    if (reason) {
      excludePathspecs.push(`:(exclude)${filePath}`);
      excluded.push({ path: filePath, reason });
    }
  }
  return { excludePathspecs, excluded };
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${res.status}: ${res.stderr}`);
  }
  return res.stdout;
}

function die(msg) {
  process.stderr.write(`[cache-diff] ${msg}\n`);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  const pr = args.pr;
  const range = args.range;
  if (!pr || !/^\d+$/.test(pr)) die('--pr <NUM> is required (integer)');
  if (!range) die('--range full|<sha>..<sha> is required');

  let refspec;
  let headSha;
  let filesJson;

  if (range === 'full') {
    // Resolve base/head OIDs so git pathspec exclusions can be applied
    // (gh pr diff does not accept pathspec exclusions; git diff does).
    const view = JSON.parse(
      run('gh', ['pr', 'view', pr, '--json', 'baseRefOid,headRefOid,files'])
    );
    const baseOid = view.baseRefOid;
    headSha = view.headRefOid;
    spawnSync('git', ['fetch', '--quiet', 'origin', baseOid, headSha], { encoding: 'utf8' });
    refspec = `${baseOid}...${headSha}`;
    // Keep the FULL file list - reviewers must still see that excluded files changed.
    filesJson = JSON.stringify({ files: view.files }, null, 2);
  } else {
    const m = range.match(/^([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})$/i);
    if (!m) die(`--range must be "full" or "<sha>..<sha>", got: ${range}`);
    headSha = m[2];
    refspec = range;
    const nameStatus = run('git', ['diff', '--name-status', range]);
    const files = nameStatus
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [status, ...rest] = l.split('\t');
        return { status, path: rest[rest.length - 1] };
      });
    filesJson = JSON.stringify({ files }, null, 2);
  }

  const numstat = run('git', ['diff', '--numstat', refspec]);
  const { excludePathspecs, excluded } = classifyNumstat(numstat);

  fs.mkdirSync(DIFFS_DIR, { recursive: true });
  const shortSha = headSha.slice(0, 8);
  const diffPath = path.join(DIFFS_DIR, `${pr}-${shortSha}.diff`);
  const filesPath = path.join(DIFFS_DIR, `${pr}-${shortSha}.files.json`);

  const diffArgs = ['diff', refspec, '--', '.'].concat(excludePathspecs);
  fs.writeFileSync(diffPath, run('git', diffArgs));
  fs.writeFileSync(filesPath, filesJson);

  if (excluded.length > 0) {
    process.stderr.write(
      `[km-triage] cache-diff excluded ${excluded.length} file(s) from cached diff: ` +
        excluded.map((e) => `${e.path} (${e.reason})`).join(', ') +
        `. Files remain in ${filesPath}; spot-check via git show.\n`
    );
  }

  process.stdout.write(
    JSON.stringify({ diffPath, filesPath, headSha, range, excluded }) + '\n'
  );
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    die(e.message);
  }
}

module.exports = { classifyNumstat, KNOWN_GENERATED, OVERSIZED_THRESHOLD };
