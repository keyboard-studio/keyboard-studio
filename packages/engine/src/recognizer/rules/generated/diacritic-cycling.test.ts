// Direct match/lift tests for the generated S-07 diacritic-cycling rule.
// S-07 has no hand-written twin (like S-03), so — per the issue #2212
// ruling — these are direct assertions: the vietnamese_telex apply/cancel
// pair in its letter-key and digit-key (VNI) forms, and non-claims on the
// neighbouring shapes the predicate is designed to refuse (guarded rules
// per spec 103 FR-007, generic [index, char] diacritic-add, cross-tone
// swaps, literal enumeration, the S-01/S-03 shapes).
import { describe, it, expect } from "vitest";
import { rule as diacriticCycling } from "./diacritic-cycling.js";
import { recognizePatterns } from "../../index.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRRule } from "@keyboard-studio/contracts";
import {
  buildTelexCycleIR,
  buildVniCycleIR,
  buildTelexCancelOnlyIR,
  buildIpaSequenceIR,
  telexCancelRule,
  s01Rule,
} from "../__fixtures__/recognizerIr.js";

describe("generated/diacritic-cycling match", () => {
  it("telex apply/cancel pair: 1 match owning both rules and both stores, with pattern slots", () => {
    const { ir, cancelNodeId, applyNodeId } = buildTelexCycleIR();
    const matches = diacriticCycling.match(ir);

    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m).toBeDefined();
    expect(m!.patternId).toBe("diacritic_cycling#vowels_sac+s");
    expect(m!.ownedNodes.map((n) => n.nodeId).sort()).toEqual(
      [cancelNodeId, applyNodeId, "store#vowels", "store#vowels_sac"].sort(),
    );
    expect(m!.slotValues["plainChars"]).toBe("aeiou");
    expect(m!.slotValues["markedChars"]).toBe("áéíóú");
    expect(m!.slotValues["cycleKey"]).toBe("s");
  });

  it("VNI digit-key pair: 1 match with cycleKey '1'", () => {
    const { ir } = buildVniCycleIR();
    const matches = diacriticCycling.match(ir);

    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe("diacritic_cycling#vowels_sac+1");
    expect(matches[0]!.slotValues["cycleKey"]).toBe("1");
  });

  it("cancel rule without a paired apply still forms a cluster", () => {
    const { ir, cancelNodeId } = buildTelexCancelOnlyIR();
    const matches = diacriticCycling.match(ir);

    expect(matches).toHaveLength(1);
    expect(matches[0]!.ownedNodes.map((n) => n.nodeId).sort()).toEqual(
      [cancelNodeId, "store#vowels", "store#vowels_sac"].sort(),
    );
  });

  it("two tones over distinct store pairs form two clusters", () => {
    const { ir } = buildTelexCycleIR();
    // Add a second family: vowels → vowels_huyen (àèìòù), key 'f'.
    ir.stores.push({
      nodeId: "store#vowels_huyen",
      name: "vowels_huyen",
      isSystem: false,
      items: [..."àèìòù"].map((c) => ({ kind: "char" as const, value: c })),
    });
    const huyenCancel: IRRule = {
      nodeId: "rule#telex-cancel-huyen",
      context: [
        { kind: "any", storeRef: "vowels_huyen" },
        { kind: "raw", text: "+" },
        { kind: "char", value: "f" },
      ],
      output: [
        { kind: "index", storeRef: "vowels", offset: 1 },
        { kind: "char", value: "f" },
      ],
    };
    ir.groups[0]!.rules.push(huyenCancel);

    const matches = diacriticCycling.match(ir);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.patternId).sort()).toEqual(
      ["diacritic_cycling#vowels_huyen+f", "diacritic_cycling#vowels_sac+s"].sort(),
    );
  });
});

describe("generated/diacritic-cycling lift", () => {
  it("lifts to a Diacritic cycling pattern whose fragment regenerates the pair", () => {
    const { ir } = buildTelexCycleIR();
    const [m] = diacriticCycling.match(ir);
    const pattern = diacriticCycling.lift(m!);

    expect(pattern.title).toBe("Diacritic cycling");
    expect(pattern.strategyId).toBe("S-07");
    // lift() returns the schematic template (the S-02/S-03 contract): slot
    // placeholders stay in the fragment; the recognized values ride on the
    // questions as defaults and substitute at render time.
    expect(pattern.kmnFragment).toContain(
      'any({{markedChars}}) + "{{cycleKey}}" > index({{plainChars}}, 1) "{{cycleKey}}"',
    );
    expect(pattern.kmnFragment).toContain(
      'any({{plainChars}}) + "{{cycleKey}}" > index({{markedChars}}, 1)',
    );
    const byId = new Map(pattern.questions.map((q) => [q.id, q]));
    expect(byId.get("cycleKey")?.default).toBe("s");
    expect(byId.get("plainChars")?.default).toBe("aeiou");
    expect(byId.get("markedChars")?.default).toBe("áéíóú");
  });
});

