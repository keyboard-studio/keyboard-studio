// Unit tests for MechanismGallery — kbgen suggestions: the suggestion row's gating,
// text, persistence, case-pair fallback, ranked chips, suppression, and the
// RAlt-layer companion raised from an accepted suggestion.
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery, PATTERN_SEQUENCE, PATTERN_DEADKEY } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { createVirtualFS, makePlacementMap, type MechanismAssignment, type IRGroup, type IRRule, type PlacementMap } from "@keyboard-studio/contracts";
import { basicKbdus, corpusBackedQwerty, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { suggestionRowText, seedInventory, mainGroup } from "../../test/mechanismGallery/harness.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

// ---------------------------------------------------------------------------
// kbgen suggestion row — gated on the current character's producer badge
// (bug fix: a char already green via composition must not ALSO show a
// stale "suggested" proposal — there's no single key left for it to propose).
// ---------------------------------------------------------------------------

describe("MechanismGallery — kbgen suggestion gated on the current char's producer badge", () => {
  it("hides the suggestion for a composition-covered character (ǯ, badge count >= 1) and shows it for a plain uncovered character (count === 0) in the same session", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    // "ǯ" is composable from a session-produced ezh + that SAME deadkey's
    // session-produced bare caron byproduct (identical fixture shape to the
    // badge-count pins above) — no assignment of its own, badge count 1.
    // "à" stays completely uncovered (badge count 0).
    seedInventory(["ʒ", "̌", "ǯ", "à"]);

    const producesEzhAndCaronByproduct: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_QUOTE",
            baseLetters: "z",
            accentedForms: "ʒ",
            accentChar: "̌",
          },
        },
      ],
      source: "user",
    };
    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [producesEzhAndCaronByproduct],
    });

    // A placement map offering a (would-be) suggestion for BOTH "ǯ" (should
    // be suppressed by the badge) and "à" (should still show — count 0).
    const placementMap = makePlacementMap({
      bcp47Context: "test",
      baseLayoutFamily: "QWERTY",
      entries: [
        {
          codepoint: "U+01EF", // ǯ
          candidates: [
            {
              vkey: "K_9",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 3,
              confidence: 0.8,
            },
          ],
        },
        {
          codepoint: "U+00E0", // à
          candidates: [
            {
              vkey: "K_A",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 4,
              confidence: 0.88,
            },
          ],
        },
      ],
    });

    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} placementMap={placementMap} />,
      );
    });

    const strip = screen.getByTestId("char-scroll-strip");

    // "ǯ" — composable (badge green 1, no own assignment): the placement map
    // has a candidate for it, but the suggestion row must NOT render.
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-01EF"));
    await waitFor(() => {
      expectCurrentChar("ǯ");
    });
    expect(screen.queryByText(/Suggested: RAlt \+ 9 for ǯ/i)).toBeNull();

    // "à" — plain uncovered (badge count 0): the SAME placement map's
    // suggestion for it DOES render.
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-00E0"));
    await waitFor(() => {
      expectCurrentChar("à");
    });
    // Wrapped in waitFor (not a bare synchronous getByText) — the suggestion
    // row's gate (suggestion/currentCharBadge/suggestionDismissed) recomputes
    // in the same render as the chip's aria-pressed flip, but under
    // full-suite load a second, effect-driven re-render (the per-char
    // method-state reset effect a few lines above in the component) can
    // still be settling when a bare synchronous query runs immediately after
    // the first waitFor resolves — this only asserts the chip's selection,
    // not the suggestion row's presence. waitFor retries until both have
    // caught up, without weakening what's asserted.
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(/Suggested: RAlt \+ a for 'à'/i);
    });
  });

  it("hides the suggestion for a character already produced by the BASE keyboard (ɛ, badge count >= 1 via signal (a) BASE-DIRECT, no session assignment, not composable, no sequence) — the case the old hasSequenceForChar||isComposable gate missed", async () => {
    // "ɛ" (U+025B) is produced directly by a base-layer rule (K_Q) — no
    // session MechanismAssignment, no composition, no recorded sequence. The
    // OLD gate (`!(hasSequenceForChar || isComposable)`) evaluates to
    // `!(false || false) === true` for this character, so it would WRONGLY
    // show the suggestion despite the badge already reading count >= 1 —
    // exactly the reported bug (ɛ already worked via an existing method, yet
    // "Suggested: Replace Q with ɛ" still appeared).
    const ruleQ: IRRule = {
      nodeId: "r-q",
      context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
      output: [{ kind: "char", value: "ɛ" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleQ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });

    // Base-produced characters stay OUT of lettersToAdd (same as the "z" case
    // in the Done-button tests below) — reach it via the SHOW-ALL strip.
    seedInventory(["ɛ"]);

    const placementMap = makePlacementMap({
      bcp47Context: "test",
      baseLayoutFamily: "QWERTY",
      entries: [
        {
          codepoint: "U+025B", // ɛ
          candidates: [
            {
              vkey: "K_Q",
              modifiers: [],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 5,
              confidence: 0.9,
            },
          ],
        },
      ],
    });

    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} placementMap={placementMap} />,
      );
    });

    fireEvent.click(screen.getByTestId("char-scroll-chip-025B"));
    await waitFor(() => {
      expectCurrentChar("ɛ");
    });

    // Badge already reads count >= 1 (base-direct) — no suggestion may show.
    expect(screen.queryByText(/Suggested: Replace Q with ɛ/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// kbgen suggestion row text — S-01 keycap convention (physical-key-naming
// ambiguity fix). The S-08 (RALT) shape already has a positive assertion
// above ("Suggested: RAlt + a for 'à'"); this closes the matching gap for
// S-01 (a `direct` candidate with no RALT modifier — strategyForCandidate
// resolves it to S-01) — the KEY name lowercase, the produced CHARACTER
// quoted in its real case.
// ---------------------------------------------------------------------------

describe("MechanismGallery — kbgen suggestion row text (S-01 keycap convention)", () => {
  it("renders the lowercase key name and real-case quoted character for an S-01 (no-modifier direct) candidate", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    seedInventory(["x"]);

    const placementMap = makePlacementMap({
      bcp47Context: "test",
      baseLayoutFamily: "QWERTY",
      entries: [
        {
          codepoint: "U+0078", // x
          candidates: [
            {
              vkey: "K_Q",
              modifiers: [],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 4,
              confidence: 0.88,
            },
          ],
        },
      ],
    });

    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} placementMap={placementMap} />,
      );
    });

    fireEvent.click(screen.getByTestId("char-scroll-chip-0078"));
    await waitFor(() => {
      expectCurrentChar("x");
    });

    await waitFor(() => {
      expect(suggestionRowText()).toMatch(/Suggested: Replace the q key with 'x'/i);
    });
  });
});

