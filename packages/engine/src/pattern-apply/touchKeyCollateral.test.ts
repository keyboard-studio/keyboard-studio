/**
 * Unit tests for touchKeyCollateral (spec 063 T104/T105, FR-060/FR-061).
 *
 * Reuses the shared `touchKeyRuleJoin` fixture (`@keyboard-studio/contracts/fixtures`)
 * rather than forking a second one — see that fixture's own module doc ("do not
 * fork it; add cases here"). It already contains:
 *
 *   - `T_0021` (`TOUCH_JOIN_IDS.longpressHost`): text "!", two `sk[]` longpresses
 *     (`U_00A1` "¡", `U_203D` "‽") and a flick (`n` -> `U_2049` "⁉") —
 *     the exact Cameroon shape FR-060 names ("suppressing T_0021 silently
 *     discards the U_00A1 (¡) longpress beneath it").
 *   - `T_0300` (`TOUCH_JOIN_IDS.mark`): keycap "◌̀", with a `.kmn` rule
 *     producing the bare combining mark it keys on — the FR-061 "still
 *     available elsewhere" case. The fixture's `K_QUOTE` carries the SAME
 *     keycap text and the SAME rule ("the K_ half of the same under-credit
 *     defect"), so it is the surviving location both tests below name, and
 *     the rule-index test proves this module's own location search must be
 *     rule-aware: K_QUOTE's keycap text does not equal the bare mark, only
 *     its rule produces it (see the module doc's "why
 *     enumerateTouchMethodsForChar is NOT reused" section).
 *   - `T_0301` (`TOUCH_JOIN_IDS.markShift`): a SHIFT-doubled mark key on its
 *     own `shift` layer, produced nowhere else — the "genuinely unreachable"
 *     case for a `rename` that orphans a rule-bound production.
 *
 * One bespoke, minimal inline layout (`miniIdOnlySubKeyLayout`) covers the one
 * shape the shared fixture does not have: an id-only `sk[]` entry (no `text`),
 * needed to demonstrate `setSubKey` collateral without a keycap-text
 * coincidence masking the loss.
 */

import { describe, expect, it } from "vitest";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import {
  makeTouchKeyRuleJoinFixture,
  makeTouchKeyRuleJoinLayout,
  TOUCH_JOIN_IDS,
  TOUCH_JOIN_LAYERS,
  TOUCH_JOIN_PRODUCED,
} from "@keyboard-studio/contracts/fixtures";
import type { KeyEditOperation } from "./keyEditOps.js";
import { touchFlickAddress, touchKeyAddress, touchSubKeyAddress } from "./touchKeyAddress.js";
import { analyzeKeyEditCollateral, enumerateKeyLinkedOutputs } from "./touchKeyCollateral.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function ruleIndex() {
  return buildTouchKeyRuleIndex(makeTouchKeyRuleJoinFixture());
}

/** One key, `T_HOST`, hosting a single id-only (no `text`) `sk[]` entry. */
function miniIdOnlySubKeyLayout(): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "tablet",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  {
                    nodeId: "k1",
                    id: "T_HOST",
                    text: "!",
                    sk: [{ nodeId: "k1sk1", id: "U_00A1" }],
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
}

// ---------------------------------------------------------------------------
// T104 — enumerateKeyLinkedOutputs
// ---------------------------------------------------------------------------

