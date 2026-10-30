// convenienceContinue — the lifted gate, value and completion (spec 107 FR-040).

import { describe, it, expect } from "vitest";
import type { ConvenienceCandidate } from "@keyboard-studio/engine";
import {
  buildRetainedValue,
  continueConvenience,
  convenienceGateFor,
  gateCandidates,
  keptPrimaries,
  skipConvenience,
  uncheckedPrimaries,
} from "./convenienceContinue.ts";
import { CONVENIENCE_REASON_NO_SURPLUS } from "./convenienceGate.ts";

const CANDS: ConvenienceCandidate[] = [
  { primary: "c", chars: ["c", "C"] },
  { primary: "q", chars: ["q", "Q"] },
] as ConvenienceCandidate[];

describe("convenienceGateFor", () => {
  it("is not-applicable with no working copy instantiated", () => {
    const gate = convenienceGateFor({ ir: null, instantiationMode: null, needed: { neededSet: new Set(), hasSignal: true } });
    expect(gate.kind).toBe("not-applicable");
    expect(gateCandidates(gate)).toEqual([]);
  });

  it("is unknown without an orthography signal", () => {
    const gate = convenienceGateFor({ ir: null, instantiationMode: "new-from-base", needed: { neededSet: new Set(), hasSignal: false } });
    expect(gate.kind).toBe("unknown");
    expect(gateCandidates(gate)).toEqual([]);
  });
});

describe("continueConvenience", () => {
  it("records everything kept with extracted provenance on a first pass", () => {
    const done = continueConvenience(CANDS, undefined);
    expect(done.record).toEqual({
      retained: [
        { char: "c", provenance: "extracted" },
        { char: "C", provenance: "extracted" },
        { char: "q", provenance: "extracted" },
        { char: "Q", provenance: "extracted" },
      ],
      rejected: [],
    });
    expect(done.result).toEqual({ phase: "C", answers: [], retainedConvenienceChars: ["c", "C", "q", "Q"] });
    expect(done.status).toEqual({ kind: "finished" });
  });

  it("records nothing when the recorded value already matches, and honours rejections", () => {
    const value = buildRetainedValue(CANDS, new Set(["c"]), new Set(["q"]), undefined);
    expect(value.rejected).toEqual(["q"]);
    const done = continueConvenience(CANDS, value);
    expect(done.record).toBeNull();
    expect(done.result.retainedConvenienceChars).toEqual(["c", "C"]);
    expect(uncheckedPrimaries(CANDS, value)).toEqual(new Set(["q"]));
    expect(keptPrimaries(CANDS, uncheckedPrimaries(CANDS, value))).toEqual(new Set(["c"]));
  });

  it("marks acted candidates asked and keeps recorded provenance for the rest", () => {
    const first = buildRetainedValue(CANDS, new Set(["c", "q"]), new Set(["c"]), undefined);
    expect(first.retained.filter((r) => r.char === "c")[0]?.provenance).toBe("asked");
    const next = buildRetainedValue(CANDS, new Set(["c", "q"]), new Set(), first);
    expect(next).toEqual(first);
  });
});

describe("skipConvenience", () => {
  it("records not-asked with its reason and completes with no retained list", () => {
    const skip = skipConvenience({ kind: "not-applicable", reason: CONVENIENCE_REASON_NO_SURPLUS }, true);
    expect(skip.status).toEqual({ kind: "not-asked", reason: CONVENIENCE_REASON_NO_SURPLUS, evidenceKey: "known|" });
    expect(skip.result).toEqual({ phase: "C", answers: [] });
  });
});
