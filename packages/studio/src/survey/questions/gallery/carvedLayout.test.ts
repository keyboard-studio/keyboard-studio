// carvedLayout module tests (spec 090 T032/T036): the module contract,
// the ruled no-op apply (deterministic under the SC-005 harness,
// pass-2 included), and the overlay → value builder — canonical
// regardless of click order, and lossless for hand removals: an
// orphaned hand-set item stays in the value, and a refresh of the
// derived state (dispositions re-prefill) never touches the hand
// removals. The hosted gallery flow is covered by the carve suites.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { CarveDisposition } from "@keyboard-studio/contracts";
import carvedLayout, { type CarvedLayoutValue } from "./carvedLayout.ts";
import { CarveDecisionRenderer } from "../../carve/CarveDecisionRenderer.tsx";
import {
  carvedLayoutValueFromOverlay,
  currentCarvedLayoutValue,
  type CarveOverlaySnapshot,
} from "../../carve/carveValue.ts";
import { runApplyDeterministically } from "../../../decisions/applyDeterminism.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import type { ApplyContext } from "../../types.ts";

function ctx(
  ir: ApplyContext["ir"],
  decisions: ApplyContext["decisions"] = {},
): ApplyContext {
  return { ir, writes: carvedLayout.writes, decisions, currentHistoryEntryState: null };
}

const DISPOSITION: CarveDisposition = {
  comboId: "rule-9",
  disposition: "block",
  provenance: "author-override",
};

const VALUE: CarvedLayoutValue = {
  removals: [{ kind: "node", id: "rule-9", provenance: "asked" }],
  dispositions: [DISPOSITION],
  closedKeyboardCard: "accepted",
};

function snapshot(overrides: Partial<CarveOverlaySnapshot> = {}): CarveOverlaySnapshot {
  return {
    deletedNodeIds: new Set(),
    deletedItemIds: new Set(),
    disabledFamilyIds: new Set(),
    carveChars: new Set(),
    carveDispositions: [],
    closedKeyboardCard: null,
    ...overrides,
  };
}

describe("carvedLayout module contract", () => {
  it("provides carved-layout, requires the six upstream decisions, writes nothing", () => {
    expect(carvedLayout.provides).toEqual(["carved-layout"]);
    expect(carvedLayout.requires).toEqual([
      "base-keyboard",
      "windows-layout",
      "marks-treatment",
      "punctuation-inventory",
      "invisibles-inventory",
      "retained-convenience-chars",
    ]);
    expect(carvedLayout.writes).toEqual([]);
    expect(carvedLayout.renderer).toBe(CarveDecisionRenderer);
    expect(carvedLayout.extract).toBeUndefined();
  });

  it("apply is the ruled no-op for every input (D-090-30)", () => {
    const ir = makeTestIR();
    expect(carvedLayout.apply(undefined, ctx(ir))).toEqual({});
    expect(carvedLayout.apply(VALUE, ctx(ir))).toEqual({});
    expect(carvedLayout.apply(VALUE, ctx(null))).toEqual({});
  });

  it("apply is deterministic under the SC-005 frozen-stores harness", () => {
    const patch = runApplyDeterministically({
      apply: carvedLayout.apply,
      value: VALUE,
      makeContext: () => ctx(makeTestIR()),
    });
    expect(patch).toEqual({});
  });

  it("pass 2: invoked with value undefined and its requires recorded, still a no-op", () => {
    // 089's second pass fires this apply when a completion records one
    // of its requires (e.g. retained-convenience-chars at the preceding
    // step). The no-op is the ruling, not an accident: the applied
    // view is produced from the persisted overlay by the projection.
    const withRequires = ctx(makeTestIR(), {
      "retained-convenience-chars": {
        id: "retained-convenience-chars",
        value: { retained: [], rejected: [] },
        provenance: "asked",
      },
    });
    expect(carvedLayout.apply(undefined, withRequires)).toEqual({});
  });
});

