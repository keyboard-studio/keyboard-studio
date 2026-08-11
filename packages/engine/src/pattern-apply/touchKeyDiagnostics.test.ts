/**
 * Unit tests for touchKeyDiagnostics (spec 058 Phase 8 / US4, T101-T103).
 *
 * Grouped to match the three exported checks:
 *   1. findHalfDoneSuppressions   - both branches, plus the FR-029e carve-out
 *      (a well-formed suppression is NOT reported) as its own explicit case.
 *   2. findLayerSwitchActiveMismatches - both directions of R3b's rule, the
 *      match cases, and the suppressed-key exemption.
 *   3. findMixedSuppressRemove    - same-layer mix, single-kind negatives,
 *      cross-layer negative, and the malformed-address skip.
 *
 * Small local fixtures rather than the shared `@keyboard-studio/contracts`
 * `makeTouchKeyRuleJoinFixture` — that fixture is the single shared fixture
 * behind the join's role-matrix/reachability/applier-twin obligations
 * (contract touch-key-rule-join.md §8, "why there is exactly ONE fixture");
 * these three checks are new and need states that fixture does not model
 * (a half-done suppression, a mismatched active `sp`, a mixed-approach
 * overlay), so extending it is out of scope for this change and would also
 * pull in unrelated fixture keys whose incidental `nextlayer`/`sp` shapes
 * would otherwise need accounting for in every assertion here.
 */

import { describe, it, expect } from "vitest";
import { normalizeTouchKeyId } from "@keyboard-studio/contracts";
import type {
  TouchKeyIR,
  TouchKeyRuleBinding,
  TouchKeyRuleIndex,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  findCrowdedTouchRows,
  findHalfDoneSuppressions,
  findKeycapMismatches,
  findLayerSwitchActiveMismatches,
  findMixedSuppressRemove,
  type CompleteSuppressionFix,
  type ReviewKeyFix,
  type SetLayerSwitchSpFix,
  type TrimRowFix,
} from "./touchKeyDiagnostics.js";
import type { KeyEditOverlay, RemoveKeyOp, SuppressKeyOp } from "./keyEditOps.js";
import { resolveKeyAddress } from "./keyEditOps.js";
import { parseTouchKeyAddress, touchKeyAddress } from "./touchKeyAddress.js";

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

function key(id: string, extra: Partial<Omit<TouchKeyIR, "nodeId" | "id">> = {}): TouchKeyIR {
  return { nodeId: `n-${id}`, id, ...extra };
}

/** One platform ("phone"), one or more layers, one row each. */
function makeLayout(layers: ReadonlyArray<{ id: string; keys: readonly TouchKeyIR[] }>): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: layers.map((l) => ({ id: l.id, rows: [{ keys: [...l.keys] }] })),
      },
    ],
    nodeIds: [],
  };
}

function emptyRuleIndex(opaqueFragmentCount = 0): TouchKeyRuleIndex {
  return {
    byId: new Map(),
    spellings: new Map(),
    producingIds: new Set(),
    opaqueFragmentCount,
  };
}

/** A rule index carrying exactly one binding for `keyId`, of the given role. */
function ruleIndexWithBinding(
  keyId: string,
  role: TouchKeyRuleBinding["role"] = "produces",
  opaqueFragmentCount = 0,
): TouchKeyRuleIndex {
  const normalized = normalizeTouchKeyId(keyId);
  const binding: TouchKeyRuleBinding = {
    ruleNodeId: "rule#1",
    groupName: "Main",
    usingKeys: true,
    keyIdAsWritten: keyId,
    modifiers: [],
    role,
    produced: role === "produces" ? ["x"] : [],
    contextGuarded: false,
  };
  return {
    byId: new Map([[normalized, [binding]]]),
    spellings: new Map([[normalized, [keyId]]]),
    producingIds: new Set(role === "produces" ? [normalized] : []),
    opaqueFragmentCount,
  };
}

