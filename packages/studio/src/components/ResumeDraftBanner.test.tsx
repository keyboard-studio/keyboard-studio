// Tests for ResumeDraftBanner — the Resume/Discard offer shown on a page (re)load
// when a saved in-progress survey draft exists. Verifies the buttons are wired to
// their callbacks and the accessible region is labelled (not role="status", which
// would be an ARIA anti-pattern around interactive controls).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ResumeDraftBanner } from "./ResumeDraftBanner.tsx";
import type { DraftMeta } from "../lib/draftAutosave.ts";

afterEach(cleanup);

function makeMeta(overrides: Partial<DraftMeta> = {}): DraftMeta {
  return {
    savedAt: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    activeStepId: "carve",
    label: "Hausa",
    ...overrides,
  };
}

describe("ResumeDraftBanner", () => {
  it("exposes a labelled region, not role=status (ARIA-correct for interactive content)", () => {
    render(<ResumeDraftBanner meta={makeMeta()} onResume={vi.fn()} onDiscard={vi.fn()} />);
    const banner = screen.getByTestId("resume-draft-banner");
    expect(banner.getAttribute("role")).toBe("region");
    expect(banner.getAttribute("aria-label")).toBeTruthy();
    expect(banner.getAttribute("role")).not.toBe("status");
  });

  it("Resume fires onResume (and not onDiscard)", () => {
    const onResume = vi.fn();
    const onDiscard = vi.fn();
    render(<ResumeDraftBanner meta={makeMeta()} onResume={onResume} onDiscard={onDiscard} />);

    fireEvent.click(screen.getByTestId("resume-draft"));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("Discard fires onDiscard (and not onResume)", () => {
    const onResume = vi.fn();
    const onDiscard = vi.fn();
    render(<ResumeDraftBanner meta={makeMeta()} onResume={onResume} onDiscard={onDiscard} />);

    fireEvent.click(screen.getByTestId("discard-draft"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });

  it("shows the derived keyboard label and the step it was left on", () => {
    render(<ResumeDraftBanner meta={makeMeta()} onResume={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByText(/Resume "Hausa"\?/)).toBeTruthy();
    expect(screen.getByText(/carve step/)).toBeTruthy();
  });

  it("falls back to a generic name when the draft has no label", () => {
    render(
      <ResumeDraftBanner meta={makeMeta({ label: null })} onResume={vi.fn()} onDiscard={vi.fn()} />,
    );
    expect(screen.getByText(/Resume your keyboard\?/)).toBeTruthy();
  });
});
