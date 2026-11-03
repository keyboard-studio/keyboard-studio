// Shared contract: the gallery walks the upstream placement set.
//
// The walk is observed where the gallery itself publishes it: the shared
// within-step position model (useStepWalkStore, fed by useCharWalkPosition
// with the SAME list usePositionalCharNav walks). The CharScrollStrip is NOT
// the walk: it is the SHOW-ALL display list over the full flat inventory.
// Fixtures: ../bafutFixture.ts (the 2026-10-19 Bafut smoke-test session).
//
// Test-support module: imported only by *.test.tsx entry files.

import { describe, it, expect } from "vitest";
import { waitFor } from "@testing-library/react";
import { positionTokenToChar } from "../../lib/stepWalk.ts";
import { useStepWalkStore } from "../../stores/stepWalkStore.ts";
import {
  BAFUT_COMPOSED,
  BAFUT_MARKS,
  bafutWorklist,
  seedBafutSession,
} from "../bafutFixture.ts";
import type { GalleryAdapter } from "./adapter.ts";

export function describeWalkContract(adapter: GalleryAdapter): void {
  /** The gallery's published walk, decoded back to characters. */
  async function publishedWalk(): Promise<string[]> {
    await waitFor(() => {
      expect(useStepWalkStore.getState().walks[adapter.walkStepId]?.length).toBeGreaterThan(0);
    });
    const positions = useStepWalkStore.getState().walks[adapter.walkStepId] ?? [];
    return positions
      .map((p) => positionTokenToChar(p.id))
      .filter((c): c is string => c !== null);
  }

  describe(`${adapter.name} — placement walk`, () => {
    it("Bafut own-key: walks bases + the 3 marks, none of the 22 composed forms", async () => {
      adapter.prepareWalk();
      seedBafutSession(bafutWorklist("own-key"));
      await adapter.renderWalkGallery();

      const walk = await publishedWalk();
      expect(new Set(walk)).toEqual(new Set([...adapter.expectedBases, ...BAFUT_MARKS]));
      expect(walk).toHaveLength(adapter.expectedBases.length + BAFUT_MARKS.length);
      for (const composed of BAFUT_COMPOSED) expect(walk).not.toContain(composed);
      adapter.afterWalk?.(walk);
    });

    it("composed-treatment mirror: walks the composed forms, not the lone marks", async () => {
      adapter.prepareWalk();
      seedBafutSession(bafutWorklist("composed"));
      await adapter.renderWalkGallery();

      const walk = await publishedWalk();
      expect(new Set(walk)).toEqual(new Set([...adapter.expectedBases, ...BAFUT_COMPOSED]));
      expect(walk).toHaveLength(adapter.expectedBases.length + BAFUT_COMPOSED.length);
      for (const mark of BAFUT_MARKS) expect(walk).not.toContain(mark);
      adapter.afterWalk?.(walk);
    });

    it("promoted combination stays in the walk under own-key treatment", async () => {
      adapter.prepareWalk();
      seedBafutSession(bafutWorklist("own-key", ["à", "À"]));
      await adapter.renderWalkGallery();

      const walk = await publishedWalk();
      expect(walk).toContain("à");
      expect(walk).toContain("À");
      for (const mark of BAFUT_MARKS) expect(walk).toContain(mark);
      for (const composed of BAFUT_COMPOSED) {
        if (composed === "à" || composed === "À") continue;
        expect(walk).not.toContain(composed);
      }
      adapter.afterWalk?.(walk);
    });
  });
}
