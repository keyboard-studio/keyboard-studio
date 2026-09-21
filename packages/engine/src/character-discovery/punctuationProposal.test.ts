import { describe, expect, it } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule, RawKmnFragment } from "@keyboard-studio/contracts";
import {
  ASCII_PUNCTUATION_FLOOR,
  basePunctuationCoverage,
  buildPunctuationProposal,
  type BasePunctuationCoverage,
} from "./punctuationProposal.js";
import type { SourcedInventory } from "./exemplarTypes.js";
import { loadExemplarIndex } from "./exemplarIndex.js";
import { charactersInTier, sourceExemplars } from "./exemplarSource.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(rules: IRRule[]): IRGroup {
  return { nodeId: "group#main", name: "main", usingKeys: true, readonly: false, rules };
}

let ruleSeq = 0;
function charRule(value: string): IRRule {
  ruleSeq += 1;
  return {
    nodeId: `rule#${ruleSeq}`,
    context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
    output: [{ kind: "char", value }],
  };
}

function irProducing(chars: string, raw: RawKmnFragment[] = []) {
  return makeTestIR([makeGroup([...chars].map(charRule))], [], raw);
}

function opaqueFragment(producedOutput?: string[]): RawKmnFragment {
  return {
    nodeId: "frag#opaque",
    origin: "imported",
    sourceText: "if(&x = 1) c 'y'",
    reason: "opaque test fragment",
    ...(producedOutput !== undefined ? { producedOutput } : {}),
  };
}

function inventory(punctuation: string[], main: string[] = ["a"]): SourcedInventory {
  return {
    resolvedTag: "xx",
    source: "cldr",
    confidence: "approved",
    characters: [
      ...main.map((char) => ({
        char,
        tier: "main" as const,
        source: "cldr" as const,
        confidence: "approved" as const,
      })),
      ...punctuation.map((char) => ({
        char,
        tier: "punctuation" as const,
        source: "cldr" as const,
        confidence: "approved" as const,
      })),
    ],
    digraphs: [],
  };
}

const NONE: ReadonlySet<string> = new Set();
const known = (produced: string[]): BasePunctuationCoverage => ({ produced, coverageComplete: true });
const intersect = (a: readonly string[], b: readonly string[]) => a.filter((x) => b.includes(x));

// ---------------------------------------------------------------------------
// ASCII_PUNCTUATION_FLOOR (FR-007)
// ---------------------------------------------------------------------------

