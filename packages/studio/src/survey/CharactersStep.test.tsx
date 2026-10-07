// CharactersStep unit tests (spec 027 SC-001).
//
// Covers:
//   (a) prefill -> confirm -> PhaseB -> complete emits SurveyPhaseResult via onComplete
//   (b) PhaseB -> back returns to prefill; does NOT fire props.onBack
//   (c) prefill -> back calls props.onBack
//   (d) with store slot pre-set to "B", component mounts directly at PhaseB
//       (carve-back re-entry proof)
//   (e) findings derived from seeded validatorFindings equal buildFindingsByQuestionId
//       of the same input
//
// Strategy: mock Prefill and PhaseB at the file level (shallow stubs that
// record callbacks and render unique testids). Seed stores via getState()/setState.
// Reset both stores between cases.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { getCharacterInventoryValue, inventoryOps, resetInventoryDecisions, resetInventoryDraft } from "../survey/useInventoryDraft.ts";
import { buildFindingsByQuestionId } from "../lint/lintToQuestion.ts";

// ---------------------------------------------------------------------------
// Hoisted refs for mock callbacks
// ---------------------------------------------------------------------------

const { mockPrefillConfirmRef, mockPrefillBackRef, mockPhaseBCompleteRef, mockPhaseBBackRef, mockPhaseBFindingsRef } =
  vi.hoisted(() => ({
    mockPrefillConfirmRef: { current: null as null | (() => void) },
    mockPrefillBackRef: { current: null as null | (() => void) },
    mockPhaseBCompleteRef: { current: null as null | ((r: unknown) => void) },
    mockPhaseBBackRef: { current: null as null | (() => void) },
    // Captures the findingsByQuestionId prop PhaseB receives on each render.
    mockPhaseBFindingsRef: { current: undefined as Record<string, unknown[]> | undefined },
  }));

// ---------------------------------------------------------------------------
// Mock Prefill/PhaseB at the file level — shallow stubs
// (CharactersStep imports the files directly since spec 090 T021)
// ---------------------------------------------------------------------------

vi.mock("./Prefill.tsx", () => ({
  Prefill: ({
    onConfirm,
    onBack,
  }: {
    onConfirm: () => void;
    onBack?: () => void;
  }) => {
    mockPrefillConfirmRef.current = onConfirm;
    mockPrefillBackRef.current = onBack ?? null;
    return (
      <div data-testid="mock-prefill">
        <button type="button" data-testid="prefill-confirm" onClick={onConfirm}>
          confirm
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="prefill-back" onClick={onBack}>
            back
          </button>
        )}
      </div>
    );
  },
}));

