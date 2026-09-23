// Question-module coverage gate.
//
// Walks src/survey/questions/<folder>/ on disk — flat <id>.ts and folder-form
// <id>/index.ts, registered or not — and fails if any module is not exercised:
//
//   • live folders (a/, b/, f/, g/, and any new one): the module must be in
//     LIVE_QUESTION_MODULES, the list src/survey/questions/questionModules.test.ts
//     runs through the shared contract suite (src/test/questionModuleContract.ts:
//     fixtures through validate(), definition snapshot, generic invariants);
//   • reserve/: the module must be in RESERVE_QUESTION_MODULES, the list the
//     parametric tests/survey/questions/reserve/reserveModules.test.ts runs
//     through the same contract suite (the spec 022 no-delete guardrail's
//     TEST-COVERED leg).
//
// Every module that exports validate() must also declare at least one valid
// fixture, so the suite's fixture run is never vacuous. Walking the directory
// independently of the suite's import.meta.glob is the point: a module the
// glob misses (a new nesting shape, a new folder) fails here instead of
// silently going untested.

import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  LIVE_QUESTION_MODULES,
  ON_DISK_QUESTION_MODULES,
  RESERVE_QUESTION_MODULES,
} from "../../src/test/questionModuleContract.ts";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcQuestionsRoot = path.join(pkgRoot, "src", "survey", "questions");
const liveSuite = path.join(srcQuestionsRoot, "questionModules.test.ts");
const reserveSuite = path.join(pkgRoot, "tests", "survey", "questions", "reserve", "reserveModules.test.ts");

interface ModuleFile {
  folder: string;
  /** Path relative to src/survey/questions/, as the contract suite reports it. */
  file: string;
}

function walkModules(): ModuleFile[] {
  const out: ModuleFile[] = [];
  for (const folder of readdirSync(srcQuestionsRoot)) {
    const folderPath = path.join(srcQuestionsRoot, folder);
    if (!statSync(folderPath).isDirectory() || folder.startsWith("__")) continue;
    for (const child of readdirSync(folderPath)) {
      const childPath = path.join(folderPath, child);
      if (statSync(childPath).isDirectory()) {
        if (existsSync(path.join(childPath, "index.ts"))) {
          out.push({ folder, file: `${folder}/${child}/index.ts` });
        }
      } else if (child.endsWith(".ts") && !child.endsWith(".test.ts")) {
        out.push({ folder, file: `${folder}/${child}` });
      }
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

const onDisk = walkModules();
const liveCovered = new Set(LIVE_QUESTION_MODULES.map((e) => e.file));
const reserveCovered = new Set(RESERVE_QUESTION_MODULES.map((e) => e.file));
const byFile = new Map(ON_DISK_QUESTION_MODULES.map((e) => [e.file, e.mod]));

describe("question-module coverage gate — no question module ships untested", () => {
  it("found modules on disk, and the contract suite enumerates the same files (sanity)", () => {
    expect(onDisk.length).toBeGreaterThan(0);
    expect(ON_DISK_QUESTION_MODULES.map((e) => e.file)).toEqual(onDisk.map((m) => m.file));
  });

  it("the live contract suite runs LIVE_QUESTION_MODULES", () => {
    const source = readFileSync(liveSuite, "utf8");
    expect(source).toMatch(/describeQuestionModules\(\s*"[^"]*",\s*LIVE_QUESTION_MODULES\b/);
  });

  it("the reserve contract suite runs RESERVE_QUESTION_MODULES", () => {
    const source = readFileSync(reserveSuite, "utf8");
    expect(source).toMatch(/describeQuestionModules\(\s*"[^"]*",\s*RESERVE_QUESTION_MODULES\b/);
  });

  for (const { folder, file } of onDisk) {
    it(`${file} is covered`, () => {
      if (folder === "reserve") {
        expect(reserveCovered.has(file), `${file} is not in RESERVE_QUESTION_MODULES`).toBe(true);
      } else {
        expect(liveCovered.has(file), `${file} is not in LIVE_QUESTION_MODULES`).toBe(true);
      }
      const mod = byFile.get(file);
      if (typeof mod?.validate === "function") {
        expect(mod.fixtures.valid.length, `${file} exports validate() but declares no valid fixture`).toBeGreaterThan(0);
      }
    });
  }
});
