/**
 * severTouchKey / relinkTouchKey — spec 104 T011 + T027 (FR-008, FR-029;
 * contracts/key-id-criteria.md §3).
 *
 * The transplant is a RULE-LEVEL operation: rules naming the source key are
 * cloned verbatim (context, output, group, relative order — `if()` guard
 * elements ride along as context elements of the cloned node) and re-keyed
 * to the target id; the layout id changes ONLY on occurrences in the layer
 * family where arm 0 failed. Three shapes are pinned here:
 *
 *   1. Happy path, Cameroon shape — a diablock-guarded mark keyed on a K_
 *      id (the fixture's T_0300 rule set re-keyed onto K_1): guard + bare
 *      producer clone cleanly; a K_1 on the symbol plane (a different
 *      family) keeps its id and its rules.
 *   2. Refusal, fv store-fan shape — the key's production reaches it only
 *      through a shared store listing (`store(fanHkeys)` + `index(fanH,1)`)
 *      the rule-join cannot even index: NO clones, inputs returned
 *      untouched, the key flagged with the binding that caused it.
 *   3. Refusal, target-id collision — the T_ namespace is shared with
 *      .kmn-only names (the sil_euro_latin `[T_N_Dieresis]` shape).
 *
 * Plus: a deadkey-bound rule set refuses (FR-008 names deadkeys), an
 * opaque fragment blocks an unacknowledged transplant (the
 * touchRuleSynthesis posture), a fallback-only K_ key transplants zero
 * rules honestly, and relinkTouchKey deletes exactly the transplant's
 * clones and restores the K_ id (FR-029's mirror).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildTouchKeyRuleIndex,
  parseTouchLayoutString,
  resolveTouchProduction,
  touchKeyStateFromLayerId,
  type KeyboardIR,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import {
  applyKeyEditsWithSeverance,
  relinkTouchKey,
  severTouchKey,
  SEVERANCE_LINE_DESCRIPTOR_ID,
} from "./severTouchKey.js";
import type { KeyEditOperation } from "./keyEditOps.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "__fixtures__/touch-id");

function loadFixture(name: string): { kmn: string; layout: TouchLayoutIR } {
  const dir = resolve(fixtureRoot, name);
  return {
    kmn: readFileSync(resolve(dir, `${name}.kmn`), "utf8"),
    layout: parseTouchLayoutString(
      readFileSync(resolve(dir, `${name}.keyman-touch-layout`), "utf8"),
    ),
  };
}

function parseKmn(text: string, id = "test"): KeyboardIR {
  const result = parse(text, id);
  expect(result.ir.raw, "fixture kmn should parse without opaque fragments").toEqual([]);
  return result.ir;
}

/** The Cameroon fixture's T_0300 rule set (guard + bare producer), re-keyed onto K_1. */
function cameroonShapeKmn(): string {
  return loadFixture("sil_cameroon_qwerty").kmn.replaceAll("[T_0300]", "[K_1]");
}

/** The Cameroon fixture layout plus a symbol-plane layer that also carries K_1. */
function cameroonShapeLayout(): TouchLayoutIR {
  const { layout } = loadFixture("sil_cameroon_qwerty");
  const tablet = layout.platforms[0]!;
  const symbolLayer = {
    id: "symbol",
    rows: [
      {
        id: 1,
        keys: [
          { nodeId: "sym-k1", id: "K_1", text: "1" },
          { nodeId: "sym-t030d", id: "T_030D", text: "◌̍" },
        ],
      },
    ],
  } as unknown as (typeof tablet.layers)[number];
  return {
    ...layout,
    platforms: [{ ...tablet, layers: [...tablet.layers, symbolLayer] }, ...layout.platforms.slice(1)],
  };
}

function keyIdsOn(layout: TouchLayoutIR, platformId: string, layerId: string): string[] {
  const platform = layout.platforms.find((p) => p.id === platformId);
  const layer = platform?.layers.find((l) => l.id === layerId);
  return layer?.rows.flatMap((r) => r.keys.map((k) => k.id)) ?? [];
}

function allRules(ir: KeyboardIR) {
  return ir.groups.flatMap((g) => g.rules.map((rule) => ({ group: g, rule })));
}

function rulesNaming(ir: KeyboardIR, keyId: string) {
  return allRules(ir).filter(({ rule }) =>
    rule.context.some((el) => el.kind === "vkey" && el.name === keyId),
  );
}

