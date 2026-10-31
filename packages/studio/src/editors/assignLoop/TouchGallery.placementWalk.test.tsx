// TouchGallery — placement walk set (issue #2293 regression suite).
//
// Before #2293 this gallery had no worklist input at all: its walk was
// the flat inventory, so a Bafut author who chose "letter, then
// diacritic" was asked to place all 22 composed forms AND the 3 marks.
// The walk must now be the same upstream placement set MechanismGallery
// walks (lib/placementInventory.ts). Fixtures:
// ../../test/bafutFixture.ts (the 2026-10-19 smoke-test session).
//
// The walk is observed where the gallery itself publishes it: the shared
// within-step position model (useStepWalkStore, fed by
// useCharWalkPosition with the SAME list usePositionalCharNav walks),
// cross-checked against the coverage line's denominator
// ("N of <total> configured", which denominates over touchLettersToAdd).
// The CharScrollStrip is NOT the walk — it is the SHOW-ALL display list
// over the full flat inventory.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders:
// ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, act, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { positionTokenToChar } from "../../lib/stepWalk.ts";
import { useStepWalkStore } from "../../stores/stepWalkStore.ts";
import { TOUCH_STEP_ID } from "../../steps/stepIds.ts";
import { installTouchGalleryHooks, seedStore } from "../../test/touchGallery/harness.ts";
import {
  BAFUT_BASES,
  BAFUT_COMPOSED,
  BAFUT_MARKS,
  bafutWorklist,
  seedBafutSession,
} from "../../test/bafutFixture.ts";

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

/** The gallery's published walk, decoded back to characters. */
async function publishedWalk(): Promise<string[]> {
  await waitFor(() => {
    expect(useStepWalkStore.getState().walks[TOUCH_STEP_ID]?.length).toBeGreaterThan(0);
  });
  const positions = useStepWalkStore.getState().walks[TOUCH_STEP_ID] ?? [];
  return positions
    .map((p) => positionTokenToChar(p.id))
    .filter((c): c is string => c !== null);
}

async function renderGallery(): Promise<void> {
  await act(async () => {
    render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
  });
}

// The touch walk additionally excludes characters already reachable on
// the seed touch layout (the pre-existing entry-parity rule): the fixture
// seeds from US Basic, whose layout already carries the plain ASCII
// letters — so the expected walks below are the placement set minus
// those. Everything non-ASCII in the placement set must be walked.
const ASCII_BASES = BAFUT_BASES.filter((b) => /^[A-Za-z]$/.test(b));
const UNDETECTED_BASES = BAFUT_BASES.filter((b) => !ASCII_BASES.includes(b));

describe("TouchGallery — placement walk (issue #2293)", () => {
  it("Bafut own-key: walks the special bases + the 3 marks, none of the 22 composed forms", async () => {
    seedStore({});
    seedBafutSession(bafutWorklist("own-key"));
    await renderGallery();

    const walk = await publishedWalk();
    expect(new Set(walk)).toEqual(new Set([...UNDETECTED_BASES, ...BAFUT_MARKS]));
    expect(walk).toHaveLength(UNDETECTED_BASES.length + BAFUT_MARKS.length);
    for (const composed of BAFUT_COMPOSED) expect(walk).not.toContain(composed);
    // The coverage line denominates over the same walk list.
    expect(screen.getByText(`0 of ${walk.length} configured`)).toBeTruthy();
  });

  it("composed-treatment mirror: walks the composed forms, not the lone marks", async () => {
    seedStore({});
    seedBafutSession(bafutWorklist("composed"));
    await renderGallery();

    const walk = await publishedWalk();
    expect(new Set(walk)).toEqual(new Set([...UNDETECTED_BASES, ...BAFUT_COMPOSED]));
    expect(walk).toHaveLength(UNDETECTED_BASES.length + BAFUT_COMPOSED.length);
    for (const mark of BAFUT_MARKS) expect(walk).not.toContain(mark);
    expect(screen.getByText(`0 of ${walk.length} configured`)).toBeTruthy();
  });

  it("promoted combination stays in the walk under own-key treatment", async () => {
    seedStore({});
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
    expect(screen.getByText(`0 of ${walk.length} configured`)).toBeTruthy();
  });
});
