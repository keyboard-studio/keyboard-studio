/**
 * Unit tests for keyGridViewModel (spec 058 T063).
 *
 * All cases run against the ONE shared, deliberately defective fixture
 * (`makeTouchKeyRuleJoinFixture` / `makeTouchKeyRuleJoinLayout`, T013) — per
 * that fixture's own module doc, "add cases here; do not fork it." No second
 * fixture is introduced.
 *
 * Grouped:
 *   1. Geometry defaults + `slackPct` arithmetic (FR-022, FR-039)
 *   2. `producedChars` via the join (T014) — the mark key, its `K_` sibling,
 *      the `U_` self-output near-miss, and the multi-char case
 *   3. Annotation counts (longpress / multitap / flick)
 *   4. The `findings` seam (map-lookup by address, default `[]`)
 *   5. Purity: inputs unmutated, same inputs -> deeply-equal output
 *   6. Selector misses return `undefined`, never throw
 */

import { describe, expect, it } from "vitest";

import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import {
  makeTouchKeyRuleJoinFixture,
  TOUCH_JOIN_IDS,
  TOUCH_JOIN_LAYERS,
  TOUCH_JOIN_PRODUCED,
} from "@keyboard-studio/contracts/fixtures";
import { touchKeyAddress } from "@keyboard-studio/engine";

import {
  buildKeyGridViewModel,
  DEFAULT_KEY_PAD_PCT,
  DEFAULT_KEY_WIDTH_PCT,
  type KeyGridCellViewModel,
  type TouchKeyFinding,
} from "./keyGridViewModel.js";

const PHONE = "phone";

function fixtureLayout() {
  return makeTouchKeyRuleJoinFixture().touchLayout!;
}

function fixtureIndex() {
  return buildTouchKeyRuleIndex(makeTouchKeyRuleJoinFixture());
}

function cellFor(
  keys: readonly KeyGridCellViewModel[],
  id: string,
): KeyGridCellViewModel {
  const cell = keys.find((k) => k.id === id);
  expect(cell).toBeDefined();
  return cell!;
}

// ---------------------------------------------------------------------------
// 1. Geometry defaults + slackPct arithmetic
// ---------------------------------------------------------------------------

describe("geometry — the 100-unit model", () => {
  it("defaults padPct/widthPct for every key the fixture leaves unset", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    expect(vm).toBeDefined();
    for (const row of vm!.rows) {
      for (const key of row.keys) {
        expect(key.widthPct).toBe(DEFAULT_KEY_WIDTH_PCT);
        expect(key.padPct).toBe(DEFAULT_KEY_PAD_PCT);
      }
    }
  });

  it("computes slackPct as the gap to the WIDEST row in the layer", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    expect(vm).toBeDefined();

    const perKey = DEFAULT_KEY_WIDTH_PCT + DEFAULT_KEY_PAD_PCT;
    const rowCounts = vm!.rows.map((r) => r.keys.length);
    // The fixture's phone/default layer: rows of 4, 4, 4, 7 keys (no key in
    // it carries an explicit width/pad — see the fixture's own module doc).
    expect(rowCounts).toEqual([4, 4, 4, 7]);

    const rowTotals = rowCounts.map((n) => n * perKey);
    const max = Math.max(...rowTotals);
    vm!.rows.forEach((row, i) => {
      expect(row.slackPct).toBe(max - rowTotals[i]!);
    });
    // The widest row (7 keys) itself has zero slack.
    expect(vm!.rows[3]!.slackPct).toBe(0);
  });

  it("a single-key layer has zero slack", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.shift,
    });
    expect(vm).toBeDefined();
    expect(vm!.rows).toHaveLength(1);
    expect(vm!.rows[0]!.slackPct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. producedChars via the join
// ---------------------------------------------------------------------------

describe("producedChars — via the rule join, plus self-output primitives", () => {
  it("a rule-only-output key (T_0300) is credited via the join alone", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    const row = vm!.rows[0]!;
    const mark = cellFor(row.keys, TOUCH_JOIN_IDS.mark);
    expect(mark.producedChars).toEqual([TOUCH_JOIN_PRODUCED.mark]);
  });

  it("the K_ physical-key sibling is credited identically via the join", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    const row = vm!.rows[0]!;
    const physical = cellFor(row.keys, TOUCH_JOIN_IDS.physicalMark);
    expect(physical.producedChars).toEqual([TOUCH_JOIN_PRODUCED.mark]);
  });

  it("multi-char output is credited as the join's deduped per-codepoint set", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    const row = vm!.rows[0]!;
    const multiChar = cellFor(row.keys, TOUCH_JOIN_IDS.multiChar);
    // "FCFA" per-codepoint deduped -> {F, C, A}, matching touch-key-rule-join's
    // own role-matrix test for this exact fixture key.
    expect(new Set(multiChar.producedChars)).toEqual(
      new Set([...new Set(TOUCH_JOIN_PRODUCED.multiChar)]),
    );
  });

  it("a self-outputting U_ near-miss with NO rule is credited via decode, not the join", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    // orphanNearMiss lives in the 4th row alongside transition/opaque/etc.
    const row = vm!.rows[3]!;
    const nearMiss = cellFor(row.keys, TOUCH_JOIN_IDS.orphanNearMiss);
    expect(nearMiss.producedChars).toEqual([TOUCH_JOIN_PRODUCED.orphan]);
  });

  it("a ruleless sentinel blank (sp:9) never credits its keycap text", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    const row = vm!.rows[1]!;
    const blank = cellFor(row.keys, TOUCH_JOIN_IDS.blank);
    expect(blank.producedChars).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Annotation counts
// ---------------------------------------------------------------------------

describe("annotations — longpress / multitap / flick counts", () => {
  it("counts sk[] and flick{} on the longpress host, and zero multitap", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    const row = vm!.rows[1]!;
    const host = cellFor(row.keys, TOUCH_JOIN_IDS.longpressHost);
    expect(host.annotations).toEqual({ longpress: 2, multitap: 0, flick: 1 });
  });

  it("an ordinary key with no sub-entries reports all-zero annotations", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    const row = vm!.rows[0]!;
    const mark = cellFor(row.keys, TOUCH_JOIN_IDS.mark);
    expect(mark.annotations).toEqual({ longpress: 0, multitap: 0, flick: 0 });
  });
});

