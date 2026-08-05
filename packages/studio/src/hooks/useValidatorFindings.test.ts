// useValidatorFindings — focused unit test.
//
// Proves:
//   1. Hook returns buildFindingsByQuestionId(seeded findings) when the store
//      has validator findings.
//   2. Hook returns {} when the store has no findings (empty array).
//   3. The returned record updates when the store's validatorFindings change.
//
// Strategy: seed workingCopyStore.validatorFindings directly via setState,
// render the hook via renderHook, assert the output matches the result of
// calling buildFindingsByQuestionId with the seeded data.
// buildFindingsByQuestionId is imported from the SAME lint/lintToQuestion.ts
// path the hook uses — so the result is the canonical ground truth.

import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type {
  KeyboardIR,
  LintFinding,
  TouchKeyRuleIndex,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import type { KeyEditOverlay } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { buildFindingsByQuestionId } from "../lint/lintToQuestion.ts";
import {
  useTouchKeyDiagnostics,
  useValidatorFindings,
} from "./useValidatorFindings.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useWorkingCopyStore.setState({ validatorFindings: [] });
}

// A finding that maps to at least one question ID (pb_standard_letters).
const INVENTORY_FINDING: LintFinding = {
  code: "KM_LINT_INVENTORY_UNCOVERED",
  severity: "error",
  layer: "A",
  message: "character not covered",
};

// A finding that maps to the identity question (language_name_english).
const DISPLAY_NAME_FINDING: LintFinding = {
  code: "KM_LINT_DISPLAY_NAME_UNDERSCORE",
  severity: "warning",
  layer: "C",
  message: "display name contains underscore",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useValidatorFindings", () => {
  afterEach(() => {
    resetStore();
  });

  it("returns {} when the store has no findings (empty array)", () => {
    const { result } = renderHook(() => useValidatorFindings());

    expect(result.current).toEqual({});
  });

  it("returns buildFindingsByQuestionId(seeded) for a mapped finding", () => {
    const findings: LintFinding[] = [INVENTORY_FINDING];

    act(() => {
      useWorkingCopyStore.setState({ validatorFindings: findings });
    });

    const { result } = renderHook(() => useValidatorFindings());

    const expected = buildFindingsByQuestionId(findings);
    expect(result.current).toEqual(expected);
    // Confirm at least one question ID was populated (not empty — ensures
    // the finding actually maps to something).
    expect(Object.keys(result.current).length).toBeGreaterThan(0);
  });

  it("returns the correct projection for multiple findings covering different question IDs", () => {
    const findings: LintFinding[] = [INVENTORY_FINDING, DISPLAY_NAME_FINDING];

    act(() => {
      useWorkingCopyStore.setState({ validatorFindings: findings });
    });

    const { result } = renderHook(() => useValidatorFindings());

    const expected = buildFindingsByQuestionId(findings);
    expect(result.current).toEqual(expected);
    // pb_standard_letters from INVENTORY_FINDING
    expect(result.current["pb_standard_letters"]).toHaveLength(1);
    // language_name_english from DISPLAY_NAME_FINDING
    expect(result.current["language_name_english"]).toHaveLength(1);
  });

  it("updates when validatorFindings changes in the store", () => {
    const { result } = renderHook(() => useValidatorFindings());

    // Initially empty.
    expect(result.current).toEqual({});

    // Seed a finding.
    act(() => {
      useWorkingCopyStore.setState({ validatorFindings: [INVENTORY_FINDING] });
    });

    const expected = buildFindingsByQuestionId([INVENTORY_FINDING]);
    expect(result.current).toEqual(expected);

    // Clear findings — should return {} again.
    act(() => {
      useWorkingCopyStore.setState({ validatorFindings: [] });
    });

    expect(result.current).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// SC-010 (spec 058 T122) — the edit-time touch diagnostics resolve within the
// EXISTING 300 ms cycle, adding no timer of their own (FR-042, Decision D3).
//
// Behavioral, in the `useKeyboardArtifact.test.ts` fake-timer mold, rather than
// a grep for `setTimeout`: the claim worth defending is not "this file contains
// no timer call" (trivially true today and trivially broken by an
// indirection) but "the findings are available with the clock stopped". A
// second debounce cycle cannot satisfy that, whatever it is implemented with —
// a timer, a microtask chain, a `requestIdleCallback`, or a store round-trip.
//
// `vi.getTimerCount()` is the direct half of the same claim: with fake timers
// installed, rendering the hook and mutating its inputs must leave the pending
// timer queue empty.
// ---------------------------------------------------------------------------

function diagLayout(keyId: string, sp?: number): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  { nodeId: "n-lopt", id: "K_LOPT", sp: 1 },
                  { nodeId: "n-bksp", id: "K_BKSP", sp: 1 },
                  { nodeId: "n-enter", id: "K_ENTER", sp: 1 },
                  { nodeId: "n1", id: keyId, ...(sp !== undefined ? { sp } : {}) },
                ],
              },
            ],
          },
        ],
      },
    ],
    nodeIds: [],
  };
}

