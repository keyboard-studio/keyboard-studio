// lib/inventoryDiff — the one-shot composites equal the hooks the UI calls.
//
// useInventoryDiff and useInventoryCoverageGate memoize each piece
// separately; deriveInventoryDiff / deriveInventoryCoverageGate compose the
// same pieces in one call for callers outside React (the spec 107 headless
// author's Phase F gate). These cases pin the two paths to the same answer,
// so the composite cannot drift from what StepHost's gate sees.

import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { IRGroup, MechanismAssignment } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useInventoryDiff } from "../hooks/useInventoryDiff.ts";
import { useInventoryCoverageGate } from "../hooks/useInventoryCoverageGate.ts";
import { deriveInventoryCoverageGate, deriveInventoryDiff } from "./inventoryDiff.ts";

function groupWithChars(chars: string[]): IRGroup {
  return {
    nodeId: "g0",
    name: "main",
    usingKeys: false,
    readonly: false,
    rules: chars.map((char, i) => ({ nodeId: `rule#${i}`, context: [], output: [{ kind: "char" as const, value: char }] })),
  };
}

function seed(produced: string[], inventory: string[], assignments: MechanismAssignment[] = []): void {
  const vfs = createVirtualFS([{ path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false }]);
  useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir: makeTestIR([groupWithChars(produced)]) });
  useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], confirmedInventory: inventory });
  if (assignments.length > 0) useWorkingCopyStore.getState().recordAssignments(assignments);
}

function oneShot() {
  const s = useWorkingCopyStore.getState();
  return {
    diff: deriveInventoryDiff({ startIr: s.startIr, inventory: s.session.confirmedInventory, phaseResults: s.phaseResults }),
    gate: deriveInventoryCoverageGate(s),
  };
}

afterEach(() => useWorkingCopyStore.getState().reset());

describe("deriveInventoryDiff / deriveInventoryCoverageGate equal the hooks", () => {
  const cases: [string, () => void][] = [
    ["before instantiation", () => useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], confirmedInventory: ["a", "ŋ"] })],
    ["base produces part of the inventory", () => seed(["a", "e"], ["a", "e", "ŋ", "ɓ"])],
    ["base produces all of it", () => seed(["a", "b"], ["a", "b"])],
    ["decomposed inventory entry", () => seed(["é"], ["é", "ŋ"])],
    [
      "a session assignment covers a letter",
      () =>
        seed(["a"], ["a", "ŋ"], [
          {
            scope: "individual",
            target: "ŋ",
            modality: "physical",
            mechanisms: [{ patternId: "direct_key", strategyId: "S-01", slotValues: { hostKey: "K_X", output: "ŋ" } }],
          } as unknown as MechanismAssignment,
        ]),
    ],
  ];

  for (const [name, arrange] of cases) {
    it(name, () => {
      arrange();
      const diffHook = renderHook(() => useInventoryDiff()).result.current;
      const gateHook = renderHook(() => useInventoryCoverageGate()).result.current;
      const { diff, gate } = oneShot();
      expect(diff.lettersToAdd).toEqual(diffHook.lettersToAdd);
      expect(diff.alreadyProduced).toEqual(diffHook.alreadyProduced);
      expect(diff.producedButUnreachable).toEqual(diffHook.producedButUnreachable);
      expect([...diff.producedSet].sort()).toEqual([...diffHook.producedSet].sort());
      expect([...diff.rawProducedSet].sort()).toEqual([...diffHook.rawProducedSet].sort());
      expect(gate).toEqual(gateHook);
    });
  }
});
