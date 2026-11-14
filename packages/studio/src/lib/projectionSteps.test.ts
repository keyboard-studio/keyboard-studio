// The Open output rows (spec 111 phase 16 S4): what the output still runs on a keyboard
// opened for update, with and without a touch file.

import { describe, expect, it } from "vitest";
import { PROJECTION_STEPS, type ProjectionStep } from "./projectionSteps.ts";
import { openModeProjection } from "./projectionInput.ts";

const sorted = (s: ReadonlySet<ProjectionStep>): ProjectionStep[] => [...s].sort();
const none = { identity: null, startDisplayName: null } as const;

describe("PROJECTION_STEPS output on Open", () => {
  it("with a touch file runs exactly the remaining steps; no touch step is among them", () => {
    expect(sorted(PROJECTION_STEPS.output)).toEqual(
      (["css", "authoredDocs", "carve", "carveKeycaps", "assignments", "caps", "identity", "keycapLabels", "descriptor", "rename"] as ProjectionStep[]).sort(),
    );
    for (const gone of ["touchInject", "touchDeletions", "keyEdits", "layerPropagation", "ruleAdditions"] as const) {
      expect(PROJECTION_STEPS.output.has(gone), gone).toBe(false);
    }
  });

  it("without a touch file keeps the touch steps and the rule additions until the touch file can be generated", () => {
    const row = PROJECTION_STEPS.outputNoTouchFile;
    for (const kept of ["touchInject", "touchDeletions", "keyEdits", "layerPropagation", "ruleAdditions"] as const) {
      expect(row.has(kept), kept).toBe(true);
    }
    // It differs from the touch-file row by exactly those steps.
    expect(sorted(new Set([...row].filter((s) => !PROJECTION_STEPS.output.has(s))))).toEqual(
      (["touchInject", "touchDeletions", "keyEdits", "layerPropagation", "ruleAdditions"] as ProjectionStep[]).sort(),
    );
  });

  it("openModeProjection picks the row from whether the keyboard has a touch file", () => {
    expect(openModeProjection({ ...none, kind: "output" }).steps).toBe(PROJECTION_STEPS.output);
    expect(openModeProjection({ ...none, kind: "output", noTouchFile: false }).steps).toBe(PROJECTION_STEPS.output);
    expect(openModeProjection({ ...none, kind: "output", noTouchFile: true }).steps).toBe(PROJECTION_STEPS.outputNoTouchFile);
    // An apply kind is never redirected.
    expect(openModeProjection({ ...none, kind: "ir", noTouchFile: true }).steps).toBe(PROJECTION_STEPS.ir);
  });
});
