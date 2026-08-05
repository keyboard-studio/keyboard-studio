/**
 * Reachability-view tests (spec 058 T024, contract §8).
 *
 * The no-touch-layout case is the most important test in this file: it is what
 * guarantees a desktop-only keyboard is never penalized, and it is asserted as a
 * DEEP EQUALITY against `buildProducedSet` rather than as a spot check, so the
 * two views cannot drift apart on that path.
 */

import { describe, expect, it } from "vitest";

import {
  makeTouchKeyRuleJoinFixture,
  TOUCH_JOIN_IDS,
  TOUCH_JOIN_PRODUCED,
} from "../fixtures/touchKeyRuleJoin.js";
import { buildProducedSet } from "./producedSet.js";
import {
  buildReachableProducedSet,
  classifyUnreachableReason,
  collectReachableTouchKeyIds,
  collectTouchRuleOrphans,
  isStruckKeyReachable,
} from "./reachableProducedSet.js";

describe("buildReachableProducedSet — the no-touch-layout case", () => {
  it("deep-equals buildProducedSet and reports NO orphans when the IR has no touch layout", () => {
    // Load-bearing: a desktop-only keyboard has no touch layout to be
    // unreachable IN. Any other behaviour would report every rule in the file as
    // orphaned. Asserted as deep equality, not a spot check.
    const ir = makeTouchKeyRuleJoinFixture({ withoutTouchLayout: true });
    const plain = buildProducedSet(ir);
    const result = buildReachableProducedSet(ir);
    expect([...result.reachable].sort()).toEqual([...plain].sort());
    expect(result.orphaned.size).toBe(0);
    expect(result.orphanBindings).toEqual([]);
  });

  it("passes options through unchanged on the no-layout path", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutTouchLayout: true });
    const plain = buildProducedSet(ir, { includeSpace: true });
    const result = buildReachableProducedSet(ir, { includeSpace: true });
    expect([...result.reachable].sort()).toEqual([...plain].sort());
  });
});

describe("buildReachableProducedSet — the orphan delta", () => {
  it("excludes an orphan T_ rule's output from `reachable`", () => {
    // The fixture's `T_03B1` rule pair has no key carrying that id — the layout
    // carries only the self-outputting `U_03B1`. Nothing can type α via that rule.
    const result = buildReachableProducedSet(makeTouchKeyRuleJoinFixture());
    expect(result.reachable.has(TOUCH_JOIN_PRODUCED.orphan)).toBe(false);
  });

  it("reports the orphan's output in `orphaned` — the honest delta", () => {
    const result = buildReachableProducedSet(makeTouchKeyRuleJoinFixture());
    expect(result.orphaned.has(TOUCH_JOIN_PRODUCED.orphan)).toBe(true);
  });

  it("counts a T_ key on an UNREACHABLE LAYER as orphaned too", () => {
    // `T_STRANDED` exists in the layout, but only on a layer nothing switches to.
    const result = buildReachableProducedSet(makeTouchKeyRuleJoinFixture());
    expect(result.reachable.has(TOUCH_JOIN_PRODUCED.stranded)).toBe(false);
    expect(result.orphaned.has(TOUCH_JOIN_PRODUCED.stranded)).toBe(true);
  });

  it("still credits everything reachable — the view narrows, it does not gut", () => {
    const result = buildReachableProducedSet(makeTouchKeyRuleJoinFixture());
    expect(result.reachable.has(TOUCH_JOIN_PRODUCED.mark)).toBe(true);
    expect(result.reachable.has(TOUCH_JOIN_PRODUCED.markShift)).toBe(true);
    expect(result.reachable.has("F")).toBe(true);
    // Store-driven output on a reachable key is credited through the shared walk.
    expect(result.reachable.has("ā")).toBe(true);
  });

  it("`orphaned` is disjoint from `reachable` — a char reachable elsewhere is not orphaned", () => {
    // A false alarm here would be worse than silence: the author would be told a
    // character is unreachable while another key types it perfectly well.
    const ir = makeTouchKeyRuleJoinFixture();
    // Give the orphan's character a second, reachable producer.
    ir.groups[0]!.rules.push({
      nodeId: "rule#alpha-reachable",
      context: [{ kind: "vkey", name: TOUCH_JOIN_IDS.dead, modifiers: [] }],
      output: [{ kind: "char", value: TOUCH_JOIN_PRODUCED.orphan }],
    });
    const result = buildReachableProducedSet(ir);
    expect(result.reachable.has(TOUCH_JOIN_PRODUCED.orphan)).toBe(true);
    expect(result.orphaned.has(TOUCH_JOIN_PRODUCED.orphan)).toBe(false);
    // The unreachable binding is still reported — the RULE is still orphaned even
    // though the CHARACTER is not lost.
    expect(
      result.orphanBindings.some((b) => b.keyIdAsWritten === TOUCH_JOIN_IDS.orphan),
    ).toBe(true);
  });

  it("returns the orphan bindings themselves, which are the reporting deliverable", () => {
    const result = buildReachableProducedSet(makeTouchKeyRuleJoinFixture());
    const orphanIds = new Set(result.orphanBindings.map((b) => b.keyIdAsWritten));
    expect(orphanIds.has(TOUCH_JOIN_IDS.orphan)).toBe(true);
    expect(orphanIds.has(TOUCH_JOIN_IDS.stranded)).toBe(true);
    // Both halves of the orphan pair — guard and producing — are reported, not
    // just the producing one.
    const pair = result.orphanBindings.filter((b) => b.keyIdAsWritten === TOUCH_JOIN_IDS.orphan);
    expect(pair.map((b) => b.role).sort()).toEqual(["guard", "produces"]);
  });
});

