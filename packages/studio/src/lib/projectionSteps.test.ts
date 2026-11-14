// The Open output rows (spec 111 phase 16 S4): what the output still runs on a keyboard
// opened for update, with or without a touch file (one row).

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

  it("there is one output row: a keyboard with no touch file runs no touch step either", () => {
    expect(Object.keys(PROJECTION_STEPS)).not.toContain("outputNoTouchFile");
    expect(Object.keys(PROJECTION_STEPS)).not.toContain("flush");
  });

  it("openModeProjection picks the row from the kind alone", () => {
    expect(openModeProjection({ ...none, kind: "output" }).steps).toBe(PROJECTION_STEPS.output);
    expect(openModeProjection({ ...none, kind: "ir" }).steps).toBe(PROJECTION_STEPS.ir);
  });
});