// ---------------------------------------------------------------------------
// kbgen suggestion row — persistence across Back navigation
// ---------------------------------------------------------------------------

describe("MechanismGallery — kbgen suggestion persistence across Back navigation", () => {
  it("an accepted suggestion row does not reappear after navigating forward and back", async () => {
    // corpusBackedQwerty proposes RALT+K_E for U+00E9 (é) and RALT+K_A for
    // U+00E0 (à) — both S-08 (modifier_as_layer_switch) candidates. The
    // gallery's walk is collated (spec 047's collateCompare): "à" sorts
    // before "é" (a < e), so "à" is the first character regardless of the
    // seed array's own order.
    const onBack = vi.fn();
    seedInventory(["é", "à"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          onBack={onBack}
          placementMap={corpusBackedQwerty}
        />,
      );
    });

    // Suggestion row shows for "à". Wrapped in waitFor — same fragile
    // synchronous-getByText-after-render pattern hardened elsewhere in this
    // describe block (see the kbgen-suggestion-gated describe above).
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(/Suggested: RAlt \+ a for 'à'/i);
    });

    // Accept it — records the S-08 assignment and dismisses the row (the
    // dismissal is also implied by coveredChars once accepted).
    fireEvent.click(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ a key for 'à'/i }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("note", { name: /Placement suggestion from kbgen seeder/i }),
      ).toBeNull();
    });

    // Advance to "é" — its own (not-yet-resolved) suggestion row shows.
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(/Suggested: RAlt \+ e for 'é'/i);
    });

    // Navigate back to "à" without resolving é's suggestion. Scoped via
    // expectCurrentChar to the CharScrollStrip's selected chip: "à" is
    // covered (accepted above), so an "Added" chip ("Remove U+00E0 à") also
    // carries "U+00E0" in its own aria-label — an unscoped query would be
    // ambiguous.
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    expect(onBack).not.toHaveBeenCalled();
    await waitFor(() => {
      expectCurrentChar("à");
    });

    // The already-accepted suggestion for "à" must NOT re-render its card.
    expect(
      screen.queryByRole("note", { name: /Placement suggestion from kbgen seeder/i }),
    ).toBeNull();
  });

  it("a suggestion row REAPPEARS after marking for later review (unlike Accept/Deny) — marking resolves nothing", async () => {
    // Same fixture as the accepted-suggestion test above, but this time the
    // character is MARKED FOR LATER REVIEW rather than accepted/denied.
    // Marking is a separate toggle from suggestionResolved (see canGoNext's
    // own doc comment) and must not add the character to suggestionResolved,
    // so returning to it must show the suggestion again.
    // "à" is the first character in the collated walk (a < e).
    seedInventory(["é", "à"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={corpusBackedQwerty}
        />,
      );
    });

    // Suggestion row shows for "à". Wrapped in waitFor — same fragile
    // synchronous-getByText-after-render pattern hardened elsewhere in this
    // describe block.
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(/Suggested: RAlt \+ a for 'à'/i);
    });

    // Mark it, then advance — no accept/deny, no assignment recorded.
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E0 à for later review/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expectCurrentChar("é");
    });

    // Navigate back to "à" without ever resolving its suggestion.
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expectCurrentChar("à", { marked: true });
    });

    // Unlike the accept/deny case above, the suggestion row for "à" MUST
    // reappear — marking resolved nothing about the suggestion itself.
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(/Suggested: RAlt \+ a for 'à'/i);
    });
  });
});

