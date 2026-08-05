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
  findHalfDoneSuppressions,
  findLayerSwitchActiveMismatches,
  findMixedSuppressRemove,
  type CompleteSuppressionFix,
  type ReviewKeyFix,
  type SetLayerSwitchSpFix,
} from "./touchKeyDiagnostics.js";
import type { KeyEditOverlay, RemoveKeyOp, SuppressKeyOp } from "./keyEditOps.js";
import { touchKeyAddress } from "./touchKeyAddress.js";

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
