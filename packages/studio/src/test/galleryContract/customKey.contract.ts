// Shared contract: the key picker's "Enter my own character..." option guards
// Apply on an unmappable character or malformed U+ notation. Only the tests
// whose titles read identically in both galleries live here; the ones that
// read back each gallery's own record (kmnRules vs touchDraft hostKey) and the
// per-box placeholder / help-line tests stay in the gallery suites.
//
// Test-support module: imported only by *.test.tsx entry files.

import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import type { GalleryAdapter } from "./adapter.ts";

export function describeCustomKeyContract(adapter: GalleryAdapter): void {
  const { customKey } = adapter;

  async function openCustomWith(value: string | null): Promise<void> {
    customKey.seed();
    await customKey.render();
    await customKey.openCustom();
    if (value !== null) fireEvent.change(customKey.input(), { target: { value } });
  }

  describe(`${adapter.name} — ${customKey.describeLabel}`, () => {
    it("selecting 'Enter my own character...' reveals a custom text input", async () => {
      await openCustomWith(null);
      expect(customKey.input()).toBeTruthy();
    });

    it("an unmappable custom character shows an error and blocks Apply", async () => {
      await openCustomWith("é");
      expect(
        screen.getByText(/Cannot map 'é' to a physical key — pick a key from the list instead\./i),
      ).toBeTruthy();
      expect(customKey.applyButton().disabled).toBe(true);
    });

    it("invalid U+ notation blocks Apply", async () => {
      await openCustomWith("U+ZZZZ");
      expect(screen.getByText(/Not a valid Unicode value/i)).toBeTruthy();
      expect(customKey.applyButton().disabled).toBe(true);
    });
  });
}
