// Unit tests for keyEditOrphanReport (spec 058 T060, FR-033b).
//
// The REQUIRED case (contracts/key-edit-overlay.md §10's last bullet): an
// overlay authored against seed A, replayed against a re-derived seed B that
// removed the addressed key, reports the operation as orphaned AND names the
// lost character — never silently drops it. See "re-derivation: names the
// lost character on a removed key" below.

import { describe, it, expect } from "vitest";
import type { TouchKeyRuleIndex, TouchKeyRuleBinding, TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  touchKeyAddress,
  type KeyEditOperation,
  type KeyEditOverlay,
} from "@keyboard-studio/engine";
import {
  buildKeyEditReDerivationReport,
  discardOrphanedKeyEdits,
} from "./keyEditOrphanReport.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Seed A: phone/default has two keys, T_ALPHA (explicit output "q") and
 *  T_BARE (a rule-bound custom id with no output/text of its own). */
function seedA(): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  { nodeId: "n1", id: "T_ALPHA", text: "q", output: "q" },
                  { nodeId: "n2", id: "T_BARE" },
                ],
              },
            ],
          },
        ],
      },
    ],
    nodeIds: [],
  };
}

/** Seed B: re-derived from a changed physical assignment — T_ALPHA is GONE
 *  (only T_BARE remains). Models "the author navigated back, changed
 *  physical assignments, and returned" (FR-033b). */
function seedBKeyRemoved(): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [{ nodeId: "n2", id: "T_BARE" }],
              },
            ],
          },
        ],
      },
    ],
    nodeIds: [],
  };
}

/** A hand-built rule index crediting T_BARE with U+03B1 via a `produces`
 *  binding — bypasses buildTouchKeyRuleIndex's .kmn parsing since the plain
 *  data shape is all `keyChars` reads. */
function ruleIndexForBare(): TouchKeyRuleIndex {
  const binding: TouchKeyRuleBinding = {
    ruleNodeId: "r1",
    groupName: "main",
    usingKeys: true,
    keyIdAsWritten: "T_BARE",
    modifiers: [],
    role: "produces",
    produced: ["α"],
    contextGuarded: false,
  };
  return {
    byId: new Map([["T_BARE", [binding]]]),
    spellings: new Map([["T_BARE", ["T_BARE"]]]),
    producingIds: new Set(["T_BARE"]),
    opaqueFragmentCount: 0,
  };
}

const alphaAddress = touchKeyAddress("phone", "default", "T_ALPHA");
const bareAddress = touchKeyAddress("phone", "default", "T_BARE");

// ---------------------------------------------------------------------------
// The required case
// ---------------------------------------------------------------------------

