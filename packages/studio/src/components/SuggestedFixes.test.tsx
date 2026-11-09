// Spec 111 T043: suggested fixes are offered, never applied, and the author's
// accept / skip is recorded in the decision record so it is not re-offered.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";

import { SuggestedFixesPanel } from "./SuggestedFixes.tsx";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { useSuggestedFixesStore } from "../stores/suggestedFixesStore.ts";
import { decidedSuggestions } from "../lib/suggestionDispositions.ts";
import type { SuggestedFix } from "../lib/consistencySuggestions.ts";
import { missingCharacterFixes } from "../criteria/missingCharacterFixes.ts";

function fix(id: string, title: string): SuggestedFix {
  return {
    id,
    kind: "consistency",
    findingKey: null,
    preview: [],
    status: "pending",
    title,
    action: { target: "touch", change: "add", subject: "b" },
  };
}

describe("SuggestedFixesPanel", () => {
  beforeEach(() => {
    useDecisionLogStore.getState().reset();
    useSuggestedFixesStore.getState().clear();
  });
  afterEach(cleanup);

  it("previews the current and proposed text side by side", () => {
    useSuggestedFixesStore.getState().offer([
      {
        ...fix("d", "Regenerate README.md"),
        kind: "docs",
        preview: [{ file: "README.md", before: "OLD TEXT", after: "NEW TEXT" }],
      },
    ]);
    render(<SuggestedFixesPanel onAccept={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Current" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Proposed" })).toBeTruthy();
    expect(screen.getByText("OLD TEXT")).toBeTruthy();
    expect(screen.getByText("NEW TEXT")).toBeTruthy();
  });

  it("renders nothing when there is nothing to suggest", () => {
    const { container } = render(<SuggestedFixesPanel onAccept={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("does nothing until the author acts", () => {
    useSuggestedFixesStore.getState().offer([fix("a", "Add b to touch")]);
    const onAccept = vi.fn();
    render(<SuggestedFixesPanel onAccept={onAccept} />);
    expect(screen.getByText("Add b to touch")).toBeTruthy();
    expect(onAccept).not.toHaveBeenCalled();
    expect(useDecisionLogStore.getState().record.entries).toHaveLength(0);
  });

  it("accept records the decision and hands off to the host", () => {
    useSuggestedFixesStore.getState().offer([fix("a", "Add b to touch")]);
    const onAccept = vi.fn();
    render(<SuggestedFixesPanel onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: /^Accept:/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(decidedSuggestions(useDecisionLogStore.getState().record).get("a")).toBe("accepted");
    expect(screen.queryByText("Add b to touch")).toBeNull();
  });

  it("skip records a decline, never calls the host, and is not re-offered", () => {
    useSuggestedFixesStore.getState().offer([fix("a", "Add b to touch")]);
    const onAccept = vi.fn();
    const { unmount } = render(<SuggestedFixesPanel onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: /^Skip:/ }));
    expect(onAccept).not.toHaveBeenCalled();
    expect(decidedSuggestions(useDecisionLogStore.getState().record).get("a")).toBe("declined");
    unmount();

    // The same suggestion raised again stays hidden.
    useSuggestedFixesStore.getState().offer([fix("a", "Add b to touch")]);
    render(<SuggestedFixesPanel onAccept={onAccept} />);
    expect(screen.queryByText("Add b to touch")).toBeNull();
  });

  it("merges host-derived fixes with the offered ones without duplicates", () => {
    useSuggestedFixesStore.getState().offer([fix("a", "One")]);
    render(<SuggestedFixesPanel extra={[fix("a", "One"), fix("b", "Two")]} onAccept={vi.fn()} />);
    expect(screen.getAllByTestId("suggested-fix")).toHaveLength(2);
  });
  describe("SuggestedFixesPanel — later-step fixes stay hidden (#2528)", () => {
    // The exact production titles from suggestionsFromDelta()
    // (lib/consistencySuggestions.ts), seeded as the store would offer them.
    const DOCS_CHARS = "Refresh the generated character section of the help";
    const DOCS_LAYERS = "Update the help page layer list (data-states)";
    const TOUCH_FIX = "Add U+0254 ɔ to the touch layout";
    const PHYSICAL_FIX = "Add U+0254 ɔ to the physical keys";
    // Manifest-order subsequence, as StudioShell supplies it at runtime.
    const STEP_ORDER = ["rules", "mechanisms", "touch", "css", "help", "html"];

    function targetedFix(
      id: string,
      title: string,
      target: "physical" | "touch" | "docs",
    ): SuggestedFix {
      return {
        id,
        kind: "consistency",
        findingKey: null,
        preview: [],
        status: "pending",
        title,
        action: { target, change: target === "docs" ? "refresh" : "add", subject: "ɔ" },
      };
    }

    function seedAll(): void {
      useSuggestedFixesStore.getState().offer([
        targetedFix("consistency:refresh:docs:characters", DOCS_CHARS, "docs"),
        targetedFix("consistency:refresh:docs:layers", DOCS_LAYERS, "docs"),
        targetedFix("consistency:add:touch:ɔ", TOUCH_FIX, "touch"),
        targetedFix("consistency:add:physical:ɔ", PHYSICAL_FIX, "physical"),
      ]);
    }

    it("on touch, hides both docs notes while showing the touch and physical fixes", () => {
      seedAll();
      render(<SuggestedFixesPanel activeStepId="touch" stepOrder={STEP_ORDER} onAccept={vi.fn()} />);
      expect(screen.queryByText(DOCS_CHARS)).toBeNull();
      expect(screen.queryByText(DOCS_LAYERS)).toBeNull();
      expect(screen.getByText(TOUCH_FIX)).toBeTruthy();
      expect(screen.getByText(PHYSICAL_FIX)).toBeTruthy();
    });

    it("on mechanisms, hides the touch fix while showing the physical fix", () => {
      seedAll();
      render(<SuggestedFixesPanel activeStepId="mechanisms" stepOrder={STEP_ORDER} onAccept={vi.fn()} />);
      expect(screen.queryByText(DOCS_CHARS)).toBeNull();
      expect(screen.queryByText(TOUCH_FIX)).toBeNull();
      expect(screen.getByText(PHYSICAL_FIX)).toBeTruthy();
    });

    it("on help, shows the docs notes (the Documentation step owns them)", () => {
      seedAll();
      render(<SuggestedFixesPanel activeStepId="help" stepOrder={STEP_ORDER} onAccept={vi.fn()} />);
      expect(screen.getByText(DOCS_CHARS)).toBeTruthy();
      expect(screen.getByText(DOCS_LAYERS)).toBeTruthy();
      expect(screen.getByText(TOUCH_FIX)).toBeTruthy();
      expect(screen.getByText(PHYSICAL_FIX)).toBeTruthy();
    });

    it("with no active step (Criteria roll-up), shows everything", () => {
      seedAll();
      render(<SuggestedFixesPanel onAccept={vi.fn()} />);
      expect(screen.getByText(DOCS_CHARS)).toBeTruthy();
      expect(screen.getByText(DOCS_LAYERS)).toBeTruthy();
      expect(screen.getByText(TOUCH_FIX)).toBeTruthy();
      expect(screen.getByText(PHYSICAL_FIX)).toBeTruthy();
    });

    it("fails open: a fix with no action target still renders on an early step", () => {
      const untargeted: SuggestedFix = {
        id: "consistency:refresh:docs:characters",
        kind: "consistency",
        findingKey: null,
        preview: [],
        status: "pending",
        title: DOCS_CHARS,
      };
      useSuggestedFixesStore.getState().offer([untargeted]);
      render(<SuggestedFixesPanel activeStepId="touch" stepOrder={STEP_ORDER} onAccept={vi.fn()} />);
      expect(screen.getByText(DOCS_CHARS)).toBeTruthy();
    });
  });
});

describe("missingCharacterFixes", () => {
  it("offers one add-character fix per uncovered inventory character, into the mechanisms gallery", () => {
    const fixes = missingCharacterFixes([
      { code: "KM_LINT_INVENTORY_UNCOVERED", message: 'Inventory character U+0254 "ɔ" is not produced.', location: { file: "source/t.kmn" } },
      { code: "KM_LINT_INVENTORY_UNCOVERED", message: 'Inventory character U+0254 "ɔ" is not produced.', location: { file: "source/t.kmn" } },
      { code: "KM_LINT_OTHER", message: "U+0041" },
    ]);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({
      kind: "generate-missing",
      findingKey: "KM_LINT_INVENTORY_UNCOVERED:source/t.kmn#U+0254",
      action: { target: "mechanisms", change: "add", subject: "ɔ" },
    });
  });
});
