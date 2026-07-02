#!/usr/bin/env node
// crew-lint.mjs - machine-enforced consistency checks for the .claude crew
// definition corpus (.claude/agents/km-*.md, .claude/commands/km-*.md,
// .claude/workflows/km-review.js).
//
// The crew files accumulated exactly the defect classes this repo already
// prevents in its data files via machine-enforced guards (zod drift guards,
// criteria-count tests): rubric drift between agent/command pairs, phantom
// package paths, emoji, rotted line-number cross-references, stale sentinel
// names. Prose conventions did not prevent any of them; these checks do.
//
// Run:
//   pnpm crew-lint            (wired into `pnpm lint`)
//   node utilities/crew-lint/crew-lint.mjs
//
// Exit code: 0 when all checks pass, 1 otherwise. Every failure names the
// offending file and line.
//
// The seven checks:
//   1. no-python-fences    - no ```python blocks in any crew markdown
//   2. no-emoji            - no emoji glyphs (Windows no-emoji convention)
//   3. no-phantom-packages - every packages/<name> mention exists on disk
//   4. no-line-number-refs - no "line ~N" / "lines ~N" cross-refs in km-triage.md
//   5. pair-consistency    - agent/command pairs agree on scoring anchor facts
//   6. roster-consistency  - every km-* role named in km-lead.md / km-triage.md
//                            resolves to a .claude/agents/<name>.md (or allowlist)
//   7. sentinel-consistency- the labels-created sentinel has exactly one spelling
//                            across km-triage.md and sweep-init.js

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
const COMMANDS_DIR = path.join(ROOT, '.claude', 'commands');
const TRIAGE_MD = path.join(COMMANDS_DIR, 'km-triage.md');
const SWEEP_INIT = path.join(ROOT, 'utilities', 'km-triage-app', 'sweep-init.js');

const failures = [];

