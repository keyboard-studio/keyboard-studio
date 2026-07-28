/**
 * casePairCompanion — suppression and locale contract for the shared
 * case-pair proposal hook.
 *
 * The hook is the ONLY caller of the engine's `caseCounterpart` on the
 * proposal path (FR-002): callers hand it the placed character and never a
 * counterpart, so a second, looser casing path cannot be introduced by a
 * consumer. These cases pin that contract from the outside — every input for
 * which `caseCounterpart` declines must raise nothing, and the locale used
 * must be the working copy's identity tag (FR-009).
 *
 * @see specs/051-uppercase-counterpart-suggestion/contracts/case-pair-proposal.md
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { useCasePairCompanion } from "./casePairCompanion.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

/** A throwaway base assignment — identity is all the hook needs. */
function baseAssignment(target: string): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [{ patternId: "simple_swap", slotValues: { kmnRules: "" } }],
    source: "user",
  };
}

/** Raise a physical proposal for `char` and return { raised, proposal }. */
function proposePhysical(char: string) {
  const { result } = renderHook(() => useCasePairCompanion());
  let raised = false;
  act(() => {
    raised = result.current.propose({
      mechanism: "physical",
      originalChar: char,
      vkey: "K_Q",
      capsHandling: false,
      baseAssignment: baseAssignment(char),
    });
  });
  return { raised, proposal: result.current.proposal };
}

describe("useCasePairCompanion — suppression (FR-002)", () => {
  beforeEach(() => {
    useWorkingCopyStore.getState().setIdentity(null);
  });

  it.each([
    ["Arabic alef (caseless)", "ا"],
    ["Devanagari ka (caseless)", "क"],
  ])("raises nothing for a caseless letter — %s", (_label, char) => {
    const { raised, proposal } = proposePhysical(char);
    expect(raised).toBe(false);
    expect(proposal).toBeNull();
  });

  it("raises nothing for a self-mapping letter (U+0138 ĸ)", () => {
    const { raised, proposal } = proposePhysical("ĸ");
    expect(raised).toBe(false);
    expect(proposal).toBeNull();
  });

  it.each([
    ["ß → SS", "ß"],
    ["ﬃ → FFI", "ﬃ"],
  ])("raises nothing for a multi-character expansion — %s", (_label, char) => {
    const { raised, proposal } = proposePhysical(char);
    expect(raised).toBe(false);
    expect(proposal).toBeNull();
  });

  it("raises nothing for uppercase input — the toLower direction is out of scope", () => {
    const { raised, proposal } = proposePhysical("Θ");
    expect(raised).toBe(false);
    expect(proposal).toBeNull();
  });

  it("raises a proposal for a lowercase cased letter with a single-character counterpart", () => {
    const { raised, proposal } = proposePhysical("θ");
    expect(raised).toBe(true);
    expect(proposal?.counterpart).toBe("Θ");
    expect(proposal?.originalChar).toBe("θ");
  });
});

describe("useCasePairCompanion — locale (FR-009)", () => {
  beforeEach(() => {
    useWorkingCopyStore.getState().setIdentity(null);
  });

  it("proposes İ (U+0130) for 'i' under the identity bcp47 tag 'tr'", () => {
    useWorkingCopyStore.getState().setIdentity({ bcp47: "tr" });
    const { raised, proposal } = proposePhysical("i");
    expect(raised).toBe(true);
    expect(proposal?.counterpart).toBe("İ");
  });

  it("proposes the locale-insensitive 'I' for 'i' with no identity tag", () => {
    const { raised, proposal } = proposePhysical("i");
    expect(raised).toBe(true);
    expect(proposal?.counterpart).toBe("I");
  });

  it("treats an empty-string identity bcp47 as absent rather than as a locale", () => {
    useWorkingCopyStore.getState().setIdentity({ bcp47: "" });
    const { raised, proposal } = proposePhysical("i");
    expect(raised).toBe(true);
    expect(proposal?.counterpart).toBe("I");
  });

  it("degrades to the locale-insensitive mapping on a malformed bcp47 rather than throwing", () => {
    useWorkingCopyStore.getState().setIdentity({ bcp47: "not a tag!!" });
    let out: ReturnType<typeof proposePhysical> | undefined;
    expect(() => {
      out = proposePhysical("θ");
    }).not.toThrow();
    expect(out?.raised).toBe(true);
    expect(out?.proposal?.counterpart).toBe("Θ");
  });
});

