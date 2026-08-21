// Text-sample prefill (paste or upload) — spec 050.
//
// Covers US1 (paste), US2 (upload), and US3 (union with exemplar coverage).
// Extraction goes through the REAL engine harvestFromText (via
// createCharacterDiscoveryService with a null CLDR loader — harvestFromText
// never calls it) rather than a hand-rolled mock, so these tests exercise the
// actual FR-004 extraction contract, not a re-implementation of it. Only the
// exemplar-lookup half of "../lib/services.ts" is faked, mirroring
// PhaseBExemplarPrefill.test.tsx.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "../test/renderWithI18n.tsx";
import { PhaseB } from "./PhaseB.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import {
  usePhaseBDraftStore,
  resetPhaseBDraftDecisions,
} from "../stores/phaseBDraftStore.ts";
import type { SourcedInventory } from "../lib/services.ts";

const { getSourcedExemplars, extractionShouldFail } = vi.hoisted(() => {
  let _inventory: SourcedInventory | null = null;
  let _shouldFail = false;
  return {
    getSourcedExemplars: {
      get: () => _inventory,
      set: (v: SourcedInventory | null) => {
        _inventory = v;
      },
    },
    extractionShouldFail: {
      get: () => _shouldFail,
      set: (v: boolean) => {
        _shouldFail = v;
      },
    },
  };
});

vi.mock("../lib/services.ts", async () => {
  const engine = await import("@keyboard-studio/engine");
  // harvestFromText never calls the loader — a null loader is safe (mirrors
  // CharacterDiscoveryServiceImpl.test.ts's own fixture).
  const nullLoader = async (): Promise<string | null> => null;
  const noopCompleter = async (): Promise<string> => {
    throw new Error("not called");
  };
  const realService = engine.createCharacterDiscoveryService(nullLoader, noopCompleter);
  return {
    USE_REAL: false,
    suggestMissingChars: async () => null,
    sourcedExemplars: async (_bcp47: string) => getSourcedExemplars.get(),
    charactersInTier: engine.charactersInTier,
    getCharacterDiscoveryService: async () => {
      // Toggled by the extraction-failure test to exercise
      // extractAndPropose's catch branch — a rejecting dynamic import() in
      // production must surface an error, not vanish as an unhandled
      // rejection behind handleSubmit's `void`.
      if (extractionShouldFail.get()) {
        throw new Error("chunk load failed");
      }
      return realService;
    },
  };
});

function inventory(main: string[]): SourcedInventory {
  return {
    resolvedTag: "ewo",
    source: "cldr",
    confidence: "approved",
    characters: main.map((char) => ({
      char,
      tier: "main" as const,
      source: "cldr" as const,
      confidence: "approved" as const,
    })),
    digraphs: [],
  };
}

const CONTEXT = { bcp47_tag: "ewo", language_name: "Ewondo" };

function renderPhaseB(): { onComplete: ReturnType<typeof vi.fn> } {
  const onComplete = vi.fn();
  render(<PhaseB context={CONTEXT} onComplete={onComplete} />);
  return { onComplete };
}

/** Land on the build-list page (page 2) via the default "build-list" choice. */
async function reachPage2(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId("phase-b-intro-next")).toBeTruthy();
  });
  fireEvent.click(screen.getByTestId("phase-b-intro-next"));
  await waitFor(() => expect(screen.getByTestId("phase-b-done")).toBeTruthy());
}

/** Accept the exemplar offer (when present) and land on page 2. */
async function acceptExemplarsAndReachPage2(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId("phase-b-intro-next")).toBeTruthy();
  });
  const radio = document.querySelector<HTMLInputElement>("#discovery_method-exemplars");
  await waitFor(() => expect(radio!.checked).toBe(true));
  fireEvent.click(screen.getByTestId("phase-b-intro-next"));
  await waitFor(() => expect(screen.getByTestId("phase-b-done")).toBeTruthy());
}

beforeEach(() => {
  getSourcedExemplars.set(null);
  extractionShouldFail.set(false);
  useSurveySessionStore.getState().setDiscoveryMethod(null);
  usePhaseBDraftStore.getState().reset();
  resetPhaseBDraftDecisions();
});

