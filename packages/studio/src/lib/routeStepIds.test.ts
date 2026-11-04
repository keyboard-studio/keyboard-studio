// routeStepIds: the manifest registers its route provider, and a screen is on the route
// exactly while its derived gate passes (spec 108 FR-015).

import { describe, it, expect } from "vitest";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import { derivedScreens, screenGates } from "../steps/manifest.ts";
import { routeStepIdsOf } from "./routeStepIds.ts";

describe("routeStepIdsOf", () => {
  it("includes every ungated screen and each gated screen exactly when its gate passes", () => {
    const decisions = {} as DecisionSet;
    const route = routeStepIdsOf(decisions);
    expect(route).toBeDefined();
    for (const { id } of derivedScreens) {
      const gate = screenGates.get(id);
      expect(route?.has(id), id).toBe(gate === undefined ? true : gate(decisions));
    }
  });
});
