/**
 * Unit tests for `checkKeyEditRejections` (spec 058 T118; FR-045, FR-040).
 *
 * Organised by the three reasons, because each rests on a different fact and
 * therefore has a different downgrade behaviour — which is the substance of the
 * requirement, not an implementation detail:
 *
 *   1. `invalid-identifier` (0x05A) — a fact about the id's spelling. Always a
 *      hard block, and short-circuits the other two.
 *   2. `in-layer-id-collision` — a fact about the LAYOUT, which is fully
 *      visible, so an opaque `.kmn` fragment must NOT soften it.
 *   3. `would-create-dead-key` — a fact about the RULES, which an opaque
 *      fragment can hide, so this one (and only this one) downgrades to
 *      warn-and-confirm.
 *
 * The negative cases carry as much weight as the positive ones here: a guard
 * that refuses legitimate edits is worse than no guard, since the author cannot
 * work around it. Every exemption the detector honours
 * (`nextlayer`, a frame label, a declared `output`, a `U_` id, a sentinel id, a
 * non-interactive `sp`) has its own case below.
 */

import { describe, it, expect } from "vitest";
import type { TouchKeyIR, TouchKeyRuleBinding, TouchKeyRuleIndex, TouchLayoutIR } from "@keyboard-studio/contracts";
import { normalizeTouchKeyId } from "@keyboard-studio/contracts";
import { checkKeyEditRejections, type UnsequencedKeyEditOperation } from "./keyEditOps.js";
import { touchKeyAddress } from "./touchKeyAddress.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function key(id: string, extra: Partial<Omit<TouchKeyIR, "nodeId" | "id">> = {}): TouchKeyIR {
  return { nodeId: `n-${id}`, id, ...extra };
}

/** One platform ("phone"), one layer ("default"), one row. */
function layoutWith(...keys: readonly TouchKeyIR[]): TouchLayoutIR {
  return {
    platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: [...keys] }] }] }],
    nodeIds: [],
  };
}

function addr(keyId: string): string {
  return touchKeyAddress("phone", "default", keyId);
}

function emptyRuleIndex(opaqueFragmentCount = 0): TouchKeyRuleIndex {
  return { byId: new Map(), spellings: new Map(), producingIds: new Set(), opaqueFragmentCount };
}

function ruleIndexWithBinding(keyId: string): TouchKeyRuleIndex {
  const normalized = normalizeTouchKeyId(keyId);
  const binding: TouchKeyRuleBinding = {
    ruleNodeId: "rule#1",
    groupName: "main",
    usingKeys: true,
    keyIdAsWritten: keyId,
    modifiers: [],
    role: "produces",
    produced: ["x"],
    contextGuarded: false,
  };
  return {
    byId: new Map([[normalized, [binding]]]),
    spellings: new Map([[normalized, [keyId]]]),
    producingIds: new Set([normalized]),
    opaqueFragmentCount: 0,
  };
}

function renameTo(fromId: string, toId: string): UnsequencedKeyEditOperation {
  return { kind: "rename", address: addr(fromId), toId };
}

// ---------------------------------------------------------------------------
// 1. invalid-identifier (0x05A)
// ---------------------------------------------------------------------------