describe("buildKeyEditReDerivationReport — re-derivation resilience (FR-033b)", () => {
  it("REQUIRED: an overlay authored against seed A, replayed against seed B that removed the addressed key, reports the op as orphaned and names the lost character", () => {
    const rename: KeyEditOperation = {
      seq: 0,
      kind: "rename",
      address: alphaAddress,
      toId: "T_ALPHA_RENAMED",
    };
    const overlay: KeyEditOverlay = { ops: [rename] };

    const report = buildKeyEditReDerivationReport({
      priorLayout: seedA(),
      newLayout: seedBKeyRemoved(),
      overlay,
    });

    expect(report.orphaned).toHaveLength(1);
    expect(report.orphaned[0]?.op).toBe(rename);
    expect(report.orphaned[0]?.address).toBe(alphaAddress);
    // The lost character MUST be named, not merely "something was dropped".
    expect(report.orphaned[0]?.lostChars).toEqual(["q"]);
    expect(report.lostCharacters).toEqual(["q"]);
    // The underlying replay's own diagnostic still travels through, unchanged.
    expect(report.warnings.some((w) => w.includes(alphaAddress))).toBe(true);
  });

  it("names the lost character via the rule join for a bare, rule-bound key (the Cameroon T_* shape)", () => {
    const suppress: KeyEditOperation = {
      seq: 0,
      kind: "suppress",
      address: bareAddress,
      spClass: 9,
      sentinelId: "T_BLANK",
    };
    const overlay: KeyEditOverlay = { ops: [suppress] };

    // Seed B here removes T_BARE too, so the suppress op orphans.
    const seedBBareRemoved: TouchLayoutIR = {
      platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: [] }] }] }],
      nodeIds: [],
    };

    const withoutRuleIndex = buildKeyEditReDerivationReport({
      priorLayout: seedA(),
      newLayout: seedBBareRemoved,
      overlay,
    });
    // T_BARE has no `output` of its own and is not a `U_` id — without a
    // rule index nothing can be named, which is the honest, never-wrong
    // under-report the module doc describes.
    expect(withoutRuleIndex.orphaned[0]?.lostChars).toEqual([]);

    const withRuleIndex = buildKeyEditReDerivationReport({
      priorLayout: seedA(),
      newLayout: seedBBareRemoved,
      overlay,
      priorRuleIndex: ruleIndexForBare(),
    });
    expect(withRuleIndex.orphaned[0]?.lostChars).toEqual(["α"]);
    expect(withRuleIndex.lostCharacters).toEqual(["α"]);
  });

  it("names the character directly from the operation itself for an orphaned `add` (no prior-layout lookup)", () => {
    // `add` anchors on a key that no longer exists in the re-derived seed —
    // there is nothing to resolve in the PRIOR layout either (the new key
    // never existed there), so the op's OWN `key.output` is the whole answer.
    const add: KeyEditOperation = {
      seq: 0,
      kind: "add",
      address: touchKeyAddress("phone", "default", "T_GHOST_ANCHOR"),
      position: "after",
      key: { id: "T_NEW", text: "z", output: "z", sp: 0 },
    };
    const overlay: KeyEditOverlay = { ops: [add] };

    const report = buildKeyEditReDerivationReport({
      priorLayout: seedA(),
      newLayout: seedA(),
      overlay,
    });

    expect(report.orphaned).toHaveLength(1);
    expect(report.orphaned[0]?.lostChars).toEqual(["z"]);
  });

  it("resolves an orphaned removeSubKey against the prior layout's sub-entry", () => {
    const priorWithLongpress: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    {
                      nodeId: "n1",
                      id: "T_HOST",
                      sk: [{ nodeId: "n1s", id: "U_00E9", output: "é" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    // Re-derived seed loses T_HOST entirely.
    const newLayoutNoHost: TouchLayoutIR = {
      platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: [] }] }] }],
      nodeIds: [],
    };

    const removeSubKey: KeyEditOperation = {
      seq: 0,
      kind: "removeSubKey",
      address: touchKeyAddress("phone", "default", "T_HOST"),
      sub: { kind: "sk", id: "U_00E9" },
    };
    const overlay: KeyEditOverlay = { ops: [removeSubKey] };

    const report = buildKeyEditReDerivationReport({
      priorLayout: priorWithLongpress,
      newLayout: newLayoutNoHost,
      overlay,
    });

    expect(report.orphaned).toHaveLength(1);
    expect(report.orphaned[0]?.lostChars).toEqual(["é"]);
  });

  it("resolves an orphan through a chain of earlier ops replayed onto the PRIOR seed (ordering, not just single-op lookup)", () => {
    // seq 0 renames T_ALPHA -> T_ALPHA2 (a rename clears the stale `output`
    // override per applyFieldSemantics — the ONE place a changed id drops
    // it, see keyEditOps.ts); seq 1 re-declares a fresh output on the
    // renamed key; seq 2 suppresses it, carrying no character of its own.
    // The re-derived seed loses the key entirely, so all three orphan — but
    // seq 2's lost character must resolve by replaying seq 0 AND seq 1 (in
    // that order) onto the PRIOR seed, mirroring the exact ordering contract
    // `replayKeyEditOverlay` itself already enforces (contract §5).
    const rename: KeyEditOperation = {
      seq: 0,
      kind: "rename",
      address: alphaAddress,
      toId: "T_ALPHA2",
    };
    const reestablishOutput: KeyEditOperation = {
      seq: 1,
      kind: "set",
      address: touchKeyAddress("phone", "default", "T_ALPHA2"),
      fields: { output: "q2" },
    };
    const suppress: KeyEditOperation = {
      seq: 2,
      kind: "suppress",
      address: touchKeyAddress("phone", "default", "T_ALPHA2"),
      spClass: 9,
      sentinelId: "T_BLANK",
    };
    const overlay: KeyEditOverlay = { ops: [rename, reestablishOutput, suppress] };

    const report = buildKeyEditReDerivationReport({
      priorLayout: seedA(),
      newLayout: seedBKeyRemoved(),
      overlay,
    });

    expect(report.orphaned).toHaveLength(3);
    const suppressEntry = report.orphaned.find((e) => e.op.seq === 2);
    expect(suppressEntry?.lostChars).toEqual(["q2"]);
  });

  it("is total: a malformed address never throws, and reports an empty lostChars", () => {
    const op: KeyEditOperation = {
      seq: 0,
      kind: "remove",
      address: "not a valid address",
      outcome: "reflow",
    };
    const overlay: KeyEditOverlay = { ops: [op] };

    const report = buildKeyEditReDerivationReport({
      priorLayout: seedA(),
      newLayout: seedBKeyRemoved(),
      overlay,
    });

    expect(report.orphaned).toHaveLength(1);
    expect(report.orphaned[0]?.lostChars).toEqual([]);
  });

  it("returns no orphans and an empty lostCharacters set when every op still resolves", () => {
    const rename: KeyEditOperation = {
      seq: 0,
      kind: "rename",
      address: bareAddress,
      toId: "T_BARE_RENAMED",
    };
    const overlay: KeyEditOverlay = { ops: [rename] };

    const report = buildKeyEditReDerivationReport({
      priorLayout: seedA(),
      newLayout: seedA(),
      overlay,
    });

    expect(report.orphaned).toEqual([]);
    expect(report.lostCharacters).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// discardOrphanedKeyEdits — the "discard" remedy
// ---------------------------------------------------------------------------

describe("discardOrphanedKeyEdits", () => {
  it("removes only the named seqs, preserving every other op", () => {
    const kept: KeyEditOperation = {
      seq: 0,
      kind: "set",
      address: bareAddress,
      fields: { text: "kept" },
    };
    const dropped: KeyEditOperation = {
      seq: 1,
      kind: "rename",
      address: alphaAddress,
      toId: "T_ALPHA_X",
    };
    const overlay: KeyEditOverlay = { ops: [kept, dropped] };

    const result = discardOrphanedKeyEdits(overlay, [1]);

    expect(result.ops).toEqual([kept]);
  });

  it("is a no-op (same-shaped overlay) when seqsToDrop is empty", () => {
    const op: KeyEditOperation = { seq: 0, kind: "set", address: bareAddress, fields: {} };
    const overlay: KeyEditOverlay = { ops: [op] };

    expect(discardOrphanedKeyEdits(overlay, [])).toEqual(overlay);
  });

  it("composes directly with a report's orphaned seqs", () => {
    const rename: KeyEditOperation = { seq: 0, kind: "rename", address: alphaAddress, toId: "T_X" };
    const survives: KeyEditOperation = { seq: 1, kind: "set", address: bareAddress, fields: { text: "still here" } };
    const overlay: KeyEditOverlay = { ops: [rename, survives] };

    const report = buildKeyEditReDerivationReport({
      priorLayout: seedA(),
      newLayout: seedBKeyRemoved(),
      overlay,
    });

    const result = discardOrphanedKeyEdits(
      overlay,
      report.orphaned.map((entry) => entry.op.seq),
    );

    expect(result.ops).toEqual([survives]);
  });
});