// ---------------------------------------------------------------------------
// kbgen suggestion row — uppercase case-pair fallback
//
// The placement map only carries an entry for ƒ (U+0192), the LOWERCASE
// letter — Ƒ (U+0191) has no map entry of its own. Without the case-pair
// fallback (getRankedSuggestionsForChar's case-pair inheritance), Ƒ would get
// no suggestion at all. With it, Ƒ gets a synthesized S-08 suggestion on the
// SAME vkey (K_F) at the RAlt+Shift layer — the shifted counterpart of ƒ's
// RAlt layer.
// ---------------------------------------------------------------------------

const ffHookPlacementMap: PlacementMap = {
  entries: [
    {
      codepoint: "U+0192",
      candidates: [
        {
          vkey: "K_F",
          modifiers: ["RALT"],
          mechanism: "direct",
          priorSource: "phonetic",
          priorCount: 0,
          confidence: 0.6,
        },
      ],
    },
  ],
};

describe("MechanismGallery — kbgen suggestion row — uppercase case-pair fallback", () => {
  it("navigating to the uppercase sibling shows a RAlt+Shift suggestion row", async () => {
    seedInventory(["Ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    expectCurrentChar("Ƒ");
    expect(suggestionRowText()).toMatch(/Suggested: Shift\+RAlt \+ f for 'Ƒ'/i);
    expect(
      screen.getByRole("button", {
        name: /Accept suggestion: Shift\+RAlt \+ f key for 'Ƒ'/i,
      }),
    ).toBeTruthy();
  });

  it("accepting it records a modifier_as_layer_switch mechanism with altgrKeyList \"[SHIFT RALT K_F]\"", async () => {
    seedInventory(["Ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: Shift\+RAlt \+ f key for 'Ƒ'/i,
      }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe(
      "modifier_as_layer_switch",
    );
    expect(assignments[0]?.mechanisms[0]?.strategyId).toBe("S-08");
    // The exact emitted string — textually distinct from the lowercase ƒ's
    // own "[RALT K_F]" (no collision on the same key/layer).
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT RALT K_F]",
    );
    expect(
      assignments[0]?.mechanisms[0]?.slotValues?.["altgrOutputList"],
    ).toBe("Ƒ");
  });

  it("the lowercase ƒ itself still gets its own direct RALT suggestion (unaffected by the fallback)", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    expectCurrentChar("ƒ");
    expect(suggestionRowText()).toMatch(/Suggested: RAlt \+ f for 'ƒ'/i);

    fireEvent.click(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ f key for 'ƒ'/i }),
    );
    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[RALT K_F]",
    );
  });

  it("suppresses the suggestion row when the top placement candidate is CAPS-based", async () => {
    // CAPS is a case/state modifier, not a layer an author reaches for, so a
    // "Caps + key" recommendation must not be surfaced as a suggestion. The
    // candidate below would otherwise render an S-08 suggestion row (same
    // shape as ffHookPlacementMap's RALT candidate); the CAPS token must
    // suppress it entirely. CAPS remains selectable as a manual layer pick —
    // that path is covered by the layer-picker tests above and is untouched.
    const capsPlacementMap: PlacementMap = {
      entries: [
        {
          codepoint: "U+03B5",
          candidates: [
            {
              vkey: "K_E",
              modifiers: ["RALT", "CAPS"],
              mechanism: "direct",
              priorSource: "phonetic",
              priorCount: 0,
              confidence: 0.9,
            },
          ],
        },
      ],
    };
    seedInventory(["ε"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={capsPlacementMap}
        />,
      );
    });

    expectCurrentChar("ε");
    // No suggestion row at all for a CAPS-carrying candidate.
    expect(screen.queryByText(/Suggested:/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ranked suggestion row — up to 2 distinct-strategy chips for one codepoint
// (getRankedSuggestionsForChar). ƒ U+0192 attested by BOTH a corpus deadkey
// (S-02, baseLetter "f") and a corpus RALT candidate (S-08) — the gallery
// must render both chips, each independently acceptable, with one shared
// Deny dismissing the whole row.
// ---------------------------------------------------------------------------

const ffRankedPlacementMap: PlacementMap = {
  entries: [
    {
      codepoint: "U+0192",
      candidates: [
        {
          vkey: "K_QUOTE",
          modifiers: [],
          mechanism: "deadkey",
          priorSource: "corpus",
          priorCount: 6,
          confidence: 0.7,
          baseLetter: "f",
        },
        {
          vkey: "K_F",
          modifiers: ["RALT"],
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 4,
          confidence: 0.6,
        },
      ],
    },
  ],
};

describe("MechanismGallery — ranked suggestion row (S-02 deadkey + S-08 RAlt, same codepoint)", () => {
  it("renders both chips, each with its own Accept button", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    expectCurrentChar("ƒ");
    expect(screen.getByText(/Suggested: Deadkey → 'f' for 'ƒ'/i)).toBeTruthy();
    expect(suggestionRowText()).toMatch(/Suggested: RAlt \+ f for 'ƒ'/i);

    // One shared Deny for the whole row, two independent Accept buttons
    // (each named by its own aria-label, per mechanism).
    expect(
      screen.getByRole("button", {
        name: /Accept suggestion: deadkey via base letter 'f' for 'ƒ'/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ f key for 'ƒ'/i }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("button")
        .filter((b) => b.textContent?.trim() === "Accept"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Deny suggestion/i }),
    ).toBeTruthy();
  });

  it("accepting the S-02 (deadkey) chip records a deadkey_single_tap mechanism using the corpus baseLetter and the studio's default trigger key", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: deadkey via base letter 'f' for 'ƒ'/i,
      }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    const mech = assignments[0]?.mechanisms[0];
    expect(mech?.patternId).toBe(PATTERN_DEADKEY);
    expect(mech?.strategyId).toBe("S-02");
    expect(mech?.slotValues?.["baseLetters"]).toBe("f");
    expect(mech?.slotValues?.["accentedForms"]).toBe("ƒ");
    // Corpus triggers are deliberately not imposed — the studio's own
    // default trigger key (K_COLON) is used, not the corpus candidate's vkey
    // (K_QUOTE, which is only ever a display-only host label for THIS
    // candidate's own placement, not a trigger-key attestation).
    expect(mech?.slotValues?.["triggerKey"]).toBe("K_COLON");
  });

  it("accepting the S-08 (RAlt) chip still works independently of the S-02 chip", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ f key for 'ƒ'/i }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe(
      "modifier_as_layer_switch",
    );
    expect(assignments[0]?.mechanisms[0]?.strategyId).toBe("S-08");
  });

  it("Deny dismisses the whole row — both chips disappear, revisiting the char doesn't reshow it", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Deny suggestion/i }));
    expect(screen.queryByText(/Suggested:/i)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Bug fix: accepts are INDEPENDENT — accepting one chip must not hide the
  // other. Previously, accepting EITHER chip recorded a mechanism, which
  // flipped the character's producer badge to count >= 1 and hid the WHOLE
  // row (suggestionDismissed's old coveredChars check + the row's old
  // `(currentCharBadge?.count ?? 0) === 0` gate) — so accepting the deadkey
  // chip silently made the RAlt chip vanish before the author ever saw it.
  // -------------------------------------------------------------------------

  it("accepting the S-02 chip leaves the S-08 chip visible and independently acceptable; accepting both records both assignments and removes the row", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    // Accept the deadkey (S-02) chip first.
    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: deadkey via base letter 'f' for 'ƒ'/i,
      }),
    );

    // The deadkey chip's own text is gone, but the RAlt (S-08) chip's text
    // AND its Accept button are STILL rendered — the bug this fixes.
    await waitFor(() => {
      expect(screen.queryByText(/Suggested: Deadkey → 'f' for 'ƒ'/i)).toBeNull();
      expect(suggestionRowText()).toMatch(/Suggested: RAlt \+ f for 'ƒ'/i);
    });
    const raltAccept = screen.getByRole("button", {
      name: /Accept suggestion: RAlt \+ f key for 'ƒ'/i,
    });
    expect((raltAccept as HTMLButtonElement).disabled).toBe(false);

    // Accept the remaining RAlt chip too.
    fireEvent.click(raltAccept);

    // Both mechanisms are now recorded — accepting one never overwrote or
    // dropped the other. Read straight off Phase C's own assignments array
    // (what recordAssignments writes and the component itself reads via
    // sessionAssignments/mechanismAssignments), NOT the derived
    // `session.assignments` view — mergeAssignments there is last-wins per
    // (modality, scope, target) across PHASES, a cross-phase reconciliation
    // rule that isn't this row's concern; two independent per-mechanism
    // entries for the SAME character within the SAME phase C are exactly
    // what this gallery (and this fix) intentionally allows.
    await waitFor(() => {
      const assignments = (
        useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")
          ?.assignments ?? []
      ).filter((a) => a.modality === "physical");
      expect(assignments).toHaveLength(2);
      const strategyIds = assignments
        .flatMap((a) => a.mechanisms.map((m) => m.strategyId))
        .sort();
      expect(strategyIds).toEqual(["S-02", "S-08"]);
    });

    // With every chip accepted, the row itself disappears entirely.
    await waitFor(() => {
      expect(screen.queryByText(/Suggested:/i)).toBeNull();
    });
  });

  it("revisit: an accepted chip does not reappear after navigating away and back, while its unaccepted sibling's suggestion persists", async () => {
    seedInventory(["ƒ", "z"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    const strip = screen.getByTestId("char-scroll-strip");
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-0192"));
    await waitFor(() => {
      expectCurrentChar("ƒ");
    });

    // Accept only the deadkey (S-02) chip; leave the RAlt (S-08) chip alone.
    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: deadkey via base letter 'f' for 'ƒ'/i,
      }),
    );
    await waitFor(() => {
      expect(screen.queryByText(/Suggested: Deadkey → 'f' for 'ƒ'/i)).toBeNull();
    });

    // Navigate away to "z" and back to "ƒ".
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-007A"));
    await waitFor(() => {
      expectCurrentChar("z");
    });
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-0192"));
    await waitFor(() => {
      expectCurrentChar("ƒ");
    });

    // The already-accepted deadkey chip must NOT reappear (revisit
    // semantics — its mechanism is still on record); the never-touched RAlt
    // chip must still be offered.
    expect(screen.queryByText(/Suggested: Deadkey → 'f' for 'ƒ'/i)).toBeNull();
    expect(suggestionRowText()).toMatch(/Suggested: RAlt \+ f for 'ƒ'/i);
  });

  // -------------------------------------------------------------------------
  // Defect 2 evidence — per-mechanism removal already exists
  // (handleRemoveMechanism / the "Applied methods" chip row) and works
  // identically regardless of whether the mechanism was recorded via a
  // manual Apply or via accepting a suggestion chip: each accepted
  // suggestion becomes its own MechanismAssignment object, so each gets its
  // own independent "Remove method" chip.
  // -------------------------------------------------------------------------

  it("each suggestion-accepted mechanism gets its own independent remove control — removing one leaves the other intact", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: deadkey via base letter 'f' for 'ƒ'/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ f key for 'ƒ'/i }),
    );

    let deadkeyBadge: HTMLElement | null = null;
    let raltBadge: HTMLElement | null = null;
    await waitFor(() => {
      const badges = screen.queryAllByRole("button", { name: /^Remove method/i });
      expect(badges.length).toBe(2);
      deadkeyBadge = badges.find((b) => b.getAttribute("aria-label")?.includes("Deadkey")) ?? null;
      raltBadge = badges.find((b) => b.getAttribute("aria-label")?.includes("RAlt")) ?? null;
      expect(deadkeyBadge).not.toBeNull();
      expect(raltBadge).not.toBeNull();
    });

    // Remove only the deadkey mechanism.
    await act(async () => {
      fireEvent.click(deadkeyBadge!);
    });

    await waitFor(() => {
      // See the note in the accept-independence test above re: reading
      // phaseResults' own Phase C assignments rather than the merged
      // `session.assignments` view.
      const assignments = (
        useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")
          ?.assignments ?? []
      ).filter((a) => a.modality === "physical");
      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.mechanisms[0]?.strategyId).toBe("S-08");
    });
    const remaining = screen.queryAllByRole("button", { name: /^Remove method/i });
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.getAttribute("aria-label") ?? "").toMatch(/RAlt/i);
  });

  // -------------------------------------------------------------------------
  // Style — the suggestion row is GREEN, not red (product decision). It's a
  // proposal/affordance the author can accept or deny, not an error state.
  // -------------------------------------------------------------------------

  it("renders the suggestion row in the green family, not ERROR_RED/ERROR_BG", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    const row = screen.getByRole("note", {
      name: /Placement suggestion from kbgen seeder/i,
    });
    // #0d2218 / #238636 — the SAME green pair CharScrollStrip's badgeGood
    // treatment and the "Applied methods" chips already use elsewhere in
    // this gallery. Never the old ERROR_RED (#f85149) / ERROR_BG (#2a0a0a).
    expect(row.style.background).toBe("var(--app-success-bg)"); // GREEN_CHIP_BG shorthand (epic #533)
    expect(row.style.border).toBe("1px solid var(--app-success)"); // GREEN_CHIP_BORDER shorthand (epic #533)
    expect(row.style.background).not.toBe("var(--app-danger-bg)");
    expect(row.style.border).not.toBe("1px solid var(--app-danger)");

    const suggestionText = screen.getByText(/Suggested: Deadkey → 'f' for 'ƒ'/i);
    expect(suggestionText.style.color).toBe("var(--app-success-text)"); // --app-success-text token (epic #533)
    expect(suggestionText.style.color).not.toBe("var(--app-danger)");
  });
});

