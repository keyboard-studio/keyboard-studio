// Shared contract: the first-entry intro splash gates the per-character gallery.
//
// Test-support module: imported only by *.test.tsx entry files.

import { describe, it, expect } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import type { GalleryAdapter } from "./adapter.ts";

export function describeShellContract(adapter: GalleryAdapter): void {
  describe(`${adapter.name} — intro splash`, () => {
    it("shows the intro on first entry and reveals the gallery after 'Get started'", async () => {
      adapter.seedShell({ intro: true });
      await adapter.renderShell();

      // Intro visible; the per-character gallery is not yet shown.
      expect(screen.queryByText(adapter.introText)).not.toBeNull();
      expect(adapter.galleryVisible()).toBe(false);

      const startBtn = screen.getByRole("button", { name: adapter.startButton });
      await act(async () => {
        fireEvent.click(startBtn);
        await new Promise((r) => setTimeout(r, 0));
      });

      // Gallery now visible; intro gone.
      expect(screen.queryByText(adapter.introText)).toBeNull();
      expect(adapter.galleryVisible()).toBe(true);
    });

    it("does NOT show the intro on a return visit (intro already marked seen)", async () => {
      // Default seed marks the intro seen, simulating a prior visit.
      adapter.seedShell({});
      await adapter.renderShell();

      expect(screen.queryByText(adapter.introText)).toBeNull();
      expect(adapter.galleryVisible()).toBe(true);
    });
  });
}
