/**
 * Unit tests for useModeContextCarry (spec 058 T074, FR-036c).
 *
 * Grouped:
 *   1. `orderLayerIdsByFamily` — proves FAMILY order, not raw array order
 *      (the divergence case tasks.md's DoD calls for).
 *   2. `orderedPlatformIds` / `buildLayoutOrderIndex` — active platform first.
 *   3. character -> key: exactly one producer.
 *   4. character -> key: several producers — first-in-layout-order primary,
 *      the rest badged, Next/Previous cycles through them in that order.
 *   5. character -> key: an unplaced character reveals candidate keys.
 *   6. key -> character, including the sub-mechanism (longpress) fallback.
 *   7. `stepCarryTarget` wrap-around, in isolation.
 *   8. Label composers (i18n `msg()` English source text).
 *   9. The hook itself, via `renderHook`.
 */

import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import type { TouchKeyRuleIndex, TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  makeTouchKeyRuleJoinFixture,
  TOUCH_JOIN_IDS,
} from "@keyboard-studio/contracts/fixtures";
import { touchKeyAddress } from "@keyboard-studio/engine";

import {
  buildLayoutOrderIndex,
  carryBadgeCount,
  carryCharacterToKey,
  carryKeyToCharacter,
  composeCarryCycleLabel,
  composeCarryKindLabel,
  orderedPlatformIds,
  orderLayerIdsByFamily,
  stepCarryTarget,
  useModeContextCarry,
} from "./useModeContextCarry.ts";

const PHONE = "phone";
const TABLET = "tablet";

function fixtureLayout(): TouchLayoutIR {
  return makeTouchKeyRuleJoinFixture().touchLayout!;
}

function fixtureIndex(): TouchKeyRuleIndex {
  return buildTouchKeyRuleIndex(makeTouchKeyRuleJoinFixture());
}

const EMPTY_RULE_INDEX: TouchKeyRuleIndex = {
  byId: new Map(),
  spellings: new Map(),
  producingIds: new Set(),
  opaqueFragmentCount: 0,
};

// The fixture's dotted-circle-prefixed mark keycap ("◌̀") — text-identical on
// T_0300 (phone), K_QUOTE (phone), and T_0300 again (tablet). Three DISTINCT
// keys, not a duplicate-id collision (see the fixture's own module doc on the
// under-credit shape it's modelling).
const MARK_KEYCAP = "◌̀";

// ---------------------------------------------------------------------------
// 1. orderLayerIdsByFamily — family order, NOT raw array order
// ---------------------------------------------------------------------------

describe("orderLayerIdsByFamily", () => {
  it("groups by family and orders by ascending modifier-combo complexity, regardless of input order", () => {
    // Deliberately scrambled: caps before shift before default, and the
    // rightalt-caps/rightalt-shift pair reversed too. If this function just
    // returned its input (or a naive alphabetical/array-position sort), the
    // assertion below would fail — it only passes because family grouping +
    // the within-family complexity order is actually computed.
    const scrambled = ["rightalt-caps", "caps", "rightalt-shift", "shift", "default", "symbol-caps", "symbol"];
    expect(orderLayerIdsByFamily(scrambled)).toEqual([
      "default",
      "shift",
      "caps",
      "rightalt-shift",
      "rightalt-caps",
      "symbol",
      "symbol-caps",
    ]);
  });

  it("keeps a freeform id out of every family, appended after all of them", () => {
    const withFreeform = ["shift", "default", "punctuation", "caps"];
    expect(orderLayerIdsByFamily(withFreeform)).toEqual(["default", "shift", "caps", "punctuation"]);
  });

  it("is a no-op reordering for a single-family, already-ordered list", () => {
    expect(orderLayerIdsByFamily(["default", "shift"])).toEqual(["default", "shift"]);
  });
});

// ---------------------------------------------------------------------------
// 2. Active platform first
// ---------------------------------------------------------------------------

describe("orderedPlatformIds", () => {
  it("moves the active platform to the front, regardless of its raw array position", () => {
    const layout = fixtureLayout(); // platforms: [phone, tablet]
    expect(orderedPlatformIds(layout, TABLET)).toEqual([TABLET, PHONE]);
    expect(orderedPlatformIds(layout, PHONE)).toEqual([PHONE, TABLET]);
  });

  it("leaves the raw order unchanged when the requested platform doesn't exist", () => {
    const layout = fixtureLayout();
    expect(orderedPlatformIds(layout, "desktop")).toEqual([PHONE, TABLET]);
  });
});

describe("buildLayoutOrderIndex", () => {
  it("ranks every phone:default key before every tablet key when phone is active", () => {
    const index = buildLayoutOrderIndex(fixtureLayout(), PHONE);
    const phoneMark = index.get(touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.mark));
    const tabletMark = index.get(touchKeyAddress(TABLET, "default", TOUCH_JOIN_IDS.mark));
    expect(phoneMark).toBeDefined();
    expect(tabletMark).toBeDefined();
    expect(phoneMark!).toBeLessThan(tabletMark!);
  });

  it("flips that ranking when tablet becomes the active platform", () => {
    const index = buildLayoutOrderIndex(fixtureLayout(), TABLET);
    const phoneMark = index.get(touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.mark));
    const tabletMark = index.get(touchKeyAddress(TABLET, "default", TOUCH_JOIN_IDS.mark));
    expect(tabletMark!).toBeLessThan(phoneMark!);
  });
});

