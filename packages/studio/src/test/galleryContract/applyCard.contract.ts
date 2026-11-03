// Shared contract: Apply lives in whichever method card is open, and only
// there. Only the "follows the author into whichever card they open" test is
// title-identical across the galleries; the default-card test and the
// gallery-specific cards stay in the gallery suites.
//
// Test-support module: imported only by *.test.tsx entry files.

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import type { GalleryAdapter } from "./adapter.ts";

export function describeApplyCardContract(adapter: GalleryAdapter): void {
  const { applyCard } = adapter;

  describe(`${adapter.name} — Apply lives in the open method card`, () => {
    it("follows the author into whichever card they open", async () => {
      applyCard.seed();
      await applyCard.render();
      expect(screen.getByTestId(applyCard.defaultApplyTestId)).toBeTruthy();

      let previous = applyCard.defaultApplyTestId;
      for (const step of applyCard.steps) {
        await step.open();
        expect(screen.getByTestId(step.applyTestId)).toBeTruthy();
        expect(screen.queryByTestId(previous)).toBeNull();
        expect(screen.getAllByRole("button", { name: applyCard.applyName })).toHaveLength(1);
        previous = step.applyTestId;
      }
    });
  });
}
