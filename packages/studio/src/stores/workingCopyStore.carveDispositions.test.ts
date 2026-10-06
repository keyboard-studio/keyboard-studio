// Tests for workingCopyStore's carve-disposition slice (076 FR-022).
//
// Coverage:
//   1. Initial state: closedKeyboardCard null, carveDispositions empty.
//   2. bulkDispositionDefault: the pure bulk-default function (card accepted /
//      declined / unanswered x sparse-Latin vs non-Latin proposal input).
//   3. prefillCarveDispositions: pre-fill from each card state; empty input is
//      a no-op; pre-fill NEVER overwrites an existing disposition (recompile
//      never re-prompts) — only genuinely new combos take the bulk default.
//   4. setCarveDisposition: per-row override flips provenance to
//      author-override; upserts a combo that has no disposition yet.
//   5. Un-carve deletes the metadata: restoreNode, restoreItem,
//      cascadeRestore, keepAll/restoreAll, pruneCarveDispositions, setIR.
//   6. getCarveDispositions: compiler read path — all, filtered, unknown ids
//      ignored, copies (no store mutation through the result).
//   7. Persistence: dispositions and the card decision round-trip through
//      snapshotWorkingCopyData / prepareWorkingCopySnapshot.

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkingCopyStore, bulkDispositionDefault } from "./workingCopyStore.ts";
import {
  snapshotWorkingCopyData,
  prepareWorkingCopySnapshot,
} from "../lib/persistWorkingCopy.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

const store = () => useWorkingCopyStore.getState();

// ---------------------------------------------------------------------------
// Initial state + card decision
// ---------------------------------------------------------------------------

