// Unit tests for placementRationale (#2300) — weighted scoring, gate G2,
// and the deterministic rationale line.
// Refs #2300.

import { describe, it, expect } from "vitest";
import type {
  IRGroup,
  MechanismAssignment,
  PlacementCandidate,
} from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import {
  buildRationaleLine,
  generalCategoryClass,
  scoreCandidate,
  type OccupancyContext,
} from "./placementRationale.ts";
import { buildSlotOccupancy, type SlotOccupant } from "./slotOccupancy.ts";

function ctx(
  occupancy: Record<string, SlotOccupant>,
  confirmedInventory: string[] = [],
  baseProduced: string[] = [],
): OccupancyContext {
  return {
    occupancy: new Map(Object.entries(occupancy)),
    confirmedInventory: new Set(confirmedInventory),
    baseProducedSet: new Set(baseProduced),
  };
}

function factor(scored: ReturnType<typeof scoreCandidate>, id: string) {
  return scored.factors.find((f) => f.id === id);
}

describe("scoreCandidate — ŋ: phonetic + plane hole beats a bare spare", () => {
  // Base K_N types 'n'; the RAlt plane of K_N is free. K_X is a true hole.
  const occupancy: Record<string, SlotOccupant> = {
    "K_N|": { char: "n", source: "base" },
  };
  const phoneticOnPlane: PlacementCandidate = {
    vkey: "K_N",
    modifiers: ["RALT"],
    mechanism: "direct",
    priorSource: "phonetic",
    priorCount: 0,
    confidence: 0.9,
  };
  const bareSpare: PlacementCandidate = {
    vkey: "K_X",
    modifiers: [],
    mechanism: "direct",
    priorSource: "manual",
    priorCount: 0,
    confidence: 0.9,
  };

  it("scores the phonetic plane placement higher (25 phonetic + 9 spare-plane + 20 occupied + 10 shift)", () => {
    const a = scoreCandidate(phoneticOnPlane, "ŋ", ctx(occupancy));
    expect(factor(a, "phonetic")?.points).toBe(25);
    expect(factor(a, "spare")?.points).toBe(9);
    expect(factor(a, "occupied")?.points).toBe(20);
    expect(a.total).toBe(64);
    const b = scoreCandidate(bareSpare, "ŋ", ctx(occupancy));
    expect(factor(b, "spare")?.points).toBe(15);
    expect(b.total).toBe(45);
    expect(a.total).toBeGreaterThan(b.total);
  });

  it("names sound first and 'nothing had to move' in the line", () => {
    const line = buildRationaleLine(scoreCandidate(phoneticOnPlane, "ŋ", ctx(occupancy)), "ŋ");
    expect(line).toMatch(/sounds like the n key/);
    expect(line).toMatch(/Nothing you use had to move/);
    expect(line).toMatch(/AltGr/);
  });
});

describe("scoreCandidate — ʔ onto a still-used apostrophe (gate G2)", () => {
  const occupancy: Record<string, SlotOccupant> = {
    "K_QUOTE|": { char: "'", source: "base" },
  };
  const glottal: PlacementCandidate = {
    vkey: "K_QUOTE",
    modifiers: [],
    mechanism: "direct",
    priorSource: "confusable",
    priorCount: 0,
    confidence: 0.85,
  };
  // ' is in the confirmed inventory here (core) and so is ʔ — the
  // both-core case of steer 2: G2 fires, but no demotion victim is picked.
  const scored = scoreCandidate(glottal, "ʔ", ctx(occupancy, ["'", "ʔ"], ["'"]));

  it("scores 0 occupied points and fires G2", () => {
    expect(factor(scored, "occupied")?.points).toBe(0);
    expect(factor(scored, "spare")?.points).toBe(0);
    expect(scored.gated).toBe("G2");
    expect(scored.incumbent).toEqual({ char: "'", need: "needed-frequent" });
  });

  it("picks NO demotion victim when both are core (frequency data would be needed)", () => {
    expect(scored.demotion?.method).toBe("ralt");
    expect(scored.demotion?.target).toBe("none");
    const line = buildRationaleLine(scored, "ʔ");
    expect(line).toMatch(/part of your alphabet too/);
    expect(line).toMatch(/frequency data/);
    expect(line).toMatch(/nothing is demoted unless you choose/);
  });
});

