// Unit tests for steps/phases.ts — the display-only A-F phase mapping over
// the real manifest step ids, plus its structural drift guard.

import { describe, it, expect, vi, afterEach } from "vitest";
import { manifest } from "./manifest.ts";
import {
  PHASES,
  UNPHASED_STEP_IDS,
  phaseOfStep,
  validatePhaseMap,
  type StepId,
} from "./phases.ts";

// ---------------------------------------------------------------------------
// validatePhaseMap — passes for the shipped manifest + PHASES
// ---------------------------------------------------------------------------

describe("validatePhaseMap — shipped manifest", () => {
  it("does not throw for the shipped manifest and PHASES", () => {
    expect(() => validatePhaseMap()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// phaseOfStep
// ---------------------------------------------------------------------------

describe("phaseOfStep", () => {
  it("returns the D/'Discard' phase for 'carve'", () => {
    const phase = phaseOfStep("carve");
    expect(phase?.letter).toBe("D");
  });

  it("returns null for 'package' (reserved, unphased stub)", () => {
    expect(phaseOfStep("package")).toBeNull();
  });

  it("returns the A/'Survey' phase for 'identity'", () => {
    expect(phaseOfStep("identity")?.letter).toBe("A");
  });

  it("returns the F/'Finalize' phase for 'help'", () => {
    expect(phaseOfStep("help")?.letter).toBe("F");
  });

  // One parametrised case per real manifest step id (excluding UNPHASED_STEP_IDS)
  // asserting it resolves to SOME phase — drives the "every manifest step has a
  // phase" invariant off the real manifest rather than a hardcoded id list.
  const unphased = new Set(UNPHASED_STEP_IDS);
  for (const step of manifest) {
    if (unphased.has(step.id as StepId)) continue;
    it(`'${step.id}' resolves to a phase (not null)`, () => {
      expect(phaseOfStep(step.id as StepId)).not.toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// Regression: a manifest step added without a phase assignment must fail the
// guard. Driven off the real manifest (a synthetic extra step appended to a
// copy of it), not a hardcoded list — this is the whole point of the guard.
// ---------------------------------------------------------------------------

describe("regression — an unassigned manifest step fails validatePhaseMap", () => {
  it("every real manifest step id (besides UNPHASED_STEP_IDS) is claimed by exactly one phase", () => {
    const unphased = new Set(UNPHASED_STEP_IDS);
    const claimCounts = new Map<string, number>();
    for (const phase of PHASES) {
      for (const id of phase.stepIds) {
        claimCounts.set(id, (claimCounts.get(id) ?? 0) + 1);
      }
    }

    for (const step of manifest) {
      if (unphased.has(step.id as StepId)) {
        expect(
          claimCounts.get(step.id) ?? 0,
          `unphased step "${step.id}" should not appear in any phase`,
        ).toBe(0);
      } else {
        expect(
          claimCounts.get(step.id) ?? 0,
          `manifest step "${step.id}" must be claimed by exactly one phase`,
        ).toBe(1);
      }
    }
  });

});

// Exercises the actual guard function (not a simulated re-check of its
// logic): mocks steps/manifest.ts to append one real manifest step plus one
// extra, unassigned step id, re-imports steps/phases.ts fresh, and asserts
// the real validatePhaseMap() throws naming that id. This is what fires the
// day a manifest step lands without a PHASES/UNPHASED_STEP_IDS entry.
describe("regression — validatePhaseMap throws on an unassigned manifest step", () => {
  afterEach(() => {
    vi.doUnmock("./manifest.ts");
    vi.resetModules();
  });

  it("throws naming the step id when the manifest gains a step with no phase assignment", async () => {
    const extraId = "a_new_step_nobody_assigned_a_phase_to";
    vi.resetModules();
    vi.doMock("./manifest.ts", async () => {
      const real =
        await vi.importActual<typeof import("./manifest.ts")>("./manifest.ts");
      return {
        ...real,
        manifest: [
          ...real.manifest,
          {
            kind: "editor-step",
            id: extraId,
            title: "Unassigned step",
            inputs: [],
            writes: [],
            component: () => null,
          },
        ],
      };
    });

    const { validatePhaseMap: mockedValidatePhaseMap } =
      await import("./phases.ts");

    expect(() => mockedValidatePhaseMap()).toThrow(new RegExp(extraId));
  });
});

// ---------------------------------------------------------------------------
// Invariant 1 — every PHASES step id is a real manifest step id
// ---------------------------------------------------------------------------

describe("invariant — every PHASES step id is a real manifest id", () => {
  const manifestIds = new Set(manifest.map((s) => s.id));

  for (const phase of PHASES) {
    for (const id of phase.stepIds) {
      it(`phase "${phase.letter}" step id "${id}" exists in the manifest`, () => {
        expect(manifestIds.has(id)).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Invariant 3 — flattened PHASES order is a subsequence of manifest order
// ---------------------------------------------------------------------------

describe("invariant — flattened PHASES order is a subsequence of manifest order", () => {
  it("each phase step id appears no earlier in the manifest than the previous one", () => {
    const manifestIds = manifest.map((s) => s.id);
    const flattened = PHASES.flatMap((p) => p.stepIds);

    let cursor = -1;
    for (const id of flattened) {
      const idx = manifestIds.indexOf(id, cursor + 1);
      expect(idx, `"${id}" out of order relative to manifest`).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant 4 — letters are exactly A-F, in order, no gaps
// ---------------------------------------------------------------------------

describe("invariant — PHASES letters are exactly A-F, in order", () => {
  it("letters equal ['A','B','C','D','E','F']", () => {
    expect(PHASES.map((p) => p.letter)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});

// ---------------------------------------------------------------------------
// UNPHASED_STEP_IDS
// ---------------------------------------------------------------------------

describe("UNPHASED_STEP_IDS", () => {
  it("contains exactly 'package' (FR-012 — reserved stub that never advances)", () => {
    expect(UNPHASED_STEP_IDS).toEqual(["package"]);
  });

  it("'package' is a real manifest step id", () => {
    expect(manifest.some((s) => s.id === "package")).toBe(true);
  });
});