describe("carvedLayoutValueFromOverlay", () => {
  it("maps the four removal sets to one kind-discriminated list; dispositions and card ride verbatim", () => {
    const value = carvedLayoutValueFromOverlay(
      snapshot({
        deletedNodeIds: new Set(["rule-9"]),
        deletedItemIds: new Set(["store-1#2"]),
        disabledFamilyIds: new Set(["fam-3"]),
        carveChars: new Set(["q"]),
        carveDispositions: [DISPOSITION],
        closedKeyboardCard: "accepted",
      }),
    );
    expect(value).toEqual({
      removals: [
        { kind: "node", id: "rule-9", provenance: "asked" },
        { kind: "item", id: "store-1#2", provenance: "asked" },
        { kind: "family", id: "fam-3", provenance: "asked" },
        { kind: "char", id: "q", provenance: "asked" },
      ],
      dispositions: [DISPOSITION],
      closedKeyboardCard: "accepted",
    });
  });

  it("is canonical: the same overlay reached by different click orders records the same value", () => {
    const a = carvedLayoutValueFromOverlay(
      snapshot({ deletedNodeIds: new Set(["rule-9", "rule-2", "rule-7"]) }),
    );
    const b = carvedLayoutValueFromOverlay(
      snapshot({ deletedNodeIds: new Set(["rule-7", "rule-9", "rule-2"]) }),
    );
    expect(a).toEqual(b);
    // Canonical form as a property, not a snapshot: the same three
    // removals, in sorted id order regardless of click order.
    const ids = a.removals.map((r) => r.id);
    expect(new Set(ids)).toEqual(new Set(["rule-9", "rule-2", "rule-7"]));
    expect(ids).toEqual([...ids].sort());
  });

  it("keeps an orphaned hand-set removal (its target no longer exists) — never dropped", () => {
    // Spec edge case (spec 014 R6): a hand removal whose target a
    // later change removed from the base stays in the value and is
    // shown, so the author's act is never silently discarded. The
    // builder snapshots the overlay as it stands; it does not filter
    // items against any target list.
    const value = carvedLayoutValueFromOverlay(
      snapshot({ deletedNodeIds: new Set(["rule-that-no-longer-exists"]) }),
    );
    expect(value.removals).toEqual([
      { kind: "node", id: "rule-that-no-longer-exists", provenance: "asked" },
    ]);
  });

  it("a proposal refresh (dispositions re-prefilled under a new card state) keeps hand removals identical", () => {
    const removals = { deletedNodeIds: new Set(["rule-9"]), carveChars: new Set(["q"]) };
    const before = carvedLayoutValueFromOverlay(
      snapshot({ ...removals, carveDispositions: [], closedKeyboardCard: null }),
    );
    const after = carvedLayoutValueFromOverlay(
      snapshot({ ...removals, carveDispositions: [DISPOSITION], closedKeyboardCard: "declined" }),
    );
    expect(after.removals).toEqual(before.removals);
    expect(after.closedKeyboardCard).toBe("declined");
  });

  it("an untouched overlay records an empty value (author removed nothing)", () => {
    expect(carvedLayoutValueFromOverlay(snapshot())).toEqual({
      removals: [],
      dispositions: [],
      closedKeyboardCard: null,
    });
  });
});

describe("currentCarvedLayoutValue (the recording reader)", () => {
  it("snapshots the live working copy's carve overlay", () => {
    const before = useWorkingCopyStore.getState();
    useWorkingCopyStore.setState({
      deletedNodeIds: new Set(["rule-9"]),
      deletedItemIds: new Set(["store-1#2"]),
      disabledFamilyIds: new Set(),
      carveChars: new Set(["q"]),
      carveDispositions: [DISPOSITION],
      closedKeyboardCard: "accepted",
    });
    try {
      expect(currentCarvedLayoutValue()).toEqual({
        removals: [
          { kind: "node", id: "rule-9", provenance: "asked" },
          { kind: "item", id: "store-1#2", provenance: "asked" },
          { kind: "char", id: "q", provenance: "asked" },
        ],
        dispositions: [DISPOSITION],
        closedKeyboardCard: "accepted",
      });
    } finally {
      useWorkingCopyStore.setState({
        deletedNodeIds: before.deletedNodeIds,
        deletedItemIds: before.deletedItemIds,
        disabledFamilyIds: before.disabledFamilyIds,
        carveChars: before.carveChars,
        carveDispositions: before.carveDispositions,
        closedKeyboardCard: before.closedKeyboardCard,
      });
    }
  });
});
