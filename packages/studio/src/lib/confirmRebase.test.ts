// confirmRebase — unit tests for the F1 same-base-aware rebase guard.
//
// Exercises hasUnsavedEdits, needsRebaseConfirm, confirmRebaseTo, and
// instantiateFromBaseIfConfirmed({ skipConfirm }) against the REAL
// workingCopyStore singleton (unmocked — same idiom as
// hooks/usePreviewArtifact.reinstantiate.test.ts): not-instantiated,
// same-base-id, different-id-no-edits, different-id-with-edits (Cancel/OK),
// and the skipConfirm bypass.
//
// needsRebaseConfirm has no consumer of its own elsewhere in this package
// outside confirmRebaseTo's internal call — it is imported and exercised
// directly here so it has a real unit-level consumer, which is what justifies
// keeping it exported (see confirmRebase.ts's module doc).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus, silEuroLatin } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  hasUnsavedEdits,
  needsRebaseConfirm,
  confirmRebaseTo,
  instantiateFromBaseIfConfirmed,
  REBASE_CONFIRM_MESSAGE,
} from "./confirmRebase.ts";

function instantiate(base = basicKbdus) {
  useWorkingCopyStore.getState().instantiateFromBase(base, {
    vfs: createVirtualFS([]),
    ir: makeTestIR([]),
  });
}

/** Records a survey phase result so hasUnsavedEdits() sees a real edit. */
function recordAnEdit() {
  useWorkingCopyStore.getState().recordPhase({
    phase: "A",
    answers: [],
    computedAxes: { scale: "medium" },
  });
}

const payload = { vfs: createVirtualFS([]), ir: makeTestIR([]), removalCapabilities: new Map() };

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  useWorkingCopyStore.getState().reset();
  vi.restoreAllMocks();
});

describe("hasUnsavedEdits", () => {
  it("is false before any instantiation", () => {
    expect(hasUnsavedEdits()).toBe(false);
  });

  it("is false right after instantiation with no edits", () => {
    instantiate();
    expect(hasUnsavedEdits()).toBe(false);
  });

  it("is true once a survey phase result has been recorded", () => {
    instantiate();
    recordAnEdit();
    expect(hasUnsavedEdits()).toBe(true);
  });
});

describe("needsRebaseConfirm", () => {
  it("is false when not instantiated, regardless of the requested id", () => {
    expect(needsRebaseConfirm(basicKbdus.id)).toBe(false);
  });

  it("is false for the SAME base id even with edits recorded", () => {
    instantiate(basicKbdus);
    recordAnEdit();
    expect(needsRebaseConfirm(basicKbdus.id)).toBe(false);
  });

  it("is false for a DIFFERENT base id when there are no edits", () => {
    instantiate(basicKbdus);
    expect(needsRebaseConfirm(silEuroLatin.id)).toBe(false);
  });

  it("is true for a DIFFERENT base id once edits are recorded", () => {
    instantiate(basicKbdus);
    recordAnEdit();
    expect(needsRebaseConfirm(silEuroLatin.id)).toBe(true);
  });
});

describe("confirmRebaseTo", () => {
  it("returns true without consulting window.confirm when not instantiated", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    expect(confirmRebaseTo(basicKbdus.id)).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("returns true without consulting window.confirm for the same base id, even with edits", () => {
    instantiate(basicKbdus);
    recordAnEdit();
    const confirmSpy = vi.spyOn(window, "confirm");
    expect(confirmRebaseTo(basicKbdus.id)).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("returns true without consulting window.confirm for a different id when there are no edits", () => {
    instantiate(basicKbdus);
    const confirmSpy = vi.spyOn(window, "confirm");
    expect(confirmRebaseTo(silEuroLatin.id)).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("consults window.confirm for a different id with edits recorded — Cancel returns false", () => {
    instantiate(basicKbdus);
    recordAnEdit();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(confirmRebaseTo(silEuroLatin.id)).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith(REBASE_CONFIRM_MESSAGE);
  });

  it("consults window.confirm for a different id with edits recorded — OK returns true", () => {
    instantiate(basicKbdus);
    recordAnEdit();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(confirmRebaseTo(silEuroLatin.id)).toBe(true);
    expect(confirmSpy).toHaveBeenCalledWith(REBASE_CONFIRM_MESSAGE);
  });
});

describe("instantiateFromBaseIfConfirmed", () => {
  it("returns false and never touches the store when ir/vfs are null (mock-engine path)", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const result = instantiateFromBaseIfConfirmed(basicKbdus, { vfs: null, ir: null });
    expect(result).toBe(false);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().baseKeyboard).toBeNull();
  });

  it("proceeds without a confirm dialog when there are no edits", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const result = instantiateFromBaseIfConfirmed(basicKbdus, payload);
    expect(result).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(basicKbdus.id);
  });

  it("Cancel on the confirm dialog aborts — instantiate is never called", () => {
    instantiate(basicKbdus);
    recordAnEdit();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const result = instantiateFromBaseIfConfirmed(silEuroLatin, payload);

    expect(result).toBe(false);
    // Store untouched — still the ORIGINAL base, edits preserved.
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(basicKbdus.id);
    expect(useWorkingCopyStore.getState().phaseResults.length).toBeGreaterThan(0);
  });

  it("OK on the confirm dialog proceeds — the store switches to the new base", () => {
    instantiate(basicKbdus);
    recordAnEdit();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const result = instantiateFromBaseIfConfirmed(silEuroLatin, payload);

    expect(result).toBe(true);
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(silEuroLatin.id);
  });

  it("skipConfirm bypasses the dialog even with edits recorded", () => {
    instantiate(basicKbdus);
    recordAnEdit();
    const confirmSpy = vi.spyOn(window, "confirm");

    const result = instantiateFromBaseIfConfirmed(silEuroLatin, payload, { skipConfirm: true });

    expect(result).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(silEuroLatin.id);
  });
});
