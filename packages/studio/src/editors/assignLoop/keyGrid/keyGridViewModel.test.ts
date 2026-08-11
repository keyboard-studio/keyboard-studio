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

import { buildTouchKeyRuleIndex, isSpacerKeyClass } from "@keyboard-studio/contracts";
import {
  makeTouchKeyRuleJoinFixture,
  TOUCH_JOIN_IDS,
  TOUCH_JOIN_LAYERS,
  TOUCH_JOIN_PRODUCED,
} from "@keyboard-studio/contracts/fixtures";
import {
  applyKeyEditsToLayout,
  parseTouchKeyAddress,
  resolveKeyAddress,
  touchKeyAddress,
} from "@keyboard-studio/engine";

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

// ---------------------------------------------------------------------------
// 7. Row metrics and the last-key stretch (spec 061 T018/T024; FR-013, FR-015,
//    FR-017, US2 AS2/AS4)
// ---------------------------------------------------------------------------

/** The layer maximum, exactly as `buildKeyGridViewModel` derives it: the widest row's declared total. */
function layerMaxOf(vm: { rows: readonly { metrics: { rowTotal: number } }[] }): number {
  return Math.max(...vm.rows.map((r) => r.metrics.rowTotal));
}

describe("row metrics (FR-013)", () => {
  function defaultLayerVm() {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    });
    expect(vm).toBeDefined();
    return vm!;
  }

  it("gives every row metrics computed from DECLARED widths", () => {
    const vm = defaultLayerVm();
    const perKey = DEFAULT_KEY_WIDTH_PCT + DEFAULT_KEY_PAD_PCT;
    for (const row of vm.rows) {
      // Width and padding count EVERY key — a spacer occupies space. The
      // interactive count does not: the fixture's default layer carries a
      // `T_BLANK` (see its module doc), which is exactly the difference the
      // crowding threshold is applied to.
      expect(row.metrics.keyWidthTotal).toBe(row.keys.length * DEFAULT_KEY_WIDTH_PCT);
      expect(row.metrics.padTotal).toBe(row.keys.length * DEFAULT_KEY_PAD_PCT);
      expect(row.metrics.rowTotal).toBe(row.keys.length * perKey);
      expect(row.metrics.interactiveKeyCount).toBe(
        row.keys.filter((k) => !isSpacerKeyClass(k.sp)).length,
      );
    }
  });

  it("excludes at least one spacer somewhere in the layer — the count is not just keys.length", () => {
    const vm = defaultLayerVm();
    const totalKeys = vm.rows.reduce((n, r) => n + r.keys.length, 0);
    const totalInteractive = vm.rows.reduce((n, r) => n + r.metrics.interactiveKeyCount, 0);
    expect(totalInteractive).toBeLessThan(totalKeys);
  });

  it("keeps rowTotal and slackPct consistent — every row reaches the layer maximum", () => {
    const vm = defaultLayerVm();
    const max = layerMaxOf(vm);
    for (const row of vm.rows) {
      expect(row.metrics.rowTotal + row.slackPct).toBe(max);
    }
  });

  it("reports the phone maximum, and flags the fixture's rows as within it", () => {
    const vm = defaultLayerVm();
    for (const row of vm.rows) {
      expect(row.metrics.platformMaxKeys).toBe(10);
      expect(row.metrics.overMaximumBy).toBeUndefined();
    }
  });
});

describe("isLastInRow (FR-012)", () => {
  it("marks exactly the final cell of every row, and no other", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    })!;
    for (const row of vm.rows) {
      const flags = row.keys.map((k) => k.isLastInRow);
      expect(flags.filter(Boolean)).toHaveLength(1);
      expect(flags[flags.length - 1]).toBe(true);
    }
  });

  it("marks the only cell of a single-key row", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.shift,
    })!;
    expect(vm.rows[0]!.keys.every((k) => k.isLastInRow)).toBe(true);
    expect(vm.rows[0]!.keys).toHaveLength(1);
  });
});

