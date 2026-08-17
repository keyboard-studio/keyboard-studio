/**
 * The role matrix for the touch key <-> rule join (spec 063 T016, contract §8).
 *
 * Role classification IS the design here — every consumer's correctness rests on
 * a guard rule contributing nothing while still counting as "wired" — so each
 * role gets its own case rather than being covered incidentally by an omnibus
 * assertion.
 */

import { describe, expect, it } from "vitest";

import {
  makeTouchKeyRuleJoinFixture,
  TOUCH_JOIN_IDS,
  TOUCH_JOIN_PRODUCED,
  TOUCH_JOIN_STORES,
} from "./fixtures/touchKeyRuleJoin.js";
import {
  bindingsForKeyId,
  buildTouchKeyRuleIndex,
  classifyTouchRuleRole,
  hasAnyBinding,
  isCustomTouchKeyId,
  isJoinableKeyId,
  normalizeTouchKeyId,
  producedByKeyId,
} from "./touch-key-rule-join.js";
import type { TouchKeyRuleBinding } from "./touch-key-rule-join.js";

function index() {
  return buildTouchKeyRuleIndex(makeTouchKeyRuleJoinFixture());
}

function soleBinding(keyId: string): TouchKeyRuleBinding {
  const bindings = bindingsForKeyId(index(), keyId);
  expect(bindings).toHaveLength(1);
  return bindings[0]!;
}

// ---------------------------------------------------------------------------
// Role matrix (FR-002)
// ---------------------------------------------------------------------------

describe("role classification — the fixed evaluation order", () => {
  it("produces: a literal char output", () => {
    const b = soleBinding(TOUCH_JOIN_IDS.multiChar);
    expect(b.role).toBe("produces");
    // `produced` is a deduped codepoint SET, so "FCFA" yields three entries.
    // See the producedText test below for the un-deduped keycap string.
    expect(b.produced).toEqual([...new Set(TOUCH_JOIN_PRODUCED.multiChar)]);
  });

  it("guard: `> context` produces NOTHING", () => {
    const bindings = bindingsForKeyId(index(), TOUCH_JOIN_IDS.mark);
    const guard = bindings.find((b) => b.role === "guard");
    expect(guard).toBeDefined();
    expect(guard?.produced).toEqual([]);
    // …and the producing sibling is a separate binding on the same key.
    const producing = bindings.find((b) => b.role === "produces");
    expect(producing?.produced).toEqual([TOUCH_JOIN_PRODUCED.mark]);
  });

  it("guard: `context(N)` for N >= 2 classifies as guard, not opaque", () => {
    // The offset re-emit form produces nothing, exactly as the bare spelling
    // does. Letting it fall through to `opaque` would silently take the
    // dead-key check's downgrade path with it.
    expect(classifyTouchRuleRole([{ kind: "raw", text: "context" }])).toBe("guard");
    expect(classifyTouchRuleRole([{ kind: "raw", text: "context(1)" }])).toBe("guard");
    expect(classifyTouchRuleRole([{ kind: "raw", text: "context(2)" }])).toBe("guard");
    expect(classifyTouchRuleRole([{ kind: "raw", text: "context( 12 )" }])).toBe("guard");
    expect(classifyTouchRuleRole([{ kind: "raw", text: "CONTEXT" }])).toBe("guard");
  });

  it("suppresses: `> nul`, and an empty output", () => {
    const b = soleBinding(TOUCH_JOIN_IDS.suppressed);
    expect(b.role).toBe("suppresses");
    expect(b.produced).toEqual([]);
    expect(classifyTouchRuleRole([])).toBe("suppresses");
    expect(classifyTouchRuleRole([{ kind: "raw", text: "NUL" }])).toBe("suppresses");
  });

  it("transitions: `> use(group)`", () => {
    const b = soleBinding(TOUCH_JOIN_IDS.transition);
    expect(b.role).toBe("transitions");
    expect(b.produced).toEqual([]);
  });

  it("transitions: deadkey and beep outputs too", () => {
    expect(classifyTouchRuleRole([{ kind: "deadkey" }])).toBe("transitions");
    expect(classifyTouchRuleRole([{ kind: "beep" }])).toBe("transitions");
    expect(classifyTouchRuleRole([{ kind: "deadkey" }, { kind: "beep" }])).toBe("transitions");
  });

  it("opaque: an unclassifiable raw output", () => {
    const b = soleBinding(TOUCH_JOIN_IDS.opaque);
    expect(b.role).toBe("opaque");
    expect(b.produced).toEqual([]);
  });

  it("opaque wins over produces when a raw element is mixed in", () => {
    // Production of a partially-opaque output cannot be established, so it must
    // not be credited — order matters: opaque is checked before produces.
    expect(
      classifyTouchRuleRole([{ kind: "char", value: "a" }, { kind: "raw", text: "if(x)" }]),
    ).toBe("opaque");
  });

  it("`> nul` and `> context` are NOT confused with a key that outputs the text", () => {
    // A rule genuinely emitting the three letters n-u-l is `produces`; only a
    // RAW element spelled `nul` is suppression.
    expect(
      classifyTouchRuleRole([
        { kind: "char", value: "n" },
        { kind: "char", value: "u" },
        { kind: "char", value: "l" },
      ]),
    ).toBe("produces");
  });
});