describe("useCasePairCompanion — lifecycle", () => {
  beforeEach(() => {
    useWorkingCopyStore.getState().setIdentity(null);
  });

  it("keeps at most one pending proposal — a second propose replaces the first", () => {
    const { result } = renderHook(() => useCasePairCompanion());

    act(() => {
      result.current.propose({
        mechanism: "physical",
        originalChar: "θ",
        vkey: "K_Q",
        capsHandling: false,
        baseAssignment: baseAssignment("θ"),
      });
    });
    expect(result.current.proposal?.counterpart).toBe("Θ");

    act(() => {
      result.current.propose({
        mechanism: "physical",
        originalChar: "λ",
        vkey: "K_W",
        capsHandling: false,
        baseAssignment: baseAssignment("λ"),
      });
    });
    expect(result.current.proposal?.counterpart).toBe("Λ");
    expect(result.current.proposal?.originalChar).toBe("λ");
  });

  it("dismiss() and clear() both drop the pending proposal", () => {
    const { result } = renderHook(() => useCasePairCompanion());

    act(() => {
      result.current.propose({
        mechanism: "physical",
        originalChar: "θ",
        vkey: "K_Q",
        capsHandling: false,
        baseAssignment: baseAssignment("θ"),
      });
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.proposal).toBeNull();

    act(() => {
      result.current.propose({
        mechanism: "physical",
        originalChar: "θ",
        vkey: "K_Q",
        capsHandling: false,
        baseAssignment: baseAssignment("θ"),
      });
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.proposal).toBeNull();
  });

  it("a suppressed propose leaves an already-pending proposal untouched", () => {
    // Matches the shipping behaviour: applying an unrelated mechanism while a
    // banner is up does not disturb the pending proposal, so a propose that
    // raises nothing must not clear one either.
    const { result } = renderHook(() => useCasePairCompanion());

    act(() => {
      result.current.propose({
        mechanism: "physical",
        originalChar: "θ",
        vkey: "K_Q",
        capsHandling: false,
        baseAssignment: baseAssignment("θ"),
      });
    });
    expect(result.current.proposal).not.toBeNull();

    let raised = true;
    act(() => {
      raised = result.current.propose({
        mechanism: "physical",
        originalChar: "ا",
        vkey: "K_W",
        capsHandling: false,
        baseAssignment: baseAssignment("ا"),
      });
    });
    expect(raised).toBe(false);
    expect(result.current.proposal?.originalChar).toBe("θ");
  });
});

describe("useCasePairCompanion — Georgian suppression", () => {
  // Unicode gives Mkhedruli a formal Mtavruli uppercase mapping, but that
  // mapping is a stylistic all-caps register, not a Shift companion in
  // ordinary Georgian orthography — Unicode case properties say nothing
  // about orthographic convention. The corpus's one Georgian keyboard,
  // basic_kbdgeo (../keyboards), maps every [SHIFT K_x] to the IDENTICAL
  // codepoint as its base rule, and the facet classifier independently
  // labels it casing: "caseless", caps-handling: notApplicable. These cases
  // pin the suppression to Georgian specifically — Cherokee is
  // Unicode-bicameral in the same technical sense and must keep proposing,
  // so a future widening of the suppression fails loudly here.
  beforeEach(() => {
    useWorkingCopyStore.getState().setIdentity(null);
  });

  it("raises nothing for Georgian Mkhedruli ა (U+10D0) — physical", () => {
    const { raised, proposal } = proposePhysical("ა");
    expect(raised).toBe(false);
    expect(proposal).toBeNull();
  });

  it("raises nothing for Georgian Mkhedruli ა (U+10D0) — touch, proving the suppression lives in propose()", () => {
    const { result } = renderHook(() => useCasePairCompanion());
    let raised = true;
    act(() => {
      raised = result.current.propose({
        mechanism: "touch",
        originalChar: "ა",
        hostKey: "K_A",
        targetLayer: "shift",
        baseRef: { patternId: "simple_swap", slotValues: { kmnRules: "" } },
      });
    });
    expect(raised).toBe(false);
    expect(result.current.proposal).toBeNull();
  });

  it("raises nothing for Georgian Mtavruli Ა (U+1C90) placed directly", () => {
    const { raised, proposal } = proposePhysical("Ა");
    expect(raised).toBe(false);
    expect(proposal).toBeNull();
  });

  it("control: Cherokee ꭰ (U+AB70) still raises a proposal (U+13A0) — Georgian-only scope", () => {
    const { raised, proposal } = proposePhysical("ꭰ");
    expect(raised).toBe(true);
    expect(proposal?.counterpart).toBe("Ꭰ");
  });

  it("control: Greek θ still raises Θ — unaffected by the Georgian suppression", () => {
    const { raised, proposal } = proposePhysical("θ");
    expect(raised).toBe(true);
    expect(proposal?.counterpart).toBe("Θ");
  });
});