function diagIr(layout: TouchLayoutIR): KeyboardIR {
  return { raw: [], touchLayout: layout } as unknown as KeyboardIR;
}

function emptyRuleIndex(): TouchKeyRuleIndex {
  return {
    byId: new Map(),
    spellings: new Map(),
    producingIds: new Set(),
    opaqueFragmentCount: 0,
  };
}

const NO_EDITS: KeyEditOverlay = { ops: [] };

describe("useTouchKeyDiagnostics — SC-010: no second debounce cycle (T122, FR-042, D3)", () => {
  it("produces findings with the clock stopped — no timer has to fire for them to exist", () => {
    vi.useFakeTimers();
    try {
      // `T_DEAD` earns TOUCH_KEY_NO_RULE: a custom key nothing types.
      const layout = diagLayout("T_DEAD", 0);
      const { result } = renderHook(() =>
        useTouchKeyDiagnostics({
          ir: diagIr(layout),
          layout,
          ruleIndex: emptyRuleIndex(),
          overlay: NO_EDITS,
        }),
      );

      // No advanceTimersByTime, no flush, no await: the findings are already
      // here on the very first render. A debounced surface could not do this.
      expect(result.current.findings.map((f) => f.code)).toContain(
        "TOUCH_KEY_NO_RULE",
      );
      expect(result.current.byAddress.size).toBeGreaterThan(0);

      // And nothing is queued waiting to fire.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reflects an input change immediately, still with no pending timer", () => {
    vi.useFakeTimers();
    try {
      let layout = diagLayout("T_DEAD", 0);
      const { result, rerender } = renderHook(
        (props: { layout: TouchLayoutIR }) =>
          useTouchKeyDiagnostics({
            ir: diagIr(props.layout),
            layout: props.layout,
            ruleIndex: emptyRuleIndex(),
            overlay: NO_EDITS,
          }),
        { initialProps: { layout } },
      );
      expect(result.current.findings.map((f) => f.code)).toContain(
        "TOUCH_KEY_NO_RULE",
      );

      // The author fixes it: a self-outputting U_ id types its own character,
      // so the dead-key finding must be gone — with the clock still stopped.
      layout = diagLayout("U_0061", 0);
      act(() => {
        rerender({ layout });
      });

      expect(result.current.findings.map((f) => f.code)).not.toContain(
        "TOUCH_KEY_NO_RULE",
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("advancing well past the 300 ms cycle changes nothing — there is no deferred second pass", () => {
    vi.useFakeTimers();
    try {
      const layout = diagLayout("T_DEAD", 0);
      const { result } = renderHook(() =>
        useTouchKeyDiagnostics({
          ir: diagIr(layout),
          layout,
          ruleIndex: emptyRuleIndex(),
          overlay: NO_EDITS,
        }),
      );
      const before = result.current;

      act(() => {
        vi.advanceTimersByTime(2_000);
      });

      // Same object, not merely equal contents: nothing re-derived on a later
      // tick, which is what a second cycle would look like from out here.
      expect(result.current).toBe(before);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the SHARED empty result before the working copy is ready, so a memoizing caller sees no change per render", () => {
    const { result, rerender } = renderHook(() =>
      useTouchKeyDiagnostics({
        ir: null,
        layout: null,
        ruleIndex: undefined,
        overlay: NO_EDITS,
      }),
    );
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
    expect(first.findings).toEqual([]);
  });
});
