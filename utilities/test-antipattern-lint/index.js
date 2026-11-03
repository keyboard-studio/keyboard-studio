#!/usr/bin/env node
// test-antipattern-lint — guards against test-suite anti-patterns.
//
// Scans test files for assertions that are never legitimate. No loopholes or
// label-based escape hatches — enforcement is strict across the entire suite.
//
//   TAUTOLOGY (all packages/*/**/*.test.ts and *.test.tsx):
//     A literal `expect(true).toBe(true)` / `expect(false).toBe(false)` /
//     `expect(1).toBe(1)` style assertion. These are placeholders that fail
//     the discipline — they prove nothing and should never ship. All instances
//     are flagged; no describe-label exemptions.
//
//   SURVEY ORDER-SNAPSHOT (packages/studio/**/survey/**/*.test.ts +
//                          packages/studio/tests/survey/**/*.test.ts):
//     A hardcoded question-order array literal in `.map(q => q.id)).toEqual([`
//     form. Question order belongs in thin YAML / reachability tests, not
//     pinned as a literal array — this smells like a snapshot from a run
//     that should have been replaced with a real structural assertion.
//
//   CATALOG-COUNT (all packages/*/**/*.test.ts):
//     `expect(ALL_X).toHaveLength(N)` / `expect(sectionNN.length).toBe(N)` -- a
//     literal size pinned on a growing catalog (see CATALOG_COUNT_RE).
//
// Run: `pnpm run test-antipattern-lint`  (== `node utilities/test-antipattern-lint/index.js`)
// Wired into `pnpm lint` after all other checks. Must stay GREEN.
//
// CommonJS, plain `node`. No external dependencies (only fs + path).

const { readFileSync, readdirSync, existsSync, statSync } = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");

const OVERSIZE_LINES = 1500;