// ---------------------------------------------------------------------------
// 3. character -> key: exactly one producer
// ---------------------------------------------------------------------------

describe("carryCharacterToKey — exactly one producer", () => {
  it("selects the sole producing key, with nothing to badge", () => {
    const result = carryCharacterToKey(
      fixtureLayout(),
      fixtureIndex(),
      "FCFA",
      buildLayoutOrderIndex(fixtureLayout(), PHONE),
    );
    expect(result.kind).toBe("producing");
    expect(result.targets).toEqual([touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.multiChar)]);
    expect(result.primary).toBe(result.targets[0]);
    expect(carryBadgeCount(result.targets)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. character -> key: several producers — first-in-layout-order primary,
//    badge the rest, Next/Previous cycles through them
// ---------------------------------------------------------------------------

describe("carryCharacterToKey — several producers", () => {
  const phoneMarkAddr = touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.mark);
  const phoneQuoteAddr = touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.physicalMark);
  const tabletMarkAddr = touchKeyAddress(TABLET, "default", TOUCH_JOIN_IDS.mark);

  it("orders phone's own two keys by row/column, with tablet after (phone active)", () => {
    const result = carryCharacterToKey(
      fixtureLayout(),
      fixtureIndex(),
      MARK_KEYCAP,
      buildLayoutOrderIndex(fixtureLayout(), PHONE),
    );
    expect(result.kind).toBe("producing");
    // T_0300 sits at (row 0, col 0), K_QUOTE at (row 0, col 3) — same layer,
    // so column order alone decides phone's internal order.
    expect(result.targets).toEqual([phoneMarkAddr, phoneQuoteAddr, tabletMarkAddr]);
    expect(result.primary).toBe(phoneMarkAddr);
  });

  it("badges the two other producing keys", () => {
    const result = carryCharacterToKey(
      fixtureLayout(),
      fixtureIndex(),
      MARK_KEYCAP,
      buildLayoutOrderIndex(fixtureLayout(), PHONE),
    );
    expect(carryBadgeCount(result.targets)).toBe(2);
  });

  it("cycles Next/Previous through the targets in that same layout order, wrapping", () => {
    const result = carryCharacterToKey(
      fixtureLayout(),
      fixtureIndex(),
      MARK_KEYCAP,
      buildLayoutOrderIndex(fixtureLayout(), PHONE),
    );
    expect(stepCarryTarget(result.targets, result.primary, 1)).toBe(phoneQuoteAddr);
    expect(stepCarryTarget(result.targets, phoneQuoteAddr, 1)).toBe(tabletMarkAddr);
    // Wrap forward past the end...
    expect(stepCarryTarget(result.targets, tabletMarkAddr, 1)).toBe(phoneMarkAddr);
    // ...and wrap backward past the start.
    expect(stepCarryTarget(result.targets, phoneMarkAddr, -1)).toBe(tabletMarkAddr);
  });

  it("puts tablet's key first when tablet is the active platform — proving active-platform-first, not raw array order", () => {
    const result = carryCharacterToKey(
      fixtureLayout(),
      fixtureIndex(),
      MARK_KEYCAP,
      buildLayoutOrderIndex(fixtureLayout(), TABLET),
    );
    expect(result.primary).toBe(tabletMarkAddr);
    expect(result.targets).toEqual([tabletMarkAddr, phoneMarkAddr, phoneQuoteAddr]);
  });
});

// ---------------------------------------------------------------------------
// 5. character -> key: an unplaced character reveals candidate keys
// ---------------------------------------------------------------------------

describe("carryCharacterToKey — unplaced character reveals candidates", () => {
  it("falls back to the no-output worklist when nothing produces the character", () => {
    const result = carryCharacterToKey(
      fixtureLayout(),
      fixtureIndex(),
      "Ω", // Ω — not produced anywhere in the fixture
      buildLayoutOrderIndex(fixtureLayout(), PHONE),
    );
    expect(result.kind).toBe("candidate");
    expect(result.targets.length).toBeGreaterThan(0);
    expect(result.primary).toBe(result.targets[0]);

    // The genuinely dead key (no rule, no nextlayer, no sp) IS a candidate...
    expect(result.targets).toContain(touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.dead));
    // ...but the sentinel blank (sp:9 spacer) is intentionally empty, not a candidate...
    expect(result.targets).not.toContain(touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.blank));
    // ...and neither is a layer-switch/frame key (nextlayer set).
    expect(result.targets).not.toContain(touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.frame));
    expect(result.targets).not.toContain(touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.suppressed));
    // A key that genuinely produces something (via the rule join, not just its
    // own text/output) is correctly excluded too.
    expect(result.targets).not.toContain(touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.mark));
  });

  it("returns kind \"none\" when there is nothing to produce OR place onto", () => {
    // An empty layout: no producers, no candidates either.
    const empty: TouchLayoutIR = { platforms: [], nodeIds: [] };
    const actual = carryCharacterToKey(empty, EMPTY_RULE_INDEX, "x", buildLayoutOrderIndex(empty, PHONE));
    expect(actual).toEqual({ kind: "none", targets: [], primary: undefined });
  });
});

