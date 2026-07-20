/**
 * Shared measurement-assembly unit tests (spec 041 US1, T008; contract
 * measurement-model.md §Acceptance).
 *
 * Real IRs are built with the codec (`parse()`) per house convention; the site
 * lists are hand-built so the arithmetic, tie-break, and cause-tag summary are
 * checked directly.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { assembleMeasurement, notApplicableMeasurement, type AnalyzedSite } from "./measurement.js";
import type { ClassifierContext } from "./types.js";

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026 Test'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
`;

function ir() {
  return parse(HEADER, "measurement-test").ir;
}

function ctx(scriptFamily: string | null = "Latn"): ClassifierContext {
  return { scriptFamily, casing: "cased", analyzedCoverage: 1 };
}

function site(location: string, value: string, observed?: string): AnalyzedSite {
  return observed === undefined ? { location, value } : { location, value, observed };
}

describe("assembleMeasurement", () => {
  it("fully-consistent sites → consistency 1, no causeTagCounts (Edge Case)", () => {
    const sites = [site("r1", "nfc"), site("r2", "nfc"), site("r3", "nfc")];
    const cat = assembleMeasurement({ sites, ctx: ctx(), ir: ir() });
    expect(cat.value).toBe("nfc");
    expect(cat.consistency).toBe(1);
    expect(cat.causeTagCounts).toBeUndefined();
    expect(cat.provenanceTier).toBe("content-derived");
    expect(cat.evidenceSize).toBe(3);
    expect(cat.confidenceClass).toBe("confident");
  });

  it("consistency = matchingSites / analyzedSites; exceptions summarized by cause tag", () => {
    // 3 nfc + 1 nfd deviation whose observed content is a combining mark →
    // character-class fires on Latin → principled-split.
    const combining = "́";
    const sites = [
      site("r1", "nfc"),
      site("r2", "nfc"),
      site("r3", "nfc"),
      site("r4", "nfd", combining),
    ];
    const cat = assembleMeasurement({ sites, ctx: ctx("Latn"), ir: ir() });
    expect(cat.value).toBe("nfc");
    expect(cat.consistency).toBeCloseTo(0.75, 9);
    expect(cat.causeTagCounts).toEqual({ "principled-split": 1 });
    expect(cat.confidenceClass).toBe("mixed");
  });

  it("unexplained deviations fall to gap-omission residue", () => {
    const sites = [site("r1", "inline-rules"), site("r2", "inline-rules"), site("r3", "consolidated-stores")];
    const cat = assembleMeasurement({ sites, ctx: ctx("Arab"), ir: ir() });
    expect(cat.value).toBe("inline-rules");
    expect(cat.causeTagCounts).toEqual({ "gap-omission": 1 });
  });

  it("lexicographic tie-break picks the alphabetically-first value on a tie (FR-006)", () => {
    // Two "beta" and two "alpha" → tie; "alpha" < "beta" wins deterministically.
    const sites = [site("r1", "beta"), site("r2", "alpha"), site("r3", "beta"), site("r4", "alpha")];
    const cat = assembleMeasurement({ sites, ctx: ctx(), ir: ir() });
    expect(cat.value).toBe("alpha");
    expect(cat.consistency).toBeCloseTo(0.5, 9);
  });

  it("forced dominant value is honored over the plurality", () => {
    const sites = [site("r1", "inline-swap"), site("r2", "inline-swap")];
    const cat = assembleMeasurement({ sites, ctx: ctx(), ir: ir(), dominant: "none" });
    expect(cat.value).toBe("none");
    // both sites deviate from the forced dominant
    expect(cat.consistency).toBe(0);
    expect(cat.causeTagCounts).toEqual({ "gap-omission": 2 });
  });

  it("no sites → consistency 1, value undefined, undetermined confidence", () => {
    const cat = assembleMeasurement({ sites: [], ctx: ctx(), ir: ir() });
    expect(cat.value).toBeUndefined();
    expect(cat.consistency).toBe(1);
    expect(cat.confidenceClass).toBe("undetermined");
    expect(cat.evidenceSize).toBe(0);
  });
});

describe("notApplicableMeasurement", () => {
  it("emits value:undefined, notApplicable:true, content-derived, with a note (R3)", () => {
    const cat = notApplicableMeasurement("casing is caseless; caps-handling not applicable");
    expect(cat.value).toBeUndefined();
    expect(cat.notApplicable).toBe(true);
    expect(cat.provenanceTier).toBe("content-derived");
    expect(cat.consistency).toBeUndefined();
    expect(cat.causeTagCounts).toBeUndefined();
    expect(cat.analysisOutcome).not.toBe("fallback-only"); // X4: content-derived is consistent
    expect(cat.notes).toMatch(/caseless/);
  });
});
