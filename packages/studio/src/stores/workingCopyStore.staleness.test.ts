// Tests for workingCopyStore (staleness group) — split from workingCopyStore.test.ts by behaviour.
// See workingCopyStore.instantiate.test.ts for the original coverage overview.

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkingCopyStore, bindManifest } from "./workingCopyStore.ts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS, irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import { defaultFillAxes, selectStrategy } from "@keyboard-studio/engine";
import type { DiscoveryAxisVector, IRGroup, IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import type { Step, EditorStep } from "../steps/types.ts";

// ---------------------------------------------------------------------------
// T041 — staleness slice tests (P0-3 review fix: bind a real manifest fixture,
// exercise true transitive closure, prove clearStale clears downstream)
// ---------------------------------------------------------------------------

// Fixture manifest with writes→inputs chains:
//   step_u writes PATH_GROUPS → step_d reads PATH_GROUPS (writes PATH_BCP47)
//                             → step_dd reads PATH_BCP47
// So: markStale("step_u") → stale = { step_u, step_d, step_dd } (2-edge closure).
//     clearStale("step_u") → stale = {} (downstream also cleared).
const PATH_GROUPS_FIXTURE = irPath("groups", ARRAY_INDEX);
const PATH_BCP47_FIXTURE = irPath("header", "bcp47");

function makeEditorStep(id: string, writes: typeof PATH_GROUPS_FIXTURE[], inputs: typeof PATH_GROUPS_FIXTURE[]): EditorStep {
  return {
    kind: "editor-step",
    id,
    title: id,
    component: (() => null) as EditorStep["component"],
    inputs,
    writes,
  };
}

const FIXTURE_MANIFEST: readonly Step[] = [
  makeEditorStep("step_u", [PATH_GROUPS_FIXTURE], []),          // upstream: writes groups
  makeEditorStep("step_d", [PATH_BCP47_FIXTURE], [PATH_GROUPS_FIXTURE]), // mid: reads groups, writes bcp47
  makeEditorStep("step_dd", [], [PATH_BCP47_FIXTURE]),           // downstream: reads bcp47
];

describe("workingCopyStore — staleness slice (T041)", () => {
  // Bind a real fixture manifest before each test so markStale exercises true
  // transitive closure (not a vacuous echo of the seed set).
  beforeEach(() => {
    bindManifest(FIXTURE_MANIFEST);
  });

  it("default: staleSteps is empty (fresh session)", () => {
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
  });

  it("markStale: adds the reopened step to staleSteps", () => {
    useWorkingCopyStore.getState().markStale("step_u");
    expect(useWorkingCopyStore.getState().staleSteps.has("step_u")).toBe(true);
  });

  it("markStale: 2-edge transitive closure — step_dd goes stale when step_u is reopened", () => {
    // This test exercises the REAL fixpoint, not the seed echo.
    // With FIXTURE_MANIFEST: step_u → step_d → step_dd.
    // Reopening step_u must propagate all the way to step_dd (2 hops).
    useWorkingCopyStore.getState().markStale("step_u");
    const stale = useWorkingCopyStore.getState().staleSteps;
    expect(stale.has("step_u")).toBe(true);   // root
    expect(stale.has("step_d")).toBe(true);   // 1 hop
    expect(stale.has("step_dd")).toBe(true);  // 2 hops — fixpoint required
  });

  it("clearStale: clears root AND downstream — ghost-stale fix (P0-2)", () => {
    // Reopen step_u → step_d and step_dd go stale.
    useWorkingCopyStore.getState().markStale("step_u");
    expect(useWorkingCopyStore.getState().staleSteps.has("step_dd")).toBe(true);

    // Clear step_u → closure recomputed from empty roots → step_d and step_dd
    // are no longer stale (they were only stale because of step_u).
    useWorkingCopyStore.getState().clearStale("step_u");
    const stale = useWorkingCopyStore.getState().staleSteps;
    expect(stale.has("step_u")).toBe(false);   // cleared root
    expect(stale.has("step_d")).toBe(false);   // downstream cleared too
    expect(stale.has("step_dd")).toBe(false);  // 2-hop downstream cleared too
  });

  it("clearStale: removing one root leaves the other root's closure intact", () => {
    useWorkingCopyStore.getState().markStale("step_u");
    useWorkingCopyStore.getState().markStale("step_d");
    // Both step_u and step_d are roots; step_dd is downstream of both.
    expect(useWorkingCopyStore.getState().staleSteps.has("step_dd")).toBe(true);

    // Clear step_u — but step_d is still a root, so step_dd stays stale.
    useWorkingCopyStore.getState().clearStale("step_u");
    const stale = useWorkingCopyStore.getState().staleSteps;
    expect(stale.has("step_u")).toBe(false);  // root removed
    expect(stale.has("step_d")).toBe(true);   // still a root
    expect(stale.has("step_dd")).toBe(true);  // still downstream of step_d
  });

  it("clearStale: staleSteps is empty after clearing the only stale root", () => {
    useWorkingCopyStore.getState().markStale("step_u");
    useWorkingCopyStore.getState().clearStale("step_u");
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
  });

  it("reset: clears staleSteps back to empty", () => {
    useWorkingCopyStore.getState().markStale("step_u");
    expect(useWorkingCopyStore.getState().staleSteps.size).toBeGreaterThan(0);

    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
  });

  it("multiple markStale calls accumulate (staleSteps grows)", () => {
    useWorkingCopyStore.getState().markStale("step_u");
    useWorkingCopyStore.getState().markStale("step_d");
    const stale = useWorkingCopyStore.getState().staleSteps;
    expect(stale.has("step_u")).toBe(true);
    expect(stale.has("step_d")).toBe(true);
  });

  it("clearStale of a non-stale step is a no-op (no error)", () => {
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
    // Clearing a non-stale step must not throw.
    expect(() => useWorkingCopyStore.getState().clearStale("step_u")).not.toThrow();
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
  });

  it("bind guard: markStale throws if manifest is empty (not yet bound)", () => {
    // Temporarily bind an empty manifest to trip the guard.
    bindManifest([]);
    expect(() => useWorkingCopyStore.getState().markStale("step_u")).toThrow(
      "[workingCopyStore] bindManifest() must be called before markStale",
    );
    // Restore fixture for subsequent tests (beforeEach will also restore).
    bindManifest(FIXTURE_MANIFEST);
  });

  it("bind guard: clearStale throws if manifest is empty (not yet bound)", () => {
    bindManifest([]);
    expect(() => useWorkingCopyStore.getState().clearStale("step_u")).toThrow(
      "[workingCopyStore] bindManifest() must be called before clearStale",
    );
    bindManifest(FIXTURE_MANIFEST);
  });
});

describe("workingCopyStore — cascadeDelete", () => {
  it("routes both whole-rule ids and store-slot ids through the item channel so chips reflect deletion", () => {
    const s = useWorkingCopyStore.getState();
    s.cascadeDelete(["r-eps"], ["sid-dkt#2"]);
    const after = useWorkingCopyStore.getState();
    // Both are visible via isItemDeleted (what the chip grid + kept-counts read).
    expect(after.isItemDeleted("r-eps")).toBe(true);
    expect(after.isItemDeleted("sid-dkt#2")).toBe(true);
    // Nothing leaks into the node channel (chips don't read it).
    expect(after.deletedNodeIds.size).toBe(0);
  });

  it("reverses the entire cascade with a single undoDelete()", () => {
    const s = useWorkingCopyStore.getState();
    s.cascadeDelete(["r-eps"], ["sid-dkt#2"]);
    useWorkingCopyStore.getState().undoDelete();
    const after = useWorkingCopyStore.getState();
    expect(after.isItemDeleted("r-eps")).toBe(false);
    expect(after.isItemDeleted("sid-dkt#2")).toBe(false);
    expect(after.deletedItemIds.size).toBe(0);
  });

  it("is a no-op when both arrays are empty (no undo entry pushed)", () => {
    const s = useWorkingCopyStore.getState();
    s.cascadeDelete([], []);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });
});

describe("workingCopyStore — cascadeRestore", () => {
  it("un-deletes every id it is given (clicking a removed chip restores everywhere)", () => {
    useWorkingCopyStore.getState().cascadeDelete(["r-eps"], ["sid-dkt#2"]);
    expect(useWorkingCopyStore.getState().isItemDeleted("r-eps")).toBe(true);
    useWorkingCopyStore.getState().cascadeRestore(["r-eps", "sid-dkt#2"]);
    const after = useWorkingCopyStore.getState();
    expect(after.isItemDeleted("r-eps")).toBe(false);
    expect(after.isItemDeleted("sid-dkt#2")).toBe(false);
    expect(after.deletedItemIds.size).toBe(0);
  });

  it("is a no-op for an empty list", () => {
    const before = useWorkingCopyStore.getState().deletedItemIds.size;
    useWorkingCopyStore.getState().cascadeRestore([]);
    expect(useWorkingCopyStore.getState().deletedItemIds.size).toBe(before);
  });

  it("clears the batch undo entry once every one of its items is restored", () => {
    useWorkingCopyStore.getState().cascadeDelete(["r-eps"], ["sid-dkt#2"]);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([
      { k: "batch", nodeIds: [], itemIds: ["r-eps", "sid-dkt#2"], chars: [] },
    ]);

    useWorkingCopyStore.getState().cascadeRestore(["r-eps", "sid-dkt#2"]);
    const after = useWorkingCopyStore.getState();
    expect(after.undoStack).toHaveLength(0);
    expect(after.isItemDeleted("r-eps")).toBe(false);
    expect(after.isItemDeleted("sid-dkt#2")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Base-derived A3a (mark-input order) seeding at instantiation (spec §7.2 3a, #926)
// ---------------------------------------------------------------------------

/** A base IR carrying the unconditional postfix sequence-replace shape:
 *  `any(equalD) + "=" > index(equalU,1)` — the guard-free §7.5 IPA shape. */
function postfixStartIr(): KeyboardIR {
  const group: IRGroup = {
    nodeId: "group#main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: [
      {
        nodeId: "rule#acute",
        context: [
          { kind: "any", storeRef: "equalD" },
          { kind: "char", value: "=" },
        ],
        output: [{ kind: "index", storeRef: "equalU", offset: 1 }],
      },
    ],
  };
  const stores: IRStore[] = [
    makeCharStore("store#equalD", "equalD", "aeiou"),
    makeCharStore("store#equalU", "equalU", "áéíóú"),
  ];
  return makeTestIR([group], stores);
}

describe("workingCopyStore — base-derived A3a seeding (spec §7.2 rule 3a, #926)", () => {
  it("instantiateFromExisting seeds markInputOrder='postfix' onto irAxes/session.axes from a postfix base", () => {
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: postfixStartIr() });
    const s = useWorkingCopyStore.getState();
    expect(s.irAxes.markInputOrder).toBe("postfix");
    expect(s.session.axes.markInputOrder).toBe("postfix");
  });

  it("instantiateFromBase also seeds it (base-derived, symmetric across tracks)", () => {
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir: postfixStartIr() });
    expect(useWorkingCopyStore.getState().session.axes.markInputOrder).toBe("postfix");
  });

  it("does NOT seed markInputOrder from a base with no postfix structure", () => {
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: makeTestIR([]) });
    expect(useWorkingCopyStore.getState().session.axes.markInputOrder).toBeUndefined();
  });

  it("the seeded value survives defaultFillAxes and fires rule 3a -> S-03 (+S-04) in selectStrategy", () => {
    // The production path: instantiation seeds irAxes.markInputOrder, which
    // MechanismGallery folds into the vector it feeds through defaultFillAxes
    // -> selectStrategy. This asserts that end-to-end from session.axes.
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: postfixStartIr() });
    const seeded = useWorkingCopyStore.getState().session.axes as Partial<DiscoveryAxisVector>;
    // Simulate the rest of an elicited alphabetic/strong vector (scale+scriptClass
    // are required inputs to the prior) with the import-seeded postfix present.
    const { axes } = defaultFillAxes({
      ...seeded,
      scale: "medium",
      scriptClass: "alphabetic",
      phoneticIntuition: "strong",
    });
    expect(axes.markInputOrder).toBe("postfix");
    const result = selectStrategy(axes);
    expect(result.triggeredRule).toBe("3a");
    expect(result.primary).toBe("S-03");
    expect(result.secondaries).toContain("S-04");
  });

  it("never overwrites an already-present markInputOrder (guard: base seeding defers to a prior value)", () => {
    // irAxes recorded before the (late) first instantiate — e.g. a future
    // survey-elicited A3a — must win over base-derived seeding. Case-2
    // carry-forward preserves irAxes into instantiation, so seedIrAxesFromStartIr
    // sees markInputOrder already set and leaves it alone, even though the
    // postfix base would otherwise seed "postfix".
    useWorkingCopyStore.getState().setIrAxes({ markInputOrder: "prefix" });
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: postfixStartIr() });
    expect(useWorkingCopyStore.getState().session.axes.markInputOrder).toBe("prefix");
  });
});

