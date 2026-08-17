/**
 * Unit tests for touchCoverage (spec 035, FR-008/SC-003).
 *
 * Locks the pattern behind the contract, not just one instance:
 *   - each producer mechanism (text/output, sk, flick, multitap) counts
 *   - layer reachability (default, nextlayer chain, cycle guard, unreachable)
 *   - NFC/NFD normalization
 *   - star-labels are never producers
 *   - exactly-once reporting + fully-covered empty case
 */

import fs from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import { touchCoverage } from "./touchCoverage.js";
import type {
  TouchKeyIR,
  TouchKeyRuleIndex,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { parseTouchLayout } from "../codec/parse-touch.js";

/** Build a single TouchKeyIR for use in test layouts. */
function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, ...overrides };
}

/** Build a TouchLayoutIR with a single "phone" platform from the given layers. */
function makeLayout(layers: TouchLayoutIR["platforms"][number]["layers"]): TouchLayoutIR {
  return { platforms: [{ id: "phone", layers }], nodeIds: [] };
}

describe("touchCoverage", () => {
  it("reports an orphaned inventory char exactly once", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
    ]);

    const result = touchCoverage(layout, ["a", "z", "z"]);

    expect(result.uncovered).toEqual(["z", "z"]);
  });

  it("counts coverage via an sk (longpress) entry", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_A", {
                text: "a",
                sk: [makeKey("K_A_acute", { text: "á" })],
              }),
            ],
          },
        ],
      },
    ]);

    const result = touchCoverage(layout, ["á"]);

    expect(result.uncovered).toEqual([]);
  });

  it("counts coverage via a flick[direction] entry", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_A", {
                text: "a",
                flick: { ne: makeKey("K_A_ne", { text: "â" }) },
              }),
            ],
          },
        ],
      },
    ]);

    const result = touchCoverage(layout, ["â"]);

    expect(result.uncovered).toEqual([]);
  });

  it("counts coverage via a multitap entry", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_A", {
                text: "a",
                multitap: [makeKey("K_A_mt", { text: "ã" })],
              }),
            ],
          },
        ],
      },
    ]);

    const result = touchCoverage(layout, ["ã"]);

    expect(result.uncovered).toEqual([]);
  });

  it("marks a char on a layer with no nextlayer chain from default as uncovered", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
      // "shift" is never referenced by any nextlayer from "default".
      { id: "shift", rows: [{ keys: [makeKey("K_A_shift", { text: "A" })] }] },
    ]);

    const result = touchCoverage(layout, ["A"]);

    expect(result.uncovered).toEqual(["A"]);
  });

  it("counts a nextlayer-reachable layer's chars as covered", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_SHIFT", { text: "*Shift*", nextlayer: "shift" })] }],
      },
      { id: "shift", rows: [{ keys: [makeKey("K_A_shift", { text: "A" })] }] },
    ]);

    const result = touchCoverage(layout, ["A"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not hang on a cycle in nextlayer references", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_TO_SHIFT", { text: "*Shift*", nextlayer: "shift" })] }],
      },
      {
        id: "shift",
        rows: [
          {
            keys: [
              makeKey("K_A_shift", { text: "A" }),
              makeKey("K_TO_DEFAULT", { text: "*Default*", nextlayer: "default" }),
            ],
          },
        ],
      },
    ]);

    const result = touchCoverage(layout, ["A"]);

    expect(result.uncovered).toEqual([]);
  });

  it("covers an NFC inventory char from an NFD-stored layout string", () => {
    // "e" + combining acute accent (U+0065 U+0301), NFD form of "é".
    const nfdText = "é";
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_E_ACUTE", { text: nfdText })] }] },
    ]);

    const result = touchCoverage(layout, ["é"]);

    expect(result.uncovered).toEqual([]);
  });

  it("returns an empty uncovered list when everything is covered", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_A", { text: "a" }), makeKey("K_B", { text: "b" })] }],
      },
    ]);

    const result = touchCoverage(layout, ["a", "b"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not treat a star-label as producing its letters", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_SHIFT", { text: "*Shift*" })] }] },
    ]);

    const result = touchCoverage(layout, ["S"]);

    expect(result.uncovered).toEqual(["S"]);
  });

  it("decodes a U_XXXX key id into the char it encodes", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("U_00E7")] }] },
    ]);

    const result = touchCoverage(layout, ["ç"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not treat a spacer key (sp:10) as a producer", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("T_sp", { text: "a", sp: 10 })] }],
      },
    ]);

    const result = touchCoverage(layout, ["a"]);

    expect(result.uncovered).toEqual(["a"]);
  });
});

// ---------------------------------------------------------------------------
// SC-001 CANARY — the real sil_cameroon_qwerty keyboard (spec 063 T032).
//
// Skip-if-absent, following the established `KEYBOARDS_ROOT` + `fs.existsSync`
// pattern (see applyTouchAssignmentsToRawJson.test.ts): the sibling
// `../keyboards` corpus is not present in every checkout, and a test that
// hard-failed on its absence would make the suite unrunnable there.
//
// This is the ONE place a real-corpus number is pinned for coverage. Corpus-wide
// aggregate figures stay narrative and are deliberately never asserted — see
// tasks.md "Not silently capped".
// ---------------------------------------------------------------------------