// ---------------------------------------------------------------------------
// 6. key -> character, including the sub-mechanism (longpress) fallback
// ---------------------------------------------------------------------------

describe("carryKeyToCharacter", () => {
  it("lands on a key's own main output", () => {
    const address = touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.multiChar);
    expect(carryKeyToCharacter(fixtureLayout(), fixtureIndex(), address)).toBe("FCFA");
  });

  it("falls back to a longpress sub-key's self-output when the host key has no main output of its own", () => {
    // T_0021 (longpressHost) has no `output`, no decodable id, and no rule of
    // its own — only its `sk[]` children (U_00A1 / U_203D) self-output.
    const address = touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.longpressHost);
    expect(carryKeyToCharacter(fixtureLayout(), fixtureIndex(), address)).toBe("¡"); // ¡
  });

  it("returns undefined for a key that produces nothing anywhere (main or sub)", () => {
    const address = touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.dead);
    expect(carryKeyToCharacter(fixtureLayout(), fixtureIndex(), address)).toBeUndefined();
  });

  it("returns undefined for an address that doesn't resolve", () => {
    expect(
      carryKeyToCharacter(fixtureLayout(), fixtureIndex(), "phone:default:T_NOT_A_REAL_KEY"),
    ).toBeUndefined();
    expect(carryKeyToCharacter(fixtureLayout(), fixtureIndex(), "not-an-address")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. stepCarryTarget — wrap-around, in isolation
// ---------------------------------------------------------------------------

describe("stepCarryTarget", () => {
  const targets = ["a", "b", "c"];

  it("returns undefined for an empty list", () => {
    expect(stepCarryTarget([], undefined, 1)).toBeUndefined();
  });

  it("starts at the first target for Next with no current address", () => {
    expect(stepCarryTarget(targets, undefined, 1)).toBe("a");
  });

  it("starts at the last target for Previous with no current address", () => {
    expect(stepCarryTarget(targets, undefined, -1)).toBe("c");
  });

  it("wraps forward and backward", () => {
    expect(stepCarryTarget(targets, "c", 1)).toBe("a");
    expect(stepCarryTarget(targets, "a", -1)).toBe("c");
  });

  it("treats a stale current address (not present) the same as none", () => {
    expect(stepCarryTarget(targets, "not-there", 1)).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// 8. Label composers (i18n `msg()` English source text)
// ---------------------------------------------------------------------------

describe("label composers", () => {
  it("composeCarryKindLabel names each kind", () => {
    expect(composeCarryKindLabel("producing")).toBe("Types this character");
    expect(composeCarryKindLabel("candidate")).toBe("Not placed yet — candidate key");
    expect(composeCarryKindLabel("none")).toBe("No key found for this character");
  });

  it("carryBadgeCount is undefined for a single target, the OTHER count otherwise", () => {
    expect(carryBadgeCount(["a"])).toBeUndefined();
    expect(carryBadgeCount(["a", "b"])).toBe(1);
    expect(carryBadgeCount(["a", "b", "c", "d"])).toBe(3);
  });

  it("composeCarryCycleLabel renders a 1-based position", () => {
    expect(composeCarryCycleLabel(2, 3)).toBe("Key 2 of 3");
  });
});

// ---------------------------------------------------------------------------
// 9. The hook itself
// ---------------------------------------------------------------------------

describe("useModeContextCarry", () => {
  it("wires carryFromCharacter to the pure carryCharacterToKey", () => {
    const { result } = renderHook(() =>
      useModeContextCarry({ layout: fixtureLayout(), ruleIndex: fixtureIndex(), activePlatform: PHONE }),
    );
    const carried = result.current.carryFromCharacter("FCFA");
    expect(carried.kind).toBe("producing");
    expect(carried.primary).toBe(touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.multiChar));
  });

  it("wires carryFromKey to the pure carryKeyToCharacter", () => {
    const { result } = renderHook(() =>
      useModeContextCarry({ layout: fixtureLayout(), ruleIndex: fixtureIndex(), activePlatform: PHONE }),
    );
    const address = touchKeyAddress(PHONE, "default", TOUCH_JOIN_IDS.multiChar);
    expect(result.current.carryFromKey(address)).toBe("FCFA");
  });

  it("exposes stepTarget for Next/Previous cycling", () => {
    const { result } = renderHook(() =>
      useModeContextCarry({ layout: fixtureLayout(), ruleIndex: fixtureIndex(), activePlatform: PHONE }),
    );
    expect(result.current.stepTarget(["a", "b"], "a", 1)).toBe("b");
  });
});
