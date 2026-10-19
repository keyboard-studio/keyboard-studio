// Gallery-level tests for #2300 — displacement (demotion) proposals and
// the weighted rationale line in MechanismGallery.
//
// Fixture shape: the base keyboard types ' on K_QUOTE, and ' is still
// needed — as base-produced punctuation (convenience tier, steer 2), not
// as confirmed-inventory core. A kbgen suggestion puts ə (core) on
// K_QUOTE (S-01) — accepting it shadows ', so the gallery must propose
// demoting ' (rank 1: AltGr on the same key), never lose it silently.
// A second character (ʔ, also core) suggested onto the same combo
// exercises mutual exclusivity + the both-core rule: the combo now holds
// ə, a core character, so the proposal names ə and picks no victim.
// The convenience-inversion banner is covered at banner level below: a
// convenience character can never be the gallery's currentChar (every
// selectable character is a confirmed-inventory member by construction),
// so that direction is exercised through the rationale unit tests plus
// this banner's rendering/wiring test.
//
// Shared module mocks / harness: ../../test/mechanismGallery/.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { DisplacementProposalBanner } from "./DisplacementProposalBanner.tsx";
import type { DisplacementProposal } from "./useDisplacementProposal.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  createVirtualFS,
  makePlacementMap,
  type IRGroup,
  type PlacementMap,
} from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import {
  getPhaseCPhysicalAssignments,
  seedInventory,
  suggestionRowText,
} from "../../test/mechanismGallery/harness.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

function groupWithQuote(): IRGroup {
  return {
    nodeId: "g-main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: [
      {
        nodeId: "r-quote",
        context: [{ kind: "vkey", name: "K_QUOTE", modifiers: [] }],
        output: [{ kind: "char", value: "'" }],
      },
    ],
  };
}

