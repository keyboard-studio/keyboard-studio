#!/usr/bin/env node
// test-antipattern-lint — guards against test-suite anti-patterns.
//
// Scans test files for assertions that are never legitimate. No loopholes or
// label-based escape hatches — enforcement is strict across the entire suite.
//
//   TAUTOLOGY (all packages/*/**/*.test.ts):
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
// Run: `pnpm run test-antipattern-lint`  (== `node utilities/test-antipattern-lint/index.js`)
// Wired into `pnpm lint` after all other checks. Must stay GREEN.
//
// CommonJS, plain `node`. No external dependencies (only fs + path).

const { readFileSync, readdirSync, existsSync, statSync } = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");

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
// Matches .map(q => q.id)).toEqual([ or .map(x => x.id)).toEqual([ or similar,
// typically wrapped in expect: expect(...map(q => q.id)).toEqual([...])
// The key signal is the question-ID extraction arrow + literal array literal start.
const SURVEY_SNAPSHOT_RE = /\.map\s*\(\s*\w+\s*=>\s*\w+\.id\s*\)\)\s*\.toEqual\(\s*\[\s*(['"])/g;

// ---------------------------------------------------------------------------
// Main lint
// ---------------------------------------------------------------------------

function main() {
  const failures = []; // { file, line, text }
  const fail = (file, line, text) => failures.push({ file, line, text });

  // Collect all test files in scope.
  const allTestFiles = walk(
    path.join(REPO_ROOT, "packages"),
    ".test.ts"
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

    // ---- Check 1: TAUTOLOGY ----
    // Flag all tautologies. No label-based exemptions or loopholes.
    for (const match of content.matchAll(TAUTOLOGY_RE)) {
      const lineNum = content.substring(0, match.index).split("\n").length;
      fail(frel, lineNum, `tautology: ${match[0]}`);
    }

    // ---- Check 2: SURVEY ORDER-SNAPSHOT ----
    // Only flag in survey-scoped test files. Normalize path separators for cross-platform matching.
    const normalizedPath = frel.replace(/\\/g, "/");
    if (
      /packages\/studio\/.*\/survey\/.*\.test\.ts$/.test(normalizedPath) ||
      /packages\/studio\/tests\/survey\/.*\.test\.ts$/.test(normalizedPath)
    ) {
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