describe("checkKeyEditRejections — invalid-identifier (0x05A)", () => {
  const layout = layoutWith(key("T_A", { sp: 0 }));

  it.each([
    ["a leading digit", "9NINE"],
    ["a space", "T_MY KEY"],
    ["punctuation", "T_a-b"],
    ["an empty id", ""],
  ])("hard-blocks %s", (_label, badId) => {
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", badId), ruleIndexWithBinding(badId));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.rejections).toHaveLength(1);
    expect(verdict.rejections[0]?.reason).toBe("invalid-identifier");
    // Never confirmable: the id's own spelling is not something an opaque
    // fragment can change.
    expect(verdict.rejections[0]?.confirmable).toBe(false);
  });

  it("stays a hard block even with opaque fragments present", () => {
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "9NINE"), emptyRuleIndex(3));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.rejections[0]?.confirmable).toBe(false);
  });

  it("short-circuits: one typo yields one reason, not three", () => {
    // `9NINE` would ALSO collide (a `9NINE` key exists) and be ruleless — but
    // reporting three reasons for one typo reads as three separate problems.
    const colliding = layoutWith(key("T_A", { sp: 0 }), key("9NINE", { sp: 0 }));
    const verdict = checkKeyEditRejections(colliding, renameTo("T_A", "9NINE"), emptyRuleIndex());
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.rejections.map((r) => r.reason)).toEqual(["invalid-identifier"]);
  });

  it("accepts a leading underscore and digits after the first character", () => {
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "_T_0301x9"), ruleIndexWithBinding("_T_0301x9"));
    expect(verdict.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. in-layer-id-collision
// ---------------------------------------------------------------------------

describe("checkKeyEditRejections — in-layer-id-collision", () => {
  it("hard-blocks renaming onto an id another key on the layer already has", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }), key("T_B", { sp: 0 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_B"), ruleIndexWithBinding("T_B"));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.rejections.map((r) => r.reason)).toEqual(["in-layer-id-collision"]);
    expect(verdict.rejections[0]?.confirmable).toBe(false);
  });

  it("does NOT downgrade under opaque fragments — the layout is fully visible", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }), key("T_B", { sp: 0 }));
    const index = ruleIndexWithBinding("T_B");
    const verdict = checkKeyEditRejections(
      layout,
      renameTo("T_A", "T_B"),
      { ...index, opaqueFragmentCount: 7 },
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const collision = verdict.rejections.find((r) => r.reason === "in-layer-id-collision");
    expect(collision?.confirmable).toBe(false);
  });

  it("collides case-insensitively, matching kmcmplib interning", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }), key("T_beta", { sp: 0 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_BETA"), ruleIndexWithBinding("T_BETA"));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.rejections.map((r) => r.reason)).toContain("in-layer-id-collision");
  });

  it("does not collide with a key on a DIFFERENT layer", () => {
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            { id: "default", rows: [{ keys: [key("T_A", { sp: 0 })] }] },
            { id: "shift", rows: [{ keys: [key("T_B", { sp: 0 })] }] },
          ],
        },
      ],
      nodeIds: [],
    };
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_B"), ruleIndexWithBinding("T_B"));
    expect(verdict.ok).toBe(true);
  });

  it("does not treat the key's own current id as a collision", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_A"), ruleIndexWithBinding("T_A"));
    expect(verdict.ok).toBe(true);
  });

  it("exempts sentinel ids — several T_BLANK keys on one layer is the idiom", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }), key("T_BLANK", { sp: 9 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_BLANK"), emptyRuleIndex());
    expect(verdict.ok).toBe(true);
  });

  it("exempts a non-interactive resulting sp — a spacer's id is never looked up", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }), key("T_B", { sp: 0 }));
    const op: UnsequencedKeyEditOperation = {
      kind: "set",
      address: addr("T_A"),
      fields: { id: "T_B", sp: 10 },
    };
    const verdict = checkKeyEditRejections(layout, op, emptyRuleIndex());
    expect(verdict.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. would-create-dead-key
// ---------------------------------------------------------------------------

describe("checkKeyEditRejections — would-create-dead-key", () => {
  it("hard-blocks a T_ id with no rule when the join can see the whole .kmn", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_NOTHING"), emptyRuleIndex(0));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.rejections.map((r) => r.reason)).toEqual(["would-create-dead-key"]);
    expect(verdict.rejections[0]?.confirmable).toBe(false);
  });

  it("downgrades to warn-and-confirm when an opaque fragment could hide the rule", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_NOTHING"), emptyRuleIndex(1));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.rejections[0]?.confirmable).toBe(true);
  });

  it("downgrades when no rule index is supplied at all — absence cannot be proven", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_NOTHING"));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.rejections[0]?.confirmable).toBe(true);
  });

  it("allows a T_ id that a rule already binds", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_WIRED"), ruleIndexWithBinding("T_WIRED"));
    expect(verdict.ok).toBe(true);
  });

  it("allows a U_ id — it self-outputs and needs no rule", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "U_0301"), emptyRuleIndex());
    expect(verdict.ok).toBe(true);
  });

  it("allows a K_ id — a physical key exists regardless of any rule", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "K_QUOTE"), emptyRuleIndex());
    expect(verdict.ok).toBe(true);
  });

  it("allows a reserved/auto-minted prefix — never expected to carry a rule", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_new_1"), emptyRuleIndex());
    expect(verdict.ok).toBe(true);
  });

  it("allows a key that carries nextlayer — it does its job without a rule", () => {
    const layout = layoutWith(key("T_A", { sp: 0, nextlayer: "shift" }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_SWITCH"), emptyRuleIndex());
    expect(verdict.ok).toBe(true);
  });

  it("allows a *frame* label — its caption comes from Keyman's string table", () => {
    const layout = layoutWith(key("T_A", { sp: 0, text: "*Shift*" }));
    const verdict = checkKeyEditRejections(layout, renameTo("T_A", "T_FRAME"), emptyRuleIndex());
    expect(verdict.ok).toBe(true);
  });

  it("allows a non-interactive resulting sp — a blank key cannot be dead", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const op: UnsequencedKeyEditOperation = {
      kind: "set",
      address: addr("T_A"),
      fields: { id: "T_HIDDEN", sp: 9 },
    };
    const verdict = checkKeyEditRejections(layout, op, emptyRuleIndex());
    expect(verdict.ok).toBe(true);
  });

  it("allows an `add` that declares its own output — it types directly, no rule needed", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const op: UnsequencedKeyEditOperation = {
      kind: "add",
      address: addr("T_A"),
      position: "after",
      key: { id: "T_NEWONE", text: "ɛ", output: "ɛ", sp: 0 },
    };
    const verdict = checkKeyEditRejections(layout, op, emptyRuleIndex());
    expect(verdict.ok).toBe(true);
  });

  it("blocks an `add` of a bare T_ key with neither rule nor output", () => {
    const layout = layoutWith(key("T_A", { sp: 0 }));
    const op: UnsequencedKeyEditOperation = {
      kind: "add",
      address: addr("T_A"),
      position: "after",
      key: { id: "T_NEWONE", text: "x", sp: 0 },
    };
    const verdict = checkKeyEditRejections(layout, op, emptyRuleIndex(0));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.rejections.map((r) => r.reason)).toEqual(["would-create-dead-key"]);
  });
});

