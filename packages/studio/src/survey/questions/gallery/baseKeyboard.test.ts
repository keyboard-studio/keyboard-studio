// startKeyboard module tests (spec 090 T015): the module contract and the
// apply's determinism under the frozen-stores harness. The confirm flow
// (F1 gate → record → complete) is covered by
// editors/adapters/panelAdapters.test.tsx and
// StudioShell.previewCommitGating.test.tsx; here we pin that the module
// wires the real renderer and that recording is all the module does —
// instantiation stays StudioShell's effect, armed off the record.

import { describe, it, expect, beforeEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath } from "@keyboard-studio/contracts";
import startKeyboard, { type StartKeyboardValue } from "./baseKeyboard.ts";
import { StartKeyboardRenderer } from "../../chooseStart/StartKeyboardRenderer.tsx";
import { runApplyDeterministically } from "../../../decisions/applyDeterminism.ts";
import type { ApplyContext } from "../../types.ts";
import { useDecisionStore } from "../../../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";

function makeContext(): ApplyContext {
  return {
    ir: makeTestIR(),
    writes: [irPath("header", "name")],
    decisions: {
      "language-code": { id: "language-code", value: "fra", provenance: "asked" },
    },
    currentHistoryEntryState: null,
  };
}

function fingerprintStores(): string {
  return JSON.stringify({
    decisions: useDecisionStore.getState().decisions,
    base: useWorkingCopyStore.getState().startKeyboard?.id ?? null,
  });
}

beforeEach(() => {
  useDecisionStore.getState().reset();
});

describe("baseKeyboard module contract", () => {
  it("provides base-keyboard, requires language-code + target-script, writes nothing", () => {
    expect(startKeyboard.provides).toEqual(["base-keyboard"]);
    expect(startKeyboard.requires).toEqual(["language-code", "target-script"]);
    expect(startKeyboard.writes).toEqual([]);
    expect(startKeyboard.renderer).toBe(StartKeyboardRenderer);
  });

  it("apply is a deterministic no-op (instantiation is not the apply's job)", () => {
    const value: StartKeyboardValue = { id: "sil_euro_latin", name: "EuroLatin (SIL)" };
    expect(
      runApplyDeterministically({
        apply: startKeyboard.apply,
        value,
        makeContext,
        fingerprintStores,
        runs: 3,
      }),
    ).toEqual({});
    expect(
      runApplyDeterministically({
        apply: startKeyboard.apply,
        value: undefined,
        makeContext,
        fingerprintStores,
      }),
    ).toEqual({});
  });
});