describe("scoreCandidate — demotion direction by orthography tier (steer 2)", () => {
  it("core incoming demotes a CONVENIENCE incumbent (occupied 5, no gate)", () => {
    const candidate: PlacementCandidate = {
      vkey: "K_QUOTE",
      modifiers: [],
      mechanism: "direct",
      priorSource: "confusable",
      priorCount: 0,
      confidence: 0.85,
    };
    // ' is base-produced punctuation only (convenience); ə is inventory (core).
    const scored = scoreCandidate(candidate, "ə", ctx(
      { "K_QUOTE|": { char: "'", source: "base" } },
      ["ə"],
      ["'"],
    ));
    expect(scored.incumbentTier).toBe("convenience");
    expect(scored.incomingTier).toBe("core");
    expect(factor(scored, "occupied")?.points).toBe(5);
    expect(scored.gated).toBeNull();
    expect(scored.demotion?.target).toBe("incumbent");
    expect(buildRationaleLine(scored, "ə")).toMatch(/moves to AltGr/);
  });

  it("convenience incoming onto a CORE incumbent inverts: the incoming char is demoted", () => {
    const candidate: PlacementCandidate = {
      vkey: "K_N",
      modifiers: [],
      mechanism: "direct",
      priorSource: "manual",
      priorCount: 0,
      confidence: 0.9,
    };
    // '-' is base-produced only (convenience); 'n' is inventory (core).
    const scored = scoreCandidate(candidate, "-", ctx(
      { "K_N|": { char: "n", source: "base" } },
      ["n"],
      ["-", "n"],
    ));
    expect(scored.incomingTier).toBe("convenience");
    expect(scored.incumbentTier).toBe("core");
    expect(factor(scored, "occupied")?.points).toBe(0);
    expect(scored.gated).toBe("G2");
    expect(scored.demotion?.target).toBe("incoming");
    const line = buildRationaleLine(scored, "-");
    expect(line).toMatch(/convenience character/);
    expect(line).toMatch(/- moves to AltGr/);
    expect(line).toMatch(/'n' keeps this key/);
  });
});

describe("generalCategoryClass", () => {
  it("classifies by Unicode general category", () => {
    expect(generalCategoryClass("Ñ")).toBe("letter");
    expect(generalCategoryClass("'")).toBe("punctuation");
    expect(generalCategoryClass("́")).toBe("mark");
    expect(generalCategoryClass("5")).toBe("number");
  });
});

describe("the Ñ/ẞ rule — type-match gate on corpus (Matthew's ruling)", () => {
  it("Ñ on N: letter displacing letter keeps FULL corpus points", () => {
    const candidate: PlacementCandidate = {
      vkey: "K_N",
      modifiers: [],
      mechanism: "direct",
      priorSource: "corpus",
      priorCount: 12,
      confidence: 0.9,
    };
    const scored = scoreCandidate(
      candidate,
      "Ñ",
      ctx({ "K_N|": { char: "n", source: "base" } }),
    );
    expect(scored.corpusLeftover).toBe(false);
    expect(factor(scored, "corpus")?.points).toBe(15);
  });

  it("Ñ on N with a phonetic anchor: phonetic leads the rationale", () => {
    const candidate: PlacementCandidate = {
      vkey: "K_N",
      modifiers: [],
      mechanism: "direct",
      priorSource: "phonetic",
      priorCount: 0,
      confidence: 0.9,
    };
    const scored = scoreCandidate(
      candidate,
      "Ñ",
      ctx({ "K_N|": { char: "n", source: "base" } }),
    );
    expect(factor(scored, "phonetic")?.points).toBe(25);
    const line = buildRationaleLine(scored, "Ñ");
    expect(line).toMatch(/because it sounds like the n key/);
  });

  it("ẞ on ': letter displacing still-used punctuation collapses corpus to the leftover tier", () => {
    const candidate: PlacementCandidate = {
      vkey: "K_QUOTE",
      modifiers: [],
      mechanism: "direct",
      priorSource: "corpus",
      priorCount: 20,
      confidence: 0.9,
    };
    const scored = scoreCandidate(
      candidate,
      "ẞ",
      ctx({ "K_QUOTE|": { char: "'", source: "base" } }, ["'"], ["'"]),
    );
    expect(scored.corpusLeftover).toBe(true);
    expect(factor(scored, "corpus")?.points).toBe(3);
    expect(factor(scored, "occupied")?.points).toBe(0);
    expect(scored.gated).toBe("G2");
    const line = buildRationaleLine(scored, "ẞ");
    // ' is core here and ẞ is not in the inventory, so the tier rule
    // inverts the demotion: ẞ is the character that moves. The line leads
    // with that cost and never cites the corpus count.
    expect(scored.demotion?.target).toBe("incoming");
    expect(line).toMatch(/part of your alphabet/);
    expect(line).toMatch(/ẞ moves to AltGr/);
    expect(line).toMatch(/keeps this key/);
    expect(line).not.toMatch(/20 keyboards/);
    expect(line).not.toMatch(/keyboards do this/);
  });
});

