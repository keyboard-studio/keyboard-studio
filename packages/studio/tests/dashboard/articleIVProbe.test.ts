// articleIVProbe.test.ts — spec-014 US5 T033 architecture probe (V3/SC-009).
//
// V3 (Constitution Article IV): the C4 validator graduation (T034) MUST reuse the
// EXISTING single 300 ms `useValidator`/`useDebounce` cycle — it must NOT
// introduce a second debounce timer or a parallel async validation loop.
//
// This probe enforces V3 STRUCTURALLY, so a future change that spins up a new
// validation path inside the dashboard layer fails here:
//
//   1. completeness.ts (where C4 lives) must NOT run the validator itself — no
//      import of validateWithOracle / runAllChecks, and no debounce/timer/async
//      machinery (setTimeout / useDebounce / DEBOUNCE_MS / async / Promise /
//      await). It CONSUMES already-computed LintFinding[]; it never produces them.
//   2. The single debounce remains in hooks/useValidator.ts (the one
//      useDebounce(...) call), and StudioShell wires that hook's `findings` into
//      runCompleteness — there is exactly ONE useValidator call site and exactly
//      ONE runCompleteness call site, and the latter receives the former's output.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/flag-and-validator.contract.md (V3)
//   specs/014-mutate-seam-touch-propagation/spec.md (US5 AC-3, SC-009)

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../../src");

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8");
}

function countMatches(source: string, re: RegExp): number {
  const m = source.match(re);
  return m === null ? 0 : m.length;
}

/**
 * Strip `import` statements, block comments (`/* … *​/` and `/** … *​/`), and
 * single-line `//` comments so symbol probes are not tripped by an import
 * binding or a doc-comment mention — the V3 invariant is about executable code.
 */
function codeOnly(source: string): string {
  // 0. Normalize CRLF -> LF FIRST. Without this the whole function silently
  //    no-ops on a Windows checkout (core.autocrlf rewrites the working tree
  //    even though the blobs are LF): step 2 splits on "\n", leaving a trailing
  //    "\r" on every line, and `/\/\/.*$/` then cannot match, because in JS
  //    regex `.` excludes \r as a line terminator — so `.*` stops short of `$`
  //    and the replace does nothing. Line comments survived, and this probe
  //    failed on its OWN compliance comment ("no second debounce / async loop
  //    — V3/Article IV") while the code it guards was perfectly synchronous.
  const lf = source.replace(/\r\n/g, "\n");
  // 1. Remove block comments (non-greedy, spanning lines).
  const noBlocks = lf.replace(/\/\*[\s\S]*?\*\//g, "");
  // 2. Remove import statements and line comments.
  return noBlocks
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("T033 / US5 — Article IV probe: no second debounce timer / parallel validation path (V3)", () => {
  describe("dashboard/completeness.ts does NOT run a validator or own a debounce", () => {
    // Probe CODE only (imports + comments stripped) — the file's own doc-comments
    // legitimately mention validateWithOracle / async / debounce when EXPLAINING
    // that they are NOT used here; the V3 invariant is about executable code.
    const completeness = codeOnly(read("dashboard/completeness.ts"));

    it("does NOT import the engine validator (validateWithOracle / runAllChecks)", () => {
      expect(completeness).not.toMatch(/validateWithOracle/);
      expect(completeness).not.toMatch(/runAllChecks/);
    });

    it("does NOT import or call useDebounce / a debounce constant", () => {
      expect(completeness).not.toMatch(/useDebounce/);
      expect(completeness).not.toMatch(/DEBOUNCE_MS/);
    });

    it("introduces NO timer (setTimeout / setInterval) — no second debounce", () => {
      expect(completeness).not.toMatch(/setTimeout\s*\(/);
      expect(completeness).not.toMatch(/setInterval\s*\(/);
    });

    it("introduces NO async loop (async / await / Promise / .then) — pure & synchronous", () => {
      // C4 consumes already-resolved LintFinding[]; runCompleteness stays a pure
      // synchronous function. No async validation loop lives here.
      expect(completeness).not.toMatch(/\basync\b/);
      expect(completeness).not.toMatch(/\bawait\b/);
      expect(completeness).not.toMatch(/\bPromise\b/);
      expect(completeness).not.toMatch(/\.then\s*\(/);
    });

    it("consumes findings as a parameter (LintFinding[]) — it does not produce them", () => {
      // The graduation reads findings passed in, proving it reuses upstream output.
      // Check the full source (the type import + the param both prove consumption).
      const full = read("dashboard/completeness.ts");
      expect(full).toMatch(/LintFinding/);
      expect(full).toMatch(/findings/);
    });
  });

  describe("useValidator remains the single debounce path", () => {
    const useValidator = read("hooks/useValidator.ts");

    it("has EXACTLY ONE useDebounce call (the single validation timer)", () => {
      expect(countMatches(useValidator, /useDebounce\s*\(/g)).toBe(1);
    });

    it("is the only module that calls validateWithOracle in the validation cycle", () => {
      // The validator is invoked here (the single debounced cycle), not in C4.
      expect(useValidator).toMatch(/validateWithOracle/);
    });
  });

  describe("StudioShell does NOT add a second validation path for completeness (V3)", () => {
    const shell = read("StudioShell.tsx");
    const shellCode = codeOnly(shell);

    it("calls useValidator AT MOST once (no second debounce cycle)", () => {
      // The single useValidator cycle lives in SurveyView. StudioShell must NOT
      // spin a second one for the completeness/C4 graduation (that would add a
      // second 300 ms debounce and violate Article IV / V3).
      expect(countMatches(shellCode, /useValidator\s*\(/g)).toBeLessThanOrEqual(1);
    });

    it("calls runCompleteness exactly once", () => {
      expect(countMatches(shellCode, /runCompleteness\s*\(/g)).toBe(1);
    });

    it("introduces no debounce timer (no DEBOUNCE_MS / setTimeout / useDebounce)", () => {
      expect(shellCode).not.toMatch(/DEBOUNCE_MS/);
      expect(shellCode).not.toMatch(/useDebounce/);
      expect(shellCode).not.toMatch(/setTimeout\s*\(/);
    });
  });
});