const placementMap: PlacementMap = makePlacementMap({
  bcp47Context: "test",
  baseLayoutFamily: "QWERTY",
  entries: [
    {
      codepoint: "U+0259", // ə
      candidates: [
        {
          vkey: "K_QUOTE",
          modifiers: [],
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 5,
          confidence: 0.9,
        },
      ],
    },
    {
      codepoint: "U+0294", // ʔ
      candidates: [
        {
          vkey: "K_QUOTE",
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

async function renderGallery() {
  const seedVfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore
    .getState()
    .instantiateFromStart(basicKbdus, { vfs: seedVfs, ir: makeTestIR([groupWithQuote()]) });
  // ' is NOT in the confirmed inventory: it is base-produced punctuation
  // (convenience tier — steer 2), while ə / ʔ are core orthography.
  seedInventory(["ə", "ʔ"]);
  await act(async () => {
    render(
      <MechanismGallery selectedStartKeyboard={basicKbdus} placementMap={placementMap} />,
      { withStepNav: true },
    );
  });
}

async function selectChar(testId: string, char: string) {
  const strip = screen.getByTestId("char-scroll-strip");
  fireEvent.click(within(strip).getByTestId(testId));
  await waitFor(() => {
    expectCurrentChar(char);
  });
}

async function acceptSuggestion() {
  const row = screen.getByRole("note", {
    name: /Placement suggestion from kbgen seeder/i,
  });
  fireEvent.click(within(row).getByRole("button", { name: /Accept suggestion/i }));
}

function displacementBanner(): HTMLElement {
  return screen.getByRole("note", { name: /Displaced character proposal/i });
}

describe("MechanismGallery — displacement demotion proposal (#2300)", () => {
  it("shows the G2 rationale (cost + demotion named) on a chip that would displace a still-used '", async () => {
    await renderGallery();
    await selectChar("char-scroll-chip-0259", "ə");
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(/moves to AltGr/);
    });
    expect(suggestionRowText()).toMatch(/sits there now/);
  });

  it("accepting onto K_QUOTE raises the demotion proposal; confirming records the RAlt demotion for '", async () => {
    await renderGallery();
    await selectChar("char-scroll-chip-0259", "ə");
    await acceptSuggestion();

    await waitFor(() => {
      expect(displacementBanner().textContent).toMatch(/Move ' to AltGr/);
    });
    fireEvent.click(
      within(displacementBanner()).getByRole("button", { name: /Move .* to AltGr/i }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("note", { name: /Displaced character proposal/i }),
      ).toBeNull();
    });
    const demotion = getPhaseCPhysicalAssignments().find((a) => a.target === "'");
    expect(demotion).toBeDefined();
    expect(demotion?.mechanisms[0]?.patternId).toBe("modifier_as_layer_switch");
    expect(demotion?.mechanisms[0]?.slotValues?.["altgrOutputList"]).toBe("'");
    expect(demotion?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toContain("K_QUOTE");
  });

  it("'Leave it' dismisses the proposal explicitly and records no demotion", async () => {
    await renderGallery();
    await selectChar("char-scroll-chip-0259", "ə");
    await acceptSuggestion();

    await waitFor(() => {
      expect(displacementBanner()).toBeTruthy();
    });
    fireEvent.click(
      within(displacementBanner()).getByRole("button", {
        name: /Leave .* without a new key/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("note", { name: /Displaced character proposal/i }),
      ).toBeNull();
    });
    expect(
      getPhaseCPhysicalAssignments().find((a) => a.target === "'"),
    ).toBeUndefined();
  });

  it("double-assign on K_QUOTE: a second character on the taken combo raises a BOTH-CORE proposal naming the first character", async () => {
    await renderGallery();
    await selectChar("char-scroll-chip-0259", "ə");
    await acceptSuggestion();
    await waitFor(() => {
      expect(displacementBanner()).toBeTruthy();
    });
    // Confirm the ' demotion so the first proposal is fully resolved.
    fireEvent.click(
      within(displacementBanner()).getByRole("button", { name: /Move .* to AltGr/i }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("note", { name: /Displaced character proposal/i }),
      ).toBeNull();
    });

    // ʔ now takes the same combo — the incumbent is ə (mutual exclusivity:
    // one combo, one output), and ə is an inventory character, so the new
    // proposal names ə as the displaced glyph.
    await selectChar("char-scroll-chip-0294", "ʔ");
    await acceptSuggestion();
    await waitFor(() => {
      expect(displacementBanner().textContent).toContain("ə");
    });
  });
});

// ---------------------------------------------------------------------------
// Both-core at gallery level (steer 2): Ñ displaces N, both confirmed
// inventory. The banner must state the frequency-data gap, offer "Keep
// both" as the default, and record NO demotion when it is chosen.
// ---------------------------------------------------------------------------

describe("MechanismGallery — both-core displacement (steer 2)", () => {
  it("Ñ onto N's key: banner states the frequency gap; 'Keep both' records no demotion", async () => {
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "r-n",
          context: [{ kind: "vkey", name: "K_N", modifiers: [] }],
          output: [{ kind: "char", value: "n" }],
        },
      ],
    };
    const map: PlacementMap = makePlacementMap({
      bcp47Context: "test",
      baseLayoutFamily: "QWERTY",
      entries: [
        {
          codepoint: "U+00D1", // Ñ
          candidates: [
            {
              vkey: "K_N",
              modifiers: [],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 6,
              confidence: 0.9,
            },
          ],
        },
      ],
    });
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromStart(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });
    seedInventory(["n", "Ñ"]);
    await act(async () => {
      render(
        <MechanismGallery selectedStartKeyboard={basicKbdus} placementMap={map} />,
        { withStepNav: true },
      );
    });

    const strip = screen.getByTestId("char-scroll-strip");
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-00D1"));
    await waitFor(() => {
      expectCurrentChar("Ñ");
    });
    const row = screen.getByRole("note", {
      name: /Placement suggestion from kbgen seeder/i,
    });
    fireEvent.click(within(row).getByRole("button", { name: /Accept suggestion/i }));

    await waitFor(() => {
      expect(displacementBanner().textContent).toMatch(/frequency data/);
    });
    expect(displacementBanner().textContent).toMatch(/both part of your alphabet/);
    fireEvent.click(
      within(displacementBanner()).getByRole("button", { name: /Keep both/i }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("note", { name: /Displaced character proposal/i }),
      ).toBeNull();
    });
    // No demotion recorded for n; Ñ's own placement stands.
    expect(
      getPhaseCPhysicalAssignments().find((a) => a.target === "n"),
    ).toBeUndefined();
    expect(
      getPhaseCPhysicalAssignments().find((a) => a.target === "Ñ"),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Banner-level: the convenience-inversion direction (steer 2). A
// convenience character can never be the gallery's currentChar (selection
// derives from the confirmed inventory), so the inverted proposal is
// pinned here at the banner's rendering/wiring level, and at the scoring
// level in placementRationale.test.ts.
// ---------------------------------------------------------------------------

describe("DisplacementProposalBanner — demote-incoming inversion (steer 2)", () => {
  const proposal: DisplacementProposal = {
    displacedChar: "n",
    incomingChar: "-",
    vkey: "K_N",
    modifiers: [],
    demotionMethod: "ralt",
    direction: "demote-incoming",
    baseAssignment: {
      scope: "individual",
      target: "-",
      modality: "physical",
      mechanisms: [],
      source: "user",
    },
  };

  it("proposes moving the INCOMING convenience char, keeping the core char's key", async () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    await act(async () => {
      render(
        <DisplacementProposalBanner
          proposal={proposal}
          onConfirm={onConfirm}
          onDismiss={onDismiss}
        />,
      );
    });
    const banner = screen.getByRole("note", {
      name: /Displaced character proposal/i,
    });
    expect(banner.textContent).toMatch(/convenience character/);
    expect(banner.textContent).toMatch(/part of your alphabet/);
    fireEvent.click(
      within(banner).getByRole("button", { name: /Move - to AltGr/i }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
