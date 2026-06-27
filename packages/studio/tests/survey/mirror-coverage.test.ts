// Mirror-coverage gate (T015).
//
// At test time, enumerates every src/survey/questions/<phase>/<id>.ts module
// (excluding index/registry/barrel files and *.test.ts files) and asserts that
// a matching tests/survey/questions/<phase>/<id>.test.ts exists.
//
// Handles both flat form (<id>.ts) and folder form (<id>/index.ts, introduced
// in US5). For folder form the expected mirror is tests/.../<id>.test.ts keyed
// on the folder name, not "index".
//
// A module with no mirror test FAILS this spec. Add the missing test file to
// tests/survey/questions/<phase>/<id>.test.ts to resolve.

import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";

// Resolve paths relative to this spec file, which lives at:
//   packages/studio/tests/survey/mirror-coverage.test.ts
const thisFile = fileURLToPath(import.meta.url);
const testsDir = path.dirname(thisFile); // …/tests/survey
const pkgRoot = path.resolve(testsDir, "../.."); // …/packages/studio

const srcQuestionsRoot = path.join(pkgRoot, "src", "survey", "questions");
const testsQuestionsRoot = path.join(pkgRoot, "tests", "survey", "questions");

// File/folder names that are NOT per-question modules.
const EXCLUDED_NAMES = new Set([
  "index",
  "registry",
  "registry.a",
  "registry.b",
  "registry.f",
  "registry.test",
  "types",
]);

function isExcluded(stem: string): boolean {
  return EXCLUDED_NAMES.has(stem) || stem.startsWith("registry.");
}

interface MirrorEntry {
  phase: string;
  id: string;
  srcPath: string;
  expectedMirror: string;
}

function collectModules(): MirrorEntry[] {
  const entries: MirrorEntry[] = [];

  let phases: string[];
  try {
    phases = readdirSync(srcQuestionsRoot).filter((entry) => {
      const full = path.join(srcQuestionsRoot, entry);
      return statSync(full).isDirectory();
    });
  } catch {
    // src tree not found — return empty so the test surfaces a clear message
    return entries;
  }

  for (const phase of phases) {
    const phaseDir = path.join(srcQuestionsRoot, phase);
    const children = readdirSync(phaseDir);

    for (const child of children) {
      const fullChild = path.join(phaseDir, child);
      const childStat = statSync(fullChild);

      if (childStat.isDirectory()) {
        // Folder form: <id>/index.ts — US5 pattern.
        const indexFile = path.join(fullChild, "index.ts");
        if (!existsSync(indexFile)) continue;
        const id = child;
        if (isExcluded(id)) continue;
        const expectedMirror = path.join(
          testsQuestionsRoot,
          phase,
          `${id}.test.ts`,
        );
        entries.push({ phase, id, srcPath: indexFile, expectedMirror });
      } else if (child.endsWith(".ts") && !child.endsWith(".test.ts")) {
        // Flat form: <id>.ts
        const stem = child.slice(0, -".ts".length);
        if (isExcluded(stem)) continue;
        const expectedMirror = path.join(
          testsQuestionsRoot,
          phase,
          `${stem}.test.ts`,
        );
        entries.push({
          phase,
          id: stem,
          srcPath: fullChild,
          expectedMirror,
        });
      }
    }
  }

  return entries;
}

const modules = collectModules();

describe("mirror-coverage gate — every src question module has a tests/ mirror", () => {
  it("found at least one module to check (sanity)", () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  for (const { phase, id, expectedMirror } of modules) {
    it(`${phase}/${id} has tests/survey/questions/${phase}/${id}.test.ts`, () => {
      expect(
        existsSync(expectedMirror),
        `Missing mirror test for ${phase}/${id}.\n` +
          `Expected: ${expectedMirror}\n` +
          `Create the file to pass this gate.`,
      ).toBe(true);
    });
  }
});