const rel = (abs) => path.relative(REPO_ROOT, abs);

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function walk(dir, ext) {
  const out = [];
  if (!existsSync(dir)) return out;
  // Skip node_modules and hidden directories to avoid broken symlinks.
  const skip = new Set(["node_modules", ".git", "dist", "build"]);
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const abs = path.join(dir, entry);
    try {
      if (statSync(abs).isDirectory()) out.push(...walk(abs, ext));
      else if (abs.endsWith(ext)) out.push(abs);
    } catch (e) {
      // Skip files we can't stat (broken symlinks, permission errors, etc.)
      continue;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pattern detectors
// ---------------------------------------------------------------------------

// TAUTOLOGY: expect(true).toBe(true) and variants.
// Regex matches: expect( <subject> ).toBe( <subject> ) where subject is
// true, false, a decimal number, or a string literal (single or double quoted).
const TAUTOLOGY_RE =
  /expect\(\s*(true|false|\d+|(['"]).*?\2)\s*\)\.toBe\(\s*\1\s*\)/g;

// SURVEY ORDER-SNAPSHOT: .map(...)).toEqual([ followed by string literals.
// Matches .map(q => q.id)).toEqual([ or .map((q) => q.id)).toEqual([ or similar,
// typically wrapped in expect: expect(...map((q) => q.id)).toEqual([...])
// The key signal is the question-ID extraction arrow + literal array literal start.
// The arrow parameter may be parenthesized or bare — the repo uses `(q) =>`, so
// the parens are required-optional here (a bare-only pattern silently never fires).
const SURVEY_SNAPSHOT_RE =
  /\.map\s*\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.id\s*\)\)\s*\.toEqual\(\s*\[\s*(['"])/g;

// CATALOG-COUNT: a literal size pinned on a growing catalog -- an `ALL_*`
// constant or a `section<N>` filter result. The catalog grows, so the number
// breaks on every legitimate addition and proves nothing. Assert structure
// (unique ids, non-empty, every entry valid) instead.
const CATALOG_COUNT_RE =
  /expect\(\s*(?:ALL_[A-Z0-9_]+|section\d+)\s*\)\.toHaveLength\(\s*\d+\s*\)|expect\(\s*(?:ALL_[A-Z0-9_]+|section\d+)\.length\s*\)\.toBe\(\s*\d+\s*\)/g;

// ---------------------------------------------------------------------------
// Main lint
// ---------------------------------------------------------------------------

function main() {
  const failures = []; // { file, line, text }
  const fail = (file, line, text) => failures.push({ file, line, text });
  const oversize = []; // advisory only: { file, lines }

  // Collect all test files in scope.
  // `.test.tsx` is most of packages/studio, so it must be scanned too.
  const allTestFiles = [".test.ts", ".test.tsx"].flatMap((ext) =>
    walk(path.join(REPO_ROOT, "packages"), ext)
  );

  for (const file of allTestFiles) {
    const frel = rel(file);
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch (e) {
      fail(frel, 0, `read error: ${e.message}`);
      continue;
    }

    const lines = content.split("\n");
    if (lines.length > OVERSIZE_LINES) oversize.push({ file: frel, lines: lines.length });

    // ---- Check 1: TAUTOLOGY ----
    // Flag all tautologies. No label-based exemptions or loopholes.
    for (const match of content.matchAll(TAUTOLOGY_RE)) {
      const lineNum = content.substring(0, match.index).split("\n").length;
      fail(frel, lineNum, `tautology: ${match[0]}`);
    }

    // ---- Check 3: CATALOG-COUNT ----
    for (const match of content.matchAll(CATALOG_COUNT_RE)) {
      const lineNum = content.substring(0, match.index).split("\n").length;
      fail(frel, lineNum, `catalog-count: literal size on a growing catalog: ${match[0]}`);
    }

    // ---- Check 2: SURVEY ORDER-SNAPSHOT ----
    // Only flag in survey-scoped test files. Normalize path separators for cross-platform matching.
    // One regex suffices: `.*/survey/` already covers both src/survey and tests/survey
    // (the `.*` matches the `tests` segment) — a separate tests/survey branch was redundant.
    // Caveat: SURVEY_SNAPSHOT_RE only catches the single-expression chained form
    // (`.map(...)).toEqual([`). Splitting into two statements
    // (`const ids = xs.map(...); expect(ids).toEqual([...])`) bypasses it — accepted
    // limitation; the inline form is the one that actually shows up in snapshots.
    const normalizedPath = frel.replace(/\\/g, "/");
    if (/packages\/studio\/.*\/survey\/.*\.test\.ts$/.test(normalizedPath)) {
      for (const match of content.matchAll(SURVEY_SNAPSHOT_RE)) {
        const lineNum = content.substring(0, match.index).split("\n").length;
        fail(
          frel,
          lineNum,
          `survey-order-snapshot: hardcoded question-order array in .toEqual([ ... ])`
        );
      }
    }
  }

  // ---- Report ----
  console.log(
    `test-antipattern-lint: scanned ${allTestFiles.length} test files`
  );
  // Advisory: very large test files hide exploration-era sprawl. Never fails the
  // run; split by behaviour when touching one (km-testing test-delta audit).
  if (oversize.length > 0) {
    oversize.sort((a, b) => b.lines - a.lines);
    console.log(
      `[WARN] test-antipattern-lint: ${oversize.length} test file(s) over ${OVERSIZE_LINES} lines (advisory); largest:`
    );
    for (const o of oversize.slice(0, 5)) console.log(`  [WARN] ${o.file}  ${o.lines} lines`);
  }
  if (failures.length === 0) {
    console.log("[OK] test-antipattern-lint: all checks passed");
  } else {
    console.error(`[ERROR] test-antipattern-lint: ${failures.length} issue(s):`);
    for (const f of failures) {
      const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file;
      console.error(`  [ERROR] ${loc}  ${f.text}`);
    }
  }

  process.exit(failures.length === 0 ? 0 : 1);
}

main();
