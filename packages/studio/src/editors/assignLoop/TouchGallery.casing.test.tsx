// Unit tests for TouchGallery — casing (spec 074): case-derived layers, the shift-layer case-pair proposal, explicit-layer Accept, and case-correct host-key labels.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import {
  TouchGallery,
  buildTouchMechanismRef,
  hostKeyShortLabel,
  isCasingBearingTouchLayer,
} from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { changeSelectMenu } from "../../test/selectMenuTestUtils.ts";
import {
  installTouchGalleryHooks,
  seedStore,
  seedWithDesktopAssignment,
} from "../../test/touchGallery/harness.ts";

vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../lib/buildTouchLayoutJson.ts", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedBuildTouchLayoutJson(
    await importOriginal<typeof import("../../lib/buildTouchLayoutJson.ts")>(),
  ),
);
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../components/OskModeToggle.tsx", () => import("../../test/touchGallery/mocks.tsx"));

installTouchGalleryHooks();

// ---------------------------------------------------------------------------
// Spec 074 US3 — case-aware touch placement (FR-006) and the shift-layer
// case-pair proposal (FR-005).
//
// Before the `layer` slot existed, case was UNREPRESENTABLE in a touch
// placement: both appliers hardcoded the phone "default" layer, so an accented
// uppercase letter landed on the lowercase layer. buildTouchMechanismRef now
// derives the layer from the placed character's case.
// ---------------------------------------------------------------------------

describe("buildTouchMechanismRef — case-derived layer (spec 074 FR-006)", () => {
  it("emits layer 'default' for a lowercase letter and 'shift' for its capital", () => {
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "a")
        ?.slotValues?.["layer"],
    ).toBe("default");
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "A")
        ?.slotValues?.["layer"],
    ).toBe("shift");
  });

  it("handles decomposable accented letters in both cases (á / Á)", () => {
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "á")
        ?.slotValues?.["layer"],
    ).toBe("default");
    // The inverse case the spec did not name: an accented UPPERCASE letter must
    // not land on the lowercase layer.
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "Á")
        ?.slotValues?.["layer"],
    ).toBe("shift");
  });

  it("puts a caseless letter on the default layer", () => {
    expect(
      buildTouchMechanismRef("multitap", "K_A", "", "ا")?.slotValues?.["layer"],
    ).toBe("default");
  });

  it("carries the layer on every method, and never encodes it into hostKey", () => {
    for (const method of [
      "longpress_alternates",
      "flick_gestures",
      "multitap",
      "touch_key_replace",
    ] as const) {
      const ref = buildTouchMechanismRef(method, "K_A", "n", "Á");
      expect(ref?.slotValues?.["layer"]).toBe("shift");
      // hostKey keeps its exact current meaning: a resolved vkey.
      expect(ref?.slotValues?.["hostKey"]).toBe("K_A");
    }
  });

  it("treats {K_A, á, default} and {K_A, Á, shift} as distinct refs", () => {
    const lower = buildTouchMechanismRef("longpress_alternates", "K_A", "", "á");
    const upper = buildTouchMechanismRef("longpress_alternates", "K_A", "", "Á");
    expect(lower).not.toEqual(upper);
    expect(lower?.slotValues?.["layer"]).not.toBe(upper?.slotValues?.["layer"]);
  });
});

