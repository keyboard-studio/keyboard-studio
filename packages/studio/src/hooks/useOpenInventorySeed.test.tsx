// Spec 111: an opened keyboard's Touch step needs an inventory; it is seeded once
// from the letters and marks the keyboard produces, and never overwrites one.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRStore } from "@keyboard-studio/contracts";

import { useOpenInventorySeed } from "./useOpenInventorySeed.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { stubKmnVfs } from "../test/workingCopy.ts";

const store = {
  name: "letters",
  isSystem: false,
  items: ["a", "é", "1", "!"].map((value) => ({ kind: "char", value })),
} as unknown as IRStore;

function instantiate(mode: "open" | "copy"): void {
  const ir = makeTestIR([], [store]);
  const opts = { vfs: stubKmnVfs("basic_kbdus", "c test\n"), ir };
  if (mode === "open") useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, opts);
  else useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, opts);
}

describe("useOpenInventorySeed", () => {
  beforeEach(() => useWorkingCopyStore.getState().reset());
  afterEach(cleanup);

  it("seeds the inventory with the keyboard's letters and marks on Open", () => {
    instantiate("open");
    renderHook(() => useOpenInventorySeed());
    expect([...(useWorkingCopyStore.getState().session.confirmedInventory ?? [])].sort()).toEqual(["a", "é"]);
  });

  it("never overwrites an inventory that exists", () => {
    instantiate("open");
    act(() => {
      useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], confirmedInventory: ["ʻ"] });
    });
    renderHook(() => useOpenInventorySeed());
    expect(useWorkingCopyStore.getState().session.confirmedInventory).toEqual(["ʻ"]);
  });

  it("does nothing on Copy", () => {
    instantiate("copy");
    renderHook(() => useOpenInventorySeed());
    expect(useWorkingCopyStore.getState().session.confirmedInventory ?? []).toEqual([]);
  });
});