describe("carve dispositions — initial state", () => {
  it("card starts unanswered and dispositions start empty", () => {
    expect(store().closedKeyboardCard).toBeNull();
    expect(store().carveDispositions).toEqual([]);
  });

  it("setClosedKeyboardCard records and clears the decision", () => {
    store().setClosedKeyboardCard("accepted");
    expect(store().closedKeyboardCard).toBe("accepted");
    store().setClosedKeyboardCard("declined");
    expect(store().closedKeyboardCard).toBe("declined");
    store().setClosedKeyboardCard(null);
    expect(store().closedKeyboardCard).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// bulkDispositionDefault — the pure bulk-default function
// ---------------------------------------------------------------------------

describe("bulkDispositionDefault", () => {
  it("card accepted → block from the card", () => {
    expect(bulkDispositionDefault("accepted", true)).toEqual({
      disposition: "block",
      provenance: "closed-keyboard-card",
    });
    expect(bulkDispositionDefault("accepted", false)).toEqual({
      disposition: "block",
      provenance: "closed-keyboard-card",
    });
  });

  it("card declined (sparse Latin overlay) → allow-host from the card", () => {
    expect(bulkDispositionDefault("declined", true)).toEqual({
      disposition: "allow-host",
      provenance: "closed-keyboard-card-declined",
    });
    expect(bulkDispositionDefault("declined", false)).toEqual({
      disposition: "allow-host",
      provenance: "closed-keyboard-card-declined",
    });
  });

  it("card unanswered → FR-005 proposal rule with bulk-default provenance", () => {
    // Sparse Latin overlay: the card is proposed declined → allow-host.
    expect(bulkDispositionDefault(null, true)).toEqual({
      disposition: "allow-host",
      provenance: "bulk-default",
    });
    // Non-Latin script base: the card is proposed accepted → block.
    expect(bulkDispositionDefault(null, false)).toEqual({
      disposition: "block",
      provenance: "bulk-default",
    });
  });
});

// ---------------------------------------------------------------------------
// prefillCarveDispositions
// ---------------------------------------------------------------------------

describe("prefillCarveDispositions", () => {
  it("pre-fills block from an accepted card", () => {
    store().setClosedKeyboardCard("accepted");
    store().prefillCarveDispositions(["n1", "store2#0"], { sparseLatinOverlay: false });
    expect(store().carveDispositions).toEqual([
      { comboId: "n1", disposition: "block", provenance: "closed-keyboard-card" },
      { comboId: "store2#0", disposition: "block", provenance: "closed-keyboard-card" },
    ]);
  });

  it("pre-fills allow-host from a declined card", () => {
    store().setClosedKeyboardCard("declined");
    store().prefillCarveDispositions(["n1"], { sparseLatinOverlay: true });
    expect(store().carveDispositions).toEqual([
      { comboId: "n1", disposition: "allow-host", provenance: "closed-keyboard-card-declined" },
    ]);
  });

  it("pre-fills the FR-005 proposal when the card is unanswered (sparse Latin)", () => {
    store().prefillCarveDispositions(["n1"], { sparseLatinOverlay: true });
    expect(store().carveDispositions).toEqual([
      { comboId: "n1", disposition: "allow-host", provenance: "bulk-default" },
    ]);
  });

  it("pre-fills the FR-005 proposal when the card is unanswered (non-Latin)", () => {
    store().prefillCarveDispositions(["n1"], { sparseLatinOverlay: false });
    expect(store().carveDispositions).toEqual([
      { comboId: "n1", disposition: "block", provenance: "bulk-default" },
    ]);
  });

  it("forces block with deadkey-requirement provenance for deadkey-context combos", () => {
    // Ruling (A1–A3): deadkey carves never fall through — even when the bulk
    // default is allow-host (declined card / sparse Latin overlay), deadkey
    // rows pre-fill to block with honest provenance.
    store().setClosedKeyboardCard("declined");
    store().prefillCarveDispositions(["n1", "n2"], {
      sparseLatinOverlay: true,
      deadkeyComboIds: new Set(["n2"]),
    });
    expect(store().carveDispositions).toEqual([
      { comboId: "n1", disposition: "allow-host", provenance: "closed-keyboard-card-declined" },
      { comboId: "n2", disposition: "block", provenance: "deadkey-requirement" },
    ]);
  });

  it("empty comboIds is a no-op", () => {
    store().setClosedKeyboardCard("accepted");
    store().prefillCarveDispositions([], { sparseLatinOverlay: false });
    expect(store().carveDispositions).toEqual([]);
  });

  it("never overwrites an existing disposition — recompile never re-prompts", () => {
    // First compile: card accepted → n1 pre-fills to block.
    store().setClosedKeyboardCard("accepted");
    store().prefillCarveDispositions(["n1"], { sparseLatinOverlay: false });
    // The author later declines the card; a recompile must not move n1…
    store().setClosedKeyboardCard("declined");
    // …and a genuinely new combo (n2) takes the CURRENT bulk default.
    store().prefillCarveDispositions(["n1", "n2"], { sparseLatinOverlay: true });
    expect(store().carveDispositions).toEqual([
      { comboId: "n1", disposition: "block", provenance: "closed-keyboard-card" },
      { comboId: "n2", disposition: "allow-host", provenance: "closed-keyboard-card-declined" },
    ]);
  });

  it("pre-fill does not touch an author override", () => {
    store().setClosedKeyboardCard("accepted");
    store().prefillCarveDispositions(["n1"], { sparseLatinOverlay: false });
    store().setCarveDisposition("n1", "allow-host");
    store().prefillCarveDispositions(["n1"], { sparseLatinOverlay: false });
    expect(store().carveDispositions).toEqual([
      { comboId: "n1", disposition: "allow-host", provenance: "author-override" },
    ]);
  });

  it("a second identical pre-fill is a no-op", () => {
    store().setClosedKeyboardCard("accepted");
    store().prefillCarveDispositions(["n1"], { sparseLatinOverlay: false });
    store().prefillCarveDispositions(["n1"], { sparseLatinOverlay: false });
    expect(store().carveDispositions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// setCarveDisposition — per-row override
// ---------------------------------------------------------------------------

describe("setCarveDisposition", () => {
  it("flips the value and records author-override provenance", () => {
    store().setClosedKeyboardCard("accepted");
    store().prefillCarveDispositions(["n1", "n2"], { sparseLatinOverlay: false });
    store().setCarveDisposition("n1", "allow-host");
    expect(store().carveDispositions).toEqual([
      { comboId: "n1", disposition: "allow-host", provenance: "author-override" },
      { comboId: "n2", disposition: "block", provenance: "closed-keyboard-card" },
    ]);
    // Flipping back keeps the author-override provenance.
    store().setCarveDisposition("n1", "block");
    expect(store().carveDispositions[0]).toEqual({
      comboId: "n1",
      disposition: "block",
      provenance: "author-override",
    });
  });

  it("upserts a comboId that has no disposition yet", () => {
    store().setCarveDisposition("n9", "block");
    expect(store().carveDispositions).toEqual([
      { comboId: "n9", disposition: "block", provenance: "author-override" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Un-carve deletes the metadata
// ---------------------------------------------------------------------------

describe("un-carve deletes carve dispositions", () => {
  beforeEach(() => {
    store().setClosedKeyboardCard("accepted");
    store().prefillCarveDispositions(["n1", "n2", "store3#1"], { sparseLatinOverlay: false });
  });

  it("restoreNode drops that node's disposition and keeps the rest", () => {
    store().restoreNode("n1");
    expect(store().carveDispositions.map((d) => d.comboId)).toEqual(["n2", "store3#1"]);
  });

  it("restoreItem drops that item's disposition (slot carve ids too)", () => {
    store().restoreItem("store3#1");
    expect(store().carveDispositions.map((d) => d.comboId)).toEqual(["n1", "n2"]);
  });

  it("cascadeRestore drops the restored ids", () => {
    store().cascadeRestore(["n1", "store3#1"]);
    expect(store().carveDispositions.map((d) => d.comboId)).toEqual(["n2"]);
  });

  it("keepAll and restoreAll clear every disposition", () => {
    store().keepAll();
    expect(store().carveDispositions).toEqual([]);
    store().prefillCarveDispositions(["n1"], { sparseLatinOverlay: false });
    store().restoreAll();
    expect(store().carveDispositions).toEqual([]);
  });

  it("pruneCarveDispositions drops combos outside the live carve set", () => {
    store().pruneCarveDispositions(new Set(["n2"]));
    expect(store().carveDispositions.map((d) => d.comboId)).toEqual(["n2"]);
  });

  it("pruneCarveDispositions accepts a plain array and is a no-op when nothing is stale", () => {
    store().pruneCarveDispositions(["n1", "n2", "store3#1"]);
    expect(store().carveDispositions).toHaveLength(3);
  });

  it("setIR (full IR replacement) clears dispositions", () => {
    store().setIR(makeTestIR());
    expect(store().carveDispositions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// carveTouchKeepInert — T020 (076 FR-023) keep-inert overrides
// ---------------------------------------------------------------------------

describe("carveTouchKeepInert", () => {
  it("starts empty (touch-layout removal is the default)", () => {
    expect(store().carveTouchKeepInert).toEqual([]);
  });

  it("setCarveTouchKeepInert replaces wholesale and NFC-normalizes", () => {
    const decomposed = "e" + String.fromCharCode(0x0301);
    store().setCarveTouchKeepInert(["à", decomposed]);
    expect(store().carveTouchKeepInert).toEqual(["à", "é"]);
    store().setCarveTouchKeepInert([]);
    expect(store().carveTouchKeepInert).toEqual([]);
  });

  it("un-carve clears keep-inert overrides alongside dispositions", () => {
    store().setCarveTouchKeepInert(["é"]);
    store().keepAll();
    expect(store().carveTouchKeepInert).toEqual([]);
    store().setCarveTouchKeepInert(["é"]);
    store().restoreAll();
    expect(store().carveTouchKeepInert).toEqual([]);
    store().setCarveTouchKeepInert(["é"]);
    store().setIR(makeTestIR());
    expect(store().carveTouchKeepInert).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getCarveDispositions — the compiler read path
// ---------------------------------------------------------------------------

describe("getCarveDispositions", () => {
  beforeEach(() => {
    store().setClosedKeyboardCard("declined");
    store().prefillCarveDispositions(["n1", "n2"], { sparseLatinOverlay: true });
  });

  it("returns every disposition with no argument", () => {
    expect(store().getCarveDispositions()).toEqual([
      { comboId: "n1", disposition: "allow-host", provenance: "closed-keyboard-card-declined" },
      { comboId: "n2", disposition: "allow-host", provenance: "closed-keyboard-card-declined" },
    ]);
  });

  it("filters to the requested combos and ignores unknown comboIds", () => {
    expect(store().getCarveDispositions(["n2", "nope"])).toEqual([
      { comboId: "n2", disposition: "allow-host", provenance: "closed-keyboard-card-declined" },
    ]);
  });

  it("returns copies — mutating the result does not touch the store", () => {
    const read = store().getCarveDispositions(["n1"]);
    read[0]!.disposition = "block";
    expect(store().getCarveDispositions(["n1"])[0]!.disposition).toBe("allow-host");
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe("carve dispositions persist with the working copy", () => {
  it("round-trips the card decision, dispositions, and keep-inert overrides through snapshot/rehydrate", () => {
    store().setClosedKeyboardCard("accepted");
    store().prefillCarveDispositions(["n1", "store2#0"], { sparseLatinOverlay: false });
    store().setCarveDisposition("n1", "allow-host");
    store().setCarveTouchKeepInert(["é"]);

    const snapshot = snapshotWorkingCopyData();
    expect(snapshot.closedKeyboardCard).toBe("accepted");
    expect(snapshot.carveTouchKeepInert).toEqual(["é"]);
    expect(snapshot.carveDispositions).toEqual([
      { comboId: "n1", disposition: "allow-host", provenance: "author-override" },
      { comboId: "store2#0", disposition: "block", provenance: "closed-keyboard-card" },
    ]);

    store().reset();
    expect(store().closedKeyboardCard).toBeNull();
    expect(store().carveDispositions).toEqual([]);
    expect(store().carveTouchKeepInert).toEqual([]);

    useWorkingCopyStore.setState(prepareWorkingCopySnapshot(snapshot));
    expect(store().closedKeyboardCard).toBe("accepted");
    expect(store().carveTouchKeepInert).toEqual(["é"]);
    expect(store().carveDispositions).toEqual([
      { comboId: "n1", disposition: "allow-host", provenance: "author-override" },
      { comboId: "store2#0", disposition: "block", provenance: "closed-keyboard-card" },
    ]);
  });

  it("tolerates a pre-feature snapshot missing all three fields", () => {
    const snapshot = snapshotWorkingCopyData();
    // A snapshot written before this feature existed has none of these keys.
    const legacy = { ...snapshot };
    delete legacy.closedKeyboardCard;
    delete legacy.carveDispositions;
    delete legacy.carveTouchKeepInert;
    const patch = prepareWorkingCopySnapshot(legacy);
    expect(patch.closedKeyboardCard).toBeNull();
    expect(patch.carveDispositions).toEqual([]);
    expect(patch.carveTouchKeepInert).toEqual([]);
  });
});
