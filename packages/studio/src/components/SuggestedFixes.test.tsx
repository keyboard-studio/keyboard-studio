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