describe("enumerateKeyLinkedOutputs", () => {
  it("Cameroon T_0021: suppress enumerates the main output plus every sk/multitap/flick sub-key", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const op: KeyEditOperation = {
      kind: "suppress",
      seq: 1,
      address: touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.longpressHost),
      spClass: 10,
      sentinelId: "T_SPACER",
    };

    const outputs = enumerateKeyLinkedOutputs(layout, op);

    expect(outputs.map((o) => o.producedChar).sort()).toEqual(["!", "⁉", "‽", "¡"].sort());
    const byChar = new Map(outputs.map((o) => [o.producedChar, o]));
    expect(byChar.get("!")?.kind).toBe("tap");
    expect(byChar.get("¡")?.kind).toBe("longpress");
    expect(byChar.get("‽")?.kind).toBe("longpress");
    expect(byChar.get("⁉")?.kind).toBe("flick");
    expect(byChar.get("⁉")?.direction).toBe("n");
  });

  it("removeSubKey scopes to the single named sub-entry, not the whole key", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const op: KeyEditOperation = {
      kind: "removeSubKey",
      seq: 1,
      address: touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.longpressHost),
      sub: { kind: "sk", id: "U_00A1" },
    };

    const outputs = enumerateKeyLinkedOutputs(layout, op);

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.producedChar).toBe("¡");
    expect(outputs[0]?.kind).toBe("longpress");
    expect(outputs[0]?.address).toBe(
      touchSubKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.longpressHost, "sk", "U_00A1"),
    );
  });

  it("removeSubKey on a flick entry addresses it via touchFlickAddress", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const op: KeyEditOperation = {
      kind: "removeSubKey",
      seq: 1,
      address: touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.longpressHost),
      sub: { kind: "flick", id: "n" },
    };

    const outputs = enumerateKeyLinkedOutputs(layout, op);

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.producedChar).toBe("⁉");
    expect(outputs[0]?.kind).toBe("flick");
    expect(outputs[0]?.direction).toBe("n");
    expect(outputs[0]?.address).toBe(
      touchFlickAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.longpressHost, "n"),
    );
  });

  it("add never has collateral (nothing pre-existing is touched)", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const op: KeyEditOperation = {
      kind: "add",
      seq: 1,
      address: touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.mark),
      position: "after",
      key: { id: "T_NEW", text: "z", sp: 0 },
    };

    expect(enumerateKeyLinkedOutputs(layout, op)).toEqual([]);
  });

  it("an unresolvable address reports no collateral rather than throwing", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const op: KeyEditOperation = {
      kind: "remove",
      seq: 1,
      address: "phone:default:T_DOES_NOT_EXIST",
      outcome: "reflow",
    };

    expect(() => enumerateKeyLinkedOutputs(layout, op)).not.toThrow();
    expect(enumerateKeyLinkedOutputs(layout, op)).toEqual([]);
  });

  it("a set that does not change id has no collateral", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const op: KeyEditOperation = {
      kind: "set",
      seq: 1,
      address: touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.multiChar),
      fields: { text: "OTHER" },
    };

    expect(enumerateKeyLinkedOutputs(layout, op)).toEqual([]);
  });

  it("setSubKey scopes to the named sub-entry's OWN loss (id-only sub-key, no text)", () => {
    const layout = miniIdOnlySubKeyLayout();
    const op: KeyEditOperation = {
      kind: "setSubKey",
      seq: 1,
      address: touchKeyAddress("tablet", "default", "T_HOST"),
      sub: { kind: "sk", id: "U_00A1" },
      fields: { id: "U_0041" },
    };

    const outputs = enumerateKeyLinkedOutputs(layout, op);

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.producedChar).toBe("¡");
    expect(outputs[0]?.kind).toBe("longpress");
  });
});

// ---------------------------------------------------------------------------
// T105 — analyzeKeyEditCollateral
// ---------------------------------------------------------------------------