describe("reachability predicate — by id prefix", () => {
  it("treats a K_ id as ALWAYS reachable, even when the touch layout omits it", () => {
    // A physical key exists regardless of the touch layout. Penalizing a `K_`
    // rule because the layout omits the key would flag most of the corpus.
    const reachable = new Set<string>();
    expect(isStruckKeyReachable("K_QUOTE", reachable)).toBe(true);
    expect(isStruckKeyReachable("k_quote", reachable)).toBe(true);
  });

  it("credits a K_ rule's output as reachable in the full view", () => {
    const ir = makeTouchKeyRuleJoinFixture();
    // Remove K_QUOTE from every layout so only the "always reachable" rule saves it.
    for (const platform of ir.touchLayout!.platforms) {
      for (const layer of platform.layers) {
        for (const row of layer.rows) {
          row.keys = row.keys.filter((k) => k.id !== TOUCH_JOIN_IDS.physicalMark);
        }
      }
    }
    const result = buildReachableProducedSet(ir);
    const stillFromPhysical = result.orphanBindings.some(
      (b) => b.keyIdAsWritten === TOUCH_JOIN_IDS.physicalMark,
    );
    expect(stillFromPhysical).toBe(false);
  });

  it("requires a T_/U_ id to be carried on a reachable layer", () => {
    const reachable = new Set(["T_0300"]);
    expect(isStruckKeyReachable("T_0300", reachable)).toBe(true);
    expect(isStruckKeyReachable("t_0300", reachable)).toBe(true);
    expect(isStruckKeyReachable("T_03B1", reachable)).toBe(false);
    expect(isStruckKeyReachable("U_03B1", reachable)).toBe(false);
  });
});