afterEach(() => {
  cleanup();
  extractionShouldFail.set(false);
  useSurveySessionStore.getState().setDiscoveryMethod(null);
  usePhaseBDraftStore.getState().reset();
  resetPhaseBDraftDecisions();
});

function pasteAndSubmit(text: string): void {
  fireEvent.change(screen.getByTestId("text-sample-textarea"), { target: { value: text } });
  fireEvent.click(screen.getByTestId("text-sample-submit"));
}

// ---------------------------------------------------------------------------
// US1 — paste a paragraph and get an alphabet
// ---------------------------------------------------------------------------

describe("US1 — paste a paragraph (FR-004/FR-005/FR-006)", () => {
  it("proposes every distinct character in the pasted text, attributed to 'text' (AS1, SC-002)", async () => {
    renderPhaseB();
    await reachPage2();
    pasteAndSubmit("aab ŋɛ");

    await waitFor(() => {
      expect(usePhaseBDraftStore.getState().chars).toContain("a");
    });
    const state = usePhaseBDraftStore.getState();
    for (const c of ["a", "b", "ŋ", "ɛ"]) {
      expect(state.chars).toContain(c);
      expect(state.provenance[c]).toBe("text");
    }
    // Whitespace itself was never proposed.
    expect(state.chars).not.toContain(" ");
  });

  it("swaps the heading to 'Confirm your alphabet' once a text sample has proposed something", async () => {
    renderPhaseB();
    await reachPage2();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "Add your whole alphabet",
    );
    pasteAndSubmit("abc");
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
        "Confirm your alphabet",
      );
    });
  });

  it("a removed proposed character stays removed after the step resets (AS2, SC-003)", async () => {
    renderPhaseB();
    await reachPage2();
    pasteAndSubmit("abc");
    await waitFor(() => expect(usePhaseBDraftStore.getState().chars).toContain("a"));

    usePhaseBDraftStore.getState().remove("a");
    expect(usePhaseBDraftStore.getState().rejected).toContain("a");

    // Re-entering the step calls reset(); rejected survives it by contract.
    usePhaseBDraftStore.getState().reset();
    expect(usePhaseBDraftStore.getState().rejected).toContain("a");

    pasteAndSubmit("abc");
    await waitFor(() => expect(usePhaseBDraftStore.getState().chars).toContain("b"));
    expect(usePhaseBDraftStore.getState().chars).not.toContain("a");
  });

  it("an empty or whitespace-only paste leaves the draft empty with an inline message, no error (AS3, FR-008)", async () => {
    renderPhaseB();
    await reachPage2();
    pasteAndSubmit("   \n\t  ");

    await waitFor(() => {
      expect(screen.getByTestId("text-sample-empty-message")).toBeTruthy();
    });
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    expect(screen.queryByTestId("text-sample-upload-error")).toBeNull();
    // The step is still usable — heading has not moved off "Add".
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "Add your whole alphabet",
    );
    expect(screen.getByTestId("phase-b-done")).toBeTruthy();
  });

  it("surfaces a plain message and stays usable when the extraction service itself fails", async () => {
    extractionShouldFail.set(true);
    renderPhaseB();
    await reachPage2();
    pasteAndSubmit("abc");

    await waitFor(() => {
      expect(screen.getByTestId("text-sample-upload-error")).toBeTruthy();
    });
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    // Not stuck: the submit button re-enables once the failed attempt settles.
    expect((screen.getByTestId("text-sample-submit") as HTMLButtonElement).disabled).toBe(false);

    // Recovers on a subsequent successful attempt.
    extractionShouldFail.set(false);
    pasteAndSubmit("abc");
    await waitFor(() => expect(usePhaseBDraftStore.getState().chars).toContain("a"));
    expect(screen.queryByTestId("text-sample-upload-error")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// US2 — upload a file instead of pasting
// ---------------------------------------------------------------------------

describe("US2 — upload a .txt file (FR-003)", () => {
  it("uploading a fixture .txt produces an identical proposal to pasting its exact contents (SC-004)", async () => {
    const sampleText = "aab ŋɛ";

    // Paste path, in its own render.
    renderPhaseB();
    await reachPage2();
    pasteAndSubmit(sampleText);
    await waitFor(() => expect(usePhaseBDraftStore.getState().chars).toContain("a"));
    const pastedChars = [...usePhaseBDraftStore.getState().chars].sort();
    cleanup();
    usePhaseBDraftStore.getState().reset();
    resetPhaseBDraftDecisions();
    // Mid-test reset: the top-level afterEach only fires between separate
    // it()s. This test simulates two independent test entries within one, so
    // it must also reset discoveryMethod itself — otherwise the second render
    // inherits the first pass's "build-list" choice and skips the intro
    // chooser entirely, and reachPage2() never finds phase-b-intro-next.
    useSurveySessionStore.getState().setDiscoveryMethod(null);

    // Upload path, in a fresh render.
    const user = userEvent.setup();
    renderPhaseB();
    await reachPage2();
    const file = new File([sampleText], "sample.txt", { type: "text/plain" });
    const input = screen.getByTestId("text-sample-file-input") as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(usePhaseBDraftStore.getState().chars).toContain("a"));
    const uploadedChars = [...usePhaseBDraftStore.getState().chars].sort();
    expect(uploadedChars).toEqual(pastedChars);
    expect(usePhaseBDraftStore.getState().provenance["a"]).toBe("text");
  });

  it("surfaces a plain message for an undecodable/binary file without blocking the step (AS2)", async () => {
    renderPhaseB();
    await reachPage2();
    const user = userEvent.setup();
    // A byte sequence invalid as UTF-8 decodes (via File.text()) with U+FFFD
    // replacement characters — the heuristic this feature detects (research R4).
    const binary = new File([new Uint8Array([0xff, 0xfe, 0x00, 0xff])], "binary.txt", {
      type: "text/plain",
    });
    const input = screen.getByTestId("text-sample-file-input") as HTMLInputElement;
    await user.upload(input, binary);

    await waitFor(() => {
      expect(screen.getByTestId("text-sample-upload-error")).toBeTruthy();
    });
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    // The step remains usable.
    expect(screen.getByTestId("phase-b-done")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// US3 — combine a text sample with exemplar coverage
// ---------------------------------------------------------------------------

describe("US3 — union with exemplar coverage (FR-007, research R5)", () => {
  it("accepting an exemplar offer AND submitting a text sample unions both, each character keeping its own source", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    renderPhaseB();
    await acceptExemplarsAndReachPage2();

    await waitFor(() => expect(usePhaseBDraftStore.getState().chars).toContain("ŋ"));
    expect(usePhaseBDraftStore.getState().provenance["ŋ"]).toBe("cldr");

    // A text sample with one extra character ("q") plus one already covered
    // by the exemplar offer ("a").
    pasteAndSubmit("a q");

    await waitFor(() => {
      expect(usePhaseBDraftStore.getState().chars).toContain("q");
    });
    const state = usePhaseBDraftStore.getState();
    // Union: the exemplar-sourced characters are still there...
    expect(state.chars).toContain("ŋ");
    expect(state.provenance["ŋ"]).toBe("cldr");
    // ...and the text-only addition joined them.
    expect(state.chars).toContain("q");
    expect(state.provenance["q"]).toBe("text");
    // The character both sources attest keeps its FIRST attribution (cldr,
    // since the exemplar offer was accepted first) — no precedence rule to
    // add, just the existing first-write-wins contract (research R5).
    expect(state.provenance["a"]).toBe("cldr");
  });

  it("re-submitting the text sample after accepting exemplars does not revert exemplar-attributed characters (AS1 'neither overwrites the other')", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    renderPhaseB();
    await acceptExemplarsAndReachPage2();
    await waitFor(() => expect(usePhaseBDraftStore.getState().chars).toContain("ŋ"));

    pasteAndSubmit("a ŋ q");
    await waitFor(() => expect(usePhaseBDraftStore.getState().chars).toContain("q"));

    // Both previously-exemplar-attributed characters kept their attribution.
    const state = usePhaseBDraftStore.getState();
    expect(state.provenance["a"]).toBe("cldr");
    expect(state.provenance["ŋ"]).toBe("cldr");
  });
});