describe("mutual exclusivity — a combo taken earlier this session is occupied", () => {
  it("the second char's candidate on the just-taken combo scores occupied-by-needed + G2, naming the first char", () => {
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "r-quote",
          context: [{ kind: "vkey", name: "K_QUOTE", modifiers: [] }],
          output: [{ kind: "char", value: "'" }],
        },
      ],
    };
    const ir = makeTestIR([group]);
    // First char placed this session: ə takes K_QUOTE (S-01).
    const firstPlacement: MechanismAssignment = {
      scope: "individual",
      target: "ə",
      modality: "physical",
      mechanisms: [
        {
          patternId: "simple_swap",
          strategyId: "S-01",
          slotValues: { kmnRules: "+ [K_QUOTE] > U+0259" },
        },
      ],
      source: "user",
    };
    const occupancy = buildSlotOccupancy(ir, [firstPlacement]);
    // The ledger (built AFTER the session overlay) shows ə, not ', on the combo.
    expect(occupancy.get("K_QUOTE|")).toEqual({ char: "ə", source: "session" });

    const secondCandidate: PlacementCandidate = {
      vkey: "K_QUOTE",
      modifiers: [],
      mechanism: "direct",
      priorSource: "confusable",
      priorCount: 0,
      confidence: 0.85,
    };
    const scored = scoreCandidate(secondCandidate, "ʔ", {
      occupancy,
      // ə is in the confirmed inventory by definition — it is one of the
      // characters the author is adding this session.
      confirmedInventory: new Set(["ə", "ʔ"]),
      baseProducedSet: new Set(["'"]),
    });
    expect(factor(scored, "occupied")?.points).toBe(0);
    expect(scored.gated).toBe("G2");
    expect(scored.incumbent).toEqual({ char: "ə", need: "needed-frequent" });
    expect(scored.demotion?.vkey).toBe("K_QUOTE");
    // Both ə and ʔ are core orthography — no demotion victim is picked.
    expect(scored.demotion?.target).toBe("none");
    expect(buildRationaleLine(scored, "ʔ")).toMatch(/frequency data/);
  });
});

describe("scoreCandidate — demotion fallback and corpus tiers", () => {
  it("falls back to a deadkey demotion when the RAlt slot is already taken", () => {
    const occupancy: Record<string, SlotOccupant> = {
      "K_QUOTE|": { char: "'", source: "base" },
      "K_QUOTE|RALT": { char: "’", source: "base" },
    };
    const candidate: PlacementCandidate = {
      vkey: "K_QUOTE",
      modifiers: [],
      mechanism: "direct",
      priorSource: "confusable",
      priorCount: 0,
      confidence: 0.85,
    };
    // ' is a convenience incumbent here, so the demotion points at it.
    const scored = scoreCandidate(candidate, "ʔ", ctx(occupancy, ["ʔ"], ["'", "’"]));
    expect(scored.demotion?.method).toBe("deadkey");
    expect(scored.demotion?.target).toBe("incumbent");
    expect(buildRationaleLine(scored, "ʔ")).toMatch(/moves behind a deadkey/);
  });

  it("tiers corpus points by priorCount (15 / 11 / 5 / 0)", () => {
    const base: PlacementCandidate = {
      vkey: "K_X",
      modifiers: [],
      mechanism: "direct",
      priorSource: "corpus",
      priorCount: 0,
      confidence: 0.9,
    };
    const empty = ctx({});
    expect(factor(scoreCandidate({ ...base, priorCount: 12 }, "ɗ", empty), "corpus")?.points).toBe(15);
    expect(factor(scoreCandidate({ ...base, priorCount: 5 }, "ɗ", empty), "corpus")?.points).toBe(11);
    expect(factor(scoreCandidate({ ...base, priorCount: 1 }, "ɗ", empty), "corpus")?.points).toBe(5);
    expect(factor(scoreCandidate({ ...base, priorCount: 0 }, "ɗ", empty), "corpus")?.points).toBe(0);
  });

  it("a weak spare-led match confesses its weakness in the line", () => {
    const candidate: PlacementCandidate = {
      vkey: "K_X",
      modifiers: [],
      mechanism: "direct",
      priorSource: "phonetic",
      priorCount: 0,
      confidence: 0.4,
    };
    const scored = scoreCandidate(candidate, "ɗ", ctx({}));
    // phonetic 13 + spare 15 + occupied 20 + shift 10 = 58 — not weak; drop
    // the hole by occupying X with a needed-rare glyph to force a low total
    // (phonetic 13 + occupied 5 + shift 10 = 28).
    const weak = scoreCandidate(
      candidate,
      "ɗ",
      ctx({ "K_X|": { char: "x", source: "base" } }, [], ["x"]),
    );
    expect(weak.total).toBeLessThan(scored.total);
    expect(buildRationaleLine(weak, "ɗ")).toMatch(/weak match/);
  });
});