function fail(file, line, check, message) {
  failures.push({ file: path.relative(ROOT, file), line, check, message });
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function crewMarkdownFiles() {
  const files = [];
  for (const dir of [AGENTS_DIR, COMMANDS_DIR]) {
    for (const name of fs.readdirSync(dir)) {
      if (/^km-.*\.md$/i.test(name)) files.push(path.join(dir, name));
    }
  }
  return files;
}

function eachLine(file, cb) {
  read(file).split('\n').forEach((text, i) => cb(text, i + 1));
}

// --- Check 1: no python fences -------------------------------------------

function checkNoPythonFences(files) {
  for (const file of files) {
    eachLine(file, (text, line) => {
      if (/^\s*```python\b/.test(text)) {
        fail(file, line, 'no-python-fences', 'python code fence in a crew file (TS monorepo)');
      }
    });
  }
}

// --- Check 2: no emoji ----------------------------------------------------

// Covers the pictograph blocks plus the misc-symbol/dingbat ranges that the
// old crew files actually used (check marks, crosses, warning signs, robots),
// and the variation selector that turns text glyphs into emoji presentation.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2705}\u{274C}\u{274E}\u{2757}\u{2714}\u{2716}]/u;

function checkNoEmoji(files) {
  for (const file of files) {
    eachLine(file, (text, line) => {
      const m = text.match(EMOJI_RE);
      if (m) {
        fail(file, line, 'no-emoji', `emoji glyph ${JSON.stringify(m[0])} (repo no-emoji convention; use [OK]/[ERROR]/[WARN])`);
      }
    });
  }
}

// --- Check 3: no phantom packages/ paths ----------------------------------

function expandBraces(segment) {
  const m = segment.match(/^\{(.+)\}$/);
  return m ? m[1].split(',') : [segment];
}

function checkNoPhantomPackages(files) {
  const pkgRe = /packages\/(\{[^}]+\}|[A-Za-z0-9_.-]+)/g;
  for (const file of files) {
    eachLine(file, (text, line) => {
      for (const m of text.matchAll(pkgRe)) {
        for (const name of expandBraces(m[1])) {
          const clean = name.trim();
          // wildcards and template placeholders are patterns, not paths
          if (clean === '' || clean.includes('*') || clean.includes('<')) continue;
          if (!fs.existsSync(path.join(ROOT, 'packages', clean))) {
            fail(file, line, 'no-phantom-packages', `packages/${clean} does not exist on disk`);
          }
        }
      }
    });
  }
}

// --- Check 4: no hardcoded line-number cross-refs in km-triage.md ---------

function checkNoLineNumberRefs() {
  eachLine(TRIAGE_MD, (text, line) => {
    if (/\blines?\s*~\s*\d+/i.test(text)) {
      fail(TRIAGE_MD, line, 'no-line-number-refs', 'hardcoded line-number cross-reference (will rot; reference the section name instead)');
    }
  });
}

// --- Check 5: agent/command pair anchor-fact consistency -------------------

// Extract the "anchor facts" a role's two definitions must agree on when both
// state them: severity point values (subtract N per P0/P1/P2) and the PASS
// threshold. Pragmatic by design - it catches the km-qc-style rubric fork,
// not every conceivable divergence.
function anchorFacts(text) {
  const facts = {};
  const sev = text.match(/(\d+)\s*per\s*P0[^.\n]*?(\d+)\s*per\s*P1[^.\n]*?(\d+)\s*per\s*P2/);
  if (sev) facts.severityPoints = `P0:${sev[1]} P1:${sev[2]} P2:${sev[3]}`;
  const pass = text.match(/PASS[^)\n]{0,20}?(?:>=|≥)\s*(\d+)/);
  if (pass) facts.passThreshold = pass[1];
  // additive section scoring ("X/25" sections) marks the retired rubric shape
  if (/\/25\b/.test(text) && /\/100\b/.test(text)) facts.additiveSections = 'yes';
  return facts;
}

function checkPairConsistency() {
  const agentRoles = fs.readdirSync(AGENTS_DIR).filter((n) => /^km-.*\.md$/i.test(n));
  for (const name of agentRoles) {
    const agentFile = path.join(AGENTS_DIR, name);
    const commandFile = path.join(COMMANDS_DIR, name);
    if (!fs.existsSync(commandFile)) continue;
    const a = anchorFacts(read(agentFile));
    const c = anchorFacts(read(commandFile));
    for (const key of new Set([...Object.keys(a), ...Object.keys(c)])) {
      if (key === 'additiveSections') {
        // present in one file at all means a second scoring shape exists
        if (a[key] || c[key]) {
          const where = a[key] ? agentFile : commandFile;
          fail(where, 1, 'pair-consistency', `${name}: additive /25-section scoring found - the canonical rubric is subtractive P0/P1/P2`);
        }
        continue;
      }
      if (a[key] !== undefined && c[key] !== undefined && a[key] !== c[key]) {
        fail(agentFile, 1, 'pair-consistency', `${name}: ${key} differs between agent (${a[key]}) and command (${c[key]})`);
      }
    }
  }
}

// --- Check 6: roster consistency -------------------------------------------

// Names that legitimately appear without a .claude/agents/<name>.md file.
const ROSTER_ALLOWLIST = new Set([
  'km-lead',      // command-only role (runs in the main session)
  'km-triage',    // command-only role
  'km-review',    // workflow, .claude/workflows/km-review.js
  'km-triage-app',// utility directory, not a role
]);

function checkRosterConsistency() {
  const sources = [path.join(COMMANDS_DIR, 'km-lead.md'), TRIAGE_MD];
  for (const file of sources) {
    eachLine(file, (text, line) => {
      for (const m of text.matchAll(/\bkm-[a-zA-Z]+(?:-[a-zA-Z]+)*\b/g)) {
        const token = m[0];
        if (ROSTER_ALLOWLIST.has(token)) continue;
        const before = text[m.index - 1] ?? '';
        const after = text[m.index + token.length] ?? '';
        if (before === '<') continue;           // template placeholder: <km-reviewer-1>, <km-name>
        if (after === '.' || after === '/') continue; // filename or path: km-triage-personal-mode.md, km-triage/review
        if (before === '/') continue;           // path segment: docs/km-triage-...
        if (!fs.existsSync(path.join(AGENTS_DIR, `${token}.md`))) {
          fail(file, line, 'roster-consistency', `names "${token}" but .claude/agents/${token}.md does not exist`);
        }
      }
    });
  }
}

// --- Check 7: sentinel-name consistency ------------------------------------

function checkSentinelConsistency() {
  const spellings = new Map(); // spelling -> [{file, line}]
  for (const file of [TRIAGE_MD, SWEEP_INIT]) {
    eachLine(file, (text, line) => {
      for (const m of text.matchAll(/\.labels-created[A-Za-z0-9_-]*/g)) {
        if (!spellings.has(m[0])) spellings.set(m[0], []);
        spellings.get(m[0]).push({ file, line });
      }
    });
  }
  if (spellings.size > 1) {
    for (const [spelling, sites] of spellings) {
      for (const s of sites) {
        fail(s.file, s.line, 'sentinel-consistency', `sentinel spelled "${spelling}" - ${spellings.size} distinct spellings found; there must be exactly one`);
      }
    }
  }
  if (spellings.size === 0) {
    fail(SWEEP_INIT, 1, 'sentinel-consistency', 'labels-created sentinel not found at all (renamed? update crew-lint)');
  }
}

// --- main -------------------------------------------------------------------

const files = crewMarkdownFiles();
checkNoPythonFences(files);
checkNoEmoji(files);
checkNoPhantomPackages(files);
checkNoLineNumberRefs();
checkPairConsistency();
checkRosterConsistency();
checkSentinelConsistency();

if (failures.length > 0) {
  for (const f of failures) {
    console.error(`[FAIL] ${f.file}:${f.line} (${f.check}) ${f.message}`);
  }
  console.error(`\ncrew-lint: ${failures.length} failure(s) across 7 checks.`);
  process.exit(1);
}
console.log('crew-lint: all 7 checks passed.');