// ---------------------------------------------------------------------------
// Wired vs dead — the distinction the dead-key check rests on
// ---------------------------------------------------------------------------

describe("wired vs dead", () => {
  it("a key whose only bindings are guard/suppresses/transitions/opaque is WIRED", () => {
    const idx = index();
    for (const id of [
      TOUCH_JOIN_IDS.suppressed,
      TOUCH_JOIN_IDS.transition,
      TOUCH_JOIN_IDS.opaque,
    ]) {
      expect(hasAnyBinding(idx, id)).toBe(true);
      expect(producedByKeyId(idx, id)).toEqual([]);
      expect(idx.producingIds.has(normalizeTouchKeyId(id))).toBe(false);
    }
  });

  it("the genuinely dead key has zero bindings", () => {
    const idx = index();
    expect(hasAnyBinding(idx, TOUCH_JOIN_IDS.dead)).toBe(false);
    expect(bindingsForKeyId(idx, TOUCH_JOIN_IDS.dead)).toEqual([]);
  });

  it("ruleless sentinel and frame keys also have zero bindings (their exemption is elsewhere)", () => {
    // The join does not exempt anything — it reports the relation. Exemptions
    // are the CHECK's job, and conflating the two would make the exemptions
    // invisible to test.
    const idx = index();
    expect(hasAnyBinding(idx, TOUCH_JOIN_IDS.blank)).toBe(false);
    expect(hasAnyBinding(idx, TOUCH_JOIN_IDS.frame)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Struck-key resolution (FR-001, §2.1)
// ---------------------------------------------------------------------------

describe("struck-key resolution", () => {
  it("resolves through a plus-separator to the real vkey", () => {
    // The guard rules in the fixture carry `any(store)`, a synthetic `+`, then
    // the vkey. Resolving the separator as the struck element would index
    // nothing at all.
    const bindings = bindingsForKeyId(index(), TOUCH_JOIN_IDS.mark);
    expect(bindings.map((b) => b.role).sort()).toEqual(["guard", "produces"]);
  });

  it("marks a rule with pre-context as contextGuarded", () => {
    const bindings = bindingsForKeyId(index(), TOUCH_JOIN_IDS.mark);
    expect(bindings.find((b) => b.role === "guard")?.contextGuarded).toBe(true);
    expect(bindings.find((b) => b.role === "produces")?.contextGuarded).toBe(false);
  });

  it("does not index a rule with no vkey in its context", () => {
    // The fixture's terminal `match` rule has an empty context.
    const idx = index();
    const allNodeIds = [...idx.byId.values()].flat().map((b) => b.ruleNodeId);
    expect(allNodeIds).not.toContain("rule#match");
  });

  it("records the containing group and its usingKeys flag", () => {
    const b = soleBinding(TOUCH_JOIN_IDS.multiChar);
    expect(b.groupName).toBe("Main");
    expect(b.usingKeys).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scope: T_, U_, and K_ (FR-001, §2.2)
// ---------------------------------------------------------------------------

describe("scope", () => {
  it("indexes a K_ id — the same under-credit shape on a physical key", () => {
    const b = soleBinding(TOUCH_JOIN_IDS.physicalMark);
    expect(b.role).toBe("produces");
    expect(b.produced).toEqual([TOUCH_JOIN_PRODUCED.mark]);
  });

  it("customIdsOnly excludes K_ ids but keeps T_ and U_", () => {
    const idx = buildTouchKeyRuleIndex(makeTouchKeyRuleJoinFixture(), { customIdsOnly: true });
    expect(hasAnyBinding(idx, TOUCH_JOIN_IDS.physicalMark)).toBe(false);
    expect(hasAnyBinding(idx, TOUCH_JOIN_IDS.mark)).toBe(true);
  });

  it("classifies id prefixes", () => {
    expect(isJoinableKeyId("T_0300")).toBe(true);
    expect(isJoinableKeyId("u_0061")).toBe(true);
    expect(isJoinableKeyId("K_A")).toBe(true);
    expect(isJoinableKeyId("SOMETHING_ELSE")).toBe(false);
    expect(isCustomTouchKeyId("K_A")).toBe(false);
    expect(isCustomTouchKeyId("T_A")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Case normalization and spelling capture (FR-003, §2.5)
// ---------------------------------------------------------------------------

describe("case normalization and spelling capture", () => {
  it("joins a rule and a layout key that differ only by case", () => {
    // The fixture's layout spells it `T_CaseTest`; the rule spells it
    // `T_CASETEST`. They MUST join (our compile accepts it) …
    const idx = index();
    expect(hasAnyBinding(idx, TOUCH_JOIN_IDS.caseTest)).toBe(true);
    expect(producedByKeyId(idx, TOUCH_JOIN_IDS.caseTest)).toEqual([
      TOUCH_JOIN_PRODUCED.caseTest,
    ]);
  });

  it("retains the AS-WRITTEN spelling so the case asymmetry stays reportable", () => {
    // … while remaining reportable, because Developer's validator compares
    // case-sensitively. Losing the spelling here would make the hint
    // unimplementable.
    const idx = index();
    const spellings = idx.spellings.get(normalizeTouchKeyId(TOUCH_JOIN_IDS.caseTest));
    expect(spellings).toEqual([TOUCH_JOIN_IDS.caseTestAsWritten]);
    expect(spellings?.[0]).not.toBe(TOUCH_JOIN_IDS.caseTest);
  });

  it("normalizes to upper case", () => {
    expect(normalizeTouchKeyId("t_0300")).toBe("T_0300");
    expect(normalizeTouchKeyId("T_0300")).toBe("T_0300");
  });

  it("keys the index on the normalized id", () => {
    const idx = index();
    expect(idx.byId.has("T_0300")).toBe(true);
    expect(idx.byId.has("t_0300")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Production collection (FR-004) and producedText
// ---------------------------------------------------------------------------

describe("production collection reuses the shared walk", () => {
  it("index()-driven output expands the store", () => {
    const b = soleBinding(TOUCH_JOIN_IDS.storeIndex);
    expect(b.role).toBe("produces");
    expect([...b.produced].sort()).toEqual(["ā", "ē"]);
  });

  it("outs()-driven output expands the store", () => {
    const b = soleBinding(TOUCH_JOIN_IDS.storeOuts);
    expect(b.role).toBe("produces");
    expect([...b.produced].sort()).toEqual(["ā", "ē"]);
  });

  it("producedText is ABSENT for store-driven output — there is no keycap string", () => {
    expect(soleBinding(TOUCH_JOIN_IDS.storeIndex).producedText).toBeUndefined();
    expect(soleBinding(TOUCH_JOIN_IDS.storeOuts).producedText).toBeUndefined();
  });

  it("producedText is the whole leading char run, unsplit", () => {
    const b = soleBinding(TOUCH_JOIN_IDS.multiChar);
    expect(b.producedText).toBe("FCFA");
    // THE REASON BOTH FIELDS EXIST, in one assertion: `produced` is the deduped
    // per-codepoint set (so the repeated F collapses), while `producedText` is
    // the verbatim keycap string. A consumer wanting to label a key cannot
    // reconstruct "FCFA" from the set, and a consumer computing coverage must not
    // use the string. Collapsing these into one field loses one caller or the
    // other.
    expect(b.produced).toEqual(["F", "C", "A"]);
  });

  it("producedText is absent for every non-producing role", () => {
    const idx = index();
    for (const id of [
      TOUCH_JOIN_IDS.suppressed,
      TOUCH_JOIN_IDS.transition,
      TOUCH_JOIN_IDS.opaque,
    ]) {
      for (const b of bindingsForKeyId(idx, id)) {
        expect(b.producedText).toBeUndefined();
      }
    }
    const guard = bindingsForKeyId(idx, TOUCH_JOIN_IDS.mark).find((b) => b.role === "guard");
    expect(guard?.producedText).toBeUndefined();
  });

  it("records the stores a rule reads from", () => {
    const guard = bindingsForKeyId(index(), TOUCH_JOIN_IDS.mark).find(
      (b) => b.role === "guard",
    );
    expect(guard?.storeRefs).toEqual([TOUCH_JOIN_STORES.guard]);
    expect(soleBinding(TOUCH_JOIN_IDS.storeIndex).storeRefs).toEqual([
      TOUCH_JOIN_STORES.indexFrom,
      TOUCH_JOIN_STORES.indexTo,
    ]);
  });

  it("excludes space by default and includes it on request", () => {
    // Inherited from `collectFromElements` rather than re-implemented, which is
    // the point of routing production through it.
    const ir = makeTouchKeyRuleJoinFixture();
    ir.groups[0]!.rules.push({
      nodeId: "rule#space",
      context: [{ kind: "vkey", name: "T_SPACEY", modifiers: [] }],
      output: [{ kind: "char", value: " " }],
    });
    expect(producedByKeyId(buildTouchKeyRuleIndex(ir), "T_SPACEY")).toEqual([]);
    expect(
      producedByKeyId(buildTouchKeyRuleIndex(ir, { includeSpace: true }), "T_SPACEY"),
    ).toEqual([" "]);
  });
});

// ---------------------------------------------------------------------------
// Modifier capture (§2.4)
// ---------------------------------------------------------------------------

describe("modifier capture", () => {
  it("captures `[SHIFT T_…]` modifiers on both halves of the pair", () => {
    const bindings = bindingsForKeyId(index(), TOUCH_JOIN_IDS.markShift);
    expect(bindings).toHaveLength(2);
    for (const b of bindings) expect(b.modifiers).toEqual(["SHIFT"]);
  });

  it("returns an empty modifier list for an unmodified key", () => {
    expect(soleBinding(TOUCH_JOIN_IDS.multiChar).modifiers).toEqual([]);
  });

  it("uppercases, dedupes, and sorts — but does NOT chirality-unify", () => {
    // The canonical combo vocabulary lives in engine and contracts cannot import
    // it. This test pins the documented non-canonical contract: LALT is NOT
    // folded into ALT here. An engine caller canonicalizes; a contracts-layer
    // caller must not assume it has been done.
    const ir = makeTouchKeyRuleJoinFixture();
    ir.groups[0]!.rules.push({
      nodeId: "rule#mods",
      context: [{ kind: "vkey", name: "T_MODS", modifiers: ["shift", "LALT", "SHIFT"] }],
      output: [{ kind: "char", value: "m" }],
    });
    const b = bindingsForKeyId(buildTouchKeyRuleIndex(ir), "T_MODS")[0]!;
    expect(b.modifiers).toEqual(["LALT", "SHIFT"]);
    expect(b.modifiers).not.toContain("ALT");
  });
});

// ---------------------------------------------------------------------------
// Opaque-fragment count (§2, §5.1)
// ---------------------------------------------------------------------------

describe("opaqueFragmentCount", () => {
  it("reports ir.raw.length so consumers can degrade", () => {
    expect(index().opaqueFragmentCount).toBe(1);
  });

  it("is zero for the clean-IR fixture variant", () => {
    const idx = buildTouchKeyRuleIndex(
      makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }),
    );
    expect(idx.opaqueFragmentCount).toBe(0);
  });

  it("does not mine opaque fragments for bindings", () => {
    // A fragment has no recoverable struck key by definition; pretending
    // otherwise is what the count exists to avoid.
    const withFrag = buildTouchKeyRuleIndex(makeTouchKeyRuleJoinFixture());
    const withoutFrag = buildTouchKeyRuleIndex(
      makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }),
    );
    expect([...withFrag.byId.keys()].sort()).toEqual([...withoutFrag.byId.keys()].sort());
  });
});

// ---------------------------------------------------------------------------
// The orphan pair — the join's half of the AZERTY defect
// ---------------------------------------------------------------------------

describe("the injected orphan", () => {
  it("indexes the orphan's rules exactly as it would any other pair", () => {
    // The join does not know or care that no key carries this id — that is the
    // reachability view's question. Here it is an ordinary guard+producing pair.
    const bindings = bindingsForKeyId(index(), TOUCH_JOIN_IDS.orphan);
    expect(bindings.map((b) => b.role).sort()).toEqual(["guard", "produces"]);
    expect(producedByKeyId(index(), TOUCH_JOIN_IDS.orphan)).toEqual([
      TOUCH_JOIN_PRODUCED.orphan,
    ]);
  });

  it("does NOT index the near-miss U_ id, which carries no rule of its own", () => {
    expect(hasAnyBinding(index(), TOUCH_JOIN_IDS.orphanNearMiss)).toBe(false);
  });
});
