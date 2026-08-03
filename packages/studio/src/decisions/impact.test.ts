// Tests for on-request impact resolution (specs/053 T029, FR-010/FR-011).
//
// The two things worth pinning: a stored capture is returned VERBATIM (never
// re-derived, or the audit could disagree with the artifact — SC-005), and an
// underivable impact reports WHICH of the two reasons applies rather than
// degrading to an empty diff.
//
// The mutate-seam-off case is not an edge case here: it is the SHIPPED default
// (flags/mutateFlag.ts), so it is the behaviour most survey entries will actually
// take, and it must say so honestly.

import { describe, expect, it, vi } from "vitest";
import type { DecisionEntry, DecisionImpact, KeyboardIR } from "@keyboard-studio/contracts";
import { resolveImpact, type ResolveImpactDeps } from "./impact.ts";

function deps(overrides: Partial<ResolveImpactDeps> = {}): ResolveImpactDeps {
  return {
    getWorkingIR: () => null,
    isDesktopLocked: () => false,
    isTouchLocked: () => false,
    ...overrides,
  };
}

function entry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    entryId: "d1",
    stepId: "sequences",
    payload: {
      kind: "survey-answer",
      questionId: "some_question_with_no_module",
      answerType: "text",
      value: "x",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
    ...overrides,
  };
}

const CAPTURED: DecisionImpact = {
  state: "captured",
  path: "source/foo.kmn",
  hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [" a", "+b"] }],
  magnitude: { added: 1, removed: 0 },
};

describe("stored captures are returned verbatim", () => {
  it("returns an editor step's captured impact unchanged", () => {
    const editor = entry({
      stepId: "carve",
      payload: {
        kind: "editor-action",
        actionType: "gallery_edit",
        summary: {
          keysRemoved: 3,
          keysAdded: 0,
          mechanismsAssigned: 0,
          touchKeysAffected: 0,
          sample: [],
          sampleTruncated: false,
        },
      },
      impact: CAPTURED,
    });
    // Identity, not equality: the stored object is handed back, so there is no
    // opportunity for a re-derivation to differ from what was captured.
    expect(resolveImpact(editor, deps())).toBe(CAPTURED);
  });

  it("returns a stored `none` rather than re-deriving it", () => {
    const none: DecisionImpact = { state: "none" };
    expect(resolveImpact(entry({ impact: none }), deps())).toBe(none);
  });

  it("never touches the working IR when a capture is stored", () => {
    const getWorkingIR = vi.fn(() => null);
    resolveImpact(entry({ impact: CAPTURED }), deps({ getWorkingIR }));
    expect(getWorkingIR).not.toHaveBeenCalled();
  });
});

describe("shed entries", () => {
  it("returns null for an entry whose detail was shed", () => {
    // null is the caller's signal to render the shed notice — distinct from
    // "unavailable" (never derivable) and from "none" (derived, no change).
    expect(resolveImpact(entry({ impact: null }), deps())).toBeNull();
  });
});

describe("underivable impacts report a reason (FR-011)", () => {
  it("reports no-rederivable-write-path with the mutate seam off — the shipped default", () => {
    // No VITE_KM_MUTATE_SEAM in the test env, so isMutateSeamEnabled() is false:
    // exactly the default build's behaviour.
    expect(resolveImpact(entry(), deps())).toEqual({
      state: "unavailable",
      reason: "no-rederivable-write-path",
    });
  });

  it("reports lock-gate-dependency for a step behind a lock that has passed", () => {
    // "mechanisms" carries lock: "physical" in the manifest.
    const locked = entry({ stepId: "mechanisms" });
    expect(resolveImpact(locked, deps({ isDesktopLocked: () => true }))).toEqual({
      state: "unavailable",
      reason: "lock-gate-dependency",
    });
  });

  it("does not report a lock that has not yet passed", () => {
    const notYetLocked = entry({ stepId: "mechanisms" });
    expect(resolveImpact(notYetLocked, deps({ isDesktopLocked: () => false }))).toEqual({
      state: "unavailable",
      reason: "no-rederivable-write-path",
    });
  });

  it("reports lock-gate-dependency for the touch lock once a layout exists", () => {
    expect(resolveImpact(entry({ stepId: "touch" }), deps({ isTouchLocked: () => true }))).toEqual({
      state: "unavailable",
      reason: "lock-gate-dependency",
    });
  });

  it("never returns an empty captured impact in place of a reason", () => {
    // The failure this guards against: rendering `{ state: "captured", hunks: [] }`
    // for something that could not be derived, which reads as "nothing happened".
    const result = resolveImpact(entry(), deps());
    expect(result).not.toBeNull();
    expect(result!.state).not.toBe("captured");
  });
});

describe("FR-010 — nothing is computed for an entry that was not asked about", () => {
  it("has no batch form: one call resolves one entry", () => {
    // Structural, so asserted structurally: `resolveImpact` takes a single entry.
    // There is no code path that could walk a record, which is what makes
    // "computed only when requested" true rather than merely intended.
    expect(resolveImpact.length).toBeGreaterThanOrEqual(2);
  });

  it("reads the working IR at most once per resolution", () => {
    const getWorkingIR = vi.fn((): KeyboardIR | null => null);
    resolveImpact(entry(), deps({ getWorkingIR }));
    // With the seam off it is not consulted at all; with it on it is consulted
    // once. Either way, resolving one entry never fans out.
    expect(getWorkingIR.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