// ---------------------------------------------------------------------------
// T011 — happy path (Cameroon shape)
// ---------------------------------------------------------------------------

describe("severTouchKey — Cameroon shape (guard + bare producer on a K_ id)", () => {
  const ir = parseKmn(cameroonShapeKmn(), "cameroon_shape");
  const layout = cameroonShapeLayout();
  const result = severTouchKey(ir, layout, buildTouchKeyRuleIndex(ir), {
    sourceId: "K_1",
    targetId: "T_0301",
    platformId: "tablet",
    anchorLayerId: "default",
    recordId: "transplant-test-1",
    recordedAt: 1_000,
  });

  it("completes and records the transplant + the severed decision", () => {
    expect(result.record.outcome).toBe("completed");
    expect(result.record.sourceId).toBe("K_1");
    expect(result.record.targetId).toBe("T_0301");
    expect(result.record.clonedRuleNodeIds).toHaveLength(2);
    expect(result.decision.action).toBe("severed");
    expect(result.decision.criterion).toBe("FR-008");
    expect(result.decision.keyRef).toBe("tablet:default:K_1");
  });

  it("scopes the id replacement to the anchor layer's family", () => {
    expect(new Set(result.record.layersAffected)).toEqual(
      new Set(["default", "shift", "rightalt"]),
    );
    for (const layerId of ["default", "shift", "rightalt"]) {
      expect(keyIdsOn(result.layout, "tablet", layerId)).toContain("T_0301");
      expect(keyIdsOn(result.layout, "tablet", layerId)).not.toContain("K_1");
    }
    // The symbol plane is a different family: K_1 keeps its id AND its rules.
    expect(keyIdsOn(result.layout, "tablet", "symbol")).toContain("K_1");
    expect(keyIdsOn(result.layout, "tablet", "symbol")).not.toContain("T_0301");
  });

  it("clones verbatim: same group, immediately after the source, context/output preserved", () => {
    const group = result.ir.groups.find((g) => g.name === "main")!;
    for (const { sourceNodeId, cloneNodeId } of result.record.clonedRuleNodeIds) {
      const sourceIdx = group.rules.findIndex((r) => r.nodeId === sourceNodeId);
      const cloneIdx = group.rules.findIndex((r) => r.nodeId === cloneNodeId);
      expect(sourceIdx).toBeGreaterThanOrEqual(0);
      expect(cloneIdx).toBe(sourceIdx + 1);
      const source = group.rules[sourceIdx]!;
      const clone = group.rules[cloneIdx]!;
      expect(clone.output).toEqual(source.output);
      expect(clone.context).toEqual(
        source.context.map((el) =>
          el.kind === "vkey" && el.name === "K_1" ? { ...el, name: "T_0301" } : el,
        ),
      );
    }
    // The originals survive untouched — the desktop key keeps its rules.
    expect(rulesNaming(result.ir, "K_1")).toHaveLength(2);
    expect(rulesNaming(result.ir, "T_0301")).toHaveLength(2);
    // Unrelated rules (T_002E, T_030D) are not cloned or moved.
    expect(rulesNaming(result.ir, "T_030D")).toHaveLength(4);
    expect(emit(result.ir)).toContain("[T_0301]");
  });

  it("the severed key produces through its clones; the other-family K_1 through the originals", () => {
    const index = buildTouchKeyRuleIndex(result.ir);
    const tablet = result.layout.platforms[0]!;
    const severedKey = tablet.layers
      .find((l) => l.id === "default")!
      .rows.flatMap((r) => r.keys)
      .find((k) => k.id === "T_0301")!;
    const production = resolveTouchProduction(
      { ir: result.ir, ruleIndex: index },
      severedKey,
      touchKeyStateFromLayerId("default"),
    );
    expect(production.source).toBe("rule");
    expect(production.contextConditional).toBe(true); // the diablock guard rode along
    expect(
      production.productions.some(
        (p) => p.output.kind === "text" && p.output.text === "̀",
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T011 — refusals
// ---------------------------------------------------------------------------

describe("severTouchKey — fv store-fan refusal", () => {
  const { kmn, layout } = loadFixture("fv_southern_carrier");
  const ir = parseKmn(kmn, "fv_southern_carrier");
  const result = severTouchKey(ir, layout, buildTouchKeyRuleIndex(ir), {
    sourceId: "T_H",
    targetId: "T_HX",
    platformId: "tablet",
    anchorLayerId: "default",
    recordId: "transplant-test-fv",
    recordedAt: 2_000,
  });

  it("refuses: the fan reaches T_H only through the shared fanHkeys store", () => {
    expect(result.record.outcome).toBe("refused");
    expect(result.record.refusalBinding).toContain("fanHkeys");
    expect(result.record.clonedRuleNodeIds).toEqual([]);
    expect(result.decision.action).toBe("flagged-manual");
  });

  it("emits NO clones and returns the inputs untouched", () => {
    expect(result.ir).toBe(ir);
    expect(result.layout).toBe(layout);
  });
});

describe("severTouchKey — target-id collision", () => {
  const ir = parseKmn(cameroonShapeKmn(), "cameroon_shape");
  const layout = cameroonShapeLayout();

  it("refuses a target that already names a layout key / rule id", () => {
    const result = severTouchKey(ir, layout, buildTouchKeyRuleIndex(ir), {
      sourceId: "K_1",
      targetId: "T_030D",
      platformId: "tablet",
      anchorLayerId: "default",
    });
    expect(result.record.outcome).toBe("refused");
    expect(result.record.refusalBinding).toContain("T_030D");
    expect(result.ir).toBe(ir);
  });

  it("refuses a target that exists only as a .kmn rule name (sil_euro_latin shape)", () => {
    const kmn = [
      "store(&VERSION) '10.0'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [T_N_Dieresis] > U+0308",
      "+ [K_5] > '5'",
    ].join("\n");
    const ir2 = parseKmn(kmn, "euro_shape");
    const result = severTouchKey(ir2, layout, buildTouchKeyRuleIndex(ir2), {
      sourceId: "K_5",
      targetId: "T_N_Dieresis",
      platformId: "tablet",
      anchorLayerId: "default",
    });
    expect(result.record.outcome).toBe("refused");
    expect(result.record.refusalBinding).toContain("T_N_Dieresis");
  });
});

describe("severTouchKey — deadkey-bound rules refuse (FR-008)", () => {
  const kmn = [
    "store(&VERSION) '10.0'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    "+ [K_1] > deadkey(1)",
    "deadkey(1) + [K_1] > 'x'",
  ].join("\n");
  const ir = parseKmn(kmn, "deadkey_shape");
  const layout = cameroonShapeLayout();
  const result = severTouchKey(ir, layout, buildTouchKeyRuleIndex(ir), {
    sourceId: "K_1",
    targetId: "T_0031",
    platformId: "tablet",
    anchorLayerId: "default",
  });

  it("refuses and names the deadkey binding; nothing is cloned", () => {
    expect(result.record.outcome).toBe("refused");
    expect(result.record.refusalBinding).toContain("deadkey");
    expect(result.record.clonedRuleNodeIds).toEqual([]);
    expect(result.ir).toBe(ir);
  });
});

describe("severTouchKey — opaque fragments gate the transplant", () => {
  const ir = parseKmn(cameroonShapeKmn(), "cameroon_shape");
  const layout = cameroonShapeLayout();
  const index = { ...buildTouchKeyRuleIndex(ir), opaqueFragmentCount: 1 };

  it("refuses unacknowledged; completes when acknowledged", () => {
    const refused = severTouchKey(ir, layout, index, {
      sourceId: "K_1",
      targetId: "T_0301",
      platformId: "tablet",
      anchorLayerId: "default",
    });
    expect(refused.record.outcome).toBe("refused");
    expect(refused.record.refusalBinding).toContain("opaque");

    const acked = severTouchKey(ir, layout, index, {
      sourceId: "K_1",
      targetId: "T_0301",
      platformId: "tablet",
      anchorLayerId: "default",
      opaqueAcknowledged: true,
    });
    expect(acked.record.outcome).toBe("completed");
  });
});

describe("severTouchKey — fallback-only K_ key (the fixture's real K_1)", () => {
  const { kmn, layout } = loadFixture("sil_cameroon_qwerty");
  const ir = parseKmn(kmn, "sil_cameroon_qwerty");
  const result = severTouchKey(ir, layout, buildTouchKeyRuleIndex(ir), {
    sourceId: "K_1",
    targetId: "T_0031",
    platformId: "tablet",
    anchorLayerId: "default",
  });

  it("completes with an honestly empty clone list — there were no rules to transplant", () => {
    expect(result.record.outcome).toBe("completed");
    expect(result.record.clonedRuleNodeIds).toEqual([]);
    expect(keyIdsOn(result.layout, "tablet", "default")).toContain("T_0031");
  });
});

// ---------------------------------------------------------------------------
// T027 — relinkTouchKey, the mirror
// ---------------------------------------------------------------------------

describe("relinkTouchKey — FR-029 mirror of a completed transplant", () => {
  const ir = parseKmn(cameroonShapeKmn(), "cameroon_shape");
  const layout = cameroonShapeLayout();
  const severed = severTouchKey(ir, layout, buildTouchKeyRuleIndex(ir), {
    sourceId: "K_1",
    targetId: "T_0301",
    platformId: "tablet",
    anchorLayerId: "default",
    recordId: "transplant-test-relink",
    recordedAt: 3_000,
  });
  const relinked = relinkTouchKey(severed.ir, severed.layout, severed.record, {
    keyRef: "tablet:default:T_0301",
    recordId: "decision-test-relink",
    recordedAt: 4_000,
  });

  it("deletes exactly the transplant's clones and restores the K_ id", () => {
    expect(relinked.ok).toBe(true);
    if (!relinked.ok) return;
    expect(rulesNaming(relinked.ir, "T_0301")).toEqual([]);
    expect(allRules(relinked.ir)).toHaveLength(allRules(ir).length);
    for (const layerId of ["default", "shift", "rightalt"]) {
      expect(keyIdsOn(relinked.layout, "tablet", layerId)).toContain("K_1");
    }
    expect(relinked.decision.action).toBe("relinked");
    expect(relinked.decision.criterion).toBe("FR-029");
  });

  it("refuses a refused transplant record and changes nothing", () => {
    const { kmn, layout: fvLayout } = loadFixture("fv_southern_carrier");
    const fvIr = parseKmn(kmn, "fv_southern_carrier");
    const refused = severTouchKey(fvIr, fvLayout, buildTouchKeyRuleIndex(fvIr), {
      sourceId: "T_H",
      targetId: "T_HX",
      platformId: "tablet",
      anchorLayerId: "default",
    });
    const attempt = relinkTouchKey(fvIr, fvLayout, refused.record, {
      keyRef: "tablet:default:T_HX",
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) {
      expect(attempt.ir).toBe(fvIr);
      expect(attempt.layout).toBe(fvLayout);
    }
  });
});

// ---------------------------------------------------------------------------
// T012 — the edit path (applyKeyEditsWithSeverance)
// ---------------------------------------------------------------------------

describe("applyKeyEditsWithSeverance — redefining edits sever, relabels never do", () => {
  const ir = parseKmn(cameroonShapeKmn(), "cameroon_shape");
  const layout = cameroonShapeLayout();

  it("a set that authors a new output on a K_-linked key severs it (FR-011)", () => {
    const ops: KeyEditOperation[] = [
      { seq: 1, kind: "set", address: "tablet:default:K_1", fields: { output: "x" } },
    ];
    const result = applyKeyEditsWithSeverance(ir, layout, ops, { recordedAt: 5_000 });
    expect(result.severances).toHaveLength(1);
    expect(result.refusals).toEqual([]);
    const severance = result.severances[0]!;
    expect(severance.sourceId).toBe("K_1");
    expect(severance.targetId).toBe("T_0078");
    expect(severance.record.clonedRuleNodeIds).toHaveLength(2);
    expect(severance.notice.descriptorId).toBe(SEVERANCE_LINE_DESCRIPTOR_ID);
    expect(severance.notice.values.physicalKeyLabel).toBe("1");
    // The edit AND the re-keying are both in the one returned state.
    const defaultKeys = result.layout.platforms[0]!.layers
      .find((l) => l.id === "default")!
      .rows.flatMap((r) => r.keys);
    const severedKey = defaultKeys.find((k) => k.id === "T_0078");
    expect(severedKey?.output).toBe("x");
    expect(rulesNaming(result.ir, "T_0078")).toHaveLength(2);
  });

  it("SC-003 atomicity: no returned artefact holds a producing T_ key without its rules", () => {
    const ops: KeyEditOperation[] = [
      { seq: 1, kind: "set", address: "tablet:default:K_1", fields: { output: "x" } },
    ];
    const result = applyKeyEditsWithSeverance(ir, layout, ops, { recordedAt: 5_000 });
    const index = buildTouchKeyRuleIndex(result.ir);
    // The invariant binds what THIS operation produces: the severed key
    // (T_0078) and every key that was wired in the source (T_030D, T_002E)
    // are wired in the result — the operation never creates or strands a
    // producing T_ without rules. (The layout's T_0300 keys are dead in
    // this shape fixture by construction — their rules were re-keyed onto
    // K_1 to build it — and are not this operation's artefact.)
    for (const id of ["T_0078", "T_030D", "T_002E"]) {
      expect(index.byId.get(id)?.length ?? 0, `${id} must have bindings`).toBeGreaterThan(0);
    }
    // And the serialised pair agrees: the .kmn carries the clone rules for
    // every severed id the layout carries.
    expect(emit(result.ir)).toContain("[T_0078]");
  });

  it("a label-only edit never triggers severance (FR-012)", () => {
    const ops: KeyEditOperation[] = [
      { seq: 1, kind: "set", address: "tablet:default:K_1", fields: { text: "one" } },
    ];
    const result = applyKeyEditsWithSeverance(ir, layout, ops, { recordedAt: 5_000 });
    expect(result.severances).toEqual([]);
    expect(result.refusals).toEqual([]);
    expect(result.ir).toBe(ir);
    expect(keyIdsOn(result.layout, "tablet", "default")).toContain("K_1");
  });

  it("an output edit on a non-K_ key does not trigger severance", () => {
    const ops: KeyEditOperation[] = [
      { seq: 1, kind: "set", address: "tablet:default:T_002E", fields: { output: "!" } },
    ];
    const result = applyKeyEditsWithSeverance(ir, layout, ops, { recordedAt: 5_000 });
    expect(result.severances).toEqual([]);
    expect(result.ir).toBe(ir);
  });

  it("a refused transplant leaves the edit standing and flags the key (no half-copy)", () => {
    const deadkeyKmn = [
      "store(&VERSION) '10.0'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_1] > deadkey(1)",
      "deadkey(1) + [K_1] > 'x'",
    ].join("\n");
    const deadkeyIr = parseKmn(deadkeyKmn, "deadkey_shape");
    const ops: KeyEditOperation[] = [
      { seq: 1, kind: "set", address: "tablet:default:K_1", fields: { output: "y" } },
    ];
    const result = applyKeyEditsWithSeverance(deadkeyIr, layout, ops, { recordedAt: 5_000 });
    expect(result.severances).toEqual([]);
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.decision.action).toBe("flagged-manual");
    expect(result.ir).toBe(deadkeyIr);
    expect(keyIdsOn(result.layout, "tablet", "default")).toContain("K_1");
  });

  it("a rename back to the source K_ id routes through relink when the record is supplied (FR-029)", () => {
    const severed = severTouchKey(ir, layout, buildTouchKeyRuleIndex(ir), {
      sourceId: "K_1",
      targetId: "T_0301",
      platformId: "tablet",
      anchorLayerId: "default",
      recordId: "transplant-test-editpath",
      recordedAt: 6_000,
    });
    const ops: KeyEditOperation[] = [
      { seq: 1, kind: "rename", address: "tablet:default:T_0301", toId: "K_1" },
    ];
    const result = applyKeyEditsWithSeverance(severed.ir, severed.layout, ops, {
      transplantRecords: [severed.record],
      recordedAt: 7_000,
    });
    expect(result.relinks).toHaveLength(1);
    expect(result.relinks[0]!.decision.action).toBe("relinked");
    expect(rulesNaming(result.ir, "T_0301")).toEqual([]);
    for (const layerId of ["default", "shift", "rightalt"]) {
      expect(keyIdsOn(result.layout, "tablet", layerId)).toContain("K_1");
      expect(keyIdsOn(result.layout, "tablet", layerId)).not.toContain("T_0301");
    }
  });

  it("a rename with NO transplant record stays a plain rename (no rules are touched)", () => {
    const severed = severTouchKey(ir, layout, buildTouchKeyRuleIndex(ir), {
      sourceId: "K_1",
      targetId: "T_0301",
      platformId: "tablet",
      anchorLayerId: "default",
    });
    const ops: KeyEditOperation[] = [
      { seq: 1, kind: "rename", address: "tablet:default:T_0301", toId: "K_1" },
    ];
    const result = applyKeyEditsWithSeverance(severed.ir, severed.layout, ops, {});
    expect(result.relinks).toEqual([]);
    expect(result.ir).toBe(severed.ir);
  });
});