describe("generated/diacritic-cycling non-claims", () => {
  function irWith(rules: IRRule[]) {
    const stores = buildTelexCycleIR().ir.stores;
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

  it("guarded cancel is NOT claimed (spec 103 FR-007)", () => {
    const ir = irWith([telexCancelRule("rule#guarded", { guarded: true })]);
    expect(diacriticCycling.match(ir)).toHaveLength(0);
  });

  it("output char differing from the trigger is NOT claimed (generic diacritic-add)", () => {
    const ir = irWith([telexCancelRule("rule#add", { outChar: "x" })]);
    expect(diacriticCycling.match(ir)).toHaveLength(0);
  });

  it("index into the context store itself is NOT claimed", () => {
    const ir = irWith([
      telexCancelRule("rule#same-store", { indexStore: "vowels_sac" }),
    ]);
    expect(diacriticCycling.match(ir)).toHaveLength(0);
  });

  it("wrong index offset is NOT claimed", () => {
    const ir = irWith([telexCancelRule("rule#offset", { offset: 2 })]);
    expect(diacriticCycling.match(ir)).toHaveLength(0);
  });

  it("cross-tone swap rule is NOT claimed", () => {
    // any(vowels_sac) + 'f' > index(vowels_huyen, 1) — output is a bare
    // index (no re-emitted char); the target is a third store.
    const { ir } = buildTelexCycleIR();
    ir.stores.push({
      nodeId: "store#vowels_huyen",
      name: "vowels_huyen",
      isSystem: false,
      items: [..."àèìòù"].map((c) => ({ kind: "char" as const, value: c })),
    });
    const swapOnly = makeTestIR(
      [
        {
          nodeId: "group#main",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [
            {
              nodeId: "rule#swap",
              context: [
                { kind: "any", storeRef: "vowels_sac" },
                { kind: "raw", text: "+" },
                { kind: "char", value: "f" },
              ],
              output: [{ kind: "index", storeRef: "vowels_huyen", offset: 1 }],
            } satisfies IRRule,
          ],
        },
      ],
      ir.stores,
    );
    expect(diacriticCycling.match(swapOnly)).toHaveLength(0);
  });

  it("literal telex enumeration rule is NOT claimed", () => {
    // 'ă' + 'w' > 'aw' — the dominant literal form in telex.
    const ir = irWith([
      {
        nodeId: "rule#literal",
        context: [
          { kind: "char", value: "ă" },
          { kind: "raw", text: "+" },
          { kind: "char", value: "w" },
        ],
        output: [
          { kind: "char", value: "a" },
          { kind: "char", value: "w" },
        ],
      },
    ]);
    expect(diacriticCycling.match(ir)).toHaveLength(0);
  });

  it("S-03 sequence-replace shape is NOT claimed", () => {
    const { ir } = buildIpaSequenceIR({ guarded: false });
    expect(diacriticCycling.match(ir)).toHaveLength(0);
  });

  it("S-01 single swap is NOT claimed", () => {
    const ir = makeTestIR(
      [
        {
          nodeId: "group#main",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [s01Rule("rule#swap1", "K_A", [], "à")],
        },
      ],
      [],
    );
    expect(diacriticCycling.match(ir)).toHaveLength(0);
  });
});

describe("generated/diacritic-cycling full pipeline", () => {
  it("recognizePatterns owns the cancel rule under an S-07 pattern, ratio 1", () => {
    const { ir, cancelNodeId } = buildTelexCycleIR();
    const { ir: out, recognizedRatio } = recognizePatterns(ir);

    expect(recognizedRatio).toBe(1);
    const cancel = out.groups[0]!.rules.find((r) => r.nodeId === cancelNodeId);
    expect(cancel?.ownedByPattern).toBe("diacritic_cycling#vowels_sac+s");
    // The paired apply rule is owned by exactly one pattern: S-07 when it
    // attaches here, or S-03 (its parallel-store shape is also a genuine
    // base→marked remap, and that pass runs first). Either is the
    // documented interaction — what must never happen is double ownership,
    // which recognizePatterns' consistency assertion already forbids.
    const s07 = out.recognizedPatterns.find(
      (p) => p.id === "diacritic_cycling#vowels_sac+s",
    );
    expect(s07).toBeDefined();
    expect(s07!.strategyId).toBe("S-07");
  });
});
