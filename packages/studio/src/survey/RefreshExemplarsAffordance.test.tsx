// RefreshExemplarsAffordance — the opt-in live exemplar refresh (#1367).
//
// Covers the propose-then-confirm contract at the UI seam: a successful
// check previews the delta WITHOUT touching the draft; confirming seeds
// through seedFromProposal under the "cldr-live" provenance with its
// release recorded; each non-updated outcome speaks its own sentence.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { RefreshExemplarsAffordance } from "./RefreshExemplarsAffordance.tsx";
import {
  getCharacterInventoryValue,
  inventoryOps,
  resetInventoryDecisions,
  resetInventoryDraft,
} from "./useInventoryDraft.ts";
import type { ExemplarInventory, ExemplarRefreshResult } from "../lib/services.ts";

const { refreshResult } = vi.hoisted(() => {
  let _result: ExemplarRefreshResult = { kind: "network-error" };
  return {
    refreshResult: {
      get: () => _result,
      set: (v: ExemplarRefreshResult) => {
        _result = v;
      },
    },
  };
});

function makeInventory(
  main: string[],
  extra: Partial<ExemplarInventory> = {},
): ExemplarInventory {
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
    release: "48.2.0",
    ...extra,
  };
}

const PINNED = makeInventory(["a", "b"]);
const REFRESHED = makeInventory(["a", "b", "q"], { live: true, release: "48.2.1" });

vi.mock("../lib/services.ts", async () => {
  const engine = await import("@keyboard-studio/engine");
  return {
    USE_REAL: false,
    sourcedExemplars: async () => PINNED,
    refreshExemplars: async () => refreshResult.get(),
    charactersInTier: engine.charactersInTier,
  };
});

function seedPinnedDraft(): void {
  inventoryOps("characters").seedFromProposal(PINNED, "ewo");
}

describe("RefreshExemplarsAffordance (#1367)", () => {
  afterEach(() => {
    cleanup();
    resetInventoryDraft();
    resetInventoryDecisions();
  });

  it("previews the delta without touching the draft, then seeds cldr-live on confirm", async () => {
    seedPinnedDraft();
    refreshResult.set({
      kind: "updated",
      version: "48.2.1",
      resolvedTag: "ewo",
      inventory: REFRESHED,
    });
    render(<RefreshExemplarsAffordance bcp47="ewo" />);

    fireEvent.click(screen.getByTestId("refresh-exemplars-button"));
    await waitFor(() => expect(screen.getByTestId("refresh-exemplars-proposal")).toBeTruthy());

    // The proposal names its release and its live nature, and previews
    // exactly the one new character.
    const proposal = screen.getByTestId("refresh-exemplars-proposal");
    expect(proposal.textContent).toContain("48.2.1");
    expect(proposal.textContent).toContain("live refresh");
    expect(proposal.textContent).toContain("1 new characters");
    expect(screen.getByTestId("refresh-exemplars-proposal-preview").textContent).toContain("q");

    // Propose-then-confirm: the draft is untouched until the author confirms.
    expect(getCharacterInventoryValue().chars).not.toContain("q");

    fireEvent.click(screen.getByTestId("refresh-exemplars-confirm"));
    const value = getCharacterInventoryValue();
    expect(value.chars).toContain("q");
    expect(value.provenance["q"]).toBe("cldr-live");
    expect(value.proposalRelease["cldr-live"]).toBe("48.2.1");
    // The pinned characters keep their pinned provenance.
    expect(value.provenance["a"]).toBe("cldr");
    expect(value.proposalRelease["cldr"]).toBe("48.2.0");
  });

  it("cancel discards the proposal and seeds nothing", async () => {
    seedPinnedDraft();
    refreshResult.set({
      kind: "updated",
      version: "48.2.1",
      resolvedTag: "ewo",
      inventory: REFRESHED,
    });
    render(<RefreshExemplarsAffordance bcp47="ewo" />);
    fireEvent.click(screen.getByTestId("refresh-exemplars-button"));
    await waitFor(() => expect(screen.getByTestId("refresh-exemplars-proposal")).toBeTruthy());
    fireEvent.click(screen.getByTestId("refresh-exemplars-cancel"));
    expect(screen.queryByTestId("refresh-exemplars-proposal")).toBeNull();
    expect(getCharacterInventoryValue().chars).not.toContain("q");
  });

  it("speaks the already-current outcome with the pinned version", async () => {
    refreshResult.set({ kind: "already-current", version: "48.2.0" });
    render(<RefreshExemplarsAffordance bcp47="ewo" />);
    fireEvent.click(screen.getByTestId("refresh-exemplars-button"));
    await waitFor(() => expect(screen.getByTestId("refresh-exemplars-outcome")).toBeTruthy());
    expect(screen.getByTestId("refresh-exemplars-outcome").textContent).toContain("48.2.0");
    expect(screen.queryByTestId("refresh-exemplars-proposal")).toBeNull();
  });

  it("speaks the network-error outcome as an alert and changes nothing", async () => {
    seedPinnedDraft();
    refreshResult.set({ kind: "network-error" });
    render(<RefreshExemplarsAffordance bcp47="ewo" />);
    fireEvent.click(screen.getByTestId("refresh-exemplars-button"));
    await waitFor(() => expect(screen.getByTestId("refresh-exemplars-outcome")).toBeTruthy());
    const outcome = screen.getByTestId("refresh-exemplars-outcome");
    expect(outcome.getAttribute("role")).toBe("alert");
    expect(outcome.textContent).toContain("Couldn't check online");
    // The seeded draft (case pairs expanded) is untouched by the failure.
    expect(getCharacterInventoryValue().chars).toEqual(["a", "A", "b", "B"]);
  });

  it("renders nothing without a target language", () => {
    render(<RefreshExemplarsAffordance bcp47={undefined} />);
    expect(screen.queryByTestId("refresh-exemplars-affordance")).toBeNull();
  });
});