describe("adding a key to the longest row (FR-016, FR-017, US2 AS4)", () => {
  /** The layer's widest row, and the fixture's own default layer, after adding one key to it. */
  function afterAddToLongestRow() {
    const before = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    })!;

    // The widest row is the fixture's 7-key row (index 3). Add after its last
    // key, through the REAL applier — so this also pins T021's defaults.
    const longestRowIndex = before.rows.reduce(
      (best, row, i) => (row.metrics.rowTotal > before.rows[best]!.metrics.rowTotal ? i : best),
      0,
    );
    const anchor = before.rows[longestRowIndex]!.keys.at(-1)!;
    const { layout } = applyKeyEditsToLayout(fixtureLayout(), [
      {
        seq: 1,
        address: anchor.address,
        kind: "add",
        position: "after",
        key: { id: "U_007A", text: "z", sp: 0 },
      },
    ]);
    const after = buildKeyGridViewModel({
      layout,
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    })!;
    return { before, after, longestRowIndex };
  }

  it("takes the standard default width and padding, never a split of the anchor's", () => {
    const { before, after, longestRowIndex } = afterAddToLongestRow();
    const added = after.rows[longestRowIndex]!.keys.find((k) => k.id === "U_007A");
    expect(added?.widthPct).toBe(DEFAULT_KEY_WIDTH_PCT);
    expect(added?.padPct).toBe(DEFAULT_KEY_PAD_PCT);
    // The anchor kept its own width — nothing was split off it.
    const anchorBefore = before.rows[longestRowIndex]!.keys.at(-1)!;
    const anchorAfter = after.rows[longestRowIndex]!.keys.find((k) => k.id === anchorBefore.id);
    expect(anchorAfter?.widthPct).toBe(anchorBefore.widthPct);
  });

  it("enlarges the layer maximum rather than normalizing the row", () => {
    const { before, after } = afterAddToLongestRow();
    expect(layerMaxOf(after)).toBe(
      layerMaxOf(before) + DEFAULT_KEY_WIDTH_PCT + DEFAULT_KEY_PAD_PCT,
    );
  });

  it("narrows every key proportionally — each key's share of the layer shrinks", () => {
    const { before, after } = afterAddToLongestRow();
    const maxBefore = layerMaxOf(before);
    const maxAfter = layerMaxOf(after);
    for (const row of after.rows) {
      for (const cell of row.keys) {
        if (cell.id === "U_007A") continue;
        expect(cell.widthPct / maxAfter).toBeLessThan(cell.widthPct / maxBefore);
      }
    }
  });

  it("produces no negative width or padding anywhere (FR-017)", () => {
    const { after } = afterAddToLongestRow();
    for (const row of after.rows) {
      expect(row.slackPct).toBeGreaterThanOrEqual(0);
      for (const cell of row.keys) {
        expect(cell.widthPct).toBeGreaterThan(0);
        expect(cell.padPct).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("clips nothing — every row still reaches exactly the layer maximum", () => {
    const { after } = afterAddToLongestRow();
    const max = layerMaxOf(after);
    for (const row of after.rows) {
      expect(row.metrics.rowTotal + row.slackPct).toBe(max);
    }
  });

  it("leaves every other row's own declared metrics untouched", () => {
    const { before, after, longestRowIndex } = afterAddToLongestRow();
    after.rows.forEach((row, i) => {
      if (i === longestRowIndex) return;
      expect(row.metrics).toEqual(before.rows[i]!.metrics);
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Occurrence-bearing addresses where an id repeats
// ---------------------------------------------------------------------------

describe("addresses — unique per layer even when ids repeat", () => {
  /**
   * Clone the fixture's default layer and stuff its first row with repeated
   * ids, the way a real layout's blank/spacer runs do (the shipped
   * `sil_cameroon_azerty.keyman-touch-layout` has `T_BLANK` twenty-five times
   * and `K_SHIFT` twice inside one tablet layer). The shared fixture is not
   * forked — this reshapes a copy of it, per its "add cases here" rule.
   */
  function layoutWithRepeatedIds() {
    const layout = fixtureLayout();
    const platform = layout.platforms.find((p) => p.id === PHONE)!;
    const layer = platform.layers.find((l) => l.id === TOUCH_JOIN_LAYERS.default)!;
    const blank = { ...layer.rows[0]!.keys[0]!, id: "T_BLANK", sp: 9 };
    return {
      ...layout,
      platforms: layout.platforms.map((p) =>
        p.id !== PHONE
          ? p
          : {
              ...p,
              layers: p.layers.map((l) =>
                l.id !== layer.id
                  ? l
                  : {
                      ...l,
                      // Two rows, so the counter is proved to run row-major
                      // across the LAYER rather than restarting per row.
                      rows: [
                        { keys: [blank, blank, blank] },
                        { keys: [blank, blank] },
                      ],
                    },
              ),
            },
      ),
    };
  }

  it("gives five same-id keys five distinct addresses", () => {
    const vm = buildKeyGridViewModel({
      layout: layoutWithRepeatedIds(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    })!;

    const cells = vm.rows.flatMap((r) => r.keys);
    expect(cells).toHaveLength(5);

    const address = touchKeyAddress(PHONE, TOUCH_JOIN_LAYERS.default, "T_BLANK");
    expect(cells.map((c) => c.address)).toEqual([
      address,
      `${address}#1`,
      `${address}#2`,
      `${address}#3`,
      `${address}#4`,
    ]);
    expect(new Set(cells.map((c) => c.address)).size).toBe(5);
    // Every one of them resolves back to a DIFFERENT key — the point of the
    // whole scheme, and what makes an individual blank selectable.
    const layout = layoutWithRepeatedIds();
    const resolved = cells.map((c) => resolveKeyAddress(layout, parseTouchKeyAddress(c.address)!));
    expect(resolved.every((r) => r !== undefined)).toBe(true);
    expect(new Set(resolved.map((r) => `${r!.rowIndex}:${r!.keyIndex}`)).size).toBe(5);
  });

  // The point of the whole scheme, end to end: an edit addressed at the FOURTH
  // blank must land on the fourth blank. Before occurrences the address resolved
  // to the first every time, so a layer's blanks could not be restored
  // individually — "it is impossible to put one key back into service".
  it("an edit addressed at one repeated key lands on THAT key and no other", () => {
    const layout = layoutWithRepeatedIds();
    const vm = buildKeyGridViewModel({
      layout,
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    })!;

    const cells = vm.rows.flatMap((r) => r.keys);
    const target = cells[3]!;

    const { layout: edited, orphaned } = applyKeyEditsToLayout(layout, [
      { seq: 0, kind: "set", address: target.address, fields: { text: "PICKED" } },
    ]);
    expect(orphaned).toEqual([]);

    const after = buildKeyGridViewModel({
      layout: edited,
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    })!.rows.flatMap((r) => r.keys);

    // Exactly one keycap changed, and it is the one that was addressed. The
    // other four still carry the keycap they were cloned with.
    const before = cells.map((c) => c.keycap);
    expect(after.map((c) => c.keycap)).toEqual([
      before[0]!,
      before[1]!,
      before[2]!,
      "PICKED",
      before[4]!,
    ]);
  });

  // The shared fixture already carries `T_DUP` twice in one layer, on purpose —
  // it is the input to the duplicate-id FINDING (see the fixture's own table).
  // So an unmodified fixture is itself a live case: a duplicate id is a
  // diagnosable condition the author is told about, not a malformed layout the
  // grid may refuse to render. Both facts are asserted together here.
  it("suffixes only the repeats, leaving every unique id's address unsuffixed", () => {
    const vm = buildKeyGridViewModel({
      layout: fixtureLayout(),
      ruleIndex: fixtureIndex(),
      platform: PHONE,
      layerId: TOUCH_JOIN_LAYERS.default,
    })!;

    const cells = vm.rows.flatMap((r) => r.keys);

    // The named example the fixture exists to model, asserted explicitly.
    const duplicates = cells.filter((c) => c.id === TOUCH_JOIN_IDS.duplicate);
    expect(duplicates).toHaveLength(2);
    const bare = touchKeyAddress(PHONE, TOUCH_JOIN_LAYERS.default, TOUCH_JOIN_IDS.duplicate);
    expect(duplicates[0]!.address).toBe(bare);
    expect(duplicates[1]!.address).toBe(`${bare}#1`);

    // The rule itself, stated generically — the fixture carries more than one
    // deliberate duplicate, so enumerating them here would just go stale the
    // next time a case is added to it.
    const seen = new Map<string, number>();
    for (const cell of cells) {
      const n = seen.get(cell.id) ?? 0;
      seen.set(cell.id, n + 1);
      const expected = touchKeyAddress(PHONE, TOUCH_JOIN_LAYERS.default, cell.id, n);
      expect(cell.address).toBe(expected);
    }
    expect(new Set(cells.map((c) => c.address)).size).toBe(cells.length);
  });
});
