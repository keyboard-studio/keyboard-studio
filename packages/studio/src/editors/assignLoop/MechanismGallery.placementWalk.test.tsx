// MechanismGallery — placement walk set (issue #2293 regression suite).
//
// The walk must be the placement set the marks series' answers filtered
// to ONE representation upstream (lib/placementInventory.ts), not the flat
// inventory's both-forms list. Fixtures: ../../test/bafutFixture.ts (the
// 2026-10-19 Bafut smoke-test session: 22 attested stacks over 3 marks).
//
// The walk is observed where the gallery itself publishes it: the shared
// within-step position model (useStepWalkStore, fed by
// useCharWalkPosition with the SAME list usePositionalCharNav walks).
// The CharScrollStrip is NOT the walk — it is the SHOW-ALL display list
// over the full flat inventory, in this gallery as in TouchGallery.
//
// Shared module mocks: ../../test/mechanismGallery/mocks.tsx.

import { describe, it, expect, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { positionTokenToChar } from "../../lib/stepWalk.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useStepWalkStore } from "../../stores/stepWalkStore.ts";
import { MECHANISMS_STEP_ID } from "../../steps/stepIds.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import {
  BAFUT_BASES,
  BAFUT_COMPOSED,
  BAFUT_MARKS,
  bafutWorklist,
  seedBafutSession,
} from "../../test/bafutFixture.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

/** The gallery's published walk, decoded back to characters. */
async function publishedWalk(): Promise<string[]> {
  await waitFor(() => {
    expect(useStepWalkStore.getState().walks[MECHANISMS_STEP_ID]?.length).toBeGreaterThan(0);
  });
  const positions = useStepWalkStore.getState().walks[MECHANISMS_STEP_ID] ?? [];
  return positions
    .map((p) => positionTokenToChar(p.id))
    .filter((c): c is string => c !== null);
}

async function renderGallery(): Promise<void> {
  useWorkingCopyStore.getState().markGalleryIntroSeen("mechanism");
  await act(async () => {
    render(<MechanismGallery selectedStartKeyboard={basicKbdus} />, { withStepNav: true });
  });
}

describe("MechanismGallery — placement walk (issue #2293)", () => {
  it("Bafut own-key: walks bases + the 3 marks, none of the 22 composed forms", async () => {
    seedBafutSession(bafutWorklist("own-key"));
    await renderGallery();

    const walk = await publishedWalk();
    expect(new Set(walk)).toEqual(new Set([...BAFUT_BASES, ...BAFUT_MARKS]));
    expect(walk).toHaveLength(BAFUT_BASES.length + BAFUT_MARKS.length);
    for (const composed of BAFUT_COMPOSED) expect(walk).not.toContain(composed);
  });

  it("composed-treatment mirror: walks the composed forms, not the lone marks", async () => {
    seedBafutSession(bafutWorklist("composed"));
    await renderGallery();

    const walk = await publishedWalk();
    expect(new Set(walk)).toEqual(new Set([...BAFUT_BASES, ...BAFUT_COMPOSED]));
    expect(walk).toHaveLength(BAFUT_BASES.length + BAFUT_COMPOSED.length);
    for (const mark of BAFUT_MARKS) expect(walk).not.toContain(mark);
  });

  it("promoted combination stays in the walk under own-key treatment", async () => {
    seedBafutSession(bafutWorklist("own-key", ["à", "À"]));
    await renderGallery();

    const walk = await publishedWalk();
    expect(walk).toContain("à");
    expect(walk).toContain("À");
    for (const mark of BAFUT_MARKS) expect(walk).toContain(mark);
    for (const composed of BAFUT_COMPOSED) {
      if (composed === "à" || composed === "À") continue;
      expect(walk).not.toContain(composed);
    }
  });
});
