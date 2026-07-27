// Phase B propose-then-confirm UI (spec 044 FR-016/FR-016a-c/FR-017).
//
// Covers the discovery-method offer, the Continue branching, the heading swap,
// the page-2 fill affordances, and the proposed-vs-authored chip affordance.
// The store mechanics behind them live in ../stores/phaseBDraftStore.test.ts.
//
// Both services calls are mocked: the exemplar inventory is driven per test so
// the offer's presence, absence and content are all exercised deterministically.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PhaseB } from "./PhaseB.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import {
  usePhaseBDraftStore,
  resetPhaseBDraftDecisions,
} from "../stores/phaseBDraftStore.ts";
import type { SourcedInventory } from "../lib/services.ts";

const { getSourcedExemplars } = vi.hoisted(() => {
  let _inventory: SourcedInventory | null = null;
  return {
    getSourcedExemplars: {
      get: () => _inventory,
      set: (v: SourcedInventory | null) => {
        _inventory = v;
      },
    },
  };
});

// `charactersInTier` is a pure re-export of the engine's own function, not a
// service call — the offer detail renders through it. It comes from the engine
// rather than a hand-copy so this mock cannot drift from the real tier filter.
vi.mock("../lib/services.ts", async () => ({
  USE_REAL: false,
  suggestMissingChars: async () => null,
  sourcedExemplars: async (_bcp47: string) => getSourcedExemplars.get(),
  charactersInTier: (await import("@keyboard-studio/engine")).charactersInTier,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function inventory(
  main: string[],
  source: "cldr" | "sldr" = "cldr",
  confidence = source === "cldr" ? "approved" : "generated",
): SourcedInventory {
  return {
    resolvedTag: "ewo",
    source,
    confidence: confidence as SourcedInventory["confidence"],
    characters: main.map((char) => ({
      char,
      tier: "main" as const,
      source,
      confidence: confidence as SourcedInventory["confidence"],
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

/** Wait for the async inventory lookup to settle, then return the radio. */
async function exemplarRadio(): Promise<HTMLInputElement | null> {
  await waitFor(() => {
    expect(screen.getByTestId("phase-b-intro-next")).toBeTruthy();
  });
  return document.querySelector<HTMLInputElement>("#discovery_method-exemplars");
}

beforeEach(() => {
  getSourcedExemplars.set(null);
  useSurveySessionStore.getState().setDiscoveryMethod(null);
  usePhaseBDraftStore.getState().reset();
  resetPhaseBDraftDecisions();
});

afterEach(() => {
  cleanup();
  useSurveySessionStore.getState().setDiscoveryMethod(null);
  usePhaseBDraftStore.getState().reset();
  resetPhaseBDraftDecisions();
});

// ---------------------------------------------------------------------------
// Obligation P2 — the offer
// ---------------------------------------------------------------------------

describe("discovery-method offer (obligation P2, FR-016)", () => {
  it("is absent ENTIRELY when there is no inventory — not disabled, not empty", async () => {
    getSourcedExemplars.set(null);
    renderPhaseB();
    expect(await exemplarRadio()).toBeNull();
    // The list reverts to today's two options, still defaulting to build-list.
    const buildList = document.querySelector<HTMLInputElement>("#discovery_method-build-list");
    expect(buildList?.checked).toBe(true);
    expect(document.querySelectorAll('input[name="discovery_method"]')).toHaveLength(2);
  });

  it("is first and pre-selected when an inventory exists", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ", "ɔ"]));
    renderPhaseB();
    const radio = await exemplarRadio();
    expect(radio).not.toBeNull();
    await waitFor(() => expect(radio!.checked).toBe(true));
    const all = [...document.querySelectorAll('input[name="discovery_method"]')];
    expect(all).toHaveLength(3);
    expect(all[0]).toBe(radio);
  });

  it("renders source, confidence, count and a preview INLINE on the option", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ", "ɔ"], "sldr", "generated"));
    renderPhaseB();
    await exemplarRadio();
    const detail = await screen.findByTestId("exemplar-offer-detail");
    expect(detail.textContent).toContain("SLDR");
    expect(detail.textContent).toContain("please check");
    expect(detail.textContent).toContain("3");
    expect(screen.getByTestId("exemplar-offer-preview").textContent).toContain("ŋ");
  });

  it("shows the whole alphabet as cards — the list is never truncated", async () => {
    const many = [...new Set(Array.from({ length: 40 }, (_, i) => String.fromCodePoint(0x61 + (i % 26))))];
    getSourcedExemplars.set(inventory(many));
    renderPhaseB();
    await exemplarRadio();
    const preview = await screen.findByTestId("exemplar-offer-preview");
    // No "+N more" elision — every character is present, one card each.
    expect(preview.textContent).not.toContain("more");
    for (const c of many) {
      expect(preview.querySelector(`[aria-label^="${c} "]`)).not.toBeNull();
    }
  });

  it("orders letters by ICU collation and trails bare diacritics by code point", async () => {
    // Out-of-order input with two bare combining marks (U+0301 acute after
    // U+0300 grave) interspersed among unsorted letters.
    getSourcedExemplars.set(inventory(["ɛ", "́", "a", "b", "̀"]));
    renderPhaseB();
    await exemplarRadio();
    const preview = await screen.findByTestId("exemplar-offer-preview");
    const order = [...preview.querySelectorAll("[aria-label]")].map(
      (el) => el.getAttribute("aria-label")?.charAt(0),
    );
    // Letters (ICU) first: a, b, ɛ — then bare marks by code point: ◌̀, ◌́.
    expect(order).toEqual(["a", "b", "ɛ", "◌", "◌"]);
  });

  it("renders a floating diacritic with the dotted circle (U+25CC)", async () => {
    // U+0301 COMBINING ACUTE ACCENT — a bare mark must be visible standalone.
    getSourcedExemplars.set(inventory(["a", "́"]));
    renderPhaseB();
    await exemplarRadio();
    const preview = await screen.findByTestId("exemplar-offer-preview");
    expect(preview.textContent).toContain("◌́");
  });

  it("does not pre-select the offer once it has been declined (FR-016a)", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    usePhaseBDraftStore.getState().declineExemplarMethod();
    renderPhaseB();
    const radio = await exemplarRadio();
    expect(radio).not.toBeNull();
    // Still offered — declining is not a permanent removal — just not default.
    await waitFor(() => {
      const buildList = document.querySelector<HTMLInputElement>("#discovery_method-build-list");
      expect(buildList?.checked).toBe(true);
    });
    expect(radio!.checked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Obligations P1 / P1a — Continue
// ---------------------------------------------------------------------------

describe("Continue branching (obligations P1/P1a, FR-016)", () => {
  it("accepting seeds the draft exactly once and lands on a prefilled page 2", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    renderPhaseB();
    await exemplarRadio();
    fireEvent.click(screen.getByTestId("phase-b-intro-next"));

    await waitFor(() => {
      expect(screen.getByTestId("phase-b-done")).toBeTruthy();
    });
    const s = usePhaseBDraftStore.getState();
    expect(s.chars).toContain("ŋ");
    expect(s.provenance["ŋ"]).toBe("cldr");
    // Uppercase counterparts came along, and nothing is duplicated.
    expect(s.chars).toContain("Ŋ");
    expect(new Set(s.chars).size).toBe(s.chars.length);
  });

  it("the draft is NOT seeded merely by reaching the chooser", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    renderPhaseB();
    await exemplarRadio();
    // Offer rendered, nothing chosen yet.
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });

  it("declining lands on an EMPTY page 2 and records the decline", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    renderPhaseB();
    await exemplarRadio();
    fireEvent.click(document.querySelector("#discovery_method-build-list") as HTMLInputElement);
    fireEvent.click(screen.getByTestId("phase-b-intro-next"));

    await waitFor(() => {
      expect(screen.getByTestId("phase-b-done")).toBeTruthy();
    });
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    expect(usePhaseBDraftStore.getState().exemplarMethodDeclined).toBe(true);
  });

  it("does not record a decline when no offer was available", async () => {
    getSourcedExemplars.set(null);
    renderPhaseB();
    await exemplarRadio();
    fireEvent.click(screen.getByTestId("phase-b-intro-next"));
    await waitFor(() => expect(screen.getByTestId("phase-b-done")).toBeTruthy());
    expect(usePhaseBDraftStore.getState().exemplarMethodDeclined).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Obligation P1c — the heading swap (FR-016c)
// ---------------------------------------------------------------------------

describe("heading swap (obligation P1c, FR-016c)", () => {
  it("says 'Add your whole alphabet' on an empty draft", async () => {
    getSourcedExemplars.set(null);
    renderPhaseB();
    await exemplarRadio();
    fireEvent.click(screen.getByTestId("phase-b-intro-next"));
    await waitFor(() => expect(screen.getByTestId("phase-b-done")).toBeTruthy());
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "Add your whole alphabet",
    );
  });

  it("says 'Confirm your alphabet' once something has been proposed into it", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    renderPhaseB();
    await exemplarRadio();
    fireEvent.click(screen.getByTestId("phase-b-intro-next"));
    await waitFor(() => expect(screen.getByTestId("phase-b-done")).toBeTruthy());
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "Confirm your alphabet",
    );
  });

  it("keeps 'Add' when the author typed the alphabet themselves", async () => {
    getSourcedExemplars.set(null);
    renderPhaseB();
    await exemplarRadio();
    fireEvent.click(screen.getByTestId("phase-b-intro-next"));
    await waitFor(() => expect(screen.getByTestId("phase-b-done")).toBeTruthy());
    usePhaseBDraftStore.getState().add("ŋ");
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
        "Add your whole alphabet",
      );
    });
  });

  it("a filled draft is still not a completed step — Done must be pressed", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    const { onComplete } = renderPhaseB();
    await exemplarRadio();
    fireEvent.click(screen.getByTestId("phase-b-intro-next"));
    await waitFor(() => expect(screen.getByTestId("phase-b-done")).toBeTruthy());
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("phase-b-done"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Obligation P1b — all three fill affordances stay present (FR-016b)
// ---------------------------------------------------------------------------

describe("page-2 fill affordances (obligation P1b, FR-016b)", () => {
  async function reachPage2(accept: boolean): Promise<void> {
    renderPhaseB();
    await exemplarRadio();
    if (!accept) {
      const buildList = document.querySelector("#discovery_method-build-list");
      if (buildList !== null) fireEvent.click(buildList as HTMLInputElement);
    }
    fireEvent.click(screen.getByTestId("phase-b-intro-next"));
    await waitFor(() => expect(screen.getByTestId("phase-b-done")).toBeTruthy());
  }

  it("offers the character box, the paste/upload surface, and the exemplar apply route after declining", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    await reachPage2(false);
    expect(screen.getByLabelText("Character to add")).toBeTruthy();
    expect(screen.getByTestId("text-sample-placeholder")).toBeTruthy();
    expect(screen.getByTestId("exemplar-apply-affordance")).toBeTruthy();
  });

  it("the apply route is collapsed until asked for, then applies the proposal", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    await reachPage2(false);
    expect(screen.queryByTestId("exemplar-apply-confirm")).toBeNull();

    fireEvent.click(screen.getByTestId("exemplar-apply-toggle"));
    fireEvent.click(screen.getByTestId("exemplar-apply-confirm"));

    await waitFor(() => {
      expect(usePhaseBDraftStore.getState().chars).toContain("ŋ");
    });
    expect(usePhaseBDraftStore.getState().provenance["ŋ"]).toBe("cldr");
  });

  it("hides the apply route once the proposal has already been applied", async () => {
    getSourcedExemplars.set(inventory(["a", "ŋ"]));
    await reachPage2(true);
    expect(screen.queryByTestId("exemplar-apply-affordance")).toBeNull();
    // The other two routes are still there.
    expect(screen.getByLabelText("Character to add")).toBeTruthy();
    expect(screen.getByTestId("text-sample-placeholder")).toBeTruthy();
  });

  it("shows no apply route when there is nothing to apply", async () => {
    getSourcedExemplars.set(null);
    await reachPage2(false);
    expect(screen.queryByTestId("exemplar-apply-affordance")).toBeNull();
    expect(screen.getByTestId("text-sample-placeholder")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Obligation P5 — proposed vs authored (FR-017)
// ---------------------------------------------------------------------------

describe("proposed-vs-authored affordance (obligation P5, FR-017)", () => {
  async function acceptAndReachPage2(inv: SourcedInventory): Promise<void> {
    getSourcedExemplars.set(inv);
    renderPhaseB();
    await exemplarRadio();
    fireEvent.click(screen.getByTestId("phase-b-intro-next"));
    await waitFor(() => expect(screen.getByTestId("phase-b-done")).toBeTruthy());
  }

  it("marks proposed chips distinctly from authored ones", async () => {
    await acceptAndReachPage2(inventory(["ŋ"]));
    usePhaseBDraftStore.getState().add("q");
    await waitFor(() => {
      expect(screen.getAllByTestId("authored-char-chip").length).toBeGreaterThan(0);
    });
    const proposed = screen.getAllByTestId("proposed-char-chip");
    expect(proposed.some((el) => el.textContent?.includes("ŋ"))).toBe(true);
    const authored = screen.getAllByTestId("authored-char-chip");
    expect(authored.some((el) => el.textContent?.includes("q"))).toBe(true);
  });

  it("states the source on each proposed chip", async () => {
    await acceptAndReachPage2(inventory(["ŋ"], "cldr"));
    const chip = screen.getAllByTestId("proposed-char-chip")[0] as HTMLElement;
    expect(chip.getAttribute("title")).toContain("from CLDR");
    expect(chip.getAttribute("aria-label")).toContain("from CLDR");
  });

  it("warns on a machine-generated SLDR set without filtering it out", async () => {
    await acceptAndReachPage2(inventory(["ŋ"], "sldr", "generated"));
    const chip = screen.getAllByTestId("proposed-char-chip")[0] as HTMLElement;
    expect(chip.getAttribute("title")).toContain("please check");
    // Confidence drives wording only — the character is still there.
    expect(usePhaseBDraftStore.getState().chars).toContain("ŋ");
  });

  it("names the sources in a legend rather than relying on the outline alone", async () => {
    await acceptAndReachPage2(inventory(["ŋ"], "sldr", "generated"));
    const legend = await screen.findByTestId("proposed-chip-legend");
    expect(legend.textContent).toContain("SLDR");
  });

  it("shows no legend when nothing was proposed", async () => {
    getSourcedExemplars.set(null);
    renderPhaseB();
    await exemplarRadio();
    fireEvent.click(screen.getByTestId("phase-b-intro-next"));
    await waitFor(() => expect(screen.getByTestId("phase-b-done")).toBeTruthy());
    usePhaseBDraftStore.getState().add("q");
    await waitFor(() => {
      expect(screen.getAllByTestId("authored-char-chip").length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId("proposed-chip-legend")).toBeNull();
  });

  it("removing a proposed chip records the rejection", async () => {
    await acceptAndReachPage2(inventory(["ŋ"]));
    const chip = screen
      .getAllByTestId("proposed-char-chip")
      .find((el) => el.textContent?.includes("ŋ")) as HTMLElement;
    fireEvent.click(chip);
    await waitFor(() => {
      expect(usePhaseBDraftStore.getState().chars).not.toContain("ŋ");
    });
    expect(usePhaseBDraftStore.getState().rejected).toContain("ŋ");
  });
});
