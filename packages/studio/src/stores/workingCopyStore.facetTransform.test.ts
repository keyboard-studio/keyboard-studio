// FR-013 — a committed transform that changes the produced-character set re-seeds
// the IR-derived discovery axes so strategy/gallery re-derive (spec 039 / D11, T034).

import { describe, it, expect, beforeEach } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "./workingCopyStore.ts";

const KMN = `store(&NAME) 'FT'
store(&TARGETS) 'any'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'a'
`;

function ir() {
  return parseKmn(KMN, "FT").ir;
}

describe("commitFacetTransform (FR-013 axis re-seed)", () => {
  beforeEach(() => {
    useWorkingCopyStore.getState().reset();
  });

  it("re-derives the IR-seeded axis when the produced set changed", () => {
    const store = useWorkingCopyStore.getState();
    // Seed a stale IR-derived axis.
    store.setIrAxes({ markInputOrder: "postfix" });
    expect(useWorkingCopyStore.getState().irAxes.markInputOrder).toBe("postfix");

    // Commit a transform that changed the produced set: the stale axis is dropped
    // and re-derived from the new IR (which carries no postfix signal → undefined).
    useWorkingCopyStore.getState().commitFacetTransform(ir(), true);
    const after = useWorkingCopyStore.getState();
    expect(after.ir).not.toBeNull();
    expect(after.irAxes.markInputOrder).toBeUndefined();
  });

  it("leaves axes untouched when the produced set did NOT change (overlay-preserving write only)", () => {
    const store = useWorkingCopyStore.getState();
    store.setIrAxes({ markInputOrder: "postfix" });

    useWorkingCopyStore.getState().commitFacetTransform(ir(), false);
    const after = useWorkingCopyStore.getState();
    expect(after.ir).not.toBeNull();
    // No re-seed: the cached axis survives.
    expect(after.irAxes.markInputOrder).toBe("postfix");
  });
});
