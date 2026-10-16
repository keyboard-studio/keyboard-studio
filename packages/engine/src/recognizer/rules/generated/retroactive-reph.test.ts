// Direct match/lift tests for the generated S-09 retroactive-reph rule.
// S-09 has no hand-written twin (like S-03/S-07), so — per the issue
// #2223 ruling — these are direct assertions: the sil_devanagari_phonetic
// reph family (base + matra + nukta scaled variants) and the hindi_modular
// bare-`context` spelling as positives, and non-claims on the neighbouring
// shapes the predicate is designed to refuse (rakār, generic conjuncts,
// the [context, index] matra family, Khmer coeng, ZWNJ-prefixed
// second-order reph, guarded rules per spec 103 FR-007, the S-03/S-07
// shapes).
import { describe, it, expect } from "vitest";
import { rule as retroactiveReph } from "./retroactive-reph.js";
import { recognizePatterns } from "../../index.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRRule, IRStore } from "@keyboard-studio/contracts";
import {
  buildPhoneticRephIR,
  buildHindiRephIR,
  buildTelexCycleIR,
  buildIpaSequenceIR,
  devanagariRephStores,
  rephBaseRule,
  REPH_RA,
  REPH_VIRAMA,
} from "../__fixtures__/recognizerIr.js";

describe("generated/retroactive-reph match", () => {
  it("phonetic family: 1 match owning all three rules and both stores, with pattern slots", () => {
    const { ir, baseNodeId, matraNodeId, nuktaNodeId } = buildPhoneticRephIR();
    const matches = retroactiveReph.match(ir);

    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m).toBeDefined();
    expect(m!.patternId).toBe("retroactive_reph#ConsonantsU+R");
    expect(m!.ownedNodes.map((n) => n.nodeId).sort()).toEqual(
      [baseNodeId, matraNodeId, nuktaNodeId, "store#ConsonantsU", "store#MatraVsU"].sort(),
    );
    expect(m!.slotValues["consonantChars"]).toBe(
      "कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह",
    );
    expect(m!.slotValues["triggerChar"]).toBe("R");
    expect(m!.slotValues["raChar"]).toBe(REPH_RA);
    expect(m!.slotValues["viramaChar"]).toBe(REPH_VIRAMA);
  });

  it("hindi bare-context spelling: 1 match owning both rules and the store", () => {
    const { ir, baseNodeId, ikarNodeId } = buildHindiRephIR();
    const matches = retroactiveReph.match(ir);

    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe("retroactive_reph#cl+'");
    expect(matches[0]!.ownedNodes.map((n) => n.nodeId).sort()).toEqual(
      [baseNodeId, ikarNodeId, "store#cl"].sort(),
    );
    expect(matches[0]!.slotValues["triggerChar"]).toBe("'");
    expect(matches[0]!.slotValues["raChar"]).toBe(REPH_RA);
    expect(matches[0]!.slotValues["viramaChar"]).toBe(REPH_VIRAMA);
  });

  it("two reph keys over one store form two clusters with distinct pattern ids", () => {
    const { ir } = buildPhoneticRephIR();
    ir.groups[0]!.rules.push(rephBaseRule("rule#reph-lower", "r"));

    const matches = retroactiveReph.match(ir);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.patternId).sort()).toEqual(
      ["retroactive_reph#ConsonantsU+R", "retroactive_reph#ConsonantsU+r"].sort(),
    );
  });
});

describe("generated/retroactive-reph lift", () => {
  it("lifts to a Retroactive reph pattern whose fragment regenerates the base rule", () => {
    const { ir } = buildPhoneticRephIR();
    const [m] = retroactiveReph.match(ir);
    const pattern = retroactiveReph.lift(m!);

    expect(pattern.title).toBe("Retroactive reph");
    expect(pattern.strategyId).toBe("S-09");
    expect(pattern.kmnFragment).toContain(
      'any({{consonantChars}}) + "{{triggerChar}}" > {{raChar}} {{viramaChar}} index({{consonantChars}}, 1)',
    );
    const byId = new Map(pattern.questions.map((q) => [q.id, q]));
    expect(byId.get("triggerChar")?.default).toBe("R");
    expect(byId.get("raChar")?.default).toBe(REPH_RA);
    expect(byId.get("viramaChar")?.default).toBe(REPH_VIRAMA);
    expect(byId.get("consonantChars")?.default).toBe(
      "कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह",
    );
  });
});