const KEYBOARDS_ROOT = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards",
);
const QWERTY_DIR = path.join(KEYBOARDS_ROOT, "release/sil/sil_cameroon_qwerty/source");
const QWERTY_KMN = path.join(QWERTY_DIR, "sil_cameroon_qwerty.kmn");
const QWERTY_TOUCH = path.join(QWERTY_DIR, "sil_cameroon_qwerty.keyman-touch-layout");
const qwertyPresent = fs.existsSync(QWERTY_KMN) && fs.existsSync(QWERTY_TOUCH);

/**
 * The combining marks the keyboard produces from a `T_*`-KEYED rule.
 *
 * Deliberately not "every combining mark any rule produces" — that set is 15 on
 * this keyboard, because U+0323 is emitted by a rule keyed on something other
 * than a `T_` touch key and so was never part of the touch under-credit defect.
 * The fourteen below are exactly the marks whose only producer is a `T_XXXX`
 * touch key, which is also exactly the count of layout keys carrying a
 * dotted-circle keycap. Measuring the wider set would make the SC-001 assertion
 * quietly about a different population than the criterion names.
 */
function marksFromTouchKeyRules(ruleIndex: TouchKeyRuleIndex): string[] {
  const marks = new Set<string>();
  for (const [normalizedId, bindings] of ruleIndex.byId) {
    if (!normalizedId.startsWith("T_")) continue;
    for (const binding of bindings) {
      for (const ch of binding.produced) {
        if (COMBINING_MARK_RE.test(ch)) marks.add(ch);
      }
    }
  }
  return [...marks].sort();
}

const COMBINING_MARK_RE = /^[\p{Mn}\p{Mc}\p{Me}]$/u;

describe.skipIf(!qwertyPresent)("SC-001 — sil_cameroon_qwerty combining marks read as covered", () => {
  function load() {
    const { ir } = parse(fs.readFileSync(QWERTY_KMN, "utf8"), "sil_cameroon_qwerty");
    const layout = parseTouchLayout(fs.readFileSync(QWERTY_TOUCH, "utf8"));
    return { ir, layout, ruleIndex: buildTouchKeyRuleIndex(ir) };
  }

  it("pins FOURTEEN marks produced by T_-keyed rules, so drift is caught", () => {
    const { ruleIndex } = load();
    expect(marksFromTouchKeyRules(ruleIndex)).toHaveLength(14);
  });

  it("reads EVERY one of the fourteen as covered once the rule index is threaded", () => {
    // THE US1 DEFECT, on the real file. Each mark lives on a `T_XXXX` touch key
    // whose keycap is a dotted circle plus the mark, and whose output exists only
    // in a `.kmn` rule — so the pre-058 layout-only walk credited none of them.
    const { layout, ruleIndex } = load();
    const marks = marksFromTouchKeyRules(ruleIndex);
    expect(touchCoverage(layout, marks, { ruleIndex }).uncovered).toEqual([]);
  });

  it("the FR-008 completion gate therefore does not block on them", () => {
    // The same call and the same predicate the gate itself applies.
    const { layout, ruleIndex } = load();
    const marks = marksFromTouchKeyRules(ruleIndex);
    expect(touchCoverage(layout, marks, { ruleIndex }).uncovered.length > 0).toBe(false);
  });

  it("is genuinely fixing something: with NEITHER additive credit they are uncovered", () => {
    // Guards against the assertion above passing for an unrelated reason. With no
    // rule index and no dotted-circle strip the marks are invisible — which is
    // exactly the state the studio shipped before this feature.
    const { layout, ruleIndex } = load();
    const marks = marksFromTouchKeyRules(ruleIndex);
    const { uncovered } = touchCoverage(layout, marks, { stripDottedCircle: false });
    expect(uncovered.length).toBeGreaterThan(0);
  });

  it("records which additive credit does the work, so a later cleanup stays honest", () => {
    // The dotted-circle strip is an independent safety net: on this keyboard the
    // keycaps ARE dotted circle plus mark, so the strip alone already covers
    // them. Pinning the relationship means a future "the strip is redundant now"
    // change has to confront that it is the fallback for keyboards whose rules we
    // cannot read.
    const { layout, ruleIndex } = load();
    const marks = marksFromTouchKeyRules(ruleIndex);
    const stripOnly = touchCoverage(layout, marks, {}).uncovered.length;
    const neither = touchCoverage(layout, marks, { stripDottedCircle: false }).uncovered.length;
    const indexOnly = touchCoverage(layout, marks, {
      ruleIndex,
      stripDottedCircle: false,
    }).uncovered.length;
    expect(neither).toBe(14);
    expect(stripOnly).toBe(0);
    expect(indexOnly).toBe(0);
  });
});
