// touchSeedSource module tests (spec 090 T015): the module contract and
// the apply's determinism under the frozen-stores harness. The renderer's
// behaviour is covered end to end by the panel suite
// (survey/touchSeedSource/TouchSeedSourcePanel.test.tsx), which mounts the
// hosted step; here we pin that the module wires that exact renderer.

import { describe, it, expect, beforeEach } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath } from "@keyboard-studio/contracts";
import touchSeedSource, { type TouchSeedSourceValue } from "./touchSeedSource.ts";
import { TouchSeedSourceRenderer } from "../../touchSeedSource/TouchSeedSourcePanel.tsx";
import { runApplyDeterministically } from "../../../decisions/applyDeterminism.ts";
import type { ApplyContext } from "../../types.ts";
import { useDecisionStore } from "../../../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";

function makeContext(): ApplyContext {
  return {
    ir: makeTestIR(),
    writes: [irPath("header", "name")],
    decisions: {},
    currentHistoryEntryState: null,
  };
}

function fingerprintStores(): string {
  return JSON.stringify({
    decisions: useDecisionStore.getState().decisions,
    touchDraft: useWorkingCopyStore.getState().touchDraft?.id ?? null,
  });
}

beforeEach(() => {
  useDecisionStore.getState().reset();
});

describe("touchSeedSource module contract", () => {
  it("provides touch-seed-source, requires physical-layout, writes nothing", () => {
    expect(touchSeedSource.provides).toEqual(["touch-seed-source"]);
    expect(touchSeedSource.requires).toEqual(["physical-layout"]);
    expect(touchSeedSource.writes).toEqual([]);
    expect(touchSeedSource.renderer).toBe(TouchSeedSourceRenderer);
  });

  it("apply is a deterministic no-op for both fork values", () => {
    for (const value of ["import-adapt", "reseed-from-desktop"] as TouchSeedSourceValue[]) {
      expect(
        runApplyDeterministically({
          apply: touchSeedSource.apply,
          value,
          makeContext,
          fingerprintStores,
          runs: 3,
        }),
      ).toEqual({});
    }
    expect(
      runApplyDeterministically({
        apply: touchSeedSource.apply,
        value: undefined,
        makeContext,
        fingerprintStores,
      }),
    ).toEqual({});
  });
});