describe("ASCII_PUNCTUATION_FLOOR", () => {
  it("is exactly the 32 characters of the four FR-007 ranges, in code-point order", () => {
    expect(ASCII_PUNCTUATION_FLOOR).toHaveLength(32);
    expect(ASCII_PUNCTUATION_FLOOR.join("")).toBe("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~");
    const cps = ASCII_PUNCTUATION_FLOOR.map((c) => c.codePointAt(0)!);
    const inRange = cps.every(
      (cp) =>
        (cp >= 0x21 && cp <= 0x2f) ||
        (cp >= 0x3a && cp <= 0x40) ||
        (cp >= 0x5b && cp <= 0x60) ||
        (cp >= 0x7b && cp <= 0x7e),
    );
    expect(inRange).toBe(true);
    expect(new Set(cps).size).toBe(32);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ASCII_PUNCTUATION_FLOOR)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// basePunctuationCoverage
// ---------------------------------------------------------------------------

describe("basePunctuationCoverage", () => {
  it("keeps only the punctuation category of the produced set, NFC-deduped", () => {
    const cov = basePunctuationCoverage(irProducing("a.b,c!.$"));
    // `$` is a Unicode symbol, not punctuation; letters are excluded.
    expect([...cov.produced].sort()).toEqual([",", ".", "!"].sort());
    expect(cov.coverageComplete).toBe(true);
  });

  it("flags coverage incomplete when an opaque fragment has no producedOutput sketch — the same test computeInventoryDelta applies", () => {
    expect(basePunctuationCoverage(irProducing(".", [opaqueFragment()])).coverageComplete).toBe(false);
    expect(basePunctuationCoverage(irProducing(".", [opaqueFragment([])])).coverageComplete).toBe(false);
    expect(basePunctuationCoverage(irProducing(".", [opaqueFragment(["?"])])).coverageComplete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildPunctuationProposal — contract §1 invariants
// ---------------------------------------------------------------------------

describe("buildPunctuationProposal", () => {
  it("cldrGroup and baseGroup are disjoint by NFC; a character in both sources appears once, under CLDR (FR-010, SC-003)", () => {
    const p = buildPunctuationProposal({
      exemplars: inventory([".", ",", "¿"]),
      baseCoverage: known([".", "!", "?"]),
      rejected: NONE,
      authorChosen: NONE,
    });
    expect(p.cldrGroup).toEqual([".", ",", "¿"]);
    expect(p.baseGroup).toEqual(["!", "?"]);
    expect(intersect(p.cldrGroup, p.baseGroup)).toEqual([]);
  });

  it("dedupes each group so the same character attested twice counts once", () => {
    const p = buildPunctuationProposal({
      exemplars: inventory([".", ".", ","]),
      baseCoverage: known(["!", "!"]),
      rejected: NONE,
      authorChosen: NONE,
    });
    expect(p.cldrGroup).toEqual([".", ","]);
    expect(p.baseGroup).toEqual(["!"]);
  });

  it("never proposes a rejected character in either group (FR-022)", () => {
    const p = buildPunctuationProposal({
      exemplars: inventory([".", ","]),
      baseCoverage: known(["!", "?"]),
      rejected: new Set([",", "?"]),
      authorChosen: NONE,
    });
    expect(p.cldrGroup).toEqual(["."]);
    expect(p.baseGroup).toEqual(["!"]);
  });

  it("never proposes a character the author already chose themselves (FR-005)", () => {
    const p = buildPunctuationProposal({
      exemplars: inventory([".", ","]),
      baseCoverage: known(["!", "?"]),
      rejected: NONE,
      authorChosen: new Set([".", "!"]),
    });
    expect(p.cldrGroup).toEqual([","]);
    expect(p.baseGroup).toEqual(["?"]);
  });

  it("with known, complete coverage the base group is every produced punctuation char not otherwise accounted for, and the floor plays no part (FR-009)", () => {
    const produced = [".", ",", "!", "?", "،", "؟"]; // includes Arabic comma / question mark
    const p = buildPunctuationProposal({
      exemplars: inventory(["."]),
      baseCoverage: known(produced),
      rejected: new Set(["!"]),
      authorChosen: new Set([","]),
    });
    expect(p.baseGroup).toEqual(["?", "،", "؟"]);
    expect(p.baseCoverageIncomplete).toBe(false);
    // Floor members the base does not produce are NOT smuggled in.
    expect(p.baseGroup).not.toContain("#");
  });

  it("with no base coverage at all the base group degrades to the floor and says so (FR-007, FR-008)", () => {
    const p = buildPunctuationProposal({
      exemplars: inventory(["."]),
      baseCoverage: null,
      rejected: new Set(["!"]),
      authorChosen: new Set(["?"]),
    });
    expect(p.baseCoverageIncomplete).toBe(true);
    expect(p.baseGroup.every((c) => ASCII_PUNCTUATION_FLOOR.includes(c))).toBe(true);
    // Filtered by the CLDR group, the rejections and the author's picks…
    expect(p.baseGroup).not.toContain(".");
    expect(p.baseGroup).not.toContain("!");
    expect(p.baseGroup).not.toContain("?");
    // …and nothing else is missing.
    expect(p.baseGroup).toHaveLength(32 - 3);
  });

  it("with incomplete coverage the KNOWN set is discarded, not merged with the floor (one-way degradation)", () => {
    const p = buildPunctuationProposal({
      exemplars: null,
      baseCoverage: { produced: [".", "،"], coverageComplete: false },
      rejected: NONE,
      authorChosen: NONE,
    });
    expect(p.baseCoverageIncomplete).toBe(true);
    expect(p.baseGroup.every((c) => ASCII_PUNCTUATION_FLOOR.includes(c))).toBe(true);
    // The base's real (but untrustworthy) non-ASCII output is not proposed.
    expect(p.baseGroup).not.toContain("،");
    expect(p.baseGroup).toEqual([...ASCII_PUNCTUATION_FLOOR]);
  });

  it("reports why the CLDR group is absent: no-exemplars for a null inventory, empty-tier for a source with no punctuation tier, undefined otherwise", () => {
    const none = buildPunctuationProposal({
      exemplars: null,
      baseCoverage: null,
      rejected: NONE,
      authorChosen: NONE,
    });
    expect(none.cldrAbsentReason).toBe("no-exemplars");
    expect(none.cldrGroup).toEqual([]);

    const emptyTier = buildPunctuationProposal({
      exemplars: inventory([]),
      baseCoverage: null,
      rejected: NONE,
      authorChosen: NONE,
    });
    expect(emptyTier.cldrAbsentReason).toBe("empty-tier");
    expect(emptyTier.cldrGroup).toEqual([]);

    const present = buildPunctuationProposal({
      exemplars: inventory(["."]),
      baseCoverage: null,
      rejected: NONE,
      authorChosen: NONE,
    });
    expect(present.cldrAbsentReason).toBeUndefined();

    // A tier fully filtered by rejections is NOT "absent" — the source had it.
    const filtered = buildPunctuationProposal({
      exemplars: inventory(["."]),
      baseCoverage: null,
      rejected: new Set(["."]),
      authorChosen: NONE,
    });
    expect(filtered.cldrGroup).toEqual([]);
    expect(filtered.cldrAbsentReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SC-001 oracle — every locale in the committed offline index, not a sample
// ---------------------------------------------------------------------------

describe("SC-001 — zero-interaction Done equals the locale's punctuation tier, per tag", () => {
  it("for every indexed locale with a non-empty punctuation tier, cldrGroup equals charactersInTier(inv, 'punctuation') NFC-deduped", async () => {
    const index = await loadExemplarIndex();
    let checked = 0;
    const mismatches: string[] = [];
    for (const id of Object.keys(index.locales)) {
      const inv = sourceExemplars(id);
      if (inv === null) continue;
      const tier = charactersInTier(inv, "punctuation");
      if (tier.length === 0) continue;
      const expected = [...new Set(tier.map((c) => c.normalize("NFC")))];
      const { cldrGroup } = buildPunctuationProposal({
        exemplars: inv,
        baseCoverage: null,
        rejected: NONE,
        authorChosen: NONE,
      });
      checked += 1;
      if (cldrGroup.join("\u0000") !== expected.join("\u0000")) mismatches.push(id);
    }
    expect(mismatches).toEqual([]);
    // The oracle is only meaningful if it actually ran over the corpus.
    expect(checked).toBeGreaterThan(100);
  });
});