// ---------------------------------------------------------------------------
// findHalfDoneSuppressions (T101)
// ---------------------------------------------------------------------------

describe("findHalfDoneSuppressions", () => {
  it("reports 'still live': non-interactive sp, non-sentinel id, still wired to a rule", () => {
    const layout = makeLayout([
      { id: "default", keys: [key("T_STUCK", { sp: 10 })] },
    ]);
    const ruleIndex = ruleIndexWithBinding("T_STUCK", "produces");

    const findings = findHalfDoneSuppressions(layout, ruleIndex);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe("TOUCH_KEY_HALF_DONE_SUPPRESSION");
    expect(finding.severity).toBe("warning");
    expect(finding.address).toBe(touchKeyAddress("phone", "default", "T_STUCK"));
    expect(finding.fields).toEqual({ kind: "stillLive", keyId: "T_STUCK", sp: 10 });
    const fix = finding.fixes[0] as CompleteSuppressionFix;
    expect(fix.kind).toBe("completeSuppression");
    expect(fix.spClass).toBe(10);
    expect(fix.sentinelId).toBe("T_SPACER");
  });

  it("reports 'still live' for a WIRED-but-not-producing binding too (guard/suppress/transitions/opaque all count as wired)", () => {
    const layout = makeLayout([
      { id: "default", keys: [key("T_STUCK", { sp: 9 })] },
    ]);
    const ruleIndex = ruleIndexWithBinding("T_STUCK", "guard");

    const findings = findHalfDoneSuppressions(layout, ruleIndex);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.fields.kind).toBe("stillLive");
    expect((findings[0]?.fixes[0] as CompleteSuppressionFix).spClass).toBe(9);
    expect((findings[0]?.fixes[0] as CompleteSuppressionFix).sentinelId).toBe("T_BLANK");
  });

  it("reports 'invisible dead key': producing sp class, but the id was already neutralized to a sentinel", () => {
    const layout = makeLayout([
      { id: "default", keys: [key("T_BLANK", { sp: 0 })] },
    ]);
    const ruleIndex = emptyRuleIndex();

    const findings = findHalfDoneSuppressions(layout, ruleIndex);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.severity).toBe("warning");
    expect(finding.fields).toEqual({ kind: "invisibleDead", keyId: "T_BLANK", sp: 0 });
    const fix = finding.fixes[0] as CompleteSuppressionFix;
    expect(fix.spClass).toBe(9);
    expect(fix.sentinelId).toBe("T_BLANK");
  });

  it("treats an absent sp the same as sp:0 for the 'invisible dead key' branch", () => {
    const layout = makeLayout([{ id: "default", keys: [key("T_SPACER")] }]);
    const findings = findHalfDoneSuppressions(layout, emptyRuleIndex());

    expect(findings).toHaveLength(1);
    expect(findings[0]?.fields).toEqual({ kind: "invisibleDead", keyId: "T_SPACER", sp: undefined });
    expect((findings[0]?.fixes[0] as CompleteSuppressionFix).spClass).toBe(10);
  });

  it("also fires on sp:8 (deadkey-styled, interactive) for the 'invisible dead key' branch", () => {
    const layout = makeLayout([{ id: "default", keys: [key("T_NUL", { sp: 8 })] }]);
    const findings = findHalfDoneSuppressions(layout, emptyRuleIndex());

    expect(findings).toHaveLength(1);
    // T_NUL has no dedicated sp pairing in the minting table; resolves to 9.
    expect((findings[0]?.fixes[0] as CompleteSuppressionFix).spClass).toBe(9);
  });

  it("downgrades 'invisible dead key' to a hint when the IR carries an opaque fragment", () => {
    const layout = makeLayout([{ id: "default", keys: [key("T_BLANK", { sp: 0 })] }]);
    const findings = findHalfDoneSuppressions(layout, emptyRuleIndex(1));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("hint");
  });

  it("does NOT downgrade 'still live' under an opaque fragment (the positive rule find is unaffected)", () => {
    const layout = makeLayout([{ id: "default", keys: [key("T_STUCK", { sp: 9 })] }]);
    const findings = findHalfDoneSuppressions(layout, ruleIndexWithBinding("T_STUCK", "produces", 1));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("warning");
  });

  it("FR-029e: a WELL-FORMED suppression (non-interactive sp + reserved sentinel id) is never reported", () => {
    const layout = makeLayout([
      { id: "default", keys: [key("T_BLANK", { sp: 9, text: " " })] },
      { id: "symbol", keys: [key("T_SPACER", { sp: 10 })] },
      { id: "shift", keys: [key("T_NUL", { sp: 9 })] },
    ]);
    // Even if a rule somehow existed for the sentinel id, the well-formed
    // branch (sp non-interactive AND id a sentinel) still short-circuits.
    const ruleIndex = ruleIndexWithBinding("T_BLANK", "produces");

    const findings = findHalfDoneSuppressions(layout, ruleIndex);

    expect(findings).toHaveLength(0);
  });

  it("does not report an ordinary producing key with a real id and a real rule", () => {
    const layout = makeLayout([{ id: "default", keys: [key("T_REAL", { sp: 0 })] }]);
    const findings = findHalfDoneSuppressions(layout, ruleIndexWithBinding("T_REAL", "produces"));
    expect(findings).toHaveLength(0);
  });

  it("does not report a non-interactive key carrying a non-sentinel id that has NO binding at all", () => {
    const layout = makeLayout([{ id: "default", keys: [key("T_UNUSED", { sp: 10 })] }]);
    const findings = findHalfDoneSuppressions(layout, emptyRuleIndex());
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findLayerSwitchActiveMismatches (T102)
// ---------------------------------------------------------------------------

describe("findLayerSwitchActiveMismatches", () => {
  it("proposes sp:2 when nextlayer names the key's OWN containing layer, and reports when sp disagrees", () => {
    const layout = makeLayout([
      { id: "shift", keys: [key("T_SHIFT", { sp: 1, nextlayer: "shift" })] },
    ]);
    const findings = findLayerSwitchActiveMismatches(layout);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe("TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH");
    expect(finding.severity).toBe("warning");
    expect(finding.address).toBe(touchKeyAddress("phone", "shift", "T_SHIFT"));
    expect(finding.fields).toEqual({
      keyId: "T_SHIFT",
      layerId: "shift",
      nextlayer: "shift",
      currentSp: 1,
      expectedSp: 2,
    });
    const fix = finding.fixes[0] as SetLayerSwitchSpFix;
    expect(fix.kind).toBe("setSp");
    expect(fix.sp).toBe(2);
  });

  it("proposes sp:1 when nextlayer names a DIFFERENT layer, and reports when sp disagrees", () => {
    const layout = makeLayout([
      { id: "default", keys: [key("T_SHIFT", { sp: 2, nextlayer: "shift" })] },
    ]);
    const findings = findLayerSwitchActiveMismatches(layout);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.fields.expectedSp).toBe(1);
    expect((findings[0]?.fixes[0] as SetLayerSwitchSpFix).sp).toBe(1);
  });

  it("treats an absent sp as sp:0 for comparison, so a bare frame key with nextlayer elsewhere still mismatches", () => {
    const layout = makeLayout([
      { id: "default", keys: [key("T_SHIFT", { nextlayer: "shift" })] },
    ]);
    const findings = findLayerSwitchActiveMismatches(layout);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.fields.currentSp).toBeUndefined();
    expect(findings[0]?.fields.expectedSp).toBe(1);
  });

  it("does not report when sp:2 correctly matches the layer it switches to", () => {
    const layout = makeLayout([
      { id: "shift", keys: [key("T_SHIFT", { sp: 2, nextlayer: "shift" })] },
    ]);
    expect(findLayerSwitchActiveMismatches(layout)).toHaveLength(0);
  });

  it("does not report when sp:1 correctly matches a frame key pointing elsewhere", () => {
    const layout = makeLayout([
      { id: "default", keys: [key("T_SHIFT", { sp: 1, nextlayer: "shift" })] },
    ]);
    expect(findLayerSwitchActiveMismatches(layout)).toHaveLength(0);
  });

  it("skips a key with no nextlayer entirely, regardless of sp", () => {
    const layout = makeLayout([{ id: "default", keys: [key("T_A", { sp: 0 })] }]);
    expect(findLayerSwitchActiveMismatches(layout)).toHaveLength(0);
  });

  it("exempts a SUPPRESSED layer-switch key (sp 9/10) even though it would otherwise mismatch", () => {
    const layout = makeLayout([
      { id: "default", keys: [key("T_SHIFT", { sp: 10, nextlayer: "shift" })] },
    ]);
    expect(findLayerSwitchActiveMismatches(layout)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findMixedSuppressRemove (T103)
// ---------------------------------------------------------------------------

function suppressOp(address: string, seq: number): SuppressKeyOp {
  return { seq, address, kind: "suppress", spClass: 9, sentinelId: "T_BLANK" };
}

function removeOp(address: string, seq: number): RemoveKeyOp {
  return { seq, address, kind: "remove", outcome: "reflow" };
}

describe("findMixedSuppressRemove", () => {
  it("reports a layer whose committed ops mix suppress and remove", () => {
    const overlay: KeyEditOverlay = {
      ops: [
        suppressOp(touchKeyAddress("phone", "symbol", "T_A"), 1),
        removeOp(touchKeyAddress("phone", "symbol", "T_B"), 2),
      ],
    };

    const findings = findMixedSuppressRemove(overlay);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe("TOUCH_KEY_MIXED_SUPPRESS_REMOVE");
    expect(finding.severity).toBe("hint");
    expect(finding.address).toBe(touchKeyAddress("phone", "symbol", "T_A"));
    expect(finding.fields).toEqual({
      platform: "phone",
      layerId: "symbol",
      suppressedAddresses: [touchKeyAddress("phone", "symbol", "T_A")],
      removedAddresses: [touchKeyAddress("phone", "symbol", "T_B")],
    });
    const fix = finding.fixes[0] as ReviewKeyFix;
    expect(fix.kind).toBe("reviewKey");
    expect(fix.address).toBe(touchKeyAddress("phone", "symbol", "T_A"));
  });

  it("does not report a layer with only suppress ops", () => {
    const overlay: KeyEditOverlay = {
      ops: [
        suppressOp(touchKeyAddress("phone", "symbol", "T_A"), 1),
        suppressOp(touchKeyAddress("phone", "symbol", "T_B"), 2),
      ],
    };
    expect(findMixedSuppressRemove(overlay)).toHaveLength(0);
  });

  it("does not report a layer with only remove ops", () => {
    const overlay: KeyEditOverlay = {
      ops: [
        removeOp(touchKeyAddress("phone", "symbol", "T_A"), 1),
        removeOp(touchKeyAddress("phone", "symbol", "T_B"), 2),
      ],
    };
    expect(findMixedSuppressRemove(overlay)).toHaveLength(0);
  });

  it("does not report across DIFFERENT layers — suppress on one, remove on another", () => {
    const overlay: KeyEditOverlay = {
      ops: [
        suppressOp(touchKeyAddress("phone", "symbol", "T_A"), 1),
        removeOp(touchKeyAddress("phone", "shift", "T_B"), 2),
      ],
    };
    expect(findMixedSuppressRemove(overlay)).toHaveLength(0);
  });

  it("ignores non-suppress/remove op kinds and never crashes on a malformed address", () => {
    const overlay: KeyEditOverlay = {
      ops: [
        { seq: 1, address: "not-a-valid-address", kind: "suppress", spClass: 9, sentinelId: "T_BLANK" },
        { seq: 2, address: touchKeyAddress("phone", "symbol", "T_C"), kind: "rename", toId: "T_D" },
        removeOp(touchKeyAddress("phone", "symbol", "T_E"), 3),
      ],
    };
    // The malformed suppress address is dropped (never-throw), the rename is
    // not counted at all, and the lone remove has no suppress counterpart.
    expect(findMixedSuppressRemove(overlay)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findCrowdedTouchRows (spec 061 T017, FR-014)
//
// `makeLayout` above gives every layer exactly one row, which is all this
// detector needs; the multi-row case is covered by the row-index assertion,
// which uses its own inline layout.
// ---------------------------------------------------------------------------

describe("findCrowdedTouchRows", () => {
  /** `n` interactive keys, ids distinct so nothing else in the suite could dedup them. */
  function letters(n: number): TouchKeyIR[] {
    return Array.from({ length: n }, (_unused, i) => key(`U_${(0x61 + i).toString(16)}`, { sp: 0 }));
  }

  /** A one-platform layout under an explicit platform id — `makeLayout` hardcodes "phone". */
  function layoutOn(platformId: string, keys: readonly TouchKeyIR[]): TouchLayoutIR {
    return {
      platforms: [{ id: platformId, layers: [{ id: "default", rows: [{ keys: [...keys] }] }] }],
      nodeIds: [],
    };
  }

  it("warns for a phone row of 11 interactive keys", () => {
    const findings = findCrowdedTouchRows(layoutOn("phone", letters(11)));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("TOUCH_KEY_ROW_CROWDED");
  });

  it("does not warn for the same row on tablet", () => {
    expect(findCrowdedTouchRows(layoutOn("tablet", letters(11)))).toHaveLength(0);
  });

  it("does not warn on desktop, which is unruled however long the row", () => {
    expect(findCrowdedTouchRows(layoutOn("desktop", letters(40)))).toHaveLength(0);
  });

  it("does not warn for a phone row exactly at the maximum", () => {
    expect(findCrowdedTouchRows(layoutOn("phone", letters(10)))).toHaveLength(0);
  });

  it("never warns for a row of nothing but blank/spacer keys, however long", () => {
    const spacers = Array.from({ length: 20 }, (_unused, i) =>
      key(`T_BLANK_${i}`, { sp: i % 2 === 0 ? 9 : 10 }),
    );
    expect(findCrowdedTouchRows(layoutOn("phone", spacers))).toHaveLength(0);
  });

  it("counts deadkey-styled (sp:8) keys, which are interactive and do crowd", () => {
    const deadkeyStyled = Array.from({ length: 11 }, (_unused, i) => key(`T_D${i}`, { sp: 8 }));
    expect(findCrowdedTouchRows(layoutOn("phone", deadkeyStyled))).toHaveLength(1);
  });

  it("excludes spacers from the count, so a long row of mostly spacers stays silent", () => {
    const mixed = [...letters(9), ...Array.from({ length: 8 }, (_u, i) => key(`T_S${i}`, { sp: 10 }))];
    expect(findCrowdedTouchRows(layoutOn("phone", mixed))).toHaveLength(0);
  });

  it("is a non-blocking warning at layer scope, not a key-scoped error (SC-006, US2 AS3)", () => {
    const finding = findCrowdedTouchRows(layoutOn("phone", letters(12)))[0];
    expect(finding?.severity).toBe("warning");
    expect(finding?.scope).toBe("layer");
  });

  it("carries structured detail only — no English prose crosses the boundary (FR-037)", () => {
    const finding = findCrowdedTouchRows(layoutOn("phone", letters(12)))[0];
    expect(finding?.fields).toMatchObject({
      platform: "phone",
      layerId: "default",
      rowIndex: 0,
      interactiveKeyCount: 12,
      platformMaxKeys: 10,
    });
    expect(finding?.fields).not.toHaveProperty("message");
  });

  it("offers a trimRow fix naming the overage", () => {
    const finding = findCrowdedTouchRows(layoutOn("phone", letters(12)))[0];
    const fix = finding?.fixes[0] as TrimRowFix | undefined;
    expect(fix?.kind).toBe("trimRow");
    expect(fix?.overBy).toBe(2);
    expect(fix?.rowIndex).toBe(0);
  });

  it("anchors on the row's first key, so the finding resolves to a place on the grid", () => {
    const finding = findCrowdedTouchRows(layoutOn("phone", letters(11)))[0];
    expect(finding?.address).toBe(touchKeyAddress("phone", "default", "U_61"));
  });

  it("anchors by OCCURRENCE when the anchor's id repeats earlier in the layer", () => {
    // Two crowded rows whose first key carries the same id as an earlier key —
    // the routine case, since a row often begins with a `T_BLANK`/`T_SPACER`.
    // A bare address would send `resolveKeyAddress` to row 0's key, in an
    // uncrowded row, and the studio's `trimRow` handler navigates purely off it.
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [{ keys: letters(4) }, { keys: letters(11) }, { keys: letters(13) }],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    const findings = findCrowdedTouchRows(layout);
    expect(findings.map((f) => f.address)).toEqual([
      touchKeyAddress("phone", "default", "U_61", 1),
      touchKeyAddress("phone", "default", "U_61", 2),
    ]);
    // The fix's own address is the same one — the studio reads it, not the finding's.
    expect(findings.map((f) => (f.fixes[0] as TrimRowFix).address)).toEqual(
      findings.map((f) => f.address),
    );
  });

  it("resolves an occurrence-bearing anchor back to the crowded row's own key", () => {
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            { id: "default", rows: [{ keys: letters(4) }, { keys: letters(11) }] },
          ],
        },
      ],
      nodeIds: [],
    };
    const finding = findCrowdedTouchRows(layout)[0];
    const parts = parseTouchKeyAddress(finding?.address ?? "");
    expect(parts).toBeDefined();
    expect(resolveKeyAddress(layout, parts!)?.rowIndex).toBe(1);
  });

  it("reports each offending row with its own index and leaves compliant rows alone", () => {
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [{ keys: letters(4) }, { keys: letters(11) }, { keys: letters(13) }],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    const findings = findCrowdedTouchRows(layout);
    expect(findings.map((f) => f.fields.rowIndex)).toEqual([1, 2]);
    expect(findings.map((f) => (f.fixes[0] as TrimRowFix).overBy)).toEqual([1, 3]);
  });

  it("reports nothing for an empty row rather than throwing on a missing anchor", () => {
    const layout: TouchLayoutIR = {
      platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: [] }] }] }],
      nodeIds: [],
    };
    expect(findCrowdedTouchRows(layout)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findKeycapMismatches — the engine-side sibling of the occurrence-bearing
// addresses every contracts detector now builds. Its `setKeycap` fix MUTATES
// the key at its address, so a bare address for a repeated id would relabel
// the wrong copy.
// ---------------------------------------------------------------------------

describe("findKeycapMismatches addresses the copy it found", () => {
  it("names the occurrence when the mismatched key's id repeats in the layer", () => {
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    // Correctly labelled — no finding, but it still counts.
                    key("T_A", { sp: 0, output: "a", text: "a" }),
                    // Same id, stale keycap: this is the one to relabel.
                    key("T_A", { sp: 0, output: "a", text: "z" }),
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    const findings = findKeycapMismatches({
      ir: { raw: [] } as unknown as Parameters<typeof findKeycapMismatches>[0]["ir"],
      layout,
      ruleIndex: emptyRuleIndex(),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.address).toBe(touchKeyAddress("phone", "default", "T_A", 1));
    expect((findings[0]?.fixes[0] as { address: string }).address).toBe(
      touchKeyAddress("phone", "default", "T_A", 1),
    );
  });
});

describe("findCrowdedTouchRows — degenerate input", () => {
  it("reports nothing for an empty row rather than throwing on a missing anchor", () => {
    const layout: TouchLayoutIR = {
      platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: [] }] }] }],
      nodeIds: [],
    };
    expect(findCrowdedTouchRows(layout)).toHaveLength(0);
  });
});