describe("TouchGallery — shift-layer case-pair proposal (spec 074 US3)", () => {
  /** Apply the default long-press method on `hostKey` for the current char. */
  async function applyLongpressOn(hostKey: string) {
    const select = screen.queryByRole("button", { name: /host key/i });
    expect(select).not.toBeNull();
    await changeSelectMenu(select!, hostKey);
    const applyBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Apply method") ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(applyBtn!);
    });
  }

  function touchMechanismsFor(char: string) {
    const draft = useWorkingCopyStore.getState().touchDraft;
    return (
      draft?.charTouchEntries.find(([c]) => c === char)?.[1]?.mechanisms ?? []
    );
  }

  it("a lowercase placement raises a proposal whose confirm records the capital on the shift layer", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await applyLongpressOn("K_A");

    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the shift layer of/i }),
      );
    });

    // The source placement is untouched on the default layer...
    expect(touchMechanismsFor("θ")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "θ",
      layer: "default",
    });
    // ...and the capital lands on the shift layer of the same host key.
    expect(touchMechanismsFor("Θ")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "Θ",
      layer: "shift",
    });
  });

  it("dismissing records nothing", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await applyLongpressOn("K_A");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Do not map Θ to the shift layer/i }),
      );
    });

    expect(touchMechanismsFor("Θ")).toHaveLength(0);
    expect(touchMechanismsFor("θ")).toHaveLength(1);
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("a caseless letter raises no proposal", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await applyLongpressOn("K_A");

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(touchMechanismsFor("中")).toHaveLength(1);
  });

  it("raises no redundant proposal once the capital is already on that host key's shift layer", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // First apply: propose, then confirm — Θ now sits on K_A's shift layer.
    await applyLongpressOn("K_A");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the shift layer of/i }),
      );
    });
    expect(touchMechanismsFor("Θ")).toHaveLength(1);

    // Re-applying the same placement must not re-offer a pairing that exists
    // (spec §Edge Cases, "counterpart already placed").
    await applyLongpressOn("K_A");
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(touchMechanismsFor("Θ")).toHaveLength(1);
  });

  it("still proposes when the capital exists on a DIFFERENT host key's shift layer", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await applyLongpressOn("K_A");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the shift layer of/i }),
      );
    });

    // A placement on another host key is a different parallel slot, so the
    // suppression must not over-reach.
    await applyLongpressOn("K_B");
    expect(screen.queryByText(/has an uppercase form, Θ/i)).toBeTruthy();
  });

  it("does not consult or write suggestionResolved — that set governs the placement card, not this proposal", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const before =
      useWorkingCopyStore.getState().touchDraft?.suggestionResolvedChars ?? [];

    await applyLongpressOn("K_A");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the shift layer of/i }),
      );
    });

    const after =
      useWorkingCopyStore.getState().touchDraft?.suggestionResolvedChars ?? [];
    // The capital never enters the placement-suggestion resolved set.
    expect(after).not.toContain("Θ");
    expect(after.filter((c) => !before.includes(c))).not.toContain("Θ");
  });

  it("stale-guard: confirming a proposal whose raising mechanism ref vanished via chip removal records nothing", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await applyLongpressOn("K_A");
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // Remove the just-applied mechanism for "θ" via its configured chip —
    // the in-UI equivalent of the raising ref vanishing out from under the
    // banner. handleRemoveMechanism does not proactively dismiss the
    // companion (unlike the physical/combo removal paths), so the banner
    // stays visible and confirming it below exercises handleCasePairConfirm's
    // confirm-time staleness re-check
    // (`existing.mechanisms.includes(baseRef)`) rather than a removal-time
    // dismissal.
    const configuredGroup = screen.getByRole("group", {
      name: /configured characters/i,
    });
    const chips = configuredGroup.querySelectorAll("button");
    expect(chips.length).toBe(1);
    await act(async () => {
      fireEvent.click(chips[0]!);
    });
    expect(touchMechanismsFor("θ")).toHaveLength(0);

    // Banner is still up — the component's pending-proposal state is
    // untouched by the direct chip removal.
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the shift layer of/i }),
      );
    });

    // Nothing was recorded for the counterpart — the stale proposal was
    // dismissed, not applied.
    expect(touchMechanismsFor("Θ")).toHaveLength(0);
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });
});
// Spec 074 Phase 7 (T049/T050) — FR-012: the suggestion-Accept path
// (handleUseSuggestion) must carry an explicit `layer`, derived the same way
// every other placement path derives it (buildTouchMechanismRef /
// touchLayerForChar) — not a bare literal that silently resolves to
// "default" for every accepted suggestion, uppercase included.
// ---------------------------------------------------------------------------

describe("TouchGallery — suggestion Accept carries an explicit layer (spec 074 FR-012)", () => {
  function touchMechanismsFor(char: string) {
    const draft = useWorkingCopyStore.getState().touchDraft;
    return (
      draft?.charTouchEntries.find(([c]) => c === char)?.[1]?.mechanisms ?? []
    );
  }

  it("accepting the longpress suggestion for a lowercase decomposable letter (ă) records layer: default", async () => {
    seedStore({ withInventory: ["ă"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const acceptBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Accept") ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });

    const mechanisms = touchMechanismsFor("ă");
    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "ă",
      layer: "default",
    });
  });

  it("accepting the longpress suggestion for the uppercase counterpart (Ă) records layer: shift, not a silent default", async () => {
    seedStore({ withInventory: ["Ă"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const acceptBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Accept") ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });

    const mechanisms = touchMechanismsFor("Ă");
    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "Ă",
      layer: "shift",
    });
  });

  it("accepting a 'replace' suggestion also carries an explicit layer (nextMethod = touch_key_replace dispatch)", async () => {
    // Seed a Phase C simple_swap desktop assignment so suggestion.kind ===
    // "replace" — exercises handleUseSuggestion's touch_key_replace branch,
    // which the ă/Ă cases above (both "longpress") do not reach.
    const swapAssignment: MechanismAssignment = {
      scope: "individual",
      target: "ă",
      modality: "physical",
      mechanisms: [
        {
          patternId: "simple_swap",
          strategyId: "S-01",
          slotValues: { kmnRules: "+ [K_A] > U+0103" },
        },
      ],
      source: "user",
    };
    seedWithDesktopAssignment("ă", swapAssignment);

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.queryByText(/Suggested: replace/i)).not.toBeNull();

    const acceptBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Accept") ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });

    const mechanisms = touchMechanismsFor("ă");
    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0]?.patternId).toBe("touch_key_replace");
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "ă",
      layer: "default",
    });
  });
});

