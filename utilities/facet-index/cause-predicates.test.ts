/**
 * Cause-predicate library unit tests (spec 041 US1, T007; FR-002/003/004).
 *
 * Drives `tagExceptionSet` with hand-built exception sets so the ordering,
 * guard-scoping, and residue rules are checked without a whole classifier.
 */

import { describe, it, expect } from "vitest";

import { CAUSE_PREDICATES, tagExceptionSet } from "./cause-predicates.js";
import type { ClassifierContext, ExceptionSite } from "./types.js";

function ctx(scriptFamily: string | null, casing: ClassifierContext["casing"] = "cased"): ClassifierContext {
  return { scriptFamily, casing, analyzedCoverage: 1 };
}

const COMBINING_ACUTE = "́"; // ́  (a lone combining mark)
const COMBINING_GRAVE = "̀";

describe("tagExceptionSet — cause-predicate library", () => {
  it("empty exception set runs no predicate and yields no tag (Edge Case)", () => {
    expect(tagExceptionSet([], ctx("Latn"))).toBeNull();
  });

  it("character-class fires on Latin/Cyrillic/Greek when all deviations are combining marks", () => {
    const exceptions: ExceptionSite[] = [
      { location: "rule#3", observedValue: COMBINING_ACUTE, causeTag: "gap-omission" },
      { location: "rule#7", observedValue: COMBINING_GRAVE, causeTag: "gap-omission" },
    ];
    for (const fam of ["Latn", "Cyrl", "Grek"]) {
      expect(tagExceptionSet(exceptions, ctx(fam))).toBe("principled-split");
    }
  });

  it("character-class guard is SKIPPED on abugida/abjad — falls through to gap-omission (FR-004)", () => {
    const exceptions: ExceptionSite[] = [
      { location: "rule#3", observedValue: COMBINING_ACUTE, causeTag: "gap-omission" },
    ];
    // Arabic (abjad) and Devanagari (abugida): the diacritic-oriented predicate
    // must not apply. layer-capacity does not fit (no overflow locations), so the
    // set is the residue.
    expect(tagExceptionSet(exceptions, ctx("Arab"))).toBe("gap-omission");
    expect(tagExceptionSet(exceptions, ctx("Deva"))).toBe("gap-omission");
  });

  it("character-class does NOT fit when a deviation is not a combining mark", () => {
    const exceptions: ExceptionSite[] = [
      { location: "rule#3", observedValue: COMBINING_ACUTE, causeTag: "gap-omission" },
      { location: "rule#4", observedValue: "a", causeTag: "gap-omission" }, // a base letter, not combining
    ];
    expect(tagExceptionSet(exceptions, ctx("Latn"))).toBe("gap-omission");
  });

  it("layer-capacity fits when every deviation lives past the primary layer (overflow location)", () => {
    const exceptions: ExceptionSite[] = [
      { location: "overflow:key#11", observedValue: "x", causeTag: "gap-omission" },
      { location: "overflow:key#12", observedValue: "y", causeTag: "gap-omission" },
    ];
    // No family guard — works regardless of script.
    expect(tagExceptionSet(exceptions, ctx("Arab"))).toBe("capacity-forced");
    expect(tagExceptionSet(exceptions, ctx(null))).toBe("capacity-forced");
  });

  it("first-match-wins: character-class outranks layer-capacity when both could apply", () => {
    // Combining-mark deviations that also happen to be in overflow locations:
    // character-class comes first in the ordered library, so it wins.
    const exceptions: ExceptionSite[] = [
      { location: "overflow:rule#3", observedValue: COMBINING_ACUTE, causeTag: "gap-omission" },
    ];
    expect(CAUSE_PREDICATES[0]!.id).toBe("principled-split"); // ordering precondition
    expect(tagExceptionSet(exceptions, ctx("Latn"))).toBe("principled-split");
  });

  it("no predicate fits ⇒ gap-omission residue (FR-002)", () => {
    const exceptions: ExceptionSite[] = [
      { location: "rule#3", observedValue: "nfd", causeTag: "gap-omission" },
    ];
    expect(tagExceptionSet(exceptions, ctx("Latn"))).toBe("gap-omission");
  });
});