// ---------------------------------------------------------------------------
// Suggestion row suppression — coverage by means OTHER than one of THIS
// row's own offered chips. Two signals beyond baseOnlyProducedSet/
// isComposable: (d) SEQUENCE (hasSequenceForChar) and (e) UNRELATED MANUAL
// (a recorded non-sequence mechanism whose strategyId isn't among the
// offered chips). Both must suppress the WHOLE row even though neither one
// ever populates recordedSuggestionStrategyIds for an OFFERED strategyId —
// see the render-gate comment in MechanismGallery.tsx.
// ---------------------------------------------------------------------------

describe("MechanismGallery — suggestion row suppressed by non-chip coverage", () => {
  it("a char already covered by a recorded PATTERN_SEQUENCE assignment shows no suggestion row", async () => {
    seedInventory(["ƒ"]);
    // Mirrors the "coexistence with a separately-recorded sequence
    // assignment" fixture shape above — a sequence assignment recorded
    // BEFORE render, for the SAME char the corpus placement map offers
    // suggestions for.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ƒ",
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            strategyId: "S-03",
            slotValues: { firstLetterOut: "f", secondLetter: "f", collapsedChar: "ƒ" },
          },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    expectCurrentChar("ƒ");
    expect(screen.queryByText(/Suggested:/i)).toBeNull();
    expect(
      screen.queryByRole("note", {
        name: /Placement suggestion from kbgen seeder/i,
      }),
    ).toBeNull();
  });

  it("a char already covered by a manually-applied mechanism whose strategyId is NOT among the offered chips shows no suggestion row", async () => {
    seedInventory(["ƒ"]);
    // "S-01" is not one of ffRankedPlacementMap's offered strategyIds
    // (S-02 deadkey, S-08 RAlt) — an unrelated manual method.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ƒ",
        modality: "physical",
        mechanisms: [
          { patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_QUOTE] > U+0192" } },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    expectCurrentChar("ƒ");
    expect(screen.queryByText(/Suggested:/i)).toBeNull();
    expect(
      screen.queryByRole("note", {
        name: /Placement suggestion from kbgen seeder/i,
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Case-pair companion — ralt-layer proposal, raised right after ACCEPTING
// the lowercase S-08 RAlt suggestion (not on a separate navigation to the
// uppercase sibling — see handleSuggestionAccept).
// ---------------------------------------------------------------------------

describe("MechanismGallery — case-pair companion (ralt-layer, from suggestion accept)", () => {
  it("accepting the lowercase ƒ RAlt suggestion raises the companion banner for Ƒ", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    expectCurrentChar("ƒ");
    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: RAlt \+ f key for 'ƒ'/i,
      }),
    );

    expect(screen.getByText(/has an uppercase form, Ƒ/i)).toBeTruthy();
  });

  it("confirming records a modifier_as_layer_switch mechanism for Ƒ with altgrKeyList \"[SHIFT RALT K_F]\"", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: RAlt \+ f key for 'ƒ'/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /Map Ƒ to the Shift\+RAlt layer of the f key/i,
      }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    const companion = assignments.find((a) => a.target === "Ƒ");
    expect(companion).toBeDefined();
    expect(companion?.mechanisms[0]?.patternId).toBe(
      "modifier_as_layer_switch",
    );
    expect(companion?.mechanisms[0]?.strategyId).toBe("S-08");
    expect(companion?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT RALT K_F]",
    );
    expect(companion?.mechanisms[0]?.slotValues?.["altgrOutputList"]).toBe(
      "Ƒ",
    );

    // Prompt is dismissed after confirm.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("does NOT raise the companion banner when accepting a suggestion for an already-uppercase char", async () => {
    seedInventory(["Ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    expectCurrentChar("Ƒ");
    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: Shift\+RAlt \+ f key for 'Ƒ'/i,
      }),
    );

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("stale-guard: confirming a ralt-layer companion whose base assignment vanished via an unaudited mutation path records nothing", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: RAlt \+ f key for 'ƒ'/i,
      }),
    );
    expect(screen.getByText(/has an uppercase form, Ƒ/i)).toBeTruthy();

    // Simulate a hypothetical future mutation path that touches
    // sessionAssignments WITHOUT going through handleRemoveCovered /
    // handleRemoveMechanism (which proactively dismiss the banner) — direct
    // store mutation bypassing the component's own handlers entirely, the
    // same technique the physical and combo stale-guard tests above use. The
    // component's pendingCompanion state is untouched by this, so the banner
    // remains visible in the DOM, exercising the confirm-time staleness
    // re-check in handleCompanionConfirm's "ralt-layer" branch
    // (`sessionAssignments.includes(pendingCompanion.baseAssignment)`) rather
    // than any removal-time dismissal.
    await act(async () => {
      useWorkingCopyStore.getState().recordAssignments([]);
    });
    expect(screen.getByText(/has an uppercase form, Ƒ/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Map Ƒ to the Shift\+RAlt layer of the f key/i,
      }),
    );

    // Nothing was recorded for the counterpart — the stale proposal was
    // dismissed, not applied.
    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments.find((a) => a.target === "Ƒ")).toBeUndefined();
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });
});