// ---------------------------------------------------------------------------
// Spec 074 Phase 7 (T051/T052) — FR-013: case-correct host-key labels.
//
// A Keyman vkey name carries no case of its own (`K_A` names the A key);
// case is a property of the layer a placement targets. `hostKeyShortLabel`
// takes the layer explicitly and cases the returned letter to match it.
// ---------------------------------------------------------------------------

// Every real vkey id in keyOptions.ts is already all-uppercase, so testing
// the casing decision only through hostKeyShortLabel's output cannot tell a
// correct component match from an accidental substring match — both render
// "A" for "ncaps" today. This block tests the predicate directly, so a
// regression from `components.includes("caps")` to the substring form
// `layer.includes("caps")` fails HERE (isCasingBearingTouchLayer("ncaps")
// would flip from false to true) even though hostKeyShortLabel's own output
// would stay byte-identical for every real key id.
describe("isCasingBearingTouchLayer — component match, not substring (spec 074 FR-013)", () => {
  it("is true for shift, caps, and casing-bearing compounds", () => {
    expect(isCasingBearingTouchLayer("shift")).toBe(true);
    expect(isCasingBearingTouchLayer("caps")).toBe(true);
    expect(isCasingBearingTouchLayer("rightalt-shift")).toBe(true);
    expect(isCasingBearingTouchLayer("shift-ctrl-alt")).toBe(true);
  });

  it("is false for 'ncaps' and other non-casing layer ids", () => {
    expect(isCasingBearingTouchLayer("ncaps")).toBe(false);
    expect(isCasingBearingTouchLayer("alt")).toBe(false);
    expect(isCasingBearingTouchLayer("ctrl")).toBe(false);
    expect(isCasingBearingTouchLayer("rightalt")).toBe(false);
    expect(isCasingBearingTouchLayer("rightctrl")).toBe(false);
    expect(isCasingBearingTouchLayer("leftctrl")).toBe(false);
    expect(isCasingBearingTouchLayer("default")).toBe(false);
  });
});

describe("hostKeyShortLabel — case-correct labels by layer (spec 074 FR-013)", () => {
  it("reads lowercase on the default layer and uppercase on the shift layer", () => {
    expect(hostKeyShortLabel("K_A", "default")).toBe("a");
    expect(hostKeyShortLabel("K_A", "shift")).toBe("A");
  });

  it("reads uppercase for a casing-bearing compound layer id (rightalt-shift)", () => {
    expect(hostKeyShortLabel("K_A", "rightalt-shift")).toBe("A");
  });

  it("does not mistake 'ncaps' for a caps-bearing layer (component match, not substring)", () => {
    expect(hostKeyShortLabel("K_A", "ncaps")).toBe("A");
  });

  it("leaves non-casing layer ids reading the raw uppercase vkey letter (today's floor, now pinned)", () => {
    expect(hostKeyShortLabel("K_A", "alt")).toBe("A");
    expect(hostKeyShortLabel("K_A", "ctrl")).toBe("A");
    expect(hostKeyShortLabel("K_A", "rightalt")).toBe("A");
    expect(hostKeyShortLabel("K_A", "rightctrl")).toBe("A");
    expect(hostKeyShortLabel("K_A", "leftctrl")).toBe("A");
  });
});

describe("TouchGallery — host-key label casing in the UI (spec 074 FR-013)", () => {
  it("renders the configured-mechanism chip in lowercase for a default-layer mechanism", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const select = screen.queryByRole("button", { name: /host key/i });
    expect(select).not.toBeNull();
    await changeSelectMenu(select!, "K_A");
    const applyBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Apply method") ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(applyBtn!);
    });

    const configuredGroup = screen.getByRole("group", {
      name: /configured characters/i,
    });
    expect(configuredGroup.textContent).toContain("long-press a");
    expect(configuredGroup.textContent).not.toContain("long-press A");
  });

  it("renders the placement-suggestion text in lowercase for a lowercase placement", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // "ä" is decomposable-accented and derives host key K_A (touchBehavior's
    // suggestion useMemo) — a lowercase placement, so the suggestion text
    // must read the lowercase keycap, not the raw uppercase vkey letter.
    expect(screen.getByText(/Suggested: long-press/i).textContent).toMatch(
      /long-press a to reach/i,
    );
  });
});
