// DiffHunkList — the shared unified-diff renderer (spec 053).
//
// Two surfaces depend on this being unambiguous: the decision trail and the flow
// map's alternative-answer panel. So the assertions are about the two things a
// reader has to be able to tell apart — the hunk header and which lines were added
// versus removed.

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DiffHunk } from "@keyboard-studio/contracts";
import { DiffHunkList } from "./DiffHunkList.tsx";

afterEach(cleanup);

const HUNK: DiffHunk = {
  oldStart: 12,
  oldLines: 3,
  newStart: 12,
  newLines: 4,
  lines: [" store(&VERSION) '10.0'", "-+ [K_A] > 'a'", "++ [K_A] > 'ɓ'", " c done"],
};

describe("DiffHunkList", () => {
  it("renders the unified hunk header verbatim", () => {
    render(<DiffHunkList hunks={[HUNK]} />);
    expect(screen.getByText("@@ -12,3 +12,4 @@")).toBeTruthy();
  });

  it("colours added and removed lines differently", () => {
    const { container } = render(<DiffHunkList hunks={[HUNK]} />);
    const lines = [...container.querySelectorAll<HTMLElement>("div")].filter((el) =>
      el.textContent?.includes("[K_A]"),
    );
    const added = lines.find((el) => el.textContent?.startsWith("+"));
    const removed = lines.find((el) => el.textContent?.startsWith("-"));
    expect(added).toBeTruthy();
    expect(removed).toBeTruthy();
    expect(added!.style.color).not.toBe(removed!.style.color);
  });

  it("renders every hunk it is given", () => {
    render(<DiffHunkList hunks={[HUNK, { ...HUNK, oldStart: 40, newStart: 41 }]} />);
    expect(screen.getByText("@@ -12,3 +12,4 @@")).toBeTruthy();
    expect(screen.getByText("@@ -40,3 +41,4 @@")).toBeTruthy();
  });

  it("renders an empty container for no hunks rather than throwing", () => {
    // A `captured` impact with zero hunks should never reach here (that state is
    // `none`), but a renderer that threw on it would take the whole view down.
    const { container } = render(<DiffHunkList hunks={[]} />);
    expect(container.firstElementChild).toBeTruthy();
    expect(container.textContent).toBe("");
  });
});