describe("layer reachability collection", () => {
  it("follows a nextlayer chain from default and stops at a stranded layer", () => {
    const { reachableIds, allIds } = collectReachableTouchKeyIds(
      makeTouchKeyRuleJoinFixture().touchLayout!,
    );
    // shift is reachable via the frame key; symbol via T_CAM.
    expect(reachableIds.has("T_0301")).toBe(true);
    expect(reachableIds.has("T_SYMFRAME")).toBe(true);
    // stranded is declared but nothing switches to it.
    expect(reachableIds.has("T_STRANDED")).toBe(false);
    // …yet it IS present somewhere, which is what tells the two orphan reasons apart.
    expect(allIds.has("T_STRANDED")).toBe(true);
  });

  it("descends into sk, multitap, and flick sub-keys", () => {
    const { reachableIds } = collectReachableTouchKeyIds(
      makeTouchKeyRuleJoinFixture().touchLayout!,
    );
    expect(reachableIds.has("U_00A1")).toBe(true);
    expect(reachableIds.has("U_203D")).toBe(true);
    expect(reachableIds.has("U_2049")).toBe(true);
  });

  it("unions reachability ACROSS platforms", () => {
    // A key reachable on phone is reachable, full stop. The fixture's tablet
    // platform carries only the mark key; the union must not shrink to it.
    const { reachableIds } = collectReachableTouchKeyIds(
      makeTouchKeyRuleJoinFixture().touchLayout!,
    );
    expect(reachableIds.has("T_0300")).toBe(true);
    expect(reachableIds.has("T_FCFA")).toBe(true);
  });

  it("terminates on a nextlayer cycle", () => {
    // The fixture's symbol layer switches back to default. If the BFS did not use
    // its own reachable set as the visited set this would not return.
    expect(() =>
      collectReachableTouchKeyIds(makeTouchKeyRuleJoinFixture().touchLayout!),
    ).not.toThrow();
  });
});

describe("orphan reasons — absent vs unreachable-layer", () => {
  it("classifies the injected orphan as ABSENT", () => {
    const allIds = new Set(["U_03B1"]);
    expect(classifyUnreachableReason("T_03B1", allIds)).toBe("absent");
  });

  it("classifies the stranded key as UNREACHABLE-LAYER", () => {
    const allIds = new Set(["T_STRANDED"]);
    expect(classifyUnreachableReason("T_STRANDED", allIds)).toBe("unreachable-layer");
  });

  it("collectTouchRuleOrphans reports both reasons on the fixture", () => {
    const orphans = collectTouchRuleOrphans(makeTouchKeyRuleJoinFixture());
    const byId = new Map(orphans.map((o) => [o.binding.keyIdAsWritten, o.reason]));
    expect(byId.get(TOUCH_JOIN_IDS.orphan)).toBe("absent");
    expect(byId.get(TOUCH_JOIN_IDS.stranded)).toBe("unreachable-layer");
  });

  it("collectTouchRuleOrphans returns NOTHING when there is no touch layout", () => {
    // The orphan check must fire only when a touch layout exists — otherwise
    // every desktop-only keyboard would report its whole rule set as orphaned.
    expect(
      collectTouchRuleOrphans(makeTouchKeyRuleJoinFixture({ withoutTouchLayout: true })),
    ).toEqual([]);
  });
});

describe("the plain view stays frozen (FR-008/FR-010)", () => {
  it("buildProducedSet STILL COUNTS the orphan T_ rule", () => {
    // THE ANTI-REGRESSION PIN for docs/keyboard-facet-index.json. If this ever
    // fails, the committed facet index has silently moved.
    const plain = buildProducedSet(makeTouchKeyRuleJoinFixture());
    expect(plain.has(TOUCH_JOIN_PRODUCED.orphan)).toBe(true);
    expect(plain.has(TOUCH_JOIN_PRODUCED.stranded)).toBe(true);
  });

  it("the two views differ by exactly the orphaned set on this fixture", () => {
    const ir = makeTouchKeyRuleJoinFixture();
    const plain = buildProducedSet(ir);
    const { reachable, orphaned } = buildReachableProducedSet(ir);
    const missingFromReachable = [...plain].filter((ch) => !reachable.has(ch)).sort();
    expect(missingFromReachable).toEqual([...orphaned].sort());
  });
});