// ---------------------------------------------------------------------------
// Operations that author no id, and the sub-key scope note
// ---------------------------------------------------------------------------

describe("checkKeyEditRejections — out of scope by construction", () => {
  const layout = layoutWith(key("T_A", { sp: 0 }));

  it.each<[string, UnsequencedKeyEditOperation]>([
    ["remove", { kind: "remove", address: addr("T_A"), outcome: "reflow" }],
    ["removeSubKey", { kind: "removeSubKey", address: addr("T_A"), sub: { kind: "sk", id: "s1" } }],
    ["a `set` that does not touch `id`", { kind: "set", address: addr("T_A"), fields: { sp: 8 } }],
    [
      "suppress (already screened by applySuppressSemantics)",
      { kind: "suppress", address: addr("T_A"), spClass: 9, sentinelId: "T_BLANK" },
    ],
  ])("passes %s through", (_label, op) => {
    expect(checkKeyEditRejections(layout, op, emptyRuleIndex()).ok).toBe(true);
  });

  it("checks a `setSubKey` id for validity but not for collision or dead-key", () => {
    // Invalid: still refused, because 0x05A fails the compile wherever it sits.
    const bad: UnsequencedKeyEditOperation = {
      kind: "setSubKey",
      address: addr("T_A"),
      sub: { kind: "sk", id: "s1" },
      fields: { id: "9BAD" },
    };
    expect(checkKeyEditRejections(layout, bad, emptyRuleIndex()).ok).toBe(false);

    // Ruleless `T_` on a longpress entry: NOT refused — that is 0x092's
    // reporting scope (`findDeadTouchKeys`), not an edit-time invariant.
    const rulelessSub: UnsequencedKeyEditOperation = {
      kind: "setSubKey",
      address: addr("T_A"),
      sub: { kind: "sk", id: "s1" },
      fields: { id: "T_NOTHING" },
    };
    expect(checkKeyEditRejections(layout, rulelessSub, emptyRuleIndex(0)).ok).toBe(true);
  });

  it("does not refuse an edit whose address does not resolve — that is a reportable orphan, not a dead end", () => {
    const op = renameTo("T_MISSING", "T_ALSO_MISSING");
    expect(checkKeyEditRejections(layout, op, emptyRuleIndex(0)).ok).toBe(true);
  });
});