describe("analyzeKeyEditCollateral", () => {
  it("Cameroon T_0021: every linked output is unreachable (nothing else produces them)", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const op: KeyEditOperation = {
      kind: "suppress",
      seq: 1,
      address: touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.longpressHost),
      spClass: 10,
      sentinelId: "T_SPACER",
    };

    const report = analyzeKeyEditCollateral(layout, op);

    expect(report.outputs).toHaveLength(4);
    for (const output of report.outputs) {
      expect(output.reachability.status).toBe("unreachable");
    }
    expect(new Set(report.unreachableCharacters)).toEqual(
      new Set(["!", "¡", "‽", "⁉"]),
    );
  });

  it("T_0300: available elsewhere, naming the surviving K_QUOTE location (text-only, no rule index)", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const op: KeyEditOperation = {
      kind: "remove",
      seq: 1,
      address: touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.mark),
      outcome: "reflow",
    };

    // No ruleIndex passed: only the keycap text "◌̀" is visible. The fixture's
    // K_QUOTE ("the K_ half of the same under-credit defect", same row, same
    // keycap text) is the first surviving match in layout order — this is the
    // whole report (under-reports relative to the rule-aware case below,
    // never over-reports — the documented convention for the optional param).
    const report = analyzeKeyEditCollateral(layout, op);

    expect(report.outputs).toHaveLength(1);
    const [entry] = report.outputs;
    expect(entry?.producedChar).toBe("◌̀");
    expect(entry?.reachability.status).toBe("available-elsewhere");
    if (entry?.reachability.status === "available-elsewhere") {
      expect(entry.reachability.survivingLocation.platform).toBe("phone");
      expect(entry.reachability.survivingLocation.layer).toBe(TOUCH_JOIN_LAYERS.default);
      expect(entry.reachability.survivingLocation.id).toBe(
        touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.physicalMark),
      );
    }
    expect(report.unreachableCharacters).toEqual([]);
  });

  it("T_0300 WITH a rule index: the rule-bound mark is ALSO found elsewhere, via K_QUOTE's OWN rule", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const index = ruleIndex();
    const op: KeyEditOperation = {
      kind: "remove",
      seq: 1,
      address: touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.mark),
      outcome: "reflow",
    };

    const report = analyzeKeyEditCollateral(layout, op, index);

    // Now TWO characters are enumerated: the keycap text and the rule-bound
    // mark itself (TOUCH_JOIN_PRODUCED.mark). K_QUOTE's own keycap text
    // ("◌̀") does not equal the bare mark, so `enumerateTouchMethodsForChar`
    // (text/output/decoded-id only, no rule index) could NOT have found a
    // surviving location for the second character — only K_QUOTE's own
    // `.kmn` rule (`rule#physical`, producing the identical mark) makes it
    // visible, which is exactly why this module builds its own rule-aware
    // location search instead of reusing that function.
    const byChar = new Map(report.outputs.map((o) => [o.producedChar, o]));
    expect(byChar.size).toBe(2);

    const markEntry = byChar.get(TOUCH_JOIN_PRODUCED.mark);
    expect(markEntry?.reachability.status).toBe("available-elsewhere");
    if (markEntry?.reachability.status === "available-elsewhere") {
      expect(markEntry.reachability.survivingLocation.platform).toBe("phone");
      expect(markEntry.reachability.survivingLocation.id).toBe(
        touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.physicalMark),
      );
    }
    expect(report.unreachableCharacters).toEqual([]);
  });

  it("rename orphaning a rule-bound production with no surviving copy is unreachable", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const index = ruleIndex();
    const op: KeyEditOperation = {
      kind: "rename",
      seq: 1,
      address: touchKeyAddress("phone", TOUCH_JOIN_LAYERS.shift, TOUCH_JOIN_IDS.markShift),
      toId: "T_0301_RENAMED",
    };

    const report = analyzeKeyEditCollateral(layout, op, index);

    expect(report.outputs).toHaveLength(1);
    const [entry] = report.outputs;
    expect(entry?.producedChar).toBe(TOUCH_JOIN_PRODUCED.markShift);
    expect(entry?.reachability.status).toBe("unreachable");
    expect(report.unreachableCharacters).toEqual([TOUCH_JOIN_PRODUCED.markShift]);
  });

  it("a rename that does not change id reports no collateral", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const op: KeyEditOperation = {
      kind: "rename",
      seq: 1,
      address: touchKeyAddress("phone", TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.mark),
      toId: TOUCH_JOIN_IDS.mark,
    };

    expect(analyzeKeyEditCollateral(layout, op)).toEqual({ outputs: [], unreachableCharacters: [] });
  });

  it("classification excludes the operation's OWN discarded addresses from the elsewhere search", () => {
    // A key whose main output and its own longpress happen to produce the
    // SAME character must not report the longpress as the main tap's
    // "surviving location" (or vice versa) — both are being discarded by the
    // same suppress op.
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "tablet",
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    {
                      nodeId: "k1",
                      id: "T_SELF",
                      text: "x",
                      sk: [{ nodeId: "k1sk1", id: "U_0078" }], // U+0078 = "x"
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
    const op: KeyEditOperation = {
      kind: "suppress",
      seq: 1,
      address: touchKeyAddress("tablet", "default", "T_SELF"),
      spClass: 9,
      sentinelId: "T_BLANK",
    };

    const report = analyzeKeyEditCollateral(layout, op);

    expect(report.outputs).toHaveLength(2);
    for (const output of report.outputs) {
      expect(output.reachability.status).toBe("unreachable");
    }
    expect(report.unreachableCharacters).toEqual(["x"]);
  });
});
