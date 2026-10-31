// projectWorkingCopyVfs step 2.6 (spec 106 FR-010/FR-011): the recorded
// marks-treatment decision's guard group and backspace rules are generated
// into the projected .kmn, the one the preview compiles and the download
// ships. The marks-treatment apply no longer writes them into the working IR.

import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { MARKS_GUARD_GROUP, parseKmn } from "@keyboard-studio/engine";

import { projectWorkingCopyVfs, type MarksGuardsInput } from "./projectWorkingCopyVfs.ts";
import { marksGuardsFromValue } from "./projectionInput.ts";
import type { MarksTreatmentValue } from "../survey/marks/marksValue.ts";

const ACUTE = "́";

const KMN = [
  "store(&NAME) 'Projected'",
  "store(&VERSION) '14.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_5] > U+0301",
  "",
].join("\n");

const GUARDS: MarksGuardsInput = {
  worklist: {
    ownLetterUnits: ["a", "k"],
    markUnits: [{ mark: ACUTE, inputOrder: "postfix" }],
    blockedCombinations: [{ base: "k", mark: ACUTE }],
  },
  outputForm: "base-plus-mark",
};

function project(marksGuards: MarksGuardsInput | null, kmn = KMN) {
  const vfs = createVirtualFS();
  vfs.set("source/projected.kmn", kmn, false);
  const result = projectWorkingCopyVfs({
    vfs,
    keyboardId: "projected",
    startIr: parseKmn(kmn, "projected").ir,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    marksGuards,
  });
  const entry = vfs.get("source/projected.kmn");
  return { kmn: typeof entry?.content === "string" ? entry.content : "", warnings: result.warnings };
}

describe("projectWorkingCopyVfs — mark guards (spec 106 FR-010)", () => {
  it("generates the guard group and its hop into the projected .kmn", () => {
    const { kmn, warnings } = project(GUARDS);
    expect(warnings).toEqual([]);
    expect(kmn).toContain(`group(${MARKS_GUARD_GROUP})`);
    expect(kmn).toContain(`match > use(${MARKS_GUARD_GROUP})`);
    expect(kmn).toContain("nul U+0301 > nul");
  });

  it("drops the buffer-start rule when the mark's start-of-line box is ticked, and adds U+000A to its allowed store", () => {
    const { kmn } = project({
      ...GUARDS,
      worklist: { ...GUARDS.worklist, bareMarkAllowed: { [ACUTE]: true } },
    });
    expect(kmn).toContain(`group(${MARKS_GUARD_GROUP})`);
    expect(kmn).not.toContain("nul U+0301 > nul");
    expect(kmn).toContain("U+000A");
  });

  it("generates the backspace rules the recorded answer calls for", () => {
    const { kmn } = project({
      worklist: { ownLetterUnits: ["e"], markUnits: [], blockedCombinations: [] },
      outputForm: "base-plus-mark",
      backspace: "whole-stack",
      stacks: [{ base: "e", marks: [ACUTE] }],
    });
    expect(kmn).toContain("U+0065 U+0301 + [K_BKSP] > nul");
  });

  it("leaves the .kmn alone without a marks decision", () => {
    expect(project(null).kmn).toBe(KMN);
  });

  it("is idempotent over a .kmn that already carries the guards", () => {
    const once = project(GUARDS).kmn;
    expect(project(GUARDS, once).kmn).toBe(once);
  });
});

describe("marksGuardsFromValue", () => {
  const value = (over: Partial<MarksTreatmentValue> = {}): MarksTreatmentValue => ({
    answers: {},
    contextTolerance: null,
    guardSpecification: null,
    completion: {
      worklist: GUARDS.worklist,
      outputForm: "ready-made",
      backspace: "peel",
      migrationNeeded: false,
    },
    ...over,
  });

  it("is null until the series completes", () => {
    expect(marksGuardsFromValue(undefined)).toBeNull();
    expect(marksGuardsFromValue(value({ completion: null }))).toBeNull();
  });

  it("carries the completion payload; buffer-start behaviour comes from the worklist's per-mark channel, not the legacy guard specification", () => {
    const guards = marksGuardsFromValue(
      value({
        guardSpecification: { behaviour: "emit" } as MarksTreatmentValue["guardSpecification"],
        completion: {
          worklist: { ...GUARDS.worklist, bareMarkAllowed: { [ACUTE]: true } },
          outputForm: "ready-made",
          backspace: "peel",
          migrationNeeded: false,
          guardReevaluation: [],
        },
      }),
    );
    expect(guards).toEqual({
      worklist: { ...GUARDS.worklist, bareMarkAllowed: { [ACUTE]: true } },
      outputForm: "ready-made",
      backspace: "peel",
    });
  });
});