// ---------------------------------------------------------------------------
// sequenceFlaggedChars — S-03 flag tracking (Sequence Gallery deferral)
// ---------------------------------------------------------------------------

describe("workingCopyStore — sequenceFlaggedChars", () => {
  it("starts empty", () => {
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual([]);
  });

  it("flagCharForSequence adds a char, preserving insertion order", () => {
    useWorkingCopyStore.getState().flagCharForSequence("á");
    useWorkingCopyStore.getState().flagCharForSequence("é");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["á", "é"]);
  });

  it("flagCharForSequence is idempotent — flagging the same char twice does not duplicate it", () => {
    useWorkingCopyStore.getState().flagCharForSequence("á");
    useWorkingCopyStore.getState().flagCharForSequence("á");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["á"]);
  });

  it("unflagCharForSequence removes a char", () => {
    useWorkingCopyStore.getState().flagCharForSequence("á");
    useWorkingCopyStore.getState().flagCharForSequence("é");
    useWorkingCopyStore.getState().unflagCharForSequence("á");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["é"]);
  });

  it("unflagCharForSequence on a char not in the list is a no-op", () => {
    useWorkingCopyStore.getState().flagCharForSequence("á");
    useWorkingCopyStore.getState().unflagCharForSequence("z");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["á"]);
  });

  it("unflagCharForSequence also strips the char's recorded multi_char_sequence assignment (P0)", () => {
    useWorkingCopyStore.getState().flagCharForSequence("ŋ");
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ŋ",
        modality: "physical",
        mechanisms: [
          {
            patternId: "multi_char_sequence",
            strategyId: "S-03",
            slotValues: { firstLetterOut: "n", secondLetter: "g", collapsedChar: "ŋ" },
          },
        ],
        source: "user",
      },
    ]);
    expect(
      useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")?.assignments,
    ).toHaveLength(1);

    useWorkingCopyStore.getState().unflagCharForSequence("ŋ");

    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual([]);
    expect(
      useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")?.assignments,
    ).toEqual([]);
  });

  it("unflagCharForSequence strips ALL recorded sequences when the assignment holds multiple PATTERN_SEQUENCE mechanisms", () => {
    useWorkingCopyStore.getState().flagCharForSequence("ŋ");
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ŋ",
        modality: "physical",
        mechanisms: [
          {
            patternId: "multi_char_sequence",
            strategyId: "S-03",
            slotValues: { firstLetterOut: "n", secondLetter: "g", collapsedChar: "ŋ" },
          },
          {
            patternId: "multi_char_sequence",
            strategyId: "S-03",
            slotValues: { firstLetterOut: "n", secondLetter: "y", collapsedChar: "ŋ" },
          },
        ],
        source: "user",
      },
    ]);
    expect(
      useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")?.assignments?.[0]
        ?.mechanisms,
    ).toHaveLength(2);

    useWorkingCopyStore.getState().unflagCharForSequence("ŋ");

    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual([]);
    expect(
      useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")?.assignments,
    ).toEqual([]);
  });

  it("unflagCharForSequence leaves OTHER characters' assignments (including that char's own non-sequence mechanisms) untouched", () => {
    useWorkingCopyStore.getState().flagCharForSequence("ŋ");
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ŋ",
        modality: "physical",
        mechanisms: [{ patternId: "multi_char_sequence", strategyId: "S-03" }],
        source: "user",
      },
      {
        scope: "individual",
        target: "ñ",
        modality: "physical",
        mechanisms: [{ patternId: "simple_swap", strategyId: "S-01" }],
        source: "user",
      },
    ]);

    useWorkingCopyStore.getState().unflagCharForSequence("ŋ");

    const remaining = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C")?.assignments;
    expect(remaining).toHaveLength(1);
    expect(remaining?.[0]?.target).toBe("ñ");
  });

  it("instantiateFromBase clears sequenceFlaggedChars on a genuine base switch", () => {
    const vfs = createVirtualFS([]);
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir: makeTestIR([]) });
    useWorkingCopyStore.getState().flagCharForSequence("á");
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["á"]);

    const otherKeyboard = { ...basicKbdus, id: "other_keyboard_id" };
    useWorkingCopyStore.getState().instantiateFromStart(otherKeyboard, { vfs, ir: makeTestIR([]) });
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual([]);
  });
});