// ---------------------------------------------------------------------------
// 4. The findings seam
// ---------------------------------------------------------------------------

describe("findings — the Phase 9 seam", () => {
  it("defaults every cell's findings to [] when no map is supplied", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    for (const row of vm!.rows) {
      for (const key of row.keys) {
        expect(key.findings).toEqual([]);
      }
    }
  });

  it("looks a cell's findings up by its OWN address from findingsByAddress", () => {
    const markAddress = touchKeyAddress(PHONE, TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.mark);
    const planted: TouchKeyFinding = {
      code: "dead-t-key",
      severity: "warning",
      address: markAddress,
      fields: { keyId: TOUCH_JOIN_IDS.mark },
      fixes: [],
    };
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
      findingsByAddress: new Map([[markAddress, [planted]]]),
    });
    const row = vm!.rows[0]!;
    expect(cellFor(row.keys, TOUCH_JOIN_IDS.mark).findings).toEqual([planted]);
    // A sibling on the same row that was NOT planted stays empty.
    expect(cellFor(row.keys, TOUCH_JOIN_IDS.multiChar).findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Purity
// ---------------------------------------------------------------------------

describe("purity", () => {
  it("does not mutate its inputs", () => {
    const layout = fixtureLayout();
    const ruleIndex = fixtureIndex();
    const beforeLayout = structuredClone(layout);

    buildKeyGridViewModel({ layout, ruleIndex, platform: PHONE, layerId: TOUCH_JOIN_LAYERS.default });

    expect(layout).toEqual(beforeLayout);
  });

  it("produces deeply-equal (not reference-equal) output for equal inputs", () => {
    const layout = fixtureLayout();
    const ruleIndex = fixtureIndex();

    const first = buildKeyGridViewModel({
      layout,
      ruleIndex,
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    const second = buildKeyGridViewModel({
      layout,
      ruleIndex,
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first!.rows).not.toBe(second!.rows);
  });
});

// ---------------------------------------------------------------------------
// 6. Selector misses
// ---------------------------------------------------------------------------

describe("unresolvable selectors", () => {
  it("returns undefined for an unknown platform, never throws", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: "no-such-platform",
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    expect(vm).toBeUndefined();
  });

  it("returns undefined for an unknown layer, never throws", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: "no-such-layer",
    });
    expect(vm).toBeUndefined();
  });
});
