// physicalLayout module tests (spec 090 T041/T044): the module
// contract, the ruled no-op apply (deterministic over the SC-005
// frozen-stores harness, pass-2 included), and the phase-results →
// value builder — the recorded value is the gallery's own working
// set (selectDesktopAssignments), provenance riding verbatim. The
// R1 completion effects the task text originally assigned to this
// apply live in lib/assignLoopCompletion.ts (D-090-38) and are
// pinned there (lib/assignLoopCompletion.test.ts) and end-to-end in
// the MechanismGallery progression suite.

import { describe, it, expect, beforeEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import physicalLayout, { type PhysicalLayoutValue } from "./physicalLayout.ts";
import { PhysicalLayoutDecisionRenderer } from "../../assignLoop/PhysicalLayoutDecisionRenderer.tsx";
import {
  currentPhysicalLayoutValue,
  physicalLayoutValueFromPhaseResults,
} from "../../assignLoop/physicalLayoutValue.ts";
import { runApplyDeterministically } from "../../../decisions/applyDeterminism.ts";
import {
  bindManifest,
  useWorkingCopyStore,
} from "../../../stores/workingCopyStore.ts";
import { manifest } from "../../../steps/manifest.ts";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { ApplyContext } from "../../types.ts";

function ctx(
  ir: ApplyContext["ir"],
  decisions: ApplyContext["decisions"] = {},
): ApplyContext {
  return { ir, writes: physicalLayout.writes, decisions, currentHistoryEntryState: null };
}

function assignment(
  target: string,
  modality: MechanismAssignment["modality"],
  source?: MechanismAssignment["source"],
): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality,
    mechanisms: [{ patternId: "deadkey", slotValues: { char: target } }],
    ...(source !== undefined ? { source } : {}),
  } as MechanismAssignment;
}

const VALUE: PhysicalLayoutValue = {
  assignments: [assignment("á", "physical", "user"), assignment("é", "physical", "suggested")],
};

describe("physicalLayout module contract", () => {
  it("provides physical-layout, requires the five upstream decisions, writes nothing", () => {
    expect(physicalLayout.provides).toEqual(["physical-layout"]);
    expect(physicalLayout.requires).toEqual([
      "carved-layout",
      "deadkeys-defined",
      "rule-set",
      "marks-treatment",
      "windows-layout",
    ]);
    expect(physicalLayout.writes).toEqual([]);
    expect(physicalLayout.renderer).toBe(PhysicalLayoutDecisionRenderer);
    expect(physicalLayout.extract).toBeUndefined();
  });

  it("apply is the ruled no-op for every input (D-090-38)", () => {
    const ir = makeTestIR();
    expect(physicalLayout.apply(undefined, ctx(ir))).toEqual({});
    expect(physicalLayout.apply(VALUE, ctx(ir))).toEqual({});
    expect(physicalLayout.apply(VALUE, ctx(null))).toEqual({});
  });

  it("apply is deterministic under the SC-005 frozen-stores harness", () => {
    const patch = runApplyDeterministically({
      apply: physicalLayout.apply,
      value: VALUE,
      makeContext: () => ctx(makeTestIR()),
    });
    expect(patch).toEqual({});
  });

  it("pass 2: invoked with value undefined and its own decision recorded, still a no-op", () => {
    // 089's second pass fires this apply when a completion records
    // physical-layout ITSELF would be pass 1's business — the
    // input-triggered pass fires for completions recording one of
    // its REQUIRES (e.g. marks-treatment). Even with the full
    // decision set present, the no-op is the ruling: the applied
    // view is the phase-C phaseResults entry, maintained by
    // recordAssignments — not by a patch.
    const withRequires = ctx(makeTestIR(), {
      "marks-treatment": {
        id: "marks-treatment",
        value: { strategy: "deadkey" },
        provenance: "asked",
      },
      "physical-layout": { id: "physical-layout", value: VALUE, provenance: "asked" },
    });
    expect(physicalLayout.apply(undefined, withRequires)).toEqual({});
  });
});

describe("physicalLayoutValueFromPhaseResults", () => {
  it("keeps only the physical-modality assignments of the phase-C entry, in order, provenance verbatim", () => {
    const phaseResults = [
      { phase: "B", assignments: [assignment("x", "physical")] },
      {
        phase: "C",
        assignments: [
          assignment("á", "physical", "user"),
          assignment("á", "touch", "suggested"),
          assignment("é", "physical", "suggested"),
        ],
      },
    ] as unknown as SurveyPhaseResult[];

    const value = physicalLayoutValueFromPhaseResults(phaseResults);
    expect(value.assignments.map((a) => a.target)).toEqual(["á", "é"]);
    expect(value.assignments.map((a) => a.source)).toEqual(["user", "suggested"]);
  });

  it("no phase-C entry: the empty assignment list", () => {
    expect(physicalLayoutValueFromPhaseResults([])).toEqual({ assignments: [] });
  });

  it("the value's list is a copy — later phase-result edits do not leak in", () => {
    const entry = { phase: "C", assignments: [assignment("á", "physical")] };
    const phaseResults = [entry] as unknown as SurveyPhaseResult[];
    const value = physicalLayoutValueFromPhaseResults(phaseResults);
    entry.assignments.push(assignment("é", "physical"));
    expect(value.assignments).toHaveLength(1);
  });
});

describe("currentPhysicalLayoutValue (store level)", () => {
  beforeEach(() => {
    bindManifest(manifest);
    useWorkingCopyStore.getState().reset();
  });

  it("reads the live store's phase results through the same selector the gallery uses", () => {
    useWorkingCopyStore.getState().recordAssignments([
      assignment("á", "physical", "user"),
      assignment("ß", "physical", "suggested"),
    ]);
    expect(currentPhysicalLayoutValue()).toEqual({
      assignments: [
        assignment("á", "physical", "user"),
        assignment("ß", "physical", "suggested"),
      ],
    });
  });
});