vi.mock("./PhaseB.tsx", () => ({
  PhaseB: ({
    onComplete,
    onBack,
    findingsByQuestionId,
  }: {
    onComplete: (r: unknown) => void;
    onBack?: () => void;
    findingsByQuestionId?: Record<string, unknown[]>;
  }) => {
    mockPhaseBCompleteRef.current = onComplete;
    mockPhaseBBackRef.current = onBack ?? null;
    mockPhaseBFindingsRef.current = findingsByQuestionId;
    const fakeResult: SurveyPhaseResult = {
      phase: "B" as const,
      answers: [],
      confirmedInventory: [],
    };
    return (
      <div data-testid="mock-phase-b">
        <button
          type="button"
          data-testid="phaseB-complete"
          onClick={() => onComplete(fakeResult)}
        >
          complete
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="phaseB-back" onClick={onBack}>
            back
          </button>
        )}
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Import component under test AFTER vi.mock declarations
// ---------------------------------------------------------------------------

import { CharactersStepHost } from "./CharactersStepHost.tsx";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeIdentity = {
  autonym: "Test Language",
  english: "Test Language",
  languageSubtag: "tl",
  targetScriptRaw: "Latn",
  bcp47: "tl-Latn",
  supported: true,
  prefill: {
    script: "Latn",
    scriptClass: "alphabetic" as const,
    routingGroup: "qwerty-qwertz",
  },
};

const fakeBase = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  displayName: "English (US)",
  targets: ["windows"] as string[],
  version: "1.0",
};

/** alphabetKey (steps/evidence.ts) of fakeIdentity + fakeBase: bcp47|script|variant|baseId. */
const CURRENT_KEY = "tl-Latn|Latn|Latn|basic_kbdus";

/** The identity decisions a completed identity step records for `identity`
 * (spec 089: CharactersStep derives the identity result + survey context
 * from these — the derived context for the fake identity is exactly the
 * { language_name: "Test Language", routing_group: "qwerty-qwertz",
 * script_family: "Latn" } the session store used to be seeded with). */
function seedIdentity(identity: typeof fakeIdentity & { region?: string }): void {
  const record = useDecisionStore.getState().record;
  record({ id: "language-name", value: identity.english, provenance: "asked" });
  record({ id: "language-autonym", value: identity.autonym, provenance: "asked" });
  record({ id: "language-code", value: identity.languageSubtag, provenance: "asked" });
  record({ id: "language-region", value: identity.region ?? "", provenance: "asked" });
  record({ id: "target-script", value: identity.targetScriptRaw, provenance: "asked" });
}

/** Seed identity decisions + session base so the prefill guard passes. */
function seedSessionStore() {
  seedIdentity(fakeIdentity);
  useSurveySessionStore.setState({
    localBase: fakeBase,
    charactersSubStage: "prefill",
  });
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  // alphabetEvidenceKey / sticky decisions survive store.reset().
  resetInventoryDecisions();
  mockPrefillConfirmRef.current = null;
  mockPrefillBackRef.current = null;
  mockPhaseBCompleteRef.current = null;
  mockPhaseBBackRef.current = null;
  mockPhaseBFindingsRef.current = undefined;
});

// ---------------------------------------------------------------------------
// (a) prefill -> confirm -> PhaseB -> complete emits SurveyPhaseResult
// ---------------------------------------------------------------------------

describe("CharactersStep — prefill -> PhaseB -> complete", () => {
  it("renders Prefill at substage 'prefill', then PhaseB after confirm, then emits result on complete", async () => {
    seedSessionStore();
    const onComplete = vi.fn();
    const onBack = vi.fn();

    render(<CharactersStepHost onComplete={onComplete} onBack={onBack} />);

    // Initial render shows Prefill
    expect(screen.getByTestId("mock-prefill")).toBeTruthy();
    expect(screen.queryByTestId("mock-phase-b")).toBeNull();

    // Confirm transitions to PhaseB — which mounts behind a lazy boundary
    // since spec 090 T021, so await its mount.
    fireEvent.click(screen.getByTestId("prefill-confirm"));

    expect(screen.queryByTestId("mock-prefill")).toBeNull();
    expect(await screen.findByTestId("mock-phase-b")).toBeTruthy();

    // PhaseB complete emits result via onComplete; props.onBack not called
    fireEvent.click(screen.getByTestId("phaseB-complete"));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const emitted = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(emitted).toBeDefined();
    expect(emitted.phase).toBe("B");
    expect(onBack).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (b) PhaseB -> back returns to prefill; does NOT fire props.onBack
// ---------------------------------------------------------------------------

describe("CharactersStep — PhaseB back returns to prefill", () => {
  it("returns to Prefill when PhaseB onBack is called, without calling props.onBack", () => {
    seedSessionStore();
    const onComplete = vi.fn();
    const onBack = vi.fn();

    render(<CharactersStepHost onComplete={onComplete} onBack={onBack} />);

    fireEvent.click(screen.getByTestId("prefill-confirm"));
    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();

    fireEvent.click(screen.getByTestId("phaseB-back"));

    expect(screen.getByTestId("mock-prefill")).toBeTruthy();
    expect(screen.queryByTestId("mock-phase-b")).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (c) prefill -> back calls props.onBack
// ---------------------------------------------------------------------------

describe("CharactersStep — prefill back calls props.onBack", () => {
  it("calls props.onBack when Prefill onBack is triggered", () => {
    seedSessionStore();
    const onComplete = vi.fn();
    const onBack = vi.fn();

    render(<CharactersStepHost onComplete={onComplete} onBack={onBack} />);

    expect(screen.getByTestId("mock-prefill")).toBeTruthy();
    fireEvent.click(screen.getByTestId("prefill-back"));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (d) store slot pre-set to "B" mounts directly at PhaseB (carve-back re-entry)
// ---------------------------------------------------------------------------

describe("CharactersStep — carve-back re-entry at PhaseB", () => {
  it("mounts directly at PhaseB when store slot is pre-set to 'B'", () => {
    seedSessionStore();
    // Simulate carve-back: the store slot was already "B" before remount
    useSurveySessionStore.setState({ charactersSubStage: "B" });

    const onComplete = vi.fn();
    const onBack = vi.fn();

    render(<CharactersStepHost onComplete={onComplete} onBack={onBack} />);

    // Must open directly at PhaseB, not Prefill
    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();
    expect(screen.queryByTestId("mock-prefill")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (e) PhaseB receives findingsByQuestionId derived from seeded validatorFindings
// ---------------------------------------------------------------------------

describe("CharactersStep — findingsByQuestionId prop passed to PhaseB", () => {
  it("passes findingsByQuestionId derived from workingCopyStore.validatorFindings to PhaseB", () => {
    seedSessionStore();
    // Mount directly at stage B so PhaseB renders immediately.
    useSurveySessionStore.setState({ charactersSubStage: "B" });

    // Seed a known finding into workingCopyStore.
    const fakeFindings: LintFinding[] = [
      {
        code: "KM_LINT_INVENTORY_UNCOVERED",
        severity: "warning",
        message: "test finding",
        source: "test",
      },
    ];
    useWorkingCopyStore.setState({ validatorFindings: fakeFindings });

    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);

    // PhaseB must have received findingsByQuestionId.
    expect(mockPhaseBFindingsRef.current).toBeDefined();

    // The captured prop must deep-equal the pure helper's output for the same input.
    const expected = buildFindingsByQuestionId(fakeFindings);
    expect(mockPhaseBFindingsRef.current).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// (f) Spec 057 US1 / FR-007 (T021) — the Phase B draft alphabet is cleared by a
// genuine prefill → build-list transition, and by nothing else.
//
// D-4: composed with the mount reset (D-1), a tab round trip mid-characters
// returned `charactersSubStage` to "prefill"; re-confirming prefill then fired
// `resetPhaseBDraft()` and silently emptied the alphabet the author had built.
// The reset is gone, so the substage survives — and these tests pin the
// remaining half of the contract, which is that a REMOUNT at substage "B" must
// not clear the draft either.
// ---------------------------------------------------------------------------


describe("CharactersStep — Phase B draft alphabet lifecycle (spec 057 FR-007)", () => {
  /** Seed a built alphabet, as the author would have on the build-list screen. */
  function seedAlphabet(chars: string[]) {
    resetInventoryDraft();
    for (const c of chars) inventoryOps("characters").add(c);
  }

  it("remounting at substage 'B' does NOT clear the draft alphabet", () => {
    seedSessionStore();
    useSurveySessionStore.setState({ charactersSubStage: "B" });
    seedAlphabet(["é", "ŋ", "ɔ"]);

    // First mount, then a route-change-shaped unmount/remount.
    const first = render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();
    first.unmount();
    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();
    expect(getCharacterInventoryValue().chars).toEqual(["é", "ŋ", "ɔ"]);
  });

  it("a prefill -> build-list confirm on CHANGED evidence resets, but carries the author's own picks over (spec 079 US3 T059 — was a full clear before)", () => {
    seedSessionStore(); // substage "prefill"
    seedAlphabet(["é", "ŋ"]); // both via add() — author provenance
    // Built for another language: the stamp no longer matches.
    inventoryOps("characters").setAlphabetEvidenceKey("xx-Latn|Latn|Latn|basic_kbdus");

    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId("mock-prefill")).toBeTruthy();

    fireEvent.click(screen.getByTestId("prefill-confirm"));

    // Both fit the new evidence's script (Latn), so neither is flagged.
    expect(getCharacterInventoryValue().chars).toEqual(["é", "ŋ"]);
  });

  it("stepping back to prefill and forward again with UNCHANGED evidence keeps it (spec 079 FR-020 — was a clear before)", () => {
    seedSessionStore();
    useSurveySessionStore.setState({ charactersSubStage: "B" });
    seedAlphabet(["é"]);
    inventoryOps("characters").setAlphabetEvidenceKey(CURRENT_KEY);

    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByTestId("phaseB-back"));
    expect(getCharacterInventoryValue().chars).toEqual(["é"]);

    fireEvent.click(screen.getByTestId("prefill-confirm"));
    expect(getCharacterInventoryValue().chars).toEqual(["é"]);
  });

  it("an UNSTAMPED built alphabet is reset: a new working copy clears the stamp but not the previous project's draft", () => {
    seedSessionStore();
    seedAlphabet(["é", "ŋ"]);
    expect(getCharacterInventoryValue().alphabetEvidenceKey).toBeUndefined();

    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByTestId("prefill-confirm"));

    // (A draft saved before spec 079 is stamped on restore instead — see
    // draftPersistence.test.ts — so it never reaches this branch.)
    expect(getCharacterInventoryValue().chars).toEqual([]);
    expect(getCharacterInventoryValue().alphabetEvidenceKey).toBe(CURRENT_KEY);
  });

  it("a first build (empty alphabet) stamps the current key", () => {
    seedSessionStore();
    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByTestId("prefill-confirm"));
    expect(getCharacterInventoryValue().alphabetEvidenceKey).toBe(CURRENT_KEY);
  });
});

// ---------------------------------------------------------------------------
// (g) Spec 079 T081 — sub-screen position survives a leave-and-return
//
// CharactersStep.tsx is the SINGLE writer of this step's surveyAnswerStore
// position (spec 079 T035/T081) — PhaseB itself never touches it. The
// vocabulary is PhaseB's own screen id: "prefill" for the prefill screen,
// then "intro" (the discovery-method chooser) once past it — PhaseB is
// mocked in this file, so `discoveryMethod` never advances past its default
// null, and "intro" is what a real, unmocked PhaseB would show first too.
// ---------------------------------------------------------------------------

describe("CharactersStep — sub-screen position survives a leave-and-return (spec 079 FR-051, FR-004)", () => {
  it("build-list path: advancing to the PhaseB sub-screen, then unmount/remount with the same evidence, leaves position and the rendered sub-screen unchanged", () => {
    seedSessionStore();

    const first = render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId("mock-prefill")).toBeTruthy();
    expect(useSurveyAnswerStore.getState().steps["characters"]?.position).toBe("prefill");

    // Advance to sub-screen 2 (PhaseB / "intro" — discoveryMethod still null).
    fireEvent.click(screen.getByTestId("prefill-confirm"));
    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();
    expect(useSurveyAnswerStore.getState().steps["characters"]?.position).toBe("intro");

    const positionBeforeRemount = useSurveyAnswerStore.getState().steps["characters"]?.position;

    // Unmount/remount with the same evidence (identity + base unchanged).
    first.unmount();
    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);

    // Rendered sub-screen unchanged: still PhaseB, not back at Prefill.
    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();
    expect(screen.queryByTestId("mock-prefill")).toBeNull();
    // Position unchanged.
    expect(useSurveyAnswerStore.getState().steps["characters"]?.position).toBe(positionBeforeRemount);
  });

  it("restores at PhaseB on a fresh mount whose ONLY signal is a saved answer-store position (deep-link shape)", () => {
    seedSessionStore();
    // Nothing sets charactersSubStage directly (it starts at its default
    // "prefill") — the saved surveyAnswerStore position is the only thing
    // naming the build-list screen, mirroring how a jump/deep-link would
    // arrive (lib/jumpToLocation.ts writes surveyAnswerStore's position
    // before the remount that reads it).
    useSurveyAnswerStore.getState().setPosition("characters", "build-list");

    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();
    expect(screen.queryByTestId("mock-prefill")).toBeNull();
    // "build-list" also restores discoveryMethod, so a real PhaseB would
    // land on BuildListView rather than replaying the intro chooser.
    expect(useSurveySessionStore.getState().discoveryMethod).toBe("build-list");
  });
});

// ---------------------------------------------------------------------------
// (h) Spec 079 T038/T039 (R-07, FR-020/FR-021) — every route into prefill ends
// at the one guarded confirm. steps/advance.ts sends Done on Project name and
// Done on the adapt track to characters with `setCharactersSubStage:
// "prefill"`; Back from Phase B sets it directly. With unchanged evidence none
// of them may touch the built alphabet or the punctuation picks.
// ---------------------------------------------------------------------------

describe("CharactersStep — prefill routes keep the alphabet (spec 079 US2)", () => {
  /** A built alphabet with an addition and a removal, plus a punctuation pick, stamped for the current evidence. */
  function seedBuiltDraft(): void {
    const draft = inventoryOps("characters");
    draft.seedProposals(["a", "b", "c"], "cldr", "alphabet:tl");
    inventoryOps("characters").remove("c"); // removing a proposal
    inventoryOps("characters").add("ŋ"); // an author addition
    inventoryOps("characters").seedProposals(["!"], "cldr", "punctuation:tl");
    inventoryOps("characters").setAlphabetEvidenceKey(CURRENT_KEY);
    useSurveySessionStore.setState({ discoveryMethod: "build-list" });
  }

  function draftFacts() {
    const s = getCharacterInventoryValue();
    return {
      chars: s.chars,
      bases: s.bases,
      marks: s.marks,
      provenance: s.provenance,
      rejected: s.rejected,
      punctuation: s.punctuation,
      seededProposals: s.seededProposals,
      alphabetEvidenceKey: s.alphabetEvidenceKey,
    };
  }

  function expectUnchangedAndOnBuildList(before: ReturnType<typeof draftFacts>): void {
    expect(draftFacts()).toEqual(before);
    expect(before.chars.length).toBeGreaterThan(0);
    expect(screen.getByTestId("mock-phase-b")).toBeTruthy();
    // The saved sub-screen: discoveryMethod survived the prefill trip, so a
    // real PhaseB reopens on the build list rather than the intro chooser.
    expect(useSurveySessionStore.getState().discoveryMethod).toBe("build-list");
    expect(useSurveyAnswerStore.getState().steps["characters"]?.position).toBe("build-list");
  }

  it("(a) Back from Phase B, then confirm prefill", () => {
    seedSessionStore();
    useSurveySessionStore.setState({ charactersSubStage: "B" });
    seedBuiltDraft();
    const before = draftFacts();

    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByTestId("phaseB-back"));
    fireEvent.click(screen.getByTestId("prefill-confirm"));

    expectUnchangedAndOnBuildList(before);
  });

  it.each(["(b) Done on Project name", "(c) Done on Track, adapt track"])(
    "%s: re-entering at prefill and confirming",
    () => {
      seedSessionStore();
      useSurveySessionStore.setState({ charactersSubStage: "B" });
      seedBuiltDraft();
      const before = draftFacts();

      // The author backs out of characters entirely (Back from Phase B, Back
      // from prefill) and comes forward again from the earlier step: the host
      // applies advance.ts's `setCharactersSubStage: "prefill"` and remounts.
      const first = render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
      fireEvent.click(screen.getByTestId("phaseB-back"));
      fireEvent.click(screen.getByTestId("prefill-back"));
      first.unmount();
      useSurveySessionStore.getState().setCharactersSubStage("prefill");

      render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
      expect(screen.getByTestId("mock-prefill")).toBeTruthy();
      fireEvent.click(screen.getByTestId("prefill-confirm"));

      expectUnchangedAndOnBuildList(before);
    },
  );

  // Spec 089: the identity cases re-record the identity decisions with one
  // fact changed (the derived identity follows); the base case still patches
  // the session's localBase.
  it.each([
    ["bcp47", () => seedIdentity({ ...fakeIdentity, languageSubtag: "tm" })],
    ["script", () => seedIdentity({ ...fakeIdentity, targetScriptRaw: "Cyrl" })],
    ["variant", () => seedIdentity({ ...fakeIdentity, targetScriptRaw: "fonipa" })],
    ["base", () => useSurveySessionStore.setState({ localBase: { ...fakeBase, id: "basic_kbdfr" } })],
  ])(
    "(T039/T059) a changed %s takes the changed branch: proposal chars cleared, old punctuation seeds cleared, new stamp, author addition carried over (R-07)",
    (_what, patch) => {
      seedSessionStore();
      useSurveySessionStore.setState({ charactersSubStage: "B" });
      seedBuiltDraft();

      render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
      fireEvent.click(screen.getByTestId("phaseB-back"));
      act(patch);
      fireEvent.click(screen.getByTestId("prefill-confirm"));

      const s = getCharacterInventoryValue();
      // The proposal chars ("a", "b") are gone with the reset; the author's own
      // addition ("ŋ") is carried over regardless of fit (R-07 step 6 — nothing
      // authored is ever dropped by a shape change).
      expect(s.chars).toEqual(["ŋ"]);
      expect(s.provenance["ŋ"]).toBe("author");
      expect(s.alphabetEvidenceKey).toBeDefined();
      expect(s.alphabetEvidenceKey).not.toBe(CURRENT_KEY);
      expect(s.seededProposals).not.toContain("punctuation:tl");
      // Removals are author decisions, not evidence — they stay sticky.
      expect(s.rejected).toEqual(["c"]);
    },
  );
});

// ---------------------------------------------------------------------------
// (i) Spec 079 US3 T047/T059 (FR-015, R-07 steps 1, 6-7) — a script change
// carries every author addition over: one that still fits the new script is
// kept with nothing to flag; one that does not is ALSO kept, but recorded as
// a `characters.addition.<char>` answer stamped to the OLD evidence so
// `characterFlags.ts`/`FlaggedAnswersList` renders it `reproposed{outside-
// script}` until the author reconfirms it on a later build-list Done.
// ---------------------------------------------------------------------------

describe("CharactersStep — script-change carry-over (spec 079 US3 T047/T059)", () => {
  /** A built alphabet with a removed proposal and a Latin-only author addition. */
  function seedBuiltDraftWithLatinAddition(): void {
    const draft = inventoryOps("characters");
    draft.seedProposals(["a", "b", "c"], "cldr", "alphabet:tl");
    inventoryOps("characters").remove("c"); // removing a proposal -> rejected
    inventoryOps("characters").add("ŋ"); // Latin-script author addition
    inventoryOps("characters").setAlphabetEvidenceKey(CURRENT_KEY);
    useSurveySessionStore.setState({ discoveryMethod: "build-list" });
  }

  it("keeps an author addition that still fits the new script, unflagged, and re-applies the removal — nothing is dropped", () => {
    seedSessionStore();
    useSurveySessionStore.setState({ charactersSubStage: "B" });
    seedBuiltDraftWithLatinAddition();

    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByTestId("phaseB-back"));
    // Base changes (still Latin script) — the addition fits.
    act(() => useSurveySessionStore.setState({ localBase: { ...fakeBase, id: "basic_kbdfr" } }));
    fireEvent.click(screen.getByTestId("prefill-confirm"));

    const s = getCharacterInventoryValue();
    expect(s.chars).toEqual(["ŋ"]);
    expect(s.rejected).toEqual(["c"]); // the removal survives
    expect(useSurveyAnswerStore.getState().steps["characters"]?.answers ?? {}).toEqual({});
  });

  it("keeps an author addition OUTSIDE the new script, flagged outside-script, stamped to the old evidence", () => {
    seedSessionStore();
    useSurveySessionStore.setState({ charactersSubStage: "B" });
    seedBuiltDraftWithLatinAddition();

    render(<CharactersStepHost onComplete={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByTestId("phaseB-back"));
    // Re-record the identity decisions with the Cyrillic target script —
    // the derived identity composes bcp47 "tl-Cyrl" with prefill.script
    // "Cyrl", the shape this test used to patch into the session store.
    act(() => seedIdentity({ ...fakeIdentity, targetScriptRaw: "Cyrl" }));
    fireEvent.click(screen.getByTestId("prefill-confirm"));

    const s = getCharacterInventoryValue();
    expect(s.chars).toEqual(["ŋ"]); // kept, not dropped

    const answers = useSurveyAnswerStore.getState().steps["characters"]?.answers ?? {};
    const saved = answers["characters.addition.ŋ"];
    expect(saved).toBeDefined();
    expect(saved?.value).toBe("ŋ");
    expect(saved?.evidenceKey).toBe(CURRENT_KEY); // the OLD (pre-change) key
    expect(saved?.evidenceKey).not.toBe(s.alphabetEvidenceKey); // != the new key -> reproposed
  });
});