describe("generated/retroactive-reph non-claims", () => {
  function irWith(rules: IRRule[], stores: IRStore[] = devanagariRephStores()) {
    return makeTestIR(
      [
        {
          nodeId: "group#main",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules,
        },
      ],
      stores,
    );
  }

  it("rakār is NOT claimed (same context and trigger, mirror mechanism)", () => {
    // sil_devanagari_romanized:284 — any(ConsonantsU) + "R" >
    // index(ConsonantsU, 1) U+094D U+0930: virama follows the re-emitted
    // consonant, ra comes last.
    const ir = irWith([
      {
        nodeId: "rule#rakar",
        context: [
          { kind: "any", storeRef: "ConsonantsU" },
          { kind: "raw", text: "+" },
          { kind: "char", value: "R" },
        ],
        output: [
          { kind: "index", storeRef: "ConsonantsU", offset: 1 },
          { kind: "char", value: REPH_VIRAMA },
          { kind: "char", value: REPH_RA },
        ],
      },
    ]);
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("generic conjunct formation is NOT claimed (gautami_devanagari:326 shape)", () => {
    // any(m_bearer) any(m_bearer) > context(1) U+094D context(2) — the
    // virama follows the re-emitted first consonant; no reph key.
    const ir = irWith(
      [
        {
          nodeId: "rule#conjunct",
          context: [
            { kind: "any", storeRef: "m_bearer" },
            { kind: "any", storeRef: "m_bearer" },
          ],
          output: [
            { kind: "context", offset: 1 },
            { kind: "char", value: REPH_VIRAMA },
            { kind: "context", offset: 2 },
          ],
        },
      ],
      [
        {
          nodeId: "store#m_bearer",
          name: "m_bearer",
          isSystem: false,
          items: [..."कखग"].map((c) => ({ kind: "char" as const, value: c })),
        },
      ],
    );
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("half-form is NOT claimed (hindi_modular:170 shape)", () => {
    // any(cl) + '\\' > context U+094D U+200D — output begins with
    // `context`, no ra+virama prefix.
    const { ir: hindi } = buildHindiRephIR();
    const ir = irWith(
      [
        {
          nodeId: "rule#half",
          context: [
            { kind: "any", storeRef: "cl" },
            { kind: "raw", text: "+" },
            { kind: "char", value: "\\" },
          ],
          output: [
            { kind: "context", offset: 0 },
            { kind: "char", value: REPH_VIRAMA },
            { kind: "char", value: "\u200D" },
          ],
        },
      ],
      hindi.stores,
    );
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("the [context, index] matra family is NOT claimed (gautami_devanagari:319 shape)", () => {
    // any(m_bearer) any(vowel) > context(1) index(matra, 2) — vowel→matra
    // conversion; the index points at the second context element, the
    // output has no ra+virama prefix.
    const stores: IRStore[] = ["m_bearer", "vowel", "matra"].map((name) => ({
      nodeId: `store#${name}`,
      name,
      isSystem: false,
      items: [..."कखग"].map((c) => ({ kind: "char" as const, value: c })),
    }));
    const ir = irWith(
      [
        {
          nodeId: "rule#matra",
          context: [
            { kind: "any", storeRef: "m_bearer" },
            { kind: "any", storeRef: "vowel" },
          ],
          output: [
            { kind: "context", offset: 1 },
            { kind: "index", storeRef: "matra", offset: 2 },
          ],
        },
      ],
      stores,
    );
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("Khmer coeng subscripting is NOT claimed (krung:51-52 shape)", () => {
    // any(sin_con) + [K_R] > context U+17D2 U+179A — vkey trigger,
    // output [context, char, char], no prefix.
    const ir = irWith(
      [
        {
          nodeId: "rule#coeng",
          context: [
            { kind: "any", storeRef: "ConsonantsU" },
            { kind: "raw", text: "+" },
            { kind: "vkey", name: "K_R", modifiers: [] },
          ],
          output: [
            { kind: "context", offset: 0 },
            { kind: "char", value: "\u17D2" },
            { kind: "char", value: "\u179A" },
          ],
        },
      ],
    );
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("ZWNJ-prefixed second-order reph is NOT claimed (hindi_modular:182 shape)", () => {
    // any(cl) U+094D any(cl) + "'" > U+200C U+0930 U+094D context — the
    // output begins with U+200C, before the ra.
    const { ir: hindi } = buildHindiRephIR();
    const ir = irWith(
      [
        {
          nodeId: "rule#zwnj-reph",
          context: [
            { kind: "any", storeRef: "cl" },
            { kind: "char", value: REPH_VIRAMA },
            { kind: "any", storeRef: "cl" },
            { kind: "raw", text: "+" },
            { kind: "char", value: "'" },
          ],
          output: [
            { kind: "char", value: "\u200C" },
            { kind: "char", value: REPH_RA },
            { kind: "char", value: REPH_VIRAMA },
            { kind: "context", offset: 0 },
          ],
        },
      ],
      hindi.stores,
    );
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("[char, char, index] output shape without the reph prefix is NOT claimed (taigi family)", () => {
    const ir = irWith([
      {
        nodeId: "rule#taigi-like",
        context: [
          { kind: "any", storeRef: "ConsonantsU" },
          { kind: "raw", text: "+" },
          { kind: "char", value: "z" },
        ],
        output: [
          { kind: "char", value: "o" },
          { kind: "char", value: "\u0358" },
          { kind: "index", storeRef: "ConsonantsU", offset: 1 },
        ],
      },
    ]);
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("guarded reph rule is NOT claimed (spec 103 FR-007)", () => {
    const rule = rephBaseRule("rule#guarded-reph");
    rule.context = [
      { kind: "if", store: "option_reph", value: "" },
      ...rule.context,
    ];
    const ir = irWith([rule]);
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("a rule whose output also types the trigger is NOT claimed", () => {
    const rule = rephBaseRule("rule#trigger-out");
    rule.output = [...rule.output, { kind: "char", value: "R" }];
    const ir = irWith([rule]);
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("partial re-emission (matra dropped) is NOT claimed", () => {
    const { ir: phonetic } = buildPhoneticRephIR();
    const ir = irWith(
      [
        {
          nodeId: "rule#partial",
          context: [
            { kind: "any", storeRef: "ConsonantsU" },
            { kind: "any", storeRef: "MatraVsU" },
            { kind: "raw", text: "+" },
            { kind: "char", value: "R" },
          ],
          output: [
            { kind: "char", value: REPH_RA },
            { kind: "char", value: REPH_VIRAMA },
            { kind: "index", storeRef: "ConsonantsU", offset: 1 },
          ],
        },
      ],
      phonetic.stores,
    );
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("S-07 cancel shape is NOT claimed", () => {
    const { ir } = buildTelexCycleIR();
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });

  it("S-03 sequence-replace shape is NOT claimed", () => {
    const { ir } = buildIpaSequenceIR({ guarded: false });
    expect(retroactiveReph.match(ir)).toHaveLength(0);
  });
});

describe("generated/retroactive-reph full pipeline", () => {
  it("recognizePatterns owns the phonetic family under an S-09 pattern, ratio 1", () => {
    const { ir, baseNodeId } = buildPhoneticRephIR();
    const { ir: out, recognizedRatio } = recognizePatterns(ir);

    expect(recognizedRatio).toBe(1);
    const base = out.groups[0]!.rules.find((r) => r.nodeId === baseNodeId);
    expect(base?.ownedByPattern).toBe("retroactive_reph#ConsonantsU+R");
    const s09 = out.recognizedPatterns.find(
      (p) => p.id === "retroactive_reph#ConsonantsU+R",
    );
    expect(s09).toBeDefined();
    expect(s09!.strategyId).toBe("S-09");
  });
});
