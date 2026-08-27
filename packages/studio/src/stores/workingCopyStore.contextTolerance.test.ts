// spec 062 US3 (T019): `contextToleranceWriteBack` (T003 — a plain optional
// field on `DiscoveryAxisVector`) needs no new persistence wiring — it rides
// `irAxes`'s existing generic passthrough in `persistWorkingCopy.ts`'s
// `snapshotWorkingCopyData`/`prepareWorkingCopySnapshot` (T016 confirmed this
// for the in-memory `setIrAxes` round-trip; this test confirms it survives
// the actual sessionStorage snapshot/rehydrate cycle `draftPersistence.ts`
// uses across an OAuth redirect).

import { describe, it, expect, beforeEach } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { BaseKeyboard, KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { snapshotWorkingCopyToSession, rehydrateWorkingCopyFromSession } from "../lib/persistWorkingCopy.ts";

function makeMinimalIr(): KeyboardIR {
  return {
    origin: "scaffolded",
    header: {
      keyboardId: "test",
      name: "test",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

describe("contextToleranceWriteBack persistence (spec 062 T019)", () => {
  beforeEach(() => {
    useWorkingCopyStore.getState().reset();
    sessionStorage.clear();
  });

  it("survives a sessionStorage snapshot/rehydrate round-trip (no new wiring needed)", () => {
    useWorkingCopyStore.getState().instantiateFromBase(
      { id: "kbd", displayName: "Kbd", languages: [] } as BaseKeyboard,
      { vfs: createVirtualFS([]), ir: makeMinimalIr() },
    );
    useWorkingCopyStore.getState().setIrAxes({ contextToleranceWriteBack: "own-form" });
    expect(useWorkingCopyStore.getState().irAxes.contextToleranceWriteBack).toBe("own-form");

    snapshotWorkingCopyToSession();
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().irAxes.contextToleranceWriteBack).toBeUndefined();

    const result = rehydrateWorkingCopyFromSession();
    expect(result).toBe(true);
    expect(useWorkingCopyStore.getState().irAxes.contextToleranceWriteBack).toBe("own-form");
  });

  it("a snapshot predating this field rehydrates with the field absent (defaults to echo per FR-007)", () => {
    useWorkingCopyStore.getState().instantiateFromBase(
      { id: "kbd", displayName: "Kbd", languages: [] } as BaseKeyboard,
      { vfs: createVirtualFS([]), ir: makeMinimalIr() },
    );
    // No contextToleranceWriteBack ever set — irAxes has no such key, exactly
    // as a pre-spec-062 draft would.
    snapshotWorkingCopyToSession();
    useWorkingCopyStore.getState().reset();

    const result = rehydrateWorkingCopyFromSession();
    expect(result).toBe(true);
    expect(useWorkingCopyStore.getState().irAxes.contextToleranceWriteBack).toBeUndefined();
  });
});
